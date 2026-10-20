# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Node/Express + PostgreSQL REST API — the single source of truth for the Earthcation project. Both
the Unity game (`../../earthcation_sg`) and the React admin panel (`../earthcation_fe`) consume it.
Deployed on Railway at `api-earthcation.saimers.dev`. See `../../project-context.md` for the full
cross-project picture (data model diagrams, every endpoint, known gaps) — this file only covers
what's specific to working inside this folder.

## Commands (pnpm workspaces + Turborepo, fase 3b)

```
pnpm install       # pnpm 9.15.9 (packageManager); turbo needs `pnpm` on PATH
pnpm build         # turbo: tsc -b in every package, in dependency order (Railway runs it before `pnpm start`)
pnpm start         # node applications/app-service/dist/main.js
pnpm dev           # tsx watch on app-service
pnpm lint          # eslint per package (root eslint.config.mjs)
pnpm test          # turbo: vitest per package; app-service = v1 contract tests against a disposable Postgres
pnpm boundaries    # dependency-cruiser: allowed graph between layers
```

### Clean architecture monorepo (fase 3b, 2026-10-20) — in progress

Bancolombia-style scaffold: every layer and adapter is a package with its own `package.json`; pnpm forbids importing
what a package did not declare, dependency-cruiser (`.dependency-cruiser.cjs`) forbids declaring the wrong thing.
```
domain/model                       @earthcation/model    entities, value objects, DomainError subclasses, gateways
domain/usecase                     @earthcation/usecase  <context>/<case>/XxxUseCase.ts (+ Command); deps: model
infrastructure/driven-adapters/*   implement gateways; deps: model + their library
infrastructure/entry-points/*      rest-api (routes, controllers, dto, middlewares, errorHandler); deps: usecase, model
applications/app-service           the only deployable: config/env.ts, container, main; deps: everything
```
Graph: model ← nothing · usecase ← model · adapters ← model · entry-points ← usecase, model · app-service ← all.
Style: classes + throw (use cases with `execute(cmd)`, entities/VOs with behavior, typed `DomainError` subclasses
from `@earthcation/model`, one `errorHandlerV1` in rest-api maps `kind` → status). Packages export only `index.ts`.
**Transitional**: the fase 3 code lives in `applications/app-service/src/legacy/` (same files as before, functional
style, `Result`); each context moves out into the packages in its own PR (catalog → vark → observability → identity →
deployment → learning → sessions) and `legacy/` disappears at the end.

Migrated so far — **catalog**: `model/src/catalog` (`Organization`, `Location` entities with `prepare`/`change`/
`disable`/`enable`, errors, `OrganizationRepository`/`LocationRepository`), 13 use cases in
`usecase/src/catalog/{organizations,locations}/<case>/`, `SequelizeOrganizationRepository`/`SequelizeLocationRepository`,
`OrganizationController`/`LocationController` + `routes/catalog.routes.ts` + `dto/v1/catalog.ts` in rest-api.
Shared pieces that arrived with it: `@earthcation/sequelize-repository` owns **all models** (`defineModels(sequelize)`),
the connection factory and the Umzug migrations; `app-service/src/container.ts` creates the connection from
`config/env.ts` (DB_* validated there) and `legacy/config/database.js` + `legacy/models/index.js` just re-export it.
rest-api has `authenticate(TokenVerifier)` / `requireRole` (same 401/403 messages as v1); until identity migrates,
the container adapts `legacy/utils/jwt.utils` as the `TokenVerifier`. `main.ts` validates env before loading the app.
— **vark**: `model/src/vark` (`VarkAnswers#score` = the old `scoreVark`, `VarkResult` entity, `VarkStyle`/`parseVarkStyle`,
errors, `VarkRepository` whose panel listings are the `VarkListingRow` read model of raw rows), 5 use cases in
`usecase/src/vark/results/<case>/`, `SequelizeVarkRepository`, `VarkController` + `routes/vark.routes.ts` +
`dto/v1/vark.ts`; mounted from `container.routes.vark`. Paths below that say `src/...` mean
`applications/app-service/src/legacy/...` until then.

### TypeScript (fase 3, 2026-10-19)

- In app-service, JS (v1) and TS coexist (`allowJs`), compiled from `src/` to `dist/`. The entry is
  `applications/app-service/src/main.ts` (validates env with `src/config/env.ts`, zod, then `legacy/server.js#start`).
  **Production needs the build** — `pnpm start` on a fresh clone without `pnpm build` fails.
- Contract tests (`applications/app-service/test/`) load `dist/` (turbo builds first), so they check the deployed artifact.
- The service version reported by `/api/health` is `applications/app-service/package.json#version` (bump it with the
  root one at each release).
- `shared/result.ts`: `Result<T, E>` (`ok`, `err`, `map`, `flatMap`, `andThen`, `fromNullable`) — domain and
  application never throw. `shared/errors.ts`: `DomainError { kind, code, message, details? }` and
  `httpStatusOf` (v2 maps business rules to 422).
- ESLint on `src/**/*.ts`: typescript-eslint strict-type-checked + eslint-plugin-functional, `max-lines-per-function`
  10 (blank lines and comments excluded), `complexity` 5, `max-params` 3, `max-depth` 2, no `let`, no mutation,
  no classes, no `throw`, no loops. TypeScript is pinned to 6.0.x (typescript-eslint does not support 7 yet).

### Bounded contexts (strangler, one PR per context)

`src/contexts/<context>/`: `domain.ts` (types, pure validation, `DomainError` factories), `ports.ts`
(repository types), `application.ts` (use cases as factories over their ports, returning `Result`),
`sequelizeRepositories.ts` (rows ↔ domain), `httpV1.ts` (v1 routes, same snake_case responses), `index.ts`
(composition root mounted by `app.js`). `adapters/http/v1/respond.ts#sendV1` answers an `Err` the v1 way
(`{ error }` + status). Use cases are unit-tested with in-memory repositories (`tests/unit/`); the v1
contract snapshots must stay identical in every migration PR.

Migrated: **catalog** (organizations, locations), **vark** (now in the clean packages, see above) and **observability** (visits, login locations, health, metrics: pure
`toVisit`/`loginPlace`/`parseUserAgent` and `metrics.ts#summarize`; `runtime.ts` holds the only mutable state, the
per-minute buckets; the stats are a read model cached under namespace `visit-stats`) and **identity** (auth, users,
bulk import: `domain.ts` field rules, `anm.ts` pure Excel reading, `places.ts` catalog matching, `bulkImport.ts`;
crypto/JWT/email/xlsx adapters in `adapters.ts` over `utils/hash|jwt|email.utils.js`, which stay because the auth
middleware, rate limiter and tests use them). Their old
routes/controllers/services/utils were deleted. Cross-context ports live in `src/ports/` (`Cache`, adapter
`src/adapters/cache` over `services/cache.service.js`).
Behavior change on purpose: `PUT /api/organizations/:id` and `/api/locations/:id` only apply editable fields
(`name`, `type` / `municipality`, `department`, `country`); before, the whole body reached the model.
Behavior changes in identity (contract unchanged): an inactive staff user with a wrong password now gets
"Credenciales inválidas" (the password is checked before revealing "Usuario inactivo"); the bulk-import preview
looks up registered cédulas in one query; confirm resolves organization/location first and creates user + profile
in one transaction (no user without profile if a later step fails).
**deployment** is migrated too: `build.ts` (pure WebGL inspection and `headersFor`), state rules in `domain.ts`,
`adapters.ts` over `config/deployStorage.js` + adm-zip + HMAC + the in-memory publish queue, `playLocal.ts` for
`/play-local`. New error kinds `too_large` (413) and `unavailable` (503). Contract tests in `v1.deploy.test.js` run the
whole flow on disk (`DEPLOY_LOCAL_DIR` = a temp folder; `tests/support/env.cjs` removes the S3/R2 variables).
**learning** (progress, levels, telemetry, analytics): `attempts.ts` (latest-attempt rule), `summaries.ts`
(`summarizeAttempts`, `summarizeRisks`, `round`, hardest risks, level progress) and `geo.ts` (DIVIPOLA coordinates) are
pure; `analyticsReadModel.ts` and `telemetryOverview.ts` aggregate in Postgres and shape with those functions.
`shared/collections.ts` has `groupBy`/`countBy`/`maxBy`/`keyOf` (order of first appearance).
`tests/contract/v1.learning.test.js` snapshots the computed VALUES (ids and dates masked), not only the shape.
**sessions** (rooms, free play, panel detail, participant analysis, Excel): `domain.ts` (room code, who controls and who
sees a room), `detail.ts` (the whole `/progress/admin` computation, pure), `analysis.ts`, `report.ts` (Excel rows as
data) + `workbook.ts` (ExcelJS drawing), `labels.ts`. The free-play session (`freeSessions.resolve`, cached 10 min) is
exported to learning. `v1.sessions.test.js` snapshots the detail/analysis values and every Excel cell.

**Phase 3 is complete (2026-10-20): every route lives in a context; `routes/`, `controllers/` and the domain services are
gone.** What stays in JS: `models/`, `config/`, `middleware/` (auth, role, rate limit), `services/cache.service.js`,
`utils/` (clientIp, email, hash, jwt, rateLimitStore), `scripts/`.

No `.env.example` file in the repo — env vars must be inferred from `src/config/database.js` and
usages of `process.env` (DB connection, JWT secret, Resend API key, `NODE_ENV`).

`src/main.ts` validates the env and calls `src/server.js#start` (`prepareDatabase`: migrations, interrupted
publishes, municipios; then `listen`). The Express app itself is `src/app.js`, required without side effects by the tests.

## Tests (fase 2, 2026-10-19)

- **Contract tests of v1** (`tests/contract/`): every GET × 5 roles (anónimo, jugador, instructor,
  desarrollador, admin) and the writes (permissions + happy paths) snapshot `{ status, content-type,
  shape }`, where shape = keys and types (`uuid`, `date`, `string`…), not values. Plus the session Excel
  (sheets, headers, row counts). While v1 lives these snapshots must not change; an intended change is
  updated with `pnpm --filter @earthcation/app-service test -- -u` and explained in the PR.
- `tests/support/seed.cjs` (global setup, once per run): `DROP SCHEMA public CASCADE`, `prepareDatabase`,
  levels/risks + admin/developer straight into the models, and everything else through the API like
  production (organization, instructor, 3 players, VARK, a session with joins, attempts with events and
  progress, a free-play attempt). Test files read the ids with `inject('seed')`.
- `tests/support/env.cjs` loads `.env.test` (copy `.env.test.example`), forces `NODE_ENV=test`, removes
  `REDIS_URL`, stubs the email functions and **refuses to run if `DB_NAME` does not contain "test"**.
- Test files are ESM but load `src/` through `createRequire`, so the email stubs and the app share
  Node's CommonJS cache.
- CI (`.github/workflows/ci.yml`) runs lint + tests against a `postgres:16` service container.
- Recorded current behavior worth revisiting in v2: `GET /api/sessions/:id/progress` answers 403 to
  admin and developer (only the owning instructor gets 200); `GET /api/vark/me` is 404 for staff.

## Architecture

Hexagonal and functional, one folder per bounded context (see "Bounded contexts" above):

```
contexts/<context>/domain.ts      → types, pure rules and validation, DomainError factories
contexts/<context>/ports.ts       → what the use cases need (repositories, read models, adapters)
contexts/<context>/application.ts → use cases as factories over their ports, returning Result
contexts/<context>/sequelize*.ts  → rows ↔ domain, read models (aggregation in Postgres)
contexts/<context>/httpV1.ts      → v1 routes with the old snake_case responses
contexts/<context>/index.ts       → composition root, mounted by app.js
models/<Resource>.js, models/index.js → Sequelize models and all associations (read index first)
```

Contexts: `catalog`, `vark`, `observability`, `identity`, `deployment`, `learning` (telemetry: see
`docs/TELEMETRY.md`), `sessions`. A new feature goes into its context: pure logic in domain/feature modules, queries
behind a port, never query logic in `httpV1.ts`.

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
- `TrainingSession.code` is a **3-digit numeric** room code (`contexts/sessions/domain.ts#roomCode`), easy to
  read/dictate in a classroom. Retry-until-unique only checks against non-`finished` sessions
  (`application.ts#freeCode`) — a finished session frees its code, needed since 3 digits
  only gives 1000 combinations. Uniqueness is a **partial unique index** `training_sessions_code_live`
  (non-finished sessions only, created in `scripts/dbMaintenance.js`), and `joinSession` prefers the
  live session for a reused code. `GET /api/sessions/code/:code` (any logged-in user) returns the live
  session (name, instructor) without enrolling — used by the game when the code comes from a QR.
- `UserRiskProgress.session_id` / `LevelAttempt.session_id`: when the game sends none,
  `contexts/sessions` (`freeSessions.resolve`) assigns the **"Juego libre" session** (`TrainingSession.is_free_play`) of the
  player's profile location (a global one if the player has no location) and enrolls the player. Free sessions
  have no instructor or code, are always `active` (start/end return 400), are listed for admins and, in
  `/api/sessions/mine`, for instructors of the same location. `instructor_id`/`location_id` are nullable;
  `index.js` drops their NOT NULL explicitly after `sync` because `alter` does not do it for FK columns.
  Old rows with a null session were left as they were.
- Instructor access: `GET /:id/progress/admin`, `/:id/participants/:userId/analysis` and
  `/:id/export.xlsx` allow `instructor` too, guarded by `assertCanView` in `contexts/sessions/application.ts` (admin: all;
  instructor: own rooms + the "Juego libre" session of their profile location; else 403).
- `GET /api/users/:id/sessions` (new) — a user's `SessionUser` enrollment history with the joined
  `TrainingSession`, used by the frontend's player detail page.
- `GET /api/analytics/overview` (`contexts/learning/analyticsReadModel.ts#overview`) also returns `riesgos_mas_fallados` (top failed risks by fail
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
route does not exist (the old unused `register()` was deleted with the identity migration). All account creation now goes
through `POST /api/users` (single, admin/instructor UI) or the bulk-import flow below.

### Bulk user import (ANM Excel format)

`src/contexts/identity/` (`anm.ts`, `places.ts`, `bulkImport.ts`, routes in `httpV1.ts`), mounted at
`/api/users/bulk-import` (both routes `auth` + `requireRole('admin','instructor')`):

- `POST /parse` (multipart, `multer` in-memory, field name `file`) — parses the official ANM
  "Base de Datos Anual de Personal Capacitado" Excel format (via `xlsx`) and returns a JSON preview
  **without writing to the DB**. Each row gets a `status`: `ok` | `duplicate_in_file` |
  `duplicate_in_db` | `missing_required`.
- `POST /confirm` (JSON `{ rows }`, the — possibly admin-edited — array from `/parse`) — actually
  creates the `User` + `UserProfile` rows. Organizations/Locations are found-or-created by
  case-insensitive match (`Op.iLike`, not exact string match — the Excel almost never matches the
  DB's exact casing/punctuation) via the identity `ImportDirectory` port, **not** the catalog context's
  `create` (it answers 409 on an existing name, which would break a batch with a repeated org across rows).
- The ANM template has a two-row merged header (title/format rows before it) — the parser locates
  the header by searching for the literal text `"DOCUMENTO DE IDENTIDAD"` rather than assuming a
  fixed row index, and reconstructs which section each column belongs to via "carry-forward" of the
  last non-blank cell in the title row (`sectionTitles`) — needed because the sheet has two
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

`contexts/identity/places.ts#placeQuery` matches the Excel's free-text municipio/
departamento against this catalog first (normalized + Levenshtein distance ≤2 for typo tolerance,
`DEPT_ALIASES` for common abbreviations like "Bogota" → "Bogotá D.C."), falling back to
create-if-no-match (marked `location_no_match` in the response so the admin can review it in the
frontend's bulk-import preview) only when nothing in the catalog is close enough.

### Session detail for the admin panel (`contexts/sessions/detail.ts`, `analysis.ts`)

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
- `GET /api/sessions/:id/export.xlsx` (`report.ts` rows + `workbook.ts`, **ExcelJS**, not `xlsx` —
  SheetJS CE can't style cells) — sheets Resumen / Participantes / Riesgos de la sesión /
  Resultados por riesgo / Intentos por nivel, branded header row, frozen header, autofilter,
  tinted result cells. Dates are written in Colombia local time (UTC−5) since Excel has no
  timezone. Spanish labels for game enums live in `contexts/sessions/labels.ts`.
- `contexts/learning/summaries.ts` exports the pure aggregators `summarizeAttempts` / `summarizeRisks`
  (used by `getUserSummary` and the session service) — don't duplicate those loops.

### Analytics — mines map (`GET /api/analytics/map`)

`analyticsReadModel.ts#minesMap` powers the frontend's Leaflet map of mining units. `Organization`
has no `location_id` of its own — each org's location is inferred as the most frequent
municipality/department among its active players' `UserProfile.location`. Returns one row per
organization with `municipality`/`department`/`player_count`/`percentage` (mitigation rate,
computed the same way as `getByOrganization`).

### Schema management

**Versioned migrations with Umzug (since fase 3).** `src/infrastructure/migrations/index.ts` runs the pending
migrations on boot (`server.js#prepareDatabase`) and records them in `schema_migrations`. `sync({ alter: true })`
is gone: **changing a model no longer changes the database** — every schema change needs a new migration
file (`0002_<what>.ts` exporting `name` and `up({ context: sequelize })`, added to the explicit `MIGRATIONS`
list; no glob, so it works from `src/` and `dist/`).
- `0001_baseline` = `ensureEnumValues` + `sync()` (no alter) + `runDbMaintenance`. Verified 2026-10-19 on a
  schema-only copy of production: the only change is the new `schema_migrations` table, and a second run applies
  nothing. A fresh database gets the same schema as production (column order aside).
- Pending (fase 5): run migrations as a separate pre-deploy step with a DDL user, and the app with a user
  without DDL rights.

Historical notes (the `alter` era, still relevant for existing constraints):

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

### Success percentages = latest attempt (`contexts/learning/attempts.ts`)

Every success % (analytics overview/by level/by organization/by location, mines map, session
participants, `GET /api/progress/level/:levelId`) uses only the **latest attempt of each player in each
level** (`level_attempts`, via `user_risk_progress.attempt_id`). Retrying replaces the %, it does
not average with older tries. Rows without `attempt_id` are grouped per session + day.
`riesgos_mas_fallados` and `tendencia_temporal` still use the full history on purpose (difficulty /
trend). The frontend mirrors this in `earthcation_fe/src/lib/attempts.js`.

### Mines map coordinates (`contexts/learning/geo.ts`)

`src/data/colombia-municipios-coords.json` is DANE DIVIPOLA with lat/lng (datos.gov.co dataset
`gdxc-w37w`). `coordsFor(municipality, department)` matches catalog names tolerant to accents,
articles and official vs popular names (1104 of the 1105 catalog municipios resolve); unmatched
ones fall back to the department capital (`location_exact: false`). `GET /api/analytics/map`
returns `lat`, `lng`, `location_exact` and `results` per organization.

### Known gaps (don't "fix" without being asked — these are accepted current state)

- No pagination on any `findAll` list endpoint.
- No validation library (Joi/Zod/express-validator) — validation is manual/inline in controllers.
- `forgot-password` always returns the same response regardless of whether the email/cédula exists
  (intentional anti-enumeration behavior — don't "simplify" this into a conditional response).

### Admin-created users

`POST /api/users` (`toNewUser` in `contexts/identity/domain.ts`) normalizes `''` → `null` for optional fields (an empty email used to fail
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
  (versioned keys). Cached: session detail (`sessions` context) 10 s per session (bumped on
  start/end), analytics overview and mines map 60 s, a player's free session 10 min, level ids 1 h.
- **Rate limits** (`src/middleware/rateLimit.middleware.js`): requests with a token count **per user**
  (1500/15 min), anonymous ones per visitor IP (3000) — a whole classroom shares one public IP.
  Login/forgot-password 300/15 min per IP. Visitor IP behind Cloudflare: `src/utils/clientIp.js`.
- `trust proxy`, `compression`, `ALLOWED_ORIGINS` accepts a comma-separated list.
- **Health**: `GET /api/health` (public, minimal) and `GET /api/health/details` (DB/Redis ping, pool,
  p50/p95 and errors per route over 15 min from `src/contexts/observability/runtime.ts`, in memory).
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

### Game deployment (`/api/deploy/*`, `src/contexts/deployment/`, admin + developer)

`GameVersion` (status `uploading → processing → ready | failed`) + `GameSetting` key
`active_version_id` (single pointer, changed in a transaction). Flow: `POST /versions` creates the row and
returns where to `PUT` the ZIP (S3 presigned URL, or `/versions/:id/upload` through the API when there is
no S3) → `POST /versions/:id/complete` (atomic `uploading|failed → processing`) queues the publish
(in-process, one at a time): unzip (`inspectBuild`, same rules as the panel's `buildCheck.js`), upload each
file to `builds/<id>/` with `headersFor` (`x.wasm.br` = `application/wasm` + `Content-Encoding: br`,
everything immutable except `index.html`) → `ready` with `manifest` (files, compression, Unity
`productVersion`, warnings). `POST /:id/activate` writes `current.json` (read by the Worker) inside the
transaction; rollback = activate an older one. `GET /:id/preview` = `<PLAY_URL>/v/<id>/?t=<exp>.<hmac>`
(`PLAY_SIGNING_SECRET`, shared with the Worker). On boot, `processing` rows become `failed` (retryable).
Storage (`src/config/deployStorage.js`): originals in AWS S3 (`AWS_S3_BUCKET`, `AWS_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; bucket CORS must allow PUT from the panel) and published
files in Cloudflare R2 (`R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). Without
them each falls back to disk (`DEPLOY_LOCAL_DIR`, default `.deploy/`, gitignored) and the API serves the
published game at `/play-local/` (mounted before helmet, no token check) — dev only. `DEPLOY_MAX_MB` (500).

### Visits & login locations (`src/contexts/observability/`)

`POST /api/visits/ingest` (no token; header `x-ingest-secret` = `VISITS_INGEST_SECRET`, shared with the
Worker; mounted **before** the global rate limit since every visit comes from Cloudflare's IPs) stores a
`GameVisit` per opening of the live game: Cloudflare country/region/city/colo/coordinates, device/OS/browser
(`userAgent.ts`), version, `session_code` when it came from a room QR. `visitor` is the Worker's
`HMAC(VISIT_SALT, ip)` — no IP is stored; `is_unique` = first opening of that visitor in 30 min
(`setIfAbsent`). Successful logins write a `LoginEvent` (role, `cf-ipcountry`/`cf-region`/`cf-ipcity`
— trusted only when `req.ip` is Cloudflare; region/city need the zone's "Add visitor location headers"
managed transform) without blocking the response. `GET /api/visits/stats?days=7|30|90` (admin,
developer) aggregates everything, cached 60 s.
- **Trusting `cf-*` headers**: behind Railway, `req.ip` is not reliably a Cloudflare address. A zone Transform
  Rule (`http_request_late_transform`, host `api-earthcation.saimers.dev`) sets `x-earthcation-edge` to
  `CF_EDGE_SECRET`; `utils/clientIp.js#fromCloudflare(req)` checks it (falls back to `isCloudflare(req.ip)`).
  Node reads headers as latin1 and Cloudflare sends `cf-ipcity`/`cf-region` in UTF-8 → `utf8Header()`;
  " Department" is stripped from Colombian region names.
- **Bots**: visits with a bot user-agent or from a datacenter network (`as_organization` from the Worker, e.g.
  OVH/Hetzner/AWS — certificate-transparency scanners arrive with a fake Chrome UA) are stored with
  `is_bot = true` and excluded from `/api/visits/stats` (`totals.bots` = how many were dropped).

### Security hardening (2026-10-19, fase 0)

- `PUT /api/users/:id` (any logged-in user, for their own record): non-admins can only change `first_name`,
  `last_name`, `age`, `email`; `role`, `cedula`, `username`, `organization_id`, `location_id` are silently
  ignored (before, a player could send `{role:'admin'}`). Admins keep the full field list.
- Login limits (`rateLimit.middleware.js`, mounted on `/api/auth/login` after `authLimiter`):
  `loginCedulaLimiter` 10 failed attempts / 15 min per SHA-256 of the cédula (`skipSuccessfulRequests`);
  `loginIpFailLimiter` 60 / 15 min per IP counting **only cédulas that don't exist** (`skip` = cédula exists),
  so a classroom's typos never lock out players with valid cédulas. Env: `RATE_LIMIT_LOGIN_CEDULA_MAX`,
  `RATE_LIMIT_LOGIN_IP_FAIL_MAX`. Verified: 50 valid logins from one blocked IP all 200.
- Error handler: 5xx answer `{ error: 'Error interno del servidor' }` (stack only in logs); 4xx keep their message.
- JWT: `HS256` pinned on sign and verify; boot exits if `JWT_SECRET` is missing or shorter than 32 chars.
