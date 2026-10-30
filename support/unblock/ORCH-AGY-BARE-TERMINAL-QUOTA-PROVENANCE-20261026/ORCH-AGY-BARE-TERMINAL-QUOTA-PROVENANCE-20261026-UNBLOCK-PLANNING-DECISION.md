# ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026 planning-decision 裁定

Task：`ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-PLANNING-DECISION`

Parent：`ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026`

Owner：Claude2；Reviewer：Codex。裁定時間 2026-10-29 UTC。Helper kind：
`planning_decision`（由 `chairman-blocked-task-triage` 自動建立）。純文件交付。

> **2026-10-29 更新**：以下「核心結論」到「引用」各節保留為原始裁定紀錄；
> 其中關於 metadata 待執行、sibling 狀態與 `resolved_parent_waiting_for` 值的
> 敘述已過時，現況以文末
> 「[2026-10-29 更新：metadata 現況核對（Codex review）](#2026-10-29-更新metadata-現況核對codex-review)」
> 為準。

## 核心結論

**Parent 沒有缺失的產品／合約決策。** Parent 真正的卡點，是 sibling helper
`ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK`
（owner Codex，draft [PR #3123](https://github.com/ajoe734/drts-fleet-platform/pull/3123)
@ `3eaafa5e6086d43db146898c3ddaa4ecbe08311f`）已經完整診斷過的單一技術性
runtime 驗收缺口 `existing_supervisor_bare_terminal_quota_pause_verified`，
加上目前 orchestrator 的 dispatch-fence guard
（`TaskBoardCommandExecutor._guard_worker_command`）阻止任何在 dispatch 中
的 worker（包含本 helper 自己）寫入 parent 或任一 helper 自身的
`resolved_parent_*` 中介資料。

本 helper 不重複 sibling helper 的完整診斷，只引用其結論；不代寫、不擴大、
不重新驗證已經被接受的 source（candidate `19534ba2c83ef768019d4a961bfe8acf6cb9aa55`
／merge `22b51a04f52409c92ba1cab5989bd35ab51e1f4e`，
[PR #3034](https://github.com/ajoe734/drts-fleet-platform/pull/3034)，
acceptance key `reviewed_original_bare_terminal_quota_provenance_fix`
已滿足）。

## Record the decision

- **Decision**：無需任何新的產品／合約決策；本 helper 的角色是 repository
  coordination（不是新的使用者授權請求）。
- **Scope cut**：無。
- **Parent 需要的明確 follow-up**：由一個真正具 Supervisor 權限、且不帶
  `ORCH_DISPATCH_ROLE` / `ORCH_RUN_ID` 的互動 session，在 sibling helper
  與本 helper 兩個 task 上，各執行一次 `assign` 搭配
  `TASK_METADATA_JSON`，寫入下列欄位（內容取自 sibling helper 已備妥的
  `.local/unblock/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK/parent-disposition-metadata.json`）：

  ```
  TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Claude2","resolved_parent_next":"Source fix accepted at candidate 19534ba2c83ef768019d4a961bfe8acf6cb9aa55 / merge 22b51a04f52409c92ba1cab5989bd35ab51e1f4e. Genuine 2026-10-26T04:06Z native bare quota receipts caused authorized rotation and Gemini lane pause. Runtime key remains pending: review actual immutable worker pin and genuine matching quota-pool identity/exclusion evidence; separate lane pauses and cached predicate readback do not satisfy it. Preserve candidate and pauses. Evidence: support/unblock/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK.md"}' \
    AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py assign ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK Codex Claude2

  TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Claude2","resolved_parent_next":"Source fix accepted at candidate 19534ba2c83ef768019d4a961bfe8acf6cb9aa55 / merge 22b51a04f52409c92ba1cab5989bd35ab51e1f4e. Genuine 2026-10-26T04:06Z native bare quota receipts caused authorized rotation and Gemini lane pause. Runtime key remains pending: review actual immutable worker pin and genuine matching quota-pool identity/exclusion evidence; separate lane pauses and cached predicate readback do not satisfy it. Preserve candidate and pauses. Evidence: support/unblock/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-PLANNING-DECISION.md"}' \
    AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py assign ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-PLANNING-DECISION Claude2 Codex
  ```

  Parent 自己既有的 `next`（由 owner Pi 持續維護）不被覆寫；兩個 helper
  都只補上各自的 `resolved_parent_*` 中介資料，供各自 helper 合併時的
  `apply_unblock_parent_resolution` 使用，不手動呼叫 parent 的 `note`。

## 為何本 helper 不能自己完成這件事

本次 dispatch 的環境已確認 `ORCH_DISPATCH_ROLE=owner`、`ORCH_RUN_ID` 已設定。
在這個條件下，`assign`（包含對自己 task 的 metadata 寫入）與跨 task 的
`note` 一律回傳 exit 1（"Dispatched workers must use their assigned task
lifecycle commands" / "Dispatched worker cannot mutate a different task"）。
本 helper 不嘗試 unset 這些環境變數、也不冒充 Supervisor 身分來繞過這個
guard——這是 chairman 在建立本 helper 時明確禁止的行為，也不是真正的
Supervisor 權限來源。

## 不寫入 parent／sibling 的聲明

本 helper 不對 parent task 或 sibling helper task 做任何欄位寫入，也不嘗試
`note`、`assign`、`resume-blocked` 或其他跨 task 操作。本 helper 自身的狀態
以 `blocker` 記錄，`waiting_for` 指向本 helper 的 reviewer lane Codex，訊息中
說明需要一個真正的 Supervisor 互動 session 執行上一節的兩條指令。

## 引用

| 參照                         | 值                                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent                       | `ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026`（status `blocked`，owner Pi，reviewer Claude2）                                                                                        |
| Parent candidate / merge     | `19534ba2c83ef768019d4a961bfe8acf6cb9aa55` / `22b51a04f52409c92ba1cab5989bd35ab51e1f4e`（[PR #3034](https://github.com/ajoe734/drts-fleet-platform/pull/3034)）                           |
| Sibling helper               | `ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK`（status `blocked`，owner Codex，reviewer Claude2，waiting_for Claude2）                                         |
| Sibling draft PR             | [PR #3123](https://github.com/ajoe734/drts-fleet-platform/pull/3123) @ `3eaafa5e6086d43db146898c3ddaa4ecbe08311f`                                                                         |
| Sibling 完整診斷             | `support/unblock/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK.md`（尚未合併，目前只在 PR #3123 的 branch 上） |
| 待執行的 Supervisor metadata | `.local/unblock/ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK/parent-disposition-metadata.json`（機器專屬，不入 repo）                                          |

## 2026-10-29 更新：metadata 現況核對（Codex review）

原 reviewer Codex 複核已發布的 `c8b788110f9274d3c41b718a2f346116443e4209`
（[PR #3127](https://github.com/ajoe734/drts-fleet-platform/pull/3127) 的唯一
MD）後正常 reopen。Finding 只限於上面各節的過時診斷：「parent 沒有缺失的
產品／合約決策」這個核心結論仍然正確，但「metadata 尚待執行」、sibling 狀態、
建議寫入的 `resolved_parent_waiting_for` 值，以及「只有真正 Supervisor 互動
session 才能做 `assign`／`note`」這幾項說法已與實際不符。本節只更正這些事實，
不改變 parent／sibling 的任何欄位，也不新增 helper、runner、任務或政策條件。

### 舊版主張與實際現況對照

| 項目                               | 舊版文件主張                                                                                                                                                   | 2026-10-29 實際現況                                                                                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sibling helper 狀態                | draft [PR #3123](https://github.com/ajoe734/drts-fleet-platform/pull/3123) @ `3eaafa5e6086d43db146898c3ddaa4ecbe08311f`，status `blocked`，waiting_for Claude2 | status `done`；candidate `7e65d3ac137987a5b5e9f76cb58cdcc0ddb5830a`（generation `7d4c52b2892749b6a114c36695510250`）；merge `abcbbe188c5108c31f02bce4cdecfd19d0b4e572`；ci_status `success`；`resolved_parent_at` = `2026-10-29T15:21:00Z` |
| Sibling 完整診斷 MD                | 尚未合併，只在 PR #3123 的 branch 上                                                                                                                           | 已隨 merge `abcbbe188c5108c31f02bce4cdecfd19d0b4e572` 進入 `dev`                                                                                                                                                                           |
| `resolved_parent_waiting_for` 的值 | 建議寫入 `Claude2`                                                                                                                                             | 應為 `Pi`（parent 真正的 `waiting_for`）；本 helper 與 sibling 現值均為 `Pi`，上面兩條指令中的 `Claude2` 值不應再使用                                                                                                                      |
| `resolved_parent_next` 的值        | 建議寫入 helper 自擬的 runtime-key 摘要                                                                                                                        | 本 helper 與 sibling 的值逐字等於 parent 目前完整的 `next` 欄位                                                                                                                                                                            |
| Metadata 是否待執行                | 待一個真正的 Supervisor 互動 session 以 `AI_NAME=Supervisor` 執行 `assign`                                                                                     | 已完成，不再 pending；本 helper 的 `resolved_parent_status/waiting_for/next` 已寫好，sibling 的則已在合併時套用                                                                                                                            |
| 誰能合法寫入                       | 只有真正具 Supervisor 權限的 session                                                                                                                           | 一般 root session（不帶 `ORCH_DISPATCH_ROLE`／`ORCH_RUN_ID`、非 dispatched worker）以 `Codex` 身分透過普通 `assign`／`note` 即合法完成，不需冒用 `AI_NAME=Supervisor`                                                                      |
| 本 helper 自身等待對象             | `blocker`，waiting_for Codex，等 Supervisor session                                                                                                            | 無待執行 metadata；修正本 MD 後以新 head／generation 交回原 reviewer Codex 獨立複核                                                                                                                                                        |

### Metadata 現況（before／after／readback）

- **Before（舊版 MD 撰寫時）**：本 helper 與 sibling 都沒有
  `resolved_parent_*` 欄位；舊版 MD 建議寫入 `blocked`／`Claude2`／自擬摘要。
- **After（目前 machine truth）**：
  - 本 helper：`resolved_parent_status` = `blocked`、
    `resolved_parent_waiting_for` = `Pi`、`resolved_parent_next` 逐字等於
    parent 目前完整的 `next`；`resolved_parent_at` 未設（本 helper 尚未
    done／merge）。
  - Sibling：`resolved_parent_status` = `blocked`、
    `resolved_parent_waiting_for` = `Pi`、`resolved_parent_at` =
    `2026-10-29T15:21:00Z`；合併時 `apply_unblock_parent_resolution`
    回填 parent 的內容與 parent 原狀態一致，沒有誤翻成其他值。
- **Readback（parent，2026-10-29）**：status `blocked`、owner Pi、reviewer
  Claude2、waiting_for `Pi`；candidate
  `19534ba2c83ef768019d4a961bfe8acf6cb9aa55`／merge
  `22b51a04f52409c92ba1cab5989bd35ab51e1f4e`
  （[PR #3034](https://github.com/ajoe734/drts-fleet-platform/pull/3034)）；
  required acceptance 兩項中
  `reviewed_original_bare_terminal_quota_provenance_fix` 已滿足，
  `existing_supervisor_bare_terminal_quota_pause_verified` 未滿足（Source
  1 of 2）。
- 本 helper 日後合併時，`apply_unblock_parent_resolution` 套用的三個值與
  parent 現況相同，不會改變 parent 的任何欄位。

### 身分與 worker fence 的澄清

上面「為何本 helper 不能自己完成這件事」一節描述的 dispatch-fence guard
（`TaskBoardCommandExecutor._guard_worker_command`）**仍然存在、沒有解除**：
帶 `ORCH_DISPATCH_ROLE`／`ORCH_RUN_ID` 的 dispatched worker 依舊不能對自己或
其他 task 寫 metadata 或跨 task `note`。需要更正的只是舊版的前提——這個 fence
只限制 dispatched worker，一般非 worker 的 root session 不受其限制，可以用
自己的身分（本例為 `Codex`）合法執行普通 `assign`／`note`，不需要也不應該
冒用 `AI_NAME=Supervisor`。

### Parent 剩下的真正卡點

Parent 仍然只卡在 `existing_supervisor_bare_terminal_quota_pause_verified`：
需要在現役 Supervisor 上取得真實的 bare quota 回執、quota pool 選擇與
authorized pause 的 readback 證據。Supervisor 目前運行 release
`orchestrator-ebfc0cf70173`（PID 3540440）是新的進程層面事實，但不構成這個
runtime key 的證據。本 helper 不做任何 session／quota／provider probe、HTTP
呼叫、FULL、deploy 或產品 VM／server 操作來驗證此事，也不把 parent 的 `Pi`
改成其他 lane。

### 本次核對依據

orchestrator 看板 2026-10-29 對下列三個 task 的 `ai-status.sh show` 輸出
（由本機 orchestrator 直接讀取，隨本次任務說明提供）：

| Task                                                                         | 2026-10-29 摘要                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026`                           | `blocked`；owner Pi；reviewer Claude2；waiting_for Pi；candidate `19534ba2c83ef768019d4a961bfe8acf6cb9aa55`；merge `22b51a04f52409c92ba1cab5989bd35ab51e1f4e`                                         |
| `ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-MANUAL-UNBLOCK`    | `done`；owner Codex；reviewer Claude2；candidate `7e65d3ac137987a5b5e9f76cb58cdcc0ddb5830a`；merge `abcbbe188c5108c31f02bce4cdecfd19d0b4e572`；`resolved_parent_status/waiting_for` = `blocked`／`Pi` |
| `ORCH-AGY-BARE-TERMINAL-QUOTA-PROVENANCE-20261026-UNBLOCK-PLANNING-DECISION` | 本 helper；`resolved_parent_status/waiting_for` = `blocked`／`Pi`，`resolved_parent_next` 逐字等於 parent `next`                                                                                      |

本次修正後的 head／generation 交回原 reviewer Codex 重新獨立複核；完整 CI
與正常 protected merge 仍須照常完成。
