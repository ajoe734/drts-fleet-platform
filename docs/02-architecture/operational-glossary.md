# Operational Glossary — DRTS Fleet Platform

Status: canonical cross-surface terminology reference for Phase 1
Owner: ORX-GV-003
Last updated: 2026-05-01

## Purpose

This glossary defines the single authoritative translation and description for
every operational term used across admin, ops, driver, tenant, and partner
surfaces. When UI copy, error messages, or status labels reference a domain
concept, this file is the tiebreaker.

Canonical enum definitions live in `packages/contracts/src/index.ts`.
Canonical domain glossary lives in `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`.

This file extends those with **UI-facing operational translations** (en / zh).

---

## 1. Order Domain & Dispatch

| Code Key                       | English                      | Chinese (zh)   | Notes                            |
| ------------------------------ | ---------------------------- | -------------- | -------------------------------- |
| `owned`                        | Owned                        | 自有           | Platform-controlled order domain |
| `forwarded`                    | Forwarded                    | 轉送           | External-platform mirror domain  |
| `standard_taxi`                | Standard Taxi                | 一般計程車     | Phase 1 service bucket           |
| `business_dispatch`            | Business Dispatch            | 企業派遣       | Phase 1 service bucket           |
| `realtime`                     | Realtime                     | 即時           | Dispatch semantics               |
| `reservation`                  | Reservation                  | 預約           | Dispatch semantics               |
| `queue`                        | Queue                        | 排隊           | Dispatch semantics               |
| `forwarder_broadcast`          | Forwarder Broadcast          | 轉派廣播       | Dispatch semantics               |
| `credit_card_airport_transfer` | Credit Card Airport Transfer | 信用卡機場接送 | Business dispatch subtype        |
| `enterprise_dispatch`          | Enterprise Dispatch          | 企業派遣       | Business dispatch subtype        |

## 2. Dispatch Status & Queue States

| Code Key              | English             | Chinese (zh) | Notes |
| --------------------- | ------------------- | ------------ | ----- |
| `ready_for_dispatch`  | Ready for Dispatch  | 待派車       |       |
| `matching`            | Matching            | 媒合中       |       |
| `preassigned`         | Preassigned         | 預先指派     |       |
| `driver_accepted`     | Driver Accepted     | 司機已接單   |       |
| `enroute_pickup`      | En Route to Pickup  | 前往接送點   |       |
| `arrived_pickup`      | Arrived at Pickup   | 已到接送點   |       |
| `on_trip`             | On Trip             | 行程中       |       |
| `completed`           | Completed           | 已完成       |       |
| `cancelled`           | Cancelled           | 已取消       |       |
| `dispatch_failed`     | Dispatch Failed     | 派車失敗     |       |
| `exception_hold`      | Exception Hold      | 異常暫停     |       |
| `manual_hold`         | Manual Hold         | 人工停派     |       |
| `redispatch_required` | Redispatch Required | 需重新派車   |       |
| `dispatch_timeout`    | Dispatch Timeout    | 派車逾時     |       |
| `no_supply`           | No Supply           | 無可用車輛   |       |
| `timed_out`           | Timed Out           | 已逾時       |       |
| `queued`              | Queued              | 排隊中       |       |
| `recording_pending`   | Recording Pending   | 待附錄音     |       |
| `proof_pending`       | Proof Pending       | 待補證明     |       |

## 3. Exception Hold Reasons

| Code Key                                     | English                     | Chinese (zh)       |
| -------------------------------------------- | --------------------------- | ------------------ |
| `exception_hold_confirmation_window_expired` | Confirmation Window Expired | 確認視窗已到期     |
| `exception_hold_driver_rejected_in_window`   | Driver Rejected In Window   | 確認視窗內司機拒單 |
| `exception_hold_manual_escalation`           | Manual Escalation           | 人工升級           |
| `exception_hold_no_eligible_supply`          | No Eligible Supply          | 無可用供給         |

## 4. Queue Families

| Code Key                         | English                        | Chinese (zh) |
| -------------------------------- | ------------------------------ | ------------ |
| `realtime_ready_queue`           | Realtime Ready Queue           | 即時待派佇列 |
| `reservation_confirmation_queue` | Reservation Confirmation Queue | 預約確認佇列 |
| `redispatch_priority_queue`      | Redispatch Priority Queue      | 重派優先佇列 |
| `recording_gate_queue`           | Recording Gate Queue           | 錄音門檻佇列 |
| `delayed_queue`                  | Delayed Queue                  | 延遲佇列     |
| `delayed_retry_queue`            | Delayed Retry Queue            | 延遲重試佇列 |
| `manual_review_queue`            | Manual Review Queue            | 人工審查佇列 |

## 5. Redispatch & Reassign Reasons

| Code Key                     | English                    | Chinese (zh)     |
| ---------------------------- | -------------------------- | ---------------- |
| `operator_redispatch`        | Operator Redispatch        | 營運人員重派     |
| `system_redispatch`          | System Redispatch          | 系統自動重派     |
| `operator_reassign`          | Operator Reassign          | 營運人員重新指派 |
| `driver_rejected`            | Driver Rejected            | 司機拒單         |
| `driver_unavailable`         | Driver Unavailable         | 司機不可用       |
| `no_supply_available`        | No Supply Available        | 無可用供給       |
| `vehicle_became_unavailable` | Vehicle Became Unavailable | 車輛變為不可用   |
| `customer_request`           | Customer Request           | 客戶要求         |
| `vehicle_swap`               | Vehicle Swap               | 換車             |
| `load_balancing`             | Load Balancing             | 負載平衡         |
| `acceptance_timeout`         | Acceptance Timeout         | 接單逾時         |
| `matching_timeout`           | Matching Timeout           | 媒合逾時         |

## 6. Complaint & Incident

| Code Key                     | English                    | Chinese (zh)   | Normalization note                                        |
| ---------------------------- | -------------------------- | -------------- | --------------------------------------------------------- |
| `complaint`                  | Complaint                  | 客訴           | Standardized: use "客訴" across all surfaces (not "投訴") |
| `complaint_case_detail`      | Complaint Case Detail      | 客訴案件明細   |                                                           |
| `complaint_linked`           | Complaint Linked           | 客訴已連結     | Fixed: was "投訴已連結" in ops-console                    |
| `incident_register`          | Incident Register          | 事故名冊       |                                                           |
| `incident_created`           | Incident Created           | 事故已建立     |                                                           |
| `incident_assigned`          | Incident Assigned          | 事故已指派     |                                                           |
| `incident_resolved`          | Incident Resolved          | 事故已解決     |                                                           |
| `incident_closed`            | Incident Closed            | 事故已關閉     |                                                           |
| `incident_hold`              | Incident Hold              | 事故暫停       |                                                           |
| `escalated_to_incident`      | Escalated to Incident      | 已升級為事故   |                                                           |
| `incident_linked`            | Incident Linked            | 已連結事故     |                                                           |
| `dispatch_exception_handoff` | Dispatch Exception Handoff | 派遣異常移交   |                                                           |
| `service_recovery_action`    | Service Recovery Action    | 服務恢復行動   |                                                           |
| `severity_escalated`         | Severity Escalated         | 嚴重程度已升級 |                                                           |
| `escalation_target_set`      | Escalation Target Set      | 升級對象已設定 |                                                           |

### Complaint Categories

| Code Key            | English           | Chinese (zh) |
| ------------------- | ----------------- | ------------ |
| `fare_dispute`      | Fare Dispute      | 車資爭議     |
| `late_arrival`      | Late Arrival      | 延遲到達     |
| `no_arrival`        | No Arrival        | 未到場       |
| `driver_service`    | Driver Service    | 司機服務     |
| `vehicle_condition` | Vehicle Condition | 車況         |
| `safety_concern`    | Safety Concern    | 安全疑慮     |
| `route_issue`       | Route Issue       | 路線問題     |
| `lost_and_found`    | Lost and Found    | 失物招領     |
| `general_inquiry`   | General Inquiry   | 一般諮詢     |

### Complaint Resolution Outcomes

| Code Key                          | English                      | Chinese (zh)       |
| --------------------------------- | ---------------------------- | ------------------ |
| `resolved_with_apology`           | Resolved — Apology           | 已解決——致歉       |
| `resolved_with_refund`            | Resolved — Refund            | 已解決——退款       |
| `resolved_with_credit`            | Resolved — Credit            | 已解決——補償額度   |
| `resolved_with_corrective_action` | Resolved — Corrective Action | 已解決——矯正措施   |
| `resolved_driver_warning`         | Resolved — Driver Warning    | 已解決——司機警告   |
| `resolved_driver_suspension`      | Resolved — Driver Suspension | 已解決——司機停權   |
| `resolved_no_fault`               | Resolved — No Fault          | 已解決——無過失     |
| `resolved_duplicate`              | Resolved — Duplicate         | 已解決——重複案件   |
| `resolved_withdrawn`              | Resolved — Withdrawn         | 已解決——撤回       |
| `resolved_item_returned`          | Resolved — Item Returned     | 已解決——物品歸還   |
| `resolved_item_not_found`         | Resolved — Item Not Found    | 已解決——物品未尋獲 |
| `resolved_other`                  | Resolved — Other             | 已解決——其他       |

### Incident Severity

| Code Key   | English  | Chinese (zh) |
| ---------- | -------- | ------------ |
| `critical` | Critical | 重大         |
| `high`     | High     | 高           |
| `medium`   | Medium   | 中           |
| `low`      | Low      | 低           |

## 7. Complaint & Incident Timeline Events

| Code Key           | English          | Chinese (zh) |
| ------------------ | ---------------- | ------------ |
| `case_created`     | Case Created     | 案件建立     |
| `case_assigned`    | Case Assigned    | 案件指派     |
| `case_note_added`  | Note Added       | 新增備註     |
| `case_reopened`    | Case Reopened    | 案件重開     |
| `sla_breached`     | SLA Breached     | SLA 逾期     |
| `sla_recalculated` | SLA Recalculated | SLA 重算     |
| `case_resolved`    | Case Resolved    | 案件已解決   |
| `case_closed`      | Case Closed      | 案件已結案   |

## 8. Driver Lifecycle & Work State

| Code Key             | English            | Chinese (zh) |
| -------------------- | ------------------ | ------------ |
| `active`             | Active             | 啟用中       |
| `suspended`          | Suspended          | 停用         |
| `terminated`         | Terminated         | 已終止       |
| `revoked`            | Revoked            | 已撤銷       |
| `pending_acceptance` | Pending Acceptance | 待接受       |
| `accepted`           | Accepted           | 已接受       |
| `rejected`           | Rejected           | 已拒絕       |

### Driver Task Status (Driver App)

| Code Key             | English            | Chinese (zh) |
| -------------------- | ------------------ | ------------ |
| `pending_acceptance` | Pending Acceptance | 待接受       |
| `accepted`           | Accepted           | 已接受       |
| `enroute_pickup`     | En Route to Pickup | 前往接送點   |
| `arrived_pickup`     | Arrived at Pickup  | 已抵達上車點 |
| `on_trip`            | On Trip            | 行程中       |
| `proof_pending`      | Proof Pending      | 待補憑證     |
| `completed`          | Completed          | 已完成       |
| `rejected`           | Rejected           | 已拒絕       |
| `cancelled`          | Cancelled          | 已取消       |

### Driver Payout Status

| Code Key  | English | Chinese (zh) |
| --------- | ------- | ------------ |
| `pending` | Pending | 待撥款       |
| `paid`    | Paid    | 已撥款       |

## 9. Supply Lifecycle (Vehicle / Insurance / Exclusivity)

| Code Key                         | English                    | Chinese (zh) |
| -------------------------------- | -------------------------- | ------------ |
| `contract_missing`               | No Active Contract         | 無有效合約   |
| `contract_draft`                 | Contract Draft             | 合約草稿中   |
| `contract_expired`               | Contract Expired           | 合約已過期   |
| `contract_terminated`            | Contract Terminated        | 合約已終止   |
| `insurance_missing`              | No Policy                  | 無保單       |
| `insurance_pending`              | Policy Pending             | 保單待生效   |
| `insurance_expired`              | Policy Expired             | 保單已過期   |
| `insurance_cancelled`            | Policy Cancelled           | 保單已取消   |
| `exclusivity_missing`            | No Exclusivity File        | 無排他聲明   |
| `exclusivity_pending_review`     | Exclusivity Pending Review | 排他審核中   |
| `exclusivity_expired`            | Exclusivity Expired        | 排他已過期   |
| `exclusivity_revoked`            | Exclusivity Revoked        | 排他已撤銷   |
| `exclusivity_rejected`           | Exclusivity Rejected       | 排他遭退回   |
| `offboarding_pending_debranding` | Debranding Required        | 待完成除標識 |

## 10. Finance & Settlement

| Code Key         | English        | Chinese (zh) |
| ---------------- | -------------- | ------------ |
| `approved`       | Approved       | 已核准       |
| `paid`           | Paid           | 已付款       |
| `pending`        | Pending        | 待處理       |
| `pending_review` | Pending Review | 待審核       |
| `issued`         | Issued         | 已開立       |

## 11. Order Source

| Code Key    | English   | Chinese (zh) |
| ----------- | --------- | ------------ |
| `app`       | App       | App          |
| `web`       | Web       | 網站         |
| `phone`     | Phone     | 電話         |
| `portal`    | Portal    | 入口網站     |
| `concierge` | Concierge | 禮賓         |

## 12. Multilingual Hotspot Catalog

The following areas have been identified as multilingual hotspots requiring
special attention during implementation:

| Surface        | File                        | Hotspot                                      | Issue                                                                   |
| -------------- | --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| driver-app     | `lib/operational-labels.ts` | All labels                                   | Chinese-only; no English fallback or locale parameter                   |
| ops-console    | `lib/localized-labels.ts`   | `complaint_linked`                           | Used "投訴" while all other complaint labels use "客訴"                 |
| platform-admin | `lib/localized-labels.ts`   | `complaint` UI label                         | Used "投訴" vs ops-console "客訴" — standardized to "客訴"              |
| ops-console    | `lib/localized-labels.ts`   | `exception_hold_confirmation_window_expired` | zh said "已到" (arrived), should be "已到期" (expired)                  |
| driver-app     | `lib/operational-labels.ts` | fallback string                              | Hardcoded "未知狀態" — no English variant                               |
| All apps       | various                     | Missing shared CODE_LABELS                   | Each app has a subset; no single shared source of truth for code labels |

---

## Appendix: Normalization Decisions

| Term                                            | Before (inconsistent)                         | After (normalized) | Rationale                                                                               |
| ----------------------------------------------- | --------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| Complaint (zh)                                  | "投訴" (platform-admin), "客訴" (ops-console) | "客訴" everywhere  | "客訴" is the standard operational term in Taiwan transport industry; matches PRD usage |
| complaint_linked (zh)                           | "投訴已連結" (ops-console)                    | "客訴已連結"       | Align with normalized complaint term                                                    |
| exception_hold_confirmation_window_expired (zh) | "確認視窗已到"                                | "確認視窗已到期"   | "已到" is ambiguous; "已到期" clearly means "expired"                                   |
