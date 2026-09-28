import { PrismaClient } from '@prisma/client';

// Single shared Prisma client instance for the whole app.
// Instantiate once here; never from src/index.js (importing the entrypoint is fragile).
export const prisma = new PrismaClient();
