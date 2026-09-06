# SR-DESIGN-001 — 補齊請假／學院／Host的最小可實作契約

| 欄位                                         | 內容                   |
| -------------------------------------------- | ---------------------- |
| 初始狀態                                     | backlog                |
| 優先級                                       | P2                     |
| Owner / Reviewer（可由 supervisor 合法調派） | Gemini2 / Gemini       |
| 前置任務                                     | 無                     |
| 問題來源                                     | N01, N02, N03          |
| 能力來源                                     | C012, C052, C059, C071 |
| 工作類型                                     | documentation          |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 依PRD與現行realm定義請假狀態/角色、課程與完訓證據、Host車輛所有權受限投影；明示unknown及既有欄位，不自行增加新realm、財務或勞動權益政策。只有具體產品語義缺失才提交決策，不重開排除範圍。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `docs/04-uat/system-remediation-20260906/feature-contracts.md`
- `tests/unit/system-remediation/sr-design-001/`
- `docs/04-uat/system-remediation-20260906/SR-DESIGN-001.md`

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 三family逐一列API/schema/狀態/role/正負AC與現有來源。
- 條件與不確定點有落點；可使FE與BE依同一契約獨立實作。
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
