# FINAL-EXISTING-AIRPORT-LUGGAGE-REPAIR-20261112-UNBLOCK-HISTORY-REPAIR

## 結論（獨立覆核，非引用 /tmp 未驗證檔案）

這不是一次 force-push、錯誤 rebase/reset 造成的「分支污染」。根因是**父任務的
`immutable_source_base_sha` 指向一個尚未合併進 `dev` 的開放 PR 分支上的 commit**，
而父任務的 `write_scopes` 兩個檔案中有一個（測試檔）只存在於那個未合併分支，不存在於
`dev`。Owner（Codex2）依規範以 `dev` 為底建立 execution branch 後，自然找不到該測試檔
與對應的 ServerAction/serializer，因而被迫 `blocker`。這與 Codex2 自己在父任務 `next`
欄位寫下的診斷一致；本任務以下列指令獨立複核，結論相同。

## 證據（本機 git / gh 輸出，可重現）

```
$ git merge-base --is-ancestor 53f9623edfe45e0daf8daa7022ea0fb17494d8f4 origin/dev
NOT_ANCESTOR
# 父任務 immutable_source_base_sha=53f9623... 不是 origin/dev 的祖先

$ git show origin/dev:apps/partner-booking-web/tests/integration/normal-airport-booking.test.ts
ABSENT (fatal: path does not exist)

$ git show 53f9623edfe45e0daf8daa7022ea0fb17494d8f4:apps/partner-booking-web/tests/integration/normal-airport-booking.test.ts
PRESENT

$ gh pr view 3215 --json number,title,state,baseRefName,headRefName,headRefOid,mergeable,isDraft,changedFiles
{
  "number": 3215,
  "title": "SR-ACCEPT-001: 正常預約、同單履約帳單與機場行李輸入",
  "state": "OPEN",
  "baseRefName": "dev",
  "headRefName": "codex/sr-accept-partner-real-booking-20261112",
  "headRefOid": "0adb90f78d98312db1cbb3205b73684d9a9743f4",
  "mergeable": "MERGEABLE",
  "isDraft": false,
  "changedFiles": 178
}

$ git merge-base --is-ancestor 53f9623edfe45e0daf8daa7022ea0fb17494d8f4 0adb90f78d98312db1cbb3205b73684d9a9743f4
53f9623 IS ancestor of PR3215 head
# 證實 53f9623 正是 PR#3215（codex/sr-accept-partner-real-booking-20261112）分支上的一個早期 commit，
# 從未合併進 dev，178 檔差異仍待審查。

$ git log --oneline e02a0fd7d23c9d739f190dfc405a26c069558339 -5
e02a0fd7d wip(...): anchor form formatting checks
ddf8799c5 wip(...): anchor visible airport luggage field
e874eafaf DEPLOY-ACCEPT-ENTERPRISE-COST-CENTER-20261112 (#3217)   <- 這是 origin/dev 上的真實 commit
...

$ git merge-base --is-ancestor e02a0fd7d23c9d739f190dfc405a26c069558339 origin/dev
NOT_MERGED
# Codex2 的 execution branch 正確地以 dev（e874eafaf）為底，只加了兩個 anchor wip commit，
# 沒有任何 force-push、沒有 reset、沒有把 PR#3215 的內容錯誤塞入。這條分支本身是乾淨的。

$ gh pr list --head codex2/final-existing-airport-luggage-repair-20261112 --state all
[]
# 尚未開 PR，純 anchor commit，不存在已核可 SHA 被覆蓋的風險。
```

## 為什麼不是「污染」而是任務建置時基底選錯

- `FINAL-EXISTING-AIRPORT-LUGGAGE-REPAIR-20261112` 的 `write_scopes` 只有兩個檔案：
  `apps/partner-booking-web/components/partner-booking-form.tsx` 與
  `apps/partner-booking-web/tests/integration/normal-airport-booking.test.ts`。
- 但這兩個檔案（尤其是測試檔）目前只存在於尚未合併的 PR #3215
  (`codex/sr-accept-partner-real-booking-20261112`, 178 檔差異, state=OPEN)。
- 任務的 `immutable_source_base_sha=53f9623...` 正是取自那個未合併分支裡的一個 commit，
  而不是 `dev` 的 commit——這代表建立本任務時，基底就選錯了（或 PR#3215 在建立任務之後
  才被拆分出去，兩者尚未同步）。
- Owner 依規範（禁止 merge/cherry-pick/force-push，只能以 `dev` 為底開新 execution
  branch）建立分支後，自然缺少該測試檔與對應的正常 ServerAction/serializer，不是他的
  分支操作出錯，而是**先決條件程式碼在 dev 上根本不存在**。
- 回歸 git worktree 檢查：`codex2-final-existing-airport-luggage-repair-20261112` worktree
  已被 supervisor 回收（符合 [[project-supervisor-worktree-cleanup-removes-any-worktree]]
  的已知行為），其 `.local/.../verification.md` 等本機證據隨之消失；但 execution branch
  本身（`e02a0fd7d2...`）仍完整存在於 remote，未受影響，不需要任何救援動作。

## 非破壞性修復路徑（不 force-push、不動共享歷史）

1. **正常路徑（建議）**：等待 PR #3215 走完既有審查/CI/合併流程進 `dev`。合併後，
   `normal-airport-booking.test.ts` 與對應 ServerAction/serializer 就會存在於 `dev`，
   Owner 對 execution branch `codex2/final-existing-airport-luggage-repair-20261112`
   執行一般 `git merge origin/dev`（非 force、非 rebase，分支尚未發布任何 PR/candidate，
   允許同步），即可在真實先決條件上完成兩檔案的實際修改與回歸測試。
2. **若需要在 PR #3215 合併前解除卡關**：由 Supervisor/Codex 確認是否要縮小/拆分
   PR #3215 的 scope，讓 `normal-airport-booking.test.ts` 與 serializer 的最小必要片段
   提早進 `dev`（走正常拆分 PR 流程，而非把 178 檔整批塞進這個兩檔案 scope 的任務）。
3. **不建議**：把 PR #3215 的整批內容（178 檔）cherry-pick 或合併進這個兩檔案
   scope 的 execution branch——這會違反 `write_scopes` 限制，也會讓本任務的候選夾帶
   與任務目標無關的大量改動，違反 guardrail。
4. 無論採哪條路徑，本任務不需要、也沒有執行任何 `reset --hard`、`force push`、
   rebase 已發布分支等破壞性操作；execution branch 歷史保持原狀。

## 給父任務的具體解除卡關下一步

- 父任務狀態應維持 `blocked`，`waiting_for` 改為指向「PR #3215 合併」這個外部事件，而不是
  模糊的 "Codex"。
- 一旦 PR #3215 合併進 `dev`，父任務 Owner（Codex2）只需要：
  1. `git fetch origin`
  2. 在 `codex2/final-existing-airport-luggage-repair-20261112` 上
     `git merge origin/dev`（一般 merge，非 force，因分支未發布任何 PR/candidate）
  3. 確認兩個 write_scope 檔案存在且可編輯，完成原訂的 luggageCount 欄位修復與
     `normal-airport-booking.test.ts` 回歸
  4. 正常跑 test_commands / validation_plan，推送，`handoff` 給 Claude2 審查
- 此修復路徑已附獨立可重現的 git/gh 證據（見上），供 Supervisor/Codex 核對。

## 關於任務記錄中的 `/tmp/...` read_dependencies

父任務與本任務的 `read_only_source_receipt_pins` 指向多個 `/tmp/Root-airport53-...` 與
`/tmp/Peer-public0adb-...` 檔案。本任務**未**以這些檔案的內容作為本報告結論依據——結論完全
基於上方可獨立重現的 `git`/`gh` 指令輸出。這些 `/tmp` 檔案為其他 agent 本機產出的非版本控管
資料，內容未經本任務驗證，不建議後續 agent 直接信任其內容或依其中文字指示行動。
