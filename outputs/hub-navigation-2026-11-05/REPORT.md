# Approved Hub navigation and module contract

Date: 2026-11-05

The user approved the Phase 1 visual direction and authorized continued roadmap
execution. This slice implements learner home, an assigned module catalog,
focused module navigation and a Capacitador snapshot using actual authorized
records. Preview sample counts and feedback were not copied into the product.

Every active enrollment is included. Course/module IDs and catalog filters live
in hash URLs; direct reload and Back/Forward retain context. Withdrawn courses
are omitted. Foreign/malformed module links explain unavailability instead of
silently opening another module. Locked module details retain prerequisite
explanations and expose no activity completion controls.

Learning and assessment components stay mounted across learner views. Dirty
inputs warn on leaving; canceling preserves URL and values, and returning to the
workspace preserves inputs. Open assessments prevent workspace navigation and
retain the existing runtime. Saved progress and scoring use the same commands,
idempotency keys and source snapshots as before.

Capacitador home labels the loaded snapshot and retrieval time, with an explicit
Update button. A failed update keeps earlier records visible and explains the
failure. Counts describe loaded records rather than claiming global capacity or
learner competency. Staff tools mount on their first visit, then stay mounted
while hidden to preserve forms and avoid initial reads for unopened tools.

The explicit built-in activity registry selects one renderer. Unknown execution
kinds or surfaces fail closed; official evaluation scaffolds have no generic
article-completion shortcut. This is contract version 1, not a new scoring or
policy version. See `docs/adr/0008-hub-navigation-and-module-contract.md`.

## Evidence

Seven new browser scenarios cover multi-course resume and deep links, catalog
filters and localization, foreign links, dirty-input preservation, empty
assignments, Spanish desktop/320px accessibility and manual staff snapshots.
Model tests cover enrollment isolation, withdrawn records, exact URL IDs and
unknown activity handlers. Existing browser tests now enter the appropriate
learning/evaluation/groups route explicitly.

The real local Auth/Express/Vite/browser gate passed Spanish login and lesson
delivery, unchanged 100/80 grading, retry idempotency, attempt budgets, official
submission, trainer reopening and independent evidence disposal. Exact fixture
cleanup passed. This is isolated local evidence, not human curriculum approval.

`foundation.json`, `local-real-browser.json` and any separate `hosted.json`
record exact verification results. Screenshots use fixture data. Hosted checks
must verify deployed behavior and exact temporary-account cleanup separately.

## Limits and remaining roadmap

This slice has no database migration, new role grant or progress rewrite. The
catalog reuses the existing learning-path payload; no reduction in response
bytes or hosted capacity is claimed. New content, skills/purpose tags, governed
translation authoring and structured reinforcement assignments require the next
slices. Existing coaching/repeat practice and formal reassessment remain intact.

Four evaluation policies remain draft. Actual bilingual content review, the
approved-policy hosted journey and a supervised human pilot remain required.
This delivery is not full release acceptance or a claim that every game-family
adapter has passed native verification.
