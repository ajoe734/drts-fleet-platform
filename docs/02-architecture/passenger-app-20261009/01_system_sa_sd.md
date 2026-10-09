# 乘客 App：系統設計與架構決策 (SA/SD)

## 1. 系統架構 (A1-A2)

- **新網頁 App (`apps/passenger-app-web`)**：基於 Next.js 的網頁前端。退役舊有 `apps/passenger-web`，但不刪除其防護，必要時以 `git show` 移植可用程式（如行程頁、SSE client、BFF proxy）。
- **新套件 (`packages/passenger-client`)**：純 TypeScript 套件，放置 API 型別、呼叫邏輯、view model、狀態對應與文案。提供網頁及未來原生 App 共用，禁止依賴 DOM/Node/Next，禁止將商業邏輯寫死在網頁 App。
- **BFF (Backend for Frontend)**：
  - 瀏覽器僅與 BFF (Next route handlers) 溝通，由 BFF 呼叫後端 API。
  - 登入前 (OTP、OAuth callback、公開費率) BFF 帶 metadata identity token (限制 path allowlist)。
  - 登入後 BFF 帶乘客 JWT (Bearer)。
  - Session token 僅存在 `HttpOnly`, `Secure`, `SameSite=Lax` 的 cookie，前端 JS 無法讀取。

## 2. 帳號與登入身分 (A3-A5)

- **乘客 Realm 與 ActorType**：新增 `passenger` realm 與 `first_party_passenger` actorType。帳號 ID 為 `drts_passenger_id`。
- **身分連結規則**：
  - 各 provider 登入先尋找對應登入身分，找到即登入；找不到則建立新帳號。
  - 僅允許在已登入狀態下，明確操作「綁定」才能將新 provider 加入當前帳號。
  - **禁止**因 email/手機相同而自動合併帳號。
- **Session 規則**：
  - Access JWT 效期 15 分鐘。
  - Refresh token 效期 30 天並實作輪替，重用時撤銷整個 family。
  - 登出及刪帳號時撤銷 session。刪帳號時進行軟刪除及個資匿名化，僅保留法規要求的行程/財務紀錄。

## 3. API Endpoints 定義

所有 API 位於 `/api/passenger-app/*`，以下列出各 endpoint 規格：

| 目的                | Method | Path                                     | Realm          | Request / Response Contract                                            | 備註                                                   |
| ------------------- | ------ | ---------------------------------------- | -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| **請求 OTP**        | POST   | `/api/passenger-app/auth/otp/request`    | (BFF Metadata) | `RequestOtpCommand` / `RequestOtpResponse`                             | 同一目標每小時 5 次；60s 冷卻。                        |
| **驗證 OTP**        | POST   | `/api/passenger-app/auth/otp/verify`     | (BFF Metadata) | `VerifyOtpCommand` / `VerifyOtpResponse`                               | 5 分鐘有效，最多錯 5 次。回傳 session。                |
| **OAuth Start**     | GET    | `/api/passenger-app/auth/oauth/start`    | (BFF Metadata) | `OAuthStartQuery` / `OAuthStartResponse`                               | BFF 導向，回傳 state/nonce 供驗證。                    |
| **OAuth Callback**  | POST   | `/api/passenger-app/auth/oauth/callback` | (BFF Metadata) | `OAuthCallbackCommand` / `OAuthCallbackResponse`                       | 回傳 session。                                         |
| **費率試算**        | POST   | `/api/passenger-app/fares/quote`         | (BFF Metadata) | `FareQuoteCommand` / `FareQuoteResponse`                               | 回傳區間預估與 snapshot，非保證價。                    |
| **叫車 (建立訂單)** | POST   | `/api/passenger-app/rides`               | `passenger`    | `CreatePassengerRideCommand` / `PassengerRideResponse`                 | 僅限預約。帶費率 snapshot、確認時間與付款綁定卡片 ID。 |
| **行程清單**        | GET    | `/api/passenger-app/rides`               | `passenger`    | `GetPassengerRidesQuery` / `PassengerRideListResponse`                 | 需要 ownership 檢查。                                  |
| **行程詳情**        | GET    | `/api/passenger-app/rides/:id`           | `passenger`    | `GetPassengerRideQuery` / `PassengerRideResponse`                      | 需要 ownership 檢查。                                  |
| **取消行程**        | POST   | `/api/passenger-app/rides/:id/cancel`    | `passenger`    | `CancelPassengerRideCommand` / `CancelPassengerRideResponse`           | 派車前不收費。                                         |
| **行程評價**        | POST   | `/api/passenger-app/rides/:id/ratings`   | `passenger`    | `RatePassengerRideCommand` / `RatePassengerRideResponse`               | 低分可勾選聯絡客服，將建立客訴。                       |
| **取得收據**        | GET    | `/api/passenger-app/rides/:id/receipt`   | `passenger`    | `GetPassengerReceiptQuery` / `PassengerReceiptResponse`                | 乘客自行下載。                                         |
| **客訴與遺失物**    | POST   | `/api/passenger-app/complaints`          | `passenger`    | `CreatePassengerComplaintCommand` / `CreatePassengerComplaintResponse` | 乘客端入口。                                           |
| **刪除帳號**        | POST   | `/api/passenger-app/account/delete`      | `passenger`    | `DeletePassengerAccountCommand` / `DeletePassengerAccountResponse`     | 軟刪除與匿名化。                                       |

## 4. Provider 環境變數與全有全無規則 (A10)

各 provider 需要完整的環境變數設定。若變數缺少，部署不會失敗，但該 provider 功能會預設關閉（不顯示對應按鈕或入口）。

- **Google Login**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- **Facebook Login**: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- **LINE Login**: `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`
- **SMS OTP**: `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_SENDER_ID` (PAX-SMS-PROVIDER)
- **Payment (PSP)**: `PSP_MERCHANT_ID`, `PSP_API_KEY`, `PSP_SANDBOX` (PAX-PSP-ADAPTER)

## 5. Phase B 前置與外部 Gate (A11)

未來開發原生 App (Phase B) 之前置條件與外部依賴：

1. **裝置登錄與第一方推播路由**：由 `PAX-PUSH-DEVICE-API-20261009` 完成裝置註冊 API，並寫入第一方推送路由，以利後續 FCM 整合。
2. **Apple Login (App Store 規則 4.8)**：有其他第三方登入時通常必須實作 Apple 登入，此決策由使用者在送審前確認。
3. **外部 Gate**：
   - 申請 Google/Apple 開發者帳號與上架資料。
   - 申請 Firebase 專案以支援 FCM 推播。
   - 注意 GCP Billing Account 專案數量上限。
