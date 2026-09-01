# Simulator Data Invariants

Status: confirmed product rules supplied directly by the user on 2026-08-20.

These rules supplement the approved Training Hub blueprint and development plan.
They apply to the simulator runtime and must not be replaced by guessed Trez
authentication, password, financial, or escalation policy.

## History boundaries

- Game actions are recorded in game history.
- Backend approval or cancellation is recorded in customer movement history.
- Approving an operation in Backend must not copy that row into game history.
- A Backend movement and its corresponding game action may be correlated by
  account, game, amount, action type, and time, but they remain separate records.

## Seed-safe pending queue

- A customer may have at most one pending movement across all movement types and
  games.
- A customer may have a pending request and a pending movement at the same time.
- A customer may have at most one pending request for the same game, regardless
  of request type.
- A customer may have pending requests for different games.
- These limits prevent impossible duplicate work even when the seeded customer
  pool is expanded.

## Seed and account-creation boundaries

- Each fresh local simulator session seeds 40 customers.
- 26 seeded customers have one account in each supported game; 14 are
  deliberately empty and have no game accounts.
- Generated Create Account operations choose a customer/game pair that has no
  existing game account and identify the customer by that customer's unique
  Backend username.
- This is enforced only for account-creation operation models. It is not a
  global uniqueness constraint on `sandbox_game_accounts`, and free simulator
  screens may create an account using their own valid inputs.

## Balance boundaries

The simulator has three independent balances:

1. Customer general Backend balance.
2. Per-game operational loading wallet, seeded to at least 20,000 for each game
   in each training session.
3. Individual player balance inside a game.

Game loads debit the per-game loading wallet and credit the individual player.
They must never use the customer's general Backend balance as the game's loading
wallet.

## Add Credits reservation lifecycle

- Creating a pending Add Credits movement immediately reserves its amount by
  subtracting it from the customer's Backend balance.
- Approval commits the held reservation and must not subtract the amount again.
- Cancellation releases the reservation and restores the amount exactly once.
- Settlement must be atomic so repeated or concurrent actions cannot double
  debit or double refund the customer.

## Backend confirmation and cancellation boundary

- Backend Add Credits and Withdraw Credits require an explicit confirmation
  before settlement.
- Cancelling either movement requires a non-empty reason.
- The reason is persisted on the Backend operation as `cancellation_reason`.
- Cancellation reasons are operational evidence only; they are deliberately
  excluded from scoring until a scoring policy is approved.

## Implementation gate

The canonical local migration chain implements separate game history, game
wallets, queue uniqueness, atomic settlement, and Add Credits reservations. It
passed a PostgreSQL 18 disposable-database fixture rehearsal. Pending rows belonging to completed or
submitted legacy sessions remain unchanged and outside queue policy version 1;
they are not retroactively reserved, cancelled, or deleted. The actual target
schema must still be inventoried and explicitly approved before use in any shared
or hosted environment.
