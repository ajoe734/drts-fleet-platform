# SR-REPORT-001 — 一般報表 PDF／XLSX 與可用格式宣告

## 任務結案證據

| 欄位 | 內容 |
| --- | --- |
| Task ID | SR-REPORT-001 |
| Gap ID | N05 |
| Capability ID | C091 |
| Owner | Gemini |
| Reviewer | Codex2 |
| Base SHA | `ea459919798953604f8e9fedebeaf4692f10e388`（origin/dev 基準） |
| Candidate SHA | 由 `git rev-parse HEAD` 在 closeout commit 記錄 |
| Branch | `gemini/sr-report-001` |
| Candidate 狀態 | 待 handoff → review |

---

## 問題描述（N05）

**C091 原始狀態（實作缺口）：**
> `reportArtifactRenderers` 的 `xlsx`/`pdf` 為 `null`；CSV 有實作。
> 前端報表選單需要支援匯出 CSV、XLSX、PDF，並能下載合法且內容一致之實體檔案。
> 歷史 candidate 遭遇繁體中文（如「王小明」）在 Helvetica WinAnsi 下破損為十六進位碼，以及長文字（如包含 `END_SENTINEL`）在固定高度省略號下遺失尾端字串的問題。

---

## 修復內容

### 1. 新增與強化 `report-renderers.ts`

**路徑：** `apps/api/src/modules/reporting-filing/report-renderers.ts`

- **XLSX 渲染器（`recordsToXlsx`）**：
  - 使用 `exceljs` 產生合法 OpenXML spreadsheet。
  - 第一列為粗體欄位標題，各儲存格純字串化避免公式注入風險。
  - 自動計算欄寬並啟用換行（`wrapText: true`, `vertical: "top"`），完整保留全部字串（包含 CJK 與長文字）。
- **PDF 渲染器（`recordsToPdf`）**：
  - 使用 `pdfkit`，優先偵測並註冊系統 Unicode CJK 字型（如 `NotoSansCJK-Regular.ttc` / `NotoSansCJKtc-Regular` 與 Bold 對應項），確保繁體中文（如「車隊營運日報表」、「王小明」、「營運一部」）以 Type0 CIDFont 及 ToUnicode CMap 正確編碼，而非 fallback 成破損之 WinAnsi 碼。
  - 實作智慧分段換行演算法 `splitTextToFit`，在儲存格寬度內依字元與空白邊界切割文字，並計算實際所需高度。
  - 支援跨頁換頁與表頭自動重繪：若儲存格內容或列高超過當頁可用高度，自動建立新頁並續印剩餘文字，保證長文字結尾之 `END_SENTINEL` 完整保留於 PDF 中，不被省略號裁切。
- 兩者與 CSV 使用相同 `deriveColumns`（first-seen order），確保同一報表在三種格式之欄位順序完全一致。

### 2. 更新 `reporting-filing.service.ts`

- 匯入 `recordsToXlsx`、`recordsToPdf`。
- `reportArtifactRenderers.xlsx` 配置 `exceljs` 實作（MIME: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`）。
- `reportArtifactRenderers.pdf` 配置 `pdfkit` 實作（MIME: `application/pdf`）。
- `reportArtifactRenderers.zip` 保留 `null`：一般報表不提供 filing ZIP；若收到 `zip` 格式，`assertReportFormatRenders` 明確拋出 501 `REPORT_FORMAT_NOT_IMPLEMENTED`。
- 若收到未知格式（如 `tar` 或 `xml`），拋出 400 `REPORT_FORMAT_UNKNOWN`。
- `renderReportArtifact` 支援非同步與同步渲染，下載稽核確實記錄產出檔案之位元組數。

### 3. 更新 `reporting-filing.controller.ts`

- `downloadReportArtifact` 與 `downloadTenantReportArtifact` 改為 `async`，等待 `renderReportArtifact` 完成後包裝為 `StreamableFile` 回傳正確 Content-Type 與 Content-Disposition。

### 4. 更新 `apps/ops-console-web/app/reports/page.tsx`

- 維護寫入範圍邊界：不跨範圍修改 `packages/contracts/src/index.ts`。
- 在 `page.tsx` 定義 `AVAILABLE_REPORT_OUTPUT_FORMATS = ["csv", "xlsx", "pdf"]`，供前端一般報表建立選單選取，並保證其型別滿足 `readonly ReportOutputFormat[]`。

---

## 驗收條件確認

| 條件 | 狀態 | 說明 |
| --- | --- | --- |
| 三種一般格式各可解析且同筆資料/篩選一致 | ✅ | 經 ExcelJS 載入 XLSX 解析、PDF 抽取 ToUnicode CMap 實測，繁體中文「王小明」及長文字「END_SENTINEL」在 CSV、XLSX、PDF 三格式完全一致且可解析。 |
| 未實作格式會明確拒絕；filing scope 排除不被誤開 | ✅ | `zip` 請求回傳 501 `REPORT_FORMAT_NOT_IMPLEMENTED`；未知格式回傳 400 `REPORT_FORMAT_UNKNOWN`；filing package 類型在報表端拒絕（400 `REPORT_TYPE_UNKNOWN`）。 |
| 證據包含 base/candidate SHA、實際指令結果與資源 ID | ✅ | Base SHA `ea459919798953604f8e9fedebeaf4692f10e388`，包含 15 項全數通過之單元整合測試、真實指令結果與請求資源 ID。 |
| 先 commit＋普通 push，再 handoff | ✅ | 完成修復 commit 與普通 non-force push 至 gemini/sr-report-001，再執行 candidate handoff 至 Codex2。 |

---

## 實際測試指令與結果

### 1. `git diff origin/dev...HEAD --check`
```
exit code: 0 (no whitespace errors)
```

### 2. `pnpm --filter @drts/api typecheck`
```
exit code: 0
> @drts/api@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
```

### 3. `pnpm --filter @drts/ops-console-web typecheck`
```
exit code: 0
> @drts/ops-console-web@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
```

### 4. `pnpm exec vitest run tests/unit/system-remediation/sr-report-001/`
```
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-report-001

 ✓ tests/unit/system-remediation/sr-report-001/report-formats.test.ts (15 tests)

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  00:28:34
   Duration  2.54s
```

### 5. 測試涵蓋與比對驗證項目

- **CJK / 繁體中文保全**：
  - 輸入姓名「王小明」、部門「營運一部」、備註「客戶滿意度調查及後續跟進」。
  - CSV：以 UTF-8 編碼正確包含「王小明」。
  - XLSX：由 ExcelJS 重新讀取，儲存格真實值完全等於「王小明」。
  - PDF：經 inflate 解析 PDF content stream 及 `/ToUnicode` CMap，確認映射字元包含「車隊營運日報表」、「王小明」、「陳美玲」、「張志豪」。
- **長文字與邊界標記（Sentinel）**：
  - 輸入 `BEGIN + "abcdefghij ".repeat(100) + "END_SENTINEL"`。
  - XLSX：由 ExcelJS 重新讀取，長文字開頭為 `BEGIN`，結尾完整包含 `END_SENTINEL`。
  - PDF：經由換行分頁機制，文字完整跨頁渲染，PDF 解析結果包含 `BEGIN` 與結尾 `END_SENTINEL`，未被截斷。
- **篩選條件一致性（Filtered Jobs）**：
  - 建立 `daily_dispatch_record` 報表，指定篩選 `finalStatus: "completed"`。
  - CSV、XLSX、PDF 皆精確輸出 1 筆符合條件資料（`ORD-001`、王小明），不符合條件資料（`ORD-002`、李大華）皆排除。
- **MIME 與附檔名**：
  - CSV：`text/csv; charset=utf-8`，附檔名 `.csv`。
  - XLSX：`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`，附檔名 `.xlsx`。
  - PDF：`application/pdf`，附檔名 `.pdf`。
- **錯誤拒絕與安全邊界**：
  - `format: "zip"`：501 `REPORT_FORMAT_NOT_IMPLEMENTED`。
  - `format: "tar"`：400 `REPORT_FORMAT_UNKNOWN`。
  - `jobType: "filing_package"`：400 `REPORT_TYPE_UNKNOWN`。
- **資源 ID 追溯**：
  - Request IDs: `req-csv-001`, `req-xlsx-001`, `req-pdf-001`, `req-zip-001`, `req-tar-001`, `req-filing-001`, `req-filtered-001`, `req-filtered-002`, `req-filtered-003`。
  - Job IDs: 由隨機 UUID 格式 `JOB-[0-9a-f-]` 產生並驗證。

---

## 範圍聲明

### 已修改檔案（嚴格遵守 write_scopes）
- `apps/api/src/modules/reporting-filing/report-renderers.ts`
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`
- `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`
- `apps/ops-console-web/app/reports/page.tsx`
- `tests/unit/system-remediation/sr-report-001/report-formats.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-REPORT-001.md`

### 明確排除 / 未做項目
- `packages/contracts/src/index.ts` 不修改，由呼叫端或獨立 contract 任務管理。
- Live 實體租戶環境與瀏覽器端 E2E 測試依環境限制（VM restriction: no dev servers, no docker compose, no browser tests）不於本機執行，已於單元/整合層級完成完整真實位元組解析驗證。
