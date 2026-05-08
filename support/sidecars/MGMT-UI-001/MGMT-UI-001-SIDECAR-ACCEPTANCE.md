# MGMT-UI-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `MGMT-UI-001` - Shared Desktop Management Primitive Alignment  
**Prepared By:** `Codex` (lane: contracts / schema / state-system / acceptance)  
**Sidecar Reviewer:** `Codex2`  
**Parent Reviewer:** `Codex`  
**Generated:** `2026-05-08` (UTC)  
**Status:** `ACTIVE SUPPORT ARTIFACT` - parent `MGMT-UI-001` is currently `review` under owner=`Codex2` / reviewer=`Codex`; this helper task is being revised as a support-only acceptance framing packet and does not change canonical truth or mainline runtime.

---

## 1) Scope Boundary

本 sidecar 只整理 `MGMT-UI-001` 的 acceptance checklist、dependency map、repo evidence anchors、以及 reviewer / owner handoff 指引；不修改 L1 canonical truth，也不代替 parent 任務直接改寫 Platform Admin / Ops Console 頁面。

- In scope: support packet、parent acceptance framing、formal dependency / downstream map、shared-package evidence anchors、reviewer checklist、handoff commands。
- Out of scope: `packages/ui-web` 以外的主線程式修改、canonical truth 變更、design source 重定義、或替 downstream page-family task 先做實作。

---

## 2) Current State Baseline

### Machine truth

- `ai-status.json -> MGMT-UI-001`
  - status=`review`
  - owner=`Codex2`
  - reviewer=`Codex`
  - depends_on=`[]`
  - artifact=`packages/ui-web/src/index.tsx`
  - acceptance:
    - `pnpm --filter @drts/ui-web typecheck`
    - `pnpm --filter @drts/platform-admin-web typecheck`
    - `pnpm --filter @drts/ops-console-web typecheck`
- `ai-status.json -> MGMT-UI-001-SIDECAR-ACCEPTANCE`
  - status=`in_progress`
  - owner=`Codex`
  - reviewer=`Codex2`
  - helper kind=`acceptance_packet`
  - mutates_canonical=`false`

### Execution-packet truth

`docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md` 對 `MGMT-UI-001` 的正式 write scope 與 acceptance framing 很窄：

- write scope 只有 `packages/ui-web/src/index.tsx`
- additive shared helpers 可新增於 `packages/ui-web`，但不要求同一回合同步重寫所有 app pages
- required primitive families:
  - dense KPI row primitives
  - grouped section headers / page header affordances
  - filter-pill row patterns
  - banner / callout primitives
  - stepper and timeline primitives
  - dense detail-list / metadata patterns
  - reusable status chips that preserve authority boundaries

### Workspace snapshot at packet generation time (informative only)

此段不是 machine truth，只是 packet 生成當下的 workspace evidence，供 reviewer 對照：

- `git status -- packages/ui-web apps/platform-admin-web apps/ops-console-web` 顯示：
  - modified: `packages/ui-web/src/index.tsx`
  - untracked: `packages/ui-web/src/management-primitives.tsx`
  - modified but out of parent write scope: `apps/platform-admin-web/app/health/page.tsx`
- 目前 `packages/ui-web/src/index.tsx` 的 live delta 正在 re-export 這批管理介面 primitives：
  - `CalloutBanner`
  - `DetailList`
  - `FilterPill`
  - `FilterPillRow`
  - `KpiCard`
  - `KpiRow`
  - `SectionHeader`
  - `StatusChip`
  - `Stepper`
  - `Timeline`
  - `managementSurfaceStyle`
- `packages/ui-web/src/management-primitives.tsx` 的 live file surface 已實作上述 family，符合 execution packet 對 shared desktop-management helpers 的方向。

**Interpretation rule:** 上述 worktree snapshot 只能視為 _under-parent-work_ 的審查面，不是已完成或已提交的 canonical 結論。

---

## 3) Parent Acceptance Criteria Evaluation Framework

以下三條 acceptance criteria 直接引自 `ai-status.json -> MGMT-UI-001.acceptance`。本 packet 不增減條文，只把 reviewer 應看的 evidence 面與風險邊界攤平。

| Parent acceptance                                  | Evidence anchors                                                                                                                                                                                   | Reviewer should confirm                                                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/ui-web typecheck`             | `packages/ui-web/src/index.tsx`, `packages/ui-web/src/management-primitives.tsx`, `packages/ui-web/package.json`, `packages/ui-web/tsconfig.json`                                                  | 新增的 shared primitive surface 可被 TypeScript 正確導出；沒有漏 export、循環依賴、或型別只在 app-local 可用的情況。                                                             |
| `pnpm --filter @drts/platform-admin-web typecheck` | `apps/platform-admin-web/next.config.ts`, `apps/platform-admin-web/app/page.tsx`, `apps/platform-admin-web/components/admin-nav.tsx`, `apps/platform-admin-web/components/mgmt/MgmtComponents.tsx` | 既有 `@drts/ui-web` 消費端仍可編譯；parent 不應強制同回合把 platform-admin 的 local prototype layer 全量搬家；out-of-scope app file 變更不應被誤算成 `MGMT-UI-001` write scope。 |
| `pnpm --filter @drts/ops-console-web typecheck`    | `apps/ops-console-web/next.config.ts`, `apps/ops-console-web/components/sidebar.tsx`, 現有多個 `PageHeader` / `Card` / `Badge` / `DataTable` import surfaces                                       | 既有 ops-console consumer 對 `@drts/ui-web` 的 import 相容性仍在；shared package 新增 surface 不會破壞現有頁面；parent 不需要在這個 task 內同步完成 page-family rewrites。       |

### Acceptance interpretation notes

1. `MGMT-UI-001` 是 **foundation slice**，不是 page rewrite slice。
2. parent reviewer 應優先判斷 shared exports 是否完整、consumer 相容性是否保留、以及 typecheck 是否跨 package 過關。
3. reviewer 不應把 `ADM-UI-*` / `OPS-UI-*` 的尚未 materialize 視為 `MGMT-UI-001` 未完成；那些是 downstream task。
4. 反過來，若 parent 產出的 primitive family 不足以支撐 execution packet 指定的七類 shared patterns，則即使 typecheck 通過，也可能仍有 acceptance completeness 風險。

---

## 4) Dependency Map

### Formal upstream dependencies (machine truth)

`MGMT-UI-001.depends_on=[]`

- formal prerequisite: none
- implication: parent owner 可直接在 `packages/ui-web` write scope 內落地 shared primitives，不需要等待其他 task 完成

### Formal downstream blockers (machine truth)

下列 task 在 `ai-status.json` 中明確依賴 `MGMT-UI-001`：

| Task         | Why it waits on `MGMT-UI-001`                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `ADM-UI-002` | Platform Admin 首頁 / tenants / partners / users 需要共用的 dense table、header、filter、badge primitives。              |
| `ADM-UI-003` | Fleet / switchboard / pricing / payments workflow 需要 shared KPI, stepper, timeline, callout, detail-list patterns。    |
| `ADM-UI-004` | Health / notices / audit / feature flags / adapter registry 需要 authority-safe badge 與 dense management shell rhythm。 |
| `OPS-UI-002` | Dashboard 與 dispatch detail materialization 需要 KPI row、banner、workflow timeline、status chip。                      |
| `OPS-UI-003` | Callcenter / complaints / incidents 需要 timeline、stepper、callout、dense metadata layouts。                            |
| `OPS-UI-004` | Reports / revenue / attendance / maintenance 需要 shared KPI strip、filter bar、dense table shell。                      |
| `OPS-UI-005` | Drivers / vehicles / contracts / ops flags 需要 reusable status chips、detail list、dense registry patterns。            |

### Indirect downstream effect

`MGMT-UI-002` 雖然不直接 depends on `MGMT-UI-001` 單一 task，而是依賴各個 page-family task，但 execution packet 已明示：

1. 先 dispatch `MGMT-UI-001`
2. `MGMT-UI-001` 落定前，不應先啟動 page-family rewrite
3. `MGMT-UI-001` 完成後，page-family tasks 才能平行展開

因此 `MGMT-UI-001` 的延誤會連帶延後整個 management console verification packet。

### Normative truth sources

| Source                                                                            | Role                                                                                                |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ai-status.json -> MGMT-UI-001`                                                   | machine-truth owner / reviewer / dependencies / acceptance                                          |
| `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md` | write scope, shared primitive families, dispatch ordering                                           |
| `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`                | Workstream A foundation rationale (`UI-FND-02`, `UI-FND-03`, `UI-FND-04`, `UI-FND-05`, `UI-FND-06`) |
| `packages/ui-web/src/index.tsx`                                                   | public export surface that downstream consoles consume                                              |
| `packages/ui-web/src/management-primitives.tsx`                                   | live primitive implementation surface under parent work                                             |

---

## 5) Repo Baseline And Evidence Anchors

### Shared package baseline

- `packages/ui-web/README.md` 仍把 `@drts/ui-web` 描述為 minimal shared UI placeholder package。
- `packages/ui-web/src/page-header.tsx` 與 `packages/ui-web/src/app-sidebar.tsx` 已是兩個 console 共用的現有 baseline。
- parent `MGMT-UI-001` 的核心目標，是在這個 shared package 裡把 management-console 專用 primitive family 補齊，而不是新建一個平行 app-local library。

### Current consumer baseline

- `apps/platform-admin-web/components/admin-nav.tsx` 已直接 consume `AppSidebar` from `@drts/ui-web`
- `apps/ops-console-web/components/sidebar.tsx` 已直接 consume `AppSidebar` from `@drts/ui-web`
- `apps/platform-admin-web/app/page.tsx` 與多個 ops-console routes 已 consume `PageHeader`, `Card`, `Badge`, `DataTable`, `StatCard`
- `apps/platform-admin-web/next.config.ts` 與 `apps/ops-console-web/next.config.ts` 都把 `@drts/ui-web` 列在 `transpilePackages`

### Informative duplication / migration hotspot

- `apps/platform-admin-web/components/mgmt/MgmtComponents.tsx` 內已有 app-local management tokens / cards / chips prototype
- 目前 repo 掃描未找到任何 `MgmtComponents` import consumer
- 這代表它更像是 prototype reservoir，而不是當前 shared-package public API
- reviewer 應確認 parent 沒有把這類 app-local prototype 誤宣稱為 shared package 完工證據

---

## 6) Sidecar Acceptance Criteria

### AC-S1 - packet stays support-only

- [x] 只建立 `support/sidecars/MGMT-UI-001/MGMT-UI-001-SIDECAR-ACCEPTANCE.md`
- [x] 不修改 canonical truth
- [x] 不接手 parent `packages/ui-web` 實作

### AC-S2 - dependency map matches machine truth

- [x] formal upstream dependency 仍為 `[]`
- [x] downstream blockers 嚴格對齊 `ai-status.json` 目前依賴 `MGMT-UI-001` 的七個 task
- [x] 把 execution-packet ordering 與 machine-truth dependency 分開描述，避免混淆 formal blocker 與 rollout guidance

### AC-S3 - packet includes executable review path

- [x] owner -> reviewer handoff 指令已提供
- [x] reviewer approve / reopen 指令已提供
- [x] parent reviewer focus 與 sidecar reviewer focus 已分開說明

---

## 7) Reviewer Focus

### Sidecar reviewer: `Codex2`

`Codex2` 審這份 packet 時，應優先確認：

1. packet 是否正確保留 `MGMT-UI-001.depends_on=[]`，沒有把 downstream task 誤寫成 upstream prerequisite。
2. packet 是否把 execution packet 的 primitive families完整帶入，但沒有擴寫成新的 design truth。
3. packet 是否清楚區分：
   - machine truth
   - execution-packet normative guidance
   - current live worktree snapshot
4. packet 是否把目前兩個 console 對 `@drts/ui-web` 的既有 consumer surface 說清楚。
5. packet 是否仍然只是一份 support artifact，沒有觸碰 `packages/ui-web` 或 app runtime。

### Parent reviewer: `Codex`

parent `MGMT-UI-001` 目前已進入 `review` 並由 `Codex` 處理。這份 packet 建議 reviewer 優先確認：

1. `packages/ui-web` 的 public export surface 是否真的覆蓋 execution packet 指定的 shared primitive family。
2. `platform-admin-web` 與 `ops-console-web` 是否在不強迫 page-family rewrite 的情況下仍 typecheck 通過。
3. parent 是否只在 `packages/ui-web` 範圍內落地，沒有擴張成跨 app 的未授權 rewrite。
4. downstream task 所需的 primitive 是否已可被 import，而不是只存在於 app-local prototype file。
5. handoff evidence 是否明確列出三條 typecheck command 的結果。

---

## 8) Handoff Command (Owner -> Sidecar Reviewer)

owner `Codex` 完成這份 packet 後，應用下列指令交給 `Codex2`：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff MGMT-UI-001-SIDECAR-ACCEPTANCE Codex2 "MGMT-UI-001 acceptance packet is ready at support/sidecars/MGMT-UI-001/MGMT-UI-001-SIDECAR-ACCEPTANCE.md. It preserves the formal dependency map with no upstream blockers, records the seven downstream tasks that wait on shared management primitives, separates machine truth from the current ui-web worktree snapshot, and packages the parent reviewer focus for the three cross-package typecheck gates. Support artifact only; no canonical truth or runtime changes."
```

---

## 9) Reviewer Actions (Executable)

Approve:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve MGMT-UI-001-SIDECAR-ACCEPTANCE "MGMT-UI-001 acceptance packet ready: it keeps MGMT-UI-001 free of formal upstream blockers, maps the seven downstream console tasks that depend on the shared primitive layer, separates machine truth from the live ui-web worktree snapshot, and frames the parent review around the three required typecheck gates without changing canonical truth."
```

Reopen:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen MGMT-UI-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency drift / evidence-anchor gap / scope violation]"
```

---

## 10) Suggested Parent Review Decision Payloads (Informative)

這不是 sidecar task 會執行的命令；目前 parent 已在 `review`，因此這裡改提供符合現況的 reviewer decision template。

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve MGMT-UI-001 "Shared desktop management primitives verified in @drts/ui-web. Export surface covers KPI rows, section headers, filter pills, callout banners, status chips, detail lists, stepper/timeline patterns, and related style helpers without forcing same-turn page rewrites. Verification: pnpm --filter @drts/ui-web typecheck; pnpm --filter @drts/platform-admin-web typecheck; pnpm --filter @drts/ops-console-web typecheck."
```

If the reviewer needs to return the task instead:

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen MGMT-UI-001 "review failed: [specify export-surface gap / acceptance regression / out-of-scope change]"
```

Suggested parent handoff evidence bundle:

- exact `packages/ui-web` files changed
- the final exported primitive names
- results of the three typecheck commands
- confirmation that downstream app rewrites were not smuggled into this foundation slice

---

## 11) Change Log

- `2026-05-08T14:31:41Z` - Codex created the initial `MGMT-UI-001` support-only acceptance packet from current machine truth, execution-packet guidance, shared-package baseline, and live workspace evidence. No canonical truth or runtime files were changed.
