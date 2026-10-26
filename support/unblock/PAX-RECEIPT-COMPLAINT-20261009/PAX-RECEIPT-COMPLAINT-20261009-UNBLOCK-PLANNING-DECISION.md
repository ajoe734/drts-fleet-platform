# PAX-RECEIPT-COMPLAINT-20261009 — planning decision（routed，非 resolved）

Task: `PAX-RECEIPT-COMPLAINT-20261009-UNBLOCK-PLANNING-DECISION`。Owner: Claude2。
Reviewer: Pi。撰寫日期：2026-10-26 UTC。Base branch：`dev`。

本報告是 chairman 自動生成的 planning-decision helper 的唯一交付物。它記錄
parent `PAX-RECEIPT-COMPLAINT-20261009` 目前缺的 product/contract decision，並把
實際的解除卡點動作 **route** 給具 Supervisor 權限的操作者。本報告**不**解除
parent 的 `blocked`，也不宣稱 parent 已經解除卡點。

## 1. 現狀小結

### 1.1 Parent 機器真相（dispatch 時點的 `ai-status.sh show` 結果）

```json
{
  "id": "PAX-RECEIPT-COMPLAINT-20261009",
  "status": "blocked",
  "owner": "Gemini",
  "reviewer": "Claude",
  "waiting_for": "Claude",
  "blocked_reason": null,
  "candidate_sha": "b68ead3d782046522e12752a1cd6d0cd35e8d97f",
  "reviewed_sha": "b68ead3d782046522e12752a1cd6d0cd35e8d97f",
  "ci_status": "success",
  "merge_sha": "835f6c1ba02460655b3af28b76dfdbd1eb3d77ce",
  "required_acceptance": [
    "pax-receipt_e04_fields_and_passenger_download",
    "pax-complaint_intake_and_low_rating"
  ],
  "acceptance_evidence": {
    "pax-complaint_intake_and_low_rating": {
      "status": "passed",
      "candidate_sha": "b68ead3d782046522e12752a1cd6d0cd35e8d97f",
      "merge_sha": "835f6c1ba02460655b3af28b76dfdbd1eb3d77ce"
    }
  }
}
```

（`acceptance_evidence` 的 `evidence_ref`/`coverage`/`boundary` 欄位此處省略；
`evidence_ref` 指向本機
`/home/lupin/workspace/drts-fleet-platform/.local/pax-receipt-complaint-20261009/acceptance-20261014T113900Z-owner/assessment.md`。）

重點：

- Parent 已有完整對帳的 candidate：`candidate_sha` = `reviewed_sha` =
  `b68ead3d782046522e12752a1cd6d0cd35e8d97f`，`ci_status=success`，已 merge 為
  `835f6c1ba02460655b3af28b76dfdbd1eb3d77ce`。
- `required_acceptance` 有兩個 key，`acceptance_evidence` 只記錄了
  `pax-complaint_intake_and_low_rating`（passed）。**目前唯一缺的驗收證據 key 是
  `pax-receipt_e04_fields_and_passenger_download`**。
- Parent 的 `next` 欄位目前是**不相關的髒文字**（內容屬於另一個任務
  `BUREAU-R13-AGENCY-READONLY-PORTAL-20261024`），是本機既有的 goal-continuation
  流程把無關 JSON/文字覆寫進 `next` 造成的缺陷。**本報告不引用、也不應以該
  `next` 文字作為 parent 的真實狀態**；可信欄位僅限上方列出的
  `status`/`owner`/`reviewer`/`waiting_for`/`candidate_sha`/`acceptance_evidence`。
- 六個 `DRIVER-*-20261013` 依賴（`DRIVER-ACTUAL-FARE-CAPTURE-20261013`、
  `DRIVER-COMPLETION-ACTUAL-FARE-INPUT-20261013`、
  `DRIVER-EXPLICIT-SURNAME-PROFILE-CAPTURE-20261013`、
  `DRIVER-EXPLICIT-SURNAME-PROFILE-SETTINGS-20261013`、
  `DRIVER-PROFILE-DURABLE-SAVE-ACK-20261013`、
  `DRIVER-TRIP-SURNAME-SNAPSHOT-20261013`）machine truth 全部 `status: done`。
  依賴清單只影響 `backlog`/`todo` 的 dispatch readiness，不是讓一個已經明確
  `blocked` 的 task 前進的機制。

### 1.2 真正卡點（控制平面機制，非產品缺陷）

依 2026-10-21 的既有診斷（見同目錄
`PAX-RECEIPT-COMPLAINT-20261009-UNBLOCK-MANUAL-UNBLOCK.md` 的
「2026-10-21 cycle」小節），active release 的 `ai_status.py` 有三個機制共同使
parent 停在 `blocked`：

1. GitHub bus candidate-sync 分支
   `elif task.get("status") == "blocked": # CI/merge observations cannot resume an explicitly blocked task`
   —— 已 merge 的 candidate 不會自動推進明確 `blocked` 的 task。
2. `command_record_acceptance` 要求 `task.get("status") == "acceptance"` ——
   parent 在 `blocked` 時任何角色都無法補記缺的驗收 key。
3. `command_resume_blocked` 要求 `actor == "Supervisor"`，且不在
   dispatched-worker 允許命令清單
   （`start/progress/note/handoff/approve/reopen/blocker/system-block/record-acceptance/request-acceptance-review/decline-acceptance-review`）
   內；`assign` 同樣不在清單內。既有 guard 訊息：
   `Dispatched workers must use their assigned task lifecycle commands`、
   `Dispatched worker cannot mutate a different task`。

## 2. 決策內容（本任務記錄的 product/contract decision）

### 2.1 決策：原 HOLD 的 field-capture 理由已過時（stale）

2026-10-12 的 HOLD 保護的是 `pax-receipt_e04_fields_and_passenger_download`
所需的上游欄位缺口：authoritative issuer/operator、driver surname/masked
credential、四項實際車資組成、captured payment method、total convention。
當時這些欄位尚未由 driver 完成流程/UI/付款上游提供。

這個**欄位擷取缺口**已由 `PAX-RECEIPT-E04-CAPTURE-20261015`（owner Codex，
reviewer Claude2）技術上補齊：

| 項目                     | 證據                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 任務狀態                 | `status: done`；candidate `67a425d77e03` merged as `e323b9424f46`                                                                                                                                                                                                                           |
| 唯一 reviewer finding    | `E04-SHARED-PAX-OTP-CSRF-403`，2026-10-18 獨立判定 **declined, not reopened**                                                                                                                                                                                                               |
| 403 根因                 | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` 的 CSRF origin 比對在 Cloud Run TLS-terminating proxy 下失效；pre-existing bug，由 `PAX-CLOUD-RUN-ORIGIN-20261016`（commit `32205265`）修正                                                                               |
| 祖先關係                 | merge-base 確認修正落在 v3 failing（`90e37f80`）與 v4 passing（`48d9488c`）之間；parent `merge_sha` `835f6c1b` 與 E04 candidate merge `e323b942` 皆為 `48d9488c` 的後代                                                                                                                     |
| v4 即時重驗              | `DeployDev39131364323`，terminal success，artifact digest/CRC 核對過；真實 production ride 紀錄帶有完整 canonical E04 snapshot：`driver_surname`、全部四項 `fare_breakdown` 組成、`fleet_operator_name`、`payment_method_display`、`driver_registration_masked`；OTP/login 全程通過、無 403 |
| 既有證據位置（本機路徑） | `/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/e04-codex-owner-20261016/acceptance-67a425d7/shared-v3-terminal-20261016T103242Z/terminal-verification.json`                                                                                   |

上表的本機路徑僅作為既有證據指標引用；本雲端 session 讀不到、也未驗證該檔案
內容，本報告未複製任何 `.local/` 下的個資、憑證或測試資料。

因此：**原 HOLD 所列「field-capture 缺口」這個理由本身已經過時**，不再是仍開著
的產品缺陷。

### 2.2 限制：業務權威判斷不在本報告範圍

本報告**沒有、也不能**宣告 fleet-operator/法規層級的業務權威判斷（例如
authoritative issuer/operator 對應與 total convention 的法規適用性）已被正式
核可。那是業務權威判斷，不是 dispatched helper 能單方面宣告的事。本報告只確認：
**欄位擷取管線本身**這個技術缺口已有 done、merged、live-verified 的證據鏈。

### 2.3 Decision / scope cut / follow-up：route 給 Supervisor

本任務的結論是 **route，不是 resolve**：

1. 建議一個具 Supervisor 權限（沒有 `ORCH_RUN_ID`/`ORCH_DISPATCH_ROLE`）的
   session 重新檢視第 2.1 節證據鏈，並自行判斷是否對 parent 執行
   `resume-blocked`；業務權威判斷由該恢復操作者另行負責。
2. 若判斷可以恢復，由 parent **現在的** owner（Gemini）或 reviewer（Claude）
   針對 `pax-receipt_e04_fields_and_passenger_download` 執行
   `record-acceptance`，引用 `PAX-RECEIPT-E04-CAPTURE-20261015` 的證據鏈
   （fresh same-candidate verification），**不是**照抄本報告。
3. 角色更正：舊 helper 報告寫的 parent owner/reviewer 是 Codex2/Codex，現在
   machine truth 已是 **Gemini/Claude**（`waiting_for: Claude`）。任何後續動作
   必須使用現在的真實角色，不要照搬舊報告裡的身分。

### 2.4 與既有 helper 的重疊（誠實記錄）

本 helper（PLANNING-DECISION）與同一 parent 上先前的兩個 helper
（`-UNBLOCK-HISTORY-REPAIR`、`-UNBLOCK-MANUAL-UNBLOCK`）高度重疊：本質上是**同一個
「等待 Supervisor 權限動作」的卡點，第三次被 chairman 自動生成 helper 任務**
來處理。新增的實質資訊只有：parent 角色已改為 Gemini/Claude、`next` 欄位被
goal-continuation 寫壞、以及把上述結論正式記錄為 planning decision。

本 helper：

- **不會、也不應該**嘗試繞過 dispatched-worker 寫入限制去模擬 Supervisor 身分
  （例如自行 unset dispatch 環境變數）。
- **不**重新建立、修改或取代已 archived 的舊 helper 文件；同目錄的
  `-UNBLOCK-HISTORY-REPAIR.md` 與 `-UNBLOCK-MANUAL-UNBLOCK.md` 維持原狀。
- 若 Supervisor 恢復 parent 前 chairman 再次生成同類 helper，建議直接引用本報告
  與 2026-10-21 診斷，而不是再產生一份新診斷。

## 3. 給 Supervisor 操作者的建議命令

> 這是給**有 Supervisor 權限**的操作者參考。本次雲端 session 與之後交回的本機
> dispatched worker（Claude2）身分**不會、也不能**執行它。執行前請先對照第 1、2
> 節與當下 live machine truth 重新判斷。

```
AI_NAME=Supervisor ORCH_STATUS_ROOT=<repo-root> python3 \
  <active-release>/tools/development-orchestrator/bin/ai_status.py \
  resume-blocked PAX-RECEIPT-COMPLAINT-20261009 in_progress \
  "E-04 field-capture gap behind the 2026-10-12 HOLD is covered by done/merged PAX-RECEIPT-E04-CAPTURE-20261015 (e323b9424f46, OTP-403 declined not reopened, live v4 verified); resuming so candidate b68ead3d7820/merge 835f6c1ba024 can reconcile to acceptance and the missing pax-receipt_e04_fields_and_passenger_download evidence can be recorded. Fleet-operator/legal business-authority judgment remains a separate call for the resuming operator."
```

恢復後，由 parent 現在的 owner（Gemini）或 reviewer（Claude）對
`PAX-RECEIPT-COMPLAINT-20261009` 執行 `record-acceptance`，key 為
`pax-receipt_e04_fields_and_passenger_download`，證據引用第 2.1 節列出的 E04
candidate（`67a425d77e03` → `e323b9424f46`）、`DeployDev39131364323` 即時重驗與
`terminal-verification.json` 路徑，並對 parent 自己的 candidate
`b68ead3d782046522e12752a1cd6d0cd35e8d97f` 做 fresh verification。

## 4. 驗收對照表

| Acceptance                                                                                  | 狀態 / 證據                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | **Routed，非 resolved**：第 2 節決策內容。實際恢復動作需要 Supervisor 權限，本 helper 無法執行                                                                                                                                                                                                                 |
| Record the decision, scope cut, or explicit follow-up needed by the parent task             | 第 2 節（決策、限制、route、角色更正、重疊說明）與第 3 節（Supervisor 建議命令與後續 `record-acceptance`）                                                                                                                                                                                                     |
| Produce task-scoped commit/push/PR evidence for any canonical change                        | 由本報告本身的 commit/push 提供；本任務唯一變更檔案為本報告，沒有其他程式碼變更                                                                                                                                                                                                                                |
| Update the parent task with the concrete unblocked next step                                | Dispatched helper 無法直接寫 parent 的 `note`/`assign`（guard：`Dispatched worker cannot mutate a different task`、`Dispatched workers must use their assigned task lifecycle commands`）。此項由本報告第 2.3、3 節的文字，加上本 helper 最終的 `blocker` 狀態（waiting_for 需具 Supervisor 權限的角色）來滿足 |

本機後續：dispatched worker（Claude2）應對**本 helper task** 呼叫 `blocker`，
標註需要具 Supervisor 權限的角色評估 parent 的 `resume-blocked`，而不是宣稱
parent 已解除卡點。
