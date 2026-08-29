# ADR 0004: Versioned policy registry

- Status: Accepted
- Date: 2026-08-20
- Decision owners: Trez policy owners and engineering

## Context

Capabilities are reused across modules, while operation, game, account-structure, password, and scoring rules can change over time. The current Account ID Lab contains editable browser-local rules and working-assumption initials. Completed attempts must remain explainable after a future policy changes.

## Decision

Authoritative definitions will be stored once in a server-owned registry as immutable published versions. Modules, scenarios, adapters, and scoring will reference version identifiers rather than copy policy values.

An attempt binds the exact definition versions it uses when the attempt begins. A published version is never edited in place; a correction creates a new version with owner, approval status, effective dates, and change rationale.

Definitions remain separated by responsibility:

- Canonical capability definitions describe reusable actions and evidence.
- Game capability mappings describe platform-specific support and terminology.
- Operation definitions compose capabilities and decision branches.
- Account-structure and password policies contain approved platform rules.
- Scenario and score definitions contain delivery and evaluation rules.

## Publication guardrail

Working assumptions may be imported only as clearly marked draft reference data. They cannot be selected by a scored attempt. Publication requires an identified Trez approver; trainer or trainee UI cannot modify the version bound to an active attempt.

Trez approved a two-person workflow on 2026-08-21: an author submits a draft
and a different administrator approves publication. The same identity cannot
both author and approve one version. Publication and rejection remain
append-only audited administrative actions.

## Consequences

- Modules 3 and 4 can share account/search capabilities without duplicating them.
- Completed scores can be reproduced from retained evidence and version bindings.
- Administrative publication and override actions require append-only audit evidence.
- Schema/API implementation waits for approval of ownership and publication permissions, but tests and interfaces may use neutral fixtures that do not encode Trez formulas.
