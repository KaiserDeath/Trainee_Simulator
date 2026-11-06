# ADR 0010: Governed bilingual authoring

Date: 2026-11-05

Status: Accepted within existing roles; implemented and locally verified. Hosted delivery and human content/release approval are separate.

## Lesson instructions

Reuse `hub_content_versions` and its separate-author ADMIN review workflow.
English versions remain canonical instructional sources. A Spanish version
stores an exact-source translation dictionary, English source version ID and
source fingerprint. Its keys must cover only the approved instructional text
fields; identifiers, operational rules, media IDs and grading fields are excluded.

Review and publish the Spanish companion first; it remains inert for delivery
until its matching English version is published. Publishing a new English
instruction requires that reviewed companion. A source edit invalidates the
fingerprint match. Archived, previously reviewed companions remain available for
their matching historical source, so preparing the next version does not break
the current published version.

New activity attempts pin the selected source and translation version/dictionary
in their immutable definition snapshot. Existing snapshots are not rewritten.
Current activity responses receive only their matching approved companion;
historical attempts use their pinned companion. Instruction translations are
scoped to activity content, rather than overriding unrelated interface labels.

The existing reviewed exact-source catalogs remain the bridge for current seed
content. New authored source/translation publication uses the governed workflow;
editing free-text coaching or uploading media does not invoke machine translation.

## Private assessment questions

Keep the existing TRAINER authority for question publication. Publish English
and reviewed Spanish question/choice text atomically as one immutable question
version. The same choice IDs and one canonical correct option remain authoritative;
Spanish data may not contain correctness flags or extra answer IDs. Editing an
English stem/choice clears its draft Spanish counterpart for explicit review.

Store Spanish display metadata with the private question version and pin it into
new runtime theory snapshots. Authorized runtime responses receive only their
assigned question/choice translations. Private bank and evidence routes retain
their existing role boundaries; no question text enters the public frontend
bundle. Old question versions and old runtime snapshots stay unchanged, with the
existing private seed companions as their compatibility bridge.

Do not add an ADMIN question-bank grant or a new separate-person question-review
requirement under the guise of translation. Those would change the existing
permission/publication policy and need an explicit product decision.

## Delivery and failure behavior

Use bounded service-role helpers after existing request authorization. Translation
enrichment must not turn a successfully committed practice/runtime action into
a reported mutation failure: retain its result and show a translated source-language
fallback notice if the display lookup fails. Successful enrichment clears that
notice. Do not retry a saved financial/game command to fetch a display translation.

The migration is additive except for strengthening publication checks and
restricting the obsolete English-only service-role question publisher. Current
published lessons, policy heads, question versions, scores and attempts remain.
Test source changes, separate approval, incomplete dictionaries, stale fingerprints,
historical snapshots, question choice-ID parity and denied public/foreign reads
in a fresh local/CI database before hosted delivery. Keep real publication and
human release acceptance separate from tool implementation.
