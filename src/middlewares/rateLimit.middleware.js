import rateLimit from 'express-rate-limit';

// Brute-force protection for credential endpoints.
// 20 attempts per 15 min per IP — generous enough for real users,
// painful enough to make password guessing impractical.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

// Looser general limiter for the rest of the API (abuse ceiling, not UX).
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});
