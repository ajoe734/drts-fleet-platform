# R12 existing owned report download: planning-decision triage

Task: `BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-UNBLOCK-PLANNING-DECISION`

Parent: `BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025`

Owner: Claude；Reviewer: Codex。審查時間 2026-10-28 UTC。Helper kind：
`planning_decision`（由 `chairman-blocked-task-triage` 自動建立）。純文件交付。

## 核心結論

**Parent 沒有缺失的產品／合約決策。** 本 helper 判定為誤判類型
（ineligible for planning routing）：parent 的卡點不是規劃、規格、契約、
scope 或跨團隊決策，而是單一技術性 runtime 驗收證據缺口
`same_release_actual_daily_preview_and_three_downloads`。

本 helper 不發明任何產品決策、不修改任何 scope、不新增或刪減任何驗收項，
也不改動 parent 的 write scopes、候選 SHA、generation、review 或 CI 身分。

## 證據表

以下事實由本機 Claude session 透過 orchestrator CLI（`ai-status.sh show`）
逐項查證後提供給本 helper；本 helper 在雲端執行，無看板存取權，未重新查詢，
僅據此整理。

### Parent 現況（last_update `2026-10-28T06:19:43Z`）

| 項目                                                    | 值                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status / owner / reviewer / waiting                     | `blocked` / Pi / Claude2 / Codex                                                                                        |
| Candidate SHA                                           | `27b7fb31d3777c5e986d54990b2f5a69f497635e`                                                                              |
| Generation                                              | `730b74df53d34e13ad995906f35295c2`                                                                                      |
| Parent integration                                      | [PR #3074](https://github.com/ajoe734/drts-fleet-platform/pull/3074)，merged `da7c5d8c9a405107ccac6a6320aa090479107e31` |
| `reviewed_existing_owned_flow_daily_report_coverage`    | 已滿足（Claude2 同 SHA approve、own CI success、PR #3074 merge）                                                        |
| `same_release_actual_daily_preview_and_three_downloads` | **未滿足**——唯一剩餘缺口                                                                                                |

Parent `next` 摘要：原 sole hosted operator 最新一次 FULL run（workflow run
`40640729762`，definition/runtime `40bdf7d15da3d1e81ba9aa2bac22f8cc96a12073`）
於 05:58:58 UTC 在 step18 失敗。該次 preview 與 CSV/XLSX/PDF 下載雖回
200/201，但逐筆核對後三份報表皆屬一筆 C1（unassigned→cancelled）訂單，
不是正常 main-completed 訂單，因此不能算滿足驗收。另一個無關的 route-failure
Source 缺陷已由獨立 helper 處理（見下表）。Owner Pi 持續在原任務上更新 `next`。

### 相依與相關任務（全部 done 且已 merge）

| Task ID                                                                              | Status | Owner / Reviewer | PR                                                                | Merge SHA                                  | 性質                                                                                            |
| ------------------------------------------------------------------------------------ | ------ | ---------------- | ----------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `DEPENDENCY-QS-1243452-REMEDIATION-20261027`                                         | done   | Pi / Codex       | [#3073](https://github.com/ajoe734/drts-fleet-platform/pull/3073) | `a086b02f94073b304c1ab9a075bce8c486b95657` | express/qs 安全性 patch 版本對齊；與產品決策無關                                                |
| `BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-UNBLOCK-MANUAL-UNBLOCK` | done   | Codex / Claude2  | [#3100](https://github.com/ajoe734/drts-fleet-platform/pull/3100) | `074c8ffc06a59fd94116c2388ad83b500ba80369` | 診斷卡點為 canonical orders 讀取撞到 1 MiB 上限（`bounded-response-exceeded`），非 API/契約缺失 |
| `BUREAU-R12-EXISTING-CANONICAL-ORDERS-BOUNDED-READ-20261028`                         | done   | Codex / Claude2  | [#3099](https://github.com/ajoe734/drts-fleet-platform/pull/3099) | `78a4c348a07deaf005014f30d772e21af56ba2c6` | 僅改 protocol 與其單元測試，為該既有讀取路徑開精確綁定的 8 MiB 例外；其餘維持 1 MiB             |
| `BUREAU-R12-EXISTING-OPS-EXCHANGE-FAILURE-ISOLATION-20261028`                        | done   | Codex / Claude2  | [#3107](https://github.com/ajoe734/drts-fleet-platform/pull/3107) | `8992293d0ceff8aa76a0789e582b670a521ac80f` | 無關 route-failure 的技術缺陷隔離/修復                                                          |

四者皆未涉及任何產品規格、契約、scope 或跨團隊決策。

### 為何會有這個 helper

Chairman blocked-task 自動 triage 依 parent 的 blocked 狀態建立了
`planning_decision` 類 helper，但 parent 的卡點類型實際上是 runtime 驗收證據，
不是規劃／決策。相關 triage 誤建 helper 的 orchestrator 修正見本機 commit
`8295d1f334553b98068a26c5c747330ec43ef02b`
（`ORCH-EXISTING-BLOCKED-TRIAGE-INELIGIBLE-HELPER-ACTION-20261028`）；本 helper
不修改 orchestrator 程式碼。

## Record the decision

記錄的決定：**no product/contract decision required; routing closed as a no-op.**

- Decision：無需任何產品／合約決策。
- Scope cut：無。
- Parent 需要的明確 follow-up：無新增；沿用 parent 既有流程。

剩下唯一要做的事，是等待 parent 自己的既有流程走完：

1. Owner Pi / reviewer Claude2 維持原任務；原本唯一授權的 sole hosted operator
   以既有 FULL workflow 再跑一次，取得一筆真正 main-completed（非 cancelled）
   訂單，完整跑完每日報表 preview、CSV/XLSX/PDF 三格式下載、provenance、custody
   與 owned cleanup。不重播舊 journal、不截斷 source orders、不放寬隱私保留規則。
2. 取得可採信的新 runtime 證據後，由 Supervisor 用既有 `resume-blocked` →
   `reconcile-candidate` 流程，以原 parent candidate/generation/review/CI/merge
   身分把 parent 帶回驗收，再記錄 `same_release_actual_daily_preview_and_three_downloads`。
   不呼叫 parent `start` 或新的 `handoff`。

上述步驟不需要本 helper 去推動 parent 的狀態機：parent 目前由其真正 owner Pi
主動、正常地維護中，不是無人處理的卡住狀態。

## Reopen 修正：取代原「不寫入 parent」的錯誤保證

**先前版本（candidate `c5ac83eaaee29216a3fc9c620f014aaaa933456d` /
generation `6363369aafaa47629b909f354be9060e`）的錯誤**：上一節聲稱「本 helper
不對 parent task 做任何欄位寫入」即可讓 parent 維持現狀。Reviewer Codex 於
`2026-10-28T15:00:19Z` reopen，指出這個保證不成立——parent 是否被寫入，不是由
本 helper「主動呼叫 `note`／`assign`」決定，而是由 orchestrator 在本 helper
**完成（merge）時自動觸發**的 unblock-parent 解析決定，與本 helper 寫不寫無關。

### 呼叫鏈與實際行為（本機已查證，release `orchestrator-8295d1f33455`）

| 項目           | 內容                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 觸發點         | `bin/ai_status.py:717-739` `transition_after_merge()`：helper 的 candidate 被 merge 後，CLI 會呼叫 `validate_completion_handoffs()`，再呼叫 `apply_unblock_parent_resolution()`（`:733-739`）。這一步是 merge 流程內建的，不是本 helper 選擇性呼叫的動作。                                                                                                                            |
| Resolve 邏輯   | `bin/ai_status.py:1156-1192` `unblock_parent_resolution_fields()`：`resume_status` 取 `task.get("resolved_parent_status")`，**缺省為 `"todo"`**（`:1173`）；`parent_message` 缺省為 `f"Unblock resolution complete via {task.get('id')}: {message}"`（`:1180`）；`parent_waiting_for` 缺省為空字串。本 helper 的 task 物件目前沒有任何 `resolved_parent_*` 欄位，三者都會落到缺省值。 |
| 寫入 parent    | `bin/ai_status.py:1201-1229` `apply_unblock_parent_resolution()`：`parent["status"] = resume_status`、`parent["next"] = parent_message`，且 `resume_status != "blocked"` 時 `parent.pop("waiting_for", None)`（`:1223-1229`）。即：parent 會被覆寫成 `status=todo`、`next=` 上述泛用完成句、`waiting_for` 被清空。                                                                    |
| 本機再查證指令 | `python3 -B` 匯入同一 release 的 `ai_status.py`，只呼叫唯讀函式 `unblock_parent_resolution_fields(state, helper_task, message)`（未呼叫任何 writer）：exit 0，回傳 `resume_status="todo"`、`parent_message` 為上述泛用句、`parent_waiting_for=""`。確認「若照目前狀態 merge，parent 會被覆寫成 todo／泛用 next／清空 waiting_for」。                                                  |

### Parent 現況（`2026-10-28T06:19:43Z` 之後本機重新查證，無變化）

| 項目        | 值                                                                                                                                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| status      | `blocked`                                                                                                                                                                                                                                                                                       |
| owner       | `Pi`                                                                                                                                                                                                                                                                                            |
| reviewer    | `Claude2`                                                                                                                                                                                                                                                                                       |
| waiting_for | `Codex`                                                                                                                                                                                                                                                                                         |
| next        | 2026-10-28T06:19:43Z 由 Pi 撰寫，約 2.1 KB，詳述 FULL run `40640729762` 於 step18 FAIL、三格式下載皆屬 C1 (unassigned→cancelled) 訂單、尚未滿足 `same_release_actual_daily_preview_and_three_downloads`；全文見 `ai-status.sh show BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025` |

若本 helper 的 candidate 在 parent 仍是這個狀態時被 merge，`apply_unblock_parent_resolution`
會把上述 `blocked`／Pi 的真實 next／`waiting_for=Codex` 整組覆寫掉，等同抹除
Pi 目前的進度與 runtime 證據缺口記錄，並讓 parent 錯誤地回到 `todo`（可再被派工，
但其實驗收仍缺 `same_release_actual_daily_preview_and_three_downloads`）。

### 為何本 helper（dispatched owner）無法自行補上 `resolved_parent_*`

本機已直接重現 dispatch guard（不是僅憑記憶推論）：

```
$ TASK_METADATA_JSON='{"resolved_parent_status":"blocked"}' AI_NAME=Claude \
    python3 <release>/tools/development-orchestrator/bin/ai_status.py \
    assign BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-UNBLOCK-PLANNING-DECISION Claude Codex
Dispatched workers must use their assigned task lifecycle commands
```

`ORCH_DISPATCH_ROLE=owner` 與 `ORCH_RUN_ID` 在本次 dispatch 的 shell 環境中都是
設定值，`_guard_worker_command` 因此拒絕 `assign`。本 helper 的 owner／reviewer
dispatch 都沒有能寫入 `resolved_parent_*` 的指令路徑。

### 實際安全處置（需要 Supervisor-privileged session，無 `ORCH_DISPATCH_ROLE`/`ORCH_RUN_ID`）

Merge 前，由具 Supervisor 權限（互動式、未帶 dispatch 環境變數）的 session 在本
helper 的 task 上設定 `resolved_parent_*`，使自動解析改寫為「維持 parent 現有
blocked 狀態與當前 next／waiting_for」，而不是落到缺省的 `todo`：

```
TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Codex","resolved_parent_next":"<merge 前即時從 `ai-status.sh show BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025` 取得的當下 next 全文，逐字複製>"}' \
  AI_NAME=Supervisor python3 <release>/tools/development-orchestrator/bin/ai_status.py \
  assign BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-UNBLOCK-PLANNING-DECISION Claude Codex
```

注意事項：

- `resolved_parent_next` 必須是**執行這個指令那一刻** parent 的即時 `next`，不是
  本文件裡列出的這份快照——Pi 仍在主動更新，複製舊快照一樣會蓋掉較新進度。
- 設好 `resolved_parent_*` 後，才讓本 helper 的 candidate 走完 merge；merge 觸發
  `transition_after_merge` 時就會用這三個值而非缺省值。
- 不呼叫 parent 的 `start`、`handoff` 或任何會改變其 candidate/generation/review/CI/merge
  身分的指令；只設定 helper 自己身上的 `resolved_parent_*` 中繼資料。
- 若在設定與 merge 之間 Pi 又更新了 parent `next`，需重新讀取並覆寫
  `resolved_parent_next`，以 merge 前最後一次讀到的內容為準。

### 驗收對照表

| Finding／驗收項                                                                    | 依據                                                                                | 舊版→修正版                                                                                       | 命令／exit code                                                                                                           | 未驗項                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Codex reopen：no-op 會讓自動解析把 parent 覆寫成 todo／泛用 next／清空 waiting_for | `ai_status.py:717-739`、`:1156-1192`、`:1201-1229`                                  | 舊版聲稱「不寫入即安全」（誤）→本版記錄自動解析機制、live 查證結果與需要的 `resolved_parent_*` 值 | 本機 `python3 -B` import 唯讀呼叫 `unblock_parent_resolution_fields`：exit 0，結果同上表                                  | 需 Supervisor-privileged session 實際執行 `assign` 才能完成處置，本 helper dispatch 做不到 |
| Resolve or route missing product/contract decision                                 | 核心結論（parent 無缺失產品／合約決策，誤判 helper）未變                            | 不變                                                                                              | 不適用（文件核對）                                                                                                        | 無                                                                                         |
| Produce task-scoped commit/push/PR evidence                                        | 本次 commit 僅改動本檔案                                                            | —                                                                                                 | `git diff --check <base>...HEAD` exit 0；`npx prettier --check` exit 0；`check_commit_trailers.py` exit 0（實際跑後更新） | hosted CI 於 PR 另記，尚未在此宣稱通過                                                     |
| Update parent with concrete unblocked next step                                    | 本 helper dispatch 無法寫入 parent（guard 已重現）；需 Supervisor 執行上方 3 行指令 | —                                                                                                 | 見上方 guard 重現輸出                                                                                                     | 實際寫入待 Supervisor-privileged session 執行                                              |

結論：**不是「本 helper 不寫 parent 就安全」，而是「本 helper 需要 Supervisor 在
merge 前把 `resolved_parent_*` 設到位，自動解析才會維持 parent 現狀」**。本 helper
自身的 dispatch（owner／reviewer 皆同）結構性地無法執行該設定指令；已在看板上以
`blocker` 記錄，等待 Supervisor-privileged session 處理。

## 引用 PR / SHA

| 參照                      | 值                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Parent candidate          | `27b7fb31d3777c5e986d54990b2f5a69f497635e`（generation `730b74df53d34e13ad995906f35295c2`）                    |
| Parent PR                 | [#3074](https://github.com/ajoe734/drts-fleet-platform/pull/3074) → `da7c5d8c9a405107ccac6a6320aa090479107e31` |
| qs remediation PR         | [#3073](https://github.com/ajoe734/drts-fleet-platform/pull/3073) → `a086b02f94073b304c1ab9a075bce8c486b95657` |
| Bounded-read PR           | [#3099](https://github.com/ajoe734/drts-fleet-platform/pull/3099) → `78a4c348a07deaf005014f30d772e21af56ba2c6` |
| Manual-unblock helper PR  | [#3100](https://github.com/ajoe734/drts-fleet-platform/pull/3100) → `074c8ffc06a59fd94116c2388ad83b500ba80369` |
| Ops-exchange isolation PR | [#3107](https://github.com/ajoe734/drts-fleet-platform/pull/3107) → `8992293d0ceff8aa76a0789e582b670a521ac80f` |
| Latest hosted FULL run    | workflow run `40640729762`，definition/runtime `40bdf7d15da3d1e81ba9aa2bac22f8cc96a12073`                      |
| Triage fix (context only) | `8295d1f334553b98068a26c5c747330ec43ef02b`（`ORCH-EXISTING-BLOCKED-TRIAGE-INELIGIBLE-HELPER-ACTION-20261028`） |
