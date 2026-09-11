# SR-WEBHOOK-TRANSPORT-TIMEOUT-20260911 — Webhook transport 逾時界限與 hosted receiver 驗證

- Owner: Claude2；independent reviewer: Claude。
- Branch: `claude/sr-webhook-transport-timeout-20260911`。
- Base：`git fetch origin` 後的 `origin/dev` HEAD `e2e17cb8d0465f203d788b2301476abb75b811a8`。
- Parent：`SR-QA-WEBHOOK-001`；source candidate（本 task 的問題來源）`26eff448abee9f5a14f482e8e42a84e73cda57bc`。
- 最終 candidate SHA 由下列 handoff 寫入 task machine truth（文件不能包含自身 commit hash）。

## 目前基準重現與來源

Root 已驗證的 immutable QA candidate `26eff448abee9f5a14f482e8e42a84e73cda57bc`：`WebhookDispatchService.dispatchAttempt()`（`apps/api/src/modules/tenant-partner/webhook-dispatch.service.ts`）呼叫 `fetch()` 時完全沒有 `AbortSignal`／逾時界限，任何不回應的 tenant endpoint 會讓該次 attempt 永久掛起。C112-3 先前的「驗證」只是在測試層外包了一個自己的 150ms `AbortController` wrapper，等於驗證了 wrapper 自己會逾時，而不是產品程式碼本身有逾時界限，因此無法偵測這個缺陷。

搜尋確認 repo 內沒有既有的 webhook 專屬逾時設定；相鄰的 partner eligibility adapter 預算是 3,000ms（`tenant-partner.service.ts:464`，同步呼叫語意），driver-sos scanner／google geo provider 的預設是 5,000ms（皆為呼叫端同步等待的 adapter）。Webhook dispatch 屬於已經有 queue＋backoff 機制包覆的非同步投遞（見 `shouldRetry`／`computeNextAttemptAt`），不應套用面向同步呼叫端的緊繃預算；因此不沿用 partner eligibility 的 3,000ms，改採一個更高、但仍有界的預設值 10,000ms，同時仍以固定上限（60,000ms）與必須為正整數的驗證界定「有界」的意義。

## 核心設計與交付界線

- `webhook-dispatch.service.ts` 新增 `WEBHOOK_DISPATCH_TIMEOUT_MS`（`@Optional() @Inject` token，供測試／未來 DI 覆寫）與 `WEBHOOK_DISPATCH_TIMEOUT_MS` 環境變數（production 既有慣例，比照 `DRIVER_SOS_SCANNER_TIMEOUT_MS`／`MAP_PROVIDER_TIMEOUT_MS` 的命名與驗證風格）。解析函式 `resolveWebhookDispatchTimeoutMs()` 未設定時回傳文件化預設 `10_000`ms；設定值（不論來自 env 或注入覆寫）一律經 `validateWebhookDispatchTimeoutMs()` 檢查為 `Number.isFinite` 且 `Number.isInteger` 且落在 `[1, 60_000]`，不合法直接 `throw`，不會靜默退回無界。
- `dispatchAttempt()` 在每次呼叫 `this.fetchImpl()` 前建立一個 `AbortController`，`setTimeout(() => controller.abort(...), this.timeoutMs)`，並把 `signal: controller.signal` 一併傳入 `fetch` 的 `RequestInit`（型別本來就相容，`WebhookFetch`／`RequestInit` 未變動）。整個 fetch 呼叫包在 `try/catch/finally`，`finally` 一律 `clearTimeout(timeoutTimer)`，確保成功、HTTP 失敗、拋出例外（含逾時觸發的 `AbortError`）三種結果都會釋放計時器，不留下未清除的 timer／未 abort 的 controller。
- **刻意不新增逾時專屬的分類邏輯**：逾時觸發的 `AbortError` 直接落入既有的 `catch { status = this.shouldRetry(...) ? "queued" : "delivery_failed" }` 分支，與任何其他網路例外（DNS 失敗、connection reset 等）走完全相同的既有 retry/exhaustion 權威（`shouldRetry`／`computeNextAttemptAt`／`retryableStatusCodes`）。HMAC 簽章（`createHmac`）、payload snake_case 正規化、`signatureHeader` 格式、`attempt`／`secretVersion` 語意全部未變動 — 差異只有「fetch 呼叫現在真的有界」。
- 未修改 `tenant-partner.service.ts`（不在 write_scopes；該檔案兩個呼叫端 `new WebhookDispatchService()`／Nest module 的 provider 陣列項目都是零參數／無 DI token 綁定，因此會透明使用新的預設解析路徑，不需要改動呼叫端）。

## 測試

### 本地可執行（不啟動真實 receiver，不在此 VM 起 server）

- `apps/api/tests/unit/webhook-dispatch.service.test.ts`：新增 `describe("bounded transport deadline", ...)`，涵蓋：預設值／env 覆寫／非法 env（`0`／負數／小數／非數字／超過上限）／非法注入覆寫（含 `NaN`／`Infinity`）皆 throw；用 fake timers + 一個只在 `AbortSignal` `abort` 事件才 reject 的 fetch mock，驗證逾時真的觸發 `controller.abort()`、逾時分類走既有 retry policy（`queued`／`delivery_failed` 依 `attempt` 是否耗盡）；快速成功時 `clearTimeout` 有被呼叫；每次呼叫都會把 `AbortSignal` 傳給 fetch。
- `tests/unit/system-remediation/sr-webhook-transport-timeout-20260911/webhook-transport-timeout.regression.test.ts`：5 個測試，直接建構未經修改的正式 `WebhookDispatchService`（只透過既有的 `WEBHOOK_FETCH` DI seam 換掉底層 transport，不注入任何逾時邏輯），stub transport 永遠不會自己 settle，只在收到 `abort` 事件時才 reject —— 對照舊版程式碼（沒有 `AbortController`）這個測試會一路掛到 Vitest 自身的 per-test timeout 而失敗，因此不可能對舊程式碼意外通過（符合 validation_plan「regression must fail against old default production transport」）。涵蓋：有界逾時觸發＋既有 retry 分類、HMAC／payload 語意在逾時 attempt 上維持不變、耗盡重試後 `delivery_failed`、非法設定值 throw、預設值文件化且有限。

### 只在 GitHub-hosted disposable runner 執行（未在本 VM 執行）

- `tests/integration/system-remediation/sr-webhook-transport-timeout-20260911/webhook-transport-timeout.acceptance.test.ts`：起一個真實 `node:http` server（loopback），用**零參數**建構正式 `WebhookDispatchService`（即 production 預設 `globalThis.fetch`，只透過真正的 `WEBHOOK_DISPATCH_TIMEOUT_MS` 環境變數配置逾時，不注入任何 wrapper），對它發真實 TCP 請求：
  - `/hang` 路由永不回應（不呼叫 `res.end()`）：驗證真實 elapsed time 落在 `[timeoutMs, timeoutMs + 6s]` 有界範圍、`result.status`／`httpStatus`／`nextAttemptAt` 符合既有 retry 分類、server 端真的觀察到連線被 client abort（`req.on("close")`）、且 abort 後 `server.getConnections()` 歸零（沒有殘留 socket）。
  - 耗盡重試（`attempt = maxAttempts`）打 `/hang` → `delivery_failed`、`nextAttemptAt: null`。
  - 逾時後對健康的 `/ok` endpoint 立刻恢復投遞成功（`delivered`／200／elapsed < timeoutMs），並用真實收到的 request body／header 重算 HMAC 位元組，確認與 `signatureHeader` 完全一致（bytes-level 驗證，不是字串格式檢查）。
  - `/retry-then-success`：第一次真實 503 → `queued`；第二次真實 200 → `delivered`，驗證 retry/backoff 在真實網路下仍正確轉移狀態。
  - 全部 5 個 case 皆為真實斷言（無 `.skip`／`.todo`），並在 `afterAll` 寫出 `evidence.json`（含 `candidateSha`／`workflowSha`／各 case 的 elapsed／status／socket 清理結果），供 `.github/workflows/webhook-transport-acceptance.yml` 上傳為 artifact。
- `.github/workflows/webhook-transport-acceptance.yml`：`workflow_dispatch` 手動觸發，必填 `candidate_sha`（40 hex）；checkout 該 SHA 後驗證 `git rev-parse HEAD` 與輸入一致；安裝依賴、執行上述 integration 測試；`grep` execution log 拒絕任何 skip/todo；把 install/runner outcome 寫成 `run-status.json` 並在 gate step 要求 `status == "passed"` 才算通過；上傳 execution log／`evidence.json`／`run-status.json` 為 artifact，檔名帶 candidate SHA。

## 本次實際執行指令與結果（本 worktree：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-webhook-transport-timeout-20260911`，base `e2e17cb8d`）

| 指令                                                                                                                    | Exit | 實際結果                            |
| ------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------ |
| `git diff --check`                                                                                                        | 0    | 無 whitespace errors                 |
| `pnpm --filter @drts/api exec vitest run tests/unit/webhook-dispatch.service.test.ts`                                    | 0    | 1 file / 10 tests passed             |
| `pnpm exec vitest run tests/unit/system-remediation/sr-webhook-transport-timeout-20260911/`                              | 0    | 1 file / 5 tests passed              |
| `pnpm --filter @drts/api exec eslint src/modules/tenant-partner/webhook-dispatch.service.ts tests/unit/webhook-dispatch.service.test.ts --max-warnings=0` | 0    | 無 errors/warnings（type-aware rules） |
| `pnpm exec eslint tests/unit/system-remediation/sr-webhook-transport-timeout-20260911/ tests/integration/system-remediation/sr-webhook-transport-timeout-20260911/ --max-warnings=0` | 0 | 無 errors/warnings |
| `pnpm --filter @drts/api exec prettier --check ...`／`pnpm exec prettier --check ...`（新增／修改檔案）                  | 0    | 皆已用 `--write` 套用 Prettier 格式後複驗通過 |
| `python3 tools/ci/check_test_coverage.py`                                                                                 | 0    | `all 69 test files yield tests CI runs.` |

### `pnpm --filter @drts/api typecheck` 已知的、與本 task 無關的既有失敗

本 worktree base（`e2e17cb8d`）執行 `pnpm --filter @drts/api typecheck` 會失敗，錯誤集中在 `owned-mobility.service.ts`／`voice-booking/*`／`regulatory-registry/contract-operational-view.service.ts`／`vehicle-eligibility/*`：`@drts/contracts` 缺少多個 export（`BookingQualification`／`BookingRequirements`／`ContractOperationalViewRecord` 等），與 `evidence-governance.ts` 的 evidence kind 聯合型別缺 `voice_*` 成員。這些檔案不在本 task 的 write_scopes，且完整 typecheck 輸出中沒有任何一行提到 `webhook-dispatch.service.ts`（已用 `grep -i webhook` 核對，只命中不相關的 `webhook_delivery` evidence-kind 字面值）。這是另一個尚在進行中的 task（voice-booking／contracts 契約新增）留下的既有缺口，不是本次修改造成，也不在本 task 可寫範圍內修復；改用 `eslint`（type-aware rules，對 `webhook-dispatch.service.ts` 與所有新增測試檔皆為 0 errors/warnings）作為本檔案的型別正確性佐證。

## 未做的 live／真機部分（明列，不冒充成功）

- 未在本 VM 執行 `tests/integration/system-remediation/sr-webhook-transport-timeout-20260911/`：guardrail 明確要求 holding HTTP receiver／真實網路測試只能在 GitHub-hosted disposable runner 執行，本 worker 環境不得起 receiver server。該檔已通過 type-aware `eslint`（0 errors/warnings）與 Prettier 格式化，但尚未有一次真實執行的 PASS 證據；需要 reviewer／CI 透過 `.github/workflows/webhook-transport-acceptance.yml`（`workflow_dispatch`，帶入本次最終 candidate SHA）實際跑過，並以其 `evidence.json`／`run-status.json` 作為驗收證據。
- `pnpm --filter @drts/api typecheck` 目前在本 base SHA 上是紅的（見上表），但診斷已確認與 `webhook-dispatch.service.ts` 無關；本 task 未嘗試修復 `@drts/contracts` 缺失 export 或 `owned-mobility`／`voice-booking` 的型別錯誤，因為那些檔案不在 write_scopes，修復需要另開有來源的子任務。
- 未執行 `pnpm --filter @drts/api exec vitest run tests/unit/webhook-dispatch.service.test.ts` 以外的 `@drts/api` 全量測試（例如 `tenant-partner.service.ts` 的完整回歸），因為 task brief 明確要求「不跑無關全庫測試」；`tenant-partner.service.ts` 未被修改，兩個呼叫端仍是零參數建構，行為相容性已用型別（`WebhookFetch`／`RequestInit` 未變動）與 DI 預設值（`@Optional`）推理確認，未另外新增端對端回歸。

## Candidate handoff

實作及 evidence 完整 commit 後普通 push，使用：

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Claude2 /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh \
  handoff SR-WEBHOOK-TRANSPORT-TIMEOUT-20260911 Claude "AbortController 有界逾時＋env 驗證；既有 retry/backoff/HMAC 權威不變；hosted receiver acceptance workflow 待 reviewer/CI 以本 candidate SHA 觸發，見 task evidence"
```

精確 candidate SHA、branch、reviewer 與 state 以同一 release 的 `ai-status.sh show SR-WEBHOOK-TRANSPORT-TIMEOUT-20260911` 讀回。owner 不寫 `done`；獨立 review、`webhook-transport-acceptance.yml` 的 hosted 執行結果、同 candidate CI 及 merge 皆尚待 lifecycle 完成。
