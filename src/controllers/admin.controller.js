import { prisma } from '../lib/prisma.js';
import dns from 'node:dns';
import net from 'node:net';

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

// ---------------------------------------------------------------------------
// Link-health probe (SSRF-hardened)
//
// The probe fetches creator-supplied URLs from our server, which makes it a
// classic SSRF vector: without guards, a "project link" like
// http://169.254.169.254/latest/meta-data could reach cloud metadata services,
// localhost admin panels, or internal network hosts.
//
// Defenses: http(s) only, web ports only, every hostname resolved and its IPs
// checked against private/reserved ranges BEFORE connecting, and redirects
// followed manually so each hop is re-validated (redirect: 'follow' would
// bypass the initial check). The DNS-pinning TOCTOU window is accepted for
// this low-risk, moderator-only use; a hardened version would connect to the
// resolved IP with SNI pinning.
// ---------------------------------------------------------------------------

const ALLOWED_PROBE_PORTS = new Set(['', '80', '443', '8080', '8443']);
const MAX_REDIRECTS = 3;

function isPublicIp(ip) {
  if (!net.isIP(ip)) return false;

  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
    if (a === 169 && b === 254) return false; // link-local (169.254.x.x incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a >= 224) return false; // multicast + reserved
    return true;
  }

  // IPv6
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return false; // unspecified, loopback
  if (v6.startsWith('::ffff:')) return isPublicIp(v6.slice(7)); // IPv4-mapped
  const firstHextet = parseInt(v6.split(':')[0], 16);
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return false; // link-local
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return false; // unique local
  if (firstHextet === 0xff00 || v6.startsWith('ff')) return false; // multicast
  return true;
}

async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed.');
  }
  if (!ALLOWED_PROBE_PORTS.has(parsed.port)) {
    throw new Error('Only web ports (80, 443, 8080, 8443) are allowed.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const addresses = await dns.promises.lookup(hostname, { all: true }).catch(() => {
    throw new Error('Hostname could not be resolved.');
  });
  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new Error('Requests to private or internal addresses are not allowed.');
    }
  }
  return parsed;
}

async function fetchWithCheckedRedirects(url, method, signal) {
  let current = new URL(url);
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    const response = await fetch(current, { method, redirect: 'manual', signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }
    const location = response.headers.get('location');
    if (!location) return response;

    let next;
    try {
      next = new URL(location, current);
    } catch {
      return response;
    }
    if (next.protocol !== 'http:' && next.protocol !== 'https:') {
      throw new Error('Redirect to a non-http(s) URL was blocked.');
    }
    await assertPublicUrl(next); // re-validate EVERY redirect hop
    current = next;
  }
  throw new Error('Too many redirects.');
}

async function probeUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const method = 'HEAD';
  try {
    await assertPublicUrl(url);
    let response = await fetchWithCheckedRedirects(url, method, controller.signal);
    if (response.status === 405 || response.status === 501) {
      // Some servers reject HEAD; retry with GET (still no auto-follow).
      response = await fetchWithCheckedRedirects(url, 'GET', controller.signal);
    }
    return { reachable: response.ok, httpStatus: response.status, method };
  } catch (err) {
    return {
      reachable: false,
      method,
      error:
        err?.name === 'AbortError'
          ? 'Timed out after 5s.'
          : String(err?.cause?.code ?? err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}
