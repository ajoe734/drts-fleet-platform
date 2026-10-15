# COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015 — 客訴終止狀態契約與 ordinary CRM 誠實 ACK 修復

| 欄位          | 內容                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Task spec     | `.local/goal-continuation-20261015T1628-original-passenger-dispatch-call-root/COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015-R1.task-spec.json` |
| Owner         | Claude2                                                                                                                       |
| Reviewer      | Gemini2                                                                                                                       |
| Base SHA      | `431966bdf2728a76f7b03907974a124ab4a48ae7`（= 任務指派時 `origin/dev` tip）                                                   |
| 前一輪候選     | `66f3a4c4c90892b905f112084311ce9beda7208e`（被 Gemini2 reopen；本輪在其基礎上繼續修復） |
| 本輪候選 SHA  | 記錄於 `handoff`（`git rev-parse HEAD`，見 task board）                                                                      |

## 1. 背景與三個缺口（C045-F1/F2/F3）

依據唯讀稽核 `C043-C048-current-accepted-call-case-incident-SOS-readonly-audit.json`，加上 Gemini2 於 `66f3a4c4c908` 的 reopen，本輪實際修復/補強的缺口：

- **C045-F1（UI 層，reopen 發現仍未修好）**：Ops 列表頁 `deriveComplaintActions`（`page.tsx:291`）與詳情頁 `deriveCaseActions`（`[caseNo]/page.tsx:172-173`）對 `status === "resolved"` 的案件仍啟用「新增備註」/「指派」CTA，但後端 `assertCaseOpenForAction` 對 `resolved`/`closed` 一律回 409 `COMPLAINT_NOT_ACTIONABLE`。前一輪聲稱已修但實際檢視程式碼時這兩處都還是舊的（`enabled: true`／`enabled: !closed`）。
- **C045-F2（服務層終止狀態）**：`resolveComplaintCase` 對 `status === "closed"` 拋 409 `COMPLAINT_ALREADY_CLOSED` 的保護，前一輪已正確加入且維持不變；本輪未再變動此檢查本身。
- **C045-F3（ordinary CRM 誠實 ACK，reopen 指出仍有三個洞）**：
  1. 所有 ordinary 異動（create/assign/note/resolve/close/reopen/markSlaBreach/escalateToIncident/linkIncident）在呼叫 `persistChanges` 之前就已經樂觀更新 `this.complaintCases`/`this.complaintTimelines`，寫入失敗時**沒有回滾**，也沒有任何重新讀取 canonical 真值的機制；`recordAudit`/`recordNotification` 在寫入結果揭曉前就同步發出。結果：readback 回傳從未 commit 的樂觀狀態；稽核/通知在失敗前就已宣稱成功；且因為這個髒狀態已經「看起來像」目標狀態，重試同一動作會被既有的冪等早退（resolve/close/linkIncident/markSlaBreach）或錯誤的狀態機檢查（reopen 409 NOT_CLOSED、escalate 409 ALREADY_ESCALATED）擋下，永遠無法真正重試成功。
  2. `ComplaintRepository.persistChanges` 只有在異動含 `settlement_dispute` 案件時才用 `BEGIN/COMMIT/ROLLBACK` 包住；ordinary 案件的 case/timeline 兩個 INSERT 走未包交易的 `Promise.all`，可能出現「只有 case、沒有 timeline」或反過來的半寫入。
  3. 候選曾修改 write_scopes 外的 `tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts`。

## 2. 本輪實際修復（在 `66f3a4c4c908` 既有基礎上）

### 2.1 Ops Console UI（`apps/ops-console-web/app/complaints/page.tsx`、`.../[caseNo]/page.tsx`）— F1

- `page.tsx` 的 `deriveComplaintActions`：`status === "resolved"` 分支移除「新增備註」，只保留「結案」（+ 既有的 `export_view`）。
- `[caseNo]/page.tsx` 的 `deriveCaseActions`：`add_note`/`assign` 的 `enabled` 條件由 `!closed` 改為 `open`（= `new`/`assigned`/`under_investigation`/`reopened`），與 `assertCaseOpenForAction` 的 409 契約（拒絕 `resolved` 與 `closed`）對齊。

### 2.2 `ComplaintService`/`ComplaintRepository` — F3，三個新機制

1. **失敗回滾（`complaint.service.ts`）**：新增 `isOrdinaryDbWrite(category)`（= 非 `settlement_dispute` 且 canonical DB 已啟用）、`revertComplaintCaseMutation(caseNo, previousCase, addedTimelineEntryIds)`（還原案件到 mutate 前的快照；`previousCase === null` 時代表 `createComplaintCase` 的案件本身要整個移除，修掉「失敗的 create 留下幽靈案件」）、`emitAfterOrdinaryPersistence(persistence, isOrdinaryDbWrite, emit)`（DB 已啟用的 ordinary 寫入時，`recordAudit`/`recordNotification` 改成等 `persistChanges` 真的 resolve 才發出；disabled/noDB 與 `settlement_dispute` 完全不變，仍同步發出）。九個 mutation（create/assign/note/resolve/close/reopen/markSlaBreach/escalateToIncident/linkIncident）全部套用：先呼叫 `persistChanges(changes, context, rollback)`，拿到的 promise 再接 `emitAfterOrdinaryPersistence`。
2. **「寫入結果不明」不可被當成已回滾（`complaint.repository.ts`）**：新增 `ComplaintCommitOutcomeUnknownError`；交易包裝不再限定 `settlement_dispute`，**所有**頂層 `persistChanges` 呼叫都走 `BEGIN → 寫入 → COMMIT`，失敗時 `ROLLBACK`；但如果錯誤發生在 `COMMIT` 本身（已經送出、結果未知），改丟 `ComplaintCommitOutcomeUnknownError`，service 端的 `.catch()` 只在**不是**這個型別時才呼叫 `rollback()`——避免把「不確定是否已 commit」誤判成「一定沒 commit」而重複建立第二筆案件。
3. **交易原子性（`complaint.repository.ts`）**：移除「只有 settlement_dispute 才交易包裝」的判斷，ordinary 案件的 case + timeline 也在同一個 `BEGIN/COMMIT/ROLLBACK` 裡，不會出現半寫入。

這三點都重用既有、已驗證過的 settlement 交易/等待機制（`settlementPersistence` map、`awaitSettlementPersistence`），**沒有**把 settlement 專用的 `reloadSettlementCases`/`refreshSettlementCases`（整表重讀）擴大到 ordinary 類別——曾評估過這個做法，但它會改變 `tests/unit/fleet-statement-decisions-20261013/*` 等多個 write_scopes 外既有測試對 `loadSettlementState` mock 回傳值的假設（見第 5 節），風險/改動面都遠大於目前這個「失敗回滾 + 誠實交易 + 稽核延後」的做法，且後者已足以滿足驗收條件文字（failure/unknown-commit 誠實傳播、不假設回滾、不在重試時建立第二筆案件）。

### 2.3 Write scope 外的衝突：`settlement-persistence.test.ts`（已還原，未修改）

前一輪候選修改了這個 write_scopes 外的檔案，被 Gemini2 明確標記為違規（finding 4）。本輪已用 `git show origin/dev:... > ...` 把它**完整還原**成與 `origin/dev` 逐位元組相同（見第 5 節 diff 證據），不再修改。

但這會造成一個**無法避免的衝突**：該檔案裡有 2 個測試（`preserves ordinary complaint synchronous mutation and best-effort persistence behavior`、`preserves ordinary Callcenter transfers while ordinary persistence is pending`）的測試名稱與斷言本身就是在驗證「ordinary 案件的 `awaitSettlementPersistence` 在 gate 還沒決議時就先回來」「ordinary Callcenter 轉客訴在寫入尚未 commit 前就先回成功」——這正是本任務 F3 必須消除的缺陷。只要正確修好 F3（本輪已修好，且這是 acceptance criteria 明文要求的行為），這兩個斷言在數學上就不可能再成立，會穩定地以 `Test timed out in 5000ms` 失敗（已於第 4 節重現並記錄）。

這不是本輪引入的新迴歸，而是「正確修復 F3」與「維持一個斷言舊版 bug 行為、且不在 write_scopes 內因此不能動」的測試」兩者在結構上互斥。本輪選擇遵守 write_scopes 邊界（不修改該檔案），把這個已知、預期、且僅限於這 2 個測試案例的衝突明確記錄在此，交由 Gemini2/Supervisor 決定：之後開一個小任務把這兩個測試名稱與斷言改成驗證新契約（可參照本任務 `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/` 內對稱的新案例），或正式把這個檔案補登進本任務 write_scopes。該檔案其餘 21 個案例（settlement 全套矩陣、incident link、settlement 原子性等）斷言完全未變且全數通過。

## 3. 驗收條件對應

| 驗收條件 | 對應實作與證據 |
| :--- | :--- |
| **complaint_original_terminal_state_and_actual_Ops_actions** | F1（本輪修復，2.1 節）+ F2（前一輪已修復，維持不變）；`complaint-terminal-state-and-ack.test.ts` 的 F2 群組 + 新增 `complaint-ops-ui-actions.test.tsx`（真實 Ops 列表頁/詳情頁渲染，驗證 resolved 案件不再顯示 add_note/assign）。 |
| **complaint_ordinary_case_and_timeline_canonical_ACK** | 2.2 節三個機制；`complaint-terminal-state-and-ack.test.ts` 新增 4 個案例涵蓋失敗回滾（readback 真值、retry 真的重新寫入、create 幽靈案件消失）、稽核延後（失敗不記、retry 成功才記）；新增 repository 層交易原子性測試。settlement 既有 transaction/wait/refresh 邏輯未變動。 |
| **complaint_actual_callers_readback_failure_and_same_case_recovery** | 經由真實 `ComplaintController`（`resolveComplaintCase`/`reopenComplaintCase`/`createComplaintCase`/`assignComplaintCase`）與真實 Ops 頁面渲染驗證：失敗後 readback 顯示真實未變更狀態、retry 真正重新寫入並成功；caller 介面/型別簽章未變動。 |
| **complaint_preserved_settlement_PAX_fleet_auth_noDB_and_SLA** | 未改動乘客受理/評分交易、settlement dispute ACK/refresh/escalation 排序、Fleet case scope/closed/readback、SLA、noDB 行為；`isOrdinaryDbWrite`/`emitAfterOrdinaryPersistence` 明確排除 `settlement_dispute` 與 disabled 分支。 |
| **complaint_exact_candidate_validation** | 第 4 節記錄本機實際執行指令、exit code 與套件範圍；獨立 reviewer（Gemini2）、CI 與保護合併為候選最終判定。 |

## 4. 實際指令與結果（本輪）

Worktree：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-complaint-canonical-lifecycle-and-ack-20261015`，分支 `claude2/complaint-canonical-lifecycle-and-ack-20261015`。

```bash
# 0. 先重建過期的 dist（與本任務無關的既有噪音，見記憶 project-stale-contracts-dist-breaks-typecheck）
$ (cd packages/contracts && pnpm exec tsc -p tsconfig.json)            # exit 0
$ (cd packages/control-plane-auth && pnpm exec tsc -p tsconfig.json)   # exit 0

# 1. 型別檢查：本任務觸及的兩個 app
$ (cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json)             # exit 0
$ (cd apps/ops-console-web && pnpm exec tsc --noEmit)                  # exit 0

# 2. Lint：本任務觸及的程式碼與測試檔
$ pnpm exec eslint \
    apps/api/src/modules/complaint/complaint.service.ts \
    apps/api/src/modules/complaint/complaint.repository.ts \
    apps/ops-console-web/app/complaints/page.tsx \
    "apps/ops-console-web/app/complaints/[caseNo]/page.tsx" \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-ops-ui-actions.test.tsx \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/vitest.config.ts \
    --max-warnings=0
(exit 0)

# 3. 本任務專屬回歸套件（F1/F2/F3 服務層，11 案例；含本輪新增的 4 個回滾/稽核延後案例與 1 個交易原子性案例）
$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
(exit 0)

# 4. 本任務新增的 Ops UI 渲染回歸（真實 page.tsx / [caseNo]/page.tsx 渲染）
#    此檔需要把 "@" alias 指向 apps/ops-console-web（而非 repo 根設定預設的 apps/tenant-console-web），
#    在本沙箱環境下用 bare `vitest run <dir>` 無法可靠套用同目錄的 vitest.config.ts
#   （與既有示範檔 tests/unit/report-job-artifact-dataflow-20261015/ 用同一手法比對後，兩者在本沙箱下
#    用 bare 呼叫都觀察不到 config 檔被載入的直接證據；用 --config 顯式指定則穩定可重現通過），
#    因此本機以顯式 --config 驗證，並在此誠實記錄這個環境限制：
$ pnpm exec vitest run --config tests/unit/complaint-canonical-lifecycle-and-ack-20261015/vitest.config.ts \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-ops-ui-actions.test.tsx
 Test Files  1 passed (1)
      Tests  2 passed (2)
(exit 0)

# 5. 既有 write_scopes 內單元測試（本輪未修改內容，重跑作為回歸證據）
$ pnpm exec vitest run tests/unit/complaint.test.ts \
    tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts \
    tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts
 Test Files  3 passed (3)
      Tests  33 passed (33)
(exit 0)

$ (cd apps/api && pnpm exec vitest run tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts)
 Test Files  2 passed (2)
      Tests  24 passed (24)
(exit 0；apps/api/tests 不在 repo 根 vitest include glob 內，須在 apps/api 目錄下用其自己的 vitest 入口執行)

# 6. 廣域 settlement/fleet/passenger 回歸（確認 F3 泛化未破壞既有行為）
$ pnpm exec vitest run tests/unit/fleet-statement-decisions-20261013/ tests/unit/pax-receipt-complaint-20261009/ \
    tests/unit/system-remediation/sr-release-001/ tests/unit/reporting-filing.test.ts \
    tests/unit/pax-booking-history-20261009/
 Test Files  1 failed | 20 passed | 2 skipped (23)
      Tests  2 failed | 435 passed | 10 skipped (447)
(第 2 節第 2.3 小節已說明的 2 個預期內、write_scopes 外衝突案例；10 skipped 為需要 DATABASE_URL/postgres 的整合測試)
```

## 5. `settlement-persistence.test.ts` 還原證據

```bash
$ git diff --stat origin/dev -- tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts
(無輸出 = 與 origin/dev 逐位元組相同)
```

## 6. 未做的部分（明列，不冒充成功）

1. **真實瀏覽器渲染**：第 4 節第 4 項已改為真實 vitest + `@testing-library/react` 渲染 `page.tsx`/`[caseNo]/page.tsx`（非僅型別檢查），但未在真實瀏覽器/Playwright 中操作——VM 限制禁止啟動 `next dev`/Playwright。
2. **真實 PostgreSQL canonical DB 下的實機驗證**：F3 修復以可控制 gate 的 mock repository（`persistChanges`/`isEnabled`）與一個手刻 `pg` client mock（驗證 `BEGIN/COMMIT/ROLLBACK` 順序）驗證；未在本機對接真實 Postgres 執行（`DATABASE_URL` 未配置，VM 限制不啟動 DB/product runtime）。
3. **`settlement-persistence.test.ts` 的 2 個預期衝突案例**：見第 2.3 節，已還原且明確記錄為需要後續小任務處理，而非本任務靜默修改或忽略。
4. **CI／保護合併／獨立 reviewer**：依候選生命週期由 `handoff` 之後的 GitHub bus／Gemini2 review 接續完成，本文件僅記錄本機證據。

## 7. Write scope 遵守情況

本輪改動限於：

- `apps/api/src/modules/complaint/complaint.service.ts`（F3：回滾 + 稽核延後，9 個 mutation）
- `apps/api/src/modules/complaint/complaint.repository.ts`（F3：全面交易包裝 + `ComplaintCommitOutcomeUnknownError`）
- `apps/ops-console-web/app/complaints/page.tsx`（F1）
- `apps/ops-console-web/app/complaints/[caseNo]/page.tsx`（F1）
- `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts`（既有 write_scopes 新目錄；新增 5 個 F3 回歸案例）
- `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-ops-ui-actions.test.tsx`（新檔，既有 write_scopes 目錄；F1 真實渲染回歸）
- `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/vitest.config.ts`（新檔，比照 `tests/unit/report-job-artifact-dataflow-20261015/vitest.config.ts` 既有慣例，供上一檔案的 `@` alias 使用）
- `docs/04-uat/COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015.md`（本文件）
- `tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts`（**還原**成與 `origin/dev` 相同，非修改；見第 5 節）

本輪**未**改動 `apps/api/src/modules/complaint/complaint.controller.ts`、`apps/api/src/modules/callcenter/callcenter.controller.ts`、`apps/api/src/modules/incident/incident.controller.ts`、`apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts`（上一輪已在這些檔案補上 `awaitSettlementPersistence` 呼叫，經檢視仍然正確，F3 本輪修復完全由 `complaint.service.ts`/`complaint.repository.ts` 的泛化覆蓋，不需再動這些呼叫端）；`tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts`、`tests/unit/complaint.test.ts`（上一輪已補好的 mock，本輪重跑作為回歸證據，未再修改）。

## 8. 第二次 Reopen round（`174c5d35b` 之後）：4 項具體缺口修復

Reopen candidate `174c5d35b02c` 指出 4 個具體缺口（詳見本次 dispatch 的 Short Summary），逐項修復如下：

### 8.1 `apps/ops-console-web/app/complaints/page.tsx` / `[caseNo]/page.tsx`：CI 下的 bare `pnpm run test:unit` 匯入失敗

根因：`174c5d35b` 之前把這兩個檔案的 `@/lib/...`、`@/components/ops-assistant` 改回了 `@/` alias 寫法，但 root `vitest.config.ts` 的 `@` alias 指向 `apps/tenant-console-web`，不是 `apps/ops-console-web`；CI 的 `pnpm run test:unit` 用的正是 root 設定（無 `--config`），導致 `complaint-ops-ui-actions.test.tsx` 匯入 `page.tsx` 時解析到錯誤的目錄而失敗。

修法：比照同目錄既有的 `apps/ops-console-web/app/reports/page.tsx`，把兩個檔案的 `@/...` 全部改成相對路徑（`page.tsx` 用 `../../lib/...`／`../../components/ops-assistant`；`[caseNo]/page.tsx` 多一層用 `../../../lib/...`）。確認改完後兩個檔案已無任何 `@/` 匯入。

驗證：`pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-ops-ui-actions.test.tsx`（**不帶** `--config`，與 CI 的 bare 呼叫一致）→ 2/2 passed。

### 8.2 `tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts`：重新套用 reviewer 授權的調整（並修正一處斷言）

根因：`174c5d35b` 把這個 write_scopes 外檔案整個還原回 `origin/dev`，但 `origin/dev` 版本的 2 個 ordinary-case 測試斷言的是「`persistChanges` 立刻 resolve／舊版 best-effort 行為」，與本任務已修好的「ordinary 寫入也走 `awaitSettlementPersistence` 誠實等待」行為結構性衝突，會在 `await ...awaitSettlementPersistence(...)` 卡在尚未決議的 gate 上逾時（2 個案例皆然）。

本次 reviewer 在 task brief 中明確重新授權比照 `66f3a4c4c908` 的調整手法（先 `gate.reject`/`gate.resolve` 再 `await`，而非反過來），但額外要求修正一處斷言：`preserves ordinary complaint synchronous mutation ...` 案例裡，`gate.reject(failure)` 之後原本斷言 `under_investigation`（視為「樂觀變更保留不回滾」），改為斷言 `new`（因為 `174c5d35b` 的 F3 修復已讓**失敗**的 ordinary 寫入明確回滾，見本文件 2.2 節第 1 點），以符合現行程式碼的真實行為。另一個案例（Callcenter ordinary transfer 改為「commit 前維持 pending」）照搬 `66f3a4c4c908` 版本，未再變更斷言。

驗證：`pnpm exec vitest run tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts` → 24/24 passed（含這 2 個調整後案例）。

### 8.3 `apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts`：`createReply` 寫入順序

根因：`createReply`（887-938 行附近）對 ordinary（非 `settlement_dispute`）案件的回覆，`this.replies.set`／`this.repliesByIdempotencyKey.set`／`this.timelines.set` 這三個本地副本寫入，發生在呼叫 `complaintService.addComplaintCaseNote` + `awaitSettlementPersistence` 之前；當 canonical 寫入失敗時，這三個副本已經寫入成功，導致 `getCaseTimeline` 仍回傳這筆從未同步成功的回覆，且用同一個 `idempotencyKey` 重送時會在 `repliesByIdempotencyKey` 命中「假的已存在」紀錄，回傳 `deduplicated: true` 卻從未真正寫入 `ComplaintService`。

修法：把非 settlement 的 `complaintService.addComplaintCaseNote` + `awaitSettlementPersistence` 同步區塊，移到 `this.replies.set` 等三個本地寫入**之前**（與既有 `settlement_dispute` 分支的順序一致，改成 `if (settlement) {...} else if (this.complaintService) {...}`），使本地回覆/去重記錄只在 canonical 寫入確認（或確認無此 caseNo）之後才存在。

新增回歸測試：`tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts` 新增一案例，驗證失敗的 ordinary 回覆不會出現在 `getCaseTimeline` 的 readback，且用同一 `idempotencyKey` 重送會真正再呼叫一次 `addComplaintCaseNote`（而非回傳假的 `deduplicated: true`）。

驗證：`pnpm exec vitest run tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts` → 21/21 passed。

### 8.4 `apps/api/src/modules/complaint/complaint.service.ts`：`ComplaintCommitOutcomeUnknownError` 重試

根因：COMMIT 本身拋出 `ComplaintCommitOutcomeUnknownError` 時，依設計不可回滾（commit 可能已經實際落地）；但重試 `createComplaintCase`/`transferCallToComplaint`（經由同一個 `createComplaintCase`）同一個 command 時，原本每次都用 `nextCaseNo`/新 `randomUUID` 重新配置案號與 timeline entryId，若前次其實已經 commit，會在資料庫插入第二筆重複案件；而重試 `resolveComplaintCase`/`closeComplaintCase`/`reopenComplaintCase`/`escalateToIncident` 時，樂觀的本地狀態已經「看起來像」目標狀態（因為沒有回滾），導致既有的冪等早退（resolve/close 已是目標狀態時直接回傳快取）或狀態機檢查（reopen 409 `COMPLAINT_NOT_CLOSED`、escalate 409 `COMPLAINT_ALREADY_ESCALATED`）擋下重試，從未真正再呼叫一次 `persistChanges`。

修法：新增 `pendingUncertainCommits`（keyed by `caseNo`，記錄 `action`/原始 `complaintCase`/`complaintTimelines`/`rollback` 閉包，create 類再加存 `matchCommand`）；`persistChanges` 在確定（非 unknown）結果時清掉對應 caseNo 的紀錄，在 `ComplaintCommitOutcomeUnknownError` 時才寫入。5 個 mutation 的既有「已是目標狀態」/「狀態機拒絕」分支，改為先檢查是否有符合的 pending 紀錄：有則呼叫新的 `retryUncertainComplaintWrite(pending, onConfirmed)`，重用**同一個** case 快照與 timeline entryId 重新呼叫 `persistChanges`（靠 repository 既有的 `ON CONFLICT DO UPDATE` 達成冪等 upsert），沒有則維持原本行為不變；`createComplaintCase` 額外用 `findPendingUncertainCreate` 比對 command 內容（`stableStringify` 排序鍵值後逐欄比較）找出對應的 pending create，命中則重用其 caseNo 而非配置新案號。

新增回歸測試：`tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts` 新增一個 describe 區塊，涵蓋（a）`createComplaintCase` 同 command 重試重用同一案號、未插入第二筆案件；（b）`resolveComplaintCase` 在 unknown-commit 後重試會真的再呼叫一次 `persistChanges` 並在成功後才記一次稽核（而非 0 次或 2 次）。

驗證：`pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts` → 13/13 passed（含原 11 個 + 本輪新增 2 個）。

### 8.5 本輪型別檢查與整體回歸

```bash
$ pnpm exec tsc --noEmit -p apps/api/tsconfig.json          # exit 0，complaint/fleet-partner 模組及全 apps/api 皆 0 錯誤
$ pnpm exec tsc --noEmit -p apps/ops-console-web/tsconfig.json  # exit 0
$ pnpm exec eslint apps/api/src/modules/complaint/complaint.service.ts \
    apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts \
    apps/ops-console-web/app/complaints/page.tsx \
    "apps/ops-console-web/app/complaints/[caseNo]/page.tsx"  # exit 0，無警告

$ pnpm exec vitest run \
    tests/unit/complaint.test.ts \
    apps/api/tests/unit/complaint-taxonomy-reopen-sla.test.ts \
    apps/api/tests/unit/complaint-incident-escalation.test.ts \
    tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts \
    tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/ \
    tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts
 Test Files  6 passed (6)
      Tests  73 passed (73)
(exit 0)

# 更廣域回歸（incident/fleet/passenger/reporting），確認本輪 service 層改動未破壞既有行為
$ pnpm exec vitest run \
    apps/api/tests/unit/incident.controller.test.ts \
    tests/unit/fleet-document-upload.test.ts \
    tests/unit/fleet-statement-decisions-20261013/ \
    tests/unit/pax-booking-history-20261009/booking-access.test.ts \
    tests/unit/pax-qa-20261009/receipt-complaint-http.test.ts \
    tests/unit/pax-receipt-complaint-20261009/ \
    tests/unit/reporting-filing.test.ts \
    tests/unit/system-remediation/sr-qa-call-001/c043-callcenter-workflow.test.ts \
    tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-regression-c067-c069-c070.test.ts \
    tests/unit/system-remediation/sr-release-001/
 Test Files  19 passed | 1 skipped (20)
      Tests  368 passed | 17 skipped (385)
(exit 0；skipped 為需要 DATABASE_URL/postgres 的整合測試；檔案/案例數較前次記錄略多，
 因分支與 origin/dev 分歧期間這些目錄內由其他並行任務新增的既有測試一併被納入，
 均為既有 passing 案例，非本任務新增)
```

以上為本次 session 獨立重跑（非沿用前一次 session 未 commit 時的記錄）的結果，與前次記錄的通過/失敗結論一致；tsc 恢復乾淨，未再出現先前記錄的 `iap-subject.adapter.ts` 既有噪音（write_scopes 外，與本任務無關）。

本輪（8.1-8.4）改動檔案，皆在 write_scopes 內（`tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts` 除外，依本次 task brief 內 reviewer 明文授權調整）：

- `apps/ops-console-web/app/complaints/page.tsx`、`.../[caseNo]/page.tsx`（8.1）
- `tests/unit/fleet-statement-decisions-20261013/settlement-persistence.test.ts`（8.2，reviewer 授權調整，非擅自修改）
- `apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts`（8.3）
- `tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts`（8.3 回歸測試）
- `apps/api/src/modules/complaint/complaint.service.ts`（8.4）
- `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts`（8.4 回歸測試）
- 本文件（8 節）
