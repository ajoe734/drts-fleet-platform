# PUSH-CHANNEL-ROUTER-20261006

Owner: Claude · Reviewer: Codex2

## 依據與定位

- 依本 task spec、common.md、`docs/02-architecture/passenger-notification-channel-routing-20261006.md`（D2/D3/D7）、AI_COLLABORATION_GUIDE.md §0.7 執行。相依任務 PUSH-CHANNEL-SD-20261006（951d542f0）、PUSH-REFERRAL-ASSIGNMENT-EVENT-20261006（e19dda433）、PUSH-FIRST-PARTY-REGISTRY-20261006（3ecd55d6c）皆已 merge 進 `origin/dev`，分支基底即為該狀態。
- 現況核實：`multi-taxi.module.ts` 的 `PASSENGER_PUSH_ADAPTER_CONFIG` 仍綁 `transportMode: "partner_webhook"`；`MultiTaxiService.deliverPassengerNotification` 原本一看到這個 transportMode 就直接轉 `deliverPartnerNotification`，不管訂單是否真的有夥伴路由——沒有路由的單一律在 `PartnerNotificationTransport.resolve()` 內拿到 `route_missing`（`manual_only`）。
- `packages/contracts/src/passenger-notification-channel.ts`（PUSH-CHANNEL-SD-20261006 產物）已經定義好 `PassengerNotificationChannelRoute`、`route_ambiguous`（已是既有 `PartnerNotificationFailureReason` 成員，`manual_only`）、`no_notification_channel`（`FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS.no_notification_channel = "none"`）、`configuration_blocked`。本 task 不再重新定義這些列舉，只接上判定與投遞分流。
- `mobility.phase1_order_first_party_notification_routes`（V0107，PUSH-FIRST-PARTY-REGISTRY-20261006）目前沒有任何 writer（沒有第一方叫車路徑），所以 `first_party_app` 分支在正式環境永遠到不了——但本 task 仍完整實作並測試它，因為判定邏輯必須對這個狀態給出正確結果。

## 設計與實作

### D2 判定：一次查詢兩張表

- 新增 `MultiTaxiRepository.resolvePassengerNotificationChannel(orderId)`：單一 SQL，兩個 `to_jsonb(...)` 子查詢分別讀 `mobility.phase1_order_partner_notification_routes` 與 `mobility.phase1_order_first_party_notification_routes`，依兩者是否存在回傳 `partner_webhook` / `first_party_app` / `ambiguous`（兩者皆有）/ `none`（兩者皆無）。回傳型別 `PassengerNotificationRouteResolution`（新檔 `passenger-notification-channel-router.ts`）是 `@drts/contracts` 既有 `PassengerNotificationChannelRoute` 聯集再加 `ambiguous`/`none` 兩個狀態，不新增型別重複定義。
- 新檔 `MultiTaxiRepository`'s 的 `FirstPartyNotificationRouteRow`/`mapFirstPartyNotificationRoute`：不 import `passenger-push-devices` module（那個 module 故意與 multi-taxi 互不依賴），自己依 V0107 欄位寫一份對應的 row mapper，與既有 `OrderPartnerNotificationRouteRow`/`mapOrderPartnerNotificationRoute` 同構。

### D3/D6 決策表：純函式，無 I/O

- 新檔 `apps/api/src/modules/multi-taxi/passenger-notification-channel-router.ts` 的 `resolveNonPartnerChannelOutcome(channel)`：
  - `ambiguous` → `failureReason: route_ambiguous`、`retryDisposition: manual_only`（沿用既有 `PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS`）、`result: provider_error`。
  - `none` → `failureReason: no_notification_channel`、`retryDisposition: none`（沿用既有 `FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS`）、`result: provider_not_configured`。
  - `first_party_app` → `failureReason: configuration_blocked`、`retryDisposition: configuration_blocked`、`result: provider_not_configured`。旗標關閉與「沒有注入第一方 transport」在本波永遠同時成立（沒有 transport、沒有 caller），兩個成因收斂成同一個結果，所以這個純函式不另外讀 `PASSENGER_PUSH_FIRST_PARTY_ENABLED`——沒有任何輸入能讓它在本波走到不同分支。`PUSH-FIRST-PARTY-FCM-20261006` 加入真正 transport 後會替換這個分支，不是擴充它。

### D7 分流點：service 層新增兩個私有方法，partner 路徑逐位元不變

- `MultiTaxiService.deliverPassengerNotification` 原本的 `if (transportMode === "partner_webhook") return this.deliverPartnerNotification(...)` 改成 `return this.deliverRoutedPassengerNotification(record, requestId)`；非 partner_webhook 的 legacy 分支（webpush／未設定管道）完全沒動。
- `deliverRoutedPassengerNotification`：呼叫 `resolvePassengerNotificationChannel`，若結果是 `partner_webhook` 就呼叫既有、完全沒改過的 `deliverPartnerNotification(record.outboxId, requestId)`——簽章、呼叫序都跟改動前一樣。其餘三種結果轉給新的 `deliverNonPartnerChannelOutcome`。
- `deliverNonPartnerChannelOutcome`：共用既有的 `claimPartnerNotification`（D7「各管道共用同一套 claim／fence／receipt 交易」——這個方法雖然叫 partner，但本來就只操作 `ops.consumer_notification_outbox` / `ops.phase1_push_delivery_claims`，沒有任何夥伴專屬欄位，可以安全重用）取得 fence，寫入新的 `payload.channelRouting` metadata（獨立於夥伴的 `payload.partnerNotification`，因為 `no_notification_channel` 不屬於既有 `PartnerNotificationFailureReason` 型別，混進同一個欄位需要放寬那個型別——那個型別定義在本 task 寫入範圍外的 `partner-notification.types.ts`，不能動），再呼叫 `recordPushDeliveryOutcome`（新增可選的 `channelMetadata` 參數，`partnerMetadata` 路徑完全不變）落盤同一個 fence。

### 取件 SQL：新增一個 COALESCE 分支，不改既有語意

- `listDuePartnerNotifications` 的 `WHERE` 子句原本 `COALESCE(c.retry_disposition, payload->'partnerNotification'->>'retryDisposition', 'automatic')`，新增第三個 COALESCE 分支讀 `payload->'channelRouting'->>'retryDisposition'`。一筆單被判定 `ambiguous`/`none`/`first_party_app` 骨架後，`channelRouting.retryDisposition` 絕不是 `automatic`，之後永遠不會再被選中——沒有新增任何 timer，重試時機仍完全由 outbox 的 `next_attempt_at`/claim 決定。
- `claimPartnerNotification` 的 disposition 檢查同步加上 `payload.channelRouting` 的 fallback（防禦性；實際上一旦被 `listDuePartnerNotifications` 排除，這個方法本來就不會再被叫到同一列）。

### 夥伴 Ops 清單不受影響

- 沒有修改 `listPartnerNotificationDeliveries`。`no_notification_channel`／`ambiguous` 的單既沒有 `mobility.phase1_order_partner_notification_routes` 列也沒有 `mobility.phase1_partner_notification_delivery_contexts` 列，`COALESCE(ctx.entry_slug, r.entry_slug)` 對它永遠是 SQL NULL，不可能等於任何具體 `entrySlug`——結構性保證，不是本 task 新加的邏輯。

## 可寫範圍核對

- `multi-taxi.module.ts`、`passenger-push.port.ts`、`passenger-push.adapter.ts`：檢查後**沒有任何修改**。分流判定完全在 service/repository 層完成，不需要新的 transportMode 值或新的 DI token；module.ts 的 `transportMode: "partner_webhook"` 字面值維持不動——這也是 PUSH-FIRST-PARTY-REGISTRY-20261006 的既有回歸測試（`tests/unit/push-first-party-registry-20261006`）鎖住的斷言之一，不在本 task 寫入範圍內，不能改。
- `multi-taxi.repository.ts`：新增 `resolvePassengerNotificationChannel` 與其型別/mapper；`listDuePartnerNotifications`、`claimPartnerNotification`、`recordPushDeliveryOutcome` 只做上述最小擴充，既有 SQL 字串逐字保留，新增片段獨立成一行方便 reviewer 逐欄比對。
- `multi-taxi.service.ts`：只動 `deliverPassengerNotification` 的第一行分流判斷，新增兩個私有方法；`deliverPartnerNotification`、`persistPassengerNotificationOutcome`、legacy 分支一行未改。
- `partner-notification.worker.ts`：沒有修改。它的 bootstrap gate（`transportMode !== "partner_webhook"`）與取件呼叫（`listDuePartnerNotifications`）名稱、語意都沒變，新管道判定完全在 service 層進行，worker 不需要知道。
- `tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport-harness.ts`：唯一改動是替共用的 mock repository 加一個 `resolvePassengerNotificationChannel` mock（回傳這組測試固定使用的夥伴路由），因為 `MultiTaxiService` 現在一定會先呼叫這個方法才能決定要不要轉給 `deliverPartnerNotification`。沒有放寬任何既有斷言。

## Findings／驗收證據

| 具名 acceptance key | 驗證方式與位置 | 結果 |
| --- | --- | --- |
| push-channel-router_resolution_and_no_channel | `tests/unit/push-channel-router-20261006/channel-outcome-decision-table.test.ts`（純函式四態）、`resolve-passenger-notification-channel.repository.test.ts`（兩表 SQL 判定四態）、`deliver-passenger-notification-routing.test.ts`（service 端到端：ambiguous/none/first_party_app 骨架各自落盤正確 status/result/failureReason/retryDisposition，並證明同一列第二次 claim 會被拒絕——不會被重掃；另有併發測試證明兩個呼叫者只有一個能寫入） | 14 tests，全過 |
| push-channel-router_partner_behaviour_unchanged | `deliver-passenger-notification-routing.test.ts` 的 `push-channel-router_partner_behaviour_unchanged` 區塊直接重用 `sr-partner-notify-transport-20260918/transport-harness.ts` 的既有夥伴 harness，驗證有夥伴路由的單仍然呼叫 `resolvePassengerNotificationChannel` 後原樣送到 `deliverPartnerNotification`／`PartnerNotificationTransport`；完整的「送出內容、context、outbox 結果逐位元不變」由同一套 `sr-partner-notify-transport-20260918` 全套回歸（113 tests，含 wire payload allowlist／去重／claim 競爭／governance 等）覆蓋，本 task 沒有放寬其中任何一條斷言 | 全過（見下方指令與計數） |
| 夥伴 Ops 清單不受假待辦影響 | `partner-ops-listing-unaffected.test.ts`：確認 `listPartnerNotificationDeliveries` 的 SQL 仍是對 `COALESCE(ctx.entry_slug, r.entry_slug)` 的純等式比對、沒有 `OR`/`IS NULL`——結構性保證，真正的 Postgres NULL 比對語意留給 PUSH-CHANNEL-PG-QA-20261006 跑真實 DB 驗證 | 過；PG 層級未驗（見下） |

## 檢查紀錄

Node `v22.23.2`。本 VM 僅做 repository 層 lint/typecheck/unit 檢查，沒有啟動 API、DB、preview、browser/receiver server 或 Docker Compose。

環境問題與處理：worktree 的 `node_modules`（經由跨 worktree 的 pnpm 虛擬 store 符號連結）在開工時已經損壞——多個套件（`vitest`、`typescript`、`zod`、`@types/node`、各 `@drts/*` workspace 套件等）的符號連結都指向一個已被 supervisor worktree 清理機制移除的其他 worker worktree。用一支小型 Node 腳本（不用 `pnpm install`／`ln`，只用 `fs.readlinkSync`/`fs.symlinkSync`）把每個失效連結改指到本機 canonical `node_modules/.pnpm` 底下同名同版本的套件，或改指到本 worktree自己的 `packages/*`（workspace 套件原本就該連到本 worktree，不是別的 worktree）。這只修正本機開發工具連結，沒有改任何 git 追蹤的檔案，也沒有跑會動 lockfile 的安裝指令。沿用先前 PUSH-REFERRAL-ASSIGNMENT-EVENT-20261006 文件記錄過的同一類環境問題處理方式。

```bash
# 修好 node_modules 符號連結後：
node <pnpm-store>/typescript@5.9.3/.../tsc -p packages/contracts/tsconfig.json
node <pnpm-store>/typescript@5.9.3/.../tsc -p packages/control-plane-auth/tsconfig.json
# 兩者皆 exit 0（重建 stale dist，否則 apps/api 看不到新型別／既有型別都會報錯）

node <pnpm-store>/typescript@5.9.3/.../tsc -p apps/api/tsconfig.json --noEmit
# exit 0，全 apps/api 零錯誤（含本 task 以外的既有程式碼）

node <pnpm-store>/vitest@4.1.4.../vitest.mjs run \
  tests/unit/push-channel-router-20261006 \
  tests/unit/system-remediation/sr-partner-notify-transport-20260918 \
  tests/unit/system-remediation/sr-push-001 \
  tests/unit/system-remediation/sr-push-durability-20260911 \
  tests/unit/system-remediation/sr-push-webpush-20260915 \
  tests/unit/push-first-party-registry-20261006 \
  tests/unit/push-channel-sd-20261006 \
  tests/unit/push-referral-assignment-event-20261006 \
  tests/unit/system-remediation/sr-partner-notify-route-20260917 \
  apps/api/tests/unit/multi-taxi.repository.test.ts \
  apps/api/tests/unit/multi-taxi.service.test.ts \
  apps/api/tests/unit/multi-taxi.controller.test.ts \
  apps/api/tests/unit/passenger-push-devices.repository.test.ts \
  apps/api/tests/unit/multi-taxi-passenger-authority.test.ts \
  apps/api/tests/unit/multi-taxi-controlled-export.test.ts \
  apps/api/tests/unit/multi-taxi-rating-read-contract.test.ts
# exit 0: Test Files 24 passed | 1 skipped (25); Tests 264 passed | 7 skipped (271)
# 唯一 skipped 檔是 transport.postgres.test.ts（describe.skipIf(!DATABASE_URL)，本來就是 opt-in 外部 PG gate）

node <eslint-store>/eslint/bin/eslint.js \
  apps/api/src/modules/multi-taxi/multi-taxi.repository.ts \
  apps/api/src/modules/multi-taxi/multi-taxi.service.ts \
  apps/api/src/modules/multi-taxi/passenger-notification-channel-router.ts \
  tests/unit/push-channel-router-20261006 \
  tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport-harness.ts \
  --max-warnings=0
# exit 0
```

## 未驗項與限制

- 兩張路由快照表的真實 Postgres 查詢（`to_jsonb` 子查詢、NULL 比對語意、`listPartnerNotificationDeliveries` 對無路由單的真實排除效果）沒有在真實 PG 上跑過；單元測試用 mock `query()` 驗證 SQL 文字與分支邏輯，不是執行語意證明。留給 PUSH-CHANNEL-PG-QA-20261006。
- `first_party_app` 分支目前在正式環境無法被觸發（沒有任何 writer 會寫 `mobility.phase1_order_first_party_notification_routes`），本 task 的測試是對這個狀態空間的邏輯覆蓋，不是對真實第一方叫車流程的驗證——那個流程本波本來就不存在（D8）。
- 沒有啟動 API、DB、browser 或任何伺服器；沒有對任何真實裝置或外部端點送出推播。

## 候選與交接

分支 `claude/push-channel-router-20261006`，base `dev`（已含 SD/ASSIGNMENT-EVENT/FIRST-PARTY-REGISTRY）。owner 完成實作與上述檢查後以 `CANDIDATE_SHA=$(git rev-parse HEAD)` / `CANDIDATE_BRANCH=$(git branch --show-current)` 交給 reviewer Codex2；不自行宣告 `done`。此文件提交時，同 SHA 的 hosted CI／review／merge／acceptance 證據尚待 candidate lifecycle 記錄，本地檢查不取代它們。
