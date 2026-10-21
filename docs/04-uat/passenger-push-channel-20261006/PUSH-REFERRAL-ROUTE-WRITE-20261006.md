# PUSH-REFERRAL-ROUTE-WRITE-20261006

Owner: Codex2 · Reviewer: Claude · 2026-10-07

## 依據與候選

- 本次 task spec/common：canonical root `.local/passenger-push-channel-20261006/` 同名文件與 `common.md`。
- 正式設計：`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` §4、§5、§9、§11；schema：`infra/migrations/V0104__sr_partner_notification_binding_and_routing.sql`。
- 基準 `f5bb39e635cb1a6ebf2b9fcb5fd4905d1a88ebe0`，已包含前置取消事件任務；分支 `codex2/push-referral-route-write-20261006`。
- 最小重現 checkpoint `545186e56`；共用實作 checkpoint `1791ef30e`；失敗隔離與送出證據 checkpoint `c446d707f`。均普通 push，無改寫發布歷史。
- 最終 candidate 是包含本文件的正式提交；完整 SHA、PR URL 與同 SHA CI 由 owner 在 PR body 及 release CLI `handoff` 記錄，避免把本文所在提交的 parent 誤寫為 candidate。reviewer 必須以 machine truth 的 `candidate_sha` 核對 PR head。

## 實際修改與時序

`OwnedMobilityController.createReferralPassengerBooking` → `OwnedMobilityService.createReferralPassengerBooking` 的兩個建單分支，才開啟內部 `writeReferralNotificationRoute` 選項。企業建單、`POST /api/partner/bookings` 人員代訂、電話、語音、外部轉單均未開啟此選項。既有 referral realm、actor、tenant、partner/program/entry 與 passenger 權限檢查保留；body entry 不符仍為 403，並非成功建單。

`tenant-partner/order-partner-notification-route.ts` 匯出共用身分解析、SQL 與 row mapper。entrySlug/drtsPassengerId 來自 server identity，recipient 來自該 entry 的 active link，tenant/partner 來自 registry；不採 body、電話或 email 猜收件人。MultiTaxiService 與 OwnedMobilityService 使用同一解析函式；兩個 repository 使用同一 SQL，沒有新增 module import、global locator 或反向 MultiTaxiModule 相依。OwnedMobilityService 僅在既有 positional constructor 末端注入 TenantPartnerModule 已 export 的 PartnerUserIdentityLinkRepository。

持久化 referral 建單依序執行：

1. 在 OwnedMobilityRepository 的同一交易寫訂單及 trace。
2. 在 `SAVEPOINT partner_notification_route` 內寫 route 和初始 sequence。
3. 完成原交易及 `COMMIT`。
4. 才放入 in-memory order feed、發布 order-created/webhook、回傳 booking。

因此成功設定時，跨 DB 讀者與本 process 派車讀者都不會先看到訂單、後看到路由。原 tenant governance 的 transaction path 也在提交後才 finalize，避免 commit 失敗卻已發布訂單。既有 governance/訂單回歸未改斷言。

route 或 sequence SQL 錯誤會 rollback 到 savepoint、釋放 savepoint 並 `reportPersistenceFailure`；訂單仍可提交。這項 best-effort 政策明確允許「建單成功但無路由」；此時不保證後續通知可送達。交易本身失效、連線中斷或無法回復 savepoint，仍屬訂單資料庫故障，不假稱可成功提交。沒有啟用 DB 的 repository 不保存 durable route，保持既有記憶體模式行為。

缺 active link、link 查詢失敗、通知解析時查不到 entry 都略過路由。入口最初就沒有合法 entry 時，原建單所需的 service-product/authorization 檢查仍可拒絕；本任務不繞過它。新增案例特別驗證「通過建單驗證後，通知 registry lookup 不可用」仍可成功建單。

API idempotency replay 不重跑解析/writer；repository replay 仍為 `ON CONFLICT (order_id) DO NOTHING`，讀回原 route，不改 recipient，也不重設已前進的 sequence。

## V0104 欄位對照（供 reviewer 逐欄核對）

SQL 直接抽自原 MultiTaxiRepository，未新增或修改 migration。以下均寫入 `mobility.phase1_order_partner_notification_routes`：

| SQL 欄位 / V0104 型別                          | 寫入來源                                       |
| ---------------------------------------------- | ---------------------------------------------- |
| order_id varchar(255), PK                      | 新訂單 orderId                                 |
| tenant_id varchar(100), NOT NULL               | entry.tenantId                                 |
| partner_id varchar(100), NOT NULL              | entry.partnerId                                |
| entry_slug varchar(150), FK channel entries    | identity.partnerEntrySlug.trim()               |
| partner_user_ref varchar(255), NOT NULL        | active link.partnerUserRef                     |
| drts_passenger_id varchar(100), NOT NULL       | scoped active link.drtsPassengerId             |
| passenger_subject_ref varchar(255), NOT NULL   | 原 resolvePassengerSubjectRef(order.passenger) |
| identity_linked_at timestamptz, NOT NULL       | link.linkedAt                                  |
| consent_bundle_version varchar(50), NOT NULL   | 原 link.consentScope；未新增 consent store     |
| notification_policy_version varchar(50), CHECK | partner_notification_v1                        |
| ride_ref varchar(255), UNIQUE                  | order.orderId；非 bearer token                 |
| created_at timestamptz, NOT NULL               | server ISO timestamp                           |

`mobility.phase1_partner_notification_sequences`：`order_id varchar(255)` 是 PK 且 FK 指向 route；`next_sequence bigint` 初值 1。僅首次成功 route insert 寫入初始列。原子 eventSequence 配發仍由原 `MultiTaxiRepository.allocateNotificationEventSequence` 與 OwnedMobilityRepository outbox persistence 負責。

## Finding / acceptance 證據

測試檔：`tests/unit/push-referral-route-write-20261006/referral-route.test.ts`（19 cases）。本地 logs 皆在 assigned worker cwd `.local/push-referral-route-write-20261006/`，不是 canonical machine truth。

| Finding / acceptance                                                        | 原始碼依據與修改                                                                                                                                                                                 | 舊版 → 修正版                                                                                                                                                      | 命令、結果與證據                                                   | 未驗項                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| push-referral-route_written_for_embed_bookings：內嵌單無 route              | createReferralPassengerBooking / \_executeCreateTenantBooking；共用 resolver + SQL                                                                                                               | 基準產品碼 + checkpoint 545186e56 測試：route undefined，exit 1；修改後即時/預約 route、sequence 與 commit-before-publish 均通過                                   | 下方 A，90 passed，exit 0；baseline.log、scoped-final.log          | 真 PG 原子性、併發交給 PUSH-CHANNEL-PG-QA-20261006          |
| 同 acceptance：到場通知 route_missing                                       | 正式 arrivedPickup → persistChangesRequired → allocateNotificationEventSequence → MultiTaxiService.deliverPassengerNotification → PartnerNotificationTransport / facade / WebhookDispatchService | 修改後 persisted arrival eventSequence=1；mock HTTP 202 accepted 後 deliveryStage=partner_accepted                                                                 | A 的 arrival producer case 通過；同筆 route 由正式 repository 查回 | 沒有 live endpoint/device evidence，未宣稱裝置收到          |
| push-referral-route_negative_cases_and_regression：錯身分、無連結、其他來源 | 既有 scope checks；只有 referral 選項開啟 writer                                                                                                                                                 | missing/revoked/link lookup failure/missing subject 不寫；entry mismatch 403；body recipient claims 忽略；staff/tenant/phone/voice 不寫；entry/subject lookup 隔離 | A，exit 0；既有斷言未放寬                                          | external forwarder 無變更/不經 referral，僅呼叫路徑靜態核對 |
| 同 acceptance：重放或 SQL 失敗                                              | 原 idempotency execute / shared immutable SQL / repository savepoint                                                                                                                             | replay 僅一次寫入；兩 repository replay 保留進到 9 的 sequence；route/sequence insert 各自失敗均 logged 且訂單成功；commit 失敗不發布訂單                          | A，exit 0；root-types.log、lint.log exit 0                         | savepoint rollback / SQL 真實 PG 行為仍待 QA                |
| 同 acceptance：multi-taxi/夥伴通知回歸、module graph                        | MultiTaxiService wrapper、兩 repository、既有 TenantPartnerModule exports                                                                                                                        | 原 route assertions 全數通過；未增加 MultiTaxiModule reverse edge；正式 transport 接線維持                                                                         | B：319 passed；C：118 passed；D：73 passed；均 exit 0              | PostgreSQL suites 本機 excluded，未當 pass                  |

DB query、identity lookup、driver-task precondition 與外部 transport IO 使用 test doubles；建單、權限/governance、共用 writer SQL、arrival producer、eventSequence allocator、delivery service、transport/facade、wire serialization/ack validation 均走正式程式。測試的 DB mock 僅用來觀察正式 SQL 呼叫與故障恢復順序，沒有另造 schema，也不聲稱證明 Postgres constraint/rollback。arrival case 植入合法 enroute_pickup task，派車 producer 屬下一個任務，不在此模擬出新的派車規則。

## 可重跑命令與結果

在本文件正式提交前測試通過；最終同 SHA 執行結果與 hosted run 連結記在 PR / handoff，候選交接後不再推進分支。

```sh
# A: 新回歸 + 既有訂單 + 原 route tests；90 passed / exit 0
pnpm exec vitest run tests/unit/push-referral-route-write-20261006 tests/unit/owned-mobility.test.ts tests/unit/system-remediation/sr-partner-notify-route-20260917 --maxWorkers=2

# B: 夥伴既有 non-PG 全回歸 + referral lifecycle/lead-time；319 passed / exit 0
pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify- tests/unit/system-remediation/sr-qa-booking-001/c022-referral-lifecycle-continuity.test.ts tests/unit/system-remediation/sr-qa-booking-001-fix-tenant-lead-time --exclude '**/*.postgres.test.ts' --maxWorkers=2

# C: API order regressions；118 passed / exit 0
pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.service.test.ts

# D: API multi-taxi + quota；73 passed / exit 0
pnpm --filter @drts/api exec vitest run tests/unit/multi-taxi tests/unit/tenant-quota-ledger.test.ts

pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
pnpm typecheck:root
# 上述 build/typecheck 均 exit 0

pnpm exec eslint apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/src/modules/owned-mobility/owned-mobility.repository.ts apps/api/src/modules/multi-taxi/multi-taxi.service.ts apps/api/src/modules/multi-taxi/multi-taxi.repository.ts apps/api/src/modules/tenant-partner/order-partner-notification-route.ts tests/unit/push-referral-route-write-20261006 --max-warnings=0
# exit 0

git diff --check
# exit 0
```

前期失敗另保留：初次 vitest 因 worker node_modules 符號連結失效未能載入，不能算重現；隔離安裝後 baseline.log 才是正式缺陷重現。中途 booking-regression.log 有舊 memory repository 沒 withTransaction 的失敗，已保留無 identity provider 的舊 memory 路徑，原測試通過；scoped-extended.log 兩個 fixture 不完整的失敗已修正，非產品缺陷重現或退修輪次。

## 待 reviewer / QA

- Reviewer 逐欄核對上述 SQL 與正式 V0104，並核對完整 candidate SHA 的 CI 結果；CI、merge、兩個 required_acceptance 均不能由本地 pass 代替。
- PUSH-CHANNEL-PG-QA-20261006 用正式 migrations + production repositories 驗證同交易可見性、savepoint route/sequence 故障恢復、重放/併發不重設序號及 arrival eventSequence 持久化；本 VM 未启动 DB/API/preview/browser server 或 Docker。
- consentBundleVersion 繼續使用既有 consentScope；referral 的固定座標與預設電話未修改，通知 recipient 完全不依賴它們。
- 沒有部署、真實外送、FCM/APNs 設定變更或第一方介面新增；assignment 通知與 channel router 由後續任務處理。
