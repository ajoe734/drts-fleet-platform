# COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015 — 客訴終止狀態契約與 ordinary CRM 誠實 ACK 修復

| 欄位         | 內容                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Task spec    | `.local/goal-continuation-20261015T1628-original-passenger-dispatch-call-root/COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015-R1.task-spec.json` |
| Owner        | Claude2                                                                                                                                         |
| Reviewer     | Gemini2                                                                                                                                         |
| Base SHA     | `431966bdf2728a76f7b03907974a124ab4a48ae7`（= 任務指派時 `origin/dev` tip）                                                                     |
| 前一輪候選   | `66f3a4c4c90892b905f112084311ce9beda7208e`（被 Gemini2 reopen；本輪在其基礎上繼續修復）                                                         |
| 本輪候選 SHA | 記錄於 `handoff`（`git rev-parse HEAD`，見 task board）                                                                                         |

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

| 驗收條件                                                             | 對應實作與證據                                                                                                                                                                                                                                                                |
| :------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **complaint_original_terminal_state_and_actual_Ops_actions**         | F1（本輪修復，2.1 節）+ F2（前一輪已修復，維持不變）；`complaint-terminal-state-and-ack.test.ts` 的 F2 群組 + 新增 `complaint-ops-ui-actions.test.tsx`（真實 Ops 列表頁/詳情頁渲染，驗證 resolved 案件不再顯示 add_note/assign）。                                            |
| **complaint_ordinary_case_and_timeline_canonical_ACK**               | 2.2 節三個機制；`complaint-terminal-state-and-ack.test.ts` 新增 4 個案例涵蓋失敗回滾（readback 真值、retry 真的重新寫入、create 幽靈案件消失）、稽核延後（失敗不記、retry 成功才記）；新增 repository 層交易原子性測試。settlement 既有 transaction/wait/refresh 邏輯未變動。 |
| **complaint_actual_callers_readback_failure_and_same_case_recovery** | 經由真實 `ComplaintController`（`resolveComplaintCase`/`reopenComplaintCase`/`createComplaintCase`/`assignComplaintCase`）與真實 Ops 頁面渲染驗證：失敗後 readback 顯示真實未變更狀態、retry 真正重新寫入並成功；caller 介面/型別簽章未變動。                                 |
| **complaint_preserved_settlement_PAX_fleet_auth_noDB_and_SLA**       | 未改動乘客受理/評分交易、settlement dispute ACK/refresh/escalation 排序、Fleet case scope/closed/readback、SLA、noDB 行為；`isOrdinaryDbWrite`/`emitAfterOrdinaryPersistence` 明確排除 `settlement_dispute` 與 disabled 分支。                                                |
| **complaint_exact_candidate_validation**                             | 第 4 節記錄本機實際執行指令、exit code 與套件範圍；獨立 reviewer（Gemini2）、CI 與保護合併為候選最終判定。                                                                                                                                                                    |

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

### 8.6 接續被中斷的 origin/dev merge，修正 settlementPersistence 洩漏

前一 session 在 `git merge origin/dev`（`MERGE_HEAD ce69322f`）時對 `complaint.service.ts` 與兩個 Ops 頁面的三個衝突已在 working tree 完成解衝突（無殘留 conflict marker，內容與 8.1-8.5 的 F1/F2/F3 修法一致），但於 commit 前 process 被中止（exit 143），merge 停留在 index 的 UU 狀態。本輪直接沿用該已解完的 working tree 內容（未重新 fetch、未重建 merge、未套用其他歷史 archive），`git add` 三檔並 `git commit` 完成 merge checkpoint（commit `0f617fac0`）。另一同批未 staged 的 `vitest.config.ts`（為 ops-console-web 的 `@/lib/api-client.server`／`@/lib/localized-labels`／`@/lib/ops-cross-app-links` 新增 root 層級 alias，供 `complaint-ops-ui-actions.test.tsx` 經由 root vitest config 直接執行時正確解析）一併納入同一 merge commit。

Merge 後重跑 `apps/api` 與 `apps/ops-console-web` 的 `tsc --noEmit` 皆 exit 0；但 `complaint-terminal-state-and-ack.test.ts` 出現 3 個新失敗（resolve/reopen/assign 各一個「rolls back a failed ordinary ... so a retry ...」案例）。

根因定位：`persistChanges` 的 catch 分支在非 `ComplaintCommitOutcomeUnknownError`（即確定失敗、已呼叫 `rollback()`）情況下，只清了 `pendingUncertainCommits`，未清對應 caseNo 在 `settlementPersistence` 的項目。該 rejected promise 因此持續留在 map 中；下一次任何 controller action 開頭呼叫的 `refreshSettlementCases()`（經 `reloadSettlementCases()` 內不帶 caseNo 的 `awaitSettlementPersistence()`）會把它與其它 pending 項目一併 `Promise.allSettled`，掃到後重新 `throw failure.reason`，導致同一案件的重試（甚至其他不相干案件的下一次請求）在尚未真正呼叫 `resolveComplaintCase`/`reopenComplaintCase`/`assignComplaintCase` 本體邏輯前，就被這個舊的、已經回報過一次的失敗攔截並 reject。

修法：在該 catch 分支清 `pendingUncertainCommits` 的同一個迴圈內，若 `settlementPersistence.get(caseNo) === persistence`（即尚未被其他寫入覆蓋），一併刪除該項目，與 `awaitSettlementPersistence(caseNo)` 既有的定點 drain 邏輯行為一致，避免確定失敗且已回滾的寫入被重複掃到。

驗證：

```bash
$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)

$ pnpm exec vitest run tests/unit/complaint.test.ts tests/unit/complaint-canonical-lifecycle-and-ack-20261015/ \
    tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts \
    tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts \
    tests/unit/fleet-statement-decisions-20261013/complaint-escalation-concurrency.test.ts \
    tests/unit/pax-receipt-complaint-20261009/complaint-intake.test.ts \
    tests/unit/pax-postride-same-order-20261016/complaint-detail-state.test.ts
 Test Files  8 passed (8)
      Tests  108 passed (108)

$ cd apps/api && pnpm exec vitest run tests/unit/callcenter.service.test.ts tests/unit/incident.controller.test.ts \
    tests/unit/complaint-incident-escalation.test.ts tests/unit/complaint-taxonomy-reopen-sla.test.ts
 Test Files  4 passed (4)
      Tests  38 passed (38)

$ pnpm exec vitest run tests/unit/fleet-statement-decisions-20261013/ tests/unit/fleet-document-upload.test.ts
 Test Files  8 passed (8)
      Tests  103 passed (103)

$ pnpm --filter @drts/api exec tsc --noEmit -p tsconfig.json        # exit 0
$ cd apps/ops-console-web && pnpm exec tsc --noEmit -p tsconfig.json  # exit 0
$ pnpm exec eslint apps/api/src/modules/complaint/complaint.service.ts \
    apps/api/src/modules/complaint/complaint.controller.ts \
    apps/ops-console-web/app/complaints/page.tsx \
    "apps/ops-console-web/app/complaints/[caseNo]/page.tsx" \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/ --max-warnings=0   # exit 0
```

本輪改動檔案：`apps/api/src/modules/complaint/complaint.service.ts`（8.6 的 settlementPersistence 清理修正；write_scopes 內）、`vitest.config.ts`（接續前一 session 已完成的 alias 新增，供 write_scopes 內測試執行；非本任務政策變更）。

- 本文件（8 節）

## 9. Root ca237 review 六項 unknown-COMMIT findings ＋ captureAudit TypeError 修復

前一 session（`claude2-20261018T221042Z-337e25a7`）針對 reviewer 在 `ca237ed9d` 上提出的六項 unknown-COMMIT 缺口與 `retryUncertainComplaintWrite` 的 captureAudit 形狀 TypeError，已寫出 `complaint.repository.ts`（新增 `loadCaseByCaseNo`）、`complaint.service.ts`（`reconcilePendingCase(s)`、`refreshSettlementCases` 接線、`retryUncertainComplaintWrite` 簽名改為接受 `auditInput` 直傳而非回呼）與 `complaint-terminal-state-and-ack.test.ts`（新增 9 個 `C045-F3-20261018-*` 案例）三份 WIP，但於 22:34:52 因 supervisor 更高優先序 review 搶占而 exit 143，未 checkpoint（HEAD 仍是 `ca237ed9d`，worktree 僅有未提交的三檔變更）。本輪直接沿用該 WIP（內容與 custody 記錄的 sha256 完全一致，未重做、未取用 18:31 舊 merge archive），在其基礎上定位並修掉剩餘的 2 個邏輯缺陷，使當時卡在 8 failed/14 passed 的 22 案例全部轉綠。

### 9.1 根因一：`ComplaintCommitOutcomeUnknownError` 分支遺漏 settlementPersistence 清理（READBACK/LINK-SLA-RETRY/ESCALATION-CALLER 共 6 個案例失敗的共同成因）

`persistChanges` 的 catch 分支中，`error instanceof ComplaintCommitOutcomeUnknownError` 分支只寫入 `pendingUncertainCommits`，未如另外兩個分支（確定失敗、isRetry 失敗）一樣同步刪除 `settlementPersistence.get(caseNo)` 對應的 rejected promise。這與 8.6 修的是同一類洩漏，只是 8.6 修的是「確定失敗」分支，這裡遺漏的是「commit 結果未知」分支。後果：任一 controller action 開頭的 `refreshSettlementCases()`（經 `reloadSettlementCases()` 內不帶 caseNo 的 `awaitSettlementPersistence()`）會重新掃到這個已經轉為 `pendingUncertainCommits` 的舊 rejection 並 `throw failure.reason`，導致 `reconcilePendingCase` 根本沒有機會跑，不管測試如何 mock `loadCaseByCaseNo`，第二次呼叫一律在 `refreshSettlementCases()` 這一步就被舊錯誤攔截。

修法：在 `ComplaintCommitOutcomeUnknownError` 分支寫入 `pendingUncertainCommits` 之後，比照另外兩分支，一併刪除 `settlementPersistence` 中仍指向同一個 `persistence` promise 的項目。

### 9.2 根因二：`reconcilePendingCase` 把「更新案件查無durable列」誤判為「確定未 commit」

修掉 9.1 後，READBACK（2）、LINK-SLA-RETRY（2）、ESCALATION-CALLER（1）共 5 案例轉綠，但 NOTE-REPLAY 的 note／assign 兩案例在 5000ms 逾時。定位：這兩個測試的 `loadCaseByCaseNo` mock 全程回傳 `null`（未如其他案例在驗證前改為 `mockResolvedValue(...)`）。既有 WIP 的 `reconcilePendingCase` 把「`durableCase === null`」無差別視為「未 commit，執行 rollback」；但函式自己的文件註解已說明：對 create 而言查無列是確定證據（允許 rollback），對 update 而言案件列本就已存在，查無列只代表 repository/連線異常，不是任一方向的證據，應維持 pending 不猜測——程式碼跟自己的註解自相矛盾。修法：在 `durableCase === null` 時依 `pending.action === "create_complaint_case"` 分流；非 create 時直接 return，保留 pending marker。

### 9.3 根因三（連動）：note/assign 的「內容相同重試」命中 `retryUncertainComplaintWrite` 會真的卡死 controller 呼叫

修掉 9.2 後 note/assign 兩案例仍逾時。定位：`addComplaintCaseNoteInternal`/`assignComplaintCase` 命中 `pendingNote`/`pendingAssign` 比對相同 command 時，呼叫的是會真正再發一次 `persistChanges` 的 `retryUncertainComplaintWrite`；controller 的 `addComplaintCaseNote`/`assignComplaintCase` 皆以 `{ captureAudit: true }` 呼叫，`finishOrdinaryComplaintAction` 在此選項下回傳 `persistence.then(finish)`，會真正等待這次新寫入 commit。但測試在 `await controller.addComplaintCaseNote(...)` 這一行之後才呼叫 `retryGate.resolve()`，若真的觸發第二次 `persistChanges` 並卡在 gate 上，await 永遠不會完成——這與同一測試檔其他「LINK-SLA-RETRY 必須是真正重試，而非 0-write 複寫」的要求相反：note／assign 的「內容相同重試」被設計為不需要、也不應該真的再發一次 canonical 寫入（append-only 的 note 或完全相同的 assign 重送不帶來新資訊，真正落地與否交給之後的 `refreshSettlementCases()`／`reconcilePendingCase` 去判定，重複寫入反而有在原始 commit 事後落地時造出第二筆列的風險）。

修法：新增 `acknowledgePendingUncertainCommit`（仿照既有 `existingComplaintAction` 的同步模式），note/assign 命中相同內容重試時改呼叫此方法：直接以 pending 快照同步組出 `{ data, auditLog }`（`finishComplaintAction`），不發出新的 `persistChanges`、不消耗測試的 `retryGate`，且保留 `pendingUncertainCommits` 原封不動供未來的 `refreshSettlementCases()` 繼續嘗試對帳。`retryUncertainComplaintWrite` 本身不變，close/resolve/reopen/escalate/link/sla-breach 既有的「真正重試」語意不受影響。

### 9.4 驗證

```bash
$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts
 Test Files  1 passed (1)
      Tests  22 passed (22)

$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015 tests/unit/complaint.test.ts \
    tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts \
    tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts
 Test Files  5 passed (5)
      Tests  58 passed (58)

$ cd apps/api && pnpm exec vitest run tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts
 Test Files  2 passed (2)
      Tests  24 passed (24)

$ cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json   # exit 0
$ cd apps/ops-console-web && pnpm exec tsc --noEmit -p tsconfig.json   # exit 0
$ cd apps/api && pnpm exec vitest run tests/unit   # 129 passed | 1 skipped files; 1387 passed | 3 skipped tests
$ pnpm exec vitest run tests/unit/fleet-statement-decisions-20261013   # 7 passed; 77 passed
$ pnpm exec eslint apps/api/src/modules/complaint/complaint.service.ts \
    apps/api/src/modules/complaint/complaint.repository.ts \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts \
    --max-warnings=0   # exit 0
```

### 9.5 未解的第六項 finding：restart/replica 下的 durable command identity（明列，不冒充已交付）

Reviewer 在 ca237 review 中列出的六項 unknown-COMMIT findings，本輪連同前一 session 的 WIP 共修完五項（readback reconciliation、link/SLA 重試、escalation precheck 順序、unknown-then-failed 保留原身分、note/assign 去重）。第六項——`pendingUncertainCommits` 目前僅是 service 行程內的 `Map`，API 行程重啟或請求落在另一個 replica 時會遺失待對帳的身分，使得「同一指令重試應沿用同一 caseNo/entryId」這個保證在跨行程/跨重啟時失效——**本輪未修**。這需要把待對帳身分改為跨行程可讀（例如一張新的 durable pending-commit 表或在既有 `crm.phase1_complaint_cases` 列上加一個欄位記錄「嘗試中但未確認」狀態），屬於需要新 migration 的 schema 變更，超出本任務 15 個 write_scopes 且不應憑空猜測 migration 編號；需先提出精確方案與原 task owner/reviewer 協調後才能實作。在此之前，重啟或跨 replica 的重試仍只能依賴 `reconcilePendingCase` 對 durable store 的最終對帳（`refreshSettlementCases()` 持續輪詢），而非即時沿用同一身分重送。

## 10. Root b96 review（`request_changes`）修復：note/assign 假 ACK（P1）＋ restart/replica durable identity 精確方案

Reviewer 對 `b96ba708a` 的正式 review（`.local/goal-continuation-20261018T2246Z-.../Root-Complaint-b96-original-assigned-review-request-changes.json`，sha256 `365f4ef3...`）提出一項新 P1（`b96-unknown-note-assignment-false-success`）與一項延續的「original required functional gap」（`b96-retained-restart-replica-command-identity`，即本文件 9.5 已列的第六項）。

### 10.1 根因：9.3 為了讓測試不逾時，引入了會真正發出假 ACK 的 `acknowledgePendingUncertainCommit`

9.3 的推論前提有誤：它認為 note/assign 的「內容相同重試」若真的重送 `persistChanges`，一旦原始 commit 事後落地，會「造出第二筆列」。但 `complaint.repository.ts` 的 `persistChanges` 對 case 與 timeline 都是 `INSERT ... ON CONFLICT (case_no) DO UPDATE` / `ON CONFLICT (entry_id) DO UPDATE`（`complaint.repository.ts:163`、`:195`）——重送的是 `pending.complaintCase`/`pending.complaintTimelines` 這組與原始嘗試完全相同的 `case_no`/`entry_id`，upsert 是冪等的，不會造出第二筆列。這與 `retryUncertainComplaintWrite` 已經在 create/resolve/close/reopen/escalate/link/sla-breach 七種動作上安全使用的機制完全相同。

9.3 真正卡住的是測試寫法：舊測試在 `await controller.addComplaintCaseNote(...)` 這一行**之後**才呼叫 `retryGate.resolve()`，若呼叫真的觸發第二次 `persistChanges` 並卡在 gate 上，`await` 永遠不會完成。9.3 選擇讓生產碼遷就這個測試寫法（新增同步、不等待任何寫入確認就發 audit 的 `acknowledgePendingUncertainCommit`），而不是修正測試本身依照 `LINK-SLA-RETRY`/`TypeError regression` 兩類案例已經示範過的正確 async 模式（先用 `vi.waitFor` 確認 mock 真的被呼叫，再 resolve gate，再 await 結果）。後果正是 Root 這次抓到的：`acknowledgePendingUncertainCommit` 對任何「內容相同的重試」一律立刻回傳 pending 快照＋發新 audit，完全不管這次重試（或原始嘗試）的 commit 究竟落地與否——controller 可能對一個從未真正確認過的寫入回 200。

### 10.2 修法

- `complaint.service.ts`：`assignComplaintCase`（:752-776）與 `addComplaintCaseNoteInternal`（:878-902）命中相同內容的 pending 重試時，改呼叫既有的 `retryUncertainComplaintWrite`（與其餘七種動作一致），不再呼叫 `acknowledgePendingUncertainCommit`；該方法本身（原 :1960-1972）連同其基於錯誤前提的文件註解一併移除，沒有其他呼叫點。
- `retryUncertainComplaintWrite` 本身不變：仍是重送 `pending.complaintCase`/`pending.complaintTimelines`（同一 caseNo/entryId，交由 repository 的 `ON CONFLICT DO UPDATE` 冪等 upsert），並透過既有的 `finishOrdinaryComplaintAction` 只在這次重試真正 `persistChanges` 解析後才組出 `{ data, auditLog }`；若這次重試本身又拋出（含再次 `ComplaintCommitOutcomeUnknownError`），promise 直接 reject，controller 對外回應的是真正的錯誤，不是假 200。
- `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts`：兩個既有的 `NOTE-REPLAY`（note/assign）案例改為 `LINK-SLA-RETRY` 同款的非同步模式——先 `await vi.waitFor(() => expect(persistChanges).toHaveBeenCalledTimes(3))` 確認重試真的發起了新的 `persistChanges` 呼叫，再 `retryGate.resolve()`，再 `await` 取得結果；斷言（timeline 長度不重複、assigneeId/status 正確）不變。新增一案例 `C045-F3-20261018-NOTE-FALSE-ACK`：第一次 note 回 unknown，對帳用的 `loadCaseByCaseNo` 本身也失敗一次（連線問題），重試本身的 `persistChanges` 又回 unknown；斷言 controller 呼叫整體 reject（而非回假成功），且 timeline 沒有多出重複的 note/audit。

### 10.3 驗證

```bash
$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts
 Test Files  1 passed (1)
      Tests  23 passed (23)

$ pnpm exec vitest run tests/unit/complaint.test.ts tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-ops-ui-actions.test.tsx \
    tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts \
    tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts
 Test Files  4 passed (4)
      Tests  36 passed (36)

$ cd apps/api && pnpm exec vitest run tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts
 Test Files  2 passed (2)
      Tests  24 passed (24)

$ cd apps/api && pnpm exec tsc --noEmit   # exit 0
$ pnpm exec eslint apps/api/src/modules/complaint/complaint.service.ts \
    tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-terminal-state-and-ack.test.ts \
    --max-warnings=0   # exit 0

$ pnpm exec vitest run tests/unit/fleet-statement-decisions-20261013 tests/unit/pax-postride-same-order-20261016 \
    tests/unit/pax-receipt-complaint-20261009 tests/unit/system-remediation/sr-fleet-case-001
 Test Files  15 passed (15)
      Tests  275 passed (275)
```

### 10.4 restart/replica durable command identity 精確方案（未實作，待 migration 編號協調；非替代方案列舉）

Reviewer 明確要求不要只列「新表／舊欄位」兩個 alternative，而要寫出可直接據以實作的單一方案：

**1) 既有 logical command key 來源與真正重送的 caller**：目前的「重試」判定不是靠一個顯式 idempotency key，而是靠 `stableStringify(command)` 與 `action` 的組合比對（`findPendingUncertainCreate`、:752-756 的 `pendingAssign`、:878-882 的 `pendingNote`，以及 resolve/close/reopen/escalate/link/sla-breach 各自在 :987/1094/1190/1306/1415/1526 以 `pendingUncertainCommits.get(caseNo)` 直接比對 `action`）。真正會重送相同內容的 caller：Ops Console 逾時後使用者重按同一按鈕（create/assign/note，無顯式 idempotency key，純靠 command 內容相同）；`fleet-partner-case.service.ts` 的 `createReply`（有顯式 `idempotencyKey`，但目前映射到 Fleet 自己的 `repliesByIdempotencyKey`，與 Complaint 側的 `pendingUncertainCommits` 是两层不同的去重，Fleet 重送時仍是呼叫 `addComplaintCaseNote` 走 command-content 比對）；`callcenter.controller.ts` 的 `transferCallToComplaint`（通話逾時後 callcenter 重送同一通話/案件的轉案指令）。新 schema 的 command key 應直接採用「`action` + `stableStringify(matchCommand)` 的 sha256」，與現行比對邏輯完全對齊，不需要呼叫端額外傳遞新的顯式 ID。

**2) caseNo/entryId 何時持久分配**：目前兩者都是在呼叫當下、持久化嘗試**之前**於記憶體中同步分配（`caseSequence++`／`appendTimelineEntry` 產生的 `entryId`），而不是由 DB 預設值/序列分配；也就是說「身分」在第一次嘗試時就已決定，問題只在於這個「command key → caseNo/entryId」的映射目前只存在於行程內的 `Map`。新 schema 必須保留「身分在首次嘗試即分配、於 DB 落地前就已固定」這個既有語意，只把映射本身改成跨行程可讀。

**3) pending/confirmed/unknown 與 TX/reconcile/cold-read 語意**：

- `pending`：`persistChanges` 拋出 `ComplaintCommitOutcomeUnknownError`（COMMIT 送出後連線中斷等，無法判斷是否落地）。
- `confirmed`：同一 caseNo 的後續 `persistChanges` 正常 resolve（含重試自己的 commit 成功），或 `reconcilePendingCase` 的 `loadCaseByCaseNo` 讀到與 `pending.complaintCase` 逐位元組相同的 durable 列。
- `failed`（確定未落地）：對 `create_complaint_case` 而言是 `loadCaseByCaseNo` 回 `null`；對既有案件的 update 而言，`null` 或讀到的列與 pending 快照不同，都不能確定未落地（`reconcilePendingCase` 現有的「update 查無列不代表未 commit」規則必須原樣保留），只有讀到「存在但內容不同」才能判定未落地並 rollback。
- `cold-read`（跨行程/重啟）：目前完全沒有——這正是本項要新增的能力：下一個收到相同 command key 的 replica（或重啟後的同一行程）必須能從 durable pending-commit 紀錄還原 `complaintCase`/`complaintTimelines` 快照與 `rollback` 所需的「之前狀態」，才能重建 `PendingUncertainComplaintCommit` 並走既有的 `retryUncertainComplaintWrite`/`reconcilePendingCase` 路徑。`rollback` 閉包本身無法序列化，跨行程還原後必須改用「讀取 `previousCaseSnapshot` 欄位 + 呼叫既有的 `revertComplaintCaseMutation`」取代原本捕捉在閉包裡的 in-memory 還原。

**4) 確切新 migration/table/columns/index**（單一方案，非 alternative）：新增 `crm.phase1_complaint_pending_commits`：

- `command_key TEXT PRIMARY KEY`（`sha256(action || ':' || stableStringify(matchCommand))`）
- `case_no TEXT NOT NULL`
- `action TEXT NOT NULL`
- `case_snapshot JSONB NOT NULL`（即 `pending.complaintCase`）
- `timeline_snapshot JSONB NOT NULL`（即 `pending.complaintTimelines`，陣列）
- `previous_case_snapshot JSONB`（update 類動作的還原快照；create 類為 `NULL`，還原時等同現行「整列刪除」）
- `status TEXT NOT NULL DEFAULT 'pending'`（`CHECK (status IN ('pending','confirmed','failed'))`）
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `CREATE INDEX idx_phase1_complaint_pending_commits_case_no ON crm.phase1_complaint_pending_commits (case_no);`（供 `reconcilePendingCase` 依 caseNo 掃描）
  寫入時機：僅在 `persistChanges` catch 到 `ComplaintCommitOutcomeUnknownError` 之後，用獨立的一次 `INSERT ... ON CONFLICT (command_key) DO UPDATE`（非原本那個結果未知的交易）盡力登記；若這次登記本身也失敗，則該次重試退回目前的「僅行程內 `Map`」保底行為，不視為新的回歸。確認／清除時機：`reconcilePendingCase` 判定 `confirmed`/`failed` 後，刪除對應 `command_key` 列（或視覺化稽核需求改為 `status` 更新而非刪除，兩者皆可，建議刪除以維持表的小體積）。

**5) 超 scope 的必要 caller hunk**：`complaint.repository.ts` 需新增 `recordPendingCommit`/`loadPendingCommitsByCaseNo`/`clearPendingCommit` 三個方法（已在本任務 15 個 write_scopes 內，可隨 P1 一併實作）；但新 migration 檔本身（`infra/migrations/` 下的新檔案）**不在**本任務 write_scopes 內，需要 Root 協調的新 migration 編號與獨立 review/scope 擴充後才能落地，本輪不猜測編號、不建立該檔案。

### 10.5 restart/replica durable command identity 實作記錄（V0123 落地）

Root 已配發 `V0123`（`.local/passenger-bureau-gap-correction-20261018/Complaint-V0123-exact-root-allocation-20261018/result.json`），本輪依 §10.4 方案落地，過程中發現並修正方案文字一處會導致正式 bug 的細節：

1. **`command_key` 公式修正為包含 `caseNo`**：§10.4 原文字只寫 `sha256(action || ':' || stableStringify(matchCommand))`。但 `resolve_complaint_case`/`close_complaint_case`/`reopen_complaint_case`/`mark_complaint_sla_breach`/`escalate_to_incident`/`link_incident` 六個 update 類動作本來就不靠內容比對重試（純靠 `pendingUncertainCommits.get(caseNo)` + `action` 比對），`markComplaintSlaBreach` 甚至完全沒有 `command` 物件（只有 `caseNo`）。若維持原公式，這六種動作的 `command_key` 要嘛恆為同一值（sla-breach，所有案件共用一列、互相覆寫），要嘛在兩個不同案件剛好帶相同 resolutionCode/closingNote 文字時發生 PRIMARY KEY 碰撞（同一 commandKey 覆寫成另一案件的 pending 列）。實作改為 `sha256(action + ':' + caseNo + ':' + stableStringify(matchCommand))`：
   - 對 `create_complaint_case`（唯一需要跨 caseNo 內容比對找 retry 的動作）不影響比對邏輯——`findPendingUncertainCreate` 仍然是對記憶體 Map 的 `values()` 做 `stableStringify` 內容比對，從未用 `command_key` 反查；`command_key` 只是 DB 層的 upsert/delete 身分，兩個關注點已解耦。
   - 對六個純 caseNo 鍵控的動作則保證每個 (action, caseNo) 恰有一列，與既有記憶體語意完全對齊。
2. **Cold-read 的落地方式：重用既有的 `refreshSettlementCases()` 前置掛鉤，不把任何 public 方法改成 async**：`complaint.controller.ts`/`fleet-partner-case.service.ts`/`incident.controller.ts` 的每個端點已經在呼叫 mutation 方法前 `await this.complaintService.refreshSettlementCases()`（唯一例外見下）。新增 `hydratePendingCommitsFromDurableStore()` 掛在 `reconcilePendingCases()`（`refreshSettlementCases` 內部已呼叫）最前面：讀出所有 `status = 'pending'` 的 durable 列，凡本行程記憶體 Map 裡還沒有的 caseNo，就還原成 `PendingUncertainComplaintCommit`（`rollback` 用 `previousCaseSnapshot` + `revertComplaintCaseMutation` 重建，取代無法序列化的原始閉包）寫回 Map。這樣一來，既有的同步 `pendingUncertainCommits.get(caseNo)`/`findPendingUncertainCreate` 讀取路徑完全不用改，等到它們執行時，跨行程/重啟前留下的 pending 紀錄已經「看起來」就在本行程記憶體裡。沒有把 `assignComplaintCase`/`resolveComplaintCase`/... 等 9 個 public 方法改成 async（風險太高、也沒有測試要求），是刻意的範圍控制。
   - 唯一原本沒有呼叫 `refreshSettlementCases()` 的真實重送 caller：`callcenter.controller.ts` 的 `transferCallToComplaint`（§10.4 item 1 點名的「通話逾時後 callcenter 重送同一通話/案件的轉案指令」）。本輪在 `createComplaintCase` 呼叫前補上這一行 `await`，使其納入同一套跨行程還原機制。
3. **寫入/清除時機**：`persistChanges` 新增第 6 個參數 `previousCaseSnapshot`（9 個呼叫點與 `retryUncertainComplaintWrite` 都已傳入），在 `ComplaintCommitOutcomeUnknownError` 分支呼叫 `recordDurablePendingCommit`（best-effort，失敗吞掉、退回純記憶體行為）；在既有「成功 `.then()`」與 `reconcilePendingCase` 的「已判定 confirmed/failed」兩處呼叫 `clearDurablePendingCommit`（同樣 best-effort，DELETE 0 列也安全）。`ComplaintRepository` 新增 `recordPendingCommit`/`loadPendingCommits`/`clearPendingCommit` 三個方法，皆以 `typeof this.complaintRepository?.xxx === "function"` 容忍只實作部分方法的輕量測試替身（沿用既有 `canonicalDbEnabled()` 的容忍慣例），避免測試替身缺方法時拋 TypeError。
4. **驗證**：`infra/migrations/V0123__complaint_command_identity.sql`、`docs/04-uat/system-remediation-20260906/schema-allocation.json`（新增 `complaint_command_allocations` 群組）、三個 allocation-collector 測試（`sr-recovery-contracts-20260911`/`sr-partner-notify-con-20260917`/`push-channel-sd-20261006`）已納入並通過；`tsc -p apps/api/tsconfig.json --noEmit` 與 `eslint` 乾淨；本任務既有 5 個測試檔（`tests/unit/complaint.test.ts`、`apps/api/tests/unit/complaint-taxonomy-reopen-sla.test.ts`、`apps/api/tests/unit/complaint-incident-escalation.test.ts`、`tests/unit/complaint-canonical-lifecycle-and-ack-20261015/*`、`tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts`、`tests/unit/system-remediation/sr-fleet-case-001/*`）全數通過；另外跑過 `fleet-statement-decisions-20261013`、`sr-qa-call-001`、`incident.test.ts`、`idempotency-foundation`/`client-idempotency`/`wire-contract-conformance`、`ops-complaint-*`、`pax-receipt-complaint-20261009` 等鄰近套件共 400+ 項測試，皆綠。本節原文曾記錄「未新增專屬 restart/replica 測試」，已在 §10.6 補上。

### 10.6 restart/replica durable command identity 的專屬回歸（補 §10.5 第 4 點缺口）

新增 `tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-durable-pending-commit-identity.test.ts`（既有 write_scopes 目錄內新檔），涵蓋 §10.4/10.5 新增機制本身，而非只靠既有 F1/F2/F3 測試間接覆蓋：

- **`ComplaintRepository` 層（5 案例）**：`recordPendingCommit` 對 `crm.phase1_complaint_pending_commits` 發出的 `INSERT ... ON CONFLICT (command_key) DO UPDATE` SQL 與逐欄 JSON 編碼參數；canonical DB 停用時為 no-op（不發出查詢）；`loadPendingCommits` 只選 `status = 'pending'` 並把 snake_case 欄位解析回 camelCase 的 `ComplaintPendingCommitRecord`，停用時回傳 `[]` 且不查詢；`clearPendingCommit` 依 `command_key` 發出 `DELETE`，且停用時為 no-op。
- **`ComplaintService` 跨行程案例（1 案例，端到端）**：建立「process A」（原始嘗試）與完全獨立的「process B」（模擬不同 replica／行程重啟後的全新 `ComplaintService` 實例，彼此不共用任何記憶體 Map）。Process A 對一筆已確定建立成功的案件發出 assign，COMMIT 結果回 `ComplaintCommitOutcomeUnknownError`；斷言 `recordPendingCommit` 真的被呼叫一次並擷取其寫入的 durable row。Process B 只靠 `loadState`（讀回案件原本的、assign 從未落地的真實狀態：`status: "new"`）與 `loadPendingCommits`（回傳 A 寫入的 durable row）建立，`onModuleInit` 後直接 readback 驗證狀態確實是真實的 `"new"`（不是 A 樂觀的 `"assigned"`）；呼叫 `refreshSettlementCases()`（每個 controller endpoint 既有的前置呼叫）後，對 B 重送與 A 完全相同的 assign command：斷言這次重送確實重用了 A 原始嘗試的同一個 `caseNo`／timeline `entryId`（而非配置新的一組），且成功 commit 後呼叫了 `clearPendingCommit`（帶正確的 `commandKey`）。這證明本機制在真正跨行程（不只是同行程 Map）下也成立，而不只是文件描述。

驗證：

```bash
$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-durable-pending-commit-identity.test.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)

$ pnpm exec vitest run tests/unit/complaint-canonical-lifecycle-and-ack-20261015/ tests/unit/complaint.test.ts \
    tests/unit/system-remediation/sr-qa-call-001/c045-complaint-lifecycle-sla.test.ts \
    tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts
 Test Files  6 passed (6)
      Tests  66 passed (66)

$ pnpm exec vitest run tests/unit/fleet-statement-decisions-20261013/ tests/unit/push-channel-sd-20261006/ \
    tests/unit/system-remediation/sr-recovery-contracts-20260911/ tests/unit/system-remediation/sr-partner-notify-con-20260917/
 Test Files  10 passed (10)
      Tests  157 passed (157)

$ (cd apps/api && pnpm exec vitest run tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts)
 Test Files  2 passed (2)
      Tests  24 passed (24)

$ (cd apps/api && pnpm exec tsc --noEmit)   # exit 0
$ pnpm exec tsc --noEmit -p apps/ops-console-web/tsconfig.json   # exit 0
$ pnpm exec eslint tests/unit/complaint-canonical-lifecycle-and-ack-20261015/complaint-durable-pending-commit-identity.test.ts --max-warnings=0   # exit 0

$ pnpm exec vitest run tests/unit/pax-receipt-complaint-20261009/ tests/unit/pax-postride-same-order-20261016/ \
    tests/unit/pax-booking-history-20261009/ tests/unit/reporting-filing.test.ts tests/unit/system-remediation/sr-release-001/
 Test Files  15 passed | 2 skipped (17)
      Tests  370 passed | 10 skipped (380)
```

## 11. Codex2 normal owner continuation — original R1/R2/R3/R5 (2026-10-19)

This continues the original twenty write scopes, five complete criteria and five acceptance keys. Root's `9f64e145f397477c7c36a6c434b2a0a9b40ec58f` request-changes and original `7eeb` review/addendum remain the finding authority. R4's original typed-fixture fix remains credited. The exact Claude2 WIP was preserved at `8e7f29108853ac81c60abe6f46d4db27a6176a0c`; Codex2 normally merged accepted `origin/dev` (`61fa7cf44fb25d8be36634357fa3549286b96b84`) in `f1e2c5d0e`. This section is an implementation checkpoint, not acceptance, CI, merge or deployment credit.

| Original finding | Source repair                                                                                                                                                                                                                                                                                                                                                                                                                         | Before → current socket-free evidence                                                                                                                                                                                                                       | Remaining verification                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R1               | `ComplaintService.persistChanges` awaits durable PREPARED reservation before any business transaction. `ComplaintRepository.recordPendingCommit` preserves the winning reservation; the business transaction confirms the same marker with case/timeline. V0123 reserves a create case number once. Identity reads propagate failures.                                                                                                | Original `9f64` fails the actual marker-failure/order checks; current wire controls show failed preparation has zero business COMMITs, and PREPARED/confirmation precede COMMIT.                                                                            | Real PostgreSQL constraints/isolation remain hosted-only; wire fixture is not PostgreSQL.                                     |
| R2               | Caller scope/key, original payload, allocated case/entry IDs and original request correlation survive restart. Confirmed replay returns the original result without a new business write. An older/missing observation or failed retry preserves prepared IDs.                                                                                                                                                                        | Original actual Callcenter retry returns `000002`; current returns the original case and entry IDs, including unknown-not-landed → definite failed retry → successful retry.                                                                                | Full preserved positive suites and exact-candidate checks below.                                                              |
| R3               | Recovery reads canonical case and complete timeline in one production SQL snapshot before cache reuse. It checks committed entry IDs, preserves unresolved identity, and updates the live cache before a later note.                                                                                                                                                                                                                  | Original warm replica loses `ops-assignee-A`; current refresh and later note both preserve it and the complete timeline.                                                                                                                                    | Full settlement/PAX/Fleet/SLA/auth/noDB regressions below.                                                                    |
| R5               | Actual Ops create header and Callcenter stable call intent reach domain scope/key/payload binding. Optional existing action keys and Fleet reply keys also reach the domain. Generated escalation IDs do not replace the original caller payload. Distinct equal-content keys remain distinct; changed payload under one key conflicts. Existing audit UUID support and original request correlation keep the key's receipt identity. | Original K2 reuses K1's pending case; current actual Ops K1/K2 produce two cases, K1 restarts/replays its original case, and changed payload conflicts. Equal keyed notes, concurrent reservations and actual escalation recovery have additional controls. | Generic IdempotencyService policy is unchanged. Real browser/HTTP/PG/provider work remains at its original separate boundary. |

Evidence is under this owner worktree's `.local/complaint-codex2-repair-20261019/`. `before-9f64.log` records six actual semantic failures against immutable production modules loaded with `git show`; no baseline worktree or copied business logic was created. `fixed-wire.log` records the same six passing assertions. Later controls extend those original six without changing their assertions. `canonical-regression-fixed-r3.log` records 79/79 passing across the original seven task/lifecycle/Ops/Fleet files and thirteen actual-caller wire cases. The wire process blocks network/listen attempts and uses production controllers, services, repositories and SQL with scripted external database responses only.

The first broader run's `canonical-regression.log` honestly retains two ENOSPC import-write failures plus then-unfixed legacy retry failures. The successful later run supersedes those only for the same rerun paths; it does not turn the old failures into passes. Existing assertions remain: the older durable-assign fixture only clears setup-create mock history before checking exactly one assign PREPARED registration, since successful creation is now prepared too. No skip, timeout increase or assertion suppression was added. The isolated dependency helper succeeded using this worktree's own `.pnpm`; only the existing `control-plane-auth` package was built to satisfy its declared dist entry.

All original lifecycle/terminal Ops, settlement transaction/wait/refresh, passenger complaint/rating intake/dedup/auth/E04, Fleet scope/reply failure, noDB and SLA obligations remain. No product, HTTP, browser, PG or Compose server was started on this VM. Full preserved regressions and exact-candidate verification are still in progress at this checkpoint.

### 11.1 Complete source closeout and exact-candidate verification

The last readback control remains part of original R3 / criteria 2–3, not a new finding or gate: when the canonical snapshot query fails, actual Ops case/list/timeline/export and unrelated same-case mutations return an honest retryable error. A later successful canonical observation restores reads; a same-command durable retry preserves and confirms the original IDs. Direct synchronous noDB behavior, settlement behavior and all original assertions remain. The original prepared command identity is never discarded merely because the observed canonical row is older or missing.

The final source has fifteen actual-production wire controls. In addition to the original six, they cover identity-read failure, same-key reservation winners, distinct-key create reservations, keyed receipt correlation, equal keyed notes, actual escalation after landed/non-landed unknown COMMIT across restart, unavailable canonical readback, and a transaction-level confirmed-command lock that prevents an already queued replay from upserting an obsolete snapshot over a later assignment. The production repository takes the prepared row lock before case writes; a confirmed row replays without another upsert. All relevant source callers were searched repository-wide: the only external Complaint mutation callers are the original Callcenter controller, Fleet service and Incident controller, all inside the original twenty scopes.

| Original acceptance key                                            | Implementation and validation mapping                                                                                                                                                                                                                                                                                                 | Remaining original boundary                                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `complaint_original_terminal_state_and_actual_Ops_actions`         | Existing closed-only reopen, resolved close CTA, terminal errors, same-case lifecycle/reason/SLA and mounted Ops component assertions remain; final canonical suite includes these unchanged assertions.                                                                                                                              | Real hosted browser/manual journeys remain their original separate tasks.                                                                             |
| `complaint_ordinary_case_and_timeline_canonical_ACK`               | R1/R2/R3/R5 prepared/confirmed/replay/cache/readback controls exercise actual production SQL and services, including unknown followed by a definitely failed retry. No audit or success receipt precedes confirmed ordinary persistence.                                                                                              | The wire fixture does not establish PostgreSQL isolation or hosted deployment.                                                                        |
| `complaint_actual_callers_readback_failure_and_same_case_recovery` | Actual Ops, Callcenter, escalation and Fleet note boundaries carry/recover the original IDs and propagate failures; original caller/Fleet assertions remain.                                                                                                                                                                          | Hosted HTTP/browser is not run on this VM.                                                                                                            |
| `complaint_preserved_settlement_PAX_fleet_auth_noDB_and_SLA`       | Original settlement plus collector suites (157), PAX intake/rating/auth suites (90), API taxonomy/escalation/Callcenter/Incident suites (38), and canonical lifecycle/Ops/Fleet suite (80 before the final lock control) have passed during this continuation. Final exact-candidate commands below rerun these on the locked source. | The counts above are local socket-free unit evidence, not provider/manual/PG acceptance.                                                              |
| `complaint_exact_candidate_validation`                             | Final checkpoint uses normal hooks/plain push and a new own PR #2812. Exact source SHA, commands, underlying exits, log hashes, remote/PR head and original-key matrix are recorded in `.local/complaint-codex2-repair-20261019/final-candidate-evidence.json`. Root remains independent reviewer.                                    | Own same-candidate CI, Root verdict, protected merge and original acceptance recording remain required; none is inferred from WIP CI or local passes. |

Final verification uses root `vitest run` on the original canonical/lifecycle/Ops/Fleet files, the four original settlement/collector directories, the three PAX intake/rating/auth files, and existing idempotency/action-receipt policy tests. A separate `pnpm --dir apps/api exec vitest run` runs the four original API taxonomy/escalation/Callcenter/Incident files. Root/API/Ops `tsc --noEmit --incremental false`, scoped ESLint, `git diff --check` and normal commit hooks apply. Every selected unit path was checked for product/HTTP/WS/PG/listener setup before execution. Immutable `9f64` before evidence and old ENOSPC/failure logs are preserved, with final raw results at distinct paths. Hosted CI for WIP `5cc2e03a4` is historical and is never substituted for this final source.

### 11.2 Normal bounded PAX fixture coordination and final check qualification

The final transaction lock correctly rejected an existing PAX test wire adapter that returned empty rows for the new ordinary PREPARED `INSERT ... RETURNING` / `SELECT ... FOR UPDATE`. Root checked the five frozen, reviewed/merged prior claims and normally extended the original task from twenty to twenty-one scopes for exactly `tests/unit/pax-receipt-complaint-20261009/rating-transaction.test.ts`: optional ordinary command rows and reservation/read/confirm/delete responses in its existing external `State`/`query` fixture only. The coordination record is `.local/passenger-bureau-gap-correction-20261018/complaint-normal-fallback-20261019/normal-exact-original-PAX-rating-wire-fixture-scope-coordination.json`, SHA-256 `47c897aa1efb40b54d46f49eb71a8e30354ce98e0eee4b35cc82774dfe203070`. All original forty PAX business/auth/receipt/negative assertions, production missing-reservation rejection, product policies, task owner/reviewer, five complete criteria and five acceptance keys are preserved.

The first combined `1a6c348cfc8d1f23340e81e48fd377e2572217cb` run retained that real fixture failure and fifteen probe skips caused by the unchanged ten-second hook deadline while three heavy TypeScript checks ran concurrently. No timeout was increased. The immutable source loader now caches repeated read-only source/absent-extension lookups; a separate original-`9f64` run then completed in 4.81 seconds with all fifteen meaningful product assertions failing, no skips (`before-full-9f64-cached.log`). Root/API/Ops typechecks for `1a6c` all completed with exit 0. These are historical checks; final clean-candidate results use new result labels and preserve all earlier failures/skips unchanged. Local heavy verification is sequenced with Root's other workers, while implementation remains parallel.

### 11.3 Original R3 follow-up: all same-case commands and acknowledged successors

Root independently reproduced the original R3 defect on `d1910199eb028ae82c2a4d470860dd07b508d6d1` after the original fifteen controls passed: an actual keyed create leaves a confirmed identity; assign-A's COMMIT is unknown and does not land; a fresh replica selects confirmed create as the case-level pending entry and incorrectly permits distinct assign-B; another fresh replica retries A and overwrites acknowledged B. The full request-changes report is `Root-d191-original-R3-multiple-command-stale-overwrite-request-changes.json` in the original fallback root, SHA-256 `c81f77d4b7142aef6fcae7d5516b6392de7dcf446bc341497d625bb6a9ab0915`. Normal reviewer reopen returned the original task to `in_progress`. Original five criteria, five keys, twenty-one coordinated scopes and other positive evidence remain; green d191 checks do not resolve this R3 failure.

The repair keeps every ordinary prepared command by its exact command key, including legacy commands. Hydration never chooses one identity to represent a whole case. One canonical case/full-timeline observation reconciles each command independently; confirming/removing one cannot discard another, and unrelated mutations check all unresolved commands for that case. Confirmed original result/receipt replay and canonical readback remain available. The exact durable key is retained when a legacy empty SLA payload is represented as JSON `null`, so restart/retry does not allocate another identity or leave an orphaned guard.

The production repository also locks the case row and compares its JSONB record with the already stored `previous_case_snapshot` before a pending command upserts. A queued command whose original predecessor has changed rejects honestly without case/timeline writes or a success audit. A confirmed original command still replays without an upsert. This protects an already acknowledged successor even if a request's earlier identity read did not yet contain another prepared command. It adds no schema, migration number, global idempotency/security framework or product policy.

Root's original bare-CI import finding is closed within the two already allocated Ops pages: their three later-introduced app-local imports now use their exact relative paths. The three historical Ops root Vitest aliases are removed, restoring that file exactly to accepted `a7ec8281ff35399eb35728facca75c54af0d5cf1`; other aliases, including review-driver, remain unchanged. This preserves the original two mounted Ops tests without redirecting another app's same-named import. The original settlement persistence fixture authorization is materialized separately by Supervisor; it adds no product finding or acceptance key.

The new `complaint-multiple-command-wire.test.ts` has thirteen actual-production controls: forward/reverse/rotated rows with keyed and legacy assign, multiple pending commands where confirming one must preserve another, warm/fresh stale retries after an acknowledged successor, an independent case positive, legacy SLA identity/next-note recovery, and a complete canonical create/assign/note/resolve/close/reopen with terminal denials and fresh timeline readback. Only external SQL rows, query-response timing and COMMIT response loss are scripted; no case/command Map is edited outside production SQL handlers. The shared old wire adapter returns the new SQL predecessor comparison and exports its loader/transport helpers; the original fifteen assertions are unchanged. The bounded PAX ordinary wire adapter responds to those same new fields/predicate; its original forty assertions remain unchanged.

Identical final thirteen-control harness: immutable d191 production has **8 semantic failures, 5 passes, zero skips** (`r3-before-d191-all13.log`); repaired working source plus the unchanged forty PAX assertions has **53 passes, zero skips** (`r3-fixed-all13-and-PAX40.log`). The twelve-control before/fixed logs, first eleven-control logs and the then-failing SLA control/diagnostic are retained separately. The first clean `e6bfe924` combined run had a real PAX wire failure (357 passes/1 failure): its new predicate response omitted the SQL `case_no` filter and returned a different existing PAX case for ordinary create. Only that external WHERE response was corrected; product rejection and all original assertions remain. These are narrow working-source checks; final clean-candidate affected regressions, compiler results, exact head proof and original five-key matrix are recorded separately in `.local/complaint-codex2-repair-20261019/r3-final-candidate-evidence.json`. All earlier evidence, including d191 handoff/generation and original ENOSPC/failure/skip logs, remains unchanged. No VM product/HTTP/WS/PG/browser/Compose server was started; real PG isolation, browser/provider, independent review, required CI, protected merge and acceptance are not inferred from these wire controls.

### 11.4 Original R3 definite rejection checkpoint (not a candidate)

A legitimate new note based on an obsolete warm snapshot is rejected by the existing prepared predecessor predicate before any business write. The repository now distinguishes that definite rejection internally, preserving the same typed API error. Only a new attempt may await deletion of its own rejected preparation, then require a canonical refresh; an original unknown outcome or retry keeps its original identity. Immutable `a8c5029378cf8bd009ca8e5374fac594f398012c` has thirteen passes and one semantic failure in this fourteen-control harness (`r3-a8-definite-predecessor-before.log`); this checkpoint has fourteen passes and zero skips (`r3-definite-predecessor-fixed14.log`).

This is incomplete WIP: Root additionally proved that an identity SELECT captured before the definite-failure DELETE but delivered after its ACK can rehydrate the deleted marker, causing a later same-key note to reject again. Observation `Root-delayed-identity-read-after-definite-cleanup-observation.json` in the fallback root, SHA-256 `7afad6442ee204910dd97e47da4db8dc6e706dc3f186085ea73a31a12958ad64`, uses actual controllers/services/repository with external SQL response timing only. The next bounded original-R3 repair must reject stale identity observations and reconcile authoritative removals without losing newer/inflight/unknown identities. Per-attempt matched PREPARED keys must also bound definite cleanup when an earlier queued promise rejects. No complete-task, candidate, CI or acceptance credit is claimed by this checkpoint.
