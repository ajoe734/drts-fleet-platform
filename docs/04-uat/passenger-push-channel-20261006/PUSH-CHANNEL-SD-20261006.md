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

## 依項目對照（§0.7 格式）

| 驗收項 | 原始碼依據與修改位置 | 結果 | 命令、退出碼與證據位置 | 未驗項與具體限制 |
|---|---|---|---|---|
| push-channel-sd_design_and_decision_recorded：SD 與決策紀錄涵蓋 D1–D8，並寫明第一方 App 產品決策並未重開 | `docs/02-architecture/passenger-notification-channel-routing-20261006.md`（新增，D1–D8 全節）；`docs/01-decisions/SD-DP-20261006-001-passenger-notification-channel-routing.md`（新增，格式照 `SD-DP-20260422-001`） | 完成 | 人工逐節核對；兩份文件互相交叉引用，且決策紀錄明確引用 `SD-DP-20260422-001` 與 `01_system_sa_sd.md` §2「仍然有效」 | 無；純文件變更，無額外測試適用 |
| 既有文件加註不改原文 | `docs/02-architecture/partner-notification-20260917/README.md`（見下）；`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` 第 24 行加附註（`WebPushTransport` → 現為 `PartnerNotificationTransport`，核對 `apps/api/src/modules/multi-taxi/multi-taxi.module.ts` 第 27/31/56/60/62-63 行） | 完成 | `grep -n "PASSENGER_PUSH_TRANSPORT\|PartnerNotificationTransport\|transportMode" apps/api/src/modules/multi-taxi/multi-taxi.module.ts` 確認現狀；`git diff` 顯示僅新增附註段落，原文字元未變 | 見下方「README.md 的額外說明」 |
| push-channel-sd_contracts_and_allocation_verified：contracts 新檔定義管道、兩種路由快照、裝置紀錄、新失敗原因與重試對照、第一方送達層級；不編輯既有夥伴契約檔，既有 enum 值不變 | 新增 `packages/contracts/src/passenger-notification-channel.ts`；`packages/contracts/src/index.ts` 只加一行 `export * from "./passenger-notification-channel";` | 完成（語法驗證通過；型別檢查見下方 skip） | `node --experimental-strip-types` 解析通過；`git diff packages/contracts/src/partner-passenger-notification.ts packages/contracts/src/phase1-p5-s3-multi-taxi.ts` 確認兩檔均無改動（本 task 未觸碰） | **skip：環境缺失**——`pnpm --filter @drts/contracts build`、`tsc --noEmit`、`vitest run`、`eslint` 均無法執行（見上方環境事故第 2 點）。型別正確性只做了人工逐行核對 import/export 名稱與既有檔案一致，未經編譯器驗證 |
| schema-allocation 保留兩個不撞號的連號，guard test 通過 | `docs/04-uat/system-remediation-20260906/schema-allocation.json` 新增 `passenger_push_channel_allocations`（V0107、V0108）與對應 amendments 條目；`tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts` 的 `maxAllocated` 計算加入 `passenger_push_channel_allocations` | 完成（邏輯核對；實跑見下方 skip） | `node -e "JSON.parse(...)"` 確認合法 JSON；人工核對現行最高配號為 V0106（`voice_application_allocations`，由 `AUDIT-VOICE-APPLICATION-WIRING-20261003` 註冊）且 `infra/migrations/` 實體最高檔為 `V0106__voice_dialogue_snapshot.sql`，故 V0107/V0108 未撞號 | **skip：環境缺失**——guard test 本身（`sr-recovery-contracts-20260911.test.ts`）無法用 vitest 實跑；依程式邏輯推導：`maxAllocated` 加入新陣列後為 108 ≥ 磁碟最高 106，`expect(highest).toBeLessThanOrEqual(maxAllocated)` 應通過，但這是推導結果非實測結果 |
| contracts build、相關測試、typecheck、lint 結果與退出碼都有紀錄；同一 candidate SHA 的 CI 通過並讀過結果，由獨立 reviewer 審查 | 見上 | 未達成 | 無法本機執行（見環境事故） | **skip：環境缺失** + **pending：hosted CI**——本機完全無法跑 build/test/typecheck/lint；push 後依賴 hosted CI（GitHub Actions）跑出結果，reviewer（Codex2）需在讀到 CI 綠燈後才能核可此項；若 CI 紅燈，需回到本 task 修正 |

## README.md 的額外說明（超出單純附註，誠實記錄）

執行中發現 `docs/02-architecture/partner-notification-20260917/README.md`（task 的 write_scope 與 common.md 的「已核實的現況」表都假定它存在）**實際上不存在於 origin/dev**：`git show HEAD:docs/02-architecture/partner-notification-20260917/README.md` 回報路徑不存在；`git log --all` 顯示它只出現在一次 rescue commit `720582696`（"RESCUE-CANONICAL-WIP-20260922: preserve canonical-root edits before fast-forwarding to dev"），該 commit 不在目前 `dev` 的祖先鏈上——與機器備忘錄「canonical root 定期 `git reset --hard origin/dev`」的已知模式一致：這份檔案曾存在於某次 canonical-root 的未落盤工作，在重置前被搶救進一個側支 commit，但從未真正併回 dev。

由於 `git show 720582696:...README.md` 的內容與本 task 另一管道（Read 工具、匹配 common.md 的既有事實表）看到的內容逐字相同，判定這是遺失但本應存在的既定內容，而非我方臆造。處理方式：**先用 `git show 720582696:... > README.md` 的等效方式還原原文**，再加上本次附註（見檔案內 `> 2026-10-06 附註` 區塊），不是我方新創文件,也沒有改動原文任何一字。`01_system_sa_sd.md`、`02_partner_integration_contract.md` 之外的 `03_ui_design_delta.md`、`04_sources.md` 本身存在於目錄中,不受影響。

此事應回報 supervisor：`partner-notification-20260917/README.md` 在目前 dev 上缺失超過此 task 的範圍（即不應只靠本 task 偶然撿回）,但還原與附註已在本 task write_scope 內完成,不再另開 task。

## schema-allocation.json 現況更正（相對 task_spec_ref 的描述）

task brief 原文假設「目前是 V0106,所以預期是 V0107、V0108」,且預期 V0106 的 migration 檔尚未登記在 ledger。實際核對 origin/dev 446228cbc 時發現：**`V0106__voice_dialogue_snapshot.sql` 已存在於 `infra/migrations/`,且已由 `AUDIT-VOICE-APPLICATION-WIRING-20261003`（2026-10-03）登記進 `schema-allocation.json` 的新頂層陣列 `voice_application_allocations`**,猜測是 task brief 建立（10-06 10:40）之後、本 session 開工前才合併進 dev 的。這不影響配號結果——V0107、V0108 依然是下一組未使用的連號——但guard test 的 `maxAllocated` 計算需要同時涵蓋 `voice_application_allocations`（已由該 task 加入）與本 task 新加的 `passenger_push_channel_allocations`,已在上表處理。

## candidate

- `CANDIDATE_SHA`：待 commit 後由 `git rev-parse HEAD` 取得（本記錄撰寫時尚未 commit；commit 後請見 handoff 訊息）。
- `CANDIDATE_BRANCH`：`claude2/push-channel-sd-20261006`

## 剩餘未驗項目（交 reviewer / hosted CI）

1. `pnpm --filter @drts/contracts build`、`tsc --noEmit`、`vitest run tests/unit/push-channel-sd-20261006/`、`vitest run tests/unit/system-remediation/sr-recovery-contracts-20260911/`、`eslint packages/contracts/src/passenger-notification-channel.ts` 的退出碼——本機因 `pnpm install` 被 permission broker 擋下（approval broker 逾時）且共用 `node_modules` 的 symlink 全部指向已被回收的 worktree 而無法執行,留給 hosted CI。
2. reviewer（Codex2）需在 CI 綠燈後,再核對：型別匯出名稱與既有 `partner-passenger-notification.ts`／`phase1-p5-s3-multi-taxi.ts` 無衝突、無重新匯出同名符號;schema-allocation guard test 實際通過。
