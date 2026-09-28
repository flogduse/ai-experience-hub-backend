import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from 'passport';

import { configurePassport } from './config/passport.js';
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import adminRoutes from './routes/admin.routes.js';

dotenv.config();

// Fail fast if required env vars are missing, instead of failing on first request.
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const app = express();

// Google OAuth strategy (boot-safe: logs a warning and disables Google
// login instead of crashing when GOOGLE_* env vars are missing).
configurePassport();

// --- Security & boilerplate middleware ---

// CORS allowlist: set CORS_ORIGINS in .env (comma-separated). Falls back to
// allowing everything in development only.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0) {
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser clients (curl, mobile apps) with no Origin header.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
    })
  );
} else {
  if (process.env.NODE_ENV === 'production') {
    console.warn('WARNING: CORS_ORIGINS not set — CORS is wide open in production!');
  }
  app.use(cors());
}

app.use(express.json({ limit: '100kb' }));
app.use(passport.initialize());

// Lightweight request logger — dev only; use real log aggregation in prod.
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
  });
}

// --- Routes ---

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'API is running optimally.' });
});

// 404 handler for unknown API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Error handling middleware — log the details, return a generic message.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  res.status(err.status || 500).json({ error: 'Something went wrong!' });
});

// Parse PORT defensively: "0", "", or garbage must not bind a random port —
// fall back to 5000 instead.
const requestedPort = parseInt(process.env.PORT, 10);
const isValidPort =
  Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535;
const PORT = isValidPort ? requestedPort : 5000;
// Warn when the raw env value was rejected (e.g. PORT="0" or PORT="abc").
if (process.env.PORT && !isValidPort) {
  console.warn(`⚠️  PORT="${process.env.PORT}" is not a valid port — using ${PORT} instead.`);
}

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Team, ready to build!');
});

// Without this, a busy port crashes the process with a raw net stack trace.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use — another copy of the server is probably running.\n` +
      'Stop it (Ctrl+C in its terminal, or: taskkill /PID <pid> /F), or set a different PORT in .env.'
    );
  } else {
    console.error('Server failed to start:', err?.message ?? err);
  }
  process.exit(1);
});

// Graceful shutdown so connections and Prisma close cleanly on SIGINT/SIGTERM.
const shutdown = async (signal) => {
  console.log(`${signal} received — shutting down...`);
  server.close(async () => {
    const { prisma } = await import('./lib/prisma.js');
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
