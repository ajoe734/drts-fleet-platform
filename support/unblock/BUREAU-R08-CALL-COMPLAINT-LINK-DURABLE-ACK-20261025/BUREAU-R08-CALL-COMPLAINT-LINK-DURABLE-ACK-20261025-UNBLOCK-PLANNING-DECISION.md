# R08 電話申訴通話／案件索引：planning-decision triage

Task: `BUREAU-R08-CALL-COMPLAINT-LINK-DURABLE-ACK-20261025-UNBLOCK-PLANNING-DECISION`

Parent: `BUREAU-R08-CALL-COMPLAINT-LINK-DURABLE-ACK-20261025`

Owner: Claude2；Reviewer: Claude。審查時間 2026-10-29 UTC。Helper kind：
`planning_decision`（由 `chairman-blocked-task-triage` 自動建立）。純文件交付。

## 核心結論

**Parent 沒有缺失的產品／合約決策。** 本 helper 判定為誤判類型
（ineligible for planning routing）：parent 的卡點不是規劃、規格、契約、
scope 或跨團隊決策，而是單一 runtime 驗收證據缺口
`bureau_r08_existing_complaint_call_link_same_release_hosted`（三個
required_acceptance key 中唯一尚未滿足者）。

該缺口需要唯一授權的 hosted operator（目前 `waiting_for: Codex`），在與
merge_sha `a6b66ccb1139bfefd1d1a5f210fb735e2d9d6424` 同版的實際部署上，沿既有
Callcenter 表單／`POST /api/callcenter/sessions/:callId/transfer-to-complaint`
完成一次真實的 transfer-to-complaint hosted 驗證：取得
callId／caseNo／recordingId／linkedOrderId／callbackTask.linkedCaseNo，並證明
refresh 後同一組資料可讀回、同 intent 重送不會產生重複案件。

本 helper 不發明任何產品決策、不修改任何 scope、不新增或刪減任何驗收項，
也不改動 parent 的 write scopes、候選 SHA、generation、review 或 CI 身分。

## 證據表

以下事實由本機 Claude2 session 透過 orchestrator CLI（`ai-status.sh show`）
於 2026-10-29 逐項查證後提供給本 helper；本 helper 在雲端執行，無看板存取權，
未重新查詢，僅據此整理。

### Parent 現況（last_update `2026-10-29T17:20:41Z`）

| 項目                                                                | 值                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status / owner / reviewer / waiting                                 | `blocked` / Gemini2 / Gemini / Codex                                                                                    |
| Candidate SHA                                                       | `4bbe071e7a93e58817bc374ba3504bafeedbcb3c`                                                                              |
| Candidate branch                                                    | `gemini2/bureau-r08-call-complaint-link-durable-ack-20261025-r2`                                                        |
| Generation                                                          | `48e2035e2a70414abf238b4daeaceb4f`                                                                                      |
| Parent integration                                                  | [PR #3014](https://github.com/ajoe734/drts-fleet-platform/pull/3014)，merged `a6b66ccb1139bfefd1d1a5f210fb735e2d9d6424` |
| CI status                                                           | `success`                                                                                                               |
| `bureau_r08_existing_complaint_call_link_durable_source`            | 已滿足（R08-LINK-CACHE 與 R08-LINK-FALSE-ACK 修正；84 筆單元測試、V0133 PostgreSQL 整合測試 4/4 PASS）                  |
| `bureau_r08_existing_complaint_call_link_exact_sha_review_ci_merge` | 已滿足（candidate = reviewed = ci SHA；Gemini 2026-10-25T17:00:48Z 同 SHA approve；兩輪 exact-SHA CI 綠；已 merge）     |
| `bureau_r08_existing_complaint_call_link_same_release_hosted`       | **未滿足**——唯一剩餘缺口                                                                                                |

Parent `next` 摘要（2026-10-29T17:20:41Z，Root/Codex 撰寫）：原 deploy-dev
workflow 已沿唯一既有路徑派出 run `40918399619` 以更新 shared dev，但該 run 仍在
build/queued，尚不能把它當成新的 serving 版本，也不能據此宣稱本 R08 hosted PASS。
既有共用驗收設施（固定 FULL spec、C043、OpsShell、general16、shared_bureau）經
唯讀稽核皆未涵蓋 R08，不能冒充第三個 key 的 PASS。Root 仍在唯讀評估能否沿原
FULL caller／同 session／既有 UI 與 finalizer 補上 R08 coverage（不新增 runner、
job、input 或部署路徑）；目前沒有 Source 變更或真實寫入，既有兩個 key 與 source
credits、blocked 狀態與角色全部保留。

### 相依任務（全部 done 且已歸檔）

| Task ID                                          | Status         | Candidate                                  | Protected merge                            | 性質                               |
| ------------------------------------------------ | -------------- | ------------------------------------------ | ------------------------------------------ | ---------------------------------- |
| `CALLCENTER-PHONE-ORDER-DURABLE-FLOW-20261016`   | done（已歸檔） | `da68100c9712b57a0e2b32597d591b99648f61a3` | `155710faaf18598332d5aa0ecbe2c41a1761d360` | 電話訂單持久化流程；無未決驗收 key |
| `COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015` | done（已歸檔） | `c228003b0e1e67f74322d091e3d06c3f73b2e9e5` | `9883d8381a7b690c537accc524d4c7cbe3ad3b98` | 申訴 canonical 生命週期與回執      |

兩者在 `ai-status.sh show` 已查不到（已轉入 archive），parent 的
acceptance_evidence 亦記載其 source credits 予以保留；兩者皆未留下任何產品規格、
契約、scope 或跨團隊決策缺口。Candidate／merge SHA 引自同目錄的
`BUREAU-R08-CALL-COMPLAINT-LINK-DURABLE-ACK-20261025-UNBLOCK-MANUAL-UNBLOCK.md`。

### 為何會有這個 helper

Chairman blocked-task 自動 triage 依 parent 的 blocked 狀態建立了
`planning_decision` 類 helper，但 parent 的卡點類型實際上是 runtime 驗收證據，
不是規劃／決策。同目錄先前的 manual-unblock helper（Codex／Claude2，2026-10-27）
也已得出相同結論：parent 應維持 `blocked`、`waiting_for=Codex`，等待既有指定的
runtime operator，沒有新證實的 source 缺陷或未決產品決策。

## Record the decision

記錄的決定：**no product/contract decision required; routing closed as a no-op.**

- Decision：無需任何產品／合約決策。
- Scope cut：無。
- Parent 需要的明確 follow-up：無新增；沿用 parent 既有流程。

剩下唯一要做的事，是等待 parent 自己的既有流程走完：

1. 唯一授權的 hosted operator（目前 Codex）等部署 run `40918399619` 完成，確認
   serving 版本與 merge_sha `a6b66ccb1139bfefd1d1a5f210fb735e2d9d6424` 同版（或
   以其為祖先的同一 release）後，沿既有 Callcenter 表單／transfer-to-complaint API
   對一筆合法 call／recording／order／callback 執行真實轉案，取得上述識別碼，並驗證
   refresh 讀回與同 intent 重送（同 body、缺省 key、同 order）不產生重複案件。
2. 取得可採信的 runtime 證據後，由 Supervisor 用既有 `resume-blocked` →
   `reconcile-candidate` 流程，以原 parent candidate/generation/review/CI/merge
   身分把 parent 帶回驗收，再記錄
   `bureau_r08_existing_complaint_call_link_same_release_hosted`。
   不呼叫 parent `start` 或新的 `handoff`。

## 不寫入 parent 的聲明

本 helper **不對 parent task 做任何欄位寫入**：不 `note`、不 `assign`、不
`resume-blocked`。理由：parent 不是卡在缺決策，而是卡在 Root/Codex 自己仍在
積極處理、且剛在 2026-10-29T17:20:41Z 更新過的 runtime 證據缺口；用本 helper
覆寫 parent 的 `next`，只會以較舊或較籠統的敘述蓋掉 owner 當下更即時的進度。
先前其他 helper 反覆覆寫 parent 診斷、觸發 triage 自我循環，本 helper 刻意避免重演。

**但「本 helper 不主動寫入」不等於「merge 後 parent 不會被改寫」。** 依 R12 同類
helper 第二輪 reopen 已查證的機制（`bin/ai_status.py` 的
`transition_after_merge()` → `apply_unblock_parent_resolution()`），helper 的
candidate 一旦 merge，orchestrator 會自動解析 parent；若本 helper task 上沒有
`resolved_parent_*` 欄位，預設會把 parent 改成 `status=todo`、`next=` 泛用完成句、
清空 `waiting_for`，等同抹除 Codex 目前的 blocked／waiting 記錄。

因此 merge 前需要由具權限的 session（本 helper 的 reviewer 以其角色，或不帶
`ORCH_DISPATCH_ROLE`／`ORCH_RUN_ID` 的 Supervisor session）在**本 helper 自己身上**
設定：

- `resolved_parent_status`：`blocked`（runtime key 尚未滿足；與 R12 第三輪不同，
  本次沒有已完成的 hosted run 可支持 `in_progress`）
- `resolved_parent_waiting_for`：`Codex`
- `resolved_parent_next`：merge 前那一刻從
  `ai-status.sh show BUREAU-R08-CALL-COMPLAINT-LINK-DURABLE-ACK-20261025`
  即時讀到的 `next` 全文，逐字複製（不是本文件的摘要快照）

若在設定與 merge 之間部署 run `40918399619` 已完成且 hosted 驗證已取得，應改依
當時 parent 實況決定 `resolved_parent_*`，仍不由本 helper 核可 runtime key。
本 helper 的 owner dispatch 無法執行上述設定（dispatch guard 會拒絕 `assign`），
本文件只記錄所需的值。

## 引用 PR / SHA

| 參照                   | 值                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Parent candidate       | `4bbe071e7a93e58817bc374ba3504bafeedbcb3c`（generation `48e2035e2a70414abf238b4daeaceb4f`）                                           |
| Parent PR              | [#3014](https://github.com/ajoe734/drts-fleet-platform/pull/3014) → `a6b66ccb1139bfefd1d1a5f210fb735e2d9d6424`                        |
| Integration test CI    | GH run `40213661192` job `121230832071`（`int-cti-complaint-link-ack.test.ts`，4/4 PASS）                                             |
| Latest deploy-dev run  | workflow run `40918399619`（build/queued，尚未完成；不可作為 hosted PASS 證據）                                                       |
| Dependency: callcenter | `da68100c9712b57a0e2b32597d591b99648f61a3` → `155710faaf18598332d5aa0ecbe2c41a1761d360`                                               |
| Dependency: complaint  | `c228003b0e1e67f74322d091e3d06c3f73b2e9e5` → `9883d8381a7b690c537accc524d4c7cbe3ad3b98`                                               |
| R12 precedent (format) | `c5ac83eaaee29216a3fc9c620f014aaaa933456d`（`BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-UNBLOCK-PLANNING-DECISION`） |
