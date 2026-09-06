# SR-READINESS-001 — 既有工作重用、外部條件與測試身份盤點

| 欄位                                         | 內容                   |
| -------------------------------------------- | ---------------------- |
| 初始狀態                                     | backlog                |
| 優先級                                       | P0                     |
| Owner / Reviewer（可由 supervisor 合法調派） | Gemini2 / Gemini       |
| 前置任務                                     | 無                     |
| 問題來源                                     | R01, R29, N10          |
| 能力來源                                     | C001, C023, C124, C133 |
| 工作類型                                     | verification           |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 只讀核對当前dev SHA、已修復task/PR、正式入口、IAP帳號、test tenant、mail/push/bank/maps/storage/CTI與備份metadata。重用UV-027而非重做語音外部盤點。不洩漏秘密、不寄信、不買資源；輸出缺項owner與證據reference，預備報告可結案但不得解除live gate。 此任務先建立可重跑驗收並如實驗證；若發現產品缺陷，以 canonical task command 建立具來源的修復子任務，不在本驗收範圍偷偷改業務碼或只寫待辦就稱閉環通過。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- 待建立：docs/04-uat/system-remediation-20260906/readiness.json
- 待建立：docs/04-uat/system-remediation-20260906/current-state.md
- `tests/unit/system-remediation/sr-readiness-001/`
- 待建立：docs/04-uat/system-remediation-20260906/SR-READINESS-001.md

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 44 issue逐一指當前版本/repro或已修merge；134能力有角色測試資料需求。
- 每個live gate有缺什麼、由誰提供、如何讀回；缺證據是missing，不是假pass。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
```

- 先選出受影響 package 的現有 test/typecheck 指令；新增 meaningful regression 與必要 integration，不跑無關全庫測試。
- 完整命令與exit code寫入 task evidence；不能只記「tests pass」。

## 整合与結案

測試依 task ID 獨立檔案；不得平行修改中央 test config、lockfile、shared exports、全域 routes。

此任務在獨立worktree執行。根節點不需要等整波；相依task必須是canonical done並含正確merge證據。若issue當前已修，保留回歸與來源證據，不重造功能。

## 追溯來源

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)
