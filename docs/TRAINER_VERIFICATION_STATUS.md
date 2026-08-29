# Trainer Audit and Evaluation Verification

Status date: 2026-08-21.

## Verified behavior

- `GET /api/trainer/sessions` is read-only. Loading the trainer directory no
  longer deletes inactive sessions as a side effect.
- Audit-log database failures propagate through the API and are shown as
  unavailable in the trainer UI instead of being presented as an empty log.
- Trainer report and statistics components are keyed by session, preventing a
  failed session switch from retaining another trainee's evidence.
- Raw request payload aliases and submitted password literals are removed from
  trainer report rows. Future request-history descriptions store only sanitized
  evidence such as `passwordProvided`.
- Reconstructed game-history and reservation evidence is not changed to passing
  merely because an older `is_correct` value says true.
- New Add Credits rows expose `COMMITTED` or `RELEASED` reservation evidence.
- Letter-grade thresholds are labeled pending Trez approval and are not shown as
  final scored truth.

## Supabase readiness snapshot

The configured Supabase project has the legacy schema. Read-only checks found:

- 952 pending operations across 83 completed or submitted sessions;
- zero active sessions containing those rows;
- 716 pending rows in completed sessions and 236 in submitted sessions;
- 163 pending Add Credits rows totaling 34,781 of queued exposure;
- 81 duplicate movement/customer slots and 91 duplicate
  request/customer/game slots.

These rows are historical pending work, not proof that funds were posted. The
migration preserves their status and balances and assigns them queue policy
version 0. It does not reserve, refund, approve, cancel, or delete them. Only new
operations created after migration use queue policy version 1.

Reproduce the aggregate audit without mutation:

```powershell
$env:TREZ_AUDIT_ENV_FILE = 'C:\Users\OS\PROYECTOS\Simulador-dos\backend\.env.local'
npm run audit:pending:read-only --prefix backend
```

## Remaining deployment boundary

The local PostgreSQL 18 migration and trainer audit fixture pass, but the
configured Supabase project still lacks `sandbox_game_history`,
`sandbox_game_wallets`, and the new operation columns/functions. Evaluation
reports against that database therefore remain unavailable until its actual
schema is inventoried and migration 0001 is explicitly authorized and applied.

The legacy `/api/trainer` simulator dashboard still uses the prototype browser
password/local-storage gate and is not presented as Hub authentication. The new
`/api/hub` trainer and administration routes use server-validated Supabase Auth,
database-held roles, CSRF protection, and global TRAINER/RRHH Postulante visibility
in the local implementation. The legacy cutover remains a separate acceptance
task. Hosted Supabase has not been migrated or mutated.

## Approved RRHH boundary

RRHH may read every Postulante's Hub module-completion status and the original
simulator operation/failure evidence required for audit. Those evidence routes
remain read-only. TRAINER and RRHH may separately create, edit, deactivate, and
assign courses to every Postulante.

The implemented Hub boundary exposes `RRHH`-only `GET` routes for a paged
overview, a selected Postulante's paged learning records, a selected Hub attempt's
paged activity/evidence/artifact records, and a selected legacy simulator
session's paged operations/action log. Every response collection defaults to 50
records and rejects limits outside 1 through 100. Characterization tests reject
POSTULANTE, TRAINER, and ADMIN reads of these routes and reject RRHH crossing
from approved Postulante management into learning, evidence, simulator, or
publication mutations. The RRHH reporting interface issues GET requests only.

Legacy simulator sessions are not retroactively assigned to Hub identities by
matching `trainee_name` to a display name. Only the explicit nullable
`hub_attempts.legacy_trainee_session_id` relationship establishes durable
lineage; all other legacy sessions must be reported as unlinked.

“Original evidence” does not mean raw secrets. RRHH projections must remove
raw request payload aliases and token-, secret-, cookie-, authorization-, and
password-like values recursively. Password evidence may state only whether a
value was provided (or the equivalent Provided/Missing validation result), never
the submitted or stored literal.
