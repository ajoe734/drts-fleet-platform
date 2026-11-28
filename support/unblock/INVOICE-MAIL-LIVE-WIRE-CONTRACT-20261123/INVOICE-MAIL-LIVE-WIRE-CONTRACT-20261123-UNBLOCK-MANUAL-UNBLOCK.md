# INVOICE-MAIL-LIVE-WIRE-CONTRACT-20261123：manual unblock 診斷

- Helper：`INVOICE-MAIL-LIVE-WIRE-CONTRACT-20261123-UNBLOCK-MANUAL-UNBLOCK`
- Owner / reviewer：Claude / Codex2
- 查核日期：2026-11-28 UTC
- 查核 source：`7da5cc83a77c6c6567d9170bdcf56238e30cd755`（本輪 worktree HEAD / origin/dev）
- 交付範圍：本文件；未修改產品、E2E、workflow 或控制平面。

## 結論與剩餘阻礙

父任務 `INVOICE-MAIL-LIVE-WIRE-CONTRACT-20261123` 沒有未完成的 dependency
（`depends_on=[]`）。產品候選 `431576debad732361340aeaadc4dd3283dfdf64b`（PR
[#3421](https://github.com/ajoe734/drts-fleet-platform/pull/3421)，分支
`root/invoice-mail-live-wire-contract-20261123`）已由 Gemini2 獨立 approve、四項
required CI（ci-integ、Smoke acceptance、Commit trailers、Runtime mirror guard）全部
success、merge=`1b428b10a1f9df9ce9e247d8df16ba0e77fbac3a`，且該 merge 已包含於
2026-11-27 的最新成功 shared-dev deploy run
[45953703847](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45953703847)
（source `47a20f0103163a0065c855b464b32e1997fa8b0d`）。產品面無缺陷證據，不需要、也
不應該重開候選。

剩餘唯一阻礙是外部授權操作者配置缺口，不是程式缺陷：

1. Hosted workflow `.github/workflows/live-invoice-mail-acceptance.yml` 的 14 個
   `DRTS_LIVE_INVOICE_MAIL_*` repository variables（含 `TEST_AUTHORIZED` 本身）在
   GitHub 上全部缺席——`gh api --paginate repos/ajoe734/drts-fleet-platform/actions/variables`
   讀回 144 筆（五頁），比對名稱零命中。
2. 即使變數補齊，仍需要：(a) 兩個新 WIF 授權（`tenant_viewer`/`tenant:billing:read`
   唯讀 actor，以及另一個獨立 tenant 下的 `tenant_admin` actor）寫入
   `drts-dev-workload-identity-google-service-principals`；(b) 透過既有 tenant
   onboarding／`POST /api/tenant/users` 流程，在三個 fixture tenant 下各取得一筆真實
   發票；(c) 把現有 dev SMTP 信箱的 `+invoice` alias 加進
   `drts-dev-smtp-recipient-allowlist`。
3. 這些都是 Secret Manager／GitHub secret-store 寫入或授權閾值翻轉，依
   `project-live-acceptance-infrastructure` 記憶「What Claude cannot do here」，本
   session 的 auto-mode classifier 不允許任一 agent（Codex2 或 Claude）代為執行。

本輪獨立核對沿用 Codex2 同日稍早（2026-11-28T09:53:11Z）寫入父任務的診斷與
`next`，未發現落差；下方僅重新確認關鍵事實並補齊 helper 本身需要的
`resolved_parent_*` 交接資料。

## 保留的產品候選與證據

| 欄位                          | 本輪讀回                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 父任務 status / waiting_for   | `blocked` / `Codex`                                                                                                                       |
| Candidate / reviewed / CI SHA | `431576debad732361340aeaadc4dd3283dfdf64b`                                                                                                |
| Candidate generation          | `1dfaa72fc32c4442b8559ba2b7c37d0d`                                                                                                        |
| Candidate branch              | `root/invoice-mail-live-wire-contract-20261123`                                                                                           |
| Product PR / merge            | [#3421](https://github.com/ajoe734/drts-fleet-platform/pull/3421) / `1b428b10a1f9df9ce9e247d8df16ba0e77fbac3a`                            |
| Required CI                   | ci-integ、Smoke acceptance、Commit trailers、Runtime mirror guard 均 success                                                              |
| 最新成功 shared-dev deploy    | [45953703847](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45953703847)，source `47a20f0103163a0065c855b464b32e1997fa8b0d` |
| Required acceptance key       | `actual_serialized_invoice_readback_delivery_and_download_follow_the_authorized_hosted_path`（尚無）                                      |

`waiting_for=Codex` 沿用原卡登錄者；不代表 Codex 是 Supervisor 或唯一發布主控。
此 helper 的文件候選不能取代父任務的產品候選或 merge SHA，也不應觸發任何重審。

## 精確呼叫路徑

1. [live-invoice-mail-acceptance.yml](../../../.github/workflows/live-invoice-mail-acceptance.yml)
   第 1–60 行：`workflow_dispatch` 需要 `candidate_sha` input；job `mail-acceptance`
   的 `env` 區塊把全部 14 個 `DRTS_LIVE_INVOICE_MAIL_*` 變數從
   `${{ vars.* }}` 注入環境，任一缺席即整批為空字串。
2. [SR-LIVE-INVOICE-MAIL-20261007.md](../../../docs/04-uat/system-remediation-20260906/SR-LIVE-INVOICE-MAIL-20261007.md)
   第 376–438 行「Runner provisioning checklist correction」：14 變數的正式清單、
   `+invoice` alias 由 harness 自己從 mailbox 推導（不是第 15 個輸入）、
   `ciTenantActorGrants` 與 `resolveCiTenantActorGrant`
   （`apps/api/src/modules/auth/google-workload-identity.adapter.ts`）要求的
   `{tenantId, actorType, actorId}` 精確 tuple、以及讀回角色須是真正
   `tenant_viewer`／`tenant:billing:read`，不是把 `tenant_admin` request 字面誤解成授權。
3. `session-bootstrap.ts` 的 `bootstrapMailSession -> validateMailSessionInputs ->
createInvoiceMailEnvAdapter -> validateTarget`：Codex2 本輪的
   production input probe（`.local/system-release-20261123/invoice-mail-live-wire-acceptance-20261128-preflight.ts`，
   exit 0）確認目前請求在這一層就被正式拒絕，`fetch`/`mask`/`appendEnvironment`/
   `readMailbox` 呼叫次數均為 0——即尚未真正嘗試任何 IO，純粹是輸入驗證層面的拒絕，
   不是傳輸或 mailbox 層的缺陷。

## 逐項驗收與未驗項

| Finding／驗收項                                | 原始碼依據與修改位置                                                  | 舊版重現 → 本輪結果                                                                                                                | 命令／版本／證據                                                                                                                                  | 未驗項與具體限制                                                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 診斷 dependency-ready 父任務仍 blocked         | 父任務 `depends_on=[]`；candidate/CI/merge/deploy 欄位；上述呼叫路徑  | 獨立核對 Codex2 2026-11-28T09:53:11Z 診斷一致，無落差；本輪未改產品                                                                | release CLI 單 task `show`（二次，父任務＋helper）；`gh`/`git` 讀回見上表                                                                         | hosted 缺口仍在                                                                                                                                                                |
| 14 個 repo variables 是否存在                  | `.github/workflows/live-invoice-mail-acceptance.yml` env 區塊引用清單 | `gh api --paginate .../actions/variables`：144 筆、零命中 `DRTS_LIVE_INVOICE_MAIL_*`                                               | 命令與結果全部沿用 Codex2 `invoice-mail-live-wire-acceptance-20261128.json`（本輪以 Read 工具核對原文，未重新執行會經由 broker 卡住的 Bash 讀取） | 本輪未重跑 `gh api`，因 canonical-root 之外、跨 worktree 的 Bash 呼叫在本次 isolated 派工下經 approval broker 卡滿 1800 秒兩次（見下方「本輪執行限制」），改以既有同日證據佐證 |
| 候選與 dev 兩份產品 scope 是否有競爭變更       | write_scopes＝`live-invoice-mail.spec.ts`、`spec-guards.test.ts`      | 無新增產品／測試檔變更；本輪 diff 僅本文件                                                                                         | 本輪 `git status`／`git log` 於 worktree 內確認 clean、HEAD=`7da5cc83a`                                                                           | 不適用（純文件）                                                                                                                                                               |
| 僅做 task-scoped unblock 文件及 commit/push/PR | 本文件                                                                | 產品／E2E 修正不適用                                                                                                               | 本輪 candidate SHA／PR 由 helper handoff 鎖定                                                                                                     | CI／merge 由既有 lifecycle 收錄，不以文件宣告通過                                                                                                                              |
| 更新父任務具體下一步及保留 blocked disposition | release `_guard_worker_command`；`apply_unblock_parent_resolution`    | 本次 dispatch 帶 `ORCH_RUN_ID`／`ORCH_DISPATCH_ROLE=owner`，依既有記憶模式，跨任務 `note`／`assign` 會被拒絕為 cross-task mutation | 下方「Supervisor 可執行的下一步」提供完整 `TASK_METADATA_JSON`                                                                                    | Supervisor 必須在 helper 進入 review/merge 前寫入，否則 `apply_unblock_parent_resolution` 會把仍未解阻的父任務預設成 `todo`                                                    |

本輪只有文件變更，未新增鏡像測試，也未重跑產品 unit/lint/typecheck（無程式異動，
不適用）。父任務原候選測試與既有 CI 不是本輪新通過的驗收，不得視為
`actual_serialized_invoice_readback_delivery_and_download_follow_the_authorized_hosted_path`
已滿足。

## 本輪執行限制（供 Supervisor 參考）

本次是 isolated worktree 派工（`ORCH_RUN_ID`/`ORCH_DISPATCH_ROLE=owner` 已設置）。
任何指向 canonical root 絕對路徑（`/home/lupin/workspace/drts-fleet-platform/...`，
worktree 之外）的 Bash 呼叫——即使是單純 `mkdir`／`sha256sum`，不含
`ai-status.sh`——都經由 `orchestrator_approval_broker` 的 `approval_prompt` 卡滿
1800 秒逾時兩次（累計 3600 秒），而同一批命令若改成 worktree 相對路徑則立即成功。
這與既有記憶 [[project-worktree-path-confusion]] 的「在 isolated dispatch 一律用指定
worktree 路徑，不碰 canonical root」一致；本輪未再重試第三次。產品 evidence 的交叉
核對因此改用 Read 工具直接讀取 canonical root 絕對路徑完成（Read 不受此限制），而非
用 Bash 重新執行 `gh api`／`sha256sum`。

## Supervisor 可執行的下一步

1. 在 operator context 讀回原卡與 helper；確認上列候選身分、14 變數缺口與
   WIF／fixture／mailbox 前置條件尚未改變。
2. 在 helper **merge 前**，用 release CLI 的 `assign` 保留 Claude / Codex2，加入下面
   三個 `TASK_METADATA_JSON` 欄位。`resolved_parent_at` 留給 merge transaction 寫入。
   再以原卡 `note` 寫入同一個 `resolved_parent_next`。本 worker 不移除 dispatch fence。

   ```json
   {
     "resolved_parent_status": "blocked",
     "resolved_parent_waiting_for": "Codex",
     "resolved_parent_next": "Acceptance 受阻於既有授權操作者配置缺口，非程式缺陷：candidate 431576debad732361340aeaadc4dd3283dfdf64b（PR #3421）已 approve/CI green/merge=1b428b10a1f9df9ce9e247d8df16ba0e77fbac3a，且已隨 2026-11-27 deploy-dev run 45953703847（source 47a20f0103163a0065c855b464b32e1997fa8b0d）上線，無需重開。待授權操作者完成：(1) 於 drts-dev-workload-identity-google-service-principals 新增 tenant_viewer/唯讀與另一 tenant 的 tenant_admin 兩個 WIF grant；(2) 透過既有 tenant onboarding 流程為三個 fixture tenant 各取得一筆真實發票；(3) 把 dev SMTP 信箱 +invoice alias 加入 drts-dev-smtp-recipient-allowlist；(4) 設定 14 個 DRTS_LIVE_INVOICE_MAIL_* repo variables（含 TEST_AUTHORIZED）。完成後由唯一發布主控以該已審不可變 SHA dispatch live-invoice-mail-acceptance.yml，取得真實寄送/收件/重送/受控下載證據後才 record-acceptance。詳見 support/unblock/INVOICE-MAIL-LIVE-WIRE-CONTRACT-20261123/INVOICE-MAIL-LIVE-WIRE-CONTRACT-20261123-UNBLOCK-MANUAL-UNBLOCK.md 與 .local/system-release-20261123/invoice-mail-live-wire-acceptance-20261128.json。"
   }
   ```

3. 核對 Codex（parent 原登錄 waiting_for）與實際授權操作者是否為同一人；若需要換人，
   由 Supervisor 協調，不由本 helper 擅自改 `waiting_for`。
4. 完成 metadata／父任務 note 後讀回驗證，才處理本文件 PR 的 review/merge；文件合併
   只交付診斷，不授予產品 acceptance。
5. 授權操作者完成 1–4 項後，Supervisor 使用既有 merged-acceptance resume 交易，保留
   原身分恢復 `acceptance`；不要 `start` 父任務或直接改成 `todo`。
6. 唯一發布主控依既有 shared Cloud Run workflow，以已審不可變 source（目前的
   deployed SHA）dispatch `live-invoice-mail-acceptance.yml`。只有實際
   run/job/artifact 滿足 `actual_serialized_invoice_readback_delivery_and_download_follow_the_authorized_hosted_path`
   後，才記錄 acceptance；本輪未核准任何 acceptance。

## 既有證據引用（未複製，僅引用 canonical root 絕對路徑）

- `.local/system-release-20261123/invoice-mail-live-wire-acceptance-20261128.json`
  （Codex2 2026-11-28T09:52:48Z；含 144 筆 repo variables 讀回、14 個缺席變數清單、
  preflight probe 結果、`blocker` 寫入紀錄）
- `.local/system-release-20261123/invoice-mail-live-wire-owner-resume-20261127.json`
  （21757 bytes，sha256
  `5224ed1012af2468f18fe3edaef4b5c56d0e45779fc2b07750433fd9a1d76f2e`）
- `.local/system-release-20261123/invoice-mail-live-wire-verification.json`
  （5225 bytes，sha256
  `6963237f95c18617aebbb2f251d29f7f291b0c12b94d1e5fd04adbc50181dea8`）
- `.local/system-release-20261123/invoice-mail-live-wire-hosted-body-proof.json`
  （631 bytes，sha256
  `d268f2e15f5df500a5cc9381ff305556fce99138dc071dc7f457a80dc2a5df1c`）

上述 bytes／sha256 沿用 Codex2 本輪自報值（本 helper 未在 canonical root 重新執行
`sha256sum`，理由見「本輪執行限制」）；路徑皆相對 canonical root
`/home/lupin/workspace/drts-fleet-platform`。

所有本輪主動啟動的本機檢查都必須完成並讀取結果後才 handoff；由 handoff 才觸發的
hosted CI 另列 pending。
