# Ops Console — 派車資格 + 營運報表（Design Hand-off）

**日期：** 2026-06-19
**Feature：** Ops Console 兩個增量介面：(A) 派車候選面板加上 eligibility 判斷與原因，(B) Reports 頁新增「每日派遣紀錄」與「半年營運摘要」
**Recipient team：** 視覺設計團隊（含 UX）
**Status：** Hand-off input（增量補充）. **No visual decisions in this document.**
**Author lane：** Claude
**Authority：**
[SA §5.5–§5.7/§7/§9](./../02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md) ·
[SD §2.8/§2.10/§3.3/§3.5/§6.3](./../02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md)
**Visual authority（既有殼／IA，請延用）：** `drts-design-canvas/ops-screens-3.jsx`、`ops-screens-1.jsx`、`ops-screens-2.jsx`、`Ops Console.html`

> 與 `credit-card-airport-transfer-screen-requirements-20260610.md` 同型。**No visual decisions.**

---

## 1. 為什麼有這份 packet

Ops 的 dispatch board 與 Reports 頁已有 canvas。本次是**增量**：派車候選要看到精確 service product 與 eligibility 判斷／原因（不能只看到「無車」），Reports 要多兩種報表類型。canvas 已存在，因此這是**行為/資料補充**，不重畫殼。

## 2. Personas

`ops_dispatcher`（派車、理解不符合原因）、`ops_manager`（看 stale / tracking 異常 / 摘要）、`ops_compliance`（查每日紀錄、半年摘要、客訴統計）。

## 3. Scope

| 介面                                            | 狀態                    |
| ----------------------------------------------- | ----------------------- |
| (A) Dispatch candidate panel — eligibility 增量 | 本 packet（增量）       |
| (B) Reports — 每日派遣紀錄 + 半年營運摘要       | 本 packet（新報表類型） |

Out of scope：dispatch engine、complaint center、既有 board 版面。

## 4. Surface A — Dispatch candidate panel（eligibility awareness）

候選查詢 response 新增（SD §3.3 / §2.8）：`serviceProductContext`、`eligibilityDecision`、`hardReasonCodes`、`softReasonCodes`、`missingRequirements`、`locationState`、`policyVersion`。

每個候選列須能呈現：

- **精確 service product**（exact code，非 broad bucket）。
- **readiness**（ready / not_ready / suspended）。
- **eligibility decision badge**：`eligible` / `conditionally_eligible` / `ineligible`。
- **hard vs soft reason codes**（hard 不可 override；soft 可由有權限 Ops 以原因 override）。
- **missingRequirements** 清單。
- **location freshness**：`fresh` / `stale` / `low_accuracy` / `missing`。
- **policy version**（可追溯）。

行為要求：

- **「顯示被排除候選 / includeIneligible」切換**：預設只回 eligible + conditionally；開啟 `includeIneligible=true` 顯示被排除者與原因（SD §3.3）。
- **No-eligible-supply 狀態**：必須顯示**原因**（reason codes / missingRequirements），**不得**只出現空清單或「無車」（SA §5.6）。
- **Assignment-time recheck**：指派時後端重評；若資格已變 → 409 `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT`，UI 須即時呈現最新原因並要求重選，不可硬指派（SA §5.7 / SD §3.3）。
- soft override：須收集 reason（送出後 audit）。

## 5. Surface B — Operational Reports（Reports 頁新增）

兩種新報表類型作為 Reports 頁項目（SD §3.5：jobType `daily_dispatch_record`、`six_month_operations_summary`；另有 `GET /api/ops/reports/operations-summary/preview`）。

篩選（SA §7.7）：日期 · business area · service product · order source · tenant / partner · status。
每份報表顯示 metadata：`generatedAt` · data coverage · source freshness · report status · download · regenerate。

**固定口徑（須正確標示，不可前端自算）—— SA §7.4：**

- `demandRequestCount`：期間內正式 booking/order 的 distinct orderId（不含 draft/validation failed/test/duplicate replay；取消仍計）。
- `actualDispatchCount`：第一次成功 assignment 或外部 accept 的 distinct orderId（redispatch 不重計；broadcast/failed/lost race 不計）。
- `completedTripCount`：completed 的 distinct order。
- `averageDispatchableVehicleCount` = sum(snapshot.dispatchableVehicleCount) / validSnapshotCount；同時輸出 `validSnapshotCount` / `expectedSnapshotCount` / `coverageRate`。
- `complaintCount`：distinct complaint case，依 category 分組。

每日派遣紀錄欄位（SD §2.10 `DispatchDailyRecord`）：serviceDate / orderId / orderNo / orderSource / tenant·partner / serviceProductCode / requestedAt / reservationTime / pickup·dropoff snapshot / firstDispatchAt / firstAssignedAt / final driver·vehicle·plate / etaSecondsAtAssignment / arrivedPickupAt / tripStarted·Completed / finalStatus / redispatchCount / cancellationReason / complaintCount。
order source（SA §7.2）：phone / ops_console / tenant_portal / partner_booking / api / third_party_platform。

品質旗標：

- **coverage < 95%** → 報表標示「資料不完整」（SA §7.4）。
- **`ARRIVAL_EVENT_MISSING`**：無 arrived event 時 arrivedPickupAt 為 null，不可用 tripStartedAt 倒推（SA §7.3）。

匯出格式（SA §7.6）：每日紀錄 CSV / XLSX / PDF；半年摘要 PDF / CSV / JSON。
重算：on-demand 指定區間 regenerate（SA §7.5）。

## 6. 錯誤 / edge（SA §9）

Eligibility：`NO_ELIGIBLE_SUPPLY`、`ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT`、`LOCATION_STALE`、`SERVICE_PRODUCT_MAPPING_MISSING`。
Reporting：`REPORT_SOURCE_INCOMPLETE`、`SUPPLY_SNAPSHOT_COVERAGE_LOW`、`REPORT_REBUILD_IN_PROGRESS`、`REPORT_PERIOD_INVALID`。

## 7. 純視覺 open questions（交設計團隊）

- VQ-1 候選列要塞 decision badge + reason codes + freshness + policy version，密度如何安排？
- VQ-2 被排除候選：inline 灰階 vs 獨立區塊？
- VQ-3 no-supply 時的「原因」呈現（讓 dispatcher 知道缺什麼）。
- VQ-4 assignment 409 重評的 UX（inline 提示 vs 阻斷對話框）。
- VQ-5 報表 coverage<95% 警示、source freshness、report status 的 chip 呈現。
- VQ-6 半年摘要的數字 + coverage 並陳方式。

## 8. Out of scope for design

dispatch engine、complaint center、報表後端聚合、snapshot 排程、既有 board 版面與既有報表類型。
