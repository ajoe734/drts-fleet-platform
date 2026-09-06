# SR-ADMIN-VERIFY-001 — P5／車隊清單回歸證據

Owner：Codex2；獨立 reviewer：Codex。日期：2026-09-06 UTC。

## 版本與追溯

- 工作分支：`codex2/sr-admin-verify-001`，使用 supervisor 指定的 isolated worktree。
- Fetch 後 base：`afefd55d3d23dd361d2dd81fd5f80eedb6671002`；收尾 fetch 時 `origin/dev` 仍為此 SHA。
- 已合併修復：`4675ff47a3d79e30b1ba7968c04a41417a0368d5`，PR #1617 / FIX-P5-RECORDS-001。
- 最後程式／測試 commit：`a6a52034b3b1b0cfb239bebd8af64b66df1e7be4`。本證據文件在其後提交；**最終 candidate SHA 以 handoff 的 `CANDIDATE_SHA` 為準**，不是把此程式 commit 冒充最終文件 commit。Owner 在 handoff 註記寫入最終完整 SHA、分支與檢查結果。
- 初次成功 browser run 觀察 HEAD：`f960caae10c5fa69509c98123a8ae120d27f0e56`；當時已執行的 runner 訊息比對修正隨後提交為 `a6a52034b…`。最終 candidate 提交後再跑一次 browser／指定檢查，結果記入 handoff。
- [R03、R04](source/findings.json)、[C093、C101](source/capabilities.json)；R03/C093 是 P5，R04/C101 是車隊。
- 歷史 audit SHA `08b7a32f6fdaa00d8d1894f91569a7d72860cec2` 僅供追溯。此任務沒有重做 IAM grants、API client envelope 或退回 #1617 修復。

取得最終 machine truth：

```bash
/home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-99f7e0e56/tools/development-orchestrator/bin/ai-status.sh show SR-ADMIN-VERIFY-001
```

## 重現與修正

目前 base 的 fleet 四個 list 已使用 `ApiClient.getList`。新回歸以正式 `toApiSuccessEnvelope(toApiListData(...))`、實際 ApiClient 與 fleet normalizers，驗證清單、空清單、編碼後 resource ID 及 403/503 不被吞成空陣列。

P5 base 仍將 `calculateRetentionCoverage([])` 算成 `{covered:0,total:0,percent:100}`，console 無條件顯示該百分比。因此 loading、403/503、成功零筆都可能顯示假 100%；error 後還同時呈現 empty，讀取權限標籤也可能仍顯示 available。

本次僅修頁面顯示與 feature-local helper：

- P5 成功且非空時才計算可顯示的覆蓋率；loading、error、無權及空清單顯示既有 `Unavailable` 翻譯。成功零筆仍顯示真正的 0 筆與 empty。
- P5 拒絕／失敗不再同時宣稱成功零筆；403 將 read authority 呈現為 not granted。
- Fleet 失敗時不顯示假的空清單，既有成功載入的資料仍保留；刷新失敗不會清空表格。
- 覆蓋率只描述目前查詢回傳紀錄的 730 日保存欄位符合比例，並非全平台所有已完成行程的完整性證明。

設計核對來源：`packages/ui-tokens/src/realms.ts`、`platform-screens-2.jsx` 的既有 fleet 元件，以及 `platform-mtx-commerce.jsx` 的 P5-COM-UI-04/05 與 `platform-p5.jsx` 的 P5-A05。保留現有 Canvas 元件、realm theme、排版及雙語字串；沒有增加配色、CSS、畫面或假業務資料。Canvas 範例的 100% 不是沒有資料時的事實。

## 指令與實際結果

所有指令從 task worktree 執行。未使用 `--passWithNoTests`。

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
