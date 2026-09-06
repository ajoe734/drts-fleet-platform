# SR-ARTIFACT-001 — 共用文件儲存與受控下載真正回傳 bytes

| 欄位                                         | 內容                         |
| -------------------------------------------- | ---------------------------- |
| 初始狀態                                     | backlog                      |
| 優先級                                       | P1                           |
| Owner / Reviewer（可由 supervisor 合法調派） | Claude / Claude2             |
| 前置任務                                     | 無                           |
| 問題來源                                     | N04, N08                     |
| 能力來源                                     | C058, C078, C079, C097, C125 |
| 工作類型                                     | implementation               |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 只支援本期 tenant invoice／placard／report families；建立檔案查詢與hash、到期授權和讀取port。維持filing包metadata-only範圍，不把501改成假空檔。沿用既有storage，隔離測試可用local adapter。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `apps/api/src/common/document-artifacts/`
- `apps/api/src/modules/controlled-download/`
- `tests/unit/system-remediation/sr-artifact-001/`
- `docs/04-uat/system-remediation-20260906/SR-ARTIFACT-001.md`

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 已存在檔案回正確MIME/bytes並可計算SHA256；不存在明確失敗。
- 拒絕過期／篡改／跨scope下載；換發URL不改文件內容。
- 不讓任意subjectId穿透授權，不把signature等同資源授權。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
pnpm --filter @drts/api typecheck
pnpm exec vitest run tests/unit/system-remediation/sr-artifact-001/
```

- 在上述task目錄新增 .test.ts，root Vitest可發現；不使用passWithNoTests掩蓋空測試。
- 先選出受影響 package 的現有 test/typecheck 指令；新增 meaningful regression 與必要 integration，不跑無關全庫測試。
- 完整命令與exit code寫入 task evidence；不能只記「tests pass」。

## 整合与結案

測試依 task ID 獨立檔案；不得平行修改中央 test config、lockfile、shared exports、全域 routes。

此任務在獨立worktree執行。根節點不需要等整波；相依task必須是canonical done並含正確merge證據。若issue當前已修，保留回歸與來源證據，不重造功能。

## 追溯來源

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)
