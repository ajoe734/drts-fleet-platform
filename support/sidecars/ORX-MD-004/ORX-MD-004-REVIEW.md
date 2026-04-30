# ORX-MD-004 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `changes_requested`

## Findings

1. The edit form can revoke an entry through the generic update path, but that path does not execute the real revoke flow.
   Evidence:
   - `apps/platform-admin-web/app/partners/page.tsx:972-979` includes `"revoked"` in the status select whenever an existing entry is edited.
   - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1391-1428` only flips `status` / `activeFlag` and persists `partnerEntries` when `updatePlatformPartnerEntry()` receives `status: "revoked"`.
   - The actual revoke flow at `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1465-1507` also stamps `revokedAt` / `revokedBy` / `revokeReason`, revokes active ingress credentials, and emits the dedicated `revoke_partner_entry` audit event.
     Impact:
   - A platform-admin user can mark an entry as `revoked` from the edit form, but the record keeps null revoke metadata, credentials remain live, and the auditable revoke path is bypassed.
     Fix ask:
   - Remove `"revoked"` from the generic edit form, or route that selection through `revokePlatformPartnerEntry()` instead of `updatePlatformPartnerEntry()`.
   - Add a focused test that proves revocation always stamps revoke metadata and revokes active credentials.

2. Partner ingress credential rotation/revoke is in-memory only and does not survive repository-backed reloads.
   Evidence:
   - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:585-612` keeps `partnerIngressCredentials` as an in-memory array seeded only from env/bootstrap data.
   - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1549-1574` and `1608-1636` mutate that array for issue/rotate/revoke, but neither path calls `persistChanges()` for credential state.
   - `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:77-100` and `278-380` define persisted tenant-partner state without any `partnerIngressCredentials` collection or write path.
     Impact:
   - In DB-enabled environments, credential rotations and revocations are lost on restart / rehydrate even though the UI and audit trail report success. That breaks the acceptance claim that credential rotation and revoke paths are auditable and operationally real.
     Fix ask:
   - Add repository + DB persistence for partner ingress credentials, load them during `onModuleInit()`, and cover the round-trip with a focused persistence/reload test.

## Verification

- `pnpm -C apps/api exec vitest run tests/unit/tenant-partner.service.test.ts` -> passed (`13/13`)
- I did not rerun the full API / platform-admin typecheck matrix because the two findings above are blocking by code inspection alone. The passing targeted suite also shows current tests do not cover these regressions yet.
