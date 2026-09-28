import express from 'express';
import {
  submitProject,
  getDiscoveryFeed,
  getProjectDetails,
  launchProject,
} from '../controllers/project.controller.js';
import {
  bookmarkProject,
  unbookmarkProject,
  getMyBookmarks,
  reportProject,
} from '../controllers/engagement.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.middleware.js';
import { validate, schemas } from '../middlewares/validate.middleware.js';

const router = express.Router();

// Public discovery — /bookmarks MUST be declared above /:id so the UUID
// param validator doesn't reject it.
router.get('/', validate(schemas.pagination), getDiscoveryFeed);
router.get('/bookmarks', authenticate, validate(schemas.pagination), getMyBookmarks);
router.get('/:id', optionalAuth, validate(schemas.idParam), getProjectDetails);

// Engagement (requires login)
router.post('/:id/launch', authenticate, validate(schemas.idParam), launchProject);
router.post('/:id/bookmark', authenticate, validate(schemas.idParam), bookmarkProject);
router.delete('/:id/bookmark', authenticate, validate(schemas.idParam), unbookmarkProject);
router.post('/:id/report', authenticate, validate(schemas.reportProject), reportProject);

// Submissions (requires login)
router.post('/', authenticate, validate(schemas.submitProject), submitProject);

export default router;
