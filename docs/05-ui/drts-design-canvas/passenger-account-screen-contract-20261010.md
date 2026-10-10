# Passenger Account Screen Contract (2026-10-10)

本文件列出乘客 App 登入、帳號、行程與付款的畫板 ID、狀態與對應之 API/實作任務。

| 畫板 ID | 畫面用途 | 狀態 | 對應 API / Contract | 對應實作 Task |
| --- | --- | --- | --- | --- |
| A-01 | 登入入口 (已啟用方式) | Design Complete | `GET /api/passenger-app/auth/providers` | PAX-WEB-AUTH-UI-20261009 |
| A-01a | 登入入口 (部分啟用方式) | Design Complete | `GET /api/passenger-app/auth/providers` | PAX-WEB-AUTH-UI-20261009 |
| A-02 | 登入入口 (無可用方式) | Design Complete | `GET /api/passenger-app/auth/providers` | PAX-WEB-AUTH-UI-20261009 |
| A-03 | 手機登入 (輸入手機) | Design Complete | `POST /api/passenger-app/auth/otp/request` (`RequestOtpCommand` purpose `login`/`link`/`verify_contact_phone`) | PAX-WEB-AUTH-UI-20261009 |
| A-04 | 手機驗證碼 (輸入驗證碼) | Design Complete | `POST /api/passenger-app/auth/otp/verify` (`VerifyOtpResponse` `logged_in`/`linked`/`verified_contact_phone`) | PAX-WEB-AUTH-UI-20261009 |
| A-04a | 手機驗證碼 (已過期) | Design Complete | `POST /api/passenger-app/auth/otp/request` (`RequestOtpCommand` retry) | PAX-WEB-AUTH-UI-20261009 |
| A-04b | 手機驗證碼 (鎖定/頻率限制) | Design Complete | `POST /api/passenger-app/auth/otp/request` (Rate limited) | PAX-WEB-AUTH-UI-20261009 |
| A-04c | 手機驗證碼 (尚未開通簡訊) | Design Complete | `POST /api/passenger-app/auth/otp/request` (Provider error) | PAX-WEB-AUTH-UI-20261009 |
| A-05 | 手機驗證碼 (驗證碼錯誤) | Design Complete | `POST /api/passenger-app/auth/otp/verify` (Invalid code) | PAX-WEB-AUTH-UI-20261009 |
| A-05a | 手機驗證碼 (錯誤次數耗盡) | Design Complete | `POST /api/passenger-app/auth/otp/verify` (Attempts exhausted) | PAX-WEB-AUTH-UI-20261009 |
| A-05b | Email 登入 (輸入信箱) | Design Complete | `POST /api/passenger-app/auth/otp/request` (`RequestOtpCommand` purpose `login`/`link`) | PAX-WEB-AUTH-UI-20261009 |
| A-05c | Email 驗證碼 (輸入驗證碼) | Design Complete | `POST /api/passenger-app/auth/otp/verify` (`VerifyOtpResponse` `logged_in`/`linked`) | PAX-WEB-AUTH-UI-20261009 |
| A-05d | Email 驗證碼 (錯誤/過期/耗盡) | Design Complete | `POST /api/passenger-app/auth/otp/verify` (Invalid/Exhausted/Expired) | PAX-WEB-AUTH-UI-20261009 |
| A-06 | 首次登入 (同意條款) | Design Complete | `PATCH /api/passenger-app/me` | PAX-WEB-AUTH-UI-20261009 |
| A-06a | 首次登入 (未勾選狀態) | Design Complete | Local Validation | PAX-WEB-AUTH-UI-20261009 |
| A-07 | 第三方登入 (導向中) | Design Complete | `POST /api/passenger-app/auth/oauth/{provider}/start` (`OAuthStartCommand`) | PAX-WEB-AUTH-UI-20261009 |
| A-07a | 第三方登入 (回呼成功) | Design Complete | `POST /api/passenger-app/auth/oauth/{provider}/callback` (`OAuthCallbackResponse` success) | PAX-WEB-AUTH-UI-20261009 |
| A-07b | 第三方登入 (取消授權) | Design Complete | `POST /api/passenger-app/auth/oauth/{provider}/callback` (`OAuthCallbackResponse` user_cancelled) | PAX-WEB-AUTH-UI-20261009 |
| A-07c | 第三方登入 (一般失敗) | Design Complete | `POST /api/passenger-app/auth/oauth/{provider}/callback` (`OAuthCallbackResponse` provider_error) | PAX-WEB-AUTH-UI-20261009 |
| A-08 | 第三方綁定 (帳號衝突) | Design Complete | `POST /api/passenger-app/auth/oauth/{provider}/callback` (`OAuthCallbackResponse` conflict) | PAX-WEB-AUTH-UI-20261009 |
| A-08a | 綁定失敗 | Design Complete | `POST /api/passenger-app/auth/oauth/{provider}/callback` (`OAuthCallbackResponse` failure) | PAX-WEB-AUTH-UI-20261009 |
| A-10 | 帳號管理 | Design Complete | `GET /api/passenger-app/me` | PAX-WEB-AUTH-UI-20261009 |
| A-11 | 登入方式管理 | Design Complete | `GET /api/passenger-app/me/identities` | PAX-WEB-AUTH-UI-20261009 |
| A-12 | 登入方式管理 (解除限制) | Design Complete | `DELETE /api/passenger-app/me/identities/{id}` (Blocked: minimum 1 required) | PAX-WEB-AUTH-UI-20261009 |
| A-13 | 登出確認 | Design Complete | `POST /api/passenger-app/auth/logout` | PAX-WEB-AUTH-UI-20261009 |
| A-14 | 刪除帳號 | Design Complete | `DELETE /api/passenger-app/me` (Request deletion) | PAX-WEB-AUTH-UI-20261009 |
| A-14a | 刪除帳號 (未結清阻擋) | Design Complete | `DELETE /api/passenger-app/me` (Blocked: unsettled balance) | PAX-WEB-AUTH-UI-20261009 |
| A-15 | 刪除帳號完成 | Design Complete | `DELETE /api/passenger-app/me` (Success) | PAX-WEB-AUTH-UI-20261009 |
| A-16 | 行程紀錄 | Design Complete | `GET /api/passenger-app/rides` | PAX-WEB-RIDE-UI-20261009 |
| A-17 | 行程紀錄 (空狀態) | Design Complete | `GET /api/passenger-app/rides` | PAX-WEB-RIDE-UI-20261009 |
| A-18 | 聯絡客服與遺失物表單 | Design Complete | `POST /api/passenger-app/rides/:id/complaints` | PAX-WEB-RIDE-UI-20261009 |
| A-19 | 聯絡客服送出成功 | Design Complete | `POST /api/passenger-app/rides/:id/complaints` (Success) | PAX-WEB-RIDE-UI-20261009 |
| A-20 | 付款卡片管理 | Design Complete | `GET /api/passenger-app/payment-methods`, `PUT /api/passenger-app/payment-methods/:id/default` (`SetDefaultPaymentMethodCommand`) | PAX-WEB-PAYMENT-UI-20261009 |
| A-20a | 付款卡片刪除確認 | Design Complete | `DELETE /api/passenger-app/payment-methods/:id` | PAX-WEB-PAYMENT-UI-20261009 |
| A-21 | 新增付款卡片 | Design Complete | `POST /api/passenger-app/payment-methods` | PAX-WEB-PAYMENT-UI-20261009 |
| A-21a | 新增付款卡片 (失敗) | Design Complete | `POST /api/passenger-app/payment-methods` (Card declined) | PAX-WEB-PAYMENT-UI-20261009 |
| A-22 | 叫車選擇付款方式 (無卡片) | Design Complete | `GET /api/passenger-app/payment-methods` (Local UI State Redirect to Add Card) | PAX-WEB-PAYMENT-UI-20261009 |
| A-22a | 叫車選擇付款方式 (有卡片) | Design Complete | `POST /api/passenger-app/rides` (`CreatePassengerRideCommand.paymentMethodId`) | PAX-WEB-PAYMENT-UI-20261009 |
| A-23 | 扣款失敗阻擋 | Design Complete | `POST /api/passenger-app/rides` (Blocked, settlement pending via CS, self-service remediation unavailable) | PAX-WEB-PAYMENT-UI-20261009 |
| B-01 | 地址搜尋與選點 | Design Complete | Local UI State | PAX-WEB-BOOKING-UI-20261009 |
| B-02 | 地址搜尋 (載入中) | Design Complete | `GET /api/passenger-app/places/search` | PAX-WEB-BOOKING-UI-20261009 |
| B-03 | 地址搜尋 (候選清單) | Design Complete | `GET /api/passenger-app/places/search` | PAX-WEB-BOOKING-UI-20261009 |
| B-04 | 地址搜尋 (無結果) | Design Complete | `GET /api/passenger-app/places/search` | PAX-WEB-BOOKING-UI-20261009 |
| B-05 | 地址選點 (超出服務範圍) | Design Complete | `POST /api/passenger-app/quotes` (Out of bounds) | PAX-WEB-BOOKING-UI-20261009 |
| B-06 | 預約時間選擇 (最短前置限制) | Design Complete | Local UI State Validation | PAX-WEB-BOOKING-UI-20261009 |
| B-07 | 費率試算 (載入中) | Design Complete | `POST /api/passenger-app/quotes` (`CreatePassengerQuoteCommand`) | PAX-WEB-BOOKING-UI-20261009 |
| B-08 | 費率試算 (過期重算) | Design Complete | `POST /api/passenger-app/rides` (Quote expired) | PAX-WEB-BOOKING-UI-20261009 |
| B-09 | 重新試算與確認叫車 | Design Complete | `POST /api/passenger-app/quotes` -> `POST /api/passenger-app/rides` (`CreatePassengerRideCommand.passengerConfirmedAt`) | PAX-WEB-BOOKING-UI-20261009 |
