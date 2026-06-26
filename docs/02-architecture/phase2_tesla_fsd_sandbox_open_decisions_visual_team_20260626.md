# Phase 2 Tesla FSD 監理沙盒 — 待決策清單（視覺設計團隊）

> 文件基準日：2026-06-26
> 狀態：**系統設計 S1–S6 已回（2026-06-26）→ V1 解鎖、V2 收斂為小 delta**；見
> [`..._open_decisions_s1s6_system_design_response_20260626.md`](./phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md)。
> 下方各項已標更新；視覺團隊現在只剩兩個明確動作（V1 版位、V2 panel delta）。
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
**相依**：✅ **已解鎖** — 系統設計 S1=(a) 已定 message catalog（`P2_AV_FALLBACK_INITIATED_V1` / `_FALLBACK_ASSIGNED_V1` / `_ASSIGNED_NOTICE_V1` / `_INCIDENT_HOLD_NOTICE_V1` 等 baseline messageCode 已有文字）。視覺只需定**版位與狀態切換**，文字 slot 接 `messageCode`，**canvas 不寫死文案**。
**需要回**：上述三個既有 app 的 fallback 狀態 canvas/delta（現在可直接進場）。

---

## V2. A6 Regulator / Local Authority Viewer Portal ✅ 已收斂（S2=b：不做獨立 portal）

**裁決（S2=b）**：Phase 2 **不建獨立 regulator portal**，改用 Platform Admin Compliance 的 `CMP_Regulator` panel + controlled export。
所以視覺團隊**不用出整套新 canvas**，只需把現有 `CMP_Regulator` panel 擴成下列內容（小 delta）：

> experiment selector、accident case selector、evidence manifest summary、investigation bundle status、
> regulatory notification status、controlled export button、legal hold indicator、masking mode indicator、
> access log table、export receipt panel

歸屬：仍在 `apps/platform-admin-web` Compliance route group（與 C1 一致）。
**對應 UI/API task**：`P2-DP-S2-001`（已派工）。
**需要回**：`CMP_Regulator` panel 的 delta canvas（含上述元件版位）。完整外部 regulator 直連 portal 列 Phase 2.x，本波不做。

---

## 交付建議

1. **V1 優先**：passenger/tenant fallback delta 是乘客直接體感，且 C3/C4 已定 contract，視覺只差版位 → 可立即進場（文字 slot 待 S1，但版位不擋）。
2. **V2 等 S2**：先不動，待系統設計回 A6 做不做。

回覆後，工程會依新 canvas 追加對應 UI build task（passenger/tenant fallback、必要時 regulator viewer），更新
[`..._execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md) §2c。
