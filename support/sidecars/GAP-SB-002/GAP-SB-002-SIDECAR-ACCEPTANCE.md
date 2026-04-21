# GAP-SB-002 Acceptance Packet

**Task:** GAP-SB-002 — platform-admin: retire published public info version（`POST /retire` endpoint + UI 按鈕）
**Sidecar:** GAP-SB-002-SIDECAR-ACCEPTANCE
**Prepared by:** Codex (2026-04-19)
**Reviewer:** Codex2
**Recorded parent commit:** `29a083688ecf97b373cd152f10d1c985de82c9b7`

---

## 0. Scope Boundary

This sidecar is a support-only acceptance packet. It does not modify L1 canonical truth, runtime contracts, or the primary implementation. Its purpose is to package reviewer-ready evidence for the already-recorded parent task and to note any drift between the recorded completion evidence and the current shared workspace.

- In scope: acceptance checklist, dependency map, recorded evidence anchors, current-workspace revalidation, reviewer handoff notes
- Out of scope: changing controller/service/client/UI runtime behavior, changing task semantics in L1 docs, or repairing branch/merge drift

---

## 0.5 Machine-Truth Baseline

- Parent task `GAP-SB-002` is already `done` in `ai-status.json`.
- Machine truth records owner `Codex`, reviewer `Codex2`, and commit `29a083688ecf97b373cd152f10d1c985de82c9b7` with subject `feat(gap-sb-002): retire published public info version`.
- Parent review note states the accepted behavior was:
  - `POST /api/platform-admin/public-info/:versionId/retire`
  - controller-side actor attribution via verified identity
  - switchboard `Retire` button on published rows
  - placard generation blocked for retired public-info sources
- This sidecar task exists only to hand the acceptance packet to `Codex2`.

---

## 1. Recorded Delivery Snapshot

According to the recorded parent commit `29a0836`, GAP-SB-002 delivered all of the following:

| File                                                               | Recorded change at `29a0836`                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/platform-admin/platform-admin.controller.ts` | Added `@Post("public-info/:versionId/retire")`; forwarded verified `actorId` via `requireActorId(identity)`                                                                          |
| `apps/api/src/modules/platform-admin/platform-admin.service.ts`    | Added `retirePublicInfoVersion()` with published-only guard, audit log, `retiredBy`, and `effectiveTo`; blocked placard generation from retired source with `PLACARD_SOURCE_RETIRED` |
| `apps/platform-admin-web/app/switchboard/page.tsx`                 | Added `retiringVersionId`, `handleRetire()`, and `Retire` button for published rows                                                                                                  |
| `packages/api-client/src/index.ts`                                 | Added `retirePublicInfoVersion(versionId, command)` client method                                                                                                                    |
| `packages/contracts/src/index.ts`                                  | Added `RetirePublicInfoVersionCommand`                                                                                                                                               |
| `tests/unit/platform-admin.test.ts`                                | Added service/controller retire tests and a retired-source placard guard test                                                                                                        |

Commit metadata:

| Field       | Value                                                    |
| ----------- | -------------------------------------------------------- |
| Commit hash | `29a083688ecf97b373cd152f10d1c985de82c9b7`               |
| Subject     | `feat(gap-sb-002): retire published public info version` |
| Author      | `ajoe734 <bjoe734@gmail.com>`                            |
| Commit date | `2026-04-18T15:11:35Z`                                   |

---

## 2. Acceptance Checklist

### 2.1 Recorded Parent Acceptance

- [x] **Retire endpoint existed in the recorded parent commit**  
      `apps/api/src/modules/platform-admin/platform-admin.controller.ts` at `29a0836:62-77`
- [x] **Verified identity actorId overrode request-body `retiredBy`**  
      `apps/api/src/modules/platform-admin/platform-admin.service.ts` at `29a0836:380-446`
- [x] **Only published public info versions could be retired**  
      `PUBLIC_INFO_VERSION_NOT_PUBLISHED` guard in `29a0836:385-396`
- [x] **Retirement persisted audit evidence**  
      `recordAudit(... actionName: "retire_public_info_version" ...)` in `29a0836:417-446`
- [x] **Retire UI action existed for published rows**  
      `apps/platform-admin-web/app/switchboard/page.tsx` at `29a0836:181-191` and `29a0836:612-621`
- [x] **API client exposed the retire route**  
      `packages/api-client/src/index.ts` at `29a0836:930-938`
- [x] **Contract type existed for retire command**  
      `packages/contracts/src/index.ts` at `29a0836:1045-1048`
- [x] **Regression tests existed in the recorded parent commit**  
      `tests/unit/platform-admin.test.ts` at `29a0836:48-122`
- [x] **Recorded parent commit also blocked placard generation from retired sources**  
      `apps/api/src/modules/platform-admin/platform-admin.service.ts` at `29a0836:452-462`

### 2.2 Current Shared Workspace Revalidation

- [ ] **Recorded retire controller route still present in current workspace**  
      Current `apps/api/src/modules/platform-admin/platform-admin.controller.ts` has publish, delete, and placard publish routes, but no `public-info/:versionId/retire`
- [ ] **Recorded retire service method still present in current workspace**  
      Current `apps/api/src/modules/platform-admin/platform-admin.service.ts` has no `retirePublicInfoVersion()` and no `PUBLIC_INFO_VERSION_NOT_PUBLISHED` retire guard
- [ ] **Recorded retire client method still present in current workspace**  
      Current `packages/api-client/src/index.ts` has no `retirePublicInfoVersion()` method
- [ ] **Recorded retire UI action still present in current workspace**  
      Current `apps/platform-admin-web/app/switchboard/page.tsx` has no `retiringVersionId`, no `handleRetire()`, and no `Retire` button in the public-info table
- [ ] **Recorded retire tests still present in current workspace**  
      Current `tests/unit/platform-admin.test.ts` no longer contains the retire-focused tests from `29a0836`
- [x] **Retire contract type still exists in current workspace**  
      `packages/contracts/src/index.ts:1045-1048`

Result: the parent task has valid recorded commit evidence, but the current shared workspace no longer reflects most of the recorded GAP-SB-002 runtime/client/test behavior.

---

## 3. Drift Check

This sidecar found a machine-truth vs workspace integration drift that the reviewer should explicitly consider.

| Check                                                                        | Result                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `git rev-parse HEAD`                                                         | `8a84f71630f30df878c07953c5efeab4d718501c`                                            |
| `git merge-base --is-ancestor 29a083688ecf97b373cd152f10d1c985de82c9b7 HEAD` | exit code `1`                                                                         |
| `git branch --contains 29a083688ecf97b373cd152f10d1c985de82c9b7`             | no branch output                                                                      |
| Current code search for retire runtime anchors                               | only `packages/contracts/src/index.ts` still matches `RetirePublicInfoVersionCommand` |

Interpretation:

- The recorded completion commit exists locally and can be inspected.
- That commit is not in the current `HEAD` ancestor chain.
- The current workspace appears to have preserved only the contract type while losing the controller/service/client/UI/test absorption for GAP-SB-002.

This packet does not alter machine truth. It only records the discrepancy for reviewer handling.

---

## 4. Dependency Map

```
GAP-SB-002 (recorded done in machine truth)
├── runtime API
│   ├── controller: public-info retire lifecycle route
│   └── service: retire guard + audit evidence + retired-source placard block
├── frontend
│   └── switchboard Retire action for published public-info rows
├── client/contracts
│   ├── RetirePublicInfoVersionCommand
│   └── api-client retirePublicInfoVersion()
└── tests
    └── service/controller retire regression coverage
```

Practical upstream dependency:

- JWT/bootstrap identity plumbing introduced earlier by `GAP-P2S3-001` is required because the recorded parent implementation used verified `actorId` instead of trusting request-body `retiredBy`.

Practical downstream effect:

- GAP-SB-006 originally depended on the existence of a retired source state in order to disable retired sources in the placard UI.
- The current shared workspace still contains the GAP-SB-006 UI helper module, but the runtime retire lifecycle itself is no longer visibly present in `HEAD`.

---

## 5. Verification Snapshot

Commands run during this sidecar review:

- `git show --stat --oneline 29a083688ecf97b373cd152f10d1c985de82c9b7`
- `git show 29a083688ecf97b373cd152f10d1c985de82c9b7 -- apps/api/src/modules/platform-admin/platform-admin.controller.ts apps/api/src/modules/platform-admin/platform-admin.service.ts apps/platform-admin-web/app/switchboard/page.tsx tests/unit/platform-admin.test.ts`
- `git show 29a083688ecf97b373cd152f10d1c985de82c9b7:packages/api-client/src/index.ts`
- `git show 29a083688ecf97b373cd152f10d1c985de82c9b7:packages/contracts/src/index.ts`
- `git merge-base --is-ancestor 29a083688ecf97b373cd152f10d1c985de82c9b7 HEAD`
- `git branch --contains 29a083688ecf97b373cd152f10d1c985de82c9b7`
- `rg -n "retirePublicInfoVersion|RetirePublicInfoVersionCommand|PUBLIC_INFO_VERSION_NOT_PUBLISHED|PLACARD_SOURCE_RETIRED" ...`
- `pnpm exec vitest run tests/unit/platform-admin.test.ts`
- `pnpm --filter @drts/platform-admin-web typecheck`

Observed verification result:

- Current `vitest` passed: `1` file, `7` tests, `0` failures
- Current platform-admin-web `typecheck` passed
- These current checks do **not** prove GAP-SB-002 is absorbed in `HEAD`; they only show the present workspace is internally consistent

---

## 6. Reviewer Notes

Reviewer (`Codex2`) should evaluate this sidecar packet on two separate questions:

1. Is the acceptance evidence for the recorded parent commit `29a0836` complete and correctly cited?
2. Does the discovered drift between machine truth and current `HEAD` require reopening or separately reconciling the parent task outside this sidecar?

This sidecar task itself is satisfied once the packet is reviewed and handed off. No canonical files were modified while preparing it.
