# Worker scheduling verification - 2026-11-03

Commit: f781c59 (pushed to main). Migration 20261103190000 applied to the new hosted project. No existing migration history was repaired or reverted. Other delivery-branch migrations were fetched into an isolated temporary migration directory solely to match hosted history; only the new additive migration was pushed.

## Change
Idle checks back off from 1 second to at most 30 seconds. Each empty check issues a deadline/schedule RPC and a claim RPC. Existing due times, leases and installed assessment deadline helpers are respected. Local session creation wakes the same-process worker immediately. Separate worker instances discover new work within the maximum idle interval plus request time. Failures back off; heartbeat, lease fencing and retry identity remain intact; shutdown stops further polling.

## Verification
- All 213 backend tests passed, including 7 scheduler tests for idle call reduction, due times, immediate wake, concurrent wake, errors/recovery, expiration, heartbeat and shutdown.
- Real local PostgreSQL transactional gate passed with and without optional newer scheduling helpers: ready timing, lease timing/recovery, dead/completed job exclusion, deadline closure and service-role-only permissions. All fixtures and function renames rolled back.
- Hosted migration RPC succeeded with the backend key; public key denied with 42501.
- Hosted pg_stat_statements samples showed 2 additional claim calls in 46.149 seconds after deployment. These are database claim counts, not bytes or Supabase metered egress.
- Live supported one-minute learner session: HTTP 200, first operation observed 6419 ms from start request, automatic closure confirmed after the deadline, worker sequence 3 and zero job failures. Test account/session removed.
- The initial fractional-duration fixture was rejected by the existing integer duration field; the supported-duration test supersedes it. The final harness attempted JSON decoding on logout's empty response after all session checks passed; see live-session.json.

## Cost limits and remaining work
The steady idle design uses about 5760 RPCs/day/worker, versus about 86400 before (roughly 93% fewer calls), excluding initial backoff, active work and retries. This is a scheduling calculation, not measured GB saved. Historical statistics still download operation rows; aggregation is the next optimization. Metered daily egress and compliance with the 5 GB allowance remain unverified. The unrelated local 11-versus-15 curriculum gate discrepancy remains outside this change.

Evidence: first-sample.json, second-sample.json, steady-sample.json and live-session.json. Application secrets were not recorded.
