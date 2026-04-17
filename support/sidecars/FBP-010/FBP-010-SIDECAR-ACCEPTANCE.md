# FBP-010 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-010` — Callcenter / complaint / dispatch-trace operator completion  
**Current Owner:** `Codex`  
**Assigned Reviewer:** `Claude`  
**Parent Reviewer At Closeout:** `Claude`  
**Last Revised:** `2026-04-16 (UTC)`  
**Status:** `FINALIZED SUPPORT ARTIFACT — parent FBP-010 is done; sidecar closes with NO_COMMIT_REQUIRED=1`

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence inventory、reviewer / owner handoff 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改，或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-010` 在 `ai-status.json` 中為 `done`，Owner=`Codex`，Reviewer=`Claude`，`depends_on=["FBP-009"]`。
  - 前置依賴 `FBP-009` 已為 `done`，commit=`71d9fa8`。
  - 正式 closeout commit 為 `1d5ed4f689004ad8c1071c28d8f4e885fc9bab4f`。
  - `acceptance` 欄位只有以下三條 machine truth：
    - `callcenter、complaint、dispatch trace 流程可端到端執行並保有 audit`
    - `hotline topology 被正確折入 operator completion family，不需要另起一個獨立 app 才能完成 Phase 1`
    - `CTI / recording / case timeline 的邊界與 fallback 規則明確`
- 本 sidecar `FBP-010-SIDECAR-ACCEPTANCE` 在 `ai-status.json` 中為 `review_approved`，Owner=`Codex`，Reviewer=`Claude`。
  - `2026-04-16T01:03:14Z` reviewer 訊息已確認：packet 完整表達 PRD `§9.1.4-§9.1.5` 與 Service Contracts `§3.9-§3.10` breadth，dispatch-trace auth guidance 正確對應 `owned:read` / `dispatch:read`，且 artifact 維持 support-only。
  - 此 helper 僅為 support artifact；owner closeout 必須使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。
- 共享 handoff / activity truth 也保留了這份 packet 的修訂與 reviewer 轉派鏈：
  1. `2026-04-15T19:10:41Z` — Codex `reopen`：指出 AC 對 PRD / service-contract breadth 寫得過窄，且 dispatch-trace auth guidance 錯用了不存在的 `orders:read` scope。
  2. 之後的 owner 修訂 handoff 明確把 ETA reply、call-order binding、callback queue、call-to-complaint transfer、assignee / export-ready complaint handling 與 hotline topology 納回 acceptance framing。
  3. sidecar reviewer 經歷 `Gemini -> Qwen` 自動改派與 `Qwen -> Claude` availability-first 改派後，最終由 `Claude` 完成核准。
  4. `2026-04-15T23:22:43Z` — 父任務 `FBP-010` 已先完成 `done` closeout，鎖定 commit `1d5ed4f`。
  5. `2026-04-16T01:03:14Z` — Claude 對本 sidecar 給出 `review_approved`，確認修訂後 packet 與 parent closeout 一致。

**本 sidecar 性質：** 這是已完成 parent task 的 frozen acceptance companion。以下 §3-§6 保留的是 reopen 後凍結的 acceptance framing 與 gap map；shared truth 現在已記錄父任務 `FBP-010` 滿足這些檢核並以 commit `1d5ed4f` 收尾。

---

## 3) FBP-010 父任務驗收標準 (Parent Acceptance Criteria)

以下 6 項不是新增 machine-truth acceptance；它們是 sidecar 在 reopen 後用來展開與驗證 `FBP-010.acceptance` 三條 machine-truth 的 reviewer-approved amplification。

### AC-1 — Callcenter / CTI operator flow 完整，符合 PRD `§9.1.4`

**Owner 執行時需滿足：**

- [ ] **Call intake / monitor surface 完整**（`apps/ops-console-web/app/callcenter/page.tsx` 或等價 route）：
  - 顯示來電隊列或可操作的 call session list / detail，不只是唯讀表格。
  - Session detail 至少可見 `callId`、`callType`、`callerPhone`、`agentId`、`status`、`recordingId`、`linkedOrderId`、`linkedCaseNo`、`flags`、`startedAt` / `endedAt`。
- [ ] **Agent identity announcement 不可被靜默省略**：
  - PRD 必填資料明示 `agent_identity_announced`。
  - 若現有共享 contracts 不足，需補最小化 typed field / flag / audit signal，讓 owner 能證明客服員識別播報已完成，而不是只在 UI 文案中假設。
- [ ] **Session lifecycle 完整**：
  - Open session：`POST /api/callcenter/sessions`（`OpenCallSessionCommand`）
  - Get session：`GET /api/callcenter/sessions/:callId`
  - Close session：`POST /api/callcenter/sessions/:callId/close`
  - Attach recording callback：`POST /api/callcenter/sessions/:callId/recording-callback`
- [ ] **可從通話建立 phone booking，且保持錄音 / 訂單追溯**：
  - 呼叫 `POST /api/call-center/orders`（既有 `CreateCallCenterOrderCommand` surface）。
  - 建立後的 order 必須可追到 `call_id`、`agent_id`，以及 `recording_id` 或 `recording_pending` 狀態，對齊 acceptance scenario `SC-003` / `SC-004`。
- [ ] **可回覆 ETA 與查看派遣結果**：
  - Callcenter console 必須能讀到 linked order 的 `etaSnapshot` / dispatch outcome。
  - 可重用 `GET /api/orders/:orderId` 與現有 dispatch read surfaces；若不足，需補薄層 facade，但不得把 ETA 要求留成口頭流程。
- [ ] **Callback queue 不能缺席**：
  - Service Contracts `§3.9` 已列 `create_callback_task` / `list_callbacks` 為主要 command / query。
  - FBP-010 若現況無 route / contract / api-client surface，需補最小化 callback-task flow，使未即時完成的通話能落成 callback task。
- [ ] **Complaint 類來電可直接轉正式 complaint case**：
  - Callcenter 端需有 transfer / create-case-from-call 動作。
  - 轉案件後需保留 `callId`，並在有 `orderId` 時同步保留 order 關聯。
- [ ] 所有 UI 操作在 error 時顯示明確錯誤訊息（不可 silent fail）。

### AC-2 — Complaint hotline / case management 完整，符合 PRD `§9.1.5` 與 Service Contracts `§3.10`

**Owner 執行時需滿足：**

- [ ] **Complaint hotline intake 產生正式 complaint case，而非 incident-only handling**：
  - 對齊 gherkin `SC-027`。
  - 建案時需建立 `case_no`，並在可得時關聯 `relatedCallId` 與 `relatedOrderId`。
  - SLA 必須依 complaint category 設定。
- [ ] **Case list / detail / timeline 可供 operator 真正辦案**（`apps/ops-console-web/app/complaints/page.tsx` 或等價 route）：
  - List 至少顯示 `caseNo`、`category`、`severity`、`status`、`slaBreach`、`createdAt`。
  - 提供 category / severity / status 篩選；若採 client-side filter，需在 handoff / evidence 明講；若採 server-side，需補 controller query params。
  - 可查看 case detail 與 timeline：`GET /api/complaints/:caseNo`、`GET /api/complaints/:caseNo/timeline`。
- [ ] **Assignee / investigation handling 必須顯式存在**：
  - PRD `§9.1.5` 要求「指派處理人」；Service Contracts `§3.10` 列 `assign_case`、`add_case_note`、`request_external_reply`。
  - 若現有 complaint contract / API 未提供，FBP-010 必須補最小化 API + client + UI surface，不能把 assignment 留成人工口頭流程。
- [ ] **Case lifecycle 操作完整**：
  - Resolve：`POST /api/complaints/:caseNo/resolve`
  - Reopen：`POST /api/complaints/:caseNo/reopen`
  - Close：`POST /api/complaints/:caseNo/close`
  - SLA breach mark：`POST /api/complaints/:caseNo/sla-breach`
  - Reopen 後保留原 case number 與 timeline history，對齊 gherkin `SC-028`。
- [ ] **Export-ready closeout 不可缺席**：
  - PRD `§9.1.5` 明示「關閉案件並輸出查核資料」；Service Contracts `§3.10` 明示 `export-ready complaint detail` / `get_case_export_view`。
  - FBP-010 完成時，需有可被 reviewer 指認的 export-ready closeout surface：可為 dedicated export view endpoint、download artifact，或明確的 audit/export read model。
- [ ] 所有 UI 操作在 error 時顯示明確錯誤訊息（不可 silent fail）。

### AC-3 — Dispatch trace 可稽核，ops 可查詢 per-order audit trail

**Owner 執行時需滿足：**

- [ ] **Dispatch trace query surface 存在**：
  - 補齊 API query endpoint，回傳 `DispatchTraceLogRecord[]`。
  - 可實作為 `GET /api/orders/:orderId/dispatch-trace`，或等價的 dispatch-owned route，但需與 auth route-prefix semantics 對齊。
  - `DispatchTraceLogRecord` 已存在於 `packages/contracts/src/index.ts`；若欄位不足才擴充。
- [ ] **api-client 暴露 typed read method**：
  - 例如 `listDispatchTraceLogs(orderId: string)` 或等價命名。
- [ ] **Ops UI 有明確 trace 入口**：
  - 可在 dispatch page、dispatch job detail、callcenter linked-order panel，或 complaint linked-order panel 內查詢，不可只停留在 API 可呼叫。
- [ ] **Auth guidance 正確，不再引用不存在的 `orders:read`**：
  - 若 route 前綴在 `orders/...`，則應沿用 `owned:read`。
  - 若 route 前綴在 `dispatch/...`，則應沿用 `dispatch:read`。

### AC-4 — Complaint hotline topology 必須被明確落地，而非留待口頭解釋

**Owner 執行時需滿足：**

- [ ] **Hotline topology 需明確決策並可在交付物中指認**：
  - PRD `§9.1.5` 已明示 `Complaint Hotline Console`，因此「hotline topology 尚不確定」不是可接受 closeout。
  - 可接受的實作方式包括：
    - dedicated complaint-hotline route / page；或
    - callcenter console 中有清楚分段的 complaint-hotline mode。
- [ ] **Topology 必須把 callcenter 與 complaint service 的交接責任說清楚**：
  - call intake / CTI metadata 屬 `Callcenter Service`
  - case lifecycle / SLA / assignee / export closeout 屬 `Complaint Service`
  - 不得讓 hotline call 留在 incident-only、general inquiry、或未落 case 的模糊狀態。
- [ ] **Handoff / closeout 需記錄 topology 決策**：
  - 在 parent task 的 `next` 或 reviewer handoff 中，明示 hotline 是獨立 console 還是 callcenter complaint mode，避免 reviewer 需自行猜測。

### AC-5 — Shared client / contract parity 補齊，TypeScript gates 全過

**Owner 執行時需滿足：**

- [ ] `packages/api-client/src/index.ts` 至少補齊以下缺口或等價 typed surface：
  - `openCallSession(command: OpenCallSessionCommand)`
  - `attachCallRecording(callId, command: AttachCallRecordingCommand)`
  - `closeCallSession(callId, command?: CloseCallSessionCommand)`，使 client signature 與 controller command shape 對齊
  - `getComplaintTimeline(caseNo)`
  - `resolveComplaint(caseNo, command)`
  - `reopenComplaint(caseNo, command)`
  - `closeComplaint(caseNo, command)`
  - `markComplaintSlaBreach(caseNo)`
  - dispatch-trace query method
  - 若 owner 新增 callback-task / complaint-assignment / export-view API，需同 turn 補齊對應 client methods
- [ ] `packages/contracts/src/index.ts` 若要滿足 PRD / Service Contracts breadth，可能需要最小化新增：
  - `agent_identity_announced` 對應 signal
  - `callback_task` typed model / commands
  - complaint assignee / note / export-view typed model
- [ ] 下列 typecheck 必須全部通過：
  - `pnpm --filter @drts/ops-console-web typecheck`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api-client typecheck`

### AC-6 — RBAC / audit 與現有 auth.policy 模式一致

**Owner 執行時需滿足：**

- [ ] Callcenter read/write operations 分別沿用 `callcenter:read` / `callcenter:write`。
- [ ] Complaint read/write operations 分別沿用 `complaints:read` / `complaints:write`。
- [ ] Dispatch-trace read endpoint 依 route prefix 套用 `owned:read` 或 `dispatch:read`；不得自創 `orders:read`。
- [ ] 重要 write 操作需有 audit：
  - call session open / close / attach recording
  - phone booking creation from call
  - callback task creation（若實作）
  - call-to-case transfer（若實作）
  - complaint create / assign / resolve / reopen / close / SLA breach
- [ ] 不得引入 `@Roles(...)` 或平行 guard 體系；沿用 `BootstrapAuthGuard` + `auth.policy.ts` 模式。

---

## 4) Historical Gap Analysis At Reopen Time (Informative)

下表保留的是 reopen 當下的 gap map，用來說明為何 acceptance packet 需要重寫。不要把它讀成目前 defect list；shared truth 現在已明確記錄 parent `FBP-010` 已完成並關閉這些缺口。

| #   | Gap                                                                                                                                                                                  | Location                                                                                                                            | Priority |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G-1 | Callcenter UI 目前僅有唯讀列表，缺 call intake detail、open / close、recording callback、phone booking、ETA / dispatch-result readback、callback queue、call-to-complaint transfer   | `apps/ops-console-web/app/callcenter/page.tsx`                                                                                      | High     |
| G-2 | Complaint UI 目前僅有唯讀列表，缺 hotline intake linkage、assignee handling、timeline actioning、note / external-reply 類辦案操作、export-ready closeout surface                     | `apps/ops-console-web/app/complaints/page.tsx`                                                                                      | High     |
| G-3 | Shared contracts 只覆蓋基本 `CallSessionRecord` / `ComplaintCaseRecord`，尚未 typed 表達 `agent_identity_announced`、`callback_task`、complaint assignee / note / export-view        | `packages/contracts/src/index.ts`                                                                                                   | High     |
| G-4 | api-client 缺 open-call / attach-recording / complaint timeline / complaint lifecycle methods 與 dispatch-trace read method；`closeCallSession` 目前也未接收 controller command body | `packages/api-client/src/index.ts`                                                                                                  | High     |
| G-5 | PRD 已定義 `Complaint Hotline Console`，但 codebase 尚無 explicit hotline topology；目前僅有 generic callcenter page + complaint page，交接責任不明                                  | `phase1_prd_detailed_v1.md §9.1.5`, `apps/ops-console-web/app/callcenter/`, `apps/ops-console-web/app/complaints/`                  | High     |
| G-6 | Dispatch trace 已在 owned-mobility service / repository 內持續寫入，但沒有公開 read endpoint，也沒有 ops UI trace panel                                                              | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | High     |
| G-7 | Complaint API 目前沒有 assign / note / export-view routes；Callcenter API 目前沒有 callback-task / create-case-from-call routes                                                      | `apps/api/src/modules/complaint/complaint.controller.ts`, `apps/api/src/modules/callcenter/callcenter.controller.ts`                | Medium   |

> **提醒：** `packages/api-client/src/index.ts` 已經有 `createCallCenterOrder()`；FBP-010 不應把已存在 surface 誤判為 gap，應集中補齊真正缺失的 callcenter / complaint / trace methods。

---

## 5) Dependency Map (Normative Truth Sources)

### 上游脈絡基線（Informative — 非正式前置依賴）

> `ai-status.json` 目前只有 `FBP-009` 是 FBP-010 的正式 `depends_on`。  
> 下表列出的是實作時可依賴的 baseline，不代表額外 machine-enforced dependencies。

| Dep     | Task                                         | Status                    | Notes                                                     |
| ------- | -------------------------------------------- | ------------------------- | --------------------------------------------------------- |
| D-CTX-1 | `FBP-009` Ops / Host / OpCo / ROC completion | `done` — commit `71d9fa8` | 正式 depends_on；提供 ops surface baseline                |
| D-CTX-2 | `FBP-008` Platform Admin breadth             | `done` — commit `61547cc` | 同一 API / auth / ops runtime 基線                        |
| D-CTX-3 | `WB-002` Dispatch console                    | `done`                    | 提供 dispatch candidate / assignment / queue 基礎 surface |
| D-CTX-4 | `WB-003` Incidents / maintenance breadth     | `done`                    | incident 與 complaint 邊界已存在，不應被重新混用          |

### 下游脈絡（Informative）

| Dep    | Task                                                | Status | Notes                                                                       |
| ------ | --------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| D-DN-1 | `FBP-012` Public Info / Placard / Regulatory report | `todo` | 不直接 depends on FBP-010，但 Wave 2 closeout 需一起完成                    |
| D-DN-2 | `FBP-013` Staging / smoke / UAT evidence closeout   | `todo` | FBP-010 的 operator flows 與 trace / complaint evidence 應納入 UAT closeout |

### L1 / L2 Truth Sources

| #   | Document                                                                                                                                | Role                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| C-1 | `phase1_prd_detailed_v1.md` `§9.1.4-§9.1.5`                                                                                             | Callcenter / CTI console 與 Complaint Hotline Console 的 product truth                        |
| C-2 | `phase1_service_contracts_v1.md` `§3.9-§3.10`                                                                                           | Callcenter / Complaint service 責任、commands、queries、source-of-truth                       |
| C-3 | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` `SC-003`, `SC-004`, `SC-027`, `SC-028`, `SC-029` | Phone booking / recording linkage、complaint hotline、reopen、SLA breach acceptance scenarios |
| C-4 | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`                                                               | order / complaint / dispatch artifacts 的 decision baseline                                   |
| C-5 | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`                                   | Engineering conventions / reviewer expectations                                               |

### Artifact Map（FBP-010 主要作用域）

| Surface                                 | Path                                                                                                                                                                                                    | Notes                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Callcenter UI                           | `apps/ops-console-web/app/callcenter/page.tsx`                                                                                                                                                          | 父任務 review note 已確認為 fully operational surface：涵蓋 open / announce-identity / close、ETA reply、order linkage、recording callback、callback handling、transfer-to-complaint 與 dispatch trace |
| Complaints UI                           | `apps/ops-console-web/app/complaints/page.tsx`                                                                                                                                                          | 父任務 review note 已確認為 fully operational hotline-linked case management surface：涵蓋 list / detail / timeline / assign / notes / resolve / close / reopen / export / SLA breach                  |
| Owned order / dispatch read surface     | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`                                                                                                                                      | parent closeout 明確記錄 `GET /api/orders/:orderId/dispatch-trace` 為 per-order audit trail query surface                                                                                              |
| Callcenter API                          | `apps/api/src/modules/callcenter/`                                                                                                                                                                      | parent review note 已確認 controller 覆蓋 open / announce-identity / close session、ETA reply、link-order、attach-recording-callback、callback create/complete、hotline 轉投訴                         |
| Complaint API                           | `apps/api/src/modules/complaint/`                                                                                                                                                                       | parent review note 已確認 controller 覆蓋 create / list / get / assign / notes / resolve / close / reopen / export / sla-breach，且 timeline 正確追蹤狀態變更                                          |
| Dispatch trace persistence + read model | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`, `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | trace logs 既有 persistence 被正式折入 accepted read surface；ops UI 可消費                                                                                                                            |
| Shared client                           | `packages/api-client/src/index.ts`                                                                                                                                                                      | parent review note 已確認完整暴露 callcenter / complaint typed methods，並涵蓋 dispatch-trace read support                                                                                             |
| Shared contracts                        | `packages/contracts/src/index.ts`                                                                                                                                                                       | typed call session / complaint / dispatch trace primitives 對 accepted Phase 1 closure 已足夠；僅最小化補齊 PRD / service-contract 所需概念                                                            |
| Auth policy                             | `apps/api/src/common/auth/auth.policy.ts`                                                                                                                                                               | reviewer-approved truth：callcenter `read/write`、complaints `read/write`，dispatch-trace 依 route prefix 落在 `owned:read` 或 `dispatch:read`                                                         |

---

## 6) Sidecar 本身驗收標準 (Sidecar AC)

### AC-S1 — 僅建立 / 更新 support artifact，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-010/FBP-010-SIDECAR-ACCEPTANCE.md`。
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / governance 檔案。
- [x] 未修改 `apps/`、`packages/`、`infra/`、`tests/` 或 `docs/` 中的主線實作。

### AC-S2 — Packet 對齊 reopen feedback 與最終 closeout chain

- [x] 已以 `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl` 為協作真相更新 owner / reviewer / status / parent commit metadata。
- [x] AC 保留並對齊 PRD `§9.1.4-§9.1.5` 與 Service Contracts `§3.9-§3.10` 的 reviewer-approved breadth。
- [x] Dispatch-trace auth guidance 已修正為 `owned:read` / `dispatch:read` 語義，不再引用不存在的 `orders:read`。
- [x] packet 現在明確保留 parent `FBP-010 done@1d5ed4f`、sidecar `review_approved`、以及 `NO_COMMIT_REQUIRED=1` 的 closeout 形狀。

### AC-S3 — Packet 包含可執行 handoff / review / closeout 指令

- [x] §8 提供 owner -> reviewer handoff 指令。
- [x] §9 提供 reviewer approve / reopen 指令。
- [x] §10 提供 owner closeout 指令。

---

## 7) Evidence Inventory

| #    | Evidence Item                        | Location                                             | Notes                                                                                                                        |
| ---- | ------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state            | `ai-status.json` -> `FBP-010`                        | status=`done`, owner=`Codex`, reviewer=`Claude`, depends_on=`["FBP-009"]`, commit=`1d5ed4f689004ad8c1071c28d8f4e885fc9bab4f` |
| E-2  | Parent task machine-truth acceptance | `ai-status.json` -> `FBP-010.acceptance`             | 只有 3 條 canonical acceptance；本 packet 的 AC-1~AC-6 是 reviewer-approved amplification                                    |
| E-3  | Parent reviewer verdict              | `current-work.md` / `ai-status.json.review_notes_zh` | Claude 明確確認 callcenter / complaint / dispatch-trace breadth、RBAC、typecheck 與 9 個 unit tests 全數通過                 |
| E-4  | Parent completion evidence           | `current-work.md` completion table                   | `1d5ed4f` / `feat(FBP-010): complete callcenter complaint workflows`                                                         |
| E-5  | Sidecar task machine state           | `ai-status.json` -> `FBP-010-SIDECAR-ACCEPTANCE`     | status=`review_approved`, owner=`Codex`, reviewer=`Claude`                                                                   |
| E-6  | Sidecar reviewer approval            | `current-work.md` / `ai-status.json.next`            | reviewer message明確確認 PRD / service-contract breadth、正確 auth guidance、support-only scope，且 parent 已完成            |
| E-7  | Reopen feedback                      | `ai-activity-log.jsonl` / `current-work.md`          | reopen 指出 AC under-spec 與不存在的 `orders:read` scope 問題                                                                |
| E-8  | Reviewer reassignment chain          | `ai-status.json.handoffs`                            | 保留 `Gemini -> Qwen -> Claude` 與 availability-first `Qwen -> Claude` reviewer settlement                                   |
| E-9  | PRD callcenter requirements          | `phase1_prd_detailed_v1.md` `§9.1.4`                 | 包含 ETA、call-order binding、callback task、transfer to complaint                                                           |
| E-10 | PRD complaint hotline requirements   | `phase1_prd_detailed_v1.md` `§9.1.5`                 | 包含 case no、order linkage、assignee、SLA、history、export closeout                                                         |
| E-11 | Service-contract breadth             | `phase1_service_contracts_v1.md` `§3.9-§3.10`        | 定義 callback queue、create_case_from_call、assign_case、add_case_note、get_case_export_view                                 |
| E-12 | Companion review packet              | `support/sidecars/FBP-010/FBP-010-SIDECAR-REVIEW.md` | path-scoped review evidence companion，不改 machine truth                                                                    |

---

## 8) Handoff Commands (Historical / Reproducible)

**Owner（Codex）-> Reviewer（Claude）**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-010-SIDECAR-ACCEPTANCE Claude "Revised FBP-010 acceptance packet ready in support/sidecars/FBP-010/FBP-010-SIDECAR-ACCEPTANCE.md. It preserves the amplified acceptance framing for callcenter, complaint, dispatch-trace, and hotline topology; dispatch-trace auth guidance is corrected to owned:read or dispatch:read per route prefix; support artifact only."
```

---

## 9) Reviewer Actions (Historical / Reproducible)

審查重點：

1. AC-1 是否完整覆蓋 PRD `§9.1.4` 的 ETA、call-order binding、callback task、complaint transfer，而不是只覆蓋 session open/close。
2. AC-2 是否完整覆蓋 PRD `§9.1.5` 與 Service Contracts `§3.10` 的 assignee、history、export-ready closeout，而不是只覆蓋 resolve / reopen / SLA breach。
3. AC-3 的 dispatch-trace read guidance 是否與 `auth.policy.ts` 一致，且不再引用不存在的 `orders:read`。
4. AC-4 是否把 hotline topology 從「可選 clarification」提升為「必須留下一個 concrete topology decision」。
5. Gap analysis 是否正確區分現有 baseline、真實缺口、與已存在的 `createCallCenterOrder()` surface。
6. 本 packet 是否確實維持 support-only 範圍，未修改 canonical truth 或 runtime 實作。

**已記錄的核准用語：**

> `FBP-010 acceptance packet approved: PRD and service-contract breadth fully represented, dispatch-trace auth guidance correct (owned:read/dispatch:read), hotline topology required as concrete decision, and packet is support-only. Parent FBP-010 completed at commit 1d5ed4f with all 6 AC satisfied.`

**若需重開用語：**

> `packet needs revision: [specify exact remaining gap in AC framing, auth guidance, artifact map, or scope discipline]`

**Reviewer（Claude）-> review_approved：**

```bash
AI_NAME=Claude python3 scripts/ai_status.py approve FBP-010-SIDECAR-ACCEPTANCE "FBP-010 acceptance packet approved: PRD and service-contract breadth fully represented, dispatch-trace auth guidance correct (owned:read/dispatch:read), hotline topology required as concrete decision, and packet is support-only. Parent FBP-010 completed at commit 1d5ed4f with all 6 AC satisfied."
```

**Reviewer（Claude）-> reopen：**

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen FBP-010-SIDECAR-ACCEPTANCE "packet needs revision: [specify exact remaining gap in AC framing, auth guidance, artifact map, or scope discipline]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 current owner（Codex）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done FBP-010-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-010 acceptance packet and dependency map are ready in support/sidecars/FBP-010/ for parent closeout traceability and downstream rollout-evidence consumers."
```

---

## 11) Notes for Downstream Consumers

1. **這份 packet 不是 PRD 替代品。** 真正的 product truth 仍是 `phase1_prd_detailed_v1.md` `§9.1.4-§9.1.5` 與 `phase1_service_contracts_v1.md` `§3.9-§3.10`。
2. **Hotline topology 在這份 packet 裡被凍結成「必須有 concrete decision」。** parent closeout 已接受「折入 operator completion family」的做法，而不是另開獨立 app。
3. **Dispatch-trace auth guidance 已固定。**
   - `GET /api/orders/:orderId/dispatch-trace` -> `owned:read`
   - dispatch-owned route -> `dispatch:read`
   - 不應再引用不存在的 `orders:read`
4. **`createCallCenterOrder()` 本來就存在。** 這份 packet 的價值是把真缺口聚焦在 call session lifecycle、callback queue、complaint lifecycle / export、dispatch trace 與 topology clarity，而不是重複 invent 已有 surface。
5. **Complaint export-ready closeout 不等於接手 FBP-011 的財務主流程。** finance / reimbursement / filing 仍由 `FBP-011` family 保持 authority。
6. **auth / audit 模式保持單一路徑。** 本 packet 明確要求沿用 `BootstrapAuthGuard` + `auth.policy.ts` + 既有 audit-notification 機制，不引入第二套 guard / policy style。

---

## 12) Change Log

- 2026-04-15 — Claude 建立初版 acceptance packet。
- 2026-04-15 — Codex 依 reopen feedback 全面修訂：補齊 PRD callcenter / complaint breadth、將 hotline topology 改為必須明確落地、修正 dispatch-trace auth guidance，並同步更新 owner / reviewer / handoff metadata。
- 2026-04-16 — Codex 依 shared truth 將 packet 同步到 finalized state：父任務 `FBP-010` 已於 commit `1d5ed4f` 收尾、sidecar 已由 Claude 核准，並保留 no-commit owner closeout 指令與 reviewer reassignment chain。
