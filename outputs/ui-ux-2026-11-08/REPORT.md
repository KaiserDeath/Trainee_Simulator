# UI/UX delivery — 8 November 2026

This increment implements the task-oriented Hub plan. [Design decisions](../../docs/adr/0012-task-oriented-hub-workspaces.md) explain scope and data handling; [observed-session worksheet](../../docs/UX_VALIDATION_SESSION_2026-11-08.md) is ready for the Capacitador.

## Changes

- Compact phone header and collapsible, labeled staff navigation. Learners, Evaluations and Reports have separate destinations; existing links remain valid.
- Learner directory uses submitted server search and explicit applied scope. Creation forms open on request, preserve input on failure and restore focus when closed.
- Selected learner records combine Overview, Learning, Evaluations, Evidence and Coaching. Returning preserves directory state in the current page session. Evidence still loads by exact attempt through the existing permission checks.
- Overview identifies loaded learners without active course assignments and links to their record. It is a bounded snapshot, not an organization-wide total or inferred failure queue. Refresh remains manual.
- Learners have Practice, Results and Account routes. Learning/practice completion and official submission remain separate; changing language does not alter answer identifiers or grading.
- Results/settings are read on demand, reports disclose their limit and retrieval time, and a failed/unrequested report does not become a zero-result dashboard.
- ADMIN can explicitly refresh queue diagnostics. Accounts with multiple existing roles have a workspace selector; it does not change server permissions.

No production database migration or scoring change is included. Draft evaluation publication and evidence retention rules are preserved.

## Verification

The real local formal-assessment browser gate passed with fixture cleanup: [sanitized report](local-formal-browser.json). It covers actual Auth, bilingual authoring and pinned content, prerequisites, submission, idempotent retries, trainer reopening, evidence authorization and retention. These controlled local fixtures are not human curriculum acceptance.

The full local foundation gate passed: 268 backend tests, 12 shared-rule tests, 61 database-safety checks, 11 language checks, frontend lint/build and **92 browser tests**. Production-build cookie authentication and reload passed. Both production dependency audits reported zero vulnerabilities. Hosted/CI delivery results are checked separately before handoff; use the exact commit in [GitHub Actions](https://github.com/KaiserDeath/Trainee_Simulator/actions/workflows/training-hub.yml).

The production build measured about 264.13 kB entry JS (85.92 kB gzip) plus 321.45 kB Hub route JS (80.95 kB gzip). This is bundle measurement, not billed provider egress or a hosted concurrency guarantee.

Local phone screenshot: [trainer directory](trainer-mobile.png). The automated 390×844 task check verifies search and the learner action appear in the first viewport. Screenshots and automated tasks do not establish human task-completion rates.

## Remaining human validation

Observed usability sessions have not been conducted. The prepared worksheet records task time, assistance, errors, device and language without inventing participants. Curriculum/policy digest review, bilingual curriculum approval and the supervised pilot remain pending in the existing release acceptance configuration. Further attention reasons such as review deadlines require agreed definitions; the shipped attention list uses the concrete no-active-assignment condition only.
