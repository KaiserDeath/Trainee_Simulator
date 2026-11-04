# Local setup and verification

This is the executable simulator and locally configured Training Hub foundation.
Shared-rule parity, database safety, real disposable-PostgreSQL integration,
browser smoke coverage, local Hub persistence/RBAC, and a guarded real local
Supabase Auth/governance gate now exist.

## Prerequisites

- Node.js 20.19.x or 22.12 and newer (the range required by the current Vite dependency).
- npm with lockfile support.
- Docker Desktop running when using the isolated local Supabase stack.
- Backend environment values in ignored `backend/.env.local`, `backend/.env`, or
  the process environment when starting the API:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `HUB_PUBLIC_BACKEND_URL`
  - `CLIENT_URL`
  - `HUB_COOKIE_SECURE` (`0` only for local HTTP; production always uses secure cookies)
- Frontend environment values:
  - `VITE_API_URL`
  - `VITE_TREZ_HUB_ENABLED=true` to expose the Hub route

Never place real credentials in committed files or test fixtures.

### Hosted browser authentication

Production browser requests use relative `/api` URLs. `frontend/vercel.json`
forwards these requests to the Render backend before applying the SPA fallback.
Keep that rewrite destination aligned with the backend when moving hosts.
`VITE_API_URL` selects the backend only in development; a hosted Render URL in
that variable does not override the production same-origin route.

The backend `CLIENT_URL` must equal the public frontend origin so CSRF origin
checks pass. Keep production secure, HttpOnly session cookies and SameSite=Lax.
Do not call the Render origin directly from the browser: Vercel and Render are
different sites, so those cookies would not accompany cross-site API calls.
The app no longer opens an unused Socket.IO connection on simulator pages;
Trainer review remains a manual snapshot workflow.

Run `npm --prefix frontend run test:production:auth` to build the frontend and
verify cookie-backed login and reload against an isolated same-origin fixture.
This supplements the development browser suite; verify the deployed rewrite
and real Auth separately after deployment.

### Durable worker scheduling

Apply `20261103190000_simulation_worker_next_wake.sql` before deploying the
worker scheduling update. Empty queues back off from 1 second to a maximum of
30 seconds. Two RPCs are issued per empty check (claim and scalar next due
timestamp), rather than one claim every second. When jobs exist, the next due
time or lease expiry controls the next check, bounded at 30 seconds.

Session creation wakes the worker in the same API process immediately after
its schedule is committed. A separately hosted worker or another API instance
discovers new work within the 30-second idle interval, plus request time.
The timer waits after each completed check, so requests do not overlap.
Failures back off; in-flight work retains its heartbeat and fenced delivery.
Stopping prevents new polls while allowing the current job to finish.

`npm run verify:local:worker` tests due times, leased-job recovery and permissions
inside a rolled-back transaction on the fixed local database container.

### Statistics bandwidth

Apply `20261103193000_operation_time_statistics.sql` before deploying the backend
statistics change. The statistics route now calls the service-role-only
`trainer_operation_time_stats` RPC once. PostgreSQL returns counts, sums and
extrema by operation and session instead of individual operation rows. The
backend preserves the existing response shape, sorting and JavaScript rounding.
Successful responses include `X-Trez-Statistics-Source: postgres-aggregate` for
deployment verification and `Cache-Control: private, no-store` for report privacy.
Missing RPCs or query failures fail the request; there is no expensive fallback
to downloading historical rows. Trainer refresh stays manual.

`npm run verify:local:stats` uses only the fixed local Supabase database container,
creates fixtures inside a transaction and rolls them back. It compares results
against the frozen pre-change calculation, covers more than 1,000 operations and
more than 1,000 sessions, and verifies RPC permissions. Its byte comparison is
fixture-specific, not a measurement of daily Supabase billed egress. Summaries
still grow with session/type count; a history of one operation per session can
benefit less than a dense session history.

## Fresh setup

From the repository root:

```powershell
npm run setup
```

This runs lockfile-exact installs for the pinned Supabase CLI, `backend`,
`frontend`, and `shared/account-id-rules`.

Install the Playwright Chromium runtime once per machine or cache:

```powershell
npm run setup:browser
```

## Start the isolated local stack

From the repository root:

```powershell
npm run local:start
```

The first run downloads the local Supabase Docker images. The command applies
the prototype baseline, copies and applies the canonical Milestone 0 migration,
applies the Hub foundation and authentication/governance migrations, applies
service-role-only database grants, seeds adjustable prototype runtime settings
and provisional Hub course content through Module 11, and writes ignored `backend/.env.local` and
`frontend/.env.local` files. Modules 3–4 remain blocked at their unapproved
policy and server-artifact boundaries. The generated Express configuration binds the API
to `127.0.0.1`, enables the Hub flag, and uses only credentials reported by the
named local Supabase stack. It does not read or modify the hosted project.

On this Windows Docker Desktop installation, published Supabase ports may appear
as all-interface listeners even though the CLI reports loopback URLs. Use the
stack only on a trusted local network; do not expose these ports publicly. A
host-firewall change is deliberately outside this repository setup.

Local services include:

- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Express API after startup: `http://localhost:8080`
- Vite frontend after startup: `http://localhost:5173`

Use two terminals from the repository root:

```powershell
npm run dev:backend
```

```powershell
$env:VITE_TREZ_HUB_ENABLED = 'true'
npm --prefix frontend run dev -- --host localhost --port 5173
```

The frontend defaults to Vite's local URL. The backend health endpoint is `GET /health` on the configured API port.

Reset only the isolated local data and rerun all migrations:

```powershell
npm run local:reset
```

Stop the backend process before a reset, then start it again afterward. This
prevents an in-memory GameMaster timer from polling a session that the reset
has intentionally removed.

Create or reconcile the repeatable local ADMIN after every reset:

```powershell
npm run local:bootstrap:admin
```

The local-only login is `Ladmin` with password `Ladmin`. The bootstrap command
fails closed unless every Supabase URL is loopback and the local CLI reports an
unlinked project.

Verify the implemented seed, wallet, queue, reservation, and history invariants
directly against the running local stack:

```powershell
npm run verify:local:data
```

The checked local seed has 40 customers per fresh session: 26 have one account
in each game and 14 intentionally have no game accounts. Generated Create
Account operations select a customer/game pair without an account and use the
customer's Backend username. This is an operation-model rule, not a global
database uniqueness rule: free simulator screens may still create valid accounts
with their own entered values.

For Add Credits and Withdraw Credits, Backend confirmation is required before
settlement. A cancellation requires a reason, stored as `cancellation_reason`;
the current scoring implementation does not evaluate that reason. The verifier
also checks that Backend settlement writes only customer movement history and
does not duplicate the game-side transaction.

Verify the additive Hub schema and API against the same real local stack:

```powershell
npm run verify:local:hub
```

This command also fails closed unless the Supabase API, PostgreSQL, backend,
frontend, and client URLs are `localhost` or `127.0.0.1`. It sources local keys
only from `supabase status -o env`, injects a verifier only into the test-created
Express app, and never creates an authentication bypass in the default app.

The gate assigns the provisional Module 1–4 course to two fixture Postulantes,
checks browser-role database denials, the full prerequisite chain, Module 1/2
completion, rejection of forged policy/artifact completion state in Module 3,
Module 4 prerequisite locking, role and direct-object isolation, idempotent
replay/conflict, concurrent starts, withdrawn enrolments,
restart/second-client persistence, and trainer reporting through an explicit
test-only visibility resolver. Its guarded cleanup targets only identity
subjects beginning with `__TREZ_HUB_LOCAL__:` in the named local Supabase Docker
database. Because evidence is append-only, cleanup uses the local PostgreSQL
container as superuser for that exact fixture prefix, then verifies that zero
fixture identities remain.

Verify the implemented Supabase Auth and governance boundary against the real
local stack:

```powershell
npm run verify:local:hub:auth
```

Run this with local Supabase running and with no separate backend listening on
port `8080`. The runner reads `ANON_KEY`, `API_URL`, `DB_URL`, and
`SERVICE_ROLE_KEY` only from `supabase status -o env`, then applies the same
loopback-only guard used by the real local E2E tooling. It starts an in-process
Express server at `127.0.0.1:8080`; no browser receives the service-role key.

The gate creates reserved-prefix test accounts directly through the ADMIN account
API and authenticates them by username/password. Cleanup runs after success or
failure and removes only the gate's reserved local username/internal-auth prefix.
There is no public bootstrap or self-registration endpoint. A hosted first-ADMIN
provisioning runbook remains an explicit deployment requirement.

The authentication gate covers:

- canonical generated usernames and case-sensitive passwords, including
  `Jperez`, collision suffixes, and generic login failure responses;
- Supabase access and refresh tokens held in `HttpOnly`, `SameSite=Lax` cookies;
- exact-origin checks and a separate `x-trez-csrf` header/cookie token for
  `POST`, `PUT`, `PATCH`, and `DELETE` Hub requests;
- server-derived `ADMIN`, `TRAINER`, `POSTULANTE`, and `RRHH` roles,
  all-Postulante TRAINER/RRHH visibility and course assignment,
  deactivation, logout, and rejection of browser-supplied role claims;
- staff self-password changes, ADMIN reset of another staff account to its
  username, and denial of every POSTULANTE password change/reset;
- database serialization that keeps RRHH and POSTULANTE exclusive from other
  roles, and prevents a POSTULANTE identity from
  retaining a non-English locale, including concurrent write attempts;
- a two-year `retention_until` value on a completed Hub attempt;
- content submission followed by approval from a different administrator, with
  self-approval rejected.

The current language boundary is narrower than a translated product UI.
POSTULANTE learning content and locale are English only. TRAINER, ADMIN, and
RRHH experiences are approved for English and Spanish; identity
and content-version storage support both locale codes. The implemented progress
shell can switch trainer and administrator experiences between English and
Spanish without translating server-authored course titles. Content-authoring
and account-administration surfaces are not all complete.

### RRHH acceptance boundary

The approved RRHH reporting role is global and read-only for persisted Hub
module-completion status and original simulator operation/failure evidence.
Separately, both TRAINER and RRHH can manage every Postulante: create, edit,
deactivate, and assign courses. Neither role may perform a Postulante attempt or
mutate the reported simulator/evidence records.

The implemented RRHH API exposes only these `GET` routes:

- `/api/hub/rrhh/overview`, with independent `postulanteCursor` and
  `sessionCursor` pagination;
- `/api/hub/rrhh/postulantes/:identityId/learning-records`, with independent
  `moduleCursor` and `attemptCursor` pagination;
- `/api/hub/rrhh/hub-attempts/:attemptId`, with independent
  `activityCursor`, `evidenceCursor`, and `artifactCursor` pagination; and
- `/api/hub/rrhh/simulator-sessions/:sessionId`, with independent
  `operationCursor` and `actionCursor` pagination.

Each response collection uses a shared `limit` that defaults to 50 and fails
closed outside 1 through 100. These four RRHH reporting routes never mutate.
The separate `/staff/postulantes` and course-enrolment routes allow only the
approved Postulante-management changes. The current automated acceptance tests cover
cross-role read denial, RRHH mutation denial, deactivated-Postulante visibility,
independent pagination, same-name non-linkage, and adversarial recursive
redaction. Browser acceptance tests cover the read-only RRHH overview and
bounded drill-downs without issuing mutation requests. The Auth/governance local
gate separately exercises the database role and locale concurrency invariants.

Identity lineage must come only from the explicit nullable
`hub_attempts.legacy_trainee_session_id` foreign key. A Hub attempt with no link
and a legacy session referenced by no attempt remain visibly unlinked. Do not
compare `trainee_sessions.trainee_name` with Hub identity/display-name fields or
backfill a relationship from text similarity.

RRHH responses are projections, not raw database rows. Preserve operation
status, correctness, timing, validation outcomes, and useful failure points, but
recursively remove raw request payload aliases and token-, secret-, cookie-,
authorization-, and password-like fields from activity state, evidence,
artifacts, action logs, and operation data. Password validation may expose only
`passwordProvided` or `Provided`/`Missing`, never a submitted or stored literal.

Inspect or stop the local stack with `npm run local:status` and
`npm run local:stop`. Local SMTP capture, URLs, cookie security override, and the
temporary bootstrap identity are development tooling. The approved product
identity and governance decisions are recorded in ADR 0001.

## Reproducible gates

Run the gates currently available:

```powershell
npm run verify:baseline
```

That command runs, in order:

1. Backend Node characterization tests.
2. Frontend ESLint.
3. Frontend production build.

The individual commands are:

```powershell
npm run test:backend
npm run lint:frontend
npm run build:frontend
```

Run every foundation gate that is currently executable:

```powershell
npm run verify:foundation
```

In addition to the baseline, this runs:

1. Shared Account ID rule parity tests with caller-supplied neutral policies.
2. Disposable-database target, migration-ledger, and read-only inventory safety tests.
3. Playwright smoke checks for the existing landing shell and browser-only name confirmation.
4. Feature-flagged Hub browser checks using mocked server identity/path responses.

`verify:foundation` stays fast and mocked. Run `verify:local:data`,
`verify:local:hub`, and `verify:local:hub:auth` separately when the isolated
Supabase stack is running.

## Hosted authentication configuration boundary

No hosted Supabase project or host firewall is changed by the local commands.
Before a hosted deployment can enable Hub authentication, its operator must
supply and validate all of the following for the same environment:

- backend `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` from that hosted project;
- public HTTPS `HUB_PUBLIC_BACKEND_URL` and `CLIENT_URL` values that are not
  localhost or `127.0.0.1`;
- frontend `VITE_API_URL` pointing to the public API and
  `VITE_TREZ_HUB_ENABLED=true`;
- the exact callback
  `<HUB_PUBLIC_BACKEND_URL>/api/hub/auth/confirm` in the Supabase Auth redirect
  allow-list, plus the intended frontend site URL/origin;
- production email delivery/templates and an authorized first-administrator
  provisioning procedure.

`NODE_ENV=production` rejects local or non-HTTPS frontend/backend URLs and makes
the session cookies secure regardless of `HUB_COOKIE_SECURE`. `CLIENT_URL` is
also the exact allowed origin used by CORS and CSRF validation. Missing Auth
configuration fails closed with `503 HUB_IDENTITY_PROVIDER_UNAVAILABLE`.

## Milestone 0 exit gate

The intended complete gate is:

```powershell
npm run verify:milestone0
```

It requires an explicitly confirmed disposable PostgreSQL target:

```powershell
npm run test:shared
npm run test:database:safety
npm run test:browser
npm run test:database:integration
```

All four commands are implemented. For the local PostgreSQL 18 rehearsal, set
the target and its exact confirmation in the current terminal before running the
gate:

```powershell
$env:TREZ_DISPOSABLE_DATABASE_URL = 'postgresql://postgres:<password>@localhost:5432/trez_training_hub_disposable'
$env:TREZ_DISPOSABLE_DATABASE_CONFIRMATION = 'DISPOSABLE_TEST_DATABASE:localhost:5432/trez_training_hub_disposable'
npm run verify:milestone0
```

The integration runner drops and recreates the target database's `public`
schema. Never point these variables at an application or shared database.

The trainer regression smoke test uses mocked GET responses and asserts that
opening a completed report and audit tab sends no POST or DELETE requests. It
also verifies that unapproved grading is labeled provisional and audit failures
are distinguishable from an empty log.

## Guarded real local Playwright E2E

The mocked browser suite remains the fast default. A separate opt-in gate runs
the full simulator against the isolated local Supabase stack:

```powershell
npm run local:start
$env:TREZ_LOCAL_E2E = '1'
npm run test:e2e:local
Remove-Item Env:TREZ_LOCAL_E2E
```

Stop any separately running backend first. By default the E2E command owns
loopback ports `127.0.0.1:8080` and `127.0.0.1:4173` for the duration of the
run. If `4173` is already used by a local frontend, select another loopback
port without weakening the guard:

```powershell
$env:TREZ_E2E_FRONTEND_URL = 'http://127.0.0.1:4177'
npm run test:e2e:local
Remove-Item Env:TREZ_E2E_FRONTEND_URL
```

The command reads `API_URL`, `DB_URL`, and `SERVICE_ROLE_KEY` only from
`supabase status -o env`; it does not read `backend/.env`, frontend production
settings, or hosted Supabase credentials.

The runner exits before starting a browser unless all of the Supabase API,
PostgreSQL, Express, and Vite URLs resolve to `localhost` or `127.0.0.1`. The
backend receives the local service-role key only in its process environment.
The key is never placed in Vite variables, browser requests, screenshots, or
Playwright traces.

For this gate only, the guarded backend disables GameMaster's random operation
generation. The test creates a trainee session in the browser, then seeds four
deterministic pending operations through `create_reserved_sandbox_operation`.
It covers Add Credits reservation/approval/cancellation, Orion Stars wallet
conservation, separate game and Backend histories, queue uniqueness, completion
without submission, and read-only provisional trainer Report/Audit views.

Global setup and teardown remove only trainee names beginning with the reserved
`__TREZ_LOCAL_E2E__` prefix. Cleanup runs after success or failure and verifies
that zero matching sessions remain. If a run is interrupted outside normal
Playwright teardown, rerunning the command performs guarded stale cleanup before
the next test.

Module 6 Add Credits and Module 7 Withdraw Credits are seeded as provisional,
non-scored focused practices.
Once its prerequisite path is available, it uses the existing reservation RPC
to hold the customer amount, performs one Orion Stars game-side credit, and
requires an explicit approve or cancel decision. The customer balance, game
account credit, and game wallet remain separate. Apply the local migration and
seed with `npm run local:reset`; hosted Supabase is not touched.

Module 7 performs the reverse game-side action: the game account credit
decreases while the independent game wallet increases, then the existing
Backend movement is approved or cancelled once. Its fixture amount is 25 and is
not a business rule.

Module 10 is currently a provisional mixed-operation orientation. The executable
practice remains policy-gated until Trez approves scheduling, difficulty,
timing, remediation, and attempt rules.

## Database safety

Before running a database migration:

1. Inventory the target Supabase/PostgreSQL schema and migration history read-only.
2. Resolve and display the explicit migration target according to the selected runner; do not silently fall back between test and non-test databases.
3. Verify the resolved host/database before mutation.
4. Rehearse planned migrations against a disposable database.
5. Add empty-database and supported-upgrade integration tests.

A test-database setting may isolate integration tests, but it must not be treated as protection for a separate migration command.

The implemented runner uses only `TREZ_DISPOSABLE_DATABASE_URL`, accompanied by an exact host/port/database-bound `TREZ_DISPOSABLE_DATABASE_CONFIRMATION`. It rejects shared PostgreSQL database names and any target matching protected application or migration URLs. Credentials are passed to the `psql` child process without being printed or placed in its command arguments.

Migration `0001_separate_histories_wallets_and_reservations.sql` is part of the
canonical local migration chain for the confirmed simulator invariants. It refuses to run if
an active session has pending operations, while preserving pending evidence in
completed or submitted legacy sessions as policy version 0. PostgreSQL 18 fixture rehearsal is covered by the
integration gate. Do not apply it manually to Supabase or another shared
database; the actual target schema must still be inventoried and an explicit
deployment decision made before applying any equivalent change to a shared or
hosted environment.

## Browser smoke boundary

The current Playwright gate starts Vite on a fixed loopback address, mocks only
its API dependencies, closes Socket.IO connections, and verifies the existing
landing/name-confirmation shell plus the feature-flagged Hub unavailable and
assigned-path states. It does not configure production identity or claim that
Modules 3–4 exist.

To inspect the Hub shell locally, opt in explicitly:

```powershell
$env:VITE_TREZ_HUB_ENABLED = 'true'
npm --prefix frontend run dev -- --host localhost --port 5173
```

After `local:start`, the generated ignored environment files configure local
Supabase Auth and `/hub` offers username/password sign-in. After a reset, run
`npm run local:bootstrap:admin` and sign in as `Ladmin` / `Ladmin`; then use the
ADMIN account screen to create TRAINER accounts. TRAINER and RRHH use Postulante
management to create, edit, deactivate, and assign courses to Postulantes. If the
required Auth environment values are absent, `/hub` shows the fail-closed
unavailable state. The UI provides no fallback password, browser role, or
locally trusted identity.

When Module 4 exists, expand this gate with keyboard-only coverage and observable `Ctrl+F` followed by `Ctrl+V` inside the application-controlled training search.

## Formal assessment browser gate

After starting the named disposable Supabase stack and installing frontend
Chromium (`npm --prefix frontend run test:browser:install`), run
`npm run verify:local:formal-browser`. This starts real Express and Vite servers
on loopback ports 8088 and 4474 and uses real local Auth/database requests.
Run it alone against that stack: it temporarily publishes the seeded local
Orion checkpoint, then restores its exact original draft row and removes its
generated identities, Auth users, courses, attempts, evidence and sandbox worlds.
It refuses non-loopback targets and requires the seeded draft with no policy head.

The gate checks prerequisite denial, correct/incorrect scoring, retry visibility,
manual submission, latest-only submission, automatic third-attempt closure,
fourth-attempt denial, trainer reopening with a reason, preserved old results,
staff evidence/report access, and learner privacy. Start and action replays are
checked for idempotency. The JSON result is written to
`outputs/hub-formal-browser-local.json`; a failed cleanup also fails the command.
CI runs this gate in its disposable database job. These checks do not publish or
certify the four hosted evaluations, which remain subject to content approval.

## Database recovery rehearsal

After `npm run local:start`, run `npm run verify:local:recovery` alone against
the named disposable stack. It accepts no hosted target, environment file or
database argument. It uses the container's local `supabase_admin` role to create
a PostgreSQL custom archive and restore ownership and privileges. Cluster roles
must already exist; it does not export their passwords.

The command restores into a new randomly named database and compares all public
table hashes/counts, Auth users, Storage metadata, functions, triggers,
constraints, indexes, sequences, row security and privileges. Eight transactional
Hub integration suites run against that recovered database. It then creates
retained formal results, lesson snapshots, private coaching revisions and an
Auth credential fixture only in the recovered copy. A second backup/restore must
preserve those records and enforce snapshot immutability and private access.
The source database remains unchanged. Both scratch databases and the archive
are removed, including on a failed run; cleanup failure fails the command.
The sanitized result is `outputs/hub-recovery-local.json`. CI runs this after
other local gates so foreign-key violations left by fixture cleanup are caught.

This is a local logical database recovery rehearsal using the same PostgreSQL
cluster and pre-existing roles. It does not restore Storage file bytes, hosting
configuration/secrets, another PostgreSQL version or a lost Supabase project.
Hosted backup availability, offsite/encrypted copies, retention, recovery time
and full application/file recovery remain separate operational release gates.

## Abandoned private-media maintenance

Uploads must begin within 72 hours of registration. A cleanup worker expires
only old `awaiting_upload` registrations with no current lesson, content-version
or historical lesson-snapshot references. Pending review, published, rejected and
retired assets remain protected. Metadata and append-only cleanup receipts stay
in the database after bytes are removed. This does not dispose of two-year
assessment evidence or coaching records.

Every signed-upload request reserves three hours of protection before signing;
Storage tokens last two hours. The service checks the actual token expiry against
that reservation and refuses delayed tokens that could outlive it. Migration
backfill gives existing registrations three hours of grace. Cleanup locks and
expires the asset before Storage deletion; expired registrations cannot be
completed, signed again or attached to lessons. Completed-upload retries resume
without issuing another upload token.

Production starts one bounded batch (100 registrations maximum) one minute after
backend startup, then daily when idle. Failed/full batches retry after five
minutes. Multiple instances use database leases and stale-token checks. Storage
failure retains a retryable job, and a crash after deletion can safely repeat the
missing-object removal. Sleeping hosting runs maintenance on its next startup;
this is not a guaranteed daily execution SLA. Set
`HUB_MEDIA_CLEANUP_DISABLED=true` to stop automatic scheduling. Already claimed
jobs remain expired and can be resumed safely.

For operations, the backend maintenance command previews by default, using its
configured backend database credentials:

```powershell
npm --prefix backend run maintenance:media
npm --prefix backend run maintenance:media -- --apply --limit=100
```

Output contains counts only. No user-facing HTTP cleanup endpoint is exposed.
`npm run verify:local:media` exercises real private Storage, concurrent leases,
completion racing cleanup, failure/backoff, crash recovery, expired retries and
all reference protections. Its clock-age fixtures and credentials are local-only.

## Shared Account ID rule boundary

`shared/account-id-rules` extracts framework-independent normalization, segmented construction, pattern generation, and answer validation. Policies are supplied by the caller. The package contains no default game catalogue, real initials, family assignments, password rules, or approved scoring formulas.

## Current characterization boundary

The backend tests describe current prototype scoring and request validation. They are deliberately named as characterization tests. They do not approve operation states, account formulas, password policies, financial rules, escalation behavior, or formal Hub scoring.
