# CRC-BE-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `CRC-BE-001`  
**Parent Owner / Reviewer:** `Codex` / `Claude2`  
**Sidecar Owner / Reviewer:** `Codex` / `Claude2`  
**Generated:** `2026-06-13` (UTC)  
**Updated:** `2026-06-14` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is support-only. It does not edit canonical truth, runtime code, or
the parent task. Its purpose is to give the reviewer one place to audit the
parent `CRC-BE-001` review handoff, evidence anchors, and the remaining points
worth validating from the recorded review packet evidence.

## 1. Scope Boundary

In scope:

- summarize the current machine-truth snapshot for the sidecar and parent task
- map the parent acceptance claim to concrete commit/file evidence
- highlight reviewer hotspots and any evidence drift worth checking
- hand off a clean packet to the assigned sidecar reviewer

Out of scope:

- editing L1/L2 product truth
- changing `CRC-BE-001` machine truth beyond normal sidecar status updates
- modifying implementation files under `apps/api/` or `infra/`
- redoing the parent implementation or replacing the parent reviewer judgment

## 2. Machine-Truth Snapshot

### 2.1 Sidecar row

`CRC-BE-001-SIDECAR-REVIEW` currently records:

- owner=`Codex`
- reviewer=`Claude2`
- status=`done`
- helper_parent=`CRC-BE-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- last_update=`2026-06-14T12:38:47Z`
- next=`Sidecar chairman operational review packet delivered and approved; closing out.`
- integration_status=`not_applicable`

### 2.2 Parent row

`CRC-BE-001` is not present in the current active task index. This packet keeps
the previously recorded parent review evidence as a historical reference:

- commit=`7bd1aa63d235cfc122646125da1c8e9d3fcdeaba`
- pushed branch=`origin/codex/crc-be-001`
- recorded validation=`pnpm --dir apps/api typecheck; pnpm --dir apps/api test -- partner-user-identity-link.repository.test.ts tenant-partner.repository.test.ts`

Parent summary/intent in machine truth:

- durable `(entrySlug, partnerUserRef) -> drtsPassengerId` binding
- repository surface: `resolveOrCreate`, `touchLastSeen`, `status`
- `partnerUserRef` remains opaque to DRTS
- same ref must resolve to the same passenger across return visits

## 3. Parent Commit Evidence

`git show --stat 7bd1aa63d235cfc122646125da1c8e9d3fcdeaba` reports:

- `apps/api/src/modules/tenant-partner/partner-user-identity-link.repository.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.module.ts`
- `apps/api/tests/unit/partner-user-identity-link.repository.test.ts`
- `infra/migrations/V0030__partner_user_identity_link_persistence.sql`

Total: `4 files changed, 373 insertions(+), 1 deletion(-)`.

`git show --format='%H%n%s%n%n%b' --no-patch 7bd1aa63...` confirms:

- subject=`CRC-BE-001: add partner identity link store`
- trailers: `LLM-Agent: codex`, `Task-ID: CRC-BE-001`, `Reviewer: Claude2`

`git branch -r --contains 7bd1aa63...` confirms the commit is present on:

- `origin/codex/crc-be-001`

## 4. Acceptance-to-Evidence Map

### AC-1. Same `(entrySlug, partnerUserRef)` always resolves the same passenger

Evidence:

- `PartnerUserIdentityLinkRepository.resolveOrCreate()` normalizes both key
  inputs and reuses the existing record when the key is already present.
- The DB-backed path uses `ON CONFLICT (entry_slug, partner_user_ref) DO NOTHING`
  and then reads back the stored record, so the stable key is explicit in SQL.
- Unit test `returns the same passenger for the same entrySlug and partnerUserRef`
  asserts the second lookup preserves `drtsPassengerId`, `linkedAt`, and
  `createdAt`.

### AC-2. A new partner ref creates a new passenger

Evidence:

- The fallback path generates `passenger_${randomUUID()}` only when no existing
  key is found.
- The insert path also seeds a new `drtsPassengerId` before the conflict check.
- Unit test `creates a new passenger id for a new partner reference` asserts a
  different `drtsPassengerId` for `partner-user-002`.

### AC-3. Runtime surface includes `resolveOrCreate`, `touchLastSeen`, `status`

Evidence:

- `partner-user-identity-link.repository.ts` exports the command type and all
  three repository methods.
- `touchLastSeen()` updates `last_seen_at`, `updated_at`, and the JSON `record`
  payload without changing the passenger binding.
- `status()` resolves through `find()` and returns the persisted status only.
- `tenant-partner.module.ts` registers and exports
  `PartnerUserIdentityLinkRepository`.

### AC-4. Migration applies

Evidence:

- `infra/migrations/V0030__partner_user_identity_link_persistence.sql` creates
  `admin.phase1_partner_user_identity_links`.
- Primary key is `(entry_slug, partner_user_ref)`.
- Secondary indexes support passenger lookup and entry-scoped lookup:
  `idx_phase1_partner_user_identity_links_passenger`,
  `idx_phase1_partner_user_identity_links_entry`.

### AC-5. Typecheck + tests passed

Evidence source is the recorded parent review handoff:

- `pnpm --dir apps/api typecheck`
- `pnpm --dir apps/api test -- partner-user-identity-link.repository.test.ts tenant-partner.repository.test.ts`

This sidecar packet does not independently rerun those commands.

## 5. Spec Alignment Anchors

The parent claim aligns with the broader partner-entry identity model already in
repo truth:

- `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
  defines `entrySlug` as the public-facing partner-entry routing token and makes
  it a durable identity input.
- Parent machine truth adds the missing persistence rule that `partnerUserRef`
  is opaque to DRTS while still mapping stably to a single passenger per
  `entrySlug`.

The packet does not restate or extend product semantics beyond those two points.

## 6. Reviewer Hotspots

1. Parent machine truth lists artifacts as `apps/api/src/modules/tenant-partner/`
   and `apps/api/migrations/`, but the actual migration file in the commit is
   `infra/migrations/V0030__partner_user_identity_link_persistence.sql`.
   Reviewer should decide whether that artifact-path drift is acceptable as-is
   or should be corrected by the parent owner in a follow-up status refresh.
2. The repository has dual behavior: in-memory fallback when `DatabaseService`
   is unavailable, SQL persistence when enabled. Parent review should confirm
   this fallback behavior is intentional and does not weaken the durable-binding
   acceptance for the environments that matter.
3. `touchLastSeen()` updates the JSON `record` payload and timestamp columns but
   does not test the real DB update path end-to-end; current tests cover the
   fallback path plus SQL-shape assertions only.
4. The DB key is `(entry_slug, partner_user_ref)`, while one architecture doc
   describes partner entry identity as `(tenantSlug, entrySlug)`. Review should
   confirm that omitting `tenantSlug` here is safe because `entrySlug` is
   already globally unique in the intended runtime path.

## 7. Recommended Reviewer Checks

For the parent reviewer (`Claude2`), the highest-value checks are:

- confirm the persistence key matches the intended identity model
- confirm `PartnerUserIdentityLinkRepository` being exported from
  `tenant-partner.module.ts` is sufficient for downstream use
- confirm the migration location/name matches the repo's actual migration runner
- confirm the recorded validation commands are enough for the new store surface

For the sidecar reviewer (`Claude2`), the packet review should only answer:

- does this file stay within support-only scope
- do its key claims match `ai-status` and `git show`
- are the reviewer hotspots accurate and useful

## 8. Closeout Note

This sidecar is already closed in machine truth. The remaining repo hygiene step
for this worktree is to commit and push this support artifact so branch state
matches the recorded closeout.

If machine truth ever needs to be replayed from `review_approved`, the expected
closeout status would still be `INTEGRATION_STATUS=not_applicable` because this
slice is support-only and has no deploy target.
