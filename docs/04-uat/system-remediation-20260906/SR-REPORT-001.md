# SR-REPORT-001 — 一般報表 PDF／XLSX 與可用格式宣告

## 交付與追溯

- Owner: Codex；Reviewer: Codex2；PR: https://github.com/ajoe734/drts-fleet-platform/pull/1845
- Branch: `gemini/sr-report-001-scoped-20260909`。
- 本輪 fetch 的 base `origin/dev`: `f004c6e5c53242d643fbaf6e9d4004013e4e6f77`。
- 接手的已發布候選: `44555bc0e3fcfbb7c3eed3d7185f1516eaa9be6c`；保留歷史，以 merge `7b522317a` 納入 dev，沒有 rebase/amend/force push。
- 字型依賴 SR-DEPS-REPORT-FONT-001 已 canonical done，PR #1849、candidate `45f6b86918544740fe52ad6ee7cd84f49c005a5e`、merge `815a5f8c2193b0eda6f27302a0249c19e99824be` 在本輪 base 內。
- 最終 candidate 是本文件提交後 `git rev-parse HEAD` 的 SHA，普通 push 後以 `CANDIDATE_SHA` / `CANDIDATE_BRANCH` 寫入 task machine truth；同 SHA 的 review、CI、merge 尚待 candidate lifecycle，本文不宣告 done。
- 規格：PRD §9.5.6 三種一般格式、§9.10.1 九項報表、§9.10.2 排除 filing bytes；service contracts §3.12 來源與下載治理；execution task SR-REPORT-001、source/new-gaps.json N05、source/capabilities.json C091。9/6 audit 是歷史觀察。

## 最終行為

保留九項 row builders、CSV 與權威 feed providers。一般格式宣告為 csv/xlsx/pdf；XLSX 使用 ExcelJS，PDF 使用 PDFKit，三者共享相同報表 rows 與欄位順序。XLSX 儲存字串值；PDF 換行與跨頁重複表頭，不裁掉長儲存格末尾。

PDF 明確讀取 API 隨附的 `assets/fonts/NotoSansCJKtc-Regular.otf`，以 renderer 的 `__dirname` 解析；source 與 compiled dist 都對應 API assets 目錄，runtime 為 `/app/assets/fonts/`。不探測 `/usr/share/fonts`、不下載字型、不 fallback 至 Helvetica；缺少字型即拒絕 render。字型來源、hash、完整 OFL 授權及 Docker COPY 由依賴 task 交付。

控制器等待非同步 renderer，再回傳 bytes、正確 MIME 與副檔名。服務型別如實使用 `ReportArtifactResult | Promise<ReportArtifactResult>`；CSV 保留同步結果，PDF/XLSX 回傳 Promise，不再以交集型別假稱 Promise 已具有 buffer。

ZIP 回 501 `REPORT_FORMAT_NOT_IMPLEMENTED`，未知格式回 400 `REPORT_FORMAT_UNKNOWN`，filing package 類型在一般報表端回 400 `REPORT_TYPE_UNKNOWN`。沒有新增 filing PDF/ZIP 產物。營運台既有格式選單讀取 implemented-format contract；本候選未修改 UI 外觀、tokens、canvas 或頁面。

## 重現與回歸

當前 base 的 `reportArtifactRenderers` 仍為 `xlsx: null, pdf: null`，缺口未被其他 task 完成。接手候選在本機有系統字型時，改用 PDF.js 的原有 16 tests 仍通過；這不是 Alpine 成功證據。

為重現 reviewer 指出的缺陷，暫時載入 `git show 44555bc0e3fcfbb7c3eed3d7185f1516eaa9be6c:apps/api/src/modules/reporting-filing/report-renderers.ts` 的 renderer，以 try/finally 還原目前內容，執行：

```sh
pnpm exec vitest run tests/unit/system-remediation/sr-report-001/ -t 'uses packaged fonts when host font discovery is unavailable'
```

舊 renderer exit 1，1 failed / 19 skipped；PDF.js 抽字與 `中文報表name王小明` 不符，為亂碼。新 renderer 的同一測試通過且不呼叫主機字型偵測。

移除所有自製 PDF object/CMap/hex 猜字解析，使用 `pdfjs-dist/legacy/build/pdf.mjs`，逐頁讀取標準 text items。新增負向測試確認 Helvetica 中文破損無法被判作王小明；缺字型測試確認拒絕；600 段帶序號的繁中長儲存格跨多頁後，除重複表頭外逐字等於來源，XLSX/CSV 亦完整相等。

## 實際檢查（2026-09-09，Node 22.23.2 / pnpm 10.33.0）

在 supervisor 指定 isolated worktree 移除 node_modules symlink，執行 frozen install 建立獨立依賴，未修改 canonical node_modules 或 package/lockfile。

| 指令 | Exit / 結果 |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | 0；1315 packages |
| `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build` | 0 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-report-001/` | 0；20/20；03:44:19 UTC，4.08s |
| `pnpm exec vitest run tests/unit/reporting-filing.test.ts` | 0；31/31 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-report-001/ tests/unit/reporting-filing.test.ts` | 0；51/51；型別修正後 03:43:01 UTC |
| `pnpm --filter @drts/api typecheck` | 0 |
| `pnpm --filter @drts/ops-console-web typecheck` | 0；Next route typegen + tsc，未啟 server |
| `pnpm exec tsc -p tsconfig.json --noEmit` | 0；包含獨立 parser 測試型別 |
| `pnpm exec eslint apps/api/src/modules/reporting-filing/report-renderers.ts apps/api/src/modules/reporting-filing/reporting-filing.service.ts tests/unit/system-remediation/sr-report-001/report-formats.test.ts tests/unit/reporting-filing.test.ts --max-warnings=0` | 0 |
| `pnpm --filter @drts/api build` | 0；含 prebuild |
| `git diff --check` | 0 |

另外以 `node -` 載入 compiled `apps/api/dist/modules/reporting-filing/report-renderers.js`，`process.chdir('/tmp')` 後呼叫 `recordsToPdf([{name:'王小明'}], '中文報表')`，PDF.js 解析並 `assert.equal(text, '中文報表name王小明')`。這是 compiled-module smoke，不是容器或 live server 測試。

### 實際測試資源

以下為 03:44:19 UTC 測試中服務實際建立的 in-memory job/artifact IDs，依序 CSV、XLSX、PDF。它們不是 live tenant 或永久儲存資源。

| Format | Job ID | Artifact ID |
| --- | --- | --- |
| CSV | JOB-622bccae-f350-4422-a412-8e6569cdff10 | ART-1298fb88-9328-4c8b-b40d-a5adbe08a289 |
| XLSX | JOB-468fbd11-566c-4cd8-b597-48692692dfa4 | ART-bebe5e36-261a-4ac8-a381-cf35b25dd2ce |
| PDF | JOB-2d238a50-7a51-48f7-b7cb-35afdc8332f3 | ART-210817dc-46fa-4623-a3bd-56aa41eedadd |

測試 feed 提供 ORD-001 completed 王小明及 ORD-002 cancelled 李大華；三個 job 皆使用 `finalStatus: completed`。CSV/XLSX 解析 rows 完全一致，PDF 抽字含 ORD-001/王小明，不含 ORD-002/李大華。產品仍從原有 providers 取資料，測試資料未注入產品。

## 未执行部分與交接

本 VM 未啟動產品 server、preview/browser server、Playwright、Docker/Compose；未執行 live 租戶下載、真機、正式受控 artifact storage、Alpine image runtime 或部署驗收。這些不能以單元測試、靜態 Docker COPY 或本機 compiled smoke 冒充。

本候選只修改授權 reporting-filing、一般格式 contract 宣告、相關中央斷言、專屬測試與本文。普通 push 後 handoff Codex2；owner 不呼叫 done，同候選 CI/review/merge 由 supervisor lifecycle 處理。
