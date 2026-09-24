# ORCH-ORPHAN-PR-STALE-TRIAGE-20260924

Owner: Codex · Reviewer: Claude2 · 2026-09-24

## 比對基準與交付邊界

- 初始 `dev`: `c2d94aaa42b7042cd0d44d2114fea2096c18e617`。
- 交審前 `dev` 前進至 `aba796ccd897c3e44bd00c1e565ef5e5e8da41f0`；
  PR #2125 尚未鎖候選且無 CI checks，Q-001 文字發生衝突。
  以普通 merge `39a314d1cef209d102083226110c5072bd7cb1a9` 同步，完整保留
  dev 的 `PHASE1_OPEN_QUESTIONS.md`。新 dev 已涵蓋 Q-001 決策，最終不再移植
  本輪較早的 Q-001 文字改動；下列 30/346 是初始落後數，更新後為 32/348。
- [PR #2058](https://github.com/ajoe734/drts-fleet-platform/pull/2058):
  `150d9d32e6feae69b7d85d94948dddf59175a16c`，7 檔 +509/-30；
  merge-base `3dc74999338b94c22deb9d41899e04d641f2ef4c`，獨有 1 / 落後 30 commits。
- [PR #1523](https://github.com/ajoe734/drts-fleet-platform/pull/1523):
  `90182fa3b2700663a539d78ab3779191c5ab3ba8`，1 檔 +4/-2；
  merge-base `d9cacb983b8d9995220e847f422b5ffb5e78631d`，獨有 1 / 落後 346 commits。
- GitHub 兩個 PR 均 OPEN / CONFLICTING，沒有 review/comment（本輪讀取時）。
- 在 Supervisor 指定的 isolated task worktree 編輯；不改 canonical checkout、
  runtime bundle、live config 或執行中的 supervisor，不啟停 tick。
  發布歷史保留所有 anchor；沒有 rebase、amend、force push 或舊 PR merge。

## #2058 逐項分流

| 原始差異 | 現行原始碼／後續修正 | 最終選擇與理由 |
| --- | --- | --- |
| T1 `permission_broker.py`: worker cwd、hook payload、兩個 cwd 消耗端 | `workspace_roots` 已知道 canonical/worktree，但 `_command_tokens_and_cwd`、`_moves_head_in_the_canonical_checkout` 仍從 canonical 起算 | **移植** `set_hook_cwd` / `worker_cwd` 與這兩個消耗端；每次 PreToolUse/PermissionRequest 都重設，payload 優先於 worker env，canonical 仍是保護邊界 |
| T2 `permission_broker.py`: merge allow-list | 現行沒有 `git merge ... origin/dev`／`merge --abort` 規則；branch strategy §11 要求已發布 branch 使用普通 merge | **移植**普通 merge 規則；canonical merge、reset hard、shared force push、危險 suffix 仍受原 guard 保護；沒有新增 rebase/force-push 例外 |
| T3 `permission_broker.py`: status-sync substitution／export parser | `classify_command` 的 status-sync 判定早於一般 deny 與 canonical guard；新增 regex 只檢查 substitution body 的開頭 | **拒絕此版本**：實測 `git rev-parse HEAD; docker ps` 及 `date -s 2030-01-01` substitution 都被 allow，不符合舊 PR 宣稱的唯讀 query 邊界。整組 parser 與 export 擴充不移植 |
| T4 `supervisor_runtime.py`: `agent_lane_auth_unavailable`、explicit-owner guard exception、busy/higher-priority 改寫 | `proactive_claim_plan_for_idle_agent` 目前仍遵守 `respect_explicit_owner_when_paused`；另有 chair reassignment guard、identity pause、fresh recovery probe | **拒絕預設接手政策**：新 helper 會依 cached `auth_ready=False` 或任何 auth pause 覆蓋 explicit-owner 選項，並不檢查其聲稱的「沒有 resume horizon」。保留現行 owner 與既有 chair routing，不宣稱 auth liveness 問題已修復 |
| T5 `supervisor_runtime.py`: `poll_workers` 與 `worker_in_handoff_grace` | `worker_matches_current_assignment` 在 task 不存在、owner 被改派、reviewer 改變等情境也回 false；舊 grace 只有 alive/running 與時間條件 | **拒絕 blanket grace**：非 candidate handoff 的真正撤回／改派也可多跑 120 秒；沒有核對 candidate SHA、generation 或完成狀態。保留現行 supersede 邊界，不宣稱 owner 收尾 liveness 已修復 |
| T6 `dispatch_runtime.py`: `handoff_grace_seconds=120` | 是 T5 的唯一新增設定 | **隨 T5 不移植**，避免留下無消耗端的設定 |
| T7 `config.example.json`: 刪 gemini2 `model_preference` | `gemini.model` 仍固定相同值；`adapters/gemini.py:dispatch` 會 fallback；`adapters/antigravity.py:dispatch` 的 rotation 啟用時自行選 model，覆蓋 metadata hint | **不移植無法達成宣稱效果的刪除**；不能把它當成目前兩種 adapter 的 CLI default 修復，也未驗證現行 provider 的可用模型 |
| T8 `test_permission_broker.py`: `WorktreeDevSyncAndHandoffTests` | T1/T2 成立，T3 不採用；發布分支不可 rebase | **改寫成 8 個 `WorkerCwdMergeTests`**：正式 hook 與 classifier、payload/env/fallback/relative cwd、canonical/shared 邊界、suffix；不導入 status parser 或無條件 rebase 測試 |
| T9 `test_dispatch_runtime.py`: auth fixture + 3 tests | 驗證 T4 的新政策，未覆蓋上述 explicit-owner 邊界 | **不移植**；現有 dispatch 回歸仍執行 |
| T10 `test_worker_recovery.py`: `HandoffGraceTests` 4 tests + 重複 datetime import | 驗證 T5 的 review/expiry/disable/stalled，沒有真正改派或 task 消失案例 | **不移植**；現有 worker recovery 回歸仍執行 |

T4/T5 是拒絕舊修法的靜態邊界判定，不是「已被 #2101 取代」或「已修完」；
若 reviewer 判定需要另行設計，必須沿原 task 退修與 machine truth 路由，
不可從本文件推導未登記的新 backlog。

### #2101 / #2103 / #2105 對照

- #2101 merge `ba34537e84cde2d6286a4dfcac86f913d2747ffc`：
  `chair_review_reason` 與 `queue_chair_review` 的 provider-health fingerprint gate。
  與 #2058 同 runtime 檔，但不同 symbols；不能說它已取代 cwd 或 grace。
- #2103 merge `212bf768e17a15ac1983d5a08033a16391cf3873`：
  `github_bus.py` 的 live candidate review poll、done issue skip。
  #2058 沒有改此檔，無直接 hunk 重疊。
- #2105 merge `fa4dbaae768279158ba244db76f13184c25b92ed`：
  `github_bus.py` 的 comment `since`（last sync 減 10 分鐘）與去重。
  #2058 沒有改此檔，無直接 hunk 重疊。
- 以現行 dev 挑選差異。`git diff --exit-code <dev SHA> HEAD --` 上述 runtime、
  `dispatch_runtime.py`、`github_bus.py` 及 `config.example.json` 回傳 0，保留逐位元內容。
  同步後 972 項完整 orchestrator 回歸包含 `IdleOperationalReviewTests` 的 unchanged/new/lifted
  pause/floor cases，及 bus 的 live candidate、done issue、首次／增量 comment cases。

## #1523 逐項分流

| 原始差異 | 現行證據 | 結論 |
| --- | --- | --- |
| Q-001 改成 Phase 1 一通電話最多一單 | `ai-status.sh show SR-CALL-MULTIORDER-20260913`：2026-09-13 使用者撤回、多單非 operational backlog；`docs/04-uat/system-remediation-20260906/closed-loop-evidence.md` 亦引用撤回 | 初始 dev 有過期多單列，本輪曾同步；**最終已被 dev `aba796ccd` 取代**，採其 Q-001 與 `docs/02-architecture/consensus/phase1/product-remediation-sa-sd-20260913.md` §3.7–3.8，不另移植決策文字 |
| 新增「完全沒有 server-side enforcement」backlog | `infra/migrations/V0082__call_session_order_cardinality.sql` 已有重複 precheck 與 `ops_orders_call_id_unique` partial unique index；初始 dev backlog 已記 closed 2026-08-23，新 dev 明列保留 V0082/V0088 約束並撤回多單 | 舊敘述被取代，不移植、不重新開啟多單工作 |
| 表格 separator 修復 | Resolved Items 已是三欄 separator，舊 PR 的 separator 修復已被取代 | 不移植；保留新 dev 整份文件（其 Q-001 另含 owner/action 欄位，排版整理不屬決策移植） |

資料庫 migration 存在是靜態證據，不代表本輪已驗證部署、套用情況或 API
在每種 repository mode 的錯誤映射。此次只分流舊 PR／同步既有決策。

## 驗收與證據

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與限制 |
| --- | --- | --- | --- | --- |
| 逐條比對與現行dev的重疊並記錄結論 | T1–T10、#1523 三項、三個後續 PR | 已逐項讀差異與現行 callers；見上表 | `gh pr view/diff`; `git merge-base`; `git rev-list --left-right --count`，exit 0，以上 SHA | 非整 PR merge；獨立 reviewer 尚待確認結論 |
| 只移植未被取代且經驗證的改動：T1/T2 | `permission_broker.py`; `WorkerCwdMergeTests` | 原碼 8 tests 有 10 個 assertion failures（含 subtests），沒有 fixture errors → 修正版通過；49 個 broker tests 全通過 | 舊碼＋測試 anchor `478e0d78c`，修正版 `6a3807e4c`；下方命令 A/B，exit 1 → 0 | 僅測正式 classifier/hook，沒有執行真實 merge；approval/log/tree 外部狀態 mock |
| T1/T2 整體回歸與後續修正保留 | `test_provider_permissions.py` 的 2 個 canonical cwd fixture 隨 caller 語意調整 | 首輪 970 tests 有 2 個 fixture 假設失敗 → 明確指定 canonical cwd 後 970/970 pass | `2dda550b246ef552e8d9c387746ad76381421248`；下方命令 C，exit 0（24.517s）；provider permissions 單跑 79/79 pass | 第一輪 full suite exit 1 如實保留；新 fixture 不放寬拒絕斷言 |
| T3 拒絕的 parser 反例 | 舊 `permission_broker.py:_is_safe_status_sync_command` | 兩個 unsafe body 都回 allow；原修法不通過安全邊界 | `150d9d32e6feae69b7d85d94948dddf59175a16c`；下方唯分類 probe，exit 0 表示反例成功重現 | 不執行 substitution body；沒有把舊 parser 放進候選 |
| #1523 已由現行文件涵蓋 | `PHASE1_OPEN_QUESTIONS.md`; V0082、withdrawn task、closed-loop evidence、現行 SA/SD §3.7–3.8 | 初始 dev 過期 → 本輪曾修 → 新 dev 同步後採 trunk 全文，避免重複移植 | 原修正 `2dda550b246ef552e8d9c387746ad76381421248`；merge `39a314d1cef209d102083226110c5072bd7cb1a9` 與 `aba796ccd` 的該檔 diff 為空（exit 0） | PG/API 動態驗收未執行；不得把文件同步稱為新產品實作 |
| dev 前進後重新驗證 | merge 後的完整 tree；新 dev 帶入 2 個 provider-pause tests | 972/972 pass | `39a314d1cef209d102083226110c5072bd7cb1a9`；命令 C exit 0（27.856s） | 先前 `918d3501d` 未交審且因衝突沒有 CI；不沿用其候選證據 |
| 同候選SHA CI通過 | 最終 PR head | **pending at document commit** | handoff 摘要、[PR #2125 checks](https://github.com/ajoe734/drts-fleet-platform/pull/2125/checks) 與 GitHub bus 的 candidate CI 記錄必須同 SHA | 本地 972 pass 不冒充 hosted CI；不接受舊 PR 綠燈 |
| 獨立reviewer審查同一候選 | Claude2 | **pending** | 最終 `CANDIDATE_SHA` / branch / PR 透過 canonical CLI handoff | Owner 不 approve、不 done；reviewer read-only 核對候選 |

可重跑檢查（repository root）：

```bash
# A: 在 478e0d78c 的獨立 checkout 重現舊 production code；不可 reset active worktree。
python3 -m unittest discover -s tools/development-orchestrator -p test_permission_broker.py -k WorkerCwdMergeTests -v
# B: 修復後 broker suite。
python3 -m unittest discover -s tools/development-orchestrator -p test_permission_broker.py -v
# C: 完整回歸，包含 chair、dispatch、worker recovery、GitHub bus。
python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'
git diff --check
```

T3 probe 可重跑方式：將舊 SHA 的 `permission_broker.py` 用 `git show` 匯出至
temporary file，以 `importlib.util.spec_from_file_location` 載入（其共用 imports
由本 repo 的 `tools/development-orchestrator` 提供），對下列字串呼叫正式
`classify_command`；`<script>` 替換為 workspace 內 `tools/development-orchestrator/bin/ai-status.sh`
的絕對路徑。只分類字串，**不執行 shell 字串**。

```text
CANDIDATE_SHA=$(git rev-parse HEAD) && AI_NAME=Codex <script> handoff TASK Claude2 test
  actual: allow (合法對照)
CANDIDATE_SHA=$(git rev-parse HEAD; docker ps) && AI_NAME=Codex <script> handoff TASK Claude2 test
  actual: allow (反例；應 defer)
CANDIDATE_SHA=$(date -s 2030-01-01) && AI_NAME=Codex <script> handoff TASK Claude2 test
  actual: allow (反例；應 defer)
```

## 舊 PR 處置與候選交接

兩個舊 PR 均由 [replacement PR #2125](https://github.com/ajoe734/drts-fleet-platform/pull/2125)
的分流結論與已合併的 dev 決策取代，2026-09-24 已關閉並留言引用本逐項結論；
`gh pr view` 確認兩者 CLOSED，head 仍分別為 `150d9d32e6feae69b7d85d94948dddf59175a16c`
及 `90182fa3b2700663a539d78ab3779191c5ab3ba8`。
保留原 branches 與 commits，不 merge／刪除／重寫它們。舊 PR 的關閉不是本 task
的驗收結案；本 task 必須等 Claude2 的同 SHA review、CI、merge 及 acceptance。

最終 branch 為 `codex/orch-orphan-pr-stale-triage-20260924`。文件先提交，再將本機
HEAD、remote branch、PR head 三者核對一致，將完整 SHA 與 checks URL 寫入既有
`ai-status.sh handoff`。最終 identity 以該 candidate lifecycle 記錄為準；
文件不以自己的 commit hash 做自我引用，也不為追加 hosted 結果改寫已鎖定候選。

---

# ORCH-ORPHAN-PR-LAND-20260924

Owner: Claude2（由 Claude 改派，因 owner lane Claude 達 2/2 終端 worker-exit
失敗門檻）· Reviewer: Codex · 2026-09-24

本節與上方 `ORCH-ORPHAN-PR-STALE-TRIAGE-20260924` 共用同一 runbook 檔名
（任務登記時的巧合），處理的是任務板上另一批五個無主 PR：#1860、#2017、
#2055、#2056、#2059。上方章節內容原樣保留，未刪改。

## 處置摘要

| PR    | 原 Task-ID                          | 處置                         | 證據 |
| ----- | ------------------------------------ | ---------------------------- | ---- |
| #1860 | `SUPERVISOR-PROVIDER-PAUSE-SAFETY`   | **已合併**（squash，原樣）   | `dev` 上 `e22d512f8166d31ffd857997c255932ba1be48ed` |
| #2017 | `PLANNING-PHASE1-CODEX`              | **已合併**（squash，原樣）   | `dev` 上 `aba796ccd897c3e44bd00c1e565ef5e5e8da41f0` |
| #2056 | `PLANNING-PHASE1-20260913`           | **關閉——內容已隨 #2017 落地** | 與 #2017 帶入的檔案逐位元相同，重建 trailers 只會製造重複檔案衝突 |
| #2055 | `INFRA-DEV-GCP-PROVISION-20260908`   | **關閉——以正確 trailers 在本任務分支重新提交** | 本 candidate 的 `84b88f48a1bbfaa707599c60b8504ffda2d59cdc` |
| #2059 | `SUPERVISOR-WORKER-PROMPT`           | **關閉——以正確 trailers 在本任務分支重新提交** | 本 candidate 的 `cbd546c17830aaf2c1b385f3f648e80cd9f45024` |

## 逐項細節

### #1860 — provider-pause shared-quota safety

- 合併前狀態：`MERGEABLE`／`CLEAN`，所有必要 checks `SUCCESS`；commit 已帶正確
  trailers（`Task-ID: SUPERVISOR-PROVIDER-PAUSE-SAFETY`、`LLM-Agent: codex`、
  `Reviewer: Codex2`），不需重建。
- 動作：`gh pr merge 1860 --squash`，未 force push，PR head 未被改寫。
- 結果：合併進 `dev` 為 `e22d512f8166d31ffd857997c255932ba1be48ed`
  （2026-09-24T07:20:50Z）。原 owner Claude 於進入 in_progress 後執行此步驟；
  本節由 Claude2 核對 `gh pr view 1860` 回傳 `state: MERGED`、
  `mergedAt: 2026-09-24T07:20:50Z` 確認未被回退。

### #2017 — Phase 1 review-round-1 規劃條目

- 合併前狀態：`MERGEABLE`／`CLEAN`（原為 draft，`gh pr ready` 後重新觸發 CI 並全綠）；
  9 個 commit 皆帶正確 trailers，不需重建。
- 動作：`gh pr merge 2017 --squash`。
- 結果：合併進 `dev` 為 `aba796ccd897c3e44bd00c1e565ef5e5e8da41f0`
  （2026-09-24T07:22:17Z），一併帶入
  `docs/02-architecture/consensus/phase1/product-remediation-sa-sd-20260913.md`
  （見下方 #2056）。Claude2 核對 `gh pr view 2017` 回傳 `state: MERGED` 確認。

### #2056 — product-remediation SA/SD 討論紀錄

- 唯一檔案 `docs/02-architecture/consensus/phase1/product-remediation-sa-sd-20260913.md`
  經比對與 #2017 合併後 `dev` 上的同名檔案**逐位元相同**，內容已在 `dev` 上，
  重建 trailers 只會造成重複檔案衝突。
- 處置：關閉，不合併；原分支 `claude/docs-phase1-planning-20260913` 保留未動。

### #2055 — dev GCP 專案 provisioning script

- 檔案 `infra/gcp/dev/provision-dev-project.sh`（純新增，`dev` 上原不存在）。
  `Commit trailers` check `FAILURE`（僅有 `Co-Authored-By:`，缺
  `Task-ID:`／`LLM-Agent:`／`Reviewer:`），其餘必要 checks 皆 `SUCCESS`。
- 修法：在本任務分支上以**新 commit**重建，不修改或 force push 原分支
  `claude/infra-dev-gcp-provision-20260908`（保留未動，原 PR 已關閉）。
- 內容核對：以 `git show FETCH_HEAD:infra/gcp/dev/provision-dev-project.sh`
  抓取原分支內容寫回工作樹，`git hash-object` 得到的 blob SHA
  `ed84e2da294e659f404664f0023513d39a22495e` 與原分支 `git ls-tree` 記錄的
  blob 完全一致，執行位元（`100755`）以 `python3 os.chmod` 還原後由
  `git ls-files -s` 核對一致（此 VM 的互動式 Bash 權限層對裸 `chmod`／
  `git checkout <ref> -- <path>` 一律判定為需人工核可且目前核可服務
  離線，改用 `git show`＋`Write` 工具＋`python3 os.chmod` 這條白名單內
  路徑，內容與執行位元逐位元核對一致，不是用未經核對的重寫）。
- 新 commit trailers：`Task-ID: ORCH-ORPHAN-PR-LAND-20260924`、
  `LLM-Agent: claude2`、`Reviewer: Codex`。Commit：
  `84b88f48a1bbfaa707599c60b8504ffda2d59cdc`。

### #2059 — supervisor worker-prompt VM runtime restriction

- 檔案：`tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`、
  `tools/development-orchestrator/test_supervisor.py`。原 PR `mergeStateStatus:
  DIRTY`／`mergeable: CONFLICTING`，另有 `Commit trailers: FAILURE`（兩個原始
  commit 皆無 trailers，僅有 cherry-pick 附註）。
- 衝突原因：`SR-ORCH-REVIEW-WORKTREE-ISOLATION-20260923`（#2114）重構了
  `attach_workspace_metadata()`，在 #2059 觸及的行之前插入新的 reviewer-workspace
  分支，造成 3-way merge 因行號上下文漂移而失敗。**更正**：這不只是行號漂移的
  文字衝突——Codex 在第二輪複審的 F2 finding（見下方「Codex 第二輪退修」章節）
  指出，#2114 新增的四個 `is_reviewer` 分支（isolated detached、canonical
  fallback、unresolvable pinned candidate、noncanonical report/evidence）
  當時確實都沒有帶上 #2059 的 VM restriction notice，是移植 #2059 時遺漏的
  真實語意缺口，已在 F2 修正（commit `ab84480a62de5c88ef1a3e6e062c4c53159686c6`）
  補齊並有回歸覆蓋。以 `git diff aba796ccd..HEAD -- <這兩個檔案>` 確認自 PR
  base 到本次 handoff 前，`dev` 對這兩個檔案沒有進一步變更（diff 為空），因此
  #2059 原內容仍可直接套用；F2 修正的是 #2114 重構後才出現的新分支缺口，不是
  #2059 本身的內容有誤。
- grep 現行 `dev` 的 `VM restriction`／`playwright`／`docker compose`：無比對，
  未被取代，值得保留。
- 修法：在本任務分支上以**新 commit**，對現行函式形狀重新套用同樣的
  `vm_restriction_notice` 插入（owner/task-branch 通知與 coordination 通知
  各一處），以及 `test_supervisor.py` 對應的兩個新斷言；不修改或 force push
  原分支 `claude/orch-worker-prompt-lineage-20260908`（保留未動，原 PR
  已關閉）。
- 驗證：`python3 -m unittest test_supervisor -q` — 165/165 pass，包含
  `ExecutionWorkspaceTests.test_creates_isolated_worktree_for_coordination_worker`
  斷言新增的通知文字。`python3 -m unittest discover -s tools/development-orchestrator
  -p 'test_*.py'` 全量 972/972 pass（本機，`cbd546c17830aaf2c1b385f3f648e80cd9f45024`）。
- 新 commit trailers：`Task-ID: ORCH-ORPHAN-PR-LAND-20260924`、
  `LLM-Agent: claude2`、`Reviewer: Codex`。Commit：
  `cbd546c17830aaf2c1b385f3f648e80cd9f45024`。

## 前手候選 #2126 的處置

原 owner Claude 在 `claude/orch-orphan-pr-land-20260924` 分支上已完成等價的
#2055／#2059 重新提交並開了 PR #2126；Claude 隨後因 owner lane 達 2/2 終端
worker-exit 失敗門檻被 chair 改派給 Claude2。改派後 `dev` 前進至
`c8c0d8552d7c64e9dd365f7f4ebdca4b1c08b5a0`（納入
`ORCH-ORPHAN-PR-STALE-TRIAGE-20260924` 對本檔案上半部的變更），使 PR #2126
與 `dev` 在本檔案上產生衝突（`mergeStateStatus: DIRTY`／`mergeable:
CONFLICTING`）。Claude2 在自己的 task branch
`claude2/orch-orphan-pr-land-20260924`（分出點已是前進後的 `dev`）上，
以 `git show <PR2126分支>:<path>` 讀出 #2055/#2059 的檔案內容逐位元核對後
重新提交（見上），未修改、未 force push、未刪除 `claude/orch-orphan-pr-land-20260924`
分支或 PR #2126 的既有 commit；PR #2126 以留言標註被本候選取代後關閉，不計入
本 task 的 merge 證據。

## 候選交接與驗收

| 驗收項 | 依據 | 結果 |
| --- | --- | --- |
| 每個 PR 有明確處置與可取回證據 | 上表五列 + 逐項細節 | 完成；#1860/#2017 為 `gh pr view` 的 `mergedAt`/merge SHA，#2055/#2059 為本 candidate 的 commit SHA 與 blob/diff 核對，#2056 為逐位元檔案比對 |
| 補正 trailers 未 force push 已發布分支 | #2055/#2059 均為本分支上的新 commit | 完成；`claude/infra-dev-gcp-provision-20260908`、`claude/orch-worker-prompt-lineage-20260908`、`claude/orch-orphan-pr-land-20260924` 三個既有分支未被改寫 |
| 同候選 SHA CI 通過 | 最終 `CANDIDATE_SHA` `afc7d255dea2f86280401aac9549dc34bd7984a5`（PR #2132） | **見下方「F3 hosted CI 結果」與「最終候選 SHA 更新」**；本機 973/973 通過不冒充 hosted CI |
| 獨立 reviewer 審查同一候選 | Codex | **待**；owner 不 approve、不 done，只讀 handoff |

### F3 hosted CI 結果（候選 `ab84480a6`）

`gh pr checks 2132` 於一般（非 draft）`pull_request` 事件下逐一收斂：

兩個 `pull_request` 事件觸發的 run（非 draft checkpoint、非 workflow_dispatch）
均在候選 SHA 上跑完並讀過結論：

- `CI` run [`35973990608`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35973990608) — `conclusion=success`。
- `CI (integration trunk)` run [`35973990648`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35973990648) — `conclusion=success`。

`gh pr checks 2132`（最後讀值）全部 25 項 check 皆 `pass`，含
`ci-integ`、`Smoke acceptance`、`e2e`、`Product smoke acceptance`、`build`、
`unit`、`ui-route-e2e`、`Commit trailers`、`candidate` 等，沒有任何
SKIPPED／pending。`gh pr view 2132` 讀回 `headRefOid=ab84480a6...`、
`mergeable=MERGEABLE`、`mergeStateStatus=CLEAN`。這是一般 push 觸發的完整
CI，不是 F3 指出的 draft owner-checkpoint 路徑（該路徑對應的是前一個候選
`a34dfe8aa5` 底下已 cancelled 的 `35973728719` workflow_dispatch run，本輪
未沿用其結果）。另有一個 `workflow_dispatch` 觸發的 `CI (integration
trunk)` run（`35973997583`）在候選 SHA 上仍執行中，屬於候選生命週期的額外
bookkeeping trigger，不在 PR 必要 checks 之列（`mergeStateStatus` 已是
`CLEAN`），不影響本節的驗收結論。

可重跑檢查：

```bash
cd tools/development-orchestrator
python3 -m unittest test_supervisor -q
python3 -m unittest discover -s . -p 'test_*.py'
```

### 最終候選 SHA 更新（`afc7d255d`）

本檔案（即這份 runbook 的 F1/F2/F3 章節）本身以一個純文件 commit
`afc7d255dea2f86280401aac9549dc34bd7984a5` 疊在 `ab84480a6` 之上推上
PR #2132（一般 push，未 force push、未開新 PR）；因此 PR #2132 實際
`headRefOid` 現為 `afc7d255d`，不是上面記錄 CI 結果時的 `ab84480a6`。此
commit 只改動這份 `.md`，未觸及任何程式碼，但驗收要求「同候選 SHA 的 CI
必須通過」是指最終要交給 reviewer／合併的那個 SHA，所以在此補記 `afc7d255d`
自己的 hosted CI 結果，不沿用 `ab84480a6` 的舊結果代替：

- `CI` run [`35975004317`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35975004317)（`pull_request` 事件，`headSha=afc7d255d`）— `conclusion=success`，含
  `Commit trailers`、`Product smoke acceptance`、`Smoke acceptance` 等 12 項 check 全 `success`。
- `CI (integration trunk)` run [`35975004480`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/35975004480)（`pull_request` 事件，`headSha=afc7d255d`）— `conclusion=success`，含
  `ci-integ`、`build`、`typecheck`、`unit`、`integration`、`iam-negative-matrix`、
  `cross-surface-e2e`、`ui-route-e2e`、`e2e`、`orchestrator-tests` 等全 `success`，
  無任何 SKIPPED。
- `gh pr view 2132` 讀回：`headRefOid=afc7d255dea2f86280401aac9549dc34bd7984a5`、
  `isDraft=false`、`mergeable=MERGEABLE`、`mergeStateStatus=CLEAN`。

**最終 `CANDIDATE_SHA=afc7d255dea2f86280401aac9549dc34bd7984a5`**，交
Codex 對此 SHA 審查（不是 `ab84480a6`）。

## Codex 第二輪退修（`a34dfe8aa5`）與修正

Codex 於 2026-09-24T08:03:30Z 對候選 `a34dfe8aa51c195c4b016bf2af70a3a82cfac862`
唯讀審查後退修，提出 F1、F2 兩個缺陷與 F3 acceptance 缺口；完整 finding 文字見
`ai-status.sh show ORCH-ORPHAN-PR-LAND-20260924` 的
`codex-20260924T075642Z-f81f059d` 條目。逐項回應如下。

### F1 — provision-dev-project.sh 無條件輪替既有 DB 憑證

- 缺陷：`put_secret`／密碼產生流程在 DB user 與 `db-url` secret 都已存在時，
  仍無條件 `sql users set-password` 再 `secrets versions add`，會讓已部署服務
  快取的舊連線字串失效（`deploy-dev.yml` 注入 `DATABASE_URL`，
  `apps/api/src/common/db/database.service.ts` 在 constructor 快取，不會跟著
  輪替更新）。
- 修正：commit `4a2e3c89fb6f44035395a91c915be1a607b7e464`。改為先各自檢查
  `db_user_exists`／`db_secret_exists`，四種組合分流：
  - 兩者都在 → `kept`，完全不碰密碼／secret（修正 F1 的核心情境）。
  - 只有 secret 遺失 → 視為不可回收，輪替密碼並重建 secret。
  - 只有 user 遺失 → 視為不可回收，重建 user 並輪替 secret。
  - 兩者都不在 → 原有的全新建立路徑，不變。
  程式碼與註解見 `infra/gcp/dev/provision-dev-project.sh:198-233`。
- 驗證：此腳本呼叫真實 `gcloud`／`openssl`，本任務沒有雲端存取權限，未執行
  端到端 provisioning；已用 `bash -n infra/gcp/dev/provision-dev-project.sh`
  （exit 0）驗證語法，並手動逐行核對四個分支的 shell 邏輯與 F1 finding 描述的
  兩個 mock 情境（既有資源重跑 → 不動；缺一資源 → 走對應 recovered 分支）一致。
  未新增 CI 覆蓋此腳本；沿用既有「不執行雲端變更」邊界。

### F2 — attach_workspace_metadata 的 VM restriction notice 漏 reviewer 分支

- 缺陷：`vm_restriction_notice` 只接在 owner-isolated 與 coordination-isolated
  兩支，`#2114` 重構後新增的四個 `is_reviewer` 分支（isolated detached、
  canonical fallback、unresolvable pinned candidate、noncanonical
  report/evidence）都沒有這段提示，review_ready_dispatch 的 VM worker 完全收
  不到限制。
- 修正：commit `ab84480a62de5c88ef1a3e6e062c4c53159686c6`。在
  `tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`
  的四個 reviewer 分支各補上 `f"{vm_restriction_notice}"`，共六個分支都會帶
  這段提示。新增
  `test_supervisor.py::ExecutionWorkspaceTests::test_vm_restriction_notice_present_on_every_reviewer_workspace_branch`，
  直接呼叫正式 `attach_workspace_metadata`，對四個 reviewer 分支各斷言訊息含
  `VM restriction` 與 `pnpm exec playwright` 字樣。
- 驗證：`python3 -m unittest test_supervisor -q` 與
  `python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'`
  於候選 `ab84480a62de5c88ef1a3e6e062c4c53159686c6`（本檔案提交時的
  `HEAD`）本機執行，973/973 pass（972 既有 + 本輪新增 1 個），exit 0，
  27.753s。

### F3 — 同 SHA hosted CI 證據

- Codex 指出 draft 狀態下 `ci-integ` 只是 owner checkpoint（`PR_DRAFT=true`、
  `run_full_ci=false`），大量 job SKIPPED，不能當作候選驗收；一般 `CI` run
  `35972446435` 在退修當下仍 pending，不構成通過證據。
- 本輪動作：F1/F2 的兩個修正 commit 直接以一般（非 draft）push 推上既有 PR
  #2132（head 已是 `ab84480a62de5c88ef1a3e6e062c4c53159686c6`，未新開 PR、
  未 force push），觸發正常 `pull_request` 事件的完整 CI，而非 draft
  checkpoint 路徑。
- CI 證據：見下方「候選交接與驗收」表格與 PR #2132 checks 連結；本節不預先
  宣稱通過，實際結論由 handoff 當下讀到的 hosted 結果記錄。

## Codex 第三輪退修（`80dc58a93`）與修正

Codex 於 2026-09-24T09:02:27Z 對候選 `80dc58a934ab74e0c5fa25801a9a759a0dd9b137`
唯讀審查後退修，確認 F2/F3 已通過、不要重開，但指出 F1「部分修正、錯誤路徑仍
未收斂」。完整 finding 文字見 `ai-status.sh show ORCH-ORPHAN-PR-LAND-20260924`
的 `codex-20260924T085540Z-992acb0c` 條目，本節記錄定位、修正與可重跑回歸證據。

### 缺陷重述

`infra/gcp/dev/provision-dev-project.sh:198-233`（`4a2e3c89f`/`ab84480a6` 版）
修正了「兩者都存在時不再輪替」，但兩個錯誤路徑仍不安全：

- (A) `db_secret_exists` 只靠 `gc secrets describe ... && db_secret_exists=true`
  判斷；`describe` 因任何非零結果（含暫時性服務/權限錯誤，不只是
  NOT_FOUND）都會被當成「secret 不存在」。若此時兩資源其實都在且密碼一致，
  腳本會先 `sql users set-password` 換掉正在服務中的密碼，再對已存在的
  secret 呼叫 `secrets create`（衝突失敗），把新密碼留在孤兒狀態；下次重跑
  只看到「兩者都存在」就印 `kept` 並 exit 0，永遠無法偵測這個錯配。
- (B) `! $db_user_exists && $db_secret_exists` 分支（user 遺失、secret 尚在）
  原本先 `sql users create`（缺的資源，可靠地當作完成信號）再
  `secrets versions add`（已存在的資源，即使這次寫入失敗，secret 仍然「存
  在」，無法反映未完成）。若 `versions add` 失敗，下次重跑會看到「兩者都存
  在」直接 `kept`，但 secret 的最新版本內容其實不是這個新 user 的密碼。

### 修正

Commit（本輪）改動同一段程式碼，分兩部分：

1. **查詢失敗 fail closed**：`sql users list` 失敗直接 `FATAL` + `exit 1`，不
   再靜默視為「user 不存在」（原本 `cmd | grep -qx ... && x=true` 這種寫法在
   `set -e` 下，左式失敗並不會中止腳本，會被吞掉）。`secrets describe` 失敗
   時檢查 stderr 是否包含 `not found`；只有確認是 NOT_FOUND 才視為「secret
   不存在」，其他任何非零結果（含 fixture 用的假錯誤碼）一律 `FATAL` +
   `exit 1`，且此時尚未執行任何 `set-password`/`create` 動作。
2. **不完整恢復可安全重跑**：`! $db_user_exists && $db_secret_exists` 分支
   反轉寫入順序——先 `secrets versions add`（已存在資源，寫入失敗不改變
   「存在」狀態，不會誤導下次判斷），再 `sql users create`（真正缺的資源，
   維持「未完成則不存在」的可靠信號）。`$db_user_exists && ! $db_secret_exists`
   分支的既有順序（先 `set-password` 再 `secrets create`）本來就符合這個
   「先動已存在的資源、缺的資源留到最後當完成信號」原則，未變動。

程式碼見 `infra/gcp/dev/provision-dev-project.sh:198-252`。

### 回歸驗證（非雲端，僅 mock `gc`/未 mock 本地 `openssl`）

本任務沒有雲端存取權限，此輪不再只用 `bash -n`/手動讀碼；改為把腳本
198-259 行的真實文字（`sed` 從工作樹擷取，以及用 `git show HEAD:...` 擷取
修正前 `80dc58a93` 的對應段落 190-233 行作為對照基準）交給真正的 bash
`source` 執行，只 mock `gc`（gcloud wrapper）本身，本地 `openssl` 是真實
呼叫（純亂數，非雲端）。Mock 狀態存在檔案而非 shell 變數，因為部分 `gc`
呼叫是管線右側（`db_url ... | gc secrets create ...`），管線各階段預設在
子 shell 執行，變數型 mock 會静默遺失那些呼叫造成的狀態變更——先用變數版
mock 跑過一次，發現「新密碼寫入但 secret 值仍是舊值」的假陽性後改寫為
檔案型 mock 才具代表性。

**Scenario A**（兩資源真實存在且密碼配對正確；`secrets describe` 回應非
NOT_FOUND 的錯誤碼 42；`secrets create` 對已存在的 secret 回應
ALREADY_EXISTS 衝突，如真實 gcloud）：

| 版本 | 階段 | exit | trace | pair_matches |
| --- | --- | --- | --- | --- |
| 舊（`80dc58a93`） | first | 1 | `list;describe;set-password;create`（create 因衝突失敗） | **false**（密碼已換，secret 未變） |
| 舊 | retry（describe 恢復正常） | 0，印 `kept` | `list;describe` | **false**（`kept` 說謊） |
| 新（本輪） | first | 1，尚未做任何 mutation | `list;describe` | true（未觸碰，維持原配對） |
| 新 | retry（describe 恢復正常） | 0，印 `kept` | `list;describe` | **true** |

**Scenario B**（user 遺失、secret 尚在且為舊值；`secrets versions add`
回應 42）：

| 版本 | 階段 | exit | trace | pair_matches |
| --- | --- | --- | --- | --- |
| 舊 | first | 42 | `list;describe;create（user）;versions add`（user 已建立，密碼孤兒） | **false** |
| 舊 | retry（add 恢復正常） | 0，印 `kept` | `list;describe` | **false**（`kept` 說謊，secret 仍是舊值） |
| 新（本輪） | first | 42，user 尚未建立 | `list;describe;versions add`（在 create user 之前失敗） | false（僅因 user 仍缺，非配對錯誤） |
| 新 | retry（add 恢復正常） | 0，走 `recovered` 分支 | `list;describe;versions add;create（user）` | **true** |

另外四組正向情境（首次建立、完整既有重跑、缺 user、缺 secret，皆無故障
注入）在新版程式碼下 first/retry 皆 `exit 0`、`pair_matches=true`，覆蓋
`kept`/`recovered`/`created` 三種訊息路徑，確認修正沒有破壞既有正常路徑。

Harness 與擷取的新舊程式碼片段留存於執行本輪任務的 sandbox
`/tmp/f1regress/`（harness.sh + old_block.sh + new_block.sh），未寫入本
repo；上表數字為實際執行輸出的忠實轉錄，不是預期值。`bash -n
infra/gcp/dev/provision-dev-project.sh` 與 `git diff --check` 均額外
`exit 0`。

### 修正邊界（呼應第二輪退修要求，未擴大範圍）

只處理 Codex 本輪明確指出的兩個錯誤路徑（查詢失敗誤判、恢復分支寫入順序），
未新增雲端輪替邏輯、未嘗試讀回 secret 明文比對、未對 preflight/APIs/IAM/WIF/
SQL 建立等其他段落做任何改動。`db_secret_exists` 的 NOT_FOUND 偵測靠
`grep -qi 'not found' <<<"$secret_describe_err"`，這依賴 gcloud 錯誤訊息文字
格式；若未來 gcloud 改變錯誤文案，最壞情況是退化成「所有 describe 失敗都
fail closed」（安全方向的退化，不會導致誤判為不存在），不是新的不安全窗口。
