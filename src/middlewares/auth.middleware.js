import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// Middleware to verify JWT and attach user payload to request
export const authenticate = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Contains id, username, role
    next();
  } catch (ex) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Populates req.user when a valid token is sent, but never blocks the
// request. For public routes that personalize or un-hide content for the
// caller — e.g. GET /api/projects/:id, where a PENDING project must be
// visible to its creator/moderator even though strangers get a 404.
export const optionalAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // Invalid/expired token on a public route: proceed anonymously.
    }
  }
  next();
};

// Middleware to restrict access entirely to specific roles.
// The role is read fresh from the database on every request — a role stored in
// the JWT would take up to the token's full lifetime (7d) to expire after a
// demotion or ban, which is unacceptable for moderation access.
export const authorizeRole = (roles) => {
  return async (req, res, next) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Access denied. No user on request.' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true },
      });

      if (!user) {
        return res.status(401).json({ error: 'Account no longer exists.' });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden. You do not have required permissions.' });
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Authorization check failed.' });
    }
  };
};
