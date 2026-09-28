import { prisma } from '../lib/prisma.js';

// TEAM MEMBER 3 TASK: Moderation, Reports, and Background Checks
// Implemented: getModerationQueue, updateProjectStatus, getReports, resolveReport.

const VALID_PROJECT_STATUSES = ['APPROVED', 'REJECTED', 'TAKEN_DOWN'];
// Statuses a moderator may filter the queue by (PENDING is the default).
const VALID_QUEUE_STATUSES = ['PENDING', 'NEEDS_REVIEW', 'TAKEN_DOWN'];

export const getModerationQueue = async (req, res) => {
  try {
    // page/limit are already coerced and bounded by the zod queueQuery schema.
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;
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
          previewImgUrl: true, aiModelsUsed: true, category: true,
          requiresAuth: true, isFree: true, remixAllowed: true,
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

    let project;
    try {
      project = await prisma.project.update({
        where: { id },
        data: { status },
        select: { id: true, title: true, status: true, creator: { select: { id: true, username: true } } },
      });
    } catch (err) {
      // P2025 = record not found; anything else is a real DB failure (→ 500).
      if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Project not found.' });
      }
      throw err;
    }

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
    // page/limit are already coerced and bounded by the zod reportQuery schema.
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;
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

    let report;
    try {
      report = await prisma.report.update({
        where: { id },
        data: { status: 'RESOLVED' },
        select: { id: true, status: true },
      });
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Report not found.' });
      }
      throw err;
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    res.status(200).json({ report, message: 'Report marked as resolved.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to resolve report.' });
  }
};

// Link-health checker (Teammate 3's "background checks"): probes a project's
// externalUrl so moderators can verify a link is alive before approving.
export const checkProjectHealth = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, externalUrl: true, status: true },
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const result = await probeUrl(project.externalUrl);
    res.status(200).json({
      projectId: id,
      externalUrl: project.externalUrl,
      ...result,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Health check failed.' });
  }
};

async function probeUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    let method = 'HEAD';
    let response = await fetch(url, { method, redirect: 'follow', signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      // Some servers reject HEAD; fall back to GET.
      method = 'GET';
      response = await fetch(url, { method, redirect: 'follow', signal: controller.signal });
    }
    return { reachable: response.ok, httpStatus: response.status, method };
  } catch (err) {
    return {
      reachable: false,
      method: 'HEAD',
      error: err.name === 'AbortError' ? 'Timed out after 5s.' : String(err.cause?.code || err.message),
    };
  } finally {
    clearTimeout(timer);
  }
}
