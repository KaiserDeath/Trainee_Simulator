# Trez Training Hub — Product and Architecture Blueprint

Status: Draft for business validation
Company: Trez
Working product name: Trez Training Hub
Existing application: Operator Training Simulator (`Simulador-dos`)
Existing learning application: Account ID Lab (`C:/Users/OS/PROYECTOS/Evaluations`)
Business-process reference: `C:/Users/OS/Downloads/Guia de Operador Backend.pptx` (18 slides, reviewed 2026-08-19)
Execution roadmap: `docs/TREZ_TRAINING_HUB_DEVELOPMENT_PLAN.md`

Supplemental onsite-training references reviewed on 2026-08-27:

- `C:/Users/OS/Downloads/Training Day 1 (2).docx`
- `C:/Users/OS/Downloads/Day 2 - Operations Training (3).docx`
- `C:/Users/OS/Downloads/Day 3 - Movements Training (2).docx`
- `C:/Users/OS/Downloads/Day 4 Customer Experience Uiux (1).docx`

These four daily documents are partial references. In particular, Backend
material was intentionally removed from them. Their omissions or differences do
not remove Backend learning requirements established by the broader training
structure, the Operator Backend guide, or direct Trez decisions.

## 1. Purpose

Trez Training Hub will be the central learning platform for preparing and evaluating operators.

Neither existing application is the whole product. The Operator Training Simulator will supply realistic Trez Backend and game-backoffice practice. The Account ID Lab will supply the focused learning experience for account-creation structures. Both become reusable capabilities inside the Hub, which combines theory, demonstrations, focused practice, assessments, and full operational simulations.

The objective is to let a trainee progress from understanding a concept to performing the real workflow safely and independently.

### Source precedence

The product must apply business inputs in this order:

1. Direct instructions confirmed by Trez in this project.
2. The Operator Backend guide for workflow, terminology, game families, and operational rules.
3. Supplemental daily-training documents as detailed but partial references;
   their omissions are not evidence that a broader requirement was removed.
4. Existing simulator and Account ID Lab behavior as reusable prototype evidence, not as the business source of truth.

The 11-module order below remains the earlier content baseline. Trez subsequently
approved expanding the pre-training curriculum to include three prerequisite
checkpoint evaluations plus a final readiness evaluation. The final evaluation
therefore moves to the last module in the expanded curriculum and is no longer
fixed to Module 11. Exact expanded module numbering must be defined without
dropping the omitted Backend content. Screenshots and examples in the references
remain source material; credentials, example passwords, and transient production
data must not be copied into source code or training fixtures.

## 2. Real operator workflow

The simulator must reproduce this business sequence:

1. The operator receives an actionable operation in Trez Backend: normally a Movement in `Pending` state or a Transaction/Request in its permitted created or pending state.
2. The operator verifies the operation type, company or license, game, customer or player identifier, amount when applicable, and current status.
3. The operator opens the correct licensed access for the relevant customer-game backoffice.
4. The operator searches for and positively confirms the correct player account.
5. The operator checks the game-side operation history and the Trez customer history before changing any balance or account information.
6. If the requested action is not present, the operator performs it and rechecks the resulting evidence. If it is already present, the operator must not repeat it.
7. The operator returns to Trez Backend and accepts, processes, cancels, or completes the operation as allowed by its definition.
8. The training engine validates the decision, Backend result, and game-side evidence together.
9. The Hub records the result, time, mistakes, assistance used, and learning progress.

The final Backend decision alone is not enough to establish correctness. Scoring must validate the full workflow and the relationship between both systems.

## 3. Product boundaries

### Training Hub owns

- POSTULANTE, TRAINER, ADMIN, and RRHH identities.
- Courses, modules, lessons, and activity sequencing.
- Learning content and training resources.
- Prerequisites, progress, attempts, completion, and certification.
- Assignment of training to individuals or cohorts.
- Trainer-facing progress and performance reporting.
- Read-only RRHH access across all Postulantes to module-completion status and
  sanitized original simulator operation/failure evidence.

### Exercise engine owns

- Focused practice for one operation or skill.
- Guided, independent, and assessment modes.
- Exercise templates, seeded scenarios, hints, and feedback.
- Visibility of only the Backend and game functions required by the lesson.
- Step-by-step evidence and scoring.

### Account ID Lab owns

- Explanation of the three approved account-structure families.
- Interactive construction and breakdown of account IDs.
- Practice from game and customer to account structure.
- Practice from an account structure back to its game and visible customer identifier.
- Immediate formative validation before the trainee enters the simulated game backoffice.

The Account ID Lab is an activity inside the complete Account Creation module, not a separate curriculum module and not a substitute for the end-to-end simulator exercise.

### Full simulator owns

- Mixed operation queues.
- Multiple customer-game backoffices.
- Session timing and workload pressure.
- Session-isolated customer, account, balance, and operation data.
- Scenario orchestration and background game activity.
- Final operational assessments.

### Game adapters own

- Game-specific customer and account identifiers.
- Game-specific navigation and available operations.
- Form fields, validation rules, balance behavior, and action evidence.
- A stable interface that the exercise and simulation engines can call.

## 4. Training content model

The Hub should support these activity types:

| Activity type | Purpose | Uses simulator runtime |
| --- | --- | --- |
| Definition or article | Teach terminology, games, policies, and concepts | No |
| Video | Show an operator or instructor completing a workflow | No |
| Quiz | Check knowledge and decision-making | No |
| Guided walkthrough | Demonstrate a workflow with explanations | Optionally |
| Interactive rule lab | Teach and practice a configurable rule, such as an account structure | Uses Account ID Lab for account creation |
| Quick simulation | Short interactive example without a full queue | Yes |
| Focused practice | Repeated practice of one operation and selected games | Yes |
| Assessment | Independently score a defined skill | Yes |
| Full simulation | Reproduce a mixed operator workload | Yes |

This model allows Trez to add training that is not related to the simulator without creating a separate platform.

## 5. Learning-progression baseline and approved expansion

The earlier confirmed content baseline is:

1. **Module 1 — Understanding the work:** how the casino and gaming ecosystem operates, Trez's role, the operator's role, how customer funds and game balances relate, and the standards expected from operators.
2. **Module 2 — Complete workflow orientation:** game families, Backend access, licenses, customer information, operation categories, and a demonstration or quick simulation that previews everything taught in later modules.
3. **Module 3 — Account Creation:** learn account structures through the Account ID Lab, create the requested player in the simulator, verify the result, and complete the Backend request.
4. **Module 4 — Search for Customer:** find and positively identify the account created in Module 3, using the correct game/license and the taught `Ctrl+F` then `Ctrl+V` self-audit procedure.
5. **Module 5 — Refresh Balance:** verify the player and reconcile the platform balance with the game balance.
6. **Module 6 — Add Credits:** complete the verification-first add-credits workflow and avoid duplicating an existing credit action.
7. **Module 7 — Withdraw Credits:** complete the verification-first withdrawal workflow and reconcile the resulting balances and evidence.
8. **Module 8 — Reset Password:** verify the correct account, apply the game-specific reset policy, and complete the Backend request safely.
9. **Module 9 — Exceptional and advanced operations:** handle approved exceptions, inconsistent evidence, escalations, and any advanced Transaction or Request workflows Trez places in scope.
10. **Module 10 — Mixed-operation practice:** process a realistic combination of learned operations with reduced guidance.
11. **Module 11 — Earlier final-assessment position:** this was the original
    final full-shift-assessment position and remains a scaffold only. In the
    expanded curriculum, three checkpoint modules are inserted as prerequisites
    and the final pre-training readiness evaluation becomes the new last module.

The game-functionality list is a shared capability inventory, not a curriculum order and not a one-capability-per-module design. Each complete operation module references only the capabilities it requires and reuses their authoritative definitions without copying them.

The four formal scored evaluations are three checkpoint modules and one final
pre-training readiness evaluation. They measure readiness to continue into the
real onsite course; passing the Hub does not replace onsite training or certify a
production operator.

### Module 1 — Understanding the work

Module 1 is conceptual and does not require the simulator runtime. It should establish:

- How the casino/customer service ecosystem works at Trez.
- The relationship between the customer, Trez Backend, companies/licenses, and external game platforms.
- The difference between a customer's general balance and their balance inside a game.
- Why operations enter Trez Backend and what the operator is expected to verify, perform, or complete.
- The operator's responsibility for customer funds, account access, accuracy, traceability, and confidentiality.
- The principle that verification comes before action, especially when an operation may already have been completed.
- Expected working standards: follow assigned access, confirm identity and amounts, avoid duplicates, document decisions, escalate uncertainty, protect credentials, and balance accuracy with productivity.
- The consequences of critical errors such as using the wrong license, changing the wrong player, or duplicating a financial movement.

Recommended activities are a short explanation or video, a visual overview of the ecosystem, realistic examples, and a knowledge check. Detailed workflow orientation belongs in Module 2, while hands-on training begins in Module 3 with Account Creation.

### Module 2 — Complete workflow orientation

Module 2 should preview the full set of operations that will be taught later without attempting to teach or assess every detail. It introduces the relationship between the Trez Backend, licensed game access, customer information, game accounts, history, and the verification-first decision process. It can use video, a guided walkthrough, or a quick simulation.

### Applied operation and skill modules

Modules 3–8 are complete applied learning units rather than a list of disconnected game functions. Module 4 is intentionally a focused operational skill module: Search for Customer is not a Backend operation type, but it is a prerequisite competency used by every later operation. A standard applied module should contain:

1. Purpose, terminology, risks, and expected outcome.
2. The reusable Backend and game capabilities required by that operation.
3. A demonstration of the complete workflow.
4. Guided practice with explanations and feedback.
5. Independent practice across supported game families.
6. An assessment that scores sequence, accuracy, decision-making, evidence, and critical errors.

### Module 3 — Account Creation

Account Creation must combine two existing applications into one continuous learning experience:

1. The Hub presents a Create Account request from Trez Backend.
2. The trainee verifies the company or license, customer, requested game, and request state.
3. The Hub opens the Account ID Lab learning activity from `C:/Users/OS/PROYECTOS/Evaluations`.
4. The trainee learns the relevant account-structure family, sees how the identifier is assembled, and practices valid examples.
5. The trainee returns to the linked exercise and opens the correct simulated game backoffice from `Simulador-dos`.
6. The trainee creates the player using the approved game-specific structure or records the credentials generated by the game.
7. The trainee copies and records the created username or Mobile ID as the durable output of Module 3.
8. The trainee returns to Trez Backend and completes the Create Account request with the required information.
9. The Hub scores the complete workflow, including license and game selection, structure accuracy, duplicate prevention, credential capture, Backend completion, assistance used, and time.

Orion Stars is the approved first reference adapter. Its simulated website must
show an Orion-styled success prompt after the player is created, and its browser
tab title must be `Orion Stars`. The Backend terminal interaction is the request
pencil form followed by the created game ID, password, Orion kiosk information,
and Confirm. Account-structure validation is active only in Module 3 and the
final assessment; Free Simulator mode records creation without grading the
identifier structure.

The Account ID Lab is the teaching and formative-practice stage of this module. `Simulador-dos` remains the application stage where the trainee performs the operation. Attempt identity, scenario data, progress, and scoring must remain continuous across both stages, and the created identifier must remain available to Module 4.

### Module 4 — Search for Customer

Module 4 begins with the player created by the trainee in Module 3 so that searching is purposeful and the modules remain connected. The trainee must:

1. Identify the required customer, company/license, and game context.
2. Copy the exact username or Mobile ID created in Module 3.
3. Open the correct game backoffice and navigate to the relevant customer/player list.
4. Press `Ctrl+F` and then `Ctrl+V` as the explicit self-audit procedure.
5. Confirm the exact match using the identifier and any other required customer evidence.
6. Distinguish no match, multiple or ambiguous matches, wrong game/license, and exact match outcomes.
7. Avoid changing account or balance data during a search-only task.

The Hub must preserve a safe recovery path when Module 4 is attempted separately or Module 3 data is unavailable: it may seed a clearly identified training account, while still recording that the account was system-provided rather than trainee-created.

## 6. Training modes

Every simulator-backed activity should declare one mode:

| Mode | Assistance | Scoring | Typical use |
| --- | --- | --- | --- |
| Demonstration | System performs or highlights each step | Not required | Show the workflow |
| Guided practice | Instructions and hints are available | Diagnostic | First trainee attempt |
| Independent practice | No mandatory guidance; retry allowed | Formative | Build confidence and speed |
| Assessment | No hints; controlled attempt rules | Formal | Module completion |
| Full simulation | Mixed operations and time pressure | Formal | Capstone evaluation |

### Approved practice and scored-evaluation policy

Standard learning modules, guided practice, and independent practice allow
unlimited attempts. Each formal scored evaluation is a separate prerequisite
module, requires a score of 100%, and contains a teaching/practice section that
is distinct from its scored section. The scored section provides no procedural
guidance, hints, highlighted controls, step-by-step prompts, or answer-level
correction.

Each scored-evaluation attempt set follows these rules:

1. The POSTULANTE receives at most three scored attempts.
2. After attempt one or two, the POSTULANTE sees the numerical score and attempts
   remaining and may submit the latest result. Submission closes the evaluation
   and forfeits unused attempts.
3. A 100% result still requires the POSTULANTE to confirm submission unless it
   is the third attempt.
4. If no result was submitted earlier, attempt three is submitted automatically
   and closes the evaluation.
5. The POSTULANTE sees the numerical score and whether the checkpoint was
   successful, but not failed answers, failed actions, correct answers, or other
   diagnostic failure details.
6. All attempts, scores, evidence, submission events, configuration versions,
   and prior attempt sets are retained for TRAINER review and RRHH read-only
   audit. The submitted latest attempt is the official result; retention does
   not make earlier attempts official.
7. Only TRAINER may reopen a closed or exhausted scored evaluation. Reopening
   requires a reason and creates a new set of three attempts without deleting or
   rewriting any earlier set. The reason and reopening history are visible only
   to TRAINER and RRHH.

The default score composition is 20% digital theory and 80% practical execution.
TRAINER may adjust those weights only in Advanced Settings on a new version. The
exact weight configuration is bound to every attempt. Because 100% is required,
weighting supports numerical reporting and diagnosis; it does not make any
required theory answer or practical action optional.

Checkpoint 1's default numerical profile is:

- Digital theory: 20%.
- Create Account: 15%.
- Search User: 10%.
- Verify Balance: 10%.
- Add Credits: 15%.
- Withdraw Credits: 15%.
- Review Transaction Records: 10%.
- Reset Password or Edit Information: 5%.

When more than one game family is selected, the practical 80% is divided equally
between the selected families and the same relative action profile is applied
inside each family. Every action remains a required completion condition even
when TRAINER publishes a different versioned weighting.

## 7. Operation definition contract

Each operation must be configured as a versioned definition rather than hardcoded across screens.

An operation definition should contain:

- Stable operation code and display name.
- Category and supported training modes.
- Required Backend information.
- Required game-side action.
- Eligible initial Backend states and any aging or escalation rule.
- Company, license, game family, and game-access preconditions.
- Expected order of steps.
- Supported games.
- Amount, balance, identifier, and status rules.
- Evidence sources to inspect before performing the action.
- Decision branches for `already completed`, `not completed`, `inconsistent`, and `cannot verify`.
- Permitted final Backend actions for each branch.
- Cancellation and rejection rules.
- Evidence required to prove completion.
- Partial-credit and critical-error rules.
- Time expectations and optional service-level targets.
- Feedback messages for common mistakes.

The guide defines three top-level operation categories:

| Category | Operation | Effect | Simulator status | Planned Hub treatment |
| --- | --- | --- | --- | --- |
| Transaction | Purchase | Real-money purchase, described as mostly automated | Not implemented | Learning content first; simulation only after Trez defines scope |
| Transaction | Cashout | Real-money cashout validated through a manual payment-analysis process | Not implemented | Separate controlled curriculum; outside the first simulator slice |
| Movement | Add Credits | Move credits from the customer's general balance into a game | Implemented in prototype | Module 6 |
| Movement | Withdraw Credits | Move credits from a game into the customer's general balance | Implemented in prototype | Module 7 |
| Request | Create Account | Create game access under game-specific rules | Partially implemented across both prototypes | Module 3, combining Account ID Lab and simulator |
| Request | Refresh Balance | Reconcile the platform balance with the game balance | Implemented in prototype | Module 5 |
| Request | Reset Password | Reset game access under game-specific policy | Implemented in prototype | Module 8; policy must be configurable |

Module 4 Search for Customer is not listed in the operation taxonomy because it does not create a Backend Transaction, Movement, or Request. It is a required operational competency and prerequisite for Modules 5–8.

Only operations in an eligible state may be processed. The guide identifies `Pending` for Movements and created/pending states for other categories; exact state rules must be confirmed per operation. The Movement workflow also describes a bot-processing exception: an item remaining in `Bot` for more than two minutes is refreshed and may become manually actionable. This must be modeled as a configurable rule, not a hardcoded timer in the interface.

## 8. Game capability contract

The system must expand from three current games to the guide's baseline of seven game families without duplicating the training engine. A family groups platforms whose navigation and behavior are sufficiently similar to share learning content and adapter logic, while preserving platform-specific overrides.

Each game adapter must expose a standard capability contract:

- Search customer or player.
- Read account and balance state.
- Resolve company, license, and the correct game access.
- Normalize platform terminology for customers, balances, operations, histories, and account editing.
- Add credits when supported.
- Withdraw or redeem credits when supported.
- Create an account when supported.
- Reset a password when supported.
- Refresh or reconcile a balance when supported.
- Apply account-creation naming policy when supported.
- Return structured evidence of actions performed.

Capability support must be explicit. An unsupported combination must be unavailable to course authors and scenario generators.

| Game family from the guide | Current prototype coverage | Target status |
| --- | --- | --- |
| Orion Stars / Fire Kirin | Orion Stars | Validate shared and platform-specific behavior |
| Golden Dragon | Golden Dragon | Validate behavior and extract adapter |
| Ultra Panda / Vblink | Vblink | Validate shared and platform-specific behavior |
| Game Vault | None | Define and implement after first slice |
| Game Room | None | Define and implement after first slice |
| Fortune2Go | None | Define and implement after first slice |
| Blue Dragon | None | Define and implement after first slice |

The guide also references additional platform abbreviations and examples in account-creation rules. Trez must confirm the canonical platform catalogue, family membership, abbreviations, and naming formulas before those rules become executable configuration.

### Capability composition and linked training state

Canonical capabilities must be defined once and referenced by every operation workflow that needs them. A game adapter maps each canonical capability to the labels, controls, validations, and evidence used by that platform. An operation definition composes Backend capabilities, learning activities, and game capabilities without copying their implementation or authoritative rules.

Modules 3 and 4 must use persistent scenario state across the Hub, Account ID Lab, and simulator rather than presenting unrelated exercises:

1. The same attempt and Create Account request provide the customer username, company/license, and game context to the Account ID Lab.
2. The Account ID Lab loads the versioned rule for that game and records practice completion without creating a live or simulated player itself.
3. The linked simulator exercise receives the same context and lets the trainee create the player in the selected game backoffice.
4. The simulator preserves the created player and credentials or identifier for the rest of the attempt.
5. The trainee copies the exact generated username or Mobile ID, completes the originating request in Trez Backend, and the Hub preserves that identifier as the output of Module 3.
6. Module 4 receives the same identifier and player state.
7. The trainee opens the page search with `Ctrl+F` and pastes the identifier with `Ctrl+V`.
8. The trainee uses the exact match to positively confirm the player they created, and the Hub evaluates the linked evidence chain.

`Ctrl+F` followed by `Ctrl+V` is the explicit self-audit procedure taught and assessed in Module 4, not merely a convenience. The simulator must capture enough evidence to distinguish an exact copied-identifier search from selecting an unrelated account. Later modules reference this established search capability without repeating its full instruction unless remediation is required.

### Account-structure policy contract

The rules currently implemented by the Account ID Lab must be migrated into a shared, versioned policy source before production integration. Each game or game family policy should define:

- Credential mode: manually structured identifier or game-generated credentials.
- Approved game initials or prefix.
- Customer-username normalization and maximum visible length.
- Separator, prefix, suffix, and random-digit requirements.
- Password policy and required account fields.
- Uniqueness scope and duplicate-detection behavior.
- Identifier returned to Trez Backend.
- Effective date, version, approval status, and owner.

The existing Account ID Lab demonstrates three structure families and currently stores an editable game catalogue in browser local storage. Its README explicitly identifies most default initials as working assumptions. Those assumptions must not become authoritative training answers until Trez validates them. In the Hub, trainers or administrators may select an approved policy version, but trainees must not be able to change the rules used to score their own attempt.

## 9. Exercise template

A focused exercise should be generated from a reusable template containing:

- Learning objective.
- Operation definition version.
- Allowed company or license context.
- Allowed game family and platform set.
- Training mode.
- Difficulty.
- Seeded customer and account state.
- Linked output from earlier activities, including a player created by the trainee.
- Initial and expected balances.
- Pre-existing history that determines whether the requested action has already occurred.
- Required workflow steps.
- Required self-audit steps, including `Ctrl+F` then `Ctrl+V` where defined.
- Visible Backend sections.
- Visible game sections.
- Hints and feedback.
- Time limit.
- Passing and retry rules.

Example: an Add Credits guided exercise can expose only the incoming Backend movement, relevant customer/history information, correct licensed game access, player search, score or transaction history, the Add Credits function, and the Backend completion control.

An Add Credits scenario must support at least these branches:

1. **Not yet completed:** verify both histories, add the exact amount once, recheck evidence, then accept or process in Trez Backend.
2. **Already completed:** identify the matching prior action, do not add credits again, then accept or process only in Trez Backend.
3. **Inconsistent or uncertain:** do not change the balance; follow the operation's escalation, cancellation, or retry rule after Trez defines it.

## 10. Assessment evidence

The event model should capture evidence such as:

- Operation opened.
- Customer/player identifier created or returned by the game.
- Exact identifier copied.
- `Ctrl+F` page search opened when required.
- `Ctrl+V` used to paste the copied identifier when required.
- Search query matched or failed to match the expected player.
- Correct or incorrect customer selected.
- Correct or incorrect company/license selected.
- Correct game opened.
- Correct or incorrect game account selected.
- Amount entered on the game side.
- Pre-action history inspected.
- Matching prior action correctly identified or missed.
- Game-side action completed.
- Duplicate game-side action attempted or completed.
- Post-action history rechecked.
- The trainee returned to the same player and audited the resulting balance/history.
- Backend information entered.
- Final Backend decision submitted.
- Hint requested.
- Validation error encountered.
- Step corrected after an error.
- Time spent per step and for the whole operation.

Scoring should be derived from immutable evidence using the operation-definition version active when the attempt began.

Changing the wrong player, using the wrong license, or duplicating an already completed financial movement must be modeled as critical errors. Correctly choosing not to mutate the game is a successful outcome when the evidence proves that the operation was already completed.

### Checkpoint 1 practical contract

Checkpoint 1 uses only game-platform work; it must not invent or evaluate the
Backend steps omitted from the supplemental daily documents. TRAINER selects
from game families whose simulator adapters are verified. A new published
version selects all currently verified families by default, remains extensible
to future verified families, and must not allow an unverified family to be
selected.

For every selected family, the POSTULANTE completes all seven required actions
in this fixed sequence before moving to the next family:

1. Create Account.
2. Search User.
3. Verify Balance.
4. Add Credits.
5. Withdraw Credits.
6. Review Transaction Records.
7. Reset Password or Edit Information, according to the verified adapter.

Review Transaction Records is not intrinsically limited to the last three
movements. Its default evaluation window is all available relevant movements
from the previous seven days. TRAINER may configure a different time window or a
specific recent-record count in Advanced Settings. The selected families,
adapter versions, history rule, action sequence, score weights, and all other
evaluation parameters must be retained in the attempt configuration snapshot.
Failure does not remove the evidence or score, and a later attempt restarts the
entire checkpoint, including theory and all selected families and required
actions.

## 11. Recommended architecture

The first production architecture should be a modular monolith with a separate durable simulation worker, not microservices.

### Application modules

- Identity and access
- Training catalogue
- Enrolment and assignments
- Learning content
- Progress and attempts
- Exercise templates
- Versioned capability definitions
- Versioned account-structure policies
- Operation definitions
- Game capabilities and adapters
- Simulation sessions and linked scenario state
- Assessment and scoring
- Audit events
- Trainer analytics

### Runtime components

- React web application with trainee, trainer, and administrator experiences.
- Account ID Lab integrated as a Hub learning activity using shared policy and attempt APIs.
- Authenticated API with role and session authorization.
- PostgreSQL as the authoritative application and training store.
- Object storage or a video provider for media assets.
- Durable worker or job queue for simulation timing and scenario events.
- Authenticated, session-scoped real-time updates.

The exact hosting services remain an infrastructure decision. The domain boundaries should not depend on one hosting provider. The production Account ID Lab should be integrated as a native Hub route or package, not an uncoordinated iframe: authentication, attempt identity, policy versions, accessibility, progress, and scoring must remain under Hub control.

## 12. Reuse assessment of the current project

### Operator Training Simulator (`Simulador-dos`)

### Reuse after refactoring

- Orion Stars, Vblink, and Golden Dragon visual backoffice work.
- Customer and game-account concepts.
- Operation queue presentation.
- Session-isolated sandbox concept.
- Initial scoring and reporting ideas.
- Trainer analytics components.

### Replace or redesign before production

- Browser-embedded trainer password and local-storage authorization.
- In-process session timers.
- Non-transactional operation processing.
- Hardcoded operation/game branching.
- Current audit retention model.
- Incomplete database migrations.
- Weak action-to-operation matching.
- Polling and cleanup behavior in read endpoints.

### Add for the Hub

- Course and module navigation.
- Multiple activity types.
- Assignments and prerequisites.
- Attempt history and progress.
- Content management strategy.
- Training-mode configuration.
- Reusable capability content referenced by multiple modules.
- Persistent cross-activity player state and data lineage.
- Versioned operation definitions and exercise templates.
- Certification and formal assessment results.

### Account ID Lab (`C:/Users/OS/PROYECTOS/Evaluations`)

#### Reuse after refactoring

- The three-family account-structure learning model.
- Live account builder and visual breakdown of identifier parts.
- Game-to-account and account-to-game practice directions.
- Pattern-based validation that accepts any valid random suffix.
- Keyboard-friendly, responsive interface foundations.
- Existing unit tests for normalization, construction, and validation rules.

#### Replace or redesign before Hub integration

- Browser-local game catalogue as the scoring source of truth.
- Unapproved default initials and family assignments.
- Ephemeral score and streak state without trainee attempt persistence.
- Editable rules available in the same trainee experience used for assessment.
- Standalone navigation with no Hub authentication, prerequisites, or completion contract.
- Generated examples that are not linked to the originating Backend request and simulator scenario.

The pure rule behavior should be extracted behind the shared versioned policy contract. The current UI can then be adapted into learning and formative-practice activities, while formal assessment uses server-held rules and immutable evidence.

## 13. First vertical slice

The recommended first release slice is:

1. Trez-authenticated trainee enters the Hub.
2. Trainee views an assigned learning path.
3. Trainee completes Module 1: an explanation of how the work operates, the operator's responsibilities, and expected standards, followed by a short knowledge check.
4. Trainee completes Module 2: a practical operator demonstration delivered as video, guided content, or quick simulation.
5. Trainee enters Module 3: Account Creation.
6. The Hub presents a linked Create Account request and passes its customer and game context into the Account ID Lab.
7. Trainee learns and practices the approved account structure, then passes the formative checkpoint.
8. Trainee opens the correct licensed game backoffice in the simulator and creates the player.
9. Trainee copies and records the generated username or Mobile ID, then returns to Trez Backend and completes the original request with the required account information.
10. Trainee completes an independent end-to-end Account Creation assessment.
11. Trainee enters Module 4 and searches for the account created in Module 3, using the required `Ctrl+F` then `Ctrl+V` procedure and positive identity confirmation.
12. The Hub records progress and the trainer can review the linked learning, creation, search, self-audit, and Backend evidence trail.

This slice validates the Hub, Account ID Lab integration, reusable exercise engine, one game adapter, cross-application and cross-module attempt state, evidence model, scoring, progress, and trainer reporting before expanding to every operation and game.

## 14. First-slice acceptance criteria

- A trainee can access only assigned training.
- A trainer can view but cannot perform the trainee attempt.
- Module 1 explains the Trez/casino operating model, balance relationships, operator responsibilities, critical risks, and expected working standards.
- Module 1 has its own completion state and knowledge check without requiring the simulator runtime.
- Module 2 has its own demonstration completion state.
- Module 3 Account Creation learning content, guided practice, and assessment have distinct completion states.
- The Account ID Lab uses the same game, customer, rule version, and attempt context as the linked simulator scenario.
- A trainee can explain and practice the three structure families, but receives only Trez-approved rules during scored activities.
- The Account Creation exercise creates one persistent trainee-owned player state that remains available throughout the attempt.
- The created username/Mobile ID is recorded in Module 3 and becomes the expected search identifier in Module 4.
- Module 4 receives the player created in Module 3 as its primary search target without recreating or duplicating the account.
- Module 4 instructions explicitly require `Ctrl+F` followed by `Ctrl+V` to find the exact player.
- The evidence trail records the copied identifier, keyboard search/paste steps, match result, selected player, and subsequent self-audit.
- Duplicate player creation or continuing with a different player is detected and scored.
- Capability and account-policy definitions are referenced, not copied, by operation modules.
- The assessment uses a versioned scoring definition.
- The result survives sandbox teardown.
- The trainee can see actionable feedback after permitted attempts.
- The trainer can see result, time, mistakes, and assistance used.
- The active exercise survives an application restart.
- Core trainee and trainer flows pass keyboard and accessibility verification.

## 15. Delivery sequence

1. Validate the guide-derived operation taxonomy, state rules, license model, and game-family matrix.
2. Validate curriculum, roles, progression, scoring, and retention decisions.
3. Define the complete database schema and migration strategy.
4. Add authentication and authorization.
5. Build the Hub shell and learning catalogue.
6. Build the versioned exercise and evidence model.
7. Convert one game into the first standard adapter.
8. Integrate the Account ID Lab as a Hub activity backed by approved versioned policies.
9. Deliver the linked Account Creation vertical slice across the Hub, Account ID Lab, simulator, and Trez Backend exercise.
10. Deliver Module 4 Search for Customer using the account created in Module 3.
11. Validate with Trez trainers and trainees.
12. Expand through Modules 5–9 and then across supported games.
13. Deliver mixed-operation practice and the final full-shift assessment as Modules 10 and 11.

## 16. Business-decision status

Trez approved the following foundation decisions beginning 2026-08-21, with the
role-management revision approved 2026-08-27: username/password authentication
backed by Supabase Auth JWT sessions; TRAINER/RRHH-created Postulantes and
ADMIN-created TRAINER accounts with
generated usernames and initial password equal to username; the role/visibility
boundary in ADR 0001; assigned courses; ADMIN-authored content with a different
ADMIN required for approval; two-year retention; English-only POSTULANTE content;
English/Spanish TRAINER, ADMIN, and RRHH experiences; global TRAINER/RRHH
Postulante management; and read-only RRHH reporting across all Postulantes for module completion and
sanitized original simulator operation/failure evidence. Implementation of
retention deletion operations, bilingual authoring/account-administration
interfaces beyond the implemented administrator progress shell, and hosted
configuration still require deployment acceptance.

Legacy simulator sessions without an explicit Hub identity link retain an
`unlinked` lineage state; trainee-name text is not an identity mapping rule.
RRHH evidence must preserve the original operation outcome and useful failure
facts while excluding password literals, raw request payloads, tokens, cookies,
authorization headers, and comparable secrets.

The remaining open business decisions are:

1. Final public or internal name of the Training Hub.
2. Complete list of current and planned operations, including whether Purchases and Cashouts will ever be simulated or remain learning-only.
3. Canonical platform catalogue, the seven family memberships, and approved abbreviations.
4. Correct workflow, eligible states, bot timeout behavior, and exceptions for each operation/game combination.
5. Checkpoint-specific question banks, evidence rubrics, critical-error rules,
   and content for Checkpoints 2 and 3 and the final readiness evaluation beyond
   the approved common scoring and attempt policy.
6. Expected trainee concurrency and training volume.
7. Deployment, privacy, reporting, backup, monitoring, and first-administrator provisioning requirements.
8. Source and maintenance process for company/license assignments and game access.
9. Escalation behavior when histories are inconsistent or the operator cannot verify completion.
10. Approved account-creation naming formulas and reset-password policies per platform.
11. Whether Account ID Lab configuration is managed only by Trez administrators or through a separate approval workflow.

## 17. Naming rule pending brand approval

Until Trez confirms final product naming:

- Use **Trez** as the company name.
- Use **Trez Backend** for the internal backoffice in product documentation.
- Use **Trez Training Hub** as a working product name only.
- Use **Operator Simulator** for the reusable full simulation capability.
- Do not perform a repository-wide UI rename yet.
