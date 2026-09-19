# SR-PARTNER-NOTIFY-SEQ-20260918 — outbox 同交易序號

Owner: Codex2 · Reviewer: Codex · 驗證日期: 2026-09-19 UTC

設計依據：[乘客通知 SA/SD §5](../../02-architecture/partner-notification-20260917/01_system_sa_sd.md#5-五種事件次序時效)。本文件記錄 owner 的實作與本地驗證；正式 review、CI、merge、acceptance 由同一 candidate 的 lifecycle 記錄。

## 實作與邊界

基準 `98e251cdc809467b16a158fc2f285e4296206f5f` 已有 owned-mobility outbox INSERT 的 inline CTE；但 `MultiTaxiRepository.allocateNotificationEventSequence()` 仍無 production caller，且直接使用 pool query。原 CTE 的 `NOT EXISTS` 與 unique-conflict 判定之間，併發重試可能多消耗序號。

本次流程在同一個 transaction client 上依序執行：

1. `INSERT ... ON CONFLICT (outbox_id) DO NOTHING RETURNING outbox_id`。
2. 只有真正新增的事件呼叫 `allocateNotificationEventSequence(orderId, executor)`；配號仍是 V0104 定義的原子 `UPDATE ... RETURNING`。
3. 用同一 executor 將結果寫入 outbox 的 `payload.eventSequence`，最後由 workflow commit。其他連線不會看到未完成配號的 outbox。

同事件的並行 INSERT 由 PostgreSQL unique key 仲裁；重試拿不到 RETURNING row，因此不再配號，也不覆寫既有 payload、sequence 或派送狀態。任一步驟失敗，outbox 與 counter 同時 rollback。

`persistOrderWorkflow` 延用既有呼叫端交易；`persistChanges` 只有含 consumer notification outbox 時才開啟交易。沒有 partner sequence row 的訂單維持原始 payload。未使用 assignmentVersion 或 SSE counter 作序號，未變更 schema、事件 enum、派送重試或 service 業務邏輯。

OwnedMobilityModule 直接提供無狀態的 MultiTaxiRepository DB adapter，避免匯入已依賴 OwnedMobilityModule 的 MultiTaxiModule。既有直接建立 repository 的測試及無 DB 模式仍相容。

## 驗收對應

| 驗收鍵                                                     | Owner 驗證證據                                                                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `durable_event_sequence_allocated_in_same_transaction`     | PostgreSQL 測試在 caller transaction 中驗證 allocator 使用同一 client、別的連線看不到 outbox/counter 更新；主動拋錯與 SQL trigger 故障都會 rollback，下一事件重新取得 1。批次中第二筆失敗時第一筆也 rollback。 |
| `allocator_has_real_callers_and_allocation_test_coverage`  | OwnedMobilityRepository 真實呼叫 allocator；16 個同事件並行重試只呼叫一次，16 個不同事件取得 1–16；五種事件跨相同／null assignmentVersion 持續遞增；重建 repository 後接續序號。                               |
| `owned_mobility_existing_outbox_behaviour_regressed_green` | root scoped suites 117/117、API owned-mobility/multi-taxi/redispatch suites 242/242，合計 359 tests 通過。                                                                                                     |

原 ROUTE 的 outbox 測試保留原子性、payload 參數及無 route 相容性驗證，將綁定 CTE 字串的斷言改為同 client／BEGIN–COMMIT 順序及 allocator 呼叫斷言，並新增重試不得配號。沒有刪除或放寬 API owned-mobility 既有測試。

## 可重跑命令與結果

PostgreSQL 16（本次使用獨立 `postgres:16-alpine` 容器）；測試建立隨機專用 database，使用 V0104 migration 與 V0056 的正式 outbox DDL，結束後只刪除該測試 database。環境變數須指向可建立 database 的隔離測試 instance。沒有設定變數時 7 項 PostgreSQL 測試會明確 skip；這次已設定並全部實跑通過，設定了但連線失敗則測試失敗。

```bash
PARTNER_NOTIFY_SEQ_TEST_DATABASE_URL='<isolated-test-database-url>' \
  pnpm exec vitest run \
  tests/unit/system-remediation/sr-partner-notify-seq-20260918 \
  tests/unit/system-remediation/sr-partner-notify-route-20260917 \
  tests/unit/owned-mobility.test.ts \
  tests/unit/system-remediation/sr-push-durability-20260911 \
  tests/unit/system-remediation/sr-push-001 \
  tests/integration/owned-mobility-idempotency.integration.test.ts \
  --maxWorkers=2 --silent
# 9 files, 117 passed, 0 skipped (含 7 項 PostgreSQL)

pnpm --dir apps/api exec vitest run \
  tests/unit/owned-mobility tests/unit/multi-taxi \
  tests/integration/int-p5-redispatch-001-version-safe-redispatch.test.ts \
  --maxWorkers=2 --silent
# 16 files, 242 passed

pnpm exec tsc -p tsconfig.json --noEmit
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
# 全部 exit 0

pnpm exec eslint \
  apps/api/src/modules/owned-mobility/owned-mobility.repository.ts \
  apps/api/src/modules/owned-mobility/owned-mobility.module.ts \
  apps/api/src/modules/multi-taxi/multi-taxi.repository.ts \
  tests/unit/system-remediation/sr-partner-notify-route-20260917/owned-mobility-outbox-event-sequence.test.ts \
  tests/unit/system-remediation/sr-partner-notify-seq-20260918/notification-sequence.postgres.test.ts \
  --max-warnings=0
python3 tools/ci/check_test_coverage.py
git diff --check
# 全部 exit 0
```

API map-closeout 測試會重寫兩份既有 sidecar JSON；本次測試後已還原這些自動產物，未混入提交。隔離 worktree 原有的共享 node_modules 連結已失效，使用 frozen-lockfile/offline install 在本 worktree 修復；未修改套件或 lockfile。

本次只驗證 outbox persistence / sequence 與既有本地行為；不代表夥伴端送達、外部 UAT、CI 或 dev 部署已完成。
