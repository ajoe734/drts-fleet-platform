# SR-ENV-COPY-001 — 接續修正與未完成驗證

本頁取代前一版「完成證據」：任務尚未完成，不可依前版全數通過的敘述結案。

- Owner: Codex；Reviewer: Codex2。
- 2026-09-09 本輪 `git fetch origin` 後 `origin/dev`: `9b57f767047825fe116b2231aa22900ce408897a`。
- 接手時本地／remote head: `9e35f6f1426755f97a81826b66edaf14d1ff56f6`，工作樹乾淨。
- 本輪程式 anchor: `ff99b6e69`，已普通 push；後續本頁與測試之 anchor SHA 由 machine-truth progress/blocker 記錄。
- Candidate SHA: **未鎖定**；目前仍有 scope 與驗證阻礙，未 handoff。
- Branch: `gemini/sr-env-copy-001-scoped-20260909`。
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-sr-env-copy-001`。
- 既有 PR: https://github.com/ajoe734/drts-fleet-platform/pull/1851 。不 rebase/amend/force-push；未因 dev 前進而同步或改寫既有歷史。

## 來源與實際重現

追溯 `source/findings.json` R27、`source/capabilities.json` C110、execution tasks 主規則及 task runbook。R27 要求由部署設定產生環境標記並清理工程文案；歷史 9/6 audit 並非當前程式真值。

`gh pr view 1851 --json reviews,comments` 回傳兩者皆空。前次 worker-result `codex-20260908T180951Z-cedc7af1.json` 的分支／scope 阻礙部分已由本輪指派解除。實際 CI 阻礙由 `gh run view 34304203659 --log-failed` 讀回：i18n guard 在 bank、fleet、platform-admin 三個 shell 報 21 處 locale ternary 違規。

- CI resource: run `34304203659`，job `102317844633`。
- https://github.com/ajoe734/drts-fleet-platform/actions/runs/34304203659/job/102317844633
- 以上 CI 屬舊 head `9e35f6f14`，不是新 anchor 的成功證據。

以 `git show origin/dev:<path>` 讀回以下三個檔案，用 TypeScript AST 抽出實際 `normalizeHealthStatus`，`ts.transpileModule` 後執行 `normalizeHealthStatus(undefined, true)` 與 `normalizeHealthStatus("future-status", true)`。Node 指令 exit 0；三者兩種輸入都得到 **healthy**：

- `apps/platform-admin-web/components/admin-shell.tsx`
- `apps/ops-console-web/components/ops-health-footer.tsx`
- `apps/fleet-partner-portal-web/components/fleet-portal-health-footer.tsx`

因此未知健康誤標仍存在於本輪 dev，不能當成歷史已修。

## 已提交修正

- bank／fleet／platform-admin shell 的 21 處內嵌文案改用既有 translations keys；缺值或不識別的 shell env label 回退為本地化 unknown。
- platform-admin 健康 adapter 使用 `resolveRuntimeHealth`，新增 unknown 顯示；HTTP 失敗優先為 down。未知狀態使用現有中性 theme token，未新增 palette、字型或改版。
- 新增 `admin-health.test.ts`：執行實際 shell adapter，驗證缺值、null、空字串、不識別字串、物件、陣列，以及明確健康／降級與 HTTP 失敗優先權；檢查雙語 unknown 文案。
- 視覺參照已讀 `packages/ui-tokens/src/realms.ts`、`status.ts`、canvas 的 `Platform Admin.html`、`Bank Console.html`、`Fleet Partner Portal.html`、`mgmt-shell.jsx`。保留既有 chrome 與 realm theme。
- 既有六個 dynamic server layouts 讀取 `DRTS_ENV` 的成果保留。dev workflow frontend env_vars 有 `DRTS_ENV=development`；未執行部署值 live readback，不能推論 staging/prod frontend 已供應值。

## 本輪實際指令結果

| 指令 | Exit | 結果 |
| --- | --- | --- |
| `git diff --check` | 0 | 通過 |
| `git diff 9e35f6f14 --check` | 0 | 本輪累積差異通過 |
| `pnpm run i18n:guard` | 0 | 525 files、10 apps，21 處違規已消除 |
| `pnpm --filter @drts/bank-console-web typecheck` | 0 | 通過 |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck` | 0 | 通過 |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck` | 0 | 通過 |
| `pnpm --filter @drts/platform-admin-web typecheck` | 0 | 通過 |
| `pnpm --filter @drts/tenant-console-web typecheck` | 0 | 通過 |
| `pnpm --filter @drts/ui-web typecheck` | 0 | 通過 |
| `pnpm --filter @drts/ops-console-web typecheck` | 2 | 無法解析 `@drts/control-plane-auth`，另 proxy route:144 unknown 不可指派 string |
| `pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/ packages/ui-web/tests/unit/environment-badge.test.ts --no-file-parallelism --maxConcurrency=1` | 0 | 2 files / 23 tests；root config 沒有執行 package badge test，不能把它算作通過 |
| `pnpm --filter @drts/ui-web test` | 1 | 2 files passed / 14 tests；另外 2 suites 無法解析 `react/jsx-dev-runtime` |
| `pnpm --filter @drts/ui-web exec vitest run tests/unit/environment-badge.test.ts` | 1 | 無法解析 `@drts/ui-tokens`，0 tests |
| `git push origin gemini/sr-env-copy-001-scoped-20260909` | 0 | `9e35f6f14..ff99b6e69` 普通推送 |

依賴診斷：本 worktree 根 node_modules 是 canonical root 的 symlink；ops 的 `@drts/control-plane-auth` 與 ui-web 的 React symlink 指向 `codex-sr-deps-report-font-001` 相對 worktree 路徑。這是觀察到的解析障礙；未修改 shared node_modules、package manifests 或 lockfile。

## 未完成項目與 Supervisor 所需動作

1. **擴充 scope 並檢查 writer 相依**：授權 `apps/ops-console-web/components/ops-health-footer.tsx` 與 `apps/fleet-partner-portal-web/components/fleet-portal-health-footer.tsx`，才能消除已重現的未知健康誤標。兩檔目前不在 write_scopes，owner 未修改。
2. 後續完成既有環境 helpers 的整體一致性稽核：translations helpers 仍有 APP_ENV／NEXT_PUBLIC／NODE_ENV fallback，應依 task 指定的 DRTS_ENV server producer 收斂；tenant／enterprise 缺值 fallback 也需核對。這些授權範圍內的剩餘工作尚未宣稱完成。
3. 修復或提供可用的 isolated dependency tree，重跑失敗的 ops typecheck 與 package tests。
4. 未啟動任何產品／preview server、Playwright 或 Docker；未做 live、瀏覽器、真機、Cloud Run runtime readback。沒有本輪 live resource ID，以上 PR／CI IDs 僅為版本及歷史 CI 證據。
5. 完成以上實作與驗證後才鎖定新的 candidate，獨立 reviewer、同 SHA CI／merge 通過後方可結案。目前 anchors 僅保留進度。
