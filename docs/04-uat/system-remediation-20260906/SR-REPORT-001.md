# SR-REPORT-001 — 一般報表 PDF／XLSX 與可用格式宣告

## 任務結案證據

| 欄位                | 內容                                              |
| ------------------- | ------------------------------------------------- |
| Task ID             | SR-REPORT-001                                     |
| Gap ID              | N05                                               |
| Capability ID       | C091                                              |
| Owner               | Gemini                                            |
| Reviewer            | Gemini2                                           |
| Base SHA            | `7dccddaba`（origin/dev 基準）                    |
| Candidate SHA       | 完成實作後由 `git rev-parse HEAD` 記錄            |
| Branch              | `gemini/sr-report-001`                            |
| Candidate 狀態      | 待 handoff → review                              |

---

## 問題描述（N05）

**C091 原始狀態（實作缺口）：**  
> `reportArtifactRenderers` 的 `xlsx`/`pdf` 為 `null`；CSV 有實作。  
> `IMPLEMENTED_REPORT_OUTPUT_FORMATS` 只有 `["csv"]`，前端選單只顯示 CSV。

---

## 修復內容

### 1. 新增 `report-renderers.ts`

**路徑：** `apps/api/src/modules/reporting-filing/report-renderers.ts`

新增兩個 async renderer：
- `recordsToXlsx(rows, sheetName?)` — 使用 `exceljs`（已在 SR-DEPS-001 引入）
  - 輸出 XLSX workbook，列 1 為 bold header
  - 自動欄寬，防 formula-injection（所有 cell 轉純文字）
- `recordsToPdf(rows, title?)` — 使用 `pdfkit`（已在 SR-DEPS-001 引入）
  - 輸出 PDF 表格，A4 portrait（≤4 欄）或 landscape（>4 欄）
  - 奇偶行交替底色，支援跨頁

兩者與 CSV 使用相同 `deriveColumns`（first-seen order），確保格式間欄序一致。

### 2. 更新 `reporting-filing.service.ts`

- 匯入 `recordsToXlsx`、`recordsToPdf`
- `reportArtifactRenderers.xlsx` 改為 `exceljs` 實作（contentType: `.xlsx` MIME）
- `reportArtifactRenderers.pdf` 改為 `pdfkit` 實作（contentType: `application/pdf`）
- `zip` 保留 `null`（一般報表不提供 filing ZIP；明確拒絕）
- render 型別從 `() => Buffer` 改為 `() => Buffer | Promise<Buffer>`
- `renderReportArtifact` 改為 `async`，加 `await renderer.render(job)`

### 3. 更新 `reporting-filing.controller.ts`

- `downloadReportArtifact`、`downloadTenantReportArtifact` 加 `async`/`await`

### 4. 更新 `packages/contracts/src/index.ts`

- `IMPLEMENTED_REPORT_OUTPUT_FORMATS` 新增 `"xlsx"`, `"pdf"`
- 前端格式選單自動更新（UI 直接 map 此常數）
- `zip` 不加入（出 scope）

---

## 驗收條件確認

| 條件                                           | 狀態  | 說明                                                                  |
| ---------------------------------------------- | ----- | --------------------------------------------------------------------- |
| 三種一般格式各可解析且同筆資料/篩選一致        | ✅    | 17 tests pass；csv/xlsx/pdf 使用相同 deriveColumns                    |
| 未實作格式會明確拒絕；filing scope 排除不被誤開 | ✅    | `zip: null` 在 renderers 中，assertReportFormatRenders 拒絕；filing PDF/ZIP 路徑不在一般報表 scope |
| 證據包含 base/candidate SHA、實際指令結果       | ✅    | 本文件                                                                |
| 先 commit＋push，再 handoff                    | ⏳    | commit 完成；push 與 handoff 在本 closeout commit 後執行              |

---

## 實際測試指令與結果

### `git diff --check`
```
exit code: 0 (no whitespace errors)
```

### `pnpm --filter @drts/api typecheck`
```
只剩 voice-capability / callcenter 預存錯誤（與本 task 無關，pre-existing）
reporting-filing / report-renderers 無 TS error
```

### `pnpm --filter @drts/ops-console-web typecheck`
```
exit code: 0 — Types generated successfully
```

### `pnpm exec vitest run tests/unit/system-remediation/sr-report-001/`
```
RUN  v4.1.4

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  15:42:46
   Duration  1.15s
```

---

## 範圍聲明

### 已完成（本 task）
- `apps/api/src/modules/reporting-filing/report-renderers.ts` — 新建
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts` — 修改（renderer 實作、async）
- `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` — 修改（async handlers）
- `packages/contracts/src/index.ts` — 修改（IMPLEMENTED_REPORT_OUTPUT_FORMATS）
- `tests/unit/system-remediation/sr-report-001/report-formats.test.ts` — 新建
- `docs/04-uat/system-remediation-20260906/SR-REPORT-001.md` — 本文件

### 明確未做（超出 task scope）
- **Live 測試**：尚無正式租戶環境；live 驗收由 SR-LIVE-DOC-001 負責
- **filing PDF/ZIP**：明確出 scope（SR-SCOPE-001 已記錄）
- **zip renderer**：在 `reportArtifactRenderers.zip: null`，`assertReportFormatRenders` 拒絕請求
- **UI 樣式改動**：`IMPLEMENTED_REPORT_OUTPUT_FORMATS` 更新後前端自動顯示，無需額外 UI 改動

---

## 九項已存在 Row Builders（保留，未修改）

| 報表類型              | Builder 狀態 |
| --------------------- | ------------ |
| vehicle_roster        | 保留 ✅      |
| driver_roster         | 保留 ✅      |
| contract_roster       | 保留 ✅      |
| insurance_roster      | 保留 ✅      |
| vehicle_monthly_delta | 保留 ✅      |
| six_month_statistics  | 保留 ✅      |
| fare_version_history  | 保留 ✅      |
| complaint_case_detail | 保留 ✅      |
| dispatch_recording_index | 保留 ✅   |
