# PUSH-FIRST-PARTY-FCM-20261006

Owner: Claude2 · Reviewer: Codex

## 依據與定位

- 依本 task spec（`.local/passenger-push-channel-20261006/PUSH-FIRST-PARTY-FCM-20261006.md`）、`common.md`、`docs/02-architecture/passenger-notification-channel-routing-20261006.md` D6、AI_COLLABORATION_GUIDE.md §0.7 執行。前置依賴 `PUSH-CHANNEL-ROUTER-20261006`（f270fdbaf）已 merge 進 `origin/dev`，分支基底即為該狀態；分支名稱、base 均依 `docs/ops/branch-strategy.md` §11。
- 現況核實（分支基底 `origin/dev` f270fdbaf）：
  - `MultiTaxiService.deliverRoutedPassengerNotification` 原本把 `resolvePassengerNotificationChannel` 的 `first_party_app`/`ambiguous`/`none` 三種非夥伴結果一律轉給 `deliverNonPartnerChannelOutcome`，`passenger-notification-channel-router.ts` 的 `resolveNonPartnerChannelOutcome("first_party_app")` 永遠回 `configuration_blocked`（旗標關閉與「沒有 transport」在上一波永遠同時成立，純函式故意不讀旗標）。
  - `infra/migrations/` 最大是 V0107；V0108（本 task 的投遞 context 表）尚未建立，`schema-allocation.json` 的 `passenger_push_channel_allocations` 已預留其欄位與 CHECK 清單。
  - `passenger-push-devices` module 已有 `resolveActiveDevices`/`invalidateDevice`/`registerDevice`/`revokeDevice`，`FIRST_PARTY_PUSH_DEVICE_RESOLVER` token 已存在但尚未被任何 module 綁定注入（`PassengerPushDevicesModule` 自己 export，`MultiTaxiModule` 尚未 import）。
  - `apps/api/src/common/google-cloud/google-cloud-object-client.ts` 已有可重用的 `GoogleMetadataTokens`/`withCloudDeadline`/`readCloudBody`，沒有 firebase-admin 依賴，沒有 service account key 讀取路徑。

## 設計與實作

### Migration（V0108）

- `infra/migrations/V0108__push_channel_first_party_delivery_context.sql`：`mobility.phase1_first_party_notification_delivery_contexts`，欄位與 CHECK 完全依 `schema-allocation.json` 的 `passenger_push_channel_allocations[1]` 逐字對照（`outbox_id` PK FK `ops.consumer_notification_outbox`、`order_id` FK `mobility.phase1_order_first_party_notification_routes`、`target_devices`/`wire_message`/`wire_message_hash`、`event_sequence > 0`、`delivery_target` 固定 `first_party_device`、`delivery_stage`/`retry_disposition`/`failure_reason` 的 CHECK 列舉）。沿用 V0105 的「身份欄位不可變」trigger 寫法（`guard_first_party_notification_context_identity`），只排除 `delivery_stage`/`retry_disposition`/`failure_reason`/`receipt_id`/`delivered_at` 五個結果欄位。
- 與 V0105 的刻意差異：**沒有** `retry_policy_snapshot` 欄位——D6 的重試參數（`FIRST_PARTY_PUSH_RETRY_POLICY`）是固定常數，不像夥伴管道逐 endpoint 核准的政策，不需要逐列快照。

### Provider port（新檔 `first-party-notification.transport.ts`，無 I/O 部分可單元測試）

- `FirstPartyPushProvider` 介面：`send(token, message, options)`，`options` 帶 `projectId`/`ttlSeconds`/`collapseKey`/`expiresAtEpochSeconds`——這些是 FCM 信封層欄位，刻意不放進凍結的 `FirstPartyPushMessage`（contracts 既有型別只有 `notification`/`data`）。
- `FcmHttpV1PushProvider`：`GoogleMetadataTokens` 取 access token（沿用既有類別，沒有新增 service account 路徑）；端點 `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`；10 秒 deadline 包含取 token；`redirect:"error"`；body 用既有 `readCloudBody` 限量讀取。
- `classifyFcmErrorResponse(httpStatus, body, retryAfterSeconds)`：純函式，D6 錯誤對照表——`THIRD_PARTY_AUTH_ERROR`（任何 HTTP 碼）優先判為 `credential_rejected`；404/400 → `invalid`；403 依 `error.status` 是否為 `SENDER_ID_MISMATCH` 分流 `invalid`/`credential_rejected`；401 → `credential_rejected`；429/500/503 及任何未知碼 → `transient`（未知碼刻意回退到 transient，而非猜測成 invalid/credential_rejected，避免誤標裝置或誤判憑證）。200 但沒有 `name` 欄位時也回 transient，絕不合成 receipt。
- 任何逾時／網路／token 取得失敗，外層 `catch` 一律折算成 `transient`——這些都不是裝置或憑證層級的判定，只有真正的 FCM HTTP 回應才能產生那兩類結果。

### Device token 存取（`passenger-push-devices.port.ts`/`.repository.ts`/`.service.ts`）

- `FirstPartyPushDeviceResolverPort`（port.ts 新增，擴充既有 `FirstPartyPassengerPushDeviceResolver`）補上 `invalidateDevice`（既有實作，contracts 介面原本沒列）與新方法 `resolveActiveDeviceSendTargets`。
- `resolveActiveDeviceSendTargets`：與 `resolveActiveDevices` 完全同一條查詢條件（`status='active'` 且 60 天內 `last_seen_at`），只多 SELECT `token` 欄位。這是 raw token 離開本 module 的唯一出口——純 in-process 呼叫，不是任何 HTTP 回應，呼叫端（transport）不得記錄或持久化這個欄位。
- 同一個方法同時服務「首次投遞」（取全部目前 active 裝置建立快照）與「重試」（配合 context 的 `targetDevices` 取交集）——不是兩套查詢。

### 投遞分流（`multi-taxi.service.ts`，只動第一方投遞函式）

- `deliverRoutedPassengerNotification` 新增一個分支：`channel === "first_party_app"` 時改轉 `deliverFirstPartyPushNotification`（不再直接轉 `deliverNonPartnerChannelOutcome`）；`ambiguous`/`none` 完全沒動，`partner_webhook` 完全沒動。
- `deliverFirstPartyPushNotification` 開頭先查旗標/專案 ID/transport/resolver 是否都已注入；任何一項缺failing 時原樣呼叫既有、沒有修改過的 `deliverNonPartnerChannelOutcome(outboxId, "first_party_app")`——與上一波的行為逐位元相同，不發出任何 HTTP 請求。這條路徑被 `tests/unit/push-channel-router-20261006/deliver-passenger-notification-routing.test.ts` 既有的 `first_party_app resolves but has no live transport this wave` 測試鎖住（本 task 寫入範圍外，跑過確認仍通過，見下方指令）。
- 旗標開啟後的流程：
  1. 用既有、未修改的 `claimPartnerNotification` 取得 fence（D7 共用同一套 claim/fence/receipt）。
  2. 非 `receipt_ready` 事件先用既有、未修改的 `findPartnerNotificationRelevance` 重查訂單是否仍有意義；`cancelled/completed/closed/rejected` → `notification_obsolete`；`assignmentVersion` 落後 → `notification_superseded`；兩者都是 `terminal`，只寫 `payload.channelRouting`（見下），不建立/更新 V0108 context 列（這兩個 failure reason 不在 V0108 的 CHECK 清單內，見下方型別邊界）。
  3. 讀既有 context（`findFirstPartyNotificationContext`）；不存在時，先用 `resolveActiveDeviceSendTargets` 取裝置，沒有裝置直接 `no_active_device`/`terminal`（不建立 context，沒東西可凍結）；否則用 `buildFirstPartyPushMessage` 建 wire message、`notificationExpiresAt`（沿用夥伴管道既有、未修改的函式）算到期時間，寫入不可變 `prepareFirstPartyNotificationContext`。
  4. 檢查 context 是否已過期／attemptCount 是否超過 `FIRST_PARTY_PUSH_RETRY_POLICY.maxAttempts`（5）。
  5. 依 D6「重試只送 context 裡的裝置」：取 `context.targetDevices`（deviceId+tokenSha256）與當下 `resolveActiveDeviceSendTargets` 的交集（by deviceId），過濾出仍可送出的裝置；新登錄的裝置、已失效的舊裝置都不在這個交集內。
  6. 逐裝置呼叫 `FcmHttpV1PushProvider.send`；任何 `invalid` 的裝置呼叫既有 `invalidateDevice`；至少一台 `accepted` 即整單 `delivered`/`delivered`，`deliveryTarget=first_party_device`、`deliveryStage=provider_accepted`、`receiptId` 是 FCM 真實 message name；否則依「全部 invalid → no_active_device/terminal」「任一 credential_rejected → credential_rejected/configuration_blocked」「否則任一 transient → provider_transient_error/automatic（尊重 Retry-After，否則用 `FIRST_PARTY_PUSH_RETRY_POLICY` 的指數後退，超過 `expiresAt` 降級 terminal）」分類，與 D6 錯誤對照表一致。

### 型別邊界：為什麼 obsolete/superseded 不寫進 V0108

V0108 的 `failure_reason` CHECK 只接受 `no_notification_channel/no_active_device/credential_rejected/configuration_blocked/provider_transient_error`（schema-allocation 原文），**沒有** `notification_obsolete`/`notification_superseded`（那是 partner 管道的既有列舉成員，`PartnerNotificationFailureReason`，只是因為 `PassengerNotificationFailureReason` 是兩邊聯集，TS 型別上允許卻不代表 DB CHECK 允許）。所以：

- `recordPushDeliveryOutcome` 新增的 `firstPartyMetadata`（更新 V0108 context 列）只在真正發生一次 FCM 嘗試（或「沒有裝置可嘗試」）時才傳入；relevance 判定為 obsolete/superseded，或 context 已過期這幾種「嘗試前就終止」的情況，只寫既有的 `channelMetadata`（`payload.channelRouting`，D7 既有機制，`claimPartnerNotification`/`listDuePartnerNotifications` 已經讀這個欄位，完全不用改那兩個函式）。
- `PassengerNotificationChannelMetadata`（repository.ts 既有型別，上一波只給 `null`/固定值）本波寬鬆成允許真正的 `deliveryTarget`/`deliveryStage`/`receiptId`/可空 `failureReason`，讓一次成功的第一方投遞也能借用同一個 `payload.channelRouting` 鏡射與既有重試判斷共用，不必新開一個 outbox payload key、也不必改 `listDuePartnerNotifications`/`claimPartnerNotification` 的 SQL。
- 「context 已過期」這個情境 D6 沒有定義專屬 failure reason（不像 partner 的 `notification_expired`），本 task 借用 `no_active_device` 作為最接近的 terminal 收斂值，於 code 內註明這個假設，未在驗收清單內另立新值。

## 可寫範圍核對

- `infra/migrations/`：只新增 V0108 這一個檔，檔名與欄位逐字對照 `schema-allocation.json`。
- `apps/api/src/modules/passenger-push-devices/`：port 擴充介面 + repository/service 各加一個方法，既有方法簽章/SQL 一字未改。
- `apps/api/src/modules/multi-taxi/first-party-notification.transport.ts`：新檔。
- `multi-taxi.module.ts`：只新增 `PassengerPushDevicesModule` import 與 `FIRST_PARTY_PUSH_CONFIG`/`FIRST_PARTY_PUSH_PROVIDER` 兩個 provider；`PASSENGER_PUSH_TRANSPORT`/`PASSENGER_PUSH_PORT`/`transportMode` 字面值完全沒動。
- `multi-taxi.service.ts`：只動 `deliverRoutedPassengerNotification` 的一個分支與新增一個私有方法 `deliverFirstPartyPushNotification`；`deliverPartnerNotification`、`deliverNonPartnerChannelOutcome`、legacy 分支一行未改。建構子只在既有參數尾端追加三個 `@Optional()` 參數，既有任何位置呼叫的測試不受影響（已跑全套確認）。
- `multi-taxi.repository.ts`：只新增 `findFirstPartyNotificationContext`/`prepareFirstPartyNotificationContext`/對應 mapper，`recordPushDeliveryOutcome` 新增可選 `firstPartyMetadata` 分支（`partnerMetadata`/`channelMetadata` 既有邏輯一字未改），`PassengerNotificationChannelMetadata` 型別放寬（見上）。`listDuePartnerNotifications`/`claimPartnerNotification`/`listPartnerNotificationDeliveries`/`retryPartnerNotificationDelivery` 完全沒有修改。
- `apps/api/tests/unit/`：本 task 未新增檔案於此目錄（既有夥伴回歸套件跑過確認未受影響，見下）。
- `tests/unit/push-first-party-fcm-20261006/`：新增 `fcm-provider-error-mapping.test.ts`、`first-party-delivery.test.ts`。

## Findings／驗收證據

| 具名 acceptance key | 驗證方式與位置 | 結果 |
| --- | --- | --- |
| push-first-party-fcm_transport_and_error_mapping | `fcm-provider-error-mapping.test.ts`：純函式 `classifyFcmErrorResponse` 表格測試覆蓋 200（含「200 但無 name」防呆）、404 UNREGISTERED、400 INVALID_ARGUMENT、403 SENDER_ID_MISMATCH、403 其他、401、THIRD_PARTY_AUTH_ERROR、429（+Retry-After）、500、503、timeout、token 取得失敗、未知碼；另有一條驗證 request body 的 token/notification/data/android.ttl/collapse_key/apns headers 形狀與「不記錄 raw token」。`first-party-delivery.test.ts`：service 端到端的多裝置情境——部分接受部分失效（受理裝置留 active，失效裝置被 `invalidateDevice`）、全部失效（`no_active_device`/terminal）、429+Retry-After 影響 `nextAttemptAt`、`credential_rejected`→`configuration_blocked`、obsolete/superseded 短路（不解析裝置、不呼叫 provider）、兩條重試情境（只送 context 凍結的裝置清單，新裝置不會被補送；context 裡已失效的裝置會被排除，不重送） | 23 + 13 = 36 tests，全過 |
| push-first-party-fcm_dormant_by_default_and_privacy | `first-party-delivery.test.ts` 的 `push-first-party-fcm_dormant_by_default_and_privacy` 區塊：旗標關閉、旗標開但缺 `projectId` 兩種情境皆確認 `resolveActiveDeviceSendTargets`（唯一可能觸發裝置/HTTP 的入口）從未被呼叫，結果與上一波「configuration_blocked」逐位元相同；另一條直接檢查 `JSON.stringify` 後的 context/outbox payload 不含 raw token 字串，只含 `tokenSha256`。`tests/unit/push-channel-router-20261006/*`（PUSH-CHANNEL-ROUTER-20261006 既有 21 tests，本 task 寫入範圍外）、`tests/unit/system-remediation/sr-partner-notify-transport-20260918`/`sr-partner-notify-fix-transport-20260927`（夥伴管道回歸，132 tests + 7 skipped，skip 為既有的 PG-only 測試）全部原樣跑過，確認夥伴行為與既有測試斷言未被放寬 | 全過（見下方指令與計數） |
| reviewer 逐欄比對 SQL 與 migration | 本文件「Migration（V0108）」一節逐欄對照 `schema-allocation.json`；Postgres 實測（`tests/unit/db-apply.test.ts` 等需要本機 `localhost:5432` 的測試）本 VM 無法執行（見下「未驗項目」），由 `PUSH-CHANNEL-PG-QA-20261006` 補 | 靜態核對完成；PG 層級未驗 |

## 檢查紀錄

Node `v22.23.2`，pnpm workspace。本 VM 僅做 repository 層 lint/typecheck/unit 檢查，沒有啟動 API、DB、preview、browser/receiver server 或 Docker Compose。

```
cd packages/contracts && pnpm run build   # 先修正 stale dist（既有環境狀態，非本 task 改動）
cd packages/control-plane-auth && pnpm run build
cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json   # 0 errors
pnpm eslint <本task觸及的檔案>   # 0 problems
pnpm vitest run tests/unit/push-first-party-fcm-20261006 --reporter=verbose   # 36 passed
pnpm vitest run tests/unit/push-channel-router-20261006 --reporter=dot        # 21 passed（既有，未修改）
pnpm vitest run tests/unit/system-remediation/sr-partner-notify-transport-20260918 tests/unit/system-remediation/sr-partner-notify-fix-transport-20260927 --reporter=dot
  # 132 passed | 7 skipped（既有，未修改；skip 為既有的 PG-only 測試，非本 task 新增）
pnpm vitest run tests/unit/mtx-full-suite-contract.test.ts --reporter=dot      # 5 passed
```

## 未驗項目

- Postgres 實測（V0108 migration 實際 apply、trigger 不可變邊界、CHECK 約束、`claimPartnerNotification`/`recordPushDeliveryOutcome` 對 V0108 列的真實交易行為）：本 VM 不允許啟動資料庫/Docker Compose，`tests/unit/db-apply.test.ts` 需要 `localhost:5432` 的 Postgres，無法在此執行；依波次分工交 `PUSH-CHANNEL-PG-QA-20261006` 驗證。
- 真實 FCM 端點、真實裝置、真實憑證：本波明確不建立 Firebase 專案、不申請憑證、不對外送出（D8），所有測試使用注入的 fetch/token stub，沒有任何真實網路呼叫。
- `retryPartnerNotificationDelivery`（Ops 手動重試）目前只認識 `mobility.phase1_partner_notification_delivery_contexts`，對已被本 task 的 `payload.channelRouting` 封存的第一方列，手動重試仍會清掉 `channelRouting`（既有行為，對三種非夥伴結果一致），但不會重置 V0108 context 列的 `retry_disposition`——這張表本波唯一的重試入口是 outbox 自身的 `claimPartnerNotification`/`listDuePartnerNotifications`（已驗證），手動重試對第一方列的 V0108 列狀態同步不在本 task 的 `write_scopes` 內（該函式不在允許清單），留給未來若有需求再處理。
- 「context 已過期」沿用 `no_active_device` 作為最接近的 terminal failure reason（D6 沒有定義專屬值，見上「型別邊界」一節）；若之後有 PG QA 或驗收需要區分，需另行決定是否擴充 V0108 的 CHECK 清單（schema 變更，不在本 task 範圍）。

## Candidate

- Branch: `claude2/push-first-party-fcm-20261006`
- 本文件將在 commit 後以 `CANDIDATE_SHA=$(git rev-parse HEAD)` 記錄於 handoff。
