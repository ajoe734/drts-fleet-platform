# ADM-UI-001 SIDECAR ACCEPTANCE

Snapshot Type: owner refresh from `ai-status.json`
Snapshot Captured At: 2026-05-08T07:07:07Z
Snapshot Status At Capture: in_progress
Owner: Codex2
Reviewer: Codex
Parent Task: ADM-UI-001
Parent Title: Platform Admin Registry Visual Alignment

## Purpose

This packet is a sidecar-only support artifact for ADM-UI-001. It does not change canonical truth or runtime code. It packages an acceptance checklist, an ADM-UI-001-specific dependency map, and evidence anchors the reviewer can spot-check against the completed parent task.

## Scope Boundary

- Allowed: support material for the platform admin adapter-registry UI surface.
- Not allowed: edits to `apps/platform-admin-web`, `packages/contracts`, runtime behavior, registry semantics, or machine-truth closeout for the parent task.

## Machine-Truth Snapshot

- `ai-status.json` is authoritative; this markdown file is only a reviewer-facing snapshot captured at `2026-05-08T07:07:07Z`.
- Sidecar task `ADM-UI-001-SIDECAR-ACCEPTANCE` was `in_progress` at capture time with next step: `Refreshing acceptance packet snapshot and verifying sidecar evidence anchors.`
- Parent task `ADM-UI-001` is `done` in `ai-status.json` as of `2026-05-08T01:10:50Z`.
- Parent owner/reviewer: `Codex2` / `Copilot`.
- Parent recorded acceptance: `pnpm --filter @drts/platform-admin-web typecheck`.
- Parent recorded closeout: `823f134` / `feat(driver-app): rebuild multi-platform execution surfaces`.

## Acceptance Checklist

- [x] Packet is tied to ADM-UI-001 only, not generic infra or Kubernetes concerns.
- [x] Dependency map is anchored to the actual platform admin registry implementation surface.
- [x] Evidence references point to the parent task entry and concrete code anchors.
- [x] Reviewer instructions target the assigned reviewer for this sidecar task.
- [x] No canonical truth or runtime files are modified by this sidecar slice.

## Dependency Map

### UI surface

- `apps/platform-admin-web/app/adapter-registry/page.tsx:2-12`
  Renders the registry page shell, page title, descriptive copy, and the `AdapterList` entrypoint.
- `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx:15-199`
  Owns the fetch lifecycle, loading/error states, registry table columns, row rendering, and edit action trigger.
- `apps/platform-admin-web/app/adapter-registry/components/EditAdapterModal.tsx:16-315`
  Owns the modal editing surface for enablement, rollout status, webhook settings, and policy fields before issuing an update command.

### Contract surface

- `packages/contracts/src/platform-adapter-registry.ts:2-107`
  Defines the parent UI data contract:
  `AdapterConfig`, `RolloutStatus`, `CredentialStatus`, `WebhookStatus`, `Environment`, `AdapterType`, `FinanceAuthorityMode`, `Policy`, `PlatformAdapter`, and `UpdatePlatformAdapterCommand`.

### Data/API seam used by the UI

- `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx:8-13`
  Instantiates `ApiClient` with relative `baseUrl`.
- `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx:24-40`
  Reads adapter data through `apiClient.listPlatformAdapters()`.
- `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx:52-82`
  Persists edits through `apiClient.updatePlatformAdapter(selectedAdapter.id, updatedData)`.

## What The Reviewer Should Confirm

- The packet references the actual ADM-UI-001 implementation files instead of unrelated infra concepts.
- The checklist matches the parent task outcome: visual alignment for the platform admin adapter registry.
- The dependency map covers both rendering and contract seams:
  page shell, adapter list, edit modal, and `platform-adapter-registry` types/enums.
- The sidecar packet does not over-claim verification beyond the parent machine-truth record.

## Evidence Index

- `ai-status.json:11167-11201`
  Parent task record for `ADM-UI-001`, including `done` status, acceptance, commit, and push metadata.
- `ai-status.json:11233-11256`
  Sidecar task record for `ADM-UI-001-SIDECAR-ACCEPTANCE`.
- `apps/platform-admin-web/app/adapter-registry/page.tsx:2-12`
  Registry page entrypoint.
- `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx:15-199`
  Registry listing and edit trigger surface.
- `apps/platform-admin-web/app/adapter-registry/components/EditAdapterModal.tsx:16-315`
  Editable fields and update-command construction.
- `packages/contracts/src/platform-adapter-registry.ts:2-107`
  Shared contract definitions consumed by the UI.

## Reviewer Handoff

Owner handoff command:
`AI_NAME=Codex2 scripts/ai-status.sh handoff ADM-UI-001-SIDECAR-ACCEPTANCE Codex "ADM-UI-001 support packet refreshed: reviewer-facing snapshot now explicitly captures ai-status.json at 2026-05-08T07:07:07Z; packet remains ADM-UI-001-specific with checklist, dependency map, and evidence anchors in support/sidecars/ADM-UI-001/ADM-UI-001-SIDECAR-ACCEPTANCE.md. Verified git diff --check for the sidecar artifact; no canonical/runtime files changed."`

Reviewer approval command:
`AI_NAME=Codex scripts/ai-status.sh approve ADM-UI-001-SIDECAR-ACCEPTANCE "Reviewed: packet is ADM-UI-001-specific, anchored to adapter-registry UI/contracts, and limited to sidecar support material."`

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/ADM-UI-001/ADM-UI-001-SIDECAR-ACCEPTANCE.md` changed for this task.
- Run `git diff --check -- support/sidecars/ADM-UI-001/ADM-UI-001-SIDECAR-ACCEPTANCE.md`.
- Spot-check the anchor files and `ai-status.json` line ranges listed above.
