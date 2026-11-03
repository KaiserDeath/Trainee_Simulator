# Formal evaluation verification — 2026-11-03

Target: isolated loopback Supabase Auth/database, actual Express/Vite servers and
Chromium. No API mocks. No hosted formal evaluation was published or modified.

Fixed the learner results screen hiding Start next attempt whenever the latest
result could be submitted. Both choices are now available before set closure.

`npm run verify:local:formal-browser` passed:

- Prerequisite denial and article completion; correct practical/theory result 100%.
- Explicit manual submission closes remaining opportunities in that attempt set.
- Wrong theory with correct practical work scores 80%; retries remain available.
- Only the latest result can be submitted; attempt three automatically submits;
  attempt four is denied until trainer reopening.
- RRHH cannot reopen; TRAINER must provide a reason. Reopening creates set two,
  attempt one, with the old three results retained.
- TRAINER/RRHH evidence and report reads succeed. Learner private evidence and
  another learner's runtime reads are denied.
- Exact start/action replays preserve their server result, including requests
  containing forged client correctness fields.
- Cleanup passed: the exact original local draft policy was restored and all
  generated identities/Auth users and scoped records/worlds were removed.

Full foundation passed: 236 backend, 12 shared-rule, 61 database-safety and
56 mocked-browser tests, plus lint/build. The existing build chunk-size warning
remains. An overlapping browser run timed out at sign-in; cleanup passed, and
the subsequent separate real-browser run passed. Run this gate alone against
its named local stack; CI uses a disposable database job.

The fixed four-slot hosted evaluation catalog remains draft pending content
approval/publication. This local published-fixture result does not establish a
hosted formal learner journey or approval of curriculum/scoring content.
