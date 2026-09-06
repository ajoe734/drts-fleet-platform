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
- `apps/api/src/modules/platform-admin/platform-admin.repository.ts`
- `tests/unit/system-remediation/sr-admin-adapter-001/`
- 待建立：docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。沒有列出的共用檔不得順手修改。

### Scope 擴充（見 `support/unblock/SR-ADMIN-ADAPTER-001/SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION.md`）

Governance 裁決：本 task 的 registry 契約與 migration 不歸 SR-CONTRACT，因為
`packages/contracts/src/platform-adapter-registry.ts` 是既有專屬檔，不是本波新功能
（leave/academy/host）契約整合範圍。核准新增下列兩檔，不新增 depends_on：

- `infra/migrations/V0090__platform_adapter_registry.sql`（新檔，建立
  `admin.phase1_adapter_registry`，沿用 `V0033__missing_phase1_persistence_tables.sql`
  的 JSON-record 列樣式）
- `packages/contracts/src/platform-adapter-registry.ts`（既有檔，補
  `credentialExpiresAt`／`credentialReference`／mutation `reason`／
  `auditReceipt`）

`packages/contracts/src/index.ts`（已於 :7416 匯出本檔，免改）與
`packages/api-client/src/index.ts`（已有 `listPlatformAdapters` /
`getPlatformAdapter` / `updatePlatformAdapter` 呼叫 `/api/platform-admin/adapters`，
免改）不需要納入範圍。

註冊／設定編輯／憑證編輯輪替三個表單維持 scope cut：畫布尚無對應畫面
（已於 UAT 證據記錄 screen-requirements note），Q-ADM17 已裁決 write-authority
分工，缺的是畫面而非決策，待 design lane 補畫布後再做，不在本 task 交付範圍。

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

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)
