import { z } from 'zod';

/**
 * Zod validation middleware factory.
 * Usage: router.post('/', validate({ body: schema }), handler)
 *
 * Parses body/params/query against the given schemas, replaces req.* with the
 * coerced/cleaned values, and rejects with 400 + field-level errors.
 */
export const validate = (schemas) => {
  return (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {});
      if (schemas.query) req.query = schemas.query.parse(req.query ?? {});
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed.',
          details: err.issues.map((e) => ({
            field: e.path.join('.') || '(root)',
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
};

// ---------- Shared field rules ----------

const username = z
  .string()
  .min(3, 'Username must be at least 3 characters.')
  .max(32, 'Username must be at most 32 characters.')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, hyphens and underscores allowed.');

const email = z.string().trim().toLowerCase().email('A valid email is required.');
const password = z.string().min(8, 'Password must be at least 8 characters.').max(128);

const httpUrl = z.string().trim().url().startsWith('https://', {
  message: 'externalUrl must start with https://',
});

const idParam = z.object({ id: z.string().uuid('Invalid project id.') });
const usernameParam = z.object({ username: z.string().min(1) });

// ---------- Reusable endpoint schemas ----------

export const schemas = {
  register: {
    body: z.object({
      username,
      email,
      password,
    }).strict(),
  },
  login: {
    body: z.object({ email, password: z.string().min(1, 'Password is required.') }).strict(),
  },
  submitProject: {
    body: z
      .object({
        title: z.string().trim().min(3).max(120),
        description: z.string().trim().min(10).max(2000),
        externalUrl: httpUrl,
        aiModelsUsed: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
        isFree: z.boolean().optional(),
        remixAllowed: z.boolean().optional(),
      })
      .strict(),
  },
  statusUpdate: {
    params: idParam,
    body: z
      .object({
        status: z.enum(['APPROVED', 'REJECTED', 'TAKEN_DOWN']),
        reason: z.string().trim().max(500).optional(),
      })
      .strict(),
  },
  reportProject: {
    params: idParam,
    body: z.object({ reason: z.string().trim().min(5, 'Please describe the issue.').max(500) }).strict(),
  },
  idParam: { params: idParam },
  usernameParam: { params: usernameParam },
  pagination: {
    query: z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      sort: z.enum(['popular', 'saves', 'new']).optional(),
      model: z.string().trim().max(50).optional(),
    }).strip(),
  },
  reportQuery: {
    query: z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      status: z.enum(['OPEN', 'RESOLVED']).optional(),
    }).strip(),
  },
  queueQuery: {
    query: z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      status: z.enum(['PENDING', 'NEEDS_REVIEW', 'TAKEN_DOWN']).optional(),
    }).strip(),
  },
};
