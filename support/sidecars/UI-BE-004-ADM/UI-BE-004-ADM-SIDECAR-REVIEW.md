# UI-BE-004-ADM Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `UI-BE-004-ADM` - Search endpoint for platform-admin (cross-entity)
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-26` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT`

---

## 1. Scope Boundary

This packet is support-only. It records the current machine-truth snapshot, rerun verification,
and reviewer findings for `UI-BE-004-ADM` without editing canonical product truth or changing the
parent implementation.

In scope:

- summarize `UI-BE-004-ADM` and `UI-BE-004-ADM-SIDECAR-REVIEW` state
- capture the current worktree evidence for `GET /api/platform/search`
- record rerun verification results
- document the reviewer conclusion and the concrete reopen reason

Out of scope:

- changing `apps/api/src/modules/search/**`
- changing `apps/api/src/app.module.ts`
- changing `ai-status.json` except through lifecycle commands
- finalizing the parent task to `done`

---

## 2. Machine-Truth Snapshot

### Parent task

`ai-status.json -> UI-BE-004-ADM`

- owner=`Codex2`
- reviewer=`Codex`
- status at review pickup=`review`
- acceptance=`GET /api/platform/search returns SearchResultRecord grouped by category; vitest`
- artifacts=`apps/api/src/modules/search/`
- last_update=`2026-05-26T14:17:48Z`

### Sidecar task

`ai-status.json -> UI-BE-004-ADM-SIDECAR-REVIEW`

- owner=`Codex`
- reviewer=`Codex2`
- status at packet write=`in_progress`
- helper_parent=`UI-BE-004-ADM`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/UI-BE-004-ADM/UI-BE-004-ADM-SIDECAR-REVIEW.md`

---

## 3. Evidence Summary

### Worktree delta under review

The parent worktree currently adds or changes:

- `apps/api/src/app.module.ts`
- `apps/api/src/modules/platform-admin/platform-admin.module.ts`
- `apps/api/src/modules/search/platform-search.controller.ts`
- `apps/api/src/modules/search/platform-search.service.ts`
- `apps/api/src/modules/search/platform-search.types.ts`
- `apps/api/src/modules/search/search.module.ts`
- `apps/api/tests/unit/platform-search.controller.test.ts`
- `apps/api/tests/unit/platform-search.service.test.ts`

### Functional coverage present in the worktree

The implementation adds `GET /api/platform/search` with:

- `q` and `types` query parsing in `PlatformSearchController`
- grouped result output for `tenants`, `partners`, `users`, `adapter_registry`, and `audit`
- invalid type rejection via `ApiRequestError`
- adapter-registry alias handling
- platform-admin and tenant-user aggregation in the `users` group
- module wiring for `TenantsService` export so the search service can inject tenant data

### Verification rerun on 2026-05-26 UTC

Commands rerun in the assigned worktree:

```bash
pnpm --dir apps/api exec vitest run tests/unit/platform-search.service.test.ts tests/unit/platform-search.controller.test.ts
pnpm --filter @drts/api typecheck
```

Results:

- vitest: `2` files passed, `5` tests passed
- typecheck: passed

No functional failures were reproduced in the platform-specific unit tests.

---

## 4. Reviewer Finding

### Finding 1 - Generic `SearchModule` collides with the already-completed OPS search branch

The parent implementation uses the shared generic module path and class:

- `apps/api/src/modules/search/search.module.ts` exports `SearchModule`
- `apps/api/src/app.module.ts` imports `SearchModule` from `./modules/search/search.module`

This collides directly with `origin/codex/ui-be-004-ops`, which already uses the same file path
and class name for the OPS endpoint:

- `origin/codex/ui-be-004-ops:apps/api/src/modules/search/search.module.ts`
- `origin/codex/ui-be-004-ops:apps/api/src/app.module.ts`

Impact:

- rebasing or integrating the platform branch with the approved OPS search branch creates a direct
  file-level conflict on `apps/api/src/modules/search/search.module.ts`
- even after manual conflict resolution, the current generic name makes it too easy to wire only
  one realm's search module into `AppModule`
- the tenant search branch already avoids this pattern by using `tenant-search.module.ts` and
  `TenantSearchModule`, so the platform branch should follow the same namespacing approach

Required fix before parent approval:

- rename `apps/api/src/modules/search/search.module.ts` to
  `apps/api/src/modules/search/platform-search.module.ts`
- rename the exported class to `PlatformSearchModule`
- update `apps/api/src/app.module.ts` to import `PlatformSearchModule`
- rerun the same vitest and typecheck commands

No second functional bug was found after the rerun. The reopen recommendation is integration-risk
driven and specific to the shared `apps/api/src/modules/search/` surface.

---

## 5. Reviewer Conclusion

Parent task recommendation: `reopen`

Reason:

- acceptance behavior is implemented and tests are green
- the module/file naming is not integration-safe against the already completed OPS search branch
- approving now would lock in an avoidable collision on a shared surface

Sidecar recommendation: hand off this packet to `Codex2` so the parent owner has a compact,
machine-truth-aligned record of the reopen reason and the successful verification rerun.
