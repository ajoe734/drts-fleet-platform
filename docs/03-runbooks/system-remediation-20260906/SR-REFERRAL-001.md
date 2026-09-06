# SR-REFERRAL-001 — 修復轉介 handoff 與可用 fallback

| 欄位                                         | 內容             |
| -------------------------------------------- | ---------------- |
| 初始狀態                                     | backlog          |
| 優先級                                       | P0               |
| Owner / Reviewer（可由 supervisor 合法調派） | Gemini / Gemini2 |
| 前置任務                                     | 無               |
| 問題來源                                     | R07              |
| 能力來源                                     | C020, C021       |
| 工作類型                                     | implementation   |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 對照正式入口資料及allowlist，修復entryHost與fallback循環；使用現有簽章驗證，不偽造身份／放寬任意host。新API契約若必要由SR-CONTRACT-001整合。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `apps/referral-embed-web/`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `tests/unit/system-remediation/sr-referral-001/`
- 待建立：docs/04-uat/system-remediation-20260906/SR-REFERRAL-001.md

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 合法測試issuer產生的token能到叫車；過期/錯host/重放拒絕。
- fallback為真正可用入口，沒有入口時給明確可恢復狀態；保留來源歸屬。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
pnpm --filter @drts/api typecheck
pnpm --filter @drts/referral-embed-web typecheck
pnpm exec vitest run tests/unit/system-remediation/sr-referral-001/
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
