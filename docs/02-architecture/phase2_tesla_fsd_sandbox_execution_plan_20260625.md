# Phase 2 Tesla FSD 監理沙盒 — 執行計畫與平行派工 Wave

> 文件基準日：2026-06-25
> 來源規格包：[`phase2-tesla-fsd-sandbox/`](./phase2-tesla-fsd-sandbox/)（SA/SD/PRD/契約/DDL/流程/NFR/測試/WBS/決策台帳，已 hash 驗證歸檔）
> 派工 Phase tag：`phase2-tesla-fsd-sandbox-202606`
> 派工腳本：[`scripts/dispatch-phase2-tesla-sandbox-wave.py`](../../scripts/dispatch-phase2-tesla-sandbox-wave.py)

本文件把規格包收斂成**可直接派給 supervisor / auto-worker 的平行執行 task wave**，並明確區分：

1. **現在就能在 repo 內做完的工作（Gate B repo-ready）** — 已派工。
2. **被外部契約卡住的工作（Gate C–F）** — 寫成 capability-gated，不憑空捏造，不派 build。
3. **需要補完的缺口** — 已拆成兩份交付文件：
   - 視覺設計團隊（缺 canvas / 待補頁面）→ [`phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md`](./phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md)
   - 系統設計團隊（待裁定 / 缺規格實值 / 外部契約）→ [`phase2_tesla_fsd_sandbox_system_design_handoff_20260625.md`](./phase2_tesla_fsd_sandbox_system_design_handoff_20260625.md)

---

## 0. 派工原則（與既有 orchestrator 慣例一致）

- 每個 task 的 Definition of Done 沿用 WBS §4：contract + error codes、migration、unit/integration test、
  audit event、API client、（適用時）UI consumer、runbook、evidence artifact、gate level + remaining non-claim。
- **Mock adapter 不能把 gate 升級成 Tesla sandbox evidence**（測試計畫 §4）。本 wave 全部任務的可達上限是
  **Gate B（repo-local green）**；Gate C 起需要真實 Tesla / 核准 / recorder 廠商輸入。
- 不得從一般 telemetry 推算原廠接管事件；blocked 欄位保持 capability-gated（SA §2.2、WBS §5）。
- UI 一律**不由 LLM 重設計**。新 console / 新頁面先交視覺團隊出 canvas，工程才接 build（見 gaps 文件）。
- Owner/Reviewer 依 workload ratio `Claude:Claude2:Gemini:Gemini2:Codex:Codex2:Copilot = 10:10:5:5:35:35:5`；
  supervisor availability-first 可能 reshuffle，這裡是 best-effort hint。

---

## 1. 依賴分層（最大化平行）

```text
Layer 0  P2-WP0  ── 契約 + DDL migration + 10 模組 scaffold + shared envelope + error codes + adapter interface
                     （唯一序列化瓶頸；land 後其餘全部 fan-out）
                         │
   ┌─────────────────────┼─────────────────────────────────────────────┬───────────────┐
Layer 1 (WP0 後可全平行)                                                  │               │
   TESLA-001  TESLA-002   GOV-001  GOV-002   SAFE-001   EVD-001   REG-001  NFR-001
   (public)   (reg adapter)                                       (notify) (infra cfg)
                   │                  │           │        │         │
Layer 2            ▼                  ▼           ▼        ▼         ▼
   TESLA-003 ─ TESLA-004        GATE-001     CORR-001  EVD-002    REG-002
   (ingress)   (gap/backfill)   (eligibility) (3-source) (freeze)  (reports)
                   │                  │           │        │
Layer 3            ▼                  ▼           ▼        ▼
                 ROC-001         FBK-001      ACC-001 ─ ACC-002
                 (read models)   (human fb)   (case)    (bundle)
                         │
Layer 4                  ▼
                      P2-E2E-001  ── repo-local E2E-P2-001..010（mock adapters）
```

關鍵跨層邊：`GATE-001` 需 `GOV-002`+`TESLA-002`；`CORR-001` 需 `TESLA-003`+`SAFE-001`；
`ROC-001` 需 `TESLA-004`+`CORR-001`；`EVD-002` 需 `EVD-001`+`TESLA-003`；`ACC-001` 需 `EVD-002`+`CORR-001`；
`FBK-001` 需 `GATE-001`（Phase 1 dispatch hook）。

---

## 2. 派工任務表（已 dispatch，20 tasks）

| # | ID | Owner→Rev | 交付重點 | Deps | Gate 上限 |
|---|----|-----------|----------|------|-----------|
| 0 | **P2-WP0** | Claude→Codex | `packages/contracts` 全 Phase2 DTO/event/error；`av_sandbox`+`av_evidence` migration（DDL §all）；10 個 `apps/api/src/modules/tesla-*/sandbox-*/safety-operator/roc-operations/vehicle-evidence/accident-investigation/regulatory-reporting` scaffold + register；`TeslaRegulatoryEventProvider` 等 adapter interface；shared `Phase2SourceMetadata`/`CommandReceipt`/error-code enum | — | B |
| 1 | **P2-TESLA-001** | Codex→Claude2 | Public Fleet integration：OAuth/business token store-refresh-revoke、region、VIN discover+bind、virtual-key state、Fleet Telemetry configure/status、allowlisted non-driving command broker + `CommandReceipt`、cost/rate-limit metrics；`TeslaPublicTelemetryAdapter` + mock | WP0 | B |
| 2 | **P2-TESLA-002** | Codex2→Codex | Regulatory provider adapter：`TeslaRegulatorySandboxAdapter`（契約占位，不假設 endpoint）+ `TeslaRegulatoryMockAdapter`；`getCapabilities`/capability profile 儲存；FSD session / transition / summary / incident-ref DTO；reason-code dictionary 儲存（保留原碼不重分類） | WP0 | B |
| 3 | **P2-TESLA-003** | Codex→Codex2 | Event ingress：`POST /internal/providers/tesla/regulatory-events`；mTLS/JWS verify wrapper、replay window、payload-hash、raw immutable vault、receipt、normalizer registry by schemaVersion、canonical event store、alert hook | TESLA-002 | B |
| 4 | **P2-TESLA-004** | Codex2→Codex | Gap/backfill：per-VIN/session sequence tracker、missing/stale 偵測、backfill query、unknown-schema quarantine、provider health、telemetry quality score（影響 eligibility 不影響 Tesla 駕駛） | TESLA-003 | B |
| 5 | **P2-GOV-001** | Codex→Gemini | Experiment/jurisdiction/approval-document CRUD + 版本化 + artifact hash + supersedes + notification matrix + `SandboxComplianceSnapshot` 組裝 API | WP0 | B |
| 6 | **P2-GOV-002** | Codex2→Claude | PostGIS operating-area/route/schedule（effective-dated, versioned）+ vehicle/operator enrollment + geofence/route-containment query helper（僅監管用，非高精地圖） | WP0 | B |
| 7 | **P2-GATE-001** | Claude→Codex2 | Sandbox Dispatch Gate：全 eligibility 檢核、`SandboxDispatchDecision` 全 enum、compliance snapshot 隨 assignment 保存、fail-closed、manual release action、Phase 1 dispatch hook、fallback reason mapping、`SANDBOX_*` error codes | GOV-002, TESLA-002 | B |
| 8 | **P2-SAFE-001** | Codex→Claude2 | Safety Operator 後端：device-bound identity/scope、shift start/end、qualification、vehicle assignment、pre-trip checklist、takeover report、offline queue idempotency（`clientGeneratedReportId`）、incident upload、trip closeout | WP0, GOV-002 | B |
| 9 | **P2-CORR-001** | Codex2→Codex | Takeover 三來源 correlation engine：`takeoverCorrelationId`、`CorrelatedTakeoverCase`（保留原始時間/來源不合併）、ambiguity→`EvidenceDiscrepancyCase`、correlation priority 1/2/3 | TESLA-003, SAFE-001 | B |
| 10 | **P2-ROC-001** | Codex→Codex2 | ROC backend read models：overview/vehicles/trips/takeovers/alerts/provider-health；actions = ack/assign/stop-new-dispatch/operational-hold/request-safety-action/open-incident/start-freeze/fallback/notify/resolve；`availableActions`（UI 不自推權限）；**無 remote driving** | TESLA-004, CORR-001 | B |
| 11 | **P2-EVD-001** | Gemini→Codex | 車載證據 recorder vendor adapter interface + registry + health（clock sync/storage/camera/last-segment/encryption/upload-queue/firmware）+ segment index + event bookmark + upload retry + mock recorder；unhealthy→no-new-dispatch 訊號 | WP0 | B |
| 12 | **P2-EVD-002** | Codex2→Claude2 | Evidence freeze orchestration（trigger §4.1、window policy-driven）+ `EvidenceManifest`（sha256 hash tree、signature）+ object lock/legal hold + chain-of-custody access log + controlled export（≤15min signed URL、step-up、reason、watermark）；sealed 後 manifest 不可改 | EVD-001, TESLA-003 | B |
| 13 | **P2-ACC-001** | Codex→Codex2 | Accident case 狀態機（detected…closed）+ synchronized timeline assembler（每 fact 標 data-confidence；system-derived 不覆蓋 provider-signed）+ discrepancy 連結 + external police/insurer doc import | EVD-002, CORR-001 | B |
| 14 | **P2-ACC-002** | Codex2→Codex | Investigation bundle：契約 §8 全 section、synchronized export、manifest + custody、controlled download、known-gaps/unavailable-provider-data 明示；**不輸出責任結論** | ACC-001 | B |
| 15 | **P2-REG-001** | Claude2→Codex | Regulatory notification policy engine：event-level matrix、deadline timer、reminder、draft/review/submit/ack、`REGULATORY_NOTIFICATION_OVERDUE`、who-can-approve | GOV-001 | B |
| 16 | **P2-REG-002** | Codex→Codex2 | Report jobs：daily/trip/takeover/session/telemetry-completeness/incident + template + export artifact + `compliance-summary` + resume-authorization dossier；report 可由原始 evidence 追溯 | REG-001, TESLA-004 | B |
| 17 | **P2-FBK-001** | Claude2→Codex2 | Human taxi fallback：沿用同一 booking/order、建立 fallback assignment、修正 ETA、sandbox-exception report、不斷開 SLA/billing/audit chain | GATE-001 | B |
| 18 | **P2-NFR-001** | Gemini2→Codex | Infra/security config（repo-local，不 apply 真 GCP）：storage bucket layout（raw/telemetry/video-normal/video-incident-locked/bundles/reports）、Pub/Sub topics、Secret Manager/KMS wiring 文件、retention policy config、DR runbook、monitoring/alert 定義、telemetry data-quality 欄位表 | WP0 | B |
| 19 | **P2-E2E-001** | Copilot→Codex2 | Repo-local E2E（mock adapter）E2E-P2-001..010：onboarding/eligibility/normal-trip/takeover/gap-backfill/freeze/bundle/fallback/suspend-resume/report-package；掛進 root vitest/playwright include glob | (Layer1-3) | B |

> 每個 task 的完整 acceptance 與 artifacts 已寫進 `.orchestrator/task-briefs/P2-*.md`（由 dispatch 腳本產生）。

---

## 2b. 系統設計裁決後追加 wave（已 dispatch，6 tasks）

來源：[`..._system_design_decision_packet_c1c6_b1b5_20260625.md`](./phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md)（C1–C6 ACCEPTED）。
派工腳本：[`scripts/dispatch-phase2-tesla-sandbox-decision-wave.py`](../../scripts/dispatch-phase2-tesla-sandbox-decision-wave.py)。
**只派後端/契約/test；UI 螢幕仍待視覺團隊 canvas（C2 的 token+shell scaffold 不含螢幕設計）。**

| ID | Owner→Rev | 交付重點 | Deps | Gate |
|----|-----------|----------|------|------|
| **P2-DP-C5-001** | Codex2→Codex | Canonical audit event catalog 常數（§7.3 全表）+ `Phase2AuditContext` + emit helpers + `ActionReceipt`；append-only amendment（`supersedesAuditId`）；敏感資料不入 summary | P2-WP0 | B |
| **P2-DP-C1-001** | Codex→Codex2 | platform-admin Compliance/Investigation route group + 12 scopes（§3.4，export/hold request≠approve four-eyes）+ `CrossAppResourceLink` deep-link + compliance/investigations/evidence/legal-hold/exports API（§10.3） | P2-WP0,P2-ACC-002,P2-EVD-002 | B |
| **P2-DP-C2-001** | Claude→Codex | `packages/ui-tokens` 新增 `roc` semantic aliases（§4.3）+ `apps/roc-console-web` 採 Ops shell 之 scaffold（**僅 token+shell，不含螢幕**，螢幕待 canvas）；availableActions + ActionReceipt 接線 | P2-WP0,P2-ROC-001 | B |
| **P2-DP-C3-001** | Codex2→Codex | `SandboxFulfillmentVisibilityRecord` + message/state/disclosure enums（§5.2）+ tenant/partner projection API（§10.3）+ partner webhook events（§5.5）；backend 回 messageCode，不外洩 internal reason | P2-WP0,P2-FBK-001,P2-GATE-001 | B |
| **P2-DP-C4-001** | Codex→Claude2 | `FulfillmentSegmentRecord` + `SandboxBillingTreatmentRecord`（§6，`fallbackSurchargeApplied=false` 固定）+ invoice/report dimensions；同一 booking 一張發票；fallback 不加收 | P2-WP0,P2-FBK-001 | B |
| **P2-DP-C6-001** | Claude2→Codex2 | legal-hold precedence（§8.1）+ state machine（draft→active→release_requested→released）+ four-eyes release + deletion scheduler guard（§8.6 同 consistency boundary 檢查，skip 發 `evidence.deletion.skipped_due_to_hold`）+ provider 屆期本地 preserve（§8.7） | P2-WP0,P2-EVD-002 | B |

新增測試（§10.4）：ROC scope 不能 release hold、export request≠approve、four-eyes、active hold 擋刪除、provider 屆期 preserve、AV fallback 不加收、human fallback 走 Phase1 結算、mixed 仍一張發票、passenger projection 不洩 internal reason、partner webhook 只出 contract-approved、audit denied/failed/duplicate。

**仍外部-gated（B1–B5，不派 build）**：Tesla regulatory ICD、核可 policy pack（`SandboxApprovalPolicyValueSet`）、在地通報矩陣、recorder vendor contract、Tesla Fleet 帳號 —— 缺值 `missing/unverified/external_gated`，production fail-closed。

---

## 2c. UI build 第二波（design canvas 已交付，已 dispatch，6 tasks）

2026-06-26 設計團隊交付全 Phase 2 canvas 至 `docs/05-ui/drts-design-canvas/`（`roc-screens-1/2.jsx`、`driver-safety-operator.jsx`、
`compliance-screens.jsx`、`platform-sandbox.jsx`、`ops-av-fallback.jsx`）。UI gate 解除，worker **依 canvas 實作（canvas=IA authority，不重設計）**。
派工腳本：[`scripts/dispatch-phase2-tesla-sandbox-ui-wave.py`](../../scripts/dispatch-phase2-tesla-sandbox-ui-wave.py)。元件對照見
[`..._visual_design_handoff_20260625.md`](./phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md)。

| ID | Owner→Rev | Canvas | Deps（gated until done） |
|----|-----------|--------|------|
| **P2-UI-ROC-001** | Codex→Claude | `roc-screens-1.jsx` | P2-DP-C2-001, P2-ROC-001 |
| **P2-UI-ROC-002** | Codex2→Codex | `roc-screens-2.jsx`（3 欄 takeover、evidence deep-link） | P2-UI-ROC-001, P2-CORR-001, P2-DP-C1-001 |
| **P2-UI-SAFE-001** | Codex→Claude2 | `driver-safety-operator.jsx`（離線、不控 FSD） | P2-SAFE-001 |
| **P2-UI-CMP-001** | Codex2→Codex | `compliance-screens.jsx`（timeline confidence、export step-up、four-eyes） | P2-DP-C1-001, P2-ACC-002, P2-EVD-002 |
| **P2-UI-ADM-001** | Claude→Codex2 | `platform-sandbox.jsx`（PostGIS 編輯、capability gated） | P2-GOV-001, P2-GOV-002 |
| **P2-UI-OPS-001** | Codex→Codex2 | `ops-av-fallback.jsx`（messageCode、不 surcharge） | P2-FBK-001, P2-DP-C3-001 |

---

## 3. 不在本 wave 派 build 的工作（明確排除，附原因）

### 3.1 外部契約 gate（Gate C–F，等輸入到位）
| 項目 | 阻擋範圍 | Owner（非工程） |
|---|---|---|
| Tesla Regulatory Data Interface 簽約 + 真 endpoint/auth/reason-code dictionary | takeover/session authority、Gate C | Tesla + legal + system design |
| Tesla Fleet API 真帳號/車輛或官方 sandbox | public integration evidence、Gate C/D | Tesla / business team |
| 沙盒核准函 + 附帶條件（通報時限、路線、人員、保存年限） | 所有 policy 實值、Gate E | 主管機關 / 專案 owner |
| Evidence recorder 廠商協定 | 事故影像實證、Gate D | 採購 / 整合 |
| 在地警/消/EMS/醫院/保險聯絡與 SLA | jurisdiction/notification 實值 | 在地營運 |

工程側已用 **adapter + capability profile + policy-driven config** 把這些隔離（決策台帳 §Open Contracts）；
因此 repo build 不被它們卡住，但**這些值不得由 worker 捏造**。

### 3.2 UI / 視覺 canvas gate（交視覺團隊）
新 console 與新頁面**沒有 design canvas，不可由 LLM 設計**。詳列於
[`phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md`](./phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md)：
`apps/roc-console-web`（新）、driver-app Safety Operator Mode、platform-admin 沙盒治理頁、
ops-console AV fallback/passenger recovery、Compliance & Investigation 頁。
其中部分頁面被系統設計裁定卡住（歸屬、design system），見
[`phase2_tesla_fsd_sandbox_system_design_handoff_20260625.md`](./phase2_tesla_fsd_sandbox_system_design_handoff_20260625.md) §C。
工程 UI build task 待 canvas 到位後追加第二波（依 `feedback_must_check_design_canvas`）。

---

## 4. Gate 對照（測試計畫 §5）

| Gate | 內容 | 本 wave 是否達成 |
|---|---|---|
| A Architecture Ready | SA/SD 接受、Tesla 契約草案內部接受、法遵/隱私/管轄審查 | 規格包已備；法遵審查待人 |
| **B Repo Ready** | modules/contracts/DDL landed、unit/integration/E2E repo-local green | **本 wave 目標** |
| C Tesla Sandbox Ready | public 整合 + regulatory sandbox adapter + 簽章事件/backfill/summary | 待 Tesla 輸入 |
| D Vehicle Ready | 真 VIN + capability profile + recorder + 安全員 + readiness drill | 待車輛/廠商 |
| E Pilot Ready | 核准計畫載入 + 四演練 + 在地聯絡 + 報表包 | 待核准 |
| F Production/Pilot | 具名核准 + on-call + rollback/suspend/resume + retention active | 待營運 |

---

## 5. 重新派工 / 調整

```bash
# 重跑（idempotent，更新既有 task）
AI_NAME=Claude python3 scripts/dispatch-phase2-tesla-sandbox-wave.py
# 單一狀態調整
python3 scripts/ai_status.py <command> ...
```
