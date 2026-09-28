#!/usr/bin/env node
import { rmSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import EmbeddedPostgres from 'embedded-postgres';

// ---------------------------------------------------------------------------
// Dev-only embedded PostgreSQL. `npm run db` starts a real Postgres 18 server
// using versioned binaries from node_modules — no installer, no admin rights,
// no Docker. Data lives in .devdb/ (gitignored), resolved relative to this
// script so it works from any working directory.
//
//   npm run db            → start DB and keep running (Ctrl+C stops it)
//   npm run db -- reset   → wipe local dev data and start fresh
//
// Self-heals the most common Windows failure: a stale postmaster.pid left
// behind by a hard kill, crashed Ctrl+C, or reboot.
//
// Requires DATABASE_URL to point at localhost:5432/ai_experience_hub
// (the postinstall check warns you if .env is missing/wrong).
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

const PG = {
  databaseDir: join(__dirname, '..', '.devdb'),
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  database: 'ai_experience_hub',
  authMethod: 'password',
  persistent: true,
  // UTF-8 regardless of Windows locale — Postgres encodings like WIN1252
  // cannot store emoji or non-Latin content.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
};

// Error objects aren't guaranteed — err?.message throws on plain values.
const describe = (err) => (err instanceof Error ? err.message : String(err));

const args = process.argv.slice(2);
const reset = args.includes('reset');

if (reset && existsSync(PG.databaseDir)) {
  console.log(`Resetting: removing ${PG.databaseDir} ...`);
  rmSync(PG.databaseDir, { recursive: true, force: true });
}

const rl = createInterface({ input: process.stdin, escapeCharTimeout: 100 });
let shuttingDown = false;
let pg;

async function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nStopping database...');
  try {
    await pg.stop();
    console.log('Database stopped. Bye!');
  } catch {
    // already gone
  }
  process.exit(0);
}

rl.on('SIGINT', () => stop());
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

try {
  pg = new EmbeddedPostgres(PG);
} catch (err) {
  console.error('Failed to initialize embedded Postgres:', describe(err));
  process.exit(1);
}

// --- Stale-lock self-heal -------------------------------------------------
// initdb/start fail with a confusing error if postmaster.pid survived an
// unclean shutdown. If the PID in it is dead, the lock is stale — remove it.
const pidFile = join(PG.databaseDir, 'postmaster.pid');
if (existsSync(pidFile)) {
  try {
    const rawPid = parseInt(readFileSync(pidFile, 'utf8').split(/\r?\n/)[0], 10);
    let pidAlive = false;
    if (Number.isInteger(rawPid) && rawPid > 0) {
      try {
        process.kill(rawPid, 0); // existence check only
        pidAlive = true;
      } catch {
        pidAlive = false;
      }
    }

    if (!pidAlive) {
      unlinkSync(pidFile);
      console.log('Removed stale postmaster.pid (leftover from an unclean shutdown).');
    } else {
      console.error(
        `Postgres appears to already be running (pid ${rawPid}). ` +
        'If that is wrong, run: npm run db -- reset'
      );
      process.exit(1);
    }
  } catch (err) {
    // Best-effort only — let the real startup error surface if this fails.
    console.error('Could not inspect the database lock file:', describe(err));
    console.error('If startup keeps failing, run: npm run db -- reset');
  }
}

try {
  // initialise() runs initdb, which refuses to run on an existing cluster —
  // so only do it when the data directory is fresh. Every later run just
  // starts the existing cluster.
  const alreadyInitialized = existsSync(join(PG.databaseDir, 'PG_VERSION'));
  if (!alreadyInitialized) {
    await pg.initialise();
  }
  await pg.start();

  // Create the app database only if it doesn't already exist (avoids the
  // noisy "already exists" error on every subsequent start).
  const check = pg.getPgClient('postgres');
  await check.connect();
  const found = await check.query('SELECT 1 FROM pg_database WHERE datname = $1', [PG.database]);
  await check.end();

  if (found.rowCount === 0) {
    await pg.createDatabase(PG.database);
    console.log(`Database "${PG.database}" created.`);
  }

  console.log('---------------------------------------------');
  console.log(`  Postgres running on port ${PG.port}`);
  console.log(`  Database : ${PG.database}`);
  console.log('  Keep this terminal open while developing.');
  console.log('  Press Ctrl+C to stop.');
  console.log('---------------------------------------------');
} catch (err) {
  console.error('Failed to start database:', describe(err));
  console.error('Most common cause: a stale lock from an unclean shutdown (now auto-handled above),');
  console.error('or port 5432 already in use by another Postgres.');
  console.error('To wipe local dev data and start fresh: npm run db -- reset');
  process.exit(1);
}
