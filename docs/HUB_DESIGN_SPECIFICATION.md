# Hub design specification and current-state inventory

Date: 2026-11-04

Roadmap: [Design and architecture upgrade](HUB_DESIGN_ARCHITECTURE_UPGRADE_PLAN.md)

Phase: 1 — specification and reviewable previews. User approved the visual
direction on 2026-11-05; implementation follows ADR 0008.

## Evidence from the existing application

| Current surface | Source | Design/architecture implication |
| --- | --- | --- |
| Shared page and role branches | `frontend/src/pages/HubPage.jsx` | Keep server identity/role boundaries; extract views incrementally rather than replace authentication |
| Learner course, cohorts, module list, activities and evaluations rendered together | `HubPage.jsx`, `frontend/src/components/hub/HubLearningPath.jsx` | Create separate home, discovery and focused study locations; protect active assessment state |
| Module selection held in React state | `HubPage.jsx`, `HubLearningPath.jsx` | Reload/direct links need stable module identity in the URL |
| Staff navigation uses `#hub-*` with history changes | `HubPage.jsx` | Preserve old links; explicitly test browser Back/Forward as well as hash changes |
| Existing accessible light palette and components | `frontend/src/styles/hub-theme.css`, `hub.css` | Consolidate reusable tokens; avoid returning to low-contrast pale text on white |
| Existing learner path normalization picks one enrollment | `normalisePath` in `HubPage.jsx` | A cross-course catalog must deliberately handle multiple enrollments, not silently show the first course |
| Learning repository already loads authorized course/module/activity data | `backend/src/hub/supabaseHubRepository.js` | Reuse authorization and IDs; discovery summaries must omit lesson bodies and private assessment data |
| Role checks in API, position labels in release configuration | `backend/src/hub/hubAuthorization.js`, `config/hub-release-acceptance.json` | Keep a position title separate from permission grants |
| Reviewed display companions for current curriculum | `frontend/src/i18n`, `backend/src/hub/hubDisplayTranslations.js` | Reuse locale context; future translations need source-version review rather than ad hoc UI strings |

## Review artifacts

Open `outputs/hub-design-phase1-2026-11-04/index.html` for an interactive,
self-contained preview. It has four screens, English/Spanish switching, catalog
search and availability filters. All people, progress, assignments and dates in
the preview are fictional examples. No login, API calls, tracking, external
fonts or persistence are included. A preview link to an assessment is deliberately
absent: no draft policy should look approved because a screen was designed.

The preview demonstrates layout and wording, not an implemented catalog API,
real recommendation engine, learner performance result or permission grant.

## Shared design rules

| Element | Specification |
| --- | --- |
| Page background | `#f4f6f9`; white surfaces; dark readable text |
| Main text / secondary text | `#172b3a` / `#526575`; secondary means less emphasis, not low contrast |
| Primary action | Deep teal `#0b7169` with white text; one dominant action per task region |
| Border / focus | `#cbd5df` for surfaces; distinct dark blue outline for keyboard focus |
| Status | Plain text labels with restrained backgrounds; color never carries meaning alone |
| Type | System sans-serif; 16px body, readable line height; responsive headings |
| Space | Shared 4/8/12/16/24/32/48px scale; predictable card and page padding |
| Inputs/actions | Visible labels; minimum 44px principal targets; no placeholder-only labels |
| Content width | Bounded wide workspace; reading text around 65–75 characters per line |
| Responsive layout | Sidebar becomes compact navigation; cards stack; tables have labeled keyboard-scrollable regions |
| Motion | No motion needed for understanding; honor reduced-motion preference |
| Language | Endonym switch; translated content, controls, dates and errors; preserve entered values |

Do not use gradients, bright badges everywhere, decorative charts without a
decision purpose or the old white-on-white label treatment. Preserve authentic
licensed simulator surfaces outside the Hub shell.

## Four screen specifications

### Learner home

Lead with one next action, its assigned module and the reason it is next. Show
course completion separately from formal assessment status. Provide assigned
training and a compact recent-feedback region. Link into the focused module
workspace; do not start a timer, mutate progress or create an attempt on arrival.

No feedback is a neutral empty state. A learner with no enrollment gets an
assignment explanation rather than a fake percentage or an unrestricted catalog.
Next-action selection is deterministic from server availability/completion;
staff advice is displayed only when there is actual authorized source data.

### Module catalog

Show authorized modules grouped by course, with title, purpose, availability,
completion and a short summary. Search localized display metadata. Filters use
stable values; translated labels cannot alter request semantics. Keep search
and filters in the URL so Back, reload and shared links behave predictably.

Locked modules explain prerequisites. Unassigned modules appear only if the
server deliberately permits metadata discovery. Do not invent duration estimates,
skill tags, recommendations or reinforcement assignments from module titles.

### Module workspace

Use breadcrumb navigation, module context, explicit prerequisites and a focused
activity region. Show the current step and a clear completion control. Keep
content progress separate from evaluation results. Locked content has an
explanation and a link to the prerequisite; opening its URL is never a bypass.

Persist progress through existing server operations. Keep practice state and an
active assessment mounted or require a safe explicit leave flow. Navigation
must not discard unsent work, create retries or reset an assessment timer.

### Capacitador overview

Organize by actionable learner needs, assignments and evidence review. Show
the snapshot time and explicit Update control; do not imply data is live.
Use accessible tables on desktop and compact labeled records on narrow screens.
Reports link to original evidence. Reinforcement and official reassessment are
different actions with different authorization and record-preservation rules.

The preview's sample counts must be replaced with bounded server summaries.
No new global learner download or automatic polling is justified by the design.

## Proposed navigation and compatibility

These are proposed route shapes, to be finalized in an implementation ADR:

| Destination | Proposed URL | Compatibility/guard |
| --- | --- | --- |
| Learner home | `/hub#/home` | `/hub` resolves to role-appropriate home; old learner entry remains usable |
| Assigned catalog | `/hub#/catalog?course=…&q=…&availability=…` | Only server-authorized metadata; validate filters |
| Module | `/hub#/courses/:courseId/modules/:moduleId` | IDs must belong to authorized enrollment; locked states remain enforced |
| Capacitador overview | `/hub#/staff/home` | TRAINER permission; RRHH gets its own allowed read-only summary |
| Existing staff tools | Existing `#hub-*` links during transition | Explicit compatibility mapping; no universal redirect that loses selected record |
| Active evaluation | Existing controlled evaluation entry initially | Preserve attempt lifecycle and direct refresh/recovery behavior |

Hash routing fits the current hosting entry without an immediate server rewrite;
reuse the repository's routing infrastructure if it can provide the same
compatibility. Handle popstate/hashchange coherently, and focus the destination
heading only on deliberate navigation. Skip-link hashes are not product routes.

## State and accessibility acceptance matrix

| State | Required result |
| --- | --- |
| Loading | Named region, stable layout, no fabricated counts or completion |
| Empty assignment | Explain no training is assigned and how to request staff help |
| No search results | Keep query/filter values, show clear reset action |
| Locked | Identify actual prerequisites; disable start while allowing permitted details |
| Read failure | Readable translated error, retry, no false zero totals |
| Mutation failure | Preserve entered values and focus the relevant error |
| Completion | Confirm saved result and offer the next authorized step |
| Retired/unknown module | Safe explanation and return link; preserve historical report access |
| Active assessment | Timer and answers survive supported navigation/reload; prevent duplicate start |

Check keyboard sequence, visible focus, headings, labels, landmarks, 320px
reflow, 400% zoom, long Spanish strings and reduced motion. Run automated scans
and manually inspect representative interactions. WCAG 2.2 AA is the target;
passing an automated scan is limited evidence, not a conformance certificate.

## Implementation handoff

First implement learner home/catalog/module routing using current authorized
data and retained behavior. Add a bounded summary endpoint only where needed.
Verify multiple enrollments explicitly before exposing a cross-course catalog.
Extract one controller/view at a time from `HubPage.jsx`; avoid a simultaneous
rewrite of the page, repository, assessment engine and authorization.

The user reviewed and approved the visual direction on 2026-11-05. The previews
remain fictional examples; current implementation and verification status are
recorded separately in the upgrade plan and delivery reports.
