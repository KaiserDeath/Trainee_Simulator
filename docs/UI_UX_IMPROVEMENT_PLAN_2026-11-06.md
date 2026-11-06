# UI/UX improvement plan — 6 November 2026

Status: Proposed next implementation sequence after the audit hardening increment. This is a plan, not a claim that the redesigned screens are implemented. Extends HUB_DESIGN_ARCHITECTURE_UPGRADE_PLAN.md and preserves its existing learner navigation, targeted training and bilingual authoring work.

## Evidence and diagnosis

Baseline: application commit `829574c46b6d3ff75641223689773c86b4650b2f`. The screenshots in `outputs/audit-remediation-2026-11-06/` are fresh local browser fixtures, not actual learner records or hosted acceptance evidence.

| Observation | User consequence | Priority |
|---|---|---|
| Trainer mobile has eight navigation choices, repeated workspace headings, three inner navigation cards, then a creation form before learner search | Finding a learner requires unnecessary scrolling and interpreting overlapping sections | P1 |
| People, evaluations and reports share one top-level destination | Users must remember implementation grouping instead of choosing their task | P1 |
| Learner home has a useful continuation card but several explanatory cards before practice and reinforcement actions | New and returning learners have competing paths and repeated instructions | P1 |
| Directory now has bounded server search, totals and load more, but local visible-row filters coexist with submitted server search | A typed term can look applied before the server search is submitted | P1 |
| Progress, formal evaluation outcomes, evidence and targeted assignments are distributed across screens | Trainers must reconstruct a learner's situation before acting | P1 |
| Temporary-password recovery is now enforced, but ongoing account settings are not equally discoverable for learners | Account support remains unnecessarily dependent on staff | P2 |

The audit fixed directory completeness, credential handling, status correctness, accessibility contrast and delivery foundations. The next increment should optimize tasks before adding dashboard decoration.

## Product references and limits

Checked 6 November 2026. TalentLMS has **4.6/5 from 818 G2 reviews**; this is a product-level rating, not evidence that a particular proposed Trez layout is usable. [G2 reviews](https://www.g2.com/products/talentlms/reviews).

TalentLMS documents sequenced learning paths and progress reporting. Adapt the idea of a clear next learning step and scoped drill-down reports; retain Trez's authentic simulator, evidence and versioned formal policies. [Learning paths](https://www.talentlms.com/features/learning-paths), [reporting](https://www.talentlms.com/features/lms-reporting).

Linear's Triage documents an intake queue with explicit review and ownership. Adapt that interaction to trainer attention items: reason, learner, age, responsible person and next action. This is a workflow reference, not an LMS recommendation or a claim about Linear's rating. [Linear Triage](https://linear.app/docs/triage).

These are design inputs, not a recommendation to purchase or migrate platforms. Validate the resulting flows with actual trainers and learners.

## Proposed information architecture

| Audience | Primary navigation | Secondary destinations |
|---|---|---|
| Learner | My training, Practice, Evaluations, Results | Catalog, targeted training, cohorts inside My training; language and password in account menu |
| Trainer | Overview, Learners, Coaching, Evaluations, Reports | Training content, media and cohorts in a management group |
| HR | Readiness, Learners, Reports | Role-permitted cohort views; no new editing rights |
| Admin | People & access, Content, System status | Role-permitted media and configuration; account settings in profile menu |

Navigation exposes only existing permissions. Multiple roles use a clearly labeled workspace switcher without changing authorization. Keep current deep links working through redirects or parameter translation. Confirm bilingual labels with the Capacitador before shipping wording changes.

### Trainer: find, understand, act

Overview begins with a bounded attention list, not an unqualified aggregate score. Each row states a verifiable reason such as no active assignment, submitted evaluation awaiting review, or coaching follow-up due. Only show reasons supported by recorded data; lack of evidence is not a failed attempt. Selecting a reason opens the corresponding learner/detail section with the source record visible.

Learners opens directly to search, applied filters, result count, last retrieved time and rows. Move Create learner behind one explicit button. On desktop, use compact columns: learner, active training, learning completion, formal evaluation status, next action. On mobile, use cards with name, reason/status and one primary action. Do not render wide desktop tables with clipped essential actions.

A learner detail route provides Overview, Learning, Evaluations, Evidence and Coaching. Show the learner identity persistently. Preserve directory query, loaded pages and scroll when returning. Evidence links open the specific attempt/session, preserving original versus reconstructed correctness and author/time for notes. Reopening an evaluation still requires the existing authorized reason and creates the appropriate new attempt set.

### Learner: one reliable next step

Keep the existing continuation decision server-backed. Show course/module, saved progress, prerequisite explanation and a single Continue action. Put other assigned courses immediately below, followed by targeted reinforcement. Keep Practice distinct from formal Evaluations and explain that practice does not change an official result. Never start a timed evaluation merely by opening its card. Show policy, duration, remaining attempts and consequences before the explicit start.

Results separates learning completion, practice history and official submissions. A draft/unsubmitted attempt must not look passed or certified. Keep formal answer keys and restricted failure evidence out of learner responses.

### Mobile composition

Use a compact header with brand, current workspace and account menu. Below it: one page title, optional one-line context, primary action, then task content. Navigation lives in a labeled menu at narrow widths; do not stack full desktop tabs above nested tabs. At 390×844, the trainer's search and at least the beginning of a learner row should be visible without scrolling on a seeded directory. At 320px, prioritize correct reflow and readable controls over a fixed fold target.

## Information and interaction contract

- Every metric has a name, scope and retrieved timestamp. Loaded rows, total matching learners and complete organization totals must be distinguishable.
- Manual Update remains the default. Failed refresh retains the previous successful snapshot with a stale indicator and Retry; never convert a failed request into zero.
- Use one submitted server search state. Enter and Search apply it; edits show a pending state until submitted. Reset cursor when search/status changes; deduplicate appended IDs; Update starts a new traversal. No claim of a database-wide transaction snapshot across pages.
- Do not calculate global totals from the loaded page. If a new attention aggregate is required, add a bounded, authorized server query with documented definitions and measured response size. Do not restore per-person detail downloads.
- Separate account active/inactive, assignment assigned/completed/withdrawn, learning completion, assessment draft/submitted/reopened and operational readiness. Use text plus icons, not color alone.
- Empty states distinguish no records, no matching results, not assigned, permission denied and unavailable data. Each has a permitted next action.
- Forms preserve input on recoverable failure, prevent accidental double submission, display field-level errors and restore focus. Do not automatically retry non-idempotent creation after an ambiguous response.
- Temporary credentials appear only in the authorized success view and are never put into analytics, logs or browser storage. A lost response requires an authorized reset. Account menu supports changing one's own password.
- Reports carry filters, timestamp, policy/attempt provenance and the same role checks as the screen. Export must not silently represent only loaded rows as a complete dataset.
- English and Spanish share semantic states and layout tests. Store stable codes, translate display labels, and preserve reviewed content versions.

## Delivery sequence

Effort is relative engineering size, not a promised calendar estimate. Ship one usable slice at a time.

| Phase | Concrete work and likely files | Dependency / effort | Acceptance gate |
|---|---|---|---|
| 1 — Task layout | Refactor role navigation in `HubPage.jsx`; compact header/account menu; unify directory search interaction in `HubAdminAccounts.jsx`, `HubAssessmentManagement.jsx`, `HubTrainerOverview.jsx`; move creation form to explicit panel; update `hub-theme.css` and locale packs | Current hardening baseline; M | Trainer can search immediately; keyboard navigation and 320px reflow pass; no lost filters on panel close; existing role/API guards unchanged |
| 2 — Learner detail | Stable learner detail URL with tab and return-state; compose existing learning, evaluation, evidence and coaching views; add targeted reads only if existing endpoints cannot supply the selected detail | Phase 1; L | Search → learner → exact evidence → coaching → back preserves context; original results and note authorship retained; direct unauthorized URL denied |
| 3 — Attention overview | Define reasons with Capacitador; implement bounded summary queries only for missing data; link each item to its source and action; show timestamps and manual Update | Phase 2 and agreed definitions; M/L | Every item is explainable; unavailable evidence never counted as failure; no N+1 loading; stale/retry behavior verified |
| 4 — Learner clarity | Simplify home cards; surface reinforcement; consolidate results by learning/practice/formal status; improve prerequisite and timed-start explanation; expose account password settings | Shared shell from Phase 1; M | Learner can resume the correct module, distinguish practice from evaluation, and recover from an error without staff explanation |
| 5 — Consistency and pilot | Shared field/status/empty/error components, bilingual copy review, report scope labels, accessibility checks and observed usability sessions | Phases 1–4; M | Task results below documented; regressions fixed; no release approval inferred from test completion |

Suggested first implementation slice: **trainer mobile shell + Learners search/list + explicit Create learner panel**. It addresses the strongest observed friction, uses already bounded APIs, and can be released without redesigning scoring or database models.

## Validation and measurable outcomes

These are proposed targets; no user-study baseline has yet been measured. Observe at least three trainers/HR users and five learners, including reinforcement users, where available. If the group is smaller, report the actual sample and avoid broad usability claims.

| Task | Proposed success measure |
|---|---|
| Trainer finds a named learner and the relevant latest official evidence | At least 80% complete without help within 60 seconds; record wrong turns and confusion separately |
| Trainer assigns appropriate coaching and returns to the same directory state | At least 80% complete unaided; no lost query, duplicate write or missing author |
| Learner resumes the intended assigned module | At least 80% choose correctly within 15 seconds |
| Learner distinguishes practice from formal evaluation and explains whether a result is official | All pilot participants can explain the distinction before a timed attempt |
| Failure and permission cases | No lost typed input on recoverable errors; no forbidden record/answer leakage; missing data never displayed as zero |

Before each slice: focused component/browser tests for changed behavior, keyboard and visible focus checks, text contrast, 200% zoom and 400% reflow, 320px/390px/desktop layouts, English/Spanish, reduced motion, loading/empty/error/stale states. Follow with the existing foundation gate and applicable real local DB/Auth tests. After deployment, verify the exact revision, selected real flows with disposable records, reload persistence and cleanup. Controlled fixtures are technical evidence, not supervised human acceptance.

Track route JS payload and selected directory response size under a fixed fixture. Keep page size bounded and load detail on demand. Provider egress must be measured independently over representative usage; a faster screen or smaller response is not proof the monthly allowance is safe.

## Release responsibilities

The configured Capacitador is responsible for actual curriculum and pilot decisions. Approval of four policy digests, bilingual wording, the approved-policy hosted assessment journey, and supervised pilot attendance/completion remain separate gates in `config/hub-release-acceptance.json`. Do not publish draft policies, invent approvals or count generated users as pilot participants. Technical readiness and UX testing support those decisions; they do not replace them.
