# 乘客通知送達夥伴 App 的系統分析（SA）

狀態：草案，待產品決策
日期：2026-09-17
取代：2026-09-15 的「自簽 VAPID 瀏覽器 Web Push」決策（Q-SR-PUSH-001 / P05）

## 1. 為什麼要改

2026-09-15 的決策把乘客推播的接收端定為我們自己的網頁，先是 `apps/passenger-web`，
後來發現該 app 已於 2026-06-16 退役、未部署於 dev，改議 `apps/referral-embed-web`。

實際看過線上頁面後，前提被推翻。`/embed/{entrySlug}` 頁面自身標示
`webview · embedded`，身分由夥伴 App 以簽章 handoff 帶入，住戶不需登入。
也就是說：

- 乘客不是在我們的網域上活動，而是在各家夥伴 App 的 WebView 裡。
- 會有多家夥伴 App 內嵌同一組頁面，`yuhe-residence` 只是其中之一。
- 瀏覽器 Web Push 在 WKWebView 完全不支援，在 Android WebView 行為亦不等同瀏覽器。

因此通知的接收端應該是**夥伴 App 本身**，由夥伴 App 用它自己既有的推播管道通知住戶。
我們的系統負責把事件可靠地送到夥伴，而不是直接觸及終端裝置。

## 2. 實際拓撲

```
訂單事件 → consumer notification outbox → 出站傳輸 → 夥伴通知端點 → 夥伴 App → 住戶裝置
                                  （我們負責到這裡）        （夥伴負責）
```

分界點是夥伴的通知端點。這條分界線決定了「送達」的定義，見第 5 節。

## 3. 可沿用的既有資產

這些與傳輸方式無關，不需重做：

- `ConsumerNotificationOutboxRecord` 的持久化、狀態機、重試排程、去重。
- `PassengerPushPort` 與 `PassengerPushAdapter` 的供應商中立設計與可注入 transport。
- `PASSENGER_PUSH_DELIVERY_RESULTS` 的 fail-closed 語意：沒有可用管道就維持未送達，
  不得標記 delivered。
- `SR-PUSH-DURABILITY-20260911` 的 claim / fence / receipt。

**最重要的是**：`apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts` 已有
成熟的出站派送機制，且剛由 `SR-QA-WEBHOOK-001`（C111–C115）完整驗收，涵蓋 API 金鑰、
簽章、重試、逾時、停用、輪替、去重。`TenantWebhookEndpoint` 契約已具備事件訂閱
（`events[]`）、狀態（active / test_pending / disabled）、密鑰版本與輪替重疊、
retry policy 與測試發送。

## 4. 要重做或新增的

- **移除**：`apps/passenger-web` 的 service worker 與訂閱註冊（該 app 已退役，不部署）。
- **擱置**：`WebPushTransport`、`web-push-crypto.ts` 與 VAPID 憑證。程式保留無害，
  但不是本拓撲的傳輸方式。dev 上已建立的三個 VAPID secret 暫不刪除，待決策定案後處理。
- **新增**：`PartnerNotificationTransport`，實作 `PassengerPushTransport` 介面，
  將 outbox 事件轉為對夥伴通知端點的簽章請求，內部委派既有 webhook 派送機制。

## 5. 已識別的缺口

### 5.1 出站端點的歸屬層級

現有 webhook 端點是 **tenant 層級**（`TenantWebhookEndpoint.tenantId`）。
夥伴 entry（`entrySlug`）目前只有**入站**憑證（`partner-entries/{entrySlug}/credentials/issue`
與 `/revoke`），沒有對應的**出站**通知端點。

需要決定夥伴 entry 與 tenant 的關係：一個夥伴 entry 是否恆屬於一個 tenant，
若是，可直接沿用 tenant webhook；若否，需要為 partner entry 增設出站端點模型。
這會決定本案是設定工作還是新增資料模型。

### 5.2 「送達」的定義

目前 receipt 語意是收到 2xx 即視為交付。但交付給夥伴伺服器不等於住戶看到通知。
需要決定：

- 夥伴回 2xx 就算 `delivered`，或需要夥伴回報二段式確認。
- 夥伴未實作、端點停用、或連續失敗時，outbox 應停在哪個狀態。
- 這直接決定 `SR-LIVE-PUSH-001` 的驗收證據形態，見第 7 節。

### 5.3 酬載內容與隱私

outbox 攜帶 `passengerSubjectRef`（化名參照），乘客識別在嵌入頁是遮罩顯示的。
需要決定送給夥伴的內容範圍：訂單狀態、司機資訊、車牌、ETA、位置。
夥伴已知道住戶身分（是它帶入的），但仍應遵循最小揭露。

### 5.4 事件命名

outbox 目前有五種事件：`assignment_disclosure_ready`、`assignment_replaced`、
`eta_changed`、`driver_arrived`、`receipt_ready`。需決定對外事件名稱空間
（例如 `passenger.assignment_ready`）並納入 `TenantWebhookEndpoint.events[]` 的訂閱清單。

## 6. 待產品決策（需回答才能進入 SD）

1. 夥伴 entry 與 tenant 是一對一嗎？出站端點掛在哪一層？
2. 夥伴回 2xx 是否即為 `delivered`？是否需要二段式確認？
3. 夥伴未實作通知端點時，該 entry 的乘客通知應如何處置？
4. 酬載最小集合為何？哪些欄位禁止外送？
5. 對外事件命名與版本策略？
6. 首版要支援幾家夥伴？是否只做 `yuhe-residence` 一家先行？

## 7. 對既有任務的影響

- `SR-LIVE-PUSH-001`：外部條件從「真裝置 + 推播供應商帳號」改為
  「至少一家夥伴提供可接收的測試端點」。真裝置驗收是否仍必要，取決於 5.2 的決定。
  若送達只定義到夥伴伺服器，我方可獨立完成驗收；若要證明住戶收到，需夥伴配合。
- `SR-PUSH-WEBPUSH-20260915`：已合併，其前端部分成為無效資產，需另開任務清理或停用。
- `SR-DEV-VAPID-SECRETS-20260916`：已合併，條件式掛載不影響部署，暫可保留。

## 8. 建議分階段

1. 回答第 6 節，確定端點歸屬與送達定義。
2. 若沿用 tenant webhook：新增 `PartnerNotificationTransport` 並註冊事件，
   不動資料模型。若需 partner entry 層級端點：先做契約與 migration（走 SR-CONTRACT 配置）。
3. 以 `yuhe-residence` 單一夥伴做端到端驗證。
4. 再擴至多夥伴與正式驗收。

## 9. 更正紀錄

本節原記載「使用者回報嵌入頁上有錯誤」，係 Supervisor 誤讀所致。使用者原句
「又有錯誤」指的是 Supervisor 的判斷有誤（誤認 frame-ancestors 已排除 WebView
疑慮），不是頁面故障。「開始叫車」按鈕亦為 Supervisor 自行推測，使用者未提及。
此條目已撤銷，未建立任務。

> **已於 2026-09-17 被取代**：本文件僅提出六個待決問題，未定案。
> 正式決議與完整 SD 見 [partner-notification-20260917/](partner-notification-20260917/README.md)。
> 本檔保留作追溯。
