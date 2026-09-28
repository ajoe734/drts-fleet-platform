# SR-PARTNER-NOTIFY-FIX-SNAPSHOT-20260927: SQL Type Conflict Fix

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| PostgreSQL42P08 in persistChangesWithExecutor (same $7 used for superseded_at, to_jsonb($7::text), and created_at) | `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts` `persistChangesWithExecutor` `WITH superseded AS ...` | 舊版執行時發生型別衝突 (PostgreSQL42P08) → 修正後 `$7::timestamptz` 獨立對齊，確保無型別衝突。 | 本機無 PG 執行緒，故撰寫 `apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` 驗證初始、v2 supersede、replay 與 rollback 行為。結果待 hosted CI 執行。 | Real PG 驗證需由 hosted CI 執行 (本機依據 VM 限制不啟動 PG/Docker)。 |
| SNAP-R1 [P1] JSON timestamp representation regresses (Rejected SHA: 842e3c20883b49f156362d11c1221bfedb099081) | `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts` | 舊版 `$7::timestamptz` 使 postgres 將字串解析成 timestamp 並重新 serialize，破壞原 ISO 字串 → 新版修正為 `($7::text)::timestamptz`，保留 jsonb 字串完整性。 | `pnpm exec tsc --noEmit` exit 0。 | `snapshot_parameter_types_consistent` |
| SNAP-R2 [P1] required replay/atomicity regression is absent (Rejected SHA: 842e3c20883b49f156362d11c1221bfedb099081) | `apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` | 舊版測試缺乏 outbox 及 public entry boundary → 第一次修改未正確設置 route，導致 allocator 直接回傳 null，未驗證 sequence 邏輯。 | Hosted run: https://github.com/ajoe734/drts-fleet-platform/actions/runs/36358531190/job/108731178692 | `snapshot_supersede_replay_rollback_hosted_pg` (未通過) |
| SNAP-R3 [P2] fixture bypasses the contract (Rejected SHA: 842e3c20883b49f156362d11c1221bfedb099081) | `apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` | 舊版測試以 `as any` 繞過 TypeScript → 第一次修改仍留有不合法型別和 `as any`，且 typecheck 指令未涵蓋該檔案。 | 缺乏正確的 scoped typecheck。 | 無 |

| SNAP-R2 [P1] Replay/atomicity coverage fixed (Rejected SHA: e2dfc5bba9cb273f0f210d04ebf97c204341bf8a) | `apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` | 第二次修改（3cb4212）前未準備通知 route，且以 null orderId 做錯誤注入，導致在 allocate sequence 前就 fail。 → 新版測試中加入 `writeOrderPartnerNotificationRoute`，且在 `payload.eventSequence` 上增加 assert，確保 outbox 及 notification sequences 能正確推進，提供部分修復。 | `pnpm exec vitest run apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` (待 hosted CI 實際連線資料庫驗證) | `snapshot_supersede_replay_rollback_hosted_pg` |
| SNAP-R3 [P2] Contract-bypass finding fixed (Rejected SHA: e2dfc5bba9cb273f0f210d04ebf97c204341bf8a) | `apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` | 之前 fixtures cast 為 any 且傳遞不存在的值。 → 新版提供 fully typed `OwnedOrderRecord`、`DispatchJobRecord`，不使用 `as any`，使用符合合約的 geo 數值及強制型別守衛消除 TS2532 錯誤。 | Scoped check: `node -e '...t.getPreEmitDiagnostics(g)...'` exit 0 (0 diagnostics)。 | 無 |

## Re-Rework Submission (2026-09-27)
- **Previous Rejected SHA:** `e2dfc5bba9cb273f0f210d04ebf97c204341bf8a`
- **Rejected Candidate SHA:** `3cb421227399d3e11a0dae418e48c2a53cb87167`
- **Commands Verified locally:**
  1. `node -e 'const t=require("typescript"),c=t.readConfigFile("tsconfig.json",t.sys.readFile),p=t.parseJsonConfigFileContent(c.config,t.sys,process.cwd()),g=t.createProgram(["apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts"],{...p.options,noEmit:true,incremental:false}),d=t.getPreEmitDiagnostics(g); console.log(t.formatDiagnosticsWithColorAndContext(d,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=>"\n"})); process.exitCode=d.length?1:0;'` (Exited with 0)
  2. `git diff --check origin/dev...HEAD` (Exited with 0)
- **Required Acceptance Keys Pending:** `snapshot_parameter_types_consistent`, `snapshot_supersede_replay_rollback_hosted_pg`

## Parameter Ambiguity Fix (2026-09-27)
- **Previous Rejected SHA:** `6ece53c6ee47542e9cbe5a734cafaef95ae818a1`
- **Issue:** Prior coverage gap in validating static parameter mapping consistency (original issue was 42P08, but ($7::text)::timestamptz successfully resolved it without recurrent 42P08).
- **Fix:** Separated `createdAt` into two distinct parameters `$7` (for `timestamptz`) and `$8` (for `text`/`jsonb`), and `supersededAt` into `$9`, guaranteeing isolated type contexts for each parameter. This ensures 42P08 cannot occur since each parameter is cast to exactly one type.

## Test Teardown Typo Fix (2026-09-27)
- **Previous Rejected SHA:** `deb5d2ed7a2028e69291d1142f59eff4ec837c99` (Failed CI integration job)
- **Issue:** The integration test teardown attempted to delete from `mobility.phase1_partner_notification_routes` which does not exist, causing PostgreSQL error 42P01. The correct table name is `mobility.phase1_order_partner_notification_routes`.
- **Fix:** Fixed the table name in the test teardown (`DELETE FROM mobility.phase1_order_partner_notification_routes`). Also fixed an unused error variable lint warning.
- **Commands Verified locally:**
  1. `pnpm exec eslint apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` (Exited with 0)

## Fixes for SNAP-R4, SNAP-R5, SNAP-R2 (2026-09-28)
- **Previous Rejected SHA:** `61af03586a77ee74b60220c610f0b9a254bf3436`
- **Current Candidate Branch:** `gemini2/sr-partner-notify-fix-snapshot-20260927-v2` (published via compliant replacement path to fix SNAP-R6 commit trailer errors without force pushing)
- **Issues Fixed:**
  - **SNAP-R4:** Replaced unresolved route/counter fixture by properly inserting a valid partner entry in `admin.phase1_partner_channel_entries` before allocating sequence.
  - **SNAP-R5:** Fixed FK order cleanup in teardown. Route is deleted AFTER sequence, and prerequisite partner entry is also deleted in the finally block.
  - **SNAP-R2:** Implemented partial atomicity rollback using a wrapped transaction executor (`persistOrderWorkflow`). Snapshots, sequence allocation, and outbox rows were verified for this one path.
  - **SNAP-R6:** Fixed full-range commit gate failure by publishing a compliant replacement candidate on a clean branch `gemini2/sr-partner-notify-fix-snapshot-20260927-v2`.
- **Commands Verified locally:**
  1. `node -e 'const t=require("typescript")... getPreEmitDiagnostics(g); process.exitCode=d.length?1:0;'` (Exited with 0)
  2. `pnpm exec eslint apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` (Exited with 0)
  3. `git diff --check origin/dev...HEAD` (Exited with 0)
  4. `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` (Exited with 0)
- **Required Acceptance Keys Pending:** `snapshot_parameter_types_consistent`, `snapshot_supersede_replay_rollback_hosted_pg`

## Re-Rework Submission (2026-09-28)
- **Previous Rejected SHA:** `f58a8d84ac9d26b04d3846f1804f8cabe7b22cd0`
- **Current Candidate SHA:** Pending commit
- **Issues Fixed:**
  - **SNAP-R2:** Implemented full atomicity rollback for both `persistOrderWorkflow` and `persistChanges` paths by intercepting queries via the executor/client boundary. Captured complete state (snapshots, outbox, sequences) before and after failures, asserting full state restoration without extra rows. Also checked replay state accurately.
  - **SNAP-R7:** Replaced globally fixed entry slug and ride ref with test-run-unique values to prevent test collision across parallel or retry runs. Restricted cleanup to the specifically created fixture.
- **Commands Verified locally:**
  1. `node -e 'const t=require("typescript"),c=t.readConfigFile("tsconfig.json",t.sys.readFile),p=t.parseJsonConfigFileContent(c.config,t.sys,process.cwd()),g=t.createProgram(["apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts"],{...p.options,noEmit:true,incremental:false}),d=t.getPreEmitDiagnostics(g); console.log(t.formatDiagnosticsWithColorAndContext(d,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:f=>f,getNewLine:()=>"\n"})); process.exitCode=d.length?1:0;'` (Exited with 0)
  2. `pnpm exec eslint apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` (Exited with 0)
- **Required Acceptance Keys Pending:** `snapshot_parameter_types_consistent`, `snapshot_supersede_replay_rollback_hosted_pg`
