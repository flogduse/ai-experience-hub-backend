import express from 'express';
import { register, login, getProfile } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate, schemas } from '../middlewares/validate.middleware.js';
import { authLimiter } from '../middlewares/rateLimit.middleware.js';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// Rate-limited: prevents unlimited password guessing / registration spam.
router.post('/register', authLimiter, validate(schemas.register), register);
router.post('/login', authLimiter, validate(schemas.login), login);

// Current user's own account (from token, not URL).
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, email: true, role: true, badges: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Public profile — keep LAST so /register, /login, /me never hit this.
router.get('/:username', validate(schemas.usernameParam), getProfile);

export default router;
