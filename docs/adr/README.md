# Architecture decision records

Architecture decision records (ADRs) capture the durable engineering choices for Trez Training Hub. They do not approve Trez business rules.

## Status meanings

- `Accepted`: established by the approved product and architecture baseline.
- `Proposed`: safe direction is recorded, but a named Trez or infrastructure decision is still required.
- `Superseded`: replaced by a later ADR.

## Current records

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-authentication-and-authorization-boundary.md) | Accepted | Username/password over Supabase Auth, HTTP-only JWT cookies, server RBAC |
| [0002](0002-database-migration-ledger.md) | Accepted | Additive migration ledger after live-schema inventory |
| [0003](0003-durable-simulation-jobs.md) | Proposed | Separate durable worker contract; technology pending |
| [0004](0004-versioned-policy-registry.md) | Accepted | Immutable version binding for policy-dependent attempts |
| [0005](0005-account-id-lab-native-integration.md) | Accepted | Native Hub activity backed by a shared pure rule package |
| [0006](0006-training-media-storage-and-delivery.md) | Proposed | Provider-neutral media metadata and controlled delivery; provider pending |
| [0007](0007-simulator-ledgers-balances-and-seed-queue.md) | Accepted | Separate histories and balances with atomic reservations and seed-safe queue slots |

## Guardrail

An ADR may define where an authentication, account, password, financial, scoring, or escalation policy belongs. It must not invent the policy itself. Those values require the approval described in the development plan.
