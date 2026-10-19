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

| Finding／驗收項      | 原始碼依據與修改位置                                               | 舊版重現 → 修正版結果                                                                                                | 命令、退出碼、版本與證據位置                                                                                    | 未驗項與具體限制                                       |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| CI inline JSX 版本列 | `PublicFareCard` → `t.VersionInfo(fare.version, fare.effectiveAt)` | 舊 candidate 本機重現兩項 `jsx-text`，exit 1；source anchor `4e8c31c7f8a6036f8d196bf26402879b6ea4699f` 修正版 exit 0 | `pnpm run i18n:guard`；本 worktree `.local/pax-fare-copy-20261015/ci-repair/i18n-before.log` / `i18n-after.log` | 新 SHA 需重新 hosted CI／Claude2 review；原 key 未記錄 |

本輪 source anchor `4e8c31c7f8a6036f8d196bf26402879b6ea4699f` 的檢查均已等到結束並讀結果；以下 log 在同一 `ci-repair/` 目錄，環境仍為 Node v22.23.2 / pnpm 10.33.0 / Vitest 4.1.4：

- `pnpm run i18n:guard`：exit 0，665 files / 11 apps；使用原有 81 exemptions，未新增例外（`i18n-after.log`）。
- `pnpm --filter @drts/passenger-app-web lint`：exit 0（`lint.log`）。
- `pnpm exec vitest run tests/unit/pax-fare-copy-20261015 --reporter=dot --maxWorkers=2`：exit 0，30 passed / 0 skipped（`unit.log`）；包含兩個 API 版本／生效日經正式元件呈現的既有案例，沒有另造鏡像測試。此次變更僅抽取版本列翻譯；前輪 384 passed / 3 hosted skips 的完整選集結果保留於上節，未宣稱本輪重跑。
- `pnpm --filter @drts/passenger-app-web typecheck`：初次 exit 2（`typecheck.log`），本次重新建構工作樹缺 ignored `apps/passenger-app-web/node_modules/@drts/api-client`，導致既有 booking import 無法解析；僅建立指向本 worktree `packages/api-client` 的本地連結後，原命令 exit 0（`typecheck-linked.log`）。未修改任何 tracked 依賴、共用 node_modules、booking 或 tsconfig。
- 全 App 原指令 `git grep -n -e '每 80 秒' -e '+20%' -e '指派前取消' -- apps/passenger-app-web`：exit 1，無匹配。`git diff --check`：exit 0。`python3 tools/ci/git/check_commit_trailers.py --base b7d6b04b18a4a6b0cc47c37ba426bc5ad468e952 --head HEAD`：4 commits OK，exit 0；最終文件 commit 再核對。

舊 candidate 的完整 PR CI run `38837839669` 隨後因新 source push 結束為 cancelled；其已結束的 i18n job failure 如上，不記為綠燈。新 source anchor 及本次最終 candidate 的 hosted runs 各自屬於其 SHA，只有最終 candidate 的 CI/review 可以供 acceptance 使用。最終 commit 僅追加本驗收紀錄，source/test bytes 與本輪已驗 anchor 一致；交接時重新核對 local HEAD／remote branch／PR head。既有 bus 在 native handoff 後將 draft PR 轉 ready 並觸發 full integration CI，尚待該 SHA CI／獨立 Claude2 review／protected merge，不記錄 key、不呼叫 done。

- 分支：`codex/pax-fare-copy-20261015-delivery-r2-20261016`；[PR #2724](https://github.com/ajoe734/drts-fleet-platform/pull/2724)，base dev，正常 non-force push。
- `30b763a681c2387eee13192a32e70cc655abfb17` 為已推送 source/checkpoint，**不是 review candidate**。最終 candidate 為包含本 UAT 的最終 HEAD；owner 在 native handoff 以完整 `CANDIDATE_SHA`、`CANDIDATE_BRANCH`、`PR_URL` 鎖定，與遠端 PR head 比對後記錄。後續文件 closeout 不改上述已驗 source/test bytes。
- 獨立 reviewer：Claude2。CI run/job、reviewed SHA、merge SHA 與唯一 acceptance key 在 native lifecycle 綁定同一 candidate；目前未宣告 CI、review、merge、key 或整個 Goal 完成。
- Browser、真實 hosted fare API／畫面與部署未執行；此 VM 禁止產品環境。若需要這些觀察，走既有 hosted workflow，不以本機單元結果冒充。新測試位於 root Vitest include 的 `tests/unit/**`，現有 integration CI 的 `pnpm run test:unit` 會執行。

## 2026-10-19 USER 三頁確認單：A03 公告文字續辦

本輪採 Root 正常續辦完整原 `PAX-FARE-COPY-20261015`（四個 scope、原唯一 key 與兩項完整驗收），由 Codex2 實作、Codex 獨立審查；原 Codex／Claude2 作者與審查歷史如上保留。基底為已接受的 `daebd72eeef12229cb59d3750b7a288b1dab7448`，獨立分支 `codex2/pax-fare-copy-submission-announcement-20261019`，未混入尚未接受的 Shell footer 或其他候選。上方版本、舊 CI／skip／failure 及部署限制均是所列舊候選的歷史，不借為本輪通過。

| 本輪位置                                 | 舊顯示                           | 本輪顯示／正式資料來源                                                                                                                                              |
| ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translations.ts` 的 `CurrentRegulation` | 本頁依主管機關備查之現行版本公告 | **本頁依主管機關公告之現行運價揭露**，逐字採最新 USER 確認單。                                                                                                      |
| `VersionInfo(version, effectiveAt)`      | 僅 API 版本與原生效時間          | API 生效時間以 `Asia/Taipei`／民國曆顯示；本次版本為 **依臺北市政府公告計程車運價（112/04/01起實施）**，另保留 API 真實版本及原生效時間。不同日期不硬套 112/04/01。 |

沒有改 `passenger-ride-page.tsx`、PublicFareCard API 請求／loading／error／invalid gates、四列實際金額、夜間 pickup／any_overlap 規則、取消權限、Journey ETA／評價／首頁、API 或計價引擎。現行四列仍由正式 `passengerClient.getFares()` 的 `currentVersion` 決定；原取消不收費、改派不收費及 on_trip disabled 行為保留。本輪未修改 E19a／E19b 或完整旅約；其新八項固定文案屬原 Booking task，舊契約版本的歷史資格仍保留。

既有 A03 mounted integration unit 只 mock HTTP，保留正式 client snake_case 轉換與元件 render。原兩個版本案例新增公告／頁尾斷言，另增加原 API 將臺北 112/04/01 零時序列化為 UTC `2023-03-31T16:00:00.000Z` 的實際呈現案例，避免顯示成 112/03/31；原有四列、不同 API 數值、缺漏／錯誤、retry、離頁、免費取消及 on_trip disabled assertions 均保留。

- 真 before：同三個公告案例對 accepted daeb 原 Source，exit 1、3 FAIL（缺公告文案）；`-t` 之外 28 個案例未執行，不能算全套結果。
- 真 fixed：`pnpm exec vitest run tests/unit/pax-fare-copy-20261015/ --maxWorkers=1 --no-cache`，exit 0、31 PASS、0 skipped，含原完整 30 案與新增 UTC 日期案。
- 其餘適用 scoped typecheck／lint／format／i18n／原全 App 舊字串 grep／diff 以本輪 immutable candidate packet 的實際命令、exit 與 raw log 為準；未跑 VM browser、PG、server 或產品 build。
- 原 UAT 15616 bytes、SHA256 `0da068ba33acf540a2ab2396c40ea2c1ff5b89033b4a723d90495765a52b1323` 已逐 byte 保存。正常 mandatory Prettier 僅機械調整一處既有表格對齊，加上本段；不稱歷史 raw prefix byte equal，舊內容與結果語義不改。
- 新 candidate 自身 mandatory CI、Codex 獨審、protected merge 與共享部署各自待真結果；local 31 PASS 不代表 hosted build、共享 A03 畫面、全產品／正式域名或法律旅約已採認。Writer 不填 key、不 merge／deploy。

原始命令／log／formatter preview 與最終 Source manifest 保存在 canonical root `.local/passenger-bureau-gap-correction-20261018/fare-copy-submission-announcement-20261019/`。技術窗口蔡尚志 0988220716 不混為客服；客服仍為 02-2944-0985。本輪沒有依賴安裝、DNS／IAM／key／付款政策變動。

## 2026-10-19：第一階段交付後正常恢復原 Fare

Root 已依原同一任務正常 reviewer reopen，維持四個 scopes、原唯一 key、兩條完整驗收及 Codex2／Codex 角色；Source gate `7f237002fcedf96ebc3904d0bb455762ce2538f184a5ee788f9a2c7684a8b56c` 與完整 USER spec `d52256929cf39294ebc2517f2480792b1a32337331befe9e32688a020f0c2f9e` 不取代或刪除前述原始要求。正常 owner start exit 0，舊 daeb／原 Fare branch 的三檔 WIP 全部逐 byte 保存，沒有 reset、stash 或覆寫原 refs。Booking 雖共用實體 worktree，本輪沒有進入其 branch、Source 或文案範圍。

本輪生產碼仍只有既有 `CurrentRegulation`／`VersionInfo` 兩個 translation hunks；不修改 RidePage、計費引擎、ETA、rating、Receipt、API、Booking、登入或取消授權。版本日期由 API 真正 `effectiveAt` 轉為臺北民國日期，並保留真 `version`／原 ISO。現有 API invalid gate、四列真數值、loading／retry／unmount、免費取消與 on_trip disabled 全保留。原 31 案不刪改，另增加一個正式 API→元件的未來日期案例：API 回 `2030-04-01T00:00:00+08:00`／其真版本時，公告應呈現 `119/04/01`，不可硬套 `112/04/01`。此案例只驗真日期傳遞，不宣稱新的費率已在共享環境生效。

上節 3 FAIL／31 PASS 及舊 noEmit／lint 是原列版本的歷史，不能當本輪新候選結果。目前依 Root 序列安排，尚未取得健康本地依賴圖，因此沒有在 Fare 污染 graph 跑 Node、install、新增 symlink、hooks、test 或 compiler。取得 Root 正常圖 loan 後，才保留原 WIP 正常 checkpoint／merge 指定的 accepted607，保留 Journey 的 `LiveRouteEstimateUnavailable` 與其餘所有 peer Source，再執行必要 mounted unit、原全 App 舊字串 grep、i18n、scoped lint／noEmit 與正常候選流程。若 mandatory formatter 產生本 task 四 scope 外的 hunk，先交 Root 精確正常協調，不自行擴權。

本輪檢查與新 immutable candidate／own CI／獨立 review 後續以實際原 log／退出碼補充；不借 ENTRY 或 Journey 綠燈、不錄 key、不自行 approve／merge／deploy。尚未觀察共享 A03 畫面、真外部費率公告或法律旅約整體採認。
