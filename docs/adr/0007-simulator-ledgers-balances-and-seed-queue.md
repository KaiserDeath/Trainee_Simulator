# ADR 0007: Separate simulator ledgers, balances, and seed-safe queue slots

- Status: Accepted for local implementation
- Date: 2026-08-20
- Source: direct user product decisions

## Context

The prototype used one transaction-history table for both game actions and
Backend customer movements. It also treated a customer's general balance as a
game loading limit and could generate duplicate pending work for the small
seeded-customer pool. Those behaviors make the simulated workflows internally
inconsistent.

## Decision

Use separate stores for Backend customer movement history and game action
history. Correlate related records without merging them.

Maintain three independent balance domains: customer Backend balance,
per-session/per-game loading wallet, and individual player game balance. Seed
every game loading wallet to 20,000. Loading a player transfers value from the
game wallet to the player; redeeming transfers value back.

Reserve an Add Credits amount from the customer Backend balance when the pending
movement is created. Approval commits that reservation without another debit.
Cancellation releases it exactly once. Creation and settlement use database
functions so the balance and operation status change atomically.

Protect customer workflow realism with database-backed pending-slot uniqueness:

- one movement per session and customer;
- one request per session, customer, and game;
- a request and a movement may coexist for the same customer.

## Consequences

- The runtime requires migration `0001_separate_histories_wallets_and_reservations.sql`.
- Existing active pending operations are not reinterpreted. The migration fails
  until active sandbox sessions are closed or discarded.
- A disposable-database rehearsal and schema inventory remain mandatory before
  applying the migration to any shared environment.
- No authentication, password, escalation, or real Trez financial policy is
  introduced by this decision.

## Implementation update (2026-09-01)

The current local seed has 40 customers: 26 have accounts in all three games
and 14 have no game account. The pending-slot rules remain unchanged. Generated
Create Account operations use an eligible empty customer/game pair and the
customer's Backend username; this operation-model rule does not constrain free
simulator account creation.

The local implementation also requires confirmation for Backend Add Credits and
Withdraw Credits. A cancellation reason is persisted as operational evidence and
is not currently included in scoring. These changes are local implementation
status, not authorization to alter the un-migrated hosted environment.
