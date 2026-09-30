# 產品剩餘問題與 SA／SD 討論稿（2026-09-13）

狀態：SA／SD 技術審查已收斂，現行定稿提案見 [consensus-packet.md](consensus-packet.md) B1–B9／C；使用者已確認，正式派工已恢復。2026-09-13 最新使用者指示：**先做到能上線營運；一通電話只能一張訂單**。撤回本日稍早的多單提案，停止相應 schema／service／UI 擴充。

使用者要求：「把問題先整理出來，我們做完 SA SD 後派工給 supervisor 跟 auto worker 來執行。」本文件承接既有任務與規格，不新增另一套派工流程。

## 1. 工作方式與目前現場

- 本對話負責問題整理、SA／SD 討論與結果審查。發現缺陷時先記錄證據及修正要求，不再直接接手產品實作。
- 使用者確認後，已透過既有 `ai-status.sh mode supervisor_managed_execution` 恢復正式派工；supervisor 持續運行。
- 原 SA／SD 暫停已解除。SR-WIRE-001 由 Gemini 實作、Codex review；Webhook 父任務改為等已登記的 schema／錄音／證照／harness 子任務後做整合驗收。
- 規劃時已保存 staged／unstaged 差異；WIRE 原工作樹已解除暫停鎖供原任務續作，Webhook 舊 WIP 保留供子任務選取有效內容。不清除或整批覆蓋資料。
- SA／SD 定案後由 supervisor 用既有任務指令派工，實作優先使用可用的 agy／Claude，Codex 負責獨立 review；不可因角色暫不可用而冒用其審查身分。
- VM 僅執行 supervisor、worker 與允許的非服務型檢查。需啟動產品、HTTP receiver、資料庫或瀏覽器驗收的案例交給既有 hosted workflow／shared dev。

## 2. SA：已確認的問題

### P01 — WIRE 打卡整合與變更基準混用

**原有流程**：dev 的 `ShiftAttendanceService.clockIn` 會檢查已有班次、司機停權／證照與車輛資格。WIRE 分支加入需要等待的請假檢查，因此其呼叫契約變成 Promise。這是程式呼叫契約，不是新增一種「同步打卡」產品功能。

**已確認的問題**：

1. worker 曾以 `ShiftRecord & Promise<ShiftRecord>` 與 `Object.assign` 預填看似成功的欄位，並保留另一條同步路徑。這種寫法讓呼叫端在權威檢查完成前取得成功外觀。
2. root 接手時，以舊 HEAD 還原檔案，沒有保留 staged dev merge 中的 `assertDriverAuthEligible`。目前 WIP 因而遺漏司機停權／證照檢查。這是 root 引入的退步，不能歸咎 worker，也不能當成缺少新產品需求。
3. 最新已執行的四份非服務型測試為 **29 項：24 通過、5 失敗，另 1 個未處理 rejection**。四項失敗是停權／證照應拒絕卻成功；另一項是舊測試以同步 `toThrow` 檢查 Promise。
4. 規劃審查另要求釐清成功回覆的持久化邊界。靜態查核發現 `ShiftAttendanceService.persist` 以 `void repository.persistChanges(...).catch(reportPersistenceFailure)` 背景寫入；單純把 `clockIn` 改為 async 不代表它會等待 DB。這是另一個待驗證的耐久性風險，不是上述五項測試失敗的原因，也未宣稱真實資料已遺失。

**影響**：未完成 WIP 的打卡資格判斷及測試可信度；沒有證據表示這份 WIP 已部署。

**基準必須分清楚**：工作樹 HEAD 為 `becf4ecdb32dac2a89e272db87243b1d4c38757f`，另有尚未提交的 merge，`MERGE_HEAD=6eec9635c17674b89b8519c642eb48b51dbd6479`。staged 的大量檔案是 dev 合併內容，不能當作本輪新增修正或廢 code 一起刪除。

**SA 對照結果**：原規格與程式已能確定請假、停權、註銷、證照、車輛資格與重複打卡的要求，見 §3.1。修復既有防護不需要使用者再次決定是否支援這些情境。

### P02 — 學院訓練資格與車輛要求的整合

**原有程式**：`RuntimeEligibilityEvaluatorService` 取得請假與學院狀態；車輛 capability 表達 `trainingRequired`；`OwnedMobilityService` 在派遣候選及派遣前使用資格結果。

**已確認的問題**：WIP 正在調整「車輛不要求訓練時，未修課是否仍被擋住」的行為；worker 曾讀取 evaluator 的私有 resolver 作為 fallback。root 已改過這段，但整份 WIP 尚未完成審查，不能宣布設計確立。

**SA 對照結果**：`feature-contracts.md` §3.3 明定 `trainingRequired: true` 時，未完訓／過期者要阻擋指派；既有資料模型要求此欄位為 boolean。缺少 capability 是資料／資格錯誤，不是新增第三種業務設定。`EligibilityContextResolver.resolve` 已拒絕未登記的 capability，後續 helper 不應再用 fallback 猜成合格。

**SD 待收斂**：規格要求與 `reg.driver_reg_profiles.training_status` 連動；WIRE 現在以 `AcademyService.listCourses()` 即時推導。Academy 另有既有的 `recomputeRegulatoryProjection()`，在作答／紀錄回讀時更新投影。§3.9 補上沿用此權威服務的操作邊界與既有寫入授權需增補之處；不另寫課程狀態算法。泛用 soft override 也不得讓必修未完成者通過實際指派。

### P03 — WIRE hosted 驗收尚未完成

候選 `becf4ecdb32dac2a89e272db87243b1d4c38757f` 已正常推送至 [PR #1974](https://github.com/ajoe734/drts-fleet-platform/pull/1974)。先前的推送問題已解除，不能繼續列為現行 blocker。

[run 34758242319](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34758242319) 的 API／SQL 報告是 **5/5 通過、0 skipped**；隨後 API server 啟動失敗：

```text
TypeError: contracts_1.MAINTENANCE_STATUSES is not iterable
apps/api/dist/modules/maintenance/maintenance.types.js:5:53
```

workflow 從 `apps/api` 用 `tsx` 啟動 WIRE server，瀏覽器驗收因 API 未就緒而未產出完整報告。**2026-09-13 的非服務型載入比對已定位錯誤機制**：`apps/api/tsconfig.json` 的 `paths` 將 `@drts/contracts`、`@drts/control-plane-auth` 指向 `dist/index.d.ts`，這原是型別檢查用的設定，卻被 tsx 執行期解析採用。

| 同一組既有 build 檔案的讀取方式 | 實際解析結果 | 結果 |
| --- | --- | --- |
| 純 Node require | contracts/dist/index.js | `MAINTENANCE_STATUSES` 正常 |
| Node 載入 tsx，使用 API 自動找到的 tsconfig | contracts/dist/index.d.ts | 常數缺失；直接 require 同套件的 dist/index.js 則正常 |
| 同一 tsx loader，明確使用既有根目錄 tsconfig.base.json | contracts 及 control-plane-auth 的 dist/index.js | 常數正常、extractIapJwtAssertion 為 function |

`becf4ecd...` 原候選與記錄中的 dev 都有相同 `.d.ts` paths。這解釋了 hosted 日誌的執行期缺失；只重新 build 並不改變錯誤解析目標。比對只載入 package exports，未啟動產品服務、未重建套件、未改工作樹產品程式。完整 hosted 啟動與 5+5 驗收仍待 worker 實作後驗證，不能把此探針算成產品驗收通過。

**SA 要求**：同一候選的完整產品組裝可啟動，API／SQL 與瀏覽器驗收皆通過；禁止用假模組或減少案例避開問題。

### P04 — Webhook C113–C115 尚缺可執行驗收

dev 的 `docs/04-uat/system-remediation-20260906/SR-QA-WEBHOOK-001.md` §6.4 明列：

| 能力 | 已有部分 | 尚需證明 |
| --- | --- | --- |
| C113 | 對帳單資料結構與輸入防護 | 真實服務的 capability-source mapping、resend、reconciliation |
| C114 | geocoding 邊界 | routing／ETA 失敗、降級、重試與對外結果 |
| C115 | 錄音回調狀態機 | 錄音補件、證照到期掃描與告警的持久排程 backlog、restart、catch-up |

這些內部案例不能全算成「缺外部帳密所以無法做」。另一方面，fixture 成功或重新建構記憶體物件也不能證明真實供應商或跨行程持久性。

已暫停的 Webhook 工作樹保留 **424 行未提交測試新增**。本輪做了靜態證據對照，沒有重跑或修改測試：

- `C113-4` 把 sandbox 標記資料送進 BillingSettlementService 並回讀記憶體 repository，能說明資料保存意圖，尚未證明外部來源 mapping、權限及 resend；`C113-5` 的 issue 生命週期也不能單獨證明外部帳本差異已完成調解。
- `C114-6` 配置 `MAP_PROVIDER_MODE=mock`、`MAP_PROVIDER_FAIL_CLOSED=true`，斷言「provider 未設定」錯誤。沒有已設定 provider 的逾時／錯誤回應，因此不能算供應商故障、降級與重試驗收。
- `C115-4` 在同一個服務實例傳入十分鐘後的時間，沒有停止或重啟行程、沒有從資料庫恢復。它測的是 dispatch matching timeout；原始 C115 明列「錄音與證照保存作業」，派單逾時不能替代錄音補件／到期掃描／告警回執。

以上是明確的證據缺口，未新增測試通過宣稱。SA／SD 必須先把每項能力對到原產品入口、資料來源、狀態轉移與可觀察結果；若確有產品缺陷，再由 supervisor 決定原任務範圍或具來源的修正子任務。

既有任務曾指定 `webhook-uat-acceptance.yml`，但目前 dev 及既有候選 `4cc481605fddb8cc5b23788e9430ef9896aeb2c0` 找不到此檔案。SD 應先盤點現有 transport／tenant acceptance workflow 是否可沿用，避免再建一套重複 runner。

### P05 — 乘客推播的產品接收端尚未定義

`PHASE1_OPEN_QUESTIONS.md` 的 `Q-SR-PUSH-001` 仍未指定乘客通知供應商、協定及乘客 subject 對裝置的綁定。dev 的 multi-taxi module 目前綁定 `UnavailablePassengerPushPort`。

通用持久化修復 `SR-PUSH-DURABILITY-20260911` 已完成，不能要求重做。尚缺的是「實際送到哪個乘客產品／App、如何找出正確接收裝置」與對應 adapter。

**SA 待決**：接收產品、支援平台、通知對象識別、裝置登記／撤銷來源。既有詢問仍待使用者提供產品名稱或決策文件位置；不可自行選供應商，亦不可把司機裝置綁定當成乘客綁定。

### P06 — shared dev 入口與真實服務驗收

截至本輪已保存的 2026-09-13 探測：API、platform-admin、ops、fleet、channel 回應 200；tenant、enterprise 入口由 Google Frontend 回應 403。最近部署 run `34681171586` 的 Cloud Run 部署步驟完成，但 dev health check 失敗。

既有 workflow 對入口使用匿名 curl；部分入口是否應公開必須對照角色入口設計及 IAM。**403 本身不證明產品服務壞掉，也不代表應開放匿名存取。** 驗收端是否缺身分，以及使用者正常登入入口是否缺路由／設定，要分別查證。

API health 亦顯示地圖目前使用 mock、正式地圖金鑰／mapping 未就緒。本輪沒有部署，也沒有改 Cloud Run IAM。

本機 gcloud 帳號重新驗證失敗只表示本機暫無足夠讀取能力；不能據此聲稱 Cloud Secret Manager、排程或其他帳號資源不存在。正式郵件、裝置、金流、文件、轉單、備援和 PSTN 尚需依各任務的真實驗收要求逐項查明。

既有 `SD-DP-20260429-001` 已規定 control-plane 使用邊界 IAP／內層 Bearer，tenant／partner／driver 使用各自 application-auth，並非預設 IAP 對象。因此這不是重新選擇整套登入架構的問題；應查 shared dev 的 URL、proxy、IAM 是否落實既有矩陣。只替 CI 加身分而仍讓合法租戶無法登入，也不符合產品驗收。

## 3. SD：待討論的修正方向

以下是設計提案與調查要求，不是已接受的實作指令。

| 問題 | 沿用的既有流程 | 設計輸出 | 驗收條件 |
| --- | --- | --- | --- |
| P01 | `clockIn`、LeaveService、RegulatoryRegistryService | 唯一的 async 呼叫契約；保留 dev 停權／證照／車輛檢查；所有呼叫端等待結果；記錄兩個分支的整合方式 | 成功、請假、停權、證照過期、車輛不合格、重複打卡；拒絕後班次及成功副作用不變；無未處理 rejection |
| P02 | evaluator 的公開介面、Academy 權威及車輛 capability | trainingRequired 布林規則與資料缺失處理；即時結果與監管投影一致；候選與執行採相同資格規則；移除私有欄位探測及無必要 fallback | 要求／免要求／資料缺失、課程完成／失效、請假及資格中途變動；soft override 不繞過必修未完成 |
| P03 | 現有 WIRE workflow 與產品 AppModule | 先重現 contracts export／build／resolution 差異，再選最小修正；不並存兩套產品啟動流程 | 最終同一 SHA 的 5 API／SQL + 5 browser，0 skips，required CI 通過 |
| P04 | 既有來源 adapter、GeoService、錄音／資格掃描、告警與 repository | C113–C115 各列輸入、狀態轉移、持久資料、錯誤結果；決定最小測試／修正範圍；沿用可用的 hosted runner | mapping／補送不重複／差異調解；已設定 provider 的路由失敗結果；錄音補件／資格到期 backlog 跨重啟補做、告警回執且不重複執行 |
| P05 | PassengerPushPort 與已完成的 durable receipt／claim | 產品／裝置契約確定後設計單一 provider adapter 與 device resolver | 可用／不可用、正確乘客接收、撤銷裝置、重試與去重；真裝置證據保留在 SR-LIVE-PUSH |
| P06 | deploy-dev、現有角色入口及 live runners | 公開／受驗證入口矩陣；依既有存取設計驗證 health；列出資源查核方法與真實驗收步驟 | 不降低 IAM；正確身分與實際角色登入；地圖／外部 provider 的真實回執綁定候選 SHA |

### 3.1 已有規則：不重開產品決策

| 情境 | 原規則／現有結果 | 來源 |
| --- | --- | --- |
| 已核准且目前生效的假單 | 拒絕 clock-in，`409 DRIVER_ON_LEAVE` | feature-contracts §2.3、§2.7；DriverLeaveService.assertDriverCanClockIn |
| pending／rejected／withdrawn 或生效區間外 | 不因該假單阻擋，仍需通過其他資格條件 | DriverLeaveService.getActiveLeaveForDriver；原假單狀態機 |
| 已有 active shift | `409 SHIFT_ALREADY_ACTIVE`，不建立第二個班次 | dev ShiftAttendanceService.clockIn |
| 司機 suspended／retired | 分別 `403 DRIVER_AUTH_SUSPENDED`／`403 DRIVER_AUTH_REVOKED`；沒有帶車輛也必須檢查 | RegulatoryRegistryService.assertDriverAuthEligible；C051 |
| 司機證照無效／過期 | `403 DRIVER_CERT_INVALID` | 同上 |
| 有傳入且不符合派遣資格的車輛 | `400 VEHICLE_NOT_DISPATCHABLE` | dev ShiftAttendanceService.clockIn |
| 請假生效／完訓失效 | 候選與實際指派皆使用最新權威；解除後可恢復，其他原有禁派條件保留 | SR-WIRE-001 驗收；feature-contracts §2.3、§3.3 |
| trainingRequired=true，必修未完成或過期 | 阻擋實際指派，附 `DRIVER_TRAINING_INCOMPLETE` | feature-contracts §3.3、AC-ACAD-POS-4 |
| trainingRequired=false | 此 trainingRequired 條件不新增阻擋；其他資格條件仍生效 | 原 capability 布林契約；evaluator.collectMissingRequirements |
| capability 未登記 | `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`；不能轉為免訓練／合格 | EligibilityContextResolver.resolve |
| Host 讀取或修改 | 只能讀本人車輛；跨 Host 隔離；唯讀契約不允許修改 | N03、C012、既有 WIRE API／SQL 案例 |

拒絕案例要檢查班次、派單及「成功」副作用未變，不只驗 HTTP code。上述表格是分別觸發的條件，不在本次擅改多重錯誤的優先順序。請假端點的精確時間邊界，現有程式是 `start <= now <= end`；邊界修改若有必要，須同時對照既有重疊規則與測試，不能順手改。

### 3.2 需要收斂的 SD 問題與建議

| 項目 | 討論稿建議 | 定案所需證據／資訊 |
| --- | --- | --- |
| 打卡 async 整合 | 沿用單一 clockIn 路徑；完成資格檢查及權威資料寫入後才回覆成功；失敗不得留下成功外觀；修正呼叫端等待，不偽造同步結果 | worker 依兩個分支整合並提供 §3.1 回歸，另含 DB 拒絕、成功後重啟回讀、同時重複打卡；不需新產品政策。persist 為共用方法，須先列出 clock-out／abandon 呼叫端影響，不偷偷改整套出勤生命週期 |
| 完訓權威 | 沿用 Academy 既有評分／有效期推導，整合公開服務回傳與監管投影更新；不要在派遣、readiness 各抄一次算法 | 決定哪個既有公開操作／最小介面調整能保持投影一致，列出過期後無使用者主動回讀時的結果 |
| WIRE package 載入 | 原 WIRE 啟動命令明確選用既有根目錄 tsconfig.base.json，使 tsx 按套件執行期 export 載入 JS；沿用原 server／AppModule／runner，不新增另一條啟動流程 | 非服務型 A/B 載入已證明 API tsconfig 的 `.d.ts` paths 造成缺失。worker 修正原命令並驗 hosted 5+5；不增加 require-cache patch、不先改中央 package exports 或 API 的編譯型別路徑 |
| Webhook 執行入口 | 建議把 C113–C115 的受控整合案例接入既有 `tenant-uat-acceptance.yml` 的同一個 API／PostgreSQL／重啟流程；不另外建立尚不存在的 webhook-uat runner | 現有 workflow 已有 immutable SHA、tenant A/B 真 session、啟停 API、保留 DB 重啟及回讀。SD 定案後 supervisor 調整該檔及其 verifier 的精確 scope；保留原 tenant 案例與門檻，不因補 webhook 而縮減原驗收 |
| C115 真正作業範圍 | 驗收錄音待補、資格到期、告警產生及回執；dispatch timeout 僅保留為其本來的回歸 | 每個作業的真實觸發入口、耐久待辦、重啟恢復與回執表／API；缺作業實作時由 supervisor 登記具來源修正 |
| 推播接收端 | 沿用既有 port／receipt／claim；接收產品確定後才設計 provider 與裝置 resolver | 使用者提供既有乘客 App／通知服務或已決定方案的位置；此項無法從司機裝置表推定 |
| dev 入口 403 | 落實既有 realm auth 矩陣，同時驗正常使用者與部署檢查；不改成一律匿名 | 正式入口 URL／proxy／IAM 唯讀證據及合法角色登入結果；既有架構不是待重新選擇項 |

### 3.3 交給 supervisor 的工作包邊界（待 SA／SD 定案後啟用）

| 既有工作包 | 可派工內容 | 本輪不擴張的範圍 | 完成證據 |
| --- | --- | --- | --- |
| SR-WIRE-001 | 整合 staged dev 與 WIRE；修正打卡、資格、呼叫端與 WIRE runner；保留已完成 Host／導航接線 | 不新增第二個 eligibility service；不整批移除 dev 合併；不改 supervisor；中央 package export 若確需變動先形成具體設計範圍 | 原 required_acceptance `wire_real_api_db_ui_and_reversible_dispatchability`；原 typecheck／tests；API／SQL＋UI、跨 Host 權限與資格可恢復皆有證據 |
| SR-QA-WEBHOOK-001 | 依 C111–C115 原能力補足驗收；刪除或更正假稱故障／重啟的冗餘案例，保留有實際價值的回歸 | 原任務為 verification，不偷改業務服務；不能把 C115 換成派單；沿用或經設計明確擴充既有 workflow | 原三個 required_acceptance 全部保留；每項正常＋負向、實際寫入回讀；外部驗收仍需真實回執 |
| SR-PUSH-001 | 接收端契約定案後完成 adapter、裝置查找與 module 綁定 | 不重做已完成 durability；不另建 push gateway；不假設 driver token 就是 passenger token | C023／N10；供應商接受與裝置收到分開記錄；下游 SR-LIVE-PUSH 真裝置驗收保留 |
| SR-LIVE-ENTRY／MAP／OPS 等 | 依 release 與既有 runner 做真實環境驗收；設計確認的入口／設定缺陷由 supervisor 路由修正 | 現有 live task 的 write_scopes 以測試／UAT 文件為主，不藉驗收任務任意改 deploy/IAM；不在 VM 架產品 | 原 required_acceptance 與每項 live_candidate_sha，不把資源盤點或 runner 建置當驗收通過 |

驗收數量是最低數量，不是範圍替代品。原 WIRE 的請假班表、司機／車行同一完訓證據、正常導航與 Host 自車隔離仍在完整驗收內；不能只剩本輪發現的五個失敗測試。

### 3.4 C113–C115 驗收設計：輸入到回執

下表的識別資訊是證據要求，不表示要新增同名資料表或欄位；先使用既有契約實際提供的識別碼。受控測試可模擬對方失敗，但必須執行真實產品服務、持久化及恢復流程；真 provider 的驗收仍另需真實資源。

| 能力 | 輸入與既有權威 | 必須觀察的狀態／結果 | 關鍵負向及恢復 | 證據 |
| --- | --- | --- | --- | --- |
| C113 mapping | 既有 ERP／SSO／銀行整合契約各自的來源訊息、租戶及 mapping 版本；沿用原 adapter／接收服務 | 寫入正確租戶與目標資源；可追到來源及 mapping 版本 | 未授權來源、跨租戶、無效 mapping 不得寫錯資料；不能只呼叫財務 service 塞入 sandbox 字樣就算來源對映 | 原請求、權限結果、source／target ID 與 API／DB 回讀；缺少某種整合的接收入口則列出具體產品缺口 |
| C113 resend／reconcile | 相同外部事件的失敗與補送；既有接收冪等鍵、投遞／差異處理服務 | 失敗仍可追蹤；恢復後對應同一事件；差異 issue 與實際帳本調整／回執相連 | 重複、失敗後補送、補送後重啟不產生第二筆業務效果；對帳不平不能只把 issue 標 closed | 重送前後業務筆數／金額、同一事件識別、失敗紀錄、差異及對方回執；受控與外部結果分開 |
| C114 route／ETA | 已被設定為可用的 GeoProvider，經 GeoService.route／search 正常產品路徑呼叫 | provider 成功時回真距離／時間；已知錯誤經 withProviderErrorMapping 對外傳遞並記 observability | 對方逾時、不可用、配額／錯誤回應、過期位置；恢復後可重試。既有程式未定義自動重試時，不新增隱藏重試策略來通過案例 | 請求參數、實際 provider 呼叫與錯誤、API 回應、故障指標、恢復後結果；不以 mock ETA 覆蓋失敗 |
| C115 錄音補件 | 真實 Callcenter 回調／錄音待補資料與既有訂單連動入口 | 先有耐久待補項，補件後錄音與原 call/order 正確關聯；缺錄音時仍維持原合規狀態 | worker/API 停止期間累積待補，替換行程後從 DB 恢復；重送不能倒退已完成／已派遣狀態，不能重複產生業務效果 | 同一 call／recording／order ID、停止／啟動紀錄、DB 前後狀態、補件結果 |
| C115 證照掃描與告警 | 已存在的 RegulatoryRegistry／資格計算及 AuditNotification；到期資料、待辦與真實排程觸發 | 無使用者主動查詢時，仍有到期處理、禁派結果及可追蹤告警／回執 | 停機期間多筆到期、重啟 catch-up、同一到期事件重複觸發、告警失敗與恢復 | 排程設定／執行紀錄、真 DB 跨行程結果、資格與告警 ID／回執；單次呼叫 decorateDriver 不算定時器持續執行 |

`runDispatchSchedulerSweep` 現有用途是 matching／acceptance timeout 等派單工作，不能替代錄音補件／證照到期作業。§3.10 已定位錄音的 `voice.work_item` 與 `finalize_recording` 入口，以及 handler 未執行實際封存的缺口。**C115 仍待收斂證照掃描的觸發與耐久回執設計，以及錄音 producer／部署啟動的整合細節**；不能靠方法名稱宣稱已完成，也不先建立第二套 scheduler。

### 3.5 規劃審查處置（文件討論，不是 candidate approve）

已讀取既有規劃 worker `PLANNING-PHASE1-CODEX` 在隔離工作樹的 `review-round-1.md` Entries 5–10。這是尚在提交中的規劃產物，不是產品驗收通過，也未宣稱完成跨 lane 審查。原始文件保持在 worker 工作樹，本文件只記錄對本輪 P01–P06 的處置。

| 審查項目 | 本輪處置 |
| --- | --- |
| Entry 5：回到規劃模式 | 已落實；實作仍停。使用者接受 SA／SD 後，依本次既有指示交 supervisor 派工，不額外再問一次相同的執行授權 |
| Entry 6：採用已接受規格 | 已對照 feature-contracts、能力原表、realm auth 矩陣；舊 April 開放事項不自動變成本輪新需求 |
| Entry 7：WIRE 不變式及持久化 | §3.1–3.3 納入；保留 root 造成的退步歸屬；增加查核背景寫入的具體 SD 問題，不冒稱已修復 |
| Entry 8：Webhook 完整範圍 | §3.4 納入輸入、權威、狀態、負向及證據；進一步按原 C115 校正到錄音／資格作業，避免泛用 scheduler 測試偷換需求 |
| Entry 9：Q-001 電話／訂單 cardinality 文件衝突 | 使用者本日最後決定改回一通電話只能一張，以先上線營運為優先。稍早 1:N 決定及 Entries 14–15 的多單擴充已撤回；採 §3.7–3.8 的既有單張流程驗收 |
| Entry 10：推播決策與環境查證分開 | 採納；P05 等既有接收產品／裝置方案；P06 依已定 realm 架構查實際資源，不把本機登入失敗當資源不存在 |

### 3.6 目前還缺什麼，誰來補

- **已有答案，交未來實作 worker 落實**：打卡原資格／錯誤契約、單一 async 呼叫、必修資格不可繞過、Host 權限、完整候選驗收。這些不請使用者重做工程選擇。
- **本輪待審技術 SD**：§3.9 已選定 Academy 單一推導／transaction 邊界；§3.11–3.12 補齊 Registry 到期處理及 voice finalize 的觸發、待辦、回執與驗收提案。接下來收斂其跨模組寫入權限、adapter 組裝及獨立審查意見，不再重複要求使用者回答工程問題。WIRE contracts 載入根因及原命令修正方向已定，實作與 hosted 驗收仍未完成。
- **需要使用者提供的產品資訊**：乘客通知實際接收的既有 App／服務或決策文件位置。未得到資訊前，不選定 provider／乘客裝置拓樸。
- **設計後的外部驗收投入**：各 live 任務實際帳號／裝置／sandbox／操作目標與同一候選的回執；其存在與可用性應逐項查證，不一次要求使用者重提供全部。

本稿尚不符合「SA／SD 全部完成」；不得因已寫出工作包就解除實作暫停。

### 3.7 Q-001：首版採一通電話只能一張訂單（最新使用者決定）

2026-09-13 使用者先允許多張，隨後明確改為：「沒關係，那就改回一通電話只能一張訂單」、「不然還要改成是跟UI很麻煩」、「先做到能夠上線營運」。**以最後指示為準：一個 call 最多一張 order（未建單時為零張）**。不再詢問同一產品決策。

- 保留 V0082／V0088 的 call 唯一限制、V0086 的 session 建單 intent 限制，以及既有 linkedOrderId／單張訂單 UI；本輪不做多單 migration、關聯陣列、錄音 fan-out 或多意圖選擇介面。
- 第一張成功建立後，重送相同建單請求／intent 回原訂單；另一個建立動作不能繞過限制產生第二張。保留既有確認票據、receipt、冪等與權限防護。
- 人工／語音入口、API／DB／UI 均須遵守同一上限；第二張被拒絕時，第一張訂單、錄音關聯與稽核不得被覆寫。並發建立最多成功一張；重啟回讀原訂單。
- 訂單取消或完成不自動釋放該通電話的唯一限制；本次不新增「同通電話重新開第二張」例外。
- 若現有資料出現違反上限的歷史關聯，先列出證據並保留資料，不能為了恢復規則刪除訂單。

原 §3.8 多單設計已從現行方案撤下，討論快照保留於 `.local/product-completion-20260913/sa-sd-pause/multiorder-draft-before-user-withdrawal.md`；沒有執行過其產品修改或 migration。

### 3.8 撤回多單派工與首版驗收

已用既有 canonical task commands 撤下 `SR-CALL-MULTIORDER-20260913` 的 release 依賴。任務紀錄標註 `withdrawn_by_user`、保留 blocked 與空 write scopes，僅供追溯：現有任務狀態沒有 cancelled，不能冒充實作 done，也不因此修改 supervisor 工具。此項**不是上線 blocker、不是待使用者重新回答、不可自動恢復**。

首版沿現有電話建單路徑驗收：正常建立一張；相同請求重送仍為同一張；不同請求及人工／語音競爭時不多建；UI 顯示並可進入原訂單；錄音 pending／ready／failed／重送正確連動；跨 call／tenant 存取被拒；DB 失敗與重啟不留下假成功。這些放回現有建單／callcenter QA，不另建立多單替代任務。其他 release 前置與必要驗收保持原範圍。

### 3.9 Academy：單一資格推導與監管投影的邊界

以下是讀取相同 `6eec9635...` 基準後的技術提案，仍須併入正式設計審查；沒有修改 Academy 程式或擴張任務寫入權限。

**具體來源**：`driver-academy/academy-domain.ts:134` 的 `trainingRecord` 已依課程目前版本、該司機作答、有效期限與同一時間推導每門課狀態；保留此算法。`AcademyService.listCourses` 不更新投影；`listRecords` 先讀一次資料，再呼叫會重新讀取資料的 `recomputeRegulatoryProjection`，因此一次回應與投影不是使用同一份讀取結果。現有投影僅在全數 passed 或有 expired 時更新，必修改版後變成未修、又沒有任何過期課程時不會清除舊 passed。這是可由程式路徑推出的風險，尚無本輪 DB 重現結果。

1. 在既有 `AcademyService` 收斂一個公開資格操作，取得目前課程、作答與 `asOf`，只用 `trainingRecord` 產生 records／requiredCount／trainingSatisfied。派遣 evaluator、fleet readiness 使用此結果，不再各自從 `listCourses` 複製判斷；`listRecords` 及投影更新共用同一份推導輸入。匿名課程目錄仍只提供目錄，不替匿名使用者寫資格。
2. 監管欄位與課程狀態不是同一個 enum：V0002 的 `reg.training_status_t` 是 `pending / passed / expired / waived`；課程還有 `not_started / in_progress / failed`，不能直接把課程字串寫入監管欄位。提案為：有必修且全數有效通過才投影 passed；有必修過期則 expired；其餘未完成投影 pending。課程清單為空不當成取得完訓證明；車輛不要求訓練時仍沿原免要求規則。人工 waived 的意義保持原資格契約，不能當成繞過 `trainingRequired=true` 必修條件的捷徑。
3. `academy-identity-decision.md` §2.3 原本只授權 required-course pass/expiry 寫入；上述「舊 passed 失效後回 pending」必須明列為該決策及 WIRE 精確 scope 的增補，不能由 worker 悄悄擴權。不得改寫證照、停權、身分或人工豁免資料；既有 waived 資料的來源及更新規則須先在同一設計審查處置。
4. 資格讀取與投影寫入使用同一個 `DatabaseService.connect()` PoolClient transaction：提案採 SERIALIZABLE，於交易內讀取目前課程與作答、用一個 asOf 推導、按此結果更新投影，commit 後才回覆已同步。serialization conflict／DB 寫入失敗回滾整個操作，不把較舊結果當成功，也不增加另一套自動重試框架。現有 Academy repository 各操作需接同一 executor，不能每個方法改用獨立 pool.query。實際指派仍重新驗證當下資格，不能以先前候選列表或舊 passed 投影放行。此為待審的交易設計，不是已完成的實作。
5. 過期後沒有主動查詢時的投影／告警屬 C115 作業整合。該作業也只能呼叫同一 Academy 權威；WIRE 的即時阻擋不應等待背景掃描成功。分清「當下禁止派遣」與「背景持續更新並告警」的驗收責任。

新增驗收需求：同一 asOf 的 records／資格／投影一致；課程改版與必修改動不留下可放行的舊 passed；跨有效期與同時作答／資格讀取；DB 寫入失敗不宣稱同步；無課程、免要求車輛及 waived 既有資料；候選後資格變更在指派時被拒絕。這些是設計要求，沒有測試通過宣稱。

### 3.10 C115：既有錄音 runner 的實際缺口與沿用方式

本節查核基準仍為 `6eec9635...`。只讀產品來源與部署描述，沒有啟動 runner、服務或資料庫；本機未找到部署呼叫不等於雲端資源不存在。

| 來源 | 查核結果 | SD 處置 |
| --- | --- | --- |
| `voice-command-runner.service.ts:333`、`:367` | 已有 `enqueueWorkItem`、`voice.work_item`、dedupe key、DB claim、到期 lease 回收、lease_epoch fencing、retry 與 failed 狀態 | 錄音作業沿用這個 voice queue／runner，不另加補件 queue 或第二個輪詢服務 |
| 同檔 `:562` 的 `handleFinalizeRecording` | 只解析 payload，回傳 handled=true、recordingId、finalizedAt；没有呼叫封存、驗證、callback 或 repository 寫入。`runOnce` 接著會把 work item 標 completed | 確認為產品實作缺口，不能只加一個斷言 handled=true 的測試。完成條件必須是錄音證據可驗證、正確回寫及 durable receipt，而非 handler 有返回值 |
| 同檔 `:621` 的 `startBackgroundLoop`、`VoiceBookingModule` | 有可啟動及 drain 的 loop，module 註冊 service；在已搜尋的 apps／operations／tools／workflows 產品來源中未找到該啟動方法、finalize enqueue 或 custom handler 的呼叫者 | SA／SD 必須指定原 voice 部署入口如何啟動這個既有 loop、結束時如何 drain；並接上實際持久 call-close／待補 producer。先查既有部署規格，不能把 class 存在當成已持續運行 |
| `apps/voice-media-worker/src/recording/final-manifest.ts:29` | `FinalRecordingManifests` 會核對可信 call-close ledger、完整 checkpoint 索引及音訊物件；目前 class 本身不呼叫 legacy callback，也不改訂單 | 復用此封存／驗證邏輯並保留 media／API 邊界；API runner 以可信物件引用取得結果，不接受自行聲稱成功的 payload。不得用 callback 到達時間代替通話結束時間 |
| `CallcenterService.persistSessions` | 原 callback 路徑以背景 Promise 寫入 session | 補件回執必須等權威資料持久化；不能在背景寫入仍可能失敗時完成 work item。只改受影響的錄音操作邊界，先盤點呼叫端，避免順手重寫全部 callcenter |
| `AuditNotificationService`、`NotificationDeliveryService` | 通知清單為記憶體，普通 audit log 是背景寫入；另有 `recordAuditLogAsync`。通知投遞核心已有 outbox／lease／receipt，但現有 `FileMailOutbox` 明定僅支援單主機／共用本機 POSIX volume | 不以記憶體通知或 audit 字樣當告警送達；沿用既有通知契約，依部署實際耐久儲存查證。不得把 Cloud Run 暫存目錄宣稱成跨 revision 持久 outbox，也不為本項再做第二套投遞服務 |

**錄音修正提案**：可信 call-close／既有待補狀態與 enqueue 應在同一持久化邊界記錄；dedupe 綁定 scope、call／recording 及實際封存版本。同一錄音補件重送使用原待辦；依 Q-001 最新單張規則，結果套用到該通電話唯一關聯的訂單，不新增多單 fan-out。保留前段 checkpoint 與確認票據，最終錄音失敗不得破壞已存在證據，也不得假造缺失音訊。

handler 對已完成的封存引用先驗證及回讀，再接原錄音狀態路徑；DB／儲存不可用時由既有 retry／failed 機制記錄失敗。若行程在物件封存後、work item 完成前停止，恢復時應取得同一有效結果，不能重複產生訂單副作用；lease 失效者不得回寫新 worker 的結果。未知 work type 目前會無操作完成，審查須確認新增／部署未掛接的錄音工作不會走到此分支。

**設計增補狀態**：§3.11–3.12 已提出 Registry domain 觸發／持久紀錄、voice close-event／enqueue transaction、media adapter 邊界及原 runner lifecycle 接線。這些目前是待審方案；實際部署與 provider adapter 可用性仍須證據，不以介面存在代替完成，也不把證照工作塞進 voice queue 或 dispatch timeout。

### 3.11 C115 證照到期：同一 Registry 權威內補上持續處理

**新查明的邊界**：`RegulatoryRegistryService.listExpiringDriverLicenses(windowDays, referenceDateMs)` 與 `GET regulatory/drivers/expiring-licenses` 只回傳到期時間在 `[referenceDateMs, cutoff]` 的 active driver；已經到期的資料不在此區間。因此不能反覆呼叫這個「即將到期」查詢，就宣稱補做了停機期間的到期事件。`decorateDriver`／`areDriverLicensesValid` 仍是當下證照有效性的原判斷來源，不另寫禁派規則。

**待審設計選定如下**：

1. 在既有 RegulatoryRegistry domain 增補單一 `reconcileExpiredCredentials` 操作；API module 完成 DB 初始化後啟動週期呼叫，關閉時停止並等待正在處理的批次。它是這項證照作業唯一的觸發路徑，不新增 Cloud Scheduler、另一個 job process 或跨 domain 通用 scheduler。排程只負責喚醒，待辦真值在 PostgreSQL；部署沿既有 API 持續 CPU／warm instance 前提，不在這台 VM 啟動產品。
2. 每次從 `reg.phase1_registry_drivers` 的持久資料查截至 asOf 已到期而未完成處理的證照，涵蓋既有 licenseExpiry／professionalDriverLicenseExpiry／taxiDriverRegistrationExpiry；不以「上次 tick 之後」作唯一時間窗。使用穩定分頁與每批數量限制，重啟後從未完成項繼續；沒有使用者查詢也能 catch-up。到期比較沿原日期規則與 helper，不擅改有效日邊界。
3. 既有來源未見資格到期事件的持久處理紀錄，提案在 Registry 的新 forward migration 配置一個**專用到期處理紀錄**，不是第二份司機或證照資料：保存 eventId、授權 scope、driverId、credential type、來源到期值／版本、處理狀態、attempt、runAfter、lease epoch／expiry、lastError 及告警回執引用。以 scope／driver／credential type／來源版本唯一，未完成項可重領；後續續證的新版本是不同事件，舊事件保留追溯。
4. 以 DB claim／租約保護多 replica 競爭；取得處理權後重讀該證照目前版本。已續證或來源被合法更正時記錄 superseded，不把舊到期事件套到新證照。資格仍由 Registry 即時計算；不永久把衍生的 licensesValid=false 蓋回證照原始資料。Academy 到期投影經 §3.9 同一公開操作處理，不複製課程判斷。
5. 到期處理、告警建立、通知送達是不同結果。原 `OperationalObservabilityService` 的 alerts 是 healthy／warning／critical 快照，不是持久化事件回執；原 `AuditNotificationService.recordNotification` 的記憶體清單也不算跨重啟保存。沿既有 ops/platform 告警路由顯示處理紀錄與積壓，沿既有 AuditNotification／NotificationDelivery 契約交付並保存回執引用；沒有配置可用且符合部署耐久性的 outbox／transport 時保留 delivery pending／failed，不能標 delivered。首版不為此增建另一個通知中心。
6. 掃描已成功但通知暫時失敗時，只重試未完成交付，不能重複產生資格事件或覆寫已成功回執；舊 lease 回報不得覆寫新 lease。租約與防重的 SQL 寫入位於同一 Registry repository，通知使用既有 service 的 idempotency key。Audit sink 或 channel 失敗要能查到錯誤與下一次嘗試，不以背景 catch-and-log 當完成。

**驗收**：建立跨三種證照、不同到期日／scope 的真 DB 資料；停止產品行程後累積已到期項，再啟動新行程而不呼叫 expiring-licenses API；所有應處理項均出現在 durable event／告警回讀中。另測兩個 replica 競爭、處理途中續證、通知失敗後恢復、DB commit 失敗、lease 到期及重複掃描；必須保留同一批 IDs，不能重啟後重新 seed 冒充恢復。實際 tick 間隔／容量設定及回執通道由部署驗收記錄，不能只以方法被呼叫證明持續運作。

### 3.12 C115 錄音：將已有封存介面接回原 voice 執行鏈

**補充源碼事實**：`VoiceSessionService.closeSession` 目前只以 CAS 更新 dialog/media 狀態，沒有 enqueue finalization；`voice.session_event` 已有來源事件去重、順序、payload_ref 和追加式保存。`VoiceEvidenceService` 的 `VOICE_EVIDENCE_ACCESS`／`VOICE_EVIDENCE_READER` 是可選注入介面；在此次搜尋的 apps 產品來源中只找到宣告與使用，未找到 production provider registration。`RecorderObjectStore`、`RecordingClosureLedger` 也有明確介面而尚未找到產品 adapter。這使工作不只缺「啟動 loop」；不可把介面／module 存在當成完整錄音鏈已接通。

**待審整合設計**：

- **一般人工電話與 AI 電話都在錄音補件範圍**。人工電話沿原 Callcenter close／recording-pending 入口，將 session 待補狀態與相同 `finalize_recording` 工作的 enqueue 放入同一 DB transaction；不為人工電話偽造 voice.session、intent 或確認票據。V0086 的 work_item.voice_session_id 本來可為 NULL，工作以可信 scope／callId／錄音目標版本定位；同一 handler 從伺服器資料判斷其證據要求，不能由 callback body 選擇較寬鬆路徑。舊的待補 session 在恢復時也須補入唯一工作，不只處理新 close 事件。
- 可信 CTI/recorder close 事件沿既有 session-event 接收權威入庫；將 call／leg／media epoch、真實 endedAt／end offset 及已持久 segment 索引的引用留在事件中。`closeSession` 與唯一 finalize work item 的建立共用既有 `VoiceSessionRepository.withTransaction`，重送 close 仍檢查／回讀既有待辦，不能因 dialog 已 closed 就漏掉恢復。不得用 API 收到事件的時間補造音訊 offset。
- 最終封存繼續由 media/recording domain 的 `FinalRecordingManifests` 執行。既有 RecorderObjectStore adapter 必須符合 immutable version、可信 ingest metadata 與回讀驗證；通用上傳或 TTS 物件不能代替錄音來源。缺少 adapter 時，由原 voice 整合範圍補實作並註冊；保留此單一 store／ledger port，不新增第二套 manifest 模型。
- API runner 領取原 finalize work item，以 scope 與持久事件參照要求 recorder 的認證 adapter 封存／回讀；使用 `VoiceEvidenceService` 同一認證解析及 reader 邊界增補 final-manifest 驗證操作。final manifest 與 booking confirmation checkpoint 的用途分開，不能拿全通話 finalize 去消耗建單確認或重建訂單。HTTP/RPC 路由是待接的 adapter，不能宣稱目前已有可用端點；以原 voice service principal／scope 做授權，不信任 body 自填品牌／call。
- 驗證成功後，以 work lease、manifest version 與原單張關聯保存錄音結果、處理回執、必要告警引用，再完成 work item。若物件成功但 DB commit 前崩潰，下一次領取回讀同一可驗證封存結果；若後半段缺失，保留已封閉 checkpoint 與已派單狀態，記 failed／repair pending。原普通電話 callback 與 voice callback 共用原 call/order 更新權威，各自保留原證據要求，沒有第二條偷偷放行路徑。
- 在現有 API 的 module lifecycle 接 `startBackgroundLoop`／`drain`；只啟動一次原 runner。原 accepted voice SD §3.4、staging API descriptor 已要求持續 CPU 與 warm instance，但尚需 shared dev 的實際部署證據。`check-voice-runtime-deployment.sh` 現在遇到不可達會警告後繼續，DB 錯誤還會以 0 替代；此腳本的 exit 0 不能證明 runner 可運作。改驗證必須在原腳本／既有 hosted runner 內嚴格要求正確環境、真實待辦完成及跨行程回讀，不另建一套 smoke script。

這是產品整合／持久化修正設計，精確 provider adapter 的組裝需對照原 UV-EXEC 任務的已發布候選，避免重做已存在但未接入的實作；差異成立後沿現有任務建立具來源修正子項。C115 QA 仍負責真 API／DB／錄音物件／處理回執驗證；不得把產品修正藏在 verifier，也不降低 UV-EXEC-028 的真實 PSTN／錄音／容量驗收。

人工電話的受控 callback 驗收可沿原 Callcenter 接收流程；原 module 的 `SandboxWebhookAdapter` 只能作受控測試。`voice-cti.adapter.ts` 註解亦明示其為尚待整合的 scaffold、實際電話商未配置，不能當成真實 provider。QA 必須分別驗人工電話補件及 AI checkpoint/finalize，真實電話商的認證、錄音回讀與回執仍由原 live／UV 驗收證明。

### 3.13 跨審後的程式來源校正

Gemini／Gemini2 已提交 Entries 20–25，但提交不代表方案已通過。root 重新讀取相同基準後，將具體矛盾列在 [review-round-1.md](review-round-1.md) Entry 26，由現行 consensus-packet.md B1–B9 具體處置並經 Gemini Entry 27 核對：現有保險與 call session 資料表、Academy expired／pending／waived 邊界、failed work 真正補跑、既有 lease 欄位與安全 drain、保留 booking handler、close-event 原子性，以及沿原 MailOutbox 的持久交付意圖／不確定投遞結果。擬新增的 adapter／migration 必須明列為修正範圍，不能當成現有實作。

本輪只校正會使首版修復做錯的設計前提，不擴張多單 UI、另建排程框架或改 supervisor。設計收斂後用既有任務派工，首版完成判準仍為 §5 的營運流程與原 hosted／live 驗收。

## 4. 原任務與正式修復子任務對照

這是任務數，不代表 18 個獨立程式缺陷。其餘已完成或已封存前置任務不重新建立。

使用者確認後，原 18 項現行任務另拆出 4 個具體修復子項，現在是 **22 項現行任務＋2 筆歷史紀錄**。子項是 SR-LAUNCH-SCHEMA-20260913（共用 migration）、SR-RECORDING-RECOVERY-20260913（B6–B7）、SR-CREDENTIAL-EXPIRY-20260913（B4–B5）、SR-C115-HARNESS-20260913（B8）；狀態／依賴以 board 為準，下方保留拆分前的基線。

更新：目前 board 有 20 筆非 done 紀錄，其中 **18 項是現行營運範圍的未完成任務，2 筆是保留的歷史紀錄**。多單任務已由使用者撤回；舊 tenant-binding 候選已由驗證完成的後續任務接替，父任務早已改依賴後續版本，且目前沒有 open task 依賴舊候選。兩筆都保留 blocked 以阻止重新派工，不是上線 blocker，也沒有冒充實作 done。下表保留原十九項基線，舊候選列明為歷史；證據及處置快照保存在 `.local/`。

| 任務 | 數量 | 未完成原因／接續條件 |
| --- | ---: | --- |
| SR-WIRE-001 | 1 | P01–P03；SA／SD 已確認，Gemini 實作／Codex review |
| SR-QA-WEBHOOK-001 | 1 | P04；SA／SD 已確認，等待已登記的修復／harness 子項後進行最終整合驗收 |
| SR-PUSH-001 | 1 | P05，接收端／裝置契約尚未決定 |
| SR-QA-BOOKING-001 | 1 | 等 SR-PUSH-001，不能宣稱預約通知閉環已完成 |
| SR-QA-NEWFEATURES-001 | 1 | 等 SR-WIRE-001 |
| SR-RELEASE-001 | 1 | 等 booking、newfeatures、webhook 等 QA 閉環 |
| SR-LIVE-ENTRY／MAIL／PUSH／DOC／FINANCE／MAP／DRIVER／FORWARD／OPS-001 | 9 | 共同依賴 release；另有各自真實入口、帳號、裝置、provider、文件或操作證據。runner 完成不能代替真實驗收 |
| UV-EXEC-028 | 1 | 真實 PSTN／CTI、逐語言、轉接與容量驗收尚未完成 |
| UV-EXEC-029 | 1 | 等 UV-EXEC-028 及小量營運、回退的真實環境驗證 |
| SR-QA-WEBHOOK-001-FIX-TENANT-BINDING | 1（歷史，不計入現行 18 項） | 已由 done 的 SR-AUTH-SELECTOR-001／SR-QA-WEBHOOK-001-ACCEPTANCE-RUNNER 接替；重新核對來源 ancestry、相同 tenant 修正、兩次 2/2 hosted 保存報告及實際 harness hash。舊候選 10123 的失敗證據保留，紀錄改為歷史 hold，不再重新派驗收；父任務仍須完成自己的最終 C111–C115 驗收 |
| SR-ACCEPT-001 | 1 | 等 release、九項 live 及 UV-EXEC-028，彙整剩餘缺口 |

## 5. SA／SD 完成後的派工原則

1. 以先上線營運收斂 SA／SD：只處理阻擋現有建單→派遣→司機完成→帳務／稽核及必要真實服務驗收的問題；Q-001 已定為單張，不再為多單擴寫模型或 UI。P01–P06 的既有缺陷與外部證據逐項處理，不用未經驗證的替代品宣稱可營運。
2. supervisor 更新既有任務的精確檔案範圍、前置依賴、owner、reviewer、候選基準及驗收條件。需要修正子任務時附具體缺陷來源，不為相同流程另建平行做法。
3. WIRE、Webhook 可在無檔案交疊的範圍平行；PUSH 等接收端契約定案；共享模組寫入由 supervisor 排定次序。後續 QA／release／live 按依賴啟動。
4. auto worker 實作、提交候選；Codex 依 diff 與實際結果 review。審查發現問題交回 worker 修正，本對話不再下場改碼。
5. 使用既有 candidate lifecycle 記錄 review、同 SHA CI、merge、必要 live evidence。測試檔新增、工作樹有修改或 runner 已建置都不等於完成。

## 6. 證據與保留位置

機器現場集中保存在 `.local/product-completion-20260913/`，不公開帳密或環境狀態：

- `sa-sd-pause/board-at-planning-entry.json`：進入規劃時的任務快照。
- `sa-sd-pause/tenant-binding-successor-reverification.json`、`tenant-binding-successor-disposition-applied.json`：舊候選來源／harness／保存報告的重新驗證與正式歷史處置；沒有新跑 hosted 驗收，也未宣稱舊候選通過。
- `sa-sd-pause/wire-{staged,unstaged,status,head}.txt`、`wire-merge-state.json`：WIRE 兩層差異與 merge 基準。
- `sa-sd-pause/webhook-{staged,unstaged,status,head}.txt`：Webhook 暫停現場。
- `wire-worker-wip-before-correction.patch`：root 介入前的 worker 差異。
- `wire-run-34758242319/`：hosted API report 與 server 啟動失敗日誌。
- `live-entry-probe.json`、`dev-api-health.json`、`dev-last-health-failure.log`：dev 探測與部署 health 失敗證據。
- `sa-sd-pause/contracts-loader-probe.json`：純 Node、tsx 預設設定、tsx 明確根目錄設定的實際解析檔案與常數比對。tsx CLI 的本機 IPC 限制另如實記錄；後續以不開啟 CLI IPC 的 Node loader 完成同一解析查核，沒有修改沙箱／權限。

本輪規格／程式引用基準：`refs/remotes/origin/dev` 為 `6eec9635c17674b89b8519c642eb48b51dbd6479`；WIRE 與 Webhook 未提交內容只作待審證據，不作正式規格。主要規格是 `docs/04-uat/system-remediation-20260906/feature-contracts.md`、其 `source/capabilities.json` 的 C012／C023／C051／C052／C059／C071／C113–C115、`source/new-gaps.json` 的 N01／N02／N03／N10、各任務 runbook 及 `docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md`。

本文件不取代既有 SA／SD 正式規格；討論定案後，將接受的增補放回原有規格／任務欄位，避免多份互相矛盾的真實來源。
