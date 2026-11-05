# AI Experience Hub — Backend

Community platform where students publish, bookmark and moderate AI projects.
This repository is the API: Express + Prisma/PostgreSQL, JWT + Google OAuth,
moderation queue with roles, and an SSRF-hardened link health checker.

**Status: complete and running, no public frontend yet** — this repo is the
service layer; the model/repo layout below is what a frontend talks to.

```
Zod validation → JWT auth (email/pass + Google OAuth) → role-based admin
        │                                                          │
        └── Prisma → PostgreSQL (embedded dev DB via `npm run db`)  │
                                                                     │
  discovery feed · bookmarks · reports → MODERATOR: queue, takedown, health probe
```

## Why the non-obvious things are the way they are

- **Fail fast on missing env.** The server refuses to boot without
  `DATABASE_URL` and `JWT_SECRET` — a misconfigured deploy should crash at
  startup, not 404 on the third request.
- **Auth is rate-limited independently** (`authLimiter`) because password
  guessing is a different abuse mode from browsing.
- **Google login is degradable**, unlike the database: a missing `GOOGLE_CLIENT_ID`
  disables one login method instead of crashing every route.
- **CORS is an allowlist** (`CORS_ORIGINS`); dev falls back to open, and production
  loudly warns rather than silently shipping an open CORS policy.
- **The `/api/auth/google` route is declared before `/api/auth/:username`** so a
  colon-capture cannot swallow a reserved path. Same reasoning for
  `/api/projects/bookmarks` before `/api/projects/:id`.
- **`PORT` parsing is defensive.** `"0"`, `""` or `"abc"` must not bind a random
  port; the server falls back to 5000 and logs why.
- **The creator-supplied project URL is probed server-side for health checks, and
  that is an SSRF hazard.** `isPublicIp` blocks loopback, RFC1918, CGNAT,
  link-local, the cloud metadata service, and the IPv4 address smuggled through
  IPv6 transition mechanisms (IPv4-mapped, NAT64, 6to4). The whole rule set is
  pinned by `tests/ssrf.test.js`, block-list and allow-list both — including the
  tricky cases like `::ffff:127.0.0.1` and `64:ff9b::7f00:1`.

## Routes

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/health` | GET | – | liveness probe |
| `/api/auth/register` | POST | rate-limited | email + password sign-up |
| `/api/auth/login` | POST | rate-limited | email + password sign-in → JWT |
| `/api/auth/google` | GET | rate-limited | Google OAuth redirect |
| `/api/auth/google/callback` | GET | – | OAuth callback → JWT |
| `/api/auth/me` | GET | JWT | current user (id, role, badges) |
| `/api/auth/:username` | GET | – | public profile |
| `/api/projects` | GET / POST | – / JWT | discovery feed (paginated) / submit a project |
| `/api/projects/bookmarks` | GET | JWT | my bookmarked projects |
| `/api/projects/:id` | GET | optional JWT | project details |
| `/api/projects/:id/launch` | POST | JWT | record a launch |
| `/api/projects/:id/bookmark` | POST / DELETE | JWT | bookmark / unbookmark |
| `/api/projects/:id/report` | POST | JWT | report a project |
| `/api/admin/queue` | GET | MODERATOR | moderation queue |
| `/api/admin/projects/:id/status` | PATCH | MODERATOR | approve / reject / take down |
| `/api/admin/projects/:id/health-check` | GET | MODERATOR | SSRF-guarded URL probe |
| `/api/admin/reports` | GET / PATCH | MODERATOR | reports inbox / resolve report |
| `/api/admin/stats` | GET | MODERATOR | dashboard counters |

## Setup

```bash
npm install            # also runs prisma generate + a friendly env check
npm run db             # starts the built-in embedded dev Postgres
cp .env.example .env   # fill DATABASE_URL + JWT_SECRET
npx prisma migrate dev # create tables (+ seeds a MODERATOR account)
npm run dev            # node --watch, on PORT (5000)
npm test               # node --test, no DB needed
```

Set `MODERATOR_PASSWORD` before seeding; the seed account uses the email and
password from `.env`.

## Layout

```
src/
  index.js                express app, boot checks, graceful shutdown
  config/passport.js      Google OAuth strategy (boot-safe when unconfigured)
  routes/                 auth, projects, admin routers in the order stated above
  controllers/            register/login, discovery/submit, moderation, engagement
  middlewares/            authenticate + authorizeRole, zod validate, rate limits
  lib/prisma.js           shared PrismaClient
prisma/
  schema.prisma, migrations/, seed.js
tests/ssrf.test.js        the pinned block/allow lists for isPublicIp
scripts/                  check-env.js, dev-db.js (embedded Postgres)
```

## Deploying

The app is stateless apart from Postgres, so any container host works
(Railway, Render, Fly). `DATABASE_URL` points at the hosted database and
`/health` is the readiness endpoint.

## Not built (yet)

- A **frontend**. The API contract is what's here; a React client would be the
  next unit of work.
- **Moderator role assignment in-app** — roles come from the seed / DB for now.
- **Email verification** for email-registered accounts.
