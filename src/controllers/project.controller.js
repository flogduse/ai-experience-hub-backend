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
    const { title, description, externalUrl, aiModelsUsed, category, isFree, remixAllowed, requiresAuth } = req.body;

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title,
          description,
          externalUrl,
          // Model names are lowercased so feed filtering (?model=gpt4) is
          // case-insensitive — Prisma can't do insensitive `has` on string lists.
          aiModelsUsed: (aiModelsUsed ?? []).map((m) => m.toLowerCase()).filter(Boolean),
          category: category ? category.toLowerCase() : null,
          isFree: isFree ?? true,
          remixAllowed: remixAllowed ?? false,
          requiresAuth: requiresAuth ?? false,
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
    const { model, category } = req.query; // e.g. ?model=gpt4&category=games
    const sort = SORTABLE_FIELDS[req.query.sort] ? req.query.sort : 'new';
    // page/limit are already coerced and bounded by the zod pagination schema.
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { status: 'APPROVED' };

    // `aiModelsUsed` is a string[]; `has` matches exact values. Submission
    // lowercases model names and category, so filters are lowercased too.
    if (model) where.aiModelsUsed = { has: model.toLowerCase() };
    if (category) where.category = category.toLowerCase();

    const [projects, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        orderBy: SORTABLE_FIELDS[sort],
        skip,
        take: limit,
        select: {
          id: true, title: true, description: true, previewImgUrl: true,
          aiModelsUsed: true, category: true, isFree: true, remixAllowed: true,
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
        id: true, title: true, description: true, externalUrl: true,          previewImgUrl: true, aiModelsUsed: true, category: true,
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

    // Count the view for approved projects (a public detail page was seen).
    if (project.status === 'APPROVED') {
      await prisma.projectMetrics.updateMany({
        where: { projectId: id },
        data: { viewCount: { increment: 1 } },
      });
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
