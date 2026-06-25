# Phase 2 Tesla FSD 監理沙盒 — 規格缺口與待補頁面（交系統設計／視覺設計團隊）

> 文件基準日：2026-06-25
> 規格來源：[`phase2-tesla-fsd-sandbox/`](./phase2-tesla-fsd-sandbox/)
> 執行計畫：[`phase2_tesla_fsd_sandbox_execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md)
> 用途：規格包已足以啟動**後端／契約／測試**派工（Gate B），但下列項目**缺 UI canvas、缺頁面、缺規格實值**，
> 需系統設計與視覺設計團隊補完後，才能開第二波 UI build。**工程端不自行設計 UI、不捏造法規與廠商數值。**

---

## A. 缺 design canvas 的新介面（視覺團隊優先）

規格定義了頁面清單與資料，但 `docs/05-ui/drts-design-canvas/` 內**沒有對應的 `*-screens.jsx` canvas**。
依專案規則（寫 UI 前必須有 canvas），以下需視覺團隊先出 canvas：

### A1. ROC Console — 全新 app `apps/roc-console-web`（最高優先）
- 規格：`07_..._spec.md` §A、`03_prd.md` §2.2。
- 需要的 screen canvas：Overview、Live Board、Trips、Vehicles、Vehicle Detail、Takeover Queue（三欄：Tesla 事件／安全員回報／ROC 處置）、
  Alerts、Incidents、Evidence、Provider Health、Regulatory Reports、Shift Handover。
- 視覺硬規則（務必落 canvas）：
  - 核准區域/路線 overlay；**不顯示**方向盤角度、FSD perception object、路側設備 health。
  - telemetry freshness 與 regulatory-event freshness **分開兩個指標**。
  - 原廠事件 / 安全員回報 / ROC 處置**三欄並列**，不可合併成單一「真相」。
  - 動作 CTA 全由 backend `availableActions` 驅動；**無 remote driving 控制元件**。
  - 每個 Tesla/沙盒狀態標 evidence source（`tesla_provided`…`not_exposed_by_provider`）。
- 需指定：採用哪個既有 console 的 design system / shell（建議比照 ops-console coral 或新色票，需 IA authority 裁定）。

### A2. Safety Operator Mode — driver-app 內新 realm（高優先）
- 規格：`07_..._spec.md` §B、`03_prd.md` §2.3。
- 需要 screen canvas：Provisioning/Qualification、Shift Start、Vehicle Assignment、Pre-trip Checklist、
  Active Trip、Takeover Report、Incident/Evidence Upload、Trip Closeout、Shift Handover。
- 硬規則：與一般司機 mode **分離**；**離線暫存 + 未同步狀態可視**；Takeover Report 需快速 capture（時間可改但留 audit）；
  **不顯示也不嘗試控制 Tesla FSD internal controls**。

### A3. Platform Admin — Sandbox Governance 頁（中優先，擴充既有 app）
- 規格：`03_prd.md` §2.1。`apps/platform-admin-web` 已存在，但缺以下頁的 canvas：
  Experiments、Jurisdiction Profiles、Approval Documents、Operating Areas/Routes/Schedules、
  Vehicle Enrollments、Safety Operator Qualifications、Tesla Integrations、Regulatory Capabilities、
  Evidence & Retention Policies、Reporting Policies、Suspension/Resume。
- 需地圖編輯元件（PostGIS polygon/线段繪製）— 視覺團隊需定義繪圖互動。

### A4. Ops Console — AV fallback / passenger recovery（中優先，擴充既有 app）
- 規格：`02_sd.md` §2.2 / §10、`11_flows.md` §5。`apps/ops-console-web` 需新增：AV→人駕 fallback 觸發與追蹤、
  乘客 ETA/服務狀態更新、sandbox exception 列表。需與既有派遣畫面整合的 canvas delta。

### A5. Compliance & Investigation 頁（中優先，歸屬待定）
- 規格：`03_prd.md` §2.4。頁面：Experiment Compliance Dashboard、Trip Compliance Detail、Takeover Review、
  Accident Case、Synchronized Timeline（影像+telemetry 同步播放器）、Evidence Manifest、Controlled Export、
  Regulatory Report Jobs、Legal Hold。
- **歸屬未定**：要併入 ROC Console、platform-admin，還是新 console？需 IA authority 裁定（請在 canvas 前決定）。
- Synchronized Timeline 的同步播放器是高複雜度元件，需視覺團隊單獨設計互動。

### A6. Local Authority / Regulator Viewer Portal（低優先，可選）
- 規格：`05_..._spec.md` §7。受控唯讀：experiment overview、approved route/time/vehicle/operator、active trips、
  incident/takeover summary、regulatory reports、evidence bundle request。需 scoped access + masking 的視覺呈現。

---

## B. 缺「規格實值」的項目（系統設計／法遵／營運補資料，非 UI）

規格刻意 policy-driven、不硬編，因此下列**實際數值/契約**需補（工程用 config 佔位，不得捏造）：

1. **Tesla Regulatory Data Interface 契約**：真實 endpoint 名稱、auth、reason-code dictionary、
   incident 影像是否提供、SLA 實值、schema 版本流程、data residency。→ Tesla + legal + 系統設計。
2. **沙盒核准條件實值**：通報時限（規格示意 1 小時 / 10 日，需核准函確認）、保存年限（示意 30 天一般影像／3 年事故影像）、
   允許路線/區域/時段/車輛/安全員、最大趟次/里程、保險與許可。→ 主管機關 / 專案 owner。
3. **在地通報矩陣實值**：警/消/EMS/醫院/拖吊/保險/資安聯絡窗口、各事件級別的對象/時限/方式/必填欄位/核准人。→ 在地營運。
4. **Evidence recorder 廠商協定**：device API、health 欄位、segment/上傳協定、影像保存。→ 採購 / 整合。
5. **Tesla Fleet 真帳號/車輛或官方 sandbox**：用以把 Gate B 升級 Gate C。→ Tesla / business team。

> 工程交付（本次後端 wave）已用 adapter + capability profile + JSONB policy snapshot 把以上隔離；
> 缺值期間相關 capability 維持 **gated / fail-closed**，不影響 repo build。

---

## C. 規格本身建議補強（回饋給系統設計團隊）

下列在規格包中**未完全定義**，建議補一段 decision packet，以免工程實作時各自臆測：

1. **Compliance & Investigation 頁的歸屬 app**（見 A5）— 影響 landing zone 與 routing。
2. **ROC Console 的 design system 來源**（沿用哪個 shell / 色系）— 影響 `packages/ui-web` 共用範圍。
3. **Passenger / Tenant / Partner 端的可見度**：規格說乘客僅接收服務狀態，但未定義 AV/fallback 時
   既有 passenger-web / tenant-console 要顯示什麼文案與狀態。需一份 passenger-facing copy/state spec。
4. **Billing 維度**：SD §10 說「附 sandbox/AV fulfillment dimensions」，但未定義計費差異（AV 趟 vs fallback 人駕趟的
   費率/分潤是否不同）。需 billing decision packet。
5. **Audit event 目錄**：規格要求所有 command/report/evidence access 進 append-only audit，但未列 event taxonomy。
   建議補一份 Phase 2 audit event 清單（比照 Phase 1 既有 taxonomy）。
6. **資料保存與 legal hold 衝突的具體處理**（`04_spec` §6 提及但未定義流程）。

---

## D. 交付建議順序

1. **視覺團隊**：先出 A1（ROC Console）+ A2（Safety Operator Mode）canvas — 這兩個是 Phase 2 完成線的核心操作面。
2. **系統設計團隊**：先裁定 C1（Investigation 歸屬）、C2（ROC design system）、C3（passenger 可見度）— 解鎖 A3–A5 與 UI 第二波。
3. **法遵／營運／Tesla 窗口**：並行推進 B1–B5 外部契約；到位即可把 Gate B → C/D/E。

canvas 與裁定到位後，回到
[`phase2_tesla_fsd_sandbox_execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md) 追加 UI build 第二波。
