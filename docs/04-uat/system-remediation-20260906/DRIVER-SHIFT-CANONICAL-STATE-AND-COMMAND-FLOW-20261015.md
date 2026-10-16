# DRIVER-SHIFT-CANONICAL-STATE-AND-COMMAND-FLOW-20261015

Owner: Claude · Reviewer: Claude2 · 2026-10-16 UTC（R2 reopen 修正：同日追加）

本次是原 C051 的有限 Source 修復（C051-F1/F2/F3 三個 confirmed current dataflow
families）。實作、純檢查與候選交接不等於 hosted、完整 C051、原 134 項或 goal
驗收。獨立審查、同候選 mandatory CI、protected merge 及 required acceptance
仍由既有 candidate lifecycle 記錄；owner 不呼叫 `done`。

base：`origin/dev` @ `b7d6b04b18a4a6b0cc47c37ba426bc5ad468e952`。

## 正式依據與修正邊界

- 三個 production 檔都是既有 SR-WIRE-001/SR-DRIVER-GAPS-20260911 已完成並 mounted
  的 `ShiftAttendanceService`/`ShiftAttendanceRepository`/`ShiftAttendanceController`；
  本次只在這三個檔案內修復，未新增 module、API 路徑、UI、SDK 或 migration。
- `ShiftAttendanceController`（`apps/api/src/modules/shift-attendance/shift-attendance.controller.ts`）
  的 `listShifts`/`listAttendance`/`getShift`/`abandonShift` 是實際 mounted
  `@Get`/`@Post` handlers；本次改為串接 service 回傳的 Promise，driver 自身
  404／empty-list 的既有 ownership 檢查邏輯不變，只是移到 `.then()` 內以等待
  canonical 讀取完成後再執行。
- `ShiftAttendanceService`（同目錄 `.service.ts`）新增 `repository.isEnabled()`
  分支：啟用 DB 時讀寫改走 `ShiftAttendanceRepository` 的新方法；未啟用時沿用原
  `this.shifts`/`this.attendance` in-memory fallback（`explicit no-DB mode`，
  既有單元測試依賴此分支不變）。
- `ShiftAttendanceRepository`（同目錄 `.repository.ts`）是既有 SR-WIRE-001
  `executeClockInTransaction`/`executeClockOutTransaction` 的持有者；本次新增
  `listShifts`/`listAttendance`/`getShiftById`（canonical 讀回）、
  `executeAbandonTransaction`（canonical abandon ACK）及兩個 insert 的
  unique-violation 重試（`allocateNextShiftId`/`allocateNextAttendanceId`）。
  沒有新增 migration；`ops.phase1_driver_shifts`/`ops.phase1_driver_attendance`
  的既有 `varchar(100)` 欄位與 `shift_id`/`attendance_id` 格式（`SFT-NNNNNN`/
  `ATT-NNNNNN`）不變（見 `infra/migrations/V0015__ops_driver_domains.sql`、
  `V0016__driver_attendance_settings.sql`）。

## C051-F1：canonical 讀回

- 舊版 `listShifts`/`listAttendance`/`getShift` 只讀該 service 執行個體自己的
  `this.shifts`/`this.attendance`（只在 `onModuleInit` 載入一次），另一個獨立
  reader（另一個 process，或同一個 process 重啟後的新執行個體）永遠看不到其他
  執行個體已提交的寫入；DB 讀取失敗也沒有區分於「真的沒有資料」。
- 修正版：DB 啟用時，三個讀取都改為直接查 `ops.phase1_driver_shifts`／
  `ops.phase1_driver_attendance`（新 repository 方法），不經過呼叫端自己的
  cache；查詢失敗直接 throw（不吞成 empty/404）。DB 未啟用時仍回退到原
  in-memory 陣列（既有行為不變）。

## C051-F2：碰撞安全的 shift／attendance ID

- 舊版 `nextShiftId()`/`nextAttendanceId()` 是每個 service 執行個體自己的
  in-memory counter，從該執行個體啟動時載入的 state 推算起始值；兩個獨立啟動、
  載入相同（例如都是空）snapshot 的執行個體，會各自推出同一個起始 ID
  （`SFT-000001`），即使兩筆是完全不相關、合法的不同司機 clock-in 命令。舊版
  `executeClockInTransaction`/`executeClockOutTransaction` 的 INSERT 沒有
  `ON CONFLICT`，一旦真的撞號，整筆合法命令會直接因為 DB unique violation 失敗。
- 修正版：INSERT 撞到 unique violation（`error.code === "23505"`）時，不直接
  失敗，改為在同一筆交易內重新查 `ops.phase1_driver_shifts`/
  `ops.phase1_driver_attendance` 的真實 MAX 來源重算下一個 ID 並重試（上限
  `MAX_ID_ALLOCATION_ATTEMPTS = 5` 次），成功後才 COMMIT。沒有改變 ID 格式／既有
  儲存值；同一司機重複 active clock-in 仍是既有 `SHIFT_ALREADY_ACTIVE` 409，不
  是碰撞重試路徑。超過重試上限或撞號原因不是 unique violation，仍整筆失敗並
  ROLLBACK，不留下 synthetic 成功。

### R2 reopen 修正：重試前補 SAVEPOINT

- Reviewer（Claude2）在 candidate `36dba8766f38e2e461502122bf7ad817a9ea061b`
  上 REOPEN：上一段的重試迴圈撞到 unique violation（23505）後，直接在同一個
  `BEGIN...COMMIT` 交易內對同一個 client 呼叫 `allocateNextShiftId`/
  `allocateNextAttendanceId` 做 SELECT 重新取號，但重試前沒有
  `SAVEPOINT`/`ROLLBACK TO SAVEPOINT`。PostgreSQL 的既有語意是：交易內任一
  陳述式失敗後，整筆交易即進入 aborted 狀態，後續所有陳述式（包含重新取號的
  SELECT）都改丟 `SQLSTATE 25P02`
  （`current transaction is aborted, commands ignored until end of
  transaction block`），不是預期的新 id；`isUniqueViolation()` 只認
  `23505`，`25P02` 會直接落到外層 `catch`、觸發整筆 `ROLLBACK`，等於兩個合法
  命令仍會因為撞到同一起始 id 而整筆失敗——只是失敗代碼從 `23505` 變成
  `25P02`，F2 要修的行為並未真正修好。本次新增的 fake DB
  （`fake-shift-db.ts`）當時沒有模擬「交易內一旦出錯、後續陳述式即被拒絕直到
  ROLLBACK」這個語意，所以舊版 `collision-safe-identities.test.ts` 5/5 PASS
  只是 fixture 的假象。
- 修正邊界：`executeClockInTransaction`／`executeClockOutTransaction` 的兩個
  重試迴圈，各自在 INSERT 前補一個具名 `SAVEPOINT`
  （`shift_insert_attempt`/`attendance_insert_attempt`）；`catch` 內偵測到
  unique violation 時，先 `ROLLBACK TO SAVEPOINT` 把交易從 aborted 狀態救回
  可用狀態，再呼叫 `allocateNext*Id` 重新取號、retry INSERT。
- 同時補強 `fake-shift-db.ts`：新增 `aborted` 狀態旗標與具名 savepoint
  snapshot——交易內任一陳述式失敗後，`aborted` 置真，之後任何陳述式（除
  `ROLLBACK`／`ROLLBACK TO SAVEPOINT`）都丟新增的
  `FakeAbortedTransactionError`（`code = "25P02"`）；`SAVEPOINT <name>` 記錄當前
  表格快照，`ROLLBACK TO SAVEPOINT <name>` 還原該快照並清除 `aborted`。這樣
  若未來有人移除 SAVEPOINT／ROLLBACK TO SAVEPOINT，`collision-safe-identities.test.ts`
  既有兩個成功重試案例（shift id、attendance id）會直接在重新取號的 SELECT
  上收到 25P02 而 FAIL，而不是沉默通過。另外新增一個規格化測試
  `"re-derives the id after a collision without the surrounding transaction
  going aborted (SQLSTATE 25P02)"`，以註解明確釦著這個不變量。
- 驗證邊界：`FakeAbortedTransactionError` 與真實 Postgres 的 25P02 語意一致，
  但仍是 fake Postgres，不是真實 PG 連線驗收；真實 PG 下的驗收仍待 hosted
  acceptance。

## C051-F3：abandon 的 canonical 寫入 ACK 與 terminal race

- 舊版 `abandonShift` 直接在記憶體把 shift 改成 `abandoned`、記 audit，再呼叫
  `this.persist(...)`（fire-and-forget、不 await），回應視為成功——不論 DB 寫入
  最終有沒有真的提交。沒有在寫入前重新鎖、重讀 canonical 現況，所以一個已經
  透過並行 clock-out 變成 `completed`（或已被另一次 abandon 設為 `abandoned`）
  的 shift，可能被 stale 的 abandon 要求覆寫。
- 修正版：DB 啟用時新增 `executeAbandonTransaction`——鎖該 shift row、重讀
  canonical 現況並重新檢查 `status === "active"`（不是呼叫端的舊快照），確認後
  才 UPDATE 並 COMMIT；只有 commit 成功才更新本地 cache、記 audit、回應成功。
  寫入被拒絕（連線失敗、或現況已是 terminal）時整筆 throw，canonical row、cache
  與 audit 都維持原狀，不產生假成功。DB 未啟用時沿用原 in-memory 交易語意
  （`explicit no-DB mode`）。

## 保留的既有行為

- 已修 SR-DRIVER-GAPS-20260911 的停權（`DRIVER_AUTH_SUSPENDED`）、
  SR-WIRE-001 的 Leave 阻擋與到期恢復、provided/undispatchable vehicle 拒絕
  （`VEHICLE_NOT_DISPATCHABLE`）、vehicle 省略允許、同司機重複 clock-in 409、
  canonical start/end/hours 與跨日計算，全部未修改，相關既有測試只做必要的
  `async`/`await` 調整（見下方命令與檔案清單），沒有刪除或弱化任何既有斷言。
- `tests/security/iam-route-driver-negative.test.ts` 只調整既有
  ShiftAttendance self-boundary 案例（約 705–804 行，Demo 共用 writer 已先完成
  序列化）；`tests/unit/system-remediation/sr-wire-001/b1-b2-consensus.test.ts`
  只調整 Shift B1 案例（52–79 行）；`authority-gates.test.ts` 只調整 Shift
  awaits（85、124 行）；Academy B2／Training／Presence／Leave 斷言不變。

## Finding／驗收項對照

| Finding／required acceptance                                             | 原始碼依據與修改位置                                                                                                          | 舊版重現 → 修正版結果                                                                                                                        | 命令、退出碼、執行版本與證據位置                                                                 | 未驗項與具體限制                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| C051-F1／`driver-shift_canonical-history-and-availability-readback`      | `shift-attendance.service.ts::listShifts/listAttendance/getShift`、`shift-attendance.repository.ts::listShifts/listAttendance/getShiftById` | 新 `canonical-readback.test.ts` 8 案在舊版全部 FAIL（跨 reader 看不到寫入、無法區分失敗讀取與 empty／404）；修正版 8/8 PASS                 | 下列 A（舊版 exit 1，0/8 PASS，8 FAIL）、B（修正版 exit 0，8/8 PASS）；日誌見下                    | 跨 reader 僅以同一 fake Postgres 的兩個獨立 service+repository 執行個體模擬，非跨 process／跨機器驗收 |
| C051-F2／`driver-shift_collision-safe-identities-and-transactions`       | `shift-attendance.repository.ts::executeClockInTransaction/executeClockOutTransaction/allocateNextShiftId/allocateNextAttendanceId` | 新 `collision-safe-identities.test.ts` 6 案（R2 reopen 後新增 1 案）在舊版 2 FAIL（撞號直接整筆失敗）／3 PASS（既有 409、rollback 行為本已正確）；修正版 6/6 PASS。R2 reopen：舊 candidate 的重試迴圈撞到 23505 後沒有 SAVEPOINT，真實 PG 下會因交易 aborted 改丟 25P02 而整筆失敗；本輪在兩個重試迴圈補 SAVEPOINT／ROLLBACK TO SAVEPOINT，並補強 `fake-shift-db.ts` 模擬 aborted-transaction 語意（新增 `FakeAbortedTransactionError`/25P02），讓這類缺陷能被測試擋下 | 同上 A／B；R2 reopen 驗證見下 F（exit 0，6/6 PASS，含新 25P02 regression 案）                      | unique-violation／25P02 以 fake Postgres 的 pg 錯誤碼與 aborted-transaction 語意模擬，非真實 PG 連線驗收                  |
| C051-F3／`driver-shift_abandon-canonical-write-ack-and-terminal-races`   | `shift-attendance.service.ts::abandonShift`、`shift-attendance.repository.ts::executeAbandonTransaction`                     | 新 `abandon-durable-ack.test.ts` 6 案在舊版 5 FAIL（拒絕寫入仍回應成功、terminal race 可被覆寫）／1 PASS（fire-and-forget 恰好先落地，屬巧合而非保證）；修正版 6/6 PASS | 同上 A／B；日誌見下                                                                                | 同上，fake Postgres 非真實 DB；1 件舊版巧合通過的案例正是 F3 要修的無保證寫入時序，不代表舊版已修好   |
| `driver-shift_original-roles-leave-eligibility-and-no-db-regressions`    | 既有 `tests/unit/shift-attendance.test.ts`、`tests/security/iam-route-driver-negative.test.ts`（Shift self-boundary 區塊）、`tests/unit/system-remediation/sr-qa-driver-001/shift-clockin-suspension-gap.test.ts`、`sr-wire-001/authority-gates.test.ts`、`sr-wire-001/b1-b2-consensus.test.ts` | 20 files／132 tests 全 PASS，含本次新增 19 tests 及既有 113 tests（停權、Leave、vehicle、duplicate clock-in、Academy B2、Training/Presence 等） | C（exit 0，20 files／132 tests PASS）；日誌見下                                                    | 未啟動真實 PG／browser／hosted CI；existing test 僅做必要 async/await 調整，斷言內容不變             |
| `driver-shift_exact-candidate-validation`                                | 三個 production 檔 + lint/typecheck                                                                                           | production 檔 lint 0 warning／0 error；`tsc --noEmit` 專案層級既有大量與本次無關的 pre-existing 錯誤（billing-settlement、auth ops_observer 等），`shift-attendance` 相關檔案 0 筆診斷 | D（lint exit 0）、E（typecheck，shift-attendance 命中 0 筆，专案層級既有 pre-existing 錯誤不變） | 未跑 hosted CI／browser／PG／Docker；獨立 review、mandatory CI、protected merge 待 candidate lifecycle 收錄 |

## 可重跑命令與結果

以下均在指定 isolated task worktree
`.artifacts/worktrees/auto/claude-driver-shift-canonical-state-and-command-flow-20261015`
執行；所有已啟動檢查皆已讀完結果。「舊版」是指把三個 production 檔暫時替換回
base commit `b7d6b04b18a4a6b0cc47c37ba426bc5ad468e952` 的內容（只換檔案內容，
沒有用 git checkout／reset／stash 動工作樹或索引），跑完後立即換回修正版，
working tree 自始至終沒有偏離本次候選。

- A（舊版）：`pnpm exec vitest run tests/unit/driver-shift-canonical-state-and-command-flow-20261015/`
  → exit 1，3 files failed，15/19 FAIL、4/19 PASS。日誌
  `.local/driver-shift-canonical-r2/before-new-tests.log`。
- B（修正版）：同一命令 → exit 0，3 files PASS，19/19 PASS。日誌
  `.local/driver-shift-canonical-r2/after-new-tests.log`。
- C（修正版，既有相關回歸）：
  `pnpm exec vitest run tests/unit/shift-attendance.test.ts tests/security/iam-route-driver-negative.test.ts tests/unit/system-remediation/sr-qa-driver-001/ tests/unit/system-remediation/sr-wire-001/ tests/unit/system-remediation/sr-driver-gaps-20260911/ tests/unit/driver-shift-canonical-state-and-command-flow-20261015/`
  → exit 0，20 files／132 tests PASS。日誌
  `.local/driver-shift-canonical-r2/after-full-regression.log`。
- D：`pnpm --filter @drts/api exec eslint src/modules/shift-attendance --max-warnings=0`
  → exit 0，無輸出。日誌 `.local/driver-shift-canonical-r2/lint-production.log`。
  另 `pnpm exec eslint tests/unit/driver-shift-canonical-state-and-command-flow-20261015 tests/unit/shift-attendance.test.ts tests/security/iam-route-driver-negative.test.ts tests/unit/system-remediation/sr-qa-driver-001/shift-clockin-suspension-gap.test.ts tests/unit/system-remediation/sr-wire-001/authority-gates.test.ts tests/unit/system-remediation/sr-wire-001/b1-b2-consensus.test.ts --max-warnings=0`
  → exit 0。日誌 `.local/driver-shift-canonical-r2/lint-tests.log`。
- E：`pnpm --filter @drts/api exec tsc -p tsconfig.json --noEmit` → exit 1；
  日誌 `.local/driver-shift-canonical-r2/typecheck-api.log`。`grep -c
  "shift-attendance" typecheck-api.log` = 0——所有診斷都在
  `billing-settlement`、`auth`（`ops_observer` role union）、
  `driver-device-session.service.ts`（`boundBindingId`）、
  `iap-subject.adapter.ts` 等與本次完全無關的既有檔案；這些是 pre-existing
  （`@drts/contracts` 相關型別早於本次候選就缺漏，與 memory 記錄的
  stale-contracts-dist 現象一致），本次沒有新增或修改任何 typecheck 錯誤。

### R2 reopen 驗證（SAVEPOINT 修正後，本次候選）

- F（本次新測試）：
  `pnpm exec vitest run tests/unit/driver-shift-canonical-state-and-command-flow-20261015/`
  → exit 0，3 files PASS，20/20 PASS（19 既有 + 1 新增
  `"re-derives the id after a collision without the surrounding transaction
  going aborted (SQLSTATE 25P02)"`）。日誌
  `.local/driver-shift-canonical-r2/r2-after-new-tests.log`。
- G（本次既有相關回歸，同 C 的命令集合）：exit 0，20 files／133 tests PASS
  （132 既有 + 1 新增）。日誌
  `.local/driver-shift-canonical-r2/r2-after-full-regression.log`。
- H（本次 lint，同 D 的檔案集合）：exit 0，無輸出。日誌
  `.local/driver-shift-canonical-r2/r2-lint.log`。
- I（本次 typecheck，同 E 的命令）：`pnpm --filter @drts/api exec tsc -p
  tsconfig.json --noEmit` → exit 2；日誌
  `.local/driver-shift-canonical-r2/r2-typecheck-api.log`。`grep -c
  "shift-attendance"` = 0，與 E 相同的既有、與本次無關的 pre-existing 錯誤，
  本次未新增或修改任何 typecheck 錯誤。

測試外部邊界：F1/F2/F3 的新測試使用
`tests/unit/driver-shift-canonical-state-and-command-flow-20261015/fake-shift-db.ts`
——一個 socket-free、具備真實 BEGIN/COMMIT/ROLLBACK 語意（含交易內 snapshot／
還原）、unique-violation（pg code 23505）模擬、以及（R2 reopen 後新增）
SAVEPOINT／ROLLBACK TO SAVEPOINT 與 aborted-transaction（pg code 25P02）
語意模擬的假 Postgres，直接接在真實 `ShiftAttendanceRepository` 後面（不是
mock repository），所以 repository 實際送出的 SQL 文字與參數都被執行到；只
外部化真正的 socket／pg driver。沒有宣稱 PostgreSQL／hosted 驗收。既有測試
（`shift-attendance.test.ts` 等）維持原本 in-memory fallback 或 mocked
repository 方式，未改動其外部邊界。

未啟動 VM product／preview／browser／PG／Docker runtime，沒有 cloud、IAM、
Operator、provider、部署或 merge 動作。`.local` 僅為機器證據；完整最終候選
SHA、branch 及 PR URL 以同次 canonical handoff 為準，獨立 review、mandatory
CI、protected merge 及五項 required acceptance 皆為 pending。
