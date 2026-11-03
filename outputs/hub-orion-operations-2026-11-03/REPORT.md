# Hosted Orion operations verification — 2026-11-03

Source: main `a0ac0e1`. Origin: https://trainee-simulator.vercel.app. Project: `zvpkiwkvwtdztmeyugdg`.

The latest GitHub database job initially failed because its runner could not bind port 54322. Rerunning the failed job completed successfully; both foundation and isolated-database jobs are green for this source state.

## Scope

Exercised the deployed frontend/API/Auth/database using temporary learners, disposable courses made from the native Orion activity types, and disposable simulator worlds. The original curriculum, learner accounts, game balances and four draft formal evaluations were preserved. These runs validate the exercised runtime and UI paths; they do not approve instructional content or certify trainee readiness.

## Operations run

`operations-browser.json` records a passing real-browser run and successful exact-fixture cleanup.

- Refresh Balance: incorrect observations rejected; correct observed Credit and Available Balance accepted; exact retry accepted.
- Add Credits and Withdraw Credits: Backend approval rejected before the game action. One game action was followed by one correct Backend settlement. Repeated game requests and repeated settlement requests did not produce another game-history entry or change the final balances.
- Cancellation before a game action: customer reservation released, game balance/wallet/history unchanged, retry safe. The fixtures were normal movements, so their unnecessary cancellation correctly retained `isCorrect=false` under the existing scorer. Cancellation safety is not reported as a passing operational decision.
- Password Reset: used the server-owned account artifact; game reset followed by Backend confirmation. Exact retries retained one reset action. The confirmation response, retained learning evidence across fixture attempts and immutable reset-operation snapshot did not contain the supplied password literals.
- Activity results survived browser reload. Another learner was denied access to the movement practice.

The final harness corrects initial verification-only mismatches around duplicate module/activity headings, valid HTTP 201 practice creation and the normal-cancellation verdict. No application scoring rules were changed.

## Exception matrix

`../hub-orion-exceptions-2026-11-03/exceptions-browser.json` records four passing browser outcomes:

| Scenario | Existing game action | Expected decision | Verified result |
|---|---|---|---|
| ALREADY_PROCESSED | Applied | Approve existing movement | Correct; no additional game posting |
| PLAYER_IN_GAME | Not applied | Cancel movement | Correct; reservation released |
| PENDING_RECONCILIATION | Applied | It applied | Correct; no additional game posting |
| PENDING_RECONCILIATION | Not applied | It did not apply | Correct; reservation released |

These fixtures were produced through the native exception start command using reproducible seeds. Unmatched seed trials were rolled back inside the setup transaction. The actual decisions were made through the deployed browser, then replayed through the authenticated API. Every replay preserved the original result, game credit and history count. Results persisted after reload.

## Cleanup and limits

Both final runs started and ended with four pre-existing identities, one original course and one original session. Temporary Auth users, identities, courses, module/attempt/evidence records and sandbox worlds were removed using exact fixture UUIDs. Earlier harness attempts also completed their scoped cleanup. Screenshots, manifests and mutation-capable one-off harnesses remain local; no credentials are included in the committed reports.

Next: verify the formal-assessment attempt/submission/reopening and trainer/RRHH review path, then finish operational retention/disposal, backup/restore and accessibility/user acceptance. Formal content publication remains a separate acceptance decision.
