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
- `claimPartnerNotification` 的 disposition 檢查同步加上 `payload.channelRouting` 的 fallback。**訂正（R2，見下方退修矩陣）**：這段原本寫「防禦性，實際上不會被叫到同一列」——錯誤；`listDuePartnerNotifications` 的舊 `COALESCE` 順序會被舊的夥伴 automatic 狀態蓋過，讓已封存的列重新進入候選集合，`claimPartnerNotification` 因此真的會被同一列叫到。兩處的 `channelRouting` 優先序已同步修正為最高優先。

### 夥伴 Ops 清單（R4 訂正前的原始段落，保留存檔）

- ~~沒有修改 `listPartnerNotificationDeliveries`。`no_notification_channel`／`ambiguous` 的單既沒有 `mobility.phase1_order_partner_notification_routes` 列也沒有 `mobility.phase1_partner_notification_delivery_contexts` 列，`COALESCE(ctx.entry_slug, r.entry_slug)` 對它永遠是 SQL NULL，不可能等於任何具體 `entrySlug`——結構性保證，不是本 task 新加的邏輯。~~
- **訂正（Codex2 R4，2026-10-07T09:26:43Z reopen）**：上一段對 `ambiguous` 的陳述錯誤。D2 定義 `ambiguous` 正是「夥伴與第一方兩張路由快照同時存在」，所以 `mobility.phase1_order_partner_notification_routes` 這張表**一定有列**，只有 `mobility.phase1_partner_notification_delivery_contexts`（ctx）沒有列（因為 `deliverNonPartnerChannelOutcome` 從不呼叫 `preparePartnerNotificationContext`）。`COALESCE(ctx.entry_slug, r.entry_slug)` 因此會落到 `r.entry_slug`，這張單**會**出現在對應 partner 的 Ops 清單裡——只有真正兩張表都沒有列的 `none`（電話／語音／企業派車）才會被結構性排除。見下方「R4 退修」。

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

## R1–R4 退修與驗證（Codex2 第二輪 reopen，2026-10-07T09:26:43Z）

R2/R3/R4 在候選 `6c48ea7d5`（第一輪 reopen 2026-10-07T09:19:24Z）與 `bc27018a3`（第二輪 reopen，同一缺陷連續第二次未解）兩個相鄰獨立 review 都未消除，依 AI_COLLABORATION_GUIDE.md §0.7「同一缺陷連續兩輪退修」處理：本輪先定位每項 finding 的精確觸發與修正邊界，再做最小、可獨立驗證的修復單元。R1 的 mock 型別修復已在 `bc27018a3` 完成，本輪不重複處理，只驗證其同 SHA CI 結果（見下）。

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R1 CI typecheck（已於 `bc27018a3` 修復，本輪僅覆核） | `tests/unit/push-channel-router-20261006/deliver-passenger-notification-routing.test.ts:21,65` 已將 `claimPartnerNotification` mock 改為 `vi.fn<MultiTaxiRepository["claimPartnerNotification"]>` | 修復前 3 處呼叫因 mock 推斷為 0 參數函式而 TS2554；修復後型別與真實簽章一致 | 本輪 `pnpm --filter @drts/api exec tsc --noEmit -p tsconfig.json`：exit 0，apps/api 零錯誤（需先 `pnpm --filter @drts/contracts build` 與 `pnpm --filter @drts/control-plane-auth build` 重建過期 dist，否則會出現與本改動無關的假 TS2305/TS2367——同本文件先前記錄的 stale-dist 環境問題）；`pnpm typecheck:root` 僅剩與本 task 無關的既有環境問題（`@drts/tenant-auth` 模組解析、`packages/api-client` 跨 worktree 重複套件身分），確認不在本次 diff 範圍（`git diff --stat` 僅觸及 `multi-taxi.repository.ts` 與新測試檔） | 同 SHA hosted CI 的 Typecheck/Unit 在上一輪 review 讀取時仍在跑；本輪未重新觸發 hosted CI（沿用候選生命週期，由新 handoff 觸發） |
| R2 `push-channel-router_resolution_and_no_channel`：路由器已封存的 `manual_only`/`none` 判定被舊的夥伴 automatic 狀態蓋過，導致 ambiguous 單持續被自動重試 | `multi-taxi.repository.ts`：`listDuePartnerNotifications` 的 `COALESCE` 把 `payload.channelRouting.retryDisposition` 移到最前（原本排最後，被 `context.retry_disposition`／`payload.partnerNotification.retryDisposition` 蓋過）；`claimPartnerNotification` 的 disposition 判斷同步改成 `channelMetadata?.retryDisposition ?? context... ?? metadata...`；`retryPartnerNotificationDelivery` 在落盤前 `delete newPayload.channelRouting`，讓「一次性手動重試」真的清掉舊封存，若下一輪仍判定 ambiguous/none，`deliverNonPartnerChannelOutcome`→`recordPushDeliveryOutcome` 會重新封存，依新的 COALESCE 順序再次擋下 | 新增 `tests/unit/push-channel-router-20261006/channel-stop-authority.test.ts`：對真實 `MultiTaxiRepository`（非重寫的 service 層 mock）直接呼叫 `claimPartnerNotification`，餵入「`payload.channelRouting.retryDisposition='manual_only'` 同時 `payload.partnerNotification.retryDisposition='automatic'` 且 DB context 列 `retry_disposition='automatic'`」兩種衝突狀態疊加——修復前（還原 COALESCE 順序手動驗證）會 CLAIMED；修復後 `result` 為 `null` 且從未呼叫 claim INSERT。另一測試證明「沒有 `channelRouting` 的一般夥伴 automatic 單」仍正常 claim（夥伴行為不變）。第三個測試對 `retryPartnerNotificationDelivery` 走完整的既有閘門（route/relevance/ctx 皆走真實 repository 方法，只 mock DB 回應），驗證落盤的兩次 `payload` UPDATE 都不含 `channelRouting` 鍵 | `pnpm exec vitest run tests/unit/push-channel-router-20261006/channel-stop-authority.test.ts`：exit 0，6/6 通過；`pnpm exec vitest run tests/unit/push-channel-router-20261006 tests/unit/system-remediation/sr-partner-notify-transport-20260918 tests/unit/system-remediation/sr-partner-notify-route-20260917`：exit 0，164 passed / 7 skipped（7 個 skip 是既有 opt-in PG 測試，非本輪新增）；`pnpm --filter @drts/api exec vitest run tests/unit/multi-taxi.repository.test.ts tests/unit/multi-taxi.service.test.ts tests/unit/multi-taxi.controller.test.ts tests/unit/multi-taxi-rating-read-contract.test.ts tests/unit/multi-taxi-passenger-authority.test.ts tests/unit/multi-taxi-controlled-export.test.ts tests/unit/passenger-push-devices.repository.test.ts`：exit 0，96/96 通過，證明既有夥伴/評分/裝置回歸未受影響 | DB 回應仍是 mock，JSONB path（`payload->'channelRouting'->>'retryDisposition'`）本身的 PG 執行語意未跑；真正的 PG 併發（同一單先被手動重試又同時被背景輪詢 claim）留給 PUSH-CHANNEL-PG-QA-20261006 |
| R3 `recordPushDeliveryOutcome` 的鎖序對 channel-only 結果反轉，有死結風險 | `multi-taxi.repository.ts`：第 996 行附近 `if (input.partnerMetadata)` 改成 `if (fencedClaim)`（`fencedClaim` 本就是 `Boolean(input.partnerMetadata || input.channelMetadata)`，原本只用來放寬 claim 列的 `FOR UPDATE` 條件，沒有同步放寬這個早期 outbox 預鎖），讓 channel-only 結果也先鎖 outbox 再鎖 claim，跟 `claimPartnerNotification` 與既有夥伴路徑同序 | 新測試對真實 `recordPushDeliveryOutcome` 只傳 `channelMetadata`（不傳 `partnerMetadata`）：修復前第一個真正鎖查詢是 claims 表的 `SELECT fence_token ... FOR UPDATE`（`sql[1]` 含 `"SELECT fence_token"`）；修復後 `sql[1]` 精確等於與 `claimPartnerNotification`／既有夥伴路徑相同的 `"SELECT outbox_id FROM ops.consumer_notification_outbox WHERE outbox_id=$1 FOR UPDATE"` 字面字串，claims 表鎖查詢退到 `sql[2]` | 同一份 `channel-stop-authority.test.ts`：`push-channel-router R3` 區塊，exit 0 隨上方整批一起跑 | 沒有真的啟動兩個 PG 連線重現死結（本 VM 不跑 DB／Docker）；本修復是把既有「outbox before claim」鎖序規則套用到原本漏掉的分支，不是新發明一套鎖協定。真正的兩連線 lease-expiry race 留給既有授權的 hosted PG QA 任務 |
| R4 `listPartnerNotificationDeliveries` 看不到 ambiguous 單的真實 failureReason/retryDisposition，Ops 無法重試 | `multi-taxi.repository.ts`：SELECT 投影的 7 個 `COALESCE`（`expiresAt`／`deliveryTarget`／`deliveryStage`／`retryDisposition`／`failureReason`／`receiptId`／`downstreamStatus`）都加上 `o.payload->'channelRouting'->>'<field>'` 第三個 fallback；`result` 的 `CASE` 把 `'no_notification_channel'` 併入 `provider_not_configured` 分支。沒有動 `WHERE`／`JOIN`，排除 `none`（真正無管道）單的結構性保證（R4 訂正段落解釋的 `r.entry_slug` 恆為 NULL）維持不變 | 新測試對真實 `listPartnerNotificationDeliveries` 餵入一筆模擬「PG 已正確求值 COALESCE」後的 ambiguous 列（`retryDisposition:'manual_only'`、`failureReason:'route_ambiguous'`），確認回傳物件如實映射；另外對送進 `query()` 的實際 SQL 文字做靜態比對，確認 7 個欄位都新增了 `channelRouting` fallback、`result` CASE 含 `'no_notification_channel'`，且 `WHERE` 仍是 `COALESCE(ctx.entry_slug, r.entry_slug) = $1` 這個精確等式（沒有放寬排除條件） | 同一份 `channel-stop-authority.test.ts`：`R4` 區塊，exit 0 隨上方整批一起跑 | 這是 SQL 文字 + JS 映射層驗證，不是 JSONB path 在真實 PG 上的求值證明（test 本身在檔頭註解中明講這個限制）；真正跑一筆 ambiguous 單進這支 SQL、核對回傳欄位，留給 PUSH-CHANNEL-PG-QA-20261006 |

驗收對應：`push-channel-router_resolution_and_no_channel`——R2/R3/R4 的程式碼修復與 repository 層回歸均已完成並通過；`push-channel-router_partner_behaviour_unchanged`——以上所有既有夥伴回歸套件（`sr-partner-notify-transport-20260918` 113 tests 等）全過，新增的「無 channelRouting 夥伴 automatic 單仍正常 claim」測試額外鎖住這條不變量。PG 層級的 JSONB 求值與併發語意兩項仍明確留給 PUSH-CHANNEL-PG-QA-20261006，不在此宣告為已驗證。

## R4 第三輪退修（Codex2 2026-10-07T10:03:31Z reopen，候選 `2bd04d18a`）

`2bd04d18a` 修的是「全新 ambiguous 單」子案例（`listPartnerNotificationDeliveries` 的 7 個 COALESCE 把 `channelRouting` 排進第三個 fallback 分支），但遺留了上一輪 review 就點名、這輪 reviewer 再次確認未解的既有狀態優先序 bug：COALESCE 只在前面分支是 SQL NULL 時才會往下找，而 `PassengerNotificationChannelMetadata` 的 `deliveryTarget`/`deliveryStage`/`receiptId` 依型別定義本來就是常值 `null`（見本文件「D3/D6 決策表」一節、`multi-taxi.repository.ts` 的 `PassengerNotificationChannelMetadata` 介面）——`o.payload->'channelRouting'->>'deliveryTarget'` 求值永遠是 NULL，COALESCE 一律跳過它，落到 `ctx`/`payload.partnerNotification` 殘留的舊夥伴值。`retryDisposition`/`failureReason`/`downstreamStatus` 雖然通常非 null，但只要 ctx 或 `payload.partnerNotification` 也非 null（R4 情境：手動重試清封存→真實路由服務再次判定 ambiguous 並重新封存，殘留的舊 `partnerNotification.retryDisposition='automatic'`／ctx 的舊 `failure_reason` 仍在），COALESCE 的「前面非 null 就贏」語意一樣會選到舊值而非新封存值——這正是本輪 reviewer 用可執行 production-function probe（`claimPartnerNotification`／`recordPushDeliveryOutcome` 真實方法，mock DB I/O）重現並記錄在 reopen 訊息裡的具體路徑。

### 根因與修正邊界

把第三個 COALESCE 分支改成條件式互斥：用 `o.payload ? 'channelRouting'`（jsonb 鍵存在性判斷，不是值判斷）測出這一列是否已被路由器封存過；封存了就唯一信任 `payload.channelRouting` 自己的 7 個欄位（含其刻意為 `null` 的欄位），完全不再碰 `ctx`/`payload.partnerNotification`；沒封存才落回原本的 `COALESCE(ctx.x, payload.partnerNotification->>'x')` 兩段式，夥伴既有行為逐位元不變。`result` 的 `CASE` 同步改成讀同一個互斥判斷算出的 `failureReason`，不再用舊的三段 `COALESCE`。

- `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts:1834-1875`（`listPartnerNotificationDeliveries` 的 SELECT 投影）：7 個欄位（`expiresAt`/`deliveryTarget`/`deliveryStage`/`retryDisposition`/`failureReason`/`receiptId`/`downstreamStatus`）与 `result` 的 CASE 全部改成 `CASE WHEN o.payload ? 'channelRouting' THEN <channelRouting 欄位> ELSE COALESCE(ctx.<col>, payload.partnerNotification->>'<field>') END`。`WHERE`／`JOIN`／scoping 一行未動，`none`（真正無管道）單的結構性排除保證不受影響。
- 没有改 `listDuePartnerNotifications`／`claimPartnerNotification`（R2 已修好且本輪沒退修），也沒有改 `maxAttempts` 投影（`channelRouting` metadata 本來就沒有這個欄位，三段式不適用）。

### 驗證

新增 `tests/unit/push-channel-router-20261006/channel-stop-authority.test.ts` 兩個測試（原有 R4 測試保留，擴充其靜態 SQL 斷言；新增一個場景測試）：

1. 既有 R4 測試：把斷言從「SQL 文字含有 `channelRouting` 第三分支」改成逐欄位 regex 比對完整的 `CASE WHEN o.payload ? 'channelRouting' THEN ... ELSE COALESCE(ctx.x, partnerNotification) END` 結構（含 `expiresAt` 的 timestamptz cast 與 `result` CASE 的巢狀 CASE），確認不是簡單地把 `channelRouting` 接在 COALESCE 尾端。
2. 新增「`listPartnerNotificationDeliveries` 在既有 stale ctx/partnerNotification 之上信任封存值，包含封存欄位刻意為 null 的情況」：餵入 reviewer reopen 訊息描述的確切殘留狀態（新 `channelRouting` 已封存 `ambiguous`/`manual_only`，舊 `partnerNotification.retryDisposition='automatic'`／`ctx.failure_reason='endpoint_disabled'` 仍在），斷言回傳值 `retryDisposition:'manual_only'`、`failureReason:'route_ambiguous'`、`deliveryTarget/deliveryStage/receiptId: null`，並斷言產生的 SQL 不再含舊的三段式 `COALESCE(ctx.x, partnerNotification, channelRouting)` 模式。

```bash
pnpm exec vitest run tests/unit/push-channel-router-20261006 --maxWorkers=2
# exit 0: Test Files 5 passed (5); Tests 21 passed (21)（原 19 + 本輪新增 2）

pnpm exec vitest run tests/unit/push-channel-router-20261006 \
  tests/unit/system-remediation/sr-partner-notify-transport-20260918 \
  tests/unit/system-remediation/sr-partner-notify-route-20260917 --maxWorkers=2
# exit 0: Test Files 15 passed | 1 skipped (16); Tests 165 passed | 7 skipped (172)
# （上一輪 reviewer 記錄為 164 passed；+1 淨增，因本輪只新增測試、未刪除任何既有測試）

pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build
# 兩者 exit 0（重建 reviewer 與前兩輪 owner 都記錄過的 stale dist，否則 apps/api typecheck 會出現與本改動無關的假錯誤）

cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit
# exit 0，apps/api 零錯誤

pnpm exec eslint apps/api/src/modules/multi-taxi/multi-taxi.repository.ts \
  tests/unit/push-channel-router-20261006/channel-stop-authority.test.ts --max-warnings=0
# exit 0
```

未驗項與限制（與前三輪一致，本輪沒有新增未驗項）：這仍是對 `query()` 送出的 SQL 文字 + mock 回應的 JS 映射驗證，不是 PG 對 `o.payload ? 'channelRouting'`／巢狀 `CASE`/JSONB path 的真實求值證明；真正跑一筆帶殘留夥伴狀態的 ambiguous 單進這支 SQL、核對 PG 實際回傳欄位，留給 `PUSH-CHANNEL-PG-QA-20261006`。本輪沒有啟動 API、DB、browser 或任何伺服器，沒有對外部端點送出推播。

驗收對應：`push-channel-router_resolution_and_no_channel`——R4 的既有狀態優先序 bug（本輪 reviewer reopen 的唯一 remaining finding）已修正並通過上述回歸；R1-R3 維持上一輪已解決的狀態，未退修。`push-channel-router_partner_behaviour_unchanged`——`sr-partner-notify-transport-20260918` 全套（113 tests）與既有夥伴回歸一併重跑，全過，確認沒有夥伴行為被本輪改動影響。完整生命週期 acceptance／approval 仍待新 candidate 的 CI 與 reviewer 核實，本地檢查不取代它們。

## 候選與交接

分支 `claude/push-channel-router-20261006`，base `dev`（已含 SD/ASSIGNMENT-EVENT/FIRST-PARTY-REGISTRY）。owner 完成實作與上述檢查後以 `CANDIDATE_SHA=$(git rev-parse HEAD)` / `CANDIDATE_BRANCH=$(git branch --show-current)` 交給 reviewer Codex2；不自行宣告 `done`。此文件提交時，同 SHA 的 hosted CI／review／merge／acceptance 證據尚待 candidate lifecycle 記錄，本地檢查不取代它們。
