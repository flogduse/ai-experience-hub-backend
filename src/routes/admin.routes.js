import express from 'express';
import { prisma } from '../lib/prisma.js';
import {
  getModerationQueue,
  updateProjectStatus,
  getReports,
  resolveReport,
  checkProjectHealth,
} from '../controllers/admin.controller.js';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware.js';
import { validate, schemas } from '../middlewares/validate.middleware.js';

const router = express.Router();

// All routes here require login AND MODERATOR role.
router.use(authenticate);
router.use(authorizeRole(['MODERATOR']));

// Moderation queue + status updates
router.get('/queue', validate(schemas.queueQuery), getModerationQueue);
router.patch('/projects/:id/status', validate(schemas.statusUpdate), updateProjectStatus);
router.get('/projects/:id/health-check', validate(schemas.idParam), checkProjectHealth);

// Reports inbox
router.get('/reports', validate(schemas.reportQuery), getReports);
router.patch('/reports/:id/resolve', validate(schemas.idParam), resolveReport);

// Dashboard stats for the moderator overview.
router.get('/stats', async (req, res) => {
  try {
    const [pending, approved, rejected, takenDown, openReports, users] = await prisma.$transaction([
      prisma.project.count({ where: { status: 'PENDING' } }),
      prisma.project.count({ where: { status: 'APPROVED' } }),
      prisma.project.count({ where: { status: 'REJECTED' } }),
      prisma.project.count({ where: { status: 'TAKEN_DOWN' } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.user.count(),
    ]);

    res.status(200).json({
      projects: { pending, approved, rejected, takenDown },
      openReports,
      users,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load admin stats.' });
  }
});

export default router;
