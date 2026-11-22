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
