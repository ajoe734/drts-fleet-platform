# SR-ADMIN-ADAPTER-001 — 平台轉接器登錄 API 接線及到期真值

| 欄位                                         | 內容           |
| -------------------------------------------- | -------------- |
| 初始狀態                                     | backlog        |
| 優先級                                       | P1             |
| Owner / Reviewer（可由 supervisor 合法調派） | Codex / Codex2 |
| 前置任務                                     | 無             |
| 問題來源                                     | N11, N12       |
| 能力來源                                     | C104, C105     |
| 工作類型                                     | implementation |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 修復正常adapter-registry的404；列表/設定/憑證治理依現有registry authority，stub與不可用不能標真live。去掉固定5/31警告，以真到期值計算。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `apps/platform-admin-web/app/adapter-registry/`
- `apps/api/src/modules/platform-admin/platform-admin.controller.ts`
- `apps/api/src/modules/platform-admin/platform-admin.service.ts`
- `tests/unit/system-remediation/sr-admin-adapter-001/`
- 待建立：docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 合法角色列表與表單正確回讀，未授權拒絕。
- 到期前/即將到期/已到期/未知四態均正確；API錯誤不展示假成功警告。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
pnpm --filter @drts/api typecheck
pnpm --filter @drts/platform-admin-web typecheck
pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/
```

- 在上述task目錄新增 .test.ts，root Vitest可發現；不使用passWithNoTests掩蓋空測試。
- 先選出受影響 package 的現有 test/typecheck 指令；新增 meaningful regression 與必要 integration，不跑無關全庫測試。
- 完整命令與exit code寫入 task evidence；不能只記「tests pass」。

## 整合与結案

測試依 task ID 獨立檔案；不得平行修改中央 test config、lockfile、shared exports、全域 routes。

此任務在獨立worktree執行。根節點不需要等整波；相依task必須是canonical done並含正確merge證據。若issue當前已修，保留回歸與來源證據，不重造功能。

## 追溯來源

### 2026-09-08 planning recovery routing

[本次決策與後續工作](../../../support/unblock/SR-ADMIN-ADAPTER-001/SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION.md) 記錄目前 scope 缺口與 owner 可立即續做的下一步。舊 PR #1671 的兩檔擴 scope／三表單 scope cut 尚未成為授權；本任務原驗收不變。

Owner 可依 history-recovery packet 續做既有 scope 內 notice/i18n 修復與回歸證據。Supervisor 必須先以 canonical task-board 命令記錄 repository、adapter contract、獨立 migration 的 reviewed scope／必要相依，並處理尚缺的表單設計與 expiry/mutation contract，再執行共享檔案修改。`serial_resources` 不能替代相依與授權；本 routing 文件不直接擴張 write scope。

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)
