# Phase 2 Tesla FSD 監理沙盒 — 待決策清單（視覺設計團隊）

> 文件基準日：2026-06-26
> 狀態：**待視覺團隊回覆**
> 配套（系統設計待決策）：[`..._open_decisions_system_design_team_20260626.md`](./phase2_tesla_fsd_sandbox_open_decisions_system_design_team_20260626.md)
> 背景：A1–A5 canvas 已交付並歸檔（ROC / Safety Operator / Compliance / Sandbox Governance / Ops fallback），UI build 第二波已派工。
> 本清單只列**canvas 已交付後仍缺的視覺項目**。**工程端不自行設計 UI**，故下列需視覺團隊出 canvas/delta 才能 build。

---

## V1. 既有 app 的 AV→人駕 fallback 畫面 delta（缺 canvas）

**問題**：裁決 C3 已定 passenger/tenant/partner 的 fulfillment 可見度 contract 與 `messageCode`，但本次 canvas 只交了**新 console**（ROC / Compliance / Sandbox Gov / Ops fallback）。**既有 app** 在 AV→人駕 fallback 時要顯示什麼狀態畫面，目前 canvas 不足：

| App | 現況 | 缺的 fallback 狀態畫面 |
|---|---|---|
| `apps/passenger-web` | 無 Phase 2 fallback delta | `vehicle_change_in_progress`、`human_fallback_assigned`、`service_continuing`、`eta_updated` 四態的乘客畫面 |
| `apps/tenant-console-web` | 無 Phase 2 fallback delta | planned vs actual fulfillment、fallback stage、ETA 變更、billing/SLA treatment 顯示 |
| `apps/passenger-embed`（pe） | canvas 內**部分**有 fallback | 確認是否已覆蓋上述四態，缺的補齊 |

**硬規則（務必落 canvas）**：
- 文案 slot 一律由 backend `passengerMessageCode` / `tenantMessageCode` 驅動，**canvas 不寫死文字**，只標「此處渲染 messageCode」。
- 乘客端**不顯示** Tesla reason code、FSD transition、operational hold 細節、事故分類、evidence freeze/legal hold、安全員/ROC 人員姓名。
- 不因 fallback 出現第二張 booking 或加收提示（裁決 C4：`fallbackSurchargeApplied=false`）。

**阻擋**：UI task `P2-UI-OPS-001` 只涵蓋 ops-console 側；passenger/tenant 既有 app 的 fallback 顯示**尚無對應 UI task**，待此 canvas delta 才能開。
**相依**：實際文案內容（messageCode→文字）與揭露 policy 屬系統設計 [S1]，視覺只需定**版位與狀態切換**，文字由 S1 供。
**需要回**：上述三個既有 app 的 fallback 狀態 canvas/delta。

---

## V2. A6 Regulator / Local Authority Viewer Portal（缺完整 canvas，且先等 S2 拍板）

**問題**：原 spec `05_..._spec.md §7` 的「受控管轄調閱 portal」目前 canvas 只有 Compliance 內的 `CMP_Regulator` **片段**，沒有完整的 scoped read-only regulator portal（experiment overview / approved route-time-vehicle-operator / active trips / incident & takeover summary / regulatory reports / evidence bundle request + masking）。

**先決條件**：原 spec 標此頁為「可選」。**是否納入 Phase 2、歸屬與 scope/masking 規則由系統設計 [S2] 先拍板**。

**需要回（條件式）**：
- 若 [S2] 決定**做** → 視覺團隊依其 scope 出完整 regulator viewer canvas（建議仍用 Platform Admin governance shell + masking 呈現，與 C1 一致）。
- 若 [S2] 決定**不做 / 用 `CMP_Regulator` 片段即可** → 視覺團隊無需動作，本項關閉。

**阻擋**：A6 對應的 UI task 尚未派（待 S2）。

---

## 交付建議

1. **V1 優先**：passenger/tenant fallback delta 是乘客直接體感，且 C3/C4 已定 contract，視覺只差版位 → 可立即進場（文字 slot 待 S1，但版位不擋）。
2. **V2 等 S2**：先不動，待系統設計回 A6 做不做。

回覆後，工程會依新 canvas 追加對應 UI build task（passenger/tenant fallback、必要時 regulator viewer），更新
[`..._execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md) §2c。
