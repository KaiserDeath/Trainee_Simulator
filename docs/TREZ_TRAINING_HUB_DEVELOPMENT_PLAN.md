# Trez Training Hub — Development Plan

Status: Proposed for execution approval  
Company: Trez  
Prepared: 2026-08-20  
Primary repository: `C:/Users/OS/PROYECTOS/Simulador-dos`  
Account-structure reference application: `C:/Users/OS/PROYECTOS/Evaluations`

## 1. Objective

Build Trez Training Hub as the central platform for teaching, practicing, and evaluating the operator workflow. The Hub must combine conceptual learning, the Account ID Lab, focused operational exercises, and the existing full simulator without duplicating business rules.

The delivery must preserve the confirmed curriculum:

1. Module 1 — Understanding the Work.
2. Module 2 — Complete Workflow Orientation.
3. Module 3 — Account Creation.
4. Module 4 — Search for Customer.
5. Module 5 — Refresh Balance.
6. Module 6 — Add Credits.
7. Module 7 — Withdraw Credits.
8. Module 8 — Reset Password.
9. Module 9 — Exceptional and Advanced Operations.
10. Module 10 — Mixed-Operation Practice.
11. Module 11 — Final Full-Shift Assessment.

## 2. Delivery principles

- Build one Hub experience with shared authentication, progress, evidence, and reporting.
- Define each business rule once and reference it from learning, practice, simulation, and scoring.
- Keep course progress and assessment evidence durable; keep simulation worlds disposable.
- Preserve the game backoffices' authentic terminology while exposing a standard adapter contract internally.
- Separate demonstration, guided practice, independent practice, and formal assessment.
- Require verification before mutation in every financial or credential workflow.
- Use the player created in Module 3 as the primary search target in Module 4.
- Teach and assess `Ctrl+F` followed by `Ctrl+V` in Module 4; later modules reuse that skill without repeating the full lesson unless remediation is required.
- Do not place unapproved game initials, password rules, or naming formulas in scored exercises.
- Release vertical slices that trainers can validate before expanding to more operations or games.

## 3. Current baseline

### `Simulador-dos`

Useful assets already present:

- React/Vite trainee and trainer interfaces.
- Express API and Socket.IO updates.
- Supabase/PostgreSQL persistence.
- Session-isolated customers, accounts, operations, and histories.
- Orion Stars, Vblink, and Golden Dragon backoffice simulations.
- Create Account, Refresh Balance, Add Credits, Withdraw Credits, and Reset Password prototypes.
- Initial audit, scoring, session reports, and trainer analytics.

Important gaps:

- No Hub, course, module, lesson, enrolment, or prerequisite model.
- Trainer access is protected by a browser-embedded password and local-storage token.
- Trainee identity is a session name rather than an authenticated user.
- Operation and game behavior is hardcoded across services and components.
- Current sessions are oriented toward timed random queues, not guided learning.
- Timers and orchestration are held in the API process and are not restart-safe.
- Account structure and duplicate rules are not enforced by a shared server policy.
- Audit events do not yet prove the complete required workflow.
- There is no automated backend, integration, or browser test suite in the package scripts.

### `Evaluations`

Useful assets already present:

- A working Account ID Lab for three account-structure families.
- Account builder and visible identifier breakdown.
- Game-to-account and account-to-game practice.
- Pattern validation accepting any valid random suffix.
- Unit tests for the current rule engine.

Important gaps:

- The game catalogue is editable in browser local storage.
- Most initials are explicitly documented as working assumptions.
- Scores and streaks are temporary browser state.
- There is no authenticated trainee, Hub progress, attempt, or evidence integration.
- The standalone JavaScript UI cannot directly share React Hub navigation or state.

## 4. Target architecture

Use a modular monolith for the first production version, with a durable background worker for simulation scheduling.

### Repository direction

`Simulador-dos` becomes the Trez Training Hub codebase. The Account ID Lab is integrated as a native Hub activity:

1. Extract the pure account-building and validation logic from `Evaluations/src/rules.js` into a shared, framework-independent package.
2. Add server-owned, versioned account-structure policies.
3. Port the Account ID Lab interface into a React Hub route using the shared package and Hub APIs.
4. Keep the standalone `Evaluations` application unchanged until the Hub version passes parity tests and trainer acceptance.
5. Retire or archive the standalone version only through a separate approved task.

Do not use an uncoordinated iframe for production integration. It would divide authentication, accessibility, navigation, attempt persistence, and evidence capture.

### Logical components

| Component | Responsibility |
| --- | --- |
| Hub web application | Trainee, trainer, and administrator experiences; courses; modules; activities; simulator surfaces |
| Hub API | Authentication context, RBAC, catalogue, enrolment, progress, attempts, policies, evidence, reports |
| Exercise engine | Guided and independent scenarios, step expectations, hints, feedback, and scoring |
| Simulation engine | Disposable sandbox world, mixed queues, game activity, and full-shift scenarios |
| Durable worker | Restart-safe timing, scenario scheduling, expiry, and asynchronous rollups |
| Game adapters | Platform-specific search, balance, account creation, credit, withdrawal, history, and password behavior |
| Policy registry | Versioned operation, capability, game, account-structure, password, and scoring definitions |
| PostgreSQL/Supabase | Authoritative identities, learning state, attempts, evidence, policies, and sandbox records |
| Object/media storage | Videos, images, module resources, and approved downloadable material |

### Core domain records

The detailed schema must be reviewed before migration, but the domain needs these first-class records:

- `users`, `roles`, and `user_roles`.
- `courses`, `modules`, `activities`, and `module_prerequisites`.
- `enrolments` and `module_progress`.
- `attempts` and `activity_attempts`.
- `capability_definitions` and `operation_definitions`.
- `game_families`, `game_platforms`, and `game_capability_support`.
- `account_structure_policies` and `password_policies` with versions and effective dates.
- `scenario_templates` and `scenario_instances`.
- `attempt_artifacts` for outputs carried between modules, including the Module 3 created account.
- `evidence_events` as an append-only assessment trail.
- `score_definitions`, `score_results`, and `trainer_reviews`.
- Existing sandbox tables, linked to the relevant attempt and scenario instance.

Every scored attempt must retain the exact operation, policy, capability, scenario, and scoring versions used when the attempt started.

### Required attempt artifact

Module 3 must publish a durable `CREATED_GAME_ACCOUNT` artifact containing at least:

- Attempt and trainee identifiers.
- Originating Create Account request identifier.
- Customer identifier.
- Company/license and game platform.
- Account-structure policy version.
- Simulated game-account identifier.
- Created username or Mobile ID.
- Creation timestamp and evidence references.

Module 4 consumes this artifact as its expected search target. Modules 5–8 may continue using the same sandbox player when the assigned learning path requires continuity.

## 5. Security and authorization foundation

Security work is a prerequisite, not a final cleanup phase.

- Use authenticated Trez identities or an approved identity provider.
- Implement server-enforced roles for trainee, trainer, administrator, and future auditor.
- Remove the browser-embedded trainer password and local-storage authorization token.
- Authorize every course, attempt, sandbox, evidence, and trainer endpoint by user and role.
- Keep service-role database credentials on the server only.
- Define tenant/company/license visibility rules before real organizational data is introduced.
- Protect credentials and sensitive evidence from logs, browser storage, screenshots, and analytics payloads.
- Apply database constraints and row-level policies where appropriate.
- Record administrative policy changes and trainer overrides in an immutable audit trail.
- Add rate limits, input validation, secure headers, controlled CORS, and dependency scanning.

## 6. Development workstreams

### Workstream A — Product and policy validation

Deliverables:

- Approved platform catalogue and seven family mappings.
- Approved game initials and account-structure rules.
- Approved password policies.
- Operation state, evidence, exception, and final-action definitions.
- Module pass, retry, hint, remediation, and trainer-review rules.
- Training languages and content ownership decision.

Exit gate: no scored scenario uses a working assumption.

### Workstream B — Engineering foundation

Deliverables:

- Workspace conventions and environment templates.
- Repeatable database migration ledger with rollback guidance.
- Automated frontend, backend, shared-rule, integration, and browser test commands.
- Continuous-integration checks for formatting, lint, unit, integration, build, and security.
- Structured logs, request correlation, health/readiness checks, and error handling.
- Local development bootstrap and seeded test environment.

Exit gate: a fresh checkout can be installed, migrated, seeded, tested, built, and started from documented commands.

### Workstream C — Identity and Hub shell

Deliverables:

- Authenticated login and logout.
- Role-based trainee, trainer, and administrator navigation.
- Course catalogue, assigned learning path, module pages, prerequisites, and progress.
- Activity renderer for articles, videos, quizzes, guided exercises, practice, and assessment.
- Trainer view for assignments and learner progress.

Exit gate: a trainee sees only assigned modules and cannot bypass prerequisites; trainers cannot perform trainee attempts.

### Workstream D — Versioned definitions and authoring data

Deliverables:

- Capability-definition schema and API.
- Operation-definition schema and API.
- Account-structure and password-policy registry.
- Scenario-template and scoring-definition schemas.
- Administrative approval and publishing flow, initially developer-managed if a full content-management UI is deferred.
- Immutable version binding at attempt start.

Exit gate: changing a future policy does not alter the interpretation of a completed attempt.

### Workstream E — Exercise, evidence, and scoring engine

Deliverables:

- Demonstration, guided, independent, and assessment modes.
- Scenario instance creation from versioned templates.
- Step expectations, hints, corrections, critical errors, and branching outcomes.
- Append-only evidence capture.
- Deterministic score calculation and readable feedback.
- Attempt lifecycle, retry rules, and completion persistence.
- Trainer evidence timeline and score breakdown.

Exit gate: the same evidence and definition versions always reproduce the same score.

### Workstream F — Game adapter refactor

Deliverables:

- Standard game adapter interface.
- Orion Stars adapter as the first reference implementation.
- Contract tests for search, identity, balance, create, history, refresh, credit, withdrawal, and password capabilities.
- Vblink and Golden Dragon adapters after the reference adapter is accepted.
- Explicit unsupported-capability behavior.
- Expansion path for Game Vault, Game Room, Fortune2Go, and Blue Dragon.

Exit gate: exercise definitions call capabilities without hardcoded component or service branches for the chosen game.

### Workstream G — Durable simulation runtime

Deliverables:

- Durable worker or job queue for timers and scenario events.
- Idempotent session start, stop, expiry, and cleanup.
- Transactional operation processing and duplicate-action protection.
- Restart recovery for active attempts and simulation sessions.
- Strong session isolation and concurrent-trainee tests.
- Retention job that removes disposable sandbox state without removing required evidence.

Exit gate: restarting the API or worker does not lose, duplicate, or incorrectly complete active work.

### Workstream H — Trainer analytics and operations

Deliverables:

- Module completion and assessment dashboards.
- Evidence timeline and critical-error views.
- Operation, game, cohort, and trainee trends.
- Assignment, retry, remediation, and trainer-review controls.
- Export and retention behavior approved by Trez.

Exit gate: trainers can explain why a trainee passed or failed from retained evidence.

## 7. Milestone sequence

Calendar estimates should be assigned only after Trez confirms team size, availability, content ownership, and infrastructure. Execution order and exit gates are defined now.

### Milestone 0 — Decisions and executable baseline

Scope:

- Complete Workstreams A and the minimum of B.
- Approve platform and account policies for the first game family.
- Add automated test entry points around the current simulator.
- Capture current behavior with characterization tests before refactoring.
- Define architecture decision records for authentication, worker, schema, media, and Account ID Lab integration.

Exit criteria:

- Business-rule validation sheet is approved.
- Current critical simulator flows have reproducible tests.
- Fresh local setup and CI are green.
- No production implementation depends on an unresolved naming or password assumption.

### Milestone 1 — Secure Hub foundation

Scope:

- Implement Workstreams C and D foundations.
- Introduce authenticated identities and RBAC.
- Add course/module/activity, enrolment, prerequisite, progress, and attempt models.
- Add versioned definition APIs and an initial developer-managed publishing workflow.
- Preserve existing simulator access behind feature flags during migration.

Exit criteria:

- Module 1 and Module 2 can be assigned, completed, and reported.
- Unauthorized trainee/trainer/admin access is rejected by the API.
- Module progress survives logout, restart, and a second device session.

### Milestone 2 — Modules 3 and 4 vertical slice

Scope:

- Extract and test the Account ID Lab rule package.
- Port the Account ID Lab into the Hub.
- Deliver one approved game-family account-creation policy.
- Refactor one game into the reference adapter.
- Deliver Module 3 Account Creation end to end.
- Publish the created-game-account artifact.
- Deliver Module 4 Search for Customer using that artifact.
- Implement observable `Ctrl+F` then `Ctrl+V` training through an application-controlled search interaction suitable for formal evidence.
- Add trainer evidence and score views for both modules.

Exit criteria:

- A trainee completes Modules 1–4 in order.
- Module 3 uses the same customer, game, license, policy, and request across learning and simulation.
- Module 4 searches for the player created in Module 3 without recreating it.
- The evidence trail proves copy, `Ctrl+F`, `Ctrl+V`, exact query, matched player, and final confirmation.
- Wrong structure, wrong game/license, duplicate creation, wrong player, and wrong Backend completion are detected.
- Refreshing or restarting the app does not break the linked attempt.

### Milestone 3 — Module 5 Refresh Balance

Scope:

- Define the complete Refresh Balance operation and scoring contract.
- Deliver demonstration, guided practice, independent practice, and assessment.
- Support consistent, stale, and unverifiable balance scenarios.
- Validate the selected player's platform and game balances before Backend completion.

Exit criteria:

- The trainee cannot pass by changing or accepting the Backend value without game-side evidence.
- Wrong player/license, incorrect reconciled value, and missing verification are scored correctly.

### Milestone 4 — Modules 6 and 7 financial movements

Scope:

- Deliver Add Credits before Withdraw Credits.
- Add transactional balance mutations and idempotency protection.
- Support not-completed, already-completed, and inconsistent-evidence branches.
- Require pre-action history, exact amount, post-action evidence, and correct Backend decision.
- Extend adapters only after the reference game passes acceptance.

Exit criteria:

- Duplicate credits or withdrawals are prevented and treated as critical errors.
- Balance conservation rules hold across customer and game balances.
- Concurrent submissions cannot process the same movement twice.
- Trainers can distinguish decision errors from navigation or timing errors.

### Milestone 5 — Module 8 Reset Password

Scope:

- Add versioned password policies per platform.
- Deliver guided and assessed reset workflows.
- Protect generated or entered passwords from ordinary logs and analytics.
- Verify correct account, allowed state, successful change, and Backend completion.

Exit criteria:

- Passwords are never exposed in evidence payloads, reports, or client persistence beyond approved display behavior.
- Wrong-account resets and policy violations are prevented and scored.

### Milestone 6 — Module 9 advanced operations

Scope:

- Implement only the exceptions and advanced workflows approved by Trez.
- Include inconsistent histories, ambiguous matches, unavailable game access, stale `Bot` processing, escalation, cancellation, and retry rules as confirmed.
- Add Purchases or Cashouts only if their learning and simulation boundaries are formally approved.

Exit criteria:

- Every advanced scenario has a defined safe outcome.
- The trainee can succeed by refusing to mutate state when evidence is insufficient.
- No scenario invents an escalation or financial rule absent from Trez policy.

### Milestone 7 — Modules 10 and 11

Scope:

- Deliver mixed-operation practice with controlled difficulty and optional remediation.
- Move accepted scenario scheduling to the durable worker.
- Deliver the full-shift assessment with controlled timing, workload, and attempt rules.
- Complete trainer reporting, retention, and certification behavior.

Exit criteria:

- Mixed practice contains only operations for which prerequisites are complete.
- The final assessment is reproducible from retained evidence and definition versions.
- Session isolation and load tests pass at the approved concurrency target.
- Sandbox cleanup retains scores, evidence, reviews, and certification records.

### Milestone 8 — Production readiness and rollout

Scope:

- Security, privacy, accessibility, performance, backup, restore, and disaster-recovery verification.
- Production observability, alerts, support runbooks, and incident ownership.
- Pilot with Trez trainers and a limited trainee cohort.
- Fix pilot findings and obtain formal release approval.
- Gradual rollout with feature flags and rollback procedures.

Exit criteria:

- Critical and high security findings are closed.
- Core keyboard and accessibility paths pass.
- Backup restoration and active-session recovery are demonstrated.
- Trainers approve curriculum accuracy and scoring behavior.
- Production support ownership and rollback criteria are documented.

## 8. Module implementation template

Every module must have the same delivery contract:

1. Approved learning objectives and prerequisites.
2. Canonical terminology and policy references.
3. Content or demonstration activity.
4. Guided practice with hints and corrective feedback.
5. Independent practice with controlled retries.
6. Formal assessment with immutable definition versions.
7. Evidence events and critical-error rules.
8. Trainee completion and feedback view.
9. Trainer report and remediation action.
10. Unit, integration, adapter-contract, browser, accessibility, and recovery checks appropriate to the module.

A module is not complete when only its interface exists. It is complete when content, operational behavior, evidence, scoring, progress, reporting, and recovery all satisfy acceptance criteria.

## 9. API development sequence

The final route design may change, but API responsibilities should be delivered in this order:

1. Authentication/session context and role enforcement.
2. Course catalogue, assignment, prerequisite, and progress reads.
3. Attempt start/resume/complete and activity state.
4. Versioned policy and definition reads.
5. Scenario creation and evidence append.
6. Module 3 account-creation and artifact publication.
7. Module 4 artifact consumption and search evidence.
8. Modules 5–8 operation execution with transactional safeguards.
9. Trainer review, remediation, and analytics.
10. Mixed simulation scheduling and full-shift lifecycle.

Mutating endpoints must accept idempotency keys or enforce equivalent uniqueness for actions that could otherwise be repeated.

## 10. Test and quality strategy

### Unit tests

- Account normalization, construction, validation, and policy-version selection.
- Operation branching and expected final actions.
- Scoring, partial credit, critical errors, and retry rules.
- Balance arithmetic and conservation invariants.
- Permission and prerequisite decisions.

### Contract tests

- Every game adapter against the standard capability interface.
- Unsupported capability behavior.
- Evidence payload schema and policy-version binding.

### Database and integration tests

- Migrations from an empty database and supported prior versions.
- Foreign keys, uniqueness, row-level access, and transaction boundaries.
- Attempt and sandbox isolation.
- Duplicate request and concurrent processing protection.
- Retention and sandbox cleanup behavior.

### Browser tests

- Modules 1–4 vertical path first, then one suite per added module.
- Resume after refresh, logout/login, API restart, and worker restart.
- Keyboard-only completion, including the Module 4 search procedure.
- Trainer assignment, evidence review, and remediation.
- Responsive behavior at the approved workstation sizes.

### Non-functional tests

- Accessibility against WCAG 2.2 AA for core flows.
- Load and isolation at the approved concurrent-trainee target.
- Security tests for RBAC, direct-object access, injection, secrets, and sensitive logs.
- Backup/restore and active-attempt recovery.

### Required continuous-integration gates

- Formatting and lint.
- Frontend and backend unit tests.
- Shared account-rule tests.
- Database integration tests.
- Production builds.
- Critical browser smoke path.
- Dependency and secret scanning.

## 11. Data migration strategy

- Inventory the live Supabase schema before authoring new migrations; the current repository migration file is not a complete authoritative schema.
- Create additive, numbered migrations and a migration ledger.
- Backfill existing trainee session names only after an identity-mapping policy is approved.
- Keep existing simulator tables operational while new Hub records are introduced behind feature flags.
- Link new attempts to old-style sessions through explicit nullable transition fields rather than guessing identity.
- Rehearse migration and rollback on a disposable database with production-like volume.
- Do not delete legacy columns or standalone Account ID Lab assets until parity, backfill, and rollback windows are complete.

## 12. Rollout strategy

1. Internal developer environment.
2. Trainer-only validation environment with synthetic data.
3. Pilot cohort for Modules 1–4.
4. Expand the pilot one accepted operation module at a time.
5. Run Module 10 mixed practice only after Modules 3–9 prerequisites are available.
6. Enable Module 11 only after scoring, load, retention, and recovery gates pass.
7. Roll out broadly using cohort feature flags.

Each rollout step must define success metrics, rollback triggers, a support owner, and a feedback review date.

## 13. Principal risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Unapproved initials or formulas become scored truth | Trainees learn incorrect account structures | Approval workflow, policy versions, no scored assumptions |
| Separate apps lose learner context | Incorrect progress and fragmented evidence | Native Hub integration and durable attempt artifacts |
| Hardcoded game branches multiply | Slow expansion and inconsistent scoring | Standard adapters and contract tests |
| In-process timers lose work on restart | Invalid sessions and scores | Durable worker, idempotency, recovery tests |
| Browser-local trainer access is bypassed | Unauthorized training and data access | Server authentication and RBAC before rollout |
| Duplicate financial action | Incorrect balances and unsafe training behavior | Transactions, uniqueness, idempotency, critical-error scoring |
| Native browser search cannot prove paste behavior | Unreliable Module 4 assessment evidence | Application-controlled training search activated by keyboard shortcut |
| Disposable sandbox cleanup removes evidence | Unexplainable scores | Separate persistent evidence and sandbox retention domains |
| Expanding games before the adapter is stable | Repeated rework | Approve one reference adapter before adding platforms |
| Curriculum content and code drift | Training no longer matches operations | Versioned definitions, owners, effective dates, periodic review |

## 14. Decisions required before Milestone 1 implementation

Trez must confirm or assign owners for:

1. Authentication source and user provisioning.
2. Trainer, administrator, and auditor permissions.
3. Approved first game family for Modules 3 and 4.
4. Canonical game catalogue, families, initials, and account formulas.
5. Password policies and credential-display rules.
6. Pass, retry, hint, remediation, and trainer-override policies.
7. Content authoring and approval ownership.
8. Required launch language or languages.
9. Attempt, evidence, media, and report retention periods.
10. Expected pilot and production concurrency.
11. Hosting, environment, backup, and monitoring ownership.
12. Exact Module 9 scope.

## 15. Immediate implementation backlog after plan approval

The first execution increment should be limited to foundation work:

1. Create architecture decision records for authentication, database migrations, durable jobs, policy versioning, and Account ID Lab integration.
2. Add a complete local setup and verification command set for frontend, backend, shared packages, database, and browser smoke tests.
3. Add characterization tests for existing session, account creation, search, refresh, credit, withdrawal, password, and scoring behavior.
4. Define and migrate the minimum identity, course, module, activity, enrolment, progress, attempt, policy, artifact, and evidence tables.
5. Implement server-side authentication and RBAC; remove the frontend trainer-password mechanism only after replacement paths are tested.
6. Build the Hub navigation and Module 1/2 activity renderer behind a feature flag.
7. Extract the Account ID Lab rule engine with parity tests against `Evaluations`.
8. Validate the first game policy with Trez before building the Module 3 scored flow.

No game expansion or advanced simulation work should begin before this increment passes its exit gates.

## 16. Definition of production-ready

Trez Training Hub is production-ready only when:

- The confirmed Modules 1–11 can be assigned and completed in order.
- Prerequisites are enforced by the server.
- Approved policies are versioned and bound to attempts.
- Modules 3 and 4 preserve the created player across the module boundary.
- Modules 5–8 validate the complete Backend and game evidence chain.
- Critical errors cannot be hidden by a correct final button click.
- Authentication and authorization are server-enforced.
- Scoring is deterministic, reproducible, and explainable.
- Active work survives expected service restarts.
- Concurrent trainees remain isolated.
- Sandbox cleanup preserves all required learning records.
- Trainer reports support remediation and certification decisions.
- Security, accessibility, load, backup, restore, and operational runbook gates pass.
- Trez trainers approve the curriculum, workflows, terminology, and scoring.

