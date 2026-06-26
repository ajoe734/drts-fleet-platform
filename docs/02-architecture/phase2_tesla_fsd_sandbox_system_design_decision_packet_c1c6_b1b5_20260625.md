# Phase 2 Tesla FSD 監理沙盒 — 系統設計正式裁決與外部契約輸入規格（C1–C6 / B1–B5）

> 文件基準日：2026-06-25
> 文件狀態：**ACCEPTED / AUTHORITATIVE**
> 來源：系統設計團隊正式回饋（原檔編碼於傳輸中損毀；本檔為 repo 歸檔之忠實轉錄，
> 所有 TypeScript 介面、route／scope 清單、audit event catalog、gate 表均為**逐字保留**）。
> 適用範圍：`phase2-tesla-fsd-sandbox/`、execution plan、visual / system-design handoff、後端／契約／測試 wave。
> 不在範圍：Tesla 負責 FSD 感知/規劃/控制；不建路側設施、不推論 FSD engaged/disengaged/takeover、不建遠端駕駛。

本裁決優先於 Phase 2 SA/SD/PRD/Tesla Regulatory/Evidence 規格中與之衝突之處；衝突以本文件為準。

---

## 1. 裁決摘要

| 項目 | 正式裁決 |
|---|---|
| **C1** | Compliance & Investigation **併入 `apps/platform-admin-web`**，以獨立 route group、獨立 scope 與證據本院治理；ROC 只處理即時事件並 deep-link 至調查頁。Phase 2 **不新增第二個 Compliance Console**。 |
| **C2** | ROC Console **沿用 Ops Console shell + `@drts/ui-web` primitives**，新增 `roc` semantic theme alias（中性深色監控盤 + 藍青 accent）；**不建立第二套 component library**。 |
| **C3** | 外部使用者只看「服務連續性」與經核可的沙盒揭露。Passenger 顯示安全/改派者 ETA；Tenant 顯示 planned/actual fulfillment、fallback 類別與帳務處理；Partner 依 contract projection 接收狀態。**不外洩 FSD 內部事件、reason code、raw takeover。** |
| **C4** | 同一 booking、不斷 billing chain。**fallback 不得自動加收乘客費用**（`fallbackSurchargeApplied=false`）；人駕司機走 Phase 1 正常結算；AV/fallback 額外成本進內部 cost/partner subsidy ledger；混合履約仍只開一張顧客發票。 |
| **C5** | 採本文件定義之 Phase 2 append-only audit taxonomy；所有指令/報告/失敗/證據調閱/報表/交付或 hold 操作均進 audit；write command 必回 `ActionReceipt`（含 `auditId`）。 |
| **C6** | 優先序：**active legal hold > 主管機關/契約保存政策 > 一般 retention > 刪除請求**。Legal hold 只延長不縮短；release 採 four-eyes；provider 資料若將屆，必先取回本地 Evidence Vault。 |

B1–B5 為**外部契約輸入**，缺值期間相關 capability 維持 `missing/unverified/external_gated`、production fail-closed；工程不得自行臆測 routing、reason、價格或 hold 行為。

---

## 2. 全域設計硬規則

1. **Tesla 原廠技術資料不被本地報告覆寫。** Tesla provider event、安全員 report、ROC action 為三份並列 authority record。
2. **Phase 1 交易權威不變。** booking/order/dispatch/billing/incident/audit 仍由 Phase 1 core 管理。
3. **所有外部實值 policy-driven。** B1–B5 未交付前 production 不得有臆測值；相關 capability 為 `missing`/`unverified`。
4. **Fail closed。** 核可條件、Tesla required capability、recorder、local notification matrix 或 production credential 不完整，不得開始新的 AV 載客行程。
5. **事故責任不由系統裁定。** 系統只組合證據、時間線、差異與 custody record。
6. **No roadside dependency。** geometry 僅作監管範圍判斷，不依賴 RSU/SPaT/V2X/自建沿線 CCTV。
7. **No FSD inference。** 不從方向盤角度/煞車深度/一般 telemetry 推論 Tesla FSD engaged/disengaged/takeover truth。

---

## 3. C1 — Compliance & Investigation Landing Zone

歸屬：`apps/platform-admin-web`（不併 ROC，不建新 console）。理由：調查/manifest/controlled export/legal hold/監理報告/custody 屬治理與法遵控制面，platform-admin 已承載 audit/evidence governance/legal hold/deletion exception/regulatory reporting 等責任；新建獨立 console 只會增加 auth realm/部署/routing/design system/permission surface。ROC 人員可兼任調查，但權限仍由 scope 決定。

### 3.2 Route 樹

```text
/platform-admin/compliance
/platform-admin/compliance/trips/{tripId}
/platform-admin/investigations
/platform-admin/investigations/{caseId}
/platform-admin/investigations/{caseId}/timeline
/platform-admin/evidence/manifests/{manifestId}
/platform-admin/evidence/exports
/platform-admin/evidence/legal-holds
/platform-admin/regulatory-reports
```

外部 deep link 必須走 app-aware resource link，不得由 ROC 拼 raw URL。

### 3.3 ROC 與 Compliance 分工

ROC 可：查看 incident/takeover/provider gap、acknowledge alert、apply operational hold、stop new dispatch、request evidence freeze、開啟 accident case、查看 freeze 是否完成、查看不含敏感原檔之 evidence summary、deep-link 至 Platform Admin investigation。

ROC 不可：release legal hold、下載原始完整證據包、執行 police/authority/insurer handoff、修改 evidence retention policy、變更 investigation conclusion/case closeout、查看超出值勤需要的乘客個資。

### 3.4 權限 scopes

```text
sandbox.compliance.read
sandbox.compliance.manage
sandbox.investigation.read
sandbox.investigation.manage
sandbox.evidence.preview
sandbox.evidence.export.request
sandbox.evidence.export.approve
sandbox.legal_hold.place
sandbox.legal_hold.release.request
sandbox.legal_hold.release.approve
sandbox.regulatory_report.review
sandbox.regulatory_report.submit
```

- `export.request` 與 `export.approve` 必須可由不同 actor 執行。
- `legal_hold.release.request` 與 `legal_hold.release.approve` 必須分離。
- Local Authority Viewer 預設只有特定 experiment/case 的 read scope，不具 platform-wide 存取。

### 3.5 Cross-app navigation

```ts
interface CrossAppResourceLink {
  app: "platform_admin" | "roc_console" | "ops_console" | "driver_app";
  resourceType: string;
  resourceId: string;
  href: string;
  requiredScopes: string[];
}
```

ROC 的 accident card 只回傳 backend-provided `investigationLink`，前端不得自行拼接 case route。

### 3.6 UI 第二波解鎖

- Visual A5：Compliance & Investigation 以 Platform Admin shell 設計。
- Visual A6：Evidence / Legal Hold 用 Platform Admin governance layout。
- ROC 只需事件操作摘要、freeze status 與 investigation deep-link。

---

## 4. C2 — ROC Console Design System

採用：Ops Console shell + `@drts/ui-web` primitives + `roc` semantic theme aliases。不複製 Platform Admin shell，不建新 primitive package。

### 4.2 Design system 層級

```text
packages/ui-tokens
  └─ semantic/control-plane tokens
       └─ roc aliases

packages/ui-web
  └─ existing primitives
       ├─ AppShell
       ├─ Sidebar
       ├─ StatusBadge
       ├─ MetricCard
       ├─ DataTable
       ├─ Timeline
       ├─ AlertBanner
       ├─ Drawer
       ├─ CommandConfirmation
       └─ EmptyState

apps/roc-console-web
  └─ ROC compositions only
```

### 4.3 Theme 裁決

ROC 與 Ops 共用中性 control-plane canvas，但採獨立 blue/cyan accent，便於值勤人員快速辨識所在 app。

```text
roc.surface.canvas       -> control.surface.canvas
roc.surface.panel        -> control.surface.panel
roc.surface.elevated     -> control.surface.elevated
roc.accent.primary       -> semantic.info.strong
roc.state.healthy        -> semantic.success
roc.state.degraded       -> semantic.warning
roc.state.critical       -> semantic.critical
roc.state.offline        -> semantic.neutral
roc.state.manual_hold    -> semantic.warning.strong
roc.state.evidence_hold  -> semantic.purple / governance
```

硬規則：status 顏色只表達狀態、不作裝飾；critical red 只用於事故/重大 provider gap/失聯需立即處置；不單用綠/色票，必須搭配文字+icon+shape；即時列表預設高密度，但 evidence/investigation 不在 ROC 呈現完整原檔 UI；色盲對比的 status token 必須通過多重弱色測試。

### 4.4 新增 component 治理

允許 ROC-specific compositions：`RocVehicleStatusCard`、`RocAlertQueue`、`RocTakeoverCorrelationPanel`、`RocProviderHealthStrip`、`RocShiftHandoverPanel`。放在 `apps/roc-console-web/components`；只有當其被 Ops/Platform Admin 第二次採用時才提升到 `packages/ui-web`。

### 4.5 Shell 行為

左側主導覽；頂部值勤狀態/experiment selector/provider health/未處理 critical count；右側 detail drawer；主頁不疊 modal-on-modal；每個 control action 顯示 backend `availableActions`；所有 write action 回 `ActionReceipt` 並顯示追蹤編號。

---

## 5. C3 — Passenger / Tenant / Partner AV 與 Fallback 可見度

原則：監理沙盒角色責任在預約（叫車）階段依核可 policy 取得必要揭露同意；外部使用者不接觸 FSD 內部狀態/reason code/takeover raw event/事故證據/ROC 操作細節；fallback 對外以「安全與服務連續性」為核心；三方共用同一 canonical fulfillment state，但影響深度不同；不因 fallback 建立第二張 booking。

### 5.2 Canonical contract

```ts
export type SandboxFulfillmentMode =
  | "human_taxi"
  | "tesla_fsd_sandbox"
  | "mixed_av_human";

export type PublicFulfillmentState =
  | "service_confirmed"
  | "vehicle_preparing"
  | "vehicle_assigned"
  | "service_continuing"
  | "vehicle_change_in_progress"
  | "human_fallback_assigned"
  | "eta_updated"
  | "service_delayed"
  | "trip_in_progress"
  | "completed"
  | "cancelled";

export type SandboxDisclosureLevel =
  | "service_continuity_only"
  | "sandbox_service_disclosed"
  | "provider_brand_disclosed";

export interface SandboxFulfillmentVisibilityRecord {
  bookingId: string;
  plannedMode: SandboxFulfillmentMode;
  actualMode: SandboxFulfillmentMode | null;
  publicState: PublicFulfillmentState;
  disclosureLevel: SandboxDisclosureLevel;
  fallbackStage: "pre_assignment" | "pre_pickup" | "in_trip" | null;
  externalReasonCategory:
    | "vehicle_unavailable"
    | "safety_check"
    | "approved_area_or_schedule"
    | "service_connectivity"
    | "operational_recovery"
    | "other"
    | null;
  etaBefore: string | null;
  etaAfter: string | null;
  passengerMessageCode: string;
  tenantMessageCode: string;
  partnerStatusCode: string;
  billingTreatmentCode: string;
  updatedAt: string;
}
```

`provider_brand_disclosed` 只在 partner（且 Tesla 品牌與沙盒文件允許）時可使用；預設沙盒文件使用「自動駕駛試驗服務」字樣，非強制顯示 Tesla 品牌。

### 5.3 Passenger 顯示規則

- 預約（叫車）派 AV：以「本行程可能由核可之自動駕駛試驗車輛提供服務，車內配置合格安全員，並依監理核可條件運行」呈現；是否提示 Tesla、是否需 checkbox/電子同意，由 `PassengerDisclosurePolicy` 配置；未配置完整則不得派 AV。
- 行程前 fallback（`vehicle_change_in_progress` / `human_fallback_assigned`）：以「為確保行程安全與服務連續性，正在更換/已改派一般計程車，原預約仍有效，新車輛資訊與預估抵達時間已更新」呈現。
- 行程中由安全員接為駕駛（`service_continuing`）：以「為確保行程安全，本行程已由車內安全員接為駕駛，目的地與預約不變」呈現。
- 行程中換車輛：以「需要更換車輛，控制中心正在安排接駁，請依安全員與客服指示」呈現。

Passenger 不顯示：Tesla provider reason code、FSD transition event type、operational hold 原因細節、incident classification、evidence freeze/legal hold、安全員或 ROC 人員姓名資訊。

### 5.4 Tenant Console 影響

Tenant 可見：planned/actual fulfillment、fallback stage、user-safe fallback category、ETA change、service completion、billing treatment、SLA treatment、report/invoice attribution。
Tenant 不可見：raw event、technical reason dictionary、事故證據原檔、ROC command/internal notes。

### 5.5 Partner API / Webhook 影響

```text
sandbox_fulfillment.assigned
sandbox_fulfillment.fallback_started
sandbox_fulfillment.fallback_assigned
sandbox_fulfillment.mode_changed
sandbox_fulfillment.eta_updated
sandbox_fulfillment.completed
```

Partner payload 只含 contract-approved fields；事故/安全事件以既有 partner incident SLA 與 contract channel 另行通知，不混入一般 passenger status webhook。

### 5.6 文案與 reason mapping 邊界

Backend 回 `messageCode` 與 user-safe category，frontend 只做 i18n，不得自行由 internal reason 推文案。

---

## 6. C4 — AV / Fallback Billing 與分潤

裁決（顧客/帳務）：同一 booking 對應同一 customer billing chain；已接受 quote 為顧客端最高收費上限；因 AV readiness/沙盒限制/Tesla integration/recorder/operational hold 等平台原因改派人駕，**不得自動提高 passenger/tenant charge**；已提供之 AV 哩程是否保留依 partner/tenant price policy，未指定則保留已接受 quote、不另收追加；若商業上希望 fallback 後重新報價，必須有核可 policy 並由使用者明確重新接受，Phase 2 預設不適用。

人駕司機結算：fallback 司機按 Phase 1 對應產品與司機結算規則計算；不因原本為 AV 而降低司機應得款項。
AV 內部成本：Tesla 車輛/電力/安全員/ROC/recorder/provider 成本進 internal AV operating ledger，不直接變動 passenger fare component。

### 6.2 Fulfillment segment ledger

```ts
export interface FulfillmentSegmentRecord {
  segmentId: string;
  bookingId: string;
  orderId: string;
  mode: "tesla_fsd_sandbox" | "human_taxi";
  vehicleId: string;
  driverOrSafetyOperatorId: string | null;
  startedAt: string;
  endedAt: string | null;
  distanceKm: number | null;
  pricingAuthority: "accepted_quote" | "phase1_meter" | "partner_contract";
  internalCostCenterCode: string | null;
  settlementReferenceId: string | null;
}
```

### 6.3 Billing treatment

```ts
export interface SandboxBillingTreatmentRecord {
  bookingId: string;
  acceptedQuoteAmountMinor: number | null;
  passengerChargeAmountMinor: number;
  tenantChargeAmountMinor: number;
  partnerSubsidyAmountMinor: number;
  humanDriverSettlementAmountMinor: number;
  avOperatingCostAmountMinor: number | null;
  fallbackCostAbsorber: "platform" | "partner" | "tenant_contract";
  fallbackSurchargeApplied: false;
  policyVersion: string;
  segmentIds: string[];
}
```

Phase 2 baseline 將 `fallbackSurchargeApplied` 固定為 `false`；如未來商業模型改變，需新的 billing decision packet。

### 6.4 Invoice/report dimensions

`planned_fulfillment_mode`、`actual_fulfillment_mode`、`fallback_stage`、`fallback_reason_category`、`av_segment_count`、`human_segment_count`、`human_driver_settlement`、`partner_subsidy`、`sandbox_experiment_id`。顧客 invoice 不顯示內部 Tesla/ROC 成本。

### 6.5 中途 fallback

原 booking 不取消；AV segment 結束、人駕 segment 建立；customer invoice 仍為一張；SLA 可保留原始與 recovery ETA、報表額外顯示 fallback impact；事故造成之額外賠償/退款走 Phase 1 dispute/reimbursement，不直接混入 fare engine。

---

## 7. C5 — Phase 2 Audit Event Taxonomy

命名：`<domain>.<resource>.<past_tense_action>`（例：`tesla.regulatory_event.received`、`sandbox.dispatch.evaluated`、`evidence.legal_hold.placed`）。

### 7.2 共通本體

```ts
interface Phase2AuditContext {
  auditId: string;
  actionName: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  tenantId: string | null;
  experimentId: string | null;
  bookingId: string | null;
  orderId: string | null;
  tripId: string | null;
  vehicleId: string | null;
  vin: string | null;
  caseId: string | null;
  resourceType: string;
  resourceId: string | null;
  correlationId: string;
  causationId: string | null;
  requestId: string | null;
  traceId: string | null;
  reasonCode: string | null;
  oldValuesSummary: Record<string, unknown> | null;
  newValuesSummary: Record<string, unknown> | null;
  evidenceReferences: string[];
  outcome: "succeeded" | "denied" | "failed" | "accepted" | "duplicate";
}
```

原始 provider payload、token、signed URL、乘客敏感資料不得直接寫進 audit summary。

### 7.3 Canonical event catalog（逐字保留）

```text
# Tesla integration
tesla.authorization.created
tesla.authorization.refreshed
tesla.authorization.revoked
tesla.vehicle.bound
tesla.vehicle.unbound
tesla.virtual_key.status_changed
tesla.telemetry.configured
tesla.telemetry.configuration_failed
tesla.capability.assessed
tesla.capability.changed
tesla.provider_health.changed
tesla.command.requested
tesla.command.accepted
tesla.command.succeeded
tesla.command.failed

# Tesla regulatory events
tesla.regulatory_event.received
tesla.regulatory_event.signature_rejected
tesla.regulatory_event.duplicate_ignored
tesla.regulatory_event.quarantined
tesla.regulatory_event.normalized
tesla.regulatory_event.sequence_gap_detected
tesla.regulatory_event.backfill_requested
tesla.regulatory_event.backfill_completed
tesla.regulatory_event.backfill_failed
tesla.regulatory_event.schema_unknown
tesla.session_summary.received
tesla.incident_evidence_reference.received

# Sandbox governance
sandbox.experiment.created
sandbox.experiment.updated
sandbox.experiment.version_published
sandbox.experiment.suspended
sandbox.experiment.resume_requested
sandbox.experiment.resume_authorized
sandbox.experiment.ended
sandbox.jurisdiction.updated
sandbox.route.version_published
sandbox.schedule.version_published
sandbox.vehicle.enrolled
sandbox.vehicle.suspended
sandbox.safety_operator.enrolled
sandbox.safety_operator.suspended
sandbox.policy.updated
sandbox.approval_document.added

# Dispatch and fallback
sandbox.dispatch.evaluated
sandbox.dispatch.rejected
sandbox.dispatch.manual_release_requested
sandbox.dispatch.manual_release_approved
sandbox.dispatch.manual_release_denied
sandbox.assignment.created
sandbox.assignment.cancelled
sandbox.fallback.initiated
sandbox.fallback.human_assignment_created
sandbox.fallback.eta_updated
sandbox.fallback.completed
sandbox.fallback.failed

# Safety operator
safety_operator.shift.started
safety_operator.shift.ended
safety_operator.vehicle.assigned
safety_operator.pretrip.completed
safety_operator.pretrip.failed
safety_operator.takeover.reported
safety_operator.takeover.report_amended
safety_operator.incident.reported
safety_operator.evidence.uploaded
safety_operator.handover.completed

# ROC operations
roc.alert.raised
roc.alert.acknowledged
roc.alert.escalated
roc.vehicle_hold.applied
roc.vehicle_hold.release_requested
roc.vehicle_hold.released
roc.takeover.requested
roc.takeover.response_recorded
roc.incident.opened
roc.evidence_freeze.requested
roc.fallback.requested
roc.shift_handover.completed

# Evidence and investigation
evidence.freeze.started
evidence.freeze.completed
evidence.freeze.failed
evidence.item.ingested
evidence.item.hash_verified
evidence.item.hash_mismatch_detected
evidence.manifest.created
evidence.manifest.version_created
evidence.access.viewed
evidence.access.previewed
evidence.download.requested
evidence.download.approved
evidence.download.url_issued
evidence.export.created
evidence.export.downloaded
evidence.handoff.recorded
evidence.redaction.created
evidence.legal_hold.placed
evidence.legal_hold.release_requested
evidence.legal_hold.released
evidence.deletion.skipped_due_to_hold
investigation.case.created
investigation.case.status_changed
investigation.timeline.generated
investigation.discrepancy.opened
investigation.discrepancy.resolved
investigation.bundle.generated

# Regulatory reporting
regulatory.notification.drafted
regulatory.notification.approved
regulatory.notification.submitted
regulatory.notification.acknowledged
regulatory.notification.overdue
regulatory.report.generated
regulatory.report.reviewed
regulatory.report.submitted
regulatory.report.accepted
regulatory.report.rejected
regulatory.resume_authorization.recorded

# Security and denial
security.provider_signature.denied
security.cross_experiment_access.denied
security.evidence_access.denied
security.command_scope.denied
security.replay_event.denied
security.schema_validation.failed
```

### 7.4 Action receipt

```ts
interface ActionReceipt {
  actionId: string;
  actionName: string;
  resourceType: string;
  resourceId: string | null;
  status: "accepted" | "completed" | "failed";
  auditId: string;
  correlationId: string;
  requestedAt: string;
  completedAt: string | null;
}
```

### 7.5 Append-only 修正

既有報告需修正時不 update 原 event，建立 amendment event，含 `supersedesAuditId` 或 `amendsResourceVersion`。

---

## 8. C6 — Retention 與 Legal Hold 衝突處理

### 8.1 優先序

```text
1. Active legal hold / authority preservation order
2. Regulator-approved retention policy
3. Contractual retention policy
4. Normal operational retention
5. Data-subject / tenant deletion request
```

Legal hold 只延長保存，不得縮短監理或契約保存。

### 8.2 Freeze 與 Legal Hold 不同
- Evidence Freeze：事件發生時立刻保全指定時間窗資料。
- Legal Hold：依法/調查人員正式禁止資料刪除。事故可自動 freeze，再由調查人員 place hold。

### 8.3 Legal hold state machine

```text
draft -> active -> release_requested -> released
```

取消 draft 不產生 active hold；active hold 不提供直接 delete。

### 8.4 Place hold 必要本體：caseId/authority request reference、reasonCode、scope（case/trip/vehicle/time range/manifest/evidence IDs）、placedBy、effectiveAt、expectedReviewAt（可 null）、regulator/police/insurer reference（可 null）。允許 actor：`compliance_officer`、`investigator`、具明確 scope 的 `regulatory_authority_user`。

### 8.5 Release hold：actor A 提 release request；actor B 審核且不得等於 A；若 hold 由 authority 觸發需附 authority release reference；release 後不立即刪除，重新計算 retention deadline；若 deadline 已過進入 `deletion_pending` queue，依 production policy 的 post-release grace period 執行（該值由 B2 提供，不在 code 硬編）。

### 8.6 Deletion scheduler 必須在同一 consistency boundary 檢查：active legal hold、active deletion exception、regulatory retention deadline、contract retention deadline、manifest dependencies、investigation status、pending export/handoff。任一不過即 skip 並發 `evidence.deletion.skipped_due_to_hold`。

### 8.7 Provider 資料屆期衝突：若 Tesla/recorder 之保存短於本地 required retention，於 provider retention deadline 前觸發本地取回→驗 checksum/signature→存入本地 Evidence Vault→建 custody event 與 provider certification reference；無法取回則建 evidence gap 與 escalation，不得標示完整。

### 8.8 刪除請求衝突：deletion request 遇 hold/監理保存衝突時不執行刪除，建 `EvidenceDeletionExceptionRecord`，限必要 processing，保存最終/延後理由與 authority basis reference，hold release 後重新評估。

### 8.9 Hold scope propagation：對 manifest/case 的 hold 遞迴套用至 original items、derived/redacted copies、exported bundle、local provider payload copies、linked external documents under platform custody；外部機關已取得之副本只記 handoff，不由本平台控制刪除。

---

## 9. B1–B5 外部契約輸入規格（external-gated，缺值 fail-closed）

### 9.1 B1 — Tesla Regulatory Data Interface
須交付：ICD、OpenAPI/AsyncAPI schema、正式 endpoint/environment list、Auth（mTLS/JWS/key rotation/issuer identity）、reason-code dictionary 與版本政策、capability matrix by VIN/firmware/hardware、push/retry/idempotency/sequence/backfill contract、incident evidence types 與影像可用性、SLA/support/escalation、schema change/deprecation process、data residency/cross-border/retention/authority disclosure、sandbox credentials/test vectors/signed samples。
Gate：B1 未完成前 `fsdSessionFeedAvailable / autonomyTransitionFeedAvailable / takeoverReasonAvailable / incidentEvidenceAvailable = false`；任一 required capability 為 false 之車輛不得載客。工程只可配置 provider alias、mock environment、capability `unknown`，不得建立臆測 production URL 或 reason code。

### 9.2 B2 — 沙盒核可條件實值（Policy Pack）

```ts
interface SandboxApprovalPolicyValueSet {
  approvalReference: string;
  effectiveFrom: string;
  effectiveUntil: string;
  allowedAreaVersionIds: string[];
  allowedRouteVersionIds: string[];
  allowedScheduleVersionIds: string[];
  approvedVehicleIds: string[];
  approvedSafetyOperatorIds: string[];
  passengerDisclosurePolicyVersion: string;
  notificationPolicyVersion: string;
  evidenceRetentionPolicyVersion: string;
  maxTripsPerPeriod: number | null;
  maxDistanceKmPerPeriod: number | null;
  requiredInsuranceReferences: string[];
  requiredTeslaCapabilities: string[];
  requiredRecorderCapabilities: string[];
  incidentReportingDeadlines: Record<string, string>;
  reportSubmissionDeadlines: Record<string, string>;
  suspendConditions: string[];
  resumeApprovalRequired: boolean;
}
```

Production 不提供 default；未配置或 expired 即 fail closed。DRTS 文件內 1 小時/10 日/30 日/3 年只能作需求能力參考，不得直接成為 production 值。

### 9.3 B3 — 在地通報矩陣

```ts
interface JurisdictionNotificationMatrixValueSet {
  jurisdictionProfileId: string;
  eventSeverity: string;
  recipientType: "police" | "fire" | "ems" | "hospital" | "road_authority" | "regulator" | "insurer" | "towing" | "cybersecurity" | "internal";
  recipientName: string;
  contactChannels: Array<{ type: "phone" | "email" | "api" | "fax" | "other"; value: string }>;
  deadline: string;
  requiredFields: string[];
  requiredAttachments: string[];
  approvalRole: string | null;
  escalationAfter: string | null;
  fallbackContactId: string | null;
}
```

Non-production 可用明確標示之 test contacts；production 不得用空白或 generic placeholder。ROC 必須有 offline call-tree export。

### 9.4 B4 — Evidence Recorder Vendor Contract

```ts
interface EvidenceRecorderProvider {
  getDeviceHealth(deviceId: string): Promise<RecorderHealthRecord>;
  listSegments(input: { deviceId: string; from: string; to: string }): Promise<RecorderSegmentRef[]>;
  freezeWindow(input: { deviceId: string; from: string; to: string; reason: string }): Promise<FreezeReceipt>;
  exportSegment(segmentId: string): Promise<RecorderExportReference>;
  verifyChecksum(input: RecorderExportReference): Promise<boolean>;
  getClockStatus(deviceId: string): Promise<RecorderClockStatus>;
}
```

Vendor 須提供 device API/auth、clock sync semantics、camera/storage/encryption/upload health、segment index、event bookmark/freeze、upload retry、checksum/signature、local buffer size/overwrite policy、retention/deletion、firmware/schema lifecycle、offline recovery、sandbox 硬體與試驗車安裝。Gate：required recorder capability 不完整即 `evidence_recorder_unhealthy`，禁止新 AV dispatch。

### 9.5 B5 — Tesla Fleet 真帳號/車輛或官方 Sandbox
須具備：authorized Tesla account、test VIN、supported region、required OAuth scopes、virtual key pairing、Fleet Telemetry capability、test telemetry receiver connectivity、firmware/hardware inventory、allowlisted non-driving command test、rate-limit/cost visibility、provider support contact。
驗證流程：account authorization → VIN discovery → platform vehicle binding → virtual key state → telemetry configure → live position/SOC/status → reconnect/backfill → approved command receipt → revoke/refresh drill。完成前 Gate C/D 只能用 mock/fixture，不得宣稱 Tesla integration evidence。

---

## 10. 工程實作任務（已派工）

| Task ID | 內容 |
|---|---|
| `P2-DP-C1-001` | Platform Admin 新增 Compliance/Investigation routes、scopes、deep links |
| `P2-DP-C2-001` | ROC 採 Ops shell、建立 ROC semantic token aliases 與 shell |
| `P2-DP-C3-001` | 新增 fulfillment visibility contract、message codes、projection APIs |
| `P2-DP-C4-001` | 新增 fulfillment segment ledger 與 sandbox billing treatment |
| `P2-DP-C5-001` | 建立 canonical audit event catalog 常數、emit helpers、ActionReceipt |
| `P2-DP-C6-001` | 實作 legal-hold precedence、four-eyes release、deletion scheduler guard |

### 10.2 Contracts（新增明確型別）

```text
SandboxFulfillmentVisibilityRecord
FulfillmentSegmentRecord
SandboxBillingTreatmentRecord
Phase2AuditContext
EvidenceLegalHoldRecord
EvidenceLegalHoldReleaseRequest
EvidenceDeletionExceptionRecord
SandboxApprovalPolicyValueSet
JurisdictionNotificationMatrixValueSet
EvidenceRecorderProvider contracts
```

### 10.3 Backend APIs

```text
GET  /api/tenant/bookings/{id}/sandbox-fulfillment
GET  /api/partner/bookings/{id}/sandbox-fulfillment
GET  /api/platform-admin/compliance/summary
GET  /api/platform-admin/investigations
GET  /api/platform-admin/investigations/{caseId}
POST /api/platform-admin/evidence/exports
POST /api/platform-admin/evidence/legal-holds
POST /api/platform-admin/evidence/legal-holds/{id}/release-requests
POST /api/platform-admin/evidence/legal-holds/{id}/release-approve
GET  /api/platform-admin/sandbox-billing/{bookingId}
```

實際路徑遵循現有 controller prefix；不得改 ROC 或 evidence authority。

### 10.4 Tests（至少新增）
ROC scope 無法 release legal hold；Compliance user 可 request export 但不可自我 approve；legal hold release four-eyes；active hold 阻止 deletion；provider retention deadline 觸發本地 preserve；AV fallback 不增加 customer charge；human fallback driver 取得正常 Phase 1 settlement；mixed fulfillment 仍只一張 customer invoice；passenger projection 不洩漏 internal reason；partner webhook 只輸出 contract-approved fields；audit denied access/failed command/duplicate provider event。

---

## 11. Gate 與 Non-claim

| Gate | 可宣稱條件 | 對上不可宣稱 |
|---|---|---|
| Gate B | 架構、contracts、mock、policy schema 完成 | Tesla 真資料、核可實值、事故影像可用 |
| Gate C | B1 + B5（Tesla public/regulatory sandbox 串接證據） | 主管機關已核可載客 |
| Gate D | B4（真 recorder 事故 freeze/export 證據） | 所有事故證據含 Tesla 原廠影像 |
| Gate E | B2 + B3（核可 policy 與在地通報矩陣實值完成） | production unlimited operation |

Phase 2 只有在 C/D/E 對應外部輸入到位、且正常/接管/事故/fallback UAT 通過後，才能宣稱 `sandbox pilot ready`。

---

## 12. 文件回寫

本裁決登錄於：execution plan、visual design handoff、system design handoff（已更新交叉指向）；archived spec pack（`01/02/03/04/06/14/15`）為 hash-verified immutable，相關裁決以本文件為準並於 ledger 註記，不直接改檔。
