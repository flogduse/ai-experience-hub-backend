import express from 'express';
import passport from 'passport';
import { register, login, getProfile, googleCallback } from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/google/failure' }),
  googleCallback
);
router.get('/google/failure', (req, res) => {
  res.status(401).json({ error: 'Google authentication failed.' });
});
router.get('/:username', getProfile);

export default router;
