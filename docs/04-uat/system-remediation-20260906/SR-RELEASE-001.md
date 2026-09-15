# SR-RELEASE-001 — 整合候選與全角色本機／dev可重跑閉環

- Status: `in_progress` → CI typecheck fix applied → reviewed/approved → reconciled to PR, full CI failure (round 2, out-of-scope stale test, see below) → re-synced with origin/dev → handoff pending review (round 3)
- Owner: `Claude2`
- Reviewer: `Claude`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Task Spec Ref: `docs/03-runbooks/system-remediation-20260906/SR-RELEASE-001.md`
- Dispatch base SHA: `acfe53f6533ca2d74379c3b2b4dd7ff0c92d1bfc`
- Synced `origin/dev` SHA at handoff: `c189ee2da29eefb31fc2de0c1b787c4e843c317c`
- Last Update: see `ai-status.sh show SR-RELEASE-001`

## 這份文件是什麼

本文件是本任務的任務記錄摘要。完整的機器可讀 134 能力＋44 問題 current disposition 在
[`release-candidate.json`](./release-candidate.json)；完整敘述性證據（同步、重跑指令、
發現的兩項現況問題、C118 新回歸測試細節、誠實揭露的未做部分）在
[`closed-loop-evidence.md`](./closed-loop-evidence.md)。本文件只彙總結論，不重複列出全部
178 項細節。

## 這個任務做了什麼

1. 確認 15 個相依 `SR-QA-*`／`SR-SCOPE-001` 任務皆為 `done`。
2. 發現 `origin/dev` 在本任務 dispatch 後又前進（merge 了 `SR-QA-BOOKING-001` v2,
   PR #2031），以 `git merge origin/dev` 同步（fast-forward，零衝突，尚未鎖定 candidate）。
3. 以 `ai-status.sh show`/`list` 建立 134 能力、44 問題的目前 task-board 狀態快照
   （未整檔讀取 `ai-status.json`），交叉比對 `coverage.json` 的 `implementation_tasks`／
   `verification_tasks`／`source_refs`，逐項判定 current disposition。
4. 新增可重跑回歸測試
   [`tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts`](../../../tests/unit/system-remediation/sr-release-001/same-order-cross-role-closed-loop.test.ts)，
   把「建單→簽核→派車→driver完成→帳務→文件→客訴結案」七段用同一個 `orderId`／
   `bookingId` 串成一條可重跑的鏈路，全程真實服務層呼叫、不用 fixture。1/1 passing。
5. 該新測試順帶重新驗證了 N04（「帳單建立了下載中繼資料，但沒有真正帳單檔案」）在目前
   SHA **已修復**：真實簽章驗證下載連結讀出實際 PDF bytes，非僅程式碼判讀。
6. 重跑既有相關回歸套件（owned-mobility、tenant-governance-e2e、complaint、invoice、
   placard、artifact 等），共 191 項測試，除 §7 提到的一個已知現況問題外零退化。
7. 整合過程中發現並如實記錄兩項現況問題（非本任務造成，亦不在本任務 write_scopes 內
   修復）：
   - `C016`（企業／租戶通道最短提前時間）：修復子任務
     `SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME` 目前 `in_progress`，candidate CI failure，
     尚未合併——重跑其現況重現測試（12/12 passing）確認缺口目前仍存在。
   - `tests/unit/system-remediation/sr-qa-booking-001/c028-tenant-quota-reservation-and-cancellation-gap.test.ts`
     的 3 項「現況缺陷重現」斷言已因 `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE`（先於本任務
     merge）修復生效而過期（斷言的壞行為已不存在）。已用
     `ai-status.sh assign` 建立追蹤任務
     `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE-STALE-GAP-ASSERTIONS`（實際 owner `Gemini`、
     reviewer `Gemini2`，orchestrator 後續重新指派），未直接修改該檔案（不在本任務
     write_scopes 內）。
8. Candidate `91999fee3850`（PR #2033）review 時，reviewer 回報 CI 的
   `Product smoke acceptance` job 於根層級 `pnpm run typecheck:root` fail：新測試對
   `assignDispatch()`（回傳型別為 `MaybePromise<DispatchAssignmentResult>`）未 `await`
   就直接讀 `.taskId`，共 7 處 `TS2339`；本機先前只跑了 `apps/api` 範圍的 `tsc`，未涵蓋
   repo-root `tests/**/*.ts`，故未捕捉到。已在測試中補上 `await`（未改動
   `assignDispatch()` 本身或任何業務碼），重跑 `pnpm run typecheck:root` 確認此檔案的 7
   處錯誤全部消失，並重跑測試（1/1 passing）、`apps/api` 範圍 `tsc`、ESLint、Prettier、
   `git diff --check` 全部通過。細節與根層級 typecheck 在本 worktree 因共用 `node_modules`
   未同步（`@drts/api-client`／`@drts/ui-tokens` workspace symlink 缺失，與本任務無關的
   環境落差）而整體仍非零 exit 的誠實揭露，見 `closed-loop-evidence.md` §7.1。
9. Candidate `a4acf6877b44`（PR #2033）review 通過後，完整 CI 才跑完並回報
   `ci_status: failure`（`unit`／`Product smoke acceptance`／`Smoke acceptance`／
   `ci-integ` 四項），任務被 reconciler 退回 `in_progress`。排查後確認：四項失敗全部
   cascade 自同一顆種子——就是第 7 點記錄的、已建追蹤任務的那個過期斷言檔案；
   而該追蹤任務（`SR-QA-BOOKING-001-FIX-QUOTA-RELEASE-STALE-GAP-ASSERTIONS`）已在本
   task review 通過後的同一時段完成並合併進 `origin/dev`（`4b62cf4d7` → `c189ee2da`，
   PR #2032），但本任務分支早於該合併就已鎖定 candidate，所以仍帶著舊檔案。確認
   candidate 已因 CI failure 被解鎖（非仍在 review 中），依 §11 規則再次
   `git merge origin/dev`（零衝突），重跑先前失敗的檔案（5/5 passing，先前
   3 failed／2 passed）與本任務自身測試（1/1 passing）、`git diff --check`
   （clean）全部通過。細節見 `closed-loop-evidence.md` §7.2。

## 結論（誠實揭露，非全系統 done）

- 134 能力：92 項 `resolved_pending_release_verification`、32 項
  `blocked_external_live_gate`（等待真實網域／裝置／電信授權，`SR-LIVE-*`／
  `UV-EXEC-028` 依賴）、7 項 `confirmed_scope_excluded`（Phase 1 launch 範圍排除，非
  缺陷）、1 項 `open_gap_in_progress`（`C016`）、1 項 `resolved_via_successor_pending_release_verification`
  （`C111`）、1 項 `self`（`C118`，本任務自身，已用新回歸測試驗證）。
- 44 問題：33 項 `resolved_pending_release_verification`、10 項
  `blocked_external_live_gate`、1 項 `open_gap_in_progress`。
- **沒有任何一項被標為全系統 `done`**；`SR-ACCEPT-001`（正式環境最終驗收）仍待本任務
  與全部 9 個 `SR-LIVE-*` 任務完成外部授權後才能推進，超出本任務範圍。
- 本任務交付「可發布候選與部署檢核 runbook」，不等於正式 live 驗收，不自動部署 prod。

## 交接程序

先 commit＋普通 push 至 `claude2/sr-release-001`，再以
`CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=$(git branch --show-current) AI_NAME=Claude2 ai-status.sh handoff SR-RELEASE-001 Claude "..."`
交接予 reviewer `Claude`。Owner 不直接呼叫 `done`；候選需經獨立 reviewer、同 candidate
CI／merge 及 required_acceptance 完備才能結案。
