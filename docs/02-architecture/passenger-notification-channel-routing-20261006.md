# 乘客通知依來源分流與第一方 App 接收端預備：SA/SD

版本：1.0　日期：2026-10-06
狀態：本次系統設計決議；程式、migration、外部整合與驗收尚未執行，本波只配置型別與 migration 編號。
Repository：ajoe734/drts-fleet-platform
檢視分支：dev
固定基準：446228cbc771a4ced774126a7d4aaddea4db73e6（2026-10-06）
取代範圍：不取代 `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md`；本文件是它的補篇，處理「單一通知到底走哪個管道」與「第一方 App 接收端存在時怎麼收」，夥伴管道本身的端點治理、回執、重試仍以 01_system_sa_sd.md 為準。

## 0. 使用者指示與本次設計的界線

2026-10-06 使用者原話：「就算有獨立的 APP 應該也跟推播不衝突，因為你哪個來源就推到哪邊去」；「假定有可能做自己的 APP，你先把這部分規畫出來整理成 tasks」。

本文件據此做兩件事：

1. **分流**：每張訂單的通知管道在建單時依可信來源凍結，不同來源的通知各走各的管道，不 fanout、不互相取代。
2. **第一方 App 接收端的資料層與服務骨架**：裝置 token 登錄、查找、失效，以及 FCM 傳輸語意。全部預設關閉——沒有 App、沒有憑證、不對任何真實裝置或外部端點送出。

**不可越過的界線**：`SD-DP-20260422-001`（Phase 1 不開第一方乘客 App／登入／叫車／收據中心）與
`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` §2「首版不新增第一方乘客 App」**仍然有效**。本文件與 `SD-DP-20261006-001` 只核准預設關閉的後端接縫；重新評估條件見決策紀錄。本波不建立 Firebase 專案、不申請 APNs 金鑰、不新增或讀取任何 secret、不改 deploy-dev 的部署行為、不對任何真實裝置或外部端點送出推播、不加 SMS/CTI/行銷推播。

## D1 管道與來源對照

```
PASSENGER_NOTIFICATION_CHANNELS = ["partner_webhook", "first_party_app"]
```

「無管道」不是一個 channel 值，而是兩種路由快照都不存在的狀態（見 D2、D3）。

管道由訂單來源決定，來源以 **server 端已核身身分**判定，不信 request body 自稱的欄位：

| 訂單來源 | 判定依據 | 管道 |
|---|---|---|
| 夥伴內嵌叫車（referral-embed-web） | `referral_passenger` 身分，經 `POST /api/partner/referral/passenger/bookings` → `createReferralPassengerBooking` | `partner_webhook` |
| 帶夥伴 session 的 multi-taxi ride（既有路徑） | 既有 `writeOrderPartnerNotificationRouteIfApplicable` 寫入路徑 | `partner_webhook` |
| 將來的第一方乘客 App session（目前不存在） | 第一方乘客身分（本波尚未開放） | `first_party_app` |
| 電話客服、無人語音、企業派車、夥伴人員代訂（partner-booking-web）、外部平台轉單 | 無上述任一已核身 App session | 無管道 |

這張表只是分類依據，不是新的路由判定程式碼位置；實際寫入時機見 D2。

## D2 每張單凍結快照，管道由快照決定

- 每個管道有自己獨立的路由快照表，不另建通用 channel 欄位表：
  - 夥伴管道沿用既有 `mobility.phase1_order_partner_notification_routes`（01_system_sa_sd.md §4、§11，V0104）。
  - 第一方管道新增 `mobility.phase1_order_first_party_notification_routes`（見 D5，V0107）。
- 快照在建單時、依 server 端可信身分寫入同一交易，之後不變。管道判定**不**依乘客「最近一次登入」或「目前有哪些裝置」重新計算——這兩張表本身就是凍結後的事實，不是即時查詢的 view。
- 同一張單只能有一種快照。寫入時必須在同一交易內檢查另一張表是否已有該 order_id 的快照；投遞時如果兩張表都查到同一張單的快照，回 `route_ambiguous`（`manual_only`），兩邊都不送——這是資料完整性異常，不嘗試猜測哪一個「比較新」。
- 兩張表都沒有該 order_id 的快照：`no_notification_channel`（見 D3）。

## D3 無管道的處理

- outbox 記錄：`status=failed`、`result=provider_not_configured`、`failureReason=no_notification_channel`、`retryDisposition=none`、`deliveryTarget=null`。
- 這是**設計上本來就不推**的訂單，不是故障：
  - 不進 Ops 待處理佇列。
  - 不計入投遞失敗告警。
  - 不重試（`retryDisposition=none` 與既有的 `terminal`/`manual_only` 不同——那兩者仍代表「這本該送達但目前卡住」，`none` 代表「這張單從一開始就不該送」）。
- 本波不改 producer：各 producer（assignment、eta_changed、driver_arrived、receipt_ready；見 `PUSH-ARRIVAL-ETA-RECEIPT-PRODUCERS-20261005`）照舊替所有訂單寫 outbox，保留 durable 紀錄；由**投遞端**（D7 的分流點）判定無管道，而不是讓 producer 自行略過。
- 要不要讓 producer 直接略過電話客服／企業派車等訂單的 outbox 寫入，是後續優化，本波不做決定。

## D4 第一方裝置登錄（本波只做資料層與服務，不開 HTTP）

### 資料表

`iam.phase1_passenger_push_devices`（與既有 `iam.driver_device_bindings`——`infra/migrations/V0078__driver_device_session_persistence.sql`——同一 schema 並列，欄位精神相同：伺服器簽發 id、token 以雜湊儲存、status 驅動生命週期）：

| 欄位 | 說明 |
|---|---|
| `device_id` | uuid，PK |
| `drts_passenger_id` | 第一方乘客身分（本波尚未開放發放，欄位先留） |
| `platform` | `ios` \| `android` |
| `provider` | `fcm_v1`（固定值，為未來多 provider 留擴充空間） |
| `app_id` | 第一方 App 的 Firebase/APNs app 識別 |
| `app_version` | 用於除錯與分階段淘汰舊版本 |
| `token` | 原始 FCM registration token（見下方「token 不落 log」） |
| `token_sha256` | token 的 SHA-256。唯一性是**部分索引**（只限 `status='active'` 的列），不是全表 `UNIQUE`：`CREATE UNIQUE INDEX ... ON iam.phase1_passenger_push_devices (provider, token_sha256) WHERE status = 'active'`。原因見下方「換人登入同一支手機」——轉綁時舊列保留且標 `revoked`、新列 insert，若唯一性是全表範圍，新列會因與舊列（未刪除、只是 revoked）同一 hash 而被拒絕；限定在 `active` 列，舊列一旦轉成 `revoked` 就退出這個索引，新 `active` 列才能進來。同一 hash 可以同時存在多筆歷史 `revoked`/`invalid` 列，但任何時間點至多一筆 `active`。 |
| `status` | `active` \| `revoked` \| `invalid` |
| `status_reason` | 人可讀的狀態變更原因 |
| `notification_consent_version` | 乘客同意接收通知的版本化紀錄 |
| `registered_at` / `last_seen_at` / `invalidated_at` | 生命週期時間戳 |
| `created_at` / `updated_at` | 稽核時間戳 |

### 規則

- **換人登入同一支手機**：同一 `token` 重新登錄到另一位乘客時，**在同一交易內**把舊綁定（原乘客）的那一列標 `revoked`、`status_reason` 記錄原因，**並為新乘客 insert 一筆新列**——不是原地把舊列的 `drts_passenger_id` 改成新乘客（那樣會抹掉原乘客的歷史綁定記錄）。這個 insert-new-row 動作能成立，是因為 `token_sha256` 的唯一性只限定在 `active` 列（見上方 `token_sha256` 欄）：舊列轉 `revoked` 的同一交易裡就讓出了這個 hash 的 `active` 名額。
- **token 輪替**：舊 token 的紀錄 `revoked`，新 token 以新 `device_id` 寫 `active`——不是原地覆寫 token 欄位（content-identity 不可變,同 remittance-proof 的 precedent）。
- **登出**：對應裝置紀錄 `revoked`。
- **供應商回報失效**（FCM 的 `UNREGISTERED`/`INVALID_ARGUMENT`/`SENDER_ID_MISMATCH`，見 D6）：`invalid`。
- **60 天無 `last_seen_at`**：視為不可用（投遞時不選它），但**不刪除**——歷史裝置紀錄保留供稽核。
- **每位乘客最多 10 個 `active` 裝置**：超過時，把 `last_seen_at` 最久未更新的裝置轉 `revoked`。

### 隱私邊界

- `token` **不得**出現在任何 log；log 只能印 `device_id` 或 `token_sha256` 的前 8 碼。
- `token` **不得**從任何 API 回傳——即使是裝置擁有者自己查詢，也只回傳 `device_id`、`platform`、`status`、`last_seen_at` 等中繼資料。

### Resolver

```ts
resolveActiveDevices(drtsPassengerId: string): Promise<PassengerPushDeviceRecord[]>
```

回傳該乘客**全部** `active` 裝置（可能多支手機同時登入）。這與既有單筆的
`apps/api/src/modules/multi-taxi/passenger-push.adapter.ts` 的
`PassengerDeviceResolver.resolveDevice()`（單筆、Web Push 專用）是**平行存在、互不取代**的兩個介面——舊介面保留不動，因為它服務的是已停用拓撲（見 `partner-notification-20260917/README.md` 附註）。

### HTTP 登錄 API——本波不實作

目前沒有第一方乘客身分可以授權這個端點（`SD-DP-20260422-001` 仍有效）。本文件只記錄**將來**的契約草案，供 `PUSH-FIRST-PARTY-REGISTRY-20261006` 之後、真正開放第一方身分時參照：

```http
POST   /api/passenger-app/push-devices
DELETE /api/passenger-app/push-devices/{deviceId}
```

兩者都必須要求已核身的第一方乘客 session；`deviceId` 的刪除必須核對呼叫者就是該裝置的擁有者。

### 既有的 Web Push 端點——本波不動

既有的 `POST/DELETE /api/passenger-rides/:accessToken/push-subscriptions`（`apps/api/src/modules/multi-taxi/passenger-push.repository.ts`、`multi-taxi.controller.ts`）是記憶體儲存、沒有任何讀取路徑的既有端點。本文件註明：**它不是第一方裝置登錄的基礎**，不會被 `iam.phase1_passenger_push_devices` 取代或重用其資料。是否清理，照 `partner-notification-20260917/01_system_sa_sd.md` §13 的既有決定——先留著，不因本波工作復活它。

## D5 第一方訂單路由

新增 `mobility.phase1_order_first_party_notification_routes`，與夥伴管道的
`mobility.phase1_order_partner_notification_routes`（01_system_sa_sd.md §4）**平行存在、結構對應但欄位不同**：

| 欄位 | 說明 |
|---|---|
| `order_id` | PK |
| `tenant_id` | 租戶隔離 |
| `drts_passenger_id` | 第一方乘客身分 |
| `passenger_subject_ref` | 內部核對用，**不**放入通知 payload（同 01 §6 的既有原則） |
| `app_id` | 第一方 App 識別 |
| `notification_policy_version` | `CHECK (notification_policy_version = 'first_party_notification_v1')` |
| `consent_version` | 乘客同意版本 |
| `ride_ref` | `UNIQUE`——不可作為 bearer credential，與夥伴管道的 `ride_ref` 唯一性原則相同 |
| `created_at` | 寫入時間 |

本波只提供 writer（schema + typed command 形狀），**目前沒有呼叫端**——第一方叫車路徑不存在，這張表不會被任何本波程式寫入。寫入時機見 D8「本波不做」。

## D6 第一方投遞語意

### 傳輸

- FCM HTTP v1；每個裝置 token 各自一個 request（FCM HTTP v1 沒有 multicast，不像舊版 legacy API）。
- iOS 由 FCM 透過 APNs 轉送；本波**不**直連 APNs，不持有 APNs 憑證。

### 認證與開關

- 沿用既有 `apps/api/src/common/google-cloud/google-cloud-object-client.ts` 的 `GoogleMetadataTokens`，取 Cloud Run runtime service account 的 access token——不另外持有或讀取 service account key 檔。
- FCM 專案 ID 從環境變數 `PASSENGER_PUSH_FCM_PROJECT_ID` 讀取。
- 功能旗標 `PASSENGER_PUSH_FIRST_PARTY_ENABLED`，**預設 `false`**。旗標關閉，或已開啟但缺少專案 ID：對應 outbox 記 `failureReason=configuration_blocked`、`result=provider_not_configured`。

### 投遞 context（第二個 migration 配號，V0108）

每則 outbox 第一次準備投遞時，把當下的路由快照、裝置清單（`device_id` + `token_sha256`，**不存原始 token**）、wire payload 與其雜湊，存成**不可變**的投遞 context，與夥伴管道
`mobility.phase1_partner_notification_delivery_contexts`（01_system_sa_sd.md §11、V0105）的「寫一次、重試重用」精神一致。重試只送 context 裡尚未成功、且當下仍是 `active` 的裝置，**不重新解析收件人**（呼應 D2「快照不因裝置變化重新判定」）。

### Delivered 的定義

- 只要**有一個**裝置的 FCM 回應 200 並帶 message name，outbox 就記 `delivered`/`delivered`，並附：
  - `deliveryTarget = first_party_device`
  - `deliveryStage = provider_accepted`
  - `receiptId` = FCM 回傳的真實 message name（禁止合成值，同夥伴管道 01 §7 的 `receipt-${outboxId}` 反例）。
- **永遠不宣稱** `device_received` 或「已讀」——這兩層證據（01 §7 的證據階梯）本波沒有 callback 可以提供。
- 其餘裝置一旦被判定暫時失敗（見下方「錯誤對照」），**在這則 outbox 已經 `delivered` 之後就不再補送**，也沒有「下一輪重試」可言：`delivered` 是 outbox 既有 status enum 的終態，worker 的 claim/fence 條件不會再撈到已經 `delivered` 的列（D7）。這是設計上刻意的行為——D6 的投遞義務只要求「至少一個裝置收到」，其餘裝置的暫時失敗在整批判定 `delivered` 的同一次嘗試裡就一併結案，不再有後續嘗試。只有在**沒有任何裝置**回 200（即整批都失敗或都 invalid）時，outbox 才維持非終態、交給一般重試機制（`retryDisposition=automatic`／`configuration_blocked`）在下一輪重新嘗試全部仍 `active` 的裝置。

### 錯誤對照

| FCM 回應 | 處理 |
|---|---|
| `UNREGISTERED`（404）、`INVALID_ARGUMENT`（token 無效）、`SENDER_ID_MISMATCH`（403） | 該裝置標 `invalid`（D4），該裝置之後不再送 |
| `QUOTA_EXCEEDED`（429）、`UNAVAILABLE`（503）、`INTERNAL`（500）、逾時 | `provider_transient_error` 等級，`retryDisposition=automatic`，尊重 `Retry-After` |
| `THIRD_PARTY_AUTH_ERROR`、401、其他 403 | `credential_rejected`，`retryDisposition=configuration_blocked` |
| 所有裝置都 `invalid` 或沒有任何 `active` 裝置 | `failureReason=no_active_device`，`retryDisposition=terminal` |

### 重試政策

- 獨立的政策**參數** snapshot（不沿用夥伴管道的 `maxAttempts`/backoff 數值）：`maxAttempts=5`、起始 30 秒、倍數 2、上限 10 分鐘，同時受 `expiresAt` 限制。這只是兩套不同的參數表，**不代表兩個管道各自有自己的 claim/fence 或 retry timer**——實際排程、取件、計時仍然只有 outbox 一個 owner，見 D7；這裡的「獨立」純粹指 worker 查這筆 outbox 屬於哪個管道時，該用哪一組 `maxAttempts`/backoff 數字。
- TTL 沿用既有 `PARTNER_PASSENGER_EVENT_DEFAULT_TTL_SECONDS`（`packages/contracts/src/partner-passenger-notification.ts`），對應到 FCM 的 `android.ttl` 與 `apns-expiration`。
- Collapse：同一訂單的 `eta_changed` 共用一個 collapse key（`apns-collapse-id`、Android 的 `collapse_key`），新的蓋過舊的——與 01 §5 的 ETA 節流精神一致，但這是 FCM 傳輸層的 collapse，不是 outbox 層的節流。

### Payload

- `notification` 欄位放通用中文標題與內文（不含個資）。
- `data` 欄位只放：`notification_id`、`event`（沿用既有 `passenger.<event>.v1` 命名，見 `partner-passenger-notification.ts`）、`ride_ref`、`event_sequence`、`expires_at`。
- 不放 01 §6 禁止的任何欄位（電話、姓名、地址、GPS、車牌、司機姓名、付款資料、任何 token）。

## D7 分流點與單一重試 owner

- **分流點在投遞服務層**，不在 producer、不在 API 層：每筆 outbox 先依 D2 判定管道（查兩張路由快照表），再交給對應管道的投遞函式。
- 夥伴管道沿用既有 `deliverPartnerNotification`（`multi-taxi.service.ts`）與它的 context 表、retry policy snapshot（01_system_sa_sd.md §8）——**行為不變**，本文件不重新定義它。
- 兩個管道共用同一個 outbox 的 claim/fence/receipt 交易（既有 `ops.consumer_notification_outbox`）。worker 只要有**任一**管道啟用就要啟動；取件條件（`WHERE` 子句）要同時涵蓋兩種管道各自的 `retryDisposition` 語意,不能只認識夥伴管道的失敗原因集合。
- 事件清單一律從 contract 的 `eventType` union（`ConsumerNotificationOutboxRecord["eventType"]`）推導，不在分流邏輯裡寫死五種事件名——`PUSH-TRIP-CANCELLED-NOTIFICATION-20261005` 會替這個 union 加入取消事件，分流邏輯不應因此需要同步修改列舉。

## D8 本波不做（後續任務的範圍）

- 第一方乘客身分與登入、第一方叫車路徑（D5 路由表的呼叫端）、D4 的 HTTP 登錄 API。
- Firebase 專案建立、APNs 金鑰上傳、deploy-dev 設定變更、真機驗收（注意 GCP billing account 的專案數上限——見機器備忘，建立新 Firebase 專案前要先確認額度）。
- Ops 介面顯示第一方投遞狀態。
- 無管道訂單（D3）要不要改發 SMS，是另一個產品決策，本波不做。

這些項目在 `/home/lupin/workspace/drts-fleet-platform/.local/passenger-push-channel-20261006/common.md` 的任務表中分別對應
`PUSH-FIRST-PARTY-REGISTRY-20261006`、`PUSH-CHANNEL-ROUTER-20261006`、`PUSH-FIRST-PARTY-FCM-20261006`、`PUSH-CHANNEL-PG-QA-20261006` 等後續任務,本文件不逐一重複其驗收標準。

## 與既有文件的關係

- `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` 的六項決策（§1）、端點治理（§3）、payload 與隱私（§6）、delivered 定義（§7）、重試與 claim/fence（§8）、錯誤分類（§9）對**夥伴管道**仍然是唯一的權威來源；本文件只在「哪張單走這個管道」「第一方管道對應的平行語意」上補充,不覆寫它的任何一項決議。
- `01_system_sa_sd.md` 第 24 行「`multi-taxi.module.ts` 仍綁 `WebPushTransport`」的現況描述已過時（目前綁的是 `PartnerNotificationTransport`,見 `partner-notification-20260917/README.md` 的附註與下方決策紀錄);本文件與其 README 附註不改寫原文,只標注現況已變。
- 本文件不討論 migration 編號本身的分配規則與 guard test,詳見 `docs/04-uat/system-remediation-20260906/schema-allocation.json` 的 `passenger_push_channel_allocations` 區塊。

## 完成定義

設計完成不等於開發完成。本文件與 `packages/contracts/src/passenger-notification-channel.ts` 只提供型別、migration 配號與決策紀錄;未寫任何執行期程式、未建立任何資料表、未部署、未重跑系統測試。工程完成要等 `PUSH-FIRST-PARTY-REGISTRY-20261006`、`PUSH-CHANNEL-ROUTER-20261006`、`PUSH-FIRST-PARTY-FCM-20261006`、`PUSH-CHANNEL-PG-QA-20261006` 依序完成。
