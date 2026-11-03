# Statistics aggregation verification - 2026-11-03

Commits: 332a163 (aggregation), d8b7a47 (source marker and no-cache). Both pushed to main. Migration 20261103193000_operation_time_statistics.sql applied to the new hosted project using an isolated snapshot of actual remote migration history; no prior migrations were repaired or replayed.

## Implemented
The statistics builder now makes one service-role-only PostgreSQL RPC instead of paginated reads of individual historical operations. SQL groups the finite recorded times by operation type and session, returning counts, sums and extrema. The backend retains JavaScript rounding, sorting and the original response fields. Null/invalid recorded times are excluded as before; zero is counted. Names shared across sessions remain separate at the session level. SQL aggregates every row and returns one JSON document, avoiding row-limit truncation. Failures do not trigger a raw-download fallback.

Authenticated responses use Cache-Control: private, no-store and X-Trez-Statistics-Source: postgres-aggregate. Trainer refresh remains manual.

## Verification
- All 213 backend tests passed.
- All 7 targeted Trainer statistics/review browser tests passed, including manual refresh and idle behavior.
- Real local PostgreSQL comparison matched the frozen legacy calculation across 1509 records, including zeros, nulls, nonfinite numeric values, decimal rounding, fallback operation labels and repeated trainee names.
- Additional local fixture verified more than 1000 distinct session summaries without truncation. All local fixtures and the test-installed function rolled back.
- Fixture response size: 358669 bytes for raw records versus 1315 bytes for the summary (99.63% less). This is local synthetic data, not measured daily hosted egress.
- Hosted service-key RPC succeeded; public-key invocation denied with 42501.
- Live browser authenticated as a temporary trainer; actual statistics endpoint returned HTTP 200 with the postgres-aggregate header and no-store policy. A temporary completed session had three timed operations (0,10,20) and one null time; result was count=3, average=10, min=0, max=20. Statistics UI rendered and the full endpoint response was 549 bytes.
- Hosted test session, identity and Auth user were removed successfully. No large live dataset was created or downloaded.

## Limits
Daily Supabase metered egress was not measured. Savings depend on the ratio of operations to sessions/types; a history with one operation per session can benefit less. This does not guarantee remaining below 5 GB. Existing unrelated local curriculum integration mismatch and wider platform delivery backlog remain separate.

Evidence: live.json and live-statistics.png.
