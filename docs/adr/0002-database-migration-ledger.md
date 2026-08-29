# ADR 0002: Database migration ledger

- Status: Accepted
- Date: 2026-08-20
- Decision owners: Engineering; Trez approval required for retention and identity backfill

## Context

The legacy `backend/src/seed/migrations.sql` script was removed during consolidation. The ordered `supabase/migrations` chain is the authoritative description of the local Supabase/PostgreSQL schema. Hub records must be durable while existing sandbox tables remain operational during migration.

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

- The prior prototype seed SQL is retained only as historical evidence; the tracked numbered Supabase chain is the migration ledger.
- Hub identity, governance, practice, assessment, and reporting migrations are included in the numbered chain. Applying them to a shared environment still requires its schema inventory and explicit approval of identity/retention decisions.
- Destructive column or table removal requires a separate ADR and an approved parity/backfill/rollback window.
- Database integration tests must use a disposable database and must never infer the target from `TEST_DATABASE_URL` alone.

## First follow-up

The read-only schema inventory and explicit local runner are implemented. Before a shared-environment mutation, run the inventory against that exact target and record approval plus forward-recovery steps.
