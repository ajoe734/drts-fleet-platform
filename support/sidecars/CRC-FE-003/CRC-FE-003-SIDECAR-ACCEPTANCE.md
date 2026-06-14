# CRC-FE-003 SIDECAR ACCEPTANCE

Snapshot Type: owner-prepared acceptance support packet
Snapshot Captured At: 2026-06-14T10:20:19Z
Snapshot Status At Capture: in_progress
Owner: Codex
Reviewer: Codex2
Parent Task: CRC-FE-003
Parent Title: platform-admin referral channel management (Group C)
Dependency Focus: CRC-BE-006

## Purpose

This packet is a sidecar-only support artifact for `CRC-FE-003`. It does not change canonical truth or runtime code. It packages the current acceptance checklist, dependency map, and reviewer-facing evidence anchors for the referral-channel management slice under Platform Admin.

## Scope Boundary

- Allowed: support material for the `CRC-FE-003` referral-channel UI slice.
- Not allowed: edits to `apps/platform-admin-web`, `packages/contracts`, `apps/api`, `docs/**`, or machine-truth closeout for the parent task.

## Machine-Truth Snapshot

- `AI_NAME=Codex scripts/ai-status.sh show CRC-FE-003-SIDECAR-ACCEPTANCE`
  captured this sidecar as `in_progress` at `2026-06-14T10:18:44Z`.
- `AI_NAME=Codex scripts/ai-status.sh show CRC-FE-003`
  shows the parent task as `backlog` with owner/reviewer `Codex` / `Claude2`.
- `AI_NAME=Codex scripts/ai-status.sh show CRC-BE-006`
  shows the only declared dependency as `done`, with commit `c6bd30a0c2d8ffa89f0000f7dbdf3f1bb5b0127f` and `integration_status=merged_to_dev`.
- This markdown file is only a reviewer-facing snapshot. `ai-status.json` remains authoritative.

## Closeout Addendum

- Sidecar reviewer approval was recorded by `Codex2` on `2026-06-14`, approving this packet as support-only material for `CRC-FE-003`.
- Parent task `CRC-FE-003` is now recorded in machine truth as `done` with commit `a6e38b86acf556b4a74af6ce677525b7f7dcf3f9` on `origin/dev`.
- This sidecar packet remains non-canonical support material. Its closeout scope is limited to preserving the acceptance checklist, dependency map, and evidence anchors used during that referral-channel review.

## Sidecar Checklist

- [x] Packet is limited to support material under `support/sidecars/CRC-FE-003/`.
- [x] Dependency coverage is anchored to the actual referral-channel canvas, UI routes, contracts, and backend seams.
- [x] The packet explicitly records that `CRC-BE-006` is already satisfied in machine truth.
- [x] The packet does not claim the parent task is complete or approved.
- [x] No canonical truth or runtime files were modified by this sidecar slice.

## Parent Acceptance Checklist

Source: `ai-status.sh show CRC-FE-003` acceptance field plus the dispatch brief.

- [ ] `/partners` renders the referral-channel list/create flow with canvas-aligned filters, partner entry table, and create action for the Group C slice.
- [ ] `/partners/[entrySlug]` covers referral-channel detail management for branding, entry host / ingress posture, activation lifecycle, and credential governance.
- [ ] Revenue-share configuration reflects the `CRC-BE-006` backend model: `rateType` `percent|per_trip`, `value`, `currency`, and effective period.
- [ ] Ingress credential issuance / rotate / revoke preserves the plaintext-once handling described by the referral canvas.
- [ ] zh-TW copy and Platform Admin route wiring stay within the existing `platform` realm model.
- [ ] Parent closeout still needs its own implementation verification (`typecheck + build pass`) before `CRC-FE-003` can move beyond review.

## Dependency Map

### 1. Visual and acceptance authority

- `docs/05-ui/drts-design-canvas/platform-referral.jsx:1-4`
  Declares the Group C referral-channel slice, the expected Platform Admin surface, and the required additions: `entryHost` whitelist, `themeAccent` / branding metadata, rate config, and ingress credentials.
- `docs/05-ui/drts-design-canvas/platform-referral.jsx:13-44`
  Defines the referral-channel list target on `/partners?type=referral`, including the table columns for channel, `referral_channel` type, host whitelist, theme, rate, users, and status.
- `docs/05-ui/drts-design-canvas/platform-referral.jsx:46-127`
  Defines the create/edit target with `displayName`, `entrySlug`, `partnerType=referral_channel`, status, host whitelist, and branding preview.
- `docs/05-ui/drts-design-canvas/platform-referral.jsx:129-190`
  Defines the rate-config target: `rateType`, `value`, `currency`, effective dates, audit history, and settlement preview.
- `docs/05-ui/drts-design-canvas/platform-referral.jsx:192-234`
  Defines the ingress-credential target, including masked roster plus plaintext-once secret reveal flow.

### 2. Platform Admin list/create surface

- `apps/platform-admin-web/app/partners/page.tsx:193-264`
  Owns the route-level load lifecycle through `usePlatformAdminClient()` and `listPlatformPartnerEntries()`.
- `apps/platform-admin-web/app/partners/page.tsx:284-348`
  Computes status/readiness filter pills that drive the list view.
- `apps/platform-admin-web/app/partners/page.tsx:350-373`
  Owns the create-entry submission path and required form fields before calling `createPlatformPartnerEntry(...)`.
- `apps/platform-admin-web/app/partners/page.tsx:375-420`
  Renders the page header actions and filter surface for the parent entry-management route.

### 3. Shared partner-entry form and readiness seam

- `apps/platform-admin-web/components/partner-governance-shared.tsx:35-165`
  Defines the shared form shape and command transformation used by the partner entry create/update flows.
- `apps/platform-admin-web/components/partner-governance-shared.tsx:165-228`
  Defines readiness gating used to surface missing governance inputs before traffic promotion.

### 4. Detail route, credential lifecycle, and governance actions

- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1242-1307`
  Loads the selected partner entry and its ingress credentials, with a local preview fallback for workspace verification.
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1313-1341`
  Persists partner-entry edits through `updatePlatformPartnerEntry(...)`.
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1343-1412`
  Issues or rotates ingress credentials and retains the plaintext-once reveal state.
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1414-1519`
  Runs activate, deactivate, revoke-entry, and revoke-credential governance actions against Platform Admin APIs.
- `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1928-2009`
  Exposes the primary detail-page actions: preview, activate/deactivate, issue credential, rotate credential, and revoke entry.

### 5. Contract and API seam, including CRC-BE-006 dependency

- `packages/contracts/src/referral-channel.ts:1-37`
  Defines `partnerType=referral_channel` and the referral revenue-share rule contract (`rateType`, `value`, `currency`, `effectiveFrom`, `effectiveUntil`, settlement direction).
- `packages/api-client/src/index.ts:2298-2385`
  Defines the client-side Platform Admin API seam used by the parent FE route:
  partner-entry list/create/update/status actions plus ingress-credential list/issue/revoke.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:478-629`
  Exposes the backend endpoints for partner entries, referral rates, and ingress credential lifecycle.
- `apps/api/tests/unit/tenant-partner.service.test.ts:457-559`
  Covers partner-entry create/update lifecycle and audit metadata.
- `apps/api/tests/unit/tenant-partner.service.test.ts:611-699`
  Covers credential rotate/revoke behavior and audit evidence.

## What The Reviewer Should Confirm

- The packet stays narrowly scoped to `CRC-FE-003` support material and does not mutate product truth.
- `CRC-BE-006` is correctly treated as satisfied dependency, not as open blocker.
- The checklist matches the Group C referral-channel canvas rather than the more generic `/partners` baseline.
- The evidence anchors cover both halves of the parent FE slice:
  list/create on `/partners` and detail/rate/credential governance on `/partners/[entrySlug]`.
- The packet does not over-claim parent verification beyond the machine-truth records currently available.

## Evidence Index

- Machine truth:
  `AI_NAME=Codex scripts/ai-status.sh show CRC-FE-003-SIDECAR-ACCEPTANCE`
  `AI_NAME=Codex scripts/ai-status.sh show CRC-FE-003`
  `AI_NAME=Codex scripts/ai-status.sh show CRC-BE-006`
- Canvas authority:
  `docs/05-ui/drts-design-canvas/platform-referral.jsx:1-234`
- FE list/create:
  `apps/platform-admin-web/app/partners/page.tsx:193-420`
- Shared form/readiness:
  `apps/platform-admin-web/components/partner-governance-shared.tsx:35-228`
- FE detail/credentials:
  `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1242-1519`
  `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:1928-2009`
- Contracts and backend:
  `packages/contracts/src/referral-channel.ts:1-37`
  `packages/api-client/src/index.ts:2298-2385`
  `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:478-629`
  `apps/api/tests/unit/tenant-partner.service.test.ts:457-699`

## Reviewer Handoff

Owner handoff command:
`AI_NAME=Codex scripts/ai-status.sh handoff CRC-FE-003-SIDECAR-ACCEPTANCE Codex2 "Prepared CRC-FE-003 acceptance packet in support/sidecars/CRC-FE-003/CRC-FE-003-SIDECAR-ACCEPTANCE.md. Packet captures machine-truth snapshot, parent acceptance checklist, dependency map, and evidence anchors for the referral-channel Platform Admin slice; confirms CRC-BE-006 is done/merged_to_dev. Verified git diff --check for the sidecar artifact; no canonical/runtime files changed."`

Reviewer approval command:
`AI_NAME=Codex2 scripts/ai-status.sh approve CRC-FE-003-SIDECAR-ACCEPTANCE "Reviewed: packet stays sidecar-only, maps CRC-FE-003 to referral canvas + FE/API seams, and correctly treats CRC-BE-006 as satisfied dependency."`

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/CRC-FE-003/CRC-FE-003-SIDECAR-ACCEPTANCE.md` changed for this task.
- Run `git diff --check -- support/sidecars/CRC-FE-003/CRC-FE-003-SIDECAR-ACCEPTANCE.md`.
- Spot-check the cited route, contract, API-client, controller, and unit-test anchors above.
