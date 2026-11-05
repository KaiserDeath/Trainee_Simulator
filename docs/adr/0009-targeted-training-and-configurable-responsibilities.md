# ADR 0009: Targeted training and configurable responsibilities

Date: 2026-11-05

Status: Accepted within existing role permissions; business sign-off remains separate.

## Responsibility versus permission

Capacitador remains the initial training position in
`config/hub-release-acceptance.json`. Position labels and responsibility mappings
are configuration, not permission grants. Future positions can be added and
mapped there to an existing required Hub role. The acceptance checker rejects
unknown positions or roles. Changing a label cannot grant access or assign an
actual reviewer automatically. Named reviewer and pilot assignments remain open.

Do not create another authentication model or infer a staff permission from a
position title. A future change to the permission matrix requires a separate
explicit authorization decision and matching server checks.

| Action | TRAINER / Capacitador | RRHH | Learner | ADMIN |
| --- | --- | --- | --- | --- |
| Read targeted assignments | Selected learner | Selected learner | Own only | No additional grant |
| Create/cancel assignment | Yes | No | No | No additional grant |
| Acknowledge review | No proxy acknowledgment | No | Own assigned record | No |
| Verify with later module evidence | Yes | No | No | No additional grant |

An identity carrying POSTULANTE does not gain broader visibility or training
write authority by also carrying a staff role. Both API role checks and database
functions enforce the relevant boundaries.

## Training assignments

Keep targeted assignments in separate records with onboarding/reinforcement
purpose, target module, learner-visible reason, optional advisory target date,
revision, actor and immutable event history. They do not enroll a learner,
waive prerequisites, rewrite course progress or start/reopen formal assessments.
Creation requires an active learner with a non-withdrawn enrollment in the
target module's course. Counts/pages do not impose a total-student cap.

Acknowledgment records that the learner reviewed the assignment; it is not a
pass or certification. Trainer verification requires a later completed attempt
for the exact learner and target module. Old attempts and original grades stay
unchanged. Completed lesson review, repeat mixed practice and formal reassessment
are different flows. An assignment does not make every completed native exercise
repeatable; use existing mixed practice or controlled formal reassessment where
appropriate.

All mutation commands use revision checks and idempotency claims. Read pages
contain at most 50 assignments. Staff module choices contain at most 200 assigned
module metadata rows and disclose that limit; larger catalogs need an additional
module lookup/pagination slice. No global catalog body download is added here.

RLS is enabled and direct table access is revoked, including service-role table
writes. Only service-role functions with a verified external subject can act.
Audit events reject mutation. No permanent-delete command is introduced; retain
records under existing Hub retention requirements and extend governed disposal
separately before implementing deletion.

## Delivery and recovery

Migration `20261105000000_targeted_training_assignments.sql` adds two tables,
indexes, functions and grants. It changes no existing learner, enrollment,
progress, policy, question, result or media rows. Verify migration history and
object-name absence against the explicit hosted project before application.
Run the migration from the prior local state, transactional SQL cases, a fresh
CI database and local backup/restore verification before hosted delivery.

Forward checks include function permissions, learner isolation, denied HR writes,
retry/conflict behavior, acknowledgment without verification, later-evidence
requirements, cursor paging and preservation of an original result.

Rollback restores the previous application presentation/API while retaining
new assignment/audit records. Do not drop tables or delete real assignments as
an application rollback. Hosted acceptance uses only owned disposable identities
and records; cleanup checks provenance and external dependencies before removing
those exact fixtures. Unrelated identities, assignments and evidence remain.
