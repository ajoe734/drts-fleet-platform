# Sidecar Acceptance Packet: ADM-UI-GOV-001

- **Parent Task:** `ADM-UI-GOV-001` (`Platform Admin tenant governance monitoring dashboard`)
- **Sidecar Task:** `ADM-UI-GOV-001-SIDECAR-ACCEPTANCE`
- **Status:** `in_progress`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Parent Reviewer:** `Codex2`
- **Scope Guardrail:** support artifact only; no canonical truth or runtime implementation changes
- **Primary Machine Truth:** `ai-status.json`
- **Reference Planning Doc:** `docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md` (§E.14)

## 1. Purpose

This packet refreshes the acceptance checklist and dependency map for
`ADM-UI-GOV-001` using current machine truth plus repo-visible
implementation anchors already present on `HEAD`.

The parent task is already `done` in machine truth. This file exists only
to help `Claude2` confirm that the sidecar accurately packages:

1. the original dependency rationale from planning and `ai-status.json`,
2. the shipped route/tab/API/client/test surface for the dashboard,
3. the parent closeout and review evidence already recorded in machine truth,
4. the support-only boundary for this sidecar.

## 2. Machine-Truth Snapshot

Snapshot below is aligned to current `ai-status.json` state during this pass.

| Task ID                             | Status        | Owner   | Reviewer  | Notes                                                                                                                                         |
| ----------------------------------- | ------------- | ------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001`                         | `done`        | `Codex` | `Codex2`  | Cost-center directory contract/API is closed and pushed (`ai-status.json:16876-16924`, dependency row at `17439-17444`).                      |
| `BE-RULE-001`                       | `done`        | `Codex` | `Codex2`  | Approval-rule evaluator/backend chain is closed and pushed (`ai-status.json:16977-17031`, dependency row at `17439-17444`).                   |
| `BE-QUOTA-001`                      | `done`        | `Codex` | `Claude2` | Quota read model and ledger slice is closed and pushed (`ai-status.json:17034-17088`, dependency row at `17439-17444`).                       |
| `BE-APR-001`                        | `done`        | `Codex` | `Claude2` | Approval-request lifecycle is closed and pushed (`ai-status.json:17091-17130`, dependency row at `17439-17444`).                              |
| `ADM-UI-GOV-001`                    | `done`        | `Codex` | `Codex2`  | Parent closeout records commit `76829a43f9431bcdfd2433de07a19a9d7804bc2b` on `origin/codex/be-cc-001-fu-seed` (`ai-status.json:17432-17474`). |
| `ADM-UI-GOV-001-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex` | `Claude2` | This support packet only; no canonical/runtime edits allowed (`ai-status.json:17915-17943`).                                                  |

Direct machine-truth facts for the sidecar:

- `depends_on`: `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`
- `artifact`: `support/sidecars/ADM-UI-GOV-001/ADM-UI-GOV-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Parent acceptance row recorded in machine truth (`ai-status.json:17451-17458`):

1. add `/admin/tenant-governance` route + tab
2. show per-tenant rollup row with `costCenterCount`, `activeRuleCount`,
   `monthlyQuotaPercentUsed`, `pendingApprovalCount`,
   `oldestPendingApprovalAgeHours`
3. link each tenant to existing tenant-admin governance surfaces
4. backend `GET /api/admin/tenant-governance/summary` returns paginated rollup
5. visual-only indicators for no approvers / quota `>95%` / pending `>48h`
6. API client adds `getPlatformTenantGovernanceSummary`
7. `pnpm --filter @drts/platform-admin-web typecheck + test` pass

## 3. Dependency Map

### 3.1 Direct hard dependencies

| Dependency     | Current status | Why it matters to the dashboard                                                                                                                                                    |
| -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001`    | `done`         | The rollup counts cost centers per tenant and links into tenant-governed detail surfaces; the page depends on cost-center directory ownership being canonical first.               |
| `BE-RULE-001`  | `done`         | The rollup exposes active approval-rule count and approver-readiness semantics; the no-approver alert only makes sense once rule vocabulary and approver descriptors are stable.   |
| `BE-QUOTA-001` | `done`         | The dashboard computes monthly quota burn using quota summary data and highlights `quota_above_95_percent`; that threshold depends on the quota read model being canonical.        |
| `BE-APR-001`   | `done`         | The dashboard counts pending approvals, computes oldest pending approval age, and highlights `pending_approval_over_48h`; those values depend on approval-request lifecycle truth. |

### 3.2 Implementation ownership split the reviewer should preserve

| Surface                                       | Owned by       | Dashboard expectation                                                                                                                     |
| --------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| cost-center directory state and ownership     | `BE-CC-001`    | Dashboard consumes counts and detail links; it must not redefine cost-center semantics.                                                   |
| approval-rule action and approver descriptors | `BE-RULE-001`  | Dashboard consumes active-rule count and checks whether an approver pool is configured; it must not invent new approver-resolution logic. |
| quota summary / remaining-percent semantics   | `BE-QUOTA-001` | Dashboard converts `remainingPercent` into `monthlyQuotaPercentUsed`; it must not redefine ledger or reservation semantics.               |
| approval-request status and age               | `BE-APR-001`   | Dashboard consumes pending-request state and age for rollup/alerts; it must not redefine approval lifecycle rules.                        |

### 3.3 Current implication

The planning note for `E.14` said this task should start only after all four
backend tasks were done
(`docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md:41-52`).
Current machine truth now matches that requirement:

- the parent task is `done` (`ai-status.json:17432-17474`),
- all four direct dependencies are `done`,
- this sidecar is not carrying blocker management; it is packaging post-closeout
  evidence for the assigned reviewer.

## 4. Acceptance Crosswalk

| Parent acceptance item                                                      | Evidence anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/tenant-governance` route + tab                                      | `apps/platform-admin-web/components/platform-shell.tsx:143-151` adds the `Tenant Governance` nav item pointing at `/tenant-governance`; `apps/platform-admin-web/app/tenant-governance/page.tsx:121-243` defines the route page and loads the summary via the platform-admin client.                                                                                                                                                                                                                                                                                                  |
| Per-tenant rollup row with the five required metrics                        | `packages/contracts/src/index.ts:4596-4611` defines `PlatformTenantGovernanceSummaryRow` and response shape; `apps/api/src/modules/platform-admin/tenant-governance.service.ts:73-135` builds the row with `costCenterCount`, `activeRuleCount`, `monthlyQuotaPercentUsed`, `pendingApprovalCount`, and `oldestPendingApprovalAgeHours`; `apps/platform-admin-web/app/tenant-governance/page.tsx:387-489` renders those fields in the table.                                                                                                                                          |
| Detail view links back to existing tenant-admin governance surfaces         | `apps/platform-admin-web/app/tenant-governance/page.tsx:576-600` links the selected tenant to `/tenants/{tenantId}`, `/tenants/{tenantId}#onboarding`, `/tenants/{tenantId}#roles`, and `/tenants/{tenantId}#audit`; `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx:997`, `:1209`, and `:1773` confirm those anchored sections exist on the tenant detail surface.                                                                                                                                                                                                          |
| Backend `GET /api/admin/tenant-governance/summary` returns paginated rollup | `apps/api/src/modules/platform-admin/tenant-governance.controller.ts:14-34` exposes `GET /api/admin/tenant-governance/summary` with parsed `page` / `pageSize`; `apps/api/src/modules/platform-admin/tenant-governance.service.ts:30-70` returns `items` plus `pageInfo`.                                                                                                                                                                                                                                                                                                             |
| Visual indicator only for no approvers / quota `>95%` / pending `>48h`      | `apps/api/src/modules/platform-admin/tenant-governance.service.ts:19-21` sets the `95%` / `48h` thresholds; `apps/api/src/modules/platform-admin/tenant-governance.service.ts:107-121` computes `no_approvers_configured`, `quota_above_95_percent`, and `pending_approval_over_48h`; `apps/platform-admin-web/app/tenant-governance/page.tsx:65-100` labels the flags and `:456-468` renders them as status chips without wiring alert delivery.                                                                                                                                     |
| API client adds `getPlatformTenantGovernanceSummary`                        | `packages/api-client/src/index.ts:1898-1912` adds `getPlatformTenantGovernanceSummary()` and calls `/api/admin/tenant-governance/summary`; `tests/unit/platform-tenant-governance-client.test.ts:11-80` verifies query-param and default-route behavior.                                                                                                                                                                                                                                                                                                                              |
| `platform-admin-web` typecheck + test passed for the shipped parent task    | Parent closeout record at `ai-status.json:17460-17474` states commit-time checks covered `platform-admin-web typecheck` and `platform-admin-web test`; parent handoff at `ai-status.json:174221-174227` records `pnpm exec vitest run tests/unit/platform-tenant-governance.test.ts tests/unit/platform-tenant-governance-client.test.ts`, `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api test -- tests/integration/tenant-governance-e2e.test.ts`, `pnpm --filter @drts/platform-admin-web typecheck`, and `pnpm --filter @drts/platform-admin-web test` all passing. |

## 5. Parent Verification Chain

These items are already recorded in machine truth; this sidecar did not rerun
them.

### 5.1 Parent closeout record

- `ai-status.json:17460-17474` records the parent as closed on pushed commit
  `76829a43f9431bcdfd2433de07a19a9d7804bc2b`
  (`ADM-UI-GOV-001: add tenant governance monitoring`) on
  `origin/codex/be-cc-001-fu-seed`.
- The same closeout note says commit-time checks covered:
  - platform tenant governance unit tests
  - contracts build
  - `platform-admin-web` typecheck
  - `platform-admin-web` test

### 5.2 Re-verification handoff and review timeline

- At `2026-05-14T00:34:29Z`, owner handoff
  (`ai-status.json:174221-174227`) re-verified the task scope on shared `HEAD`
  and recorded:
  - `pnpm exec vitest run tests/unit/platform-tenant-governance.test.ts tests/unit/platform-tenant-governance-client.test.ts` PASS (`2` files / `4` tests)
  - `pnpm --filter @drts/api typecheck` PASS
  - `pnpm --filter @drts/api test -- tests/integration/tenant-governance-e2e.test.ts` PASS (`34` files / `362` tests)
  - `pnpm --filter @drts/platform-admin-web typecheck` PASS
  - `pnpm --filter @drts/platform-admin-web test` PASS (`passWithNoTests`)
- At `2026-05-14T00:43:21Z`, reviewer passback
  (`ai-status.json:174248-174254`) confirmed no task-scoped findings and
  noted a later shared-HEAD `platform-admin-web typecheck` failure caused by
  unrelated drift outside this task (`apps/platform-admin-web/app/audit/page.tsx`
  cast issue plus api-client/contracts export mismatch). That later drift does
  not invalidate the recorded task-scoped acceptance for commit `76829a4`.

### 5.3 Unit-test anchors visible in repo

- `tests/unit/platform-tenant-governance.test.ts:51-231` covers alert-aware
  paginated rows and controller query parsing/wrapping.
- `tests/unit/platform-tenant-governance-client.test.ts:11-80` covers the
  API client summary method with and without pagination params.

## 6. Reviewer Handoff Target

When `Claude2` reviews this sidecar, the expected decision is narrow:

1. confirm the packet matches current `ai-status.json` for the parent, sidecar,
   and four direct dependencies,
2. confirm the dependency map remains faithful to planning doc `E.14` and to
   the parent acceptance row,
3. confirm the repo-visible anchors above really cover the route/tab, summary
   API, rollup metrics, alert chips, tenant detail deep links, and client/test
   surface,
4. confirm this dispatch stayed support-only and did not mutate canonical truth
   or runtime implementation.

This sidecar should not reopen the already-closed parent task unless the
reviewer finds a concrete mismatch between machine truth and the cited anchors.

## 7. Evidence Anchors

- `ai-status.json`
  - `ADM-UI-GOV-001` at `17432-17474`
  - `ADM-UI-GOV-001-SIDECAR-ACCEPTANCE` at `17915-17943`
  - parent re-verification handoff at `174221-174227`
  - parent review passback at `174248-174254`
- `docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md`
  - `E.14` at `41-52`
- `apps/platform-admin-web/components/platform-shell.tsx`
  - tenant-governance nav item at `143-151`
- `apps/platform-admin-web/app/tenant-governance/page.tsx`
  - summary loading at `225-243`
  - KPI/table rendering at `328-518`
  - detail links at `521-605`
- `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`
  - deep-page sections at `997`, `1209`, `1773`
- `apps/api/src/modules/platform-admin/tenant-governance.controller.ts`
  - summary route at `14-34`
- `apps/api/src/modules/platform-admin/tenant-governance.service.ts`
  - pagination at `30-70`
  - metric rollup and alerts at `73-121`
- `packages/contracts/src/index.ts`
  - summary query/row/response types at `4586-4611`
- `packages/api-client/src/index.ts`
  - summary client method at `1898-1912`
- `tests/unit/platform-tenant-governance.test.ts`
  - summary/controller tests at `51-231`
- `tests/unit/platform-tenant-governance-client.test.ts`
  - client tests at `11-80`

## 8. Sidecar Verification

This pass changes only
`support/sidecars/ADM-UI-GOV-001/ADM-UI-GOV-001-SIDECAR-ACCEPTANCE.md`.

Verification performed for this sidecar artifact:

- `ai-status.json` task/dependency snapshot review
- planning doc anchor review for `E.14`
- committed-source anchor scan for platform shell, tenant governance page,
  tenant detail anchors, controller, service, contracts, api-client, and unit
  tests
- `git diff --check -- support/sidecars/ADM-UI-GOV-001/ADM-UI-GOV-001-SIDECAR-ACCEPTANCE.md`

No runtime checks were run for this sidecar itself because it is support-only
and does not change executable behavior.
