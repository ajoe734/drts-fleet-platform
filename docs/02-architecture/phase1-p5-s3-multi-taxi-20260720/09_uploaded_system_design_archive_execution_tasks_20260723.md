# 上傳系統設計來源 Snapshot 與歷史最小任務

**文件版本：** v1.1
**日期：** 2026-07-23
**範圍狀態：** Superseded by full 17-screen decision on 2026-07-24
**執行基準：** `dev@2711c366f2e103ae9556d5afaf4558dfd9b0bb4c`
**來源：** `driver app (15).zip`
**來源 SHA-256：**
`634f27855d141633a1c1de102a2fee1c2a03850949f43b927c5fb6dea859a915`
**封存位置：**
`docs/05-ui/drts-design-canvas/archive/20260723-driver-app-15/`
**目的：** 保存上傳設計、裁決與 v1.1 的差異，並把可採用部分轉成
Fleets 可直接執行的最小任務。
**邊界：** 本文件保留 ZIP provenance、hash 與 2026-07-23 分析歷史。
2026-07-24 起不得再以本文件的「不派工」裁決阻擋 17 頁開發。

> **Current scope authority:** Product Owner 已核准全部 17 頁。
> 開發範圍與派工一律依
> `08_multi_taxi_operations_ui_design_requirements_20260723.md` v1.2 及
> `10_full_17_screen_fleets_execution_tasks_20260724.md`。本文件其餘 minimal
> scope／不派工段落只作決策歷史。

---

# 1. 前因後果

原始 v1.0 UI brief 把法規結果、營運工具與完整設計交付混成 17 個畫面。
後續重新盤點確認，法規要求的是預約載客、禁止違規攬客／排班、乘客資訊、
評價、支付結果、電子乘車證明及二年資料等結果，不要求專用 React route、
Figma、PNG 或各種管理 console。

因此 v1.1 已把本期操作 UI 限縮為 4 個 delta：

1. 改善既有 `/multi-taxi-authorizations`；
2. 在既有 `/dispatch` list/detail 顯示兩個標籤及拒絕文案；
3. 在既有 `/ride/{token}` 完成評價、付款及乘車證明狀態；
4. 提供一個營運紀錄查詢與直接下載 surface。

這次上傳 ZIP 主要沿用 v1.0 的 17 畫面構想。處理原則是「完整保存證據、
選擇性派工」：設計檔可以提供資訊層級與文案參考，但不能推翻 v1.1，也
不能憑 prototype 新增後端尚未核准的 command。

# 2. 封存結果

ZIP 共 138 個 entries，解壓後通過 path traversal 與 symlink 檢查。排除
preview、thumbnail、canvas state、export、重複 docs/uploads 及未變依賴後，
保存下列 8 個 source-facing files：

| 檔案                        | 對最新 `dev` | 封存裁決                                      |
| --------------------------- | ------------ | --------------------------------------------- |
| `Driver App.html`           | 相同         | 保存提交集合；只作 S-3 current-head 驗證參考 |
| `Ops Console.html`          | 不同         | 只採 queue labels／denial copy 與 S-3 參考   |
| `Platform Admin.html`       | 不同         | 只採 authorization 與 records 的最小部分     |
| `ops-mtx-queue.jsx`         | 新增         | 不採專頁；只取既有 dispatch 可容納的資訊      |
| `ops-screens-1.jsx`         | 不同         | 專用 queue navigation 不採用                  |
| `platform-mtx-auth.jsx`     | 新增         | 欄位、合法動作及狀態參考，合併回既有 route   |
| `platform-mtx-commerce.jsx` | 新增         | 只採 records subset，其餘 console 延後        |
| `platform-screens-1.jsx`    | 不同         | 新增的 moderation／commerce navigation 不採用 |

每個封存檔維持與 ZIP 完全相同的 bytes。精確大小、SHA-256 與排除規則見
archive `manifest.json`。

# 3. 規格優先順序

若文件、prototype 與實作不同，Fleets 必須依下列順序裁決：

1. 法規 hard gate 與 canonical runtime contracts；
2. `08_multi_taxi_operations_ui_design_requirements_20260723.md` v1.1；
3. `07_fleets_execution_tasks_20260723.md`；
4. 本文件的 task boundary；
5. 本次封存的視覺參考。

封存 prototype 不得建立 runtime authority，也不得讓 UI 提供 API 未支援
的 action。

# 4. Current-head Preflight

截至本文件基準，四項 delta 並非全部未做：

| Delta             | Current-head observation                                  | 分類       |
| ----------------- | --------------------------------------------------------- | ---------- |
| Authorization     | 既有 route、list、create/activate/suspend/add vehicle 已有 | `partial`  |
| Dispatch labels   | queue backend 已落地，既有 list/detail 尚缺指定中文標示    | `partial`  |
| Passenger states  | live authority、rating、receipt route 已有；payment rendering 與法定 receipt 欄位未閉環 | `partial` |
| Records           | records route、month query、CSV export 已於 #1130 落地；查詢條件、詳情與完整法定欄位仍需核對 | `partial` |
| S-3               | Driver/Ops canvas 與實作已存在                            | `verify`   |

每個 Fleet 開工前仍須依 `07` 第 2 節建立
`support/sidecars/<TASK-ID>/CURRENT-HEAD-PREFLIGHT.md`。如果最新 `dev` 已補齊
某項，改交 evidence-only closeout，不得重寫。

# 5. Existing Branch Claim Reconciliation

遠端 branch 只代表已有工作，不代表完成或可直接 merge。Supervisor 必須
先收斂既有 claim，再派剩餘 delta：

| Task                 | 既有 branch／PR observation                          | 本次派工決定 |
| -------------------- | ---------------------------------------------------- | ------------ |
| `MTX-AUTH-UI-001`    | `origin/gemini/mtx-auth-ui-001` 有 3 個未進 `dev` commits | 續用該 branch，對最新 `dev` preflight；不得另開第三份實作 |
| `MTX-QUEUE-003`      | `origin/codex/mtx-queue-003` 與 `origin/gemini/mtx-queue-003` 重疊 | 以包含較完整後續修正的 `gemini` branch 為 review candidate；另一支停止新增 commit |
| `P5-RET-UI-001`      | #1130 已 squash merge；舊 codex/gemini branches 仍存在 | 視為 stale implementation branches，不從舊 branch 繼續；新 delta 由 Fleet F 自最新 `dev` 開始 |
| `S3-VERIFY-001`      | codex 與 gemini 各有未合併 evidence commits          | 以 `gemini` evidence branch 為收斂候選，將 codex 尚未涵蓋的 blocker 併入報告，不做第二套產品實作 |
| Passenger UI delta   | 未發現同 Task ID 的 open PR                          | Fleet E 可由最新 `dev` 開始 |

Open PR #1126 是 `MTX-QUEUE-001` backend 的舊候選，不能代替
`MTX-QUEUE-003` UI 驗收。既有 branch 若 rebase 後已無 delta，提交
evidence-only closeout 並停止，不以空白或重複 PR 佔用 Task ID。

# 6. 可立即派工

## Fleet B: `MTX-AUTH-UI-001`

**狀態：** `resume_existing_branch`
**依賴：** authorization API/current-head preflight
**獨占範圍：**

- `apps/platform-admin-web/app/multi-taxi-authorizations/page.tsx`
- 該頁必要 translations 與 isolated tests

**設計參考：**

- archive `Platform Admin.html`
- archive `platform-mtx-auth.jsx`
- `08` 的 `MTX-UI-MVP-01`

**交付：**

1. 沿用 `/multi-taxi-authorizations`，不得新增 6 個 routes；
2. list/detail 顯示業者、核准識別碼、計畫版本、狀態、區域、生效期間、
   費率版本及車輛有效期間；
3. 補齊已核准的 edit draft；
4. 只顯示 create draft、update draft、activate、suspend、add vehicle；
5. 顯示 loading、empty、request/validation error、permission denied；
6. `expired`、`revoked` 顯示為唯讀。

**禁止：** revoke、restore、delete、vehicle suspend、bulk import、legal
hold，或新增 API command。

**驗收證據：**

- supported actions 與 API response 一致；
- unsupported action 不出現在 DOM；
- approved/draft/suspended/expired/revoked component tests；
- validation 與 403 狀態測試；
- 一張既有 route 的 desktop screenshot。

## Fleet C: `MTX-QUEUE-003`

**狀態：** `consolidate_existing_branches`
**依賴：** queue backend 已於 current head 落地；先做 preflight
**獨占範圍：**

- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
- 兩頁必要 translations 與 isolated tests

**設計參考：**

- archive `Ops Console.html`
- archive `ops-mtx-queue.jsx` 的 label／denial copy
- `08` 的 `MTX-UI-MVP-02`

**交付：**

在既有 list/detail 對 `multi_taxi_direct` 顯示：

```text
服務類型：多元化計程車（平台預約）
媒合方式：平台媒合
```

後端拒絕 `physical_rank`／`taxi_stand` 時就地顯示：

```text
此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。
```

**禁止：** 新 queue nav、queue overview/detail/denial routes、raw reason
code、bypass button 或 queue-mode 設定器。

**驗收證據：**

- list 與 detail 各一個 `multi_taxi_direct` 測試；
- ordinary taxi 不被錯標；
- physical rank/taxi stand rejection 文案測試；
- DOM 中無「仍要派遣」或同義 bypass；
- list/detail screenshots。

## Fleet E: `P5-PAX-WEB-001`

**狀態：** `ready_from_dev`
**依賴：** live Passenger authority contracts/current-head preflight；可與
Fleet F 平行，Fleet H 再驗證完整 runtime
**獨占範圍：**

- `apps/passenger-web/app/ride/[token]/`
- `apps/passenger-web/lib/passenger-live.ts`
- `apps/passenger-web/components/passenger-ride-page.tsx`
- 該 flow 必要 tests

**設計參考：** canonical P-5 canvas 與 `08` 的 `MTX-UI-MVP-03`。本次
`platform-mtx-commerce.jsx` 的後台 console 不屬於 Passenger 設計來源。

**交付：**

1. 保留既有乘前車輛、駕駛、評價、路線、車資與變更規則；
2. `canRate=true` 才能送 1 到 5 分，已評價不得重複；
3. 把 backend 提供的 6 個 canonical payment statuses 轉為 v1.1 中文結果；
4. receipt 準備中、可讀、讀取失敗可重試，不在 client 補造資料；
5. 將 backend receipt 法定欄位顯示為車號、上下車時間、行駛時間、路線、
   里程、車資、客服及主管機關申訴電話；
6. 缺少法定資料時不使用 fixture 或假預設值。

**禁止：** rating moderation、payment exception、certificate support
console，或沒有後端 command 的 payment retry。

**驗收證據：**

- 6 個 payment status mapping tests；
- canRate/已評價 idempotency tests；
- receipt pending/success/error tests；
- production fixture gate；
- mobile screenshots。

## Fleet F: `P5-PAY-001`、`P5-RCT-001`、`P5-RET-003`

**狀態：** `delta_after_#1130`
**依賴：** `P5-RET-UI-001` landed at `2711c366f`；可與 Fleet E 平行
**獨占範圍：**

- `apps/platform-admin-web/app/platform-admin/p5/records/`
- `P5AdminConsole` 的 records branch
- canonical payment、receipt 與 records API/contracts/tests，僅限實際缺口

**設計參考：**

- archive `Platform Admin.html`
- archive `platform-mtx-commerce.jsx` 的 records query layout only
- `08` 的 `MTX-UI-MVP-03`、`MTX-UI-MVP-04`

**先驗證 #1130，僅補下列缺口：**

1. payment canonical state 由 backend authority 產生，失敗或 unavailable
   不得成為 `captured`；
2. token-scoped receipt producer/read API 提供車號、上下車時間、行駛時間、
   路線、里程、車資、客服及主管機關申訴電話；
3. 日期區間、車號、訂單／趟次 ID 查詢；
4. 查詢結果數與可操作的單筆詳情；
5. UI 與 CSV 均包含車號、預約／上下車時間、路線、里程、應付／實收
   車資及通行費；
6. 下載範圍與匯出筆數可辨識；
7. 明示「法定最低保存期間：各趟次至少二年」；
8. read/export scopes、audit 與 730-day test evidence。

**禁止：** export job queue、retry dashboard、legal hold、archive tier、
retention editor、payment exception console、certificate support console。
同步 CSV 足夠時不得改成非同步 orchestration。

**驗收證據：**

- API query/filter tests；
- payment unavailable/failed/captured authority tests；
- token-scoped receipt legal-field tests；
- 法定欄位 completeness test；
- CSV content test；
- 403 read/export scope tests；
- retention floor test；
- records screenshot。

## Fleet G: `S3-VERIFY-UI-001`

**狀態：** `consolidate_evidence_only`
**依賴：** 無，可與 B/C/E/F 平行
**範圍：** 不重畫 Driver/Ops，不改 domain behavior。

以 archive `Driver App.html`、`Ops Console.html` 的 S-3 frames 交叉核對：

- Driver SOS states 與既有實作；
- Ops alert/list/detail states 與既有實作；
- current-head API/Driver/Ops E2E；
- Android/iOS offline replay；
- alert-to-Ops SLO 與必要 screenshot evidence。

若 current head 一致，提交 evidence-only closeout。只有可重現差異才能開
最小修正 PR。

## Fleet H: `E2E-MTX-UI-MVP-001`

**狀態：** `waiting`
**依賴：** B、C、E、F 完成；G 有 verification report
**獨占範圍：** shared E2E harness 與 evidence matrix

驗證單一路徑：

```text
有效 authorization
→ multi_taxi_direct 平台預約
→ virtual matching dispatch 標示
→ Passenger 乘前資訊
→ 完成旅程與 payment result
→ rating 與 receipt
→ records 查詢與 CSV 下載
```

同時驗證無效 authorization、physical rank/taxi stand、缺少 disclosure、
payment failed 與未授權 records access。Fleet H 可提出 release readiness，
不得自行發布或部署。

# 7. 2026-07-23 歷史不派工清單（已 superseded）

下列內容雖存在於 archive，這一輪不得建立 execution task：

| Archive concept                | 決定   | 原因                                  |
| ------------------------------ | ------ | ------------------------------------- |
| Dedicated queue pages/nav      | 不做   | 既有 dispatch 可容納法定資訊          |
| Six authorization pages        | 不做   | 既有 route 可完成合法 commands        |
| Rating moderation              | 延後   | 乘客評價不需要 moderation 才合法      |
| Payment exception console      | 延後   | 法規只要求付款結果可辨識              |
| Fare anomaly console           | 延後   | 尚無核准 recovery command             |
| Certificate support console    | 不做   | 既有 receipt surface 可處理讀取／重試 |
| Legal hold                     | 移出   | 無本期法規或法務案件需求              |
| Export job orchestration       | 延後   | 尚未證明同步 CSV 不足                 |
| Retention policy editor        | 不做   | UI 不得縮短法定保存期間               |
| New design system/Figma bundle | 不做   | 非法規結果，也非實作用必要條件        |

# 8. Collision 與派工順序

本輪可立即平行派 B、C、E、F、G，因主要 app surface 分離。以下檔案仍須
遵守獨占：

| Surface                                  | Owner  |
| ---------------------------------------- | ------ |
| Platform Admin authorization route       | Fleet B |
| Ops dispatch list/detail                 | Fleet C |
| Passenger ride flow                      | Fleet E |
| Payment/receipt/records API and P-5 records UI | Fleet F |
| Shared E2E harness                       | Fleet H |

Platform Admin translation file若 B/F 同時修改，各自只加 task namespace，
不得重排或格式化全檔。Fleet H 必須等 B/C/E/F merge 後再開始 shared-harness
變更。

```text
B ─┐
C ─┤
E ─┼→ Fleet H
F ─┤
G ─┘ verification report
```

# 9. Fleets PR Contract

每個 PR body 必須包含：

```text
Task-ID: <task>
Depends-On: <task/commit or none>
Baseline-SHA: <preflight dev SHA>
Requirement: 08_multi_taxi_operations_ui_design_requirements_20260723.md
Design-Source: docs/05-ui/drts-design-canvas/archive/20260723-driver-app-15/
Archive-SHA256: 634f27855d141633a1c1de102a2fee1c2a03850949f43b927c5fb6dea859a915
Historical-Minimal-Scope-Only: yes
Current-Dispatch-Authority: 10_full_17_screen_fleets_execution_tasks_20260724.md
```

PR 必須附 preflight、變更範圍、測試、實際 UI screenshot、API/contract
readback 及剩餘 blocker。只有 screenshot 或 prototype 不算完成。

# 10. Supervisor Dispatch Register

| 順序 | Task                    | Fleet | 現在動作                         |
| ---- | ----------------------- | ----- | -------------------------------- |
| 1    | `MTX-AUTH-UI-001`       | B     | 續作 gemini branch，preflight 後只補缺口 |
| 1    | `MTX-QUEUE-003`         | C     | 收斂至 gemini candidate，不開第三支 |
| 1    | `P5-PAX-WEB-001`        | E     | preflight 後補 payment/receipt   |
| 1    | `P5-PAY-001`、`P5-RCT-001`、`P5-RET-003` | F | 核對 #1130，只補付款／證明／紀錄法定缺口 |
| 1    | `S3-VERIFY-UI-001`      | G     | 收斂既有 evidence branches，不重做 UI |
| 2    | `E2E-MTX-UI-MVP-001`    | H     | 等 B/C/E/F merge 與 G report     |

所有任務完成後仍需由 release owner 另行作發布決定。本文件本身不等於正式
發布核准。
