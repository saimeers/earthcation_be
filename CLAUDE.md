# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Node/Express + PostgreSQL REST API — the single source of truth for the Earthcation project. Both
the Unity game (`../../earthcation_sg`) and the React admin panel (`../earthcation_fe`) consume it.
Deployed on Railway at `api-earthcation.saimers.dev`. See `../../project-context.md` for the full
cross-project picture (data model diagrams, every endpoint, known gaps) — this file only covers
what's specific to working inside this folder.

## Commands

```
npm run dev     # nodemon index.js — hot reload, use this for local dev
npm start       # node index.js — plain start
```

No test framework, no lint config, no `.env.example` file in the repo — env vars must be inferred
from `src/config/database.js` and usages of `process.env` (DB connection, JWT secret, Resend API
key, `NODE_ENV`).

## Architecture

Strict layering, one file per resource at each layer:

```
routes/<resource>.routes.js       → wires HTTP verb + path + middleware + controller method
controllers/<resource>.controller.js → thin: parse req, call service, shape response
services/<resource>.service.js    → all business logic + Sequelize queries live here
models/<Resource>.js              → Sequelize model definitions
models/index.js                   → all associations (read this first to understand relations)
```

Resources: `analytics`, `auth`, `level`, `location`, `organization`, `progress`, `session`,
`telemetry` (level attempts + in-game events, see `docs/TELEMETRY.md`), `user`, `vark`. When adding a feature, follow this same four-file pattern — don't put query logic in
controllers.

`middleware/auth.middleware.js` validates the JWT from `Authorization` header and attaches
`req.user`. `middleware/role.middleware.js` exports `requireRole(...roles)` for route-level
authorization. `utils/jwt.utils.js` signs `{ id, username, role }` — note `username` in that payload
is actually the user's **cédula**, not a chosen username.

### Data model essentials (see `../../project-context.md` §2 for full detail)

- `User` — login is by `cedula`, not username. `role` enum: `player` | `instructor` | `admin`.
- Nothing is ever hard-deleted. `User`, `Organization`, `Location` all use `is_active: false` to
  soft-disable while preserving referential integrity with historical progress data.
- `email` is **intentionally not unique** — many bulk-imported mine workers share the company's
  email because they never registered a personal one. `cedula` is the real unique identity.
- `VarkResult` is **upserted** per user — resubmitting the VARK test overwrites the previous result,
  there is no history of past attempts.
- `TrainingSession.code` is a **3-digit numeric** room code (`utils/session.utils.js`), easy to
  read/dictate in a classroom. Retry-until-unique only checks against non-`finished` sessions
  (`session.service.js#createSession`) — a finished session frees its code, needed since 3 digits
  only gives 1000 combinations. Uniqueness is a **partial unique index** `training_sessions_code_live`
  (non-finished sessions only, created in `scripts/dbMaintenance.js`), and `joinSession` prefers the
  live session for a reused code. `GET /api/sessions/code/:code` (any logged-in user) returns the live
  session (name, instructor) without enrolling — used by the game when the code comes from a QR.
- `UserRiskProgress.session_id` / `LevelAttempt.session_id`: when the game sends none,
  `utils/freeSession.utils.js` assigns the **"Juego libre" session** (`TrainingSession.is_free_play`) of the
  player's profile location (a global one if the player has no location) and enrolls the player. Free sessions
  have no instructor or code, are always `active` (start/end return 400), are listed for admins and, in
  `/api/sessions/mine`, for instructors of the same location. `instructor_id`/`location_id` are nullable;
  `index.js` drops their NOT NULL explicitly after `sync` because `alter` does not do it for FK columns.
  Old rows with a null session were left as they were.
- Instructor access: `GET /:id/progress/admin`, `/:id/participants/:userId/analysis` and
  `/:id/export.xlsx` allow `instructor` too, guarded by `sessionService.assertCanView` (admin: all;
  instructor: own rooms + the "Juego libre" session of their profile location; else 403).
- `GET /api/users/:id/sessions` (new) — a user's `SessionUser` enrollment history with the joined
  `TrainingSession`, used by the frontend's player detail page.
- `analyticsService.getOverview()` also returns `riesgos_mas_fallados` (top failed risks by fail
  rate, grouped over `UserRiskProgress`) and `tendencia_temporal` (weekly mitigation % via
  `date_trunc('week', recorded_at)`) — both computed on the fly, no new columns.

### Login — role-dependent password requirement

`POST /api/auth/login` takes `{ cedula, password? }` and serves **both** the Unity game and the
React admin panel through the same endpoint. Password is required or skipped based on the **role
of the user found in the DB**, not on what the client sends:
- `role === 'player'` (the game): only `cedula` is checked, `password` is ignored even if sent.
  Unity's `LoginRequest` (`earthcation_sg`) only has a `cedula` field.
- `role !== 'player'` (admin/instructor, i.e. the web panel): password is required and validated
  with bcrypt, exactly like before.

`is_active` is also checked on login now (previously a disabled user could still log in — fixed
alongside this change). Public self-registration (`POST /api/auth/register`) is **removed** — the
route is no longer mounted in `auth.routes.js` (the `register()` service function itself is left
alone as unused dead code, not deleted, in case it's reused later). All account creation now goes
through `POST /api/users` (single, admin/instructor UI) or the bulk-import flow below.

### Bulk user import (ANM Excel format)

`src/services/bulkImport.service.js` + `src/routes/bulkImport.routes.js`, mounted at
`/api/users/bulk-import` (both routes `auth` + `requireRole('admin','instructor')`):

- `POST /parse` (multipart, `multer` in-memory, field name `file`) — parses the official ANM
  "Base de Datos Anual de Personal Capacitado" Excel format (via `xlsx`) and returns a JSON preview
  **without writing to the DB**. Each row gets a `status`: `ok` | `duplicate_in_file` |
  `duplicate_in_db` | `missing_required`.
- `POST /confirm` (JSON `{ rows }`, the — possibly admin-edited — array from `/parse`) — actually
  creates the `User` + `UserProfile` rows. Organizations/Locations are found-or-created by
  case-insensitive match (`Op.iLike`, not exact string match — the Excel almost never matches the
  DB's exact casing/punctuation) via local `findOrCreateOrganization`/`findOrCreateLocation`
  helpers in this file, **not** `organization.service.js#create`/`location.service.js#create`
  (those throw 409 on an existing name, which would break a batch with a repeated org across rows).
- The ANM template has a two-row merged header (title/format rows before it) — the parser locates
  the header by searching for the literal text `"DOCUMENTO DE IDENTIDAD"` rather than assuming a
  fixed row index, and reconstructs which section each column belongs to via "carry-forward" of the
  last non-blank cell in the title row (`buildSectionTitles`) — needed because the sheet has two
  different "CORREO ELECTRÓNICO" columns (company vs. worker) that are otherwise indistinguishable
  without knowing which section they're under. All header text comparisons go through a `normalize()`
  helper (strips accents, collapses `\r\n`/whitespace, uppercases) because the real file's headers
  have embedded line breaks and inconsistent accents.
- Bulk-imported users always get `role: 'player'`, `username: cedula` (no separate username field
  in the Excel), and an internally generated random password hash that's never emailed or exposed
  (irrelevant since player login is cedula-only).

### Municipios catalog (`src/data/colombia-municipios.json`, `src/scripts/seedMunicipios.js`)

Closed catalog of 33 departments / 1104 municipios (open dataset, DANE-based, with a manual fix
promoting Bogotá to its own department "Bogotá D.C." instead of a Cundinamarca municipality).
Seeded idempotently on every boot (`index.js`, after `sequelize.sync`) — safe to re-run, only
inserts rows that don't already exist by normalized municipality+department match. Added to fix a
real production issue: `locations` had accumulated 3 separate rows for "Norte de Santander" from
free-text Excel imports ("Norte de Santander" / "NORTE DE SANTANDER" / "Norte de Santender").

`bulkImport.service.js#findOrCreateLocation` now matches the Excel's free-text municipio/
departamento against this catalog first (normalized + Levenshtein distance ≤2 for typo tolerance,
`DEPT_ALIASES` for common abbreviations like "Bogota" → "Bogotá D.C."), falling back to
create-if-no-match (marked `location_no_match` in the response so the admin can review it in the
frontend's bulk-import preview) only when nothing in the catalog is close enough.

### Session detail for the admin panel (`session.service.js`)

- `GET /api/sessions/:id/progress/admin` (`getSessionProgressAdmin`) — **3 queries total**
  (session+participants, all `UserRiskProgress` of the session, all `LevelAttempt` of the session),
  grouped in memory by `user_id`. It used to do one query per participant. Response keeps the old
  per-participant fields (`total_attempts`, `mitigated`, `percentage`, `avg_reaction_ms`,
  `by_level`) and adds `band`, `risks`, `weakest_risk`, `telemetry` (attempt totals, per-level
  summary, `journeys` = attempt-by-attempt outcomes per level), plus top-level `summary`, `risks`
  (per-risk session stats with `fail_rate`), `levels`, `fail_reasons`. The raw `progress` array is
  no longer returned.
- `performanceBand(pct, hasData)` — `destacado` ≥80 · `en_progreso` 40–79 · `refuerzo` <40 ·
  `sin_datos`. The frontend (`modules/admin/sessions/bands.js`) and the Excel export use the same
  cut-offs — change them together.
- `GET /api/sessions/:id/participants/:userId/analysis` (`getParticipantAnalysis`) — one
  participant's session-scoped data + group averages for comparison (`group`), summed `summary`
  counters, event counts, panel reading time, and prev/next navigation. Reuses
  `getSessionProgressAdmin`.
- `GET /api/sessions/:id/export.xlsx` (`sessionExport.service.js`, **ExcelJS**, not `xlsx` —
  SheetJS CE can't style cells) — sheets Resumen / Participantes / Riesgos de la sesión /
  Resultados por riesgo / Intentos por nivel, branded header row, frozen header, autofilter,
  tinted result cells. Dates are written in Colombia local time (UTC−5) since Excel has no
  timezone. Spanish labels for game enums live in `utils/telemetry.labels.js`.
- `telemetry.service.js` exports the pure aggregators `summarizeAttempts` / `summarizeRisks`
  (used by `getUserSummary` and the session service) — don't duplicate those loops.

### Analytics — mines map (`GET /api/analytics/map`)

`analyticsService.getMinesMap()` powers the frontend's Leaflet map of mining units. `Organization`
has no `location_id` of its own — each org's location is inferred as the most frequent
municipality/department among its active players' `UserProfile.location`. Returns one row per
organization with `municipality`/`department`/`player_count`/`percentage` (mitigation rate,
computed the same way as `getByOrganization`).

### Schema management

**No migrations folder, no Sequelize CLI.** The schema is synced on every boot via
`sequelize.sync({ alter: true })` in `index.js`. If you add/change a model field, it will
auto-alter the table on next server start — there's no versioned rollback path, so be careful with
destructive column changes against the Railway production DB.

**Known `alter: true` footgun (hit twice):** fixed 2026-10-18 — `users.username` (92), `users.cedula`
(88) and `training_sessions.code` (82) had stacked UNIQUE constraints; `dbMaintenance.js` now drops
them on boot and the models declare uniqueness as **named indexes** (`users_username_unique`,
`users_cedula_unique`) instead of column `unique: true`. Never use column-level `unique: true`.
Original note: toggling a column's `unique: true` on and off
across model edits does **not** drop the old unique constraint on next sync — Sequelize just adds
a new uniquely-suffixed one (`users_email_key`, `_key1`, `_key2`, ...) and leaves the previous ones
in place. `users.email` had accumulated **48 stacked unique constraints** this way before they were
manually dropped via `ALTER TABLE users DROP CONSTRAINT` (not `DROP INDEX` — Postgres ties the index
to a constraint here, dropping the index directly fails). If a unique/not-null flag ever needs to
change again, verify with a raw query against `pg_constraint` that the old constraint actually left
before assuming the model change took effect.

### Success percentages = latest attempt (`utils/attempt.utils.js`)

Every success % (analytics overview/by level/by organization/by location, mines map, session
participants, `GET /api/progress/level/:levelId`) uses only the **latest attempt of each player in each
level** (`level_attempts`, via `user_risk_progress.attempt_id`). Retrying replaces the %, it does
not average with older tries. Rows without `attempt_id` are grouped per session + day.
`riesgos_mas_fallados` and `tendencia_temporal` still use the full history on purpose (difficulty /
trend). The frontend mirrors this in `earthcation_fe/src/lib/attempts.js`.

### Mines map coordinates (`utils/geo.utils.js`)

`src/data/colombia-municipios-coords.json` is DANE DIVIPOLA with lat/lng (datos.gov.co dataset
`gdxc-w37w`). `coordsFor(municipality, department)` matches catalog names tolerant to accents,
articles and official vs popular names (1104 of the 1105 catalog municipios resolve); unmatched
ones fall back to the department capital (`location_exact: false`). `GET /api/analytics/map`
returns `lat`, `lng`, `location_exact` and `results` per organization.

### Known gaps (don't "fix" without being asked — these are accepted current state)

- No pagination on any `findAll` list endpoint.
- No validation library (Joi/Zod/express-validator) — validation is manual/inline in controllers.
- No rate limiting, despite exposing `/api/auth/login` and `/api/auth/forgot-password` publicly.
- `forgot-password` always returns the same response regardless of whether the email/cédula exists
  (intentional anti-enumeration behavior — don't "simplify" this into a conditional response).

### Admin-created users

`createByAdmin` normalizes `''` → `null` for optional fields (an empty email used to fail
`isEmail`, an empty age broke the INTEGER column), defaults `username` to the cédula, and requires
email only for `instructor`/`admin`. **Players never get the welcome email.** If the email send
fails for staff, the user is still created and the response says `email_sent: false` instead of
a 500 (which used to make the admin retry and hit "cédula ya registrada"). `update` returns 409 on
duplicate cédula/username and creates the `UserProfile` row if it's missing.

Admins never set a password when creating a user (`POST /api/users`, single-create) — this still
matters for `admin`/`instructor` accounts, which log in through the web panel and do need a real
password. The service generates a secure random password, creates a reset token (SHA-256 hash,
15-min expiry), and emails the temporary password + set-password link via Resend
(`utils/email.utils.js`). Bulk-imported `player` accounts (see above) skip the email entirely — a
generated password is stored but never surfaced, since players never need one.

### Concurrency & performance (built for ~50 players per session)

- **Pool**: Sequelize `max 20, min 2` (`DB_POOL_MAX/MIN`); the default 5 queued requests.
- **Indexes**: `src/scripts/dbMaintenance.js` (run on every boot, idempotent) creates the indexes the
  write tables lacked (`level_attempts(session_id)`, `(user_id, level_key)`, `user_risk_progress`
  by session/user/attempt/recorded_at, `game_events(created_at)`) and drops the free-session NOT NULLs.
- **Redis optional** (`src/config/redis.js`, `REDIS_URL`; copied from gameploy): without it every
  user falls back to memory. `src/services/cache.service.js` `remember(ns, key, ttl, fn)` / `bump(ns)`
  (versioned keys). Cached: session detail `getSessionProgressAdmin` 10 s per session (bumped on
  start/end), analytics overview and mines map 60 s, a player's free session 10 min, level ids 1 h.
- **Rate limits** (`src/middleware/rateLimit.middleware.js`): requests with a token count **per user**
  (1500/15 min), anonymous ones per visitor IP (3000) — a whole classroom shares one public IP.
  Login/forgot-password 300/15 min per IP. Visitor IP behind Cloudflare: `src/utils/clientIp.js`.
- `trust proxy`, `compression`, `ALLOWED_ORIGINS` accepts a comma-separated list.
- **Health**: `GET /api/health` (public, minimal) and `GET /api/health/details` (DB/Redis ping, pool,
  p50/p95 and errors per route over 15 min from `src/middleware/metrics.middleware.js`, in memory).
- **Load test**: `node scripts/load/simulate-players.js [--players 50 --seconds 60 --panels 2]`
  (signs tokens for existing players, writes rows tagged `level_key = 'loadtest'`;
  `--cleanup` deletes them). 2026-10-18, local API → Railway DB, 50 players + 2 panels:
  p95 1878 ms → 282 ms, startAttempt p50 6809 ms → 217 ms, 0 errors.

### Developer role (`developer`, "Desarrollador/Soporte")

Manages game deployments and supports live sessions. **Read-only** on everything the admin can read:
every `router.get` that allows `admin` also allows `developer`; all writes stay admin-only (403).
`assertCanView` lets it see any session. The Postgres ENUM value is added by
`dbMaintenance.ensureEnumValues()` **before** `sync` (alter does not add ENUM values reliably).
Deploy/visits/health endpoints allow `admin` and `developer`.
