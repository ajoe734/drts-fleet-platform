# SR-QA-CALL-001 — 客服／錄音／客訴／事故工作閉環驗收

| 欄位          | 內容                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-QA-CALL-001.md`               |
| Owner         | Claude2                                                                        |
| Reviewer      | Gemini2                                                                        |
| Base SHA      | `b671bfc72e8a9d969fed1c872b80abc8842ed6f9` (= `origin/dev` tip at task start)  |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD` (see task board)                |

### 重新指派說明

本任務先前由 `Gemini` 建立驗收套件與本文件，並經 `Gemini2` review 通過（見 task board `review_notes_zh`，通過候選 SHA `23b4151e477c30b33703acaf3c2509226d4e71ac`，分支 `gemini/sr-qa-call-001`）。但該 candidate 從未合併至 `origin/dev`，交接階段 worker stall 437 秒後被 supervisor 終止並觸發 failure streak，Chairman 因而將 owner 由 `Gemini` 重新指派為 `Claude2`。

`Claude2` 在目前 `origin/dev` tip（與原 Base SHA 相同的 `b671bfc72e8a9d969fed1c872b80abc8842ed6f9`）上，以 `git checkout 23b4151e477c30b33703acaf3c2509226d4e71ac -- <path>` 將原本審查通過的 7 個檔案（僅限本任務 `write_scopes`）搬移進 `claude2/sr-qa-call-001` 分支，未重寫或重做既有已審查邏輯，並在下方第 4 節重新執行、記錄本次（Claude2 lane）之實際指令與結果，作為目前 SHA 的回歸證據。

### 重現過程中發現並修正的驗收套件缺陷

`Gemini` 的原始交接證據只執行了 `pnpm exec vitest run`（esbuild transpile-only，不做型別檢查）與 `ops-console-web` 的 `typecheck`，未曾對這批新增測試檔案執行專案根 `pnpm typecheck:root`。`Claude2` 在重現時額外執行 `pnpm typecheck:root`，發現移入的 7 個檔案中有 6 個檔案的測試字面值與目前權威 `packages/contracts/src/index.ts` 型別／`apps/api` 服務命令定義不符（欄位已不存在或列舉值不合法），會導致 `pnpm typecheck` 於 CI 失敗，雖不影響 `vitest run` 的執行期斷言。因這些檔案完全落在本任務 `write_scopes` 之內，`Claude2` 已直接修正欄位/列舉值以符合權威 API／資料模型（未改動任何 `apps/api`、`packages/contracts` 等業務程式碼），修正內容：

- `c043-callcenter-workflow.test.ts`：移除 `announceAgentIdentity` 呼叫中不存在的 `agentName` 欄位（`AnnounceCallAgentIdentityCommand` 僅有 `agentId`/`announcedAt`）；移除 `linkOrderToExistingSession` 呼叫中不存在的 `agentId` 欄位（`LinkCallOrderCommand` 僅有 `orderId`）；`callType` 的非法值 `"inquiry"`／`"emergency"` 改為合法列舉 `"general_inquiry"`（`CALL_TYPES` 僅含 `booking`/`complaint`/`callback`/`lost_and_found`/`general_inquiry`）。
- `c044-cti-recording-callback.test.ts`：Webhook payload 移除不存在的 `error_code`/`error_message` 欄位，改用 `SandboxWebhookPayload` 實際定義的 `disposition` 欄位記錄失敗原因。
- `c045-complaint-lifecycle-sla.test.ts`：`severity` 的非法值 `"critical"`／`"low"` 改為合法列舉 `"high"`／`"normal"`（`CreateComplaintCaseCommand.severity` 僅有 `"normal"|"high"`）；`caseSource` 非法值 `"passenger"` 改為合法列舉 `"app"`。修正後發現 `severity: "high"` 會觸發 `ComplaintService.calculateSlaDueAt` 的高優先權減半邏輯（`apps/api/src/modules/complaint/complaint.service.ts:736`：`severity === "high"` 時 SLA 工時減半），導致原斷言「safety_concern 4 小時 SLA」失敗（實際變 2 小時）；因此第一個案例改用 `severity: "normal"` 以維持原本驗證 `DEFAULT_SLA_HOURS_BY_CATEGORY.safety_concern = 4` 的意圖，其餘不檢查精確工時的案例維持 `"high"`。
- `c046-incident-suppression-recovery.test.ts`：`updateIncident` 呼叫中欄位 `resolutionNotes` 改為權威型別 `UpdateIncidentCommand.resolutionNote`（單數）。
- `c047-sos-duty-lifecycle.test.ts`：`originalTriggeredAt`／`serverReceivedAt` 型別為 `string | null`，兩處 `new Date(...)` 呼叫改為使用已知非空來源值／非空斷言，避免 `null` 型別錯誤。
- `sr-qa-call-001.spec.ts`（E2E）：`UatEvidenceBundle` 型別並無 `limitations` 欄位（實際欄位名為 `unimplementedLiveSurfaces`，見 `tests/e2e/system-remediation/shared/evidence-recorder.ts:349`），兩處斷言 `bundle.limitations` 改為 `bundle.unimplementedLiveSurfaces`。

修正後 `pnpm typecheck:root` 對本任務 `write_scopes` 內所有檔案均無錯誤（見第 4 節指令紀錄）；`pnpm exec vitest run tests/unit/system-remediation/sr-qa-call-001/` 44 項測試修正前後皆為全數通過（其中 1 項因 severity 列舉修正而短暫迴歸，已修回並重新驗證通過）。

## 1. 重現與基準

`origin/dev` 在本任務開始時基準為 `b671bfc72e8a9d969fed1c872b80abc8842ed6f9`（已含前置任務 `SR-UAT-HARNESS-001`、`SR-FLEET-CASE-001`、`SR-OPS-SHELL-001` 等交付）。9/6 audit SHA 是歷史觀察而非當前程式真值；本任務直接從目前 `dev` 基準出發，不重做或回退既有修復。

### 缺口重現

依據能力目錄（`capabilities.json`）中 C043–C047 之定義，在進入本任務前存在以下驗收缺口：

1. **C043（客服專員：通話建檔、caller 查找、轉訂單／客訴）**：
   - 雖有 callcenter 畫面與後端服務，但缺乏針對同一 call ID 連貫執行開通通話、宣告專員身分、關聯訂單（`linkOrder`）並同步更新 callback 任務、關聯客訴案件（`transferCallToComplaint`）、轉移事故（`transferCallToIncident`）的完整閉環測試；
   - 缺乏對非法電話格式（`CALLER_PHONE_REQUIRED`）、不存在的通話識別碼（`CALL_SESSION_NOT_FOUND`）、空白客訴案號（`CASE_NO_REQUIRED`）及通話保留期內 callerPhone 不可竄改性（SD §6.4）之負向邊界驗證。
2. **C044（CTI／錄音 callback 來源：真電話接入、排隊、錄音與補件）**：
   - 缺乏 CTI sandbox webhook 接入（`call.started`、`recording.ready`、`recording.failed`）與延遲錄音（late recording callback）補件驗收；
   - 通話若先於錄音關閉（closed），錄音補件到達時是否能正確更新錄音狀態至 `ready` 且不丟失關聯訂單／客訴，缺乏可重跑驗收；
   - 缺乏依據角色身分進行錄音資料授權播放與脫敏遮蔽（未授權使用者如 `guest_viewer` 或跨品牌租戶之 recordingUrl 與 ref 必須安全脫敏）之回讀驗證。
3. **C045（客訴專員：分類→指派→調查→回覆→結案／重開）**：
   - 缺乏分類對應 SLA 小時數（如 safety_concern 4小時、late_arrival 24小時、lost_and_found 72小時）的自動計算驗證；
   - 缺乏指派專員（`assigneeId`）、調查筆記追加（`addComplaintCaseNote`）、解決方案合規性檢查（`COMPLAINT_CATEGORY_VALID_RESOLUTIONS`）、正式結案後使用**同一案件編號重開**（`reopenComplaintCase`，保留原始 `caseNo`、`reopenCount` 遞增、SLA 重新計算）的閉環驗證；
   - 缺乏未結案前非法重開（409 `COMPLAINT_NOT_CLOSED`）、空白重開理由（400 `VALIDATION_ERROR`）與分類不符之處置碼拒絕等負向驗收。
4. **C046（事故處理員：事故→責任／附件→限制派車→恢復）**：
   - 缺乏建立事故後針對相關司機自動啟動派車供給限制（`matchingSuppression.active: true`，預設 24 小時 TTL）的斷言驗證；
   - 缺乏營運主管身分（`ops_manager`）延長抑制時間（`extendMatchingSuppression`）及非主管身分拒絕（403 `OPS_MANAGER_REQUIRED`）之權限防護驗證；
   - 缺乏多項服務恢復行動（`passenger_recontact`、`fare_adjustment`、`driver_reassigned`）之版本保留與時間軸完整記載驗證；
   - 缺乏事故結案或解決後自動解除派車抑制（`matching_suppression_lifted`）、恢復司機接單能力的驗收。
5. **C047（SOS 值班人員：收警→認領→處置→解除與回執）**：
   - 缺乏司機端發起 SOS 後自動分配事故案件（`receipt.incidentId`）與派車抑制的端到端連鎖驗證；
   - 缺乏網路重送／離線重播情境下，相同 `(driverId, clientEventId)` 冪等去重（`duplicate: true`）且不重複建案的驗證；
   - 缺乏背景斷線／離線觸發（`offlineAtTrigger: true`）的時間戳記保留與傳輸延遲計算驗證；
   - 缺乏值班臺警報渲染回執（`recordOpsAlertsRendered`）與延遲指標統計（`getOpsAlertLatencySummary`，驗證 sampleCount 與 <= 5000ms 目標達成率）的驗證；
   - 缺乏非 UUID v4 識別碼、非司機身份發送 SOS（403）與未來時間戳記超限（> 5分鐘）之防護驗證。

---

## 2. 這個任務做了什麼

本任務在授權的 `write_scopes` 內建立了完整的五大能力閉環驗收套件與端到端測試規格：

### 1. 單元與整合驗收套件 (`tests/unit/system-remediation/sr-qa-call-001/`)

1. **`c043-callcenter-workflow.test.ts` (9 項測試全數通過)**
   - 驗證 `openCallSession` 建立通話、caller 查找、宣告專員身分（`announceAgentIdentity`）與審計日誌記錄；
   - 驗證同 call ID 關聯訂單（`linkOrderToExistingSession`）並同步更新 callback 任務關聯；
   - 驗證同 call ID 轉客訴案件（`transferCallToComplaint`）與案件關聯（`linkCaseToCallSession`），確認雙向 ID 參照（`session.linkedCaseNo` 與 `complaintCase.relatedCallId`）；
   - 驗證通話轉移事故案件（`recordIncidentTransfer`）並記錄 `incident_transferred` 標記；
   - 負向案例：拒絕空白電話號碼（400 `CALLER_PHONE_REQUIRED`）、拒絕查詢不存在的通話（404 `CALL_SESSION_NOT_FOUND`）、拒絕不存在通話之建單關聯、拒絕空白客訴案號（400 `CASE_NO_REQUIRED`）；
   - 邊界防護：驗證 SD §6.4 規定通話保留期內 `callerPhone` 具備不可竄改性，後續訂單關聯不得覆蓋原始進線電話。

2. **`c044-cti-recording-callback.test.ts` (9 項測試全數通過)**
   - 驗證 CTI Sandbox Webhook 接入 `call.started` 事件，自動建立並綁定外部進線通話；
   - 驗證通話中錄音 callback 到達（`attachRecordingCallback`），狀態轉移為 `ready`，標記加上 `recording_bound` 並移除 `recording_pending`；
   - 驗證**延遲錄音（Late Recording）**情境：通話先關閉（`closeCallSession`，狀態 `closed`、`recordingState: "missing"`），錄音 callback 延遲到達後成功補件，狀態轉為 `ready`、標記更新為 `recording_bound`，且維持既有關聯訂單與通話關閉生命週期；
   - 驗證角色身分與品牌錄音存取授權（UV-019 / Evidence Governance）：
     - 具備 `call_recording:read` / `ops_operator` 授權者取得完整 URL 與 providerRecordingRef；
     - 未授權之 `guest_viewer` 或跨租戶身分讀取時，錄音識別碼、URL 與 providerRef 全數遮蔽脫敏，狀態顯示為 `missing`，前端呈現 `recording_unauthorized`；
   - 負向案例：Webhook 回報錄音失敗（`recording.failed`）正確標記 `recording_missing`；拒絕空錄音識別碼（400 `RECORDING_ID_REQUIRED`）；拒絕不存在通話之錄音綁定（404 `CALL_SESSION_NOT_FOUND`）；拒絕未支援之 Webhook 事件（400 `SANDBOX_EVENT_TYPE_UNSUPPORTED`）；拒絕缺失 provider_call_id（400 `PROVIDER_CALL_ID_REQUIRED`）。

3. **`c045-complaint-lifecycle-sla.test.ts` (8 項測試全數通過)**
   - 驗證各類別客訴進線建立與自動 SLA 目標計算（`safety_concern` 4小時、`late_arrival` 24小時、`lost_and_found` 72小時）；
   - 驗證指派客訴專員（`assignComplaintCase`，更新 `assigneeId` 與狀態 `assigned`）；
   - 驗證追加調查筆記（`addComplaintCaseNote`，寫入時間軸 `case_note_added`）；
   - 驗證合規處置碼結案（`resolveComplaintCase` 與 `closeComplaintCase`，狀態轉移至 `closed`）；
   - 驗證**同一案號重開**（`reopenComplaintCase`）：原始 `caseNo` 嚴格保留、狀態轉為 `reopened`、`reopenCount` 遞增、SLA 重新計算並寫入 `sla_recalculated` 時間軸；
   - 負向案例：拒絕與類別不相符之處置碼（400 `RESOLUTION_CODE_NOT_VALID_FOR_CATEGORY`）；拒絕完全不存在於規格的處置碼（400 `INVALID_RESOLUTION_CODE`）；拒絕重開未結案之案件（409 `COMPLAINT_NOT_CLOSED`）；拒絕空白重開理由（400 `VALIDATION_ERROR`）；
   - 驗證逾期案件觸發 SLA 違規判定（`slaBreach: true`）並寫入 `sla_breached` 時間軸。

4. **`c046-incident-suppression-recovery.test.ts` (8 項測試全數通過)**
   - 驗證重大事故通報（`createIncident`）自動觸發司機派車抑制（`matchingSuppression.active: true`，預設 24 小時 TTL），並寫入 `matching_suppression_activated` 時間軸；
   - 驗證營運主管（`ops_manager`）依調查需要延長抑制期限（`extendMatchingSuppression`，展延 `extendByHours`），並記錄展延原因；
   - 驗證服務恢復行動（`recordServiceRecoveryAction`）支援 `passenger_recontact`、`fare_adjustment`、`driver_reassigned` 等多版本行動歷史與時間軸記錄；
   - 驗證事故調查完成解決（`status: "resolved"`）時，自動解除派車抑制（`matchingSuppression.active: false`，記錄 `liftedAt`），恢復司機派單能力；
   - 負向案例：非 `ops_manager` 身分嘗試展延抑制遭 403 拒絕（`OPS_MANAGER_REQUIRED`）；無活動抑制之事故嘗試展延遭 409 拒絕（`MATCHING_SUPPRESSION_NOT_ACTIVE`）；拒絕非法的恢復行動類型（400 `VALIDATION_ERROR`）；拒絕查詢不存在之事故（404 `NOT_FOUND`）。

5. **`c047-sos-duty-lifecycle.test.ts` (10 項測試全數通過)**
   - 驗證司機發起重大 SOS 警報（`submitSosEvent`），系統自動關聯事故案件（`receipt.incidentId`）並啟動派車抑制；
   - 驗證網路重送冪等去重：相同 `(driverId, clientEventId)` 再次提交時回傳 `duplicate: true`，保留原事件屬性且不重疊建案；
   - 驗證離線觸發（`offlineAtTrigger: true`）精確保留 `originalTriggeredAt`，計算到達伺服器之傳輸時差；
   - 驗證值班臺渲染回執（`recordOpsAlertsRendered`）：記錄警報渲染時間戳記、計算到值班臺延遲、重複渲染回執去重；
   - 驗證延遲指標彙整（`getOpsAlertLatencySummary`）：回傳樣本數、5000ms 目標達成數與達成率；
   - 驗證事故附件上傳閉環：產生上傳意圖（`createAttachmentUploadIntent`）、確認上傳並校驗 SHA-256 雜湊（`confirmAttachmentUpload`）、清單回讀（`listAttachments`）；
   - 負向案例：拒絕非 UUID v4 格式之 clientEventId（400 `VALIDATION_ERROR`）；拒絕非 driver realm 發送 SOS（403）；拒絕為不存在之事故記錄渲染回執（404 `DRIVER_SOS_ALERT_NOT_FOUND`）；拒絕未來超過 5 分鐘之渲染時間（400 `VALIDATION_ERROR`）；拒絕無效時間區間（from > to，400 `VALIDATION_ERROR`）。

### 2. 端到端 Playwright 驗收規格 (`tests/e2e/system-remediation/sr-qa-call-001/`)

- 建立 `sr-qa-call-001.spec.ts`，重用 `tests/e2e/system-remediation/shared/` 之 UAT Harness：
  - `UatNamespaceManager`：配置 5 個平行測試 shard（shard 0 至 shard 4），互斥隔離，執行完畢自動清理；
  - `UatEvidenceRecorder`：記錄 Base SHA（`b671bfc72e8a9d969fed1c872b80abc8842ed6f9`）、Candidate SHA、HTTP 呼叫、狀態碼、PII 脫敏、產物 SHA-256 雜湊值；
  - 涵蓋 E2E-C043（通話轉單與客訴）、E2E-C044（CTI 接入與延遲錄音）、E2E-C045（客訴生命週期與重開）、E2E-C046（事故派車抑制與恢復）、E2E-C047（SOS 警報去重、延遲與附件）；
  - 明確記錄外部 PSTN Gate（`UV-028`）與實體硬體斷線延遲限制。

---

## 3. 驗收條件對應

| 驗收條件 | 對應實作與證據 |
| :--- | :--- |
| **每個列出能力有正常＋關鍵負向案例與可重跑命令；已有功能先驗而非重寫** | 本任務在 `tests/unit/system-remediation/sr-qa-call-001/` 針對 C043、C044、C045、C046、C047 分別建立了 5 個獨立測試檔案，共包含 44 項單元與整合測試。各能力均包含正常閉環路徑（通話開立→關聯訂單／客訴／事故、CTI 接入→錄音補件→延遲錄音、客訴指派→結案→同案號重開、事故派車抑制→展延→恢復、SOS 警報→去重→延遲回執）與關鍵負向路徑（非法電話、不存在識別碼、未支援 Webhook、不合規處置碼、非主管權限拒絕、非司機身分拒絕、非 UUID v4 拒絕等）。完全沿用現有 API 與資料模型，零破壞性重寫。 |
| **不能只跑render/常數檢查；檢驗write後DB/API回讀以及必要資源間關聯** | 所有測試均驗證 write 後的回讀一致性：<br>1. 通話寫入後回讀 `linkedOrderId`、`linkedCaseNo` 及 callbackTask 同步；<br>2. 錄音 callback 寫入後回讀 `recordingState: "ready"` 與 `recording_bound` 標記；<br>3. 客訴結案後以同一案號重開，回讀原始案號一致性、`reopenCount` 遞增、SLA 重新計算與時間軸記錄；<br>4. 事故寫入後回讀司機 `matchingSuppression.active`，解決後回讀 `active: false` 與 `liftedAt`；<br>5. SOS 寫入後回讀關聯事故 ID、派車抑制、值班臺渲染回執延遲毫秒數與附件 SHA-256 雜湊值。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功** | 本文件第 1 節記錄 Base SHA、第 4 節記錄實際執行指令與 exit code；第 5 節完整明列未做的真機/live 部分（如 PSTN 實體線路屬 `UV-028` 外部 Gate、實體車機 CAN-bus 硬體按鈕等），誠實記錄邊界。 |
| **先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案** | 實作完成後以 task-scoped anchor commit 提交、push 至遠端分支，再透過 `ai-status.sh handoff` 交付 `Gemini2` 獨立 review。 |

---

## 4. 實際指令與結果

以下為 `Claude2` lane 在 worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-qa-call-001`（分支 `claude2/sr-qa-call-001`，base `b671bfc72e8a9d969fed1c872b80abc8842ed6f9`）重新執行之結果，作為目前 SHA 的回歸證據：

```bash
# 1. 檢查 whitespace 與程式碼排版
$ git diff --check
(exit 0，無任何空白字元或排版錯誤)

# 2. 執行本任務專屬單元與整合驗收測試套件（欄位/列舉修正後重跑）
$ pnpm exec vitest run tests/unit/system-remediation/sr-qa-call-001/
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-qa-call-001

 Test Files  5 passed (5)
      Tests  44 passed (44)
   Start at  19:58:52
   Duration  2.27s (transform 3.03s, setup 0ms, import 6.08s, tests 98ms, environment 1ms)
(exit 0)

# 3. 全庫型別檢查（Gemini 原始交接未執行，Claude2 重現時補做並發現／修正 6 個檔案的型別缺陷，見上節）
$ pnpm typecheck:root
...
(exit 2 → 修正後對本任務 write_scopes 內所有檔案 0 筆錯誤；exit 2 之殘餘錯誤全部位於 write_scopes 之外的既有檔案：
 tests/unit/fleet-partner-list-envelope.test.ts、
 tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts、
 tests/unit/system-remediation/sr-iam-001/r05-session-governance.test.ts、
 tests/unit/system-remediation/sr-deps-report-font-001/font.test.ts、
 tests/unit/system-remediation/sr-report-001/*.test.ts
 — 這些檔案在本任務 base SHA 即已存在此狀態，與本任務無關，不在 write_scopes 內不得修改，此處僅如實記錄以說明 exit 2 之來源，非本任務新增缺陷)

# 4. 檢查相關 Web 前端型別健全度
$ pnpm --filter @drts/ops-console-web typecheck
> @drts/ops-console-web@0.1.0 typecheck /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-qa-call-001/apps/ops-console-web
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
(exit 0)
```

歷史紀錄（`Gemini` lane，同一套測試檔案內容，分支 `gemini/sr-qa-call-001`，commit `23b4151e477c30b33703acaf3c2509226d4e71ac`，已由 `Gemini2` review 通過但未合併）：

```bash
$ pnpm exec vitest run tests/unit/system-remediation/sr-qa-call-001/
 Test Files  5 passed (5)
      Tests  44 passed (44)
   Start at  19:21:57
   Duration  2.27s
(exit 0)
```

---

## 5. 未做的部分（明列，不冒充成功）

1. **未接入真實外部電信 PSTN 實體交換機與真 E1/SIP 中繼線路（C044）**：
   - 本任務驗證了 Sandbox Webhook 接入、錄音 Callback、通話關閉後延遲補件與角色權限脫敏遮蔽；
   - 真實 PSTN 實體電話交換機、多局線排隊與實體電信業者線路切換屬於外部 Gate 任務 `UV-EXEC-028` 之範疇，本任務不冒充真實電信 PSTN 通話已通過。
2. **未包含實體車載硬體 SOS 按鈕與物理高山蜂巢基地台斷訊（C047）**：
   - 本任務驗證了司機端離線觸發時間戳記保留、伺服器到達時間時差計算、相同 EventId 網路重播去重、值班臺渲染回執延遲統計與 SHA-256 附件校驗；
   - 車輛實體 CAN-bus 硬體 SOS 開關物理信號與真實無基地台區域物理斷線，屬於真機與車載硬體整合驗收範疇。
3. **VM 執行環境限制說明**：
   - 依據本次 Supervisor 指派守則：「VM restriction: supervisor/workers may run repository checks, but must not start product development servers, preview/browser test servers, or Docker Compose infrastructure here. Do not run `pnpm exec playwright`, `playwright test`, `pnpm dev`, or `docker compose`」；
   - 因此 Playwright 瀏覽器測試套件（`tests/e2e/system-remediation/sr-qa-call-001/sr-qa-call-001.spec.ts`）已完整建立並整合共用 UAT Harness，供 GitHub-hosted remote runner 執行，本地 VM 恪遵限制未啟動瀏覽器或本地服務。

---

## 6. Write scope 遵守情況

本任務嚴格遵守 `write_scopes`，未修改任何全域或未指派之核心程式碼：

- `tests/unit/system-remediation/sr-qa-call-001/`：
  - `c043-callcenter-workflow.test.ts`
  - `c044-cti-recording-callback.test.ts`
  - `c045-complaint-lifecycle-sla.test.ts`
  - `c046-incident-suppression-recovery.test.ts`
  - `c047-sos-duty-lifecycle.test.ts`
- `tests/e2e/system-remediation/sr-qa-call-001/`：
  - `sr-qa-call-001.spec.ts`
- `docs/04-uat/system-remediation-20260906/SR-QA-CALL-001.md`（本驗收文件）
