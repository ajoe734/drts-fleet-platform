# 乘客 App：系統設計與架構決策 (SA/SD)

## 1. 系統架構 (A1-A2)

- **新網頁 App (`apps/passenger-app-web`)**：基於 Next.js 的網頁前端。退役舊有 `apps/passenger-web`，但不刪除其防護，必要時以 `git show` 移植可用程式（如行程頁、SSE client、BFF proxy）。新 App 要登記到 `repo-classification.json` 的 active-product-apps 與 app-build-and-deploy-config，以及 `.github/CODEOWNERS`，若有新路徑則登記到 CI 的 exceptions。
- **新套件 (`packages/passenger-client`)**：純 TypeScript 套件，放置 API 型別、呼叫邏輯、view model、狀態對應與文案。提供網頁及未來原生 App 共用，禁止依賴 DOM/Node/Next，禁止將商業邏輯寫死在網頁 App。新 App 與新套件的單元測試必須在 CI 執行。
- **BFF (Backend for Frontend)**：
  - 瀏覽器僅與 BFF (Next route handlers) 溝通，由 BFF 呼叫後端 API。
  - 登入前 (OTP、OAuth callback、公開費率) BFF 帶 metadata identity token (限制 path allowlist)。
  - 登入後 BFF 帶乘客 JWT (Bearer)。
  - Session token 僅存在 `HttpOnly`, `Secure`, `SameSite=Lax` 的 cookie，前端 JS 無法讀取。

## 2. 帳號與登入身分 (A3-A5)

- **乘客 Realm 與 ActorType**：新增 `passenger` realm 與 `first_party_passenger` actorType。帳號 ID 為 `drts_passenger_id`。不跨通路合併帳號。
- **身分連結規則**：
  - 各 provider 登入先尋找對應登入身分，找到即登入；找不到則建立新帳號。禁止因 email/手機相同而自動合併帳號，防範未驗證 email 盜用。
  - 僅允許在已登入狀態下，明確操作「綁定」才能將新 provider 加入當前帳號。
- **Session 規則**：
  - Access JWT 效期 15 分鐘。
  - Refresh token 效期 30 天並實作輪替，重用時撤銷整個 family。
  - 登出及刪帳號時撤銷 session。刪帳號時進行軟刪除及個資匿名化，僅保留法規要求的行程/財務紀錄。
- **OTP 登入 (Email/手機)**：
  - 6位數，加 pepper 後 hash 存放，固定時間比對。5 分鐘有效，最多錯 5 次。同一 challenge 重送冷卻 60 秒。
  - IP 限制與次數限制：同一目標每小時最多 5 次。
  - Email 走 NotificationDeliveryService (tenantless)。
  - 手機登入須待簡訊商上線（不可用時回「未設定」並隱藏介面）。
- **第三方登入 (OAuth/OIDC)**：
  - Google/LINE 走 OIDC (PKCE + state + nonce)；Facebook 走 OAuth2 + `/me` (附 `appsecret_proof`)。
  - Client secrets 僅限後端 API，BFF 只處理導向與 callback。

## 3. API Endpoints 定義

所有 API 位於 `/api/passenger-app/*`，以下列出各 endpoint 規格與錯誤碼：

| 目的                  | Method | Path                                          | Realm          | Request / Response Contract                                                    | 錯誤碼 / 備註                                              |
| --------------------- | ------ | --------------------------------------------- | -------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **請求 OTP**          | POST   | `/api/passenger-app/auth/otp/request`         | (BFF Metadata) | `RequestOtpCommand` / `RequestOtpResponse`                                     | `too_many_requests`, 同一目標/IP 限制。                 |
| **驗證 OTP**          | POST   | `/api/passenger-app/auth/otp/verify`          | (BFF Metadata) | `VerifyOtpCommand` / `VerifyOtpResponse`                                       | `invalid_code`, 5次錯誤後 `challenge_locked`。          |
| **OAuth Start**       | POST   | `/api/passenger-app/auth/oauth/{provider}/start` | (BFF Metadata) | `OAuthStartCommand` / `OAuthStartResponse`                                     | 回傳 redirectUrl/state/nonce (PKCE)。                   |
| **OAuth Callback**    | POST   | `/api/passenger-app/auth/oauth/{provider}/callback` | (BFF Metadata) | `OAuthCallbackCommand` / `OAuthCallbackResponse`                               | 驗證 code，回 session。`invalid_grant`。                |
| **取得登入支援列表**  | GET    | `/api/passenger-app/auth/providers`           | (BFF Metadata) | `GetAuthProvidersQuery` / `AuthProvidersResponse`                              | 依環境變數動態回傳。                                       |
| **Refresh Session**   | POST   | `/api/passenger-app/auth/refresh`             | (BFF Metadata) | `RefreshSessionCommand` / `RefreshSessionResponse`                             | `invalid_grant`。                                          |
| **登出**              | POST   | `/api/passenger-app/auth/logout`              | (BFF Metadata) | `LogoutCommand` / `LogoutResponse`                                             | 撤銷 session。                                             |
| **取得個人資料**      | GET    | `/api/passenger-app/me`                       | `passenger`    | `GetPassengerMeQuery` / `PassengerMeResponse`                                  |                                                            |
| **更新個人資料**      | PATCH  | `/api/passenger-app/me`                       | `passenger`    | `UpdatePassengerMeCommand` / `PassengerMeResponse`                             | 更新聯絡同意等。                                           |
| **刪除帳號**          | DELETE | `/api/passenger-app/me`                       | `passenger`    | `DeletePassengerAccountCommand` / `DeletePassengerAccountResponse`             | 軟刪除。                                                   |
| **取得綁定身分列表**  | GET    | `/api/passenger-app/me/identities`            | `passenger`    | `GetPassengerIdentitiesQuery` / `PassengerIdentitiesResponse`                  | 列出 Google/FB 等綁定。                                    |
| **解除綁定身分**      | DELETE | `/api/passenger-app/me/identities/:provider`  | `passenger`    | `UnlinkPassengerIdentityCommand` / `UnlinkPassengerIdentityResponse`           | 若為最後一個身分不可解除 (`last_identity_error`)。         |
| **取得公開費率**      | GET    | `/api/passenger-app/fares`                    | (BFF Metadata) | `GetFaresQuery` / `FaresResponse`                                              | 回傳當前生效費率版本。                                     |
| **費率試算 (Quote)**  | POST   | `/api/passenger-app/quotes`                   | `passenger`    | `FareQuoteCommand` / `FareQuoteResponse`                                       | `not_serviceable`。產生 snapshot。                         |
| **叫車 (建立訂單)**   | POST   | `/api/passenger-app/rides`                    | `passenger`    | `CreatePassengerRideCommand` / `PassengerRideResponse`                         | 僅預約。需帶 quote snapshot ID。                           |
| **行程清單**          | GET    | `/api/passenger-app/rides`                    | `passenger`    | `GetPassengerRidesQuery` / `PassengerRideListResponse`                         | 支援分頁。                                                 |
| **進行中行程**        | GET    | `/api/passenger-app/rides/active`             | `passenger`    | `GetActivePassengerRidesQuery` / `PassengerRideListResponse`                   |                                                            |
| **行程詳情**          | GET    | `/api/passenger-app/rides/:id`                | `passenger`    | `GetPassengerRideQuery` / `PassengerRideResponse`                              | 需 ownership 檢查。`not_found`。                           |
| **行程即時事件 (SSE)**| GET    | `/api/passenger-app/rides/:id/events`         | `passenger`    | -                                                                              | SSE 格式。                                                 |
| **取消行程**          | POST   | `/api/passenger-app/rides/:id/cancel`         | `passenger`    | `CancelPassengerRideCommand` / `CancelPassengerRideResponse`                   | `cannot_cancel_state`。派車前不收費。                      |
| **行程評價**          | POST   | `/api/passenger-app/rides/:id/ratings`        | `passenger`    | `RatePassengerRideCommand` / `RatePassengerRideResponse`                       | 僅完成並付款後可評 (1-5)。字數限200。                      |
| **行程客訴**          | POST   | `/api/passenger-app/rides/:id/complaints`     | `passenger`    | `CreatePassengerComplaintCommand` / `CreatePassengerComplaintResponse`         | 客訴與遺失物。                                             |
| **取得收據**          | GET    | `/api/passenger-app/rides/:id/receipt`        | `passenger`    | `GetPassengerReceiptQuery` / `PassengerReceiptResponse`                        | 可供乘客下載。                                             |
| **取得付款方式列表**  | GET    | `/api/passenger-app/payment-methods`          | `passenger`    | `GetPaymentMethodsQuery` / `PaymentMethodsResponse`                            |                                                            |
| **綁定付款方式**      | POST   | `/api/passenger-app/payment-methods`          | `passenger`    | `BindPaymentMethodCommand` / `PaymentMethodResponse`                           | `card_declined`, 支援 3DS。                                |
| **設為預設付款方式**  | PUT    | `/api/passenger-app/payment-methods/:id/default`| `passenger`  | `SetDefaultPaymentMethodCommand` / `PaymentMethodResponse`                     |                                                            |
| **移除付款方式**      | DELETE | `/api/passenger-app/payment-methods/:id`      | `passenger`    | `RemovePaymentMethodCommand` / `RemovePaymentMethodResponse`                   |                                                            |
| **裝置推送 (Phase B)**| PUT    | `/api/passenger-app/me/push-devices/:deviceToken`| `passenger` | `RegisterPushDeviceCommand` / `RegisterPushDeviceResponse`                     | 不在 Phase A 寫入。                                        |

## 4. Provider 環境變數與全有全無規則 (A10)

各 provider 需要完整的環境變數設定。若變數缺少，部署不會失敗，但該 provider 功能會預設關閉。
- Google Login: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- Facebook Login: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- LINE Login: `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`
- SMS OTP: `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_SENDER_ID`
- Payment (PSP): `PSP_MERCHANT_ID`, `PSP_API_KEY`, `PSP_SANDBOX`

Cloud Run / Workflow / Domain 部署規則：新 Cloud Run 服務 `drts-dev-passenger-app-web` 透過 `deploy-dev.yml` 部署。網域 `ride.smarttransport.tw` 透過既有的 domain-mappings-dev workflow 對應。必須從 CI publish 分支部署，禁止 VM 部署。

## 5. Phase B 前置與外部 Gate (A11)

未來開發原生 App (Phase B) 之前置條件與外部依賴：
1. **QA 先行**：必須在 Phase A 的 QA 完成後才啟動。
2. **裝置登錄與第一方推播路由**：完成裝置註冊 API，並寫入第一方推送路由，以利後續 FCM 整合 (不在 Phase A 寫入推播路由)。
3. **Apple Login (App Store 規則 4.8)**：由使用者送審前決定是否實作。
4. **外部 Gate**：Google/Apple 開發者帳號、Firebase 專案。

## 6. 不可越過的界線與嚴格限制 (A12)

- **VM 限制**：只能跑 repo 層級的 lint/typecheck/unit 檢查。禁止啟動 Next dev/API/DB/preview 測試，禁止 Docker Compose。
- **外部服務限制**：不建立或讀取真實外部帳號 secret，不發送真實簡訊、金流或 OAuth 請求。測試一律注入 stub。

## 7. 叫車、行程與派單規則 (A6)
- 叫車 API 包裝既有 `createMultiTaxiRide`，訂單聯絡人資料信任 server 登入身分，不信 body。
- 新增「帳號擁有行程」表，所有行程操作強制 ownership 檢查。

## 8. 金流與付款 (A8)
- 建立 `PaymentProviderPort` 抽象。卡號僅經由 PSP hosted fields，不進我方 API。
- 金鑰憑證換成 token，以 AES-GCM 加密存放 (金鑰來自 Secret Manager)。
- 扣款狀態沿用 P5 規範，重試耗盡進入 `manual_recovery`，阻擋未付清者的叫車。退款由 Ops 操作。Dev 提供 fake PSP，production 禁用。

## 9. 費用與運價 (A7)
- 運價表版本化 (起跳、續跳、延滯、夜間加成)。
- 試算為預估值 (由距離與時間計算)，實際收費以行程完成時為準。

## 10. 法規內容與文案 (A9)
- 客服電話一律 `02-2944-0985`。網址一律 `ride.smarttransport.tw`。
- 派車前取消不收費。低分評價支援客訴聯絡。收據 (E-04) 包含車隊業者、遮罩執登號、明細、付款方式與客服電話。
