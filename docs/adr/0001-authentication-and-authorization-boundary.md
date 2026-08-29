# ADR 0001: Authentication and authorization boundary

- Status: Accepted
- Date: 2026-08-21
- Decision owners: Trez product/security and engineering
- Required before: Milestone 1 identity implementation

## Context

The prototype identifies a trainee by session name and protects its legacy
trainer screens with a browser-held password/token. Those mechanisms are not a
safe Hub identity boundary. Trez has now approved the Hub identity, session,
role, provisioning, visibility, and account-ownership decisions below; the legacy
simulator path remains separate until a tested cutover is authorized.

## Decision

The Hub API is the authorization boundary. It derives an authenticated subject
from a server-validated Supabase Auth session and authorizes every course,
assignment, attempt, evidence, and trainer/administrator operation on the
server.

Application services continue to depend on a provider-neutral identity context
containing only a stable subject and server-derived role/visibility claims.
Supabase Auth is the selected provider and Express-owned `HttpOnly` cookies are
the selected browser session transport.

The existing trainer-password path must remain isolated as prototype compatibility code until a tested replacement exists. It must not be expanded or described as Hub authentication.

## Approved identity and access decisions

Trez approved the following on 2026-08-21:

- Supabase Auth is the identity provider.
- Authentication uses a generated username and password. TRAINER and RRHH create
  POSTULANTE accounts, while ADMIN creates TRAINER accounts, from first name plus
  first surname: `Juan Pérez` becomes `Jperez`, with
  `Jperez2`, `Jperez3`, and so on for collisions. The initial password equals
  the final canonical username and remains case-sensitive.
- There is no Hub self-registration or user-facing email login/recovery path.
- The Express API owns the session and stores Supabase access and refresh tokens
  in HTTP-only cookies. Cookie-authenticated mutations require origin validation
  and a CSRF token.
- POSTULANTE can access only the training platform, can read assigned courses,
  and can perform only its own activities.
- TRAINER can view and manage every Postulante, including course assignment,
  but cannot perform POSTULANTE attempts.
- ADMIN's user-facing account scope is debugging and TRAINER account creation.
- RRHH can view and manage every Postulante, including creation, profile update,
  deactivation, and course assignment. Its completion, operations, failure,
  performance, and audit reporting endpoints remain read-only; RRHH cannot
  complete attempts, mutate simulator operations/evidence, or publish content.
- ADMIN, TRAINER, and RRHH may change their own password while signed in. ADMIN
  may reset another staff account to its username. POSTULANTE password change
  and reset are unavailable. No password complexity, email recovery, lockout,
  or broader recovery policy is invented beyond Supabase's configured checks.
- POSTULANTE learning content is English only. TRAINER, ADMIN, and RRHH
  experiences are bilingual in English and Spanish.
- Legacy simulator sessions that are not explicitly linked to a Hub identity
  remain identified as unlinked. The system must not infer identity lineage from
  the mutable/free-text legacy trainee name.
- Audit projections may expose original operation outcomes and failure evidence,
  but never submitted password literals, raw request payload aliases, access or
  refresh tokens, cookies, authorization headers, or equivalent sensitive data.

## Consequences

- No new Hub endpoint may trust a role, trainee identifier, or company/license scope supplied only by the browser.
- Supabase Auth access and refresh tokens remain server-managed and are never
  accepted as browser-provided role authority.
- Direct-object access, role enforcement, CSRF, provisioning, deactivation, and
  global TRAINER/RRHH Postulante visibility require automated tests.
- RRHH tests must prove all-Postulante visibility, reporting/evidence mutation denial,
  preservation of unlinked legacy lineage, bounded independently traversable
  result collections, and password/raw-payload redaction.
- Removing the prototype trainer password is a later, separately verified cutover.

## Foundation implementation note

The provider-neutral verifier interface, server-derived identity context,
role-gated Hub routes, direct-object checks, and default unconfigured verifier
now exist behind the Hub feature flag. The default verifier returns `503` and
does not inspect headers, cookies, query parameters, request bodies, or
environment-supplied identities.

The earlier dependency-injected fixture verifier remains test-only. The default
configured Hub uses Supabase Auth and database-held Hub role assignments; no
role supplied by the browser or user metadata is authoritative. If the required
Supabase anon key, public backend URL, or client URL is missing, Hub Auth fails
closed instead of falling back to a test identity.

The current environment contains only local callback/origin values. Hosted
frontend and API URLs must be supplied explicitly before deployment, added to
the Supabase redirect allow-list, and verified over HTTPS.

The local implementation makes `RRHH` and `POSTULANTE` exclusive database-held
roles. Database triggers serialize concurrent role and locale writes and enforce
English whenever POSTULANTE is assigned or its locale changes. Roles come only
from persisted server-side assignments, never browser claims or user metadata.

## Rejected for now

- Reusing the embedded trainer password as a production credential.
- Selecting a provider from engineering preference before Trez approval.
- Inventing self-registration, POSTULANTE password reset, email recovery,
  password complexity, or lockout behavior.
