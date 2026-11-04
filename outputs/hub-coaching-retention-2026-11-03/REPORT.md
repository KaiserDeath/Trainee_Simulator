# Reviewed coaching disposal — 2026-11-03

Delivered in the private Coaching workspace, retaining TRAINER write / RRHH
read boundaries. ADMIN and learners cannot access retention metadata or actions.

The effective deadline includes at least two calendar years after the newest
revision. Only closed/verified notes without a hold or protected linked attempt
can be requested. A different active TRAINER must approve. Approval rechecks the
exact revision state and current protections under a per-learner lock shared
with edits and holds. Cancellation leaves the note intact.

Approved deletion removes only the selected note and revisions. Minimal audit
receipts and hashed retry markers retain no coaching body. Original create
retries cannot resurrect disposed text. Direct service-role writes were revoked;
ordinary immutable guards remain active. A forged session marker without an
executing reviewed request does not permit deletion. The original save function
cannot be invoked directly by the service role.

Passed verification:

- Fresh local migration/seed replay, followed by all nine transactional Hub
  workspace/evaluation/cohort/retention suites, with fixtures rolled back.
- Recent revisions, open cases, active holds, protected linked attempts and
  stale requests block disposal. Self-approval and ordinary deletion fail.
- Independent approval removes exact text; request/approval retries are stable;
  old create retries fail. Other notes and linked attempt records remain.
- Real local Auth/API: anonymous/role/CSRF denial, independent approval, exact
  retry and a concurrent revision/disposal race. Either the new revision wins
  and protects the note, or disposal wins and the stale edit is rejected.
- Database backup/restore: 73 table hashes/counts and security/schema definitions
  match. All nine suites pass on the recovered database; retained fixture data
  survive the second restore. All scratch databases, archives and Auth fixtures
  were removed.
- Full foundation: 240 backend, 12 shared-rule, 61 database-safety, 58 mocked
  browser checks, lint/build. Final spacing changes also passed lint/build and
  three focused browser checks. The phone review form passed sampled 4.5:1
  contrast, keyboard focus and overflow checks, and was visually inspected.

Hosted migration was applied transactionally with its ledger entry. Real
service-role REST preview for existing staff/learner records passed read-only.
Zero notes/revisions, four identities and four draft evaluations are preserved.
Direct delete, browser execution and old-save bypass permissions are denied.
No hosted text was disposed; hosted end-user disposal/deployment acceptance is
not claimed. Existing build chunk-size warning remains.

Age fixtures advance timestamps locally; they do not wait two wall-clock years.
Formal evaluation evidence, attempt budgets, readiness/progress and simulator
records are unchanged. Formal evidence disposal remains separate work. Existing
backup/export copies are outside this live-table operation. This does not
establish legal compliance or complete end-to-end hosted retention operations.
