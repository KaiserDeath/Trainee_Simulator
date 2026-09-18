# Evaluator key — Operator Technical Test, Form E

**Internal document. Do not hand to the candidate.**

Generated with: `node scripts/generate-operator-technical-test.mjs E`

## Section 1 — key

| # | Requested | Correct answer | Near twins in the registry |
| ---: | --- | --- | --- |
| 1 | `ACC-2H6R-8812` | 14 | `ACC-2H6R-8821` (2) |
| 2 | `ACC-8G4W-7T12` | 3 | `ACC-8G4W-7712` (1) |
| 3 | `ACC-5S3D-4461` | NOT PRESENT | `ACC-5S3D-4462` (1), `ACC-5S3D-4460` (1) |
| 4 | `ACC-4F8K-2O93` | 1 | `ACC-4F8K-2093` (1) |
| 5 | `ACC-1L9O-6304` | NOT PRESENT | `ACC-1L9Q-6304` (1), `ACC-1I9Q-6304` (2) |
| 6 | `ACC-3K7V-2289` | NOT PRESENT | `ACC-3K7V-2298` (2) |
| 7 | `ACC-9C1T-3047` | 16 | `ACC-9C1T-3O47` (1) |
| 8 | `ACC-6Z0N-5583` | 6 | `ACC-6Z0N-5S83` (1) |

## Section 2 — key

| # | Customer | Balance | Held | Requested | Available | Decision | Note |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | C-7355 | 650 | 650 | 25 | **0** | **REJECT** | trap — fits Balance, not Available |
| 2 | C-6890 | 300 | 75 | 180 | **225** | **PROCEED** | clearly payable |
| 3 | C-4702 | 740 | 240 | 500 | **500** | **PROCEED** | boundary — exactly Available |
| 4 | C-2041 | 900 | 350 | 600 | **550** | **REJECT** | trap — fits Balance, not Available |
| 5 | C-5263 | 1200 | 800 | 450 | **400** | **REJECT** | trap — fits Balance, not Available |
| 6 | C-9127 | 1000 | 250 | 700 | **750** | **PROCEED** | clearly payable |

A candidate who ignores Held will answer PROCEED on every trap row. That is the
single most diagnostic mistake in this section.

## Section 3 — key

1. Game action with no Backend decision: OP-4042
2. Backend decision with no game action: OP-4057
3. Settled twice in the Backend: OP-4063
4. Amounts disagree: OP-4029, OP-4084 (250 vs 520, and 140 vs 145)

Five discrepancies in total. Any other reference is a false positive.

## Section 4 — key

### 4.1 Correct order

| Letter | Correct number | Step |
| --- | ---: | --- |
| A | **4** | Check Available funds (Balance minus Held) against the requested amount. |
| B | **2** | Confirm the customer on the request matches the customer on record. |
| C | **5** | Perform the credit on the game platform. |
| D | **1** | Open the request and read the requested amount. |
| E | **7** | Enter the Backend decision once. |
| F | **3** | Find the game account by its exact identifier. |
| G | **6** | Confirm the game platform recorded the credit. |

Score one point per step placed in the correct position.

### 4.2 Rule broken

| Case | Rule | Why |
| ---: | --- | --- |
| 1 | **R2** | The game platform and the Backend keep separate histories. |
| 2 | **R6** | If the evidence is missing, unreadable or contradictory, stop and escalate. |
| 3 | **R2** | The game platform and the Backend keep separate histories. |

## Section 5 — key

| Request | Correct action | Reason | Critical |
| ---: | --- | --- | --- |
| 1 | STOP AND ESCALATE | M1 | **yes** |
| 2 | APPROVE | M6 | no |
| 3 | APPROVE | M6 | no |
| 4 | STOP AND ESCALATE | M4 | **yes** |
| 5 | REJECT | M2 | no |
| 6 | REJECT | M3 | no |

A critical case is one where the evidence does not permit action. Answering
`APPROVE` on a critical case is a critical failure.

## Section 6 — key

1. `ACC-1Z38-4961`
2. `ACC-3DDW-3788`
3. `ACC-T1MH-3355`
4. `ACC-RWZG-3688`
5. `ACC-HG12-0636`

Exact character-for-character match only.

## Scoring

| Section | Item | Points |
| --- | --- | ---: |
| 1 | Correct row or NOT PRESENT (2 each) | 16 |
| 2 | Available correct (1) + decision correct (1), per row | 12 |
| 3 | Discrepancy in the right category (2 each) | 10 |
| 3 | **Penalty:** reference listed that does not belong | −2 each |
| 4 | Step in the correct position (1 each) + rule identified (2 each) | 13 |
| 5 | Action correct (2) + reason correct (1), per request | 18 |
| 6 | Exact transcription (1 each) | 5 |
| | **Total** | **74** |

No section score drops below 0 from penalties.

## Ability profile

Record the five sub-scores separately. The total alone does not say where the
person needs support during training.

| Profile | Sections | Max | What it predicts in the simulator |
| --- | --- | ---: | --- |
| Exact matching | 1 + 6 | 21 | Finding and pasting the exact player; not confusing near-identical accounts |
| Reading account state | 2 | 12 | Respecting held funds and game balance before committing a movement |
| Cross-record reconciliation | 3 | 10 | Game history against Backend history; duplicates and unsettled actions |
| Procedure discipline | 4 | 13 | Verifying before mutating; one game action, one Backend decision |
| Judgment and safe stop | 5 | 18 | Approve, cancel with a reason, or refuse to act on bad evidence |

## Critical failure

Answering `APPROVE` on any critical case in Section 5 invalidates the result,
whatever the total. Someone who processes an operation with contradictory
evidence or a mismatched account causes a real loss; no amount of accuracy
elsewhere offsets it.

## Suggested thresholds

**PROPOSED — not approved.** Do not present these cuts as a hiring decision
rule until they have been calibrated against real cohort results.

| Outcome | Condition |
| --- | --- |
| Suitable | Total >= 80% and every profile >= 70% and no critical failure |
| Suitable with reservations | Total 65–79% and no critical failure |
| Not suitable | Total < 65%, or any critical failure |

"Suitable with reservations" is not a rejection: it names the profile to
reinforce during the first modules.
