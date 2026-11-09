# UX implementation decisions — 8 November 2026

Status: Implemented and deployed; local, CI and hosted delivery checks are recorded in `outputs/ui-ux-2026-11-08/REPORT.md`.

This increment executes the 6 November UI/UX plan using the existing authorization, course, assessment and coaching contracts. It does not change scores, formal submission semantics, identity permissions, draft-policy publication or training histories.

## Navigation and record ownership

Staff navigation exposes Learners, Coaching, Evaluations and Reports as separate destinations. Existing `#hub-management`, progress, catalog, cohort, authoring and auditor links remain available. The mobile navigation is collapsed behind a labeled button with its expanded state. Multiple-role accounts may choose an existing workspace; the selector does not grant a role or bypass server checks. Account settings remain reachable for every implemented role.

Learner records use `#hub-detail/<identity-id>/<overview|learning|evaluations|evidence|coaching>`. The existing authorized learner-detail endpoint loads only the selected learner. The existing bounded assessment report is filtered by that identity; evidence remains on demand through the exact attempt. Coaching reuses the selected identity rather than downloading the entire learner selector. Tab changes retain the coaching form. Explicit navigation away warns about unsaved coaching entries. Return retains the directory filter and loaded pages within the current page session; a full browser reload reloads data.

No new database migration is needed. Existing report limits and evidence retention still apply; the 500-attempt limit is disclosed. This is not an unlimited chronological export. Original versus reconstructed simulator evidence remains governed by the existing report implementation.

## Information and interaction

Search has draft and applied states. Enter or Search submits server filters, replacing the cursor traversal; Load more uses the applied filters. Editing a search no longer silently filters the visible page. Creation forms open explicitly and return focus to their trigger when closed. Failed saves retain values. Temporary credentials remain confined to the existing authorized success notice.

Overview attention items currently identify **loaded learners with no active course assignment**, using recorded assignment status and the same definition as the existing summary. They are not global totals or inferred failures. No automatic reminders, deadlines or human review obligations have been invented. Additional attention reasons need explicit operational definitions and suitable bounded queries.

Snapshot refresh remains manual. Failed refresh preserves existing overview data with a stale notice. Reports show no invented zero counts before their first successful response. Report receipt time and filters qualify their scope; export uses the applied report filters.

Learner Practice, Results and Account routes separate practice activity completion, learning progress and official submissions. Merely opening a result or evaluation does not start an attempt. Published evaluation cards explain that Start activates the timer and display duration when supplied. Existing attempt prerequisites and runtime controls remain server-authoritative.

## Verification and limits

Changes require the full foundation suite, production-build cookie authentication, real local formal-assessment browser verification and the controlled hosted UX check. Screenshots are inspected at narrow and desktop widths; keyboard, 320px reflow, 200% zoom and reduced-motion checks remain in the regression suite.

The human usability targets in the plan are still unmeasured. Use `docs/UX_VALIDATION_SESSION_2026-11-08.md` for actual observed sessions. Curriculum/policy approval, bilingual curriculum acceptance and supervised pilot completion remain separate release gates. Interface copy is implemented in both languages; it is not a new attestation from the curriculum reviewer.
