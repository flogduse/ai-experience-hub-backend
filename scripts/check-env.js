#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

// Friendly postinstall check: tells new teammates how to get a database.
// Never fails the install — just prints guidance.
// Silent in CI (postinstall runs there too, and the tips are pure noise).
if (process.env.CI) process.exit(0);

const hasEnv = existsSync('.env');
let dbUrl = '';
if (hasEnv) {
  const env = readFileSync('.env', 'utf8');
  dbUrl = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)?.[1] ?? '';
}

if (!hasEnv || !dbUrl) {
  console.log(
    '\n📦 Setup tip: no DATABASE_URL found. Copy .env.example to .env and set:\n' +
    '   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_experience_hub"\n' +
    '   JWT_SECRET="any long random string"\n' +
    'Then run `npm run db` (starts the built-in dev database) and `npx prisma migrate dev`.\n'
  );
  process.exit(0);
}

const expected = 'postgresql://postgres:postgres@localhost:5432/ai_experience_hub';
const matchesDev = dbUrl.includes('@localhost:5432/ai_experience_hub');

if (!matchesDev) {
  console.log(
    '\nℹ️  Note: your DATABASE_URL does not point at localhost:5432/ai_experience_hub.\n' +
    '   That is fine if you use a remote/cloud database (Neon, Supabase, ...).\n' +
    '   If you meant to use the built-in dev database (`npm run db`), set:\n' +
    `   DATABASE_URL="${expected}"\n`
  );
}
