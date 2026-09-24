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
