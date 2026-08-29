# ADR 0006: Training media storage and delivery

- Status: Proposed
- Date: 2026-08-20
- Decision owners: Trez content/privacy and infrastructure owners
- Required before: uploading production Module 1 or Module 2 media

## Context

The Hub must support videos, images, and downloadable learning resources. Trez has not approved a media provider, content workflow, retention period, privacy classification, launch bandwidth, captioning workflow, or regional delivery requirements. The Operator Backend guide is reference evidence and must not be copied wholesale into training assets.

## Decision

Hub content records will store provider-neutral media metadata and stable internal asset identifiers. Binary delivery may use approved object storage or a video provider, but course/module/activity records will not depend on provider-specific URLs as their durable identity.

Access to non-public media must be authorized from the same server-enforced Hub identity context as the containing activity. Delivery will use short-lived access or an equivalent approved control; service credentials and permanent privileged URLs must not reach the browser.

Required metadata includes:

- Stable asset identifier, media kind, title, owner, and approval status.
- Storage-provider reference kept behind the media boundary.
- Content type, byte size, integrity value, and version/replacement relationship.
- Accessibility assets such as captions, transcript, alt text, and language where applicable.
- Created/published/retired timestamps and audit references.

## Required decision before implementation

Trez must approve:

- Storage/video provider and hosting ownership.
- Privacy classification and allowed viewers/download behavior.
- Retention, replacement, deletion, and legal/audit requirements.
- Launch languages, caption/transcript ownership, and accessibility review.
- Expected media volume, file limits, playback quality, and regional delivery needs.

## Consequences

- Milestone 0 may define interfaces and neutral fixtures but will not upload production content.
- Example credentials, passwords, customer data, and transient screenshots from the guide are not training fixtures.
- Replacing a media file must not silently change the evidence for a completed versioned activity.
- Provider selection and migration details require a follow-up ADR after the outstanding inputs are approved.
