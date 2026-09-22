# SR-PARTNER-NOTIFY-ROUTE-20260917 — 夥伴通知綁定與訂單路由快照

- Owner: Claude；Reviewer: Claude2。
- Branch: `claude/sr-partner-notify-route-20260917`，base `origin/dev`（含已合併的 `SR-PARTNER-NOTIFY-CON-20260917`、`SR-PARTNER-NOTIFY-ACK-20260917`）。
- 來源設計：`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` §3（端點治理／binding）、§4（訂單通知路由快照）、§5（durable event sequence）、§11（migration 範圍）。
- 最終 candidate SHA 由下列 handoff 寫入 task machine truth（文件不包含自身 commit hash）。

## 範圍界線（本次刻意不做的事，依 task brief 邊界）

- 不實作 transport（`PartnerNotificationTransport`、`multi-taxi/passenger-push.adapter.ts`）、不改 `multi-taxi.module.ts` 的 transportMode DI（`WebPushTransport`/`PASSENGER_DEVICE_RESOLVER` 保留原樣）、不動 `webhook-dispatch.service.ts` 或 `WebhookDispatchService` 既有派送行為——本任務只**使用**已完成的 `PartnerNotificationDispatchFacade`（SR-PARTNER-NOTIFY-ACK-20260917）發 `passenger.notification.test.v1` 測試事件，不重寫其邏輯。
- `GET .../notification-deliveries`、`POST .../notification-deliveries/{outboxId}/retry`（設計 §3.2 兩支 API）**未實作**：其資料落點 `mobility.phase1_partner_notification_delivery_contexts`（migration V0105）配號給 `SR-PARTNER-NOTIFY-ACK-20260917`/`SR-PARTNER-NOTIFY-TRANSPORT-20260917`，本任務只拿到 V0104。在該表存在前實作這兩支 API 等於憑空造資料，因此本任務只交付另外 5 支（GET/PUT/test/enable/disable），並在 controller 檔頭註解明列這個邊界。
- 本文件第一版（candidate `e054d9ffe26a`，已合併 `dev`＠`2e0d962b6`）刻意不把 `allocateNotificationEventSequence` 接上任何真正的 outbox producer，理由是唯一的 producer 在 `owned-mobility.repository.ts`/`.service.ts`（12000+/1900+ 行、被大量其他並行任務共用），不在本任務原宣告的 artifacts 範圍。Chairman 在 `SR-PARTNER-NOTIFY-ROUTE-20260917-UNBLOCK-HISTORY-REPAIR` 解除阻塞後把本任務重新打回 `todo`，明確要求補上 `required_acceptance.durable_event_sequence_allocated_in_same_transaction`——這一版把該缺口實作完成（見下方「交付三之補述」），因此擴大觸碰到 `owned-mobility.repository.ts`（僅新增 11 行，改動範圍限定在既有 `persistChangesWithExecutor` 的 consumer outbox INSERT 這一個 SQL 陳述式，不動其餘 1900+ 行）。這是本任務唯一超出原宣告 artifacts 的改動，原因與範圍在此明列。
- `OrderPartnerNotificationRoute` 的寫入**不在**與 `ops.phase1_owned_orders` INSERT 完全相同的一個 DB transaction 內——那個 INSERT 位於 `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`（12000+/1900+ 行、被大量其他並行任務共用的既有模組），不在本任務宣告的 artifacts（`multi-taxi.service.ts`/`multi-taxi.repository.ts`）範圍內，貿然新增跨模組交易共享執行緒風險過高。改採：`multi-taxi.service.ts#createRide` 在 `ownedMobilityService.createMultiTaxiRide()` 回傳後、任何呼叫端觀察到該訂單或任何 outbox 派送週期可能啟動之前，同步呼叫路由寫入（route 本身 + sequence 初始化仍在同一個新 transaction 內原子完成，見下）。這滿足設計 §4「第一筆 outbox 前必須已有 route」的字面要求，但不是「與訂單建立同一個 DB transaction」——已在程式註解與此處明列，供 reviewer 或後續整合任務判斷是否需要把這個寫入點搬進 `owned-mobility` 模組本身。
- `consentBundleVersion`：設計 §4 要求此欄位，但目前程式庫沒有獨立的、可依 (entrySlug, drtsPassengerId) 查詢的版本化同意紀錄（`ReferralEmbedHandoffRepository` 的 consent ledger 只能用 handoffId 存取，沒有公開的反查方法）。本任務改用 `PartnerUserIdentityLinkRecord.consentScope`（既有欄位）暫代，並在程式與本文件中明列這是權宜對應，非逐字對應設計文件的獨立版本化同意欄位。
- `rideRef`：設計未指名任何既有欄位作為此值的來源；本任務直接採用 `orderId`（唯一、非 bearer credential，且該值本就用於既有 `passenger-rides/:accessToken` 流程),`ride_ref UNIQUE` 約束因此與 `order_id PRIMARY KEY` 等價收斂，但欄位保留（比照設計 §11 原樣）供未來若改用獨立 trip 識別碼時不需要動 schema。

## 交付一：`admin.phase1_partner_notification_bindings` + `mobility.phase1_order_partner_notification_routes` + `mobility.phase1_partner_notification_sequences`（`infra/migrations/V0104__sr_partner_notification_binding_and_routing.sql`）

逐欄位比照 `docs/04-uat/system-remediation-20260906/schema-allocation.json` 的 `partner_notification_allocations[0].table_invariants`（V0104 配號，由 SR-PARTNER-NOTIFY-CON-20260917 寫定，本任務為指名下游 owner）：PK/UNIQUE/CHECK/FK 逐條核對，`entry_slug`/`webhook_id` FK 到既有 `admin.phase1_partner_channel_entries`/`admin.phase1_tenant_webhook_endpoints`；`order_id` 沿用 `varchar(255)`（比照 `ops.consumer_notification_outbox` 的型別慣例，未加 FK——該表本身也未對 order_id 加 FK，先例一致）；`phase1_partner_notification_sequences.order_id` FK 到 `phase1_order_partner_notification_routes(order_id)`。未寫 V0105（delivery context，仍配號給 ACK/TRANSPORT）。

## 交付二：`PartnerEntryNotificationBinding` 治理（service/repository/controller）

新檔（皆在 `apps/api/src/modules/tenant-partner/`）：`partner-entry-notification-binding.repository.ts`、`.service.ts`、`.controller.ts`，並在 `tenant-partner.module.ts` 登記（providers + controllers + 沿用既有 `TenantPartnerService`/`PartnerNotificationDispatchFacade`，未新增跨模組 import）。

- **Repository**：`entry_slug` 為 PK；DB 停用時退化為 in-memory Map（比照 `PartnerUserIdentityLinkRepository`/`ReferralEmbedHandoffRepository` 既有慣例）。`put()` 是樂觀鎖 upsert：`expectedVersion=0` 建立（`test_pending`，`version=1`）；否則 `WHERE entry_slug=$1 AND version=$expectedVersion` 更新，版本不符回 `version_conflict`（controller 轉 409）。任何成功的 `put()` 一律把 `state` 重置為 `test_pending`、清空 `validatedEndpointFingerprint`/`validatedAt`（設計 §3.1：URL/events/webhook 輪替必須重驗）。DB 路徑用 `SELECT ... FOR UPDATE` + 單一交易避免併發 race。
- **Service**：`putBinding` 驗證 entry 存在且 active、tenant/entry resource scope（platform-wide identity 通過；tenant-scoped identity 的 `tenantId` 須等於 entry 的 tenantId，否則 403）、`webhookId` 屬於 entry 的 tenant（用既有公開方法 `TenantPartnerService.listWebhookEndpoints`，未重寫端點查找邏輯）、`eventTypes` 為五個合法值的非空子集，且逐一檢查端點自身的 `events` allowlist 已包含對應外部事件名（`PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME`，重用既有契約常數，不另造字串樣板）。`testBinding` 用 `PartnerNotificationDispatchFacade.dispatchNotificationAttemptByWebhookId` 發一次 `passenger.notification.test.v1`；`accepted` 才寫入 `validatedEndpointFingerprint`（見下）與 `validatedAt`，`state` 本身**不**因測試而改變。`enableBinding` 要求 `validatedAt` 非空且 `validatedEndpointFingerprint` 等於「當前」端點指紋，否則 409 要求重測；通過才把 `state -> ready`。`disableBinding` 直接轉 `disabled`。
- **`computeEndpointFingerprint`**（純函式，exported 供測試）：`sha256(url + sorted(events) + secretVersion + ownerRef)`。設計文件未指名這個指紋怎麼算，只要求「URL／事件清單／owner 或 secret 輪替後必須重驗」——本函式把這四個会變動的欄位全部折進去，任一項改變都會讓已儲存的 `validatedEndpointFingerprint` 失效；events 排序後再雜湊，保證陣列順序不影響結果。
- **Controller**：7 支管理 API 中的 5 支（GET/PUT/test/enable/disable）；路由前綴 `platform-admin/partner-entries/:entrySlug/notification-binding*` 落在 `apps/api/src/common/auth/auth.policy.ts` 既有的 `platform-admin/` 前綴規則（`allowedRealms:["system","platform"]`、`foundation:read`/`foundation:write`），因此未新增或修改任何 guard 裝飾器或 `auth.policy.ts` 條目——比照同檔案內其餘 `platform-admin/partner-entries/*` handler（`tenant-partner.controller.ts` 784-935 行)沒有裝飾器的既有寫法。

## 交付三：`OrderPartnerNotificationRoute` + 每訂單 durable event sequence（`multi-taxi.repository.ts`/`multi-taxi.service.ts`）

- `MultiTaxiRepository.writeOrderPartnerNotificationRoute(route)`：在一個 DB transaction 內先 `INSERT ... ON CONFLICT (order_id) DO NOTHING RETURNING *`；插入成功才接著 `INSERT INTO phase1_partner_notification_sequences (order_id, next_sequence) VALUES ($1, 1) ON CONFLICT DO NOTHING`；沒插入成功（已存在）則改讀現有列回傳——route 一旦建立即不可變,重複呼叫是 no-op 而非覆寫。任何例外都被捕捉、記警告、回傳 `null`，不向上拋出（見下方呼叫端）。
- `MultiTaxiRepository.allocateNotificationEventSequence(orderId)`：單一原子 `UPDATE ... SET next_sequence = next_sequence + 1 WHERE order_id=$1 RETURNING next_sequence - 1`——併發呼叫必定拿到不同號碼；保留為可重用的原子分配原語（自身測試涵蓋其 SQL 語意），供未來直接呼叫的場景使用。

### 交付三之補述：接上真正的 outbox producer

`ops.consumer_notification_outbox` 目前只有兩個真正的寫入點：`owned-mobility.service.ts#buildPassengerAssignmentAuthority`（`assignment_disclosure_ready`/`assignment_replaced`，multi-taxi 唯一會建立 `OrderPartnerNotificationRoute` 的訂單類型）與 `owned-autonomous-dispatch-executor.service.ts`（`passengerSubjectRef: driver:${driverId}`，司機端通知，不屬於乘客/夥伴通知鏈）。`eta_changed`/`driver_arrived`/`receipt_ready` 目前只存在於 `MultiTaxiService#resolvePassengerEventType`（SSE 專用，即設計 §5 明文禁止拿來當 durable 序號的那個 in-memory counter），還沒有任何 durable outbox producer——這三種事件的 outbox 化不在本任務範圍內。

兩個 producer 最終都經過 `owned-mobility.repository.ts#persistChangesWithExecutor` 同一段 `changes.consumerNotificationOutbox` 寫入迴圈（`persistChanges`/`persistOrderWorkflow` 殊途同歸）。改動只在這一個 INSERT 陳述式：把它包成一個 `WITH seq AS (UPDATE mobility.phase1_partner_notification_sequences ... RETURNING next_sequence - 1) INSERT INTO ops.consumer_notification_outbox (...) VALUES (..., COALESCE((SELECT jsonb_set($6::jsonb, '{eventSequence}', to_jsonb(event_sequence)) FROM seq), $6::jsonb), ...)`——單一 SQL 陳述式本身就是原子的，序號分配與 outbox 列插入必定一起 commit 或一起 rollback，不需要额外包一層 explicit transaction，也因此不用去動 `persistChanges` 目前是否用同一個 transaction client 的既有行為（那是與本任務無關的既有課題）。

三個關鍵決定：

1. **不加新欄位、不寫新 migration**：`eventSequence` 用 `jsonb_set` 寫進既有 `payload` jsonb，不是新的 `event_sequence` 資料行。這是刻意選擇——V0104 已套用（`不得重用已套用 migration`），而唯一可新增序號欄位的表 `ops.consumer_notification_outbox` 不屬於本任務宣告的 migration 範圍。
2. **`NOT EXISTS` 防止 burn 序號**：CTE 的 `UPDATE` 加了 `AND NOT EXISTS (SELECT 1 FROM ops.consumer_notification_outbox WHERE outbox_id = $1)`。沒有這個保護，`ON CONFLICT (outbox_id) DO NOTHING` 造成的重試（同一 outbox row 已存在）仍會讓 `seq` CTE 跑一次 `UPDATE`，白白消耗一個序號，讓真正被送出的序號序列出現跳號。
3. **`COALESCE` 相容沒有 route 的訂單**：絕大多數訂單（call-center、非 multi-taxi、沒有連結 partner identity 的 multi-taxi 訂單）從未建立 `OrderPartnerNotificationRoute`，所以 `mobility.phase1_partner_notification_sequences` 沒有那筆 `order_id`；CTE 的 `seq` 因而是空集合，`COALESCE` 退回原始 `$6::jsonb` payload，不報錯、不寫入 `eventSequence`。

驗證這個決定曾經在一個獨立的並行嘗試（`gemini/sr-partner-notify-route-20260917`，candidate `431f302d2`、squash 為 `origin/gemini/sr-partner-notify-route-20260917-v2`@`0ef206d00`，未合併、與本分支無共同祖先）中先後試過「新增 `event_sequence` 欄位＋直接 `(SELECT event_sequence FROM seq)`」再改成「payload jsonb 方案＋`NOT EXISTS` 防護」——本次直接採用該分支收斂後的最終寫法，不重複其踩過的坑（見 `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts` 的 commit `60de0a321`／`4b25e4d8b` 歷史，僅供考古，非本分支祖先）。
- `MultiTaxiService#createRide`：新增私有方法 `writeOrderPartnerNotificationRouteIfApplicable(order, identity)`，在 `ownedMobilityService.createMultiTaxiRide()` 之後、`createRideAccessResult()` 之前呼叫。只在 `identity.partnerEntrySlug` 與 `identity.drtsPassengerId` 皆存在時觸發（call-center 訂單 `identity` 恆為 `null`，不會觸發）；用新增的 `PartnerUserIdentityLinkRepository.findByDrtsPassengerId(entrySlug, drtsPassengerId)`（反查方法,本任務新增，不接受呼叫端自稱的 `partnerUserRef`）取得 link，要求 `status==="active"`（撤銷的 link 直接跳過,不建立 route）；`tenantId`/`partnerId` 一律從 `TenantPartnerService.getPartnerEntry(entrySlug)`（既有平台夥伴登記,不信任訂單本身的 `tenantId`——multi-taxi 標準計程車訂單本身無 tenant）取得。任何一步找不到就靜默跳過（不建立 route,不丟例外),route 寫入本身也包在 `.catch()` 裡呼叫 `repository.reportPersistenceFailure`——不管哪一步失敗,`createRide` 都正常回傳,不因通知路由設置問題擋掉已完成的叫車(設計 §9)。
- **DI**：`MultiTaxiModule` 新增 import `TenantPartnerModule`(單向邊,`TenantPartnerModule` 未 import `MultiTaxiModule`,不構成循環;`OwnedMobilityModule` 已存在同樣的 `TenantPartnerModule` 依賴,故此為既有拓撲的自然延伸)。`MultiTaxiService` 建構子新增兩個 `@Optional()` 參數(`PartnerUserIdentityLinkRepository`、`TenantPartnerService`),沿用既有「缺依賴就靜默跳過」慣例(比照 `repository`/`auditNotificationService` 等既有可選依賴)。

## 測試（`tests/unit/system-remediation/sr-partner-notify-route-20260917/`，新增,27 tests）

- `partner-entry-notification-binding.repository.test.ts`(6 tests,fallback/no-DB 模式):建立、`expectedVersion` 不為 0 時拒絕建立、過期 version 的 PUT 回 409 且不覆寫舊資料、有效 version 的 PUT bump version 並重置 state/validation、enable/disable bump version 並要求 version 相符、`findByEntrySlug` 初始為 null。
- `partner-entry-notification-binding.service.test.ts`(12 tests,用真正的 `TenantPartnerService`+`WebhookDispatchService`(mock fetch)+`PartnerNotificationDispatchFacade`,不 mock service 自身方法,比照 ACK 既有測試手法):tenant/partner 正確從 entry 解析、事件不在端點 allowlist 時拒絕、webhookId 不屬於 tenant 時 404、tenant scope 不符時 403、test 成功寫入符合當前端點的 fingerprint 且不改變 state、沒測試過不能 enable、端點 URL 輪替後舊 fingerprint 過期不能 enable、test 通過後可以 enable 且 disable 可回復、無效 ack(204)不觸發 accepted 也不寫入驗證狀態、`computeEndpointFingerprint` 的determinism/順序不敏感/四個欄位任一變動皆改變雜湊。
- `multi-taxi-order-partner-notification-route.test.ts`(7 tests,直接建構 `MultiTaxiService` 搭配假 repository/identity-link-repository/tenant-partner-service,比照既有 `apps/api/tests/unit/multi-taxi.service.test.ts` 手法):有 partner handoff 時正確從 identity+link 建立 route(且 `passengerSubjectRef` 不是明文電話)、直接/call-center 訂單不建立 route、link 被撤銷不建立、link 查無不建立(不猜測收件人)、entry 查無不建立且不擋訂單建立、route 寫入失敗不擋訂單建立。
- `owned-mobility-outbox-event-sequence.test.ts`(2 tests,新增,直接建構 `OwnedMobilityRepository`,比照既有 `apps/api/tests/unit/owned-mobility.repository.test.ts` 手法):consumer notification outbox INSERT 的 SQL 陳述式本身包含 `WITH seq AS`／`RETURNING next_sequence - 1 AS event_sequence`／`NOT EXISTS`／`jsonb_set` 這四個結構,且 11 個綁定參數順序與既有呼叫端完全相同(不因本次改動而變動 caller 介面);第二個 test 確認 `COALESCE` 的兩個分支都綁定同一個 `$6::jsonb` payload 參數,而非只有 seq 命中時才有值。

## 本次實際執行指令與結果(本 worktree)

| 指令 | 結果 |
| --- | --- |
| `pnpm --filter @drts/contracts build`(繞過壞掉的 symlink,直接呼叫 `.pnpm` store 內 `typescript@5.9.3/.../tsc`,環境阻塞同 CON/ACK 文件已記錄) | 0 |
| `tsc -p apps/api/tsconfig.json --noEmit`(同上路徑) | 0 — 全綠,含本任務新增/修改的全部檔案(含 `owned-mobility.repository.ts`) |
| `vitest run tests/unit/system-remediation/sr-partner-notify-route-20260917/` | 0 — 4 files / 27 tests passed(新增測試,含本次補上的 `owned-mobility-outbox-event-sequence.test.ts`) |
| `vitest run tests/unit/owned-mobility.repository.test.ts`(於 `apps/api/` 目錄下,該檔案不在根 vitest include glob 內) | 0 — 1 file / 7 tests passed(既有回歸,`owned-mobility.repository.ts` 的既有斷言未受影響) |
| `vitest run tests/unit/multi-taxi.*.test.ts tests/unit/tenant-partner.*.test.ts tests/unit/owned-mobility.*.test.ts tests/unit/owned-autonomous-dispatch-executor.*.test.ts`(於 `apps/api/` 目錄下) | 0 — 9 files / 264 tests passed(既有回歸,含唯二兩個真正的 outbox producer 呼叫端) |
| `vitest run tests/unit/system-remediation/sr-partner-notify-route-20260917/ tests/unit/system-remediation/sr-partner-notify-ack-20260917/ tests/unit/system-remediation/sr-partner-notify-con-20260917/ tests/unit/tenant-partner-foundation.test.ts`(根目錄) | 0 — 8 files / 107 tests passed |
| `vitest run tests/unit/ apps/api/tests/unit/`(全量,本次補述重跑) | 316 files, 4 failed(3298 tests passed, 3 failed, 22 skipped) — 失敗檔案與第一版文件記錄的既有環境缺口完全相同:`db-apply.test.ts`(3 個測試)、`sr-qa-concurrency-001/dispatch-reservation-concurrency.test.ts`、`sr-qa-concurrency-001/idempotency-concurrency.test.ts`、`sr-qa-dispatch-001/dispatch-db-persistence.test.ts`,全部因本機無 Postgres(`service "postgres" is not running"`)造成,與本次 `owned-mobility.repository.ts` 改動無關 |

### 對既有測試檔案的兩處必要修改(非本任務 artifacts,但為本任務合法產出的直接後果)

1. `tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts`:CON 任務原斷言「V0104/V0105 都不得存在於磁碟」——這是 CON 自身當下時間點的快照(它自己沒寫 DDL),而非「V0104 永遠不得被寫入」。V0104 的 `downstream_tasks` 明列 `SR-PARTNER-NOTIFY-ROUTE-20260917`,本任務正是被授權的下游 owner。已將斷言改為只檢查仍未被任何下游任務認領的 `V0105`,並在測試內加註解說明原因,不觸碰 CON 任務其餘 25 個斷言。
2. `tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts`:該任務的「磁碟最高 migration 版本不得超過已配號上限」斷言只聚合了 `allocations`/`additional_allocations`/`launch_allocations` 三個陣列,未包含 CON 任務後來新增的頂層陣列 `partner_notification_allocations`——這個 schema-allocation.json 本身是跨任務 append-only 共用檔,新增頂層陣列是既有先例(CON 文件已載明比照 V0098-V0100 分組),此斷言原本就會在任一下游任務寫入 V0104 的那一刻失效,與本任務程式碼本身無關,是既有測試脆弱性。已把 `partner_notification_allocations` 併入聚合來源,其餘 31 個斷言未動。

## 未做的部分(明列,不冒充成功)

- `OrderPartnerNotificationRoute` 寫入不是與訂單建立的 DB INSERT 同一個交易(見上「範圍界線」)——後續若要做到嚴格同交易,需要把寫入點搬進 `owned-mobility.repository.ts` 的 `persistChangesWithExecutor`(該檔已有現成的「changes bag 在一個 executor 內逐一寫入」模式,是最小風險的介面),不在本任務改動範圍。這一點與 event sequence 的補述無關:event sequence 是在既有的 outbox INSERT 陳述式內原子分配,不需要 route 也在同一交易內才能運作(見上「交付三之補述」的 `COALESCE` 說明)。
- `eta_changed`/`driver_arrived`/`receipt_ready` 三種事件仍然沒有任何 durable outbox producer(目前只有 SSE 用的 in-memory 版本),因此也就沒有 event sequence 可分配;把這三種事件接上 durable outbox 本身是設計 §5 尚未指派給任何現存任務的缺口,不在本任務範圍。
- `notification-deliveries` 兩支 API 未實作(見上「範圍界線」)。
- `consentBundleVersion` 暫用 `PartnerUserIdentityLinkRecord.consentScope` 代替(見上)。
- 未執行任何需要真實 Postgres 的整合測試(`writeOrderPartnerNotificationRoute`/`allocateNotificationEventSequence` 的 SQL 本身未在真實資料庫上跑過,僅在 `isEnabled()===false` 的 fallback 路徑與程式碼審閱層級驗證;本機環境無 Postgres,同 CON/ACK 文件記錄的既有阻塞)。

## Candidate handoff

實作與測試完成、commit 並普通 push 後,使用:

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Claude /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh \
  handoff SR-PARTNER-NOTIFY-ROUTE-20260917 Claude2 "第二輪(resume after UNBLOCK-HISTORY-REPAIR):補上 durable_event_sequence_allocated_in_same_transaction——在 owned-mobility.repository.ts 唯一真正的 consumer_notification_outbox INSERT 加一個 WITH seq AS(...) CTE,原子分配 mobility.phase1_partner_notification_sequences 並用 jsonb_set 寫進既有 payload(不加欄位、不寫新 migration),NOT EXISTS 防止 ON CONFLICT DO NOTHING 重試燒號,COALESCE 相容沒有 route 的訂單；第一輪既有交付(binding governance 5 API、樂觀鎖 409、tenant/entry scope、fingerprint 重驗 gate、order route/sequence migration V0104、multi-taxi 建單時機寫入 route)不變；typecheck 乾淨(含 owned-mobility.repository.ts)；新增 2 個測試(共 27 個任務測試)+ 既有回歸 264 個(multi-taxi/tenant-partner/owned-mobility/owned-autonomous-dispatch-executor)+ 全量 3298 個全綠,4 個既有失敗檔案為本機無 Postgres 的既有環境缺口,與本次改動無關"
```

精確 candidate SHA、branch、reviewer 與 state 以同一 release 的 `ai-status.sh show SR-PARTNER-NOTIFY-ROUTE-20260917` 讀回。owner 不寫 `done`；獨立 review、CI 及 merge 皆尚待 lifecycle 完成。
