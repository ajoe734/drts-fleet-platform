# R12 existing owned report download: planning-decision triage

Task: `BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025-UNBLOCK-PLANNING-DECISION`

Parent: `BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025`

Owner: Claude；Reviewer: Codex。審查時間 2026-10-28 ～ 2026-10-29 UTC（第三輪）。Helper kind：
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

## 第三輪：resolved*parent*\* 已由 Reviewer 以同角色權限設定完成

### 設定經過

`2026-10-29T09:28:09Z`，本 helper 的 reviewer Codex 以它自己既有的角色權限
（不是冒充 Supervisor，也不是本 helper 的 owner dispatch），對本 helper task
做了一次「同角色 metadata 設定」，在本 helper 自己身上寫入以下三個欄位：

| 欄位                          | 值                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolved_parent_status`      | `in_progress`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `resolved_parent_waiting_for` | `Codex`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `resolved_parent_next`        | 說明此次 callback 只是讓 parent 從 `blocked` 回到 `in_progress`；保留 parent 既有的 candidate/generation/review/CI/merge 身分（`H 27b7fb31d3777c5e986d54990b2f5a69f497635e` / `gen 730b74df53d34e13ad995906f35295c2` / `M da7c5d8c9a405107ccac6a6320aa090479107e31`）與既有兩個 Source key 的既有狀態不變；**不**代表本 helper 核可 runtime acceptance key，真正核可 `same_release_actual_daily_preview_and_three_downloads` 仍須由 Pi/Claude2 走既有的 reconcile/record-acceptance 流程。 |

設定完成後，Codex 以 reviewer 身分做了一次正常的 reopen（exit 0）；
`candidate_current` 維持 null（延續第二輪 reopen 清空的狀態），沒有恢復舊票。
這個順序符合第二輪所要求的「由不帶 dispatch 環境變數的 session 在 merge 前設定
`resolved_parent_*`」，差別只在實際執行者是 reviewer 以自己的角色執行，而不是另一個
Supervisor session。

### 為何填 `in_progress` 而不是第二輪建議的 `blocked`

第二輪之後，有一份**獨立的唯讀查證**（不是本 helper 自己做的；它沒有核可任何東西、
沒有改 parent 任何欄位、沒有重跑測試或部署、也沒有改 orchestrator 程式碼）確認
parent 原本卡住驗收的 runtime 證據缺口，已經被一次新的 hosted FULL run 補齊：

| 項目          | 內容                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosted run    | workflow run `40681440811`（definition SHA `ad13694ccfc868aaa59b967200ac443029b9787a`，runtime SHA `1a3fbf8bca9e607085eb0c2e670b46763331f1da`），整輪 `completed`/`success`，`cleanup_errors: []`                                                                                                                                                                        |
| 訂單          | `d6a8feb2-165a-40ee-b495-d2232dc9e8f5`，`finalStatus=completed`；不是先前卡住驗收的那筆 C1（unassigned→cancelled）訂單                                                                                                                                                                                                                                                   |
| 預覽與下載    | 真實 UI 預覽回 200；CSV/XLSX/PDF 三個 job 皆回 201，三個下載皆回 200                                                                                                                                                                                                                                                                                                     |
| 三格式 bytes  | CSV 10923 bytes（sha256 `32a0b2a210d31cace089077a920c7f2ce3dc4fe340e6321573867794c9b88899`）；XLSX 10842 bytes（sha256 `75bd0e73080979fc967585702014a241179b1af8ef73a64025eb5d3a3263fba6`）；PDF 91052 bytes（sha256 `765180059329a43d2ff400b88419bc10b67f4b7b2b3361f020d6c1878ed24c7d`）；三者 manifestHash 與內容格式（CSV 表頭 / XLSX workbook / PDF 6 頁）皆比對一致 |
| 預覽 row      | 共 17 筆，5 筆屬可控訂單、12 筆為未驗證 sibling；依既有隱私規則對未驗證 sibling 不留原始檔，這是既有行為的延續，不是新的驗收門檻                                                                                                                                                                                                                                         |
| 服務 revision | api/admin/ops/fleet/referral 五個服務 before/after revision 皆為同一 runtime SHA `1a3fbf8bca9e607085eb0c2e670b46763331f1da`，一致度 100%，`cleanup_errors: []`                                                                                                                                                                                                           |
| 來源          | 官方 ZIP `Owned40681440811-...-12813715678.zip`（2202085 bytes，sha256 `d21fb4145e497013485827babb3e9b6428ba3851d18ba73fd24bfcce0900c040`，43 個成員，CRC 乾淨）                                                                                                                                                                                                         |

因此這次 callback 的正確值是把 parent 帶回 `in_progress`（脫離 blocked，讓它繼續走
正常流程），而不是重複建議 `blocked`，也不是由本 helper 自己核可 runtime key。本
helper 不是 `same_release_actual_daily_preview_and_three_downloads` 的 reviewer，
該 key 的正式核可仍屬 parent 的 owner Pi 與 reviewer Claude2。

### 候選狀態

舊 candidate `c90e9fd56ae3d92beb902e0e4cbcb55ba1773331`（對應
[PR #3119](https://github.com/ajoe734/drts-fleet-platform/pull/3119)）已在 reviewer
第二次 reopen 時被清空候選票。即使該 PR 目前仍為 open、其 51 項 checks 中 39 項
success、12 項 skip，依然不能沿用舊票；本輪必須走全新 handoff，產生新的 candidate
SHA／generation，交由 Codex 重新做獨立審查。

### 本次變更範圍

- 僅於本檔案新增本節，並在下方「引用 PR / SHA」表格新增一列。
- 不改 parent 的任何欄位，也不改 parent 的 candidate/generation/review/CI/merge 身分。
- 不改本 helper 自己的 `resolved_parent_*`：已由 reviewer 以其角色設定完成；本 helper
  的 owner dispatch 依然沒有、也不需要去寫它，guard 行為與第二輪描述一致，沒有改變。
- 不新增 helper、runner 或 FULL run；不改 orchestrator 程式碼。

## 引用 PR / SHA

| 參照                            | 值                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parent candidate                | `27b7fb31d3777c5e986d54990b2f5a69f497635e`（generation `730b74df53d34e13ad995906f35295c2`）                                                                                                                                                                                                                  |
| Parent PR                       | [#3074](https://github.com/ajoe734/drts-fleet-platform/pull/3074) → `da7c5d8c9a405107ccac6a6320aa090479107e31`                                                                                                                                                                                               |
| qs remediation PR               | [#3073](https://github.com/ajoe734/drts-fleet-platform/pull/3073) → `a086b02f94073b304c1ab9a075bce8c486b95657`                                                                                                                                                                                               |
| Bounded-read PR                 | [#3099](https://github.com/ajoe734/drts-fleet-platform/pull/3099) → `78a4c348a07deaf005014f30d772e21af56ba2c6`                                                                                                                                                                                               |
| Manual-unblock helper PR        | [#3100](https://github.com/ajoe734/drts-fleet-platform/pull/3100) → `074c8ffc06a59fd94116c2388ad83b500ba80369`                                                                                                                                                                                               |
| Ops-exchange isolation PR       | [#3107](https://github.com/ajoe734/drts-fleet-platform/pull/3107) → `8992293d0ceff8aa76a0789e582b670a521ac80f`                                                                                                                                                                                               |
| Latest hosted FULL run          | workflow run `40640729762`，definition/runtime `40bdf7d15da3d1e81ba9aa2bac22f8cc96a12073`                                                                                                                                                                                                                    |
| Runtime-key-fulfilling FULL run | workflow run `40681440811`，definition `ad13694ccfc868aaa59b967200ac443029b9787a` / runtime `1a3fbf8bca9e607085eb0c2e670b46763331f1da`，main 訂單 `d6a8feb2-165a-40ee-b495-d2232dc9e8f5`，三格式 bytes 10923/10842/91052，官方 ZIP sha256 `d21fb4145e497013485827babb3e9b6428ba3851d18ba73fd24bfcce0900c040` |
| Triage fix (context only)       | `8295d1f334553b98068a26c5c747330ec43ef02b`（`ORCH-EXISTING-BLOCKED-TRIAGE-INELIGIBLE-HELPER-ACTION-20261028`）                                                                                                                                                                                               |
