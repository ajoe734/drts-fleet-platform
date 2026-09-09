# SR-REPORT-001 — 一般報表 PDF／XLSX 與可用格式宣告

| 欄位                                         | 內容                         |
| -------------------------------------------- | ---------------------------- |
| 初始狀態                                     | backlog                      |
| 優先級                                       | P1                           |
| Owner / Reviewer（可由 supervisor 合法調派） | Gemini / Gemini2             |
| 前置任務                                     | SR-ARTIFACT-001, SR-DEPS-001 |
| 問題來源                                     | N05                          |
| 能力來源                                     | C091                         |
| 工作類型                                     | implementation               |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 保留九項已存在row builders與CSV。依PRD補一般PDF/XLSX renderer，格式與MIME/extension一致，取消無效宣稱。明確不生成filing PDF/ZIP。若需dependency只由SR-DEPS-001負責package與lockfile。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `apps/api/src/modules/reporting-filing/`
- `apps/ops-console-web/app/reports/`
- `tests/unit/system-remediation/sr-report-001/`
- `packages/contracts/src/index.ts`（僅一般報表 implemented-format 宣告與相關說明）
- `tests/unit/reporting-filing.test.ts`（僅一般格式與 ZIP／filing 排除的對應斷言）
- 待建立：docs/04-uat/system-remediation-20260906/SR-REPORT-001.md

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 三種一般格式各可解析且同筆資料/篩選一致。
- 未實作格式會明確拒絕；filing scope排除不被誤開。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
pnpm --filter @drts/api typecheck
pnpm --filter @drts/ops-console-web typecheck
pnpm exec vitest run tests/unit/system-remediation/sr-report-001/
pnpm exec vitest run tests/unit/reporting-filing.test.ts
```

- 在上述task目錄新增 .test.ts，root Vitest可發現；不使用passWithNoTests掩蓋空測試。
- 先選出受影響 package 的現有 test/typecheck 指令；新增 meaningful regression 與必要 integration，不跑無關全庫測試。
- 完整命令與exit code寫入 task evidence；不能只記「tests pass」。

## 整合与結案

測試依 task ID 獨立檔案；2026-09-09 supervisor 明確授權上述兩個共用檔案的窄幅修改，落實已合併的 SR-REPORT-001-UNBLOCK-PLANNING-DECISION。不得改其他 shared exports、中央 test config、lockfile 或全域 routes。

SR-CONTRACT-001 是目前另一個共用 contracts index writer，必須等待本任務 canonical done 與 merge 後接續；本任務保留 SR-ARTIFACT-001、SR-DEPS-001 前置，不反向依賴 SR-CONTRACT-001。格式宣告、renderer、中央測試必須在同一候選交付，不能先公開尚未實作的格式。

Supervisor 指派新的 execution_branch，從當前 origin/dev 開始；保留舊發布 refs。舊 renderer／測試可逐檔檢查後移植，不重播重複 evidence anchors。必須以獨立解析器驗證中文 PDF 文字與 XLSX 內容，不沿用把 bytes 假解碼成成功的測試。ZIP 與 filing bytes 排除維持原規格。

此任務在獨立worktree執行。根節點不需要等整波；相依task必須是canonical done並含正確merge證據。若issue當前已修，保留回歸與來源證據，不重造功能。

## 追溯來源

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)
