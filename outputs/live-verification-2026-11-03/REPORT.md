# Platform verification - 2026-11-03

Source: main at 9558236. Hosted frontend and backend were accessed directly. Feature markers verify deployed manual Update and administrator configuration; exact hosted build SHAs were not independently exposed.

## Passed
- Full verify:foundation: 206 backend tests, 12 shared rule tests, 61 database safety tests, frontend lint/build, 41 browser smoke tests. Mocked browser tests include idle Trainer request counts and on-demand statistics.
- Real isolated Supabase Auth/governance verification, including login, CSRF, identity, role boundaries and simulator ownership.
- Local transactional workspace verification: publication, immutable history, coaching, revisions, evidence and database access controls.
- Local bounded capacity: 10 concurrent practice clients, 50 commands, zero errors, p95 55 ms. This is not production browser load certification.
- Real disposable PostgreSQL financial/migration integration passed after explicitly loading the existing root environment into the guarded runner. The first invocation stopped safely because the disposable target was not present in the process environment.
- Live frontend HTTP 200 and backend health HTTP 200. Anonymous Hub/trainer access HTTP 401.
- Live server-side cookie-jar login for temporary TRAINER and POSTULANTE HTTP 200. Learner denied trainer directory HTTP 403.
- Live learner session persisted in the new project, ignored forged learner name, generated 3 operations within a 35-second observation, worker sequence advanced to 3 with zero failures. Stop and trainer report HTTP 200.
- Temporary hosted session, identities and Auth users removed successfully.

## Release blockers / failures
1. Real deployed browser login fails HTTP 403: Hub CSRF token is missing or invalid. Frontend uses https://trainee-simulator.vercel.app and API uses https://trainee-simulator-8els.onrender.com. API sets Secure; SameSite=Lax cookies, which cannot support this cross-site fetch login. Server-side cookie-jar success does not establish browser usability. Prefer a same-origin API proxy and relative API/realtime paths; retain CSRF and HttpOnly protections.
2. verify:local:hub fails at runHubLocal.mjs:235: module count expected 11, actual 15. Local database fixture and gate expectations do not match. Do not claim full real Hub learning journey passed or reset unrelated local data to hide the discrepancy.

## Bandwidth limits
- Deployed bundle contains the manual snapshot controls. Automated idle-polling tests pass locally; live authenticated Trainer UI idle observation remains blocked by browser login.
- Worker implementation polls hub_claim_simulation_job once per second even when idle (86,400 scheduled attempts per day per worker). This is code evidence, not measured hosted request accounting or proof of GB consumed.
- Historical statistics still fetch operation rows; the manual Update fix reduces frequency, not query size.
- Supabase metered egress totals and a day-long post-deployment trend were not obtained. No guarantee of staying below 5 GB is established.

## Evidence
- backend.json: live server/session checks and targeted cleanup.
- browser.json: live browser login response statuses and cookie attributes, without credential values.
- live-login-failure.png: live login error.

No application-source fixes or new commits were made during this verification. Existing dirty screenshots and operational artifacts were preserved.


## Follow-up: login fix deployed and verified

Commit 21e6ec9 was pushed to main and the Vercel production API rewrite was observed serving JSON. The production app now calls same-origin /api, forwarded to Render. Removed the unused eager Socket.IO connection. No CSRF or cookie protections were relaxed.

Verification:
- Production-build cookie regression passed: login, reload persistence, same-origin requests, HttpOnly and SameSite=Lax.
- Frontend lint/build and all 41 development browser smoke tests passed on the corrected source state.
- Real deployed administrator login and reload passed. Cookie domain trainee-simulator.vercel.app, Secure=true, HttpOnly=true, SameSite=Lax.
- Real deployed temporary Trainer login passed. Its dashboard issued zero API requests during 65 idle seconds. Manual Update issued exactly one additional session-directory request. All observed API requests stayed on the frontend origin.
- Temporary hosted Trainer identity and Auth user were removed successfully.

Evidence: login-fix-verification.json, live-login-fixed.png and live-trainer-idle.png.

The browser-login blocker above is resolved. The separate local 11-versus-15-module integration mismatch remains open. Worker idle polling, statistics query size and metered daily Supabase egress remain separate follow-up items; no 5 GB quota guarantee is asserted.
