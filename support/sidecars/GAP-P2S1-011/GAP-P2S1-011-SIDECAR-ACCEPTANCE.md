# GAP-P2S1-011 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-011` — tests: E2E + unit update for multi-tenant header assertions  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `(unassigned)`  
**Last Revised:** `2026-04-17 (UTC)`  
**Status:** `ACTIVE SUPPORT ARTIFACT — parent GAP-P2S1-011 remains formally blocked on GAP-P2S1-009 and GAP-P2S1-010; current machine truth is sidecar=review with owner=Codex2, reviewer=Codex, last_update=2026-04-17T11:53:41Z, and this packet now separates the earlier 2026-04-17T11:49:29Z review snapshot plus the 2026-04-17T11:51:06Z–2026-04-17T11:51:43Z reopen/reassignment churn from the later 2026-04-17T11:53:41Z Codex2 -> Codex review handoff snapshot`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-011` 的 acceptance checklist、dependency map、現況測試基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務補測試。

- In scope: support-only acceptance framing, dependency freeze, repo-scan evidence anchors, current unit/E2E baseline, reviewer checklist, and closeout commands.
- Out of scope: `billing-settlement` / `tenant-partner` runtime refactor、實際 E2E 或 unit 測試改寫、L1/L2 真相修改、或 machine-truth 以外的非腳本狀態編輯。

---

## 2) Current State Baseline

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準。這些檔案不是同一秒產生，因此本節用絕對時間標示各 snapshot，並刻意分開「earlier review snapshots」、「intermediate reopen / in-progress snapshot」與「current review snapshot」：

- 父任務 `GAP-P2S1-011` 在 machine truth 中仍是 `blocked`，Owner=`Codex`，formal dependencies 只有 `GAP-P2S1-009` 與 `GAP-P2S1-010`。
- sidecar `GAP-P2S1-011-SIDECAR-ACCEPTANCE` 的 canonical owner / reviewer 目前是 `Codex2` / `Codex`，artifact path 為 `support/sidecars/GAP-P2S1-011/GAP-P2S1-011-SIDECAR-ACCEPTANCE.md`。
- 狀態時間線需要分開看：
  - `review snapshot @ 2026-04-17T11:45:56Z`：shared L0 truth 在這個時間點曾把 sidecar 顯示為 `review`，owner=`Codex2`、reviewer=`Codex`；handoff queue 中還有一筆 `Qwen -> Codex` 的 pending review reassignment，訊息是 repeated Qwen token failure 後 auto-reassigned 回 `Codex`。這正是 reviewer 最新 reopen 要求 packet 補寫的 snapshot。
  - `review snapshot @ 2026-04-17T11:49:29Z`：在 `11:47:37Z` reopen 之後，owner 重新 handoff 給 reviewer；較新的 `ai-status.json` / `current-work.md` activity now record a pending `Codex2 -> Codex` handoff created at `2026-04-17T11:49:29Z`，當時 machine truth 一度回到 `status=review`, `owner=Codex2`, `reviewer=Codex`, `last_update=2026-04-17T11:49:29Z`。這是 reviewer 在 `2026-04-17T11:51:06Z` reopen 中要求補進 packet 的關鍵較新 snapshot。
  - `reopen + reassignment churn @ 2026-04-17T11:51:06Z` 到 `2026-04-17T11:51:43Z`：reviewer `Codex` 在 `2026-04-17T11:51:06Z` 再次 reopen，指出 packet 仍把 `11:47:37Z` 誤當 current truth；之後 Orchestrator 依可用性先後把 owner 從 `Codex2 -> Codex @ 11:51:13Z`、`Codex -> Qwen @ 11:51:19Z`、`Qwen -> Codex @ 11:51:37Z`，最後在 `2026-04-17T11:51:43Z` proactive rebalance 回 `Codex2`。
  - `intermediate in-progress snapshot @ 2026-04-17T11:51:38Z`：在 `11:53:41Z` 再次 handoff 之前，`ai-status.json` task row 與 `current-work.md` task board 一度同步為 `in_progress`, `owner=Codex2`, `reviewer=Codex`, `last_update=2026-04-17T11:51:38Z`；這是 reviewer reopen 後的暫時 owner work state，不再是最新狀態。
  - `current review snapshot @ 2026-04-17T11:53:41Z`：`ai-status.json` task row 現在是 `status=review`, `owner=Codex2`, `reviewer=Codex`, `last_update=2026-04-17T11:53:41Z`；`current-work.md` handoff queue 也有一筆 pending `Codex2 -> Codex` handoff created at `2026-04-17T11:53:41Z`。需要額外注意的是，這筆 handoff 的 message 仍在摘要較早的 `11:51:06Z` reopen 與 `11:51:38Z` in-progress snapshot，但 machine truth 本身已回到 `review`。
  - `current-work.md` 的最新輸出時間是 `2026-04-17T11:53:55Z`，task board 與 handoff queue 都已反映這次回到 `review` 的狀態；activity 區塊則同時保留 `11:49:29Z` handoff、`11:51:06Z` reopen、`11:51:13Z` 到 `11:51:43Z` churn、以及 `11:53:41Z` 最新 handoff。
  - `ai-activity-log.jsonl` 補齊了這些 snapshot 之間的事件鏈：2026-04-17T11:31:07Z first owner-ready handoff、2026-04-17T11:32:49Z first reviewer reopen、2026-04-17T11:33:34Z second handoff、2026-04-17T11:33:42Z worker advanced task to `review`、2026-04-17T11:37:47Z second reviewer reopen、2026-04-17T11:39:39Z third owner handoff、2026-04-17T11:45:56Z `Qwen -> Codex` pending review handoff snapshot、2026-04-17T11:47:37Z reopen、2026-04-17T11:49:29Z `Codex2 -> Codex` review handoff、2026-04-17T11:51:06Z latest reviewer reopen、2026-04-17T11:51:13Z–2026-04-17T11:51:43Z availability-driven owner churn、以及 2026-04-17T11:53:41Z latest owner handoff plus 2026-04-17T11:53:43Z review-ready dispatch back to `Codex`。
- `ai-activity-log.jsonl` 與 `ai-status.json.handoffs[]` 已可確認的關鍵活動如下：
  - 2026-04-17T11:31:07Z：`Codex2 -> Codex` first ready-for-review handoff（此筆在 `ai-status.json` handoff history 中 `resolved_at=2026-04-17T11:32:49Z`）。
  - 2026-04-17T11:32:49Z：`Codex` first reopen，指出 packet 把 sidecar 誤寫成 `in_progress` 且漏掉既有 handoff。
  - 2026-04-17T11:33:34Z：`Codex2` second handoff，更新 packet 後再次送 reviewer。
  - 2026-04-17T11:33:42Z：Orchestrator 記錄 background worker 已把 sidecar 推進到 `review`。
  - 2026-04-17T11:33:36Z 到 2026-04-17T11:37:47Z：review lane 在 `Codex` 與 `Qwen` 間多次 availability/token-failure reassign，最終仍回到 `Codex`。
  - 2026-04-17T11:37:47Z：`Codex` second reopen，要求本次 revision 明確寫出 `11:31:07Z` handoff、`11:32:49Z` reopen，以及 shared files 的 snapshot 差異。
  - 2026-04-17T11:39:39Z：`Codex2 -> Codex` third handoff，訊息已改成納入 `11:31:07Z` handoff 與 `11:32:49Z` / `11:37:47Z` reopen history。
  - 2026-04-17T11:45:56Z：handoff queue 出現 `Qwen -> Codex` review reassignment，原因是 repeated Qwen token failure；reviewer 最新 reopen 明確要求 packet 不能漏掉這個 pending handoff 所對應的 `review` snapshot。
  - 2026-04-17T11:47:37Z：`Codex` reopen，指出 packet 的 header/status、Section 2 與 reviewer checklist 仍停在 `11:41:45Z` 之前的視角，尚未把 `11:45:56Z review snapshot + pending Qwen -> Codex handoff` 寫進文件。
  - 2026-04-17T11:49:29Z：`Codex2 -> Codex` handoff，shared truth 一度回到 `review`；這是 reviewer 下一次 reopen 明確要求補入的較新 review snapshot。
  - 2026-04-17T11:51:06Z：`Codex` latest reopen，指出 packet 仍把 `11:47:37Z` 視為 current truth，但 shared L0 已出現更新的 `11:49:29Z review` snapshot 與 pending `Codex2 -> Codex` handoff。
  - 2026-04-17T11:51:13Z → 2026-04-17T11:51:43Z：Orchestrator 因 worker availability / token failure 讓 owner 在 `Codex2`、`Codex`、`Qwen` 之間短暫流轉，最後於 `11:51:43Z` proactive rebalance 回 `Codex2`；這段只代表中間的 `in_progress` churn，不能把它誤寫成最終狀態。
  - 2026-04-17T11:53:41Z：`Codex2 -> Codex` latest handoff，shared truth 明確回到 `review`；目前 handoff queue 的 pending 項目就是這一筆。
  - 2026-04-17T11:53:43Z：Orchestrator queue 以 `review_ready_dispatch` 再次喚醒 reviewer `Codex`；這說明當前工作語境是 reviewer 回應，而不是 owner 持續編修。
- `docs-site/index.html` 只是 supervisor dashboard shell，對本 task 沒有額外產品語意。

### Repo Baseline Anchors

- [`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:51) 仍以 `DEMO_TENANT_ID = "tenant-demo-001"` 作為 service-level tenant seed 與大量 runtime write/read 的默認來源。
- [`apps/api/src/modules/billing-settlement/billing-settlement.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/billing-settlement/billing-settlement.service.ts:41) 同樣保留 `DEMO_TENANT_ID = "tenant-demo-001"`，settlement seed 與多數 tenant-facing 行為尚未切成 per-tenant store。
- [`tests/unit/tenant-partner-foundation.test.ts`](/home/edna/workspace/drts-fleet-platform/tests/unit/tenant-partner-foundation.test.ts:12) 現有測試驗證 tenant-partner foundation 與 webhook 行為，但沒有 cross-tenant isolation 或不同 `tenantId` 的 assertions。
- [`tests/unit/billing-settlement.test.ts`](/home/edna/workspace/drts-fleet-platform/tests/unit/billing-settlement.test.ts:11) 現有測試覆蓋 billing workflow 與一個 live-trip invoice path，但仍以 demo tenant / single-tenant assumptions 為主。
- [`tests/e2e/lib/helpers.sh`](/home/edna/workspace/drts-fleet-platform/tests/e2e/lib/helpers.sh:24) 已支援 `switch_actor` 與 `x-tenant-id` header injection，表示 E2E harness 有送 tenant header 的能力。
- 但 repo 掃描沒有找到任何已明示 `GAP-P2S1-011` 的實作文件或專屬測試更新；也沒有看到現成的 cross-tenant assertion pack。

結論：`GAP-P2S1-011` 是一個明確的 downstream test-update slice，前提是 `009/010` 先把 `billing-settlement` 與 `tenant-partner` 從 demo-only tenant state 提升到 per-tenant store；目前測試基線尚未證明這件事。對 sidecar 而言，shared truth 必須拆成多個時間點來讀：`11:45:56Z` 與 `11:49:29Z` 都是 review snapshots，`11:51:38Z` 只是 reopen 後的中間 `in_progress` owner state，而最新 machine truth 已在 `11:53:41Z` 回到 `review under Codex2/Codex`。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-011` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；本 packet 只把 shared truth 與現況基線展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Formal sequencing stays frozen on `009 + 010 -> 011`

- [ ] parent `GAP-P2S1-011` 的 formal blockers 仍只引用 `GAP-P2S1-009` 與 `GAP-P2S1-010`，sidecar 不得自行擴增 canonical dependencies。
- [ ] reviewer handoff 要明確承接 planning baseline：`011` 是針對 `009/010` refactor 後的 test update，而不是獨立先行修補。
- [ ] 若 `009` 或 `010` 尚未 `done`，parent 任務不可被 sidecar 文件誤導成 ready-for-implementation。

### AC-2 — Unit coverage must prove per-tenant isolation instead of demo-only defaults

- [ ] `billing-settlement` 測試需能證明不同 tenant 的資料不會互相污染，不再只靠 `tenant-demo-001` 默認值。
- [ ] `tenant-partner` 測試需能證明至少一個 tenant-scoped record surface 會依 request tenant 或 service tenant context 分流，而不是全部讀寫到 demo tenant bucket。
- [ ] reviewer 應能從測試名稱與 assertions 看出「same module, two tenant contexts, isolated results」的證據。

### AC-3 — E2E coverage must exercise tenant header routing explicitly

- [ ] E2E scenario 應透過既有 `tests/e2e/lib/helpers.sh` 的 `switch_actor` / `x-tenant-id` 機制，明確送出 tenant header，而不是只沿用 platform-wide default context。
- [ ] 至少一條 E2E flow 要驗證 tenant header 影響 observable output，例如只能看見該 tenant 的 invoice / webhook / audit / metadata，而非另一 tenant 的資料。
- [ ] sidecar 或 closeout 說明不得把「helper 已支援 `x-tenant-id`」誤寫成「multi-tenant assertion 已存在」。

### AC-4 — Evidence must separate harness readiness from post-refactor verification

- [ ] 現有 helper / bootstrap auth 能送 tenant headers，這只能算 harness-ready，不算 `011` 已完成。
- [ ] reviewer 應分清楚 `009/010` 的 runtime refactor evidence 與 `011` 的 test assertion evidence；前者不能直接替代後者。
- [ ] parent closeout 說明需列出實際新增或更新的 unit/E2E tests，而不是只引用 planning docs 或 helper library。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> machine truth: `GAP-P2S1-011.depends_on=["GAP-P2S1-009","GAP-P2S1-010"]`

| Dep    | Source         | Status    | Notes                                                   |
| ------ | -------------- | --------- | ------------------------------------------------------- |
| D-UP-1 | `GAP-P2S1-009` | `backlog` | `billing-settlement` per-tenant store refactor 尚未完成 |
| D-UP-2 | `GAP-P2S1-010` | `backlog` | `tenant-partner` per-tenant store refactor 尚未完成     |

### Practical Review Dependencies

| Dep   | Type                                                 | Why It Matters                                                      |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| D-P-1 | `billing-settlement.service.ts` demo-tenant baseline | 說明 tests 現在沒有真實多租戶隔離可驗                               |
| D-P-2 | `tenant-partner.service.ts` demo-tenant baseline     | 說明 tenant-partner 多數記錄仍落在單一 demo tenant                  |
| D-P-3 | `tests/unit/*.test.ts` current assertions            | 說明 unit baseline 還沒覆蓋 cross-tenant isolation                  |
| D-P-4 | `tests/e2e/lib/helpers.sh` harness support           | 說明 E2E 已能送 tenant header，但尚未形成 acceptance evidence       |
| D-P-5 | planning split rationale                             | 鎖定 `009/010/011` 的切分原因，避免把 `011` 誤做成 runtime refactor |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-4.md`
- Repo evidence surfaces:
  - `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  - `tests/unit/billing-settlement.test.ts`
  - `tests/unit/tenant-partner-foundation.test.ts`
  - `tests/e2e/lib/helpers.sh`
  - `apps/api/tests/unit/auth-bootstrap.test.ts`

---

## 5) Evidence Inventory

| ID  | Evidence                                    | Expected Anchor                                                      |
| --- | ------------------------------------------- | -------------------------------------------------------------------- |
| E-1 | Parent / sidecar machine state              | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`         |
| E-2 | Formal dependency chain                     | `consensus-packet.md` dependency tree and task table                 |
| E-3 | Split rationale for `009/010/011`           | `review-round-4.md` Risk-1 section                                   |
| E-4 | Tenant-partner still demo-tenant keyed      | `tenant-partner.service.ts:51` plus repeated `DEMO_TENANT_ID` usages |
| E-5 | Billing-settlement still demo-tenant keyed  | `billing-settlement.service.ts:41` plus seed/store usage             |
| E-6 | Current tenant-partner unit baseline        | `tests/unit/tenant-partner-foundation.test.ts`                       |
| E-7 | Current billing-settlement unit baseline    | `tests/unit/billing-settlement.test.ts`                              |
| E-8 | E2E harness can send tenant headers         | `tests/e2e/lib/helpers.sh:24-126`                                    |
| E-9 | Bootstrap auth already parses tenant header | `apps/api/tests/unit/auth-bootstrap.test.ts:35-57`                   |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：`GAP-P2S1-011` 仍正式 blocked on `GAP-P2S1-009` + `GAP-P2S1-010`。
2. packet 是否明確記錄 `11:31:07Z` handoff、`11:32:49Z` reopen、`11:33:42Z review snapshot`、`11:37:47Z second reopen`、`11:39:39Z` third handoff、`11:45:56Z` review snapshot with pending `Qwen -> Codex` reassignment、`11:49:29Z` newer review snapshot with pending `Codex2 -> Codex` handoff、`11:51:06Z` reopen 後到 `11:51:38Z` 的 intermediate in-progress owner state、以及 `11:53:41Z` current review snapshot，而不是把 sidecar 凍結在較早版本。
3. packet 是否清楚區分「helper/harness 已能送 tenant header」與「multi-tenant assertions 尚未落地」。
4. baseline 是否正確指出 `billing-settlement` / `tenant-partner` 兩個 parent dependency 目前仍有 demo-tenant state。
5. acceptance framing 是否把 scope 收斂在 test update，不越界去重寫 parent runtime refactor。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S1-011 acceptance packet ready: it preserves the formal 009+010 dependency chain, records the 11:31:07Z handoff, the 11:32:49Z and 11:37:47Z reopen history, the 11:45:56Z and 11:49:29Z review snapshots with their pending reassignments, treats the 11:51:06Z reopen plus 11:51:38Z in-progress state as an intermediate churn snapshot, and now lands on the current 11:53:41Z review handoff state accurately, distinguishes tenant-header harness readiness from the still-missing cross-tenant assertions, and gives a reviewer-usable test acceptance map without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency drift / overclaimed multi-tenant evidence / support-scope violation]`

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S1-011-SIDECAR-ACCEPTANCE Codex "GAP-P2S1-011 acceptance packet is ready at support/sidecars/GAP-P2S1-011/GAP-P2S1-011-SIDECAR-ACCEPTANCE.md. It preserves the formal dependency chain on GAP-P2S1-009 and GAP-P2S1-010, captures the current single-tenant test baseline in billing-settlement and tenant-partner, and now records the 2026-04-17T11:31:07Z handoff, the 2026-04-17T11:32:49Z and 2026-04-17T11:37:47Z reopen history, the 2026-04-17T11:45:56Z and 2026-04-17T11:49:29Z review snapshots with their pending reviewer handoffs, treats the 2026-04-17T11:51:06Z reopen plus 2026-04-17T11:51:38Z in-progress state as intermediate churn, and lands on the current 2026-04-17T11:53:41Z review handoff snapshot so the support packet matches shared L0 truth without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S1-011-SIDECAR-ACCEPTANCE "GAP-P2S1-011 acceptance packet ready: machine truth still blocks the parent on GAP-P2S1-009 and GAP-P2S1-010, the packet now reflects the 11:31:07Z handoff, the 11:45:56Z and 11:49:29Z review snapshots with their pending reviewer handoffs, treats the 11:51:06Z reopen plus 11:51:38Z in-progress owner state as intermediate churn, and lands on the current 11:53:41Z review handoff snapshot accurately, it correctly separates tenant-header harness support from actual cross-tenant assertion coverage, and the support material stays within sidecar scope."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-011-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency drift / overclaimed multi-tenant evidence / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex2`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done GAP-P2S1-011-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-011 at support/sidecars/GAP-P2S1-011/GAP-P2S1-011-SIDECAR-ACCEPTANCE.md. The packet preserves the 009/010 dependency freeze, the current single-tenant test baseline, and the reviewer handoff path without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17 — 初版建立：依共享 machine truth、planning split rationale 與 repo 掃描，整理 `GAP-P2S1-011` 的 acceptance checklist、dependency map、單租戶測試基線、以及 reviewer handoff 指引。
- 2026-04-17 — 第二次修訂：補上 `2026-04-17T11:31:07Z` owner handoff、`2026-04-17T11:32:49Z` reviewer reopen、`2026-04-17T11:33:42Z` review snapshot、與 `2026-04-17T11:37:47Z` second reopen，並在 Section 2 明確拆分 `ai-status.json` 與 `current-work.md` 的不同時間點快照，避免把 sidecar 狀態誤寫成單一固定值。
- 2026-04-17 — 第三次修訂：header/status 與 Section 2 改為同時承認 `2026-04-17T11:39:39Z` 的第三次 handoff / review-ready snapshot，以及 `2026-04-17T11:41:45Z` latest reopen，讓 packet 不再停留在 pre-`11:39:39Z` 的狀態描述。
- 2026-04-17 — 第四次修訂：再同步到 reviewer 最新 reopen 所要求的 `2026-04-17T11:45:56Z` review snapshot 與 pending `Qwen -> Codex` review handoff，並把 current machine truth 更新為 `2026-04-17T11:47:37Z` reopen 後的 `in_progress` 狀態。
- 2026-04-17 — 第五次修訂：補上 reviewer 在 `2026-04-17T11:51:06Z` reopen 要求的 `2026-04-17T11:49:29Z` newer review snapshot 與 pending `Codex2 -> Codex` handoff，並將 current machine truth 前推到 `2026-04-17T11:51:38Z` 的 `in_progress` owner state，同時寫明 `11:51:13Z` 到 `11:51:43Z` 的 availability-driven reassignment churn。
- 2026-04-17 — 第六次修訂：再前推到 `2026-04-17T11:53:41Z` 的 current `review` snapshot，明確把 `11:51:38Z` 改寫成中間的 reopen/in-progress churn，並補記 `11:53:43Z` review-ready dispatch，讓 reviewer handoff 與最新 shared truth 完全對齊。
