# Passenger Account Screen Contract (2026-10-10)

本文件列出乘客 App 登入、帳號、行程與付款的畫板 ID、狀態與對應之 API/實作任務。

| 畫板 ID | 畫面用途 | 狀態 | 對應 API / Contract | 對應實作 Task |
| --- | --- | --- | --- | --- |
| A-01 | 登入入口 (已啟用方式) | Design Complete | `GET /api/passenger-app/auth/providers` | PAX-WEB-AUTH-UI-20261009 |
| A-02 | 登入入口 (無可用方式) | Design Complete | `GET /api/passenger-app/auth/providers` | PAX-WEB-AUTH-UI-20261009 |
| A-03 | 手機驗證碼 (輸入手機) | Design Complete | `POST /api/passenger-app/otp/send` | PAX-WEB-AUTH-UI-20261009 |
| A-04 | 手機驗證碼 (輸入驗證碼) | Design Complete | `POST /api/passenger-app/otp/verify` | PAX-WEB-AUTH-UI-20261009 |
| A-05 | 手機驗證碼 (錯誤狀態) | Design Complete | `POST /api/passenger-app/otp/verify` | PAX-WEB-AUTH-UI-20261009 |
| A-06 | 首次登入 (同意條款) | Design Complete | `POST /api/passenger-app/account/agree-terms` | PAX-WEB-AUTH-UI-20261009 |
| A-07 | 第三方登入 (導向中) | Design Complete | `GET /api/passenger-app/oauth/login/:provider` | PAX-WEB-AUTH-UI-20261009 |
| A-08 | 第三方登入 (已綁定錯誤) | Design Complete | `GET /api/passenger-app/oauth/callback/:provider` | PAX-WEB-AUTH-UI-20261009 |
| A-10 | 帳號管理 | Design Complete | `GET /api/passenger-app/account/profile` | PAX-WEB-AUTH-UI-20261009 |
| A-11 | 登入方式管理 | Design Complete | `GET /api/passenger-app/account/auth-methods` | PAX-WEB-AUTH-UI-20261009 |
| A-12 | 登入方式管理 (解除限制) | Design Complete | `DELETE /api/passenger-app/account/auth-methods/:id` | PAX-WEB-AUTH-UI-20261009 |
| A-14 | 刪除帳號 | Design Complete | `DELETE /api/passenger-app/account` | PAX-WEB-AUTH-UI-20261009 |
| A-16 | 行程紀錄 | Design Complete | `GET /api/passenger-app/rides` | PAX-WEB-RIDE-UI-20261009 |
| A-17 | 行程紀錄 (空狀態) | Design Complete | `GET /api/passenger-app/rides` | PAX-WEB-RIDE-UI-20261009 |
| A-18 | 聯絡客服與遺失物表單 | Design Complete | `POST /api/passenger-app/complaints` | PAX-WEB-RIDE-UI-20261009 |
| A-19 | 聯絡客服送出成功 | Design Complete | `POST /api/passenger-app/complaints` | PAX-WEB-RIDE-UI-20261009 |
| A-20 | 付款卡片管理 | Design Complete | `GET /api/passenger-app/payments/cards` | PAX-WEB-PAYMENT-UI-20261009 |
| A-21 | 新增付款卡片 | Design Complete | `POST /api/passenger-app/payments/cards/setup` | PAX-WEB-PAYMENT-UI-20261009 |
| A-22 | 叫車選擇付款方式 | Design Complete | `POST /api/passenger-app/rides` | PAX-WEB-PAYMENT-UI-20261009 |
| A-23 | 扣款失敗阻擋 | Design Complete | `GET /api/passenger-app/payments/unpaid` | PAX-WEB-PAYMENT-UI-20261009 |
