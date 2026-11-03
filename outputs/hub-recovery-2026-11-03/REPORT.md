# Local database recovery — 2026-11-03

`npm run verify:local:recovery` passed against the fixed isolated local Supabase
container. No hosted target or environment file is accepted.

- A real PostgreSQL custom archive restores into a new disposable database.
- All 67 public/Auth-user/Storage-metadata table hashes and counts match. Public
  functions, triggers, constraints, indexes, sequences, ownership, privileges,
  RLS settings and policies also match. Default owner ACL representations are
  normalized before comparison.
- All eight existing transactional Hub integration suites pass on the restored
  database: workspace, Orion, Backend, customer response, policy versions, final
  evaluation, mixed practice and cohorts.
- A second backup/restore preserves nonempty formal results/evidence, historical
  lesson snapshots, coaching revisions and an Auth credential fixture. Fixtures
  are created only in the recovered copy. Snapshot mutation and private coaching
  access remain denied.
- The source manifest remains unchanged. Both scratch databases and the archive
  were removed. Total local elapsed time: 21.6 seconds.

The rehearsal caught old local fixture cleanup leaving orphan worker jobs while
cascades were disabled. Auth cleanup now restores cascades before deleting its
sandbox sessions; both capacity scripts explicitly remove their scoped jobs.
The disposable stack was rebuilt only after verifying zero identities/sessions.
Real Auth verification and both ten-client capacity gates passed; recovery was
then repeated successfully, with zero orphan jobs. Syntax and whitespace checks
passed. Full application foundation tests were not repeated for this script-only
increment; their preceding main CI run (`a3d0b12`) passed.

Limit: this uses the same local PostgreSQL cluster and its pre-existing roles.
Auth credential rows are compared as database records; no separate recovered
Auth service login is claimed. Storage metadata recovery does not recover file
bytes. Hosted backups, external copies, retention, environment/secrets and full
application/file recovery remain unverified. The four hosted evaluations remain
draft, and no hosted database content was changed.
