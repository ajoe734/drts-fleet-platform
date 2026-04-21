# GAP-P2S3-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S3-005` — api: `@FeatureGated` decorator + NestJS guard for server-side flag enforcement  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `(unset in machine truth)`  
**Last Revised:** `2026-04-18T04:26:05Z (UTC)`  
**Status:** `review_approved` (reviewer `Codex2` approved at `2026-04-18T04:24:57Z`; machine truth now waits on owner `Codex` to finalize the sidecar via the pending `Codex2 -> Codex` closeout handoff created at `2026-04-18T04:24:57Z`, followed by the `2026-04-18T04:25:02Z` `owned_finalize_dispatch`)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S3-005` 的 acceptance checklist、dependency map、repo baseline、gap inventory 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務直接實作或 closeout。

- In scope: support-only acceptance framing for a reusable `@FeatureGated(flagKey)` decorator, NestJS guard / metadata lookup pattern, feature-flag service integration, tenant/global flag resolution expectations, guard wiring boundaries, reviewer checklist, and closeout commands.
- Out of scope: 直接修改 L1/L2 真相、替某個特定 product surface 定義新 rollout 語意、順手實作 Grab Taiwan adapter / webhook ingest、修改 platform-admin / tenant / driver client rollout UI、或把 `GAP-P2S2-006` / `GAP-P2S3-007` 的 forwarder 實作一起吃進來。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S3-005` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，正式依賴為空。
- 本 sidecar `GAP-P2S3-005-SIDECAR-ACCEPTANCE` 在 machine truth 中目前由 `Codex` 持有，Reviewer=`Codex2`，`status=review_approved`，task object `last_update=2026-04-18T04:24:57Z`，`next="GAP-P2S3-005 acceptance packet ready: machine truth still keeps the parent in backlog with no formal dependency ..."`。
- 最新 handoff queue 以 `current-work.md` / `ai-status.json` 為準，顯示一筆 pending `Codex2 -> Codex` owner-finalize handoff；該 handoff 由 reviewer approval 在 `2026-04-18T04:24:57Z` 自動生成，用來讓 parent owner 正式把 sidecar 收尾成 `done`。
- reviewer-routing 鏈在本 task 上於 `2026-04-18T04:20:59Z-2026-04-18T04:22:28Z` 再次來回於 `Qwen` / `Codex2` 之間，最後共享 machine truth 收斂到：
  - `2026-04-18T04:20:59Z`、`04:21:13Z`、`04:21:37Z`、`04:21:50Z`、`04:22:15Z` orchestrator 多次暫時把 reviewer 改派給 `Qwen`，並標記 availability-first reviewer claim；其中相關 queued wake 都很快因 state drift 被標成 stale skipped
  - `2026-04-18T04:21:18Z` 與 `04:21:55Z` Qwen worker 兩次被啟動處理 `review_ready_dispatch`，但 `2026-04-18T04:21:05Z`、`04:21:31Z`、`04:21:42Z`、`04:22:09Z`、`04:22:20Z` 又因 repeated Qwen token failure 自動把 reviewer 收斂回 `Codex2`
  - reviewer 最終在 `2026-04-18T04:24:57Z` 以 `review_approved` 核准 packet；orchestrator 隨後在 `2026-04-18T04:25:02Z` 對 owner `Codex` 送出 `owned_finalize_dispatch` wake，並在同秒記錄 `Worker started via codex`，作為目前等待 owner 正式 closeout 的最新 dispatch evidence
- accepted planning 對此 task 的語意很窄：
  - `starter-draft.md:270-279` 明確寫的是「Feature flags 已有 service，但沒有 decorator-level enforcement」，並給了 `@FeatureGated('grab_taiwan_integration')` 的 Nest route 範例。
  - `consensus-packet.md:59` 收斂成 backlog row：`api: @FeatureGated decorator + NestJS guard | Codex | M | -`。
  - `consensus-packet.md:93` 也把 `GAP-P2S3-005` 放進「可完全平行（無依賴）」集合。

### Repo Baseline Anchors

- `apps/api/src/common/auth/auth.decorators.ts:15-23` 目前只有 `OpenRoute`、`RequireScopes`、`RequireRealms` 與 `CurrentIdentity`；**不存在** `FeatureGated` decorator 或 feature-gate metadata key。
- `apps/api/src/common/auth/bootstrap-auth.guard.ts:35-114` 目前只讀 auth metadata 與 route auth policy，處理 realm / scope 驗證；**沒有** feature flag lookup、flag metadata、或 route-denial logic。
- `apps/api/src/app.module.ts:64-80` 目前只註冊 `BootstrapAuthGuard` 與 `BootstrapThrottlerGuard` 兩個全域 guard；**沒有** feature gate guard wiring。
- `apps/api/src/modules/feature-flags/feature-flags.service.ts:27-254` 已有完整 `FeatureFlagsService`：
  - 14 個預設 flag seed，全都是 W8-001A client rollout / read-model / smoke path keys。
  - 支援 `getByKey()`、`isEnabled()`、`upsertTenantOverride()` 與 tenant-scoped override 合併。
  - 目前 seed 中**沒有** `grab_taiwan_integration` 這類 server integration flag。
- `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87` 已提供 `/api/admin/flags`、`/api/admin/flags/:key`、`PATCH /:key`、`POST /:key/tenant-overrides`、`GET /:key/enabled` 等 CRUD/check API。
- `apps/api/src/modules/feature-flags/feature-flags.module.ts:8-13` 匯出 `FeatureFlagsService`，可供其他 module/guard 注入。
- `rg "FeatureFlagsService" apps/api/src` 顯示 runtime 內除了 module / controller / service 本身外，**沒有其他 API 模組使用這個 service**；就 repo 現況來看，feature flags 仍停在 flag CRUD / query 層，而非 server-side route enforcement。
- `apps/api/src/common/auth/auth.policy.ts:292-303` 對 `forwarder/*` 路徑目前只套用 `forwarder:read|write` scopes 與 ops realm；`apps/api/src/modules/forwarder/forwarder.controller.ts:17-81` 的 forwarder routes 也沒有任何 feature metadata。這是與 starter 範例最接近的 adoption 候選區，但目前尚未接 gate。
- `packages/contracts/src/index.ts:1616-1640` 與 `packages/api-client/src/index.ts:259-280` 只公開 feature-flag CRUD/check contracts 與 client methods；repo 內**沒有**額外的 server-side feature-gate DTO / error contract。
- `tests/unit/client-integration.test.ts:26-222` 驗證的是 W8-001A client rollout：flag seed、tenant override、`isEnabled()`、client summary shape；**沒有** decorator/guard 層級的 route-denial 測試。
- `apps/tenant-portal-web/app/page.tsx:8-52` 也顯示目前前端把 flags 當 client-side module toggle，甚至在 `/api/admin/flags` 不可用時 fallback 成 enabled；這再次說明 `GAP-P2S3-005` 的任務重點是補「server-side enforcement」，不是再加一層 client rollout。

### Gap Summary

| 問題                                                                | 影響                                                                               | 根本原因                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| API 已有 feature-flag CRUD，但沒有 decorator/guard                  | server 端不能阻擋 disabled integration / route                                     | `FeatureFlagsService` 尚未被 API runtime routes 消費      |
| auth decorators / auth guard 目前只有 scope / realm 語意            | 無法用一致 Nest metadata pattern 套 route-level flag enforcement                   | `FeatureGated` metadata key 與 Reflector lookup 尚未存在  |
| app-level guard stack 只有 auth + throttling                        | 就算補 decorator，也沒有既定 feature gate enforcement path                         | `FeatureGateGuard` 尚未註冊或套用                         |
| 現有 tests 只驗證 flag CRUD / client rollout                        | parent 很容易只補 service helper 而沒有真正 route gate 證據                        | 沒有針對 decorated route 的 allow/deny 測試               |
| starter 範例提到 `grab_taiwan_integration`，但 repo 沒有該 seed/key | parent 實作容易混淆「建 infrastructure」與「順手定義新 integration rollout truth」 | accepted backlog row 沒有要求新增 canonical flag registry |

---

## 3) Parent Acceptance Framing

`GAP-P2S3-005` 在 machine truth 中沒有獨立 `acceptance[]` 之外的產品細節；以下 checklist 只把 accepted planning 與 repo baseline 展開成 reviewer-facing checklist，不新增新的產品真相。

### AC-1 — Reusable decorator metadata must exist

- [ ] parent closeout 應提供可重用的 `@FeatureGated(flagKey)` decorator（或功能完全等效的 helper），而不是在 controller / service 內散落 `if (!(await flags.isEnabled()))` 判斷。
- [ ] decorator 應寫入明確 metadata key，讓 guard 可透過 Nest `Reflector` 讀取。
- [ ] reviewer 不應接受只在單一路由硬編碼 feature check、卻沒有建立 reusable decorator 的 closeout。

### AC-2 — Guard must perform real server-side denial before handler execution

- [ ] parent closeout 應有 Nest guard 讀取 `FeatureGated` metadata，並在 disabled / missing flag 時拒絕 route。
- [ ] flag lookup 應透過既有 `FeatureFlagsService` / `isEnabled()`，而不是前端傳來的布林值、環境變數、或 controller 內手動查詢。
- [ ] deny path 應走 repo 現有 API error envelope 慣例（例如 `ApiRequestError` 或等效包裝），而不是 raw Nest exception / plain string response。

### AC-3 — Guard wiring must coexist with auth/throttle and leave undecorated routes alone

- [ ] 不論 parent 採 `APP_GUARD` 或 route-level `@UseGuards`，都必須證明只有被 `@FeatureGated` 標記的 routes 會被 feature gate 檢查。
- [ ] `BootstrapAuthGuard` 與 `BootstrapThrottlerGuard` 的既有行為不可被繞過、移除或語意倒置。
- [ ] reviewer 不應接受會讓所有 routes 都依賴 feature flag、或讓 `OpenRoute` / auth policy 失真的實作。

### AC-4 — Tenant override semantics must remain explicit

- [ ] 由於 `FeatureFlagsService` 已支援 tenant override，parent closeout 應明確說明 guard 如何取得 tenant context：至少要支援和現有 `/api/admin/flags` 一樣的 `x-tenant-id` header語意，或清楚說明在無 tenant context 時只讀 global flag。
- [ ] reviewer 不應接受把 tenant-aware flag semantics 靜默降級成 global-only，而沒有任何說明。
- [ ] 若某些 server-only integration flags天然是 global scope，parent closeout 也應讓 fallback 邏輯清楚且可測。

### AC-5 — No unnecessary contract or client rollout churn

- [ ] `packages/contracts` 與 `packages/api-client` 既有 feature-flag CRUD/check API 預設已足夠支援此 task；parent closeout 不應無故引入新 public DTO、client API 或 L1 真相改動。
- [ ] `FeatureFlagsController` 的 `/api/admin/flags*` endpoints 應保持相容；本 task 不是重寫 admin flags surface。
- [ ] reviewer 不應接受把 tenant portal / ops console / driver app 的 client rollout 改動，包裝成這張 server-side enforcement 票的一部分。

### AC-6 — Evidence must prove route-level enforcement, not only service behavior

- [ ] parent closeout 應有 evidence 證明 decorated route 在 flag enabled 時可通過、flag disabled 時會被 guard 擋下。
- [ ] 同一份 evidence 應至少證明一條未標記 route 不受 feature gate 影響。
- [ ] 因為目前 repo 尚未明確指定哪條 production route 一定要先掛 `@FeatureGated`，reviewer 可接受一個小型測試控制器 / test module 來驗證 guard；但不應接受只有 `FeatureFlagsService.isEnabled()` 單測、沒有 route execution proof 的 closeout。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 與 `consensus-packet.md` 為準，`GAP-P2S3-005.depends_on=[]`。

| Dep      | Source        | Status | Notes                                          |
| -------- | ------------- | ------ | ---------------------------------------------- |
| _(none)_ | machine truth | -      | 此 task 可平行執行，無 formal upstream blocker |

### Practical Review Dependencies

| Dep   | Type                                                                                | Why It Matters                                                                                                 |
| ----- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D-P-1 | `starter-draft.md:270-279`                                                          | 明確寫出「已有 service，但沒有 decorator-level enforcement」與 `@FeatureGated('grab_taiwan_integration')` 範例 |
| D-P-2 | `consensus-packet.md:59,93`                                                         | accepted backlog row only asks for decorator + NestJS guard，且列為可平行執行                                  |
| D-P-3 | `apps/api/src/common/auth/auth.decorators.ts:15-23`                                 | 現有 decorator pattern baseline；`FeatureGated` 尚不存在                                                       |
| D-P-4 | `apps/api/src/common/auth/bootstrap-auth.guard.ts:35-114`                           | 現有 Reflector + metadata + deny-path pattern；feature gate 需與之協作                                         |
| D-P-5 | `apps/api/src/modules/feature-flags/feature-flags.service.ts:134-254`               | 既有 `getByKey` / `isEnabled` / tenant override 邏輯，guard 應重用而非重造                                     |
| D-P-6 | `apps/api/src/modules/feature-flags/feature-flags.controller.ts:20-87`              | 現有 flag API / `x-tenant-id` 語意 baseline                                                                    |
| D-P-7 | `apps/api/src/app.module.ts:64-80`                                                  | 目前 global guard stack 只有 auth + throttling；feature gate wiring 是否新增在這裡是 reviewer 重點             |
| D-P-8 | `apps/api/src/common/auth/auth.policy.ts:292-303` + `forwarder.controller.ts:17-81` | forwarder 路徑目前僅有 scope auth，是最接近 starter 範例的 adoption baseline                                   |
| D-P-9 | `tests/unit/client-integration.test.ts:26-222`                                      | 現有 tests 只證明 client rollout / tenant overrides，不足以取代 route-level guard 驗證                         |

### Forward (Downstream) Dependencies

| Dep     | Status                       | Why It Matters                                                                                                                  |
| ------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| D-FWD-1 | `GAP-P2S2-006` (`backlog`)   | Grab Taiwan webhook ingest stub 若後續落地，最可能成為 `@FeatureGated` 的首批 adoption routes                                   |
| D-FWD-2 | `GAP-P2S3-007` (`backlog`)   | platform code registry / service bucket expansion 後，server-side gating 可能成為 platform-specific integration 開關            |
| D-FWD-3 | 現有 client rollout surfaces | `tenant-portal.*`、`ops-console.*`、`driver-app.*` 目前只是 client toggle；本 task 讓 server-side deny path 與這些 flags 能對齊 |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
- Repo anchors:
  - `apps/api/src/common/auth/auth.decorators.ts`
  - `apps/api/src/common/auth/bootstrap-auth.guard.ts`
  - `apps/api/src/common/auth/auth.policy.ts`
  - `apps/api/src/app.module.ts`
  - `apps/api/src/modules/feature-flags/feature-flags.module.ts`
  - `apps/api/src/modules/feature-flags/feature-flags.service.ts`
  - `apps/api/src/modules/feature-flags/feature-flags.controller.ts`
  - `apps/api/src/modules/forwarder/forwarder.controller.ts`
  - `packages/contracts/src/index.ts`
  - `packages/api-client/src/index.ts`
  - `apps/tenant-portal-web/app/page.tsx`
  - `tests/unit/client-integration.test.ts`

---

## 5) Evidence Inventory

| ID   | Evidence                                                                                      | Expected Anchor                                                                         |
| ---- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                                                | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                            |
| E-2  | accepted statement that feature-flag service exists but decorator enforcement does not        | `starter-draft.md:270-279`                                                              |
| E-3  | accepted backlog row and no formal dependency                                                 | `consensus-packet.md:59,93`                                                             |
| E-4  | current auth decorators do not include `FeatureGated`                                         | `auth.decorators.ts:15-23`                                                              |
| E-5  | current auth guard only enforces open-route / realm / scope                                   | `bootstrap-auth.guard.ts:35-167`                                                        |
| E-6  | app-level guard stack has no feature gate guard                                               | `app.module.ts:64-80`                                                                   |
| E-7  | existing feature-flag service already supports `isEnabled()` + tenant overrides               | `feature-flags.service.ts:134-254`                                                      |
| E-8  | existing feature-flag controller already defines `x-tenant-id`-aware API semantics            | `feature-flags.controller.ts:20-87`                                                     |
| E-9  | runtime consumers of `FeatureFlagsService` are effectively absent outside flags module itself | `rg "FeatureFlagsService" apps/api/src`                                                 |
| E-10 | forwarder routes currently rely only on auth policy and have no feature metadata              | `auth.policy.ts:292-303`, `forwarder.controller.ts:17-81`                               |
| E-11 | contracts/api-client already expose CRUD/check APIs only                                      | `packages/contracts/src/index.ts:1616-1640`, `packages/api-client/src/index.ts:259-280` |
| E-12 | existing unit tests validate client rollout / tenant overrides, not route guard enforcement   | `tests/unit/client-integration.test.ts:26-222`                                          |
| E-13 | client surfaces currently consume flags as UI/module toggles with fallback behavior           | `apps/tenant-portal-web/app/page.tsx:8-52`                                              |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S3-005` 仍是 `backlog`、無 formal dependency；sidecar 目前是 `review_approved`、owner=`Codex`、reviewer=`Codex2`，最新 task-level approval 時間是 `2026-04-18T04:24:57Z`，另外還有 `2026-04-18T04:25:02Z` 的 owner finalize wake/worker-start dispatch evidence。
2. packet 是否把 accepted scope 鎖在「reusable decorator + NestJS guard + server-side enforcement」，沒有自行擴成 Grab adapter / webhook ingest / client rollout / platform-admin feature-flags UI。
3. AC-2 是否正確要求 route-level deny path，而不是只補 `FeatureFlagsService` helper 或 controller 內 inline check。
4. AC-4 是否正確標出 tenant override semantics：guard 不能偷偷忽略 `x-tenant-id` / tenant context。
5. AC-3 是否把 global guard stack 的相容性列成重點，避免破壞既有 `BootstrapAuthGuard` / `BootstrapThrottlerGuard`。
6. AC-5 是否合理保守：既有 contracts 與 api-client 預設足夠，這張票不應夾帶 public contract churn。
7. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S3-005 acceptance packet ready: machine truth still keeps the parent in backlog with no formal dependency, the sidecar remains in review under Codex with Codex2 as reviewer after the latest 2026-04-18T04:22:15Z Qwen -> Codex2 reviewer recovery and the 2026-04-18T04:22:28Z Codex2 wake/worker-start dispatch snapshot, the packet correctly frames the task as adding reusable FeatureGated metadata plus a NestJS guard on top of the existing auth/throttle stack, captures that FeatureFlagsService already supports global and tenant override evaluation but is not yet consumed by runtime routes, requires route-level allow/deny evidence instead of service-only tests, and keeps forwarder/client rollout/canonical-truth changes out of this support-only sidecar.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift into forwarder or client rollout / weak tenant-override treatment / missing route-level evidence requirement / unnecessary contract churn]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S3-005-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S3-005 acceptance packet refreshed at support/sidecars/GAP-P2S3-005/GAP-P2S3-005-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog with no formal dependency, updates the sidecar review snapshot to the latest 2026-04-18T04:22:15Z Qwen -> Codex2 reviewer recovery plus the 2026-04-18T04:20:59Z-2026-04-18T04:22:28Z reviewer-routing chain ending in the latest Codex2 wake/worker-start dispatch evidence, frames the work as reusable FeatureGated metadata plus a NestJS guard layered onto the existing auth/throttle stack, documents that FeatureFlagsService already supports global and tenant override evaluation but is not yet consumed by runtime routes, requires route-level allow/deny evidence rather than service-only tests, and keeps forwarder implementation, client rollout changes, and canonical-truth edits out of this support-only sidecar."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S3-005-SIDECAR-ACCEPTANCE "GAP-P2S3-005 acceptance packet ready: machine truth still keeps the parent in backlog with no formal dependency, the sidecar remains in review under Codex with Codex2 as reviewer after the latest 2026-04-18T04:22:15Z Qwen -> Codex2 reviewer recovery and the 2026-04-18T04:22:28Z Codex2 wake/worker-start dispatch snapshot, the packet correctly frames the task as adding reusable FeatureGated metadata plus a NestJS guard on top of the existing auth/throttle stack, captures that FeatureFlagsService already supports global and tenant override evaluation but is not yet consumed by runtime routes, requires route-level allow/deny evidence instead of service-only tests, and keeps forwarder/client rollout/canonical-truth changes out of this support-only sidecar."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S3-005-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift into forwarder or client rollout / weak tenant-override treatment / missing route-level evidence requirement / unnecessary contract churn]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S3-005-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S3-005 at support/sidecars/GAP-P2S3-005/GAP-P2S3-005-SIDECAR-ACCEPTANCE.md. The packet preserves the reusable decorator/guard scope, the existing auth/throttling guard-stack boundary, the tenant-override reviewer hotspot, the current absence of runtime route consumers, and the non-canonical support-only handoff path without changing L1 truth or main runtime code."
```

Parent absorption / 主線採納仍由 parent owner `Codex` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-18T04:26:05Z — 對齊 shared L0 最新 owner-finalize 階段：將 packet header 與 baseline 更新為 `review_approved`，補入 `2026-04-18T04:24:57Z` 的 reviewer approval、pending `Codex2 -> Codex` closeout handoff，以及 `2026-04-18T04:25:02Z` `owned_finalize_dispatch` evidence；support-only acceptance framing 其餘不變。
- 2026-04-18T04:23:37Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 task snapshot 更新為 `2026-04-18T04:22:15Z` 的 `Qwen -> Codex2` reviewer recovery，補入 `2026-04-18T04:20:59Z-2026-04-18T04:22:28Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start dispatch evidence，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T04:17:13Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 task snapshot 更新為 `2026-04-18T04:17:05Z` 的 `Qwen -> Codex2` reviewer recovery，補入 `2026-04-18T04:15:59Z-2026-04-18T04:17:13Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start dispatch evidence，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T04:09:30Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 packet machine-truth snapshot 更新為 task-level `2026-04-18T01:49:12Z` 的 `Qwen -> Codex2` pending handoff，補入 `2026-04-18T01:48:44Z-2026-04-18T04:09:30Z` 的 reviewer 來回改派鏈，以及最新 `2026-04-18T04:09:30Z` `Codex2` wake/worker-start dispatch evidence，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:44:30Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:44:21Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:43:22Z-2026-04-18T01:44:30Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:36:47Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:36:38Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:35:36Z-2026-04-18T01:36:47Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:31:58Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:31:51Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:30:59Z-2026-04-18T01:31:58Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:27:22Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:27:13Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:26:23Z-2026-04-18T01:27:22Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:22:21Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:22:14Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:21:37Z-2026-04-18T01:22:21Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:18:05Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:17:49Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:16:59Z-2026-04-18T01:18:05Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:10:03Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:09:47Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:09:11Z-2026-04-18T01:10:03Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:05:31Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T01:05:24Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T01:03:48Z-2026-04-18T01:05:31Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T01:00:04Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T00:59:48Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T00:58:57Z-2026-04-18T01:00:04Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T00:57:30Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T00:55:22Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T00:54:26Z-2026-04-18T00:55:31Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T00:51:53Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T00:51:08Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T00:50:05Z-2026-04-18T00:51:14Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T00:46:50Z — 對齊 shared L0 最新 reviewer-routing：維持 sidecar 狀態為 `review`，將 pending handoff 更新為 `2026-04-18T00:46:34Z` 的 `Qwen -> Codex2`，補入 `2026-04-18T00:45:25Z-2026-04-18T00:46:50Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-18T00:43:27Z — 對齊 shared L0 最新 reviewer-routing：將 sidecar 狀態更新為 `review`，補入 `2026-04-18T00:42:14Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T00:40:37Z-2026-04-18T00:42:30Z` 的 reviewer 來回改派鏈與最新 `Codex2` wake/worker-start snapshot，其他 acceptance framing 維持 support-only 不變。
- 2026-04-17T19:26Z — 初版建立：依 shared L0 truth、accepted `starter-draft.md` / `consensus-packet.md`、以及 repo scan（auth decorators / guard 僅處理 open-route + realm/scope、app.module 僅註冊 auth + throttling guards、feature-flags module 已提供 `isEnabled()` 與 tenant override、runtime 內尚無 route consumer、tests 仍停在 client rollout 驗證）整理 `GAP-P2S3-005` 的 acceptance framing、dependency map、reviewer hotspots 與 `Codex2` handoff 指引。
