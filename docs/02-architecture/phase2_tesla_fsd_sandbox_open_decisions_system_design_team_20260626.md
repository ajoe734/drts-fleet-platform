# Phase 2 Tesla FSD 監理沙盒 — 待決策清單（系統設計團隊）

> 文件基準日：2026-06-26
> 狀態：✅ **已全部裁決（2026-06-26）：S1=a S2=b S3=a S4=a S5=a S6=b**。
> 正式回覆與 contracts/DDL/message-catalog 見
> [`..._open_decisions_s1s6_system_design_response_20260626.md`](./phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md)；
> 已派 6 個 `P2-DP-S*-001` 任務。下方保留原問題脈絡。
> 配套（視覺待決策）：[`..._open_decisions_visual_team_20260626.md`](./phase2_tesla_fsd_sandbox_open_decisions_visual_team_20260626.md)
> 背景：C1–C6 已 ACCEPTED（見 [`..._decision_packet_c1c6_b1b5_20260625.md`](./phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md)）；
> 後端/契約/UI wave 已派工。本清單只列 **C1–C6 之後仍未拍板的系統設計缺口**（非 B1–B5 外部契約）。
> 每項給出問題、選項與建議；工程缺值期間維持 `missing/unverified/external_gated`、fail-closed。

---

## S1. PassengerDisclosurePolicy 內容 + fallback 文案權威（綁 B2）

**問題**：裁決 C3 定了可見度 contract 與 `messageCode`，但**實際揭露內容與文案**未定：
- AV 派車前的揭露文字、是否需 checkbox / 電子同意（裁決 §5.3 說「未配置完整則不得派 AV」）。
- `passengerMessageCode` / `tenantMessageCode` → **真 i18n 文案字串**（中/英）由誰擁有、放哪（建議建 canonical message catalog）。

**為何要決策**：視覺 [V1] 只做版位，文字 slot 等這份；且揭露同意綁核可條件（B2）。
**選項**：
- (a)（建議）系統設計 + 法遵定一份 `PassengerDisclosurePolicy`（揭露文字 + 是否 e-consent + 版本化），i18n 文案進 canonical message catalog，messageCode 為唯一權威；缺配置 → 不得派 AV。
- (b) 暫用裁決 §5.3 的示意文案作 placeholder，標 `unverified`，待核可條件回再定稿。

**阻擋**：V1 文字、`P2-DP-C3-001` 的 messageCode 對照表落地、AV 載客 gate。
**需要回**：採 (a)/(b)，與文案 owner。

---

## S2. A6 Regulator / Local Authority Viewer Portal 做不做（gates 視覺 V2）

**問題**：原 spec `05_..._spec.md §7` 的受控管轄調閱 portal 標「可選」；目前只有 Compliance 內 `CMP_Regulator` 片段。
**為何要決策**：決定 Phase 2 是否納入、歸屬與 scope/masking；此決定 **gate 視覺 [V2]**。
**選項**：
- (a) Phase 2 **納入**：併 `apps/platform-admin-web`（與 C1 一致），scoped read-only + masking，Local Authority Viewer 只有特定 experiment/case read scope → 視覺出完整 canvas、工程追加 UI+API task。
- (b)（建議先這樣）Phase 2 **不獨立做**，先用 Compliance 的 `CMP_Regulator` + 既有 controlled export 滿足調閱；正式 portal 列 Phase 2.x。
- (c) 完全延後。

**阻擋**：A6 canvas（V2）與其 UI/API task。
**需要回**：採 (a)/(b)/(c)。

---

## S3. C4 `fallbackCostAbsorber` 適用規則（綁商務合約）

**問題**：裁決 C4 定了 `fallbackCostAbsorber: "platform" | "partner" | "tenant_contract"` 三個值，但**哪種情況用哪個**未定（per-partner / per-tenant policy）。
**為何要決策**：`P2-DP-C4-001` 需要規則才能正確產 `SandboxBillingTreatmentRecord`；否則只能全部記 `platform` 佔位。
**選項**：
- (a)（建議）系統設計 + 商務定一份 per-partner / per-tenant 的 fallback-cost policy（含預設 `platform`），版本化、effective-dated。
- (b) Phase 2 baseline 一律 `platform` 吸收，partner/tenant 分攤列 Phase 2.x。

**阻擋**：`P2-DP-C4-001` 的成本歸屬正確性（不擋 build，擋實值正確）。
**需要回**：採 (a)/(b)，(a) 的話給 policy 來源。

---

## S4. C5 audit 與 Phase 1 audit 的整合策略

**問題**：裁決 C5 定了 Phase 2 append-only audit taxonomy + `Phase2AuditContext`，但與既有 Phase 1 audit module 的 **storage/檢索**整合未定：共用 table 還是分流？
**為何要決策**：`P2-DP-C5-001` 落地前要定，避免之後遷移。
**選項**：
- (a)（建議）共用 Phase 1 append-only audit store，Phase 2 events 以 `domain` 前綴 + `Phase2AuditContext` 擴充欄位入同表，檢索沿用既有 audit 查詢。
- (b) Phase 2 獨立 audit store，必要時 cross-link（多一套基礎設施與查詢面）。

**阻擋**：`P2-DP-C5-001` 設計。**屬可由工程 + 系統設計小範圍自決**，但請給一句確認以免回頭。
**需要回**：採 (a)/(b)。

---

## S5. Canonical DDL 文件補 DP 新表（規格文件維護）

**問題**：裁決 packet §10.2 新增 5 個 contract，對應的表**沒回寫進** canonical
`phase2-tesla-fsd-sandbox/10_phase2_data_model_ddl_draft.sql`（hash-verified，故不直接改）：
`evidence_legal_holds`、`evidence_legal_hold_release_requests`、`evidence_deletion_exceptions`、
`fulfillment_segments`、`sandbox_billing_treatments`、`sandbox_fulfillment_visibility`。
**為何要決策**：實作 migration 由 DP task 補，但**權威 DDL 規格文件**應同步，否則日後對不上。
**選項**：
- (a)（建議）系統設計出一份 DDL 增補（`10b_phase2_ddl_decision_packet_addendum.sql`）作為 packet 的正式附錄，與 DP task migration 對齊。
- (b) 只在 DP task migration 落地，DDL 文件不補（接受文件與實作分離）。

**阻擋**：不擋 build；擋規格文件一致性。
**需要回**：採 (a)/(b)；(a) 由系統設計或指派工程補。

---

## S6. Phase 2 KPI 目標值（綁營運/核可）

**問題**：PRD `03_..._prd.md §6` 只列 KPI 名稱（readiness rate / eligibility rate / provider completeness / takeover correlation completeness / freeze success / fallback success …），**沒目標數字**。
**為何要決策**：報表/監控 alert 門檻需要目標值。
**選項**：
- (a) 營運 + 系統設計定一組 Phase 2 pilot KPI 目標（policy-driven，可隨核可調整）。
- (b)（建議先這樣）Phase 2 先只**蒐集與顯示**，不設硬門檻；門檻待 pilot 數據與核可條件回再定。

**阻擋**：不擋 build；擋 KPI alert 門檻設定。
**需要回**：採 (a)/(b)。

---

## 優先序建議

| 優先 | 項目 | 阻擋 | 性質 |
|---|---|---|---|
| 高 | **S1** Passenger 揭露 policy + 文案 | V1 文字、AV 載客 gate | 法遵/系統設計 |
| 高 | **S2** A6 做不做 | 視覺 V2、A6 task | IA 裁定 |
| 中 | **S3** fallback 成本歸屬規則 | C4 實值正確 | 商務/系統設計 |
| 中 | **S4** audit ↔ Phase1 整合 | C5 設計 | 工程+系統設計（可快速自決） |
| 低 | **S5** DDL 文件補表 | 規格一致性 | 文件維護 |
| 低 | **S6** KPI 目標值 | alert 門檻 | 營運 |

回覆後工程會依裁定更新 contracts/policy/DDL 並追加對應 task，更新
[`..._execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md)。
