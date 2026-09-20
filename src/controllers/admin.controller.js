import { prisma } from '../index.js';

// TEAM MEMBER 3 TASK: Moderation, Reports, and Background Checks

export const getModerationQueue = async (req, res) => {
  try {
    // TODO: fetch all projects where status === 'PENDING'
    res.status(200).json({ queue: [], message: 'Queue mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    // Expected statuses: APPROVED, REJECTED, TAKEN_DOWN
    
    // TODO: Update project status using prisma
    // Optional: Send an email to creator
    
    res.status(200).json({ message: 'Status update mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getReports = async (req, res) => {
  try {
    // TODO: Fetch user reports for broken/malicious apps
    res.status(200).json({ reports: [], message: 'Reports mocked.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};