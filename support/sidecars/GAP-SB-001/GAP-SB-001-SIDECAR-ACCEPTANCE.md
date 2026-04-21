# GAP-SB-001 Acceptance Packet

**Task:** GAP-SB-001 — `publishedBy` 從 JWT/auth identity 取得（取代 hardcode bootstrap actor）
**Sidecar:** GAP-SB-001-SIDECAR-ACCEPTANCE
**Prepared by:** Claude (2026-04-19)
**Reviewer:** Codex
**Commit:** `739ea323c3f894bb45433e7dc033c9adc5ed65da`

---

## 0. Scope Boundary

This sidecar is a support-only acceptance packet. It does not change L1 canonical truth, runtime contracts, or the main implementation. Its purpose is to capture reviewer-ready evidence for the already-completed parent task.

- In scope: acceptance checklist, dependency map, evidence anchors, regression notes, residual risks
- Out of scope: modifying `packages/contracts/src/index.ts`, runtime/controller/service logic, switchboard UI behavior, or auth/governance semantics

---

## 0.5 Machine-Truth Baseline

- Parent task `GAP-SB-001` is already `done` in `ai-status.json` with reviewer `Codex`, owner `Codex2`, and commit `739ea323c3f894bb45433e7dc033c9adc5ed65da` recorded at `2026-04-18T15:12:51Z`.
- This sidecar task exists only to package acceptance evidence and hand it to the assigned reviewer.
- Practical upstream context remains `GAP-P2S3-001` (`dc41167`), which introduced the auth-layer primitives used here: `@CurrentIdentity()` and `BootstrapRequestIdentity`.

---

## 1. Change Summary

The public-info publish endpoint previously embedded a hardcoded `publishedBy` value of `"platform-admin-web-bootstrap"` in the frontend, and the audit log recorded `actorId: null`. This task binds both to the verified identity from the auth layer.

### Files Changed (commit `739ea323`)

| File                                                               | Change                                                                                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/platform-admin/platform-admin.controller.ts` | Added `@CurrentIdentity()` param to `publishPublicInfoVersion`; added `requireActorId()` guard that throws HTTP 401 if identity is missing or empty |
| `apps/api/src/modules/platform-admin/platform-admin.service.ts`    | Added `publisherActorId` param; prefers it over `command.publishedBy`; audit log now records `actorId: publishedBy` instead of `null`               |
| `apps/platform-admin-web/app/switchboard/page.tsx`                 | Removed hardcoded `publishedBy: "platform-admin-web-bootstrap"` from publish API call; passes empty object instead                                  |
| `tests/unit/platform-admin.test.ts`                                | Added two new unit tests (see §3)                                                                                                                   |

---

## 2. Dependency Map

```
GAP-SB-001
├── depends_on: [] (no declared deps)
├── upstream gates:
│   └── GAP-P2S3-001 (JWT auth layer) — merged at dc41167
│       └── provides BootstrapRequestIdentity and @CurrentIdentity() decorator
│           which GAP-SB-001 relies on
└── downstream consumers:
    └── None currently declared
```

**Runtime dependency:** The `@CurrentIdentity()` decorator and `BootstrapRequestIdentity` type are provided by the JWT auth layer introduced in `feat(gap-p2s3-001)` (commit `dc41167`). GAP-SB-001 cannot function correctly without that layer being active.

---

## 3. Acceptance Checklist

### Behavioral Correctness

- [x] **Identity extraction** — controller reads `actorId` from `@CurrentIdentity()` decorator, not from request body
- [x] **Guard enforced** — code path uses `requireActorId()` and throws `ApiRequestError(401, "PLATFORM_ADMIN_IDENTITY_REQUIRED", ...)` when identity is absent or actorId is blank
- [x] **Service priority** — `publisherActorId` param takes precedence over `command.publishedBy`; a forged body value is overridden
- [x] **Audit log** — `actorId` in audit log now carries the verified publisher, not `null`
- [x] **Frontend** — switchboard publish no longer injects a bootstrap actor string

### Test Coverage

- [x] **`prefers the verified publisher actorId over the request body when publishing`**
  - Creates a draft, calls `publishPublicInfoVersion` with `publishedBy: "forged-body-actor"` in body but `"platform-admin-jwt-007"` as publisherActorId
  - Asserts `publishedBy === "platform-admin-jwt-007"` in result
  - Asserts audit log `actorId === "platform-admin-jwt-007"`
  - Asserts `newValuesSummary.publishedBy === "platform-admin-jwt-007"`

- [x] **`controller forwards the verified identity actorId to publish public info`**
  - Stubs service, constructs a `BootstrapRequestIdentity` with `actorId: "platform-admin-jwt-001"`
  - Calls `controller.publishPublicInfoVersion(...)` with that identity
  - Verifies service received `"platform-admin-jwt-001"` as the actorId param

### Regression Scope

- [x] Existing `platform-admin.test.ts` suite still passes (no regressions in prior tests)
- [x] No changes to canonical L1 contracts (`packages/contracts/src/index.ts` signature for `PublishPublicInfoVersionCommand` remains unchanged — `publishedBy` remains optional in the body type, now simply overridden by identity)

---

## 4. Evidence Anchors

| Evidence                                                                                                    | Anchor                                                                     |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Controller extracts verified identity and forwards `actorId`                                                | `apps/api/src/modules/platform-admin/platform-admin.controller.ts:56-72`   |
| `requireActorId()` enforces 401 `PLATFORM_ADMIN_IDENTITY_REQUIRED` for missing/blank identity               | `apps/api/src/modules/platform-admin/platform-admin.controller.ts:264-274` |
| Service prefers verified `publisherActorId` over body `publishedBy`                                         | `apps/api/src/modules/platform-admin/platform-admin.service.ts:295-316`    |
| Published record and audit log both persist resolved publisher                                              | `apps/api/src/modules/platform-admin/platform-admin.service.ts:329-375`    |
| Switchboard publish request no longer sends bootstrap actor                                                 | `apps/platform-admin-web/app/switchboard/page.tsx:184-189`                 |
| Service-level regression test for forged body vs verified identity precedence                               | `tests/unit/platform-admin.test.ts:47-78`                                  |
| Controller-level regression test for forwarding verified identity actorId                                   | `tests/unit/platform-admin.test.ts:80-113`                                 |
| Contract stayed unchanged: `publishedBy`, `effectiveFrom`, `effectiveTo` remain optional in publish command | `packages/contracts/src/index.ts:1039-1043`                                |

---

## 5. Verification Snapshot

Revalidated during review:

- `pnpm exec vitest run tests/unit/platform-admin.test.ts`

Supporting code inspection:

- `git show --stat --oneline 739ea323c3f894bb45433e7dc033c9adc5ed65da`
- `git show 739ea323c3f894bb45433e7dc033c9adc5ed65da -- apps/api/src/modules/platform-admin/platform-admin.controller.ts apps/api/src/modules/platform-admin/platform-admin.service.ts apps/platform-admin-web/app/switchboard/page.tsx tests/unit/platform-admin.test.ts`

---

## 6. Remaining Risks / Observations

| Risk                                                                         | Severity      | Note                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PublishPublicInfoVersionCommand.publishedBy` still accepted in request body | Low           | Body field is silently overridden by identity; not removed from contract. Could confuse API consumers expecting it to be honoured. Consider deprecating or documenting in a follow-up.   |
| No test explicitly exercises the missing-identity 401 path                   | Low           | The guard logic is confirmed by code inspection in `requireActorId()`, but there is no dedicated test that calls `publishPublicInfoVersion()` with `identity = null` or blank `actorId`. |
| `authMode: "bootstrap_headers"` in tests                                     | Informational | Tests use the bootstrap auth mode. Once real JWT is wired end-to-end, a smoke test with a real token would confirm the full path.                                                        |

---

## 7. Reviewer Handoff Notes

This packet covers the acceptance evidence for GAP-SB-001. The implementation is in `done` state in `ai-status.json` as of `2026-04-18T15:12:51Z`.

No canonical truth files were modified as part of this sidecar. This document is a support artifact only.

Reviewer (Codex): please approve this sidecar task (`GAP-SB-001-SIDECAR-ACCEPTANCE`) once you are satisfied the acceptance evidence is complete.
