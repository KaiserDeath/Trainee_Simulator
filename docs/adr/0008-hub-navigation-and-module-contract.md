# ADR 0008: Hub navigation and module delivery contract

Date: 2026-11-05

Status: Accepted for the approved design implementation.

The user approved the four-screen design direction on 2026-11-05. Keep the
existing React/Express modular monolith, worker, Supabase records and service
boundaries. No framework migration or service split is needed for this increment.

## Navigation

Use hash routes for learner home, assigned catalog, module workspace, evaluations
and groups. A module URL includes both course and module IDs. Filters use stable
values in the URL. Validate the requested course/module pair against authorized
enrollments; unknown/foreign links show an unavailable state rather than silently
opening another module. Preserve the old learner entry via `#/learn` and
`#hub-learning`, and existing staff `#hub-*` links. `/hub` opens learner home or
the appropriate staff workspace. `#/staff/home` is a trainer overview alias.

Catalog and home are display projections of existing authorized learning-path
records, including every non-withdrawn enrollment. They add no global discovery
permission. This first slice reuses the existing response; it does not yet claim
a metadata-only summary endpoint or reduced learning-path payload size.

Keep the active learning workspace and assessment mounted across learner view
changes. An open assessment prevents workspace navigation. Warn before leaving
dirty activity inputs; canceled navigation keeps the current URL and inputs.
Reload warnings protect unsaved input; saved attempt recovery remains the
existing runtime's responsibility. Navigation itself creates no attempt or grade.

## Module contract version 1

Use existing records rather than duplicate module tables:

| Contract field | Existing authority |
| --- | --- |
| Identity | `hub_courses`, `hub_modules`, stable code and immutable IDs |
| Enrollment and prerequisites | `hub_enrolments`, `hub_module_prerequisites`, server availability checks |
| Activities | `hub_activities.activity_type` and bounded `content.executionKind`/`surface` definitions |
| Source version | Existing content versions and immutable attempt snapshots |
| Locale | Shared locale context, authorized exact-source companions; reviewed authoring workflow remains a separate phase |
| Completion | Existing server commands and module progress; formal completion requires official successful submission |
| Evidence | Existing attempts, policy versions, evidence and trainer reports |

`hubLearningModel.js` projects these records without changing input records.
`hubModuleContract.js` maps supported built-in definitions to exactly one
renderer. Execution kind takes precedence over generic content type; an official
evaluation scaffold must never expose an article-completion shortcut. Unknown
execution kinds, unknown practice surfaces and unimplemented simulations render
an unavailable explanation and no completion command. No definition can name or
load executable code. Server authorization and scoring remain authoritative.

Activity mappings cover article, checklist, acknowledgement, legacy Account ID
Lab, native account lab/creation, exact search, balance/credit/withdrawal,
password reset, exceptions, mixed practice and official evaluation guidance.
Other future types require explicit implementation and verification.

The contract version identifies this UI mapping. It is not a replacement for
database content/policy versions or an assertion that every future module is
supported. Migrate additional types through reviewed, compatible changes.

## Staff snapshot and rollback

The Capacitador home summarizes only the learner records already returned by the
existing authorized snapshot. It labels retrieval time and loaded-snapshot
counts. Update is explicit; failure preserves prior data and shows a retry
message. No background polling or new historical evidence download was added.

This slice has no schema migration or progress rewrite. Roll back presentation
and routing to the prior release if necessary, retaining all persisted learning
records. Verify direct links, Back/Forward, locale switching, role boundaries,
activity idempotency and the real assessment flow before deployment.
