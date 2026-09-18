# SR-ENV-COPY-001 — 各app環境標示與使用者文案清理

| 欄位                                         | 內容             |
| -------------------------------------------- | ---------------- |
| 初始狀態                                     | backlog          |
| 優先級                                       | P2               |
| Owner / Reviewer（可由 supervisor 合法調派） | Claude2 / Claude |
| 前置任務                                     | SR-ENTERPRISE-FORM-001 |
| 問題來源                                     | R27              |
| 能力來源                                     | C110             |
| 工作類型                                     | implementation   |

## Execution prompt

先讀 execution_ref 中本 task 及追溯來源；從目前 origin/dev 記 base SHA並重現。9/6 audit SHA 是歷史觀察而非當前程式真值；已由其他任務修復時提交目前 SHA 的回歸證據，不重做或回退。只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫。沿用權威 API／資料模型，不以 fixture、固定百分比、假簽章或假送達代替完成。 集中處理環境判斷与顯示文案，以實際env/source作真值；fixture/dev不叫正式。依2026-09-09 supervisor scope 使用下列六個 server layouts 與 shell/frame/nav 接線；其餘端點及部署檔限制保留。

先讀 [主執行規則](../system-remediation-execution-tasks-20260906.md)。不得直接修改 `ai-status.json`；使用當前 supervisor release 的 task-board commands。

## 可寫入範圍

- `apps/platform-admin-web/lib/translations.ts`
- `apps/ops-console-web/lib/translations.ts`
- `apps/tenant-console-web/lib/translations.ts`
- `apps/fleet-partner-portal-web/lib/translations.ts`
- `apps/bank-console-web/lib/translations.ts`
- `apps/enterprise-dispatch-web/lib/translations.ts`
- `packages/ui-web/src/environment-badge/`
- `tests/unit/system-remediation/sr-env-copy-001/`
- 待建立：docs/04-uat/system-remediation-20260906/SR-ENV-COPY-001.md
- `apps/platform-admin-web/app/layout.tsx`
- `apps/ops-console-web/app/layout.tsx`
- `apps/tenant-console-web/app/layout.tsx`
- `apps/fleet-partner-portal-web/app/layout.tsx`
- `apps/bank-console-web/app/layout.tsx`
- `apps/enterprise-dispatch-web/app/layout.tsx`
- `apps/platform-admin-web/components/admin-shell.tsx`
- `apps/tenant-console-web/components/tenant-shell.tsx`
- `apps/tenant-console-web/lib/navigation.ts`
- `apps/fleet-partner-portal-web/components/fleet-portal-shell.tsx`
- `apps/bank-console-web/components/bank-shell.tsx`
- `apps/bank-console-web/lib/navigation.ts`
- `apps/enterprise-dispatch-web/components/enterprise-app-frame.tsx`
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx`
- `packages/ui-web/src/index.tsx`
- 待建立：packages/ui-web/tests/unit/environment-badge.test.ts

清單內尚不存在的 module／leaf 檔是新增目標；實際 repo 路徑變動由 supervisor 更新 reviewed scope。Migration 使用 SR-CONTRACT 分配的專屬檔名。沒有列出的共用檔不得順手修改。

## 驗收條件

- 中文/英文與正常/錯誤/空態無無意義ActionIntent等文字。
- env從runtime權威值，不靠domain字串猜；prod也不把未知資料標健康。
- 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功。
- 先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案。

## 檢查指令

```bash
git diff --check
pnpm --filter @drts/bank-console-web typecheck
pnpm --filter @drts/enterprise-dispatch-web typecheck
pnpm --filter @drts/fleet-partner-portal-web typecheck
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/tenant-console-web typecheck
pnpm --filter @drts/ui-web typecheck
pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/ packages/ui-web/tests/unit/environment-badge.test.ts --no-file-parallelism --maxConcurrency=1
```

- 先選出受影響 package 的現有 test/typecheck 指令；新增 meaningful regression 與必要 integration，不跑無關全庫測試。
- 完整命令與exit code寫入 task evidence；不能只記「tests pass」。

## 整合与結案

測試依 task ID 獨立檔案；supervisor 明確授權上列 UI barrel 與 legacy badge test，僅本環境 resolver/badge 的 exports 與對應斷言。其他 shared exports、中央 test config、lockfile 與全域 routes 不變。

此任務在獨立worktree執行。根節點不需要等整波；相依task必須是canonical done並含正確merge證據。若issue當前已修，保留回歸與來源證據，不重造功能。

## 追溯來源

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)


## Supervisor runtime source mapping — 2026-09-09

此決議落實已合併的 SR-ENV-COPY-001-UNBLOCK-PLANNING-DECISION 與 history recovery follow-up，沒有刪減 acceptance。

- `.github/workflows/deploy-dev.yml` 的 frontend deploy env_vars 明確供應 `DRTS_ENV=development`，同時 `NODE_ENV=production`。因此 NODE_ENV 是 runtime/build mode，不是部署環境真值。
- 六個 app 的 server layout 讀取 DRTS_ENV，正規化後以 serializable prop 經現有 shell/frame 傳到 client。不得由 client 直接讀取未公開 server env，亦不得把 build-time inline 值冒充 runtime 值；需要時在授權 layout 使用 dynamic rendering。
- 正規化接受明確 development、staging、production、preview、test（忽略外圍空白與大小寫）；missing、空值、非法值皆 unknown。APP_ENV、NEXT_PUBLIC_*、domain、翻譯 catalog 不作替代權威。
- 本次沒有 staging/production 六個 frontend 的 runtime readback；即使 API workflow 有 DRTS_ENV，也不能推論 frontend 已供應。缺值先誠實顯示 unknown，不改部署流程或冒稱已部署。
- Environment、資料來源、健康狀態分開處理。Enterprise shell 的 HTTP 成功但 missing/unrecognized health payload 不能預設 healthy；沿用實際 health response 的明確值，未知保留 unknown。不得由 production 推論 live data 或 healthy，不新增無來源的資料模式旗標。
- Ops layout 已可傳 env，不需改 ops-shell 或 assistant contract；enterprise 經 EnterpriseAppFrame 傳入 EnterpriseShell；platform/tenant/fleet/bank 於既有標示位置接線。Nav 中寫死的環境常數必須移除或改為不誤導的未知 fallback，不改路由行為。

SR-ENTERPRISE-FORM-001 曾修改 enterprise layout，已合併仍保留為明確前置。其餘目前 canonical pending tasks 與上述新增精確檔案無 write-scope overlap；SR-OPS-SHELL-001 擁有不同的 ops-shell/assistant 檔案，不能因本決議擴其範圍。後續若有新 writer 重疊，由 supervisor 先加入依賴。

Supervisor 指派新的 execution_branch 從 fresh origin/dev 開始，保留旧分支與 PR #1738。逐檔检查舊 resolver/catalog patch，再移植必要內容；不重播重複 evidence anchors，不把舊版整檔覆蓋最新 dev。

驗證必須涵蓋六個 layout→shell render 路徑、兩種語言、explicit production/development/preview、missing/invalid 環境與未知 health；僅 standalone resolver 測試不足以 handoff。此 VM 只跑不啟 server 的 unit/render 測試、typecheck、lint；browser/live acceptance 在允許環境執行並如實記錄。
