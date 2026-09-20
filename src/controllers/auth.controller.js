import { prisma } from '../index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// TEAM MEMBER 1 TASK: Implement complete Auth and User Registration

export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    // TODO: Hash password using bcrypt
    // TODO: Create user using prisma.user.create
    // TODO: Return JWT Token or success message
    res.status(201).json({ message: 'Registration endpoint mocked. Waiting for implementation.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    // TODO: Find user by email
    // TODO: Compare passwords using bcrypt.compare
    // TODO: Create JWT token using process.env.JWT_SECRET
    res.status(200).json({ message: 'Login endpoint mocked.' });
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