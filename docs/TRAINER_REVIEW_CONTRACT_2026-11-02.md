# Trainer review contract — first local increment

Date: 2026-11-02. Base: main, f686b8c. This contract does not authorize a legacy authentication cutover.

## State and metrics

- Selected session is an ID; its current value is derived from the canonical session list. Polling/socket completion removes active-only controls, including the live view. Unknown directory status is not counted as closed.
- Report accuracy retains `buildSessionPerformance`: reconstructed correct results divided by all operations whose status is not PENDING. That historical denominator includes unknown terminal statuses; this increment does not change scoring. Evidence review counts deliberately use a different, conservative classification and do not replace the numeric grade.
- Pending means a recorded PENDING action. Correct/incorrect require structured, populated checks and a known terminal status. Missing, ambiguous, unknown-status and absent-check cases are unverified. Review is not a persisted dimension yet.
- Numbers in amount/balance checks are credits; account identifiers are identifiers. Null/empty timing is unavailable, zero is a real sample. Session statistics omit absent handling samples.
- Explanations have stable presentation codes and catalog version 1. They cite the exact report check, expected value and recorded value; no inferred intent or identity is added. Reconciliation guidance never directs a second movement.
- `original_is_correct` preserves the stored outcome before the existing report correctness projection; `evidence_projection_version: 1` identifies this additive projection. It is not an immutable historical snapshot.

## Evidence inventory and limits

| Source | Use | Limit |
|---|---|---|
| sandbox_operations | Original status/result, request time, sanitized request evidence | Historical fields can be absent; no new snapshots written |
| Joined sandbox_game_accounts | Account ID/game/balance and redacted match checks | Mutable balance/password can cause report drift |
| Game history queries | Matching/related game action and amount checks | Related action is not proof of unique attribution |
| trainee_action_logs | Dated trainee action timeline | Only explicit operation_id or legacy details.operationId links; no time/name guessing |
| Report performance | Existing numeric evaluation | Provisional thresholds; not trainer review completion |

A no-network characterization calls the real report builder repeatedly against intercepted read fixtures. Identical inputs are reproducible; changing the joined balance changes reconstructed correctness while original_is_correct remains unchanged. This demonstrates a code-path risk, not production drift. Password literals remain absent from the resulting report.

Session, operation, statistics and audit queries currently lack complete pagination. No provider cap or production truncation is asserted. Counts describe returned rows; comprehensive coverage remains unverified pending isolated local large-data tests. Report/statistics views share an in-flight loader and an eight-session cache with a ten-second maximum reuse window, freshness timestamp, explicit report refresh and late-response protection. Complete bounded retrieval remains pending.

## Reviewer write gate — disabled

ADR 0001 remains authoritative. No note-write service, route, table or browser save action is introduced. The browser-held legacy trainer token grants no review authorship.

Before enabling private review writes, a separately authorized cutover must reuse the server-validated Supabase identity (`identity/supabaseHubIdentityVerifier.js`), database-held roles, Express HttpOnly session transport and `auth/hubCsrf.js` origin/CSRF protection. Unconfigured identity must fail closed. A TRAINER writer is required; do not broaden ADMIN/RRHH privileges or POSTULANTE visibility.

Required acceptance matrix before persistence:

- unauthenticated/unconfigured identity, forged browser roles, inactive users and non-TRAINER writers are denied;
- origin/CSRF failures are denied before mutations;
- server resolves session visibility and verifies operation/session membership; explicit identity links only;
- author and timestamps come from the server, idempotent retries produce one revision, stale expected revisions conflict;
- notes are private and versioned, linked later verification requires real session/evidence references;
- authenticated second-client/reload tests run against isolated local DB, and scoring/balances/evidence remain unchanged.

Retention decision for this increment: no review retention schema or deletion changes. Archive/retention policy and revision deletion behavior must be agreed before review migrations. Local Docker Linux engine is unavailable; no reset, persistence verification or hosted work was attempted.

## Remaining dependencies

Phase 0 is partial: authenticated cutover, golden coverage of every scenario and complete query verification remain open. Phase 1 first increment is implemented; route-restored deep links, bounded queries and trainer-observed usability remain open. Phase 2 is gated. Phase 3 settings revisions/pagination/partial deletion and Phase 4 local DB/human/release validation remain pending. Hosted migration, deployment, commit and push are outside this handoff.

## Production read follow-up — 2026-11-02

The user subsequently authorized production reads. Aggregate-only evidence is in `outputs/trainer-production-readonly-2026-11-02.json`. The observed default cap is 1,000 rows; there were 5,992 operations and 7,043 audit rows across all sessions. Sessions currently fit (246). This supersedes the earlier unverified-provider-cap statement; no particular per-session truncation has been established.

Global timing statistics now use primary-key pagination through `domain/readAllById.js`, with bounded page size, strict advancement and an explicit 100,000-row ceiling that fails rather than silently truncating. The locally patched builder returned all 3,026 timed hosted operations, matching an independent exact count. Four added backend tests bring the full suite to 201 passing cases. The read is not a transactional snapshot. No write, deployment, migration or authentication change occurred. Local DB/persistence verification and remaining query pagination remain open.
