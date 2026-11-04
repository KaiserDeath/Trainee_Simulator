# Larger local workloads and employee reinforcement — 2026-11-04

The Hub serves onboarding and reinforcement for existing workers. This increment
adds reproducible local capacity selection and verifies formal reassessment
without replacing the original official result. It does not add a total-user
cap, publish curriculum or authorize new application roles.

Both commands accept `TREZ_LOCAL_CAPACITY_CLIENTS=1..100`, defaulting to 10.
The loopback environment/named local database guard remains mandatory. CI runs
both workloads at 100. All in-flight clients settle before cleanup on success or
failure; four focused unit checks cover sizing and drain-before-cleanup behavior.

## Results

| Local workload | Concurrent clients | Measured work | Errors | p95 |
|---|---:|---|---:|---:|
| Account practice | 100 | 500 workflow RPCs, distinct artifacts, second-client retries | 0 | 226 ms |
| Native final/reinforcement | 100 | 2,128 runtime RPCs; 1,528 practical actions; 200 official submitted results | 0 | 812 ms |

The native figure measures runtime RPC latency, not whole-assessment, start,
submission or trainer-reopening latency. Values are one local run, not a sustained
capacity SLA. Workload sizes vary with generated final scenarios.

Every native client completed a first final assessment, submitted the result,
then received a reasoned TRAINER reopening and completed/submitted a second final.
All 100 original attempt rows remained identical. Each reassessment had a
different set, started at attempt 1 with a three-attempt budget and closed its
set on official submission. Numerical results remained 100% in both rounds.
This proves technical workflow preservation with synthetic prerequisites; it
does not prove real learners' competency or curriculum acceptance.

Both 100-client runners exited successfully after exact fixture cleanup and
policy-head restoration. The local baseline returned to zero identities,
attempts, sets, reopening events, policy heads and sandbox sessions. Earlier
10/20/50-client checks passed too. All 246 backend tests passed after the changes.

Evidence: `practice-100.json`, `reinforcement-100.json`, `after-cleanup.json` and
`release-gates.json`. No hosted data or real learner records were changed.

## Release scope

The supervised pilot still defaults to ten concurrent people. Configuration now
separates that initial target from 100-client **local** stress evidence; hosted
concurrency remains unverified. Larger hosted use needs a representative
browser/Auth/backend/database workload, observed errors/latency and resource/
egress measurements. Local success alone must not raise the hosted acceptance
status. Capacitador remains the configurable review/supervision position.

The four real evaluation policies remain draft. Actual curriculum sign-off,
approved-policy hosted journey, and supervised pilot attendance/outcomes remain
open. No fixture user is counted as a real pilot participant.
