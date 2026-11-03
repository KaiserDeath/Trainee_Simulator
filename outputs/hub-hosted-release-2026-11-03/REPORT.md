# Hosted Hub release verification — 2026-11-03

Application source before the date-format follow-up: main `bdfa0af`. Both GitHub verification jobs passed for that source state. Origin: https://trainee-simulator.vercel.app. Hosted project: `zvpkiwkvwtdztmeyugdg`.

## Hosted migration

Confirmed the active project using the existing `backend/.env.local` configuration, CLI project access and its recorded Hub migration history. The fallback `backend/.env` points at the older project; using that fallback caused the earlier IPv6 query failure. No account credentials were changed.

Applied `20261103008000_training_cohorts.sql` inside one transaction with its migration-ledger entry. Verified the cohort table exists, the migration is recorded, and the authenticated browser database role cannot call the write function. Existing identities and original course/evaluation definitions were preserved. All four formal evaluations remain draft.

## Real browser and persistence checks

Used the deployed frontend, production API, real Supabase Auth and real database, with four temporary identities carrying TRAINER, POSTULANTE, RRHH and a second POSTULANTE role. This run did not mock network responses.

Passed:

- Trainer and learner login through the same-origin browser cookie/CSRF flow.
- Cohort/course assignment and target-date persistence across trainer reload.
- Learner reads its assigned cohort without receiving the membership list; staff directory denied.
- Completion of an actual article in the assigned operator course, followed by browser reload and an independent server learning-path read showing completion.
- Private trainer coaching survives reload; learner reads are denied; RRHH can read its authorized projection.
- The unassigned learner cannot see the cohort.
- A mutation without a CSRF header is denied.

The exact four temporary identities, Auth users, cohort, enrolment/progress/evidence and coaching fixtures were removed after verification. The run started and ended with four pre-existing identities, zero cohorts and ten pre-existing activity-attempt records. Cleanup was scoped to generated UUIDs. See `release-browser.json` for check results and timestamps. Screenshots and the one-off operational harness remain local; no credential values are included in this report.

## UI follow-up

The live check exposed English Hub dates following the browser's Spanish locale. Cohort target dates now use the selected Hub language explicitly while retaining UTC calendar-date interpretation. A browser test using Spanish browser locale and America/Los_Angeles timezone verifies English December 15, 2026 switches to Spanish 15 de diciembre de 2026 without shifting the date. Cohort workflow, learner mobile and date/language tests passed, together with frontend lint/build. The existing bundle-size warning remains.

## Remaining acceptance work

This establishes the exercised hosted learning/cohort/coaching path, not completion of all platform release gates. Formal evaluations still require content publication/acceptance. Full hosted Orion account-to-search and formal-assessment journeys, operational retention/disposal, abandoned-upload cleanup, backup/restore rehearsal and broader accessibility/user acceptance remain open.
