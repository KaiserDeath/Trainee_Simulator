# Pre-training operator aptitude test

This folder holds the screening instrument given to a Postulante **before** any
Hub module is taught. Candidate-facing material is written in Spanish; this
design note follows the repository convention and stays in English.

## What it is for

The test must predict whether a candidate can perform the operator workflow
after training, without testing any content that training has not yet covered.
It therefore measures transferable abilities using neutral content, and states
every rule it relies on inside the booklet itself. No question depends on Trez
policy, game initials, account-identifier structure, or password rules — the
same constraint the scored Hub evaluations operate under.

## Ability mapping

| Section | Ability examined | Simulator behaviour it anticipates |
| --- | --- | --- |
| A | Applying a threshold rule over repeated arithmetic | Bonus, balance and amount policies applied without drift |
| B | Character-level exact matching | `Ctrl+F` → `Ctrl+V` on the exact player; not confusing near-identical accounts |
| C | Reconciling two independent records | Game history vs Backend history; missing, extra, duplicated and mismatched movements |
| D | Decision with a mandatory reason, and safe stopping | Verify before mutate; approve/cancel with a stored reason; escalate on uncertain evidence |
| E | Exact transcription under time | Copy/paste discipline into a live backoffice field |

## What changed from the earlier version

The earlier instrument was 10 tables × 4 transactions of the bonus rule, 30–35
minutes, graded from free prose on paper. Measured against its own rules it
contained 17 erroneous transactions across 7 tables. Four problems drove this
rewrite:

1. **Error density of 42.5%.** Flagging every row scored 17/40 without reading.
   Section A now runs at 25% and **penalises false positives**, so blanket
   flagging costs more than it earns.
2. **Every error was an underpayment.** Errors are now bidirectional; cause `C3`
   (bonus applied when it should not be) produces overpayments, which are the
   expensive direction in real operations.
3. **The `Bono Aplicado` column contradicted the rule on three rows** without
   the sheet saying which source was authoritative, so the same answer could be
   graded two ways. Rule 4 of the booklet now states explicitly that the column
   is not authoritative, and cause codes replace free-prose explanations so
   grading is deterministic.
4. **It measured one ability.** Sections B–E cover the other four.

The `ganados = 100` boundary case is kept — it is the only row that tests `>=`
rather than `>` — but it is now a correct row, so missing it cannot be confused
with missing a different defect in the same transaction.

## Generating a form

```bash
node scripts/generate-operations-aptitude-test.mjs A
```

Each letter is a deterministic form: same underlying item bank, different table
order, transaction numbers, player identifiers, registry row numbers, log order,
case order and Section E identifiers. A shared answer key from a previous sitting
does not transfer. Two candidates sitting together should receive different
letters.

The generator asserts its own consistency and refuses to emit a form whose key
does not match its data — every payout is integer, every declared cause matches
the injected discrepancy, Section B keeps exactly five real matches, Section C's
declared key is recomputed from the two logs, and Section D is held to a fixed
2 approve / 2 reject / 2 stop composition so no uniform answering strategy beats
two of six.

To add a genuinely independent item bank (rather than a reshuffle), extend
`BANCO_SECCION_A` into a second array and select it by form letter; the cause
codes and assertions need no change.

## Scoring

85 points total, reported as four separate profile sub-scores rather than one
number, so the result says *what* to reinforce in the first modules.

Approving any Section D case where the evidence does not permit action is a
**critical failure** and invalidates the result regardless of total — the same
principle as the Hub requirement that a correct final button click cannot hide a
critical error.

The cut scores in the key are marked **PROPUESTOS** and are not approved. They
should be calibrated against real cohort results before being presented as a
hiring decision rule.

## Relationship to the Hub

This is a paper instrument, but its answer sheet is closed-response by design
(`OK`/`ERROR`, cause codes, row numbers, action + reason codes). Nothing here
needs re-authoring to become a Hub activity later; the response shapes already
match what a deterministic scorer would consume. It is deliberately **not**
wired into `hub_scored_evaluations` — it screens candidates before enrolment and
is not part of the module curriculum or its three-attempt lifecycle.
