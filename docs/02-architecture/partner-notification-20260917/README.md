# 乘客通知送達夥伴 App：設計交付包

日期：2026-09-17
狀態：設計完成；待實作與分層驗收。
固定基準：dev@38a68a79959619faa5a10b9782e77dd7ca41f4c2

## 文件分工

1. **01_system_sa_sd.md**：六項決策定案、工程 SA/SD、路由、回執、重試、資料、API 與派工。
2. **02_partner_integration_contract.md**：可交給夥伴後端／原生 App 團隊的接口、簽章、去重、導航與驗收要求。
3. **examples/**：虛構資料的 wire request／ack 樣本，不是真實交付證據。

UI／視覺增量（原 03_ui_design_delta.md）與來源清單（原 04_sources.md）尚未納入本目錄，
待 `SR-PARTNER-NOTIFY-UI-20260917` 與 QA 任務開工時補齊。

## 取代關係

本包取代 `docs/02-architecture/passenger-notification-partner-app-sa-20260917.md`
（初版 SA，僅提出問題未定案），以及 Q-SR-PUSH-001／P05 對「夥伴 App 內嵌乘客」
的接收端與傳輸方式決策。初版 SA 保留作追溯，不刪除。

## 工程必須保留的既有行為

- 既有 outbox 四狀態與 result enum、claim/fence。
- 一般 tenant webhook 的 status-only 行為與 C111–C115 測試。
- 原有 handoff 的 120 秒／single-use 規則。

禁止以 2xx 或自製 receipt 冒充夥伴接受；禁止讓兩套 scheduler 重送同一通知。

## 已獨立查證的事實基礎

下列斷言於 2026-09-17 由 Supervisor 對 dev 逐項核對屬實：

- pinned commit 38a68a799 在 dev 上。
- `PartnerChannelEntryRecord` 具 tenantId、partnerId、programId、entrySlug。
- `PartnerUserIdentityLinkRecord` 具 entrySlug、partnerUserRef、drtsPassengerId、status。
- `WebhookFetch` 型別為 `Pick<Response, "ok" | "status">`，讀不到回執 body。
- `passenger-push.adapter.ts` 第 264 行存在 `receipt-${outboxId}` 合成回執。
- `multi-taxi.module.ts` 仍綁定 `WebPushTransport` 與 `PassengerPushDeviceResolver`。

> **2026-10-06 附註（不改上面原文）**：`multi-taxi.module.ts` 現況已不是上一條所述——目前
> `PASSENGER_PUSH_TRANSPORT` 綁的是 `PartnerNotificationTransport`（`transportMode: "partner_webhook"`），
> `WebPushTransport`／`PassengerPushDeviceResolver` 已不是現行注入對象。上面五條在 2026-09-17 當下核實的事實
> 本身不改寫，只標注第五條已過時。本案（夥伴 App 內嵌乘客）通知拓撲與本 README 上述決策不變；「每張單依
> 來源分流管道、沒有 App 的來源明確無管道、以及預備第一方 App 接收端」的補篇設計見
> `docs/02-architecture/passenger-notification-channel-routing-20261006.md` 與
> `docs/01-decisions/SD-DP-20261006-001-passenger-notification-channel-routing.md`。
