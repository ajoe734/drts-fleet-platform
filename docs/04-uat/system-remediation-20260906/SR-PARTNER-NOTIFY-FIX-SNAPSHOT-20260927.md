# SR-PARTNER-NOTIFY-FIX-SNAPSHOT-20260927: SQL Type Conflict Fix

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| PostgreSQL42P08 in persistChangesWithExecutor (same $7 used for superseded_at, to_jsonb($7::text), and created_at) | `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts` `persistChangesWithExecutor` `WITH superseded AS ...` | 舊版執行時發生型別衝突 (PostgreSQL42P08) → 修正後 `$7::timestamptz` 及 `$8::timestamptz` 明確轉換，消除型別衝突。 | 本機無 PG 執行緒，故撰寫 `apps/api/tests/integration/sr-partner-notify-fix-snapshot-20260927.integration.test.ts` 驗證初始、v2 supersede、replay 與 rollback 行為。結果待 hosted CI 執行。 | Real PG 驗證需由 hosted CI 執行 (本機依據 VM 限制不啟動 PG/Docker)。 |
