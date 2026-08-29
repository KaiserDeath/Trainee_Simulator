# Trez Training Hub Milestone 1 foundation status

Status date: 2026-08-21.

## Implemented locally

- Additive provider-neutral identity and role-label records.
- Course, module, activity, prerequisite, enrolment, module progress, module
  attempt, activity attempt, idempotency, evidence, and artifact records.
- Append-only evidence and artifact protection.
- Service-role-only transactional activity start/completion RPCs with ownership,
  active-enrolment, prerequisite, idempotency, and concurrency controls.
- Draft, provisional, non-scored Module 1 and Module 2 content. Module 2 depends
  on Module 1; no pass threshold, retry policy, credential rule, financial rule,
  or escalation rule is encoded.
- Supabase Auth integration using username/password login, server-held
  access/refresh cookies, exact-origin and CSRF checks, database-held roles,
  deactivation, and logout. Missing configuration remains fail-closed.
- ADMIN account creation generates `Jperez`-style usernames with numeric
  collision suffixes and sets the initial password to the final username.
  POSTULANTE password changes/resets are unavailable; staff may self-change and
  ADMIN may reset another staff account to its username.
- TRAINER and RRHH have global Postulante visibility and management, including
  creation, profile update, deactivation, and course assignment.
- Governance records and APIs for a two-year attempt-retention date and content
  versions that require approval by an administrator other than the author.
- English-only POSTULANTE locale policy, English/Spanish TRAINER, ADMIN, and RRHH
  policy/content-version storage, and an English/Spanish
  administrator/RRHH progress shell.
- Service-role-backed, `RRHH`-only read endpoints for the paged Postulante
  directory, per-Postulante module completion and attempt summaries, sanitized Hub
  attempt evidence/artifacts, and sanitized legacy simulator operations/action
  logs. Database role assignments keep `RRHH` and `POSTULANTE` exclusive from
  every other role.
- Explicit legacy lineage through `hub_attempts.legacy_trainee_session_id` only.
  Unlinked Hub attempts and legacy simulator sessions remain visibly unlinked;
  no display-name matching is used. Recursive projections remove raw payload
  aliases and password-, token-, secret-, cookie-, and authorization-like data.
- Feature-flagged `/hub` shell with assigned path, prerequisites, progress,
  article/checklist activities, provisional labeling, and safe unavailable
  states. Existing simulator routes and mocked browser tests remain intact.
- Real local verification proving Module 1/2 assignment, completion, persistence
  after server recreation and a second HTTP client, and reporting through an
  explicit test-only trainer visibility fixture.
- A separate guarded real-local Auth/governance verification runner. It creates
  and removes reserved-prefix fixtures; the runtime application has no public
  first-ADMIN or self-registration route. The runner also races exclusive-role
  assignment and POSTULANTE/non-English locale writes to verify the database cannot persist
  either prohibited combination.

## Verified locally

Run:

```powershell
npm run local:reset
npm run verify:local:data
npm run verify:local:hub
npm run verify:local:hub:auth
npm run verify:foundation
$env:TREZ_LOCAL_E2E = '1'
npm run test:e2e:local
Remove-Item Env:TREZ_LOCAL_E2E
```

Stop any separately running backend before `local:reset` or the E2E command.
The local stack remains subject to Windows Docker Desktop's broad port
publication; use it only on a trusted local network. No host-firewall change is
made by the repository.

## Decisions approved on 2026-08-21

- Supabase Auth with username/password; TRAINER/RRHH create Postulantes and
  ADMIN creates TRAINER accounts.
- HTTP-only cookie sessions with CSRF protection.
- ADMIN, TRAINER, POSTULANTE, and RRHH roles as recorded in ADR 0001.
- TRAINER and RRHH see and manage all Postulantes and assign courses.
- ADMIN's account screen creates TRAINER accounts and retains staff debugging/reset controls. Staff may change
  their own password; POSTULANTE reset/change is unavailable.
- Content requires an author and a different approving ADMIN.
- Attempts, evidence, reports, and audit records are retained for two years.
- POSTULANTE content is English only. TRAINER, ADMIN, and RRHH support English
  and Spanish.
- RRHH reads every Postulante's module-completion status plus sanitized original
  simulator operation/failure evidence through GET-only reporting routes; its
  mutations are limited to the approved Postulante-management/course-assignment surface.
- Legacy simulator sessions without an explicit Hub attempt link remain
  unlinked; trainee names are never used to infer identity lineage.
- Current environment URLs are used for local development; hosted URLs remain
  an explicit deployment input.

The Auth/governance runner requires local Supabase and a free port `8080`. It
uses generated local usernames and hidden internal Supabase Auth identifiers,
and sources all Supabase values from `supabase status -o env`. The command
existing here is not itself a claim that a hosted environment has passed the gate. RRHH API
characterization covers its four read routes, pagination, authorization,
mutation denial, explicit lineage, and recursive evidence redaction. This is not
a claim that a hosted deployment is complete.

## Remaining production-readiness work

Milestone 1 is not an approved production launch. Remaining work includes:

- Define and verify the operational deletion process after the approved
  two-year retention date without weakening immutable evidence beforehand.
- Build the remaining POSTULANTE curriculum and complete bilingual TRAINER and
  ADMIN content-authoring interfaces.
- Supply and authorize hosted HTTPS frontend/API origins, monitoring, and secure
  deployment configuration.
- Approve and execute a controlled hosted first-ADMIN provisioning
  procedure; the local integration-only bootstrap is not a production path.
- Complete the security, recovery, accessibility, and deployment acceptance
  gates required by the development plan.

The configured local Hub uses the implemented Supabase Auth boundary. An
environment missing the required Auth URLs/key still returns `503` rather than
accepting a fallback identity. The prototype trainer-password flow is not Hub
authentication. Hosted Supabase has not been migrated or mutated.

## Subsequent Milestone 2 scaffold (2026-08-24)

The same uncommitted local tree now also contains the guarded, policy-neutral
Modules 3–4 scaffold documented in
`docs/TREZ_TRAINING_HUB_MILESTONE2_STATUS.md`. This does not change the Milestone
1 acceptance claim and does not claim that the Module 3–4 vertical slice is
complete.
