# GAP-P2S1-014 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-014` — webhook: owned-mobility order status change event hooks -> dispatch trigger  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `(unassigned)`  
**Last Revised:** `2026-04-17 11:37 UTC`  
**Status:** `FINALIZED_PENDING_DONE_SYNC — reviewer approval is recorded in shared truth; this packet is ready for owner closeout to done while parent GAP-P2S1-014 remains blocked pending its own implementation`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-014` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, dependency mapping, repo-scan evidence anchors, reviewer checklist, and closeout commands.
- Out of scope: `owned-mobility` runtime changes, `tenant-partner` / webhook engine rewiring, contract changes, or machine-truth edits outside scripted status updates.

---

## 2) Current State Baseline

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-014` 在 machine truth 中仍是 `blocked`，Owner=`Codex`，formal dependency 只有 `GAP-P2S1-013`。
- Upstream `GAP-P2S1-013` 已在 machine truth 中 `done`：
  - `ai-status.json` 記錄 canonical closeout commit=`7d4578d`
  - reviewer note 凍結的完成態是：`WebhookDispatchService` 已具備 live `fetch()` dispatch、HMAC signing、exponential retry、`tenant-partner-foundation` / unit test 與 `@drts/api` typecheck 驗證
- 本 sidecar `GAP-P2S1-014-SIDECAR-ACCEPTANCE` 已在 shared truth 中進入 `review_approved`，Owner=`Codex2`，Reviewer=`Codex`，artifact path 為 `support/sidecars/GAP-P2S1-014/GAP-P2S1-014-SIDECAR-ACCEPTANCE.md`。
- `current-work.md` 與 `ai-status.json` 顯示 reviewer 結論已寫回 machine truth，待 owner 執行正式 `done` closeout；先前 `Codex2 -> Codex` review handoff 已由 review approval 消化。
- `ai-activity-log.jsonl` 顯示最近與本 packet 直接相關的事實鏈為：
  - 2026-04-17T11:28:09Z：`Codex2` 首次 handoff 給 `Codex`，packet 進入 `review`
  - 2026-04-17T11:29:52Z：`Codex` 以 reviewer 身分 reopen，理由是 Section 2 仍把 sidecar 寫成 `todo`
  - 2026-04-17T11:30:22Z`~`11:31:42Z：期間只有 ownership churn / repeated terminal failure / rebalance，沒有新的產品或 repo 語意變更
  - 2026-04-17T11:33:00Z：`Codex2` 重新 handoff 給 `Codex`；shared truth 自此穩定顯示 sidecar=`review`
  - 2026-04-17T11:35:30Z：`Codex` 寫入 `review_approved`，確認 packet 保留唯一 formal dependency、區分 dispatch engine 與 event-hook 邊界，且未改動 canonical truth
  - 2026-04-17T11:35:42Z：Orchestrator 以 `owned_finalize_dispatch` 喚醒 `Codex2`，要求 owner 做正式 closeout
- `docs-site/index.html` 只是 dashboard shell，對本 task 不提供任何額外產品語意。

### Repo Baseline Anchors

- [`apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts:48) 已有 `WebhookDispatchService`，處理 live POST dispatch、簽章、retry delay 與 retry 判定。
- [`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:991) 目前唯一明確建立 webhook delivery 並觸發 dispatch 的入口是 `sendTestWebhook(...)`。
- [`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1101) 的 `dispatchWebhookAttempt(...)` 目前是 `TenantPartnerService` 私有 helper，尚未暴露為可由 `owned-mobility` 直接呼叫的 domain event bridge。
- [`apps/api/src/modules/tenant-partner/tenant-partner.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.module.ts:10) 有註冊 `WebhookDispatchService`，但 [`apps/api/src/modules/owned-mobility/owned-mobility.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.module.ts:10) 尚未 import `TenantPartnerModule` 或任何 webhook-facing provider。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1116) / [:1192](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1192) / [:1427](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1427) / [:1730](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1730) 會更新訂單狀態到 `assigned`、`cancelled`、`driver_accepted`、`completed` 等，但只寫入 trace / audit / notification，沒有 webhook dispatch 呼叫。
- [`apps/api/tests/unit/webhook-dispatch.service.test.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/webhook-dispatch.service.test.ts:16) 只覆蓋 dispatch engine 行為（snake_case payload、signature header、retryable 503 queue），沒有 `owned-mobility` 狀態事件 hook 測試。

結論：`GAP-P2S1-013` 的 dispatch engine 已落地，但 `GAP-P2S1-014` 需要的「order status change -> webhook delivery trigger」目前尚未在 repo baseline 中出現。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-014` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；本 packet 只把共享真相與目前 gap 基線展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Formal sequencing remains explicit

- [ ] parent `GAP-P2S1-014` 的 formal dependency 仍只引用 `GAP-P2S1-013`，不得把 sidecar 文件改寫成新的 canonical blocker 清單。
- [ ] reviewer handoff 要明確承接 `GAP-P2S1-013` 的完成態：live fetch dispatch、HMAC、retry 已完成，`014` 不應重做 engine。
- [ ] parent implementation 應聚焦在事件 hook / delivery creation / trigger wiring，而不是再次修改 transport layer。

### AC-2 — Owned-mobility status changes actually trigger webhook dispatch

- [ ] `owned-mobility` 至少對共識文件點名的狀態變化接上 webhook trigger，不能只保留 trace log / audit。
- [ ] 事件 hook 需以真實訂單狀態流轉為來源，而不是只有人工 `sendTestWebhook()` 路徑。
- [ ] 若新增 bridge/service surface，reviewer 可以明確定位從 `owned-mobility` 到 webhook delivery 的呼叫路徑。

### AC-3 — Trigger scope stays aligned to planning baseline

- [ ] 事件範圍至少覆蓋 consensus/starter-draft 指名的 `created / cancelled / completed` family，不可退化成只有 test event。
- [ ] 新的 webhook event payload / eventType 命名若需擴充，必須與既有 webhook delivery records / tenant endpoint filtering 相容；不能破壞 `tenant.webhook.test` 既有路徑。
- [ ] sidecar/closeout 說明不得把 `driver_accepted`、`enroute_pickup` 等內部狀態自動宣稱為產品承諾，除非 parent 實作與 reviewer 結論真的採納。

### AC-4 — Tenant isolation and reviewer evidence stay auditable

- [ ] webhook delivery 必須仍以 order/booking 所屬 tenant 為 authority，不得回退到跨 tenant 廣播或 demo-only shortcut。
- [ ] reviewer 應能從 unit/integration evidence 看出：至少一個 order lifecycle event 真的建立 delivery 並走過 dispatch engine。
- [ ] parent closeout 說明應分清楚「trigger wiring evidence」與「transport engine evidence」，避免把 `013` 的既有測試誤當 `014` 的完成證據。

---

## 4) Dependency Map

### Formal Upstream Dependency

> machine truth: `GAP-P2S1-014.depends_on=["GAP-P2S1-013"]`

| Dep    | Source         | Status | Notes                                                                                  |
| ------ | -------------- | ------ | -------------------------------------------------------------------------------------- |
| D-UP-1 | `GAP-P2S1-013` | `done` | `WebhookDispatchService` live dispatch + retry 已完成；`014` 以此為 transport baseline |

### Practical Review Dependencies

| Dep   | Type                                              | Why It Matters                                                                       |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D-P-1 | `TenantPartnerService.sendTestWebhook()` baseline | 說明目前 delivery 建立/dispatch 只存在 test route，parent 需要補 domain-trigger path |
| D-P-2 | `OwnedMobilityService` status transitions         | 說明哪些現有 lifecycle 變化是可掛 hook 的真實來源                                    |
| D-P-3 | Module wiring boundary                            | 說明 `OwnedMobilityModule` 目前尚未接 webhook module/provider                        |
| D-P-4 | Consensus anchors                                 | 鎖定 planner 對 `created/cancelled/completed` hook 的預期，避免 acceptance drift     |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/starter-draft.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-2.md`
- Repo evidence surfaces:
  - `apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.module.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.module.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `apps/api/tests/unit/webhook-dispatch.service.test.ts`

---

## 5) Evidence Inventory

| ID  | Evidence                                    | Expected Anchor                                                                                     |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| E-1 | Parent / sidecar machine state              | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                        |
| E-2 | Upstream engine closeout                    | `ai-status.json` entry for `GAP-P2S1-013`                                                           |
| E-3 | Dispatch engine implementation baseline     | `apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts`                                   |
| E-4 | Current delivery creation path is test-only | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:991-1174`                            |
| E-5 | Owned order lifecycle transition anchors    | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1027-1179`, `1183-1262`, `1416-1755` |
| E-6 | Module wiring gap baseline                  | `apps/api/src/modules/owned-mobility/owned-mobility.module.ts`, `tenant-partner.module.ts`          |
| E-7 | Existing transport-only test coverage       | `apps/api/tests/unit/webhook-dispatch.service.test.ts`                                              |
| E-8 | Planning expectation for order event hooks  | `consensus-packet.md`, `starter-draft.md`, `review-round-2.md`                                      |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：`GAP-P2S1-014` 正式只 blocked on `GAP-P2S1-013`，沒有擅自擴增 formal deps。
2. packet 是否清楚區分 `013` 已完成的 dispatch engine 與 `014` 尚未完成的 event hook wiring。
3. baseline 是否正確指出：目前 live dispatch 只從 `sendTestWebhook()` 進入，而非 `owned-mobility` 狀態事件。
4. acceptance framing 是否把 scope 收斂在 planner 已明示的 `created / cancelled / completed` family，而非自行發散成所有 internal status。
5. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S1-014 acceptance packet ready: it preserves the sole formal dependency on GAP-P2S1-013, cleanly separates the already-done webhook transport engine from the still-missing owned-mobility status hook wiring, and gives a reviewer-usable acceptance map without changing canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency drift / wrong event-scope claim / support-scope violation]`

---

## 7) Handoff Command

若 owner（`Codex2`）在 reviewer reopen 後需要重新送審，交給 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S1-014-SIDECAR-ACCEPTANCE Codex "GAP-P2S1-014 acceptance packet is ready at support/sidecars/GAP-P2S1-014/GAP-P2S1-014-SIDECAR-ACCEPTANCE.md. It freezes the sole formal dependency on GAP-P2S1-013, shows that WebhookDispatchService is already done while owned-mobility order status hooks are still missing, and packages the reviewer checklist and evidence anchors as support-only material without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S1-014-SIDECAR-ACCEPTANCE "GAP-P2S1-014 acceptance packet ready: machine truth still shows GAP-P2S1-013 as the only formal dependency, the dispatch engine vs. event-hook boundary is accurately separated, and the support packet gives a reviewer-usable acceptance checklist without mutating canonical truth."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-014-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency drift / wrong event-scope claim / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 已經 reviewer 核准；由 owner（`Codex2`）執行正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done GAP-P2S1-014-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-014 at support/sidecars/GAP-P2S1-014/GAP-P2S1-014-SIDECAR-ACCEPTANCE.md. The packet preserves the GAP-P2S1-013 dependency, the current owned-mobility hook gap baseline, and the reviewer handoff path without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17 11:37 UTC — 對齊 shared truth 的 finalize 階段：將 packet 狀態更新為 reviewer-approved 後待 owner closeout，補記 `2026-04-17T11:35:30Z` review approval 與 `2026-04-17T11:35:42Z` finalize dispatch。
- 2026-04-17 11:34 UTC — 再次校正 machine-truth snapshot：sidecar 狀態改為 `review`，補上 `2026-04-17T11:33:00Z` 的 pending handoff 與 `11:29:52Z` reviewer reopen，並明確標示 11:30-11:31Z 只有 ownership churn、沒有新的產品語意變更。
- 2026-04-17 11:31 UTC — 校正 machine-truth snapshot：sidecar 狀態由舊稿的 `todo` 更新為 `in_progress`，並把 recent ownership churn 對齊到 `ai-activity-log.jsonl` 的 11:30-11:31Z 事件鏈。
- 2026-04-17 — 初版建立：依共享 machine truth、planning anchors 與 repo 掃描，整理 `GAP-P2S1-014` 的 acceptance checklist、dependency map、dispatch-engine vs. event-hook baseline、以及 reviewer handoff 指引。
