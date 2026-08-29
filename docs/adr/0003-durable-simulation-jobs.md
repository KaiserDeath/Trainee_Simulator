# ADR 0003: Durable simulation jobs

- Status: Proposed
- Date: 2026-08-20
- Decision owners: Engineering and infrastructure owner
- Required before: moving accepted scenario timing out of the API process

## Context

The prototype holds timers and scenario orchestration in the API process. Active training must eventually survive API restarts without losing, duplicating, or incorrectly completing work. Hosting, queue technology, concurrency, and recovery targets are not yet approved.

## Decision

Simulation scheduling will execute behind a durable job contract in a separately runnable worker. Jobs must be persisted, idempotent, scoped to an attempt/scenario, and safe to retry. The API may request work and read durable state but must not be the sole owner of accepted timers.

The queue/database technology is intentionally undecided. Selection requires measured concurrency, hosting constraints, operational ownership, and recovery objectives.

The durable contract must support:

- Stable job identity and idempotency keys.
- Scheduled-at, claimed-at, attempt-count, completion, and failure state.
- Lease/heartbeat or equivalent abandoned-work recovery.
- Transactional or outbox-style coordination with authoritative attempt state.
- Restart and duplicate-delivery tests.
- Retention that can remove disposable jobs without deleting assessment evidence.

## Consequences

- Current in-process timers remain prototype behavior and receive characterization coverage before refactoring.
- No queue vendor or hosted service is added during this increment.
- Full-shift scheduling cannot be declared restart-safe until worker recovery tests pass.
- Business timers such as a `Bot` timeout remain versioned policy inputs and are not hardcoded into the worker.

## Required inputs

- Pilot and production concurrency.
- Hosting and database constraints.
- Recovery-time and acceptable duplicate-delivery objectives.
- Monitoring, retry, dead-letter, and incident ownership.
