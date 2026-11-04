# Abandoned media cleanup — 2026-11-03

Implemented expiry and byte cleanup for unfinished, unreferenced private-media
registrations older than 72 hours. Current lessons, all content versions and
historical snapshots protect their assets. Review/publication/retirement states
are excluded; media metadata and cleanup audit events are preserved.

Safety behavior verified against real isolated Supabase Storage:

- Three-hour grant reservation protects two-hour signed upload tokens. A delayed
  signer cannot return a token outliving the database grace period.
- Preview leaves bytes/state untouched. Concurrent workers claim distinct jobs.
- Recent registrations, live links, current lessons, drafts, snapshots, pending
  review and retired historical media remain protected.
- Completion racing cleanup either reaches pending review with bytes intact or
  loses to expiry and returns 410; it cannot become published/deleted together.
- Storage outage records failure without a completion receipt and backs off.
- A crash after removal can reclaim the lease and repeat removal safely, even
  when bytes are absent. Completed jobs are not claimed again; stale tokens fail.
- Cached create/complete requests cannot revive expired uploads. Expired files
  cannot be newly referenced. Completed upload retries issue no upload token.
- Anonymous/authenticated roles cannot invoke maintenance. Service role cannot
  invoke the old media command directly to bypass expiry.
- All exact local identities, media objects, cleanup jobs/events and lesson
  fixtures were removed after verification.

Fresh migration/seed replay passed, as did the eight-suite recovered-database
gate (69 tables including the two new cleanup tables). Full foundation passed
240 backend, 12 shared-rule, 61 database-safety and 56 mocked-browser checks,
lint/build. Browser verification includes preserving the upload form after 410
and submitting a new registration key. Existing chunk-size warning remains.

Hosted: migration applied transactionally with its ledger entry. Real service-role
REST preview passed with zero candidates. Media assets remain zero; four original
identities and four draft evaluations are preserved. No hosted byte deletion was
performed. Production maintenance is included in backend startup after deployment:
100-item batches, daily idle interval and five-minute failure/backlog retry, with
an explicit environment disable switch and preview-first CLI.

Limits: fixture age/grace intervals were advanced inside the isolated database;
the test does not wait 72 wall-clock hours. Hosted deletion/scheduler execution
is not certified by these tests. Retained assessment/coaching disposal, object
file recovery and hosted backup recovery remain separate work.
