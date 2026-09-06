# SR-ADMIN-VERIFY-001 — 重驗已合併 P5／車隊清單修復

| 欄位                                         | 內容           |
| -------------------------------------------- | -------------- |
| 初始狀態                                     | backlog        |
| 優先級                                       | P1             |
| Owner / Reviewer（可由 supervisor 合法調派） | Codex2 / Codex |
| 前置任務                                     | 無             |
| 問題來源                                     | R03, R04       |
| 能力來源                                     | C093, C101     |
| 工作類型                                     | implementation |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 最新origin/dev已含FIX-P5-RECORDS-001及fleet envelope修復；先查merge SHA，不複製舊錯誤修第二次。交付回歸測試與当前候選證據，若仍有UI殘留只修這兩頁。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `apps/platform-admin-web/app/fleet-partners/`
- `apps/platform-admin-web/app/platform-admin/p5/records/`
- `tests/unit/system-remediation/sr-admin-verify-001/`
- `docs/04-uat/system-remediation-20260906/SR-ADMIN-VERIFY-001.md`

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 正確API envelope載入list且空清單不崩潰。
- 具權P5可查；無權呈permission狀態且不假100%保存覆蓋率。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
pnpm --filter @drts/platform-admin-web typecheck
pnpm exec vitest run tests/unit/system-remediation/sr-admin-verify-001/
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
