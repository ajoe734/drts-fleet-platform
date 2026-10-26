# PAX-RECEIPT-COMPLAINT-20261009 — planning decision（維持 HOLD）

Task: `PAX-RECEIPT-COMPLAINT-20261009-UNBLOCK-PLANNING-DECISION`。Owner: Claude2。
Reviewer: Pi。撰寫日期：2026-10-26 UTC。Base branch：`dev`。

本報告是 chairman 自動生成的 planning-decision helper 的唯一交付物。它記錄
parent `PAX-RECEIPT-COMPLAINT-20261009` 缺的 product/contract decision 目前的
狀態，結論是**維持 HOLD**：本報告**不**解除 parent 的 `blocked`，不建議現在恢復
parent，也不構成任何業務/法務權威決定。

## 修訂紀錄

- `4bf1989960c434ea269e70ea8420c22384bdc017`：初版，被 reviewer Pi reopen。
- 本修訂回應 Pi 的三項 finding：
  - **F1**：初版 §2.1 的祖先關係寫反，且把 v3 失敗檔案誤標為 v4 成功證據。
    已改正為 §2.1 的核對結果與正確證據檔。
  - **F2**：初版 §2.3/§3 建議在業務權威決定之前恢復 parent，並暗示可用 E04
    `done` 直接補記 parent acceptance。已改為 §2.3 的維持 HOLD 條件。
  - **F3**：初版 §4 宣稱 helper 會以 `blocker` 結束，但實際動作是 `handoff`。
    已改為 §3.2/§4 如實描述接下來真正會發生的動作。

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

### 1.2 控制平面機制

依 2026-10-21 的既有診斷（見同目錄
`PAX-RECEIPT-COMPLAINT-20261009-UNBLOCK-MANUAL-UNBLOCK.md` 的
「2026-10-21 cycle」小節），active release 的 `ai_status.py` 有三個機制使 parent
停在 `blocked`：

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

這些機制說明了**誰能**移動 parent。parent **應不應該**移動，取決於 §2.3 的業務
決定；這個決定目前還不存在，所以 parent 停在 `blocked` 是正確狀態，不是需要繞過
的障礙。

## 2. 決策內容

### 2.1 技術子問題：欄位擷取管線已有 synthetic-only 驗證

2026-10-12 的 HOLD 保護的是 `pax-receipt_e04_fields_and_passenger_download`
所需的內容：authoritative issuer/operator、driver surname/masked credential、
四項實際車資組成、captured payment method、total convention。其中**欄位擷取
管線**這個技術子問題，由 `PAX-RECEIPT-E04-CAPTURE-20261015`（owner Codex，
reviewer Claude2，`status: done`）處理：candidate
`67a425d77e037f29e8c1053a01e8c7a2b6780e14` merged as
`e323b9424f46bd9bcdfa684a61fbcad77c4eb4a4`。

#### Commit 祖先關係（F1 更正）

正確順序（舊到新）：

1. `835f6c1ba02460655b3af28b76dfdbd1eb3d77ce`：parent
   `PAX-RECEIPT-COMPLAINT-20261009` 的 merge。
2. `e323b9424f46bd9bcdfa684a61fbcad77c4eb4a4`：`PAX-RECEIPT-E04-CAPTURE-20261015`
   的 merge。
3. `48d9488c43f16a25d9e6c356e891f2c3433552b2`：v4 release source
   （`publish/v2026.10.18.4`），commit subject
   `VOICE-CALLBACK-CREATE-RECEIPT-20261018: persist voice callback receipts and final Driver task states`。

Parent merge 與 E04 merge 都是 v4 commit `48d9488c` 的**祖先**（更早的 commit），
v4 包含且晚於這兩者。初版寫成「後代」是錯的。核對依據：

```
$ git merge-base --is-ancestor 48d9488c4 835f6c1ba ; echo $?
1   # 48d9488c 不是 835f6c1b 的祖先
$ git merge-base --is-ancestor 835f6c1ba 48d9488c4 ; echo $?
0   # 835f6c1b 是 48d9488c 的祖先
$ git merge-base --is-ancestor e323b9424 48d9488c4 ; echo $?
0   # e323b942 是 48d9488c 的祖先
$ git merge-base --is-ancestor 835f6c1ba e323b9424 ; echo $?
0   # 835f6c1b 是 e323b942 的祖先
```

本機 owner 先跑過這四條指令。本雲端 session 把這三個 commit fetch 進 shallow
clone 後重跑，四條結果相同。

#### 證據檔對照（F1 更正）

| 項目                                | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v3 失敗紀錄（**不是** v4 成功證據） | `.local/passenger-transport-bureau-review-20261015/e04-codex-owner-20261016/acceptance-67a425d7/shared-v3-terminal-20261016T103242Z/terminal-verification.json`：run `38884103030`，source `90e37f80`（`publish/v2026.10.16.3`），`conclusion: "failure"`，`second_key: "NOT RECORDED"`，finding `E04-SHARED-PAX-OTP-CSRF-403`（`POST /api/passenger-app/review-demo/otp 403 CSRF_CHECK_FAILED`）。只能佐證 v3 時 OTP-CSRF-403 存在 |
| 403 根因                            | `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` 的 CSRF origin 比對在 Cloud Run TLS-terminating proxy 下失效；pre-existing bug，由 `PAX-CLOUD-RUN-ORIGIN-20261016`（commit `32205265`）修正。2026-10-18 該 finding 被判定 declined, not reopened                                                                                                                                                                  |
| v4 成功證據                         | `.local/passenger-bureau-gap-correction-20261018/e04-current-shared-evidence-20261018T1551/verified-current-shared-E04-evidence.json`（見下）                                                                                                                                                                                                                                                                                       |

v4 證據檔節錄（本機 owner 讀取並去除個資後提供；本雲端 session 讀不到 `.local/`，
未獨立驗證檔案內容）：

- `verified_at_utc`: `2026-10-18T15:51:23.965560+00:00`
- `task_id`: `PAX-RECEIPT-E04-CAPTURE-20261015`
- `candidate_sha`: `67a425d77e037f29e8c1053a01e8c7a2b6780e14`
- `original_merge_sha`: `e323b9424f46bd9bcdfa684a61fbcad77c4eb4a4`
- `release_source_sha`: `48d9488c43f16a25d9e6c356e891f2c3433552b2`
- `release_ref`: `publish/v2026.10.18.4`
- `existing_original_deploy_run`: `39131364323`
- `existing_artifact_id`: `12138687621`
- `live_artifact_digest`:
  `sha256:249da6feb2257d66705a8a5e595f46a22487fa2bc78d6e271f6a55f762d46327`
- `zip_hash_and_all_members_valid`: `true`
- `raw_browser_report`: passed 1、failed 0、skipped 0、flaky 0、retry 0、
  stages_passed 48
- `original_E04_merge_is_ancestor_of_release`: `true`
- `pending_original_acceptance_review_preserved.state`: `pending`。這是舊
  OTP-CSRF-403 finding 保存的 pending-review metadata，這次驗證沒有重新觸發或
  改變它。
- `recommendation`: "Original assigned Claude2 reviewer should reconcile the
  obsolete v3 OTP CSRF failure with this verified later v4 shared-flow
  evidence; owner does not impersonate reviewer or resolve original request."

這份 v4 證據驗證的是 `publish/v2026.10.18.4`（release source `48d9488c`），
不是舊的 `publish/v2026.10.16.3`（v3，`90e37f80`，run `38884103030`，failure）。

#### Synthetic-only 邊界

三筆示範訂單的 canonical snapshot 含有全部 E04 欄位，但內容全部是**合成演練
資料**：`driver_surname: "演練"`、
`fleet_operator_name: "虛構演練派遣業者（合成・非正式）"`、
`payment_method_display: "synthetic ••••0000"`、
`driver_registration_masked: "••••9001"`；`fare_breakdown` 四項組成都存在
（`start_minor: 8500`，其餘三項為 0，示範性質）。這些不是真實車隊業者、真實
駕駛或真實付款方式，**不能**當作真實 issuer/operator/PSP 已核實的證據。

v4 證據檔自己列的 `limitations`（原文全列）：

1. "Evidence is the actual .4 shared run, not a new .5 deployment result."
2. "Hosted browser used existing cloud authentication; ordinary unauthenticated
   presenter/browser entry remains a separate unresolved 403 task."
3. "Returning account is not first-time consent verification."
4. "All authority/SMS/PSP/GPS external data remain explicit simulation; no
   claim of formal operating receipt approval."
5. "Formal PG invariants and source CI retain their existing exact-source
   evidence; this artifact does not rerun them."

第 4 條直接限制了這份證據的用途：它證明的是 synthetic 環境下的技術管線，
**不構成**正式 operating receipt 的核可。

### 2.2 仍未決定的業務/法務問題

Parent 的 `pax-receipt_e04_fields_and_passenger_download` 需要的不只是欄位
擷取管線，還需要下列業務/法務權威判斷。目前沒有證據顯示有人做出這些決定：

- authoritative issuer/operator 的對應（收據上誰是法定開立者/營運者）；
- total/toll convention 的法規適用性（總額與通行費如何計入及呈現）；
- 真實 PSP 付款方式擷取，以及真實業者/駕駛資料的使用。

本報告與 dispatched helper 都**沒有權限**做這些判斷，也不宣稱它們已被核可。

### 2.3 決策：維持 HOLD（F2 更正）

Parent 的 HOLD **維持不變**，直到下列兩者之一發生：

- **(a)** 有實際權責的業務/法務權威，針對 authoritative issuer/operator 對應與
  total/toll convention 的法規適用性，做出正式決定；或
- **(b)** 有權責的人明確授權一個**只限模擬範圍**的 scope cut，並在 parent 的
  驗收記錄裡寫清楚這個限制：接受的是 synthetic-only 的技術管線驗證，不是真實
  業者/法規核可。

在 (a) 或 (b) 發生之前：

- 不恢復 parent，也不建議任何人現在對 parent 執行 `resume-blocked`。
- **不要**把 `PAX-RECEIPT-E04-CAPTURE-20261015` 的 `done` 狀態直接複製或引用為
  parent `pax-receipt_e04_fields_and_passenger_download` 的 `record-acceptance`
  證據。E04 `done` 只涵蓋「欄位擷取管線」這個技術子問題（並受 §2.1 的
  synthetic-only 限制），不代表 parent 所需的業務權威判斷已經核可。
- 即使 (a) 或 (b) 發生，parent 的 `record-acceptance` 也必須由 parent **現在的**
  owner（Gemini）或 reviewer（Claude）對 parent 自己的 candidate
  `b68ead3d782046522e12752a1cd6d0cd35e8d97f` 做 fresh verification；若走 (b)，
  證據裡必須明文寫出 synthetic-only 限制。

角色更正：舊 helper 報告寫的 parent owner/reviewer 是 Codex2/Codex，現在 machine
truth 已是 **Gemini/Claude**（`waiting_for: Claude`），後續動作必須用現在的角色。

### 2.4 與既有 helper 的重疊（誠實記錄）

本 helper（PLANNING-DECISION）與同一 parent 上先前的兩個 helper
（`-UNBLOCK-HISTORY-REPAIR`、`-UNBLOCK-MANUAL-UNBLOCK`）高度重疊：本質上是**同一個
卡點第三次被 chairman 自動生成 helper 任務**來處理。新增的實質內容只有：parent
角色已改為 Gemini/Claude、`next` 欄位被 goal-continuation 寫壞、v3/v4 證據的
更正，以及把「維持 HOLD 直到 (a)/(b)」正式記錄為 planning decision。

本 helper：

- **不會、也不應該**嘗試繞過 dispatched-worker 寫入限制去模擬 Supervisor 身分
  （例如自行 unset dispatch 環境變數）。
- **不**重新建立、修改或取代已 archived 的舊 helper 文件；同目錄的
  `-UNBLOCK-HISTORY-REPAIR.md` 與 `-UNBLOCK-MANUAL-UNBLOCK.md` 維持原狀。
- 若 (a)/(b) 發生前 chairman 再次生成同類 helper，建議直接引用本報告，而不是
  再產生一份新診斷。

## 3. 後續動作

### 3.1 條件成立後的 Supervisor 參考命令

> **前提：只有在 §2.3 的 (a) 或 (b) 任一條件已經由具權責的人做出之後，才執行
> 這個命令；本報告本身不構成那個決定。** 這是給有 Supervisor 權限（沒有
> `ORCH_RUN_ID`/`ORCH_DISPATCH_ROLE`）的操作者參考；本次雲端 session 與本機
> dispatched worker（Claude2）身分**不會、也不能**執行它。

```
AI_NAME=Supervisor ORCH_STATUS_ROOT=<repo-root> python3 \
  <active-release>/tools/development-orchestrator/bin/ai_status.py \
  resume-blocked PAX-RECEIPT-COMPLAINT-20261009 in_progress \
  "<cite the (a) authority decision or (b) simulation-only scope-cut record>. E-04 field-capture pipeline is covered by done/merged PAX-RECEIPT-E04-CAPTURE-20261015 (e323b9424f46; synthetic-only v4 evidence publish/v2026.10.18.4 run 39131364323 artifact 12138687621). Resuming so candidate b68ead3d7820 can reconcile to acceptance; Gemini/Claude must freshly verify pax-receipt_e04_fields_and_passenger_download and, under (b), record the synthetic-only limitation."
```

命令訊息的第一段必須換成實際的 (a) 決定或 (b) scope-cut 紀錄；沒有這段就不應
執行。恢復後，由 Gemini 或 Claude 依 §2.3 的條件執行 `record-acceptance`。

### 3.2 本 helper 接下來真正會發生的動作（F3 更正）

1. 本修訂 commit、push 後，本機 owner 以 `handoff` 交給 reviewer Pi 審查。
2. **如果 reviewer 核可這次修正，本機 owner 接下來會對本 helper task（不是
   parent）呼叫 `blocker`，不會讓它自動 merge/done。**
   原因：在這個 repo 的候選生命週期機制裡，`task_class: unblock` 的 helper
   一旦真的被 merge，系統會在合併完成時把 `resolved_parent_status` 預設成
   `"todo"`（除非之前已經明確設成別的值），並把這個值直接寫回 parent 的
   `status`／`next`／`waiting_for`。§2.3 的 (a)/(b) 決定還沒發生，讓本 helper
   直接 merge 會在沒有任何人做出真正決定的情況下，把 parent 從 `blocked` 自動
   翻成 `todo`，等於繞過本報告要求的 HOLD。所以本機 owner 會用 `blocker` 讓本
   helper 停在 blocked 狀態，`waiting_for` 指向有 Supervisor 權限的角色，訊息附上
   §3.1 的具體指令與前提，確保在權責決定做出之前，沒有自動化動作替 parent 做
   決定。
3. 本 helper 不寫 parent 的 `note`/`assign`，也不模擬 Supervisor 身分。真正的
   parent 更新（替換掉 BUREAU-R13 髒 `next`，寫入 (a)/(b) 觸發條件）需要
   Supervisor 用 current release CLI 執行。

## 4. 驗收對照表

| Acceptance                                                                                  | 狀態 / 證據                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resolve or route the missing product/contract decision through canonical planning artifacts | **Routed，非 resolved**：§2.3 記錄「維持 HOLD 直到 (a) 權威決定或 (b) 明確的 simulation-only scope cut」。決定本身需要具權責的人做出                                                                                                                                                                                           |
| Record the decision, scope cut, or explicit follow-up needed by the parent task             | §2.1（技術子問題與 synthetic-only 邊界）、§2.2（未決的業務/法務問題）、§2.3（HOLD 條件與禁止直接複製 E04 `done`）、§3.1（條件成立後的指令）                                                                                                                                                                                    |
| Produce task-scoped commit/push/PR evidence for any canonical change                        | 由本報告的 commit/push 提供（初版 `4bf1989960c434ea269e70ea8420c22384bdc017` 加本修訂 commit）；本任務唯一變更檔案為本報告，沒有其他程式碼變更                                                                                                                                                                                 |
| Update the parent task with the concrete unblocked next step                                | 本 helper 無法直接寫 parent（dispatch guard）；滿足方式是（i）§3 提供可直接執行的具體 Supervisor 指令與完整證據鏈，（ii）本 helper 自己在 reviewer 核可後呼叫 `blocker`（不是 handoff 後靜默推進到 done），讓機器狀態誠實反映『尚未有人做出決定』，避免候選合併時的 `resolved_parent_status` 預設值錯誤地把 parent 翻成 `todo` |
