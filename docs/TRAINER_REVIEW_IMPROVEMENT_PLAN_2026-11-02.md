# Trainer workspace: analysis and improvement plan

Date: 2026-11-02 · Reviewed commit: `f686b8c` · Scope: `/trainer`

## 1. Assessment

The current workspace is a useful reporting dashboard, but it is not yet a complete trainer review and coaching tool. The recent redesign improved navigation, comparison charts, mobile access, and session history. The next investment should make it easier to answer five operational questions:

1. Who or what needs my attention?
2. What happened in this session?
3. What exactly was wrong, and what evidence supports that conclusion?
4. What have I explained to the trainee, and what still needs practice?
5. Was that issue verified in a later session?

A visual redesign alone cannot answer the last three questions. They require structured explanations, persistent review records, and reliable reviewer identity.

This is an implementation plan, not authorization to execute a migration, change authentication, regrade sessions, or modify hosted services. No application behavior was changed during this analysis.

## 2. Evidence and limits

Reviewed the route shell, directory, selected-session view, live queue, report, statistics, audit log, settings, API handlers, scoring/report construction, and current browser tests. Relevant sources:

| Area | Source |
|---|---|
| Navigation, state, polling, settings saves, destructive actions | `frontend/src/pages/DashboardPage.jsx` |
| Directory, name grouping, filters, session rows | `frontend/src/components/dashboard/TraineesDirectory.jsx` |
| Navigation and global settings | `frontend/src/components/dashboard/DashboardSidebar.jsx` |
| Individual report and validation presentation | `frontend/src/components/dashboard/CompletedSessionReport.jsx` |
| Live queue | `frontend/src/components/dashboard/LiveSessionView.jsx` |
| Per-session statistics | `frontend/src/components/dashboard/SessionStatisticsView.jsx` |
| Global statistics and weighted name groups | `frontend/src/components/dashboard/GlobalOperationStatistics.jsx` |
| Audit presentation | `frontend/src/components/audit/AuditLogPanel.jsx` |
| Report, statistics, session listing and settings APIs | `backend/src/routes/trainerRoutes.js` |
| Evidence reconstruction and report aggregation | `backend/src/engine/SessionEngine.js` |
| Scoring definitions | `backend/src/services/scoringService.js` |
| Sensitive-value redaction and evidence helpers | `backend/src/domain/trainerEvidence.js` |
| Current legacy access boundary and Hub boundary | `frontend/src/App.jsx`, `backend/src/app.js`, `docs/adr/0001-authentication-and-authorization-boundary.md` |

Fresh verification during this assessment:

- Frontend lint passed.
- Production frontend build passed, with the existing bundle-size warning.
- All 35 mocked browser tests passed. These exercise selected navigation, report, statistics, settings and error states; they do not establish end-user usability or real database persistence for a notes feature that does not exist yet.
- No production write, database migration, or hosted deployment verification was performed.
- Current screenshots and the supplied user screenshot inform layout observations. No trainer observation study, keyboard/screen-reader audit, or large-dataset performance benchmark has been completed.

Historical security work on another branch is not treated as present on `main`. The current route mounts and accepted ADR were checked directly.

## 3. Findings across the section

Priority: **P0** is a prerequisite for trustworthy persisted review; **P1** materially obstructs finding or interpreting information; **P2** improves scale, efficiency, and polish.

| Priority | Finding and evidence | User consequence | Planned improvement |
|---|---|---|---|
| P1 | Individual reports render 11 columns, with successful and failed requirements mixed together. No mistake-specific search or filter is implemented in `CompletedSessionReport`. | Trainers scan wide tables to discover what needs attention. | Default to a compact operation list and a selected-operation detail view. Filter incorrect, pending, unverified, and all operations. |
| P1 | Reports show submitted/expected values, but generic labels and a special-case “Amount mismatch” are the main explanations. | The trainer must interpret the rule and translate it into coaching. | Stable rule codes, a concise evidence-based explanation, and the expected next action for each supported mistake. |
| P0 | No dedicated persistent trainer-note/review service or UI was found. Legacy `/trainer` uses a client-side access check; its API is mounted without the Hub's identity middleware. | A browser-supplied reviewer name cannot provide trustworthy authorship or access control. | Resolve the separately tested identity cutover under ADR 0001 before enabling durable reviewer writes. Keep the new feature disabled until this gate passes. |
| P1 | “Final Grade: Pending approval” is static, while “Overall Score” is rounded accuracy and “Accuracy” repeats that measure. | Review completion, grading approval and numeric performance can be confused. | Show one clearly defined accuracy measure. Keep prototype classification visible. Define review completion separately from pass/fail or accountant-like approval semantics. |
| P1 | The selected session is stored as an object. List refreshes/socket handlers replace list entries but do not synchronize that object. | Stop/completion status and available actions can remain stale while a session is open. | Store the selected session ID and derive current session state from the canonical list/cache. |
| P1 | The live queue catches errors only in the console. Its empty state asserts that generation is running. | A failure, inactivity, and a genuinely empty queue can look identical. | Separate loading, successfully empty, stale, failed, stopped and active states. Never infer generator health from an empty response. |
| P1 | Settings save on every input event, can silently adjust the paired min/max value, and briefly show generic failure feedback. Load failure leaves displayed defaults. | Intermediate edits or failed loads can make the apparent configuration misleading. | Draft fields, explicit validation and Save/Cancel; load-error state, dirty state, saved server values and conflict protection. |
| P1 | Directory/history/statistics group legacy sessions by entered name. | Two people with the same name may be treated as one history. | Retain the current warning; use verified identity links when available and keep unlinked records distinct. Never auto-link by name. |
| P1 | `formatRequirementValue` formats every numeric requirement as dollars. Several timing helpers coerce null to zero. | Credits may appear as currency, or missing timing evidence as a real zero duration. | Unit-aware formatting and explicit “Not recorded” states. Preserve genuine zero values. |
| P1 | Report correctness is reconstructed from validation/evidence at read time. That pathway is distinct from the stored operation result. | Historical stability needs proof before a reviewer relies on an explanation or attaches a note to it. | Characterize historical drift, retain original result, show evidence availability, and version any new explanation snapshot. Do not silently regrade. |
| P2 | The directory polls an unpaginated session list every five seconds; global statistics use one unpaginated operation query. | Large histories may be slow or incomplete under provider response limits. | Verify actual API row limits; add deterministic server pagination and complete aggregation before claiming coverage of all records. |
| P2 | Report and session-statistics tabs independently fetch the same report endpoint; per-operation report construction performs additional evidence work. | Switching tabs can repeat expensive work. | A shared session-report loader/cache, bounded queries and stale-response protection. |
| P2 | Audit log is a separate table, mostly time-only, without operation-focused filtering. | Reconstructing the event sequence for one mistake requires manual cross-referencing. | Link the selected operation to a dated, filtered evidence timeline. Keep trainee actions distinct from authenticated trainer review events. |
| P2 | Bulk delete uses concurrent requests and generic failure feedback, with no result reconciliation in the failure branch. | A partially successful delete can leave a misleading list. | Per-item results, refresh after partial failure, clearer counts and a retention-aware archive approach. |
| P2 | View/filter/selection state lives in component state, without shareable report URLs. | Reloading, browser navigation or handing a report to another trainer loses context. | Explicit routes/query parameters, restored context and permission-checked deep links. |
| P2 | Existing automated tests largely use small fixtures; report fixtures often contain no operation rows. | Passing tests give limited assurance for dense failures, many sessions or accessible interaction. | Populated failure fixtures, large-history cases, keyboard checks and trainer task-based validation. |

The historical-evidence and provider-truncation concerns are risks identified in code; actual production drift or truncation has not been demonstrated in this assessment.

## 4. Proposed information architecture

Keep three primary navigation destinations. Put operational review first; keep configuration separate.

### Sessions & reports

- **Needs review:** sessions awaiting trainer review, with explicit reasons and counts. Requires persisted review state; do not fake this with a name or `submitted` flag alone.
- **All sessions:** search, status/date filters, sorting, paginated results and clear selected-item scope.
- **Trainee history:** verified account identity when linked; clearly labeled legacy name groups otherwise.
- **Session workspace:** Overview, Mistakes & coaching, Operations, and Evidence. Timing statistics become supporting information rather than a competing report.

### Statistics

- Keep one weighted summary and the shared-scale operation comparison.
- Make data scope, sample count, freshness, missing values and coverage visible.
- Retain per-trainee drill-down and direct access to the underlying session.
- Add recurrence/learning trends only after identity and issue-code coverage support valid comparisons.
- Do not present faster handling as proof of correctness or readiness.

### Settings

- Session defaults, generation rate, queue explanation and configuration history.
- Draft changes and explicit Save/Cancel, field-level validation, server-confirmed saved values.
- Explain total operations/minute versus credit movements, queue capacity and probabilistic scenarios in plain language.
- Do not make queue capacity or scenario rates configurable merely because they are displayed. Those remain separate product decisions.

## 5. The session review experience

### Overview

Show trainee identity/link status, session ID, dates and time zone, live/completed/submitted status, data freshness, and four distinct counts: correct, incorrect, pending and unverified. Show the existing accuracy with its current denominator explained. Do not change the scoring formula as part of this redesign.

Review status is a separate dimension: Not reviewed, In review, or Review complete. Completing a review does not clear follow-up issues, establish a final grade, or approve trainee readiness.

### Mistakes & coaching

Desktop: compact issue list on the left; selected issue detail on the right. Phone: list followed by a dedicated detail view with a clear return action. Do not squeeze the existing 11-column table into a smaller screen.

Each issue should contain:

1. Operation type, game, customer reference and timestamp.
2. Recorded result and a concise mistake title.
3. Expected action/value versus recorded action/value, with correct units.
4. A deterministic explanation based on the recorded evidence.
5. The expected procedure or next step.
6. Expandable supporting evidence and an operation-focused event timeline.
7. Trainer notes and follow-up state, once the persistence/authentication gate is satisfied.

Example, only when the amount evidence actually exists:

> **Amount does not match the request**
>
> Requested: 50 credits. Recorded game action: 40 credits.
>
> The recorded game amount differs from the request by 10 credits.
>
> Expected procedure: verify the account and exact amount before accepting the transaction.

Do not turn an uncertain match into a claim that a trainee acted on a particular account. If evidence is unavailable or ambiguous, say **Unable to verify from available evidence** and expose the missing source. Do not invent motivation, claim negligence, or expose passwords.

### Stable explanation catalog

Introduce stable identifiers for rules such as incorrect terminal action, missing game action, mismatched amount, missing account creation evidence, mismatched account ID, missing refresh evidence and incorrect reconciliation answer. Map to the existing rules and actual scenario semantics; these labels are proposed, not current API identifiers.

Each catalog entry has a rule code, version, title, evidence requirements, explanation template and corrective instruction. “No checks,” pending operations and unavailable evidence are not interchangeable. Reconciliation guidance must never instruct the trainee to execute the movement again.

### Notes and follow-up

Provide session-level notes and operation/rule-level notes. Default to private trainer notes. Showing feedback to a trainee is a separate explicitly designed and authorized feature.

Issue follow-up states:

- **Needs discussion**
- **Discussed with trainee**
- **Practice required**
- **Verified in a later session** — requires an explicit linked session/evidence reference.

Every change records the server-derived author and timestamp. Notes do not edit original operation evidence or its score. Edits retain prior versions; deletion/retention must follow an explicit policy. Prevent duplicate saves and lost updates with idempotency and expected revision checks. Navigation must warn about unsaved drafts. A failed save must never show “Saved.”

Do not automatically mark a mistake corrected because a trainer wrote a note or because a later unrelated session passed.

## 6. Implementation sequence and exit criteria

### Phase 0 — Establish trustworthy state and review boundaries

**Work:** Fix selected-session synchronization; document metric units/denominators and status meanings; establish the server-authenticated reviewer boundary using the accepted ADR and existing Hub identity approach; test historical evidence stability and current query completeness.

**Deliverables:** State/metric contract, auth cutover plan and tests, evidence-source inventory, decision on retention/archive behavior, golden report fixtures covering existing scenario rules.

**Exit criteria:** An externally completed session updates its open view; missing timing is not zero; unknown status is not silently counted as completed; original scores and evidence remain reproducible. Persisted review writes stay disabled until server identity, authorization, CSRF/session handling and direct-object checks pass. No guessed identity links.

### Phase 1 — Make the existing evidence easy to find and understand

**Work:** Compact report list, mistake/result/game/type filters, selected-operation details, deterministic rule explanations, dated evidence timeline, shared report fetch state, truthful live/failure states, and direct links that restore the selected session/view/operation. Keep old evidence accessible during rollout.

**Exit criteria:** A trainer can find an incorrect operation without scanning every table column, read expected versus actual evidence, and inspect the related events. Every explanation cites available structured evidence; incomplete evidence remains explicitly unverified. Original scoring, balances, generation and trainee workflows are unchanged.

### Phase 2 — Add persistent coaching and review

**Dependency:** Phase 0 authenticated-review gate must pass.

**Work:** Add session review records, operation/rule follow-up records, versioned notes and append-only review events. Add Needs review filtering and the note editor. Introduce identity linking only through explicit, authorized relationships.

**Proposed persistence contracts:** `trainer_session_reviews` keyed by session; `trainer_issue_reviews` keyed by session/operation/rule/version; `trainer_review_note_revisions` with body, author, revision and timestamps; `trainer_review_events` for transitions and note changes. Final names/schema should follow repository conventions. Reviewer identity comes from the server session, never the request body. Validate that an operation belongs to its session.

**Exit criteria:** A note survives reload and a second authenticated client; author/timestamps are trustworthy; concurrent edits conflict safely; retries create one change; access restrictions are tested; follow-up links identify the actual later evidence. A note does not affect the original grade. No unauthenticated note endpoint is introduced.

### Phase 3 — Make administration predictable and scalable

**Work:** Server-filtered pagination, bounded complete statistics aggregation, explicit settings Save/Cancel, revision/audit history, clear global-versus-session scope, partial bulk-action outcomes and retention-aware destructive controls. Add recurrence views only when rule/identity coverage permits them.

**Exit criteria:** Large fixtures prove no dropped or duplicated sessions/pages; aggregate totals match the complete dataset; limits and coverage are disclosed. Settings failure preserves the draft and last saved values; rapid edits cannot overwrite a newer configuration. Partial bulk failure reconciles the visible results.

### Phase 4 — Validate the workflow and release incrementally

**Work:** Task-based trainer review, keyboard/screen-reader checks, mobile verification and reduced-motion testing; local real-database gates; feature-flagged deployment with deployment/schema compatibility checks and rollback instructions.

**Exit criteria:** Existing tests plus new failure/review cases pass; original backend/scoring gates remain green; local DB persistence and permission checks pass; a separately authorized production release is smoke-tested on the deployed build. A provider build or mocked browser test is not enough to certify note persistence or usability.

## 7. Validation scenarios

### Information and evidence

- Correct movement, wrong amount, missing game action, already-processed scenario, player-in-game, and both reconciliation outcomes.
- Account creation, reset-password and refresh-balance failures with sensitive values redacted.
- Pending, missing/unverified evidence and historical records without new snapshots.
- The same record produces consistent correctness/counts in overview, list, detail, statistics and exports.
- Notes cannot be attached to another session's operation; note/review actions leave original scores and financial state untouched.

### Navigation, reliability and scale

- Search/filter/sort, back/forward, direct links, reload, session switching, drawer navigation and unsaved drafts.
- Completion by another client updates the open session and removes invalid actions.
- Slow/offline/out-of-order responses, stale data, empty results and retry.
- Data beyond provider row limits, same-name people, unknown statuses and partial bulk-action failures.
- Null duration, true zero duration, zero completed operations, and weighted multi-session averages.

### Persistence and permissions

- Note creation, edit history, author identity, reload/second-client persistence, note failure/retry and revision conflicts.
- Authorized reviewer versus unauthorized identity; direct-object access; CSRF and input validation; redaction and retention behavior.
- New migrations exercised only on the isolated local database before any separately authorized hosted rollout.

### Human usability targets

These are proposed acceptance targets, not measured current performance:

- At least 90% of representative trainer tasks completed without assistance.
- Locate and explain a specified mistake within 30 seconds after opening its report.
- Save a note and assign follow-up within 20 seconds after understanding the issue.
- Return to a related session without losing the original review context.
- No observed confusion between “review complete,” “discussed,” “verified later” and “passed.”

Begin with 3–5 representative trainers using realistic sessions. Adjust targets after the first observed baseline. Confirm terminology and any translation requirements with the actual users before expanding scope.

## 8. Scope decisions to resolve during implementation

Recommended defaults, not extra actions performed by this plan:

| Decision | Recommended starting point |
|---|---|
| Who may write notes? | Authenticated TRAINER; other staff read visibility follows the accepted role policy, not a new broad grant. |
| Can trainees see notes? | Private by default; design explicit feedback sharing separately. |
| Does discussion change a result? | No. Discussion and scoring remain separate. |
| Can names identify a person? | No. Use verified links; retain clearly labeled legacy histories. |
| Can reviewed sessions be permanently deleted? | Prefer archive/retention treatment once review records exist; resolve policy before migration. |
| Should settings remain per-keystroke autosave? | Prefer explicit Save/Cancel with revision checks. |
| Should grading criteria change? | No. Preserve existing calculations and provisional classification unless separately approved. |
| Should we redesign again visually? | Keep the current direction; use motion for selection, disclosure and comparison, with reduced-motion support. |

## 9. Recommended first increment

Start with a populated session report prototype: a compact mistake list, evidence-backed explanation panel and issue-linked audit timeline. In parallel, fix selected-session state and specify the reviewer-authentication contract. This yields a visible review improvement without pretending notes are persistent or reworking the entire dashboard again.

The next increment is durable private notes and follow-up, only after trustworthy server-side reviewer identity and local database verification are in place.

## 10. Implementation progress — 2026-11-02

Executed locally against `main` at `f686b8c`; the reviewed base was rechecked. No repository/ancestor AGENTS.md was found. The existing untracked `outputs/reconciliation-migration/` directory was preserved. No commit, push, hosted migration or deployment was performed.

### Implemented first increment

- Selected session now derives from its ID in the canonical list. External completion removes active-only controls; a mocked polling test exercises this transition.
- Compact report defaults to attention items, ordered incorrect, unverified, pending, then correct. Result/type/game filters and operation/customer search lead to a selected-operation evidence panel. The old full-check report remains in a disclosure.
- Presentation catalog v1 maps existing check labels to stable rule codes, expected/recorded values, conservative explanations and corrective instructions. Credit units and sensitive-value redaction are preserved. Missing/ambiguous checks and unknown statuses stay unverified.
- Dated audit evidence is filtered only by explicit operation linkage. Empty, failed and stale audit/queue states do not assert generator health or fabricate actions.
- The report adds `original_is_correct` before reconstructing correctness and identifies projection version 1. No stored score, balance, operation generation or trainee flow was changed.
- Report/statistics views share bounded ten-second cached loads, failure isolation and late-response protection. A loaded-at timestamp and report refresh make reuse visible. Null timing remains absent; genuine zero remains visible. Unknown directory statuses no longer count as completed.
- Private notes remain unavailable. No persistence endpoint or authentication cutover was introduced. The reviewer-write acceptance matrix, metric contract, evidence inventory and retention dependency are recorded in `docs/TRAINER_REVIEW_CONTRACT_2026-11-02.md`.

### Verification and findings

- Backend full suite: 197 tests passed, including a new no-network report characterization.
- Frontend lint and production build passed; existing main-bundle size warning remains.
- Evidence unit tests: 3 passed (`npm --prefix frontend run test:review`).
- Mocked browser suite: 38 passed (35 existing plus populated evidence, external completion and report retry cases). Final full run after the last report/cache changes passed all 38 tests in 55.0 seconds, including an assertion for the dated audit cell.
- Populated desktop/mobile screenshots: `outputs/trainer-review-desktop.png` and `outputs/trainer-review-mobile.png`. Browser cases verify no horizontal overflow at 390px, reduced-motion rendering and read-only requests. These are automated fixtures, not trainer-observed usability or screen-reader certification.
- The real report builder is reproducible for identical fixture data. Changing joined account balance can change reconstructed correctness while the original stored outcome remains unchanged. This confirms the mutable-evidence code-path risk; it does not demonstrate production drift. The UI now discloses this limitation.
- `npm run local:status` failed with `LegacyStatusDbInspectError`: the `dockerDesktopLinuxEngine` pipe is absent. No reset or DB integration/persistence run followed that failed gate.

### Outstanding dependencies

Phase 0 remains partial: authorized/tested reviewer cutover, immutable explanation snapshots, full scenario golden coverage and actual provider-query completeness are not certified. Provider truncation is not claimed; current queries are unpaginated and coverage of all rows remains unverified.

Phase 1's first visible increment is implemented. Restorable session/view/operation URLs, complete bounded queries, richer scenario-specific explanation coverage, stale-response characterization across all polling sources and task-based trainer validation remain open. Existing legacy name groups retain their unverified warning; no identities were inferred or linked.

Phase 2 remains disabled pending the ADR 0001 gate, explicit retention policy and isolated DB verification. Phase 3 settings revision handling/pagination/partial bulk outcomes and Phase 4 human/local-DB/release checks remain pending. This progress section does not mark the whole plan or any hosted release complete.

## 11. Authorized production read-only check — 2026-11-02

After the user explicitly authorized using production data for checking, hosted SELECT requests were made using the existing backend `.env` target without changing `.env.local`, hosted configuration or any records. Only aggregate results were saved in `outputs/trainer-production-readonly-2026-11-02.json`; names, account identifiers, passwords, raw payloads and credentials were not retained in that artifact.

Observed at approximately 11:19–11:21 America/Lima:

- Sessions: exact count 246, default query returned 246.
- Operations: exact count 5,992, default query returned 1,000.
- Audit log rows across all sessions: exact count 7,043, default query returned 1,000. This confirms the provider cap, not truncation of any particular session timeline.
- A bounded paginated aggregate read traversed all 5,992 operation rows. Of these, 2,966 lacked handling duration; 2,818 were pending, and the same number lacked a stored boolean outcome. No unknown operation statuses or genuine zero handling samples were observed in this snapshot.

The provider cap is now confirmed rather than hypothetical. `buildOperationTimeStats` has been fixed locally to traverse stable primary-key pages, including short provider pages. Failures, nonadvancing results or exceeding the explicit 100,000-row budget reject the aggregation instead of publishing partial totals. The existing arithmetic, grouping, scoring and database state are unchanged. These are live reads, not a frozen transactional snapshot.

The patched local statistics builder was then executed against hosted SELECT queries: it aggregated 3,026 timed operations, exactly matching an independent exact-count query for that filter. The code was not deployed. This verifies current hosted read compatibility and aggregate coverage; it is not local DB persistence, permission, historical drift or release certification.

Backend full suite after this change: 201/201 pass, including four pagination/aggregation cases with data beyond the 1,000-row cap, artificial shorter pages, failure handling and a real statistics-builder total/average assertion. Frontend code is unchanged by this increment; the preceding 38/38 browser result remains applicable to that unchanged UI.

Global timing-statistics completeness is addressed locally for datasets within the explicit row budget. Directory server pagination, per-session report/audit completeness at large sizes, identity/authentication cutover and persistence remain outstanding. Earlier notes that provider limits were unverified are superseded by this section.

## 12. Separately authorized production test-session cleanup — 2026-11-02

The user subsequently requested erasing test/junk sessions and explicitly included `Capacitacion -`, `CAPA CAPA`, keyboard-mash names and test-name variants. This was separate authorization for data deletion, not deployment/schema/authentication changes.

An exact-name, ID-frozen preview identified 54 inactive sessions, with no Hub attempt, practice, assessment or operation-result links. Person-like names, abbreviations and numeric suffixes were preserved. No fuzzy matching was used in the deletion request.

The first bulk root DELETE hit hosted statement timeout `57014`; a read confirmed all 54 selected sessions remained after rollback. The cleanup then succeeded using one guarded root DELETE per session and existing FK cascades, with progress checkpoints. No manual child-first deletion or constraint changes were made.

Final verification:

- Deleted 54 selected sessions; 192 sessions remain (29 distinct entered names).
- Removed dependent rows included 849 operations, 959 customers, 2,127 game accounts, 162 wallets, 11,333 customer transaction-history rows and 296 trainee audit rows.
- No selected sessions or matched junk names remain. All counted dependent records are absent, including a separate zero-remainder check for game history.
- No Hub records were selected for deletion; all tested Hub links were zero before cleanup.

Script: `backend/scripts/cleanup-trainer-test-sessions.mjs` (preview by default; apply requires a current reviewed manifest SHA-256 and validates exact IDs, names, inactive status, target and Hub linkage). Manifest/result: `outputs/trainer-cleanup-manifest-2026-11-02.json` and `outputs/trainer-cleanup-result-2026-11-02.json`. Earlier production count artifacts remain historical snapshots from before this cleanup.

## 13. Commit/push authorization and final checks

The user explicitly authorized committing and pushing these trainer application changes to `main`. Final checks passed: backend 201/201, evidence unit tests 3/3, mocked browser tests 38/38, frontend lint and production build. The existing bundle-size warning remains; local database persistence verification remains gated as described above.

The application commit includes source, tests and these plan/contract documents. One-off production cleanup scripts, cleanup manifests/results, production-read snapshots, generated screenshots and unrelated reconciliation outputs remain local operational artifacts. Their earlier paths document local evidence and are not application runtime dependencies. No schema/authentication change or manual hosted deployment is part of this commit/push step.
