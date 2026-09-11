# SR-FLEET-SETTLE-001 — 車行 statement 真資料與確認／爭議

- Status: `blocked` (partial real progress delivered; core confirm/dispute capability needs write-scope expansion — see §4)
- Owner: `Claude2`
- Reviewer: `Claude`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json` (`C068`)
- Source Finding: `docs/04-uat/system-remediation-20260906/source/findings.json` (`R13`)
- Base SHA: `69e31e793489202c612c5f46dbc801099b5cf5c0` (`origin/dev` at dispatch time, after `git merge origin/dev` fast-forward picked up the SR-PROOF-001 merge; verified with `git merge-base HEAD origin/dev` before starting work)
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-fleet-settle-001`
- Branch: `claude2/sr-fleet-settle-001`
- Candidate SHA: recorded in the `ai-status.sh blocker` machine-truth call for this task (see task board `next`/log); this document does not restate it to avoid a stale value if a follow-up anchor commit is added.

---

## 1. 問題背景 (Finding R13 / Capability C068)

- **R13 原文**：「對帳狀態自相矛盾」— 重現步驟與實際結果：「分潤頁同時說本期對帳單已產生及沒有可操作對帳單；對帳清單空白」。影響：「不知道是否需確認、尚未結算或載入失敗」。建議修正：「由同一單據狀態驅動提示，無單據時提供原因及下一步」。
- **C068 原文**：能力／應完成工作：「statement 查詢／確認／爭議處理」。狀態：「故障」。目前證據與限制：「宣稱已產生帳單但可操作列表為空」。缺口／下一個驗收條件：「對帳來源一致；可下載、確認與爭議寫入後回讀」。

## 2. 根因調查

1. **R13 的直接根因（已修復，見 §3）**：`apps/fleet-partner-portal-web/app/revenue/page.tsx` 的「Actions」卡片**無條件**渲染 `revenue.pendingTitle` / `revenue.pendingBody`（「當期對帳單待確認」／「{period} 分潤對帳單已產生，請於截止日前確認」），不論 `currentStatement` 是否存在、是否已付款。當 `currentStatement` 為 `null` 時，同一卡片下方又渲染 `actions.reason.noCurrentStatement`（「目前沒有可操作的當期對帳單」）。這兩段文字同時出現，就是 R13 回報的自相矛盾。
2. **C068「確認與爭議」的根因（範圍受限，見 §4）**：既有的確認／爭議 UI（`apps/fleet-partner-portal-web/components/fleet-statement-actions.tsx`、`apps/fleet-partner-portal-web/lib/fleet-portal-statement-actions.ts`，PR #1350 / `S1F-FLT-003` 引入）完全以 `window.localStorage` 儲存決定（`writeDecision`），下載內容是瀏覽器端 `Blob` 產生的純文字，沒有任何後端 API 呼叫、沒有伺服器端持久化、也沒有跨裝置／跨工作階段回讀。這正是任務指示明確禁止的「假送達代替完成」模式。後端 `FleetPartnerStatementRecord`（`packages/contracts/src/index.ts:5282`）完全沒有確認／爭議／取消冲正欄位；`DriverPayoutStatus` 只有 `"pending" | "paid"` 兩個值（`packages/contracts/src/index.ts:4928`）。要把確認／爭議做成真正可回讀、可跨車行拒絕、可追溯取消冲正來源的後端能力，必須新增／修改下列檔案，而它們都**不在**本任務目前的 `write_scopes` 內：
   - `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts`（新增 statement 詳情／下載／確認／爭議路由；本任務的 `serial_resources` 也刻意不含 `fleet-controller`，與已完成的 SR-FLEET-CASE-001 不同）
   - `apps/api/src/modules/fleet-partner/fleet-partner.service.ts`、`fleet-partner.repository.ts`（業務邏輯、持久化欄位／資料表、取消冲正來源追溯）
   - `packages/contracts/src/index.ts`（新增 Command／Record 型別）
   - `packages/api-client/src/index.ts`（新增前端呼叫方法）
   - `apps/fleet-partner-portal-web/components/fleet-statement-actions.tsx`、`apps/fleet-partner-portal-web/lib/fleet-portal-statement-actions.ts`（把 localStorage 假流程換成真實 API 呼叫）
   - 可能需要一個新的 `infra/migrations/V00xx__...sql`（依 SR-CONTRACT 分配的檔名）

   `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`（本任務列出的唯一後端 write_scope）與 `FleetPartnerStatementRecord` 完全無關——確認過整個檔案沒有任何 `fleetPartner` 相關程式碼，這條 write_scope 對本任務要解決的問題不適用。

## 3. 本次交付（在既有 write_scopes 內，真實資料、非 fixture）

| 檔案路徑 | 變更說明 |
|---|---|
| `apps/fleet-partner-portal-web/app/revenue/page.tsx` | 修復 R13：Actions 卡片的提示改由 `resolveStatementBannerState(currentStatement)` 驅動，三態互斥（`no_statement` / `pending` / `paid`），不再與「無可操作對帳單」文字同時出現。 |
| `apps/fleet-partner-portal-web/app/revenue/statement-banner.ts`（新增） | 抽出的純函式，讓 R13 修復可被單元測試覆蓋。 |
| `apps/fleet-partner-portal-web/app/revenue/translations.ts`（新增） | 頁面局部翻譯（仿照既有 `app/training/translations.ts` 慣例，因共用字典 `lib/translations.ts` 不在 write_scope 內），新增「本期尚無對帳單」「本期已結清」文案。 |
| `apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts` | 新增 `loadStatementDetail(statementId)`：重用既有已限定車行範圍的 `listFleetPortalStatements()`，回傳單一 statement 的完整逐筆明細（`FleetPartnerStatementLineRecord[]` 全欄位），達成「同一 statement period/list/detail/download 一致」；ID 不在自己車行清單內（跨車行或不存在）一律回傳 `statement: null`，由呼叫端渲染 404，不洩漏他車行資料。 |
| `apps/fleet-partner-portal-web/app/statements/page.tsx` | 對「reachable 但空清單」呈現誠實的空狀態說明（不再是空表格無解釋）；新增「對帳單明細與匯出」清單，連結至新的明細頁與匯出路由。 |
| `apps/fleet-partner-portal-web/app/statements/[id]/page.tsx`（新增） | 真實明細頁：摘要 DL＋逐筆明細表格（來源與列表頁同一 loader）；找不到／非本車行一律 `notFound()`；明確標示確認／爭議尚未串接真實後端（見 §4），不假裝可用。 |
| `apps/fleet-partner-portal-web/app/statements/export/route.ts`（新增） | 真實 CSV 下載（Route Handler，仿照既有 `app/trips/export/route.ts` 慣例）：`?statementId=` 下載單一對帳單逐筆明細，未帶參數下載列表彙總；資料來源與列表／明細頁完全相同的 loader，不是另一套假資料。 |
| `apps/fleet-partner-portal-web/app/statements/translations.ts`（新增） | 明細／匯出／空狀態頁面局部翻譯。 |
| `tests/unit/system-remediation/sr-fleet-settle-001/sr-fleet-settle-001.test.ts`（新增） | 8 項單元測試：R13 banner 三態純函式測試、頁面局部翻譯插值測試、`loadStatementDetail` 真實資料明細一致性測試、跨車行／不存在 ID 回傳 `null` 測試、後端錯誤時 fallback 不假造已產生對帳單測試。 |

未修改 `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`——已確認該檔與本任務要解的問題無關（見 §2），刻意不做無意義變更。

## 4. 未完成／被阻擋的部分（誠實列出，不冒充成功）

**確認（confirm）與爭議（dispute）仍然沒有真實後端持久化與回讀**，既有的 `FleetStatementActions` / `StatementDecisionNote`（localStorage 假流程）維持原樣未被移除——因為它們所在的 `apps/fleet-partner-portal-web/components/` 目錄不在本任務 `write_scopes` 內，貿然編輯有跟其他 lane 並行修改衝突的風險，而移除卻不能提供真正替代方案只會把「自相矛盾」換成「悄悄失效」。已在新明細頁（`app/statements/[id]/page.tsx`）以 `CanvasBanner` 明確告知使用者此限制（`statements.detail.confirmDisputeUnavailable`），不隱藏、不假裝完成。

同理，驗收條件「取消冲正來源可追溯」（cancellation/reversal traceability）在目前資料模型（`DriverPayoutStatus = "pending" | "paid"`，無任何冲正／取消欄位）下無法實作，需要 §2 列出的相同一批後端檔案。

**本任務因此無法完整滿足 acceptance 的「確認/爭議…回讀」與「取消冲正來源可追溯」兩項**，已透過 `ai-status.sh blocker` 回報，`waiting_for: Claude`，請求擴大 write_scopes 至 §2 所列檔案清單後再續做。

## 5. 驗收條件逐項對照

| 驗收條件 | 狀態 | 說明 |
|---|---|---|
| 一個測試期間可查下載確認/爭議並回讀 | 部分 | 查詢／下載已是真實資料且一致（§3）；確認/爭議寫入回讀被 §4 的 scope 阻擋 |
| 跨車行拒絕；空清單不宣稱已產生；取消冲正來源可追溯 | 部分 | 跨車行拒絕與空清單誠實化已完成（統計於 §3）；取消冲正來源可追溯被 §4 的 scope 阻擋（資料模型無此欄位） |
| 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功 | 完成 | 見本文件與 §6；未做部分見 §4 |
| 先 commit＋普通 push，再 handoff；owner 不直接 done | 進行中 | 本次以 `blocker`（非 `handoff`）回報，因核心驗收未達成，不宣稱 ready for review |

## 6. 驗證紀錄 (Verification Evidence)

所有指令在 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-fleet-settle-001` 執行。

### 6.1 `git diff --check`
```
git diff --check --cached
# Exit code: 0
```

### 6.2 `pnpm --filter @drts/fleet-partner-portal-web typecheck`
```
> @drts/fleet-partner-portal-web@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
# Exit code: 0
```

### 6.3 `pnpm --filter @drts/api typecheck`
```
# Exit code: 2 — pre-existing baseline failure, unrelated to this task.
# Confirmed via `git diff --stat HEAD`: none of the touched-by-this-task
# files overlap the failing files. All 60+ errors are in
# owned-mobility/voice-booking/regulatory-registry/vehicle-eligibility
# modules referencing @drts/contracts exports (BookingQualification,
# BookingRequirements, ContractOperationalViewRecord, etc.) that do not
# exist at the current origin/dev HEAD (69e31e793) — inherited from
# another in-flight lane's work, not introduced or touched by
# SR-FLEET-SETTLE-001. Not fixed here: out of write_scopes and unrelated
# to C068/R13.
```

### 6.4 `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-settle-001/`
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
# Exit code: 0
```

## 7. 資源 ID／機器真值來源

- `docs/04-uat/system-remediation-20260906/source/findings.json` → `R13`
- `docs/04-uat/system-remediation-20260906/source/capabilities.json` → `C068`
- `packages/contracts/src/index.ts:5254-5297` → `FleetPartnerStatementLineRecord` / `FleetPartnerStatementRecord`
- `packages/contracts/src/index.ts:4928` → `DRIVER_PAYOUT_STATUSES = ["pending", "paid"]`
- `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts:345-369` → 現有唯一 statement 端點（`GET admin/fleet-partners/:fleetPartnerId/statements`、`GET fleet-partner/statements`），無 detail/download/confirm/dispute
- `apps/api/src/modules/fleet-partner/fleet-partner.repository.ts` → `billing.phase1_fleet_partner_statements` 資料表（真實 DB 持久化，非 fixture）
