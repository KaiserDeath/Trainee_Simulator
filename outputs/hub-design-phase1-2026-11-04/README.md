# Phase 1 design review

Status: Four reviewable previews completed; visual direction awaits user review.

Open `index.html` directly in a browser, or run
`node outputs/hub-design-phase1-2026-11-04/serve.mjs` from the repository and open
`http://127.0.0.1:4387`. The server binds only to loopback and serves the preview.
No product server, real user records or hosted resources are involved.

The interactive preview has learner home, module catalog, module workspace and
Capacitador overview screens. Use the sidebar to switch screens and the top
control to switch English/Spanish. Catalog search/filtering and sample feedback
work locally. Sample progress, feedback, people and counts are fictional.

`verification.json` records successful checks of all four screens in both
languages at 1440px and 320px, including automated accessibility scans and no
page-level overflow. Interaction checks cover catalog search, no-results/reset,
filter preservation on language change, heading focus, browser Back/Forward,
sample completion confirmation and manual Update. No external HTTP requests
or JavaScript errors occurred. These checks validate the preview only; they
do not establish production functionality or WCAG conformance.

Reproduce: `node outputs/hub-design-phase1-2026-11-04/verify.mjs` after installing
the repository's frontend dependencies and Playwright Chromium.

The source inventory, route proposal, shared tokens, state matrix and handoff
are in `docs/HUB_DESIGN_SPECIFICATION.md`. Phase 2 has not started; no live
navigation, database records, permission grants or formal policies changed.
