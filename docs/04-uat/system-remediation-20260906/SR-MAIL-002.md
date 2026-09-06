# SR-MAIL-002 — 簽核通知與接近逾時提醒真正寄送

- Owner: Claude2；independent reviewer: Claude。
- Branch: `claude2/sr-mail-002`。
- Initial base: `3014f9a4942f73f89c0a6f8458dc8b042c1034d0`（`git fetch origin` 後即 origin/dev 當時 HEAD，也是 SR-NOTIFY-001 依賴的合併 commit）。
- 執行期間 origin/dev 又前進到 `48b4bc4c5fe0f35a343f4b8c24ccb47f46a379c0`（新增 SR-ARTIFACT-001、SR-DEPS-001，皆不觸及本 task 的 write_scopes）；本次 worker 環境的 `git rebase` 未被授權執行（非 wildcard 允許的 bash 指令），因此分支仍以 `3014f9a49` 為 base，未 rebase。若 merge 前需要與最新 dev 對齊，請 supervisor/CI 依一般流程處理，本文件如實記錄此差距，不假裝已 rebase。
- 最終 candidate SHA 由下列 handoff 寫入 task machine truth（文件不能包含自身 commit hash）。

## 目前基準重現與來源

`AuditNotificationEmailAdapter.send()`（base）只把訊息塞進 process-local array 並回傳一個帶隨機 `deliveryId`/`sentAt` 的假紀錄；沒有呼叫任何真實 delivery 元件，`sentAt` 一律等於呼叫當下時間，不代表任何 provider acknowledgement。`AuditNotificationService.dispatchApprovalNotification` 的 audit log 只記錄 `channelCounts.email` 的「已呼叫次數」，不區分成功/失敗/未設定；`in-app` 與 `email` 狀態沒有分離。

追溯：`source/new-gaps.json` N07；`source/capabilities.json` C026（簽核通知）、C061（證照提醒沿用同一 adapter，未在本 task 範圍內接線）、C079（帳單，亦未接線，僅共用核心）。本次僅接線 `apps/api/src/modules/audit-notification/*` 內既有的簽核通知 5 事件（`new_request`／`approaching_timeout`／`escalated`／`approved`／`rejected`），不擴大到 C061/C079 的其他呼叫端（不在 write_scopes 內）。

`tenant-partner.service.ts`（`dispatchApprovalNotifications` 私有方法、`hasApprovalNotificationDispatch` 呼叫點）是唯一真實業務呼叫端；其對 `dispatchApprovalNotification` 的輸入/輸出 contract（`{ deduplicated, deliveredToUserIds, skippedUserIds }`）維持不變，未修改該檔案（不在 write_scopes）。

## 核心設計與交付界線

- `AuditNotificationEmailAdapter` 改為注入 SR-NOTIFY-001 的 `NotificationDeliveryService`（`@Optional()`，預設 `null`）。每個 (approvalRequestId, templateKey, recipientUserId) 對應一個穩定 `idempotencyKey`；`send()` 先 `enqueue`（durable、tenant 內去重），再視 receipt 狀態決定是否呼叫 `dispatch`：**已經是 `sent` 的 receipt 不會再次 dispatch**，即「retry 不重寄已成功事件」的實際保證來源（由 `NotificationDeliveryService` 本身的 idempotency 保證，非本 adapter 額外加鎖）。
- 回傳的 `AuditNotificationEmailDeliveryRecord.status` 只有在 `NotificationDeliveryService` 回報 `sent`（即真實 provider acknowledgement）時才是 `"sent"`；未設定 outbox 目錄回傳 `"unavailable"`，provider 不可用/永久失敗/驗證錯誤/儲存例外一律回傳 `"failed"`，兩者都保證 `sentAt: null`。`send()` 本身**不會拋出**：任何 `enqueue`/`dispatch` 例外都在 adapter 內攔截並轉成有界 (`/^[a-z][a-z0-9_]{0,99}$/i`) 的 `errorCode`，避免單一收件人格式錯誤中斷同批次其餘收件人的處理（base 版本沒有這層防護，格式錯誤的 email 會讓整個 `for` 迴圈拋出並跳過稍後的 audit log 寫入與其餘收件人）。
- `AuditNotificationModule` 新增 `createAuditNotificationDeliveryService()` 工廠：讀 `NOTIFICATION_OUTBOX_DIRECTORY`（沿用 SR-NOTIFY-001 慣例的絕對路徑）；未設定時回傳 `null`（模組正常啟動、adapter 降級為 `unavailable`），已設定時建立 `FileMailOutbox` + `createMailpitSmtpTransportFromEnv(process.env)`（沿用既有 `MAILPIT_SMTP_PORT`）。此設計刻意模仿 `AuditLogRepository`/`DatabaseService` 既有的 `@Optional()` 降級模式，因為 `AuditNotificationModule` 被 30+ 個其他 module 以固定 class token（非 dynamic `.register()`）引入，任何在缺環境變數時的啟動拋錯都會波及全部呼叫端；改為顯式 factory 不需要改動任何其他 module 的 import。
- `AuditNotificationService.dispatchApprovalNotification` 的 audit log `newValuesSummary` 新增分離欄位：`inApp: { delivered }`（同步、必成功的 in-memory 寫入次數）與 `email: { attempted, sent, failed, unavailable, recipients: [{ userId, status, deliveryId, errorCode }] }`（來自真實 adapter 回傳、逐收件人真實狀態）。移除舊有含糊的 `channelCounts.email`（純呼叫次數，未區分結果）；沒有其他程式碼或測試讀取該欄位（已搜尋 `apps/api/src`、`tests`，僅 service.ts 自身使用）。
- 既有 `hasApprovalNotificationDispatch`（依 `approvalRequestId` + `templateKey` 判斷是否已寫過 audit log）與外部呼叫端的重試/輪詢節奏維持不變 — 本 task 不修改 `tenant-partner.service.ts`，也不擴大該 gate 的語意（例如讓它感知 email 是否真的送達）。「重試不重寄已成功事件」在本 task 的驗證範圍限定於 adapter 自身的 idempotencyKey 保證（見上），不涉及 `tenant-partner.service.ts` 的輪詢重試策略；此為刻意的 scope 邊界，非遺漏。
- Phase2 排除項（沿用 task brief）：自動逾時升級、正式 SMTP/provider credentials、外部收件匣、C061/C079 呼叫端接線、`tenant-partner.service.ts` 的輪詢重試策略調整均不在本次交付範圍。

## 驗證

2026-09-06 UTC，於本 worktree（`/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-mail-002`）以 base `3014f9a49` 執行：

| 指令                                                                                                                                                                                                                                                                                    | Exit | 實際結果                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| `git diff --check`                                                                                                                                                                                                                                                                      | 0    | 無 whitespace errors                           |
| `npx tsc -p apps/api/tsconfig.json --noEmit`（等效 `pnpm --filter @drts/api typecheck`；本 worker 環境 `pnpm` 未在 PATH 上且無權限修改，改用 repo 既有 `node_modules/.bin` 經 `npx` 呼叫同一支 `tsc`）                                                                                  | 0    | 無 TypeScript errors                           |
| `npx vitest run tests/unit/system-remediation/sr-mail-002/`（等效 `pnpm exec vitest run tests/unit/system-remediation/sr-mail-002/`）                                                                                                                                                   | 0    | 3 files / 25 tests passed；07:11:30 UTC，3.32s |
| `npx vitest run tests/unit/system-remediation/sr-notify-001/`（回歸：確認未破壞既有共用核心測試）                                                                                                                                                                                       | 0    | 3 files / 42 tests passed                      |
| `npx vitest run tests/unit/audit-notification.test.ts tests/unit/billing-settlement.service.test.ts tests/unit/callcenter.test.ts tests/unit/tenant-invitation-lifecycle.test.ts`（其他既有 `AuditNotificationService` 消費端回歸）                                                     | 0    | 4 files / 15 tests passed                      |
| `npx vitest run tests/unit/tenant-partner-foundation.test.ts`（唯一真實業務呼叫端 `TenantPartnerService` 的既有回歸，`new AuditNotificationService()` 零參數建構驗證預設降級路徑）                                                                                                      | 0    | 1 file / 25 tests passed                       |
| `npx eslint apps/api/src/modules/audit-notification apps/api/src/modules/notification-delivery tests/unit/system-remediation/sr-mail-002 --max-warnings=0`                                                                                                                              | 0    | 無 errors/warnings                             |
| `npx prettier --check apps/api/src/modules/audit-notification/audit-notification.email-adapter.ts apps/api/src/modules/audit-notification/audit-notification.module.ts apps/api/src/modules/audit-notification/audit-notification.service.ts tests/unit/system-remediation/sr-mail-002` | 0    | All matched files use Prettier code style      |

新增 25 個測試涵蓋：

- `audit-notification-email-adapter.test.ts`（13）：5 種事件皆對受控 fake receiver（injected `MailTransport`）驗證正確 `tenantId`／`recipientEmail`／subject／body 抵達；同一事件重複呼叫不二次 dispatch（idempotent retry）；跨 tenant 的 idempotency 隔離；transport 未設定 → `failed`／`sentAt: null`；完全沒有 delivery service → `unavailable`；provider 永久拒絕 → `failed` 且不重試；無效收件人地址不拋出、回傳有界 errorCode；內部例外訊息不會原樣外洩到 `errorCode`；`listDeliveries()` 回傳防禦性拷貝。
- `audit-notification-service.dispatch.test.ts`（8）：5 種事件透過 `AuditNotificationService.dispatchApprovalNotification` 端對端驗證 tenant/recipient 正確、opt-out 收件人被跳過且不觸發 email、audit log 的 `inApp`/`email` 分離欄位、per-recipient 真實狀態；既有 `hasApprovalNotificationDispatch` dedup 不重寄 email 的回歸；transport 未設定或永久失敗時 audit log 明確記錄未送達（`sent: 0`），不冒充成功；完全無 delivery service 時記錄 `unavailable`。
- `audit-notification-module.test.ts`（4）：`NOTIFICATION_OUTBOX_DIRECTORY` 未設定時模組降級不崩潰；設定後建立真實 `NotificationDeliveryService`；`MAILPIT_SMTP_PORT` 一併設定時 `availability()` 回報 `available`。

以上皆為注入的受控 receiver（fake `MailTransport`）與既有 `FileMailOutbox`／`NotificationDeliveryService`（SR-NOTIFY-001 已驗證的耐久核心），不是新的即時 SMTP/Mailpit 網路測試。

## 未做的 live／真機部分（明列，不冒充成功）

- 未針對本次交線重新啟動 Mailpit container 做即時 SMTP 收件驗證；SR-NOTIFY-001 的 evidence（`docs/04-uat/system-remediation-20260906/SR-NOTIFY-001.md`）已對同一 `MailpitSmtpTransport`／`NotificationDeliveryService` 核心做過真實 TCP/SMTP 收件驗證，本 task 的 `createAuditNotificationDeliveryService()` 只是重新組裝同一組已驗證元件，未變更其協定實作。
- 本 worker 環境的 bash 權限不包含 `docker`（嘗試 `docker --version` 被歸類為需額外授權而未執行），因此無法在本次 session 內另外起一個 Mailpit container 做端到端重放；如需要，請由具備 docker 權限的 reviewer/CI 執行。
- 未執行 `git rebase origin/dev`（同樣因為權限分類，未落在允許的 bash 樣式內）；分支 base 仍停在 `3014f9a49`，落後 origin/dev 兩個不相關 commit（`SR-ARTIFACT-001`、`SR-DEPS-001`），皆不觸及本 task 的 write_scopes 檔案。
- 未接線 C061（證照提醒）、C079（帳單）等其他潛在呼叫端；`AuditNotificationEmailAdapter`/`AuditNotificationService` 的既有輸出 contract 對它們維持相容，但沒有新增測試涵蓋它們（不在 write_scopes / task brief 範圍）。
- 未修改 `tenant-partner.service.ts` 的輪詢重試節奏；`hasApprovalNotificationDispatch` 對同一 approvalRequestId+templateKey 的 dedup 仍是「audit log 是否存在」而非「email 是否真的送達」，這是既有外部呼叫端的既定行為，本 task 未擴大其語意。

## Candidate handoff

實作及 evidence 完整 commit 後普通 push，使用：

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Claude2 /home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-99f7e0e56/tools/development-orchestrator/bin/ai-status.sh \
  handoff SR-MAIL-002 Claude "email adapter 接線真實 NotificationDeliveryService；in-app/email 狀態分離；見 task evidence"
```

精確 candidate SHA、branch、reviewer 與 state 以同一 release 的 `ai-status.sh show SR-MAIL-002` 讀回。owner 不寫 `done`；獨立 review、同 candidate CI 及 merge 尚待 lifecycle 完成。
