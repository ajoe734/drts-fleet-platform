# SD-DP-20261009-001: First Party Passenger App

## 狀態

- **決策時間**：2026-10-09
- **狀態**：已接受 (Accepted)
- **取代**：本決策取代 `SD-DP-20260422-001` 中關於「不做第一方乘客 App」的條款。同時取代 `SD-DP-20261006-001` 第 21、48 行，以及 `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` 第 67 行。

## 上下文

2026-10-09，使用者明確指示「你把客戶 APP 做一做，安排 supervisor 跟 auto worker 完成」，並確認了以下第一方乘客 App 的形式與需求：

1. **形式**：先做手機網頁 App，之後再做原生 App。
2. **登入**：支援手機、Email、Google、Facebook、LINE。
3. **付款**：線上刷卡。
4. **網域**：`ride.smarttransport.tw`。

此決定推翻了之前「Phase 1 不做第一方乘客 App、完全仰賴 B2B2C 夥伴串接」的初期決策。因此，需要重啟第一方乘客 App（Phase A 為 Web，Phase B 為 Native），並建立相應的乘客帳號體系、OTP/OAuth 登入機制與金流串接。

## 決策

1. **重開第一方乘客介面**：開發新的網頁 App (`apps/passenger-app-web`) 作為 Phase A，後續開發 Expo 原生 App (`apps/passenger-app`) 作為 Phase B。所有共用的前端邏輯與 API 呼叫放入 `packages/passenger-client` 套件。
2. **乘客帳號與登入體系**：
   - 新增 `passenger` realm 與 `first_party_passenger` actorType。
   - 提供手機、Email OTP 登入，以及 Google, Facebook, LINE OAuth 登入。
   - 第三方登入 callback 端點為 `https://ride.smarttransport.tw/auth/callback/<provider>`。
   - 不自動依據相同手機或 Email 合併帳號。
3. **叫車與行程**：
   - 目前僅提供預約叫車，不提供即時叫車。
   - 新增乘客專屬行程檢視與管理（含取消、評價、收據、客訴/遺失物等）。
   - 保留現有免登入叫車及 P-5 行程頁，與新版帳號體系共存。
4. **金流**：
   - 使用者透過 PSP (Payment Service Provider) 的 hosted fields 線上刷卡，卡號不經過我方 BFF/API。
   - 行程完成後依實際車資扣款。

## 影響

- **架構**：需要新增 passenger realm 的 controller，實作 OIDC/OAuth 與 OTP，並擴充 outbox/SmsPort。
- **文件**：舊有決策文件保留，但加上附註指向本決策，維持歷史追溯。
- **法規與文案**：須遵照 G201011 v1.0 規範的費率及法規文字。
