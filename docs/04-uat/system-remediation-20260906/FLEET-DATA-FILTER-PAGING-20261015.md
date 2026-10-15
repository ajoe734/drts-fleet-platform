# FLEET-DATA-FILTER-PAGING-20261015 — Source 修復證據

Owner: Codex · Reviewer: Codex2 · 2026-10-15

本文件只記錄 C063/C069 本次三個 Source finding。原 SR-FLEET-DATA-001、SR-QA-SUPPLY-001 的 lifecycle credit 保留；不代表全 C063/C069、hosted runtime、Final 或完整 goal 驗收。

## 版本與權威來源

- 原始版本／branch base：`a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1`（dev）。
- 實作 Source 版本：`b2815fd2a7bf6af05404b0dc3da47420df884653`；本次接續 dispatch 補跑驗證版本：`686366f993a84a851be05ed781dc538dc037bd48`（其後只有本證據文件修訂）。
- Candidate branch：`codex/fleet-data-filter-paging-20261015`。最後文件 commit 後再對 exact HEAD 執行候選檢查；完整 candidate SHA、exit codes 與 remote head 記於 `.local/fleet-data-filter-paging-20261015/candidate-validation.json`，並由 `ai-status.sh handoff` 鎖定。文件不以自身內容推算自身 commit SHA。
- 原 task spec：canonical root `.local/remaining-original-functional-fixes-20261015/FLEET-DATA-FILTER-PAGING-20261015.json`；原 finding：`.local/goal-continuation-20261015T0806-focused-unproved-original-Source-root/C063-C069-current-accepted-Fleet-dataflow-readonly-audit.json`。本次為首輪候選，沒有前輪退修。
- 原需求：`source/capabilities.json` C063「總覽 KPI 與司機／車輛清單一致」及 C069「篩選 query、總數、分頁與 CSV 同條件」。
- 正式 subtype 契約：`packages/contracts/src/index.ts` 的 `FleetPartnerPortalTripRecord.businessDispatchSubtype`；producer：`apps/api/src/modules/fleet-partner/fleet-partner.service.ts` 的 `listPortalTrips`。
- SDK：`ApiClient.listFleetPortalTrips`／`getList` 保留 snake/camel normalization。測試 mock HTTP 回應與 server client 身分解析邊界，執行真正 SDK、mapper、filter、頁面、table、badge、CSV route；沒有 mock 掉被驗證邏輯。
- 司機顯示權威：原版 `fleet-portal-data.server.ts` 的 `mapDriverStatus` → `mapDriver` → `loadDrivers`，由 `DriversTable` 呈現。`suspended`／`incident_hold` 原已投影為 `offline`；本次讓總覽採相同投影，沒有修改 workState、presence、lifecycle、dispatchEligible 或 permission。
- 完整 roster 權威：backend `listPortalDrivers` 按 `fleetPartnerId` 回傳 affiliation 列，`getPortalDashboard.activeDriverCount = drivers.length`。前端保持完整列與 affiliation 計數，不去重、不套用畫面 q/tab。aggregate 的 `workState !== offline` 在线數仍只在清單不可用時保留既有 fallback；錯誤來源仍公開。
- 分頁慣例：`app/host/vehicles/page.tsx` 既有 `PAGE_SIZE = 20` 與 `components/host/host-page-footer.tsx` 的上一頁／下一頁 Link。新增 Fleet 本地 composition，未改共用 UI、SDK 或 backend。

## Finding／acceptance 對照

| Finding／驗收項                                             | 原始碼依據與修改位置                                                                                                                  | 舊版重現 → 修正版結果                                                                                                                                                                                                          | 命令、退出碼、版本與證據                                                                                                  | 未驗與具體限制                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1／`fleet-data_existing-service-filter-and-CSV`            | `mapTripService`、`loadTrips`；真正 `FleetTripsPage`／`TripsTable`／`SvcChip`／export `GET`                                           | 原 mapper 將合法 insurance/travel 映為 realtime；修正版四個 subtype 保留四種分類，null/absent subtype 保留 realtime；同條件 badge、列與 CSV 相符                                                                               | 下方 R1 舊版 exit 1；R2 修正版 exit 0。新案例含兩種 wire casing、保險／旅行社各 25 筆跨頁與全量 CSV                       | HTTP／身分邊界受控；不是 live provider 或正式身分驗收                                                                                                   |
| F2／`fleet-data_same-filter-count-pagination-and-export`    | 新 `lib/fleet-trip-pagination.ts`；`app/trips/page.tsx` 先 q/status/service 再 slice；export route 共用原 scope/filter、保持 unsliced | 舊版 business 同條件 45 筆全出一頁；修正版 20/20/5，45 total 與跨服務 badges 保留；Prev/Next 保留 period/svc/status/q；tabs／GET 搜尋表單清除 page；CSV 45 筆                                                                  | R1、R2；測到實際 Link href、表單 hidden inputs、table rows 與 CSV，另覆蓋 invalid/stale page、unknown service、zero/error | DOM consumer regression，不是瀏覽器導航／SSR hosting；未在 VM 起服務                                                                                    |
| F3／`fleet-data_original-overview-list-display-consistency` | `loadDashboard` 成功-list 分支採完整 `driversView.rows` 與既有 `mapDriverStatus`；`app/page.tsx`／dashboard alias／drivers 頁實際消費 | 同源 available/paused/on_trip/offline/suspended/incident_hold：舊 aggregate 在線 5／離線 1、清單在線 3／離線 3；修正版總覽 3／3，aggregate 不可用也 3／3；搜尋僅見 suspended 一列時完整數仍 6；同司機第二 affiliation 仍增為 7 | R1、R2；更新原 SR-QA 的 stale aggregate 128→2 assertion；原 CSV grouped-number fixture 改為完整 1250 列真 roster          | list 失敗仍保留 aggregate 6／5／1 與 driversError；雙失敗顯示 —；live empty 顯示 0。dispatchable aggregate 優先規則未變                                 |
| `fleet-data_exact-candidate-validation`                     | 下列 impacted tests、app/root typecheck、lint、repository guards                                                                      | 本機 Source checks 與 exact HEAD 紀錄分開；mandatory hosted CI／review／merge 不冒充本機 pass                                                                                                                                  | R2–R5 與 candidate-validation.json；最終 SHA 由 machine handoff 記錄                                                      | handoff 後由原 GitHub bus 建 PR、啟動 exact-candidate mandatory CI，Codex2 獨立 review、protected merge、各 required key acceptance 尚待 lifecycle 收錄 |

## 可重跑命令與結果

證據目錄：本 task isolated worktree 的 `.local/fleet-data-filter-paging-20261015/`；交接前將日誌與 JSON 同步至 canonical root `/home/lupin/workspace/drts-fleet-platform/.local/fleet-data-filter-paging-20261015/`，供獨立 reviewer 讀取。前次 dispatch 引用的本機日誌已不存在，因此本次重新執行以下驗證，不以舊摘要作通過證據。以下本輪啟動的命令均讀取結束結果後才交接；執行 SHA、exit、日誌 hash 與最終 candidate 核對記於 `candidate-validation.json`。

### R1 — 同一測試在原始 Source 上失敗

使用 `git archive a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1` 解至 evidence 目錄 `baseline/`，加入同一份新 regression，連結本 worktree 的鎖定依賴後，在 baseline cwd 執行：

```bash
pnpm exec vitest run tests/unit/fleet-data-filter-paging-20261015 --maxWorkers=1 --testTimeout=30000
```

Exit **1**：15 tests，**13 failed、2 passed**。`baseline-final-suite.log` 包含正式 mapper 的 realtime 分類錯誤、正式 page 的 45 versus 20／46 versus 21 行數差異、總覽 5/1 versus 3/3 與 live-empty 6 versus 0。失敗不是 missing dependency、fixture setup 或 timeout。兩個 pass 是原本 realtime compatibility 與 aggregate-unavailable 顯示 fallback。

相同測試 SHA-256：`d488fdb1859e27663d4aa7035424b501ef6fb9f0d21577a08783f13a18db5f63`；baseline 與修正版測試 hash 一致。沒有 reset 活躍工作樹。

本次最初的依賴 symlink 指向 canonical root，造成 React／Nest／zod／vitest 無法 resolve。修正版、App 與 baseline 的 dependency-failed 日誌分開保留，均 exit 1，不列為行為驗證。僅解除 task worktree 的依賴 symlink，再以本 worktree `CI=true pnpm install --frozen-lockfile`（exit 0）取得隔離依賴；未修改 canonical root 依賴。baseline 連結此安裝後取得上述行為失敗。

### R2 — 受影響整體回歸

```bash
pnpm exec vitest run \
  tests/unit/fleet-data-filter-paging-20261015 \
  tests/unit/system-remediation/sr-fleet-data-001 \
  tests/unit/system-remediation/sr-qa-supply-001 \
  tests/unit/fleet-overview-revenue-actions-20261013 \
  tests/unit/fleet-partner-list-envelope.test.ts \
  tests/unit/fleet-partner.service.test.ts \
  --maxWorkers=1 --testTimeout=30000
```

本次補跑版本 exit **0**：**10 files／111 tests passed**，見 `regression-final.log`。前次逐單元窄範圍結果保留於 anchor 歷史，本次直接執行全部受影響案例，不將選擇案例的 skip 算為通過。

### R3 — App 單元測試與型別

```bash
pnpm --filter @drts/fleet-partner-portal-web test --maxWorkers=1 --testTimeout=30000
pnpm --filter @drts/fleet-partner-portal-web typecheck
pnpm typecheck:root
```

本次補跑版本各 exit **0**。App：5 files／21 tests passed（`app-tests.log`）；app typegen + tsc（`typecheck-app.log`）與 root tsc（`typecheck-root.log`）通過。typegen 自動變動的 `next-env.d.ts` 已還原，不加入 scope。

### R4 — Lint／repository checks

```bash
pnpm --filter @drts/fleet-partner-portal-web lint
pnpm exec eslint tests/unit/fleet-data-filter-paging-20261015 \
  tests/unit/system-remediation/sr-fleet-data-001/sr-fleet-data-001.test.ts \
  tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-kpi-dashboard.test.ts --max-warnings=0
pnpm classification:check
pnpm i18n:guard
node tools/ci/check-cross-app-imports.mjs
python3 tools/ci/check_test_coverage.py
git diff --check
```

本次補跑版本各 exit **0**。Lint 證據 `lint-app.log`、`lint-tests.log`；repository guards 結果與命令見 `guards-results.json`。另執行既有 commit trailers、canonical consistency 與 runtime mirror guards，各 exit **0**，分別見 `trailers.log`、`canonical.log`、`runtime-mirror.log`。

### R5 — Exact candidate／交接

最後文件 commit 後，記錄 `git rev-parse HEAD`、branch、base、test hash、每個必要本機命令的執行 SHA／exit／log hash，再普通 non-force push，核對 remote branch head。只改本證據文件時，以所有實作及測試檔的 tree blob 一致性確認前述本機結果適用；最終 SHA 再執行 diff、trailers、canonical consistency、runtime mirror guards。完整 mandatory hosted CI 仍必須驗同一最終 candidate，不以 tree 一致性取代。

本次不手動建立另一條 CI／merge 路徑。依 `github_bus.py:upsert_review_pr`，machine `handoff` 到 review 才建立正常 task PR、啟動 mandatory CI；CI 可能尚未開始或 pending，均不可算綠燈。由 bus 以相同 candidate SHA 收錄 CI 和 merge，Codex2 只審鎖定候選。Owner 不呼叫 done、不代填 reviewer／Supervisor acceptance key。

## 執行邊界

未啟動 product dev／preview／HTTP／browser／E2E／PG／Docker infrastructure。`pnpm check` 含 Docker Compose 及完整 DB checks，因此沒有在本 VM 執行；改跑上列適用的 repository checks。完整 repository CI 的 lint/typecheck/unit/正式 schema PG 等由既有 hosted workflow 保持 mandatory。本機測試不等同 shared-dev 部署、真身份、provider、native 或人工驗收。
