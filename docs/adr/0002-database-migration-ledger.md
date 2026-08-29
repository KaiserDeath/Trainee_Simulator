# ADR 0002: Database migration ledger

- Status: Accepted
- Date: 2026-08-20
- Decision owners: Engineering; Trez approval required for retention and identity backfill

## Context

The repository contains `backend/src/seed/migrations.sql`, but the approved development plan states that it is not a complete authoritative description of the deployed Supabase/PostgreSQL schema. Hub records must be durable while existing sandbox tables remain operational during migration.

## Decision

Database changes will use additive, numbered, immutable SQL migrations and a migration ledger. A new migration may be authored only after the target environment schema and existing migration history have been inventoried.

Each migration delivery must include:

- Preconditions and affected records.
- Forward verification queries.
- Rollback or forward-recovery guidance.
- Empty-database verification and an upgrade rehearsal from the supported prior state.
- Explicit treatment of row-level policies, indexes, foreign keys, uniqueness, and data backfills.

Existing sandbox tables will remain usable during the Hub transition. New Hub attempts may link to legacy sessions through explicit nullable transition fields; identity will not be inferred from trainee names.

## Consequences

- The current seed SQL is prototype evidence, not a migration ledger.
- No Hub schema migration is included before live-schema inventory and approval of identity/retention decisions.
- Destructive column or table removal requires a separate ADR and an approved parity/backfill/rollback window.
- Database integration tests must use a disposable database and must never infer the target from `TEST_DATABASE_URL` alone.

## First follow-up

Create a read-only schema inventory procedure, select the migration runner, and document how it resolves and displays an explicit target before any mutation.
