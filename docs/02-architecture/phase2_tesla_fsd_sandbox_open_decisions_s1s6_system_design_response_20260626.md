# Phase 2 Tesla FSD 監理沙盒 — S1–S6 系統設計裁決回覆

> 文件基準日：2026-06-26
> 狀態：**ACCEPTED / 可交工程與視覺各自執行**
> 來源：系統設計團隊正式回覆（原檔中文 mojibake；本檔為 repo 歸檔之忠實轉錄，所有 TS 介面/SQL/en-US 文案逐字保留，
> zh-TW 文案為 baseline v1 之忠實重述，**最終文字待法遵定稿**）。
> 對應問題：[`..._open_decisions_system_design_team_20260626.md`](./phase2_tesla_fsd_sandbox_open_decisions_system_design_team_20260626.md)
> DDL 附錄：[`phase2-tesla-fsd-sandbox/10b_phase2_ddl_decision_packet_addendum.sql`](./phase2-tesla-fsd-sandbox/10b_phase2_ddl_decision_packet_addendum.sql)

## 0. 總裁決（答案鍵）

```text
S1 = A   S2 = B   S3 = A   S4 = A   S5 = A   S6 = B
```

| 項目 | 裁決 | 影響 UI | 影響 build | 結論 |
|---|---|---:|---:|---|
| S1 PassengerDisclosurePolicy + fallback 文案 | **(a)** | 是 | 否 | 建立版本化 `PassengerDisclosurePolicy` + canonical message catalog；缺配置不得派 AV。 |
| S2 Regulator/Local Authority Viewer Portal | **(b)** | 是 | 否 | Phase 2 不做獨立 portal，用 Platform Admin Compliance 的 `CMP_Regulator` + controlled export。 |
| S3 fallbackCostAbsorber 規則 | **(a)** | 否 | 否 | per-partner/per-tenant effective-dated fallback-cost policy，預設 `platform`。 |
| S4 Phase2 audit 與 Phase1 整合 | **(a)** | 否 | 否 | 共用 Phase 1 append-only audit store，domain prefix + `Phase2AuditContext`。 |
| S5 Canonical DDL 補表 | **(a)** | 否 | 否 | 系統設計提供 `10b` addendum，工程 migration 對齊。 |
| S6 Phase2 KPI 目標值 | **(b)** | 否 | 否 | pilot 先蒐集顯示，不設硬門檻；safety 條件仍硬性 alert/fail-closed。 |

> 工程缺值維持 `missing/unverified/external_gated/fail_closed`。本裁決不得被解讀為允許工程自行填入 Tesla endpoint、監理時限、通報窗口、文案或影像設備能力。

---

## 1. S1 — PassengerDisclosurePolicy + fallback 文案權威（採 a）

新增版本化型別：`PassengerDisclosurePolicy`、`PassengerDisclosureMessageCatalog`、`PassengerAcknowledgementRecord`。
所有 passenger/tenant/partner-facing AV 與 fallback 文案只能由 canonical message catalog 產生，前端只用 `messageCode`，不得硬寫法規文案。
若對應 experiment/program/channel 未配置完整 disclosure policy 或 catalog → `AV passenger assignment = fail_closed`（可建 booking，但不得派 Tesla FSD 車）。

### 1.2 文案與本體 owner
| 項目 | Owner |
|---|---|
| messageCode 命名、狀態對應、contract schema | 系統設計團隊 |
| 法規揭露內容、同意要求、版本核可 | 法遵 / 監理沙盒專案 owner（綁 B2） |
| 中/英 copy 品質與語氣 | Product / UX writing（不得改變法遵語意） |
| catalog 儲存、版本、API、audit | Engineering（只實作，不自改文字） |

最終權威：`PassengerDisclosurePolicy.approvalReference` + `PassengerDisclosureMessageCatalog.version`。

### 1.3 Consent / acknowledgement 模式
```ts
export type PassengerDisclosureAcknowledgementMode =
  | 'none'
  | 'program_level_contract'
  | 'per_booking_checkbox'
  | 'verbal_recorded'
  | 'operator_confirmed_notice';
```

| Channel | 預設 acknowledgement mode |
|---|---|
| passenger-web | `per_booking_checkbox` |
| partner-booking-web | `per_booking_checkbox` 或 `program_level_contract`（缺值 fail-closed） |
| tenant-console-web | `program_level_contract` + `operator_confirmed_notice` |
| ops callcenter / assisted-entry | `verbal_recorded` |

### 1.4 `PassengerDisclosurePolicy` contract
```ts
export interface PassengerDisclosurePolicy {
  policyId: string;
  experimentId: string;
  policyVersion: number;
  approvalReference: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  supportedLocales: Array<'zh-TW' | 'en-US'>;
  channelRules: Array<{
    channel:
      | 'passenger_web'
      | 'partner_booking_web'
      | 'tenant_console_web'
      | 'ops_callcenter'
      | 'assisted_entry_web';
    acknowledgementMode: PassengerDisclosureAcknowledgementMode;
    preAssignDisclosureMessageCode: string;
    acknowledgementMessageCode: string | null;
    avAssignedNoticeMessageCode: string;
    fallbackInitiatedMessageCode: string;
    fallbackAssignedMessageCode: string;
    incidentHoldMessageCode: string;
    consentRequiredBeforeAvAssignment: boolean;
  }>;
  missingConfigBehavior: 'fail_closed';
  createdAt: string;
  updatedAt: string;
}
```

### 1.5 `PassengerDisclosureMessageCatalog` contract
```ts
export interface PassengerDisclosureMessageCatalogEntry {
  messageCode: string;
  locale: 'zh-TW' | 'en-US';
  channel:
    | 'passenger_web'
    | 'partner_booking_web'
    | 'tenant_console_web'
    | 'ops_callcenter'
    | 'assisted_entry_web'
    | 'shared';
  audience: 'passenger' | 'tenant_admin' | 'partner_operator' | 'ops_agent';
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  requiresAcknowledgement: boolean;
  legalApproved: boolean;
  approvalReference: string | null;
  version: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
}
```

### 1.6 Baseline message catalog v1（en-US 逐字；zh-TW baseline，待法遵定稿）

**`P2_AV_PRE_ASSIGN_DISCLOSURE_V1`**
- zh-TW：本次服務可能由經主管機關核可之 Tesla FSD 監理沙盒車輛提供。車內將配置合格安全員，安全員可於必要時接管駕駛。若當日路線、時段、車況、監控、天候或其他沙盒核可條件不符合要求，本公司將改派人駕車輛或對服務進行調整以完成。
- en-US：This service may be fulfilled by a Tesla FSD regulatory-sandbox vehicle approved for the pilot program. A qualified safety operator will be present in the vehicle and may take over driving when necessary. If the approved route, time window, vehicle condition, monitoring state, weather, or other sandbox conditions are not met, the service may be reassigned to a human-driven vehicle or otherwise adjusted.

**`P2_AV_ACKNOWLEDGEMENT_CHECKBOX_V1`**
- zh-TW：我已了解本次服務可能由 Tesla FSD 監理沙盒車輛提供，車內將配置安全員，若不符合沙盒條件或發生異常，服務可能改派人駕車輛。
- en-US：I understand that this service may be fulfilled by a Tesla FSD regulatory-sandbox vehicle with an onboard safety operator, and that the service may be reassigned to a human-driven vehicle if sandbox conditions are not met or an exception occurs.

**`P2_AV_CALLCENTER_VERBAL_SCRIPT_V1`**
- zh-TW：依監理沙盒試驗安排，本次服務可能由 Tesla FSD 輔助駕駛車輛提供，車上會有合格安全員可隨時接管。若當日不符合核可條件或發生異常，我們會改派人駕車輛或提供後續協助。請問您是否了解並同意由我們為您安排？
- en-US：Under the regulatory sandbox arrangement, this service may be fulfilled by a Tesla FSD-assisted vehicle with a qualified onboard safety operator who can take over at any time. If approved conditions are not met or an exception occurs, we will reassign the service to a human-driven vehicle or provide further assistance. Do you understand and agree for us to proceed with the arrangement?

**`P2_AV_ASSIGNED_NOTICE_V1`**
- zh-TW：本次服務已安排 Tesla FSD 監理沙盒車輛。車內配置安全員，行程將依核可路線、時段及安全監控條件執行。
- en-US：A Tesla FSD regulatory-sandbox vehicle has been assigned. A safety operator will be present, and the trip will operate under the approved route, time window, and safety monitoring conditions.

**`P2_AV_FALLBACK_INITIATED_V1`**
- zh-TW：因沙盒運營條件或車輛狀態調整，本次服務正在改派人駕車輛。您的原訂單仍保留，我們將更新預估到達時間。
- en-US：Due to sandbox operating conditions or vehicle status, this service is being reassigned to a human-driven vehicle. Your original booking remains active, and the estimated arrival time will be updated.

**`P2_AV_FALLBACK_ASSIGNED_V1`**
- zh-TW：已為本次服務改派人駕車輛。除您的合約或方案另有約定外，您不會因本次改派而負擔額外費用。
- en-US：A human-driven vehicle has been assigned for this service. Unless otherwise specified by your contract or program, you will not be charged an additional fee due to this reassignment.

**`P2_AV_INCIDENT_HOLD_NOTICE_V1`**
- zh-TW：本次服務因安全或營運事件暫停。我們已啟動後續協助與替代安排，客服或營運人員將提供更新資訊。
- en-US：This service has been paused due to a safety or operational event. Follow-up assistance and alternative arrangements have been initiated, and customer support or operations staff will provide updates.

### 1.7 UI / backend 行為
前端只讀 `messageCode` 與 resolved message，不 hard-code legal text；任何 `requiresAcknowledgement=true` 必建 `PassengerAcknowledgementRecord`；直接乘客與 partner booking 無 acknowledgement 不得派 AV；tenant contract 模式必存 contract/program version reference；callcenter verbal consent 必存 `callSessionId`/agentId/scriptMessageCode/recordingId。

---

## 2. S2 — Regulator / Local Authority Viewer Portal（採 b）

Phase 2 baseline **不建立獨立 Local Authority Viewer Portal**，改以
`apps/platform-admin-web > Compliance & Investigation > CMP_Regulator` + controlled export/evidence access 滿足調閱。
獨立 portal 列 `Phase 2.x / regulator direct-access extension`。

理由：C1 已將 Compliance/Investigation 併入 platform-admin（治理屬性）；baseline 核心是可保全/可調出/可稽核，非建外部機關登入；regulator 直連屬 cross-org RBAC decision packet，留待後續；獨立 portal 增身分/權限/稽核/遮罩/部署面，對 Gate B/C 無必要。

### 2.3 視覺 A6 → CMP_Regulator panel（小幅 delta，非獨立 portal）
方向：`Platform Admin / Compliance / Regulator Review Panel`，含：experiment selector、accident case selector、evidence manifest summary、investigation bundle status、regulatory notification status、controlled export button、legal hold indicator、masking mode indicator、access log table、export receipt panel。

### 2.4 Baseline API（不新增外部 regulator login realm）
```http
GET  /api/platform-admin/compliance/regulator-cases
GET  /api/platform-admin/compliance/regulator-cases/{caseId}
POST /api/platform-admin/compliance/regulator-cases/{caseId}/exports
GET  /api/platform-admin/compliance/regulator-cases/{caseId}/access-logs
```

---

## 3. S3 — C4 fallbackCostAbsorber 適用規則（採 a）

版本化 fallback-cost policy，支援 per-partner/per-tenant，baseline default 永遠 `fallbackCostAbsorber = platform`。
除非存在 signed partner/tenant contract policy，否則不得把 AV fallback 成本轉嫁 partner/tenant；乘客不得因 AV fallback 自動被加價。

### 3.2 Policy precedence
```text
1. Regulatory / safety override
2. Experiment-level commercial rule
3. Partner program fallback-cost policy
4. Tenant contract fallback-cost policy
5. Platform default
```
Regulatory/safety override：若 fallback 原因屬 `sandbox_ineligible / vehicle_unready / telemetry_missing / provider_unavailable / safety_operator_unavailable / incident / roc_hold / regulatory_hold` → 預設 `platform`（除非核可文件或合約明確相反且不違監理）。

### 3.3 Contract
```ts
export interface SandboxFallbackCostPolicyRecord {
  policyId: string;
  scope: 'experiment' | 'partner_program' | 'tenant_contract';
  experimentId: string;
  partnerProgramId?: string | null;
  tenantId?: string | null;
  contractReference?: string | null;
  defaultAbsorber: 'platform' | 'partner' | 'tenant_contract';
  reasonOverrides: Array<{
    reasonCode: string;
    absorber: 'platform' | 'partner' | 'tenant_contract';
    requiresLegalApproval: boolean;
  }>;
  passengerSurchargeAllowed: false;
  effectiveFrom: string;
  effectiveUntil: string | null;
  approvedBy: string;
  approvalReference: string;
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 Baseline decision table
| fallback reason | absorber |
|---|---|
| `sandbox_ineligible` | `platform` |
| `vehicle_unready` | `platform` |
| `provider_unavailable` | `platform` |
| `safety_operator_unavailable` | `platform` |
| `incident_or_safety_hold` | `platform` |
| `partner_requested_fallback` | `partner`（僅有合約時，否則 platform） |
| `tenant_requested_fallback` | `tenant_contract`（僅有合約時，否則 platform） |
| `passenger_request_change` | 既有取消/變更 policy（非 AV fallback） |

### 3.5 找不到 applicable policy 時
`fallbackCostAbsorber = platform`、`policyResolution = default_platform_no_contract`，並寫 audit `sandbox.billing.fallback_cost_policy.defaulted`。

---

## 4. S4 — Phase2 audit 與 Phase1 整合（採 a）

共用 Phase 1 append-only audit store，不另建第二套基礎設施。Phase 2 event 用 `moduleName/domain prefix + Phase2AuditContext JSONB`。

### 4.3 `Phase2AuditContext`
```ts
export interface Phase2AuditContext {
  phase: 'phase2';
  experimentId?: string | null;
  sandboxTripId?: string | null;
  vin?: string | null;
  teslaProviderEventId?: string | null;
  takeoverCorrelationId?: string | null;
  accidentCaseId?: string | null;
  evidenceId?: string | null;
  evidenceFreezeId?: string | null;
  regulatoryNotificationId?: string | null;
  commandId?: string | null;
  sourceSystem?: 'tesla' | 'roc' | 'safety_operator' | 'system' | 'platform_admin';
  evidenceLevel?: 'repo_local' | 'sandbox' | 'live_staging' | 'pilot' | 'production';
}
```
> 註：此與裁決 C5 的 `Phase2AuditContext`（packet §7.2，完整 audit 本體）為**互補**——C5 定全 audit 本體欄位，S4 定 phase2 專屬擴充與「共用 Phase1 store」storage 策略。工程 `P2-DP-C5-001` 與 `P2-DP-S4-001` 須合併實作為單一 emitter，不可產生兩套。

### 4.4 Audit naming（domain prefix）
```text
sandbox.experiment.*  tesla.integration.*  tesla.regulatory_event.*  sandbox.dispatch_gate.*
safety_operator.takeover.*  roc.operation.*  evidence.freeze.*  evidence.access.*
accident.case.*  regulatory.notification.*  billing.sandbox_treatment.*
```

### 4.5 Storage rule
Audit row 仍寫 Phase 1 audit table；`new/oldValuesSummary` 放摘要不放大 payload；原始 Tesla payload 放 Raw Provider Vault；evidence file access 同時寫 Phase 1 audit row + `av_evidence.evidence_access_logs`；查詢沿用現有 audit query + phase2 filters。

---

## 5. S5 — Canonical DDL 補 DP 新表（採 a）

系統設計產出 `phase2-tesla-fsd-sandbox/10b_phase2_ddl_decision_packet_addendum.sql`（已歸檔），工程 migration 比照對齊，**不得只在 migration 建表而不回寫規格**。
含 6 表：`evidence_legal_holds`、`evidence_legal_hold_release_requests`、`evidence_deletion_exceptions`、
`fulfillment_segments`、`sandbox_billing_treatments`、`sandbox_fulfillment_visibility`（全 `CREATE ... IF NOT EXISTS`，與 C3/C4/C6 task migration 冪等共存）。完整 DDL 見附錄檔。

---

## 6. S6 — Phase2 KPI 目標值（採 b）

Phase 2 pilot 初期只蒐集與顯示 KPI，不設硬性 alert 門檻；所有 KPI target 顯示為 `targetStatus = baseline_collecting`，待 B2 核可條件 / Tesla B1 feed 實際可用性 / 一段 pilot baseline / 監理與安全主管確認後再設 target。

- KPI baseline 收集期：預設 30 calendar days 或 50 sandbox trips（取先到者）；B2 另有要求以 B2 為準。
- 顯示但不告警：`readiness_rate / sandbox_eligibility_rate / provider_event_completeness / takeover_correlation_completeness / evidence_freeze_success_rate / fallback_success_rate / regulatory_notification_timeliness / telemetry_freshness_rate / controlled_export_success_rate / legal_hold_release_cycle_time`。
- **仍硬性 alert/fail-closed（非 KPI target，是安全閘門）**：Tesla regulatory feed missing、Fleet telemetry stale、Evidence recorder offline、Safety operator missing、Vehicle outside approved area、Experiment expired/suspended、Active legal hold blocks deletion、Incident notification overdue（依 B2/B3 policy）。

---

## 7. 新增工程任務（已派工）

| Task ID | 內容 | 依賴 |
|---|---|---|
| `P2-DP-S1-001` | PassengerDisclosurePolicy + message catalog + acknowledgement + UI message resolution | P2-DP-C3-001 |
| `P2-DP-S2-001` | platform-admin Compliance 之 CMP_Regulator panel scope 更新 + regulator-cases API | P2-UI-CMP-001, P2-DP-C1-001 |
| `P2-DP-S3-001` | Fallback cost policy resolver + SandboxFallbackCostPolicyRecord（接 billing treatment） | P2-DP-C4-001 |
| `P2-DP-S4-001` | Phase2 audit context 整合（與 C5 合併單一 emitter，共用 Phase1 store） | P2-DP-C5-001 |
| `P2-DP-S5-001` | 10b DDL addendum → migration 對齊（6 表，IF NOT EXISTS） | P2-WP0 |
| `P2-DP-S6-001` | KPI baseline collection mode（targetStatus=baseline_collecting dashboard） | P2-ROC-001, P2-REG-002 |

---

## 8. 對視覺團隊的影響（只有兩點，已抽進視覺 doc）

1. **V1 解鎖**：S1 的 message catalog 補上 fallback 文案權威，既有 app（passenger-web/tenant-console）fallback 版位的文字 slot 有來源 → 視覺可進場做版位（文字由 messageCode 來）。
2. **V2 收斂**：S2=(b)，**不做獨立 regulator portal**；視覺只需把 `CMP_Regulator` panel 擴成 §2.3 列的內容（小 delta），不出整套新 canvas。

詳見 [`..._open_decisions_visual_team_20260626.md`](./phase2_tesla_fsd_sandbox_open_decisions_visual_team_20260626.md)（已更新）。
