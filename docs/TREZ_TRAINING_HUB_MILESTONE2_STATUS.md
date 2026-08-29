# Trez Training Hub Milestone 2 guarded scaffold status

Status date: 2026-08-24.

## Implemented locally

- Draft, provisional, non-scored Module 3 Account Creation and Module 4 Search
  for Customer records, following Modules 1 and 2 in one prerequisite chain.
- A native Account ID Lab renderer backed by the shared pure rule package. It
  activates only when the server supplies an approved policy object and a
  non-empty policy version; the browser cannot edit the authoritative policy.
- A Module 3 quick-simulation placeholder that requires a server-created
  `CREATED_GAME_ACCOUNT` artifact rather than accepting browser assertions.
- An application-controlled Module 4 search exercise that observes `Ctrl+F`, a
  real paste, exact identifier matching, and positive player confirmation.
- Activity-specific completion state sent through the existing idempotent,
  service-role-backed Hub completion route.
- Database fail-closed checks that reject an activity whose content still marks
  its policy or required artifact as `required`, including forged direct API
  requests.
- Browser tests for the blocked and policy-supplied Account ID Lab states and
  for the exact-player search evidence contract.
- Orion Stars selected and implemented as the first adapter boundary. The Free
  Simulator route never accepts a browser-selected assessment mode and does not
  enforce account structure.
- Orion account creation now returns a password-free `CREATED_GAME_ACCOUNT`
  evidence candidate and displays an Orion-styled success prompt.
- The focused Refresh Balance surface presents the three supported game tabs:
  Orion Stars is available, while Vblink and Golden Dragon are visible but
  disabled until their game-specific balance surfaces are ready. Disabled tabs
  perform no network or simulator action.
- Route-aware browser titles show `Orion Stars` in each newly opened Orion tab
  instead of the Vite placeholder `frontend`.
- The existing Backend pencil form is verified as the terminal interaction:
  created game ID, password, Orion kiosk, then Confirm.

## Deliberately not implemented

- No account identifier formula, game credential rule, retry rule, pass score,
  financial rule, or escalation procedure is approved or encoded.
- No browser-generated value is published as a created-account artifact.
- No real game account is created and no Backend request is completed by these
  Module 3–4 activities.
- Module 4 remains locked because the seeded Module 3 cannot complete until its
  policy and artifact prerequisites are approved and implemented server-side.

## Verified local behavior

After a local-only reset, the following gates pass:

```powershell
npm run local:bootstrap:admin
npm run verify:local:data
npm run verify:local:hub
npm run verify:local:hub:auth
npm run verify:foundation
$env:TREZ_LOCAL_E2E = '1'
npm run test:e2e:local
Remove-Item Env:TREZ_LOCAL_E2E
```

The Hub verification proves that Modules 1–2 complete, Module 3 becomes
available, policy/artifact-dependent Module 3 completion rejects forged state,
and Module 4 remains prerequisite-locked. The browser gate proves the future
approved-policy and exact-search interaction contracts without treating its
neutral fixtures as Trez business rules.

## Decisions required to finish Milestone 2

1. Orion Stars' exact approved account identifier structure and credential-handling
   workflow.
2. The secure Hub attempt/simulator-session linkage that authorizes publication
   of the evidence candidate as the durable Module 3 artifact.

Until those decisions are supplied, the current boundary is intentionally a
safe scaffold, not a complete or formally assessable Module 3–4 release. Hosted
Supabase remains untouched.
