# Targeted onboarding and reinforcement assignments

Date: 2026-11-05

Trainers can assign a module already belonging to a learner's active course,
with onboarding/reinforcement purpose, a learner-visible reason and optional
advisory target date. Learners open their own assignments from home and can
acknowledge review. HR reads selected learner assignments without write controls.
Trainers verify only with later completed evidence for that exact module/learner.
Acknowledgment does not certify competency. Original completions and results
remain separate; assignments do not reopen completed exercises or formal exams.

The existing Capacitador responsibility configuration remains extensible to
future position names without changing permission grants. Actual reviewer and
pilot assignments still require human input. See ADR 0009 for the role matrix,
record preservation, migration preconditions and rollback guidance.

## Local verification

Transactional database cases passed learner isolation, HR write denial, retry
identity, rejection of changed retry payloads, acknowledgment without competency,
rejection of old verification evidence, acceptance of later exact-module evidence,
original result preservation, audit revisions, cursor paging and public/direct
table permission denial. Every SQL fixture rolled back.

Three new browser checks passed trainer creation with failed-save retry and
preserved fields/key, learner acknowledgment without administration/verification
controls, Spanish acknowledgment wording, and HR read-only access. Three backend
checks passed API roles, verified-subject binding and invalid-input rejection.

The full foundation gate passed 254 backend checks, 12 shared-rule checks, 61
database-safety checks, seven language/model checks and 82 Chromium checks, plus
lint and build. Recovery verification backed up/restored the isolated database
with schema/privilege/data hashes matching, then ran all current transactional
workspace cases and a second restore containing nonempty evidence. Cleanup passed.
The recovery runner's former literal "ten" label was corrected to the actual
case count; the assignment case is included through the shared case registry.

Exact reports are `foundation.json`, `local-recovery.json` and any separate
`hosted.json` generated after deployment. Browser checks use synthetic records;
they are not human competency or release approval evidence.

## Hosted delivery and remaining work

Hosted schema preview must name only the assignment migration for project
`zvpkiwkvwtdztmeyugdg`, with vault/seed/role updates excluded. Require fresh CI
database checks before applying it. The hosted probe creates one assignment for
its own disposable learner, acknowledges it and verifies HR denial. It does not
complete learning, verify competency, publish policies or start an assessment.
Its report must show both functional success and exact fixture cleanup, with all
original identities and assignments preserved.

The staff module picker is bounded to 200 assigned modules and explains that
limit; this is not a learner cap. New authored translations, broader metadata
discovery and hosted concurrency expansion remain separate work. Four formal
evaluations remain draft pending actual bilingual curriculum/policy approval,
followed by the approved hosted assessment journey and supervised pilot.
