# COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015 — 客訴終止狀態契約與 ordinary CRM 誠實 ACK 修復

| 欄位          | 內容                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Task spec     | `.local/goal-continuation-20261015T1628-original-passenger-dispatch-call-root/COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015-R1.task-spec.json` |
| Owner         | Claude2                                                                                                                       |
| Reviewer      | Gemini2                                                                                                                       |
| Base SHA      | `431966bdf2728a76f7b03907974a124ab4a48ae7`（= 任務指派時 `origin/dev` tip，亦即 task spec 之 `accepted_dev_sha`/`qualified_registration_source_sha`） |
| Candidate SHA | 記錄於 `handoff`（`git rev-parse HEAD`，見 task board）                                                                      |
| 來源稽核       | `.local/goal-continuation-20261015T1628-original-passenger-dispatch-call-root/C043-C048-current-accepted-call-case-incident-SOS-readonly-audit.json`（findings `C045-F1`/`C045-F2`/`C045-F3`，唯讀稽核，未實作）|

## 1. 背景與三個缺口

依據唯讀稽核 `C043-C048-current-accepted-call-case-incident-SOS-readonly-audit.json`，C045（客訴生命週期）存在三個在目前 `dev` 基準上可重現的缺口：

- **C045-F1（UI 層）**：`resolved` 狀態的客訴案件，Ops 列表頁與詳情頁都會顯示/啟用「重開」CTA，但後端 `reopenComplaintCase` 只接受 `status === "closed"`（否則回 409 `COMPLAINT_NOT_CLOSED`）。合法動線應是 resolved → close → reopen。
- **C045-F2（服務層終止狀態）**：`resolveComplaintCase` 僅對 `status === "resolved"` 做冪等回放，對 `status === "closed"` 沒有任何保護，會直接把已正式 close 的案件改回 `resolved`，繞過正式重開契約（原因、reopenCount、SLA 重算、時間軸）。
- **C045-F3（ordinary CRM 誠實 ACK）**：`ComplaintService.persistChanges` 只把 `settlement_dispute` 類別的寫入追蹤進可等待的 `settlementPersistence` map；其他（ordinary）類別走 `void repo.persistChanges(...).catch(reportPersistenceFailure)`，即 fire-and-forget。所有 controller 端點（含 callcenter/incident/fleet-partner）早已呼叫 `awaitSettlementPersistence(caseNo)`，但對 ordinary 案件這個等待形同空等——即使канonical DB 寫入失敗或仍在 pending，HTTP 回應、Ops 收據與稽核通知都已經當作「已保存」回報成功。`fleet-partner-case.service.ts` 的車行回覆同步到 Ops 時，還用 `try { ... } catch { /* 吞掉 */ }` 把這個失敗整個吞掉。

## 2. 這個任務做了什麼

### 2.1 服務層（`apps/api/src/modules/complaint/complaint.service.ts`）

- **F2 修復**：`resolveComplaintCase` 新增 `status === "closed"` 分支，拋出 `409 COMPLAINT_ALREADY_CLOSED`（保留原有 `resolved → resolved` 冪等回放與 `closed → reopen` 合法動線不變）。
- **F3 修復**：把 `persistChanges` 私有方法的追蹤範圍從「僅 `settlement_dispute` 案號」改為「本次異動影響的全部案號」。當 repository 已啟用（canonical DB 已配置）時，不論類別都會把寫入 Promise 記錄進既有的 `settlementPersistence` map；`settlementMutationRevision`（供 `refreshSettlementCases` 判斷競態重讀）仍只在真的有 `settlement_dispute` 寫入時遞增，不改變既有 settlement 行為。所有既存呼叫端早已呼叫的 `awaitSettlementPersistence(caseNo)` 因此對 ordinary 案件也會誠實等待並在失敗時 `throw`，不需要修改 controller 任何一個端點。
  - noDB（repository 未啟用）與 `!this.complaintRepository`（完全未注入）兩個既有分支維持原樣：沒有 canonical DB 時不佔用這個等待鏈。

### 2.2 車行回覆呼叫端（`apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts`）

- `submitReply` 內同步 Ops 客訴時間軸的 ordinary 分支（非 `settlement_dispute`），原本的 `try { addComplaintCaseNote(...) } catch { /* 吞掉 */ }` 改為：
  - 呼叫 `addComplaintCaseNote` 後，`await this.complaintService.awaitSettlementPersistence(caseItem.caseNo)`；
  - 只有在例外是 `ApiRequestError` 且 `code === "NOT_FOUND"`（ComplaintService 本來就沒有這個案號，例如純車行側 fixture 案件）時才吞掉；其餘例外（包含真正的 canonical 寫入失敗）一律重新拋出，不再假裝回覆成功。

### 2.3 Ops Console UI（`apps/ops-console-web/app/complaints/page.tsx`、`apps/ops-console-web/app/complaints/[caseNo]/page.tsx`）

- **F1 修復**：列表頁 `deriveComplaintActions` 對 `status === "resolved"` 的分支移除「重開」動作，只保留「新增備註」與「結案」；詳情頁 `deriveCaseActions` 的 `reopen` 動作 `enabled` 條件由 `resolved || closed` 改為 `closed`。兩處皆加註解說明與後端 409 契約對齊。
- 詳情頁 `[caseNo]/page.tsx` 之「可用動作」區塊目前是唯讀展示（無任何 `onClick`/表單綁定，僅 `<Link>` 導回列表），本次修復確保其展示內容不再誤導操作者；實際可執行動作仍只在列表頁 modal 中發出真正的 API 呼叫。

## 3. 驗收條件對應

| 驗收條件 | 對應實作與證據 |
| :--- | :--- |
| **complaint_original_terminal_state_and_actual_Ops_actions** | `complaint.service.ts` 的 F2 修復 + `page.tsx`/`[caseNo]/page.tsx` 的 F1 修復；回歸測試見第 4 節（`complaint-terminal-state-and-ack.test.ts` 的 F2 群組、既有 `complaint.test.ts`／`c045-complaint-lifecycle-sla.test.ts`／`complaint-taxonomy-reopen-sla.test.ts` 全數維持通過）。 |
| **complaint_ordinary_case_and_timeline_canonical_ACK** | `complaint.service.ts` 的 `persistChanges` 泛化修復；settlement 既有 transaction/wait/refresh 邏輯未變動（`settlement-persistence.test.ts` 內既有 settlement 案例全數維持通過）；noDB／repository 未注入分支維持原行為。 |
| **complaint_actual_callers_readback_failure_and_same_case_recovery** | 經由真實 `ComplaintController`（`addComplaintCaseNote`/`createComplaintCase` 等既有端點，未改動其呼叫介面）與真實 `FleetPartnerCaseService.submitReply` 驗證：positive create→assign→note→resolve→close→reopen 使用相同 caseNo 與真實狀態回讀；repository 層失敗會從舊版「假成功」變成拒絕。 |
| **complaint_preserved_settlement_PAX_fleet_auth_noDB_and_SLA** | 未改動乘客受理/評分交易、settlement dispute ACK/refresh/escalation 排序、Fleet case scope/closed/readback、SLA 類別工時/違約通知、角色/scope 拒絕與 noDB 行為；`pax-receipt-complaint-20261009/`、`fleet-statement-decisions-20261013/` 全套既有測試（含本次新增/調整項目）皆通過，見第 4 節。 |
| **complaint_exact_candidate_validation** | 第 4 節記錄本機實際執行指令、exit code 與套件範圍；獨立 reviewer（Gemini2）、CI 與保護合併為候選最終判定，由 candidate lifecycle 自動串接。 |

## 4. 實際指令與結果

Worktree：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-complaint-canonical-lifecycle-and-ack-20261015`，分支 `claude2/complaint-canonical-lifecycle-and-ack-20261015`，base `431966bdf2728a76f7b03907974a124ab4a48ae7`。

```bash
# 1. 本任務新增的專屬回歸套件（F1 後端契約、F2 終止狀態、F3 誠實 ACK）
$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/
 Test Files  1 passed (1)
      Tests  6 passed (6)
(exit 0)

# 2. 既有 write_scopes 內單元測試（含本次調整的 mock 與新增回歸案例）
$ pnpm exec vitest run tests/unit/complaint.test.ts \
    tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts \
    tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts
 Test Files  3 passed (3)
      Tests  33 passed (33)
(exit 0)

# 3. apps/api 本地單元測試（走 apps/api 自己的 vitest 入口，root 設定不含 apps/api/tests glob）
$ cd apps/api && pnpm exec vitest run tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts tests/unit/incident.controller.test.ts
 Test Files  3 passed (3)
      Tests  30 passed (30)
(exit 0)

# 4. 既有 settlement/fleet/passenger 套件回歸（含本次因共用 persistChanges 契約變更而調整的 3 個測試，見第 5 節說明）
$ pnpm exec vitest run tests/unit/fleet-statement-decisions-20261013/ tests/unit/pax-receipt-complaint-20261009/ \
    tests/unit/pax-booking-history-20261009/booking-access.test.ts \
    tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts \
    tests/unit/system-remediation/sr-qa-call-001/ tests/unit/reporting-filing.test.ts \
    tests/unit/pax-qa-20261009/ tests/unit/fleet-document-upload.test.ts \
    tests/unit/system-remediation/sr-qa-supply-001/ tests/unit/audit-gcp-artifact-providers-20261004/
 Test Files  33 passed | 8 skipped (41)
      Tests  534 passed | 147 skipped (681)
(exit 0；skipped 為需要 DATABASE_URL/postgres 的整合測試，與本任務無關，VM 限制下不執行)

# 5. 型別檢查（先以 tsc 重建已過期的 @drts/contracts、@drts/control-plane-auth dist，排除與本任務無關的既有 stale-dist 噪音，見記憶 project-stale-contracts-dist-breaks-typecheck）
$ (cd packages/contracts && pnpm exec tsc -p tsconfig.json)   # (exit 0)
$ (cd packages/control-plane-auth && pnpm exec tsc -p tsconfig.json)  # (exit 0)
$ (cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit)
(exit 0 — 本任務觸及檔案 complaint.service.ts / complaint.repository.ts / complaint.controller.ts / fleet-partner-case.service.ts 零錯誤)
$ (cd apps/ops-console-web && pnpm exec tsc --noEmit -p tsconfig.json)
(exit 0)

# 6. Lint（本任務觸及的程式碼與測試檔）
$ (cd apps/api && pnpm exec eslint src/modules/complaint/complaint.service.ts src/modules/fleet-partner/fleet-partner-case.service.ts --max-warnings=0)
(exit 0)
$ (cd apps/ops-console-web && pnpm exec eslint "app/complaints/page.tsx" "app/complaints/[caseNo]/page.tsx" --max-warnings=0)
(exit 0)
$ pnpm exec eslint tests/unit/complaint.test.ts tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts \
    tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts --max-warnings=0
(exit 0)
```

## 5. Write scope 以外的必要協調（§0.7：共用契約異動需搜尋受影響呼叫端/測試）

`persistChanges`／`awaitSettlementPersistence` 是既有、已在 settlement 流程中被所有 controller 端點依賴的共用契約；把它泛化到 ordinary 類別後，搜尋全庫受影響測試，發現 `tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts`（**不在**本任務原始 `write_scopes` 列表）裡有 3 處測試直接斷言了舊版「best-effort／fire-and-forget」行為本身：

- `preserves ordinary complaint synchronous mutation and best-effort persistence behavior`：舊版斷言 `awaitSettlementPersistence` 在 gate 尚未決議時就先回來、且 commit 狀態仍是舊值——這正是 F3 要修的那個行為，新版下會改為正確等待並在失敗時 reject。
- `preserves ordinary Callcenter transfers while ordinary persistence is pending`：舊版斷言 ordinary 的 Callcenter 轉客訴在寫入尚未 commit 時就先回成功——同樣是 F3 的反面案例。
- `continues numeric case sequences after generic settlement hydration while ignoring Fleet UUID IDs`：其手刻 repository mock 缺少 `isEnabled`，舊版程式碼在 ordinary 分支永遠不呼叫它，新版泛化後會呼叫到，產生 `TypeError`。

這三處已在本次修改中對應更新為反映新契約的斷言（更名以標註 `C045-F3`，並新增一個 Callcenter ordinary 失敗路徑的對稱案例），其餘 21 個既有案例（settlement 全套 `it.each` 矩陣、incident link、settlement repository 原子性等）斷言完全未變且全數通過（見第 4 節第 4 項，`settlement-persistence.test.ts` 本身 24/24 通過）。

這屬於「修改共用契約時必須搜尋並調整受影響呼叫端/測試」的既有規則（AI_COLLABORATION_GUIDE.md §0.7），而不是本任務刻意擴大範圍；建議 Supervisor 在下一次 write_scopes 同步時把此檔案補登為本任務的實際 touched test file。`tests/unit/complaint.test.ts` 內一處手刻 repository mock 同樣缺少 `isEnabled`，已在既有 write_scopes 範圍內直接補上。

## 6. 未做的部分（明列，不冒充成功）

1. **Ops Console UI 的真實瀏覽器/元件渲染驗證**：`apps/ops-console-web/app/complaints/page.tsx`、`.../[caseNo]/page.tsx` 的修復已通過本機 `tsc --noEmit` 與 `eslint` 驗證（型別與靜態正確性），但未在瀏覽器中實際渲染操作——VM 限制禁止啟動 `next dev`/Playwright。嘗試過把 `deriveComplaintActions`/`deriveCaseActions` 匯出並以 vitest 直接匯入驗證，但 `apps/ops-console-web` 沒有自己的 `vitest.config.ts`，會回退吃到 repo 根 `vitest.config.ts` 的 `"@"` alias（指向 `apps/tenant-console-web`，非 `apps/ops-console-web`），匯入即因 `@drts/tenant-auth/constants` 解析失敗而炸掉；修這個需要新增/調整 vitest alias 設定（跨出本任務 `write_scopes`、屬於測試基礎設施變更），已改為保留原始未匯出寫法，僅以程式碼內容核對與既有型別/lint 檢查驗證，不冒充已有渲染層驗收。
2. **真實 PostgreSQL canonical DB 下的實機驗證**：F3 修復以 mock repository（可控制 gate 的 `persistChanges`/`loadSettlementState`）驗證真實 controller/service 呼叫鏈的誠實 ACK 與失敗傳播；未在本機對接真實 Postgres 執行（`DATABASE_URL` 未配置，VM 限制不啟動 DB/product runtime）。`apps/api/tests/integration/fleet-statement-decisions.integration.test.ts` 等真實 DB 整合測試維持原狀，不屬本任務改動範圍。
3. **CI／保護合併／獨立 reviewer**：依候選生命週期由 `handoff` 之後的 GitHub bus／Gemini2 review 接續完成，本文件僅記錄本機證據。

## 7. Write scope 遵守情況

本任務改動限於以下檔案（§5 所述的測試檔案擴充已在此一併列出並說明）：

- `apps/api/src/modules/complaint/complaint.service.ts`（F2、F3）
- `apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts`（F3）
- `apps/ops-console-web/app/complaints/page.tsx`（F1）
- `apps/ops-console-web/app/complaints/[caseNo]/page.tsx`（F1）
- `tests/unit/complaint.test.ts`（既有 write_scopes；補 mock `isEnabled`）
- `tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts`（既有 write_scopes；補 mock `awaitSettlementPersistence`，新增 F3 回歸案例）
- `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts`（既有 write_scopes 新目錄；F1/F2/F3 專屬回歸）
- `docs/04-uat/COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015.md`（本文件）
- `tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts`（**超出原始 write_scopes**，第 5 節已說明必要性與建議補登）

未改動 `apps/api/src/modules/complaint/complaint.controller.ts`、`apps/api/src/modules/callcenter/callcenter.controller.ts`、`apps/api/src/modules/incident/incident.controller.ts`（task brief 列入 write_scopes 供協調，但三者既有程式碼已經在每個端點呼叫 `awaitSettlementPersistence`，F3 修復完全由 `persistChanges` 泛化覆蓋，不需要改動這三個 controller 檔案本身）；`apps/api/tests/unit/complaint-taxonomy-reopen-sla.test.ts`、`apps/api/tests/unit/complaint-incident-escalation.test.ts`（已存在且全數通過，未修改內容，僅在第 4 節重跑作為回歸證據）。
