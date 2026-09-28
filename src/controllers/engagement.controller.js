import { prisma } from '../lib/prisma.js';

// Engagement: bookmarks and user reports.
// Implemented: bookmarkProject, unbookmarkProject, getMyBookmarks, reportProject.

export const bookmarkProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Only approved projects can be bookmarked.
    const project = await prisma.project.findFirst({
      where: { id, status: 'APPROVED' },
      select: { id: true },
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found or not available.' });
    }

    const bookmark = await prisma.bookmark.create({
      data: { userId: req.user.id, projectId: id },
    }).catch((err) => {
      if (err.code === 'P2002') return 'DUPLICATE';
      throw err;
    });

    if (bookmark === 'DUPLICATE') {
      return res.status(409).json({ error: 'Already bookmarked.' });
    }

    // Best-effort save counter; doesn't fail the request if it misses.
    await prisma.projectMetrics.updateMany({
      where: { projectId: id },
      data: { saveCount: { increment: 1 } },
    });

    res.status(201).json({ message: 'Project bookmarked.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to bookmark project.' });
  }
};

export const unbookmarkProject = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.bookmark.deleteMany({
      where: { userId: req.user.id, projectId: id },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Bookmark not found.' });
    }

    await prisma.projectMetrics.updateMany({
      where: { projectId: id },
      data: { saveCount: { decrement: 1 } },
    });

    res.status(200).json({ message: 'Bookmark removed.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to remove bookmark.' });
  }
};

export const getMyBookmarks = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await prisma.$transaction([
      prisma.bookmark.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          project: {
            select: {
              id: true, title: true, description: true, previewImgUrl: true,
              aiModelsUsed: true, isFree: true, remixAllowed: true,
              creator: { select: { id: true, username: true } },
              metrics: { select: { launchCount: true, saveCount: true, viewCount: true } },
            },
          },
        },
      }),
      prisma.bookmark.count({ where: { userId: req.user.id } }),
    ]);

    res.status(200).json({
      bookmarks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load bookmarks.' });
  }
};

export const reportProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, creatorId: true, status: true },
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    if (project.creatorId === req.user.id) {
      return res.status(400).json({ error: 'You cannot report your own project.' });
    }

    // One open report per user per project — prevents report spam from one account.
    const existingOpen = await prisma.report.findFirst({
      where: { projectId: id, reportedByUserId: req.user.id, status: 'OPEN' },
      select: { id: true },
    });
    if (existingOpen) {
      return res.status(409).json({ error: 'You already have an open report for this project.' });
    }

    const report = await prisma.report.create({
      data: {
        projectId: id,
        reportedByUserId: req.user.id,
        reason,
      },
      select: { id: true, status: true, createdAt: true },
    });

    res.status(201).json({ report, message: 'Report submitted. Moderators will review it.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
};
