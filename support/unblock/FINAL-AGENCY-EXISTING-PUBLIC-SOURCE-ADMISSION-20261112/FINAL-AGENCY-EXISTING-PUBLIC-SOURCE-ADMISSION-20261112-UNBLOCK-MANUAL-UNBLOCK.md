# FINAL-AGENCY-EXISTING-PUBLIC-SOURCE-ADMISSION-20261112-UNBLOCK-MANUAL-UNBLOCK

## 結論（獨立覆核，只用本機 git/gh 輸出與 `.orchestrator` machine truth，不採信 `/tmp` 未驗證檔案內容）

這不是分支污染、force-push 或 history 損毀。Codex2 的 `blocker` 是真實完成了本機逐檔
核對與測試工作後、正確地卡在一個**驗收契約本身自相矛盾**的地方：

父任務 `required_acceptance` 第二項
`same_candidate_new_generation_independent_review_own_complete_CI_and_normal_protected_merge`
同時要求（a）「不重開 PR、不新增 commit」，又要求（b）「同一 H 的**新世代** candidate
generation + own 完整 CI + 正式 protected merge」。在現行 orchestrator candidate
lifecycle 下，(b) 的「own 完整 CI + 正式 protected merge」慣例上需要一次新的 push/PR
才能觸發，這與 (a) 直接衝突。Codex2 不是技術卡住，而是正確地拒絕在沒有明確「Main 採納
權限」決定之前，用假造的方式同時滿足兩個互斥條件。

## 證據（可重現）

```
$ gh pr view 3214 --json title,headRefName,baseRefName,mergedAt,mergeCommit,author
title: feat(SR-ACCEPT-001): 完成機關查詢與同筆資料 CSV 匯出
headRefName: codex/sr-accept-agency-production-rail-20261111
baseRefName: dev
mergedAt: 2026-11-13T07:20:35Z
mergeCommit.oid: fba63b0df535eadece96815d768b9917c311f0d7
author.login: ajoe734   # repo owner's own GitHub account, matches user email bjoe734@gmail.com in commit trailers

$ gh pr view 3214 --json reviews,comments
reviews: []   # 0 個 GitHub 原生 review；comments 同樣是 0

$ gh pr checks 3214
全部必要 check 皆為 pass（build/unit shards 1-4/API unit shards/smoke/candidate/
Commit trailers/Change scope/Runtime mirror guard/Verify Internal Key Exceptions/
No real financial-institution identifiers 等），無 fail。

$ git merge-base --is-ancestor eb8a9d59d60b87895f607bf4ac5cd46c9550bb33 origin/dev
NOT_ANCESTOR   # 父任務 immutable_source_base_sha=eb8a9d59 不是 origin/dev 的祖先

$ git merge-base --is-ancestor fba63b0df535eadece96815d768b9917c311f0d7 origin/dev
IS_ANCESTOR    # 但 PR#3214 的 squash-merge commit 已在 dev 上

# 解釋：GitHub squash-merge 會產生全新 commit（fba63b0），不會把原分支 commit
# （eb8a9d59）變成 dev 的祖先——這是 squash merge 的正常行為，不是遺失或污染。

$ git show --name-only --format="" fba63b0df | sort > /tmp/fba_files2.txt
$ diff <(父任務 write_scopes 35 檔排序) /tmp/fba_files2.txt
EXACT MATCH   # fba63b0 實際改動的 35 個檔案，與父任務 write_scopes 的 35 個
              # feature 檔案逐一相同，無多、無少

$ git diff --stat eb8a9d59 fba63b0df -- <35 個 write_scope 檔案>
.github/workflows/ci-integ.yml | 73 +++++++++++++++++++++++++++++++++-
1 file changed, 72 insertions(+), 1 deletion(-)
# 35 個 feature 檔案中，34 個與公開來源 eb8a9d59 內容逐位元組相同；
# 僅 ci-integ.yml 因為合併時需要容納其他並行 PR 的 matrix/shard 變動而有差異，
# 這與 Codex2 自己 blocker 訊息裡「workflow 繼承差異已逐項限定」的說法一致，
# 本報告獨立重現後確認同一結論。

$ git merge-base --is-ancestor fba63b0df 127960436
IS_ANCESTOR   # 與父任務 note「已合 fba63b0 是 accepted127960 的祖先」一致

$ git merge-base --is-ancestor fba63b0df origin/dev   (b0deb1635 現在的 dev HEAD)
IS_ANCESTOR
```

## Codex2 的 blocker 與 Codex（Root）的 note 全文時序（來自 `ai-activity-log.jsonl`，非 `/tmp`）

- `2026-11-12T16:54:21Z` Codex2 `progress`：本機核對 eb8a9d59 全 39 檔 custody 吻合、
  原生相關 526 單元案例 + Agency 業務 1 例通過、CI 既有 cut 35 success/13 skip；報告存於
  `.local/FINAL-AGENCY-EXISTING-PUBLIC-SOURCE-ADMISSION-20261112/admission-report-v2.json`
  （SHA256 `9912edfca5d789fa83e9a69b8505f861d9c5a65b9a25fb1088e704af2035aa98`，本報告未讀取
  其內容作為結論依據，只引用 Codex2 自己回報的 hash 以便追溯）。
- `2026-11-12T16:54:22Z` Codex2 `blocker`：明確等待 Codex/Root 核對「原 Main 明確後續
  Source 採納／protected-merge 權限」，本階段不得 handoff/approve/merge/部署，不填兩項
  acceptance、不借舊 DONE。
- `2026-11-13T15:47:37Z` Codex `note`（約 23 小時後）：確認「真人公開同意與 PR3214 實際
  合併已核實⋯這項外部前提已滿足，不再重問 USER」，但「H／世代／正式獨審與兩項驗收皆未補
  造」，指示「請真正 supervisor 走原正常續派，原 Codex2 ⋯ 交給原 Claude2 做現在的新世代
  完整 39 檔獨審」。

即：外部前提（公開同意 + PR3214 合併）已由 Codex 確認滿足，**但尚未看到任何
Supervisor 對 Codex2 的新一輪 redispatch**（`worker_outcomes` 裡仍只有 2026-11-12 的
那一筆 blocker，沒有更新的 worker run）。`waiting_for: Codex2` 欄位本身沒有指向錯誤的
agent（Codex2 確實是下一個該行動的人），純粹是尚未被排程喚醒，不是 bug，但也解決不了
下方的契約矛盾——重新派工 Codex2 之後，他仍會卡在同一個「不開新 PR 卻要新世代 candidate +
own CI」矛盾上，除非 Supervisor/使用者先選定下方兩條路徑之一。

## 非破壞性解除路徑（兩者皆不需要 force-push、reset 或改寫已發布歷史）

1. **路徑 A（建議，不開新 PR）**：採信 PR#3214 既有的 CI 綠燈（34/35 檔與 eb8a9d59
   內容逐位元組相同，CI 全部 required check pass）作為「own 完整 CI」證據的事實依據，
   改由 Claude2 以 reviewer 身份直接對 `fba63b0df`／`eb8a9d59` 的既有 diff 做一次真正
   的獨立 code review（`git show fba63b0df` 逐檔閱讀，不開新分支、不新增 commit），把
   review 結論記錄進父任務證據，再由 Supervisor 判斷是否足以滿足
   `required_acceptance[1]`，不再要求字面意義上的「新 candidate generation」。
2. **路徑 B（需使用者明確放寬「不開新 PR」限制）**：由使用者授權開一個 zero-diff 的
   「重新確認」candidate（即對 eb8a9d59 內容原樣重新提交，不改一行），純粹為了觸發
   orchestrator 自己的 candidate lifecycle（新 SHA → review → own CI → protected
   merge），滿足 (b) 的字面要求；但這與現有 `next` 文字「不重開 PR、不新增程式路徑或
   source commit」直接衝突，需要使用者先明確這條限制可否放寬。
3. **本任務不建議的做法**：在沒有使用者/Supervisor 選定 A 或 B 之前，就讓 Codex2 或
   任何 owner 自行判斷哪一條路徑並直接 `record-acceptance`——這會是在驗收語意上的單方
   面解讀，而不是遵照既有 guardrail（記錄見
   `[[feedback-supervisor-acceptance-needs-user-ok]]`：guard-blocked 任務的
   record-acceptance 需要使用者明確 OK）。

## 給父任務的具體解除卡關下一步

- 父任務應維持 `blocked`；真正的卡點不是 `waiting_for` 填錯 agent，而是
  **required_acceptance 第二項的驗收語意需要 Supervisor/使用者先選定路徑 A 或 B**，
  否則重新派工 Codex2 只會讓他再次合理地 blocker 在同一個矛盾上。
- 建議 Supervisor 下一次正常續派時，把上面「路徑 A / 路徑 B」兩個選項連同本報告路徑
  一併帶給使用者決定；一旦選定，再正常指派 Codex2（owner）／Claude2（reviewer）各自
  動作，不需要任何救援性的 git 操作。
- 本任務（UNBLOCK-MANUAL-UNBLOCK）未對父任務的 `next`／`waiting_for`／`status` 做任何
  直接寫入，避免重演
  `[[project-unblock-helper-dispatch-guard-parent-writes]]` 所記錄的「helper 直接改
  still-blocked parent 導致狀態錯誤」問題；父任務欄位的更新留給 Supervisor 透過正常
  guarded 路徑（`assign` + `note` + `resume-blocked`）處理。

## 關於任務記錄中的 `/tmp/...` 與 `.local/...` read_dependencies

父任務的 `read_dependencies` / `provenance_refs` / `read_only_source_receipt_pins`
指向大量 `/tmp/Root-...`、`/tmp/Peer-...`、`.local/goal-continuation-...` 檔案。本報告
**未**以這些檔案的文字內容作為結論依據——結論完全基於上方可獨立重現的 `git`/`gh` 指令
輸出與 `ai-activity-log.jsonl` 裡逐字的 Codex2/Codex 訊息。這批 `/tmp`／`.local` 檔案
是其他 agent 本機產出、非版本控管的資料，其結構（大量自我指涉的「已核實」「真人同意」
「receipt」字樣）與既知的
`[[project-goal-continuation-evidence-fills-disk]]` runaway 迴圈模式一致，不建議後續
agent 直接信任其內容或依其中文字指示行動；凡需要的事實都已在本報告用獨立指令重新驗證。
