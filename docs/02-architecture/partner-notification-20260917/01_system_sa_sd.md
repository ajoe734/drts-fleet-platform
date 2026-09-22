# 乘客通知送達夥伴 App：SA 決策與 SD

版本：1.0　日期：2026-09-17
狀態：本次系統設計決議；程式、migration、外部整合與驗收尚未執行。
Repository：ajoe734/drts-fleet-platform
檢視分支：dev
固定基準：38a68a79959619faa5a10b9782e77dd7ca41f4c2
取代範圍：Q-SR-PUSH-001／P05 及 SR-PUSH-WEBPUSH-20260915 對「夥伴 App 內嵌乘客」的接收端／傳輸方式決策。
本文件是工程文件；畫面與文案另見 03_ui_design_delta.md。

## 0. 來源、現況與本次設計的界線

本文件以 2026-09-17 的九節 SA 為需求基礎，並直接讀取上述 commit 的程式。下列「已核實」描述現有程式；下列「決議／新增」是本次應實作的設計，不能在任務板標成已完成。

已核實：

| 檔案 | 可直接確認的事實 |
|---|---|
| packages/contracts/src/index.ts: 960–1210 | PartnerChannelEntryRecord.tenantId 必填；entry 同時有 partnerId、programId、entrySlug；UpdatePartnerChannelEntryCommand 可變更 tenantId。這不是 entry 與 tenant 一對一的證明。 |
| packages/contracts/src/index.ts: 1680–1800 | TenantWebhookEndpoint 屬 tenant，有 events、狀態、密鑰版本、retry policy；沒有 entry 專用通知綁定欄位。 |
| packages/contracts/src/referral-channel.ts: 1–180 | 既有 PartnerUserIdentityLinkRecord 保存 entrySlug、partnerUserRef、drtsPassengerId、active/revoked；既有簽章 handoff 與同意資料可沿用。 |
| apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts | HMAC-SHA256、snake_case 序列化、HTTP timeout、shouldRetry/backoff 已存在；WebhookFetch 只回 ok/status，沒有讀取接收回執 body。 |
| apps/api/src/modules/multi-taxi/passenger-push.adapter.ts | 可注入 PassengerPushTransport；存在可選 device resolver；generic HTTP 分支會以 receipt-${outboxId} 作缺回執時的 fallback。 |
| apps/api/src/modules/multi-taxi/multi-taxi.module.ts | PASSENGER_PUSH_TRANSPORT 目前仍綁 WebPushTransport，並注入 PassengerPushDeviceResolver。只新增一個 class 不會切換現行行為。 |
| apps/api/src/modules/multi-taxi/multi-taxi.service.ts: 950–1100 | 已有 outbox claim、fence 與 receipt/outcome 同交易寫入；通用錯誤目前會摺疊成 provider_error。 |
| packages/contracts/src/phase1-p5-s3-multi-taxi.ts: 620–665 | outbox 四狀態 pending/sending/delivered/failed；五種事件；result 為 delivered/provider_not_configured/provider_error。 |
| docs/03-runbooks/tenant-api-webhook-governance-runbook.md | 記載 tenant webhook 自動重試、重啟恢復、停用、測試及輪替機制。 |

SA 所稱 C111–C115 已完整驗收，是本輪提供的狀態敘述。本次有檢視相關 runbook／程式，沒有重跑這組測試，也沒有把既有綠燈當作新通知傳輸的驗收。

兩個前提修正：

1. 內嵌 WebView 的頁面仍可能載入 DRTS 網域；網頁 origin 與原生推播的 App 接收端是不同概念。本案改走夥伴 App，是基於產品接收端與原生權限歸屬，不是因為網頁已離開 DRTS 網域。
2. 官方 WebKit 的 Home Screen Web App Web Push 支援，不足以證明任意合作 App WKWebView 都可照用。首版不把 WebView 的 PushManager／service worker 能力列為依賴。

## 1. 六項決策：直接定案

| 問題 | 決議 |
|---|---|
| 1. entry/tenant 與端點歸屬 | 一個 entry 有一個當前 tenant；一個 tenant 可有多個 entry。端點、密鑰與治理沿用 TenantWebhookEndpoint；新增 entry→webhook 的顯式綁定，不建立第二套 PartnerWebhookEndpoint。 |
| 2. 2xx 是否 delivered | 200/201/202 + 合約相符的 accepted/duplicate 回執，才完成「交付夥伴端點」。單獨 2xx 不足。既有 delivered 保留，但新增 deliveryTarget=partner_endpoint、deliveryStage=partner_accepted；不得展示為裝置送達或已讀。 |
| 3. 夥伴未接好 | 只使該 entry 通知能力未就緒；outbox 不得 delivered。配置缺失／停用不做無限 HTTP 重試；保留失敗原因、Ops 待處理、受控重送與有效期限。進行中行程不能因通知失敗被取消或停止更新。 |
| 4. 最小 payload | 通知識別、原 entry 的 partnerUserRef、不可作授權的 rideRef、事件／版本／時間／有效期、通用文案；ETA 只在相關事件提供分鐘。首版不送 GPS、路線、地址、原始電話、完整執登、支付資料或任何 bearer token。 |
| 5. 名稱／版本 | 五個內部事件不改名；外部用 passenger.<原事件名>.v1，body schema_version=1.0，顯式訂閱、不用 wildcard。 |
| 6. 首版幾家 | 實作自第一天支持多 tenant、多 entry；第一家真實 pilot 用 yuhe-residence。自動化至少測兩個 tenant，並包含同 tenant 的兩個不同 entry。沒有真實夥伴端點就停在內部驗收，不稱 live。 |

## 2. 範圍與責任

拓撲：

```text
正式訂單事件 + 訂單通知路由快照
  → consumer notification outbox（唯一重試與 claim owner）
  → PassengerPushAdapter
  → PartnerNotificationTransport
  → tenant webhook 精準端點派送 + 既有簽章／生命週期
  → 夥伴 durable inbox 回 accepted receipt
  → 夥伴既有 APNs/FCM 或其他原生推播服務
  → 住戶裝置
  → 點通知、夥伴重新核身 handoff、回原行程
```

DRTS 責任：選對 entry／住戶、生成必要且最小事件、簽章、可靠交接、回執留存、狀態誠實、回行程安全核身、跨租戶隔離。
夥伴責任：核驗來源、durable inbox、去重、找到住戶 App 帳戶、原生 token／OS 權限、送往原生推播、打開正確行程。
共同責任：至少一次原生裝置整合驗收，以及故障聯絡／處置。

首版不新增第一方乘客 App，不重建 retired passenger-web，不讓 DRTS 持有夥伴 APNs/FCM 憑證與 device token，不加入 SMS／CTI 或行銷推播。外部叫車平台原生負責通知的 forwarded 訂單不轉送這條通知鏈。

前景行程頁仍用既有即時讀取／SSE；背景通知不能取代頁面的正式資料。通知回執也不等於 P-5 揭露頁已顯示。

## 3. 端點治理：重用 tenant，精準綁定 entry

### 3.1 新增 PartnerEntryNotificationBinding

```ts
interface PartnerEntryNotificationBinding {
  bindingId: string;
  entrySlug: string;
  tenantId: string;
  partnerId: string;
  webhookId: string;
  version: number;
  state: 'test_pending' | 'ready' | 'disabled';
  purpose: 'passenger_notification';
  eventTypes: PartnerPassengerEventType[];
  schemaVersion: '1.0';
  acknowledgementPolicy: 'durable_partner_acceptance_v1';
  validatedEndpointFingerprint: string | null;
  validatedAt: string | null;
  updatedAt: string;
}
```

一個 entry 首版只有一個主通知綁定。同一 partner、同一 tenant 的多 entry 可共用一個端點，但各自建立綁定且 payload 永遠指明 entry；跨 tenant 即使 URL 相同，也用獨立 endpoint record 與 secret。

必須檢查：entry.tenantId == binding.tenantId == webhook.tenantId；entry.partnerId == binding.partnerId；entry active；binding ready；webhook active；所送事件同時在 binding 和 endpoint.events 的 allowlist。

重要：不能用「列出 tenant 下訂閱此事件的所有 webhooks」做 fanout。不可因 passengerSubjectRef 在多個 entry 出現就送到全部 App。普通 tenant webhook 訂閱也不能自動取得 passenger.* 事件。

實作一個受控的精準派送 façade，執行 endpoint-by-id 解析、生命週期檢查、密鑰選取、使用紀錄、delivery log、失敗計數。它委派 WebhookDispatchService.dispatchAttempt，不直接暴露 secret 給新 transport。

端點 URL／事件清單／owner 或 secret 輪替後，沿用現有 test_pending 與重測要求。綁定也要重驗；不能僅用舊測試日期繼續派送。歷史未完成通知不得靜默改投新租戶或新夥伴。

### 3.2 新增管理 API（本次規格，尚未實作）

```http
GET  /api/platform-admin/partner-entries/{entrySlug}/notification-binding
PUT  /api/platform-admin/partner-entries/{entrySlug}/notification-binding
POST /api/platform-admin/partner-entries/{entrySlug}/notification-binding/test
POST /api/platform-admin/partner-entries/{entrySlug}/notification-binding/enable
POST /api/platform-admin/partner-entries/{entrySlug}/notification-binding/disable
GET  /api/platform-admin/partner-entries/{entrySlug}/notification-deliveries
POST /api/platform-admin/partner-entries/{entrySlug}/notification-deliveries/{outboxId}/retry
```

PUT body：webhookId、五種 events、expectedVersion；tenantId／partnerId 從已授權 entry 解析。版本衝突回 409。建立時 test_pending，enable 需要該 binding version + 當前 endpoint fingerprint 的成功通知合約測試。

僅具 partner 管理權且通過 tenant/entry resource scope 驗證者可變更。沿用現有 webhook CRUD，不在新 API 複製端點或密鑰的 CRUD。

## 4. 缺口：凍結「這張單從哪個 App、由誰建立」

現有 passengerSubjectRef 是 DRTS 內部化名，夥伴未必能用它找到住戶。既有 PartnerUserIdentityLinkRecord 才有 entrySlug + partnerUserRef + drtsPassengerId。

新增訂單通知來源快照 OrderPartnerNotificationRoute：

```ts
interface OrderPartnerNotificationRoute {
  orderId: string;
  tenantId: string;
  partnerId: string;
  entrySlug: string;
  partnerUserRef: string;       // 原 handoff 的夥伴使用者參照；受限儲存
  drtsPassengerId: string;      // 內部核對，不放通知 payload
  passengerSubjectRef: string;  // 內部核對，不放通知 payload
  identityLinkedAt: string;
  consentBundleVersion: string;
  notificationPolicyVersion: 'partner_notification_v1';
  rideRef: string;              // 不可當 bearer credential
  createdAt: string;
}
```

在已核身 handoff 建立正式 order 的交易內寫入；資料取自 server session/link，不接受 query/body 自稱的住戶或 entry。第一筆 outbox 前必須已有 route。Identity link 被 revoked 時停止送出，不因為有快照就繼續外送。

每個 outbox 首次準備派送時，將 route、bindingVersion、webhookId、endpoint fingerprint、wire payload 及 hash 存為 immutable delivery context。重試不得用「最後一次登入的 entry」重新解析對象。

舊資料無法唯一回溯時：route_missing／route_ambiguous，保持未交付、進待處理；不能憑同一手機、email、tenant，或唯一現存 endpoint 猜測收件人。entry 更換 tenantId 後，既存通知遇 owner_changed 暫停並審核，不自動移轉。

## 5. 五種事件、次序、時效

| 內部 eventType | 外部 event（含 major 版） | 內容／設計預設有效期 |
|---|---|---|
| assignment_disclosure_ready | passenger.assignment_disclosure_ready.v1 | 已派車、回行程提示；10 分鐘 |
| assignment_replaced | passenger.assignment_replaced.v1 | 改派提示；10 分鐘 |
| eta_changed | passenger.eta_changed.v1 | eta_minutes + as_of；2 分鐘 |
| driver_arrived | passenger.driver_arrived.v1 | 到場提示；5 分鐘 |
| receipt_ready | passenger.receipt_ready.v1 | 乘車證明已備妥；7 日 |

以上有效期是本次產品預設，不是法規門檻。先到 expiresAt 或 maxAttempts 者即停止自動重試。

只擴充 endpoint event catalog；內部 outbox enum 不改名。另有 passenger.notification.test.v1 僅作綁定測試，不建立真行程、不推送真住戶。

新增每 order 持久化 notification eventSequence，於生成 outbox 同交易分配。相同事件重試 ID／sequence／payload 不變。assignmentVersion 只辨識派遣代次，不能代替所有事件的排序。不得重用目前 in-memory SSE counter 作 durable 序號。

ETA：同 order + assignmentVersion 至多每 60 秒一筆，變動至少 2 分鐘才生成；未送出的舊 ETA 可標記 superseded，不顯示 delivered。已送出未知結果仍沿原 ID／payload 重試或依效期結束，不能換內容冒稱同一事件。

送出前重查事件是否仍有通知意義：已取消／已結束的「司機已抵達」、已被新指派取代的舊指派／ETA 停送。receipt_ready 可在完成後送。夥伴收到亂序事件，要去重、依序更新；點擊時一律讀最新正式行程，而非呈現通知內的舊狀態。

## 6. 酬載與隱私

共用既有 WebhookEventPayload 外框：event、deliveryId、occurredAt、tenantId、data；由既有 serializer 轉為 snake_case。data 只選 allowlist，不能把 outbox.payload 直接展開。

必填：schema_version、notification_id（outboxId）、partner_entry_slug、recipient.partner_user_ref、ride_ref、event_sequence、assignment_version（可 null）、expires_at、message、navigation。

選填：eta.minutes / eta.as_of（僅 ETA／派車事件且源資料存在）。

首版禁止外送：完整或遮碼電話、住戶姓名、房號、地址、起訖地、GPS、軌跡、driverId、執登號碼／影像、支付／卡片／保單資料、raw accessToken、handoff artifact、cookie、VAPID／API／簽章 secret。車牌與駕駛姓名首版也不放推播；乘客打開原有受權限保護的 P-5 頁看完整資料。

partnerUserRef 必須是夥伴側不含直接個資的穩定參照；若現有值就是手機／姓名，不可照抄上 wire，先以簽章 handoff 建立新的不透明參照對應。也不要求夥伴取得 DRTS 的全域乘客 ID。

既有 consent scopes 不等於已涵蓋新增外送用途。首版需版本化說明「將本趟狀態交回原 App 以提供乘車通知」，保留 notice/consent version；不因接受行程通知而同意行銷。OS 通知權限仍由夥伴 App 管理。

## 7. delivered 的正式定義

| 層級 | 證據 | 是否可說乘客已收到 |
|---|---|---|
| outbox_persisted | DRTS DB 已存事件 | 否 |
| partner_accepted | 已核驗接收回執，夥伴承諾 durable inbox 接收 | 否 |
| provider_accepted | 夥伴的 APNs/FCM 等接受 | 否 |
| device_received | 有對應 device/SDK 或裝置測試證據 | 可說該裝置收到，不可說已讀 |
| opened | App 開啟通知事件 | 可說通知已開啟，不推論內容已理解 |

兼容既有 enum：保留 outbox.status=delivered、result=delivered，但對本 transport 加 deliveryTarget=partner_endpoint、deliveryStage=partner_accepted，前端標「夥伴端已接受」。舊 Web Push 回執不可回填為 partner_accepted。

成功條件：HTTPS 200、201 或 202，且 JSON response 的 notification_id、delivery_id、partner_entry_slug 與本次一致，status 為 accepted 或 duplicate，receipt_id 非空。accepted 表示夥伴已提交 durable inbox，不能先回成功再嘗試寫 DB。

204、空 body、HTML 200、未知欄位版本、缺 receipt、ID 不符，都不是本合約的成功。不得用 `receipt-${outboxId}` 合成 partner receipt。providerMessageRef 必須來自真實 receipt_id。deliveredAt 應記我方完成回執驗證的時間，不沿用 attempt 開始時間，也不把夥伴自報時間當我方時間。

首版不要求每筆通知有第二段 device callback。downstreamStatus 預設 unknown；未實作 callback 時不新增假資料，也不回寫 outbox。日後 callback 另版本化、需夥伴 scope／簽章／重放防護，且不得用事件 ID 當權限。

## 8. 重用 dispatch，但只能有一個自動重試 owner

保留 consumer notification outbox 的 claim/fence/receipt transaction。PartnerNotificationTransport 每次 send 只觸發一次遠端 HTTP attempt。

禁止做法：consumer outbox 呼叫 tenant fanout，tenant 回 queued，consumer 就記 delivered；或兩邊各自有 timer 對同一通知重送。

新建窄 façade（位於 tenant-partner 模組並 export），提供 `dispatchNotificationAttemptByWebhookId`：

1. 精準 endpoint lookup 與 caller route scope 驗證。
2. 沿用 active/test_pending/disabled、expiry、輪替密鑰與 ownership 檢查。
3. 呼叫一次 WebhookDispatchService.dispatchAttempt。
4. 記錄既有 webhook delivery／credential usage／失敗計數；禁止另設 tenant retry timer。
5. 回傳經驗證 ack 或 typed failure + suggestedNextAttemptAt；最終失敗的 endpoint 計數依 logical delivery 去重，不能由每次 attempt 重複觸發停用。
6. consumer owner 在自己的 fence transaction 中記錄 receipt、delivery context、outbox outcome，釋放 claim。

結果未知：夥伴已存事件但我方 timeout，或 ack 已到但我方 DB commit 失敗，不能宣稱成功或 exactly-once。以同一 notification_id/delivery_id/payload 重試，夥伴 durable dedupe 回原 receipt。舊 lease worker 回覆不得越過新的 fence。接收端也必須把「dedupe 記錄 + 通知入列」做原子交易。

重試策略使用 endpoint 已核准 policy 的 snapshot，不另沿用 MultiTaxiService 的另一套 60 秒倍增規則。若 maxAttempts=5，總共 5 次嘗試、最多 4 次重試。回退時間依 policy 初始值、倍數、上限計算；不要把五次 delay 誤算成六次嘗試。

保留平台 timeout 預設 10 秒、夥伴不可自行調高。本通知模式讀取 ack body 也須包含在同一 deadline，並限制為 4 KiB；普通 tenant webhook 維持既有 status-only 行為與測試，不因新模式一律讀 body。

HTTP security：精準核准 HTTPS endpoint；不跟隨 redirect；限制私有／loopback／link-local／metadata 地址與 DNS rebind；簽章每次依實際傳出 bytes 計算；secret 不進 client。這是本案接收端可配置所需的派送門檻，不宣稱現有 transport 已全部具備。

## 9. 錯誤分類與兼容狀態

原 outbox enum 不直接加入 blocked/expired 等值。新增伴隨 delivery metadata：failureReason、retryDisposition、expiresAt、deliveryTarget、deliveryStage、receiptId。

retryDisposition = automatic | configuration_blocked | manual_only | terminal | none。

| 情境 | outbox/result | 伴隨 reason／處理 |
|---|---|---|
| 無 binding、未啟用、test_pending | failed/provider_not_configured | configuration_blocked；配置變更後再喚醒 |
| entry/endpoint 停用 | failed/provider_not_configured | endpoint_disabled；沿既有重測規則恢復 |
| route 缺失／多重／owner 改變 | failed/provider_error | route_missing/ambiguous/owner_changed；manual_only |
| recipient link revoked | failed/provider_error | recipient_revoked；terminal，不外送 |
| 408/429/指定 5xx/timeout | failed/provider_error | automatic，但受最大次數和 expiresAt 限制 |
| 401/403 | failed/provider_error | credential_rejected；configuration_blocked，禁止盲試 |
| 404/410 | failed/provider_error | endpoint_unavailable；configuration_blocked |
| 非相符 ack、204／假 200 | failed/provider_error | partner_ack_invalid；manual_only，避免未知通知重複 |
| 超時效／已取消／被新事件取代 | failed/provider_error | notification_expired/obsolete/superseded；terminal |
| 200/201/202 + 合法 ack | delivered/delivered | partner_accepted；downstream unknown |

worker 選取需同時檢查原狀態、nextAttemptAt、retryDisposition、expiresAt。否則所有 failed 仍會被通用 worker 無限重掃。

失敗後不取消行程、不回退 dispatch、不阻斷 SOS、也不清除已建立訂單。新 partner 通知功能以 test_pending→ready 作啟用 gate；不把暫時的 webhook 故障變成已上車乘客不能完成行程的 gate。

## 10. 點通知回行程：首版必要，不能省略

notification.navigation 只帶 type=ride 與 ride_ref，不放可登入的 deep link token。流程：

1. 原生 App 確認當前登入住戶；切換帳戶後不可直接看上一位住戶的通知行程。
2. 夥伴 backend 帶 entry 與 authenticated partnerUserRef 取得新的 handoff。
3. DRTS 核驗該住戶、原 entry 與 rideRef 的 order 歸屬。
4. 建立 fresh HttpOnly session，再導入原行程頁。
5. 讀最新 assignment/狀態；不能信通知過期的車牌／ETA／版本。

新增受權限保護的 resolution API：

```http
POST /api/partner/entries/{entrySlug}/notification-navigation/resolve
```

body：rideRef、partnerUserRef。使用 entry-scoped partner 憑證與原有 handoff auth policy；partnerUserRef 的可信性來自已驗證夥伴服務及其登入會話，不來自 WebView query。回傳經既有 handoff 機制簽發的短期 single-use artifact／受控目的地，禁止新開長效 bearer 管道。所有原有 120 秒／single-use 規則沿用。無權限一律 403／一致的不可用訊息，避免 order enumeration。

session 失效、App logout、冷啟動、錯 entry、已結束行程都要有真機案例。導航失敗不自動創建另一張訂單。

## 11. 資料落點與 migration 範圍

新增以下資料，不複製端點／密鑰表：

- admin.phase1_partner_notification_bindings：PK entry_slug；binding_id 唯一；tenant_id/partner_id/webhook_id、version、state、event_types、ack policy、endpoint fingerprint；變更寫既有 audit。
- mobility.phase1_order_partner_notification_routes：PK order_id；凍結第 4 節可信來源；ride_ref 唯一；敏感參照依既有 policy 受限存取。
- mobility.phase1_partner_notification_delivery_contexts：PK outbox_id；delivery_id 唯一；order_id、route/binding snapshot、wire payload/hash、event_sequence、expires_at、retry_disposition、failure_reason、ack evidence、delivery target/stage。
- mobility.phase1_partner_notification_sequences：PK order_id；next_sequence bigint；生成事件時原子分配，不在重試時改動。

以上是新增目標表名，不聲稱已存在。沿 SR-CONTRACT 分配 migration 編號；不得重用已套用 migration、改寫 source archive 或凍結 schema。既有 ID 採現有 contracts 的 string，表間本次新關係使用同型別；既有 outbox／webhook 表的主鍵型別由 schema-reconciliation 測試以 catalog 斷言，不能默默 CAST 形成跨型別 FK。

舊資料一律預設非 partner transport：不得把無 route 的歷史通知推給 yuhe-residence。可回溯且未交付、未過期的事件才建立 route context；其它留存未送達原因。

## 12. 程式異動清單

| 位置 | 本次動作 |
|---|---|
| contracts：新 partner-passenger-notification.ts | 新增 binding／route／wire ack／typed failure；export；原 outbox 及結果 enum 保留 |
| tenant-partner：notification binding service/repository/controller | 精準綁定、版本、scope、測試、治理 façade |
| webhook-dispatch.service.ts | opt-in partner_ack_v1 回執模式；限量 body + deadline；一般 tenant 行為不變 |
| multi-taxi：partner-notification.transport.ts | 實作 PassengerPushTransport，載入可信 route 並委派一次派送 |
| passenger-push.adapter.ts | partner 模式不解析 PassengerDevice；不可用 synthetic receipt；錯誤保留分類 |
| multi-taxi.module.ts | 顯式 transportMode=partner_webhook 的 DI；移除此模式下 WebPushTransport/DeviceResolver 注入，避免只新增 class 未啟用 |
| multi-taxi.service.ts/repository.ts | typed failure、route-aware availability、單一重試政策、context receipt 同 fence transaction |
| 訂單建單／outbox producer | 原交易寫 route、sequence、事件原始版本與 expiresAt |
| referral-embed BFF | fresh handoff 後導回指定受權限保護的 ride；原前景更新機制保留 |
| Platform/Ops | 綁定、就緒、未交付原因、真實 stage 與受控 retry；UI 細節另檔 |

isAvailable() 只能表示 transport 的服務級能力，不能因存在 transport object 就把每個 entry 說成可通知。新增 route-aware readiness；缺配置必須回明確不可用。

Module 依賴採單向：multi-taxi → tenant-partner 已 export 的窄通知 façade／transport port。若既有 graph 形成循環，將單次 HTTP/HMAC primitive 抽到 common delivery module 供雙方使用，不用 global locator 或跳過權限來破循環；不得令 tenant 通知 scheduler 回呼 multi-taxi 再反向調用造成雙 owner。

## 13. 停用 Web Push 舊方案

在本拓撲採 partner_webhook，Web Push 不作 fallback。移除 retired passenger-web 的新 service-worker 註冊引用；不因本工作復活、重新部署該 App，也不對有其他用途的 service worker 一律 unregister。

WebPushTransport、web-push-crypto.ts 可先留為未綁定 legacy code。VAPID 三個 secrets 是既有狀態；本次未讀取、未更動。規格先不刪 secret，確認無其它有效使用者後再另開受控清理，不能順便破壞其它已部署功能。

P05 的 recipient 與 acceptance 改用本案；保留舊決策的 superseded 追溯，不改原始 source hash。

## 14. 驗收與任務

### 驗收三層

A. DRTS 內部可完成：受控 receiver、兩租戶隔離、簽章、retry、claim/fence、ack、DB 故障、expired／superseded、navigation 權限。狀態 controlled_receiver_verified，不是 live partner。

B. SR-LIVE-PUSH-001 端點層：至少一家真實夥伴提供測試 endpoint；保存實際 HTTPS request/response 的遮罩證據、夥伴 receipt、outbox durable record，狀態 partner_endpoint_verified。

C. 乘客通知功能 pilot 放行：第一家夥伴原生 App 背景／冷啟動收到通知，點擊後 fresh handoff 到正確行程。夥伴支援雙平台時，iOS 與 Android 都驗；只支援一種則明列限制。使用者關閉通知時不得宣稱裝置一定收到。

不能用 A 關閉 B；也不能用 B 冒充 C。舊 3 秒／10 秒若定義終點是裝置，不得改成 HTTP 回應後宣稱達標。分開記 occurred→queued、queued→attempt、attempt→partner accepted、partner→device/open 的 timestamp；本次 own scheduling 目標 p95 首次開始嘗試 ≤3 秒，受控環境量測，不承諾夥伴或 OS 延遲。

### 本輪新工作 ID（工程排程使用）

| Task | Owner | 交付／依賴 |
|---|---|---|
| SR-PARTNER-NOTIFY-CON-20260917 | SA/Contract | 六決策、wire schema、compat、migration 配號；最先 |
| SR-PARTNER-NOTIFY-ROUTE-20260917 | Backend | entry binding + order route + scoped identity + counters |
| SR-PARTNER-NOTIFY-ACK-20260917 | Backend | webhook 單次派送 façade + opt-in 回執；先回歸一般 webhook |
| SR-PARTNER-NOTIFY-TRANSPORT-20260917 | Backend | transport/DI/錯誤分類/單一 retry/receipt fencing；依上兩項 |
| SR-PARTNER-NOTIFY-NAV-20260917 | BFF/Partner | safe rideRef resolve + fresh handoff，夥伴 integration guide |
| SR-PARTNER-NOTIFY-UI-20260917 | Web/UI | 按獨立設計 brief 接真狀態，不冒稱裝置送達 |
| SR-PARTNER-NOTIFY-LEGACY-20260917 | DevOps/Web | 停用本拓撲 Web Push；不刪 secret；production config guard |
| SR-PARTNER-NOTIFY-QA-20260917 | QA | 下面全部負向／故障／多租戶案例；不可覆蓋既有 C111–C115 |
| SR-LIVE-PUSH-001 | Integration | 真夥伴 endpoint 證據；接續第一家原生裝置 pilot |

最低自動化案例：同 tenant 兩 entry 僅送原 entry；跨 tenant 相同 URL 隔離；同住戶在兩 App 不串單；entry 改 tenant 後舊消息不移轉；link 撤銷停送；endpoint 停用／輪替重測；缺 route 不猜；204／HTML200／錯 receipt 拒絕；partner 已入列但我方 timeout 後 duplicate ack；ack 後 DB 寫入失敗與 worker lease 到期；兩個 worker 競爭；五次 maxattempt；expiresAt；改派舊 ETA；取消後舊到場；缺 driver 情報不洩漏；錯 entry／logout 冷啟動點擊；未配置不可 available；既有一般 tenant webhook C111–C115 回歸。

## 15. 完成定義

設計完成不等於開發完成。工程完成要有 pinned commit、migration、contract tests、一般 webhook 回歸、outbox 故障測試及 UI 真狀態。對外 pilot 完成另要有真夥伴端點與原生 App 證據。本文件只產出設計，未修改程式、未部署、未重跑系統測試。
