# Governed bilingual authoring

Updated: 2026-11-06. Phase 5 implementation; deployment tracked separately below.

Administrators can author an exact-source Spanish companion for an English lesson,
submit it for another administrator's review, and publish the pair. Missing,
incomplete or stale companions block new English instruction publication. A
preparation draft never replaces the current published lesson. Historical attempts
retain the source and translation pinned when they began.

Trainers publish English and Spanish question/choice text together through the
existing private question workflow. Choice IDs, correct options, scores and role
permissions retain their existing meaning. Source edits invalidate the affected
Spanish draft and review confirmation. Question translations remain private and
are returned only for authorized bank, runtime and evidence projections.

Scoped translation failure falls back to canonical text with an explicit notice.
It does not convert a committed action into a failed save. Display refresh reads
preserve answers and timers. Activity-specific dirty state prevents another
activity's successful save from clearing an unsaved-input warning.

## Local evidence

- Foundation: 263 backend, 12 shared rules, 61 database safety, 11 language/model
  and 87 Chromium checks passed, plus lint and production build.
- Actual local Auth/Express/browser: separate administrators published both lesson
  locales; self approval and publication without Spanish were denied. A completed
  lesson retained its original Spanish text after a later publication. A new
  bilingual private question was used in real assessment runtime with unchanged
  answer IDs, 100/80 scoring, retries, original results and trainer evidence review.
- Backup/restore: all 78 public tables, Auth/Storage metadata, functions, guards and
  permissions matched. All 12 transactional scenarios and a second restore with
  nonempty formal evidence passed; disposable restore databases were removed.
- The 320 px Spanish authoring view passed its targeted accessibility/overflow
  checks and was visually inspected. This is synthetic evidence, not WCAG or human
  acceptance certification.

See foundation.json, local-real-browser.json and local-recovery.json. The screenshot
contains synthetic instructional content and no learner records or private answers.

## Migration and rollout

The additive migration is 20261105001000_governed_bilingual_authoring.sql. It adds
private Spanish question metadata, bounded service-role translation helpers and
snapshot pinning; strengthens new lesson publication and restricts the obsolete
English-only service-role question publisher. Existing content, attempts, results,
policy heads and scores are not rewritten. No real curriculum or evaluation is
published by this delivery.

Before hosted application release, require fresh-database CI and an explicit hosted
preview naming only this migration. Apply with project zvpkiwkvwtdztmeyugdg and
vault/seed/role updates excluded, then verify live API and frontend separately.
The current hosted preflight has zero authored instruction versions and four
private question versions; preserve those source records.

Rollback: first disable the affected publication UI/routes or fix forward. Do not
remove display_es, historical snapshots or reviewed companions after they contain
new data. An old backend's English-only question publisher will be denied by the
new schema; restoring that permission would require a deliberate reviewed change,
not an automatic rollback. Existing reading/practice remains compatible.

## Remaining acceptance

Four formal evaluation policies remain draft. Named Capacitador curriculum and
policy approval, a designated hosted approved-policy assessment journey and a
supervised pilot are still required. The Hub supports existing employees and new
learners; no total-user cap is introduced by these changes.

### Delivery verification, 2026-11-06

Implementation commits b7817b4 and 53ff92c reached main. Main CI run 42242927252
passed both foundation and isolated-database jobs. An earlier media fixture failed
because it lacked the newly required Spanish lesson companion; the corrected fixture
passed locally and in the fresh main run. The duplicate branch workflow was canceled
after the main run passed.

Hosted preview and delivery named only migration 20261105001000, with no seeds,
vault or role updates. Post-migration hashes preserved original question content
and all four draft evaluation definitions; five identities remain and policy heads
remain empty. Vercel production deployment 7603775423 serves 53ff92c.

The fresh hosted recovery rehearsal passed 114 public/Auth/Storage/ledger tables
and one generated private file, including source stability, restored hashes,
permissions, Auth credentials, private file bytes and actual Hub signed download.
Five original identities were preserved and cleanup passed. This is a rehearsal,
not a retained operational backup or a production cutover.

The user chose to leave reviewer/supervisor identities unassigned and select the
pilot group later. The bilingual review packet is docs/HUB_CAPACITADOR_REVIEW_PACKET.md;
no human acceptance record was fabricated.

### Final hosted application proof

The hosted bilingual probe passed paired lesson publication through the actual
API, missing-Spanish and self-approval denial, Spanish rendering after reload,
English switching, learner denial of private bank/author writes, and TRAINER
publication of a new private bilingual question with unchanged answer IDs. Its
lesson and question were disposable verification content, not real curriculum.
All five original identities remained. Hashes for the eight existing question and
evaluation records matched exactly; owned cleanup passed.
See hosted.json and hosted-spanish-owned-lesson.png.

Earlier probe assertions were corrected to reload after an enrollment created
later in the session and to use distinct temporary course/question codes. No
application bypass was added. Every failed probe also passed owned cleanup.
The hosted check starts no formal assessment and makes no human acceptance claim;
the full runtime/score/history journey is covered by the separate real local gate.
