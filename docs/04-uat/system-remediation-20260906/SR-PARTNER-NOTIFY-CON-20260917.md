# SR-PARTNER-NOTIFY-CON-20260917 — 夥伴通知契約與 migration 配號

| 欄位         | 內容                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 初始狀態     | backlog                                                              |
| 優先級       | P1                                                                   |
| Owner        | Gemini                                                               |
| Reviewer     | Gemini2                                                              |
| 前置任務     | 無                                                                   |
| 工作類型     | implementation                                                       |

## 任務摘要
乘客通知改送夥伴 App 的契約定案任務，是後續七個任務的前置，必須先完成。完整設計見 `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md`。
本任務只做契約與 migration 配號，不實作傳輸、不改 DI、不動 webhook 派送行為。

## 要交付
1. 新增 `packages/contracts/src/partner-passenger-notification.ts`，定義 `PartnerEntryNotificationBinding`、`OrderPartnerNotificationRoute`、wire payload 與 ack 結構、typed failure 與 `retryDisposition` 列舉，以及對外事件名。
2. 於 `packages/contracts/src/index.ts` export，不破壞既有 export。
3. 依設計 11 的四張新表配置 migration 編號，走 SR-CONTRACT 分配（配置於 `docs/04-uat/system-remediation-20260906/schema-allocation.json`），不得重用已套用 migration、不得改寫 source archive。

## 嚴禁變更
- 不得修改 `packages/contracts/src/phase1-p5-s3-multi-taxi.ts` 的 outbox 狀態與 `PASSENGER_PUSH_DELIVERY_RESULTS`。
- 不得修改 `TenantWebhookEndpoint` 既有欄位語意。
- 不得改 webhook dispatch 實作或 transport。

## 驗收條件
- `wire_schema_and_binding_route_contracts_defined`: 契約與結構正確定義。
- `existing_outbox_and_result_enums_unchanged`: 原有 outbox states 無變更。
- `migration_numbers_allocated_without_reusing_applied`: migration 編號配置正確，未覆寫舊資料。
