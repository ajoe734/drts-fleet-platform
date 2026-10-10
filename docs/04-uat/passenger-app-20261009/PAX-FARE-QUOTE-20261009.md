# PAX-FARE-QUOTE-20261009 實作與驗證紀錄

Owner: Codex2；Reviewer: Claude。2026-10-10。

Supervisor 2026-10-10 已增補 guard 寫入範圍；F-GEO-01 已修復並完成本機
四路由 × 三環境的正向／拒絕回歸。本次候選與同 SHA CI 的最終結果記在下方
「2026-10-10 dispatch 修復」引用的 evidence manifest。review、merge、PG 與正式
運價發布仍須沿既有 lifecycle 驗收；下列前輪 checkpoint 記錄保留供追溯。

## 依據與未定稿項目

- `.local/passenger-app-20261009/common.md` A7/A12 與
  `docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md` §3/7/9。
- 正式 API 型別：`packages/contracts/src/passenger-app.ts` 的 `FareVersion`、
  `FaresResponse`、`FareQuoteCommand`、`FareQuoteResponse`。
- 數字來源：`02_content_and_rules.md` §1「費率頁數字」：起程 85 元／1250m、
  續程 5 元／200m、延滯 5 元／80s、23:00–06:00 加成 20%。該 SD 引用
  `E05_公開計費說明.png`；來源 ZIP SHA256 為
  `3e4350a2069f1396dd111b21246f62d208983eaac2af070d08c8fe084a2682da`。
  dispatch worktree 沒有 SD 所列的 `docs/05-ui/driver app (21).zip`，本輪未重新擷取。
- **未定稿：正式版本 ID／生效日期、距離與延滯不足一跳的計收、夜間跨時段的
  套用方式、加成後金額的進位單位與規則。待使用者／SD 確認後另行發布。**
  V0112 **完全不 seed**，不把測試設定當作官方運價。未有生效版本時 fares 和
  可服務區域內的 quotes 回 `503 unavailable`。
- 測試 fixture 僅使用上述 SD 數字；`unit-only-sd-rates` 的生效日、ceil/floor、
  金額進位及 nightApplication 都是明確標示的 **synthetic test rules**。
- 配號來源：`docs/04-uat/system-remediation-20260906/schema-allocation.json`，
  本 task 只新增 `V0112__passenger_fare_quote.sql` 與被配給的兩張表。

## 實際修改與呼叫路徑

- `PassengerFareController.fares`：公開 `GET /api/passenger-app/fares`，使用
  `@OpenRoute`；嚴格環境仍經現有 BFF metadata/internal-key 邊界。
  `PassengerFareRepository.publishedTariff(now)` 只讀 published 且生效中的版本；
  無版本／同時存在多版本／壞規則／資料庫不可用都 fail closed。
  `nightSurcharge` 的 wire 值是 **比例 0.2**，不是百分數 20；內部存 2000 bps。
- `PassengerFareController.estimateQuote`（首輪名為 quote）→ `PassengerFareService.quote`：
  `PassengerAccountService.getMe` 驗證正式乘客 JWT 身分與 live session/account；
  不接受 body 的 passenger ID、價格或版本。支援 contract camelCase 與現行
  snake_case wire keys，拒絕別名重複、未知欄位、字串/null 座標、無時區、
  不存在的日期及過去時間。
- `ServiceAreaService.evaluate(taxi_reservation, scheduledAt)`：先判上下車點；
  外界、deny 或 manual_review 都回 `not_serviceable` 並附完整 evaluation，
  不呼叫 route、不產生 snapshot。乘客試算要求兩站都有有效 coverage，避免
  共用 evaluator 的 empty-catalogue permissive 行為被當成可叫車。
  **共用 service-area 程式未改**；其 module 已 export 判定服務。
- `GeoService.route` 使用 server 端座標、drive 與登入帳號 ID，再交純函式
  `estimateFare`。區間為距離車資加 **零至全程 duration 的延滯跳數**，
  是保守界限，不是交通延滯的機率預測；未包含未知通行費／清潔費／專程送還。
  回 `isGuaranteed: false`、route、breakdown 與 rangeBasis，實際收費仍依完成金額。
- 引擎只採明確傳入的版本規則；夜間使用台北時間（UTC+8），開始 inclusive、
  結束 exclusive，支援明確的 pickup 或 any_overlap 規則；不替官方選規則。
  BigInt 計算百分比／總額進位，拒絕負數、非有限 metric、零 increment 及 overflow。
- Snapshot 綁帳號、兩站、預約時間、route、版本、完整 tariff/range/breakdown、
  service-area 結果；15 分鐘有效，等 route 完成後重新確認預約時間未過期。
  `findOwnedSnapshot` 以 UUID 與 owner 同時篩選，提供後續 BOOKING task 使用；
  BOOKING 尚須檢查 expiry、exact route/scheduledAt match 及交易內消耗。
- `passenger-app.module.ts` 只附加 controller/provider/import/export，使用原本
  GeoModule、ServiceAreaModule 的 exports，供後續 BOOKING 使用 fare repository。
- `auth.policy.ts` 只附加 GET search 與 POST resolve/reverse/route 的 passenger
  policy。正式 guard 將原 geo class decorator realms 與 policy union，保留原 realm。
  不加 geo health/admin/service-area 管理路由的乘客權限。

## F-GEO-01：乘客 JWT 仍不能使用 geo（前輪未修復；本輪結果見後節）

觸發：實際 `GeoController` metadata + live passenger JWT，呼叫 GET geo/search 或
POST geo/resolve/reverse/route。development／staging／production 均回 `JWT_INVALID`。
預期：四個路由接受 live passenger，logout 後拒絕；原六個 realm 繼續通過。

精確定位：

1. `BootstrapAuthGuard.canActivate` 僅在 `passenger-app/*` 呼叫 `activatePassenger`。
2. 四個 geo 進 `activateNonIap` → `JwtAuthService.verifyAccessToken`；舊 issuer/audience
   不驗乘客 JWT，且 legacy service 明確排除 passenger。
3. `activateNonIap` 的 `!payload` 分支只嘗試 system workload identity，然後在
   `bootstrap-auth.guard.ts:506` 回 JWT_INVALID，未呼叫 passenger session authority。
4. 新 policy 只增加 realm，不能替代 JWT/session authentication。

所需 scope：**`apps/api/src/common/auth/bootstrap-auth.guard.ts`**，不在 dispatch
現有 write_scopes。已用指定 release 的 `ai-status.sh note` 留下 Supervisor
coordination request；本輪不越範圍修改該檔案。

修正邊界：在 legacy verification 失敗且 resolved policy 明確允許 passenger 時，
才透過已注入的 `PassengerAccountService.authenticateAccessToken` 驗證 JWT 與 live
family；成功後套用既有 realm/scope 檢查及設定 request identity。保留正常 legacy
verification 路徑，其他路由／wrong method／health／管理權限不增加 passenger。
必要回歸為已提交的 `geo-realm.test.ts`：四路由 × 三環境正向／logout，既有六個
realm、無 Bearer、錯誤路由與公開 fares BFF 的合法及拒絕情境。

## SQL 逐欄核對清單（owner 靜態核對；reviewer／PG 尚待）

`publishedTariff` 的 SELECT → `fare_versions`：

| SQL 欄位                                 | 正式型別／映射                                             |
| ---------------------------------------- | ---------------------------------------------------------- |
| version                                  | varchar(100) PK → version                                  |
| status                                   | draft/published/retired；WHERE 僅 published                |
| effective_at, effective_until            | timestamptz；from inclusive / until exclusive；ISO 映射    |
| base_fare, base_distance_meters          | integer → baseFare / baseDistanceMeters                    |
| distance_rate, distance_increment_meters | integer → distanceRate / distanceIncrementMeters           |
| delay_rate, delay_increment_seconds      | integer → delayRate / delayIncrementSeconds                |
| night_surcharge_bps                      | integer 0–10000 → nightSurchargeBps；公開除以 10000        |
| night_window_start, night_window_end     | HH:mm → nightSurchargeWindowStart / End                    |
| additional_fees                          | jsonb object → additionalFees；讀取時驗非負整數            |
| distance_rounding, delay_rounding        | ceil/floor → 對應 engine rules                             |
| total_rounding, total_increment          | ceil/floor/nearest、正 integer → totalRounding / Increment |
| night_application                        | pickup/any_overlap → nightApplication                      |
| source_reference                         | nonempty text → sourceReference                            |
| created_at                               | timestamptz default now；repository 不寫／不公開           |

Snapshot INSERT 與 owned SELECT → `fare_quote_snapshots`（同一組 16 欄）：

| Placeholder | 欄位／映射與限制                                                                     |
| ----------- | ------------------------------------------------------------------------------------ |
| $1          | fare_snapshot_id UUID → fareSnapshotId                                               |
| $2          | drts_passenger_id varchar(100)，FK accounts，owner 取自 server                       |
| $3          | fare_version varchar(100)，FK fare_versions → fareVersion                            |
| $4, $5      | origin_lat / origin_lng double precision，範圍 ±90/±180                              |
| $6, $7      | destination_lat / destination_lng，與 origin 同型別                                  |
| $8          | scheduled_at timestamptz → scheduledAt；晚於 created_at                              |
| $9          | route jsonb object → JSON.stringify(route)／pg object                                |
| $10         | tariff_snapshot jsonb object → 完整當時規則                                          |
| $11         | breakdown jsonb object → 當時計算明細                                                |
| $12         | service_area_evaluation jsonb object → 當時預檢結果                                  |
| $13, $14    | estimated_min / max bigint；0 ≤ min ≤ max ≤ MAX_SAFE_INTEGER；讀取 Number(pg string) |
| $15, $16    | created_at / expires_at timestamptz；0 < expiry-created ≤ 15 分鐘                    |

不另造 PG schema、不以 mock SQL 通過冒充正式 PG constraint／時段查詢驗收。
發布重疊版本會 `unavailable`，不任選最新一筆。兩表沒有公開 mutation API。

## §0.7 逐項證據（前輪 checkpoint，非本次候選結果）

Code checkpoint：`932fbc39b2b8f13da87b903ae913b7e389a9bb1a`。
前一 checkpoint：`403f95dbd4bceece77a58a240d4574a0c6facfa7`；皆非候選。
Branch：`codex2/pax-fare-quote-20261009`。PR／candidate／review／CI／merge：未建立或未發生。
文件 commit 不改上述 code checkpoint。

Machine-specific evidence root：
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/PAX-FARE-QUOTE-20261009/`。
執行版本 Node v22.23.2、pnpm 10.33.0、Vitest 4.1.4、TypeScript 5.9.3。
所有列為 pass/fail 的命令都已等完成並讀結果；必要 hosted CI 未啟動。

| Finding／驗收項                             | 原始碼依據與修改位置                                                     | 舊版重現 → 修正版結果                                      | 命令、退出碼、證據                                                                                                                                    | 未驗項與限制                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| pax-fare_tariff_and_engine（部分驗證）      | V0112；estimateFare；SD §費率頁數字                                      | 新功能，舊版無引擎；31 個 boundary cases pass              | `pnpm exec vitest run tests/unit/pax-fare-quote-20261009/engine.test.ts .../service.test.ts .../repository.test.ts`，exit 0，67 pass；fare-suite.json | 未 seed；正式規則未定稿；PG 尚未驗                                                                    |
| pax-fare_quote_and_public_fares（部分驗證） | PassengerFareController/Service/Repository；正式 account／geo／area 呼叫 | 新功能；30 個 service、6 個 repository boundary cases pass | 同上 exit 0；fare-suite.json；mock 僅 storage／external geo provider                                                                                  | 正式 PG schema／repository 實測由 PAX-QA；geo passenger 未修，整體 acceptance 未通過                  |
| F-GEO-01（未解）                            | BootstrapAuthGuard.canActivate/activateNonIap；auth.policy 新增四路由    | 現有正式 guard 在三環境拒絕四路由；尚無修正版              | `pnpm exec vitest run tests/unit/pax-fare-quote-20261009/geo-realm.test.ts`，exit 1；geo-scope-blocked.json：12 fail、29 pass、1 skip                 | 待 Supervisor 增補 guard write_scope；development strict-metadata negative case 不適用，因此明確 skip |
| 其他 realm、公開 BFF 與錯誤路由             | 實際 GeoController／PassengerFareController metadata + production guard  | 正向六個 realm 及拒絕情境通過                              | 上列 geo-realm：29 pass；JWT/session 邏輯為正式程式，Google adapter 只在外部邊界 stub                                                                 | hosted BFF/runtime 未驗                                                                               |
| 共用 geo/service-area 回歸                  | 原 GeoService／ServiceAreaService；不改其行為                            | 41 pass                                                    | `pnpm --filter @drts/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts`，exit 0；area-geo-existing.json      | 不代表 PG／外部 Google routing 通過                                                                   |
| 帳號/session/舊 guard 回歸                  | 原 PAX-ACCOUNT 及 bootstrap-auth strict 測試                             | 118 pass                                                   | `pnpm exec vitest run tests/unit/pax-account-session-20261009 tests/unit/bootstrap-auth-guard-strict-env.test.ts`，exit 0；account-auth-existing.json | storage boundary 為 unit stub                                                                         |
| scoped eslint/prettier/diff                 | 全部本 task 的 TS 路徑                                                   | pass                                                       | `pnpm exec eslint ... --max-warnings=0`、`pnpm exec prettier --check ...`、`git diff --check`：exit 0                                                 | 最終文件另跑 prettier／diff                                                                           |
| API／root typecheck                         | 正式 API 與 root tsconfig                                                | pass                                                       | `pnpm --filter @drts/api typecheck`、`pnpm typecheck:root` 均 exit 0（含 contracts/control-plane-auth build exit 0）                                  | 不代表 hosted CI 全部 jobs 通過                                                                       |

首輪 service fixture 曾錯用 `success` envelope 欄位；已依正式 `toApiSuccessEnvelope`
移除。geo-before.json 的舊 fixture 使用缺少 session claims 的 legacy.sign，30 fail
**不是產品缺陷證據**，已改用正式 issueSessionToken，僅 geo-scope-blocked.json 的
12 個 live passenger failures 用於 F-GEO-01。不得引用前者當 acceptance 結果。

## 前輪留下的同一 task 修正單元

Supervisor 核對 parallel shared-file 衝突並增補 guard scope 後，由原 owner：

1. 先修 F-GEO-01，跑 geo-realm 測試直到正向與 logout 都通過。
2. 回歸 account/auth + geo/area + fare engine/service/repository、lint/typecheck。
3. 查 origin/dev、remote branch、PR/candidate/CI；此 branch 已發布，只能必要時
   merge origin/dev，不能 rebase/amend/force push。
4. closeout commit、普通 push、PR、同 SHA CI 結果，之後以完整 SHA/branch handoff
   Claude；不自行 done。PG 實測及 required acceptance 留給既有 PAX-QA lifecycle。

沒有啟動任何產品 server、Docker Compose、DB、preview 或 browser/E2E。
工作樹失效的 dependency symlink 只在指定 worktree unlink，改為
`CI=true pnpm install --frozen-lockfile --ignore-scripts` 隔離依賴，exit 0。
首個 recoverability anchor 因失效 hooks 使用 HUSKY=0；後續 anchors 均正常 commit。

## 2026-10-10 dispatch 修復

本次讀取原始碼、正式 SD 與前輪 artifact，依 Supervisor 已增補的 scope 接續
`fb089e8d2240a03c3ce2df0f5c8c7cccbca1e5cb`。不是重送未修候選，也不是 reviewer
代寫。原 finding 沒有被刪除；先以原來的測試重現，再修 guard，最後補拒絕矩陣。

- 修正 `BootstrapAuthGuard.activateNonIap`：只有 legacy JWT 未通過，而且 resolved
  policy 明確包含 passenger 時，才呼叫正式
  `PassengerAccountService.authenticateAccessToken`。此函式驗獨立 issuer/audience、
  claims、到期、active account 與 live refresh family。成功後執行原有
  `assertRealmAllowed`／`assertScopesAllowed`，才設定 request identity。
  這兩個檢查只擴充 TypeScript 參數為既有 `RequestIdentity` union；拒絕邏輯未改。
  驗證失敗、缺少 authority 都回原 `JWT_INVALID`；DB availability failure 繼續向上傳遞。
- legacy IAM 與 system workload fallback 未改。公開 fares 的 strict BFF metadata
  邊界未改；health、錯誤 HTTP method、service-area definitions/evaluate/admin
  都不授 passenger 權限。服務範圍預檢仍在正式 quote service 內部使用 evaluator。
- geo 測試改用真正 `ServiceAreaController` metadata 驗拒絕；四個 geo 仍使用真正
  `GeoController` metadata。增加 inner Bearer、缺失／任意／過期／無 live family token、
  刪帳號、缺 authority、storage failure、scope 拒絕與 strict bootstrap-header 回歸。
  added-scope 案例只在 test subclass 加 metadata，用來驗合併授權，不宣称現有 geo
  有此 scope。JWT、guard、account/session 都呼叫正式函式；只 stub storage 與外部
  Google metadata adapter，不呼叫真實 OAuth／Google routing。
- 運價仍不 seed。生效日／版本 ID、距離與延滯跳數計收、加成後進位、跨夜間時段
  規則仍待使用者／SD 定稿；本輪不以 synthetic fixture 發布運價。

本機修正程式與擴充矩陣的已推送 checkpoint：
`9c17304241097baee2fcc9eab418e9a27307d9c2`（guard 修復 anchor 為
`088873673`）。其後只更新本 artifact；完整候選 SHA、遠端 branch、PR head 與
hosted CI 由同一候選的 handoff／PR 及下列 manifest 記錄，避免文件自引用 SHA。

本次 machine evidence root：
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-app-20261009/PAX-FARE-QUOTE-20261009/dispatch-20261010/`。
最終 candidate／PR／CI manifest：該目錄的 `candidate-evidence.json`；CI logs／jobs
與本機 exit codes 同樣保存在該目錄。Node v22.23.2、pnpm 10.33.0、Vitest 4.1.4、
TypeScript 5.9.3。交接時 manifest 與 machine truth 的完整 SHA 必須一致。

| Finding／驗收項                      | 原始碼依據與修改位置                                                                                            | 舊版重現 → 修正版結果                                                                                                  | 命令、退出碼、版本與證據                                                                                                                                                                                                   | 未驗项／限制                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| F-GEO-01                             | BootstrapAuthGuard.activateNonIap；auth.policy 四路由；正式 account/session authority                           | fb089e8d2 的相同測試 12 fail、29 pass、1 skip → guard 修正版 41 pass、0 fail、1 skip；擴充矩陣 88 pass、0 fail、2 skip | `pnpm exec vitest run tests/unit/pax-fare-quote-20261009/geo-realm.test.ts --reporter=json --outputFile=...`：舊 exit 1、修正版 exit 0；geo-before.json／geo-minimal-after.json／geo-after.json；程式 checkpoint 9c1730424 | development 沒有 strict metadata/bootstrap 禁令，兩個 strict-only 案例明確 skip；不是執行失敗；hosted BFF/runtime 另由 CI／PAX-QA 核對    |
| pax-fare_tariff_and_engine           | V0112、estimateFare、SD 費率頁；本輪不改運價                                                                    | 同前輪 31 個引擎 boundary cases 通過；未以未定稿規則 seed                                                              | 本次 root-regression.json 包含 engine/service/repository/geo 全 task suites；exit 0                                                                                                                                        | 正式運價仍待定稿；PG schema constraints 尚未實測；不能宣稱完整 acceptance                                                                 |
| pax-fare_quote_and_public_fares      | PassengerFareController/Service/Repository；F-GEO-01；正式 ServiceAreaService                                   | fare service 30、repository 6 與 geo 88 cases pass；公開 BFF strict 拒絕、超出範圍及 no coverage 仍保留                | 本次 root-regression.json；exit 0；SQL 逐欄 owner 核對表仍見上節                                                                                                                                                           | reviewer 必須逐欄比對正式 migration／SQL；正式 PG repository 實測由 PAX-QA；真實 Google route 未呼叫                                      |
| 其他 realm／account／共享 guard 邊界 | 六個既有 geo realm；step-up IAP、break-glass、scheduler、tenant selector、driver provisioning、proof、IAM/admin | 本次 root 回歸 481 pass、0 fail、2 skip；API 回歸 214 pass、0 fail、0 skip（合計 695 pass）                            | root-regression.json／api-regression.json，兩命令 exit 0；root 命令覆蓋 account/fare、strict guard 及全部不需 server 的直接 guard 測試；API 命令覆蓋 geo/area、sandbox、ops-driver、billing、mail、auth-bootstrap          | `apps/api/tests/unit/assistant.http.test.ts` 會 listen API，未在此 VM 執行；留給 hosted CI；本機 unit 不冒充 PG／browser／外部 acceptance |

本次首次測試啟動因 worktree 的共用 dependency symlink 解析失敗，未執行測試，
不列產品重現。只 unlink 指定 worktree 的 symlinks，使用
`CI=true pnpm install --frozen-lockfile --ignore-scripts` 安裝隔離依賴，exit 0（install.log）。
擴充矩陣第一次錯把 Nest error 的 status 寫成 statusCode，屬 assertion 錯誤，
修正為正式 AUTH_REQUIRED 後重跑；不把该次失敗當產品缺陷證據。

沒有啟動本機產品 server、DB、Docker Compose、preview 或 browser/E2E。交接前需
讀完本次 lint/prettier/typecheck 與 hosted CI；其 exit codes／同 SHA jobs 寫入上述 manifest。
review、merge、named acceptance 由既有 lifecycle 收錄，不由 owner 呼叫 done。

### F-CI-01：首輪 hosted CI 的試算路由分類

完整首輪 SHA `f721f6476481634576e758de07e6973047abe335` 的
[CI run 38013340670](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38013340670)
與 [integration run 38013340592](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38013340592)
均已結束且已讀。root unit 的唯一失敗為
`tests/security/idempotency-regression-guard.test.ts`：`PassengerFareController#quote`
被 fallback 分類為 `unprotected_mutation`。兩 run 的 lint/typecheck、migrations、
integration、IAM negative、build 與 hosted E2E 均 pass；unit/smoke 與 aggregate fail。
原始結果保存在 `old-ci-integ.json`／`old-ci-smoke.json`、
`ci-unit-failed.log`／`ci-smoke-failed.log` 與 `old-candidate-evidence-f721f6476481.json`。

定位與修正邊界：原 inventory 的 `SEARCH_QUERY_METHOD_OR_PATH_REGEX` 與
`classifyRouteCommand` 第 4 類明確收納 POST 計算／試算；本功能計算估價並保存
15 分鐘、owner-bound 的不可变 snapshot，重複試算可以得到不同 snapshot，沒有
建立訂單／鎖定車資／扣款。將內部 handler 改為與此行為相符的 `estimateQuote`，
同步 controller 呼叫與正式 metadata 測試，HTTP `/api/passenger-app/quotes`、body、
回應、snapshot 與 service 行為完全一致。沒有修改 inventory／allowlist，也沒有
虛設 idempotency header 或宣稱新增冪等性。叫車／扣款仍由後續任務處理交易保護。

| Finding／驗收項                          | 原始碼依據與修改位置                                                                                          | 舊版重現 → 修正版結果                                                                                           | 命令、退出碼、版本與證據                                                                                                                                                                                                                               | 未驗項／限制                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| F-CI-01／pax-fare_quote_and_public_fares | PassengerFareController.estimateQuote；實際 controller 與 metadata callers；既有 classifyRouteCommand 第 4 類 | f721f6476 本機 inventory 1 fail、4 pass → 修正版 inventory 5 pass；含全 fare suites 共 160 pass、0 fail、2 skip | `pnpm exec vitest run tests/security/idempotency-regression-guard.test.ts tests/unit/pax-fare-quote-20261009 --reporter=json --outputFile=...`，修正版 exit 0；idempotency-inventory-before.json／inventory-and-fare-after.json；程式 anchor d1061e0f7 | 新 SHA 必須重新跑完整 hosted CI；舊 SHA 的其他綠燈不能代替新候選結果 |

本輪增加 inventory gate 到交接前檢查。上面的 695 pass 是首輪完整本機回歸；
F-CI-01 修正版重新驗整個受影響 fare 路徑與 inventory，並重跑 API/root typecheck。
最終 candidate、PR head、同 SHA CI 全部 jobs 的結果以本次 manifest 與 handoff 為準。
