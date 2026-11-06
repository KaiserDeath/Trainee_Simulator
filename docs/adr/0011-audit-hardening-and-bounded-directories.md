# ADR 0011: Audit hardening and bounded directories

- Date: 2026-11-06
- Status: Accepted for implementation under the user's instruction to execute the audit fixes.

## Decisions

New Hub accounts and staff resets receive cryptographically random temporary passwords. They are returned only in the authorized creation/reset response, never stored in the application directory, reports, browser storage or logs. Supabase Auth holds the credential. An Auth administrator-controlled metadata flag requires password replacement before training or simulator access. Learners may change their own Hub password after proving the current password. Passwords must contain 12–128 characters and differ from the current password and username. This supersedes the username-as-password and learner-cannot-change-password policy described in older documentation. Game simulation credentials and grading are unchanged.

Existing username-password accounts are marked for replacement on their next successful sign-in. This is not a bulk rotation of existing accounts or invalidation of all pre-existing sessions. Administrators should coordinate remaining staff credential rotation; MFA/SSO remains a later identity-provider decision. Account creation and password reset responses must not be logged or cached. If their response is lost, do not guess or reconstruct the credential.

Production directory screens use a service-role-only RPC with server-verified actor authorization, stable UUID keyset pagination, bounded page sizes (1–100), literal search and explicit total/next-cursor metadata. Trainer rows contain counts from the latest module attempt, not lesson bodies or evidence. Opening an individual record remains the detail boundary. Page reads are live reads, not a transaction snapshot spanning multiple requests; refresh starts again. Existing selectors enumerate bounded pages and fail if traversal cannot complete.

HTTP responses receive request IDs and security headers. Private APIs use no-store. Compressed request bodies are rejected. Login admission control is bounded per process/account/transport address; it does not trust forwarded client IPs and is not a distributed edge firewall. Vercel supplies an enforced CSP. Inline styles remain allowed for existing components; scripts do not allow unsafe-inline or unsafe-eval.

Liveness stays at `/health`. `/ready` and `/api/ready` additionally check database reachability and embedded worker progress, with a five-second probe cache and a three-second database deadline. `/api/hub/admin/runtime-metrics` exposes per-process HTTP counters and database queue diagnostics only to ADMIN. Response-byte counters are not Supabase billed egress. The worker remains lease-based and retains restart recovery; shutdown stops claiming new work.

Routes are code-split. Trainer refresh remains manual. Scoring, formal policy publication, evidence retention and financial movement semantics are unchanged.

## Migration delivery

`20261106000000_bounded_hub_directories.sql` adds two functions and grants only service_role execution. It creates no tables, changes no existing rows, backfills no identity information and changes no existing RLS policy. Preconditions: the existing numbered chain through `20261105001000` and its referenced Hub tables/functions. The hosted ledger was inventoried before delivery and dry-run selected only this migration.

Upgrade rehearsal: real local PostgreSQL; transactional tests with 1,005 learners, all cursor pages, no duplicate IDs, role/public denials, literal search and summary counts. Fresh migration-chain verification is included in the isolated-database CI job. The existing backup/restore verification covers function ACLs and preserved training evidence.

Deploy the additive migration before the application. Verify both function privileges and the migration ledger, then authenticated directory paging, password replacement, CSP, readiness and role denial. For application rollback, retain the harmless new functions and roll back the application build. Prefer a forward corrective migration over deleting applied migration history. Removing functions requires first rolling back all calling application versions.

## Operational response

Probe `/api/ready` approximately once per minute; alert after consecutive failures rather than a single startup response. Inspect ADMIN runtime diagnostics on demand. Investigate any dead job, repeatedly expired lease, or oldest due job exceeding 60 seconds; preserve original deadlines and never fabricate a completed session. Review HTTP errors/latency together with hosting logs. Check provider Database/Storage/Auth/Realtime egress separately before increasing capacity. These endpoints enable monitoring; they do not claim an external paging service has been configured.

Curriculum approval, exact policy digest review, hosted acceptance attestation and a supervised pilot still require named people and real evidence. Automated checks must not populate those approvals.
