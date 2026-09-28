#!/usr/bin/env node
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import EmbeddedPostgres from 'embedded-postgres';

// ---------------------------------------------------------------------------
// Dev-only embedded PostgreSQL. `npm run db` starts a real Postgres 18 server
// using versioned binaries from node_modules — no installer, no admin rights,
// no Docker. Data lives in .devdb/ (gitignored).
//
//   npm run db            → start DB and keep running (Ctrl+C stops it)
//   npm run db -- reset   → wipe local dev data and start fresh
//
// Requires DATABASE_URL to point at localhost:5432/ai_experience_hub
// (the postinstall check warns you if .env is missing/wrong).
// ---------------------------------------------------------------------------

const PG = {
  databaseDir: '.devdb',
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

const args = process.argv.slice(2);
const reset = args.includes('reset');

if (reset && existsSync('.devdb')) {
  console.log('Resetting: removing .devdb ...');
  rmSync('.devdb', { recursive: true, force: true });
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
  console.error('Failed to initialize embedded Postgres:', err.message);
  process.exit(1);
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
  console.error('Failed to start database:', err.message);
  process.exit(1);
}
