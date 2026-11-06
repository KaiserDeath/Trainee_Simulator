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
