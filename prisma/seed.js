import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Seed script: guarantees at least one MODERATOR exists, so /api/admin/* is
// reachable. Runs automatically after `npx prisma migrate dev` (see the
// "prisma.seed" entry in package.json), or manually via `npx prisma db seed`.
//
// Credentials come from MODERATOR_EMAIL / MODERATOR_PASSWORD in .env.
// If MODERATOR_PASSWORD is not set, a default is used and loudly warned about —
// fine for local dev, never acceptable in production.

const prisma = new PrismaClient();

const DEFAULT_EMAIL = 'moderator@example.com';
const DEFAULT_PASSWORD = 'ChangeMe-Moderator-2026!';

async function main() {
  const email = process.env.MODERATOR_EMAIL || DEFAULT_EMAIL;
  const password = process.env.MODERATOR_PASSWORD || DEFAULT_PASSWORD;

  if (!process.env.MODERATOR_PASSWORD) {
    console.warn(
      '⚠️  MODERATOR_PASSWORD not set — using the default seed password. ' +
      'Only acceptable for local development. Set MODERATOR_EMAIL/MODERATOR_PASSWORD in .env.'
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const moderator = await prisma.user.upsert({
    where: { email },
    update: { role: 'MODERATOR' },
    create: {
      username: 'moderator',
      email,
      passwordHash,
      role: 'MODERATOR',
    },
  });

  console.log(`✅ Moderator ready: ${moderator.email} (role=${moderator.role})`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
