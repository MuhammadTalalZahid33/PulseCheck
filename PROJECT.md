# PulseCheck — Complete Project Reference

Uptime monitoring for small teams and indie developers. Angular frontend, Express + PostgreSQL backend, with an in-process monitoring engine that pings your sites and emails you when they break.

This document covers what was built, why each decision was made, and how it works — written so you can answer follow-up questions in depth.

---

## 1. The problem

Pingdom and UptimeRobot Pro cost money that a solo developer or a three-person team often can't justify for what is fundamentally a simple job: hit a URL every few minutes, tell me when it stops responding. The free tiers are deliberately limited — long check intervals, few monitors, no incident history.

PulseCheck does the core job:

- Register monitors (name + URL + how often to check)
- A background engine checks them on schedule
- When a site goes down you get **one** email, not one per failed check
- When it recovers you get one more, with how long it was down
- Uptime percentages over 24h / 7d / 30d, response-time charts, and an incident history

The hard part is not "make an HTTP request". It's the **state machine** — knowing the difference between "it's down" and "it just went down" — plus doing that reliably for many monitors without blocking, and without spamming.

---

## 2. Architecture at a glance

```
┌────────────────────┐         ┌─────────────────────────────────────┐
│  Angular SPA       │         │  Express API (Node, TypeScript)     │
│  localhost:4200    │────────▶│  localhost:4000                     │
│                    │  /api/* │                                     │
│  - signals         │  proxy  │  ┌───────────────────────────────┐  │
│  - httpResource    │         │  │ Monitoring engine (node-cron) │  │
│  - Chart.js        │         │  │  every minute                 │  │
└────────────────────┘         │  │  → find due monitors          │  │
                               │  │  → probe (max 10 parallel)    │  │
                               │  │  → record Check               │  │
                               │  │  → incident state machine     │  │
                               │  │  → queue alerts               │  │
                               │  └───────────────────────────────┘  │
                               └──────┬──────────┬──────────┬────────┘
                                      │          │          │
                              ┌───────▼───┐ ┌────▼─────┐ ┌──▼────────┐
                              │PostgreSQL │ │  Redis   │ │   SMTP    │
                              │ (Prisma)  │ │(optional)│ │(optional) │
                              └───────────┘ └──────────┘ └───────────┘
```

**Key architectural point:** the browser never talks to port 4000 directly. The Angular dev server proxies `/api/*` to the backend, so everything is same-origin. That means the httpOnly auth cookie is sent automatically with no CORS configuration, no `withCredentials`, and no `SameSite` complications. In production you'd put both behind one host or a reverse proxy and the behaviour is identical.

**Two interchangeable frontends** exist in the repo: `angular_frontend/` (port 4200) and `frontend/` (Next.js, port 3000). Both consume the same API and are visually identical. This document is about the Angular one.

---

## 3. Tech stack and why

| Layer | Choice | Why this over the alternative |
|---|---|---|
| Frontend | Angular 21.2 | Requested. Zoneless + signals is the modern architecture; standalone components mean no NgModules |
| Styling | Tailwind CSS v4 | CSS-first config (`@theme`), no JS config file, and utility classes keep the dark theme consistent without a component library |
| Charts | Chart.js 4.5 | Recharts is React-only. Chart.js is framework-agnostic, tree-shakeable, and wrapped in one component so it could be swapped |
| Backend | Express 5 + TypeScript | Express 5 auto-forwards rejected promises to the error handler, which removes `try/catch` from every async route |
| ORM | Prisma 7 | Type-safe queries generated from the schema; migrations are first-class. Raw SQL used where Prisma can't express something |
| Database | PostgreSQL | Needs `date_bin`, partial indexes, `FILTER` aggregates, and real transactions — all Postgres strengths |
| Cache | Redis (ioredis), optional | Dashboard reads are the only expensive query. Optional by design |
| Scheduler | node-cron, in-process | MVP simplicity. A separate worker is the first scaling step |
| Email | Nodemailer | The standard Node SMTP client; provider-agnostic |
| Auth | JWT in httpOnly cookie | Stateless, and the cookie is unreadable by JavaScript |
| Validation | Zod 4 | One schema defines both the runtime check and the TypeScript type |

### Version constraint worth knowing

Angular **22** requires Node ≥ 24.15; the dev machine had 24.11. Rather than upgrade Node (the backend runs on it too), the project uses **Angular 21.2**, the newest release that runs on Node 24.11. It needs TypeScript 5.9.

Because Angular pins TypeScript tightly, `angular_frontend/` is deliberately **outside the npm workspaces** and has its own `node_modules` and lockfile. Hoisting two frameworks with conflicting TypeScript ranges into one tree causes build failures that are very hard to diagnose.

---

## 4. Repository layout

```
PulseCheck/
├── package.json              npm workspaces: backend, frontend (NOT angular_frontend)
├── backend/                  Express API + monitoring engine
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │       ├── 20260801054922_init/
│   │       └── 20260801055500_open_incident_unique/   hand-written partial index
│   ├── prisma.config.ts      Prisma 7 config (schema path, datasource URL)
│   └── src/
│       ├── index.ts          bootstrap, engine start, graceful shutdown
│       ├── app.ts            middleware chain, route mounting, /api/health
│       ├── env.ts            zod-validated config, fails fast at boot
│       ├── engine/
│       │   ├── probe.ts      one HTTP check; never throws
│       │   ├── pool.ts       bounded-concurrency map
│       │   ├── incidents.ts  THE STATE MACHINE
│       │   ├── runner.ts     due query + orchestration
│       │   └── scheduler.ts  node-cron tick + overlap guard
│       ├── modules/
│       │   ├── auth/         register, login, logout, me
│       │   ├── monitors/     CRUD, dashboard assembly, detail routes
│       │   ├── checks/       uptime aggregates, bucketed series
│       │   ├── incidents/    timeline query
│       │   └── alerts/       email templates + test endpoint
│       ├── lib/              prisma, redis, cache keys, mailer, errors, validate
│       └── middleware/       auth, error, rateLimit
├── angular_frontend/         Angular SPA (port 4200)
└── frontend/                 Next.js SPA (port 3000) — alternative client
```

---

## 5. Data model

Four tables. Prisma schema, PostgreSQL.

```prisma
enum MonitorStatus { up  down }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  monitors     Monitor[]
}

model Monitor {
  id              String         @id @default(cuid())
  userId          String
  name            String
  url             String
  intervalMinutes Int            @default(5)
  expectedStatus  Int            @default(200)
  timeoutMs       Int            @default(5000)
  isActive        Boolean        @default(true)
  lastCheckedAt   DateTime?
  lastStatus      MonitorStatus?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  checks    Check[]
  incidents Incident[]

  @@index([userId])                      // dashboard: all monitors for a user
  @@index([isActive, lastCheckedAt])     // engine: which monitors are due
}

model Check {
  id             String        @id @default(cuid())
  monitorId      String
  status         MonitorStatus
  statusCode     Int?
  responseTimeMs Int?
  error          String?
  checkedAt      DateTime      @default(now())

  monitor Monitor @relation(fields: [monitorId], references: [id], onDelete: Cascade)

  @@index([monitorId, checkedAt])        // every chart query and uptime aggregate
}

model Incident {
  id              String    @id @default(cuid())
  monitorId       String
  startedAt       DateTime  @default(now())
  endedAt         DateTime?               // null = still down
  durationSeconds Int?

  monitor Monitor @relation(fields: [monitorId], references: [id], onDelete: Cascade)

  @@index([monitorId, startedAt])         // newest-first timeline
}
```

### Why these indexes

- `Monitor(isActive, lastCheckedAt)` — the engine's due query runs every minute and filters on exactly these two columns. Without it, that's a full table scan every 60 seconds forever.
- `Check(monitorId, checkedAt)` — every uptime aggregate and chart query is "rows for this monitor within this window". This is the workhorse index; `Check` is by far the largest table.
- `Incident(monitorId, startedAt)` — supports the reverse-chronological timeline.
- `User(email)` unique — enforces one account per email at the database level, not in application code.

### The partial unique index (important)

Prisma cannot express partial indexes, so this is hand-written SQL in the second migration:

```sql
CREATE UNIQUE INDEX "Incident_monitorId_open_key"
  ON "Incident" ("monitorId")
  WHERE "endedAt" IS NULL;
```

**What it does:** guarantees at most one *open* incident per monitor. Any number of closed incidents are allowed, because `endedAt IS NULL` excludes them from the index.

**Why it matters:** it's the database-level backstop for the state machine. If two engine ticks ever raced, or a bug misread `lastStatus`, the second `INSERT` fails with a unique violation instead of silently creating a duplicate incident and a duplicate email. The application catches that specific error (`P2002`) and treats it as "not a transition", so no second alert goes out.

This is a good example to raise in an interview: **enforce invariants in the database, not just in code.** Application-level checks are advisory; a constraint is a guarantee.

### Why CUID and not auto-increment integers

Sequential IDs in URLs (`/monitors/1`) leak information and invite enumeration:

- Someone tries `2`, `3`, `4` and learns which IDs exist
- `/monitors/47` tells the world you have fewer than 50 monitors; register twice a week apart and you've measured the growth rate
- IDs stay unique across databases, so a dev dump and a prod dump never collide

CUIDs are 25 characters, start with `c`, and encode a timestamp plus a counter plus randomness — so they sort roughly by creation time and can be generated without a database round trip.

---

## 6. Backend: request lifecycle

Middleware order in `app.ts`, and why the order matters:

```ts
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');
app.use(helmet());                       // security headers
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.get('/api/health', ...);             // BEFORE the rate limiter
app.use('/api', apiLimiter);             // 100 req/min/IP
app.use('/api/auth/login', loginLimiter);      // 20 per 15 min
app.use('/api/auth/register', registerLimiter); // separate bucket
app.use('/api/auth', authRouter);
app.use('/api/monitors', monitorsRouter);
app.use('/api/alerts', alertsRouter);
app.use(notFoundHandler);                // 404 as JSON
app.use(errorHandler);                   // last: catches everything
```

- **`trust proxy` scoped to private ranges.** Rate limiting keys on client IP. Behind a proxy, every request appears to come from the proxy, so all users share one bucket. Trusting `X-Forwarded-For` fixes that — but trusting it blindly lets anyone spoof their IP and bypass the limit entirely. Restricting trust to loopback and private ranges means the header is only believed when it comes from infrastructure you control.
- **Health check before the limiter** so monitoring the monitor doesn't consume a user's request budget.
- **Body limit 100kb.** No endpoint needs more; without a limit, a large payload is a cheap denial-of-service.
- **Error handler last.** Express matches middleware in order; an error handler registered early never sees errors from routes registered after it.

### Error handling

`AppError` carries an HTTP status, a machine-readable `code`, and optional field details. The handler converts:

- `AppError` → its own status and code
- `ZodError` → 400 with a `details` array of `{ path, message }`
- `SyntaxError` with a `body` property → 400 "Invalid JSON body"
- Anything else → 500 with a generic message

**Unknown errors never leak internals.** A 500 returns `{"error":{"code":"internal_error","message":"Something went wrong"}}`. In development only, a `debug` field carries the real message. In production, SQL fragments, file paths, and stack traces stay in the logs where they belong.

Every response uses one shape, so the client has one parser:

```json
{ "error": { "code": "bad_request", "message": "Validation failed", "details": [ ... ] } }
```

---

## 7. Authentication

### Flow

1. `POST /api/auth/register` or `/login` with `{ email, password }`
2. Server validates with zod, hashes or compares with bcrypt
3. Server signs a JWT containing `{ sub: userId }`
4. Server sets it as a cookie: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`, expiry read from the token's own `exp`
5. `requireAuth` middleware reads the cookie, verifies the signature, attaches `req.userId`
6. `POST /logout` clears the cookie with **the same attributes** used to set it — otherwise the browser keeps the old one

### Decisions worth defending

**Why httpOnly cookies and not `localStorage`?** A token in `localStorage` is readable by any JavaScript on the page, so a single XSS bug — including one in a third-party dependency — means the attacker exfiltrates the session. `httpOnly` means script cannot read the cookie at all. The tradeoff is CSRF exposure, mitigated here by `sameSite=lax`, which stops the cookie being sent on cross-site POST requests while still allowing normal top-level navigation.

**Cookie expiry is read back off the JWT.** After signing, the code decodes the token to get `exp` and sets the cookie to expire at the same moment. Otherwise the two drift and you get a cookie that's present but carries a dead token, producing confusing 401s.

**Login is timing-equalised.** When the email doesn't exist, the code still runs a bcrypt comparison against a pre-computed dummy hash:

```ts
const DUMMY_HASH = bcrypt.hashSync('pulsecheck-timing-equalizer', 12);
const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
if (!user || !matches) throw unauthorized('Invalid email or password');
```

Returning the same error message is not enough. bcrypt at cost 12 takes ~250ms; skipping it when the user doesn't exist makes "unknown email" measurably faster than "wrong password", which is a user-enumeration oracle. Burning the same CPU closes it.

**Passwords over 72 bytes are rejected, not truncated.** bcrypt only hashes the first 72 bytes. Accepting longer input silently makes two different long passwords interchangeable. Zod rejects with a clear message instead.

**Duplicate email relies on the unique constraint**, catching Prisma's `P2002` and returning 409 — rather than `SELECT` first, which has a race window where two simultaneous registrations both pass the check.

**bcrypt cost 12** — roughly 250ms per hash on modern hardware. High enough to make offline brute force expensive, low enough not to be a denial-of-service vector on your own login endpoint.

---

## 8. The monitoring engine (the core)

Four pieces, deliberately separated so each can be reasoned about alone.

### 8.1 The due query (`runner.ts`)

```sql
SELECT m.id, m.name, m.url, m."userId", m."expectedStatus", m."timeoutMs",
       m."lastStatus", u.email AS "userEmail"
FROM "Monitor" m
JOIN "User" u ON u.id = m."userId"
WHERE m."isActive" = true
  AND (m."lastCheckedAt" IS NULL
       OR m."lastCheckedAt" <= now() - (m."intervalMinutes" * interval '1 minute'))
ORDER BY m."lastCheckedAt" ASC NULLS FIRST
LIMIT 500
```

- **Computed in SQL, not in Node.** Loading every monitor into memory to filter would not survive growth.
- **`NULLS FIRST`** so a brand-new monitor gets checked on the very next tick rather than last.
- **`LIMIT 500`** as a safety valve — one tick never tries to probe an unbounded number of targets.
- **Joins the user's email** so the alert path doesn't need a second query per monitor.
- Raw SQL because comparing a timestamp against a per-row computed interval isn't expressible in Prisma's query API.

### 8.2 The probe (`probe.ts`)

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), target.timeoutMs);
try {
  const response = await fetch(target.url, {
    method: 'GET', redirect: 'follow', signal: controller.signal,
    headers: { 'user-agent': 'PulseCheck/1.0 (+uptime monitor)' },
  });
  await response.body?.cancel();          // release the socket, don't download the page
  const matched = response.status === target.expectedStatus;
  return { status: matched ? 'up' : 'down', statusCode: response.status, responseTimeMs, error };
} catch (err) {
  return { status: 'down', statusCode: null, responseTimeMs, error: describeError(err, timeout) };
} finally {
  clearTimeout(timer);
}
```

Points to make:

- **It never throws.** A DNS failure, TLS error, timeout, or refused connection all become a `down` result. One broken target must not abort the tick or crash the process.
- **`response.body.cancel()`** releases the socket without downloading the body. Monitoring a 50 MB page costs almost nothing.
- **Timing uses `performance.now()`**, a monotonic clock. `Date.now()` can jump backwards on NTP correction and produce negative durations.
- **`describeError` unwraps the cause.** Node's `fetch` reports a useless `"fetch failed"` with the real reason nested in `err.cause`. Unwrapping yields `ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5999`, which a user can act on.
- **Timeout covers the whole request** including DNS and TLS, because the `AbortController` is armed before the call.

**SSRF consideration.** A monitoring tool fetches user-supplied URLs — that is SSRF by construction. Behind `ALLOW_PRIVATE_TARGETS=false`, the probe resolves the hostname with `dns.lookup` and refuses private, loopback, link-local, and CGNAT addresses, including IPv4-mapped IPv6 (`::ffff:10.0.0.1`). Critically, the check is on the **resolved IP**, not the hostname, because a public DNS name can point at `127.0.0.1` or a cloud metadata endpoint. It defaults to `true` for self-hosted single-user setups, where watching internal services is the point.

### 8.3 Bounded concurrency (`pool.ts`)

```ts
export async function mapWithConcurrency<T, R>(
  items: readonly T[], limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>>
```

N worker loops pull from a shared cursor until the list is exhausted. Concurrency is 10 by default (`ENGINE_CONCURRENCY`).

- **Why bounded at all?** 500 simultaneous `fetch` calls would exhaust sockets, spike memory, and make response times meaningless because the requests would queue inside Node rather than on the network.
- **Why hand-rolled and not `p-limit`?** The popular options are ESM-only, which adds friction; this is ~15 lines and lets one slow monitor occupy exactly one slot instead of stalling a batch.
- **Results are per-item `{ ok }` tuples** rather than a rejected promise, so a single failure never aborts the run.

### 8.4 The incident state machine (`incidents.ts`)

This is the part interviewers will dig into. The transition table, driven by the monitor's previous `lastStatus`:

| Previous | New | Action | Email |
|---|---|---|---|
| `up` | `down` | create open Incident | **DOWN** |
| `down` | `up` | close Incident (`endedAt`, `durationSeconds`) | **RECOVERED** |
| `up` | `up` | record Check only | none |
| `down` | `down` | record Check only | **none** ← the no-spam guarantee |
| `null` | `down` | create open Incident | **DOWN** |
| `null` | `up` | record Check only | none |

The two `null` cases are a deliberate design decision: a monitor that is broken on its very first check should tell you, but one that's healthy shouldn't announce itself.

```ts
return prisma.$transaction(async (tx) => {
  await tx.check.create({ ... });

  const wentDown  = result.status === 'down' && previous !== 'down';
  const recovered = result.status === 'up'   && previous === 'down';

  if (wentDown) {
    try {
      await tx.incident.create({ data: { monitorId, startedAt: checkedAt } });
      alert = { type: 'down', ... };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      transition = 'none';        // an incident was already open: not a transition
    }
  } else if (recovered) {
    const open = await tx.incident.findFirst({ where: { monitorId, endedAt: null } });
    if (open) {
      const durationSeconds = Math.round((checkedAt - open.startedAt) / 1000);
      await tx.incident.update({ where: { id: open.id }, data: { endedAt: checkedAt, durationSeconds } });
      alert = { type: 'recovered', durationSeconds, ... };
    }
  }

  await tx.monitor.update({ where: { id }, data: { lastStatus: result.status, lastCheckedAt: checkedAt } });
  return { transition, alert };
});
```

Three properties worth articulating:

1. **One transaction** covers the Check insert, the Incident write, and the Monitor status update. You can never end up with a check recorded but its incident lost, or a monitor marked `down` with no incident open.

2. **Alerts are returned, not sent.** The transaction hands back an `Alert` descriptor; email dispatch happens *after commit*. If SMTP were called inside the transaction, a slow mail server would hold a database transaction open, and a failure would roll back monitoring data. Losing an email is acceptable; losing a check is not.

3. **The unique-violation branch is a correctness feature.** If the index rejects a second open incident, our view of `lastStatus` was stale — so it's downgraded to "not a transition" and no duplicate email is sent.

**Edge case handled:** `lastStatus` says `down` but no open incident exists (e.g. someone edited the database by hand). The recovery is still recorded; there's simply nothing to close.

### 8.5 The scheduler (`scheduler.ts`)

```ts
let ticking = false;

export async function tick(): Promise<void> {
  if (ticking) {
    console.warn('[engine] previous tick still running, skipping this minute');
    return;
  }
  ticking = true;
  try { await runDueChecks(); }
  catch (err) { console.error('[engine] tick failed:', err); }
  finally { ticking = false; }
}

cron.schedule('* * * * *', () => void tick());
```

- **The overlap guard is essential.** With 30-second timeouts and a queue of dead targets, a tick can outlive its minute. Without the flag the next tick starts on top of it, double-probing monitors and compounding a backlog until the process falls over.
- **A thrown tick is swallowed and logged.** An unhandled rejection in a cron callback would kill the process and stop all monitoring.
- **Granularity consequence:** because the tick runs once a minute, a check can land up to ~60 seconds *after* it becomes due. The frontend's polling accounts for this (see §11.4).

### 8.6 Manual trigger

`POST /api/monitors/:id/check` runs a check immediately. Not in the original spec, added because otherwise testing a state transition costs a full interval of waiting. It reuses the exact same `recordCheck` path, so it exercises real behaviour rather than a test-only shortcut.

---

## 9. Statistics and aggregation

### Uptime

```sql
SELECT count(*)::bigint AS total,
       count(*) FILTER (WHERE status = 'up')::bigint AS up,
       avg("responseTimeMs") FILTER (WHERE status = 'up') AS avgms
FROM "Check"
WHERE "monitorId" = $1 AND "checkedAt" >= now() - ($2::int * interval '1 hour')
```

- `FILTER` computes conditional aggregates in **one pass** over the index range, rather than three separate queries.
- Average response time counts only successful checks — including timeouts would make a broken site look "slow" at exactly the timeout value.
- **Zero checks returns `null`, not `100`.** "No data" is not "perfect uptime". This propagates through the API, into the UI as "no data", and is the kind of detail that shows care.

### Chart bucketing

30 days of 1-minute checks is ~43,000 rows — far too many to send to a chart. Postgres aggregates them into ~300 buckets:

| Range | Bucket width |
|---|---|
| 24h | 5 minutes |
| 7d | 1 hour |
| 30d | 6 hours |

```sql
SELECT date_bin(($1::int * interval '1 minute'), "checkedAt", TIMESTAMP '2000-01-01 00:00:00') AS bucket,
       avg("responseTimeMs") FILTER (WHERE status = 'up') AS avgms,
       count(*) FILTER (WHERE status = 'up')::bigint AS up,
       count(*) FILTER (WHERE status = 'down')::bigint AS down
FROM "Check"
WHERE "monitorId" = $2 AND "checkedAt" >= now() - ($3::int * interval '1 hour')
GROUP BY bucket ORDER BY bucket ASC
```

**The fixed epoch origin is a bug fix, not decoration.** Originally the origin was `now() - interval '24 hours'`. Because that moves on every request, every bucket boundary slid too — so points got new timestamps and slightly different averages on each fetch, and a **paused** monitor's chart appeared to keep changing. Anchoring to a constant makes buckets stable and identical across requests. Uptime windows still use rolling `now()`, which is correct: "last 24 hours" should mean the last 24 hours.

---

## 10. Caching and rate limiting

### Redis: exactly one cached read

```ts
export const dashboardKey = (userId: string) => `dash:v1:${userId}`;
```

| Operation | Cached? | Reasoning |
|---|---|---|
| `GET /api/monitors` (dashboard) | **Yes, 30s TTL** | The expensive one: 2 aggregate queries per monitor, and the page auto-refreshes |
| Monitor detail | No | One row plus three cheap aggregates |
| Checks series / incidents | No | Already bucketed in SQL; the range toggle must feel instant |
| Auth (`/me`, login) | No | Must never be stale |
| Rate limit counters | No | In-memory |
| Sessions | No | JWT is stateless — nothing to store |

**Invalidation** on monitor create, update, delete, **and** when the engine records a check. One coarse key per user means a single `DEL` covers every write path.

**Honest tradeoff:** at 1-minute intervals the engine invalidates constantly, so the cache mostly helps burst refreshes (auto-refresh, several tabs) rather than steady state. Raising the TTL wouldn't help — invalidation dominates. That's the right call anyway: always-correct data over fewer Redis commands.

**Redis is optional and fails soft.** With `REDIS_URL` blank, every cache call is a no-op and reads go straight to Postgres. If Redis dies mid-flight, `cache.isEnabled` flips false and the app degrades to direct queries — a cache outage must cost performance, never availability. The retry strategy retries **indefinitely** with backoff capped at 5s; an earlier version gave up after five attempts, which meant a brief network blip disabled caching until the next process restart.

The URL scheme is validated at boot (`redis://` or `rediss://`), so a typo fails loudly rather than silently leaving the cache off. Upstash requires `rediss://` for TLS.

### Rate limiting

| Scope | Limit |
|---|---|
| All `/api/*` | 100 requests / minute / IP |
| `/api/auth/login` | 20 / 15 minutes / IP |
| `/api/auth/register` | 20 / 15 minutes / IP (separate bucket) |

- **Separate buckets for login and register.** They originally shared one instance, and a brute-force test against login locked out registration — turning an attack on one endpoint into a denial of signup.
- **`skipSuccessfulRequests: true`** on credential endpoints, so only failures count. A legitimate user signing in across several devices isn't punished for succeeding.
- **`standardHeaders: 'draft-7'`** emits `RateLimit` and `Retry-After`, so a client can back off intelligently.
- **In-memory store**, which is correct for one process and wrong for several — each instance would keep its own counters. Moving to a Redis store is the first step when scaling horizontally.

---

## 11. Angular frontend

### 11.1 Structure and dependency direction

```
src/app/
├── app.ts / app.config.ts / app.routes.ts
├── core/                    no UI; may not import features
│   ├── models/pulsecheck.models.ts    every wire contract, one file
│   ├── auth/auth.service.ts           session as signals
│   ├── auth/auth.guards.ts            authGuard, guestGuard
│   ├── http/unauthorized.interceptor.ts
│   ├── http/api-error.ts              normalises failures
│   ├── monitors/monitors.service.ts
│   └── util/format.util.ts
├── shared/                  dumb, reusable presentation
│   ├── status-pill.component.ts
│   ├── auto-refresh.component.ts
│   └── sparkline.component.ts
├── layout/app-shell.component.ts
└── features/                one folder per screen
    ├── auth/    dashboard/    monitor-detail/    not-found/
```

Path aliases (`@core/*`, `@shared/*`, `@features/*`) make an illegal dependency direction visible in review — if you see `@features` inside `core/`, that's a layering violation you can spot without a diagram.

### 11.2 Bootstrap configuration

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([unauthorizedInterceptor])),
  ],
};
```

- **`provideZonelessChangeDetection()`** — no zone.js. Change detection is driven by signals rather than by monkey-patching every async API. Smaller bundle, less magic, better performance, and stack traces that aren't 40 frames of zone internals.
- **`withComponentInputBinding()`** — route params arrive as component inputs, so `monitors/:id` becomes `id = input.required<string>()` and `?next=` becomes `next = input<string>()`. No injecting `ActivatedRoute` just to read a parameter.
- **`withFetch()`** — the Fetch API instead of `XMLHttpRequest`.

### 11.3 Data loading with `httpResource`

```ts
protected readonly detail = httpResource<MonitorDetailResponse>(() =>
  MonitorsService.detailUrl(this.id()),
);
protected readonly checks = httpResource<ChecksResponse>(() =>
  MonitorsService.checksUrl(this.id(), this.range()),
);
protected readonly incidents = httpResource<IncidentsResponse>(() =>
  MonitorsService.incidentsUrl(this.id()),
);
```

Each returns a resource exposing `value()`, `isLoading()`, `error()`, and `reload()`.

Why this over `subscribe()` in `ngOnInit`:

- **Reactive URL.** The loader reads signals, so when `range()` changes the request re-fires automatically. No manual re-subscription.
- **No teardown code.** In-flight requests are cancelled when the component is destroyed. No `takeUntilDestroyed`, no leak.
- **Loading and error are signals**, so the template reads them directly instead of every page reinventing a `loading` boolean.

**Three resources instead of one aggregate call** so the chart's range toggle refetches only the series, leaving the header, incidents, and recent checks untouched.

Reads use `httpResource`; **writes** stay as `Observable`-returning service methods, because commands are imperative and callers need to react to success or failure.

### 11.4 Auto-refresh

The engine writes checks in the background, but nothing tells the browser. `AutoRefreshComponent` emits a `refresh` output the parent uses to `reload()` its resources.

The cadence is the interesting part:

```ts
const MIN_GAP_MS = 15_000;
const GRACE_MS = 5_000;

const dueAt = () => {
  const expected = nextAt ? Date.parse(nextAt) + GRACE_MS : lastRefresh + fallbackMs;
  return Math.max(expected, lastRefresh + MIN_GAP_MS);
};
```

- **`enabled = false` when the monitor is paused** — zero polling. A paused monitor can never record a check, so every request would be waste.
- **Driven by `nextAt` = `lastCheckedAt + intervalMinutes`**, not a fixed timer. A 30-minute monitor is not polled every 20 seconds.
- **`MIN_GAP_MS` handles cron granularity.** Because the engine ticks once a minute, a check can land up to 60s after it's due. Polling at exactly the interval would usually arrive too early, find nothing, and then wait another full interval — stale for up to *twice* the interval. So once `nextAt` passes, it re-checks every 15s until the data appears, then goes quiet.
- **Pauses while the tab is hidden** and fires once on return, so an overnight tab neither hammers the API nor shows yesterday's data.
- The dashboard uses the **soonest-due** monitor across all active ones, so a 1-minute monitor isn't held back by a 30-minute one.

### 11.5 Routing, guards, and lazy loading

Every route uses `loadComponent`, so the initial bundle carries only the shell and the router.

```ts
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user() ?? (await auth.restore());
  if (user) return true;
  return router.createUrlTree(['/login'], {
    queryParams: state.url === '/' ? {} : { next: state.url },
  });
};
```

- **Functional guards**, not classes — tree-shakeable and testable by calling them inside an injection context.
- **The guard asks the API**, it does not inspect the cookie. The token is `httpOnly`, so its mere presence proves nothing about validity. The API remains the only authority; the guard exists to avoid rendering a shell the visitor can't use.
- `guestGuard` keeps signed-in users off the login page.
- `?next=` preserves the intended destination — and on success the redirect only follows **same-origin paths** (`startsWith('/')` and not `//`), because an attacker-supplied absolute URL would otherwise make this an open redirect.

### 11.6 The unauthorized interceptor

```ts
const SESSION_PROBES = ['/api/auth/me', '/api/auth/login', '/api/auth/register'];
```

A 401 on a normal request means the session expired, so the interceptor clears it and navigates to login once, centrally, instead of every component handling it. The probe list is excluded because for those endpoints a 401 is a legitimate answer — a visitor calling `/me` is *supposed* to get 401, and treating that as an expired session would cause a redirect loop.

### 11.7 Forms

```ts
protected readonly form = inject(FormBuilder).nonNullable.group({
  email: ['', [Validators.required, Validators.email]],
  password: ['', [Validators.required, Validators.minLength(8)]],
});
```

- **`nonNullable`** means `controls.email.value` is `string`, never `string | null` — no defensive checks in templates or handlers.
- Validators mirror the API's zod schema so obvious mistakes are caught before a round trip, but **the server stays authoritative**: any field issue it returns is mapped back onto the matching input via `issueFor(failure, 'url')`.
- Errors are wired with `aria-invalid` and `aria-describedby`, so a screen reader announces which field is wrong and why.

### 11.8 The chart

```ts
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);
```

- **Explicit registration, not `...registerables`** — the shortcut pulls in every chart type and roughly triples the bundle cost.
- **`@defer (on viewport)`** in the detail template means Chart.js only downloads when the chart scrolls into view. The build proves it: `response-chart-component` is a separate 51 kB lazy chunk, and the app's initial transfer is **82 kB**.
- **Updates in place** (`chart.update('none')`) rather than recreating, so a poll doesn't restart animations or discard the user's tooltip position.
- **`role="img"` with a generated text summary**, because a `<canvas>` is invisible to assistive technology.
- The chart is destroyed via `DestroyRef.onDestroy`, avoiding a leaked canvas and its event listeners.

### 11.9 The sparkline is deliberately not Chart.js

A 28px decorative line does not justify pulling a charting library into the dashboard bundle, so it's a hand-computed SVG `polyline` scaled by `viewBox` — responsive for free. It's `aria-hidden` because the uptime percentage beside it already carries the information. A flat series would divide by zero when normalising, so the span falls back to 1.

### 11.10 Accessibility

- Status is always **text as well as colour** — roughly 1 in 12 men have some form of red/green colour blindness, so a green dot alone is not an accessible status indicator
- Scrollable panels have `tabindex="0"`, `role="region"`, and a label — a plain `overflow` div is **not** keyboard-scrollable
- `:focus-visible` outline globally
- Native `<dialog>` + `showModal()` gives focus trapping, Escape-to-close, and `aria-modal` correctly
- `role="alert"` on error messages; `aria-pressed` on the range toggle

### 11.11 Tooling

- **`strictTemplates`** plus extended diagnostics promoted to errors: `invalidBananaInBox`, `nullishCoalescingNotNullable`, `optionalChainNotNullable`, `missingControlFlowDirective`, `uninvokedFunctionInEventBinding`
- **`noUncheckedIndexedAccess`**, `noUnusedLocals`, `noUnusedParameters` beyond `strict`
- **angular-eslint** with `recommendedTypeChecked`, plus `prefer-signals`, `prefer-on-push-component-change-detection`, `prefer-standalone`, `no-floating-promises`
- `OnPush` is the schematic default, so new components inherit it

One rule was tuned rather than suppressed: `@typescript-eslint/unbound-method` with `{ ignoreStatic: true }`. `Validators.required` is a static method that never touches `this`, so passing it by reference is correct — a genuine false positive.

---

## 12. Bugs found and fixed (strong interview material)

These are real defects caught during development. Being able to describe a bug, its root cause, and the fix is more convincing than describing features.

**1. `[class]` array binding silently rendered nothing.**
The status pill mixed a static `class` attribute with `[class]="[styleClass(), sizeClass()]"`. `[class]` is documented to take a *string*; the array form works only when Angular can constant-fold it. Rebuilt from signals each cycle, the whole binding was dropped — pills had shape but no colour or padding. No error, no warning, no build failure. Fixed by computing one class string in a single binding. Verified by asserting the rendered `class` attribute for all four states.

**2. Chart buckets anchored to `now()` made paused monitors look alive.**
`date_bin(..., now() - interval '24 hours')` moved the origin on every request, so bucket boundaries slid and averages shifted with no new data. Fixed with a constant epoch origin.

**3. Auto-refresh polled paused monitors every 20 seconds.**
Two faults: it ignored `isActive`, and the cadence was a fixed timer rather than the monitor's interval. Fixed by gating on `enabled` and driving from `lastCheckedAt + interval`.

**4. Chart seeded `useState` from props (Next client) so it never updated.**
`useState(initialSeries)` only reads its argument on mount, so refreshed data was ignored and only a full remount helped — which is why navigating away and back "fixed" it. The Angular rewrite avoids the class of bug entirely, since `httpResource` derives from signals rather than copying into state.

**5. Login and register shared one rate-limit bucket.**
A brute-force test against login locked out registration. Fixed with separate limiter instances.

**6. Redis gave up permanently after five retries.**
A brief blip disabled caching until the next process restart. Fixed to retry indefinitely with capped backoff, logging the first failure only and logging recovery.

**7. Two API processes silently bound port 4000.**
Windows allowed the second bind, so requests went to whichever process, and a stale one answered with old config — which produced a genuinely confusing debugging session. Fixed by handling the server `error` event and exiting with a clear message.

**8. `ioredis` default import wasn't constructable.**
Under Node's ESM→CJS interop the default export of a CJS package is `module.exports` itself, not the class. Fixed with the named import `{ Redis }`. Caught by typecheck.

**9. SMTP misconfiguration was invisible until a real outage.**
No connection check existed, so a wrong password would first surface as a missing alert during actual downtime. Added `verifyMailer()` at boot plus `mail` status in `/api/health`.

---

## 13. Verification approach

No test suite is committed (it wasn't requested), but every phase was verified with throwaway scripts before moving on. Roughly 200 checks total.

Highlights worth mentioning:

- **The no-spam guarantee**, tested directly: four consecutive down checks produce **exactly one** incident, still open; recovery closes it with a correct `durationSeconds`; a second outage opens a second incident.
- **Timeout behaviour:** a 3s-delayed target with a 2s timeout aborts at ~2s (not 3s) and records "Timed out after 2000ms" with a null status code.
- **Tenant isolation:** a second user gets 404 — not 403 — on every verb and every endpoint, including `/checks`, `/incidents`, and `/check`.
- **Email**, verified against a purpose-written local SMTP server with AUTH, because no Mailtrap credentials were available: two messages genuinely crossed the wire with correct subjects, `text/plain` and `text/html` parts, and a working monitor link. Then a real transition delivered exactly one email and two further down checks delivered none.
- **Redis**, verified against a hand-written RESP server and later real Upstash: `MISS → SET (EX 30) → HIT`, `DEL` on all four write paths, and correct degradation when killed mid-flight.
- **Angular runtime**, verified via TestBed: DI resolution, session restore, 401-as-signed-out, form blocking invalid submits and posting the right body, paused auto-refresh not polling, and the route table being fully lazy.

Why this matters as an answer: AOT and `strictTemplates` catch template type errors at build time, but **DI wiring and runtime behaviour only fail at runtime** — so those needed actual execution, not just a green compile.

---

## 14. Trade-offs and known limits

Be upfront about these; interviewers respect it more than claiming completeness.

| Limit | Consequence | Fix |
|---|---|---|
| Engine is in-process | Two API instances would double-probe every monitor | Move the engine to a dedicated worker with a leader lock or a queue |
| Rate limits in memory | Each instance keeps its own counters | Redis-backed store |
| 1-minute cron granularity | Sub-minute intervals impossible; checks land up to 60s late | Per-monitor scheduling, or a queue with delayed jobs |
| No SSR on the Angular client | First paint shows the shell before data (mitigated with skeletons) | `ng add @angular/ssr` |
| No forgot-password | A locked-out user stays locked out | `PasswordResetToken` table, single-use short-lived token |
| No deployment config | Runs locally only | Render/Vercel config, or containers |
| `ALLOW_PRIVATE_TARGETS=true` | Monitors can hit internal IPs | Set false before public signups |
| Checks table grows unbounded | ~43k rows/monitor/month at 1-minute intervals | Retention policy, or roll up into hourly summaries and drop raw rows |
| Single region | Measures uptime from one vantage point; a network issue looks like an outage | Multiple probe locations, require 2-of-3 agreement before alerting |
| No alert channels beyond email | No Slack/webhook/SMS | Pluggable notifier interface |

### If asked "how would you scale this to 100,000 monitors?"

1. **Split the engine from the API.** The API becomes stateless and horizontally scalable; the engine becomes a worker pool.
2. **Replace the cron+due-query with a queue.** Each check becomes a delayed job (BullMQ or SQS). Workers pull, so adding workers adds throughput linearly and no work is done twice.
3. **Partition `Check` by time** (monthly), so old partitions can be detached and dropped instead of a `DELETE` that bloats the table.
4. **Roll up raw checks** into hourly aggregates after a week; serve 7d/30d charts from the rollup and keep raw rows only for 24h.
5. **Move rate limiting and dedupe state to Redis.**
6. **Multi-region probes** with quorum, so one region's network trouble doesn't page everyone.
7. **Batch the writes.** At scale, one transaction per check is the bottleneck — buffer and `COPY` in batches.

---

## 15. API reference

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | 201, sets cookie. 409 on duplicate email |
| POST | `/api/auth/login` | 200, sets cookie. 401 with a generic message |
| POST | `/api/auth/logout` | 204, clears cookie |
| GET | `/api/auth/me` | Current user, or 401 |
| GET | `/api/monitors` | Dashboard payload: monitors + 24h uptime + sparkline (cached 30s) |
| POST | `/api/monitors` | 201 |
| GET | `/api/monitors/:id` | Monitor + uptime for all three ranges + recent checks |
| PATCH | `/api/monitors/:id` | Partial update; also used to pause/resume |
| DELETE | `/api/monitors/:id` | 204; cascades to checks and incidents |
| GET | `/api/monitors/:id/checks?range=24h\|7d\|30d` | Bucketed series + uptime for that range |
| GET | `/api/monitors/:id/incidents` | Reverse-chronological, max 50 |
| POST | `/api/monitors/:id/check` | Run a check now (beyond original spec) |
| GET | `/api/alerts/status` | SMTP state (beyond original spec) |
| POST | `/api/alerts/test` | Send sample down + recovered emails to yourself |
| GET | `/api/health` | `{ ok, db, cache, mail, uptimeSeconds }` |

**Every monitor route is owner-scoped**, and ownership is enforced *inside the write statement*:

```ts
prisma.monitor.update({ where: { id, userId }, data: input })
```

There's no read-then-write window, and a miss maps to **404 rather than 403** — confirming a monitor exists but belongs to someone else would leak which IDs are real.

---

## 16. Configuration

All backend config is zod-validated at boot; anything invalid stops the process with a message naming the field. Booleans accept `true/false/1/0/yes/no` case-insensitively, because `.env` files are edited by hand.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | ≥32 chars, enforced |
| `PORT` | no | Default 4000 |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `COOKIE_NAME` | no | Default `pulsecheck_token` |
| `REDIS_URL` | no | Blank = no cache. Must be `redis://` or `rediss://` |
| `CACHE_TTL_SECONDS` | no | Default 30 |
| `ENGINE_ENABLED` | no | Default true |
| `ENGINE_CONCURRENCY` | no | Default 10 |
| `ALLOW_PRIVATE_TARGETS` | no | Default true; set false for public deployments |
| `MAIL_ENABLED` | no | Default false — alerts are logged instead of sent |
| `MAIL_HOST` / `PORT` / `USER` / `PASS` / `FROM` | conditional | Required when `MAIL_ENABLED=true` |
| `APP_BASE_URL` | no | Used for the "View monitor" link in emails |

---

## 17. Commands

```bash
# Angular client + API
npm run dev:ng                 # 4000 + 4200

# Next client + API
npm run dev                    # 4000 + 3000

# Individually
npm run dev:api
npm run dev:angular
npm run dev:web

# Database
npm run db:migrate             # apply migrations
npm run db:studio              # browse data
npm run db:generate            # regenerate Prisma client

# Quality gates
npm run typecheck              # backend + Next
npm run typecheck:angular
npm run lint:angular
npm run build:angular
```

---

## 18. Quick facts to have ready

- **4 tables**, 4 screens (login, register, dashboard, monitor detail)
- **14 API endpoints**, all monitor routes owner-scoped
- Angular initial bundle: **82 kB transferred**; Chart.js in a separate 51 kB lazy chunk
- Engine: every **60s**, concurrency **10**, max **500** monitors per tick
- Defaults: **5 min** interval, **200** expected status, **5000 ms** timeout
- Cache: one key per user, **30s** TTL, invalidated on 4 write paths
- Rate limits: **100/min** general, **20/15min** on each credential endpoint
- bcrypt cost **12**; passwords capped at **72 bytes** (bcrypt's real limit)
- Uptime with no data returns **null**, never 100
- Alerts fire **only on state transitions** — the single most important behaviour

### The one-sentence answers

**What is it?** Self-hosted uptime monitoring: an Express API with an in-process cron engine that probes URLs on schedule, records results, and emails you on state transitions, with an Angular dashboard for uptime, charts, and incident history.

**What's the hardest part?** The incident state machine — everything else is CRUD. It has to distinguish "is down" from "just went down", survive concurrent ticks, keep the check and the incident atomically consistent, and never send a duplicate email.

**What are you proudest of?** Enforcing the "one open incident per monitor" invariant with a partial unique index rather than trusting application logic, and sending alerts only after the transaction commits so a dead mail server can't roll back monitoring data.

**What would you do next?** Move the engine to a separate worker so the API can scale horizontally, add a retention/rollup policy for the checks table, and probe from multiple regions with quorum before alerting.
