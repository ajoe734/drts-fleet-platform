# ORX-MD-004 Owner Handoff

Owner: `Codex2`  
Reviewer: `Codex`  
Date: `2026-04-30`  
Observed task status: `in_progress`

## Result

`ORX-MD-004` is ready for review on the current repo state.

This handoff closes the two blocking findings previously captured in
`ORX-MD-004-REVIEW.md`:

- the platform-admin edit form no longer lets operators route revocation
  through the generic update API
- partner ingress credential issue/rotate/revoke state is now part of the
  repository-backed tenant-partner snapshot and survives service reload

## Acceptance Anchors

### 1. Revocation now stays on the dedicated revoke path

- The edit form status selector now excludes `revoked`, so save actions cannot
  bypass the dedicated revoke endpoint anymore:
  [apps/platform-admin-web/app/partners/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/partners/page.tsx:972).
- The dedicated revoke flow still stamps revoke metadata, revokes active
  credentials for the same entry, persists both record families together, and
  emits the `revoke_partner_entry` audit event:
  [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1490).

### 2. Partner ingress credentials now persist across reloads

- Repository state and write contracts now include
  `partnerIngressCredentials`, with read/write SQL for
  `admin.phase1_partner_ingress_credentials`:
  [tenant-partner.repository.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:78),
  [tenant-partner.repository.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:185),
  [tenant-partner.repository.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:398).
- Service init bootstraps persisted credentials when present and seeds them only
  as fallback, then writes seed state once when the table is empty:
  [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:737).
- Issue/rotate and manual revoke now persist credential mutations immediately:
  [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1560),
  [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1645).
- Added the migration for the new snapshot table:
  [V0022\_\_partner_ingress_credential_persistence.sql](/home/edna/workspace/drts-fleet-platform/infra/migrations/V0022__partner_ingress_credential_persistence.sql:1).

### 3. Focused regression coverage exists for the persistence round-trip

- The existing credential lifecycle test still proves issue/rotate/revoke
  semantics and auth behavior:
  [tenant-partner.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/tenant-partner.service.test.ts:417).
- Added reload coverage proving rotated and revoked credentials round-trip
  through repository persistence:
  [tenant-partner.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/tenant-partner.service.test.ts:508).
- Added revoke coverage proving entry revocation persists both entry revoke
  metadata and credential revoke metadata together:
  [tenant-partner.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/tenant-partner.service.test.ts:570).

## Verification

Executed on current repo state:

```sh
pnpm -C apps/api exec vitest run tests/unit/tenant-partner.service.test.ts
pnpm -C apps/api exec tsc --noEmit
pnpm -C apps/platform-admin-web exec tsc --noEmit
```

Observed result:

- targeted `tenant-partner` suite passed: `1 file`, `15 tests`
- `apps/api` TypeScript check passed
- `apps/platform-admin-web` TypeScript check passed

## Review Ask

Please review against current `HEAD` and focus on:

- whether the UI change fully prevents the generic edit/save path from being
  used as a revoke surrogate
- whether the new repository snapshot + migration is sufficient for credential
  reload in DB-backed environments
- whether the new tests adequately cover reload persistence and entry-revoke
  persistence coupling
