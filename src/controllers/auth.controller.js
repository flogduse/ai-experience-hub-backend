import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// TEAM MEMBER 1 TASK: Complete Auth and User Registration
// Implemented: register, login, getProfile.

const JWT_EXPIRES_IN = '7d';

// Dummy bcrypt hash used so login timing is similar whether or not the email
// exists (avoids trivial user enumeration via response timing).
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBr4yqFBLhRQZ8lYw2DkSQnVx3JdQi';

export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const usernameTaken = await prisma.user.findUnique({ where: { username } });
    if (usernameTaken) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { username, email, passwordHash },
      select: { id: true, username: true, email: true, role: true, createdAt: true },
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({ token, user });
  } catch (error) {
    console.error(error);
    // Unique-constraint races fall through to a clean conflict error.
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] ?? 'field';
      return res.status(409).json({ error: `That ${field} is already taken.` });
    }
    res.status(500).json({ error: 'Something went wrong during registration.' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Google-only accounts have no password set.
    if (user && !user.passwordHash) {
      return res.status(401).json({ error: 'This account uses Google login.' });
    }

    const passwordOk = user?.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_HASH);

    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(200).json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong during login.' });
  }
};

// Called after Passport verifies the Google profile (req.user = DB user).
// Issues the same JWT shape as login, then bounces to the frontend.
export const googleCallback = async (req, res) => {
  try {
    const user = req.user;
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Token goes in the URL *fragment* (after #), not the query string.
    // Fragments are never sent to any server, so the JWT stays out of access
    // logs, Referer headers, and proxy caches. The frontend must read it via
    // location.hash (slice off the '#') instead of URLSearchParams.
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/success#${token}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Google sign-in succeeded but session creation failed.' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        badges: true,
        createdAt: true,
        projects: {
          where: { status: 'APPROVED' },
          select: {
            id: true, title: true, description: true,
            previewImgUrl: true, aiModelsUsed: true,
            isFree: true, remixAllowed: true,
            metrics: { select: { launchCount: true, saveCount: true, viewCount: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};
