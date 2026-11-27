# PAX-CANCELLED-RIDE-BOOK-AGAIN-20261123：manual unblock 診斷

- Helper：`PAX-CANCELLED-RIDE-BOOK-AGAIN-20261123-UNBLOCK-MANUAL-UNBLOCK`
- Owner / reviewer：Codex2 / Claude2
- 查核日期：2026-11-27 UTC
- 查核 source：`47a20f0103163a0065c855b464b32e1997fa8b0d`（本輪 HEAD / origin/dev）
- 交付範圍：本文件；未修改產品、E2E、workflow 或控制平面。

## 結論與剩餘阻礙

父任務沒有未完成的 dependency；產品候選已獨立審查、同 SHA 綠 CI 並合併。
仍缺 `cancelled_owned_ride_opens_normal_booking_as_a_new_order` 的 hosted 驗收證據：
現有 E2E 在取消原單後直接開首頁叫新單，繞過取消頁的「預約叫車」。
重跑相同 harness 或重派 owner audit 都無法補足此路徑。

原卡 `write_scopes` 只有產品元件與 unit test。所需的兩個 E2E 檔案不在範圍內；
依 `AI_COLLABORATION_GUIDE.md` §0.7，須先由 Supervisor 核對並行歸屬及更新 scope。
本輪 open dev PR 檢索未見這兩檔的競爭變更，但這不等於取得 scope 授權。

本 helper 另受 dispatch fence 限制：實際執行原卡 `note` 以更新下一步，被拒絕為
`Dispatched worker cannot mutate a different task`（exit 1）；前後父任務讀回完全一致。
`TaskBoardCommandExecutor._guard_worker_command` 亦未允許 worker 使用 `assign` 更新 metadata。
因此本輪不能自行持久化父任務下一步或 helper 的 `resolved_parent_*`。
下列 disposition 必須由 Supervisor 在 helper 合併前寫入；PR 保持 draft，避免預設
helper completion 將仍未解阻的父任務改成 `todo`。

## 保留的產品候選與證據

| 欄位                          | 本輪讀回                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 父任務 status / waiting_for   | `blocked` / `Codex`                                                                                                                       |
| Candidate / reviewed / CI SHA | `e0de224670fed0629fdf0c07ce589e0d1e28a6f5`                                                                                                |
| Candidate generation          | `fd09b0dad3024280a20f413fdd7ce4e7`                                                                                                        |
| Candidate branch              | `codex2/pax-cancelled-ride-book-again-20261123`                                                                                           |
| Product PR / merge            | [#3410](https://github.com/ajoe734/drts-fleet-platform/pull/3410) / `4c39f6ee073533e24fe13caa6b408c838cf30ee5`                            |
| Required CI                   | Commit trailers、Runtime mirror guard、Smoke acceptance、ci-integ 均 success                                                              |
| 最新成功 shared-dev deploy    | [45953703847](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45953703847)，source `47a20f0103163a0065c855b464b32e1997fa8b0d` |
| Required acceptance evidence  | 尚無                                                                                                                                      |

候選與本輪 `origin/dev` 的兩個產品 scope 檔案內容相同。
`waiting_for=Codex` 來自原卡登錄者；不代表 Codex 是 Supervisor 或唯一發布主控。
此 helper 的文件候選不能取代父任務的產品候選或 merge SHA。

## 精確呼叫路徑與修正邊界

以下行號對應上述查核 source：

1. [passenger-ride-page.tsx](../../../apps/passenger-app-web/components/ride/passenger-ride-page.tsx) 的
   `CancelledActions`（2471–2525）：本人模式提供 `Link href="/"` 的 `t.BookRide`，
   另有 `/rides` 行程歷史；token 模式沿用客服連結。這是既有產品修正，無新缺陷證據。
2. [pax-review-additional-branches.spec.ts](../../../tests/e2e/pax-review-additional-branches.spec.ts)
   256–268：`arrivedCancellationJourney` 產生 H 取消原單後，E 呼叫 `book(pax, method)`。
3. [additional-journey.ts](../../../tests/e2e/pax-review-shared-order/additional-journey.ts) 的
   `book`（232–275）呼叫 `prepareBooking`（152 起）；後者在 158 直接
   `page.goto(PAX + "/")`。E 已讀取建單 response 的 UUID，但沒有消耗取消頁連結，
   亦沒有觀察從點擊到確認前的零建單 POST。
4. [arrived-cancellation-journey.ts](../../../tests/e2e/pax-review-shared-order/arrived-cancellation-journey.ts)
   保留 H 原單取消與三角色讀回；spec 274 起保留 H 車司供應重用於 E 的驗證。
   應沿此 H→E 路徑補入口，不另造訂單流程。
5. [interrupted-rehearsal-finalizer.ts](../../../tests/e2e/pax-review-shared-order/interrupted-rehearsal-finalizer.ts)
   的 `trackInterruptedRehearsal` 在 spec 開始時監看本輪新建單並於中斷時收尾。
   保留此機制，不刪資料、不吞 assertion failure。
6. [deploy-dev.yml](../../../.github/workflows/deploy-dev.yml) 的 operational journey job
   checkout `needs.build-push.outputs.candidate_sha`（2715–2717），並在 3199 執行 additional
   branches config、3204 上傳同 source SHA artifact。既有 hosted 路徑可承接補證；
   本輪未 dispatch，也未在 VM 執行 browser/runtime。

最小修正單元是：Supervisor 協調下列兩檔後，原 owner 在既有 H→E 與 booking helper
加入「由目前取消頁進入」的分支，保留其他 `book` callers 的預設行為。需搜尋全部
`book` / `prepareBooking` callers，再界定參數契約；本文件不代寫範圍外程式。

```text
tests/e2e/pax-review-additional-branches.spec.ts
tests/e2e/pax-review-shared-order/additional-journey.ts
```

若合法 token 回歸需要其他共享 fixture 檔案，先由 Supervisor 同樣核對歸屬後擴充原卡
scope，不推定本 helper 已取得寫入權。

## 逐項驗收與未驗項

| Finding／驗收項                                | 原始碼依據與修改位置                                                | 舊版重現 → 本輪結果                                            | 命令／版本／證據                                                                      | 未驗項與具體限制                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 診斷 dependency-ready 父任務仍 blocked         | 原卡 `depends_on=[]`、scope、required acceptance；上述正式呼叫路徑  | 靜態定位確認 E 繞過取消頁；本輪未改產品，動態前後重現不適用    | release CLI 單 task `show`、source 讀取，exit 0；delta JSON                           | hosted 缺口仍在                                                                       |
| 點取消頁「預約叫車」，確認前零建單 POST        | `CancelledActions` → `/`；`book` → `prepareBooking` 直接 goto       | 舊 harness 未覆蓋；本輪仍未驗                                  | source `47a20f0103163a0065c855b464b32e1997fa8b0d`；兩 harness hash 見下               | 待 scope 協調後加入真正 link click、request observer，持續到確認前                    |
| 確認後後端新 ID／原單仍 cancelled              | `book` 讀 POST response UUID；spec 已比較 D/H/E 不同 ID             | 既有新 ID assertion 保留；無由取消頁入口連起的本輪 hosted 證據 | 同 source；原 owner matrix 保留                                                       | 新 run 必須記錄 H/E ID、建單 response 與 authority 原單取消讀回                       |
| 本人行程歷史與合法 token 正常入口              | 原卡 acceptance；`CancelledActions` 本人 `/rides`、token 客服分支   | 原候選 unit/reviewer 證據保留；hosted 仍待驗                   | 原 owner matrix；Claude2 原卡同 SHA approve                                           | 本人歷史返回原單、合法 `/r/<token>` 原有操作；不得為 token 新增本人入口或用 mock 代替 |
| 與 #3403/#3366 scope 銜接、唯一發布主控        | #3410 僅產品元件與其 unit test；本輪 diff 僅本文件                  | 產品候選與 dev 兩 scope 內容一致，exit 0；本輪未新增部署       | `git diff --name-only <candidate> origin/dev -- <two product scopes>`；PR/deploy 讀回 | E2E 變更須先協調；新 hosted source 必須是已審不可變 SHA                               |
| 僅做 task-scoped unblock 文件及 commit/push/PR | 本文件                                                              | 產品／E2E 修正不適用；以文件內容、連結、格式及 diff 檢查驗證   | 本輪 candidate SHA、PR、格式檢查結果由 helper handoff 與 delta evidence 鎖定          | CI／merge 由 candidate lifecycle 收錄，不以文件宣告通過                               |
| 更新父任務具體下一步及保留 blocked disposition | release `_guard_worker_command`；`unblock_parent_resolution_fields` | 原卡 `note` exit 1，父任務未變；worker 不能使用 `assign`       | `diagnosis.json` 的 `parent_note_attempt`、`parent_unchanged=true`                    | Supervisor 必須在 helper merge 前執行下列 metadata／note；draft 保留此 gate           |

本輪只有文件變更，未新增鏡像測試，也未重跑產品 unit/lint/typecheck。
父任務原候選測試不是本輪新通過的驗收；不得將一般 CI 或既有取消成功視為此 key 通過。

## Supervisor 可執行的下一步

1. 在 operator context 讀回原卡與 helper；確認上列候選身分、scope 與 blocker 尚未改變。
2. 在 helper **merge 前**，用 release CLI 的 `assign` 保留 Codex2 / Claude2，加入下面
   三個 `TASK_METADATA_JSON` 欄位。`resolved_parent_at` 留給 merge transaction 寫入。
   再以原卡 `note` 寫入同一個 `resolved_parent_next`。本 worker 不移除 dispatch fence。

   ```json
   {
     "resolved_parent_status": "blocked",
     "resolved_parent_waiting_for": "Codex",
     "resolved_parent_next": "Supervisor 請先核對並行歸屬並協調原卡兩個 E2E scope；原 owner 沿 H 取消原單→本人歷史→取消頁點預約叫車→確認前零建單 POST→確認取得後端新 ID／原單仍 cancelled，補合法 token 正常入口回歸，保留 finalizer。以已審不可變 source 由唯一發布主控執行既有 shared-dev hosted workflow，再將 run/job/artifact 與逐項證據回填原卡。scope/harness/hosted 證據未補齊前保留 blocked。詳見 support/unblock/PAX-CANCELLED-RIDE-BOOK-AGAIN-20261123/PAX-CANCELLED-RIDE-BOOK-AGAIN-20261123-UNBLOCK-MANUAL-UNBLOCK.md。"
   }
   ```

   `.local` delta JSON 的 `required_supervisor_metadata` 亦提供較完整的同義 payload。
   此處是待執行處置，不能當作 metadata 已寫入的證明。

3. 核對 E2E 並行歸屬，協調原卡 scope 與原 owner 的下一個小修正單元。
   既有產品 candidate、generation、review、CI、merge 全部保留；無產品缺陷證據，
   不要求產品 reopen。以既有 canonical lifecycle 審查 harness，不建立新的 helper。
4. 完成 metadata／父任務 note 後讀回驗證，才能解除本文件 PR 的 draft gate 並處理 review/merge。
   文件合併只交付診斷，不授予產品 acceptance。
5. harness 與執行條件真正就緒後，Supervisor 使用既有 merged-acceptance resume 交易，
   保留原身分恢復 `acceptance`；不要 `start` 父任務或直接改成 `todo`。
   release `command_resume_blocked` 要求新讀回的身分、dependency 與 blocker fingerprint，
   並拒絕未完成 helper；不能把本文或舊 helper 當成已解除 runtime blocker 的證據。
6. 唯一發布主控依既有 shared Cloud Run workflow，以已審不可變 source 執行缺少的 UI 路徑。
   如需部署，先讀 deployment workflow／branch strategy／custom-domain runbook 並核對 live
   `DEV_GCP_*`。只有實際 run/job/artifact 滿足原 key 後，才由 acceptance context 記錄；
   本輪未核准任何 acceptance。

## 本輪 delta 與既有證據引用

本機增量目錄（canonical root，未複製舊檔）：
`/home/lupin/workspace/drts-fleet-platform/.local/system-release-20261123/pax-cancelled-ride-book-again/unblock-manual-20261127/`。
`diagnosis.json` 記錄 read-only commands、退出碼、父任務前後身分、被拒 note 及待寫 metadata；
helper handoff／`delivery.json` 記錄本文件 candidate、remote、PR 與驗證結果。

| 既有證據                                                                                                      | bytes | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| `.local/system-release-20261123/pax-cancelled-ride-book-again/owner-handoff-20261127.json`                    | 21929 | `881e6091dcd465f4bd88de95ae324e94369969886b65c66310c5c717bb91f8cf` |
| `.local/system-release-20261123/pax-cancelled-ride-book-again/acceptance-scope-blocker-20261127T124235Z.json` |  8051 | `91572e2bad2e5748b618c2bef52ba2b3d29f6143d1cc99aac2884af62c1c17d4` |

上述路徑皆相對 canonical root `/home/lupin/workspace/drts-fleet-platform`。
本輪 source harness hash 與前輪相同：

- `tests/e2e/pax-review-additional-branches.spec.ts`：`d1e3bc33565cbaf80028bfa28ebfea44051617ff941731026ef2df9ea63cee8f`
- `tests/e2e/pax-review-shared-order/additional-journey.ts`：`45ecd631e22e99a3a2f6c0f5429ca38d2ee1b7558b40d0022c88d837c31213fb`

所有本輪主動啟動的本機檢查都必須完成並讀取結果後才 handoff；由 handoff 才觸發的
hosted CI 另列 pending。PR draft 只用於上述未落盤的 operator gate，不代表已有補證。
