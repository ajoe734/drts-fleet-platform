# SR-PUSH-WEBPUSH-20260915 — 乘客 Web Push 訂閱註冊與離頁送達

- **Task ID**: `SR-PUSH-WEBPUSH-20260915`
- **任務名稱**: 乘客 Web Push 訂閱註冊與離頁送達
- **Owner**: `Claude2`；**Reviewer**: `Codex`
- **前置相依 (Dependencies)**: `SR-PUSH-001`（供應商中立底層：`PassengerPushAdapter`、fail-safe、邊界測試，已合併於 `origin/dev`）
- **開放問題參照 (Open Question Reference)**: `PHASE1_OPEN_QUESTIONS.md` (`Q-SR-PUSH-001`，本任務結案時更新為已決議)
- **產品決策參照**: 2026-09-15 使用者決策（Q-SR-PUSH-001 / P05）— 乘客推播接收端為既有 `apps/passenger-web`；離頁送達採 Web Push (VAPID)；不開發原生乘客 App；不新增外部推播供應商。

---

## 1. 範圍與不變項 (Scope & Invariants)

`SR-PUSH-001` 交付了供應商中立的底層（`PassengerPushPort` / `PassengerPushAdapter` / fail-safe availability / 裝置生命週期防護的介面），但刻意把三件事留白：passenger-web 端沒有訂閱註冊、`PassengerDeviceResolver` 只有介面沒有實作也沒有註冊進模組（因此執行期 `device` 恆為 `null`）、以及一個能真正承載 Web Push 每筆訂閱自己的 `endpoint` + `p256dh`/`auth` 金鑰的傳輸層。本任務只補這三件事，不重做也不回退 `SR-PUSH-001` 已交付的中立層。

不變項（本任務未變更、亦不得由 unit test 通過解除）：

- 未授權（access token 無效/過期）或無訂閱，一律不得標記 `delivered`。
- `SR-LIVE-PUSH-001` 真裝置驗收 gate 與 C023/N10 保留。

## 2. 實作內容 (What Was Built)

### 2.1 中立層的兩處必要延伸 (`passenger-push.adapter.ts`, `passenger-push.port.ts`)

- `PassengerDeviceRecord` 新增 `webPushSubscription?: { endpoint; keys: { p256dh; auth } }`。Web Push 每筆訂閱有自己的 `endpoint` 與一對金鑰，形狀與既有「單一設定 endpoint + `deviceToken`」的內建 HTTP transport 不同；新欄位讓訂閱維持自己的結構，不把訂閱 JSON 塞進 `deviceToken` 字串。
- `PassengerDeviceResolver.resolveDevice` 的 context 新增 `orderId?: string`（`send()` 呼叫端已補傳 `message.orderId`），讓 resolver 能查出「這筆訂單、這個乘客」綁定的訂閱，而不只是乘客本身。
- `PassengerPushTransport` 新增可選 `isAvailable?(): boolean`。
- **修正 `PassengerPushAdapter.isAvailable()` 的既有風險**：舊版邏輯是「只要注入了 `transport` 物件就回傳 `true`」，這對 Web Push 是錯的——一個沒有設定 VAPID 金鑰的 `WebPushTransport` 實例依然會被判定為可送達。現在若 transport 有提供 `isAvailable()`，一律改為詢問 transport 本身；沒提供才維持原本「物件存在即可用」的相容行為。任務說明另外點名的「泛用環境變數誤判」風險（`PASSENGER_PUSH_API_KEY` 等），對應到的正是這個 `if (this.transport) return true` 分支——它與 `WebPushTransport` 綁定後就是唯一會被走到的路徑，此修正直接關閉它。
- 新增 `PassengerPushNoSubscriptionError`（`passenger-push.port.ts`）：與既有 `PassengerPushDeviceExpiredError` / `PassengerPushDeviceRevokedError` 並列，但語意不同——它涵蓋「`resolveDevice` 回傳 `null`」（從未訂閱、或訂閱屬於別的乘客），在既有裝置生命週期檢查根本還沒開始跑之前就已經確定沒有裝置。

### 2.2 Web Push 加密與 VAPID 簽章 (`web-push-crypto.ts`, `web-push.transport.ts`，新增)

`web-push-crypto.ts` 直接以 Node `crypto` 原語實作三份 RFC，不引入新的 npm 相依：

- **RFC 8291**（Web Push 訊息加密）+ **RFC 8188**（`aes128gcm` content encoding）：`encryptWebPushPayload` 每次呼叫都產生新的 ECDH 臨時金鑰對與新的隨機 16-byte salt，依序推導 `PRK_key → IKM → PRK → CEK/NONCE`，以 `aes-128-gcm` 加密後組成 `salt(16) | rs(4) | idlen(1) | keyid(idlen) | ciphertext+tag` 的完整 body，可直接以 `Content-Encoding: aes128gcm` POST 給訂閱的 `endpoint`。
- **RFC 8292**（VAPID）：`signVapidJwt` 用訂閱端點的 origin 當 `aud`，以 `dsaEncoding: "ieee-p1363"` 產生 JWS 要求的 raw `r‖s` ES256 簽章（而非 Node 預設的 DER），組出 `Authorization: vapid t=<jwt>, k=<公鑰>`。

`web-push.transport.ts` 的 `WebPushTransport implements PassengerPushTransport`：

- `isAvailable()` 只在 VAPID 公鑰/私鑰/subject 三者皆存在且形狀正確（65-byte 未壓縮 P-256 公鑰、32-byte 私鑰純量）時回傳 `true`；一個環境變數存在但格式錯誤不會被誤判為可用。
- `send()`：`device.webPushSubscription` 缺席時拋 `PassengerPushNoSubscriptionError`（絕不退回到舊版單一 endpoint 的通用 fetch 邏輯，避免把 Web Push 酬載當成一般 JSON 發出去）；成功送出後把 HTTP `404`/`410`（Push API 對已失效訂閱的標準回應）轉譯為既有的 `PassengerPushDeviceRevokedError`，其餘非 2xx 轉譯為既有的 `PassengerPushProviderError`。

### 2.3 訂閱儲存與 Device Resolver 實作 (`passenger-push.repository.ts`，新增)

- `PassengerPushRepository`：以訂單 ID 為鍵的訂閱儲存（in-memory；本任務未列 migration，見 §5 已知限制）。同一訂單重新訂閱直接取代舊紀錄，不累積多個 stale endpoint。
- `PassengerPushDeviceResolver implements PassengerDeviceResolver`：`SR-PUSH-001`交付的介面在 dev 上「只有介面、無實作、未註冊」，本任務補上這個實作並在 `multi-taxi.module.ts` 綁定到 `PASSENGER_DEVICE_RESOLVER`。沒有 `orderId`、沒有該訂單的有效訂閱、或訂閱的 `passengerSubjectRef` 與呼叫端要通知的乘客不符，一律回傳 `null`（配合 §2.2 的 `PassengerPushNoSubscriptionError`，絕不虛構裝置）。
- **訂閱生命週期跟隨 ride access token**：`resolveDevice` 回傳的 `expiresAt` 直接沿用訂閱當初綁定的 access token `expiresAt`，重用 `PassengerPushAdapter` 既有的到期檢查（`device.expiresAt` 過期即拋 `PassengerPushDeviceExpiredError`），不另外發明第二套到期機制。目前 `PassengerRideAccessToken` 在整個程式庫裡沒有任何「主動撤銷」的寫入路徑（`revokedAt` 只在建立時寫 `null`），所以以到期時間為準與「token 失效即撤銷」等價；若未來新增主動撤銷路徑，該呼叫點必須同時呼叫 `PassengerPushRepository.revokeByOrderId`（已在程式碼註解中標註）。

### 2.4 API 端點與服務方法 (`multi-taxi.service.ts`, `multi-taxi.controller.ts`, `multi-taxi.module.ts`)

- `POST passenger-rides/:accessToken/push-subscriptions`、`DELETE passenger-rides/:accessToken/push-subscriptions`：沿用既有 `requireAccessToken(accessToken, "ride:read")`（沒有新增專用 scope——訂閱能收到的通知本來就是這個 token 已經能讀到的行程狀態）。訂閱 payload 驗證：`endpoint` 必須是 `https://`、`p256dh`/`auth` 不可為空，否則 400。
- `GET multi-taxi/push/vapid-public-key`：回傳 VAPID **公**鑰（非機密），供前端呼叫 `PushManager.subscribe({ applicationServerKey })`。
- `multi-taxi.module.ts` 新增並綁定 `PassengerPushRepository`、`PassengerPushDeviceResolver` → `PASSENGER_DEVICE_RESOLVER`、`WebPushTransport` → `PASSENGER_PUSH_TRANSPORT`。

### 2.5 passenger-web：Service Worker 與訂閱註冊

- `public/sw.js`：`push` 事件顯示通知（依 `eventType` 給中文標題），`notificationclick` 嘗試 focus 既有的 `/ride/` 分頁。**已知限制**：推播酬載刻意不帶 ride access token（伺服器只保留 token 的雜湊值，從未保留明文，技術上就無法把它放進酬載讓 SW 組深連結），因此點擊通知只能 focus 既有分頁，無法從無分頁狀態直接開啟該筆行程。
- `lib/passenger-push-subscription.ts`：`subscribePassengerPush(token)` 依序做 `Notification.requestPermission()` → 取得 VAPID 公鑰 → 註冊/取得 `PushSubscription` → `POST .../push-subscriptions`；`unsubscribePassengerPush(token)` 反向操作。
- `components/passenger-ride-page.tsx`：在既有 `/ride/[token]` 主畫面（`kind === "ride"`，不含 `fares`/`receipt` 子頁）加入一個不顯眼的「開啟行程狀態通知」按鈕，樣式完全重用既有 `passengerChrome` token 與 `buttonStyle("ghost")`——沒有引入任何新色票，也沒有新設計畫面（瀏覽器原生權限對話框無法、也不應該由本任務重新設計）。
- `app/control-plane-proxy/[...path]/route.ts`：此代理原本只允許白名單內的 GET/POST 路徑且未匯出 `DELETE` handler。補上 `multi-taxi/push/vapid-public-key`（GET）與 `passenger-rides/:token/push-subscriptions`（POST + DELETE）的白名單條目，並新增 `DELETE` handler——否則前端新增的三個呼叫全部會被代理擋在 404。

### 2.6 測試 (`tests/unit/system-remediation/sr-push-webpush-20260915/`，新增，4 個檔案、35 個測試，全數通過)

- `web-push-crypto.test.ts`（10 個）：**獨立於**生產端加密程式碼、依規格重新實作 receiver 端解密，驗證真正的加解密往返（不是只驗證「沒有丟例外」）；VAPID JWT 簽章以 Node 原生 `crypto.verify` 反向驗證；每次呼叫都產生新 salt/新臨時金鑰；金鑰形狀驗證函式的正反案例。
- `passenger-push-subscription-lifecycle.test.ts`（12 個）：`PassengerPushRepository` 的儲存/取代/撤銷語意；`PassengerPushDeviceResolver` 在無 `orderId`、無訂閱、乘客不符、正常解析、以及沿用 access token `expiresAt` 等情境下的行為。
- `web-push-transport.test.ts`（9 個）：`isAvailable()` 在「無金鑰」「金鑰格式錯誤」「金鑰齊全」下的行為，特別驗證「設了不相關的泛用推播環境變數也不會被誤判為可用」；`send()` 的無訂閱／成功（驗證酬載確實加密、明文不外洩、帶 VAPID Authorization header）／410／500 四種路徑。
- `multi-taxi-push-subscription-endpoints.test.ts`（4 個服務層 + 4 個端到端）：`registerPassengerPushSubscription`/`unregisterPassengerPushSubscription` 對 access token 的綁定與 payload 驗證；端到端證明「從未訂閱」「已取消訂閱」兩種情況下 `deliverPassengerNotification` 都不會回傳 `delivered`，以及訂閱存在時透過真正的 `WebPushTransport`（mock `fetch`）完成一次送達。

既有 `tests/unit/system-remediation/sr-push-001/`（16 個）與 `sr-push-durability-20260911/`（12 個）、`apps/api/tests/unit/multi-taxi-passenger-authority.test.ts`、`apps/api/tests/unit/multi-taxi.service.test.ts` 全部重跑通過，確認 `MultiTaxiService` 建構子新增的第 7 個可選參數（`pushSubscriptionRepository`）未破壞既有呼叫端。`apps/api`、`apps/passenger-web` 的 `typecheck`、`lint` 均為 0 錯誤/0 警告。

## 3. 未做的事 (Explicitly Out of Scope)

- **不涉及真裝置驗收**：本任務只到「加密酬載送到訂閱的 endpoint、Node 端可獨立解密驗證正確性」為止。`SR-LIVE-PUSH-001` 的真裝置證據 gate 與 C023/N10 未被觸碰，也不因為本任務的 unit test 通過而解除。
- **不重做 `SR-PUSH-001` 已交付的中立層**：`PassengerPushAdapter` 本身的 fail-safe 骨架、`PassengerPushDeviceExpiredError`/`RevokedError`/`TenantMismatchError`、`MultiTaxiService.deliverPassengerNotification` 的 claim/lease/fence 與重複送達防護，全部原樣保留。
- **不新增外部推播供應商**：`WebPushTransport` 沒有任何供應商帳號概念，"provider" 在這裡就是這個服務實例自己的 VAPID 金鑰加上乘客自己的瀏覽器訂閱。

## 4. 手動/執行期驗證限制 (Execution Environment Note)

本任務在 supervisor/worker 沙箱中完成，環境限制不得啟動 product dev server、瀏覽器測試伺服器或 Docker Compose 基礎設施。因此：

- 所有驗證皆為 `vitest` 單元測試（見 §2.6）與 `tsc --noEmit` / `eslint` 靜態檢查，未執行 `pnpm dev` 或瀏覽器端的 `Notification.requestPermission()` / `PushManager.subscribe()` 手動走查。
- Service worker（`public/sw.js`）的 `push`/`notificationclick` 事件處理邏輯未在真實瀏覽器中執行過；其正確性目前只由程式碼審閱與既有 Push API 事件模型保證。

## 5. 已知限制與後續請求 (Known Gaps / Follow-up Ask for Codex)

- **`PASSENGER_PUSH_DELIVERY_RESULTS` 缺少「無訂閱」結果值**：任務說明明確要求「須經 SR-CONTRACT allocation，不得自行新增或挪用既有值」。`packages/contracts` 不在本任務 artifacts 範圍內，且 `docs/03-runbooks/system-remediation-execution-tasks-20260906.md` 第 4 點明訂 `packages/contracts` exports 只由 `SR-CONTRACT` 整合，因此本任務**沒有**新增或挪用 `PassengerPushDeliveryResult` 的任何既有值。目前的行為：`PassengerPushNoSubscriptionError` 與既有 `PassengerPushDeviceExpiredError`/`RevokedError`/`TenantMismatchError` 一樣，統一被 `MultiTaxiService.deliverPassengerNotification` 既有的 catch-all 分支吸收為 `result: "provider_error"`——這不是本任務新引入的近似值，是 `SR-PUSH-001` 對所有裝置生命週期錯誤原本就採用的既有模式；不變項「未授權或無訂閱一律不得標記 delivered」因此已經成立（`provider_error` 不是 `delivered`），但「無訂閱」與「供應商真的回報錯誤」目前在可觀測性上無法區分。**請 Codex 在 `SR-CONTRACT-001` 整合時分配一個新的 `PassengerPushDeliveryResult` 值**（例如 `"no_subscription"`），分配後只需要在 `web-push.transport.ts`／`multi-taxi.service.ts` 的既有 catch 分支加一個 `instanceof PassengerPushNoSubscriptionError` 判斷，改動範圍很小。
- **訂閱儲存為 in-memory**：`PassengerPushRepository` 沒有搭配的資料庫 migration（本任務 artifacts 未列此檔案），行程程序重啟會遺失既有訂閱（乘客需重新開啟通知）。若要跨重啟持久化，需要一個新的 migration 與對應的 Postgres-backed 實作接在同一介面後面。
- **通知點擊無法深連結到特定行程**：見 §2.5，因為伺服器從未保留明文 access token，技術上無解，除非未來改變 token 的保存方式。

## 6. Q-SR-PUSH-001 結案

`PHASE1_OPEN_QUESTIONS.md` 的 `Q-SR-PUSH-001` 已於本任務隨附的變更中從「Open Items」移至「Resolved Items」，並記錄本文件為結案依據。
