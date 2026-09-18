# SR-PARTNER-NOTIFY-CON-20260917 — Partner Passenger Notification Contract & Migration Allocation

Owner：Claude；Reviewer：Gemini2。日期：2026-09-18 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`claude/sr-partner-notify-con-20260917`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-partner-notify-con-20260917`
- **基準 SHA (Base SHA)**：`b511a7045d113bc32b4ea596795b3cdad3bc63a0` (`origin/dev`, identical to branch HEAD before this candidate's commit — verified via `git rev-parse HEAD origin/dev`)
- **設計文件 (Design reference)**：`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` (固定基準 `38a68a79959619faa5a10b9782e77dd7ca41f4c2`; 該文件在 dev 上為未提交檔案，由本任務首次一併提交)
- **依賴 (Dependencies)**：None
- **下游 (Downstream producers this unblocks)**：`SR-PARTNER-NOTIFY-ROUTE-20260917`, `SR-PARTNER-NOTIFY-ACK-20260917`, `SR-PARTNER-NOTIFY-TRANSPORT-20260917`, `SR-PARTNER-NOTIFY-NAV-20260917`, `SR-PARTNER-NOTIFY-UI-20260917`, `SR-PARTNER-NOTIFY-LEGACY-20260917`, `SR-PARTNER-NOTIFY-QA-20260917`, `SR-LIVE-PUSH-001`

---

## 2. 交付範圍 (What was actually built)

本任務僅做契約與 migration 配號；未實作傳輸、未改 DI、未動 webhook 派送行為，符合 task brief 邊界。

### 2.1 `packages/contracts/src/partner-passenger-notification.ts`（新增）

- **事件目錄（設計 §5）**：`PartnerPassengerEventType` 直接由 `ConsumerNotificationOutboxRecord["eventType"]`（`./phase1-p5-s3-multi-taxi`）取用，不重新宣告聯集，避免與既有 outbox 契約 drift；五個內部事件維持原名，`PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME` 對應到 `passenger.<原名>.v1`；`PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT = "passenger.notification.test.v1"` 獨立於五個真實事件之外；`PARTNER_NOTIFICATION_SCHEMA_VERSION` 固定為 `"1.0"`。
- **`PartnerEntryNotificationBinding`（設計 §3.1）**：逐欄位比照設計文件的型別片段實作，含 `state`（test_pending/ready/disabled）、固定 `purpose`/`acknowledgementPolicy` 字面值、`eventTypes: PartnerPassengerEventType[]`；文件註解明列呼叫端在派送前必須驗證的 tenant/partner 一致性與「精準 endpoint-by-id，禁止 tenant-wide fanout」規則。
- **`OrderPartnerNotificationRoute`（設計 §4）**：逐欄位比照設計文件；文件註解強調 `drtsPassengerId`/`passengerSubjectRef` 僅供內部核對、不得出現在 wire payload，`rideRef` 不可作 bearer credential，且路由缺失／多重時不建立本記錄（見下方 `PartnerNotificationFailureReason`）。
- **Wire payload（設計 §6）與 navigation（設計 §10）**：`PartnerPassengerNotificationWireData`／`PartnerPassengerNotificationWirePayload`（= `WebhookEventPayload<PartnerPassengerNotificationWireData>`，重用既有信封，`./index` type-only import，比照 `phase1-p5-s3-multi-taxi.ts`/`remittance-proof.ts` 既有先例）僅含設計 §6 允許清單欄位；`PartnerPassengerNotificationNavigation` 限定 `type: "ride"` + `rideRef`；另提供獨立的 `PartnerPassengerNotificationTestWireData`／`WirePayload` 供 `passenger.notification.test.v1` 使用，不含 ride/recipient 欄位。
- **Accepted/duplicate ack 與送達階梯（設計 §7）**：`PartnerNotificationAcceptedAck`（`status: "accepted" | "duplicate"`, 必要 `receiptId`）文件註解明白禁止 `receipt-${outboxId}` 一類合成回執；`PARTNER_NOTIFICATION_DELIVERY_STAGES` 完整列出 outbox_persisted→opened 五階證據；本版 transport 僅可能寫到 `partner_accepted`，其餘三階與 `PARTNER_NOTIFICATION_DOWNSTREAM_STATUSES`（目前僅 `"unknown"`）保留給未來版本化的 device callback 任務。
- **Typed failure 與 retryDisposition（設計 §9）**：`PARTNER_NOTIFICATION_RETRY_DISPOSITIONS`（5 值）、`PARTNER_NOTIFICATION_FAILURE_REASONS`（13 值，逐列拆解設計表格的複合儲存格，如 `route_missing`/`route_ambiguous`/`owner_changed` 三個獨立值），並以 `PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS`（`as const satisfies Record<...>`，型別層保證窮盡）精確對應設計表格逐列的 disposition。`provider_transient_error`（對應 408/429/指定 5xx/timeout 列）是本任務依設計列意圖新命名的失敗原因字面值——原設計表格該列未指名 failureReason，僅指名 disposition=automatic；本任務為使欄位型別完整（failureReason 需在每個失敗情境都有值）新增此名稱，供下游 ACK/TRANSPORT 任務採用或以正式決議調整。`PartnerNotificationTypedFailure`/`PartnerNotificationDispatchOutcome`（accepted/failed 判別聯集）對應設計 §8 point 5 façade 回傳形狀。
- **`PartnerNotificationDeliveryContext`（設計 §4 末段＋§11 第三張表）**：一個 outbox 對應一筆不可變 context，欄位涵蓋 route/binding snapshot、wire payload/hash、event_sequence、expiresAt、delivery target/stage、retryDisposition、failureReason、receiptId、downstreamStatus；文件註解指出 `deliveredAt` 僅在本 transport 完成 ack 驗證時寫入，不可用 attempt 起始時間或夥伴自報時間。
- **平台固定限制（設計 §8）**：`PARTNER_NOTIFICATION_ATTEMPT_TIMEOUT_MS = 10_000`、`PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES = 4096`，供下游 ACK/TRANSPORT 任務直接引用單一事實來源，不在本任務套用到任何實際程式。

**相容性邊界（未違反）**：未修改 `phase1-p5-s3-multi-taxi.ts` 的 outbox 四狀態或 `PASSENGER_PUSH_DELIVERY_RESULTS` 三值；未修改 `TenantWebhookEndpoint` 既有欄位語意；新綁定以 `webhookId` 參照既有端點，未新增第二套端點表。

### 2.2 `packages/contracts/src/index.ts`（匯出線）

新增一行 `export * from "./partner-passenger-notification";`，緊接既有 `remittance-proof`/`passenger-push-delivery` 匯出之後；未移除或改動既有任何一行匯出。逐一檢查新匯出識別碼（型別與常數共 40+ 個）與既有 `index.ts`/`phase1-p5-s3-multi-taxi.ts`/`referral-channel.ts`/`remittance-proof.ts`/`passenger-push-delivery.ts`/`platform-adapter-registry.ts` 命名皆無碰撞。

### 2.3 Migration 配號（`docs/04-uat/system-remediation-20260906/schema-allocation.json`）

比照 `SR-CONTRACT-001`／`SR-RECOVERY-CONTRACTS-20260911` 先例：本任務只配號、寫明表結構與交易不變量，**不寫 `infra/migrations/*.sql`**，該檔案交由對應的下游 backend 任務撰寫。

新增（append-only；`allocations`/`amendments`/`additional_allocations`/`launch_allocations` 既有內容逐字保留未動）：

- 新增一筆 `amendments` 條目（`amended_by_task_id: SR-PARTNER-NOTIFY-CON-20260917`），記錄配號時機（inspected base 上最高既有 canonical migration 為 `V0103__notification_mail_outbox.sql`）與分組邏輯依據。
- 新增頂層陣列 `partner_notification_allocations`，含兩筆配號：
  - **V0104** `V0104__sr_partner_notification_binding_and_routing.sql` — `admin.phase1_partner_notification_bindings` + `mobility.phase1_order_partner_notification_routes` + `mobility.phase1_partner_notification_sequences`（三張表歸屬 `SR-PARTNER-NOTIFY-ROUTE-20260917`「entry binding + order route + counters」之責任範圍，故合併一檔，比照 V0098-V0100 依下游任務分組的先例）。
  - **V0105** `V0105__sr_partner_notification_delivery_context.sql` — `mobility.phase1_partner_notification_delivery_contexts`（歸屬 `SR-PARTNER-NOTIFY-TRANSPORT-20260917`/`SR-PARTNER-NOTIFY-ACK-20260917` 的 fencing/receipt 責任範圍，獨立一檔）。

每筆配號的 `table_invariants` 逐欄寫出型別、PK/FK、CHECK 約束與交易不變量，並實際比對現有 migration 以確保無跨型別 FK（設計 §11 明文要求）：

- `entry_slug` 沿用 `admin.phase1_partner_channel_entries.entry_slug`（`varchar(150)`, `infra/migrations/V0021__partner_registry_and_eligibility_persistence.sql`）。
- `tenant_id`/`partner_id`/`webhook_id` 沿用 `admin.phase1_tenant_webhook_endpoints`（`varchar(100)`, `infra/migrations/V0012__phase1_remaining_runtime_snapshots.sql`）。
- `partner_user_ref`（`varchar(255)`）/`drts_passenger_id`（`varchar(100)`）沿用 `admin.phase1_partner_user_identity_links`（`infra/migrations/V0030__partner_user_identity_link_persistence.sql`）。
- `order_id`/`outbox_id`（`varchar(255)`）沿用 `ops.consumer_notification_outbox`（`infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql`）。

無一處對既有主鍵型別做 CAST；新表之間的新關係一律採與被參照既有表相同的型別。

### 2.4 迴歸測試（`tests/unit/system-remediation/sr-partner-notify-con-20260917/`，新增）

新檔，涵蓋六組斷言：(1) 既有 outbox/result enum 未變（`ConsumerNotificationOutboxRecord.status` 四值、`PASSENGER_PUSH_DELIVERY_RESULTS` 三值、`TenantWebhookEndpoint` 未增欄位）；(2) 事件目錄／schema_version；(3) binding／route／wire payload／test payload／ack 結構型檢查，含「payload 不含 PII 欄位」與「receiptId 非合成值」的斷言；(4) failure reason ↔ retryDisposition 逐值對應設計表格；(5) delivery context 初始態全為 null 與平台固定限制常數；(6) `schema-allocation.json` 配號無碰撞、未搶跑寫入 `infra/migrations/*.sql`、且配號版本高於配號當下磁碟最高版本（V0103）。

---

## 3. 驗證執行紀錄與實際結果 (Verification Evidence)

| 檢查項目 / 指令 | Exit Code | 實際結果摘要 |
| :-- | :-: | :-- |
| `git rev-parse HEAD origin/dev`（開工前） | 0 | 兩者相同 SHA `b511a7045...`，確認乾淨基準 |
| `python3 -c "json.load(...)"` on `schema-allocation.json` | 0 | 可解析；`partner_notification_allocations` 含 2 筆（V0104, V0105） |
| 直接呼叫 `node .../typescript@5.9.3/.../tsc -p packages/contracts/tsconfig.json --noEmit` | 0（見下方環境註記） | 僅 3 筆既有、與本任務無關的 `zod` 模組解析錯誤；本任務新增/修改的兩個檔案（`partner-passenger-notification.ts`, `index.ts`）零錯誤 |
| 以暫時 ad-hoc `tsconfig`（含 `@drts/contracts` path mapping 與 vitest/node 型別 shim，事後已刪除，`.artifacts/` 已被 gitignore）對新測試檔執行 `tsc --noEmit` | 0（同上環境註記） | 測試檔內 40+ 型別化物件字面量（binding/route/payload/ack/context 等）與新契約介面結構逐一比對通過，僅殘留同一組 `zod` 環境錯誤 |
| `pnpm --filter @drts/contracts build` / `node .../vitest.mjs run tests/unit/system-remediation/sr-partner-notify-con-20260917/` | 1（環境阻塞，非本任務程式碼問題） | 見下方「環境阻塞」章節 |

### 環境阻塞（誠實記錄，非本任務造成）

本 worktree 共用 canonical root 的 `node_modules`（symlink）。查證發現：

1. `packages/contracts/node_modules/` 內殘留一個指向 `../../../.artifacts/worktrees/auto/gemini-sr-partner-notify-con-20260917/...` 的 `zod` symlink——該 worktree（前任 owner Gemini，於本任務被 Chairman 重新指派前持有）已被 supervisor 回收，導致 symlink 懸空。
2. Canonical root 的 `node_modules/` 本身僅有 18 個項目（遠少於一個完整 monorepo install 應有的數量），`node_modules/typescript`、`node_modules/.bin/tsc` 等指向的實際套件目錄不存在於根層級，只存在於 `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>` store 內，顯示一次 `pnpm install` 在別的 worktree 或別的 session 中被中斷、未完成 hoist。
3. 因此 `pnpm --filter @drts/contracts build`、`pnpm exec vitest run ...`、乃至 `vitest.config.ts` 本身（`import { defineConfig } from "vitest/config"` 解析失敗）在這個共用環境下目前對**任何**任務都會失敗，與本任務改動內容無關。

驗證改採直接呼叫 `.pnpm` store 內的 `typescript@5.9.3/node_modules/typescript/bin/tsc` 繞過壞掉的頂層 symlink（見上表），confirming 本任務新增程式碼本身零型別錯誤。**未執行**的驗證：透過 `vitest` 實際跑過新測試檔的 assertion（`expect(...)` 執行期斷言、`toEqual` 深度比較等）——這需要一個健康的 `node_modules` install，超出本任務寫入範圍（`packages/contracts/node_modules` 不在本任務 artifacts 清單內，且 canonical root 的 `node_modules` 是所有並行任務共用狀態，貿然 `pnpm install` 有風險，不在本任務授權範圍內執行）。已將此阻塞誠實記錄於此，供 reviewer 或後續任務判斷是否需要單獨一個「修復共用 node_modules install」任務。

---

## 4. 變更範圍守護 (Write Scopes Compliance)

只觸及本任務宣告的 artifacts（及必要的迴歸測試 / 本文件）：

1. `packages/contracts/src/partner-passenger-notification.ts` — 新增
2. `packages/contracts/src/index.ts` — 新增一行 export，未動既有內容
3. `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` — 未修改內容；隨本次提交一併加入版本控制（原本在 dev 上是未追蹤檔案）
4. `docs/04-uat/system-remediation-20260906/schema-allocation.json` — 只 append `amendments` 一筆與新頂層陣列 `partner_notification_allocations`，既有內容逐字保留
5. `docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-CON-20260917.md` — 本文件，新增
6. `tests/unit/system-remediation/sr-partner-notify-con-20260917/` — 新增迴歸測試

未觸及 `apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts`、`apps/api/src/modules/multi-taxi/multi-taxi.module.ts`、`apps/api/src/modules/multi-taxi/passenger-push.adapter.ts`、`infra/migrations/*`，或任何其他任務的宣告範圍。

---

## 5. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions)

- **不實作傳輸**：`PartnerNotificationTransport`、DI wiring、`dispatchNotificationAttemptByWebhookId` façade 本體均未實作——本任務只定義其回傳形狀（`PartnerNotificationDispatchOutcome`）。
- **不寫 migration SQL**：`infra/migrations/V0104__*.sql`／`V0105__*.sql` 尚未存在於磁碟（已由測試斷言確認）；由 `SR-PARTNER-NOTIFY-ROUTE-20260917`／`SR-PARTNER-NOTIFY-TRANSPORT-20260917` 撰寫。
- **不動既有 webhook 派送行為**：一般 tenant webhook 的 status-only 讀取行為、既有 retry/backoff、既有 secret 輪替均未觸碰。
- **`provider_transient_error` 為本任務新增命名**：設計文件 §9 對應列僅指名 disposition，未指名 failureReason 字面值；本任務為使欄位型別窮盡而新增此名稱，非逐字抄自設計文件，已在 §2.1 與程式註解中明確標示，供 reviewer 核可或後續任務調整。
- **`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` 的提交狀態**：此檔案在 `origin/dev` 上原為未追蹤（untracked）檔案（存在於 canonical root 工作目錄，但未曾提交過任何 commit）。本任務的 candidate commit 是它第一次進入版本控制；未修改其內容一字一句。
- **共用環境阻塞**：見 §3「環境阻塞」，`vitest` 實際執行未能完成，已誠實記錄，未謊稱通過。

---

## 6. 交接資訊 (Handoff)

- **狀態 (Status)**：candidate ready, awaiting independent review (`Gemini2`) and CI
- **CANDIDATE_SHA**：set via `git rev-parse HEAD` at commit time
- **CANDIDATE_BRANCH**：`claude/sr-partner-notify-con-20260917`
