# PAX-FARE-COPY-20261015 — 公開費率與取消說明

## 依據與修改邊界

- 使用者 2026-10-10 決定（canonical root `.local/passenger-app-20261009/common.md` 補充 A7/A9）：G201011 四列、取消一律不收費，含指派後；on_trip 取消限制不變。
- 原 task brief 與本次完整 R2 task spec：保留原四個 write scopes、兩條 acceptance 與唯一 key `pax-fare-copy_aligned_with_g201011`。
- `docs/02-architecture/passenger-app-20261009/02_content_and_rules.md` 費率定案：版本 `taipei-20230401`，所有金額為整數 TWD，夜間每趟固定金額；該文件較早的取消待定文字由上述明確使用者補充取代。
- 版型核對 `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html`、`p5-screens.jsx` 的 `P5_A03`，及 `packages/ui-tokens` 經 `passengerChrome` 提供的 passenger/P5 tokens。沿用 Card、四列、字體、間距與 badge，不新增色碼或重新設計。canvas 舊費率／虛構版本由使用者決定及實際 API 取代。
- Root 正常 R2 精確 hunk 交接已採用，本工作從當時最新已接受 dev `b7d6b04b18a4a6b0cc47c37ba426bc5ad468e952` 的乾淨 assigned worktree 開始。Demo/Ride 其他邏輯與原 lifecycle、HOLD、驗收仍屬原 lane。

## 實際 producer / caller

`PassengerFareService.fares()`（`apps/api/src/modules/passenger-app/fare/passenger-fare.service.ts`）讀正式 published tariff，回 `currentVersion`。`FareVersion` / `FaresResponse` 在 `packages/contracts/src/passenger-app.ts`；producer 的 `PassengerFaresResponse` 另明示 `nightSurchargeUnit: TWD_per_trip` 與 `nightApplication: pickup | any_overlap`。

正式消耗路徑：`RideContent` 的 A03 → `FareCard(publicMode)` → `PublicFareCard` → 既有 `passengerClient.getFares()` → `passengerFetch` → `/api/passenger-app/fares`。既有 client 處理 envelope 與 snake_case 轉換。沒有把不同契約的 `fixture.fareVersion` 當作這個 DTO，也沒有硬編成功費率或備查文號。既有獨立 `/fares` 預約頁已使用其正式 API，本 task 不改它。

| 顯示           | 修改前                               | 修改後（API 回定案值時）                                    | 正式欄位                                                          |
| -------------- | ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| 起程           | 起程運價（1.25 公里）NT$ 85（寫死）  | 起程運價（1.25 公里）NT$ 85                                 | baseDistanceMeters / 1000、baseFare                               |
| 續程           | 續程運價（每 200 公尺）NT$ 5（寫死） | 續程運價（每 200 公尺）NT$ 5                                | distanceIncrementMeters、distanceRate                             |
| 延滯           | 延滯計時（每 80 秒）NT$ 5            | 延滯計時（每 60 秒）NT$ 5                                   | delayIncrementSeconds、delayRate                                  |
| 夜間           | 夜間加成（23:00–06:00）+20%          | 夜間加成（23:00–06:00）每趟加 NT$ 20                        | nightSurchargeWindowStart/End、nightSurcharge、nightSurchargeUnit |
| 版本／適用時機 | 虛構 F-2026-03／生效日／備查         | API 實際 version、effectiveAt；夜間以上車時間或時段重疊為準 | version、effectiveAt、nightApplication                            |
| 取消           | 指派前取消不收費                     | 取消不收費（指派前及可取消的已指派畫面）                    | `t.CancelFree`、Actions；保留 canCancel 判斷                      |
| 改派           | 改派期間取消不收費                   | 保持原文                                                    | `t.CancelFreeDuringReassign`                                      |

`isCurrentPublicFare` 檢查版本／生效時間、整數非負金額、正數距離／秒數、合法夜間時窗、單位與適用規則。未取得或無效回應不顯示價格及「已生效」。請求失敗顯示「目前無法取得公開費率，請稍後重試。」並提供原樣式重試。離開元件後不採用過期結果。取消只改呈現，保留原 canCancel、cancelNote、送出契約與付款／後端規則。

## finding / acceptance 證據

| Finding／驗收項                                         | 原始碼依據與修改位置                                                                                  | 舊版重現 → 修正版結果                                                                                           | 命令、退出碼、版本與證據                                                                                                   | 未驗項與限制                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 四列仍用舊常數，且以不同 fixture fareVersion 阻擋公開表 | passenger-ride-page.tsx：FareCard、PublicFareCard、isCurrentPublicFare；既有 PassengerClient.getFares | 舊 dev `b7d6b04b1` 同組測試 28 fail / 2 pass；修正 source `30b763a681c2387eee13192a32e70cc655abfb17` 為 30 pass | 下列 before/after 指令；before exit 1，after exit 0                                                                        | HTTP transport mock，不代表真實 hosted API 已觀察       |
| 缺資料／錯誤被假成功遮蔽的回歸邊界                      | 正式 A03 掛載，實際 client 轉換及元件 effect/render                                                   | 載入、503→重試、19 組缺漏／錯誤欄位、離開後完成；另以不同數值／版本／夜間規則證明所有欄位傳遞                   | 同 after 指令，30 pass 包含四列與取消測試                                                                                  | 不 mock 被驗證的 client／formatter／元件；只 stub fetch |
| 舊取消文案                                              | translations.ts：CancelFree；Actions 指派前與已指派說明                                               | 舊版四個畫面皆缺「取消不收費」；修正四個畫面通過；改派文字及 disabled on_trip 取消通過                          | 同 after 指令                                                                                                              | 不改取消授權、實際扣退款、SSE、收據或其他 lane          |
| 全 App 舊字串清空                                       | 整個 apps/passenger-app-web                                                                           | 舊版 git grep 3 命中；修正無命中                                                                                | `git grep -n -e '每 80 秒' -e '+20%' -e '指派前取消' -- apps/passenger-app-web`：exit 1（無匹配）；測試將此結果斷言為 pass | 非縮小到兩個檔案；package 外歷史追溯不在此 grep 範圍    |
| `pax-fare-copy_aligned_with_g201011`                    | 上述原始碼、全部原驗收                                                                                | Source 及單元證據如上；尚未宣告 key 完成                                                                        | 同 candidate CI、獨立 Claude2 review、protected merge 由既有 lifecycle 記錄                                                | hosted CI／review／merge 尚待；不借用 Demo/Ride 舊證據  |

## 可重跑命令與實際結果

執行環境：Node v22.23.2、pnpm 10.33.0、Vitest 4.1.4；全部在 assigned worktree，沒有啟動產品、HTTP、browser、PG 或 Docker server。

1. `pnpm exec vitest run tests/unit/pax-fare-copy-20261015 --reporter=dot`
   - before：基底 `b7d6b04b18a4a6b0cc47c37ba426bc5ad468e952` 產品碼，exit 1，28 failed / 2 passed；先測後改，沒有 reset 活躍樹。
   - after：source anchor `30b763a681c2387eee13192a32e70cc655abfb17`，exit 0，30 passed。
2. `pnpm --filter @drts/passenger-app-web lint`：exit 0。
3. `pnpm exec eslint tests/unit/pax-fare-copy-20261015 --max-warnings=0`：exit 0。
4. `pnpm --filter @drts/passenger-app-web typecheck`：初次 exit 2，isolated worktree 缺本地 `node_modules/@drts/api-client` 連結而無法解析既有 booking-form import；補 ignored 本地套件連結後原命令 exit 0。未改 tsconfig、lockfile 或共用 node_modules。
5. `pnpm exec vitest run tests/unit/pax-fare-copy-20261015 tests/unit/pax-web-ride-ui-20261009 tests/unit/pax-web-shell-20261009 tests/unit/pax-web-booking-ui-20261009 tests/unit/pax-review-shared-order-demo-20261015 --reporter=dot`
   - 初次 exit 1，383 passed / 1 failed / 3 skipped（42 files）。唯一失敗為既有 review-context 測試以 app 本地 `node_modules/next/navigation` 路徑 mock，但該 worktree 缺 Next 連結，未攔到真實 import。
   - 僅補 ignored 本地 Next 連結後，既有 review-context 3 tests 全過（exit 0）。完整同選集再跑為 383 passed / 1 failed / 3 skipped；失敗改為既有 booking `quote503 keeps route context` 的 `findByText` 等待逾時。
   - 不修改 source、測試或 timeout，以同指令加 `--maxWorkers=2` 重跑完整選集：exit 0，39 files passed / 3 skipped，384 tests passed / 3 skipped，耗時 137.92 秒。三個 skip 為既有 `persisted-roles.hosted`、`dispatch-supply-schema.hosted`、`dynamic-supply.hosted` 的 hostedPaymentEnabled gate，並非本 task 測試跳過；未冒充 hosted 驗收。
6. `git diff --check`：exit 0。

7. `python3 tools/ci/check_test_coverage.py`：exit 0（既有 99 個 Python test files 可由 CI 收集；新 TypeScript 測試之 CI 路徑另由下節所列 Vitest/CI 契約核對）。`python3 tools/ci/git/check_commit_trailers.py --base b7d6b04b18a4a6b0cc47c37ba426bc5ad468e952 --head HEAD`：兩個 checkpoint commits 通過；final closeout 再檢查同一範圍。

完整本機 log 位於此 worktree `.local/pax-fare-copy-20261015/`：`before.log`、`after.log`、`lint.log`、`test-lint.log`、`typecheck.log`、`typecheck-linked.log`、`regression.log`、`review-context-linked.log`、`regression-linked.log`、`regression-final.log`。
before log SHA256 `9796a2abbbefb430485d70228df67bb6245cb710c4bf62d10940eb54588fbf9c`；after log SHA256 `843307c11410caf18c205a4b6fa42b1fc0c86074a2a35a35a80580e5b7f57213`。React 的既有 act/style 與預期 SSE error 訊息保留在原 log，不當成 browser 驗收。

## Candidate / PR / 外部驗收

### CI 退修：版本列 inline JSX（2026-10-16）

- 相鄰舊候選：`0c02b25be1f7ea683d1db35a591c812be7a8342d`，generation `01e24789a4924d558bb60b577edc7277`；尚無獨立 review。正式 [PR CI i18n guard job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38837839669/job/116771608012) exit 1，指出 `passenger-ride-page.tsx:881` 的「版本」與「· 生效日」兩項 `jsx-text`。
- 呼叫路徑：A03 → `PublicFareCard` 的版本列。修正邊界限於該列及 `translations.ts` 的既有 `VersionInfo`：改成接受 API `version` / `effectiveAt` 的翻譯函式，取代未被引用的虛構版本常數；畫面、四列金額、API、夜間規則、取消、樣式及其他 lane 邏輯不變。

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| CI inline JSX 版本列 | `PublicFareCard` → `t.VersionInfo(fare.version, fare.effectiveAt)` | 舊 candidate 本機重現兩項 `jsx-text`，exit 1；修正版待下列檢查 | `pnpm run i18n:guard`；本 worktree `.local/pax-fare-copy-20261015/ci-repair/i18n-before.log` | 新 SHA 需重新 hosted CI／Claude2 review；原 key 未記錄 |

本輪後續命令與結果會追加於此，保留前輪所有實際失敗及驗證，不借用舊 SHA 的 CI。

- 分支：`codex/pax-fare-copy-20261015-delivery-r2-20261016`；[PR #2724](https://github.com/ajoe734/drts-fleet-platform/pull/2724)，base dev，正常 non-force push。
- `30b763a681c2387eee13192a32e70cc655abfb17` 為已推送 source/checkpoint，**不是 review candidate**。最終 candidate 為包含本 UAT 的最終 HEAD；owner 在 native handoff 以完整 `CANDIDATE_SHA`、`CANDIDATE_BRANCH`、`PR_URL` 鎖定，與遠端 PR head 比對後記錄。後續文件 closeout 不改上述已驗 source/test bytes。
- 獨立 reviewer：Claude2。CI run/job、reviewed SHA、merge SHA 與唯一 acceptance key 在 native lifecycle 綁定同一 candidate；目前未宣告 CI、review、merge、key 或整個 Goal 完成。
- Browser、真實 hosted fare API／畫面與部署未執行；此 VM 禁止產品環境。若需要這些觀察，走既有 hosted workflow，不以本機單元結果冒充。新測試位於 root Vitest include 的 `tests/unit/**`，現有 integration CI 的 `pnpm run test:unit` 會執行。
