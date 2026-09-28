import { prisma } from '../lib/prisma.js';

// TEAM MEMBER 2 TASK: Discovery and Project Submissions
// Implemented: submitProject, getDiscoveryFeed, getProjectDetails, launchProject.

// Fields a client may sort the discovery feed by.
const SORTABLE_FIELDS = {
  popular: [{ metrics: { launchCount: 'desc' } }, { metrics: { viewCount: 'desc' } }],
  saves: [{ metrics: { saveCount: 'desc' } }],
  new: [{ createdAt: 'desc' }],
};

export const submitProject = async (req, res) => {
  try {
    const { title, description, externalUrl, aiModelsUsed, isFree, remixAllowed } = req.body;

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title,
          description,
          externalUrl,
          aiModelsUsed: aiModelsUsed ?? [],
          isFree: isFree ?? true,
          remixAllowed: remixAllowed ?? false,
          creatorId: req.user.id,
          status: 'PENDING', // explicit for clarity; schema default matches
        },
        select: { id: true, title: true, status: true, createdAt: true },
      });

      // Every project starts with an empty metrics row.
      await tx.projectMetrics.create({
        data: { projectId: created.id },
      });

      return created;
    });

    res.status(201).json({
      project,
      message: 'Project submitted for review. A moderator will approve it before it appears in the feed.',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit project.' });
  }
};

export const getDiscoveryFeed = async (req, res) => {
  try {
    const { model } = req.query; // e.g. ?model=gpt4
    const sort = SORTABLE_FIELDS[req.query.sort] ? req.query.sort : 'new';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { status: 'APPROVED' };

    // `aiModelsUsed` is a string[]; `has` matches "gpt4" inside it.
    if (model) where.aiModelsUsed = { has: model };

    const [projects, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        orderBy: SORTABLE_FIELDS[sort],
        skip,
        take: limit,
        select: {
          id: true, title: true, description: true, previewImgUrl: true,
          aiModelsUsed: true, isFree: true, remixAllowed: true,
          createdAt: true,
          creator: { select: { id: true, username: true } },
          metrics: { select: { launchCount: true, saveCount: true, viewCount: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    res.status(200).json({
      projects,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load the discovery feed.' });
  }
};

export const getProjectDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true, title: true, description: true, externalUrl: true,
        previewImgUrl: true, aiModelsUsed: true,
        requiresAuth: true, isFree: true, remixAllowed: true, status: true,
        createdAt: true,
        creator: { select: { id: true, username: true } },
        metrics: { select: { launchCount: true, saveCount: true, viewCount: true } },
      },
    });

    // Non-approved projects are only visible to their creator or a moderator.
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    if (project.status !== 'APPROVED') {
      const isOwner = req.user?.id === project.creator.id;
      const isModerator = req.user?.role === 'MODERATOR';
      if (!isOwner && !isModerator) {
        return res.status(404).json({ error: 'Project not found.' });
      }
    }

    res.status(200).json({ project });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load project details.' });
  }
};

export const launchProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Only count launches for approved projects, so pending ones can't farm metrics.
    const result = await prisma.projectMetrics.updateMany({
      where: { projectId: id, project: { status: 'APPROVED' } },
      data: { launchCount: { increment: 1 } },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Project not found or not available.' });
    }

    res.status(200).json({ message: 'Launch recorded.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record launch.' });
  }
};
