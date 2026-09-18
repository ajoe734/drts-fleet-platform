# SR-PARTNER-NOTIFY-ACK-20260917 — 夥伴回執驗證與單次派送 façade

- Owner: Claude；Reviewer: Gemini2。
- Branch: `claude/sr-partner-notify-ack-20260917`，base `origin/dev`（含已合併的 `SR-PARTNER-NOTIFY-CON-20260917`，commit `914d72009`）。
- 來源設計：`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` §7（delivered 的正式定義）、§8（重用 dispatch，但只能有一個自動重試 owner）。
- 最終 candidate SHA 由下列 handoff 寫入 task machine truth（文件不包含自身 commit hash）。

## 範圍界線（本次刻意不做的事）

- 不實作 transport（`multi-taxi/partner-notification.transport.ts`、`PassengerPushTransport`）、不改 multi-taxi DI（`multi-taxi.module.ts`）、不碰 consumer notification outbox 狀態機（claim/fence/receipt transaction 留給未來 consumer owner 任務）。
- 不新增 entry notification binding 的 governance service/repository/controller（§12 程式異動清單的另一列，非本任務範圍）；因此 façade 目前只做「endpoint 存在、屬於此 tenant、狀態 active、訂閱此事件、密鑰可用」的檢查，尚未有 binding `test_pending → ready` 這一層（binding 表本身尚未建立，§11 migration 範圍另計）。
- 不新增 HTTP SSRF 加固（redirect 攔截、private/loopback/link-local/metadata 位址封鎖）：§8 明文「這是本案接收端可配置所需的派送門檻，不宣稱現有 transport 已全部具備」，既有 `webhook-dispatch.service.ts` 本來就沒有這層，本次也未新增或聲稱已具備，留待未來子任務。

## 交付一：webhook-dispatch.service.ts 的 opt-in `partner_ack_v1` 回執模式

- `WebhookFetch` 從 `Pick<Response, "ok" | "status">` 擴充為 `Pick<Response, "ok" | "status"> & Partial<Pick<Response, "text">>`：`text` 是可選欄位，既有只回傳 `{ ok, status }` 的 WEBHOOK_FETCH mock／注入完全不用改就仍然合法賦值給新型別；真實 `fetch()` 回傳的 `Response` 本來就有 `text()`，原生相容。
- `WebhookDispatchAttemptCommand` 新增可選欄位 `partnerAckV1?: { mode: "partner_ack_v1"; expected: { notificationId, deliveryId, partnerEntrySlug } }`；未帶這個欄位時（既有所有呼叫端），程式碼路徑完全不變——`dispatchAttempt()` 只有在 `command.partnerAckV1` 存在時才呼叫新增的私有方法 `readPartnerAckV1()`，一般 tenant webhook 一律維持 status-only、不讀 body。
- `readPartnerAckV1()` 只在 httpStatus 屬於 `{200,201,202}` 時才嘗試讀 body；204／其他狀態一律 `http_status_not_eligible`（不讀 body）。讀 body 發生在 `finally { clearTimeout(timeoutTimer) }` 之前、同一個 `AbortController` 仍存活的視窗內，因此天生受同一個既有 10 秒逾時界限保護（逾時觸發 `controller.abort()` 會讓仍在進行中的 `response.text()` reject，被捕捉為 `read_aborted`，不是未捕捉例外）。讀到的 text 先做 `Buffer.byteLength(text,'utf8') > PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES`（4096，值來自 `@drts/contracts` 既有常數，不重複定義 magic number）超界判 `body_too_large`；再 `JSON.parse`，非 JSON（含 HTML 200）判 `not_json`；`notification_id`／`delivery_id`／`partner_entry_slug` 三者都必須與呼叫端提供的 `expected` 完全相等，任一不符判 `id_mismatch`；`status` 必須是 `accepted` 或 `duplicate`，其餘判 `status_invalid`；`receipt_id` 必須是非空字串，否則 `receipt_missing`。全部通過才回傳 `{ kind: "accepted", ack: { ..., receiptId: body.receipt_id } }`——`receiptId` 永遠是解析出的欄位值本身，程式碼中沒有任何 `receipt-${...}` 或其他樣式的合成路徑。
- `WebhookDispatchAttemptResult` 新增可選欄位 `partnerAckV1`，只在 command 有帶 `partnerAckV1` 時才會出現在回傳值上（用 conditional spread，不是 `undefined` 字面賦值，滿足 repo 既有的 `exactOptionalPropertyTypes: true`）。既有的 `status`／`httpStatus`／`queued`/`delivered`/`delivery_failed` 分類邏輯完全未改動——ack 驗證是額外資訊，不會反過來改變 transport 層自己的 delivered/failed 判斷（業務語意的重新分類留給 §8 façade 做，見下）。

## 交付二：`dispatchNotificationAttemptByWebhookId` 窄 façade

新檔 `apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade.ts` 匯出 `PartnerNotificationDispatchFacade`，唯一方法 `dispatchNotificationAttemptByWebhookId(command)` 委派到 `TenantPartnerService.dispatchPartnerNotificationAttempt()`（新增的 public 方法）。委派給既有的 `TenantPartnerService` 而非在 façade 內重寫端點查找／密鑰輪替／到期檢查，是因為這些狀態與私有方法（`requireWebhookEndpoint`／`resolveWebhookSecretMaterial`／`reconcileStoredWebhookEndpoint`／`enqueueWebhookDelivery`）目前只存在於該 service 的記憶體模型內（`TenantPartnerRepository` 只做持久化 upsert，沒有查詢/業務邏輯），在別處重寫等於複製一份容易與 C112 既有回歸測試行為漂移的平行邏輯；因此選擇「reuse dispatch」而非「重造一份」。

`TenantPartnerService.dispatchPartnerNotificationAttempt(command)` 依序：

1. `requireWebhookEndpoint(tenantId, webhookId)`——精準以 `(tenantId, webhookId)` 查找，非任何 tenant-wide event 掃描；找不到丟 `ApiRequestError(404, WEBHOOK_NOT_FOUND)`。tenant 歸屬檢查即是查找條件本身的一部分（caller 傳入的 `tenantId` 必須與 endpoint 一致才查得到）。
2. 狀態檢查：`disabled` → typed failure `endpoint_disabled`；非 `active`（目前只可能是 `test_pending`，binding governance 尚未存在）→ `configuration_blocked`；事件不在 `endpoint.events` 允許清單 → `configuration_blocked`。
3. `expiresAt` 已過期（`wirePayload.data.expiresAt <= now`，只有非 test payload 才有這個欄位）→ typed failure `notification_expired`（terminal），**完全不發出 HTTP attempt**。
4. `enqueueWebhookDelivery(endpoint, event, now, "partner_notification_dispatch", wirePayload.deliveryId)`：deliveryId 是呼叫端凍結的邏輯投遞 id；同一 deliveryId 重複呼叫會拿回同一個 `StoredWebhookDelivery`（既有既有邏輯本來就是「查到就回傳既有那筆，不重建」），這是後面 §8 dedup 的關鍵前提。
5. 密鑰可用性預檢（`resolveWebhookSecretMaterial` 必須是 `active`／`overlap_active`）→ 不可用時 typed failure `credential_rejected`，不消耗一次真實 HTTP attempt。
6. 呼叫既有私有方法 `dispatchWebhookAttempt(endpoint, delivery, wirePayload, { forceSingleAttempt: true, partnerAckV1: {...} })`——同一支程式碼路徑同時服務一般 tenant webhook（`sendTestWebhook`／`publishWebhookEvent`，不帶 `options`）與本 façade（帶 `options`），只有一次真正的 `WebhookDispatchService.dispatchAttempt()` 呼叫。
7. `classifyPartnerNotificationDispatchResult(result)` 把 transport 層結果轉成 contract 的 `PartnerNotificationDispatchOutcome`：`delivered` 且 ack `accepted`/`duplicate` → `{kind:"accepted", ack}`；`delivered` 但 ack 驗證失敗（204／HTML／id 不符／缺 receipt）→ `partner_ack_invalid` / `manual_only`；401/403 → `credential_rejected` / `configuration_blocked`；404/410 → `endpoint_unavailable` / `configuration_blocked`；其餘（408/429/5xx/逾時等）→ `provider_transient_error` / `automatic`，`suggestedNextAttemptAt` 直接取用 `WebhookDispatchService` 已經用 endpoint 核准 retryPolicy snapshot 算出的 `result.nextAttemptAt`（見下一段，不另外重算一套邏輯）。

### 「只能有一個自動重試 owner」怎麼落實（含一次踩到的設計錯誤與修正）

第一版實作把 `retryPolicy.maxAttempts` 強制覆寫成 `attemptNumber`，用意是讓 `WebhookDispatchService` 永遠回報 terminal 狀態（避免內部 `scheduleWebhookRetry` 計時器被觸發）。寫完新增測試後發現這是**錯的**：這樣會讓任何一次暫時性失敗（例如單次 503）在 `delivery.attempt` 還只有 1 的時候就被分類成 `delivery_failed`，直接觸發既有 `applyWebhookPostDispatchPolicy()` 的「立即停用 endpoint」分支——等於一次暫時性錯誤就把共用的 tenant webhook 停用，且與 task brief 明文「最終失敗的 endpoint 計數須依 logical delivery 去重，不得由每次 attempt 重複觸發停用」直接矛盾。

修正：`retryPolicy` 一律傳未經竄改的 `endpoint.retryPolicy`（真正核准的 policy snapshot），讓 `queued`／`delivery_failed` 分類、`nextAttemptAt` 計算、`failedDeliveryCount` dedup 全部沿用既有、已被 C112 回歸覆蓋的邏輯；改成只在「是否呼叫 `scheduleWebhookRetry()`」這一個分支上用 `forceSingleAttempt` 擋掉——即使 `WebhookDispatchService` 判斷這次還可以再排一次自動重試（`status === "queued"`），本 façade 路徑也絕不啟動既有 tenant 內部計時器；`clearWebhookRetry()` 仍照常呼叫（冪等的清理動作，不是新計時器）。這樣「同一個邏輯 delivery 連續打到耗盡 `maxAttempts` 才失敗計數 +1、之後再打也不會重複 +1」與「façade 自己絕不排程下一次」兩者同時成立，且不需要重複實作一套獨立的 backoff 計算（`suggestedNextAttemptAt` 直接讀 `WebhookDispatchService` 用同一份 policy 算出的 `nextAttemptAt`）。

## 測試

新增 `tests/unit/system-remediation/sr-partner-notify-ack-20260917/`：

- `webhook-dispatch-partner-ack-v1.test.ts`（14 tests）：純 `WebhookDispatchService` 單元測試，涵蓋一般 tenant webhook 在未 opt-in 時完全不呼叫 `text()`（即使 mock 有提供）且既有 `queued`/`delivered` 分類不變；opt-in 後對 `accepted`/`duplicate`、204、空 body、HTML 200、id 不符、缺 receipt、狀態值不合法、超過 4KiB、沒有 `text()` reader 的舊式 mock、讀取中拋例外（模擬逾時 abort）、非 2xx-eligible 狀態不讀 body 等情境逐一驗證；並明確斷言 `receiptId` 不符合 `receipt-` 開頭的合成樣式。
- `partner-notification-dispatch-facade.test.ts`（13 tests）：直接建構真正的 `TenantPartnerService` + `PartnerNotificationDispatchFacade`（用 `WEBHOOK_FETCH` mock 換掉底層 transport，不 mock `TenantPartnerService` 自身任何方法），涵蓋：成功 ack、ack 驗證失敗分類、401/403、404/410、503（含「單次 503 不得停用 endpoint」的迴歸）、façade 從不自行排程第二次 HTTP attempt（等待後 fetch 呼叫次數不變）、**exhaustion dedup**（同一 deliveryId 連續呼叫到耗盡 `maxAttempts` 才 `failedDeliveryCount` +1，之後再打也不會再 +1，且耗盡前每次都停在 `active`／`failedDeliveryCount=0`）、通知已過期時完全不發 HTTP、事件不在訂閱清單時完全不發 HTTP、`disabled`／`test_pending` endpoint 完全不發 HTTP、查無此 webhookId 丟 `ApiRequestError`、以及 outcome 序列化後絕不包含簽章密鑰明文。

### 本次實際執行指令與結果（本 worktree：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-partner-notify-ack-20260917`）

| 指令                                                                                                                                                      | 結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/contracts build`                                                                                                                     | 0 — 無錯誤                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm --filter @drts/api typecheck`                                                                                                                       | 0 — 無錯誤（`tsc --noEmit` 全綠，含新增的 `exactOptionalPropertyTypes` 修正）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `npx vitest run tests/unit/system-remediation/sr-partner-notify-ack-20260917/`                                                                            | 0 — 2 files / 27 tests passed（新增測試）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `npx vitest run tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts`                                                                | 0 — 1 file / 34 tests passed（C111–C115，required acceptance key `existing_tenant_webhook_status_only_behaviour_regressed_green`）                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `npx vitest run tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/ tests/unit/system-remediation/sr-webhook-transport-timeout-20260911/` | 0 — 2 files / 10 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `npx vitest run tests/unit/` （全量 `tests/unit/**`）                                                                                                     | 308 files passed / 4 files failed（3271 tests passed, 22 skipped, 3 tests failed）——失敗的 4 個檔案（`db-apply.test.ts`、`sr-qa-concurrency-001/*`、`sr-qa-dispatch-001/*`）全部是本機沒有 Postgres/docker 造成的既有環境缺口，與本次改動的檔案（`webhook-dispatch.service.ts`／`tenant-partner.service.ts`／`tenant-partner.module.ts`／新增的 façade／測試）無關；用 `grep -l "dispatch-reservation-concurrency\|db-apply\|dispatch-db-persistence"` 核對失敗訊息，皆是 `CONCURRENCY_TEST_DATABASE_URL`／`service "postgres" is not running`，不涉及本次程式碼路徑。 |

本機環境備註：本 worktree 啟動時共用 `node_modules`（跨 worktree symlink）已因另一個已被 supervisor 回收的 sibling worktree（`gemini2-sr-partner-notify-con-20260917`）而失效（`typescript`／`zod` 等套件連結全部指向已刪除路徑）；用 `CI=true pnpm install --offline --prefer-offline` 在本機 pnpm store 內離線重新連結修復（未觸發任何網路安裝），修復後 `@drts/contracts`／`@drts/control-plane-auth` 皆可正常 build，`@drts/api typecheck` 干淨。此為既有環境問題，不是本次程式碼改動造成。

## 未做的部分（明列，不冒充成功）

- 未落地 entry notification binding 的 `test_pending → ready` 治理層（binding 表尚未建立，見 §11／§12，非本任務範圍）；因此 façade 目前把「endpoint 是否可即時派送」簡化為「webhook endpoint 本身狀態 active + 事件在允許清單」，尚未接上 binding 專屬的 readiness gate。未來 binding 任務接上後，預期只需要在本 façade 的第 2 步再加一個 binding-state 檢查，不需要改動已經完成的 ack 驗證與單次派送邏輯。
- 未新增 §8 提到的 HTTP security 加固（不跟隨 redirect、封鎖 private/loopback/link-local/metadata 位址、DNS rebind 防護）：本任務範圍明確只涵蓋回執驗證與單次派送 façade 兩件事，這層加固既有程式碼本來就沒有，設計文件本身也註明「不宣稱現有 transport 已全部具備」；未在本次新增，避免範圍外變更。
- 4 KiB body 上限是讀取後（`response.text()` 完成後）才量測位元組數再判定，不是串流層級即時截斷；在真實 `fetch()`／`undici` 下，一個惡意回應理論上可以先讓 `text()` 完整讀完再被本函式拒絕，而不是提前中止讀取。這符合本任務對「驗證條件」的要求（超界一律判失敗，不算成功），但不是傳輸層的流量保護；若未來需要真正的串流上限保護，需要另開子任務改用 `response.body` reader 逐塊累加並提前 abort。

## Candidate handoff

實作與測試完成、commit 並普通 push 後，使用：

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Claude /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh \
  handoff SR-PARTNER-NOTIFY-ACK-20260917 Gemini2 "opt-in partner_ack_v1 回執驗證（4KiB/10s deadline 內，受 exactOptionalPropertyTypes 保護）＋ dispatchNotificationAttemptByWebhookId 窄 façade（單次 attempt、不新增 tenant 重試計時器、失敗計數依 logical delivery 去重）；typecheck 乾淨；C111-C115＋既有 webhook 回歸全綠；新增 27 個單元測試"
```

精確 candidate SHA、branch、reviewer 與 state 以同一 release 的 `ai-status.sh show SR-PARTNER-NOTIFY-ACK-20260917` 讀回。owner 不寫 `done`；獨立 review、CI 及 merge 皆尚待 lifecycle 完成。
