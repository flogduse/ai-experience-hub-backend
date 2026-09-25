import { prisma } from '../index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// TEAM MEMBER 1 TASK: Implement complete Auth and User Registration

const createToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const safeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  badges: user.badges,
  createdAt: user.createdAt,
});

export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User with this email or username already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        badges: true,
        createdAt: true,
      },
    });

    const token = createToken(user);

    res.status(201).json({ message: 'Registration successful.', token, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: 'This account uses Google login.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = createToken(user);

    res.status(200).json({
      message: 'Login successful.',
      token,
      user: safeUser(user),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const googleCallback = async (req, res) => {
  try {
    const token = createToken(req.user);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    res.redirect(`${frontendUrl}/auth/success?token=${token}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const { username } = req.params;
    // TODO: Fetch user & their public projects
    res.status(200).json({ message: 'Profile route mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
