import express from 'express';
import { 
  getModerationQueue, 
  updateProjectStatus, 
  getReports 
} from '../controllers/admin.controller.js';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes here require login AND MODERATOR role
router.use(authenticate);
router.use(authorizeRole(['MODERATOR']));

router.get('/queue', getModerationQueue);
router.patch('/projects/:id/status', updateProjectStatus);
router.get('/reports', getReports);

export default router;