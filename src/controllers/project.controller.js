import { prisma } from '../index.js';

// TEAM MEMBER 2 TASK: Implement Discovery and Project Submissions

export const submitProject = async (req, res) => {
  try {
    const { title, description, externalUrl, aiModelsUsed } = req.body;
    // req.user.id is available via auth middleware
    
    // TODO: Validate links if needed
    // TODO: Build the project in Prisma (status defaults to PENDING)
    // TODO: Create an empty ProjectMetrics row linked to it
    
    res.status(201).json({ message: 'Project submission mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getDiscoveryFeed = async (req, res) => {
  try {
    // TODO: Use req.query to handle ?category=games or ?model=gpt4
    // TODO: only query `status: 'APPROVED'`
    // TODO: sort by popularity or new
    
    res.status(200).json({ projects: [], message: 'Feed mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProjectDetails = async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Use prisma.project.findUnique to fetch details and creator info
    res.status(200).json({ message: 'Project details mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const launchProject = async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Increment the launchCount in ProjectMetrics table
    // TODO: Maybe redirect or just return success so frontend opens tab
    res.status(200).json({ message: 'Launch tracking mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};