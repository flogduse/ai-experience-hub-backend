import { prisma } from '../lib/prisma.js';

// TEAM MEMBER 3 TASK: Moderation, Reports, and Background Checks
// Implemented: getModerationQueue, updateProjectStatus, getReports, resolveReport.

const VALID_PROJECT_STATUSES = ['APPROVED', 'REJECTED', 'TAKEN_DOWN'];
// Statuses a moderator may filter the queue by (PENDING is the default).
const VALID_QUEUE_STATUSES = ['PENDING', 'NEEDS_REVIEW', 'TAKEN_DOWN'];
const REPORT_PAGE_MAX = 50;

export const getModerationQueue = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { status: 'PENDING' };
    // Optional drill-down: ?status=NEEDS_REVIEW or ?status=TAKEN_DOWN
    if (req.query.status && VALID_QUEUE_STATUSES.includes(req.query.status)) {
      where.status = req.query.status;
    }

    const [queue, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        orderBy: { createdAt: 'asc' }, // oldest submissions first (fair queueing)
        skip,
        take: limit,
        select: {
          id: true, title: true, description: true, externalUrl: true,
          previewImgUrl: true, aiModelsUsed: true, isFree: true, remixAllowed: true,
          createdAt: true,
          creator: { select: { id: true, username: true, email: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.status(200).json({
      queue,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load the moderation queue.' });
  }
};

export const updateProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    // Expected statuses: APPROVED, REJECTED, TAKEN_DOWN

    if (!VALID_PROJECT_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_PROJECT_STATUSES.join(', ')}.`,
      });
    }

    const project = await prisma.project.update({
      where: { id },
      data: { status },
      select: { id: true, title: true, status: true, creator: { select: { id: true, username: true } } },
    }).catch(() => null);

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Optional: send an email to the creator here (e.g. via a queue/job runner).
    res.status(200).json({ project, message: `Project status updated to ${status}.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update project status.' });
  }
};

export const getReports = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(REPORT_PAGE_MAX, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.status === 'OPEN' || req.query.status === 'RESOLVED') {
      where.status = req.query.status;
    }

    const [reports, total] = await prisma.$transaction([
      prisma.report.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // OPEN first, newest first
        skip,
        take: limit,
        select: {
          id: true, reason: true, status: true, createdAt: true,
          project: { select: { id: true, title: true, status: true } },
          reportedBy: { select: { id: true, username: true } },
        },
      }),
      prisma.report.count({ where }),
    ]);

    res.status(200).json({
      reports,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load reports.' });
  }
};

export const resolveReport = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await prisma.report.update({
      where: { id },
      data: { status: 'RESOLVED' },
      select: { id: true, status: true },
    }).catch(() => null);

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    res.status(200).json({ report, message: 'Report marked as resolved.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to resolve report.' });
  }
};
