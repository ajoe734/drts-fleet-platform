# PUSH-CHANNEL-SD-20261006 — 成果紀錄

- task_spec_ref: `/home/lupin/workspace/drts-fleet-platform/.local/passenger-push-channel-20261006/PUSH-CHANNEL-SD-20261006.md`
- owner: Claude2　reviewer: Codex2
- 檢視基準：origin/dev 446228cbc771a4ced774126a7d4aaddea4db73e6（2026-10-06）

## 環境事故（審查前必讀）

本次 session 發現本機（isolated task worktree）存在兩個與本 task 無關、但直接影響「如何產出可驗證證據」的環境問題，記錄如下以免被誤讀為工作瑕疵：

1. **Write/Edit/Read 工具的檔案系統與 Bash/git 看到的檔案系統不是同一份。** 本 session 一開始用 Write/Edit 工具寫了全部交付檔案；之後用 Bash 檢查（`git status`、`ls`、`cat`）發現這些檔案完全不存在於 git 實際追蹤的工作樹中（`git status` 持續回報 `clean`）。進一步探測確認：Write 工具回報成功、Read 工具讀得回內容，但 Bash／`node`／`git` 完全看不到那些寫入。**因此本 task 的全部交付物改為透過 Bash（`cat <<'EOF' > file`、Python 腳本做精確字串替換）直接寫入，寫完後逐一用 `git status --porcelain`／`cat`／`node --experimental-strip-types` 核對過，才視為真正落地。** 這代表：如果其他 worker 在類似環境只用 Write/Edit 工具產出交付物而未以 Bash 核對，其工作可能完全沒有進入實際工作樹——這點值得回報給 supervisor／其他 worker 參考，但不在本 task 的 write_scopes 內，故只記錄不處理。
2. **`pnpm install` 被環境的 permission broker 判定為需要核可（`Bash command classified as defer`），且 `orchestrator_approval_broker` MCP 連線逾時（`CONNECT_TIMEOUT`，session 開場即回報），因此這個核可永遠不會被解決。** 本 worktree（以及探測到的其它 sibling worktree，包括 canonical root 本身）的 `node_modules` 內，所有套件（`vitest`、`typescript`、`eslint`…）都是指向 `.artifacts/worktrees/auto/gemini2-doc-live-runner-upgrade-20261005/node_modules/.pnpm/...` 的 symlink；該 worktree已被 supervisor 回收（`git worktree list` 中不存在），所以這些 symlink 全部失效（`MODULE_NOT_FOUND`）。沒有 `pnpm install` 核可就無法修復，因此本機完全無法執行 `pnpm --filter @drts/contracts build`、`vitest`、`tsc`、`eslint`。

## 已完成的唯一可行驗證

- 用 `node --experimental-strip-types` 個別匯入新寫的兩個 `.ts` 檔，確認語法可被解析（能通過 TS-strip 到模組解析階段，不是語法錯誤）：
  - `packages/contracts/src/passenger-notification-channel.ts` → `parsed ok`。
  - `tests/unit/push-channel-sd-20261006/push-channel-sd-20261006.test.ts` → 解析通過，在 `import "vitest"` 的模組解析階段才失敗（因 node_modules 不可用，非語法問題）。
  - 這只證明語法合法，**不等於型別檢查、不等於測試通過**，以下用「skip：環境缺失」明確標記。
- `node -e "JSON.parse(...)"` 驗證 `docs/04-uat/system-remediation-20260906/schema-allocation.json` 全檔仍是合法 JSON（修改後）。
- 用 `git show <historic-sha>:<path>` 與逐行比對，核對 `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` 現行內容、`schema-allocation.json` 現行內容（含既有 6 筆 amendments、`voice_application_allocations`、最大號 V0106）與 `infra/migrations/` 現有最高檔號（`V0106__voice_dialogue_snapshot.sql`），確保新配號 V0107/V0108 不撞號、且附註只加不改原文。

## 2026-10-06 續接 session 更新（環境已恢復，可本機實測）

接手時 `worker_outcomes` 顯示前一輪 Claude2 handoff（`claude2-20261006T104040Z-b2e7bc73`）已將上述「環境事故」與全部 skip 項記錄在案，PR #2353（candidate `15922dd18`）已由 GitHub reconciled 並在跑 hosted CI。本輪在**同一 worktree**內重新嘗試，環境已可用：

- `CI=true pnpm install --frozen-lockfile` 於 repo root 成功（之前被 permission broker 擋下的狀況未重現；`node_modules` symlink 問題已隨 install 重建解決）。
- `pnpm --filter @drts/contracts build` → exit 0。
- `pnpm exec vitest run tests/unit/push-channel-sd-20261006/ tests/unit/system-remediation/sr-recovery-contracts-20260911/` → `2 passed (2 files)`、`52 passed (52 tests)`，exit 0。
- `pnpm --filter @drts/contracts exec tsc --noEmit -p tsconfig.json` → exit 0。
- `pnpm exec eslint packages/contracts/src/passenger-notification-channel.ts packages/contracts/src/index.ts tests/unit/push-channel-sd-20261006/ tests/unit/system-remediation/sr-recovery-contracts-20260911/` → exit 0。

因此上表第 3、4 項的「skip：環境缺失」已解除,改為「完成（本機 + hosted CI 雙重驗證）」。

### Hosted CI（PR #2353, candidate `15922dd189a2c4f32831e2eaa31e0e749971b117`）讀取結果

讀取 `gh pr view 2353 --json statusCheckRollup` 與個別 job log（`gh api .../actions/jobs/<id>/logs`），該 SHA 觸發了兩次工作流執行（第一次被第二次推送取代、其所有 job 以 `cancelled` 結束並連鎖造成 `ci-integ`／`Smoke acceptance`／`Dependency security`／`Canonical consistency` 等 context 回報 `FAILURE`；第二次執行才是最終結果）：

- **第二次（最終）執行**：`candidate`、`Change scope`、`Repo classification`、`Commit trailers`、`BFF-only imports`、`No real financial-institution identifiers`、`Runtime mirror guard`、`i18n guard`／`i18n-guard`、`Verify Internal Key Exceptions`、`Spec source archive`、`build`、`typecheck`、`lint`、`unit`、`integration`、`cross-surface-e2e`、`iam-negative-matrix`、`e2e` 全部 `SUCCESS`。
- **Canonical consistency（第二次執行，job 112240329358）FAILURE**：`python3 tools/ci/git/check_canonical_consistency.py --ci` 回報 `docs/02-architecture/partner-notification-20260917/README.md: cites missing path \`docs/02-architecture/passenger-notification-partner-app-sa-20260917.md\`` — 這是上面「README.md 的額外說明」還原的歷史原文裡本來就有的一句死連結（`git ls-tree -r dev` 確認該路徑在目前 dev 從未存在，`git log --all`只在已不在祖先鏈上的 rescue commit`720582696`出現過），因為整份 README.md 對 checker 而言是本次 diff 新增的檔案，所以這句舊文字也被判定是「本次引入」。**已修正**：把該句改寫成不再用 repo 路徑引用一個不存在的檔案,改以文字說明「初版 SA 草稿未保留在目前 canonical tree，僅見於歷史 WIP」,不改動其他已核實內容。本機重跑`python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`→`OK`（0 findings）。
- **Dependency security（第二次執行，`CI` 與 `CI (integration trunk)` 兩個 workflow 的 job 皆）FAILURE**：`python3 tools/ci/dependency_security.py` 回報 3 筆 unexcepted 新 advisory：`[moderate] 1241202 sprintf-js`、`[high] 1241209 source-map-js`、`[critical] 1241210 proxy-addr`。核對本 PR 的 diff（`git diff --stat 446228cbc 15922dd18`）**完全未觸碰 `pnpm-lock.yaml` 或任何 `package.json`**；核對 `tools/ci/dependency-security-exceptions.json` 現有 20 筆條目,均不含這 3 個 advisory id,且前一個已合併 PR（#2347,2026-10-05）的同一 job 是 `SUCCESS`——判定這 3 個 advisory 是今天（2026-10-06）新公告、對整個 monorepo 都適用的 pre-existing 問題,與本 task 的 write_scopes（不含 `tools/ci/dependency-security-exceptions.json`、`pnpm-lock.yaml`）及本 task 的程式內容無關,本 task 不應代為決定是否加 exception（需要安全判斷哪些路徑/用途可以除外）。**此項判定為 blocker，非本 task 可解；回報 supervisor／reviewer 另開 task 處理 advisory 1241202／1241209／1241210，或由有權限者評估加入 exceptions 清單。**
- **`Smoke acceptance`（job 112239829180）、`ci-integ`（job 112239866944）FAILURE**：兩者都屬於**第一次（被取代）執行**,log 顯示失敗原因是上游 `candidate`／`Change scope` 等 job 回報 `cancelled`（非本 task 程式問題）,第二次執行的對應 gate（`candidate`、`Change scope` 等）都是 `SUCCESS`。判定為同一 SHA 重複觸發 workflow 造成的陳舊/被取代結果,非真實失敗。

## 依項目對照（§0.7 格式）

| 驗收項                                                                                                                                                                          | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                                    | 結果                              | 命令、退出碼與證據位置                                                                                                                                                                                                                                                                                                                                                                                                                                       | 未驗項與具體限制                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| push-channel-sd_design_and_decision_recorded：SD 與決策紀錄涵蓋 D1–D8，並寫明第一方 App 產品決策並未重開                                                                        | `docs/02-architecture/passenger-notification-channel-routing-20261006.md`（新增，D1–D8 全節）；`docs/01-decisions/SD-DP-20261006-001-passenger-notification-channel-routing.md`（新增，格式照 `SD-DP-20260422-001`）                                                                                                    | 完成                              | 人工逐節核對；兩份文件互相交叉引用，且決策紀錄明確引用 `SD-DP-20260422-001` 與 `01_system_sa_sd.md` §2「仍然有效」                                                                                                                                                                                                                                                                                                                                           | 無；純文件變更，無額外測試適用                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 既有文件加註不改原文                                                                                                                                                            | `docs/02-architecture/partner-notification-20260917/README.md`（見下）；`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` 第 24 行加附註（`WebPushTransport` → 現為 `PartnerNotificationTransport`，核對 `apps/api/src/modules/multi-taxi/multi-taxi.module.ts` 第 27/31/56/60/62-63 行）         | 完成                              | `grep -n "PASSENGER_PUSH_TRANSPORT\|PartnerNotificationTransport\|transportMode" apps/api/src/modules/multi-taxi/multi-taxi.module.ts` 確認現狀；`git diff` 顯示僅新增附註段落，原文字元未變                                                                                                                                                                                                                                                                 | 見下方「README.md 的額外說明」                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| push-channel-sd_contracts_and_allocation_verified：contracts 新檔定義管道、兩種路由快照、裝置紀錄、新失敗原因與重試對照、第一方送達層級；不編輯既有夥伴契約檔，既有 enum 值不變 | 新增 `packages/contracts/src/passenger-notification-channel.ts`；`packages/contracts/src/index.ts` 只加一行 `export * from "./passenger-notification-channel";`                                                                                                                                                         | 完成（本機 + hosted CI 雙重驗證，**本輪修正 F1/F2/F4，見下方「第 2 輪退修」**） | `pnpm --filter @drts/contracts build` exit 0；`pnpm --filter @drts/contracts exec tsc --noEmit -p tsconfig.json` exit 0；`pnpm exec eslint packages/contracts/src/passenger-notification-channel.ts packages/contracts/src/index.ts` exit 0；hosted CI `typecheck`／`lint`／`build` 於 PR #2353 最終執行皆 `SUCCESS`；`git diff packages/contracts/src/partner-passenger-notification.ts packages/contracts/src/phase1-p5-s3-multi-taxi.ts` 確認兩檔均無改動 | 無                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| schema-allocation 保留兩個不撞號的連號，guard test 通過                                                                                                                         | `docs/04-uat/system-remediation-20260906/schema-allocation.json` 新增 `passenger_push_channel_allocations`（V0107、V0108）與對應 amendments 條目；`tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts` 的 `maxAllocated` 計算加入 `passenger_push_channel_allocations` | 完成（本機 + hosted CI 雙重驗證，**本輪修正 F1，見下方「第 2 輪退修」**） | `pnpm exec vitest run tests/unit/system-remediation/sr-recovery-contracts-20260911/` → 本輪連同 push-channel-sd 測試共 `2 passed (2 files)`、`52 passed (52 tests)`，exit 0；hosted CI `unit` 於最終執行 `SUCCESS`                                                                                                                                                                                                                                           | 無                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| contracts build、相關測試、typecheck、lint 結果與退出碼都有紀錄；同一 candidate SHA 的 CI 通過並讀過結果，由獨立 reviewer 審查                                                  | 見上                                                                                                                                                                                                                                                                                                                    | 部分完成                          | 本機四項（build/test/typecheck/lint）全數 exit 0（見上）；hosted CI 最終執行的 `candidate`／`build`／`typecheck`／`lint`／`unit`／`integration` 等皆 `SUCCESS`（已讀取並記錄於上方「Hosted CI 讀取結果」）                                                                                                                                                                                                                                                   | **blocker（非本 task 範圍）**：`Dependency security` 在 hosted CI 仍為 `FAILURE`，原因是 3 個今日新公告、與本 PR диff 無關的 advisory（1241202/1241209/1241210）缺 exception 條目；修正需編輯 `tools/ci/dependency-security-exceptions.json`（不在本 task write_scopes 內，且需要安全判斷），已回報 supervisor／reviewer，見上方說明。`Canonical consistency` 的真實發現已於本輪修正（見上），但尚未重新觸發 CI 驗證改動後的結果——reviewer 需在新 push 後的 CI 結果出來後再核可 |

## README.md 的額外說明（超出單純附註，誠實記錄）

執行中發現 `docs/02-architecture/partner-notification-20260917/README.md`（task 的 write_scope 與 common.md 的「已核實的現況」表都假定它存在）**實際上不存在於 origin/dev**：`git show HEAD:docs/02-architecture/partner-notification-20260917/README.md` 回報路徑不存在；`git log --all` 顯示它只出現在一次 rescue commit `720582696`（"RESCUE-CANONICAL-WIP-20260922: preserve canonical-root edits before fast-forwarding to dev"），該 commit 不在目前 `dev` 的祖先鏈上——與機器備忘錄「canonical root 定期 `git reset --hard origin/dev`」的已知模式一致：這份檔案曾存在於某次 canonical-root 的未落盤工作，在重置前被搶救進一個側支 commit，但從未真正併回 dev。

由於 `git show 720582696:...README.md` 的內容與本 task 另一管道（Read 工具、匹配 common.md 的既有事實表）看到的內容逐字相同，判定這是遺失但本應存在的既定內容，而非我方臆造。處理方式：**先用 `git show 720582696:... > README.md` 的等效方式還原原文**，再加上本次附註（見檔案內 `> 2026-10-06 附註` 區塊），不是我方新創文件,也沒有改動原文任何一字。`01_system_sa_sd.md`、`02_partner_integration_contract.md` 之外的 `03_ui_design_delta.md`、`04_sources.md` 本身存在於目錄中,不受影響。

此事應回報 supervisor：`partner-notification-20260917/README.md` 在目前 dev 上缺失超過此 task 的範圍（即不應只靠本 task 偶然撿回）,但還原與附註已在本 task write_scope 內完成,不再另開 task。

## schema-allocation.json 現況更正（相對 task_spec_ref 的描述）

task brief 原文假設「目前是 V0106,所以預期是 V0107、V0108」,且預期 V0106 的 migration 檔尚未登記在 ledger。實際核對 origin/dev 446228cbc 時發現：**`V0106__voice_dialogue_snapshot.sql` 已存在於 `infra/migrations/`,且已由 `AUDIT-VOICE-APPLICATION-WIRING-20261003`（2026-10-03）登記進 `schema-allocation.json` 的新頂層陣列 `voice_application_allocations`**,猜測是 task brief 建立（10-06 10:40）之後、本 session 開工前才合併進 dev 的。這不影響配號結果——V0107、V0108 依然是下一組未使用的連號——但guard test 的 `maxAllocated` 計算需要同時涵蓋 `voice_application_allocations`（已由該 task 加入）與本 task 新加的 `passenger_push_channel_allocations`,已在上表處理。

## candidate

- `CANDIDATE_SHA`：待本輪 commit 後由 `git rev-parse HEAD` 取得（含 canonical-consistency 修正；上一輪 candidate 為 `15922dd189a2c4f32831e2eaa31e0e749971b117` / PR #2353，本輪會推一個新 commit 到同一 branch，PR 會更新到新 SHA）。
- `CANDIDATE_BRANCH`：`claude2/push-channel-sd-20261006`

## 剩餘未驗項目（交 reviewer / hosted CI）

1. **本機四項檢查（build/typecheck/vitest/eslint）本輪已全數實跑並 exit 0**，不再是未驗項（見上方 2026-10-06 續接 session 更新）。
2. 新 commit push 後，`Canonical consistency` 需要 hosted CI 重新確認（本機已跑 `check_canonical_consistency.py --ci` 得到 `OK`，但 PR 上顯示的仍是修正前的 `FAILURE` 記錄，需等新 SHA 的 CI 結果）。
3. **`Dependency security`（advisory 1241202/1241209/1241210）維持 `FAILURE`，且不在本 task 可修範圍**——reviewer／supervisor 需決定：(a) 另開 task 為這 3 個 advisory 評估並新增 `tools/ci/dependency-security-exceptions.json` 條目，或 (b) 在合併前以其他方式處理此 required check。這與本 task的設計/contracts 內容無關，若因此阻擋合併，不應視為本 task owner 的瑕疵。
4. reviewer（Codex2）需在新 SHA 的 CI 結果出來後再核對：型別匯出名稱與既有 `partner-passenger-notification.ts`／`phase1-p5-s3-multi-taxi.ts` 無衝突、無重新匯出同名符號；schema-allocation guard test 實際通過（本機已確認，hosted CI 需重跑新 SHA）。

## 2026-10-06 第 2 輪退修：Codex2 reopen 的 F1–F4（candidate `15922dd18` → 本輪新 commit）

**誠實記錄**：candidate `7a0984d82757b2bc2308d8b75c65bec2b43ff3f2`（上一輪本 owner 的 handoff）**只修了 F5**（canonical-consistency 死連結），**沒有修 F1–F4**——`git show --stat 7a0984d82` 只碰 `partner-notification-20260917/README.md` 與本 UAT 文件兩個檔，上表「依項目對照」把 contracts/allocation 驗收標成「完成」是不準確的，F1–F4 當時仍然存在於程式與文件裡。本輪在原 worktree 續接後，先核對 Codex2 reopen（`codex-20261006T111153Z-e4ee4c9a`）列的 F1–F4 在目前 HEAD 是否仍然存在，逐項確認「最小重現」後才動手修，依 §0.7 記錄如下：

### F1（P1）token_sha256 唯一性與「insert 新列、舊列 revoked」的交易模型矛盾

- **最小重現（修正前）**：`schema-allocation.json:404` 寫 `UNIQUE (provider, token_sha256)`（全表範圍，未排除任何 status），`:407` 同時要求換人登入時「舊列保留並設 revoked，為新乘客 insert 新列，不可原地 UPDATE」。舊列只是 revoked、沒有刪除，新列與它的 `(provider, token_sha256)` 完全相同 → 若唯一性是全表範圍，這個 insert 在 Postgres 下必定違反 `UNIQUE` 約束（`23505 unique_violation`）。這是純邏輯矛盾，不需要真的建表就能看出；已核對目前 HEAD（commit `7a0984d82`）該兩行逐字未變，F1 在修正前確實仍存在。
- **修正**：把唯一性範圍從全表改成**部分索引**，只限 `status = 'active'` 的列：`CREATE UNIQUE INDEX phase1_passenger_push_devices_active_token_uq ON iam.phase1_passenger_push_devices (provider, token_sha256) WHERE status = 'active'`。同一 hash 可以有任意多筆歷史 `revoked`/`invalid` 列，但任何時間點至多一筆 `active`——換人登入的交易裡，舊列一旦轉 `revoked` 就退出這個索引，新 `active` 列才能進來，不再矛盾。同步修正：
  - `schema-allocation.json` 第 404、407 行的 `table_invariants` 文字。
  - 設計文件 `passenger-notification-channel-routing-20261006.md` D4 的 `token_sha256` 欄說明與「換人登入同一支手機」規則，補上「insert 新列、不是原地改 `drts_passenger_id`」與「為何不會跟唯一性衝突」的明確文字（原文只說「轉綁」「標 revoked」，沒說清楚是 insert 還是 update，也是 reviewer F1 指出的歧義一部分）。
- **修正邊界**：只改文件與配號說明裡的 DDL 描述，沒有新增或修改任何 `infra/migrations/*.sql` 檔（本 task 本波不建表，只配號）；沒有改 `packages/contracts/src/passenger-notification-channel.ts` 的 `PassengerPushDeviceRecord` 型別（它本來就沒有宣告唯一性，型別本身沒有這個矛盾）。

### F2（P1）`FirstPartyPushWireData.event` 用錯內部識別字，不符 D6 的 wire 命名

- **最小重現（修正前）**：`passenger-notification-channel.ts:296`（修正前行號）宣告 `event: PartnerPassengerEventType`，這個型別的值是內部識別字（如 `"driver_arrived"`）；但設計文件 D6「Payload」段落明文要求 `data.event` 用「既有 `passenger.<event>.v1` 命名」，也就是 `PartnerPassengerNotificationExternalEvent`（`"passenger.driver_arrived.v1"` 等）。測試檔 `tests/unit/push-channel-sd-20261006/push-channel-sd-20261006.test.ts` 兩處 fixture 當時也寫 `event: "driver_arrived"`，與設計文件矛盾卻仍通過型別檢查——因為型別本身引用錯的 union。已核對 HEAD 上述三處（contracts 定義 + 兩個測試 fixture）確認修正前問題仍在。
- **修正**：
  - `passenger-notification-channel.ts`：改 import 為 `PartnerPassengerNotificationExternalEvent`（原本的 `PartnerPassengerEventType` import 移除,不再使用),`FirstPartyPushWireData.event` 改型別為 `PartnerPassengerNotificationExternalEvent`。
  - 補註解明確區分：這是**序列化前**的邏輯 DTO（同 `PartnerPassengerNotificationWireData` 的既有 precedent),`eventSequence` 目前仍是 `number`；FCM HTTP v1 實際的 `Message.data` 是 string-to-string map（官方文件連結已附),把 `eventSequence` 轉成字串、組出最終 map 是**之後** `PUSH-FIRST-PARTY-FCM-20261006` transport task 的工作,本 task 不做、也不應被誤讀成已經做了。
  - 測試檔兩處 fixture 的 `event` 改成 `"passenger.driver_arrived.v1"`;新增一則測試明確鎖住「內部識別字不可出現在 `data.event`」,防止之後又改回內部名稱。
- **修正邊界**：沒有改 `./partner-passenger-notification` 檔案本身——`PartnerPassengerNotificationExternalEvent` 是既有既匯出的型別,只是改本檔案引用哪一個既有型別,屬於 contracts-only 的型別引用修正,不影響任何既有 enum 值或既有消費者。

### F3（P2）「一個裝置成功即 delivered」與「其餘裝置下一輪重試」自相矛盾

- **最小重現（修正前）**：設計文件 D6「Delivered 的定義」段落同時寫「只要有一個裝置的 FCM 回應 200…outbox 就記 delivered」與「其餘暫時失敗的裝置…下一輪重試再處理」。但 outbox 的 `status` enum 是既有的 `pending/sending/delivered/failed`（01 §8/§9),`delivered` 是終態,worker 的 claim/fence 條件不會再撈已經 `delivered` 的列——所以不存在「下一輪重試」可以處理其餘裝置。這兩句話描述的是同一個 outbox 列,卻假設它既終態又會被下一輪撈到,邏輯矛盾,文字核對即可重現,不需要真的跑系統。
- **修正**：改寫該段最後一句,明確說明：一旦整批判定 `delivered`,其餘裝置的暫時失敗在**同一次嘗試**裡就一併結案,沒有下一輪;只有在**沒有任何裝置**成功時,outbox 才維持非終態、交給一般 `retryDisposition` 機制在下一輪重新嘗試全部仍 `active` 的裝置。這與 D6 原本「投遞義務只要求至少一個裝置收到」的精神一致,只是把「其餘裝置」的結局講清楚,不是新決策。
- **修正邊界**：只改文件描述文字,沒有改 `FirstPartyPushDeliveryContext`/`FirstPartyPushDeliveryStage` 型別——型別本身（`deliveryStage: FirstPartyPushDeliveryStage | null` 等）原本就沒有宣告「其餘裝置下一輪重試」的欄位或狀態,矛盾只存在於設計文件的敘述,不在型別。

### F4（P2）contracts 註解暗示「不同 owner、不共用 retry timer」,與 D7 單一重試 owner 矛盾

- **最小重現（修正前）**：`passenger-notification-channel.ts` 兩處註解（D6 區塊標頭、`FIRST_PARTY_PUSH_RETRY_POLICY` 上方)寫「the two channels... have different owners and must not share one retry timer」/「different owners and must not share one evidence ladder」。單獨讀這兩句,容易被後續 `PUSH-FIRST-PARTY-FCM-20261006` 任務誤讀成「我可以另外開一個 scheduler/timer」,但設計文件 D7 標題就是「分流點與**單一**重試 owner」,明文「兩個管道共用同一個 outbox 的 claim/fence/receipt 交易」。這是註解措辭引發的歧義,不是型別或邏輯錯誤,逐字核對兩處註解與 D7 原文即可重現。
- **修正**：把兩處註解的「different owners」改寫,明確說「這只是不同的政策**參數**/證據階梯,不是第二個 claim/fence/retry-timer owner;outbox 仍是兩個管道共用的唯一 owner,見 D7」。同步修正設計文件 D6「重試政策」段落裡同樣措辭的「兩者是不同 owner 的重試政策」,改成「兩套不同的參數表,不代表兩個管道各自有 claim/fence 或 timer」。
- **修正邊界**：純註解/文件措辭修正,沒有改變任何常數值、型別欄位或既有行為描述。

### 修正後重新驗證（同一組本機命令,全部重跑,退出碼如下）

- `pnpm --filter @drts/contracts build` → exit 0。
- `pnpm --filter @drts/contracts exec tsc --noEmit -p tsconfig.json` → exit 0。
- `pnpm exec vitest run tests/unit/push-channel-sd-20261006/ tests/unit/system-remediation/sr-recovery-contracts-20260911/` → `2 passed (2 files)`、**`53 passed`**（原 52 + 新增的 F2 回歸測試 1 則),exit 0。
- `pnpm exec eslint packages/contracts/src/passenger-notification-channel.ts packages/contracts/src/index.ts tests/unit/push-channel-sd-20261006/ tests/unit/system-remediation/sr-recovery-contracts-20260911/` → exit 0。
- `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` → `OK`（0 findings）。
- `node -e "JSON.parse(...)"` 驗證 `schema-allocation.json` 修改後仍是合法 JSON → `json ok`。
- `git diff --stat origin/dev -- packages/contracts/src/partner-passenger-notification.ts packages/contracts/src/phase1-p5-s3-multi-taxi.ts` → 無輸出,確認兩檔仍未被本 task 觸碰。

### 本輪未處理、交下一位 reviewer/owner 的項目

- F1–F4 的修正是**設計/契約層**的修正（文件措辭、型別引用、schema-allocation 的 DDL 描述),本波仍然**不建立任何 `infra/migrations/*.sql` 檔**、**不寫 PG 測試**——這些是 `PUSH-FIRST-PARTY-REGISTRY-20261006`、`PUSH-CHANNEL-PG-QA-20261006` 的範圍,此處的部分唯一索引設計只是先把 DDL 意圖寫清楚、避免下游 task 複製一個會撞唯一約束的 schema,不是本 task 自己驗證過 Postgres 行為。
- `Dependency security`（advisory 1241202/1241209/1241210)仍是上表第 3 項列出的 blocker,與本輪修正無關,維持原判定。
- reviewer 仍需在新 SHA 的 hosted CI 結果出來後,核對 Canonical consistency／build／typecheck／lint／unit 在新 commit 上確實是 `SUCCESS`（本機已跑過,hosted CI 需重新觸發)。
