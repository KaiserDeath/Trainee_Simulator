# Hub release acceptance

The initial curriculum reviewer and pilot supervisor position is **Capacitador**.
The assignment is configured in `config/hub-release-acceptance.json`: add a
position and change the responsibility's `position` key when the organization
changes. Set `assignedUsername` to the actual reviewer/supervisor. These are
release responsibilities; the file does not grant application permissions.
The assigned person needs the indicated existing Hub role. New application
permission profiles require a separate reviewed RBAC change.

Run `npm run verify:release:acceptance` to list missing records. It deliberately
returns a nonzero exit status while required records are missing. Use
`-- --allow-pending` only to generate a progress report. A completed checklist
still requires checking the referenced authenticated evidence.

## Curriculum decision

Review all 15 modules against
`TRAINING_HUB_CURRICULUM_TRACEABILITY_2026-11-02.md`, including all seven
Checkpoint 1 actions, confidentiality, exception handling and escalation.
Review each of the four draft evaluations in the Hub policy editor. Retain
100% passing, three attempts per set, 20/80 theory/practical weighting and
verified adapters unless an explicit versioned policy decision changes them.
Record the exact policy version/digest and the actual person's dated approval.
Review both English and Spanish wording and record the reviewed display pack
revision (`2026-11-04.1`). Language support does not constitute content approval.
Publish using the existing authenticated policy workflow. Do not translate a
job title or automated validation into a person's approval.

## Hosted journey

After approved publication, use an explicitly designated test learner/cohort.
Verify login, enrollment, instructional completion, prerequisites, theory and
native practical actions, timer expiry, retries, official submission, trainer
evidence review and readiness. Reload and sign in again to verify persistence.
Verify the learner cannot access staff reports or another learner's attempts.
Record hosted URLs, deployed revision, identities by test designation, policy
versions, attempt IDs and trainer receipt in private evidence. Record a
sanitized evidence reference in the acceptance configuration. Never include
passwords, session cookies or answer keys in committed evidence.

## Supervised pilot

The Hub serves new learners **and existing employees receiving reinforcement**.
Ten is the initial supervised-pilot/concurrency target, not a total-user limit.
Local REST/database stress verification has passed 100 simultaneous clients,
including two officially submitted final assessments per client and preserved
original results after TRAINER reopening. This does not certify hosted concurrency.
The release plan has no total-student cap. The current application permits
up to 100 learners per cohort (`backend/src/hub/hubCohortService.js`); larger
populations can use multiple cohorts. That per-cohort bound is not evidence of
100 simultaneous native assessments. Verify larger concurrency before increasing
simultaneous use; a larger roster can train in successive supervised waves.

Configure an existing cohort or an explicit roster of real learners. The initial
`maximumLearners` and `maximumConcurrentLearners` both default to 10 and are
separate configurable planning values; they do not cap the application's total
student population. Include onboarding and reinforcement participants as useful.
Use existing learner accounts and preserve their completion/results. The current
`POSTULANTE` access role identifies the learning interface; it is not an
employment-status determination. Reinforcement can repeat practice; a formal
reassessment uses the existing reasoned TRAINER reopening/new-attempt-set
workflow. Do not erase historical evidence or reopen scored attempts by editing
database rows. New roles or recurring assignment schedules are separate product
changes, not implied by this release configuration.
The Capacitador supervises their use; generated fixture users do not count.
Before starting, confirm approved curriculum, hosted journey and recovery
evidence. Observe keyboard navigation, focus, error recovery, mobile use,
200% text zoom/400% reflow and timed assessments with the participants.
Record attendance, devices, completion, defects and help needed. Pause expansion
for blocked navigation, lost work, incorrect scoring or unreadable content.
Retest fixes before recording the supervisor's dated completion and evidence.

## Recovery rehearsal

The explicit hosted rehearsal command exports the active public, Auth, Storage
and migration schemas/data into a protected temporary directory; seals and
decrypts the archive; restores into a newly named disposable local database;
compares data/schema/security; and restores private file bytes to a separate
hosted private bucket. It deletes/restores only its own temporary source file
and verifies a real Hub signed download. Existing user records/files are not
restored over. Temporary identities, files, buckets and local backup material
are removed. Inspect both `passed` and `cleanupPassed` in its sanitized report.

```powershell
node backend/scripts/rehearse-hosted-recovery.mjs --confirm-rehearsal --project=<active-project-ref> --config=C:/absolute/private/.env.local --report=C:/absolute/sanitized-report.json
```

This is a restore rehearsal, not a production cutover or a retained operational
backup. A deployment recovery still requires a quiet window, retained encrypted
backup and separately stored key, Auth/provider configuration, Storage service
and browser verification, and an authorized cutover target. Never reuse this
script to replace the live database. Never commit exports or credentials.

## Acceptance status

An empty human approval, roster or evidence field means **pending**. Automated
checks and disposable fixtures supply technical evidence only. Release acceptance
requires the actual curriculum decision, hosted journey and supervised pilot
records; four draft policies do not constitute an accepted release.
