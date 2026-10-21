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
pnpm test          # turbo: vitest per package; app-service = legacy + v1 contract tests against a disposable Postgres
pnpm boundaries    # dependency-cruiser: allowed graph between layers
```

### Clean architecture monorepo (fase 3b, 2026-10-20) — complete

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
from `@earthcation/model`, one `errorHandlerLegacy`/`errorHandlerV1` in rest-api map `kind` → status). Packages export only `index.ts`.
All seven contexts (catalog → vark → observability → identity → deployment → learning → sessions) live in the
clean packages and **`applications/app-service/src/legacy/` no longer exists** (closed 2026-10-20): the Express app is
rest-api's `createApp(deps)` (helmet, cors, compression, morgan, metrics, `rateLimiters`, every legacy router, the v1 router, 404 +
`errorHandlerLegacy`), built by `container.ts` and exported as `app`; boot (`src/boot.ts#prepareDatabase`/`start`) runs
migrations, `RecoverInterruptedPublishesUseCase` and `SeedPlaceCatalogUseCase` (municipios) before `listen`.
app-service is TypeScript only (no `allowJs`).

Migrated so far — **catalog**: `model/src/catalog` (`Organization`, `Location` entities with `prepare`/`change`/
`disable`/`enable`, errors, `OrganizationRepository`/`LocationRepository`), 13 use cases in
`usecase/src/catalog/{organizations,locations}/<case>/`, `SequelizeOrganizationRepository`/`SequelizeLocationRepository`,
`OrganizationController`/`LocationController` + `routes/catalog.routes.ts` + `dto/legacy/catalog.ts` in rest-api.
Shared pieces that arrived with it: `@earthcation/sequelize-repository` owns **all models** (`defineModels(sequelize)`),
the connection factory and the Umzug migrations; `app-service/src/container.ts` creates the connection from
`config/env.ts` (DB_* validated there) and exports `sequelize` + `models` (used directly only by the test seed and
`scripts/load`).
rest-api has `authenticate(TokenVerifier)` / `requireRole` (same 401/403 messages as the legacy API). `main.ts` validates env
before loading the app.
— **vark**: `model/src/vark` (`VarkAnswers#score` = the old `scoreVark`, `VarkResult` entity, `VarkStyle`/`parseVarkStyle`,
errors, `VarkRepository` whose panel listings are the `VarkListingRow` read model of raw rows), 5 use cases in
`usecase/src/vark/results/<case>/`, `SequelizeVarkRepository`, `VarkController` + `routes/vark.routes.ts` +
`dto/legacy/vark.ts`; mounted from `container.routes.vark`.
— **deployment**: `model/src/deployment` (`GameVersion` state machine, `VersionLabel`/`ZipSize`, pure `BuildInspection`
and `ActivationPointer`, errors, gateways `GameVersionRepository`/`OriginalsStorage`/`PublishedStorage`/`ZipReader`/
`PreviewSigner`/`PublishQueue`/`IdGenerator`), 11 use cases in `usecase/src/deployment/{status,versions,publishing,play}/`,
`SequelizeGameVersionRepository`, new adapters `object-storage` (S3/R2/disk), `zip-reader`, `hmac-signer`,
`in-process-queue` (the container wires the queue to `PublishVersionUseCase`), `DeploymentController`/`PlayLocalController`
+ `routes/deployment.routes.ts` + `dto/legacy/deployment.ts`; the local-publishing flag goes to `createApp`
(`servePlayLocal`) and the boot recovery to `bootTasks`. Deploy env vars are validated in `config/env.ts`.
— **observability**: `model/src/observability` (`Visit.fromWorker`, `BotDetector`, `UserAgent`, `LoginEvent` + `loginPlace`/`utf8Header`,
`VisitWindow`, pure `summarizeMetrics`, `Health` types; gateways `VisitRepository`, `LoginEventRepository`, `VisitStatsReadModel`,
`MetricsStore`, `DatabaseHealthProbe`/`CacheHealthProbe`, `RuntimeInfo`), 4 use cases in `usecase/src/observability/`, new adapters
`@earthcation/redis-cache` (`RedisCache`: the shared `Cache`, Redis or memory) and `@earthcation/in-memory-metrics`;
rest-api `VisitController`/`HealthController`, `metrics` middleware, `cloudflareEdge` (client IP, old `utils/clientIp.js`).
The container reads `REDIS_URL`/`VISITS_INGEST_SECRET`/`CF_EDGE_SECRET`; the Redis client feeds both `RedisCache` and
`RedisWindowCounter` (rate-limit counters), and `edge.clientIp` keys the anonymous rate limits.
— **identity**: `model/src/identity` (`User` entity with `register`/`imported`/`edit`/`assertEditableBy`/`assertCanLogIn`/
password reset; VOs `Cedula`, `Email`, `UserRole`; `AnmSheet` = pure ANM Excel reading; domain services `PlaceMatcher`
(municipio catalog via the `PlaceCatalog` gateway), `IdentifierAvailability`, `ResetTokenFactory`; gateways `UserRepository`,
`UserReadModel`, `PasswordHasher`, `PasswordGenerator`, `ResetTokenService`, `TokenIssuer`, `Mailer`, `SpreadsheetReader`,
`ImportDirectory`, `LoginRecorder`), 11 use cases in `usecase/src/identity/{auth,users,bulk-import}/`, new adapters
`@earthcation/security` (bcrypt, `JwtTokenService` = `TokenIssuer` + `TokenVerifier`, HS256), `@earthcation/resend-mailer`,
`@earthcation/excel` (xlsx reader) and `@earthcation/geo-catalog` (`colombia-municipios.json`); `SequelizeUser*` +
`SequelizeImportDirectory`; rest-api `AuthController`/`UserController`/`BulkImportController` + `routes/identity.routes.ts`.
The login's `LoginRecorder` is observability's `recordLogin`. The container exports `security` (tokens + passwords) for
the test seed and `scripts/load`; tests stub `ResendMailer.prototype` (`test/support/env.cjs` → `outbox`). Env:
`RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`.
— **learning**: `model/src/learning` (pure `attempts.ts` = latest-attempt rule, `summaries.ts` = aggregators, `LevelProgress.ts`,
value objects `RiskResultInput`/`NewAttemptInput`/`EventBatch` with their errors, gateways `LearningRepository`/`LearningReadModel`/
`AnalyticsReadModel`/`FreePlaySessions`/`MunicipalityCoordinates`), 16 use cases in `usecase/src/learning/{progress,levels,telemetry,
analytics}/`, `SequelizeLearningRepository`/`SequelizeLearningReadModel`/`SequelizeAnalyticsReadModel` (Postgres aggregation + the
model's pure functions) and `SequelizeFreePlaySessions` (the "Juego libre" gateway, cached 10 min) in sequelize-repository;
`ProgressController`/`LevelController`/`TelemetryController`/`AnalyticsController` + `routes/learning.routes.ts` + `dto/legacy/learning.ts`
in rest-api; `container.routes.{progress,levels,telemetry,analytics}`. New adapter `@earthcation/geo-catalog`'s `DivipolaCoordinates`
(DIVIPOLA municipio/department matching, reusing `levenshtein` from `@earthcation/model`) replaces the old `geo.ts`.
`shared/collections.ts` (`groupBy`/`countBy`/`maxBy`/`keyOf`/`sum`) moved to `model/src/shared/collections.ts`.
— **sessions**: `model/src/sessions` (pure `Room.ts` = room code/`assertCanControl`/`canSee`/`seesEverything`, `NewRoomInput`/`JoinCode`
value objects, `detail.ts` = the whole `/progress/admin` computation, `analysis.ts`, `report.ts` (Excel rows as data), `labels.ts`,
errors, gateways `SessionRepository`/`SessionDetailReader`/`SessionReportWriter`), 12 use cases in `usecase/src/sessions/rooms/<case>/`
(`assertCanView.ts` is a shared non-use-case helper for detail/analysis/export, not a use case calling another). `SequelizeSessionRepository`
and `SequelizeSessionDetailReader` (the `/progress/admin` computation cached 10 s per session, invalidated on start/end) in
sequelize-repository; `@earthcation/excel`'s `ExcelSessionReportWriter` (ExcelJS, moved from the old `workbook.ts`) implements
`SessionReportWriter`. `SessionController` + `routes/sessions.routes.ts` + `dto/legacy/sessions.ts` in rest-api; `container.routes.sessions`.
The "Juego libre" gateway (`FreePlaySessions`/`SequelizeFreePlaySessions`) arrived with **learning** above — sessions does not
re-implement it.

### API naming: `legacy` and `v1` (decision 2026-10-21)

Two APIs live side by side in rest-api. **Legacy** is the original unversioned API (`/api/...`, snake_case,
`{ message, data }` bodies, `{ error: string }`): `routes/*.routes.ts`, `controllers/`, `dto/legacy/`,
`errorHandlerLegacy`; the panel and the published Unity builds still use it, so its contract snapshots must not
change. **v1** is the new API (`/api/v1/...`), everything under `src/v1/`; it replaces legacy and legacy is deleted
once no client calls it (visits stats show zero traffic). There is no `v2`.
- A route is defined **once** with `route({ method, path, tag, summary, roles, params, query, body, response, handler })`
  (`v1/http/route.ts`); the Express router and the OpenAPI 3.1 document (`v1/openapi/buildOpenApi.ts`, schemas come from
  zod's `toJSONSchema`) are both generated from it. Swagger UI: `/api/v1/docs`, spec: `/api/v1/openapi.json`
  (`DOCS_ACCESS=public|staff`; `staff` requires an admin/developer token).
- Envelope `{ data, meta? }` (`reply.ts`: `ok`, `page`, `created` → 201 + `Location`, `noContent`); errors
  `{ error: { code, message, details? } }` with the domain `code`, business rules are **422** (legacy: 400), 5xx hide
  the detail; invalid input is 400 `VALIDATION_ERROR` with `details: [{ field, message }]` (zod, `v1/http/validate.ts`);
  ids are validated as UUID. Lists take `?page&limit&sort=-field` (`pagination.ts`: `listQuery`, `paginate`, `sortBy`;
  paging is in memory for now, use cases still return full lists). JSON is camelCase, dates ISO 8601.
- Request-level pieces shared by both: `createApp` mounts `/api/v1` before the legacy routers, the global rate limiter
  covers both (its message follows the version of the path: `RATE_LIMITED` in v1), and body-parser errors are
  translated by `errorsByVersion`.
- Migrated to v1 so far: catalog (locations, organizations), VARK (`/vark-results`, `/vark-results/me`) and identity
  (`/auth/login`, `/auth/password-resets`, `/auth/password`, `/users`, `/users/:id`, `/users/:id/sessions`,
  `/users/:id/active`) and sessions (`/sessions`, `/sessions/join`, `/sessions/code/:code`, `/sessions/:id`,
  `/sessions/:id/status` (PUT active|finished), `/progress`, `/participants/:userId/analysis`, `/report.xlsx`).
  learning (`/risk-results`, `/levels`, `/attempts` + `/attempts/:id/events`, `/users/:id/attempts`, `/telemetry/overview`,
  `/analytics/*`). Request bodies reach the use cases in snake_case: `v1/dto/snake.ts` converts them (an event `payload`
  is left untouched; on reads `payload` is also kept as is, `camelize` converts every other key).
  deployment (`/game-versions`, `/status`, `/:id/upload` raw ZIP, `/completion`, `/activation`, `/preview-url`), observability
  (`POST /visits` guarded by `x-ingest-secret`, `/visits/stats`, `/health`, `/health/details`) and bulk import
  (`/user-imports/previews` multipart, `/user-imports`). Route specs can add `middlewares` (raw/multipart/secret) and
  `upload` (documents a non-JSON body); `POST /api/v1/visits` is mounted before the global rate limit like the legacy
  ingest (the Worker still calls the legacy path until legacy is removed; then its `API_URL` path changes).
  **All contexts are now on v1.** Next: the panel and the game move over, legacy is removed, READMEs; then the panel and the
  game move over, legacy is removed and the READMEs are written.
- Read models (users, VARK listings) still arrive as raw snake_case rows: `v1/dto/camelize.ts` turns them into
  camelCase with ISO dates (keys of data dictionaries such as `fail_reasons`, `fail_stages` and `journeys` are kept as is); the zod response schemas document the shape. Binary replies use `file(contentType, filename, content)` and `response.contentType` in the route spec. `createApp` mounts the same login /
  password-reset rate limits on `/api/v1/auth/*` as on the legacy paths. `RouteContext` also carries `req` (login origin)
  and `userOf(ctx)` returns the authenticated user.
- Tests: `rest-api/test/v1.spec.ts` (unit, stub use cases), `createApp.spec.ts`, and
  `app-service/test/contract/v1.catalog.test.js` (real Postgres).

### Audit log (fase 5)

Who did what to what, in `audit_logs` (migration `0002_audit_logs`, append-only: a trigger rejects UPDATE, DELETE and
TRUNCATE). The model has `AuditEntry`/`AUDIT_ACTIONS` and the ports `AuditLog`, `RequestContext`, `IpHasher`; use cases
are wrapped with `audited(useCase, { action, describe, failure? }, deps)` (`usecase/src/audit/audited`) **in the
composition root** (`container.ts`, "Auditoría" block), so the legacy and v1 APIs are both audited with no change to the
commands. Actor and origin come from the request scope: `requestContext` middleware (rest-api) opens it with the
visitor-IP HMAC and user agent, `authenticate(tokens, onAuthenticated)` sets the actor; `@earthcation/request-context`
implements it with AsyncLocalStorage. The IP is never stored (HMAC with `AUDIT_IP_SALT`, default derived from
`JWT_SECRET`). `changes` never holds personal data: `fieldChanges()` keeps field names (and the role).
Audited: staff login ok (players are not) and every failed login (cedula hash only), password reset request/completion,
user create/update/enable/disable/import, organization and location create/update/enable/disable, session
start/end/export, game version create/complete/activate/remove. A failure to write the audit entry does not undo the
action (it is reported to the service log; it is not in the same DB transaction as the change). Read it with
`GET /api/v1/audit-logs` (filters, paging) and `/audit-logs/export` (CSV), admin and developer only.
Add an action: extend `AUDIT_ACTIONS`, then wrap the use case in the container.

### Authentication hardening (fase 5)

- **The token does not outlive the account.** `authenticate(tokens, { accounts, onAuthenticated })` asks the
  `AccountDirectory` port (`SequelizeAccountDirectory`, cached 60 s under namespace `account`) for the current state:
  a disabled account gets 403 `ACCOUNT_DISABLED`, a missing one 403 `TOKEN_INVALID`, and `req.user.role` comes from the
  account, not from the token. A change therefore takes effect within a minute (the legacy API shares this middleware).
- **Session length:** staff tokens (instructor, admin, developer) last 24 h, players 7 days (`JwtTokenService`).
- **Room codes are 3 digits:** `limiters.join` (`RATE_LIMIT_JOIN_MAX`, default 20 per 15 min, per user) covers
  `/sessions/join` and `/sessions/code` in legacy and v1.
- **CORS:** in production a missing or `*` `ALLOWED_ORIGINS` means "only the origins of `FRONTEND_URL` and `PLAY_URL`"
  (`allowedOrigins()` in `config/env.ts`); outside production an empty list still accepts any origin.
- **DB TLS:** set `DB_SSL_CA` (PEM, `
` allowed) to verify the server certificate; without it the connection is
  encrypted but not verified (Railway issues its own certificate). Pending: obtain Railway's CA and set it in production.

### TypeScript

- All of `src/` in every package is TypeScript, compiled to `dist/`. The entry is
  `applications/app-service/src/main.ts`: validates env with `src/config/env.ts` (zod; throws `InvalidEnvError` with
  every problem, main prints them and exits) and then calls `src/boot.ts#start`.
  **Production needs the build** — `pnpm start` on a fresh clone without `pnpm build` fails.
- Contract tests (`applications/app-service/test/`) load `dist/` (turbo builds first), so they check the deployed artifact.
- The service version reported by `/api/health` is `applications/app-service/package.json#version` (bump it with the
  root one at each release).
- ESLint on `src/**/*.ts`: typescript-eslint strict-type-checked, `max-lines-per-function` 10 (blank lines and comments
  excluded), `complexity` 5, `max-params` 3, `max-depth` 2. TypeScript is pinned to 6.0.x (typescript-eslint does not
  support 7 yet).

### Bounded contexts (strangler, historical — fase 3b finished this)

Before the clean-package move (fase 3), each context lived under `src/contexts/<context>/` in a hexagonal-functional
style (`domain.ts`/`ports.ts`/`application.ts` returning `Result`, `sequelizeRepositories.ts`, `httpLegacy.ts`, `index.ts`
composition root mounted by `app.js`). All seven contexts have since moved into the clean packages (see "Migrated so
far" above) and `src/contexts/` no longer exists. Behavior changes picked up along the way, kept for the record:
`PUT /api/organizations/:id` and `/api/locations/:id` only apply editable fields (before, the whole body reached the
model); an inactive staff user with a wrong password gets "Credenciales inválidas" (checked before "Usuario
inactivo"); the bulk-import preview looks up registered cédulas in one query; confirm resolves organization/location
and creates user + profile in one transaction; an unknown `role` or non-numeric `age` answer 400 instead of a 500
from Postgres; an empty `role` in `PUT /api/users/:id` leaves it unchanged; cédula/email are trimmed; deployment's
`too_large` (413) and `unavailable` (503) error kinds arrived with that migration.

Every env var is declared (with its default) in `applications/app-service/src/config/env.ts`, the only place that
reads `process.env`.

`src/main.ts` validates the env and calls `src/boot.ts#start` (`prepareDatabase`: migrations, interrupted
publishes, municipios; then `listen`). The Express app itself is `container.ts#app`, required without side effects
by the tests.

## Tests (fase 2, 2026-10-19)

- **Contract tests of the legacy API** (`test/contract/legacy.*.test.js`): every GET × 5 roles (anónimo, jugador, instructor,
  desarrollador, admin) and the writes (permissions + happy paths) snapshot `{ status, content-type,
  shape }`, where shape = keys and types (`uuid`, `date`, `string`…), not values. Plus the session Excel
  (sheets, headers, row counts). While the legacy API lives these snapshots must not change; an intended change is
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
- Recorded current behavior worth revisiting in v1: `GET /api/sessions/:id/progress` answers 403 to
  admin and developer (only the owning instructor gets 200); `GET /api/vark/me` is 404 for staff.

## Architecture

Clean/hexagonal, one context per vertical slice (see "Clean architecture monorepo" above for the package layout).
A new feature goes into its context: pure logic/entities in `domain/model`, orchestration in `domain/usecase`, I/O in
a `driven-adapters` package, HTTP in `rest-api` — never query logic in a controller. See `docs/TELEMETRY.md` for the
telemetry wire format served by the `learning` context.

`middleware/auth.middleware.js` validates the JWT from `Authorization` header and attaches
`req.user`. `middleware/role.middleware.js` exports `requireRole(...roles)` for route-level
authorization. The login (`JwtTokenService` in `@earthcation/security`) signs `{ id, username, role }` — note `username` in that payload
is actually the user's **cédula**, not a chosen username.

### Data model essentials (see `../../project-context.md` §2 for full detail)

- `User` — login is by `cedula`, not username. `role` enum: `player` | `instructor` | `admin`.
- Nothing is ever hard-deleted. `User`, `Organization`, `Location` all use `is_active: false` to
  soft-disable while preserving referential integrity with historical progress data.
- `email` is **intentionally not unique** — many bulk-imported mine workers share the company's
  email because they never registered a personal one. `cedula` is the real unique identity.
- `VarkResult` is **upserted** per user — resubmitting the VARK test overwrites the previous result,
  there is no history of past attempts.
- `TrainingSession.code` is a **3-digit numeric** room code (`model/src/sessions/Room.ts#roomCode`), easy to
  read/dictate in a classroom. Retry-until-unique only checks against non-`finished` sessions
  (`CreateRoomUseCase#freeCode`) — a finished session frees its code, needed since 3 digits
  only gives 1000 combinations. Uniqueness is a **partial unique index** `training_sessions_code_live`
  (non-finished sessions only, created in `scripts/dbMaintenance.js`), and `joinSession` prefers the
  live session for a reused code. `GET /api/sessions/code/:code` (any logged-in user) returns the live
  session (name, instructor) without enrolling — used by the game when the code comes from a QR.
- `UserRiskProgress.session_id` / `LevelAttempt.session_id`: when the game sends none,
  `FreePlaySessions`/`SequelizeFreePlaySessions` assigns the **"Juego libre" session** (`TrainingSession.is_free_play`) of the
  player's profile location (a global one if the player has no location) and enrolls the player. Free sessions
  have no instructor or code, are always `active` (start/end return 400), are listed for admins and, in
  `/api/sessions/mine`, for instructors of the same location. `instructor_id`/`location_id` are nullable;
  `index.js` drops their NOT NULL explicitly after `sync` because `alter` does not do it for FK columns.
  Old rows with a null session were left as they were.
- Instructor access: `GET /:id/progress/admin`, `/:id/participants/:userId/analysis` and
  `/:id/export.xlsx` allow `instructor` too, guarded by `assertCanView` in `usecase/src/sessions/rooms/assertCanView.ts` (admin: all;
  instructor: own rooms + the "Juego libre" session of their profile location; else 403).
- `GET /api/users/:id/sessions` (new) — a user's `SessionUser` enrollment history with the joined
  `TrainingSession`, used by the frontend's player detail page.
- `GET /api/analytics/overview` (`SequelizeAnalyticsReadModel.ts#overview`, sequelize-repository) also returns `riesgos_mas_fallados` (top failed risks by fail
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

`model/src/identity/bulk-import/` (`AnmSheet`, `PlaceMatcher`), `usecase/src/identity/bulk-import/`, routes in rest-api `routes/identity.routes.ts`, mounted at
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

### Municipios catalog (`@earthcation/geo-catalog`: `src/data/colombia-municipios.json`; `SeedPlaceCatalogUseCase`)

Closed catalog of 33 departments / 1104 municipios (open dataset, DANE-based, with a manual fix
promoting Bogotá to its own department "Bogotá D.C." instead of a Cundinamarca municipality).
Seeded idempotently on every boot (`boot.ts#prepareDatabase`, after the migrations) — safe to re-run, only
inserts rows that don't already exist by normalized municipality+department match. Added to fix a
real production issue: `locations` had accumulated 3 separate rows for "Norte de Santander" from
free-text Excel imports ("Norte de Santander" / "NORTE DE SANTANDER" / "Norte de Santender").

`PlaceMatcher#query` (`model/src/identity/bulk-import/PlaceMatcher.ts`) matches the Excel's free-text municipio/
departamento against this catalog first (normalized + Levenshtein distance ≤2 for typo tolerance,
`DEPT_ALIASES` for common abbreviations like "Bogota" → "Bogotá D.C."), falling back to
create-if-no-match (marked `location_no_match` in the response so the admin can review it in the
frontend's bulk-import preview) only when nothing in the catalog is close enough.

### Session detail for the admin panel (`model/src/sessions/detail.ts`, `analysis.ts`)

- `GET /api/sessions/:id/progress/admin` (`GetRoomDetailUseCase` → `SequelizeSessionDetailReader` → `sessionDetail()`)
  — **3 queries total** (session+participants, all `UserRiskProgress` of the session, all `LevelAttempt` of the
  session), grouped in memory by `user_id`. It used to do one query per participant. Response keeps the old
  per-participant fields (`total_attempts`, `mitigated`, `percentage`, `avg_reaction_ms`,
  `by_level`) and adds `band`, `risks`, `weakest_risk`, `telemetry` (attempt totals, per-level
  summary, `journeys` = attempt-by-attempt outcomes per level), plus top-level `summary`, `risks`
  (per-risk session stats with `fail_rate`), `levels`, `fail_reasons`. The raw `progress` array is
  no longer returned.
- `performanceBand(pct, hasData)` — `destacado` ≥80 · `en_progreso` 40–79 · `refuerzo` <40 ·
  `sin_datos`. The frontend (`modules/admin/sessions/bands.js`) and the Excel export use the same
  cut-offs — change them together.
- `GET /api/sessions/:id/participants/:userId/analysis` (`GetParticipantAnalysisUseCase`) — one
  participant's session-scoped data + group averages for comparison (`group`), summed `summary`
  counters, event counts, panel reading time, and prev/next navigation. Reuses the same cached
  `SequelizeSessionDetailReader#read` as the detail above (not a use-case-to-use-case call: the cache key is shared).
- `GET /api/sessions/:id/export.xlsx` (`model/src/sessions/report.ts` rows + `@earthcation/excel`'s
  `ExcelSessionReportWriter`, **ExcelJS**, not `xlsx` — SheetJS CE can't style cells) — sheets Resumen / Participantes /
  Riesgos de la sesión / Resultados por riesgo / Intentos por nivel, branded header row, frozen header, autofilter,
  tinted result cells. Dates are written in Colombia local time (UTC−5) since Excel has no
  timezone. Spanish labels for game enums live in `model/src/sessions/labels.ts`.
- `model/src/learning/summaries.ts` (`@earthcation/model`) exports the pure aggregators `summarizeAttempts` / `summarizeRisks`
  (used by learning's use cases and the session service) — don't duplicate those loops.

### Analytics — mines map (`GET /api/analytics/map`)

`SequelizeAnalyticsReadModel.ts#minesMap` (sequelize-repository) powers the frontend's Leaflet map of mining units. `Organization`
has no `location_id` of its own — each org's location is inferred as the most frequent
municipality/department among its active players' `UserProfile.location`. Returns one row per
organization with `municipality`/`department`/`player_count`/`percentage` (mitigation rate,
computed the same way as `getByOrganization`).

### Schema management

**Versioned migrations with Umzug (since fase 3).** `src/infrastructure/migrations/index.ts` runs the pending
migrations on boot (`boot.ts#prepareDatabase`) and records them in `schema_migrations`. `sync({ alter: true })`
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

### Success percentages = latest attempt (`model/src/learning/attempts.ts`)

Every success % (analytics overview/by level/by organization/by location, mines map, session
participants, `GET /api/progress/level/:levelId`) uses only the **latest attempt of each player in each
level** (`level_attempts`, via `user_risk_progress.attempt_id`). Retrying replaces the %, it does
not average with older tries. Rows without `attempt_id` are grouped per session + day.
`riesgos_mas_fallados` and `tendencia_temporal` still use the full history on purpose (difficulty /
trend). The frontend mirrors this in `earthcation_fe/src/lib/attempts.js`.

### Mines map coordinates (`@earthcation/geo-catalog`'s `DivipolaCoordinates`)

`geo-catalog/src/data/colombia-municipios-coords.json` is DANE DIVIPOLA with lat/lng (datos.gov.co dataset
`gdxc-w37w`). `DivipolaCoordinates#locate(municipality, department)` matches catalog names tolerant to accents,
articles and official vs popular names (1104 of the 1105 catalog municipios resolve); unmatched
ones fall back to the department capital (`exact: false`). `GET /api/analytics/map`
returns `lat`, `lng`, `location_exact` and `results` per organization.

### Known gaps (don't "fix" without being asked — these are accepted current state)

- No pagination on any `findAll` list endpoint.
- No validation library (Joi/Zod/express-validator) — validation is manual/inline in controllers.
- `forgot-password` always returns the same response regardless of whether the email/cédula exists
  (intentional anti-enumeration behavior — don't "simplify" this into a conditional response).

### Admin-created users

`POST /api/users` (`User.register` in `model/src/identity/User.ts`) normalizes `''` → `null` for optional fields (an empty email used to fail
`isEmail`, an empty age broke the INTEGER column), defaults `username` to the cédula, and requires
email only for `instructor`/`admin`. **Players never get the welcome email.** If the email send
fails for staff, the user is still created and the response says `email_sent: false` instead of
a 500 (which used to make the admin retry and hit "cédula ya registrada"). `update` returns 409 on
duplicate cédula/username and creates the `UserProfile` row if it's missing.

Admins never set a password when creating a user (`POST /api/users`, single-create) — this still
matters for `admin`/`instructor` accounts, which log in through the web panel and do need a real
password. The service generates a secure random password, creates a reset token (SHA-256 hash,
15-min expiry), and emails the temporary password + set-password link via Resend
(`@earthcation/resend-mailer`). Bulk-imported `player` accounts (see above) skip the email entirely — a
generated password is stored but never surfaced, since players never need one.

### Concurrency & performance (built for ~50 players per session)

- **Pool**: Sequelize `max 20, min 2` (`DB_POOL_MAX/MIN`); the default 5 queued requests.
- **Indexes**: `src/scripts/dbMaintenance.js` (run on every boot, idempotent) creates the indexes the
  write tables lacked (`level_attempts(session_id)`, `(user_id, level_key)`, `user_risk_progress`
  by session/user/attempt/recorded_at, `game_events(created_at)`) and drops the free-session NOT NULLs.
- **Redis optional** (`@earthcation/redis-cache`, `REDIS_URL`; copied from gameploy): without it every
  user falls back to memory. `RedisCache` `remember(ns, key, ttl, fn)` / `bump(ns)`
  (versioned keys). Cached: session detail (`sessions` context) 10 s per session (bumped on
  start/end), analytics overview and mines map 60 s, a player's free session 10 min, level ids 1 h.
- **Rate limits** (rest-api `middlewares/rateLimit.ts`, counters in Redis via `RedisWindowCounter` when there is
  one, `RATE_LIMIT_*` in `config/env.ts`): requests with a token count **per user**
  (1500/15 min), anonymous ones per visitor IP (3000) — a whole classroom shares one public IP.
  Login/forgot-password 300/15 min per IP. Visitor IP behind Cloudflare: rest-api `middlewares/cloudflare.ts`.
- `trust proxy`, `compression`, `ALLOWED_ORIGINS` accepts a comma-separated list.
- **Health**: `GET /api/health` (public, minimal) and `GET /api/health/details` (DB/Redis ping, pool,
  p50/p95 and errors per route over 15 min from `@earthcation/in-memory-metrics`, in memory).
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

### Game deployment (`/api/deploy/*`, `model/src/deployment` + `usecase/src/deployment`, admin + developer)

`GameVersion` (status `uploading → processing → ready | failed`) + `GameSetting` key
`active_version_id` (single pointer, changed in a transaction). Flow: `POST /versions` creates the row and
returns where to `PUT` the ZIP (S3 presigned URL, or `/versions/:id/upload` through the API when there is
no S3) → `POST /versions/:id/complete` (atomic `uploading|failed → processing`) queues the publish
(in-process, one at a time): unzip (`BuildInspection.inspect`, same rules as the panel's `buildCheck.js`), upload each
file to `builds/<id>/` with `BuildInspection.headersFor` (`x.wasm.br` = `application/wasm` + `Content-Encoding: br`,
everything immutable except `index.html`) → `ready` with `manifest` (files, compression, Unity
`productVersion`, warnings). `POST /:id/activate` writes `current.json` (read by the Worker) inside the
transaction; rollback = activate an older one. `GET /:id/preview` = `<PLAY_URL>/v/<id>/?t=<exp>.<hmac>`
(`PLAY_SIGNING_SECRET`, shared with the Worker). On boot, `processing` rows become `failed` (retryable).
Storage (`infrastructure/driven-adapters/object-storage`, configured from `config/env.ts`): originals in AWS S3 (`AWS_S3_BUCKET`, `AWS_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; bucket CORS must allow PUT from the panel) and published
files in Cloudflare R2 (`R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). Without
them each falls back to disk (`DEPLOY_LOCAL_DIR`, default `.deploy/`, gitignored) and the API serves the
published game at `/play-local/` (mounted before helmet, no token check) — dev only. `DEPLOY_MAX_MB` (500).

### Visits & login locations (`model/src/observability`, `usecase/src/observability`)

`POST /api/visits/ingest` (no token; header `x-ingest-secret` = `VISITS_INGEST_SECRET`, shared with the
Worker; mounted **before** the global rate limit since every visit comes from Cloudflare's IPs) stores a
`GameVisit` per opening of the live game: Cloudflare country/region/city/colo/coordinates, device/OS/browser
(`UserAgent.ts`), version, `session_code` when it came from a room QR. `visitor` is the Worker's
`HMAC(VISIT_SALT, ip)` — no IP is stored; `is_unique` = first opening of that visitor in 30 min
(`setIfAbsent`). Successful logins write a `LoginEvent` (role, `cf-ipcountry`/`cf-region`/`cf-ipcity`
— trusted only when `req.ip` is Cloudflare; region/city need the zone's "Add visitor location headers"
managed transform) without blocking the response. `GET /api/visits/stats?days=7|30|90` (admin,
developer) aggregates everything, cached 60 s.
- **Trusting `cf-*` headers**: behind Railway, `req.ip` is not reliably a Cloudflare address. A zone Transform
  Rule (`http_request_late_transform`, host `api-earthcation.saimers.dev`) sets `x-earthcation-edge` to
  `CF_EDGE_SECRET`; rest-api `cloudflareEdge(secret).fromCloudflare(req)` checks it (falls back to `isCloudflare(req.ip)`).
  Node reads headers as latin1 and Cloudflare sends `cf-ipcity`/`cf-region` in UTF-8 → `utf8Header()`;
  " Department" is stripped from Colombian region names.
- **Bots**: visits with a bot user-agent or from a datacenter network (`as_organization` from the Worker, e.g.
  OVH/Hetzner/AWS — certificate-transparency scanners arrive with a fake Chrome UA) are stored with
  `is_bot = true` and excluded from `/api/visits/stats` (`totals.bots` = how many were dropped).

### Security hardening (2026-10-19, fase 0)

- `PUT /api/users/:id` (any logged-in user, for their own record): non-admins can only change `first_name`,
  `last_name`, `age`, `email`; `role`, `cedula`, `username`, `organization_id`, `location_id` are silently
  ignored (before, a player could send `{role:'admin'}`). Admins keep the full field list.
- Login limits (rest-api `middlewares/rateLimit.ts`, mounted on `/api/auth/login` after the auth limiter):
  `loginCedulaLimiter` 10 failed attempts / 15 min per SHA-256 of the cédula (`skipSuccessfulRequests`);
  `loginIpFailLimiter` 60 / 15 min per IP counting **only cédulas that don't exist** (`skip` = cédula exists),
  so a classroom's typos never lock out players with valid cédulas. Env: `RATE_LIMIT_LOGIN_CEDULA_MAX`,
  `RATE_LIMIT_LOGIN_IP_FAIL_MAX`. Verified: 50 valid logins from one blocked IP all 200.
- Error handler: 5xx answer `{ error: 'Error interno del servidor' }` (stack only in logs); 4xx keep their message.
- JWT: `HS256` pinned on sign and verify; boot exits if `JWT_SECRET` is missing or shorter than 32 chars.
