# SR-PROOF-001 — 當前缺陷重現與 scope/design 阻擋

日期：2026-09-06。Owner：Codex2；Reviewer：Codex。

本文件是未完成實作的診斷證據，不是 acceptance pass。產品程式未修改；
新增測試保留正常失敗斷言，未使用 skip、test.fails 或 passWithNoTests。

## 基準與追溯

- 工作分支：`codex2/sr-proof-001`，使用 supervisor 指定 isolated worktree。
- `git fetch origin`：exit 0。
- `git rev-parse HEAD origin/dev`：兩者均為
  `69c519702047862212bc0e4890350e6b58917062`（重現時 base）。
- Reproducer anchor：`662720328`，已普通 push 至 origin。
- Candidate SHA：尚未建立；本輪只有 WIP anchors，不 handoff 不 done。
  最終 evidence anchor 由 `git log -1` / machine-truth blocker 記錄，避免文件自指 SHA。
- `ai-status.sh show SR-ARTIFACT-001` / `show SR-INVOICE-001`：exit 0，均為 done。
- `git merge-base --is-ancestor 3e1904b1318a3252d3f7b5673173608fd6d12f71 origin/dev`：exit 0。
- `git merge-base --is-ancestor a4876ac529abfb634c2b96f237116202abf3d87d origin/dev`：exit 0。
- 需求：`phase1_prd_detailed_v1.md` §9.8.4；service contracts 的 remittance proof/index；
  task execution_ref 與 source `new-gaps.json` N09、`capabilities.json` C081/C125。
  9/6 舊 audit 未當作目前實作真值。

## 實際重現

指令：`pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/`

Exit 1：1 test file，3 tests，1 passed / 2 failed（16:43 UTC，3.53s）。

| 驗收斷言                     | 實際結果                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| 未核准批次拒絕付款且不持久化 | PASS，`REIMBURSEMENT_NOT_APPROVED`                                |
| 虛構 proof ID 不得 paid      | FAIL，promise resolved instead of rejecting，回傳 `status: paid`  |
| 持久化未結束不得回 paid      | FAIL，repository promise 尚未 resolve 時 `returnedPaid` 已為 true |

隔離 unit 資源 ID：`sr-proof-001-batch-a`、`sr-proof-001-driver-a`、
`sr-proof-001-statement-a`、`sr-proof-001-nonexistent-proof`。沒有建立任何上傳物件。
這些是測試輸入，不是 live 資源、合法證明或真付款證據。
持久化測試在 finally 釋放延遲寫入；未模擬真 DB commit 或 durable receipt。
權威 proof 流程完成後，必須將持久化測試擴成合法 proof 輸入及跨实例 DB 驗證，
不能以「invalid proof 先被拒絕」取代合法付款的 durable receipt 驗收。

程式追蹤：

- `billing-settlement.service.ts` 的 `markReimbursementPaid` 只檢查 proof ID 非空，
  先改共享 batch/statement，再呼叫未 await 的 `persistChanges`。
- `approveReimbursementBatch` 先修改共享 batch 的 approvedAt，再等待持久化。
- repository 對 batch 使用無 revision/CAS 的 JSONB upsert；付款與 statement 更新
  不具備此流程所需的同交易 proof 查验、批次鎖及 receipt。
- artifact store 的 kind 僅 tenant-invoice / placard / report，為同步 in-process bytes；
  沒有 remittance proof、批次歸屬、掃描或耐久上傳紀錄。
- SOS attachment ports 綁定 sosEventId/DriverSosAttachmentRecord；SupplyDocumentService
  綁定 fleetPartnerId/submissionId，且 upload URL 使用 example domain，不能冒充真上傳。

## Supervisor 需處理的 scope / dependency

目前 write_scopes 只有 billing service/controller、reimbursements UI、task tests/evidence。
以下為明確擴 scope 申請，尚未修改任何越界檔案：

1. `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`：
   proof 存在性/批次/driver/掃描狀態回讀，付款與 statement/receipt 原子提交，
   並發核准/付款的跨實例一致性；保留 PROOF → FLEET-SETTLE 序列。
2. `apps/api/src/modules/billing-settlement/billing-settlement.module.ts` 及明確分配的
   proof storage/scanner adapter leaf 檔：沿現有 storage/scanner ports 的模式建立
   真上傳確認、掃描與受控回讀，不能強塞 SOS 身份或替代為假 scanner。
3. 由 SR-CONTRACT owner 分配 proof 型別/API client 與專屬 migration，加入必要依賴；
   schema 必須持久化 batch/driver 歸屬、物件 key/hash/type/size、scan result、
   uploader/time 及 transaction receipt。不要讓本 task 私改 shared exports 或任選 migration。
4. 指派 canvas owner 補以下畫面需求，或明確擴大經 review 的 design scope。
   本 worker 不自創視覺。

## Screen requirements note（依 dispatch UI contract 停止 UI 寫入）

已讀 `packages/ui-tokens/src/realms.ts` 與 canonical
`docs/05-ui/drts-design-canvas/platform-screens-3.jsx` 的 PA_Reimbursements /
PA_ReimbursementDetail，以及 Platform Admin.html 入口。
現有 canvas 有批次詳情/核准/時間軸/明細，缺 proof 上傳、掃描、拒絕與回讀狀態。
本次 dispatch 明定缺 screen 要記 requirements 並 STOP，故未改 UI。

需要 canvas 補定的互動：

- 在批次詳情沿用現有 Header/Card/Timeline 排版，指定選檔與上傳操作位置。
- 明示允許 MIME、大小限制；上傳中/錯誤/重試的狀態與訊息位置。
- 顯示伺服器確認的檔名、批次、掃描 pending/clean/infected/error，避免自由文字 proof ID。
- 尚未核准或掃描未 clean 時付款禁用，給出原因；送出中避免重覆操作。
- 已付紀錄顯示原檔資訊與授權回讀入口；連結到期可重新授權，越權明確拒絕。
- 顏色與 typography 延用 @drts/ui-tokens 的 platform realm 與既有 canvas tokens；
  不新增 raw hex palette，不重設整體頁面。

## 驗證界線與下一步

| 指令 | Exit / 結果 |
| --- | --- |
| `git diff --check` | 0 |
| `pnpm --filter @drts/api typecheck` | 2；13 個既有 voice/owned-mobility 契約錯誤，產品 source 未修改 |
| `pnpm --filter @drts/platform-admin-web typecheck` | 0；route types 產生成功 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/` | 1；上述 1 passed / 2 failed |
| `pnpm exec prettier --write tests/unit/system-remediation/sr-proof-001/payment-gate.test.ts docs/04-uat/system-remediation-20260906/SR-PROOF-001.md` | 0 |

API typecheck 錯誤位於 voice-capability.guard/service、voice-cti.adapter、
voice-booking-authorization.service（缺 VoiceAgentBookingActor、VoiceCapability*、
DTMF_DIGIT_REGEX exports），以及 owned-mobility.repository/service
（OwnedOrderRecord 缺 aggregateVersion / voiceIntentId）。不在本 task scope，未越界修正。

本輪未執行合法 proof bytes 上傳/掃描/下載、跨 batch/driver 授權、真 PostgreSQL
並發核准/付款、重送 markPaid durable receipt、瀏覽器互動或 live/真機驗收。
沒有真付款、外部通知或 production 變更。

等待 supervisor reviewed scope / dependency / canvas 補齊後，從 fresh origin/dev rebase，
落實權威流程並使 regression 轉綠，再 commit、普通 push 與 handoff 鎖定同 candidate。
