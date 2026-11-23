# DRV-ONB-013 規劃判定與 scope 協調路由

- Helper：`DRV-ONB-013-UNBLOCK-PLANNING-DECISION`；parent：`DRV-ONB-013`。
- 原 owner／reviewer 均維持 `Codex2`／`Gemini`；初稿：2026-11-22 UTC；本輪核對：2026-11-23 UTC。
- Helper branch：`codex2/drv-onb-013-unblock-planning-decision`；讀取基準與 fetch 後 `origin/dev`：`f23a1d8a860cd4298bc562a9a1a5f1a2f4e2b928`。
- 交付範圍：本決策文件及 `PHASE1_OPEN_QUESTIONS.md` 的對應路由；產品、migration、共用 ledger 及 guards 尚未修改。
- **目前交付狀態：Supervisor 的三檔 scope 聯集、parent next 與 helper blocked disposition 已於 11/23 讀回。修正下述舊 SHA 的跨分支來源引用後，以 PR #3360 新候選 handoff Gemini；parent 的產品修補仍待原 owner 在 PR #3358 完成。**

## 2026-11-23 續作核對與候選修正

本輪先核實既有 published HEAD `4a1e48c4c43380908e94fdb5ced261fd2fcd6f14`：本機、遠端分支及 [PR #3360](https://github.com/ajoe734/drts-fleet-platform/pull/3360) head 一致、working tree 乾淨，沒有已鎖定的 helper candidate。指定 release CLI 的兩份 task slices 確認：

- parent／helper owner 與 reviewer 仍為 `Codex2`／`Gemini`；parent 保持 `blocked`。
- 原 parent scope 已包含下列 follow-up 指定的三檔；Supervisor 的平行衝突核對摘要已記入 parent next。
- helper 的 `resolved_parent_status: blocked`、`resolved_parent_waiting_for: Codex2` 已落盤；`resolved_parent_next` 與 parent 的具體 next 完全相同，長度低於 4000 字。

因此 11/22 的角色拒絕仍是有效歷史證據，但其「尚待 Supervisor 寫入」限制已由本輪 machine-truth 讀回解除。下面的請求與操作序列保留作追溯，**不要重放已滿足的請求**。helper merge 後仍須保留 blocked parent disposition，原 owner 依 scope 協調後的 next 執行產品修復。

舊 SHA 的 [Canonical consistency job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45046311602/job/137281582245) 為 **FAIL**：本 helper 將只存在於 parent PR 的 UAT 文件寫成 helper repo 內路徑。正式 `check_canonical_consistency.py --ci --base origin/dev --head HEAD` 在乾淨舊 HEAD 最小重現相同 missing-path finding、exit 1。已用 `git show` 核對 parent checkpoint `ed025019e1f6e44797949a0644d402a0d537c76e` 的兩個原 finding sections，將來源表改為該 commit 的固定 GitHub blob 連結，讓 reviewer 可直接讀到真正來源。本輪只補此引用及 scope 讀回狀態，不複製 parent 驗收檔、不修改 checker 或產品程式。

本輪 delta evidence root：`/home/lupin/workspace/drts-fleet-platform/.local/drv-onb-013-unblock-planning-decision-20261122/handoff-20261123/`。`readback-and-before.json` 保存 CLI 讀回、舊 SHA 重現、parent 原文件 hash／size 及前輪 evidence inventory；本輪檢查與最終出版 receipt 分別記於 `checks-committed.json`、`publication.json`。以下表格補充原驗收表，不覆蓋原 finding 或未驗項：

| Finding／驗收項                                    | 原始碼依據與修改位置                                               | 舊版重現 → 本次結果                                                                       | 命令、版本與證據                                                                                                                                | 未驗項與具體限制                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| parent concrete next／safe helper disposition      | release CLI `show` parent／helper；原三檔 scope 與 resolved fields | 11/22 寫入遭拒 → 11/23 讀回三檔已納入，兩份 next 相同，blocked disposition 已記錄         | `readback-and-before.json`；正式兩次 `show` exit 0；Supervisor 協調摘要見 parent next                                                           | parent 仍 blocked，產品修補、review／CI／merge 不由 helper 取代。 |
| CI-CITED-PARENT-UAT：helper 引用未合入 parent 文件 | 本文正式依據表；正式 checker `check_cited_paths`                   | `4a1e48c4` 正式 checker exit 1 → 改為 parent checkpoint 固定來源連結，同一 checker exit 0 | `checks-committed.json` 記錄本輪完整 SHA、格式／consistency／diff／trailers／兩段 bash syntax 結果；`publication.json` 記錄 remote／PR equality | 新候選 hosted CI 待 GitHub bus 收錄；舊 failure 不宣稱為綠燈。    |
| helper exact-SHA handoff                           | 原 PR #3360、原兩份規劃文件                                        | 舊 SHA 保留；追加 task-scoped 修正並普通 push，鎖定最終本機／remote／PR 同 SHA            | 新完整 candidate SHA／branch 由 handoff 與 `publication.json` 記錄                                                                              | Gemini 獨立 review、CI、merge 尚待；不呼叫 done。                 |

本輪未套用 parent proposal、未重跑產品 suites；舊 **56 pass／2 fail** 仍只代表原 allocation 缺漏。未啟動 VM 產品／browser／DB／Docker 或部署。

## 判定與正式依據

本次沒有待發明的產品／契約語意，也沒有核准 scope cut。實際 blocker 是新增的 `V0140`–`V0142` 尚未登記於共用 migration allocation ledger，且修正所需三檔不在 parent 的 `write_scopes`。選擇 task acceptance 所允許的 **explicit follow-up**：Supervisor 協調並擴充原任務範圍後，由原 owner 在原分支完成 allocation 登記與既有測試修復。

正式依據：

| 依據                                                                                                                                                                                                                                                                                                                   | 本次採用的界線                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_COLLABORATION_GUIDE.md` §0.5、§0.7、§2、§5                                                                                                                                                                                                                                                                         | backlog／交接以 machine truth 為準；額外檔案由 Supervisor 核對平行衝突並更新原 task scope；不能以規劃文件或舊 SHA 綠燈取代新候選驗收。       |
| `phase1_prd_detailed_v1.md` §2 P4；`phase1_system_analysis_v1.md` §6.3                                                                                                                                                                                                                                                 | Driver App 已有裝置權限、onboarding／auth 範圍。本 helper 不改此產品邊界。                                                                   |
| `phase1_migration_plan_v1.md` §3.1；dev pack `05_engineering_conventions_and_ai_dev_playbook.md` §5.2.5、§5.6                                                                                                                                                                                                          | schema 以正式 SQL migrations 為依據；保留既有資料，登記具體編號與檔名。不得為過測試刪除、改名或改寫已發布 migrations。                       |
| `docs/04-uat/system-remediation-20260906/schema-allocation.json` 的 `boundary_invariants`、歷次 `amendments`                                                                                                                                                                                                           | 沿用 append-only 分配模式，保留既有 allocation、owner、amendment 與無碰撞規則。                                                              |
| parent `task_spec_ref`：[driver-onboarding-dual-channel-acceptance.md（parent checkpoint ed025019）](https://github.com/ajoe734/drts-fleet-platform/blob/ed025019e1f6e44797949a0644d402a0d537c76e/docs/04-uat/driver-onboarding-dual-channel-acceptance.md)「Migration allocation 缺漏定位」及「舊版司機草稿還原修復」 | allocation 是未修 finding；舊草稿修復已有 checkpoint 證據。原母文件的全部 finding／限制繼續有效，本 helper 不覆蓋或宣稱它們通過新候選。      |
| `tools/development-orchestrator/skills/candidate-lifecycle.md` 的 unblock parent disposition                                                                                                                                                                                                                           | helper 仍留下 scope／實作工作時，必須在 merge 前記錄 `resolved_parent_status: blocked` 及具體 next；否則預設 resolution 可能錯誤恢復母任務。 |

因此不新增另一個人類產品決策，也不調降雙通道通知、同一邀請僅成功一次、交易一致性、strict ingress、遮罩或實機驗收要求。`PHASE1_OPEN_QUESTIONS.md` 將本項列為「規劃已定位、scope 已記錄、母任務修補待辦」；無需以新 decision-ledger 項目覆寫既有產品契約。

## 實際來源與 finding

Parent machine truth 仍為 `blocked`。最後已交審的候選為 `982e0357b934dcb4167f015a9936e47b6ac90ec2`，Gemini 於 `2026-11-22T15:15:32Z` 核准；該 SHA 的 CI 後續失敗。現在 [PR #3358](https://github.com/ajoe734/drts-fleet-platform/pull/3358) 的 published checkpoint 為 `ed025019e1f6e44797949a0644d402a0d537c76e`，仍不是完整 review candidate。保留既有 published history，不 merge/rebase/reset 母分支，不將 checkpoint 當已審候選。

兩份正式 guards 都讀取同一 allocation ledger。原候選的實際測試為 **56 pass、2 fail、exit 1**，均是最高磁碟 migration `142` 超過登記上限 `139`：

- `tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts`：`Schema Allocation Invariants` 的 collision、exact filename、highest migration collectors；原 highest assertion 第 253 行。
- `tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts`：`Migration allocation` 的同類三個 collectors；原 highest assertion 第 549 行。

原始 hosted 失敗：[CI run 45036968286 / job 137263014560](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45036968286/job/137263014560)。本次只讀取既有測試紀錄與正式來源，不重跑相同未修測試；`git apply --check` exit 0 僅證明 proposal 可套用，不代表修正版測試通過。

| 既有 migration                                   | 正式資料歸屬與 invariants                                                                                                                                                                              | 原 owner 後續應登記                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `V0140__driver_supply_email.sql`                 | `fleet.driver_supply_drafts` 加入 nullable `email text`，保留既有草稿。                                                                                                                                | `DRV-ONB-013`、`V0140`、確切檔名、fleet／既有表修改及 nullable invariant。 |
| `V0141__driver_onboarding_invitation_proofs.sql` | `iam.driver_device_invitations` 新增 nullable contact/token hashes；非空 token hash 唯一 partial index、contact lookup index；沿用同一邀請 authority。                                                 | `DRV-ONB-013`、`V0141`、確切檔名、iam／既有表及兩個 indexes。              |
| `V0142__driver_onboarding_delivery.sql`          | `fleet.driver_onboarding_deliveries` 參照正式 submission／invitation；`UNIQUE(submission_id, channel)`；通道／狀態與 encrypted payload、invitation、expiry、sending lease checks；due／lease indexes。 | `DRV-ONB-013`、`V0142`、確切檔名、fleet／新表、FK 與上述 invariants。      |

本次靜態核對時 parent remote checkpoint 與 `origin/dev` 的三個待擴檔案 git blobs 完全相同；ledger 上限為 `V0139`、三個新版本未被該 ledger 分配、母分支每個新編號只有一個正式檔名。這不是 Supervisor 對其他 active task／未發布分配的衝突核准。Supervisor 仍須在寫入前重新讀取最新任務範圍、分支與 reservation，若出現競爭分配，先協調原 owners，再由原 owner 調整 patch，不盲套舊 proposal。

## 具體 follow-up 與修正邊界

1. **Supervisor** 核對平行衝突，在原 `DRV-ONB-013.write_scopes` 聯集加入下列三檔，保留所有既有 scope、roles、candidate history 及 acceptance：
   - `docs/04-uat/system-remediation-20260906/schema-allocation.json`
   - `tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts`
   - `tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts`
2. **Supervisor** 將下一節的 parent next 與 helper `blocked` disposition 寫入 canonical machine truth，並讀回確認。此 helper 本身不將 parent 恢復為 todo。
3. **原 owner Codex2** 在 `codex2/drv-onb-013`／PR #3358，以最新基準核對既有 proposal，再追加 `driver_onboarding_allocations` 三筆及 amendment；讓上述兩份 guards 的六個 collectors 納入該群組。保留全部既有 entries／assertions，不改寫 migrations，不改為固定上限 `142`，不 skip guards。
4. **原 owner** 跑以下兩份正式 suites，保留版本無碰撞、確切檔名唯一、最高版本皆受登記的檢查；再跑受影響回歸、格式與 commit trailers。若碰到新 failure，仍在原母驗收文件逐項保留定位與結果；不把本 helper 的靜態 pass 當產品驗收。
5. **原 owner** 更新原 finding 表，commit、普通 non-force push，確認 local／remote／PR head 相同，再以新的完整 SHA handoff 原 reviewer Gemini。CI／review／merge 必須對應新 SHA；真實收件與 iOS／Android 簽署實機 acceptance 維持由 `DRV-ONB-012` 追蹤。

```bash
timeout 120s pnpm exec vitest run \
  tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts \
  tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts
```

## 11/22 genuine Supervisor 寫入請求（11/23 已讀回滿足）

11/22 以原 `AI_NAME=Codex2` 及原 dispatch fence，透過指定 release CLI 實際嘗試兩項必要寫入，均 **exit 1**；以下是當時結果，11/23 讀回見本文首節：

| 寫入                                                                 | release 拒絕訊息                                                     | 結果                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| `note DRV-ONB-013 <concrete-next>`                                   | `Dispatched worker cannot mutate a different task`                   | 母任務 next 未更新。          |
| `assign <helper> Codex2 Gemini`，附 `TASK_METADATA_JSON` disposition | `Dispatched workers must use their assigned task lifecycle commands` | helper disposition 尚未寫入。 |

拒絕前後的兩份 task slice 一致；未移除 fence、冒用 Supervisor、直接編輯 status／activity log 或改 scope。這是 repository 的角色限制，由真實 Supervisor 處理，無須使用者重新許可。

精確請求：`/home/lupin/workspace/drts-fleet-platform/.local/drv-onb-013-unblock-planning-decision-20261122/supervisor-request.json`。其中 `parent_next` 為 1004 字，只有當前 action／blocker／證據路徑；`proposed_parent_write_scopes` 為讀取時聯集，Supervisor 應以**最新** parent scope 重新聯集，不覆蓋新的分配。

需寫入 helper 的 metadata：

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex2",
  "resolved_parent_next": "<supervisor-request.json 的 parent_next 完整內容>"
}
```

`Codex2` 是 CLI 接受的原 owner 路由 lane；**實際前置責任為 Supervisor scope 協調**，不是要求另一位 Codex2 再盲做同一修復。`Supervisor` 不是 `waiting_for` 的有效 agent，不填該無效值。不要人工寫 `resolved_parent_at`；由真正完成／merge transaction 記錄時間。

以下為交給 **genuine、非 dispatched-worker 的 Supervisor context** 的操作序列，worker 不執行。寫入前先核對 owner／reviewer 仍為 Codex2／Gemini、parent 仍 blocked、scope 衝突已解；若實際狀態已前進，不重放過期請求：

```bash
CLI=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-ebfc0cf70173/tools/development-orchestrator/bin/ai-status.sh
REQUEST=/home/lupin/workspace/drts-fleet-platform/.local/drv-onb-013-unblock-planning-decision-20261122/supervisor-request.json
HELPER=DRV-ONB-013-UNBLOCK-PLANNING-DECISION
CURRENT_SCOPES=$("$CLI" show DRV-ONB-013 | jq -c '.write_scopes')
TASK_METADATA_JSON=$(jq -cn --argjson current "$CURRENT_SCOPES" --slurpfile request "$REQUEST" \
  '{write_scopes:(($current + $request[0].additional_parent_write_scopes) | unique)}') \
  AI_NAME=Supervisor "$CLI" assign DRV-ONB-013 Codex2 Gemini
TASK_METADATA_JSON=$(jq -c '.helper_metadata' "$REQUEST") \
  AI_NAME=Supervisor "$CLI" assign "$HELPER" Codex2 Gemini
AI_NAME=Supervisor "$CLI" note DRV-ONB-013 "$(jq -r '.parent_next' "$REQUEST")"
"$CLI" show DRV-ONB-013 | jq '{id,status,next,write_scopes,candidate_sha,candidate_generation}'
"$CLI" show "$HELPER" | jq '{id,status,resolved_parent_status,resolved_parent_waiting_for,resolved_parent_next}'
```

**讀回成功前，本 helper 不 handoff／合併。** 成功後原 owner 才鎖定已 push、與 PR head 相同的 helper SHA，交 Gemini 審查此規劃交付。scope 實際寫入及 owner 可執行時，由 Supervisor 依既有 lifecycle 以新證據恢復原任務；helper 的規劃交付不替代母任務修復或驗收。

## 11/22 §0.7 驗收與證據表（11/23 補充見首節）

| Finding／驗收項                                                          | 原始碼依據與修改位置                                                                             | 舊版重現 → 本次結果                                                                                             | 命令、退出碼、版本與證據                                                                                               | 未驗項與具體限制                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Resolve or route missing product／contract decision；Record the decision | 原 parent status／UAT、正式 migrations、ledger、兩份 guards；本文件與 Open Questions 對應條目    | 規劃標籤過於籠統 → 定位為 allocation／scope 協調，逐檔路由至 Supervisor＋原 owner。純文件變更，行為重現不適用。 | release `show`；`capture.py` exit 0；來源版本、git blobs 與 hash 清單在 `planning-evidence.json`。                     | 不宣稱已修 allocation，也沒有新產品批准。                                                                |
| scope cut or explicit follow-up needed by parent                         | 本文「具體 follow-up」與 `supervisor-request.json`                                               | 無 scope cut；選擇 explicit follow-up，保留既有 acceptance／findings。                                          | 靜態核對三份 DDL、六個 collectors、原測試結果；`git apply --check` exit 0。                                            | 舊正式測試仍是 56 pass／2 fail；未套 patch，修正版 tests 未執行。                                        |
| Update parent with concrete unblocked next step；safe helper disposition | release CLI `TaskBoardCommandExecutor._guard_worker_command`／`unblock_parent_resolution_fields` | 兩項寫入均被拒（exit 1）→ 精確 Supervisor 請求及拒絕證據已保存。                                                | `guarded-writes.json` 記錄命令、錯誤、時間及 parent／helper 不變；1004 字 next 在 request。                            | **尚未滿足**：須 genuine Supervisor 寫入 parent next、三檔 scope 與 helper blocked disposition，並讀回。 |
| Produce task-scoped commit／push／PR evidence                            | 只修改兩份規劃文件；指定 helper branch                                                           | 建立 anchor，完成內容／格式／trailers 核對後普通 push、draft PR。                                               | 最終 publication receipt 於下述 evidence root 及本 helper machine truth，列完整 SHA、remote／PR equality、檢查退出碼。 | reviewer／hosted CI／merge 尚待；在 guarded writes 完成前不 handoff，不稱 helper／parent done。          |

本機 evidence root：`/home/lupin/workspace/drts-fleet-platform/.local/drv-onb-013-unblock-planning-decision-20261122/`。`capture.py` 是可重跑的正式 CLI／git 靜態核對及 guard 拒絕紀錄，不是新產品測試。格式、引用、diff／trailers 結果與出版紀錄寫入本目錄的本輪 delta；不複製前輪 logs 或 repo，不使用 `/tmp` 工作副本。

沿用證據所在目錄：`/home/lupin/workspace/drts-fleet-platform/.local/driver-onboarding-20261122/drv-onb-013-codex2-import-repair/unit-shard-repair/`。以下只記來源、hash、size；`planning-evidence.json` 亦保存 inventory：

| 來源檔名                          | SHA256                                                             | bytes |
| --------------------------------- | ------------------------------------------------------------------ | ----: |
| `allocation-before.json`          | `41fa3c9559467b27b2bf913e5650e18d702665fd44b15d6dae431d51097ce29a` |   641 |
| `allocation-before.log`           | `364ea1c1ec5e9ef6a7cdb2434c19e4fd1014a70a1cd47e137ebd1e72e8a75c3b` |  2833 |
| `scope-request.json`              | `e25f1e66ccc95f9bc6fb2787d8cefd3ea6eca360d006010ba541c07c88f42814` |  3286 |
| `allocation-scope-proposal.patch` | `babd77a64654c0a1725cbe856f59a789a971fed86bfdd8da909de0f4f885437d` |  6453 |

磁碟檢查 `/` 可用 119 GiB。此 helper 沒有啟動產品 server、PG、browser／E2E、Docker 或部署；沒有啟動尚待結束的產品檢查。parent 新 checkpoint 的 hosted CI 與 helper PR 自動 CI 各自追蹤，不列為本次 PASS。

本輪文件核對已完成：兩檔 Prettier check、相對 baseline 的 `git diff --check`、task commits 的正式 trailers checker、兩段文件 shell commands 的 `bash -n` 均 exit 0。另核對新增 Open Questions 只有一項且連結存在、request 的 parent next 與 helper disposition 相同、只變更兩份規劃文件。`document-checks.json` 保存每個命令、退出碼、執行 SHA、文件 hash 及是否尚有未提交差異；出版後的最終 receipt 另記已提交／遠端／PR head 一致性。guarded writes 仍分列為拒絕，不納入上述 PASS。
