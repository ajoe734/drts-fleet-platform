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
- **Session 與導向規則**：
  - Access JWT 效期 15 分鐘。
  - Refresh token 效期 30 天並實作輪替，重用時撤銷整個 family。
  - 登出及刪帳號時撤銷 session。刪帳號時進行軟刪除及個資匿名化，僅保留法規要求的行程/財務紀錄。
  - BFF/API Session 傳遞：登入與綁定流程 (OTP/OAuth) 需明確區分 `purpose: "login" | "link" | "verify_contact_phone"`，一律產生一次性 transaction binding。
  - BFF 負責 OAuth 導向，需使用環境變數設定的 Redirect Allowlist (`OAUTH_REDIRECT_ALLOWLIST`) 避免 Open Redirect。
- **OTP 登入 (Email/手機) 與聯絡電話驗證 (A3/A6)**：
  - 6位數，加 pepper 後 hash 存放，固定時間比對。5 分鐘有效，最多錯 5 次。同一 challenge 重送冷卻 60 秒。
  - IP 限制與次數限制：同一目標每小時最多 5 次。
  - Email 走 NotificationDeliveryService (tenantless)。
  - 手機登入須待簡訊商上線（不可用時回「未設定」並隱藏介面）。
  - 依據 `REQUIRE_SMS_VERIFICATION` 配置：未啟用前，允許 `contactPhone` 為未驗證狀態；啟用後，必須在完成 SMS 驗證並寫入 `contactPhoneVerified: true` 後才能叫車。
- **第三方登入 (OAuth/OIDC)**：
  - Google/LINE 走 OIDC (PKCE + state + nonce)；Facebook 走 OAuth2 + `/me` (附 `appsecret_proof`)。
  - Client secrets 僅限後端 API，BFF 只處理導向與 callback。

## 3. API Endpoints 定義

所有 API 位於 `/api/passenger-app/*`，以下列出各 endpoint 規格與錯誤碼：

| 目的                   | Method | Path                                                | Realm                        | Request / Response Contract                                            | 錯誤碼 / 備註                                                                                |
| ---------------------- | ------ | --------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| **請求 OTP**           | POST   | `/api/passenger-app/auth/otp/request`               | (BFF Metadata) / `passenger` | `RequestOtpCommand` / `RequestOtpResponse`                             | `too_many_requests`。登入帶 Metadata，綁定與 verify_contact_phone 帶 Bearer 以綁定 session。 | `RequestOtpCommand` / `RequestOtpResponse`        | `too_many_requests`, 同一目標/IP 限制。             |
| **驗證 OTP**           | POST   | `/api/passenger-app/auth/otp/verify`                | (BFF Metadata) / `passenger` | `VerifyOtpCommand` / `VerifyOtpResponse`                               | `invalid_code`, `challenge_locked`。登入帶 Metadata，綁定/驗證帶 Bearer。                    | `VerifyOtpCommand` / `VerifyOtpResponse`          | `invalid_code`, 5次錯誤後 `challenge_locked`。      |
| **OAuth Start**        | POST   | `/api/passenger-app/auth/oauth/{provider}/start`    | (BFF Metadata) / `passenger` | `OAuthStartCommand` / `OAuthStartResponse`                             | `unsupported_provider`。登入帶 Metadata，綁定帶 Bearer 以產生 session-bound transaction。    | `OAuthStartCommand` / `OAuthStartResponse`        | 回傳 authUrl/transactionId (一對一綁定)。           |
| **OAuth Callback**     | POST   | `/api/passenger-app/auth/oauth/{provider}/callback` | (BFF Metadata) / `passenger` | `OAuthCallbackCommand` / `OAuthCallbackResponse`                       | `invalid_grant`, `conflict`。驗證 code。登入帶 Metadata，綁定帶 Bearer。                     | `OAuthCallbackCommand` / `OAuthCallbackResponse`  | 驗證 code，回 session 或連結結果。`invalid_grant`。 |
| **FB 刪除資料回呼**    | POST   | `/api/passenger-app/auth/facebook/data-deletion`    | (Webhook)                    | `FacebookDataDeletionCommand` / `FacebookDataDeletionResponse`         | 依據 FB 政策實作，若為唯一登入身分且刪除，視同刪除帳號。                                     |
| **取得登入支援列表**   | GET    | `/api/passenger-app/auth/providers`                 | (BFF Metadata)               | `GetAuthProvidersQuery` / `AuthProvidersResponse`                      | 無錯誤碼，依環境變數動態回傳。                                                               | `GetAuthProvidersQuery` / `AuthProvidersResponse` | 依環境變數動態回傳。                                |
| **Refresh Session**    | POST   | `/api/passenger-app/auth/refresh`                   | (BFF Metadata)               | `RefreshSessionCommand` / `RefreshSessionResponse`                     | `invalid_grant`。                                                                            |
| **登出**               | POST   | `/api/passenger-app/auth/logout`                    | (BFF Metadata)               | `LogoutCommand` / `LogoutResponse`                                     | 撤銷 session。                                                                               |
| **取得個人資料**       | GET    | `/api/passenger-app/me`                             | `passenger`                  | `GetPassengerMeQuery` / `PassengerMeResponse`                          | `unauthorized`。                                                                             |
| **更新個人資料**       | PATCH  | `/api/passenger-app/me`                             | `passenger`                  | `UpdatePassengerMeCommand` / `PassengerMeResponse`                     | 更新聯絡同意、條款/隱私權/費用確認等。`validation_error`。                                   |
| **刪除帳號**           | DELETE | `/api/passenger-app/me`                             | `passenger`                  | `DeletePassengerAccountCommand` / `DeletePassengerAccountResponse`     | 軟刪除，未結清款項時阻擋 (`pending_payment_block`)。                                         |
| **取得綁定身分列表**   | GET    | `/api/passenger-app/me/identities`                  | `passenger`                  | `GetPassengerIdentitiesQuery` / `PassengerIdentitiesResponse`          | `unauthorized`。列出 Google/FB 等綁定。                                                      |
| **解除綁定身分**       | DELETE | `/api/passenger-app/me/identities/{id}`             | `passenger`                  | `UnlinkPassengerIdentityCommand` / `UnlinkPassengerIdentityResponse`   | 若為最後一個身分不可解除 (`last_identity_error`)。                                           |
| **註冊裝置推播**       | POST   | `/api/passenger-app/push-devices`                   | `passenger`                  | `RegisterPushDeviceCommand` / `RegisterPushDeviceResponse`             | `validation_error`。Phase B。                                                                |
| **註銷裝置推播**       | DELETE | `/api/passenger-app/push-devices/{deviceId}`        | `passenger`                  | `UnregisterPushDeviceCommand` / `UnregisterPushDeviceResponse`         | `not_found`。Phase B。                                                                       |
| **取得公開費率**       | GET    | `/api/passenger-app/fares`                          | (BFF Metadata)               | `GetFaresQuery` / `FaresResponse`                                      | 回傳當前生效費率版本。                                                                       |
| **費率試算 (Quote)**   | POST   | `/api/passenger-app/quotes`                         | `passenger`                  | `FareQuoteCommand` / `FareQuoteResponse`                               | `not_serviceable`。產生 snapshot。                                                           |
| **叫車 (建立訂單)**    | POST   | `/api/passenger-app/rides`                          | `passenger`                  | `CreatePassengerRideCommand` / `PassengerRideResponse`                 | 僅預約。需帶 quote snapshot ID，要求手機驗證。                                               |
| **行程清單**           | GET    | `/api/passenger-app/rides`                          | `passenger`                  | `GetPassengerRidesQuery` / `PassengerRideListResponse`                 | 支援分頁。                                                                                   |
| **進行中行程**         | GET    | `/api/passenger-app/rides/active`                   | `passenger`                  | `GetActivePassengerRidesQuery` / `PassengerRideListResponse`           | `unauthorized`。                                                                             |
| **行程詳情**           | GET    | `/api/passenger-app/rides/:id`                      | `passenger`                  | `GetPassengerRideQuery` / `PassengerRideResponse`                      | 需 ownership 檢查。`not_found`。                                                             |
| **行程即時事件 (SSE)** | GET    | `/api/passenger-app/rides/:id/events`               | `passenger`                  | `-` / `PassengerRideSseEventEnvelope`                                  | SSE 格式。`not_found`, `unauthorized`。                                                      |
| **取消行程**           | POST   | `/api/passenger-app/rides/:id/cancel`               | `passenger`                  | `CancelPassengerRideCommand` / `CancelPassengerRideResponse`           | `cannot_cancel_state`。派車前不收費。                                                        |
| **行程評價**           | POST   | `/api/passenger-app/rides/:id/ratings`              | `passenger`                  | `RatePassengerRideCommand` / `RatePassengerRideResponse`               | `validation_error`, `invalid_state`。僅完成並付款後可評 (1-5)。字數限200。                   |
| **行程客訴**           | POST   | `/api/passenger-app/rides/:id/complaints`           | `passenger`                  | `CreatePassengerComplaintCommand` / `CreatePassengerComplaintResponse` | `validation_error`, `not_found`, `conflict`。客訴與遺失物。                                  |
| **取得收據**           | GET    | `/api/passenger-app/rides/:id/receipt`              | `passenger`                  | `GetPassengerReceiptQuery` / `PassengerReceiptResponse`                | `not_found`。可供乘客下載。                                                                  |
| **平台行程退款**       | POST   | `/api/passenger-app/platform/rides/:id/refund`      | `platform`                   | `RefundPassengerRideCommand` / `RefundPassengerRideResponse`           | `not_found`, `invalid_state`。Ops 使用。                                                     |
| **取得付款方式列表**   | GET    | `/api/passenger-app/payment-methods`                | `passenger`                  | `GetPaymentMethodsQuery` / `PaymentMethodsResponse`                    | `unauthorized`。                                                                             |
| **綁定付款方式**       | POST   | `/api/passenger-app/payment-methods`                | `passenger`                  | `BindPaymentMethodCommand` / `PaymentMethodResponse`                   | `card_declined`, 支援 3DS，回傳 `status`。                                                   |
| **設為預設付款方式**   | PUT    | `/api/passenger-app/payment-methods/:id/default`    | `passenger`                  | `SetDefaultPaymentMethodCommand` / `PaymentMethodResponse`             | `not_found`。                                                                                |
| **移除付款方式**       | DELETE | `/api/passenger-app/payment-methods/:id`            | `passenger`                  | `RemovePaymentMethodCommand` / `RemovePaymentMethodResponse`           | `not_found`。                                                                                |

## 4. Provider 環境變數與全有全無規則 (A10)

各 provider 需要完整的環境變數設定。若變數缺少，部署不會失敗，但該 provider 功能會預設關閉。

- Google Login: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- Facebook Login: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- LINE Login: `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`
- SMS OTP: `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_SENDER_ID`
- Payment (PSP): `PSP_MERCHANT_ID`, `PSP_API_KEY`, `PSP_SANDBOX`, `PSP_TOKEN_ENCRYPTION_KEY_NAME`
- OAUTH_REDIRECT_ALLOWLIST: `OAUTH_REDIRECT_ALLOWLIST` 設定允許的導向目標。
- DNS Handoff: DNS 管理需於上線前移交給使用者，將 `ride.smarttransport.tw` 指向系統。

Cloud Run / Workflow / Domain 部署規則：新 Cloud Run 服務 `drts-dev-passenger-app-web` 透過 `deploy-dev.yml` 部署。網域 `ride.smarttransport.tw` 透過既有的 domain-mappings-dev workflow 對應。必須從 CI publish 分支部署，禁止 VM 部署。

## 5. Phase B 前置與外部 Gate (A11)

未來開發原生 App (Phase B) 之前置條件與外部依賴：

1. **QA 先行**：必須在 Phase A 的 QA 完成後才啟動。
2. **裝置登錄與第一方推播路由**：完成裝置註冊 API，並寫入第一方推送路由，包含對 `mobility.phase1_order_first_party_notification_routes` 執行 `ALTER tenant_id DROP NOT NULL` (不在 Phase A 實際寫入路由資料，僅建置 API 與 schema)。
3. **Apple Login (App Store 規則 4.8)**：由使用者送審前決定是否實作。
4. **外部 Gate**：Google/Apple 開發者帳號、Firebase 專案。

## 6. 不可越過的界線與嚴格限制 (A12)

- **VM 限制**：只能跑 repo 層級的 lint/typecheck/unit 檢查。禁止啟動 Next dev/API/DB/preview 測試，禁止 Docker Compose。
- **外部服務限制**：不建立或讀取真實外部帳號 secret，不發送真實簡訊、金流或 OAuth 請求。測試一律注入 stub。

## 7. 叫車、行程與派單規則 (A6)

- 叫車 API 包裝既有 `createMultiTaxiRide`，訂單聯絡人資料信任 server 登入身分，不信 body。叫車前依據 `REQUIRE_SMS_VERIFICATION` 配置，決定是否必須要求 `contactPhoneVerified: true`，否則允許 unverified marking。
- 新增「帳號擁有行程」表，所有行程操作強制 ownership 檢查。
- Quote (費率試算)：需綁定帳號、路線與時間，產生專屬 `fareSnapshotId`，並具備 15 分鐘效期。建立訂單時必須在效期內且路線相符，並驗證 quote 擁有權，非本人 quote 應回傳 404。
- 最短預約時間限制 (Minimum Reservation Lead Time)：依據配置，例如必須至少提早 30 分鐘預約。

## 8. 金流與付款 (A8)

- 建立 `PaymentProviderPort` 抽象。卡號僅經由 PSP hosted fields，不進我方 API。
- 金鑰憑證換成 token，以 AES-GCM 加密存放 (金鑰來自 Secret Manager)。
- 實際收費 (Completion Trigger)：由司機端行程完成事件觸發。
- 訂單冪等性與扣款紀錄：新增 `passenger.payment_charge_records` 表儲存完整扣款紀錄 (包含 Idempotency Key、重試次數與錯誤碼)，並保留既有 `billing.multi_taxi_passenger_payments` 作為狀態 authority，避免重複請款。
- 扣款狀態沿用 P5 規範，重試耗盡進入 `manual_recovery`，阻擋未付清者的叫車及刪除帳號操作。退款由 Ops 操作。Dev 提供 fake PSP，production 禁用。

## 9. 費用與運價 (A7)

- 運價表版本化 (起跳、續跳、延滯、夜間加成)。
- 試算為預估值 (由距離與時間計算)，實際收費以行程完成時為準。

## 10. 法規內容與文案 (A9)

- 客服電話一律 `02-2944-0985`。網址一律 `ride.smarttransport.tw`。
- 派車前取消不收費。低分評價支援客訴聯絡。收據 (E-04) 包含車隊業者、遮罩執登號、明細、付款方式與客服電話。
