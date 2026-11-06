# Training Hub design and architecture upgrade plan

Updated: 2026-11-06

Status: Executing the approved direction; human release acceptance remains open.

Scope: The shared Hub that holds current and future training modules.

Execution update (2026-11-06): The user approved the Phase 1 design direction.
Phase 2 learner views, multi-course navigation and the Capacitador snapshot are
implemented, together with the first Phase 3 activity contract and deferred
workspace panels. See [ADR 0008](adr/0008-hub-navigation-and-module-contract.md)
and `outputs/hub-navigation-2026-11-05/REPORT.md` for verification and delivery
status. Phase 4 targeted assignment implementation and local verification are
recorded in [ADR 0009](adr/0009-targeted-training-and-configurable-responsibilities.md)
and `outputs/hub-training-assignments-2026-11-05/REPORT.md`. Hosted assignment
creation, acknowledgment persistence and HR write denial passed with exact cleanup. Phase 5 governed bilingual authoring is implemented, deployed and verified locally
and with disposable hosted records; see [ADR 0010](adr/0010-governed-bilingual-authoring.md) and
`outputs/hub-bilingual-authoring-2026-11-05/REPORT.md`. Fresh CI and hosted delivery
are recorded separately from local checks. Phase 6 and human release acceptance
remain open.

## Outcome

Make the Hub a coherent training platform for both new learners and existing
employees receiving reinforcement. People should understand what to do next,
find relevant modules, resume work safely and see why a result or restriction
exists. Adding a module should reuse the platform rather than require another
separate interface, permission model or progress system.

This extends the [development plan](TREZ_TRAINING_HUB_DEVELOPMENT_PLAN.md) and its
module delivery template. It does not replace approved curriculum, business
rules or the [release acceptance gates](HUB_RELEASE_ACCEPTANCE.md).

## Current baseline and boundaries

The implementation baseline is commit `a4900db`: shared authentication, role
workspaces, a 15-module curriculum, practice and assessment infrastructure,
versioned policies, reporting, cohorts, private media and English/Spanish UI.
The language increment passed CI and hosted language checks for all four roles;
its disposable accounts were removed and five existing identities preserved.
Evidence: `outputs/hub-language-2026-11-04/REPORT.md` and the separate hosted
verification report in that directory.

The four formal evaluation policies remain drafts. Actual Capacitador approval,
the approved-policy hosted assessment journey and the supervised pilot remain
release requirements. Native Orion verification and local capacity results do
not establish support for every game or certify hosted concurrency.

The next phase must preserve:

- English and Spanish throughout supported Hub journeys, including learners.
- Existing identities, assignments, progress, original results and evidence.
- Server-enforced prerequisites, permissions, scoring and attempt lifecycles.
- Manual Update for trainer data; no new background polling by default.
- Separate learning completion, practice results and formal evaluation results.
- Existing authentic simulator interfaces and shared operational rules.
- No fixed total student cap. Pilot size and concurrent capacity are separate.

## Target experience

| Workspace | Main purpose | Primary actions |
| --- | --- | --- |
| Learner home | Know the next useful action | Resume, open assigned module, view feedback |
| Module catalog | Find and understand training | Search, filter by skill/system/purpose, inspect requirements |
| Module workspace | Learn and practice without losing context | Read, practice, review feedback, resume an attempt |
| Capacitador workspace | Assign work and guide improvement | Review learner needs, assign reinforcement, inspect evidence |
| Administration | Govern access and content | Manage people, responsibilities, versions and publication |

An unassigned or restricted module must explain its availability. Catalog
visibility must never bypass enrollment, prerequisite or evaluation permissions.
Learners see only metadata authorized for their audience; private questions and
other learners' records never become catalog data.

## Delivery sequence

### Phase 1 — Information architecture and design specification

Inventory current pages, components and user journeys against actual code.
Identify duplicate navigation and unclear states before designing replacements.
Deliver a route map, shared visual specification and desktop/mobile mockups for
learner home, catalog, module details and Capacitador overview.

Define typography, spacing, surface and text colors, borders, focus indicators,
buttons, inputs, tables, cards, dialogs and status labels as reusable tokens and
components. Start from the current readable light theme; review the palette as
part of the mockups. Avoid another uncontrolled theme rewrite.

Specify empty, loading, blocked, failed, completed and in-progress states. Use
plain language in both locales and visible text alongside status colors.
Design for long Spanish labels, keyboard use, reduced motion, 320 px layouts
and 400% zoom. Set WCAG 2.2 AA as the acceptance target; automatic scans alone
cannot establish conformance.

Exit: reviewable mockups, route map, component inventory and bilingual state
examples are ready for user review before broad visual implementation.

### Phase 2 — Shared shell, learner home and module catalog

Build the first vertical slice using the reviewed specification: shared
navigation, learner home, catalog and module details for existing content.
Use stable URL routes and module IDs so reload, browser Back and shared links
preserve location. Keep compatibility with existing Hub links while migrating.

Home shows assigned work, a server-supported next action, progress and recent
feedback. Catalog exposes useful skill/system/purpose filters and localized
search over authorized metadata. Detail pages show objectives, prerequisites,
availability, activity types and completion expectations. Only show duration
estimates when maintained source data exists.

Reuse current enrollment and progress services. Define a bounded summary API if
the current learning-path payload cannot serve the view efficiently; do not
download every learner, question or attempt to compute dashboard cards.

Exit: an existing learner can sign in, find assigned training, resume it, return
to the catalog and reload in either language without changing learning records.
Verify desktop, mobile, keyboard navigation, direct links and unauthorized access.

### Phase 3 — Explicit module contract and service boundaries

Turn the existing module template into a documented, validated contract backed
by current tables and activity handlers. Inventory existing fields first; add
only missing fields through reviewed additive migrations.

| Contract area | Required behavior |
| --- | --- |
| Identity and discovery | Stable module ID/code, version, skill/system/purpose metadata |
| Localized content | English/Spanish titles, objectives and content version references |
| Availability | Server-owned enrollment, prerequisites and capability checks |
| Activities | Supported activity type, renderer/handler, policy and simulator references |
| Completion | Explicit rule distinguishing learning, practice and formal evaluation |
| Evidence | Durable attempt IDs, immutable source/policy versions and report references |
| Lifecycle | Draft, review, publication, retirement and compatible historical reads |

Each module declares relevant activity types; a theory-only module does not need
a fabricated simulation or formal exam. Existing approved assessment definitions
remain authoritative. Unknown types fail with a useful supported-state message.

Keep the React/Express modular monolith and existing worker. Extract focused
frontend routes/controllers from `HubPage.jsx` as the new slice needs them;
retain the existing service/repository separation in `backend/src/hub`.
Use explicit registration for supported activity handlers, not executable
database plugins. Share account/operation rules with the simulator.

Exit: migrate one theory module and one existing practice module through the
contract with progress, reporting and grading parity, then map the remaining
modules incrementally. Existing attempt snapshots remain readable.

### Phase 4 — Configurable responsibilities and reinforcement paths

Model position names separately from server permissions. Capacitador is the
initial training responsibility; future positions can be configured without
hard-coded display names. Reuse current role guards first. Any delegation or
capability extension needs an explicit permission matrix, server checks and an
audit trail; editing a position label must never grant access.

Add a staff workflow for targeted reinforcement assignments using existing
cohorts, enrollment and coaching records where possible. Distinguish initial
training from reinforcement in the assignment and reports. Preserve earlier
completion and official results; repeated practice and reasoned reassessment
remain separate actions. Prior experience does not silently waive prerequisites.

Exit: authorized staff can assign relevant reinforcement, explain the reason and
review the outcome without overwriting the employee's original history. Test
permission denial and a changed position label as well as the successful path.

### Phase 5 — Sustainable bilingual authoring and publication

Extend the current exact-source display companions into a governed translation
workflow for future authored content. Define source version, locale, translated
version, reviewer and publication status. Reuse existing content versioning and
separate-author approval requirements instead of creating parallel publication.

Show missing or stale translations to authorized authors. Define fallback
behavior explicitly; material advertised as bilingual cannot be published with
an unreviewed required locale. Preserve historical attempt content and keep
question translations private. Names, identifiers, original evidence and staff
free-text remain source records.

Exit: edit a draft, invalidate its old translation review, approve both locales
and publish without changing a historical attempt. Denied roles cannot inspect
private source questions or publish translations.

### Phase 6 — Operational validation and controlled rollout

Verify the complete learner-to-Capacitador journey on the hosted deployment,
including the new navigation, reinforcement and approved formal evaluations.
Run a supervised pilot with new learners and current employees. Record task
completion, confusing labels, navigation failures, resume failures and support
needs; resolve critical findings before expansion.

Measure hosted response sizes, latency and database/storage egress for the new
summary/catalog queries. Test the intended concurrency before increasing it;
100-client local evidence is not a hosted promise. Reuse database and file
recovery procedures, with a fresh rehearsal when a schema/storage change affects
them. Record deployment revision and cleanup/preservation evidence.

Exit: technical gates pass and named people provide the required release
acceptance evidence. Neither screenshots nor green CI substitutes for approval.

## Architecture decisions to record before affected implementation

1. Navigation/URL compatibility and ownership of learner versus staff views.
2. Catalog metadata and bounded summary API, including visibility and indexes.
3. Module contract versioning and incremental mapping of existing activity types.
4. Position/responsibility configuration versus actual authorization grants.
5. Translation review, fallback and publication rules tied to source versions.

Record these as focused ADRs when their slice is ready. Do not introduce a new
framework, service split, LMS replacement or generic plugin engine as a default
dependency of this upgrade.

## Verification and rollback for each slice

Use focused tests for behavior changed by the slice, then the existing required
CI gates. Verify representative roles and both locales, keyboard/focus/error
behavior, reload/resume, and server authorization. Check actual hosted behavior
with disposable records and exact cleanup before claiming deployment success.

Use additive schema changes, compatible readers and reversible route exposure.
If navigation or a module renderer regresses, restore the previous presentation
without deleting progress or rewriting results. Retire compatibility paths only
after migration evidence and an explicit follow-up decision.

## First execution increment

Start with Phase 1 only: current-state inventory, route map, shared design rules
and four representative screen mockups. Review those artifacts before Phase 2
implementation. Keep the release-approval track visible in parallel; design
work does not require prematurely publishing the four draft evaluations.

Plan completion means the roadmap exists. Product completion means its delivered
slices and the separate release acceptance gates have passed.

User assignment (2026-11-06): Egalvez (Edwin Galvez) is the Capacitador for
curriculum review and pilot supervision; his hosted account is active with TRAINER
access. Choose the pilot cohort/roster later. Actual approval and pilot evidence
remain pending; technical delivery continues. See [the bilingual review packet](HUB_CAPACITADOR_REVIEW_PACKET.md).
