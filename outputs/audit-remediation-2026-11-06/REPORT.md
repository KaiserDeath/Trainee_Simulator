# Audit remediation and delivery evidence — 6 November 2026

The architecture/security/data-handling remediation is implemented. The next product work is specified in [the UI/UX plan](../../docs/UI_UX_IMPROVEMENT_PLAN_2026-11-06.md). Human release acceptance remains pending.

## Delivered changes

- Updated vulnerable production backend dependencies; production npm audit is zero for both backend and frontend at verification time.
- Random temporary passwords for new users and staff resets; enforced replacement before training/simulation access; learner self-service password-change API; replacement session cookies after password changes.
- Bounded, authorized directory RPCs with search, cursor, count and retrieval metadata; eliminated production directory N+1 learner-detail loading and silent 1,000-row truncation. Browser selectors enumerate bounded pages when a complete selector is required.
- Corrected active-assignment counts, clarified loaded-row scope and retained manual refresh.
- Enforced frontend CSP and API no-store/security headers, bounded login admission, request IDs and ADMIN-only process/queue diagnostics.
- Added database/worker readiness independently from liveness, and graceful worker shutdown.
- Split application routes with loading/reload recovery. A production build reports entry JS **264.00 kB / 85.86 kB gzip**, compared with the audit baseline **773.64 kB / about 205 kB gzip**. The Hub route is another **308.02 kB / 77.81 kB gzip** fetched for Hub use. Entry reduction is not the total login payload reduction.

Architecture and migration rationale: [ADR 0011](../../docs/adr/0011-audit-hardening-and-bounded-directories.md).

## Verification boundaries and evidence

| Gate | Result / evidence |
|---|---|
| Full local foundation | 268 backend tests, 12 shared-rule tests, 61 database-safety checks, 11 language checks, frontend lint/build and 89 browser tests passed |
| Real local Auth | Account creation, mandatory password replacement, own-password changes, reset and cookie persistence passed |
| Directory integration | 1,005 learners, bounded traversal without duplicates, search, summary counts and public/role denials passed in real local PostgreSQL |
| Workspace / worker | 12 workspace scenarios and durable worker/recovery checks passed |
| Local restore | 78 tables plus schema/security/Auth checks and nonempty formal evidence restored; [report](local-recovery.json) |
| Hosted additive migration | `20261106000000`; service-only function privileges verified; [report](hosted-migration.json) |
| Hosted application | Exact `829574c46b6d3ff75641223689773c86b4650b2f` revision verified ready through Vercel proxy; CSP, real staff/learner temporary-password replacement, reload, reset, directory and role-denial checks passed; [report](hosted.json) |
| Hosted bilingual regression | Four roles, English/Spanish switch and reload, Spanish assigned curriculum/navigation, no private bank or draft-policy start controls; all fixtures removed and five original identities preserved; [report](hosted-language.json) |

Hosted directory fixture response was 435 bytes for one filtered learner. This is a response-size observation, not a provider billing or capacity benchmark. Queue diagnostics at that observation reported zero ready/running/dead jobs and expired leases; that is a point-in-time snapshot.

Initial hosted attempts exposed an expired local service credential and a verification-script reload race. The working private configuration was used, the script now awaits password completion, and the successful report confirms cleanup. No credentials are committed. CI's initial production-auth step inherited NODE_ENV=test; the corrected step explicitly builds with NODE_ENV=production and passed locally. The full isolated-database CI job passed on `4306878`, including fresh migration setup, Auth, capacity, formal browser and recovery. The final application source is `dbca49e`; its 25 focused trainer browser tests, lint and 11 language tests passed locally. CI status for the delivered commits is available in [GitHub Actions](https://github.com/KaiserDeath/Trainee_Simulator/actions/workflows/training-hub.yml); consult the exact commit rather than assuming an earlier green run covers later edits.

## UX evidence and next action

Local fixture screenshots: [trainer mobile](trainer-mobile.png), [trainer directory desktop](trainer-directory-desktop.png), [learner mobile](learner-home-mobile.png). The hosted Spanish learner screenshot accompanies the language report. Local fixture screenshots show usability/layout conditions; they do not count as real learner acceptance.

First planned increment: compact trainer navigation, immediately visible learner search, and an explicit Create learner panel. Subsequent phases unify learner detail/evidence/coaching, add explainable attention items, simplify learner next steps and validate with users. The plan includes benchmark sources, file-level scope, data contracts, accessibility and measurable task criteria.

## Remaining operational and human work

1. The configured Capacitador must record actual curriculum approval, all four reviewed policy digests and English/Spanish review. Draft policies remain drafts.
2. Complete and attest the approved-policy hosted assessment journey; then select actual pilot learners and record supervised completion. Disposable technical fixtures do not satisfy either gate.
3. Monitor provider egress over representative usage. Process counters and smaller pages do not establish monthly Supabase consumption or hosted concurrency capacity.
4. Readiness/diagnostics are delivered; an external alert destination and paging service are not configured. Retained encrypted backups and cutover runbooks remain operational responsibilities; a disposable restore rehearsal is not a retained backup or full production cutover.
5. Existing username-password accounts are upgraded at next successful sign-in. Existing sessions were not bulk revoked. Coordinate remaining staff credential rotation; MFA/SSO and distributed edge throttling remain future identity decisions.

The release-acceptance checker still reports pending roster, curriculum, policy digest, bilingual review, hosted journey and supervised pilot evidence. It was intentionally not populated with invented approvals.

## Hosted recovery completed

The actual hosted export restored into an isolated local database with **114 tables**, matching table hashes/schema/RLS/grants and recovered Auth checks. The one archived private file was restored and hash-verified in an isolated private hosted bucket, public access was denied, and restoration of the exact disposable source file passed a Hub-signed download. All temporary material was removed and the five original identities were preserved. [Sanitized hosted recovery report](hosted-recovery.json). This is a rehearsal, not a retained backup or production cutover.
