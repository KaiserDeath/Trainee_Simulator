# Operator technical test

The screening instrument given to a Postulante **before** any Hub module is
taught.

## What it is for

It must predict whether a candidate can perform the operator workflow after
training, without testing content that training has not yet delivered. It is
built on the simulator's own workflow — a request queue, exact account lookup,
held funds, two separate histories, a decision with a reason — but every rule it
depends on is printed on the sheet. Nothing requires prior knowledge of a game
platform or of company procedure, and it contains no account-identifier formula,
game initials or password policy, so it is safe to use before those are approved.

## Sections

| Section | Time | Ability | What it predicts in the simulator |
| --- | --- | --- | --- |
| 1. Account lookup | 9 min | Character-level exact matching | Finding and pasting the exact player; not confusing near-identical accounts |
| 2. Available funds | 8 min | Reading account state under stated rules | Respecting held funds and game balance before committing a movement |
| 3. History reconciliation | 10 min | Cross-referencing two independent records | Game history against Backend history; duplicates and unsettled actions |
| 4. Order of operations | 8 min | Procedure discipline | Verifying before mutating; one game action, one Backend decision |
| 5. Work the queue | 12 min | Judgment, mandatory reason, safe stop | Approve, cancel with a reason, or refuse to act on bad evidence |
| 6. Exact transcription | 3 min | Copy/paste discipline | Pasting the right identifier into a live backoffice field |

50 minutes, 74 points, reported as five profile sub-scores rather than one
number, so the result says *what* to reinforce in the first modules.

## Design decisions

- **False positives cost points.** Sections 1 and 3 penalise flagging something
  that is actually correct. Without that, answering "wrong" to everything scores
  well and the instrument cannot separate a careful reader from a pessimist.
- **Section 5 is fixed at 2 approve / 2 reject / 2 stop.** No uniform answering
  strategy beats two of six actions.
- **Section 2 hides its discriminator in the Held column.** A candidate who reads
  Balance and ignores Held answers PROCEED on every trap row. That single
  mistake is the most diagnostic signal in the test.
- **Critical failure.** Answering `APPROVE` on a case where the evidence does not
  permit action invalidates the result regardless of total — the paper analogue
  of the Hub requirement that a correct final button click cannot hide a
  critical error.
- **Closed responses throughout.** Row numbers, PROCEED/REJECT, rule codes,
  action plus reason code. No free prose, so two graders reach the same score.

## Generating a form

```bash
node scripts/generate-operator-technical-test.mjs A
```

Each letter is a deterministic form: same item banks, different registry row
numbers, row order, log order, step scramble, queue order and Section 6
identifiers. A shared answer key from a previous sitting does not transfer.
Two candidates sitting together should get different letters.

The generator refuses to emit a form whose key does not match its data. It
asserts that Section 1 keeps exactly five real matches, that each Section 2 row
is genuinely the trap / boundary / clear case it claims to be, that the declared
Section 3 key recomputes from the two histories, that the Section 4 scramble did
not come out already ordered, and that no Section 5 request approves an amount
its own stated funds cannot cover or cites insufficient funds for an amount that
fits.

The forms are reshuffles of one set of item banks, not independent content. A
candidate who memorised specific values rather than positions could still
transfer between letters; extend the banks if you need genuinely independent
forms.

## Calibration

The cut scores in the key are marked **PROPOSED** and are not approved. They
were chosen as a starting point, not derived from evidence, and should be
calibrated against real cohort results before being presented as a hiring
decision rule.

## Relationship to the Hub

This is a paper instrument, but its answer sheet is closed-response by design,
so nothing here needs re-authoring to become a Hub activity later. It is
deliberately **not** wired into `hub_scored_evaluations`: it screens candidates
before enrolment and is not part of the module curriculum or its three-attempt
lifecycle.
