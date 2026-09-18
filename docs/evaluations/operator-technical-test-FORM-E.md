# Operator Technical Test — Form E

Candidate: ______________________________   Date: ____________

Total time: 50 minutes. Each section shows its suggested time.

## Before you start

- This test does not assume any prior knowledge of a game platform or of
  company procedure. Every rule you need is printed below.
- All accounts, customers, amounts and records are fictional.
- Flagging something that is actually correct **loses points**. Do not answer
  from suspicion; answer from what you verified.
- Write only on the ANSWER SHEET of each section.
- Pencil and scratch paper are allowed. Calculators and phones are not.

## Operating rules

- **R1.** Do not act on a request until both the customer and the game account on the request match the records exactly. A single different character is a different account.
- **R2.** The game platform and the Backend keep separate histories. A game-side action is recorded only in the game history; a Backend decision is recorded only in the Backend history. One game action must produce exactly one Backend decision.
- **R3.** Adding credits places a hold on the customer funds. `Available = Balance - Held`. Only Available may be committed.
- **R4.** A withdrawal may proceed only if the game account balance covers the full requested amount.
- **R5.** Every rejection or cancellation requires a reason code. A decision without a reason is not valid.
- **R6.** If the evidence is missing, unreadable or contradictory, stop and escalate. Do not act on a request you cannot verify.

---

## Section 1 — Account lookup

Suggested time: 9 minutes. Rule in play: **R1**.

For each account requested, write the **row number** of the registry entry that
matches it **exactly**, character by character. If no exact match exists, write
`NOT PRESENT`. Several entries are nearly identical; one different character
makes it a different account.

### Account registry

| Row | Account |
| ---: | --- |
| 1 | `ACC-4F8K-2O93` |
| 2 | `ACC-4F8K-2093` |
| 3 | `ACC-8G4W-7T12` |
| 4 | `ACC-1I9Q-6304` |
| 5 | `ACC-9C1T-3O47` |
| 6 | `ACC-6Z0N-5583` |
| 7 | `ACC-6Z0N-5S83` |
| 8 | `ACC-2H6R-8821` |
| 9 | `ACC-3K7V-2298` |
| 10 | `ACC-5S3D-4462` |
| 11 | `ACC-5S3D-4460` |
| 12 | `ACC-7B2M-1150` |
| 13 | `ACC-8G4W-7712` |
| 14 | `ACC-2H6R-8812` |
| 15 | `ACC-1L9Q-6304` |
| 16 | `ACC-9C1T-3047` |

### ANSWER SHEET — Section 1

| # | Account requested | Row, or NOT PRESENT |
| ---: | --- | --- |
| 1 | `ACC-2H6R-8812` |  |
| 2 | `ACC-8G4W-7T12` |  |
| 3 | `ACC-5S3D-4461` |  |
| 4 | `ACC-4F8K-2O93` |  |
| 5 | `ACC-1L9O-6304` |  |
| 6 | `ACC-3K7V-2289` |  |
| 7 | `ACC-9C1T-3047` |  |
| 8 | `ACC-6Z0N-5583` |  |

---

## Section 2 — Available funds

Suggested time: 8 minutes. Rules in play: **R3**, **R4**.

Each row shows a customer, the Balance held at the Backend, the amount already
Held against pending operations, and the amount a new request asks to commit.

For each row write the Available amount and whether the request may go ahead.
Write `PROCEED` or `REJECT`. A request equal to Available may proceed.

| # | Customer | Balance | Held | Requested |
| ---: | --- | ---: | ---: | ---: |
| 1 | C-7355 | 650 | 650 | 25 |
| 2 | C-6890 | 300 | 75 | 180 |
| 3 | C-4702 | 740 | 240 | 500 |
| 4 | C-2041 | 900 | 350 | 600 |
| 5 | C-5263 | 1200 | 800 | 450 |
| 6 | C-9127 | 1000 | 250 | 700 |

### ANSWER SHEET — Section 2

| # | Customer | Available | PROCEED / REJECT |
| ---: | --- | --- | --- |
| 1 | C-7355 |  |  |
| 2 | C-6890 |  |  |
| 3 | C-4702 |  |  |
| 4 | C-2041 |  |  |
| 5 | C-5263 |  |  |
| 6 | C-9127 |  |  |

---

## Section 3 — History reconciliation

Suggested time: 10 minutes. Rule in play: **R2**.

These two histories cover the same shift. The game history records what
happened on the platform; the Backend history records the decisions taken.
Under R2 they should line up one to one. They do not.

### Game history

| Reference | Account | Action | Amount |
| --- | --- | --- | ---: |
| OP-4015 | `ACC-4F8K-2093` | CREDIT | 120 |
| OP-4029 | `ACC-7B2M-1150` | CREDIT | 250 |
| OP-4036 | `ACC-9C1T-3047` | DEBIT | 75 |
| OP-4084 | `ACC-6Z0N-5583` | CREDIT | 140 |
| OP-4090 | `ACC-3K7V-2298` | DEBIT | 95 |
| OP-4071 | `ACC-1L9Q-6304` | DEBIT | 45 |
| OP-4050 | `ACC-5S3D-4460` | DEBIT | 60 |
| OP-4042 | `ACC-2H6R-8821` | CREDIT | 300 |
| OP-4063 | `ACC-8G4W-7712` | CREDIT | 200 |

### Backend history

| Reference | Customer | Decision | Amount |
| --- | --- | --- | ---: |
| OP-4050 | C-5263 | APPROVED | 60 |
| OP-4036 | C-4702 | APPROVED | 75 |
| OP-4063 | C-7355 | APPROVED | 200 |
| OP-4063 | C-7355 | APPROVED | 200 |
| OP-4029 | C-3118 | APPROVED | 520 |
| OP-4090 | C-2041 | APPROVED | 95 |
| OP-4015 | C-2041 | APPROVED | 120 |
| OP-4084 | C-9127 | APPROVED | 145 |
| OP-4057 | C-6890 | APPROVED | 180 |
| OP-4071 | C-8014 | APPROVED | 45 |

### ANSWER SHEET — Section 3

Write only the references that belong in each category. If a category is empty,
write `NONE`. Listing a reference that does not belong loses points.

| Category | References |
| --- | --- |
| 1. Game action with no Backend decision |  |
| 2. Backend decision with no game action |  |
| 3. One game action settled twice in the Backend |  |
| 4. Present in both, but the amounts disagree |  |

---

## Section 4 — Order of operations

Suggested time: 8 minutes. Rules in play: all.

### 4.1 Put the steps in order

These are the steps for processing a request to add credits, listed out of
order. Number them 1 to 7 in the order they must be performed.

| Letter | Step | Your number |
| --- | --- | --- |
| A | Check Available funds (Balance minus Held) against the requested amount. |  |
| B | Confirm the customer on the request matches the customer on record. |  |
| C | Perform the credit on the game platform. |  |
| D | Open the request and read the requested amount. |  |
| E | Enter the Backend decision once. |  |
| F | Find the game account by its exact identifier. |  |
| G | Confirm the game platform recorded the credit. |  |

### 4.2 Which rule was broken

For each case, write the code of the **first** rule the operator broke.

**Case 1.** The operator opened the request, entered the Backend approval straight away so the queue would clear, and then went to the game platform to perform the credit.

**Case 2.** The proof attached to the request is cut off and the amount cannot be read. The operator credited the amount typed in the request text and moved on.

**Case 3.** The operator credited the game account, the screen did not refresh, so the operator credited it a second time and then approved once in the Backend.

| Case | Rule broken |
| ---: | --- |
| 1 |  |
| 2 |  |
| 3 |  |

---

## Section 5 — Work the queue

Suggested time: 12 minutes. Rules in play: all.

For each request choose **one** action and **one** reason code.

Actions:

- `APPROVE` — the operation may be processed as it stands.
- `REJECT` — the operation must not be processed and the reason is already clear.
- `STOP AND ESCALATE` — the evidence does not allow a decision; hand the case to a
  supervisor without executing anything.

Reason codes:

- `M1` — Customer or game account does not match the request
- `M2` — Movement already processed (duplicate)
- `M3` — Insufficient funds for the requested operation
- `M4` — Evidence missing, unreadable or incomplete
- `M5` — Available information contradicts itself
- `M6` — Everything matches, no observations

### Queue

**Request 1.** Request: credit 200 to ACC-4F8K-2093 for customer C-6890. The only account found on the platform is ACC-4F8K-2O93. Proof is legible and reads 200.

**Request 2.** Request: credit 150 to ACC-4F8K-2093 for customer C-3118. The account on the platform reads ACC-4F8K-2093. The customer record matches. Proof is legible and reads 150. Available funds are 400. No movement of that amount exists for this customer today.

**Request 3.** Request: credit 45 to ACC-1L9Q-6304 for customer C-8014. Account and customer match. Proof is legible and reads 45. Available funds are 610. The game history shows no earlier action for this reference.

**Request 4.** Request: credit an amount to ACC-5S3D-4460 for customer C-7355. The attached proof is cut off: the customer name is visible but the amount cannot be read with certainty.

**Request 5.** Request: credit 120 to ACC-7B2M-1150 for customer C-2041. The Backend history already shows an APPROVED decision of 120 for this same reference, entered four minutes ago, and the game history shows the matching credit.

**Request 6.** Request: withdraw 500 from ACC-9C1T-3047 for customer C-4702. Customer and account match. The game account balance is 320.

### ANSWER SHEET — Section 5

| Request | Action | Reason |
| ---: | --- | --- |
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |
| 4 |  |  |
| 5 |  |  |
| 6 |  |  |

---

## Section 6 — Exact transcription

Suggested time: 3 minutes.

Copy each account exactly as printed. One different character invalidates the
answer.

| # | Printed | Your copy |
| ---: | --- | --- |
| 1 | `ACC-1Z38-4961` |  |
| 2 | `ACC-3DDW-3788` |  |
| 3 | `ACC-T1MH-3355` |  |
| 4 | `ACC-RWZG-3688` |  |
| 5 | `ACC-HG12-0636` |  |

---

End of test. Check that you have left no row blank.
