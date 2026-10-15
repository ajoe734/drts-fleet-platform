# Passenger Account Screen Contract (2026-10-10)

本文件列出乘客 App 登入、帳號、行程與付款的畫板 ID、狀態與對應之 API/實作任務。

## 2026-10-15 v2 設計取代與舊新對照

自 2026-10-15 起，登入、帳號、叫車表單、行程紀錄與付款以
[乘客 App 設計稿 v2](../passenger-app-design-20261015/README.md) 的
AU／AC／BK／TR／PM 畫板為準。下列 A／B 畫板與 JSX 檔保留追溯，**全部已取代**，
舊表的 API 註記仍是歷史參考，不能據此宣稱新畫板的全部狀態或後端操作已實作。
28 個新 ID、原始狀態標籤與對應 task 見 v2 README；其中 AU-04 尚缺規格要求的三個狀態，
PM-04 重扣 command 與 geo 的乘客 BFF 邊界仍待補契約。

| 舊 A／B 畫板 | 新畫面 ID | 舊版狀態 |
| --- | --- | --- |
| A-01、A-01a、A-02 | AU-01 | 已取代；檔案保留 |
| A-03 | AU-02 | 已取代；檔案保留 |
| A-04、A-04a、A-05、A-05a、A-05c、A-05d、A-05e、A-05f | AU-03 | 已取代；檔案保留 |
| A-04b | AU-02／AU-03（頻率／次數限制） | 已取代；檔案保留 |
| A-04c | AU-01（手機入口隱藏）／AC-03（簡訊未開通） | 已取代；檔案保留 |
| A-05b | AU-04 | 已取代；檔案保留 |
| A-06、A-06a | AU-08 | 已取代；檔案保留 |
| A-07、A-07a | AU-05 | 已取代；檔案保留 |
| A-07b、A-07c、A-08a | AU-06 | 已取代；檔案保留 |
| A-08 | AU-07 | 已取代；檔案保留 |
| A-10 | AC-01／AC-02／AC-03 | 已取代；檔案保留 |
| A-11、A-12 | AC-04 | 已取代；檔案保留 |
| A-13 | AC-05 | 已取代；檔案保留 |
| A-14、A-14a、A-15 | AC-06 | 已取代；檔案保留 |
| A-16 | TR-01 | 已取代；檔案保留 |
| A-17 | TR-02 | 已取代；檔案保留 |
| A-18 | TR-03 | 已取代；檔案保留 |
| A-19 | TR-04 | 已取代；檔案保留 |
| A-20 | PM-01 | 已取代；檔案保留 |
| A-20a | PM-05 | 已取代；檔案保留 |
| A-21、A-21a | PM-02 | 已取代；檔案保留 |
| A-22、A-22a | PM-03 | 已取代；檔案保留 |
| A-23 | PM-04 | 已取代；檔案保留 |
| B-01 | BK-02／BK-03 | 已取代；檔案保留 |
| B-02、B-03、B-04 | BK-02 | 已取代；檔案保留 |
| B-05 | BK-02／BK-03 | 已取代；檔案保留 |
| B-06 | BK-04 | 已取代；檔案保留 |
| B-07、B-08 | BK-05 | 已取代；檔案保留 |
| B-09 | BK-05 → E-19b（含 PM-03） | 已取代；檔案保留 |

BK-01 為完整叫車表單；AC-02／AC-03 補足編輯資料與驗證聯絡手機；
BK-03 補足地圖選點。這些是 v2 擴充，不代表舊稿已提供等價可操作表單。
P5-01～12、P5-A03／A04、E-04、E-18／18b、E-19a／19b 仍沿用既有畫板；
E-19b 內選卡由 PM-03 對接。取消與費率文案按 2026-10-10 使用者決定覆蓋。

## 舊版畫板與歷史 API 對照（已取代）

| 畫板 ID | 畫面用途 | 狀態 | 對應 API / Contract | 對應實作 Task |
| --- | --- | --- | --- | --- |
| A-01 | 登入入口 (已啟用方式) | 已取代（2026-10-15） | `GET /api/passenger-app/auth/providers` (Login vs Link routing) | PAX-WEB-AUTH-UI-20261009 |
| A-01a | 登入入口 (部分啟用) | 已取代（2026-10-15） | `GET /api/passenger-app/auth/providers` (Login vs Link routing) | PAX-WEB-AUTH-UI-20261009 |
| A-02 | 登入入口 (無可用方式) | 已取代（2026-10-15） | `GET /api/passenger-app/auth/providers` | PAX-WEB-AUTH-UI-20261009 |
| A-03 | 手機登入 (輸入手機) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/request` (`RequestOtpCommand`, purpose `login`/`link`/`verify_contact_phone`) | PAX-WEB-AUTH-UI-20261009 |
| A-04 | 手機驗證碼 (輸入驗證碼/重送) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/verify` (`VerifyOtpCommand` -> `VerifyOtpResponse` `logged_in`/`linked`/`verified_contact_phone`) + `RequestOtpCommand` retry | PAX-WEB-AUTH-UI-20261009 |
| A-04a | 手機驗證碼 (已過期) | 已取代（2026-10-15） | `RequestOtpCommand` retry | PAX-WEB-AUTH-UI-20261009 |
| A-04b | 手機驗證碼 (鎖定/頻率限制) | 已取代（2026-10-15） | `RequestOtpCommand` rate limited | PAX-WEB-AUTH-UI-20261009 |
| A-04c | 手機驗證碼 (尚未開通簡訊) | 已取代（2026-10-15） | `RequestOtpCommand` provider error | PAX-WEB-AUTH-UI-20261009 |
| A-05 | 手機驗證碼 (驗證錯誤) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/verify` (Invalid code) | PAX-WEB-AUTH-UI-20261009 |
| A-05a | 手機驗證碼 (次數耗盡) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/verify` (Attempts exhausted) | PAX-WEB-AUTH-UI-20261009 |
| A-05b | Email 登入 (輸入信箱) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/request` (`RequestOtpCommand`, purpose `login`/`link`) | PAX-WEB-AUTH-UI-20261009 |
| A-05c | Email 驗證碼 (輸入驗證碼/重送) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/verify` (`VerifyOtpCommand` -> `VerifyOtpResponse` `logged_in`/`linked`) + `RequestOtpCommand` retry | PAX-WEB-AUTH-UI-20261009 |
| A-05d | Email 驗證碼 (錯誤狀態) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/verify` (Invalid code) | PAX-WEB-AUTH-UI-20261009 |
| A-05e | Email 驗證碼 (過期狀態) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/verify` (Expired) | PAX-WEB-AUTH-UI-20261009 |
| A-05f | Email 驗證碼 (錯誤次數耗盡) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/otp/verify` (Attempts exhausted) | PAX-WEB-AUTH-UI-20261009 |
| A-06 | 首次登入 (同意條款) | 已取代（2026-10-15） | `PATCH /api/passenger-app/me` (`UpdatePassengerMeCommand` `termsVersion`/`privacyVersion` -> `PassengerMeResponse`) | PAX-WEB-AUTH-UI-20261009 |
| A-06a | 首次登入 (未勾選狀態) | 已取代（2026-10-15） | Local Validation | PAX-WEB-AUTH-UI-20261009 |
| A-07 | 第三方登入 (導向中) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/oauth/{provider}/start` (`OAuthStartCommand`) | PAX-WEB-AUTH-UI-20261009 |
| A-07a | 第三方登入 (回呼成功) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/oauth/{provider}/callback` (`OAuthCallbackResponse` `logged_in` or `linked`) | PAX-WEB-AUTH-UI-20261009 |
| A-07b | 第三方登入 (取消授權) | 已取代（2026-10-15） | Local UI / Provider cancellation callback handling | PAX-WEB-AUTH-UI-20261009 |
| A-07c | 第三方登入 (一般失敗) | 已取代（2026-10-15） | Local UI / Provider callback error handling | PAX-WEB-AUTH-UI-20261009 |
| A-08 | 第三方綁定 (帳號衝突) | 已取代（2026-10-15） | `POST /api/passenger-app/auth/oauth/{provider}/callback` (Error envelope failure: `conflict`) | PAX-WEB-AUTH-UI-20261009 |
| A-08a | 綁定失敗 | 已取代（2026-10-15） | `POST /api/passenger-app/auth/oauth/{provider}/callback` (Error envelope failure: `invalid_grant` etc.) | PAX-WEB-AUTH-UI-20261009 |
| A-10 | 帳號管理 | 已取代（2026-10-15） | `GET /api/passenger-app/me` | PAX-WEB-AUTH-UI-20261009 |
| A-11 | 登入方式管理 | 已取代（2026-10-15） | `GET /api/passenger-app/me/identities` | PAX-WEB-AUTH-UI-20261009 |
| A-12 | 登入方式管理 (解除限制) | 已取代（2026-10-15） | `DELETE /api/passenger-app/me/identities/{id}` (Blocked: `last_identity_error` / minimum 1 required) | PAX-WEB-AUTH-UI-20261009 |
| A-13 | 登出確認 | 已取代（2026-10-15） | `POST /api/passenger-app/auth/logout` (`LogoutCommand` -> `LogoutResponse`) | PAX-WEB-AUTH-UI-20261009 |
| A-14 | 刪除帳號 | 已取代（2026-10-15） | `DELETE /api/passenger-app/me` (Request deletion) | PAX-WEB-AUTH-UI-20261009 |
| A-14a | 刪除帳號 (未結清阻擋) | 已取代（2026-10-15） | `DELETE /api/passenger-app/me` (Blocked: `pending_payment_block`) | PAX-WEB-AUTH-UI-20261009 |
| A-15 | 刪除帳號完成 | 已取代（2026-10-15） | `DELETE /api/passenger-app/me` (Success) | PAX-WEB-AUTH-UI-20261009 |
| A-16 | 行程紀錄 | 已取代（2026-10-15） | `GET /api/passenger-app/rides` | PAX-WEB-RIDE-UI-20261009 |
| A-17 | 行程紀錄 (空狀態) | 已取代（2026-10-15） | `GET /api/passenger-app/rides` | PAX-WEB-RIDE-UI-20261009 |
| A-18 | 聯絡客服與遺失物表單 | 已取代（2026-10-15） | `POST /api/passenger-app/rides/:id/complaints` (`CreatePassengerComplaintCommand`: category, content, optional lostItemDescription, contactConsent) | PAX-WEB-RIDE-UI-20261009 |
| A-19 | 聯絡客服送出成功 | 已取代（2026-10-15） | `POST /api/passenger-app/rides/:id/complaints` (Success -> `complaintId`) | PAX-WEB-RIDE-UI-20261009 |
| A-20 | 付款卡片管理 | 已取代（2026-10-15） | `GET /api/passenger-app/payment-methods`, `PUT /api/passenger-app/payment-methods/:id/default` (`SetDefaultPaymentMethodCommand`) | PAX-WEB-PAYMENT-UI-20261009 |
| A-20a | 付款卡片刪除確認 | 已取代（2026-10-15） | `DELETE /api/passenger-app/payment-methods/:id` | PAX-WEB-PAYMENT-UI-20261009 |
| A-21 | 新增付款卡片 | 已取代（2026-10-15） | `POST /api/passenger-app/payment-methods` (`BindPaymentMethodCommand` -> `PaymentMethodResponse` status `completed`/`action_required`/`pending`) | PAX-WEB-PAYMENT-UI-20261009 |
| A-21a | 新增付款卡片 (失敗) | 已取代（2026-10-15） | `POST /api/passenger-app/payment-methods` (Declined) | PAX-WEB-PAYMENT-UI-20261009 |
| A-22 | 叫車選擇付款方式 (無卡片) | 已取代（2026-10-15） | `GET /api/passenger-app/payment-methods` (Local UI State Redirect to Add Card) | PAX-WEB-PAYMENT-UI-20261009 |
| A-22a | 叫車選擇付款方式 (有卡片) | 已取代（2026-10-15） | Local booking selection -> `POST /api/passenger-app/rides` (`CreatePassengerRideCommand.paymentMethodId`) | PAX-WEB-PAYMENT-UI-20261009 |
| A-23 | 扣款失敗阻擋 | 已取代（2026-10-15） | `POST /api/passenger-app/rides` (Blocked: settlement pending via CS, self-service remediation unavailable; pending command. CS: 02-2944-0985) | PAX-WEB-PAYMENT-UI-20261009 |
| B-01 | 地址搜尋與選點 | 已取代（2026-10-15） | Local UI State | PAX-WEB-BOOKING-UI-20261009 |
| B-02 | 地址搜尋 (載入中) | 已取代（2026-10-15） | `GET /api/geo/search` (`SearchGeoQuery`/`GeoSearchResponse`) *Note: BFF/passenger-access boundary unresolved* | PAX-WEB-BOOKING-UI-20261009 |
| B-03 | 地址搜尋 (候選清單) | 已取代（2026-10-15） | `GET /api/geo/search` (`SearchGeoQuery`/`GeoSearchResponse`) *Note: BFF/passenger-access boundary unresolved* | PAX-WEB-BOOKING-UI-20261009 |
| B-04 | 地址搜尋 (無結果) | 已取代（2026-10-15） | `GET /api/geo/search` (`SearchGeoQuery`/`GeoSearchResponse`) *Note: BFF/passenger-access boundary unresolved* | PAX-WEB-BOOKING-UI-20261009 |
| B-05 | 地址選點 (超出服務範圍) | 已取代（2026-10-15） | `POST /api/passenger-app/quotes` (`FareQuoteResponse.serviceAreaResult` `not_serviceable`) | PAX-WEB-BOOKING-UI-20261009 |
| B-06 | 預約時間選擇 (最短前置) | 已取代（2026-10-15） | Local UI State Validation | PAX-WEB-BOOKING-UI-20261009 |
| B-07 | 費率試算 (載入中) | 已取代（2026-10-15） | `POST /api/passenger-app/quotes` (`FareQuoteCommand` -> `FareQuoteResponse`) | PAX-WEB-BOOKING-UI-20261009 |
| B-08 | 費率試算 (過期重算) | 已取代（2026-10-15） | `POST /api/passenger-app/rides` (Quote expired) | PAX-WEB-BOOKING-UI-20261009 |
| B-09 | 重新試算與確認叫車 | 已取代（2026-10-15） | `B-09` -> `E-19b` (fee confirmation) -> `POST /api/passenger-app/rides` (`CreatePassengerRideCommand` with `fareSnapshotId`, `paymentMethodId`, `passengerConfirmedAt`) | PAX-WEB-BOOKING-UI-20261009 |


## API Request/Response & Auth Mappings

- **OTP Flow (A-03, A-04, A-05, A-05b-f)**:
  - Request: `RequestOtpCommand` -> `RequestOtpResponse` (contains `success`, `challenge`, and `message`).
  - Verify: `VerifyOtpCommand` (requires `target`, `provider`, `code`, `challenge`) -> `VerifyOtpResponse` (`logged_in`, `linked`, or `verified_contact_phone`).
  - Errors: Canonical envelopes mapped to `invalid_code`, `challenge_locked`, `too_many_requests`. (Expired code follows real `invalid_code` handling).
  - Auth: `login` requires Metadata; `link` and `verify_contact_phone` require existing authenticated Bearer on both request and verify. BFF handles tokens in HttpOnly/Secure/SameSite=Lax cookies per SD §1-3.
- **OAuth Flow (A-07, A-08)**:
  - Start: `OAuthStartCommand` -> `OAuthStartResponse` (contains `authUrl`, `state`, `transactionId`).
  - Callback: `OAuthCallbackCommand` (requires `provider`, `code`, `state`, `transactionId`) -> `OAuthCallbackResponse` (`logged_in` or `linked`). BFF retains `transactionId` and `state` in the callback binding plus provider/path match.
  - Auth: `link` requires existing authenticated Bearer. Bound proof checked. BFF handles tokens in HttpOnly/Secure/SameSite=Lax cookies per SD §1-3.
- **Identity & Account Management (A-10, A-11, A-12, A-14, A-15)**:
  - `A-10`: `GET /api/passenger-app/me` (`GetPassengerMeQuery` -> `PassengerMeResponse`) and `PATCH /api/passenger-app/me` (`UpdatePassengerMeCommand` -> `PassengerMeResponse`) (requires Bearer). Includes personal-data update / contact-verification transition.
  - `A-11`: `GET /api/passenger-app/me/identities` (`GetPassengerIdentitiesQuery` -> `PassengerIdentitiesResponse`) (requires Bearer).
  - `A-12`: `DELETE /api/passenger-app/me/identities/{id}` (`UnlinkPassengerIdentityCommand` -> `UnlinkPassengerIdentityResponse`, `identityId` from unlink path).
  - `A-14/15`: `DELETE /api/passenger-app/me` (`DeletePassengerAccountCommand` -> `DeletePassengerAccountResponse`, deletion subject is server-derived, not untrusted body).
- **Complaints (A-18, A-19)**:
  - Request: `POST /api/passenger-app/rides/:id/complaints` (`CreatePassengerComplaintCommand`, path mapping: `rideId`, body: `category`, `content`, optional `lostItemDescription`, `contactConsent`).
  - Response: `CreatePassengerComplaintResponse` (returns `complaintId`).
- **Payment Methods (A-20, A-20a)**:
  - `A-20`: `GET /api/passenger-app/payment-methods` (`GetPaymentMethodsQuery` -> `PaymentMethodsResponse`), `PUT /api/passenger-app/payment-methods/:id/default` (`SetDefaultPaymentMethodCommand` -> `PaymentMethodResponse`).
  - `A-20a`: `DELETE /api/passenger-app/payment-methods/:id` (`RemovePaymentMethodCommand` -> `RemovePaymentMethodResponse`).
