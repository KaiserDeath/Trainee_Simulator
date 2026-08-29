# ADR 0005: Account ID Lab native integration

- Status: Accepted
- Date: 2026-08-20
- Decision owners: Product and engineering

## Context

`C:/Users/OS/PROYECTOS/Evaluations` is the Account ID Lab used inside Module 3. It is neither the simulator nor a standalone curriculum module. Authentication, attempt identity, progress, policy versions, accessibility, and evidence must remain continuous across the Hub learning activity and simulator application stage.

## Decision

The Account ID Lab will become a native React Hub activity backed by a framework-independent shared rule package and Hub APIs. Production integration will not use an uncoordinated iframe.

The extraction sequence is:

1. Characterize the pure normalization, construction, pattern, and validation behavior in the existing Lab.
2. Extract pure logic without moving the editable default catalogue into authoritative scoring data.
3. Run parity tests against the standalone Lab.
4. Build the native Hub activity using server-held approved policy versions and the active attempt context.
5. Keep the standalone `Evaluations` project unchanged until parity tests and trainer acceptance pass.

The Lab records learning/formative completion but does not create the simulated player. The linked `Simulador-dos` exercise creates the player, publishes the durable created-account artifact, and Module 4 consumes that exact identifier.

## Consequences

- Module 3 owns one continuous request and attempt across structure learning and simulator application.
- The created identifier is persisted once and remains available to Module 4.
- Existing default initials/formulas remain prototype fixtures and cannot become scored truth without Trez approval.
- Retirement or archival of the standalone Lab requires a separate approved task.
