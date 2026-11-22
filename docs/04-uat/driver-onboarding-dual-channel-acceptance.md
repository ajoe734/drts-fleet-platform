# 司機核可與一鍵裝置註冊驗收

車隊新增司機時填手機與 Email，平台核可後自動寄出簡訊及 Email。兩則通知各有相同的六位數代碼與「開啟 DRTS 司機 App」連結。已安裝簽署版 Driver App 的司機點連結即可驗證並進入工作台。若需要手動輸入，使用原建檔手機及收到的六位數代碼。

## 執行條件

- 使用已核准的共享 dev 發布及受控收件門號、Email。部署須包含 `V0140` 至 `V0142`，啟用 `DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED` 並配置郵件與簡訊供應商、通知加密金鑰、代碼雜湊密鑰及排程工作負載。
- Android 簽署版的憑證指紋須與 `https://api.smarttransport.tw/.well-known/assetlinks.json` 一致。iOS 簽署版的應用程式識別碼須與 `https://api.smarttransport.tw/.well-known/apple-app-site-association` 一致。兩種 App 都使用同一共享 dev API，不混用其他環境。
- 核對部署 SHA、簽署 App 的候選版本和測試裝置。iOS 與 Android 各備未登入的受控裝置，並保留一個已有司機工作階段的裝置供檢查。

## 操作與結果

| 情境                 | 操作                                                                                 | 預期結果                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 首次核可             | 用獨立的車隊帳號及審核人完成新司機送審與核可。核可後直接離開畫面。                   | 同一送件建立一組邀請。簡訊與 Email 各收到一則通知，兩則有相同六位數與安全 HTTPS 啟用連結。核可詳情回讀兩個通道的遮罩狀態。 |
| 簡訊點擊             | Android App 未啟動時點簡訊的啟用連結。                                               | Android 直接開啟 Driver App，完成驗證並進入同一位司機的工作台。用 Email 的同一連結在第二台手機上驗證會被拒絕。             |
| Email 點擊           | 用另一份新送件重跑。在 iOS App 尚未啟動及已在背景的情況，各用獨立邀請點 Email 連結。 | iOS 直接在 App 完成驗證並進入工作台。相同邀請的簡訊連結或手動代碼均無法再次綁定。                                          |
| 原本已登入           | 在已有其他司機登入的裝置點連結。                                                     | App 提示已有司機登入，原有工作階段可繼續使用。                                                                             |
| 手動六位數           | 輸入建檔手機與碼，涵蓋 `0` 開頭的有效代碼，再嘗試同組連結。                          | 手動輸入可完成綁定，之後點連結顯示已使用；錯誤手機或代碼均遭拒絕。                                                         |
| 代碼試錯             | 同一未使用邀請以錯誤六位數嘗試五次，然後嘗試正確代碼及原始連結。                     | 手動驗證停用，原始連結仍可完成一次綁定。                                                                                   |
| 期限、停權、證照失效 | 各用獨立邀請驗證效期屆滿、司機停權與證照失效。                                       | 兩種證明都無法啟用裝置。待傳送的過期或失效通知不再寄出。                                                                   |
| 重送、回滾與通道失敗 | 重複核可與模擬資料庫回滾。另讓一個通道遭暫時和不確定失敗。                           | 同一送件只有一個邀請。回滾後沒有通知。暫時失敗只重試該通道，受理結果不明保持待確認，另一通道可正常送達。                   |
| 無 App 或掃描預覽    | 用無 App 的測試瀏覽器及 URL 預覽工具開啟同一連結。                                   | 只顯示安裝 App 或手動輸入提示。之後用簽署版 App 仍能兌換，HTTP GET 不消耗邀請。                                            |

記錄候選 SHA、已遮罩的收件狀態、核可與到期時間、綁定 ID，以及 Android／iOS 實際開啟 App 的結果。截圖與紀錄遮蔽代碼、完整收件地址、啟用連結片段及工作階段憑證。供應商已受理和手機或收件匣實收分別驗證。

## DRV-ONB-013 退修與回歸證據（2026-11-22）

原候選為 `afd052cfa7c7bd4c3d094da6ade3a0252498e362`（[PR #3354](https://github.com/ajoe734/drts-fleet-platform/pull/3354)）。Gemini 於 `2026-11-22T13:48:40Z` 退回循環匯入問題；完整退修保留在 task 的 `worker_outcomes`。本輪接手保留原候選歷史，合入指派分支 `codex2/drv-onb-013`，修正程式碼的 anchor 為 `13cc0c7e23aa0d91ce8a534aab4cd1494ac77fb7`。最終交審 SHA 由同一 task 的 candidate lifecycle 記錄。

證據目錄（以下簡稱 `EVIDENCE_DIR`）：
`/home/lupin/workspace/drts-fleet-platform/.local/driver-onboarding-20261122/drv-onb-013-codex2-import-repair/`。
只新增本輪 log、probe 與建置設定；未複製既有大型紀錄。執行環境為 Node `22.23.2`、pnpm `10.33.0`、TypeScript `5.9.3`、Nest `11.2.7`。

| Finding／驗收項                          | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                                          | 舊版重現 → 修正版結果                                                                                                                                                                                                                                                                                            | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                                                                                                                                                                              | 未驗項與具體限制                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fleet 掃描器前置載入後，API 無法解析模組 | `tests/e2e/fixtures/fleet-upload-scanner.cjs` 先載入 `FleetPartnerModule`；原路徑為 Fleet → Onboarding → Auth → Registry → Tenant → Owned。修正 `fleet-partner.module.ts` 先 import Owned 再 import Onboarding，`auth.module.ts` 先 import Tenant 再 import Registry，避免 CommonJS 尚未完成匯出時被寫進 decorator metadata。 | 原 SHA 的正式原始碼重新編譯成功；同一 probe 以 `fleet-first` 得到 `OwnedMobilityModule.imports[5]` 等 4 個 undefined，exit 1。修正後 `app`、`fleet-first`、`auth-first` 各於獨立 Node process 掃描 67 個模組、296 條邊，均無 undefined，exit 0。一般 App 載入順序在原版也會通過，不能單獨代表此 finding 已消除。 | 原 [CI run 45028180621 / job 137225685245](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45028180621/job/137225685245)；`build-original-afd052.log`、`graph-original-afd052-fleet-first.log`、`graph-fixed-{app,fleet-first,auth-first}.log`。原版使用 `before-tsconfig.json` 僅改 outDir 與 workspace 型別路徑，未改原候選原始碼；修正版為上述 repair anchor。probe 命令見下。 | probe 載入正式編譯碼並解析 Nest imports／forwardRef，未 mock 模組、未建立 Nest application、未執行 provider／生命週期或啟動服務。完整 hosted startup／browser CI 須對新候選重新執行。 |
| 同一事務核可、邀請、加密 outbox          | `SupplyReviewService`、`SupplySubmissionRepository`、`DriverDeviceSessionService`、`DriverOnboardingDeliveryService`；本輪只調整模組載入順序。                                                                                                                                                                                | 保留 Gemini 前輪核對結果；本輪重跑送件／核可提交與回滾、正式 repository 的 executor 路徑測試通過。                                                                                                                                                                                                               | `backend-unit.log`：4 檔 42 tests，exit 0；`repository-unit.log`：1 檔 9 tests，exit 0；合計 51。                                                                                                                                                                                                                                                                                             | SQL port／provider 邊界為 mock，未宣稱真實 PostgreSQL migration、commit／rollback 或跨 instance 競爭驗收通過。                                                                        |
| 六位數＋建檔手機、App Link 競爭同一邀請  | `DriverDeviceSessionService`、`DriverActivationLinksController`、Driver App activation／auth lifecycle。                                                                                                                                                                                                                      | 本輪既有測試涵蓋正確與錯誤手機／代碼、五次錯誤後 Link 仍可用、過期、雙 proof 併發只消耗一次、既有裝置工作階段與 App 路由。                                                                                                                                                                                       | 同上 backend tests；`driver-unit.log`：41 檔 598 tests，exit 0。                                                                                                                                                                                                                                                                                                                              | 簽署版 iOS／Android App Link 與實機驗收由 DRV-ONB-012 追蹤。                                                                                                                          |
| 通道獨立重試、遮罩及 strict ingress      | `DriverOnboardingDeliveryService`、`PlatformDriverOnboardingTransport`、`validateInternalKey`、association／fallback controller。                                                                                                                                                                                             | 本輪既有測試涵蓋通道暫時失敗與受理不明、兩通道同碼同 Link、遮罩及加密、專用 OIDC 排程授權、精確公開入口與相鄰入口拒絕。                                                                                                                                                                                          | 同上 backend tests；`build-fixed.log`：API 及前置 contracts／control-plane-auth 建置 exit 0；`lint.log`：兩個修改模組 ESLint exit 0。                                                                                                                                                                                                                                                         | Email／SMS 供應商及受控收件者實收、共享 dev 部署仍由既有部署與 DRV-ONB-012 驗收；本 VM 未啟動產品服務。                                                                               |

本 worktree 最初沿用 canonical checkout 的舊依賴，`build-before.log` 記錄其 Zod `3.25.76` 不支援 `guid()` 的建置失敗，不能當作產品重現。之後僅將本 worktree 的 ignored `node_modules` symlink 指向原候選既有、符合 lockfile 的依賴（Zod `4.6.7`）；未改共用 checkout、package.json 或 lockfile。詳見 `dependency-links.json`。

本輪六個套件（contracts、API、Driver App、Fleet Portal、Platform Admin、API client）的 typecheck 均為 exit 0，完整結果見 `typechecks.log`。各項檢查的退出碼另存同名 `.exit`；新候選仍須 Gemini exact-SHA review 與對應 hosted CI／merge，尚未宣稱整體任務完成。

可重跑的窄範圍檢查如下；所有必要檢查須讀取完成結果，不能將 scoped pass 當作 hosted CI、部署或外部驗收通過：

```bash
# 從指派 task worktree 執行；probe 僅載入 compiled app.module.js，不載入 main.js。
EVIDENCE_DIR=/home/lupin/workspace/drts-fleet-platform/.local/driver-onboarding-20261122/drv-onb-013-codex2-import-repair
timeout 180s pnpm --filter @drts/api build
for order in app fleet-first auth-first; do
  timeout 30s node "$EVIDENCE_DIR/check-compiled-module-graph.cjs" \
    "$PWD" "$PWD/apps/api/dist" "$order" || exit "$?"
done
timeout 120s pnpm exec vitest run \
  tests/unit/driver-activation-links.test.ts \
  tests/unit/driver-device-session.test.ts \
  tests/unit/driver-onboarding-notifications/delivery.test.ts \
  tests/unit/supply-submission.test.ts
timeout 120s pnpm --filter @drts/api exec vitest run tests/unit/supply-submission.repository.test.ts
timeout 120s pnpm --filter @drts/driver-app test
timeout 180s pnpm --filter @drts/contracts --filter @drts/api \
  --filter @drts/driver-app --filter @drts/fleet-partner-portal-web \
  --filter @drts/platform-admin-web --filter @drts/api-client \
  -r --workspace-concurrency=2 typecheck
```

### Root typecheck 修復（後續候選）

Gemini 已於 `2026-11-22T14:19:51Z` 核准候選 `f30312960704c39b35ed865cd5b6f923bc79241a`（[PR #3358](https://github.com/ajoe734/drts-fleet-platform/pull/3358)）。隨後同 SHA 的 [CI typecheck job 137243182459](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45031966586/job/137243182459) 在 root `tsconfig.json` 發現新 finding；前輪六個套件的 typecheck 不涵蓋此 root gate。這不是前輪循環匯入 finding 的再次退修。

本輪 delta 證據位於上述 `EVIDENCE_DIR/root-typecheck-repair/`，沿用既有 artifact，未複製前輪 log 或大型檔案。最終 SHA 由 candidate lifecycle 與本輪 `manifest.json` 記錄。

| Finding／驗收項                                               | 原始碼依據與修改位置                                                                                                                                                                                                      | 舊版重現 → 修正版結果                                                                                                                                                                                | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                                                                                                                                   | 未驗項與具體限制                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核可交易測試 fixture 遺漏必填契約欄位，使 root typecheck 失敗 | `DriverSupplyDraft.preferredVehicleSubmissionId: string \| null`；`SupplySubmissionRepository.persistDriverDrafts` 將此欄位寫入正式資料表。僅在 `delivery.test.ts` 的 `approvalFixture` 補 `null`，表示本情境未指定車輛。 | 舊 SHA 以正式 `pnpm typecheck:root` 重現唯一 TS2741，exit 2；修正 anchor `ab5a9164c014e8be7488daefcd1b4ce5c904ffe4` 執行完整 root＋workspace typecheck，exit 0（31 個套件範圍、37 個 Turbo tasks）。 | `ci-original-typecheck.log`、`root-typecheck-before-clean-cache.{log,json,exit}`、`full-typecheck-fixed.{log,json,exit}`；Node `22.23.2`、pnpm `10.33.0`、TypeScript `5.9.3`。既有 4 檔 42 個後端 tests 與 1 檔 9 個 repository tests 均通過，見 `backend-unit-fixed.*`、`repository-unit-fixed.*`；scoped ESLint 見 `lint-fixed.*`，exit 均為 0。 | 本輪只修測試資料契約，未改產品或 UI。SQL／供應商 doubles 的限制、共享 dev 及簽署實機驗收仍依上表與 DRV-ONB-012；新 SHA 的 CI／Gemini review／merge 尚待完成。 |

最初本機檢查受到 Node 預設 2 GB heap、worker 漏接部分依賴及舊增量型別解析快取影響；相關嘗試分別保留於 `root-typecheck-before*`，不算產品回歸通過。僅調整此 worktree 的 ignored 依賴連結，使 workspace 套件指向本分支原始碼、第三方套件沿用既有安裝，並移除本 worktree 產生的舊 `tsconfig.tsbuildinfo`。沒有修改共用 checkout、套件契約或 lockfile。完成環境修復後，`root-typecheck-before-clean-cache.log` 僅剩上述 TS2741。

完整 typecheck 已執行結束，所有必要本機檢查均已讀取結果。Next typegen 在六個 `next-env.d.ts` 自動增加的 import 已逐檔核對並還原，差異保留在 `next-typegen-generated.patch`；未納入候選。修正 anchor 之後的正式提交僅更新本驗收文件；產品原始碼與已核准的 `f30312960704c39b35ed865cd5b6f923bc79241a` 相同。前輪 finding、回歸與外部驗收限制仍保留於上表，不以舊 SHA 的 CI／review 代替新候選證據。

```bash
# 僅此檢查提高 Node heap；不修改專案設定、不啟動服務。
timeout 600s env NODE_OPTIONS=--max-old-space-size=6144 pnpm run typecheck
# 既有後端 4 檔及 repository 1 檔的命令沿用上一節。
```

### Migration allocation 缺漏定位（待 Supervisor 擴充 scope）

Gemini 已於 `2026-11-22T15:15:32Z` 核准候選 `982e0357b934dcb4167f015a9936e47b6ac90ec2`。該候選的 hosted typecheck、lint、build、integration 與 API unit jobs 已通過，但 [CI run 45036968286 / root unit shard 3 job 137263014560](https://github.com/ajoe734/drts-fleet-platform/actions/runs/45036968286/job/137263014560) 回報 migration allocation 缺漏。這是另一個新 finding，並非前兩項修復再次失敗；其餘未結束的 hosted jobs 不列為通過。

本輪 delta 證據沿用 `EVIDENCE_DIR/unit-shard-repair/`。原候選與遠端 task branch、PR head 在定位開始時皆為上述完整 SHA；未為同步 trunk 改寫 published history。

| Finding／驗收項                                                                        | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                                                                                                                                            | 舊版重現 → 修正版結果                                                                                                                                                       | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                   | 未驗項與具體限制                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增 V0140–V0142 後，共用 allocation ledger 仍只登記至 V0139，導致 root unit gate 失敗 | 正式 migrations 為 `V0140__driver_supply_email.sql`、`V0141__driver_onboarding_invitation_proofs.sql`、`V0142__driver_onboarding_delivery.sql`。`docs/04-uat/system-remediation-20260906/schema-allocation.json` 缺少這三項。`sr-recovery-contracts-20260911.test.ts` 的 allocation collectors 與最高版本 assertion（原候選第 253 行）、`sr-partner-notify-con-20260917.test.ts` 的同類 assertion（第 549 行）均讀取該 ledger。 | 在原候選呼叫兩份既有正式測試，58 cases 中 56 pass、2 fail，兩者均為 `expected 142 to be less than or equal to 139`，exit 1。尚未修改 ledger／collectors，無修正版通過結果。 | `ci-original-shard3.log` 記錄 hosted 分片 3630 pass、1 fail、16 skip，exit 1；本機 `allocation-before.{log,json,exit}`、`run-check.py` 記錄命令、完整 SHA 與 diff hash。Node `22.23.2`、pnpm `10.33.0`、Vitest `4.1.4`；命令見下。 | 修正所需三個檔案均不在本 dispatch 的 `write_scopes`。已用正式 `progress` 向 Supervisor 提出範圍需求，依 §0.7 待其核對平行衝突並擴充原任務 scope；未自行修改範圍外檔案或改弱 assertion。 |

修正邊界為在上述 ledger 追加 `driver_onboarding_allocations`，逐項登記三個既有 migration 的 task、確切檔名、schema／table 與 invariants；保留全部既有分配和 amendment，再讓兩份既有檢查的 allocation collectors 納入新群組。必要回歸包括版本不碰撞、檔名唯一且相符，以及最高 migration 不超過已登記分配；保留原 assertion。這三個 migration 在原候選均由 DRV-ONB-013 新增，查核到的 `origin/dev`（`b58970da4c69a66053284e1f5f8198619966829c`）ledger 同樣止於 V0139。此靜態查核不能代替 Supervisor 的正式 scope 協調。

本機只恢復此 isolated worktree 的 ignored root／contracts 依賴連結，沿用前輪符合 lockfile 的安裝；變更位置與前後連結記錄於 `dependency-links.json`。未新增工作副本、未修改共用依賴或 lockfile、未啟動任何產品／browser／DB 服務。本輪只完成缺漏定位，不將 checkpoint 當作可交審候選；共享 dev 與簽署實機驗收仍由 DRV-ONB-012 追蹤。

```bash
timeout 120s pnpm exec vitest run \
  tests/unit/system-remediation/sr-recovery-contracts-20260911/sr-recovery-contracts-20260911.test.ts \
  tests/unit/system-remediation/sr-partner-notify-con-20260917/sr-partner-notify-con-20260917.test.ts
```
