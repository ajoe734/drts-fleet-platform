# 04_sources.md: SD §14 測試覆蓋矩陣

| 案例 | 測試檔案位置 | 驗證項目 |
|---|---|---|
| 同 tenant 兩 entry 僅送原 entry | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/worker.test.ts` / `tests/e2e/system-remediation/sr-partner-notify-qa-20260917/partner-notification-uat.spec.ts` | 確保 payload 中的 `partner_entry_slug` 只對應目標 entry |
| 跨 tenant 相同 URL 隔離 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.test.ts` / `tests/e2e/system-remediation/sr-partner-notify-qa-20260917/partner-notification-uat.spec.ts` | 端點解析必須帶入正確 tenantId |
| 同住戶在兩 App 不串單 | `tests/unit/system-remediation/sr-partner-notify-nav-20260917/embed-partner-session.test.ts` | Handoff session 隔離驗證 |
| entry 改 tenant 後舊消息不移轉 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/governance.test.ts` | 狀態轉移與 route_missing 處理 |
| link 撤銷停送 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/governance.test.ts` | `recipient_revoked` 處理 |
| endpoint 停用／輪替重測 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts` | webhook 測試與停用行為 |
| 缺 route 不猜 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.test.ts` | `route_missing` 處理 |
| 204／HTML200／錯 receipt 拒絕 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https-client.test.ts` | response body 驗證 |
| partner 已入列但我方 timeout 後 duplicate ack | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https-client.test.ts` | dedupe receipt validation |
| ack 後 DB 寫入失敗與 worker lease 到期 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/worker.test.ts` / `transport.postgres.test.ts` / `tests/e2e/system-remediation/sr-partner-notify-qa-20260917/partner-notification-uat.spec.ts` | fence transaction 與 rollback |
| 兩個 worker 競爭 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/worker.test.ts` | 透過 claim owner 與 PG SKIP LOCKED 驗證 |
| 五次 maxattempt | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/worker.test.ts` | 重試次數上限與 backoff 驗證 |
| expiresAt | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/worker.test.ts` | 逾時停止自動重送驗證 |
| 改派舊 ETA | `tests/unit/system-remediation/sr-partner-notify-route-20260917/multi-taxi-order-partner-notification-route.test.ts` | 棄用取代事件 |
| 取消後舊到場 | `tests/unit/system-remediation/sr-partner-notify-route-20260917/multi-taxi-order-partner-notification-route.test.ts` | 棄用過期事件 |
| 缺 driver 情報不洩漏 | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport-harness.ts` | 最小 payload 驗證 |
| 錯 entry／logout 冷啟動點擊 | `tests/unit/system-remediation/sr-partner-notify-nav-20260917/notification-navigation-production-path.test.ts` | navigation flow authentication error cases |
| 未配置不可 available | `tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.test.ts` | isAvailable() readiness state check |
| 既有一般 tenant webhook C111–C115 回歸 | `tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts` | tenant webhook functionality unimpacted |
