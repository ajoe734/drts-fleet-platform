# Governance-Aware Billing & Reporting — UAT

**Date**: 2026-05-19 (date stamped to align with directive; reconciled commit 2026-05-22)
**Authority**: directive §H `FIN-GOV-001` — `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.7 (with execution-worklist alignment at `docs/00-context/phase1-origin-dev-execution-worklist-20260519.md` §G1 and audit reconciliation at `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` §2.14)
**Workflow family**: `WF-FIN-GOV-001`
**Spec reference**: `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
**Executable proof**: `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` (driven by `PH1GC-E2E-010`)

This UAT codifies the human-runnable acceptance scenarios for governance-aware billing and reporting. Each scenario maps to a verification-body field cluster in the spec and to an assertion block in `E2E-010`.

## 0. Verification-body coverage matrix

The directive §H acceptance body for `WF-FIN-GOV-001` is the exact 13-field set declared in the spec §3.8. Review must be able to point to one primary happy-path assertion for each field, plus the negative-path guard that prevents silent drift.

| Field                       | Primary UAT coverage                                                       | Negative / integrity coverage                           |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `costCenterCode`            | `UAT-FIN-GOV-001`, `UAT-FIN-GOV-004`, `UAT-FIN-GOV-006`                    | `UAT-FIN-GOV-011`                                       |
| `costCenterName`            | `UAT-FIN-GOV-001`                                                          | `UAT-FIN-GOV-011`                                       |
| `ownerUserId`               | `UAT-FIN-GOV-001`                                                          | `UAT-FIN-GOV-011`                                       |
| `legacy_unmapped`           | `UAT-FIN-GOV-001` (`false` on current mappings)                            | `UAT-FIN-GOV-011`                                       |
| `approvalRequestId`         | `UAT-FIN-GOV-001`, `UAT-FIN-GOV-002`, `UAT-FIN-GOV-003`                    | `UAT-FIN-GOV-008`                                       |
| `approvalState`             | `UAT-FIN-GOV-001`, `UAT-FIN-GOV-002`, `UAT-FIN-GOV-003`                    | `UAT-FIN-GOV-008`                                       |
| `quotaPeriodKey`            | `UAT-FIN-GOV-001`, `UAT-FIN-GOV-004`, `UAT-FIN-GOV-006`                    | `UAT-FIN-GOV-007`                                       |
| `quotaUsageDelta`           | `UAT-FIN-GOV-001`, `UAT-FIN-GOV-004`                                       | `UAT-FIN-GOV-007`, `UAT-FIN-GOV-012`                    |
| `partnerProgramCode`        | `UAT-FIN-GOV-005`                                                          | `UAT-FIN-GOV-013`                                       |
| `eligibilityVerificationId` | `UAT-FIN-GOV-005`                                                          | `UAT-FIN-GOV-013`                                       |
| `platformEarningsRef`       | `UAT-FIN-GOV-006`                                                          | `UAT-FIN-GOV-010`                                       |
| `auditId`                   | `UAT-FIN-GOV-001`, `UAT-FIN-GOV-002`, `UAT-FIN-GOV-003`                    | `UAT-FIN-GOV-009`, `UAT-FIN-GOV-010`, `UAT-FIN-GOV-012` |
| `reportArtifactId`          | `UAT-FIN-GOV-001`, `UAT-FIN-GOV-004`, `UAT-FIN-GOV-005`, `UAT-FIN-GOV-006` | `UAT-FIN-GOV-009`, `UAT-FIN-GOV-010`                    |

Expected review posture:

- every field above appears in a human-readable scenario assertion
- every field above is also emitted by `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- partner-only / forwarded-only fields are still mandatory evidence rows; non-applicable happy-path runs must record explicit null/`NOT_POPULATED`, not omit them

---

## 1. Pre-conditions

Before any UAT scenario runs:

- A test tenant is provisioned with `WF-TGV-001` governance enabled (cost-center registry, approval rules, quota policies).
- At least one cost center exists with a known `costCenterCode` and a non-empty owner mapping.
- At least one approval rule exists targeting a known booking attribute (e.g., trips above a price threshold).
- At least one quota policy exists with a known period and unit.
- The tenant has at least one finance role and one non-finance role for RBAC negative paths.

If any pre-condition is missing, the UAT halts and reports the missing precondition (it does not skip the scenario).

---

## 2. Happy-path scenarios

### `UAT-FIN-GOV-001` — Single cost center, single booking, full attribution

1. Create a booking with `costCenterCode = CC-A`.
2. Booking is auto-approved by the always-true approval rule.
3. Driver completes the trip.
4. Generate the invoice for the billing window.
5. Generate the report export for the billing window.

**Assert**: the billing record carries the full 13-field verification body for the non-partner owned flow: `costCenterCode = CC-A`, `costCenterName` resolved to the registry snapshot, `ownerUserId` populated, `legacy_unmapped = false`, `approvalRequestId` set, `approvalState = auto_approved`, `quotaPeriodKey` set, `quotaUsageDelta > 0`, `auditId` set, and `reportArtifactId` becomes non-null after export. `partnerProgramCode`, `eligibilityVerificationId`, and `platformEarningsRef` remain null on this owned non-partner path. The report export contains the same governance fields for the same booking row.

### `UAT-FIN-GOV-002` — Approval-required threshold, manual approval

1. Create a booking with `costCenterCode = CC-A` that exceeds an approval-rule threshold.
2. Booking enters approval queue; approver approves.
3. Trip completes; invoice + report generated.

**Assert**: billing record `approvalState = approved` (not `auto_approved`), `approvalRequestId` traces back to the manual approval action, and the audit log contains the approver's user id and timestamp.

### `UAT-FIN-GOV-003` — Escalated then approved

1. Create a booking that triggers escalation per approval rule.
2. Approver below threshold rejects → escalation → higher-level approver approves.
3. Trip completes; invoice + report generated.

**Assert**: `approvalState = escalated_then_approved`. The audit log contains both the rejection and the eventual approval rows.

### `UAT-FIN-GOV-004` — Quota usage tracking

1. Create 3 bookings against the same `costCenterCode` and the same `quotaPeriodKey`.
2. All 3 complete.
3. Generate the report export.

**Assert**: each booking's billing record carries the same `quotaPeriodKey` and a `quotaUsageDelta` consistent with the policy unit. The sum of `quotaUsageDelta` across the 3 bookings matches the period's recorded usage. Quota period total does not exceed the policy ceiling (if exceeded, see UAT-FIN-GOV-007).

### `UAT-FIN-GOV-005` — Partner program governance integration

1. Create a booking via partner channel (`partnerProgramCode = credit_card_airport_transfer`).
2. Eligibility verification returns `eligible`.
3. Cost-center attribution flows through to the partner booking (per tenant configuration).
4. Trip completes; invoice + report generated.

**Assert**: billing record carries both partner fields (`partnerProgramCode`, `eligibilityVerificationId`) **and** governance fields (`costCenterCode`, `approvalRequestId`, `quotaPeriodKey`). `referenceToken` is masked. `referenceHash` is set. Subsidy line item is applied to the booking total.

### `UAT-FIN-GOV-006` — Forwarded booking governance integration

1. Inbound forwarded order from a sandbox forwarder (per `WF-FWD-001`).
2. Booking is dispatched to a driver; trip completes.
3. Forwarder settlement record is generated.
4. Generate invoice + report.

**Assert**: billing record carries `platformEarningsRef`, `costCenterCode` (if the tenant configures forwarded bookings to attribute to a cost center), `quotaPeriodKey`. `sourcePlatform` field reflects the forwarder. No owned dispatch assignment was created for the forwarded task.

---

## 3. Negative-path scenarios

### `UAT-FIN-GOV-007` — Quota ceiling exceeded

1. Configure a quota policy with ceiling = 5 units for the period.
2. Create bookings totaling 6 units against the same `costCenterCode` and period.
3. Observe the 6th booking attempt.

**Assert**: the 6th booking is rejected at booking-time with a quota-ceiling reason code, no billing record is generated for it, and an audit row records the rejection. Prior 5 bookings remain valid and appear in the report export.

### `UAT-FIN-GOV-008` — Approval rejected

1. Create a booking that requires approval per rule.
2. Approver rejects.

**Assert**: no driver dispatch occurs; no billing record is generated; the booking record carries `approvalState = rejected`; the rejection is in the audit log; the report export does not include the booking.

### `UAT-FIN-GOV-009` — RBAC: non-finance role cannot export

1. Non-finance role attempts to download the report export.

**Assert**: API returns 403 / forbidden, an audit row captures the attempt with the user id and the requested resource.

### `UAT-FIN-GOV-010` — RBAC: cross-tenant attempt blocked

1. Tenant A user attempts to access Tenant B's report export.

**Assert**: API returns 404 / not_found (not 403, to avoid existence leakage), audit row captures the attempt with the cross-tenant marker.

### `UAT-FIN-GOV-011` — `legacy_unmapped` integrity

1. Create a booking on a tenant whose cost-center registry is current (no missing mappings).
2. Attempt to flag the resulting billing record as `legacy_unmapped = true` via API.

**Assert**: API rejects with an integrity error; the flag remains `false`; audit row captures the attempt.

### `UAT-FIN-GOV-012` — Post-export immutability

1. Complete UAT-FIN-GOV-001 through export.
2. Attempt to modify `quotaUsageDelta` on the exported billing record via API.

**Assert**: API rejects with `record_already_exported` reason code; the modification must instead go through an adjustment record. The audit log captures the attempt.

### `UAT-FIN-GOV-013` — Reference token masking integrity

1. Run UAT-FIN-GOV-005.
2. Examine the report export file (CSV / JSON).
3. Examine the audit log for the same booking.

**Assert**: `referenceToken` appears only in masked form (`maskOpaqueToken` output) in both. The unmasked value never appears in any export artifact or log line.

---

## 4. Acceptance criteria for `WF-FIN-GOV-001` gate-read uplift

To uplift `WF-FIN-GOV-001` matrix row to `PASS (live staging evidence)`:

1. All happy-path scenarios `UAT-FIN-GOV-001` through `UAT-FIN-GOV-006` pass against a staging environment with real `WF-TGV-001` data.
2. All negative-path scenarios `UAT-FIN-GOV-007` through `UAT-FIN-GOV-013` pass.
3. `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` runs to completion against the staging environment with a deterministic seed (no silent passes), records each of the 13 spec-defined fields, and returns green under `STRICT_VERIFICATION_BODY=1`.
4. The closeout report (per directive §7) includes the verification commands and the staging run reference.

---

## 5. Out of scope

- Cross-period reconciliation (Phase 2).
- Real-time governance dashboards (Phase 2 deferred per spec §7).
- Subsidy chargeback ledger between DRTS and partner programs (`WF-PARTNER-001` post-pilot).
- Forwarder settlement reconciliation against forwarder statements (`WF-FWD-001` post-sandbox).
