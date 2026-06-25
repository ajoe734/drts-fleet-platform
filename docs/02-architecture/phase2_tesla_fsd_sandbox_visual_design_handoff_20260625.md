# Phase 2 Tesla FSD 監理沙盒 — 視覺設計團隊交付文件（缺 canvas / 待補頁面）

> 文件基準日：2026-06-25
> 規格來源：[`phase2-tesla-fsd-sandbox/`](./phase2-tesla-fsd-sandbox/)
> 執行計畫：[`phase2_tesla_fsd_sandbox_execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md)
> 配套（系統設計）：[`phase2_tesla_fsd_sandbox_system_design_handoff_20260625.md`](./phase2_tesla_fsd_sandbox_system_design_handoff_20260625.md)
>
> 用途：後端／契約／測試 wave 已派工（Gate B）。下列**新介面與新頁面缺 design canvas**，
> 依專案規則（寫 UI 前 `docs/05-ui/drts-design-canvas/` 必須有對應 `*-screens.jsx`），需視覺團隊先出 canvas，
> 工程才接 UI build 第二波。**工程端不自行設計 UI。**

> ⚠️ **跨團隊相依**：標記 🔒 的頁面需先有系統設計裁定（見配套文件 §C）才能定 canvas，否則會白做。
> 進場前請先確認對應裁定已回。

---

## 優先序總表

| 介面 | App | 優先 | 阻擋裁定 | 規格 |
|---|---|---|---|---|
| A1 ROC Console | `apps/roc-console-web`（新） | 最高 | 🔒 design system 來源（系統設計 §C2） | `07_spec §A`、`03_prd §2.2` |
| A2 Safety Operator Mode | `apps/driver-app`（新 realm） | 高 | 無 | `07_spec §B`、`03_prd §2.3` |
| A3 Platform Admin 沙盒治理頁 | `apps/platform-admin-web`（擴充） | 中 | 無 | `03_prd §2.1` |
| A4 Ops Console AV fallback | `apps/ops-console-web`（擴充） | 中 | 無 | `02_sd §2.2/§10`、`11_flows §5` |
| A5 Compliance & Investigation | 歸屬待定 | 中 | 🔒 歸屬 app（系統設計 §C1） | `03_prd §2.4` |
| A6 Regulator Viewer Portal | 待定（可選） | 低 | 🔒 歸屬（系統設計 §C1） | `05_spec §7` |

建議進場順序：**A2 →（C2 裁定回後）A1 → A3 / A4 →（C1 裁定回後）A5 → A6**。

---

## A1. ROC Console — 全新 app `apps/roc-console-web`（最高優先）🔒

- 規格：`07_..._spec.md` §A、`03_prd.md` §2.2。
- 需要的 screen canvas：Overview、Live Board、Trips、Vehicles、Vehicle Detail、Takeover Queue（三欄：Tesla 事件／安全員回報／ROC 處置）、
  Alerts、Incidents、Evidence、Provider Health、Regulatory Reports、Shift Handover。
- 視覺硬規則（務必落 canvas）：
  - 核准區域/路線 overlay；**不顯示**方向盤角度、FSD perception object、路側設備 health。
  - telemetry freshness 與 regulatory-event freshness **分開兩個指標**。
  - 原廠事件 / 安全員回報 / ROC 處置**三欄並列**，不可合併成單一「真相」。
  - 動作 CTA 全由 backend `availableActions` 驅動；**無 remote driving 控制元件**。
  - 每個 Tesla/沙盒狀態標 evidence source（`tesla_provided`…`not_exposed_by_provider`）。
- 🔒 **阻擋**：採用哪套 design system / shell / 色系，待系統設計 §C2 裁定（建議比照 ops-console coral 或新色票）。

## A2. Safety Operator Mode — driver-app 內新 realm（高優先）

- 規格：`07_..._spec.md` §B、`03_prd.md` §2.3。
- 需要 screen canvas：Provisioning/Qualification、Shift Start、Vehicle Assignment、Pre-trip Checklist、
  Active Trip、Takeover Report、Incident/Evidence Upload、Trip Closeout、Shift Handover。
- 硬規則：與一般司機 mode **分離**；**離線暫存 + 未同步狀態可視**；Takeover Report 需快速 capture（時間可改但留 audit）；
  **不顯示也不嘗試控制 Tesla FSD internal controls**。
- 無阻擋裁定，可最先進場。

## A3. Platform Admin — Sandbox Governance 頁（中優先，擴充既有 app）

- 規格：`03_prd.md` §2.1。`apps/platform-admin-web` 已存在，但缺以下頁的 canvas：
  Experiments、Jurisdiction Profiles、Approval Documents、Operating Areas/Routes/Schedules、
  Vehicle Enrollments、Safety Operator Qualifications、Tesla Integrations、Regulatory Capabilities、
  Evidence & Retention Policies、Reporting Policies、Suspension/Resume。
- 需地圖編輯元件（PostGIS polygon/線段繪製）— 視覺團隊需定義繪圖互動（畫多邊形、畫路線、上下客點）。

## A4. Ops Console — AV fallback / passenger recovery（中優先，擴充既有 app）

- 規格：`02_sd.md` §2.2 / §10、`11_flows.md` §5。`apps/ops-console-web` 需新增：AV→人駕 fallback 觸發與追蹤、
  乘客 ETA/服務狀態更新、sandbox exception 列表。需與既有派遣畫面整合的 canvas delta。

## A5. Compliance & Investigation 頁（中優先，歸屬待定）🔒

- 規格：`03_prd.md` §2.4。頁面：Experiment Compliance Dashboard、Trip Compliance Detail、Takeover Review、
  Accident Case、Synchronized Timeline（影像+telemetry 同步播放器）、Evidence Manifest、Controlled Export、
  Regulatory Report Jobs、Legal Hold。
- 🔒 **阻擋**：要併入 ROC Console、platform-admin，還是新 console，待系統設計 §C1 裁定後才能定 canvas 歸屬。
- Synchronized Timeline 的同步播放器是高複雜度元件，需視覺團隊單獨設計互動（時間軸 scrub、多影像源 + telemetry 對齊）。

## A6. Local Authority / Regulator Viewer Portal（低優先，可選）🔒

- 規格：`05_..._spec.md` §7。受控唯讀：experiment overview、approved route/time/vehicle/operator、active trips、
  incident/takeover summary、regulatory reports、evidence bundle request。需 scoped access + masking 的視覺呈現。
- 🔒 歸屬同 §C1。

---

canvas 完成後，回 [`phase2_tesla_fsd_sandbox_execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md) 追加 UI build 第二波。
