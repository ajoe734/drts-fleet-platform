# Governance-Aware Billing & Reporting Spec

**Date**: 2026-05-19 (date stamped to align with directive; reconciled commit 2026-05-22)
**Authority**: directive §H `FIN-GOV-001` — `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.7 (with execution-worklist alignment at `docs/00-context/phase1-origin-dev-execution-worklist-20260519.md` §G1 and audit reconciliation at `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` §2.14)
**Workflow family**: `WF-FIN-GOV-001` (depends on `WF-TGV-001` + `WF-FIN-001`; do **not** rename or absorb `WF-FIN-001`)
**Pairs with**: `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` (UAT), `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` (executable proof — driven by `PH1GC-E2E-010`)

This spec defines the verification body for governance-aware billing and reporting — what fields a billing record / report export must carry when the source booking is governed by `WF-TGV-001` cost-center / quota / approval rules, and how those fields chain through to invoice, report, and audit artifacts.

---

## 1. Where governance-aware billing fits

`WF-FIN-001` (baseline billing) declares the invoice and report-export contracts for _every_ booking. `WF-FIN-GOV-001` is the **extension** that fires when the source booking carries governance attribution — i.e., the booking was created with a `costCenterCode` and / or evaluated against an approval rule and / or charged against a quota policy.

`WF-FIN-001` does not change. `WF-FIN-GOV-001` adds fields and joins; it never removes baseline fields.

---

## 2. Triggering condition

A billing or report record is **governance-aware** if any of the following are true on the source booking:

- `costCenterCode` is set (non-null)
- `approvalRequestId` is set (booking went through an approval-rule evaluation)
- `quotaPeriodKey` is set (booking was counted against a quota policy)
- `eligibilityVerificationId` is set (booking originated via `WF-PARTNER-001`)

If none are set, the record falls back to `WF-FIN-001` baseline shape only.

If any one is set, **all 13 verification-body fields below are required** (with the legacy fallback in §3.3).

---

## 3. Verification body — 13 required fields

### 3.1 Cost-center and ownership

| Field             | Type    | Source                                                                | Required when    |
| ----------------- | ------- | --------------------------------------------------------------------- | ---------------- |
| `costCenterCode`  | string  | `WF-TGV-001` cost-center registry                                     | governance-aware |
| `costCenterName`  | string  | resolved at billing time from the cost-center registry snapshot       | governance-aware |
| `ownerUserId`     | uuid    | the user (driver dispatcher / requester) attributed to the booking    | governance-aware |
| `legacy_unmapped` | boolean | `true` only when the booking pre-dates the cost-center mapping window | see §3.3         |

`costCenterName` is resolved at _billing time_ (not booking time) so historical renames do not corrupt the bill. The booking record retains the IDs; the billing record carries the rendered name snapshot. Human-facing display names such as `ownerName` may still be rendered by downstream reporting, but they are not part of the 13-field verification body for this Phase 1 acceptance slice.

### 3.2 Approval evaluation

| Field               | Type | Source                                                                                                         | Required when                   |
| ------------------- | ---- | -------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `approvalRequestId` | uuid | the originating approval request (one request can span multiple evaluations)                                   | booking ran approval evaluation |
| `approvalState`     | enum | terminal state of the approval at booking confirmation: `approved`, `auto_approved`, `escalated_then_approved` | same as above                   |

For governance-aware billing, the approval must have terminated in one of the three "approved" states above. Rejected approvals do not produce billable bookings.

### 3.3 Quota usage

| Field             | Type                      | Source                                                       | Required when                   |
| ----------------- | ------------------------- | ------------------------------------------------------------ | ------------------------------- |
| `quotaPeriodKey`  | string (e.g. `"2026-05"`) | `WF-TGV-001` quota policy snapshot at booking confirmation   | booking counted against a quota |
| `quotaUsageDelta` | decimal                   | the usage units charged (currency or count, per policy unit) | same as above                   |

### 3.4 Partner channel

| Field                       | Type   | Source                                        | Required when                          |
| --------------------------- | ------ | --------------------------------------------- | -------------------------------------- |
| `partnerProgramCode`        | string | `WF-PARTNER-001` program registry             | booking originated via partner channel |
| `eligibilityVerificationId` | uuid   | `WF-PARTNER-001` eligibility verification row | same as above                          |

### 3.5 Forwarder

| Field                 | Type | Source                                          | Required when                                   |
| --------------------- | ---- | ----------------------------------------------- | ----------------------------------------------- |
| `platformEarningsRef` | uuid | `WF-FWD-001` platform-earnings ledger reference | booking was forwarded (sourcePlatform != owned) |

### 3.6 Audit / report linkage

| Field              | Type | Source                                                                                  | Required when                                                  |
| ------------------ | ---- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `auditId`          | uuid | the billing record's own audit row (creation event)                                     | always (governance-aware records carry their own audit anchor) |
| `reportArtifactId` | uuid | nullable until the record appears in an exported report; set when included in an export | governance-aware (set lazily)                                  |

### 3.7 Legacy-unmapped fallback

For bookings created during the cost-center rollout window (defined as before `WF-TGV-001` rolled to a tenant) that nevertheless ran through approval or quota gates, the billing record may set `legacy_unmapped = true` and leave `costCenterCode` / `costCenterName` / `ownerUserId` null **only when** the cost-center registry confirms no mapping is available. The remaining ten verification-body fields must still be populated according to their own §3.2–§3.6 triggers, and `reportArtifactId` still populates lazily once export completes.

`legacy_unmapped = true` may not be used to bypass cost-center attribution on a tenant where the registry is current; the export pipeline treats unexpectedly-flagged rows as an integrity error.

---

## 4. Invoice and report-export shape

### 4.1 Invoice

The invoice (per `WF-FIN-001` baseline + this extension) appends a `governance` section with the 13 fields. The section is null when the booking is not governance-aware; otherwise it is fully populated (modulo §3.7).

### 4.2 Report export

Report exports support filtering on:

- `costCenterCode` (single or multi)
- `partnerProgramCode`
- `approvalState`
- `quotaPeriodKey`
- date range

Exports of governance-aware records mask `referenceToken` (per `WF-PARTNER-001` §3.2) and `callId` / `recordingId` / `issuerAuthRef` / `benefitRef` via the platform-standard `maskOpaqueToken(value, 8, 4)` helper.

### 4.3 Audit trail

Every governance-aware billing or report event emits an audit row:

- record creation
- record correction (with prior + new values masked)
- report inclusion (with `reportArtifactId` linkage)
- permissioned download (with downloader id + ip + timestamp)

The audit trail is the canonical reconciliation source. Any disagreement between the billing record and the audit log defers to the audit log.

---

## 5. State transitions (forbidden)

The following transitions on a governance-aware billing record are not permitted via API or operator action:

- Remove `costCenterCode` once set (correction is by issuing a corrective record).
- Modify `approvalRequestId` or `approvalState` (approval lineage is immutable once the booking is confirmed).
- Modify `quotaUsageDelta` post-export (post-export corrections go through a follow-on adjustment record, not in-place edit).
- Flip `legacy_unmapped` from `false` to `true` (the flag is monotonic — once mapped, always mapped).

---

## 6. E2E and UAT obligation

The verification body above must be asserted end-to-end by `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` (driven by `PH1GC-E2E-010`) and covered scenario-by-scenario in `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`.

### 6.1 Hard-fail contract regressions (always enforced)

The E2E script must hard-fail with a non-zero exit when any of the following contract regressions are observed. Silent passes are not permitted:

- seed bootstrap cannot complete (no tenant admin / no cost-center registry write / no quota policy write / no approval rule write)
- `costCenterCode` is dropped from the governed booking read-back
- driver lifecycle cannot reach `task.status == completed` after dispatch + assign were accepted
- the generated tenant invoice does not contain an invoice line whose `orderId` matches the just-completed governed booking
- no audit row with `actionName == generate_tenant_invoice` and `resourceId == <invoiceId>`
- a cross-tenant fetch of the governed invoice returns `2xx` instead of `4xx`

### 6.2 Verification-body field recording (always required, two-tier pass semantics)

For each of the 13 verification-body fields enumerated in §3, the E2E script must record one explicit evidence line per field with either:

- the observed value, or
- the literal `NOT_POPULATED` marker

A silently omitted field is itself a regression; the recording is mandatory. The pass semantics are:

| Mode | Meaning of `NOT_POPULATED` | When to use |
| --- | --- | --- |
| Default | Soft evidence that runtime enrichment for this field is still partial on the currently reachable environment. The shell may still exit `0`, so the field-presence delta remains reviewable evidence. | Pre-live-uplift runs while `WF-FIN-GOV-001` remains `PASS (static evidence)`. |
| `STRICT_VERIFICATION_BODY=1` | Hard fail. Any `NOT_POPULATED` value in the final 13-field snapshot exits non-zero with the missing-field list. | The gate-keeper mode for uplifting `WF-FIN-GOV-001` to `PASS (live staging evidence)`. |

The strict-mode invocation is `STRICT_VERIFICATION_BODY=1 bash tests/e2e/E2E-010-governance-aware-billing-reporting.sh`. The default invocation omits the env var.

---

## 7. Out of scope for this spec

- Subsidy / chargeback accounting between DRTS and partner programs (`WF-PARTNER-001` post-pilot work).
- Cross-tenant cost-center sharing (Phase 2 deferred).
- Real-time governance dashboards (Phase 2 deferred).
- Non-governance baseline billing (lives in `WF-FIN-001`).
