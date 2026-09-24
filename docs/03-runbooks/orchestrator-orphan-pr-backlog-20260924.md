# ORCH-ORPHAN-PR-STALE-TRIAGE-20260924

Owner: Codex · Reviewer: Claude2 · 2026-09-24

## 比對基準與交付邊界

- `dev`: `c2d94aaa42b7042cd0d44d2114fea2096c18e617`。
- [PR #2058](https://github.com/ajoe734/drts-fleet-platform/pull/2058):
  `150d9d32e6feae69b7d85d94948dddf59175a16c`，7 檔 +509/-30；
  merge-base `3dc74999338b94c22deb9d41899e04d641f2ef4c`，獨有 1 / 落後 30 commits。
- [PR #1523](https://github.com/ajoe734/drts-fleet-platform/pull/1523):
  `90182fa3b2700663a539d78ab3779191c5ab3ba8`，1 檔 +4/-2；
  merge-base `d9cacb983b8d9995220e847f422b5ffb5e78631d`，獨有 1 / 落後 346 commits。
- GitHub 兩個 PR 均 OPEN / CONFLICTING，沒有 review/comment（本輪讀取時）。
- 在 Supervisor 指定的 isolated task worktree 編輯；不改 canonical checkout、
  runtime bundle、live config 或執行中的 supervisor，不啟停 tick。
  此 anchor 只是分析 checkpoint，尚未宣告候選或驗證通過。

## #2058 逐項分流（初步定位，驗證待補）

| 原始差異 | 現行原始碼／後續修正 | 初步結論 |
| --- | --- | --- |
| `permission_broker.py`: worker cwd、hook payload、兩個 cwd 消耗端 | 現行 `workspace_roots` 已知道 canonical/worktree，但 `_command_tokens_and_cwd`、`_moves_head_in_the_canonical_checkout` 仍從 canonical 起算 | 尚未被取代；準備最小重現，限縮移植 cwd 與普通 merge |
| `permission_broker.py`: merge allow-list | 現行沒有 `git merge ... origin/dev`／`merge --abort` 規則；§11 要求已發布 branch 使用普通 merge | 與現行策略一致；需同時驗證 canonical head-move、reset 與 force-push 邊界 |
| `permission_broker.py`: status-sync substitution／export parser | `classify_command` 的 status-sync 判定早於一般 deny 與 canonical guard | 必須驗證 substitution 內複合命令，不能直接採用「唯讀 git query」的舊摘要 |
| `supervisor_runtime.py`: auth pause 預設可接手 | `proactive_claim_plan_for_idle_agent` 仍要求保留 explicit owner；有 chair reassignment guard、identity pause、fresh recovery probe | 改變接手政策，不能把 auth pause 直接等同授權改 owner；待記錄精確邊界 |
| `supervisor_runtime.py` + `dispatch_runtime.py`: handoff grace 120 秒 | 舊條件是所有 assignment mismatch，而非限定已確認的 candidate handoff | 需核對 owner 被改派／task 消失等拒絕情境；不能直接移植 blanket grace |
| `config.example.json`: 刪 gemini2 `model_preference` | `gemini.model` 仍固定相同舊值；`adapters/gemini.py` 會 fallback；Antigravity rotation 另有權威來源 | 舊刪除無法保證 CLI default，不能宣告修正了模型選擇 |
| 三個 test 檔 | 舊 tests 主要覆蓋正向 cwd/handoff/auth/grace | 只保留實際移植行為的測試；新增必要拒絕案例，不搬入未採用功能的 tests |

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
- 本輪將以現行 dev 為基礎挑選差異；整檔覆蓋舊 runtime 會丟失後續程式碼。
  最終需跑上述後續修正的現有回歸並核對 diff。

## #1523 逐項分流

| 原始差異 | 現行證據 | 結論 |
| --- | --- | --- |
| Q-001 改成 Phase 1 一通電話最多一單 | `ai-status.sh show SR-CALL-MULTIORDER-20260913`：2026-09-13 使用者撤回、多單非 operational backlog；`docs/04-uat/system-remediation-20260906/closed-loop-evidence.md` 亦引用撤回 | 決策已生效，但 `PHASE1_OPEN_QUESTIONS.md` 的 Q-001 仍要求多單，需只同步該列 |
| 新增「完全沒有 server-side enforcement」backlog | `infra/migrations/V0082__call_session_order_cardinality.sql` 已有重複 precheck 與 `ops_orders_call_id_unique` partial unique index；現行 backlog 已記 closed 2026-08-23 | 舊敘述被取代，不移植、不重新開啟多單工作 |
| 表格 separator 修復 | 現行 Resolved Items 是三欄標頭；Q-001 舊列卻有額外欄位 | 依現行表格格式同步 Q-001，不整份覆蓋 346 commits 前的文件 |

資料庫 migration 存在是靜態證據，不代表本輪已驗證部署、套用情況或 API
在每種 repository mode 的錯誤映射。此次只分流舊 PR／同步既有決策。

## 驗收與待補證據

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與限制 |
| --- | --- | --- | --- | --- |
| 逐條比對與現行dev的重疊並記錄結論 | 上述兩張表 | 靜態定位中 | `gh pr view/diff`; `git merge-base`; `git rev-list --left-right --count`，exit 0，以上 SHA | 最終挑選與反例待補 |
| 只移植未被取代且經驗證的改動 | cwd / merge、Q-001 列 | 待實作 | 待補最小重現、scoped suite、整體回歸 | 未採用改動不能稱為已修 |
| 同候選SHA CI通過 | 最終 PR head | pending | 最终候選 handoff 後由 GitHub bus 收錄 | 舊 PR CI 不可代替 |
| 獨立reviewer審查同一候選 | Claude2 | pending | 最終 `CANDIDATE_SHA` / branch / PR handoff | Owner 不 approve、不 done |
