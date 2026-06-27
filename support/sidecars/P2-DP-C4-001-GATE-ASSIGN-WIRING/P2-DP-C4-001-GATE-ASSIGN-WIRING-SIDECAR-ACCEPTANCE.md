# P2-DP-C4-001-GATE-ASSIGN-WIRING Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `P2-DP-C4-001-GATE-ASSIGN-WIRING`  
**Current Sidecar Owner / Reviewer:** `Codex` / `Claude`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-06-27T22:53Z (UTC)`  
**Status Snapshot:** sidecar machine truth is `in_progress` at `2026-06-27T22:53:04Z` with reviewer reassigned to `Claude`; parent machine truth remains `backlog` at `2026-06-27T22:36:45Z`

---

## 1) Scope Boundary

這個 sidecar 只整理 `P2-DP-C4-001-GATE-ASSIGN-WIRING` 的 acceptance framing、dependency map、repo baseline 與 reviewer handoff，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only checklist, repo evidence anchors, dependency mapping, reviewer hotspots, handoff text.
- Out of scope: `owned-mobility` runtime 實作、sandbox gate contract/governance truth 編修、任何 canonical spec 變更、或 billing / ROC / governance 主線重構。

---

## 2) Current Baseline (Machine Truth + Repo Scan)

### Machine truth

- Parent task `P2-DP-C4-001-GATE-ASSIGN-WIRING` 目前是 `backlog`，owner=`Codex2`、reviewer=`Codex`、formal `depends_on=[]`。
- Parent acceptance 已明確要求：
  - assign path 必須真的呼叫 `assertAssignmentEligible`
  - sparse snapshot 要在 assign 時被擋下
  - complete snapshot 要放行
  - gate decision 要寫進 `av_sandbox.sandbox_dispatch_decisions`
  - disclosure 缺失時不得指派 AV
- 本 sidecar `P2-DP-C4-001-GATE-ASSIGN-WIRING-SIDECAR-ACCEPTANCE` 目前是 `in_progress`，owner=`Codex`、reviewer=`Claude`；machine truth `next` 已記錄 reviewer 從 `Codex2` 改派為 `Claude`，原因是 `Codex2` quota-paused 會拖慢 approval handoff。

### Repo baseline

1. `OwnedMobilityModule` 目前沒有引入 `SandboxDispatchGateModule`。現有 imports 只有 `DatabaseModule`、`RegulatoryRegistryModule`、`ServiceProductModule`、`VehicleEligibilityModule`、`AuditNotificationModule`、`CallcenterModule` 與 `TenantPartnerModule`。  
   Evidence: `apps/api/src/modules/owned-mobility/owned-mobility.module.ts:1-36`

2. `assignDispatch()` 與 `reassignDispatch()` 都走 `createDispatchAssignment()`，但該 shared path 目前只做 `assertAssignmentEligibilityRecheck(...)` 後就 build/persist assignment bundle，沒有任何 sandbox gate 呼叫。  
   Evidence: `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2430-2443`, `2507-2517`, `2575-2631`

3. repo 內 `assertAssignmentEligible(`、`buildAssignmentGateInput(`、`recordPassengerAcknowledgement(` 的搜尋結果目前都只有 `sandbox-dispatch-gate.service.ts` 裡的定義，沒有 `owned-mobility` 或測試 call site。這表示 gate 能力已存在，但 assign path 尚未接線。  
   Evidence: search baseline from `apps/api/src` + `apps/api/tests`

4. sandbox gate service 本身已經具備 parent task 需要的核心能力：
   - `recordPassengerAcknowledgement(...)`
   - `evaluateDispatch(...)`
   - `assertAssignmentEligible(...)`
   - `shouldEvaluateSandboxAssignment(vehicleId)`
   - `buildAssignmentGateInput(...)`  
   Evidence: `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts:276-336`, `339-414`, `469-560`

5. `/sandbox/dispatch/evaluate` 獨立 endpoint 已存在，且現有 connected live E2E 相關測試仍是直接呼叫 `sandboxDispatchGateService.evaluateDispatch(...)`，不是走 booking -> dispatch -> assign 的 `owned-mobility` path。  
   Evidence: `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts:16-33`, `apps/api/tests/integration/e2e-p2-008-human-fallback.test.ts:45-86`

6. tenant booking order 目前建立時把 `passengerDisclosure` 初始化成 `null`。另一方面，gate service 在缺少 `policyId` / `messageCode` 或 acknowledgment 未完成時，會加入 passenger-disclosure 相關 block reasons。這代表 parent wiring 若不先 refresh / build disclosure snapshot，就不可能通過 gate。  
   Evidence: `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:628-649`, `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts:901-911`

7. gate decision persistence 已存在，`evaluateDispatch()` 會落到 `av_sandbox.sandbox_dispatch_decisions`。因此 parent 任務不需要新建 decision storage，只需要把 assign path 接進現有 service。  
   Evidence: `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts:346-380`, `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.repository.ts:62-103`

8. `OwnedMobilityService` 已有既存 billing integration，且 constructor 已經明確警告不要破壞既有 positional harness order。parent wiring 應疊在既有 service 上，不得為了注入 gate service 破壞 harness 或重複 billing layer。  
   Evidence: `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:84`, `246-258`, `3662-3667`

### Gap summary

| Gap | Why it matters | Baseline evidence |
| --- | --- | --- |
| `OwnedMobilityModule` 未 import gate module | service 無法乾淨注入 gate dependency | `owned-mobility.module.ts:1-36` |
| shared assign path 未呼叫 gate | 真正 assignment 不受 sandbox gate 保護 | `owned-mobility.service.ts:2430-2443`, `2575-2631` |
| gate helper methods 沒有消費者 | 現有能力只停留在 isolated gate service | search baseline, `sandbox-dispatch-gate.service.ts:276-560` |
| booking disclosure 初始為 `null` | 不先 refresh snapshot 就會撞 passenger disclosure block | `owned-mobility.service.ts:628-649`, `sandbox-dispatch-gate.service.ts:901-911` |
| 現有 E2E 只測 direct evaluate | 還沒證明 assign path 真的會觸發 gate | `e2e-p2-008-human-fallback.test.ts:45-86` |
| constructor / billing surface 已有敏感約束 | 粗暴插入 dependency 可能破壞 harness 或 billing integration | `owned-mobility.service.ts:84`, `246-258`, `3662-3667` |

---

## 3) Parent Acceptance Checklist (`P2-DP-C4-001-GATE-ASSIGN-WIRING`)

以下 checklist 只是把 parent machine-truth acceptance 展開成 reviewer-facing 檢查點，不新增產品語意。

### AC-1: Wiring must land on the shared assignment path, not only the standalone gate endpoint

- [ ] `OwnedMobilityModule` 已引入 `SandboxDispatchGateModule`，並以不破壞既有 module graph 的方式接線。
- [ ] `OwnedMobilityService` 已注入 `SandboxDispatchGateService`，且保留 constructor harness 相容性；不要因 positional arg 位移打壞既有 unit/integration harness。
- [ ] `assignDispatch()` 與 `reassignDispatch()` 最終共用的 assignment path 都會經過同一段 gate wiring，而不是只補單一路徑。

### AC-2: Gate invocation must use the existing sandbox gate capabilities instead of re-implementing them

- [ ] parent implementation 直接使用現有 `shouldEvaluateSandboxAssignment(...)`、`buildAssignmentGateInput(...)`、`assertAssignmentEligible(...)`。
- [ ] gate 只在 sandbox / AV assignment 需要時觸發，不應把所有 human fleet assignment 都誤送進 sandbox gate。
- [ ] parent implementation 沒有重新發明第二套 decision schema、第二套 reason-code map、或第二個 decision persistence path。

### AC-3: Passenger disclosure state must be refreshed before gate evaluation

- [ ] assign path 在 build gate input 前，會把 booking / order 的 passenger disclosure snapshot 補齊，而不是沿用當前 `passengerDisclosure: null` baseline。
- [ ] 若 disclosure policy / message 缺失，assign 應以 gate conflict 阻擋，不可 silently assign AV。
- [ ] 若 disclosure 需要 acknowledgement，assign path 會在適當時機使用 `recordPassengerAcknowledgement(...)`，且 evidence 能追到 acknowledgement record / updated snapshot。

### AC-4: Block path must be visible at real assignment time

- [ ] sparse / incomplete sandbox snapshot 會在 `assignDispatch` 或 `reassignDispatch` 真實路徑上得到 `CONFLICT`，而不是只有 direct `evaluateDispatch` 會 block。
- [ ] blocked assignment 不應建立新的 `dispatch_assignment` / `driver_task`，也不應把 order / dispatch job 前推到 `assigned`。
- [ ] 即使 block，gate decision 仍應持久化到 `av_sandbox.sandbox_dispatch_decisions`，讓 reviewer 能追到 hard reason codes。

### AC-5: Allow path must still preserve existing order + billing behavior

- [ ] complete snapshot 會 allow assignment，並建立正常 assignment / task。
- [ ] parent wiring 不會回歸或重複既有 billing integration；brief 已要求在 dev 現有 billing integration 之上乾淨疊加。
- [ ] ROC / recorder / regulatory / provider capability / disclosure reason codes 仍使用 gate service 原本的 decision surface，而不是新分支上的一組私有判斷。

### AC-6: Verification must prove the connected booking -> dispatch -> assign -> gate flow

- [ ] 至少一條測試或可重演證據顯示：`booking -> dispatch -> assign` 真的觸發 gate，而不只是 `/sandbox/dispatch/evaluate`。
- [ ] 驗證至少覆蓋兩條路徑：sparse snapshot block、complete snapshot allow。
- [ ] 驗證包含 disclosure 缺失時 AV assignment 被擋下。
- [ ] reviewer 不應接受只更新 direct gate tests、但沒有 assignment-path coverage 的 closeout。

---

## 4) Dependency Map

### Formal machine-truth dependencies

`P2-DP-C4-001-GATE-ASSIGN-WIRING.depends_on=[]`

這個 sidecar 不改 machine truth；下面的 dependency map 是 reviewer 用的「實作依賴圖」，不是要把 parent task 改寫成有 formal upstream blockers。

### Practical implementation dependencies

| Dep | Type | Why it matters | Evidence |
| --- | --- | --- | --- |
| D-1 | `OwnedMobilityModule` wiring surface | gate module 要在這裡接入 | `owned-mobility.module.ts:1-36` |
| D-2 | shared assignment funnel | `assignDispatch` / `reassignDispatch` 都經過這裡；gate 應放在 shared path | `owned-mobility.service.ts:2430-2443`, `2507-2517`, `2575-2631` |
| D-3 | constructor harness stability | 注入新 dependency 不能位移既有 positional harness 順序 | `owned-mobility.service.ts:246-258` |
| D-4 | booking disclosure baseline | 現況 `passengerDisclosure` 是 `null`，需要 refresh | `owned-mobility.service.ts:628-649` |
| D-5 | existing gate service capabilities | parent 應重用，不應重寫 | `sandbox-dispatch-gate.service.ts:276-560` |
| D-6 | disclosure gating semantics | 缺 `policyId` / `messageCode` / acknowledgement 會 block | `sandbox-dispatch-gate.service.ts:901-911` |
| D-7 | decision persistence | assign path gate decision 應沿用既有 decision table | `sandbox-dispatch-gate.service.ts:346-380`, `sandbox-dispatch-gate.repository.ts:62-103` |
| D-8 | standalone gate endpoint / current E2E baseline | 現況只證明 isolated evaluate path，不等於 assignment path 已受保護 | `sandbox-dispatch-gate.controller.ts:16-33`, `e2e-p2-008-human-fallback.test.ts:45-86` |
| D-9 | existing billing layer | parent patch 要 cleanly stack over current billing integration | `owned-mobility.service.ts:84`, `246-258`, `3662-3667` |

### Review implication

- `depends_on=[]` 不代表 reviewer 可以忽略上述 surfaces。
- parent 任務的真正難點不是「gate service 有沒有」，而是「assign path 有沒有正確接上，而且沒有打壞 harness / billing / shared flow」。

---

## 5) Evidence Inventory

| ID | Evidence | Anchor |
| --- | --- | --- |
| E-1 | parent / sidecar machine-truth status snapshot | `scripts/ai-status.sh show P2-DP-C4-001-GATE-ASSIGN-WIRING`, `scripts/ai-status.sh show P2-DP-C4-001-GATE-ASSIGN-WIRING-SIDECAR-ACCEPTANCE` |
| E-2 | module currently lacks gate import | `apps/api/src/modules/owned-mobility/owned-mobility.module.ts:1-36` |
| E-3 | assign / reassign currently skip sandbox gate | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2430-2443`, `2507-2517`, `2575-2631` |
| E-4 | gate helper methods exist but have no current consumers | `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts:276-560` plus repo search baseline |
| E-5 | passenger disclosure missing today on booking orders | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:628-649` |
| E-6 | disclosure-related gate reasons already exist | `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts:901-911` |
| E-7 | decision persistence table already exists | `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.repository.ts:62-103` |
| E-8 | current connected E2E still uses direct `evaluateDispatch` | `apps/api/tests/integration/e2e-p2-008-human-fallback.test.ts:45-86` |
| E-9 | existing billing integration / constructor sensitivity | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:84`, `246-258`, `3662-3667` |

Verification note: 這份 packet 是 support-only repo scan，未執行 runtime test suite，也沒有修改 parent runtime code。

---

## 6) Reviewer Hotspots (`Claude`)

1. 確認 parent patch 把 gate 放在 shared assignment path，而不是只補一個單獨 `assignDispatch` 分支或只加 direct evaluate test。
2. 確認新注入的 gate dependency 沒有破壞 `OwnedMobilityService` constructor 的 harness 相容性。
3. 確認 block path 真的是 assignment-time block，且沒有偷偷建立 assignment / task 後才報錯。
4. 確認 disclosure snapshot 是在 assign 前被 refresh / assembled，而不是仍然沿用 `passengerDisclosure: null`。
5. 確認 `av_sandbox.sandbox_dispatch_decisions` 仍是唯一 decision persistence surface。
6. 確認 gate wiring 是疊在既有 billing integration 之上，而不是順手重做 billing behavior。

**Suggested approval wording**

> `P2-DP-C4-001 gate-assign wiring acceptance packet ready: the repo baseline still shows OwnedMobility assignment bypassing sandbox gate calls, while the sandbox-dispatch-gate service already exposes the needed build/evaluate/assert/acknowledgement capabilities and persists decisions to av_sandbox.sandbox_dispatch_decisions. The packet correctly frames the real acceptance target as booking->dispatch->assign gate enforcement, highlights the current passengerDisclosure=null baseline and constructor/billing integration constraints, and stays within support-only sidecar scope.`

**Suggested reopen wording**

> `packet needs revision: [specify machine-truth mismatch / assign-path-vs-direct-evaluate confusion / disclosure-state gap / constructor-harness risk omission / billing-layer omission / support-scope violation]`

---

## 7) Reviewer Handoff Commands

Owner handoff to `Claude`:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-DP-C4-001-GATE-ASSIGN-WIRING-SIDECAR-ACCEPTANCE Claude "Acceptance packet ready at support/sidecars/P2-DP-C4-001-GATE-ASSIGN-WIRING/P2-DP-C4-001-GATE-ASSIGN-WIRING-SIDECAR-ACCEPTANCE.md. It captures the current gap that OwnedMobility assignment still bypasses sandbox gate calls, maps the existing gate capabilities and decision persistence surfaces, highlights passengerDisclosure=null and constructor/billing integration constraints, and frames reviewer checks around real booking->dispatch->assign enforcement without modifying canonical truth."
```

Reviewer approve:

```bash
AI_NAME=Claude scripts/ai-status.sh approve P2-DP-C4-001-GATE-ASSIGN-WIRING-SIDECAR-ACCEPTANCE "Acceptance packet verified: it preserves machine truth, documents the current assign-path gap against existing sandbox gate capabilities, highlights disclosure-state plus constructor/billing integration risks, and stays within support-only scope."
```

Reviewer reopen:

```bash
AI_NAME=Claude scripts/ai-status.sh reopen P2-DP-C4-001-GATE-ASSIGN-WIRING-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / missing reviewer hotspot / evidence anchor issue / support-scope violation]"
```

Owner closeout reminder after `review_approved`:

- only mark `done` after task-scoped commit + normal push evidence exist
- final sidecar `INTEGRATION_STATUS` should be `not_applicable`

---

## 8) Change Log

- `2026-06-27T22:53Z` — 對齊最新 machine truth：sidecar reviewer 由 `Codex2` 改派為 `Claude`，同步修正 header、reviewer hotspots 與 handoff / approve / reopen 指令。
- `2026-06-27T22:51Z` — 初版建立：依 machine truth、`owned-mobility` / `sandbox-dispatch-gate` repo baseline、current E2E coverage 與 parent acceptance 目標整理 acceptance checklist、dependency map、review hotspots 與 handoff 指令。
