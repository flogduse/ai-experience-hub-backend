import express from 'express';
import { 
  submitProject, 
  getDiscoveryFeed, 
  getProjectDetails,
  launchProject 
} from '../controllers/project.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public routes
router.get('/', getDiscoveryFeed);
router.get('/:id', getProjectDetails);
router.post('/:id/launch', launchProject); // Increment metrics

// Protected routes (requires login)
router.post('/', authenticate, submitProject);

export default router;