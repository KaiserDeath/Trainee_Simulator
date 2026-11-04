# Training Hub execution status

Implementation started 2026-11-02, following the user's instruction to build the architecture plan. Foundation commit: `b1b16fa` on `codex/training-hub-completion`; continued in the managed `codex/training-hub-delivery` worktree to preserve concurrent work. Original baseline: `42e76777e911f3076abbe51e3e6b954df8813d15`.

## Scope and decisions

Local implementation and verification are authorized. Existing untracked operational artifacts are preserved. The architecture plan is the delivery backlog, with accepted ADRs and direct user decisions taking precedence.

The user answered all five kickoff decision groups: Orion-first internal release, followed by other adapters; initial peak 10 simultaneous learners, with an extensible sellable structure and editable information; preserve current scoring and account-ID behavior as the starting rules; finalize curriculum/checkpoint mapping under the existing constraints; full permission for push, tested authentication cutover, hosted migrations and deployment; private versioned notes, staff-only formal evidence, two-year retention and private Supabase media storage approved. Scalability beyond the tested pilot is a future measured capacity target, not an unlimited-concurrency claim.

Current ID reference behavior was inspected directly in `Evaluations/src/rules.js`: Golden Dragon display-name structure uses customer plus game initials; Orion uses initials + underscore + first six normalized customer characters + three digits; Vblink uses first eight normalized characters + initials + four digits. The standalone source is read-only; these rules will be versioned on the server. Existing score/settlement behavior remains the baseline.

## Foundation progress

- Created the implementation branch without resetting existing work.
- Reconfirmed Node v24.13.1, satisfying the proposed queue spike's Node floor.
- Initial local Supabase health failed because Docker Desktop was stopped. Started the installed Docker Desktop; `docker info` now reports the Linux engine.
- Full existing `verify:foundation` gate completed with exit code 0: backend 201/201, shared rules, database-safety 61/61, frontend lint/build and mocked browser 38/38 passed. The build's existing size warning remains. Browser-generated tracked screenshots were restored to their pre-run repository contents; no user changes were overwritten.
- First isolated `local:start` applied migrations and seed but failed creating the full container set due to a Windows Go runtime out-of-memory error. Retrying with nonessential local services excluded, without changing unrelated containers or machine memory settings. Generated local environment values remain private and uncommitted.
- Confirmed availability of the original Operator Backend PPTX and all four referenced training-day DOCX files. Their actual content has not yet been re-extracted during execution.

## Required next outcomes

1. Record complete foundation gate result; resolve failures before claiming baseline green.
2. Confirm isolated local Supabase status, then run local data, Hub persistence and Auth/governance verification; do not use hosted credentials for tests.
3. Incorporate the user's kickoff answers and create the authoritative requirement/capability/evidence/evaluation traceability matrix.
4. Implement identity/evidence foundations and the continuous Orion Account Creation -> Search slice, followed by the rest of the roadmap.

## Implementation progress (ongoing)

- Real isolated data, Hub persistence and Supabase Auth/governance gates passed after starting the reduced local stack. Full-stack startup had exceeded host memory; optional Studio/analytics/edge/email services were excluded, without stopping unrelated containers.
- Added content studio, drafts/review controls, safe instruction validation, two-person publication application and immutable activity-definition snapshots. Existing attempt displays use their captured instruction.
- Added private TRAINER notes with immutable revisions, optimistic conflict checks, retry keys, two-year retention metadata and real later-attempt verification. RRHH reads; learner/admin access and RRHH writes are denied.
- Completed the dedicated Orion Account ID Lab -> game account -> Backend pencil confirmation -> durable artifact -> exact-player search path. SQL tests reject forged completion, incorrect identifiers, missing kiosk and invalid artifact references; account creation retries return one result.
- Added reset-password practice against the same player's account, with game-side action and separate Backend confirmation. Password literals remain only in the disposable simulator's existing credential state and transient requests, not learning evidence.
- Added atomic immutable settlement snapshots, retained separately from disposable operations. New reports preserve the existing scorer's verdict; old reports remain explicitly labeled reconstructions. Step-level historical evidence is not manufactured.
- Implemented controlled legacy simulator/trainer Auth cutover: server identity/CSRF, explicit owner links, raw-game route restrictions, protected realtime handshake and production-default authentication. Removed the browser-embedded trainer password. The real Auth gate now includes anonymous denial, role denial, CSRF denial, own-session access, foreign-session denial and server-derived session names.
- Implemented PostgreSQL durable generation jobs via the existing REST boundary, with leases/renewal, fencing, stable delivery operation IDs, retry/dead states and deadline handling. This avoids a second database pool/service for the pilot. Existing timer mode remains explicitly available for compatibility verification; production uses durable generation. Need load/crash/recovery verification before release certification.
- Added the explicit 15-position curriculum crosswalk in `TRAINING_HUB_CURRICULUM_TRACEABILITY_2026-11-02.md`; schema/evaluation runtime integration remains to be completed.

Latest backend full suite: 205 passing before the policy/exception increment. New transactional workspace SQL gate passes (content/coaching/Orion continuity/reset/snapshots/job fencing/policy revision/exception retry and no repeated game action). Fresh migration replay through the policy-administration increment passed. Frontend lint/build passed; repeat after final changes. Real Auth/governance passed after cutover. The corrected full browser suite passed 41/41 (including one concurrent trainer test) in 54.8 seconds, after fixing exact-label selectors. The earlier failed full runs are superseded only for that tested source state. Ten concurrent local account-practice clients executed 50 commands with zero errors and p95 57 ms after fresh replay; this is a bounded REST/DB path, not full production load certification.

Account policy administration now supports separate-admin review of a new identifier version. SQL verification proves future attempts use it while existing attempts retain the original formula. Exception practice uses the existing ALREADY_PROCESSED / PLAYER_IN_GAME / PENDING_RECONCILIATION settlement rules, records unsuccessful practice results, permits fresh-case retries before completion and never performs a second game movement during reconciliation.

Concurrent external edits appeared in the trainer dashboard, its component/tests and screenshots. Preserve them. `CompletedSessionReport.jsx` includes both their refreshKey changes and this task's evidence wording, so any future staging must preserve ownership of both hunks. No hosted migration or deployment has been performed. Existing operational scripts/manifests remain unrelated and must not be committed as application changes.

## Remaining work

Complete the remaining pilot/release gates and other-game expansion, media/cohorts/exports, broader capacity/accessibility checks and staged release. Keep actual release inputs/credentials private. Full permission is already granted; do not ask again for decisions already answered. Do not claim unlimited capacity or production readiness without measured evidence.

## 2026-11-03 assessment and curriculum increment

- All four Orion assessment runtimes now execute against disposable server-owned game worlds. Checkpoint 1 retains the exact seven-action sequence. Checkpoint 2 adds real Backend request confirmations and canonical financial settlement. Checkpoint 3 adds history-based reconciliation without another posting, plus a structured customer-response decision using the real operation reference and customer balance. This is a structured communication rubric, not a claim of assessing unrestricted conversations.
- Final readiness captures a random workload within the configured range (default 2–6 operations), operation selection and optional advanced cases when the attempt starts. Every operation records separate game and Backend stages; results are derived from both. Question IDs, account policy and weights are captured. Changes made before opening an already started attempt cannot replace its assigned questions, policies or workload.
- The four original evaluation IDs and all eleven original module IDs remain intact. The expanded fifteen-position sequence is applied, including explicit Backend/customer-experience coverage. Checkpoint/final modules require an officially submitted successful result. A numerical score that has not been submitted does not complete the checkpoint. Readiness reporting checks actual required modules and official checkpoint results instead of counting any ten modules.
- Published evaluation roots remain unchanged. TRAINER can publish a reasoned replacement policy in an append-only version layer; optimistic revisions reject stale editors. Future attempts use the selected version and previous attempts retain their settings. The 100% pass threshold and three-attempt policy cannot be edited through this workflow. Unsupported families/actions cannot be published.
- TRAINER can publish new or replacement theory questions with source/rationale and a correct answer. Older versions remain immutable; TRAINER/RRHH can review them. Learner routes and database roles cannot read answer keys or private stage evidence. Staff can lazily open detailed formal evidence without loading every raw simulator world.
- Mixed practice is now an untimed, durable workflow with separate run/stage evidence. Failed runs and runs after learning completion can be repeated without a three-attempt cap, without consuming formal attempts and without resetting the original learning completion. Stage/world checks reject stale actions. Ending a run retains its evidence. Other earlier activity components retain their existing retry behavior; do not describe every native component as supporting independent post-completion replay.
- Worker generation now commits operation creation and its scenario/game posting in the same transaction. Replacement-worker tests preserve delivery IDs, reject expired leases and prevent duplicate posting; session/job lock order is consistent. Assessment expiry also runs in the worker. An exception-practice retry ordering issue within one transaction was corrected by using event timestamps.
- Isolated Vite and Playwright cache/output paths avoid interference through the shared dependency junctions. Formal assessment focus hides the ordinary learning path; mobile layout and a learner round-trip have browser coverage.

Verification is local. Transactional scenarios cover the four runtimes, false browser verdicts, incorrect kiosk/account evidence, pinned policy/question/workload versions, three-attempt closure/reopening, deadlines, official progress, mixed practice replay and retained private evidence. A fresh migration/seed replay through mixed practice and the complete transactional workspace gate passed. The latest complete foundation gate passed: backend 215, shared rules 12, database safety 61, frontend lint/build and browser 44. Browser checks include post-completion mixed replay, policy/question publishing and the formal learner screen at mobile width. Logs are in ignored `outputs/hub-mixed-*.log`; formal-screen screenshots are local review artifacts. The build still reports its existing large-chunk warning. Hosted migrations, staging and production deployment are still pending. Two-year retention metadata is present; automatic disposal/retention operations still require implementation and verification before claiming full operational compliance.

### Worker scheduling and capacity follow-up

The worker now sleeps until a persisted event/deadline or a 60-second recovery check, and local session/assessment creation wakes it immediately. This replaces the fixed one-second idle polling loop. It does not promise zero idle database traffic or immediate cross-process notification; the fallback preserves recovery across independent processes. Free-simulator deadlines are processed independently from the next generation tick, closing an earlier deadline gap. Focused and untimed practice sessions are excluded.

The native final capacity gate now exercises ten parallel local REST/database clients with synthetic prerequisites and actual final runtime actions. The corrected full run completed 38 operations and 106 commands, including uncertain-write retries, with zero execution/cleanup errors and p95 18 ms for measured RPCs. It restores the previous policy head and removes only its UUID-scoped fixtures, keeping a local recovery manifest if cleanup fails. The first run's successful workload was not a passing gate because its cleanup relationship was incorrect; its exact fixtures were recovered before the corrected run. These results do not certify browser/Auth or hosted capacity.

The capacity repeat passed with 43 operations / 116 commands and p95 20 ms. The worker follow-up backend suite passes 217 checks; the real local Supabase Auth/governance and transactional workspace gates pass. A production-mode Docker smoke check ran Node v24.22.2 as the unprivileged `node` user, returned liveness 200 and anonymous Hub/trainer 401 against the isolated local stack. The image uses a digest-pinned Node 24 base, locked production dependencies and source-only copying; it excludes environment files. Node support was checked against the [official release schedule](https://github.com/nodejs/Release) on 2026-11-03. GitHub verification is defined with commit-pinned official actions and separate foundation/disposable-database jobs; remote execution remains to be verified.

GitHub foundation and isolated-database checks both passed on `e3b19e0`. The clean-run failures from the earlier head were corrected: unit fixtures now provide non-secret local configuration and the older Hub integration check validates fifteen modules. All 217 backend tests also passed in a clean Linux container without the developer's environment files. Draft PR: https://github.com/KaiserDeath/Trainee_Simulator/pull/2.

### Private training media

Added a private Supabase Storage library for images, PDFs and video (25 MB per file). ADMIN registers and uploads a new immutable object/version; a different ADMIN reviews publication. Actual Storage integration rejects overwrite attempts even when the upload header requests upsert. Size/type are checked against the stored object before review. Images require alternative text and videos require a transcript; timed caption-track management remains a follow-up accessibility task.

The instructional editor can attach published asset IDs without accepting arbitrary embedded URLs or operational configuration. Lesson publication fails until every referenced asset is published. Signed access lasts fifteen minutes and is issued only after server entitlement checks: an assigned learner must have module access, or own a recent historical lesson snapshot. Retired assets are unavailable to new lesson delivery while eligible old snapshots remain reviewable. Signed URLs already issued remain valid until their expiry; future access is checked again. Staff previews and publication actions stay separate from learner data permissions.

Fresh replay through the media migration, the full transactional workspace gate and real private-Storage upload/download/access/cleanup tests pass. The complete local foundation gate now passes backend 220, shared 12, database safety 61, lint/build and 46 browser tests. The latter includes private upload and published-asset attachment. Remote CI is being repeated for this increment. Automatic retention disposal and abandoned-upload cleanup are still pending; metadata alone is not disposal enforcement.

### Governed reports and new hosted database (2026-11-03)

Staff reports now combine legacy and governed assessments, retain per-evaluation attempt statistics, exclude missing scores from averages, and expose immutable Backend movement evidence. Reports and policy audits load on demand. CSV export uses the applied filters, omits raw private evidence, neutralizes spreadsheet formulas, and clearly caps reports at 500 rows. The full local foundation gate passes 224 backend, 12 shared, 61 database safety and 47 browser checks plus frontend lint/build. Real local Auth and transactional workspace gates pass, including nine governed final results in the report.

The replacement hosted Supabase project was found in the original checkout's private backend configuration. Auth and REST returned 200. Newly available CLI authentication allowed Management API SQL access without a direct database URL/password. Eleven pending migrations, from Orion runtime through governed reporting, were applied atomically with migration-ledger entries. Read-only verification confirms fifteen modules, a private media bucket, the existing identity preserved and no learner/formal attempts. All four formal evaluations remain draft; this is schema verification, not a deployed end-to-end release. Local verification configuration remains isolated from hosted data. Hosting configuration and application deployment verification remain pending.

### Cohorts and training target dates (2026-11-03)

Continued from `3efb5be` in the separate managed `hub-release-continuation` worktree because the original delivery worktree belongs to another chat. The original checkout and delivery worktree were not edited. Both GitHub foundation and isolated-database checks on the delivery PR were confirmed successful before this increment.

TRAINER and RRHH can create a named course cohort, assign selected active Postulantes, add members, and revise or remove a target date. This follows their existing course-assignment permissions; ADMIN has no new assignment permission. A cohort supports at most 100 learners; larger groups must be divided explicitly. Existing members remain when editing. The course cannot be changed after creation. Withdrawal is handled through enrolment administration; this increment does not introduce a separate cohort member-removal workflow.

Cohorts reuse the unique learner/course enrolment and preserve its status, progress and results. A withdrawn enrolment is rejected rather than silently reactivated. Target dates are calendar dates (no midnight timezone shift) and advisory: they do not lock practice, consume formal attempts or replace assessment time limits. Learners open their own groups on demand and cannot read membership lists. Staff load and update the view manually; no polling was added. Reads use 50-cohort cursor pages with an explicit next cursor; member lists are bounded by the transactional cohort capacity rule.

The database revalidates active roles and learner identities, commits batch assignments atomically, records append-only revision events, rejects stale revisions and reuses exact retry results. The browser retains its retry key after an uncertain response. Anonymous/authenticated database roles cannot invoke the functions or read cohort tables directly.

Verification: migration `20261103008000_training_cohorts.sql` applied to the named isolated local Supabase database. The expanded transactional workspace gate passed, including progress preservation, retries, stale edits, atomic rejection of invalid/withdrawn/capacity-exceeding batches, private learner projection and pagination beyond 50 groups. Real local Supabase Auth/HTTP tests passed for anonymous denial, CSRF denial, forged learner role denial, trainer creation/retry, learner reads and RRHH revision. Full foundation passed 227 backend, 12 shared-rule, 61 database-safety and 49 mocked-browser tests, plus lint/build. A subsequent panel-style adjustment passed focused desktop/mobile browser tests and lint/build. Existing generated tracked screenshots were restored only in this new worktree. The build retains its existing large-chunk warning.

This cohort migration has not been applied to the hosted database. No hosted application deployment or hosted learner acceptance is claimed. Next release work remains: staging configuration and full hosted learner/trainer journey, content/evaluation publication through the existing approval process, retention/disposal and abandoned-upload cleanup, recovery/backup rehearsal and accessibility acceptance. Vblink/Golden Dragon assessment parity remains a later expansion.

### Readable Hub workspaces and section navigation (2026-11-03)

The user rejected the mixed dark/light interface after observing near-white labels and values on white administrator panels. UI/UX delivery is now prioritized ahead of further feature expansion. Added a scoped shared light theme: neutral page background, white panels, dark text, muted secondary text, restrained dark teal actions, visible field boundaries, distinct disabled states, and keyboard focus indicators. The theme covers the Hub login, administrator, trainer/RRHH, learner lessons, coaching, cohorts and reporting surfaces. It does not recolor the separate game interfaces or the simulator/trainer application routes.

Staff now have role-specific section navigation and one visible tool area at a time, instead of a vertical stack of every management panel. Selection is reflected in the URL fragment, survives reload, supports browser history and preserves mounted form state when switching sections. ADMIN opens People & access; TRAINER/RRHH open their existing people/evaluation/report workspace. Sidebar links collapse into wrapping navigation on narrow screens. Added a keyboard skip link and section-heading focus on navigation. Existing role authorization, manual update controls, assessment rules and server workflows are unchanged.

Validation includes rendered-browser checks of at least 4.5:1 contrast on sampled visible labels, fields, table text, headings and navigation; desktop/mobile screenshots; absence of page-width overflow; selected navigation state; and hidden inactive tool areas. These are targeted regression checks, not a complete WCAG audit or a claim of review by an independent professional designer. Existing UI workflow tests now navigate to their relevant tool area. Hosted application verification and trainer/learner acceptance remain separate release gates.

Local verification for the UI increment: full foundation passed 227 backend, 12 shared-rule, 61 database-safety and 52 browser checks, plus frontend lint/build. A final skip-link navigation correction passed the three focused contrast/layout/history/keyboard tests. Screenshots in local `outputs/hub-light-{admin,trainer,learner}-{desktop,mobile}.png` were visually inspected for the administrator and learner desktop layouts and the staff mobile layout. The checks use controlled browser fixtures; they do not establish hosted persistence or complete accessibility conformance. The existing build-size warning remains.

### Main integration and mobile account workflows (2026-11-03)

Pushed the complete Hub delivery and UI work to `main` at `0afcb00`, preserving the newer production same-origin authentication, statistics aggregation, administrator profile and idle-worker backoff changes. PR #2 is merged; PR #3 was closed after its commits reached main directly. Worker integration uses the next-wake/deadline RPC and listens to the Hub work signal, so formal assessment creation still wakes the production worker. Local verification scripts can now replay their function definitions transactionally on an already migrated disposable database. Both the full combined suite and real local Auth, workspace, worker scheduling and statistics gates passed. The main GitHub verification run for `0afcb00` passed.

Live read-only checks returned backend health 200, anonymous Hub context 401, and frontend `/hub` 200 with bundles containing the shared light theme and section navigation. These establish endpoint availability and delivered frontend assets, not an authenticated hosted learner journey. Hosted cohort migration verification remains pending: the available linked-database CLI query failed its IPv6 connection configuration; no hosted migration was applied in this continuation.

Continued UI/UX work converts administrator and Postulante directories into labelled account cards at phone widths. Course assignment, account edits/deactivation and staff password controls remain in the original table markup and share the existing server actions; mobile users no longer need horizontal scrolling to reach them. Learner name editing now uses an inline form with explicit Save/Cancel, focus on the first field and retained input after a failed save, replacing sequential browser prompts. Desktop table presentation remains available. Focused mobile browser checks prove password-control access, course assignment and failed-save/retry behavior; screenshots were visually reviewed. Full verification results are recorded with the follow-up commit.

Mobile follow-up verification: full local foundation passed 236 backend, 12 shared-rule, 61 database-safety and 55 browser tests, with frontend lint/build. No hosted data was modified by these browser fixtures.

### Hosted cohort migration and real browser release path (2026-11-03)

Confirmed the active hosted Supabase project from the existing private `backend/.env.local` and its Hub migration ledger. The fallback `.env` references an older project; this explains the earlier CLI connection failure. Applied the missing cohort migration transactionally with its ledger record and verified the table and restricted database write permission.

A real browser run against the deployed frontend/API/Auth/database passed trainer/learner login, cohort assignment and reload persistence, learner article completion and server-side reload persistence, private coaching persistence, RRHH projection, outsider cohort denial, learner staff/private-note denial and CSRF denial. All four exact temporary identities and their scoped records/Auth users were removed. Pre-existing counts were unchanged: four identities, zero cohorts and ten activity-attempt rows. Evidence: `outputs/hub-hosted-release-2026-11-03/REPORT.md` and `release-browser.json`. Screenshots and the operational harness are local artifacts.

Corrected a UI issue observed during that live run: cohort dates now follow the Hub language rather than the browser locale and retain their calendar day across timezones. Three focused browser checks, lint and build passed. Formal evaluations remain draft; publishing/content acceptance, full hosted Orion/formal journeys, retention/disposal and recovery/accessibility gates remain open.

### Hosted Orion operations and exception matrix (2026-11-03)

User confirmed the preceding workflow worked and requested the next step. Verified refresh, add, withdraw, cancellation, password reset and exception handling against the deployed browser/API/Auth/database in disposable native-activity courses and sandbox worlds. Incorrect observations and premature approvals were denied; retries preserved the game-history counts and financial effects. Reset responses, retained learning evidence and immutable operation snapshots excluded literal passwords. Reload persistence and foreign-learner denial passed.

The existing scorer correctly marks unnecessary cancellation of a normal movement as incorrect; the verification retains that verdict while separately checking reservation release and retry safety. All four exception outcomes passed: ALREADY_PROCESSED, PLAYER_IN_GAME and both applied/not-applied reconciliation cases. No decision replay performed another game posting. Evidence: `outputs/hub-orion-operations-2026-11-03/REPORT.md`, `operations-browser.json` and `outputs/hub-orion-exceptions-2026-11-03/exceptions-browser.json`.

All temporary identities/Auth users, course/attempt/evidence records and sandbox sessions were removed. Both final runs preserved the pre-existing counts (four identities, one original course, one original session). The native activity fixtures establish runtime/UI behavior, not approval of original curriculum content or formal readiness. Main `a0ac0e1` CI is green after rerunning the database job that had failed on runner port 54322. Next: hosted formal attempt/submission/reopening/reporting verification, followed by retention/disposal, restore rehearsal and broader accessibility/user acceptance.

### Formal evaluation browser workflow (2026-11-03)

Fixed a learner navigation defect: after a scored attempt, the results screen
offered submission but hid the next attempt while submission was available.
Learners can now choose either action after attempts one and two. Closed sets
still hide the start button, and server attempt limits remain authoritative.

Added `npm run verify:local:formal-browser` and its CI gate, using real local
Supabase Auth, Express, Vite and Chromium without API mocks. It exercises the
Orion checkpoint through prerequisite completion, a successful manually submitted
result, three unsuccessful results with automatic closure, latest-only submission,
fourth-attempt denial, trainer reopening with a required reason, a new attempt
set, preserved prior results, staff evidence/report reads, learner privacy, and
idempotent start/action retries. The exact seeded draft policy is restored and
all generated fixture identities/Auth users and their records are removed.

The full published workflow runs on the isolated local stack. The catalog has
four fixed evaluation slots; all four hosted evaluations remain draft, so a full
hosted formal cycle remains pending content approval/publication. The local
fixture temporarily publishes only its isolated checkpoint. Evidence is recorded
in `outputs/hub-formal-verification-2026-11-03/REPORT.md` and `browser.json`.

Verification passed: the real local browser gate and fixture cleanup, plus the
full foundation (236 backend, 12 shared-rule, 61 database-safety and 56 browser
checks, lint/build). One overlapping browser run timed out at sign-in; cleanup
passed and the separate rerun passed. The existing build-size warning remains.

### Local database recovery rehearsal (2026-11-03)

Main `a3d0b12` foundation and isolated-database CI passed. Continued with recovery
while the four hosted evaluations remain draft pending content approval.

Added `npm run verify:local:recovery`, now included after the other CI local
gates. It takes a real custom-format PostgreSQL dump from the fixed local
container and restores into a fresh disposable database using the local
Supabase administrative role. Hashes/counts for 67 tables, Auth users and Storage
metadata match, as do functions, triggers, constraints, indexes, sequences,
ownership, privileges and row-security policies. All eight transactional Hub
workspace/evaluation/cohort suites pass on the restored database.

A second backup/restore includes nonempty formal results/evidence, historical
lesson snapshots, coaching revisions and an Auth credential fixture created
only in the restored copy. Their hashes match after recovery; learner privacy
and snapshot immutability remain enforced. Both scratch databases and the
temporary archive are removed, and the source database is unchanged.

The initial rehearsal exposed orphan worker jobs left by older local test
cleanup that disabled cascades. Fixed Auth and both capacity cleanup scripts.
After confirming the named disposable stack had no identities or sessions,
rebuilt it from migrations/seed, reran real Auth and both ten-client capacity
gates, and repeated recovery. All passed; there are zero orphan worker jobs.
Final recovery including both restores and integration suites took 21.6 seconds
on this local machine. Evidence: `outputs/hub-recovery-2026-11-03/REPORT.md` and
`recovery.json`. JavaScript syntax and diff-whitespace checks also passed.

This verifies local logical database recovery within the same PostgreSQL
cluster with pre-existing roles. It does not establish hosted backup recovery,
offsite/encrypted copies, Storage file-byte recovery, configuration/secret
recovery or an operational recovery-time objective. Those remain release gates,
alongside retention/disposal, abandoned uploads, accessibility and content
acceptance. No hosted data or formal publication was changed in this increment.

### Abandoned private-media cleanup (2026-11-03)

Main `259755c` CI passed. Added bounded cleanup for unfinished upload
registrations, keeping retained assessment/coaching evidence outside this
increment. A registration becomes eligible after 72 hours only if no current
lesson, content version or historical lesson snapshot references it. Pending
review, published, rejected and retired assets are excluded. Metadata and
append-only job events remain after byte removal.

The database reserves three hours before issuing a two-hour Storage upload
token; actual token expiry is checked before returning the link. The migration
protects pre-existing registrations with a three-hour grace period. Expiry locks
the asset before deleting Storage bytes, blocks cached registration resurrection,
and prevents new references. New-reference locks serialize against cleanup.
Completed-upload retries resume without another upload URL; expired retries
retain form inputs and use a new registration key on the next attempt.

Production maintenance starts a maximum 100-item batch after one minute, then
daily, with five-minute retries for failed/full batches. Database leases prevent
duplicate claims; stale completion tokens are rejected. Storage failures remain
retryable, including a crash after removal but before its receipt. A read-only
preview is the default CLI operation. Automatic scheduling can be disabled with
`HUB_MEDIA_CLEANUP_DISABLED=true`; sleeping hosts execute on their next startup.

Fresh local migration/seed replay, real private-Storage verification and local
database recovery passed. Storage coverage includes current/draft/snapshot
references, live-link grace, recent registrations, review/retired protection,
concurrent workers, completion racing cleanup, failure backoff, crash recovery,
idempotency, expiry and service-role-only maintenance. Full foundation passed
240 backend, 12 shared-rule, 61 database-safety and 56 browser checks, plus
lint/build. The existing build-size warning remains.

Applied migration `20261103200000_abandoned_media_cleanup.sql` transactionally
with its ledger record to the active hosted project. Before and after: zero
media assets, four original identities, four draft formal evaluations. The real
hosted service-role REST preview returned zero candidates; authenticated cleanup
execution and direct use of the old upload command are denied. No hosted bytes
were deleted. Evidence: `outputs/hub-media-cleanup-2026-11-03/REPORT.md` and
`hosted-preview.json`. Production scheduling depends on deployment of this
commit; no hosted deletion or scheduler-log acceptance is claimed here.

Two-year historical evidence/coaching disposal still needs a complete dependency
and hold policy before enabling deletion. Hosted file/backup recovery and
accessibility/content acceptance also remain open.

### Reviewed two-year coaching disposal (2026-11-03)

Main `79c9e83` CI passed. Implemented the first historical-text disposal path in
the existing private Coaching workspace. The displayed minimum retention date
now includes two calendar years after the latest revision, preserving a recent
revision even when its original note is older. Closed/verified status, elapsed
retention, absence of an active coaching hold and completed/expired linked
attempts are required. Open cases and missing/active linked evidence remain
protected. TRAINER manages reasoned learner-wide coaching holds; RRHH reads.
ADMIN/Postulante cannot access these private workflows.

A reasoned request and a different active TRAINER's approval are required.
Approval revalidates age, holds and the current revision fingerprint under the
same per-learner lock as edits. Cancellation preserves text. The approved
transaction removes the exact note/revisions, retaining content-free disposal
receipts and hashed retry markers. An ancient create retry cannot recreate the
text. Ordinary append-only protections stay in place; inherited direct-write
grants on coaching tables were removed. Scores, attempt budgets, progress,
linked evidence and unrelated notes are unchanged. There is no automatic
historical coaching purge.

Fresh migration/seed replay, all nine transactional workspace/retention suites,
real local Auth/API checks and the recovered-database gate passed. The Auth gate
checks CSRF/role denial, independent approval, exact retry, disposed-text retry
denial and concurrent revision/disposal serialization. Browser tests cover
self-approval, uncertain responses, retained input/retry key, removal of disposed
text, phone-width contrast/focus and absence of horizontal overflow. The mobile
render was visually inspected and metadata spacing corrected. Full foundation
passed 240 backend, 12 shared-rule, 61 database-safety and 58 browser checks,
lint/build. Final UI adjustments passed lint/build and three focused browser
checks. The existing build-size warning remains.

Applied migration `20261103210000_coaching_retention_disposal.sql` transactionally
with its ledger entry to the active hosted project. Before/after: zero coaching
notes/revisions, four identities and four draft formal evaluations. A read-only
service-role REST preview for an existing trainer/learner passed. Direct coaching
deletion, browser disposal execution and direct access to the old save function
are denied. No hosted coaching text was disposed. Evidence:
`outputs/hub-coaching-retention-2026-11-03/REPORT.md`, `hosted-preview.json`,
`auth-verification.txt`, `workspace-verification.txt` and `recovery.json`.

Hosted authenticated disposal and deployment acceptance are not established by
the schema/REST preview. Formal assessment evidence disposal still needs its
own dependency-preserving path; hosted file/backup recovery, accessibility and
curriculum/publication acceptance remain open. Live-table text deletion does
not remove existing backups or exported copies and is not a compliance claim.

### Governed formal evidence disposal (2026-11-04)

Main `04c8785` CI passed. Added per-attempt retention preview, holds, optimistic
case revisions, reasoned requests/cancellation and independent TRAINER approval
to recorded formal evidence review. RRHH reads; ADMIN/learners cannot use the
private workflow. Eligibility requires a completed attempt in a closed set,
elapsed two-year evidence retention, no active packet hold, no shared/active
sandbox and no unreviewed dependency or unattributed private retry response.

Added retry lineage for native commands. The migration can attribute older
tagged responses and history replies only when stored identifiers prove their
owner. Unknown legacy content blocks disposal. The reviewed transaction removes
the full owned raw packet: runtime/theory responses, item/action/stage details,
final operation plans, retry copies, settlement snapshots and sandbox sessions.
Normal immutable guards remain, and direct service-role delete/bypass grants
are revoked. Runtime commands and approval serialize on the attempt. After
disposal, runtime reads/replays return 410 before reaching cached data.

Result rows, scores, set membership/counts, policy snapshots and official
progress remain byte-for-byte unchanged in tests. Reports retain the result and
explicitly mark disposed detail; CSV adds an evidence-retention column. Missing
operation detail is unknown rather than a fabricated zero-percent accuracy.
The staff UI identifies both the learner and attempt before review and shows a
receipt after disposal. There is no automatic formal-packet deletion worker.

Fresh migration/seed replay and all ten transactional integration cases passed,
including real Orion/final workloads, official progress preservation, closed-set
denial after disposal, independent approval, holds, stale revisions, shared
sandbox protection, legacy history attribution and unknown-dependency denial.
The actual local Auth/Express/Vite/Chromium gate passed independent TRAINER
browser approval and exact retry, removed detail/cache copies, preserved score
and budget, and denied learner runtime replay. Exact Auth/database fixtures were
removed. Full foundation passed 242 backend, 12 shared-rule, 61 database-safety
and 58 browser checks, lint/build. Backend tests were repeated after the final
missing-record 404 mapping. Ten-client native final capacity and the restored
database's ten-suite gate passed; recovery compares 76 tables plus views and
security/schema definitions. The existing build-size warning remains.

Applied `20261104000000_formal_evidence_retention.sql` transactionally with its
ledger entry to the active hosted project. Current before/after baseline is five
identities, zero formal attempts/runtimes and four draft evaluations. Read-only
service-role REST probes confirm authorized missing-attempt 404 and learner
private-preview 403. Direct delete, browser execution and old runtime/backfill
bypass privileges are denied. No hosted formal evidence was disposed. Evidence:
`outputs/hub-formal-retention-2026-11-04/REPORT.md`, `browser.json`,
`hosted-probe.json`, `capacity.txt` and `recovery.json`.

This disposes governed formal detail while retaining result/budget/progress
ledgers. Legacy/focused/mixed-practice history, identities, global definitions
and existing backup/export copies are outside the operation. Hosted end-user
disposal/deployment acceptance, broader accessibility, hosted file/backup
recovery and curriculum publication/acceptance remain open; all four hosted
evaluations remain draft.

### Accessibility and release acceptance continuation (2026-11-04)

Added axe/keyboard coverage for four Hub roles, section navigation, 320px
reflow, doubled text, focused errors/retry preservation, assessment transitions
and timer milestones/expiry. Fixed contrast, skip-link focus, accessible brand
naming, scrollable history, transition/result focus and reduced-motion support.
The full foundation passed 242 backend, 12 shared, 61 safety and 66 browser
checks, including doubled text. Real local Auth/browser
formal assessment and independent evidence-review/disposal passed with fixture
cleanup. These checks are not a complete WCAG or human usability certification.

The public hosted sign-in page passed desktop/mobile axe, reflow and keyboard
checks. A fresh read-only packet contains all 15 modules and four draft policies;
all four candidate policies pass the canonical validator with verified Orion.
No evaluation was published and no person's approval was substituted.

The initial curriculum-review/pilot-supervision responsibility is Capacitador,
configurable in `config/hub-release-acceptance.json`. This configuration does
not grant roles. `npm run verify:release:acceptance` fails closed for missing
reviewer assignment, learner roster, actual curriculum decisions, hosted journey
and supervised pilot evidence. See `docs/HUB_RELEASE_ACCEPTANCE.md` and
`outputs/hub-release-acceptance-2026-11-04/REPORT.md` for scope and current
database/file recovery evidence. Real sign-off and supervised learners remain
required before full release acceptance.

The actual hosted export restored into an isolated local database with all 112
table hashes, schema/security/grants and public FKs matching; recovered Auth
credential/identity checks passed. One generated private PNG passed isolated
copy/public denial, exact owned-source delete/restore and Hub-signed download.
All temporary resources were cleaned and all five original identities preserved.
This is a hosted backup/file rehearsal, not a live database replacement, retained
operational backup, or accepted hosted formal learner journey.

The Hub audience includes new learners and existing employees receiving
reinforcement. Ten is the initial pilot/tested concurrency target, not a total
student cap. Release configuration separates population, pilot participation and
concurrency; current cohorts allow 100 members each. Larger simultaneous use
requires new capacity evidence. Preserve prior completions/results; use repeat
practice and controlled TRAINER reassessment for reinforcement.
