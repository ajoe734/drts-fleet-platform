# SR-ADMIN-VERIFY-001 — P5／車隊清單回歸證據

Owner：Codex2；獨立 reviewer：Codex。日期：2026-09-06 UTC。

## 版本與追溯

- 工作分支：`codex2/sr-admin-verify-001`，使用 supervisor 指定的 isolated worktree。
- 本輪重新派工 fetch 後 base：`3014f9a4942f73f89c0a6f8458dc8b042c1034d0`。首輪歷史 base 為 `afefd55d3d23dd361d2dd81fd5f80eedb6671002`；下方首輪表格保留當時結果，不代表本輪 candidate。
- 已合併修復：`4675ff47a3d79e30b1ba7968c04a41417a0368d5`，PR #1617 / FIX-P5-RECORDS-001。
- 本輪最後測試修正 commit：`a12ee8a5d62c85e396589274c1496d173a79d148`。本證據文件在其後提交；**最終 candidate SHA 以 handoff 的 `CANDIDATE_SHA` 為準**。Owner 在最終 commit 後重跑指定檢查及 browser，將完整 SHA、分支與實際結果寫入 handoff。
- 被本輪取代的 candidate：`c6c7d3a8ade806070ff53d60c4fe76ce08512e84`，沿用 [PR #1638](https://github.com/ajoe734/drts-fleet-platform/pull/1638)。其 CI 失敗原因與本輪修復見下節；舊 CI 不作為新 candidate 的成功證據。
- 初次成功 browser run 觀察 HEAD：`f960caae10c5fa69509c98123a8ae120d27f0e56`；當時已執行的 runner 訊息比對修正隨後提交為 `a6a52034b…`。最終 candidate 提交後再跑一次 browser／指定檢查，結果記入 handoff。
- [R03、R04](source/findings.json)、[C093、C101](source/capabilities.json)；R03/C093 是 P5，R04/C101 是車隊。
- 歷史 audit SHA `08b7a32f6fdaa00d8d1894f91569a7d72860cec2` 僅供追溯。此任務沒有重做 IAM grants、API client envelope 或退回 #1617 修復。

取得最終 machine truth：

```bash
/home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-99f7e0e56/tools/development-orchestrator/bin/ai-status.sh show SR-ADMIN-VERIFY-001
```

## 本輪 CI 修復與最新 base 重驗

2026-09-06 重新派工時，PR #1638 的 [CI integration typecheck](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34016593979/job/101441362894) 與 [Product smoke acceptance](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34016593898/job/101441354966) 同因 `p5-records.test.ts:106` 的 TS2352 失敗：HTTP 測試 context 只實作 guard 使用的方法，直接轉成完整 `ExecutionContext` 未通過根目錄 `tsc`。兩個 aggregate failure 均來自此錯誤。首輪只跑 app typecheck，未覆蓋根目錄測試的 TypeScript 檢查；此處補上，不將首輪 typecheck 的成功擴大解讀為整個 CI 通過。

本輪僅在該測試將局部替身明確轉成 `unknown` 後再轉為 guard context 型別，並說明 HTTP transport 的界線；仍執行原本的 `BootstrapAuthGuard`、controller 與 403/service-not-called 斷言。沒有改 IAM grants、ApiClient、service、UI 行為或測試預期。

已依規範 `git rebase origin/dev`（exit 0）。因舊 candidate 已推送，再以普通 merge 保留 `c6c7d3a8…` 的 ancestry；`git diff --exit-code HEAD^ HEAD` 在該 merge commit exit 0，確認 merge 未改 rebase 後內容。`git push origin HEAD:refs/heads/codex2/sr-admin-verify-001` exit 0，遠端由 `c6c7d3a8…` 前進至 `a12ee8a5d…`，未 force push。

本輪第一次本機 `pnpm run typecheck:root` exit 2，除 TS2352 外亦暴露 worker 的 `apps/platform-admin-web/node_modules` 整體連向 canonical 工作樹，導致載入另一版 ApiClient（private `getList`／不同 private `baseUrl`）。只將該 ignored symlink 換成本地目錄，五個 `@drts` dependency links 指向本 worker `packages/*`，外部依賴沿用現有解析目標；canonical dependency links、manifest、lockfile 與 tracked config 均未修改。`readlink -f apps/platform-admin-web/node_modules/@drts/api-client` 現為本 worktree 的 `packages/api-client`；`git status --short` 為空。下表均在隔離後執行。

| 指令                                                                                                                                                                                                            | Exit | 實際結果                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| `git fetch origin dev`                                                                                                                                                                                          | 0    | 本輪 base／收尾 fetch 為 `3014f9a4942f73f89c0a6f8458dc8b042c1034d0` |
| `git merge-base --is-ancestor 4675ff47a3d79e30b1ba7968c04a41417a0368d5 origin/dev`                                                                                                                              | 0    | #1617 仍在最新 base ancestry                                        |
| `git diff --exit-code origin/dev HEAD -- packages/api-client packages/contracts apps/api`                                                                                                                       | 0    | 沒有重做共用修復；新 base 的其他任務內容原樣保留                    |
| `pnpm run typecheck:root`                                                                                                                                                                                       | 0    | 根目錄測試 TypeScript 通過，TS2352 已排除                           |
| `pnpm --filter @drts/platform-admin-web typecheck`                                                                                                                                                              | 0    | route typegen 與 app TypeScript 通過                                |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-verify-001/ tests/unit/fleet-partner-list-envelope.test.ts tests/unit/p5-records-operations-ui.test.ts tests/security/iam-route-inventory.test.ts` | 0    | 5 files／48 tests passed，2026-09-06 06:44:51 UTC 開始，7.29 秒     |
| `pnpm exec prettier --check tests/unit/system-remediation/sr-admin-verify-001/p5-records.test.ts`                                                                                                               | 0    | All matched files use Prettier code style                           |
| `pnpm exec eslint tests/unit/system-remediation/sr-admin-verify-001/p5-records.test.ts --max-warnings=0`                                                                                                        | 0    | 無錯誤／警告                                                        |
| `node --check tests/unit/system-remediation/sr-admin-verify-001/browser-check.mjs`                                                                                                                              | 0    | runner 語法通過                                                     |
| `git diff --check`                                                                                                                                                                                              | 0    | 無 whitespace error                                                 |

以文末所列的 base 重現指令，將 `base` 換成本輪 `3014f9a4942f73f89c0a6f8458dc8b042c1034d0`，exit 0，仍實際輸出 `{"covered":0,"total":0,"percent":100}`，確認 scope 內既有 UI 修正仍有必要。最終文件 commit 後的指定 Vitest／typecheck／browser 執行結果與 candidate SHA 寫入 handoff；尚未執行的最終 candidate CI、merge、live／真機驗收不在本表冒稱成功。

## 重現與修正

目前 base 的 fleet 四個 list 已使用 `ApiClient.getList`。新回歸以正式 `toApiSuccessEnvelope(toApiListData(...))`、實際 ApiClient 與 fleet normalizers，驗證清單、空清單、編碼後 resource ID 及 403/503 不被吞成空陣列。

P5 base 仍將 `calculateRetentionCoverage([])` 算成 `{covered:0,total:0,percent:100}`，console 無條件顯示該百分比。因此 loading、403/503、成功零筆都可能顯示假 100%；error 後還同時呈現 empty，讀取權限標籤也可能仍顯示 available。

本次僅修頁面顯示與 feature-local helper：

- P5 成功且非空時才計算可顯示的覆蓋率；loading、error、無權及空清單顯示既有 `Unavailable` 翻譯。成功零筆仍顯示真正的 0 筆與 empty。
- P5 拒絕／失敗不再同時宣稱成功零筆；403 將 read authority 呈現為 not granted。
- Fleet 失敗時不顯示假的空清單，既有成功載入的資料仍保留；刷新失敗不會清空表格。
- 覆蓋率只描述目前查詢回傳紀錄的 730 日保存欄位符合比例，並非全平台所有已完成行程的完整性證明。

設計核對來源：`packages/ui-tokens/src/realms.ts`、`platform-screens-2.jsx` 的既有 fleet 元件，以及 `platform-mtx-commerce.jsx` 的 P5-COM-UI-04/05 與 `platform-p5.jsx` 的 P5-A05。保留現有 Canvas 元件、realm theme、排版及雙語字串；沒有增加配色、CSS、畫面或假業務資料。Canvas 範例的 100% 不是沒有資料時的事實。

## 首輪歷史指令與實際結果

以下為本輪 CI 修復前的歷史結果，對應首輪 `afefd55d…` base。所有指令從 task worktree 執行。未使用 `--passWithNoTests`。

| 指令                                                                                                                                                                                                                                                                                                              | Exit | 實際結果                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| `git fetch origin`                                                                                                                                                                                                                                                                                                | 0    | base 與收尾 `origin/dev` 都是 `afefd55d…`                        |
| `git merge-base --is-ancestor 4675ff47a3d79e30b1ba7968c04a41417a0368d5 origin/dev`                                                                                                                                                                                                                                | 0    | #1617 已在目前 base ancestry                                     |
| `git diff --exit-code afefd55d3d23dd361d2dd81fd5f80eedb6671002 HEAD -- packages/api-client packages/contracts apps/api`                                                                                                                                                                                           | 0    | 沒有重做或回退已合併共用修復                                     |
| `git diff --check`                                                                                                                                                                                                                                                                                                | 0    | 無 whitespace error                                              |
| `pnpm --filter @drts/platform-admin-web typecheck`                                                                                                                                                                                                                                                                | 0    | route typegen、TypeScript 通過；首次環境錯誤見下文               |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-verify-001/`                                                                                                                                                                                                                                         | 0    | 2 files，23 tests passed（fleet 16、P5 7）                       |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-verify-001/ tests/unit/fleet-partner-list-envelope.test.ts tests/unit/p5-records-operations-ui.test.ts tests/security/iam-route-inventory.test.ts`                                                                                                   | 0    | 5 files，48 tests passed                                         |
| `pnpm exec eslint apps/platform-admin-web/app/fleet-partners/page.tsx apps/platform-admin-web/app/platform-admin/p5/records/records-operations-console.tsx apps/platform-admin-web/app/platform-admin/p5/records/records-operations-model.ts tests/unit/system-remediation/sr-admin-verify-001/ --max-warnings=0` | 0    | 無 lint error/warning                                            |
| `pnpm exec prettier --check apps/platform-admin-web/app/fleet-partners/page.tsx apps/platform-admin-web/app/platform-admin/p5/records/records-operations-console.tsx apps/platform-admin-web/app/platform-admin/p5/records/records-operations-model.ts tests/unit/system-remediation/sr-admin-verify-001/`        | 0    | All matched files use Prettier code style                        |
| `node --check tests/unit/system-remediation/sr-admin-verify-001/browser-check.mjs`                                                                                                                                                                                                                                | 0    | runner 語法通過                                                  |
| `node tests/unit/system-remediation/sr-admin-verify-001/browser-check.mjs`                                                                                                                                                                                                                                        | 0    | Chromium 147.0.7727.15，8/8 scenarios，11 API GET，0 page errors |

Browser server 啟動指令：

```bash
pnpm --filter @drts/platform-admin-web exec next dev --webpack --hostname 127.0.0.1 --port 3312
```

Server 顯示 `Ready`，兩個實際頁面均 HTTP 200；測完停止 task 自己啟動的 process。Next 自動改寫的 `next-env.d.ts` 還原，沒有納入任務變更。

Base 的空資料百分比重現指令（exit 0，stdout 如上 `{covered:0,total:0,percent:100}`）：

```bash
node --input-type=module -e 'import { execFileSync } from "node:child_process"; import ts from "typescript"; const base = "afefd55d3d23dd361d2dd81fd5f80eedb6671002"; const source = execFileSync("git", ["show", `${base}:apps/platform-admin-web/app/platform-admin/p5/records/records-operations-model.ts`], { encoding: "utf8" }); const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText; const model = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`); console.log(JSON.stringify({ baseSha: base, emptyRetentionCoverage: model.calculateRetentionCoverage([]) }));'
```

### 初次失敗與修正，未掩蓋

1. 初次 typecheck exit 2：isolated worktree 的 `packages/contracts/node_modules` 缺失，無法解析已在 manifest/lockfile 宣告的 zod。只在本 worktree 建立 ignored dependency link 後重跑通過；沒有修改 manifest、lockfile 或 canonical dependency tree：

   ```bash
   mkdir -p packages/contracts/node_modules
   ln -s /home/lupin/drts-fleet-platform/node_modules/.pnpm/zod@3.25.76/node_modules/zod packages/contracts/node_modules/zod
   ```

2. 一次 combined Vitest 與 ESLint 呼叫各 exit 254（command not found）；共用 node_modules 的 `.bin` 隨後恢復可用，原指令重跑 exit 0。沒有以略過檢查代替通過。
3. Browser 第一輪 exit 1（2/8）：runner 的 header selector 命中多個 CanvasCard header，且錯誤封套缺 `traceId`。第二輪 exit 1（6/8）：fleet 原本渲染 `ApiClientError.message` 包含 HTTP 與完整 body，exact-text 斷言不符。修正 runner selector、canonical error envelope 與 substring 斷言後 8/8 通過，沒有為了測試改寫產品的錯誤契約。

## 場景與資源 ID

以下 ID **都是明示的測試資源**，不是 live DB／正式行程 ID。

| 場景                      | 受控 HTTP 結果            | 實際斷言                                                                                         |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| fleet populated + refresh | 200 → 200 → 403           | `browser-only-fleet-partner-001` 可載入與重整；最後拒絕有 banner、保留先前資料、無 empty         |
| fleet empty               | 200                       | 顯示真正 empty，沒有表格或 map crash                                                             |
| fleet denied              | 403                       | 顯示錯誤及測試訊息，不顯示 empty                                                                 |
| P5 mixed retention        | 200                       | `browser-only-1-record` / `browser-only-2-record`，730/729 日，畫面顯示 50%，可檢視 order detail |
| P5 empty                  | 200                       | 0 筆與 empty，覆蓋率 Unavailable                                                                 |
| P5 denied                 | 403                       | permission banner、read authority not granted；count/coverage Unavailable，無 empty/table        |
| P5 unavailable            | 503                       | authority unavailable，不冒稱 permission、0 筆或 empty                                           |
| P5 pending refresh        | 200 → pending → 200/empty | 等待 `q=browser-only-refresh` 時停用查詢，隱藏舊 50%；完成後真正 empty                           |

Unit fleet IDs：`sr-admin/fleet test`（驗 URL encoding）、`sr-admin-affiliation`、`sr-admin-driver`、`sr-admin-rule`、`sr-admin-statement`。P5 IDs：`sr-admin-verify-p5-record-001`、`sr-admin-verify-p5-order-001`、`sr-admin-verify-p5-trip-001`、`sr-admin-verify-p5-vehicle-001`、request `sr-admin-verify-p5-request-001`。

P5 unit tests 實際執行現行 IAM catalog、`issueControlPlaneRequestAuth`、`BootstrapAuthGuard`、`MultiTaxiController`、ApiClient 與 model；只有 transport 與 service 返回紀錄受控。具 `multi_taxi_records:read` 可查，僅 `foundation:read` 的身份在 service 被呼叫前即拒絕；503 與 permission 分開。沒有以自行仿造的 grant 判斷取代 guard。

## 驗證界線與交接

- Browser 使用真實本機 Next 頁面與 Chromium，但 API 回應經 route interception；不是 deployed API、正式 IAP/MFA 或 PostgreSQL 驗證。
- 未做 live Cloud Run／公開入口重驗、正式角色登入、真實完成行程、資料保存後台／730 日刪除、實際受控匯出或下載簽章、真機、多瀏覽器及 fleet 新建／編輯／停用全流程驗收。沒有假簽章、假送達或產品 fixture 交付。
- 本任務 required_acceptance 為空；上述界線仍必須保留，不能宣稱整個 C093/C101 的 live 能力已驗收。
- Owner 先 task commit＋普通 push，再以最終 SHA handoff 給 Codex；owner 不執行 done。獨立 review、同 candidate 的 CI／merge 由 lifecycle 接續，本文不構成獨立審查通過或已部署聲明。
