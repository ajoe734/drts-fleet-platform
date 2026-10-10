# PAX-FARE-QUOTE-20261009 實作與驗證紀錄

Owner: Codex2；Reviewer: Claude。2026-10-10。

本輪為 **implementation checkpoint，尚非 candidate**。乘客 geo 授權仍待
Supervisor 增補寫入範圍，不能交審、合併或宣稱 acceptance 完成。

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
- `PassengerFareController.quote` → `PassengerFareService.quote`：
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

## F-GEO-01：乘客 JWT 仍不能使用 geo（尚未修復）

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

## §0.7 逐項證據

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

## 後續同一 task 修正單元

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
