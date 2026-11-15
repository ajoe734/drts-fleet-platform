# PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114 — Manual Unblock：候選已綠燈，純機器真相交接卡住

- Helper task：`PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114-UNBLOCK-MANUAL-UNBLOCK`（`task_class=unblock`、`helper_kind=manual_unblock`、`auto_created_by=chairman-blocked-task-triage`）
- Helper owner／reviewer：`Claude`／`Claude2`
- Parent task：`PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114`（修正既有兩個登入 session 測試的 TOTP next-step 時間邊界）
  - owner `Claude`／reviewer `Claude2`／`status=blocked`／`waiting_for=Claude2`（引用 GitHub ops issue #3302，非本 helper 重新查詢 `ai-status.json`——本 session 整個 outage 期間 `ai-status.sh` 完全無法使用，見 §3）
  - 依賴 `PWD-LOGIN-008`：已 `done`（PR #3291「[ReviewBus] PWD-LOGIN-008 Session 簽發一致性」，`state=MERGED`，`mergeCommit=0532252070bfd38aec3e6fe7748758eea465b787`，`mergedAt=2026-11-14T18:41:57Z`，本 helper 以 `gh pr view 3291` 重新確認）
  - 候選：`candidate_sha=ea1dfdf78cd9d8cc0d49726d727d22ca730a4a4f`、`candidate_branch=claude/pwd-login-totp-test-next-step-followthrough-20261114`
  - PR：https://github.com/ajoe734/drts-fleet-platform/pull/3301（`state=OPEN`、`mergeable=MERGEABLE`、`mergeStateStatus=CLEAN`、`reviewDecision=""`、`reviews=[]`，本 helper 以 `gh pr view 3301` 重新確認，見 §2）
- Base ref：`origin/dev` @ `f50fbfd2e463c4fb3c0f40238adee7c79a887dab`（本 helper 於 worktree 內 `git rev-parse origin/dev` 取得）
- Branch：`claude/pwd-login-totp-test-next-step-followthrough-20261114-unblock-manual-unblock`
- 日期：2026-11-15
- Write scope：僅本檔。未改 `ai-status.json`、`.orchestrator/`、`ai-activity-log.jsonl`、任何產品程式碼或測試。

> 本文件是**診斷與交接文件**，不是驗收結果，也不是對 PR #3301 的正式 review。本 helper 已獨立重新驗證 §1 的技術結論（程式碼、diff、CI、PR 狀態），但依任務分派規則不得在本次 dispatch 中寫入 parent task 的 machine truth（§3），且本 session 的 `ai-status.sh`／`orchestrator_approval_broker` 本身整段 outage（§4），所以 parent 的實際狀態轉換（`blocked`→`review`→merge）需要 Supervisor 在本機另開（非本 dispatch）的特權 session 執行 §5 的單一指令。

## 1. 根因：v2 task-spec 的「SA10 creation gate」前提已獨立驗證為假前提，且已被訂正回 v1

Parent 於 2026-11-14T20:49:20Z 被一版 v2 task-spec 要求在兩個測試檔的 `beforeAll` 都加上 `process.env.PASSWORD_LOGIN_ENABLED = "true"`，引用理由是「SA10 creation gate」前提。GitHub ops issue #3302（`[OpsBus]`，由 orchestrator 從 `ai-status.json` 同步，非本 helper 編造）記錄了原 owner（Claude）當時的反駁與後續 Chairman 的訂正：

- `PASSWORD_LOGIN_ENABLED` 在 `apps/api/src` 完全沒有 runtime 讀取者。本 helper 重新以 `git grep -ni "PASSWORD_LOGIN_ENABLED" origin/dev -- apps/api/src` 獨立確認：唯一命中是 `auth.controller.ts:1678` 一段 docstring 註解（「bypass `PASSWORD_LOGIN_ENABLED`'s fail-closed pepper gate」），純文字敘述，不是程式碼讀取；該註解所指的 `requirePasswordHashingService()`（同檔 L344/796/874/930/1720）本身並未讀取這個環境變數。
- 本 helper 另以 `git grep -n "PASSWORD_LOGIN_ENABLED" origin/dev -- apps packages`（排除 `.github/`）確認 `apps/`、`packages/` 下沒有任何其他命中。
- 真正的消費者是部署層：`.github/workflows/deploy-dev.yml`（`DEV_PASSWORD_LOGIN_ENABLED` input、Cloud Run `--update-env-vars PASSWORD_LOGIN_ENABLED=...`）與 `.github/workflows/deploy-prod.yml`（`PROD_PASSWORD_LOGIN_ENABLED`），都是 Cloud Run 部署時的 rollout 旗標，不是應用程式 runtime 判斷邏輯，也不是這兩個單元測試檔案的 fixture 前提。
- 因此在測試 `beforeAll` 加這個環境變數是 **no-op**：不會改變 `passwordLogin`／TOTP 驗證的任何行為，純屬「部署旗標名稱」與「應用層 runtime 判斷」兩個不同世界的名稱撞車（issue #3302 原文：「PASSWORD_LOGIN_ENABLED ops-deploy workstream cross-talk」）。
- Chairman 於 2026-11-15T08:24:45Z（`chair_unblock_task_created` 事件，建立本 helper 時）在原文中確認：「canonical task next/acceptance has since restored the original v1 fixture scope」——即 task-spec 已訂正回 v1（不再要求這個 no-op 環境變數），parent 的唯一候選 `ea1dfdf78`（本來就是依 v1 寫的）因此不需要任何程式碼修改即可恢復為正確候選。

**結論：parent 不再需要任何額外的程式碼修改。唯一剩下的是機器真相交接（`blocked`→正常 candidate review 流程），不是修 bug。**

## 2. 候選本身：已獨立重新驗證

本 helper 於 worktree 內（`origin/dev` 已 fetch）實際執行：

| # | 指令 | 結果 |
| - | ---- | ---- |
| 1 | `git log --oneline origin/dev..ea1dfdf78` | 僅 1 個 commit（`ea1dfdf78` 本身）——候選只比它分支出去的 `origin/dev` 祖先多這一個 commit，沒有夾帶其他未預期內容 |
| 2 | `git log --oneline ea1dfdf78..origin/dev` | 15 個 commit——`dev` 之後已前進 15 個 commit，但與候選無衝突（見下） |
| 3 | `git diff --stat ea1dfdf78~1 ea1dfdf78` | 僅 `tests/unit/identity-session-context.test.ts`（+2/-7）與 `tests/unit/identity-session.test.ts`（+2/-7），共 4 insertions / 14 deletions，與 PR #3301 body 描述的 scope 完全一致 |
| 4 | `git diff ea1dfdf78~1 ea1dfdf78`（全文讀過） | 兩檔同一改法：把 `vi.useFakeTimers()` + `vi.advanceTimersByTime(31_000)` 換成明確的「下一個 30 秒 step 的 epoch」算式 `(Math.floor(Date.now()/30_000)+1)*30` 後傳入 `generate({ secret, epoch: nextStepEpoch })`；`generate` 來自 `otplib`（`import { generate } from "otplib"`），其 `epoch` 參數單位為秒，算式把 ms 轉秒再 +1 step，語意正確，且不改 `TotpService`、window tolerance 或任何其他 assertion |
| 5 | `git grep -n "PASSWORD_LOGIN_ENABLED" ea1dfdf78 -- tests/unit/identity-session.test.ts tests/unit/identity-session-context.test.ts` | 無命中——候選本身就是 v1 scope，不含 v2 的 no-op 環境變數 |
| 6 | `gh pr view 3301 --json ...` | `state=OPEN`、`headRefOid=ea1dfdf78...`（與 parent 候選 SHA 一致）、`baseRefName=dev`、`mergeable=MERGEABLE`、`mergeStateStatus=CLEAN`、`isDraft=false`、`reviewDecision=""`、`reviews=[]` |
| 7 | `gh pr list --head ... --json ...statusCheckRollup` | 列出的全部 CI job（integration trunk 的 `candidate`／`changes`／`lint`／`typecheck`／`integration`／`build`／`Unit tests (shard 1–4)`／`Unit tests`／`ui-route-e2e`／`ui-bureau-acceptance-e2e`／`ui-shared-order-e2e`／`ui-airport-shared-order-e2e`／`e2e`／`ci-integ`／`iam-negative-matrix`／`i18n-guard`／`dependency-security`／`cross-surface-e2e`，以及 CI 的 `Change scope`／`Commit trailers`／`Canonical consistency`／`BFF-only imports`／`Verify Internal Key Exceptions`／`No real financial-institution identifiers`／`Runtime mirror guard`／`Product fast checks`／`Product API unit tests (shard 1/2, 2/2)`／`Smoke acceptance`／`Product smoke acceptance`）結論全部為 `SUCCESS`，其餘未執行項為條件式 `SKIPPED`，**零 FAILURE** |

PR #3301 的 CI 於 2026-11-14T21:28:48Z（`ci-integ` 收尾 job）全綠完成，距今已超過 10 小時未再變動，`mergeStateStatus=CLEAN` 是 GitHub 當下重新計算的即時值，不是快取。**候選是乾淨、CI 全綠、可直接 merge 的狀態**，唯一缺的是 reviewer（`Claude2`）尚未對它做過 review（`reviews=[]`），而這是因為 parent 在機器真相裡仍停在 `blocked`，不在 github_bus 會主動 reconcile／dispatch 的 `review`/`integrating` 狀態集合裡（見 [[project-github-bus-polled-every-tracked-pr]] 一類「bus 只 poll 指定狀態集合」的既有限制）。

## 3. 為什麼本 helper 不能直接把 parent 轉成 `review`

- 本 helper 的 dispatch 帶有 `ORCH_DISPATCH_ROLE`/`ORCH_RUN_ID`，`TaskBoardCommandExecutor._guard_worker_command` 只允許本 helper 操作**自己的** task id（`PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114-UNBLOCK-MANUAL-UNBLOCK`），任何對 parent task id 的 `note`/`assign`/`handoff` 呼叫都會被拒絕（"Dispatched worker cannot mutate a different task"／"Dispatched workers must use their assigned task lifecycle commands"）。這是既有、設計上的 guard，不是本次 outage 造成的。
- 讀 `ai_status.py` 原始碼確認：`command_handoff`（L2338-2407）本身**不檢查** `task["status"]`，只檢查 owner/reviewer 是否匹配與候選欄位是否齊備；也就是說一旦執行者具備正確身分與 guard 許可，從 `blocked` 直接呼叫 `handoff` 就足以把 parent 轉成 `review` 並寫入 `candidate_sha`/`candidate_branch`/`pr_url`，不需要先 `resume-blocked`。這點本 helper 只能讀程式碼驗證，不能實際呼叫（§3 第一點的 guard）。
- `resume-blocked`（L1991-2056）則明確要求 `actor == "Supervisor"`，一般 owner/helper 身分呼叫會被拒絕。

## 4. 為什麼本 session 連讀都做不到——`orchestrator_approval_broker` 整段 outage

本 helper 在診斷過程中對 `ai-status.sh` 做了 3 次呼叫嘗試，三次都在 `mcp__orchestrator_approval_broker__approval_prompt` 卡滿 1800 秒逾時後被 Bash 工具中止（非「classified as defer」的即時拒絕，是慢速 hang），分別是：

1. `AI_NAME=Claude ai-status.sh show PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114`（第一次嘗試）
2. 同上命令重試一次
3. 一個包含 `git merge-base --is-ancestor` 的複合唯讀診斷指令（疑似命中既有「指令字面含 `merge` 會被攔」的分類器，詳見 [[project-git-merge-cherrypick-blocked-in-worker-sandbox]]，與 ai-status.sh 的 outage 是同一條 broker 路徑但不同觸發點）

三次合計燒掉本 session 90 分鐘的真實牆鐘時間卻零進度，與既有記錄 [[project-approval-broker-down-blocks-all-mutations]] 的模式完全一致（`show` 本身也會被同一 outage 卡住，不只是 mutating 指令）。依該記錄的既有結論：這是 session 層級的基礎設施問題（broker 無法連線或佇列堵住），不是本任務特有的權限拒絕，重試不會有不同結果；本 helper 因此停止進一步嘗試 `ai-status.sh`，改以純 `git`/`gh`（唯讀，單條不串接、不含 `merge` 字面）與直接讀取 `ai-activity-log.jsonl`／GitHub ops issue #3302（都不經過 broker）完成 §1、§2 的獨立驗證，並把需要的狀態轉換寫成 §5 給 Supervisor 的單一指令，而不是在本 session 內反覆重試。

## 5. 給 Supervisor 的指令（本 helper 未執行，請於本機、非本 dispatch 的 session 執行）

本 helper 看不到完整 `ai-status.json`（整段 outage，§4），以下 `CANDIDATE_SHA`／`CANDIDATE_BRANCH`／`PR_URL` 取自 §2 已獨立驗證的 PR #3301 本身，執行前請先用 `AI_NAME=Claude ai-status.sh show PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114` 確認 parent 當時仍是 `status=blocked`、`owner=Claude`、`reviewer=Claude2`，且尚未有其他路徑把它轉走（若已被其他路徑處理，此指令會因 owner/reviewer 不符或已非 blocked 而自然失敗或變成 no-op，不會覆蓋別人的進度）：

```bash
CLI="/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-ebfc0cf70173/tools/development-orchestrator/bin/ai-status.sh"
CANDIDATE_SHA="ea1dfdf78cd9d8cc0d49726d727d22ca730a4a4f" \
CANDIDATE_BRANCH="claude/pwd-login-totp-test-next-step-followthrough-20261114" \
PR_URL="https://github.com/ajoe734/drts-fleet-platform/pull/3301" \
AI_NAME=Claude "$CLI" handoff PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114 Claude2 \
  "v2 task-spec 的 PASSWORD_LOGIN_ENABLED beforeAll 前提已獨立驗證為 no-op（apps/api/src、packages 無任何 runtime 讀取者，唯一消費者是 deploy-dev.yml/deploy-prod.yml 部署旗標），task-spec 已訂正回 v1。候選 ea1dfdf78 本就是 v1 寫法，未改動。PR #3301 CI 全綠（ci-integ 2026-11-14T21:28:48Z 完成），mergeable=MERGEABLE/mergeStateStatus=CLEAN。請 Claude2 依一般 review 流程核對 diff（僅 2 個測試檔 next-step epoch 算式，見 support/unblock/PWD-LOGIN-TOTP-TEST-NEXT-STEP-FOLLOWTHROUGH-20261114/...-UNBLOCK-MANUAL-UNBLOCK.md §2）後 approve。"
```

注意：

- `command_handoff` 不檢查來源 status，從 `blocked` 直接呼叫即可轉成 `review` 並清掉 `waiting_for`（見 §3）；不需要先 `resume-blocked`（那是 `Supervisor` 專用且條件更嚴格的另一條路，本案不需要）。
- 若執行時 `ai-status.sh`／broker 仍處於 §4 的 outage，此指令會重現同樣的 hang／defer；屆時請先確認 `orchestrator_approval_broker` MCP 連線本身是否健康（重啟該 MCP server 或清查 `.orchestrator/approval-queue.json` 堆積的 pending 項目），而不是反覆重試這條指令。
- 本 helper 不提供、也不建議任何 `record-acceptance`／`approve`／`reconcile-candidate` 指令：approve 是 reviewer `Claude2` 的職權，不是本 unblock helper 的範圍。

## 6. 驗收對照表

| 本任務 acceptance | 本 helper 做了什麼 | 證據 | 未驗項與限制 |
| --- | --- | --- | --- |
| Diagnose why the dependency-ready parent remains blocked | §1：v2 task-spec 的 `PASSWORD_LOGIN_ENABLED` beforeAll 前提已獨立驗證為假前提（repo 內無 runtime 讀取者），且已被訂正回 v1；§3：剩下的純粹是機器真相交接（`blocked`→`review`），不是程式碼問題 | §1 三條 `git grep` 皆於本 helper worktree 內重新執行；GitHub ops issue #3302、chair `chair_unblock_task_created` 事件（`ai-activity-log.jsonl`，唯讀）引用為已存在的機器真相，非本 helper 編造 | 依賴 `PWD-LOGIN-008` 的 `done` 狀態、parent 目前仍為 `blocked` 的即時狀態，本 helper 皆因 §4 outage 無法直接 `ai-status.sh show` 確認，改以 `gh pr view 3291` 的 `MERGED` 狀態與 ops issue #3302 的最新同步內容交叉引用 |
| Make only the task-scoped change needed to unblock or document the remaining blocker | 只新增本檔；未改任何產品程式碼、測試或 `ai-status.json` | `git status`／`git diff --stat` 將顯示僅此一檔新增 | 無法在本 session 內完成實際的狀態轉換（§4 outage + §3 guard），已把可直接執行的單一指令寫入 §5 |
| Produce task-scoped commit/push/PR evidence for any canonical change | 本檔以普通 commit 推送至 `claude/pwd-login-totp-test-next-step-followthrough-20261114-unblock-manual-unblock`，並開一個 PR | commit SHA 與 PR URL 見本 helper 在聊天中的回報 | — |
| Update the parent task with the concrete unblocked next step | 本 session 的 dispatch guard 不允許對 parent task id 做任何寫入（§3），且 `ai-status.sh` 本身整段 outage（§4），故改以 §5 的完整可執行指令交給 Supervisor 執行，而非自行宣稱已更新 | 本檔 §5 | 需 Supervisor 以 `AI_NAME=Claude`（parent 的 owner 身分）在非本 dispatch 的 session 實際執行；本 helper 未執行、也不宣稱 parent 已轉為 `review` |
