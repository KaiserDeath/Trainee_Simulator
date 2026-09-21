# Operator screening

`operator-screening.html` is the screening instrument given to a Postulante
**before** any Hub module is taught. It is a single self-contained page: it
runs the exercises, scores itself, and hands the candidate a result sheet to
download.

Published at <https://claude.ai/artifact/JmBQrbBkDLLmDjHRqyensq> (private —
share it from the page's Share menu before sending it to a candidate). The file
in this folder is the source of truth; republish from it after any edit.

## What it is for

It must predict whether a candidate can perform the operator workflow after
training, without testing content that training has not yet delivered. It is
built on the simulator's own workflow — a request queue, exact account lookup,
a customer balance that moves as movements settle, two records that must agree
one to one, and a decision with a reason — but the seven operating rules it
depends on are printed on the page and reachable at any time from the Rules
button, including which way an ADD CREDITS and a WITHDRAW CREDITS each move the
balance. Nothing requires prior knowledge
of a game platform or of company procedure, and the page contains no
account-identifier formula, game initials or password policy, so it is safe to
use before those are approved.

## Exercises

| # | Exercise | Logical skill | What it predicts in the simulator |
| --- | --- | --- | --- |
| 1 | Identity match | Necessary vs sufficient conditions | Finding the exact player; not accepting a near-identical account |
| 2 | The customer balance | Tracking state that moves in both directions | Reading the balance as it stands now, not as it stood at the start of the shift |
| 3 | Record reconciliation | Set difference and a one-to-one invariant | Game history against Backend history; duplicates and unsettled actions |
| 4 | What the evidence shows | Inference and evidence sufficiency | Knowing when evidence settles a question and when it does not |
| 5 | Working the queue | Conjunctive rule checking, safe stop | Approve, reject with a reason, or refuse to act on bad evidence |

62 points, reported as five profile sub-scores rather than one number, so the
result says *what* to reinforce in the first modules.

## Design decisions

- **Exercise 2 only works because the page is interactive.** Six requests are
  settled in sequence against one customer record whose single balance moves as
  they go. It uses only two operations, and the page defines both, so it assumes
  no prior idea of which way money flows: an **ADD CREDITS** puts credits into
  the game account and takes that amount out of the customer balance, a
  **WITHDRAW CREDITS** takes credits out and puts the amount back in. The page
  uses those operation names throughout, rather than banking terms like debit
  and credit that mean nothing here. That matches the simulator —
  `ADD CREDITS` debits the balance at reservation, while the settlement RPC
  refuses to reserve for `WITHDRAW CREDITS` and credits the balance on approval.
  There is deliberately **no held or available column, because the product has
  none**; an earlier draft invented `Available = Balance − Held`, arithmetic no
  operator here performs. The candidate decides each request and writes the
  resulting balance, which catches anyone tracking magnitude but not direction.
  The trap is an ADD CREDITS the opening balance would have covered but the
  current one will not. Scoring follows the candidate's own ledger path, so an early mistake
  does not cascade into unfair later failures.
- **Exercise 4 is the reasoning core.** Three of its six claims turn on absence
  of a record not being evidence of absence of the event — the inference error
  that produces double credits. One asks the candidate to see that two
  contradictory documents prove *an error exists* without proving which
  document is wrong.
- **False positives cost points.** Flagging a clean reference in exercise 3
  costs 2. Without that, answering "wrong" to everything scores well and the
  instrument cannot separate a careful reader from a pessimist.
- **Behaviour is recorded, not just answers.** The page notes whether the
  evidence panel was opened before each queue decision, how many ADD CREDITS
  were approved for more than the balance on screen, false flags, time per
  exercise, and answer revisions. None of this is observable on paper.
- **Critical failure.** Approving either request whose evidence does not permit
  action invalidates the result regardless of score — the same principle as the
  Hub requirement that a correct final button click cannot hide a critical
  error.

## The result sheet

**Download result** produces a self-contained, printable HTML file named for
the candidate and date: score, verdict, the five profile sub-scores,
item-by-item answered-versus-correct detail, time per exercise, and the
behavioural observations above.

Saving uses the artifact `downloads` capability when the page runs as a
published artifact, which shows the candidate a confirmation prompt. Served
from a file or a web server it falls back to an ordinary browser download, so
the page works either way.

## Calibration

The cut scores are marked **provisional** on the result sheet and are not
approved. They were chosen as a starting point, not derived from evidence, and
should be calibrated against real cohort results before being presented as a
hiring decision rule.

## Relationship to the Hub

This screens candidates before enrolment. It is deliberately **not** wired into
`hub_scored_evaluations` and is not part of the module curriculum or its
three-attempt lifecycle.

## History

Earlier markdown forms and their generator were retired in favour of this
single interactive page, so the two could not drift apart. They are recoverable
from git history if the printed format is ever needed; the ordering-of-steps
exercise they carried has no equivalent here.
