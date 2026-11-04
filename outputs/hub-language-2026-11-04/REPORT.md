# Hub English/Spanish consistency — 2026-11-04

The user explicitly requested both languages throughout the Hub, superseding the
old English-only learner rule. This increment fixes a shared product-language
gap; it does not establish final release acceptance or publish the four draft
evaluation policies.

## Behavior

One language context now serves sign-in, ADMIN, TRAINER, RRHH and learners.
Selection persists per account on the device; a guest choice survives login and
reload. Another account's stored preference is not used as that person's
preference. Language changes preserve open forms, selected answers and attempts.
Interface copy, accessible names, notices, native validation, controlled status
labels and dates follow the selection. English interface labels use Participant
instead of the Spanish/internal term Postulante; Spanish uses Participante and
Capacitador. The backend role codes remain unchanged.

The current 15-module curriculum and four seed theory questions have exact-source
display companions in English/Spanish. The backend attaches only translations
matching authorized response fields. Private question companions are restricted
to successful runtime/question-bank/evidence routes and are absent from the
public frontend bundle. Unrelated echoes cannot request private question text.
No question/answer ID, identifier, policy, source snapshot or grade is rewritten.
Pack revision is `2026-11-04.1`; content approval must now explicitly review both
languages and that revision.

Source authoring remains explicitly identified as English; new/changed source
text needs its own reviewed translation. Proper names, account IDs, free-text
coaching, raw evidence/CSV fields and original media retain their source content.
The patch does not machine-translate arbitrary future staff-authored content or
alter the original licensed-game branding/interface outside the Hub.

## Verification

Full local foundation passed: 251 backend checks, 12 shared-rule checks, 61
database-safety checks, three language unit checks, 72 Chromium checks, lint and
production build. Six new bilingual browser scenarios cover all four roles,
reload persistence, Spanish login validation, readable server errors, preserved
form values and mid-assessment answer/input preservation. Spanish role scans
also exercise accessibility and reflow. Static UI keys have Spanish copy and
preserve interpolation parameters; private question stems are absent from the
production frontend bundle. Prototype-like unknown strings cannot use object
prototype members as translation entries.

The real local Supabase Auth/Express/Vite/Chromium gate passed Spanish guest
selection through login/reload, private curriculum companions without early
question-bank disclosure, Spanish question selection followed by English while
retaining the answer ID, unchanged 100/80 grading, retries, attempt budgets,
official submission, trainer reopening and independent evidence disposal.
All exact local fixtures were removed (`local-real-browser.json`). Its small
fixture learning response measured 1,016 canonical JSON bytes and 1,245 with
display companions. This is one local fixture, not hosted egress measurement.

Updated existing tests for learner language availability, Participant naming,
localized human-readable states and the Capacitador label. The manual-update
trainer test now waits for initial audit rendering and counts only actual /api/
requests before asserting no background reads. No polling behavior was changed.

The existing large-bundle warning remains. Catalog/AST tooling is development
only; no external translation provider or API billing was added.

## Remaining release work

Actual Capacitador review of English/Spanish curriculum and the four policy
versions, the approved-policy hosted formal journey and a real supervised pilot
remain pending (`release-gates.json`). Current native verification is for Orion;
local stress tests do not certify hosted capacity or every game-family adapter.
These requirements prevent claiming all functionality is fully release-accepted.

The explicit `verify-hosted-hub-language.mjs` probe creates clearly labeled
temporary roles, reads assigned learning/profile screens, and changes only
browser language. It does not complete activities, start assessments or publish
policies. Its report must show both `passed` and `cleanupPassed`; existing real
identities must be preserved. Hosted evidence is separate from local checks.
