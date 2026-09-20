import express from 'express';
import { register, login, getProfile } from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/:username', getProfile);

export default router;