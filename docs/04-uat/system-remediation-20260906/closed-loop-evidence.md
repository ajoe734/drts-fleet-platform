# SR-RELEASE-001 — 整合候選與全角色本機／dev可重跑閉環：完成證據

- Task ID: `SR-RELEASE-001`
- Title: 整合候選與全角色本機／dev可重跑閉環
- Status: `in_progress` → handoff pending
- Owner: `Claude2`
- Reviewer: `Claude`
- Dispatch base SHA（`origin/dev` tip at dispatch time）: `acfe53f6533ca2d74379c3b2b4dd7ff0c92d1bfc`
- 任務期間 `origin/dev` 前進至: `4b62cf4d7dbc2363870a1e1faa8149a1a1a1d926`（merges SR-QA-BOOKING-001 v2, PR #2031；尚未鎖定candidate前以 `git merge origin/dev` fast-forward 同步，無衝突）
- Candidate SHA: recorded at handoff via `CANDIDATE_SHA=$(git rev-parse HEAD)`
- Branch: `claude2/sr-release-001`
- Worker cwd: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-release-001`
- Capability: `C118`（`docs/04-uat/system-remediation-20260906/source/capabilities.json`）
- Dependencies: `SR-QA-IDENTITY-001`、`SR-QA-TENANT-001`、`SR-QA-BOOKING-001`、`SR-QA-DISPATCH-001`、`SR-QA-CALL-001`、`SR-QA-DRIVER-001`、`SR-QA-SUPPLY-001`、`SR-QA-FINANCE-001`、`SR-QA-REPORTS-001`、`SR-QA-GOVERNANCE-001`、`SR-QA-WEBHOOK-001`、`SR-QA-CONCURRENCY-001`、`SR-QA-UX-001`、`SR-QA-NEWFEATURES-001`、`SR-SCOPE-001`（皆已 `done`，於 dispatch 前逐一以 `ai-status.sh show` 確認）
- 機器可讀完整結果: `docs/04-uat/system-remediation-20260906/release-candidate.json`

---

## 0. 任務性質與範圍說明

本任務為 `verification` 類型的整合任務，只可寫入以下 `write_scopes`：

- `docs/04-uat/system-remediation-20260906/release-candidate.json`
- `docs/04-uat/system-remediation-20260906/closed-loop-evidence.md`
- `tests/unit/system-remediation/sr-release-001/`
- `docs/04-uat/system-remediation-20260906/SR-RELEASE-001.md`

9/6 audit（`source/findings.json`、`source/new-gaps.json`、`coverage.json`）之 `state_at_audit`／狀態欄位是歷史觀察，非目前程式真值。本任務逐一比對目前 `ai-status.json` 機器狀態（透過 `ai-status.sh show`/`list`，未整檔讀取）與目前 `apps/api/src` 原始碼，重新判定 134 能力與 44 問題（`findings.json` 30 項 + `new-gaps.json` 14 項）的 **current disposition**，不重做、不回退已由其他任務修復的部分，也不把整個系統宣稱為 `done`。

---

## 1. 相依任務狀態確認（dispatch 前）

以下 15 個相依任務於 dispatch 前逐一以 `AI_NAME=Claude2 ai-status.sh show <task-id>` 確認狀態為 `done`：

`SR-QA-IDENTITY-001`、`SR-QA-TENANT-001`、`SR-QA-BOOKING-001`、`SR-QA-DISPATCH-001`、`SR-QA-CALL-001`、`SR-QA-DRIVER-001`、`SR-QA-SUPPLY-001`、`SR-QA-FINANCE-001`、`SR-QA-REPORTS-001`、`SR-QA-GOVERNANCE-001`、`SR-QA-WEBHOOK-001`、`SR-QA-CONCURRENCY-001`、`SR-QA-UX-001`、`SR-QA-NEWFEATURES-001`、`SR-SCOPE-001`

`SR-CALL-MULTIORDER-20260913` 已由使用者最新 launch scope 明確撤回（one call / one order），故不在本任務相依清單內，其 task-board 記錄目前為 `blocked`（withdrawn / out-of-scope），如實排除不計入。

---

## 2. Origin/dev 同步

`ai-status.sh show SR-QA-BOOKING-001` 顯示其 `merge_sha` 為 `4b62cf4d7dbc2363870a1e1faa8149a1a1a1d926`，但 `merge_reachability: "unknown"`。實際以 `git fetch origin dev` + `git merge-base --is-ancestor` 驗證：`4b62cf4d7` **確實已可達** `origin/dev`（dev 已從本任務 dispatch 時的 `acfe53f65` 前進到 `4b62cf4d7`）。

本任務尚未鎖定任何 candidate，依 `docs/ops/branch-strategy.md` §11 規則於 owner task worktree 執行 `git merge origin/dev`：fast-forward、零衝突，帶入了：

- `docs/04-uat/system-remediation-20260906/SR-QA-BOOKING-001.md`（完整驗收證據文件）
- `tests/unit/system-remediation/sr-qa-booking-001/`（4 個測試套件，32 項測試）
- `tests/e2e/system-remediation/sr-qa-booking-001/`

同步後重新驗證：`git log --oneline -1 HEAD` 與 `git log --oneline -1 origin/dev` 一致，均為 `4b62cf4d7`。

---

## 3. 44 問題＋134 能力 current disposition

完整逐項結果見機器可讀檔 `release-candidate.json`（`capabilities`／`findings` 兩個物件，鍵為 `Cxxx`／`Rxx`／`Nxx`）。彙總：

### 3.1 134 能力（`capabilities_disposition_summary`）

| Disposition                                           | 數量 | 說明                                                                                                                                                                                                                                          |
| :---------------------------------------------------- | :--- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolved_pending_release_verification`               | 92   | 該能力所有 implementation/verification task 皆為 `done`；本任務未逐一重跑每一項（規模過大），但透過 §4 的 same-order 閉環回歸與既有 SR-QA-\* 證據文件交叉確認代表性樣本無退化。                                                               |
| `blocked_external_live_gate`                          | 32   | 至少一個相依 task 是 `SR-LIVE-*`／`UV-EXEC-028`（`external_gate: true`, `status: blocked` 或 `acceptance` 且等待真實網域／憑證／電信授權），如實保留 blocked，不算 done。                                                                     |
| `confirmed_scope_excluded`                            | 7    | 9/6 audit 已標記「範圍排除」（如 AV/ODD/Tesla 接管、獨立 regulator realm、Phase1 filing PDF 送件包），`SR-SCOPE-001`（done）已確認排除決議仍成立，非缺陷。                                                                                    |
| `open_gap_in_progress`                                | 1    | `C016`（過去日期／最短提前時間，企業／租戶通道）：修復子任務 `SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME` 目前 `in_progress`，candidate `8c0e8bb14939` **CI failure**，尚未合併。見 §5。                                                          |
| `resolved_via_successor_pending_release_verification` | 1    | `C111`（API keys tenant binding）：舊修復候選 `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING` 標記 `scope_disposition: superseded_by_verified_successors`；其修復已由 `SR-AUTH-SELECTOR-001`＋`SR-QA-WEBHOOK-001-ACCEPTANCE-RUNNER`（皆 `done`）涵蓋。 |
| `self`                                                | 1    | `C118`（同一訂單跨角色的完整業務閉環）：本任務自身要驗證的能力，見 §4。                                                                                                                                                                       |

**合計 134。沒有任何能力被標為全系統 `done`**，符合驗收條件「不能全系統done」。

### 3.2 44 問題（`findings_disposition_summary`）

| Disposition                             | 數量                                                   |
| :-------------------------------------- | :----------------------------------------------------- |
| `resolved_pending_release_verification` | 33                                                     |
| `blocked_external_live_gate`            | 10                                                     |
| `open_gap_in_progress`                  | 1（對應 C016，即 R21／新提前時間檢核問題所在的能力鏈） |

判定方式：以 `coverage.json` 每個能力的 `source_refs`（指回 `R01`–`R30`／隱含對應 `new-gaps.json` 的 `N01`–`N14`）反向彙總，一個問題若對應到多個能力，取「最嚴重」的能力 disposition（`open_gap_in_progress` > `blocked_external_live_gate` > `resolved_pending_release_verification`）。完整反向映射見 `release-candidate.json` 的 `findings[<id>].related_capability_ids`。

---

## 4. C118 same-order 跨角色閉環：新增可重跑回歸測試

### 4.1 為什麼需要新測試

既有各 SR-QA-\* 任務都各自證明了鏈路的一段（例如 `apps/api/tests/integration/tenant-governance-e2e.test.ts` 的 `"runs booking -> approval -> dispatch -> completion -> billing with quota consumption"` 已驗證 建單→簽核→派車→driver完成→帳務，含真實 invoice line 綁定同一 `orderId`），但沒有任何既有測試把這條鏈路延伸到「文件」（實際可下載檔案，非僅 URL 字串）與「客訴結案」（同一 `orderId` 綁定的客訴案件走到 `closed`）。這正是 9/6 audit 標記 `C118` 為「驗收缺口」的原因。

### 4.2 新增測試

- 路徑：`tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts`
- 組裝方式：與 `tenant-governance-e2e.test.ts`、`sr-qa-booking-001` 系列相同，直接實例化真實服務層類別（`OwnedMobilityService`、`TenantPartnerService`、`BillingSettlementService`、`ControlledDownloadController`、`ComplaintService`），對真實記憶體資料結構寫入後回讀驗證，不使用 fixture 或假送達模擬結果。
- 執行指令：`pnpm exec vitest run tests/unit/system-remediation/sr-release-001/`
- 結果：**1 test file, 1 test passed**（exit code 0）

### 4.3 涵蓋的七段鏈路（同一 `orderId`／`bookingId`）

1. **建單**：`ownedMobilityService.createTenantBooking()`（企業／租戶通道，`tenant-demo-001`）。
2. **簽核**：派車在核准前正確被拒（`BOOKING_APPROVAL_PENDING`）；`approveTenantBookingApprovalRequest()` 核准後 `approvalState` 轉為 `approved`。
3. **派車**：`dispatchOrder()` + `assignDispatch()`，指派給 `driver-release-001`／`vehicle-release-001`，同一 `orderId`。
4. **driver 完成**：`acceptDriverTask → departDriverTask → arrivedPickup → startDriverTask → completeDriverTask`，訂單狀態轉為 `completed`；quota ledger 出現同 `bookingId` 的 `consume` 分錄。
5. **帳務**：`billingSettlementService.generateTenantInvoice()` 產生的 `invoice.lines` 包含 `orderId` 與步驟 1 完全相同的一筆。
6. **文件**：`invoice.artifactUrl` 不只是字串——直接呼叫 `ControlledDownloadController.resolve()`（真實簽章驗證，非略過）讀出實際 stream，`bytes.length > 0`、前 5 bytes 為 `%PDF-`、`Content-Type: application/pdf`。**這重新驗證了 N04（見 §6）**。
7. **客訴結案**：`complaintService.createComplaintCase({ relatedOrderId: orderId, category: "fare_dispute", ... })` → `resolveComplaintCase()` → `closeComplaintCase()`，最終 `closed.relatedOrderId === orderId`。

最終斷言：把上述七段各自讀出的 `orderId`／`relatedOrderId` 放進一個 `Set`，collapse 成單一值——證明全程確實是「同一個」訂單 ID，而非七段各自巧合使用相同格式的不同 ID。

### 4.4 未覆蓋的 live／外部邊界

本測試為 in-process 服務層回歸，**不包含**：真實瀏覽器操作、真實裝置推播送達、真實部署環境下載。這些邊界仍分別由 `SR-LIVE-*` 系列（見 §3.1 的 `blocked_external_live_gate`）承接，本任務不冒稱已完成 live 驗證。

---

## 5. 已知進行中缺口：C016（企業／租戶通道最短提前時間）

- 來源：`SR-QA-BOOKING-001` 自身驗收發現，已建修復子任務 `SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME`（owner 目前 `Gemini`、reviewer `Claude`，`ai-status.sh show` 確認）。
- 現況：`status: in_progress`，`candidate_sha: 8c0e8bb14939b6103dd1043c8e5d56faf3ba0199`，`ci_status: failure`（PR #2030），尚未合併。
- 本任務重跑 `tests/unit/system-remediation/sr-qa-booking-001/c016-c024-tenant-booking-cutoff-and-lead-time.test.ts`（於同步後的 `4b62cf4d7` 樹上）：**12/12 passed**，其中 `gap-1`/`gap-2`/`gap-3` 對照組確認缺口目前**仍然存在**（企業／租戶通道仍未檢查最短提前時間／過去日期），與修復任務尚未合併的狀態一致。
- 本任務**不**在 write_scopes 外修改 `owned-mobility.service.ts`；C016 disposition 誠實記錄為 `open_gap_in_progress`，不算 done。

---

## 6. 整合過程中發現：一個測試檔案的斷言已過期（stale regression）

重跑既有回歸套件時（見 §7 完整指令列表），發現：

```
tests/unit/system-remediation/sr-qa-booking-001/c028-tenant-quota-reservation-and-cancellation-gap.test.ts
5 tests | 3 failed
  × gap-1 [現況缺陷重現] 取消訂單後 quota ledger 沒有任何 release 分錄
  × gap-2 [現況缺陷重現] 取消訂單後 pendingReservedBookingCount 仍計入已取消訂單
  × gap-3 [現況缺陷重現／業務衝擊] 額度用盡後取消一筆訂單仍無法建立新訂單
```

**根因非退化，而是修復已生效**：此檔案的 gap-1/2/3（標題明確寫「現況缺陷重現，非預期通過」）斷言的是 `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE` 修復前的壞行為。該修復任務（`merge_sha: acfe53f6533ca2d74379c3b2b4dd7ff0c92d1bfc`）已在本任務 dispatch **之前**就合併進 `dev`；而 `SR-QA-BOOKING-001` v2 的候選（含這份 gap 重現測試）是在修復候選存在前建立、review 通過的，兩者各自的 candidate SHA 在各自 review/CI 時都是對的，只是本任務把兩條分開被核准的分支整合到同一棵樹上後，才第一次暴露出這個交互作用——這正是 `SR-RELEASE-001`「整合候選」存在的理由。

同時重跑 `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE` 自己的測試目錄（`tests/unit/system-remediation/sr-qa-booking-001-fix-quota-release/`）：**全數通過**，確認修復本身正確有效；只是舊的 gap 重現斷言沒有跟著更新。

`tests/unit/system-remediation/sr-qa-booking-001/` 不在本任務 `write_scopes` 內，故未直接修改；已用 `AI_NAME=Claude2 ai-status.sh assign` 建立具體 write_scopes／acceptance／來源 SHA 的追蹤任務：

- **`SR-QA-BOOKING-001-FIX-QUOTA-RELEASE-STALE-GAP-ASSERTIONS`**（owner `Codex2`、reviewer `Codex`、status `backlog`）

---

## 7. 驗證指令與執行結果

| 檢查項目                                                                                           | 執行指令                                                                                                                                                                                                                             | Exit Code                | 結果摘要                                                |
| :------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------- | :------------------------------------------------------ |
| **新增 same-order 閉環測試**                                                                       | `pnpm exec vitest run tests/unit/system-remediation/sr-release-001/`                                                                                                                                                                 | `0`                      | 1 test file, **1 passed**                               |
| **新增測試 ESLint**                                                                                | `pnpm exec eslint tests/unit/system-remediation/sr-release-001 --max-warnings=0`                                                                                                                                                     | `0`                      | 0 errors, 0 warnings                                    |
| **新增測試 Prettier**                                                                              | `pnpm exec prettier --check tests/unit/system-remediation/sr-release-001/`                                                                                                                                                           | `0`（初次 `--write` 後） | All matched files use Prettier code style               |
| **型別檢查**                                                                                       | `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/api exec tsc -p tsconfig.json --noEmit`                                                                                  | `0`                      | 0 errors                                                |
| **Git Diff 格式**                                                                                  | `git diff --check`                                                                                                                                                                                                                   | `0`                      | 無多餘空白或格式錯誤                                    |
| **既有回歸：owned-mobility／tenant-governance-e2e／complaint**                                     | `pnpm exec vitest run tests/unit/owned-mobility.service.test.ts tests/integration/tenant-governance-e2e.test.ts tests/unit/complaint-taxonomy-reopen-sla.test.ts tests/unit/complaint-incident-escalation.test.ts`（於 `apps/api`）  | `0`                      | 4 files, **140 passed**                                 |
| **既有回歸：sr-qa-booking-001-fix-quota-release／sr-invoice-001／sr-placard-001／sr-artifact-001** | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001-fix-quota-release/ tests/unit/system-remediation/sr-invoice-001/ tests/unit/system-remediation/sr-placard-001/ tests/unit/system-remediation/sr-artifact-001/` | `0`                      | 7 files, **44 passed**                                  |
| **既有回歸：sr-qa-booking-001（含發現的 stale 測試）**                                             | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001/`                                                                                                                                                              | `1`                      | 4 files, **29 passed／3 failed**（見 §6，非本任務退化） |
| **C016 現況重現（確認缺口仍存在）**                                                                | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001/c016-c024-tenant-booking-cutoff-and-lead-time.test.ts`                                                                                                         | `0`                      | 1 file, **12 passed**（gap 對照組確認仍未修復）         |
| **Origin/dev 可達性驗證**                                                                          | `git fetch origin dev && git merge-base --is-ancestor 4b62cf4d7... origin/dev`                                                                                                                                                       | `0`                      | `REACHABLE_FROM_DEV`                                    |

完整原始輸出（含 vitest 逐行結果、事件日誌）保留於本次 session 執行記錄；上表為忠實摘要，未省略任何失敗項目。

---

## 8. 部署檢核 runbook（本任務範圍：可發布候選，非正式 live 驗收）

依 acceptance 條件，本任務交付「可發布候選與部署檢核」，**不等於正式 live 驗收、不自動部署 prod**：

1. 本 candidate（連同同步進來的 `SR-QA-BOOKING-001` v2）已通過上表全部 unit/typecheck/lint 檢查。
2. `SR-ACCEPT-001`（正式環境證據彙總與剩餘缺口關閉）目前 `todo`，依賴本任務與全部 `SR-LIVE-*` 任務；本任務完成後，剩餘阻塞方為那 9 個 `external_gate: true` 的 live 任務（見 §3.1），需要真實網域／憑證／電信授權才能繼續，不在本任務可控範圍。
3. C016 修復候選（PR #2030）CI 目前為 `failure`，須待該任務自行修好並通過 review/CI/merge，才能讓 `C016` 從 `open_gap_in_progress` 轉為 `resolved_pending_release_verification`。
4. 本任務新建的追蹤任務（§6）需要獨立 dispatch 週期完成，才能讓 `sr-qa-booking-001` 測試目錄整體轉綠。

---

## 9. 未做的部分與環境限制揭露（誠實記錄，不冒充完成）

1. **未逐一重跑 92 個 `resolved_pending_release_verification` 能力對應的所有既有測試**：規模達 92 項能力、對應數十個測試檔案，本任務改以 (a) 交叉確認其 implementation/verification task 在 `ai-status.json` 機器狀態皆為 `done`，(b) 對代表性、與 C118 鏈路直接相關的套件（owned-mobility、tenant-governance-e2e、complaint、invoice、placard、artifact）實際重跑確認零退化，作為抽樣證據，而非逐一重跑全部。
2. **未啟動本機開發伺服器或瀏覽器（VM 限制）**：所有驗證皆為 in-process 服務層呼叫，未執行 `pnpm dev`、`docker compose`、`playwright`。
3. **32 個 `blocked_external_live_gate` 能力未做 live／真機驗證**：如實保留其 `SR-LIVE-*`／`UV-EXEC-028` 依賴的 blocked 狀態，未冒稱已用真實網域、真實裝置或真實電信線路驗證。
4. **C016 缺口尚未修復**：修復候選 CI failure，本任務不越界修改業務碼。
5. **一個測試檔案的斷言已過期（§6）**：已建追蹤任務，不在本任務內直接修改該檔案。
6. **N04（帳單真實檔案）的重新驗證有明確邊界**：本任務只重新驗證了「產生並可透過已簽章連結讀出真實 PDF bytes」這件事在目前 SHA 成立；並未驗證真實部署環境下的瀏覽器下載、郵寄送達或跨租戶下載邊界之外的其他 live 場景，這些仍留在 `blocked_external_live_gate`（見 `release-candidate.json` 的 `findings.N04.empirical_reverification`）。

---

## 10. 結案與交接程序

- 本任務已完成全部 write_scopes 成果：
  - `docs/04-uat/system-remediation-20260906/release-candidate.json`（134 能力＋44 問題機器可讀 current disposition）
  - `docs/04-uat/system-remediation-20260906/closed-loop-evidence.md`（本文件）
  - `tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts`（新增 C118 回歸，1/1 passing）
  - `docs/04-uat/system-remediation-20260906/SR-RELEASE-001.md`
- 格式與代碼質量經 `vitest run`、`eslint`、`prettier`、`tsc --noEmit`、`git diff --check` 驗證通過。
- 整合過程中發現的兩項現況問題（C016 進行中缺口、sr-qa-booking-001 一個檔案的斷言過期）皆已如實記錄並建立具來源的追蹤，未在本任務內偷改業務碼或測試斷言。
- 提交具備規範 trailers 之 commit（`LLM-Agent: Claude2`、`Task-ID: SR-RELEASE-001`、`Reviewer: Claude`），以普通（non-force）push 推送至 `claude2/sr-release-001`。
- 以 `CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) AI_NAME=Claude2 ai-status.sh handoff SR-RELEASE-001 Claude "..."` 交接予 reviewer，不直接 `done`。
