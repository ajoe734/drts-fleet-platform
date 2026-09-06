# SR-REPORT-001 — 一般報表 PDF／XLSX 與可用格式宣告：完成證據

- Task: `SR-REPORT-001`
- Owner: `Gemini2`
- Reviewer: `Gemini`
- Base SHA (`origin/dev`): `7dccddaba7d51dca8d56da01d5320d9f22f8b68f`
- Worktree: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-report-001`
- Branch: `gemini2/sr-report-001`

---

## 1. 問題根因與修復目標盤點（N05, C091）

本次修復針對 2026-09-06 UAT 觀察與系統補強計畫（N05 缺失、C091 能力項）解決下列問題：

1. **報表可用格式宣告與實作脫節**
   - 原系統僅實作了 CSV 產生器，XLSX、PDF 與 ZIP 雖然存在於契約宣告中，但未實作任何位元組渲染器（先前若呼叫會拋出 `REPORT_FORMAT_NOT_IMPLEMENTED`）。
   - 前台 UI 存在不一致的格式宣告，缺少明確限定「已實作且可用」的匯出選項。

2. **試算表公式注入（Formula Injection / CSV/XLSX Injection）風險**
   - 當資料內容（如車牌、營業區、文字說明）以 `=`, `+`, `-`, `@` 開頭時，使用者以 Microsoft Excel、LibreOffice 等軟體開啟可能被執行惡意公式。
   - 需確保 CSV 與 XLSX 輸出全面中立化此類字元（單引號 `'` 前綴逃逸）。

3. **格式平權與非均質 row 結構相容**
   - PRD 9.10.1 所規範之 9 大類法規報表與營運報表，在 CSV、XLSX、PDF 三種格式間須保持資料欄位順序與內容一致。
   - 面對稀疏欄位或動態物件（非均質 row），不可遺失後續出現的欄位，且空值需妥善填補。

4. **明確排除 Filing Package 偽造位元組**
   - 遵從監管申報架構（SD-DP-20260820-012），Filing Package 維持不可變 manifest/hash metadata 結構，不在一般報表工作流中偽造假簽章或未經審核之法規申報 PDF/ZIP 位元組。

---

## 2. 核心實作說明

### 2.1 XLSX 渲染器 (`apps/api/src/modules/reporting-filing/report-xlsx.renderer.ts`)

- 採用標準 `exceljs` 套件，生成真正的 OpenXML Spreadsheet (.xlsx) 位元組檔案。
- MIME Type 明確設定為 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`。
- 支援標準 `job.rows` 以及特化之 `job.partnerRevenueRows`。
- 動態聯集所有資料列的欄位鍵名（以 first-seen 順序排列），確保各列稀疏欄位不漏失。
- 樣式增強：
  - 凍結首行標題（`ySplit: 1`）。
  - 標題列背景填色與粗體字型。
  - 隔行淺灰斑馬紋（zebra-striping）提升可讀性。
  - 根據內容自動估算適當欄寬（最小 12，最大 50 字元）。
- 安全性：
  - 對以 `=`, `+`, `-`, `@` 開頭之字串自動前綴單引號 `'`，中立化公式注入風險。

### 2.2 PDF 渲染器 (`apps/api/src/modules/reporting-filing/report-pdf.renderer.ts`)

- 採用標準 `pdfkit` 套件，串流產生標準 PDF-1.3+ 位元組流。
- MIME Type 明確設定為 `application/pdf`。
- 版面配置：
  - 採用 A4 橫向（landscape）排版，最大化表格欄位顯示空間。
  - 頁首包含報表標題與元資料摘要資訊（報表類型、Job ID、租戶、產生時間、總列數）。
  - 自動表格排版、表頭灰色底色、交替隔行淺色斑馬紋。
  - 自動跨頁處理（auto-pagination），頁尾附帶頁碼（Page X of Y）與平台識別資訊。
- 安全性與字元相容：
  - 提供 WinAnsi 安全字元過濾，防止字型編碼例外。

### 2.3 後端服務與 Controller 整合 (`reporting-filing.service.ts` & `reporting-filing.controller.ts`)

- `reportArtifactRenderers`:
  - `csv`: 沿用既有 `recordsToCsv` 邏輯。
  - `xlsx`: 掛載 `renderReportXlsx`。
  - `pdf`: 掛載 `renderReportPdf`。
  - `zip`: 維持 `null`，調用時明確拒絕 `REPORT_FORMAT_NOT_IMPLEMENTED`。
- `renderReportArtifact`:
  - 支援非同步 Renderer（回傳 `Promise<ReportArtifact>`），同時以 Thenable 模式向下相容同步呼叫屬性存取（`.buffer`, `.contentType`）。
  - 下載稽核日誌正確記錄真實渲染後之位元組大小（`byteLength`）。
- Controller：
  - `downloadReportArtifact` 與 `downloadTenantReportArtifact` 改為 `async/await`，支援非同步產生器。

### 2.4 前台 Ops Console 格式宣告 (`apps/ops-console-web/app/reports/page.tsx`)

- 明確宣告可用輸出格式常數：
  ```typescript
  export const OFFERABLE_REPORT_OUTPUT_FORMATS: readonly ReportOutputFormat[] =
    ["csv", "xlsx", "pdf"];
  ```
- 報表匯出對話框（`ReportJobComposerModal`）之格式選擇器僅呈現這三種已實現格式，杜絕無效選項（如 zip）。

---

## 3. Write Scopes 遵循檢查

嚴格僅修改指定的 4 處 Write Scopes：

1. `apps/api/src/modules/reporting-filing/`:
   - `report-xlsx.renderer.ts` (新建)
   - `report-pdf.renderer.ts` (新建)
   - `reporting-filing.service.ts` (修改)
   - `reporting-filing.controller.ts` (修改)
2. `apps/ops-console-web/app/reports/`:
   - `page.tsx` (修改)
3. `tests/unit/system-remediation/sr-report-001/`:
   - `general-report-renderers.test.ts` (新建)
4. `docs/04-uat/system-remediation-20260906/SR-REPORT-001.md` (新建，本證據文件)

未碰觸任何其他模組或專案共用套件。

---

## 4. 驗證指令與執行日誌（全數 Exit Code 0）

### 4.1 Git Diff 檢查

```bash
$ git diff --check
# exit code: 0 (clean, no whitespace issues)
```

### 4.2 後端 API 模組 Typecheck

```bash
$ pnpm --filter @drts/api typecheck
> @drts/api@0.1.0 typecheck /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-report-001/apps/api
> tsc -p tsconfig.json --noEmit
# exit code: 0
```

### 4.3 前端 Ops Console 模組 Typecheck

```bash
$ pnpm --filter @drts/ops-console-web typecheck
> @drts/ops-console-web@0.1.0 typecheck /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-report-001/apps/ops-console-web
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
# exit code: 0
```

### 4.4 本任務專屬單元測試套件

```bash
$ pnpm exec vitest run tests/unit/system-remediation/sr-report-001/

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-report-001

 ✓ tests/unit/system-remediation/sr-report-001/general-report-renderers.test.ts (7 tests) 544ms
   ✓ SR-REPORT-001: General Report PDF/XLSX and Format Declarations > accepts csv, xlsx, and pdf, but explicitly refuses zip and unknown formats
   ✓ SR-REPORT-001: General Report PDF/XLSX and Format Declarations > renders valid XLSX and PDF artifacts matching CSV data
   ✓ SR-REPORT-001: General Report PDF/XLSX and Format Declarations > neutralises spreadsheet formula injection across CSV and XLSX
   ✓ SR-REPORT-001: General Report PDF/XLSX and Format Declarations > handles non-uniform rows across CSV, XLSX, and PDF without dropping columns
   ✓ SR-REPORT-001: General Report PDF/XLSX and Format Declarations > enforces tenant boundary and job readiness guards on downloads
   ✓ SR-REPORT-001: General Report PDF/XLSX and Format Declarations > renders all 9 PRD 9.10.1 regulatory report types in both PDF and XLSX
   ✓ SR-REPORT-001: General Report PDF/XLSX and Format Declarations > correctly renders partner revenue summary rows into XLSX and PDF

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  15:14:08
   Duration  5.34s (transform 2.92s, setup 0ms, import 4.55s, tests 544ms, environment 0ms)
# exit code: 0
```

---

## 5. 法規報表 9 大類與營運報表覆蓋矩陣

本任務驗證並支援 PRD 9.10.1 規範之 9 大類法規報表與營運報表之 CSV、XLSX、PDF 平權產出：

| 報表類型識別碼 (`jobType`)     | 說明                             | CSV | XLSX | PDF |
| ------------------------------ | -------------------------------- | :-: | :--: | :-: |
| `vehicle_roster`               | 營運車輛清冊 (PRD 9.10.1 #1)     |  ✓  |  ✓   |  ✓  |
| `driver_roster`                | 駕駛人名冊 (PRD 9.10.1 #2)       |  ✓  |  ✓   |  ✓  |
| `vehicle_contract_roster`      | 車輛合約清冊 (PRD 9.10.1 #3)     |  ✓  |  ✓   |  ✓  |
| `insurance_policy_roster`      | 保險單清冊 (PRD 9.10.1 #4)       |  ✓  |  ✓   |  ✓  |
| `vehicle_monthly_delta`        | 車輛增減月報 (PRD 9.10.1 #5)     |  ✓  |  ✓   |  ✓  |
| `six_month_operations_summary` | 半年營運彙總表 (PRD 9.10.1 #6)   |  ✓  |  ✓   |  ✓  |
| `fare_version_history`         | 收費標準版本歷程 (PRD 9.10.1 #7) |  ✓  |  ✓   |  ✓  |
| `complaint_case_detail`        | 申訴案件清單 (PRD 9.10.1 #8)     |  ✓  |  ✓   |  ✓  |
| `dispatch_recording_index`     | 通話錄音索引 (PRD 9.10.1 #9)     |  ✓  |  ✓   |  ✓  |
| `trip_summary`                 | 營運趟次摘要報表                 |  ✓  |  ✓   |  ✓  |
| `monthly_trip_report`          | 租戶月度趟次報表                 |  ✓  |  ✓   |  ✓  |
| `revenue_summary`              | 合作夥伴營收拆分摘要報表         |  ✓  |  ✓   |  ✓  |
| `incident_register`            | 事故與異常事件通報登記表         |  ✓  |  ✓   |  ✓  |
| `maintenance_overview`         | 車輛定保與維修總覽表             |  ✓  |  ✓   |  ✓  |
| `daily_dispatch_record`        | 每日派遣紀錄表                   |  ✓  |  ✓   |  ✓  |
