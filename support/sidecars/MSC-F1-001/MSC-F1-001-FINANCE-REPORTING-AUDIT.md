# MSC-F1-001 Finance / Reporting Operational Audit

**Task:** `MSC-F1-001`  
**Owner:** Codex  
**Reviewer:** Claude  
**Date:** 2026-04-20  
**Status:** submitted for review

---

## Purpose

This packet answers the three acceptance questions on `MSC-F1-001`:

1. map receipts, invoices, driver statements, and reimbursements to actual repo and UI paths
2. map regulatory reporting and filing-package generation to actual repo and UI paths
3. record any remaining gap between backend capability and operationally reviewable workflow

This is an audit packet only. It does not change canonical product truth.

---

## Evidence Sources

| Source                                                                                                                  | Why it matters                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `phase1_prd_detailed_v1.md` §5.1-5.2, §6.1, §9.8.3, §9.8.4, §12.7-12.8                                                  | PRD finance and reporting completion bar                                      |
| `phase1_service_contracts_v1.md` §3.11, §3.12, §8.3                                                                     | service authority for billing, reimbursement, reporting, filing               |
| `docs/04-uat/phase1-uat-scenarios.md` TP-022, TP-023, OC-017, OC-023, §5 E2E-001, §7 pending gates                      | UAT workflow expectations and deferred evidence gates                         |
| `docs/03-runbooks/master-system-closeout-checklist.md` §D-4                                                             | closeout checklist for finance/reporting                                      |
| `apps/api/src/modules/billing-settlement/`                                                                              | backend authority for invoice, statement, reimbursement                       |
| `apps/api/src/modules/reporting-filing/`                                                                                | backend authority for report jobs and filing packages                         |
| `apps/tenant-portal-web/app/billing/page.tsx`                                                                           | tenant-facing invoice review/download workflow                                |
| `apps/tenant-portal-web/app/reports/page.tsx`                                                                           | tenant-facing report-job workflow                                             |
| `apps/platform-admin-web/app/pricing/page.tsx`                                                                          | authoritative fee-plan publication workflow                                   |
| `apps/platform-admin-web/app/payments/page.tsx`                                                                         | authoritative finance operator workflow for invoice, statement, reimbursement |
| `apps/ops-console-web/app/reports/page.tsx`                                                                             | operator-facing reporting and filing center                                   |
| `apps/ops-console-web/app/revenue/page.tsx`, `apps/ops-console-web/app/drivers/page.tsx`                                | current ops visibility for statement/revenue review                           |
| `apps/driver-app/app/earnings.tsx`                                                                                      | driver-facing statement visibility                                            |
| `packages/api-client/src/index.ts`                                                                                      | typed client parity across billing/reporting surfaces                         |
| `tests/unit/billing-settlement.test.ts`, `tests/unit/reporting-filing.test.ts`, `tests/unit/client-integration.test.ts` | focused regression evidence                                                   |
| `tests/smoke/05-billing-invoice.sh`, `tests/smoke/06-report-export.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh`      | smoke and E2E operational anchors                                             |

---

## Audit Result

### 1. Receipts / invoices / driver statements / reimbursements

| Capability          | Repo authority                                                                                                                                                                                              | Reviewable workflow                                                                                                                                                                                                                                                        | Verdict                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passenger receipt   | `IssuePassengerReceiptCommand` and `PassengerReceiptRecord` exist in `packages/contracts/src/index.ts`, but no runtime route/service/UI implementation was found under `apps/api` or any client surface     | No passenger-facing or tenant-facing receipt workflow exists in this repo                                                                                                                                                                                                  | `DEFERRED`, not complete. This must stay explicitly tied to the passenger-surface defer decision rather than be narrated as implemented.                         |
| Tenant invoice      | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` exposes tenant billing profile + invoice generate/list/get routes; service/repository keep artifact URLs and tenant-scoped truth | Tenant review path exists in `apps/tenant-portal-web/app/billing/page.tsx`; finance operator path exists in `apps/platform-admin-web/app/payments/page.tsx`; smoke/E2E anchors exist in `tests/smoke/05-billing-invoice.sh` and `tests/e2e/E2E-001-enterprise-dispatch.sh` | `PASS`                                                                                                                                                           |
| Driver statement    | `apps/api/src/modules/billing-settlement/` generates immutable statement records from published fee plans and live/persisted trip data                                                                      | Full finance review exists in `apps/platform-admin-web/app/payments/page.tsx`; driver self-view exists in `apps/driver-app/app/earnings.tsx`; ops-only visibility exists in `apps/ops-console-web/app/revenue/page.tsx`                                                    | `PARTIAL` for workflow alignment. Backend authority is present, but the exact UAT path `Drivers -> select driver -> Earnings` is not implemented in ops-console. |
| Reimbursement batch | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` exposes list/get/approve/pay; service keeps remittance proof and payout-status propagation authoritative                         | `apps/platform-admin-web/app/payments/page.tsx` provides approve/pay controls and remittance-proof entry; `apps/platform-admin-web/app/pricing/page.tsx` provides upstream fee-plan publication                                                                            | `PASS`                                                                                                                                                           |

### 2. Regulatory reporting and filing-package generation

| Capability                | Repo authority                                                                                                                                                             | Reviewable workflow                                                                                                                                                                                           | Verdict |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Report jobs               | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` exposes create/list/get for shared and tenant-prefixed report jobs; service issues signed artifacts | Tenant report-job path exists in `apps/tenant-portal-web/app/reports/page.tsx`; operator path exists in `apps/ops-console-web/app/reports/page.tsx`; smoke anchor exists in `tests/smoke/06-report-export.sh` | `PASS`  |
| Dispatch recording export | `tests/unit/reporting-filing.test.ts` verifies explicit missing-recording flags and signed report artifact metadata for SC-034                                             | `apps/ops-console-web/app/reports/page.tsx` can inspect report detail and dispatch-recording rows                                                                                                             | `PASS`  |
| Filing package generation | `apps/api/src/modules/reporting-filing/` generates immutable filing-package records with manifest/hash and signed ZIP/PDF downloads                                        | `apps/ops-console-web/app/reports/page.tsx` provides generate/history/detail flows for filing packages                                                                                                        | `PASS`  |

---

## Remaining Gaps

### A. Passenger receipt is still future-gated, not implemented

PRD truth still expects receipt output:

- `phase1_prd_detailed_v1.md` §6.1: passenger can download receipt
- `phase1_prd_detailed_v1.md` §9.8.3: `receipt / invoice（依營運模式）`
- `phase1_service_contracts_v1.md` §3.11: Billing & Settlement owns `passenger receipt`

Current repo truth does **not** include:

- a passenger receipt controller route
- a billing-settlement service method that issues passenger receipts
- a tenant, passenger, or ops UI flow that lets users review/download passenger receipts

This does not automatically reopen implementation scope, because the passenger-facing surface is already being handled as an explicit deferred-scope decision in the closeout track. The critical closeout rule is: final Phase 1 narrative must say passenger receipt is deferred with the passenger surface, not silently counted as completed finance scope.

### B. Driver-statement review path drifts from UAT wording

`docs/04-uat/phase1-uat-scenarios.md` `OC-017` says:

- navigate to `Drivers -> select driver -> Earnings`
- show `gross`, `service_fee`, `subsidy`, `net` per period
- remain read-only from ops

Current repo state is close but not exact:

- `apps/ops-console-web/app/drivers/page.tsx` is registry-only and has no driver-detail earnings drilldown
- `apps/ops-console-web/app/revenue/page.tsx` shows statement pulse and net totals, but not the full `gross/service_fee/subsidy/net` detail per driver in a dedicated drilldown
- `apps/platform-admin-web/app/payments/page.tsx` is the only full-detail review surface that renders statement period, fee plan, gross, service fee, subsidy, net, and payout state

Conclusion: finance/compliance reviewability exists, but the current reviewable workflow lives in platform-admin payments rather than the exact ops-console path named in `OC-017`. Final closeout should either:

1. explicitly say authoritative statement review is a finance/platform-admin workflow, or
2. treat ops-console driver-detail earnings parity as follow-up work instead of claiming the exact UAT path already exists

---

## Verification Snapshot

Focused verification run on 2026-04-20 UTC:

```bash
pnpm exec vitest run tests/unit/billing-settlement.test.ts tests/unit/reporting-filing.test.ts tests/unit/client-integration.test.ts
```

Result:

- `3` test files passed
- `31` tests passed

During verification, `tests/unit/reporting-filing.test.ts` initially exposed a regression caused by `OwnedMobilityService` assuming `OpsDispatchEventsService` was always present. The local fix made that dependency optional-safe and preserved the finance/reporting evidence run.

---

## Closeout Statement

`MSC-F1-001` is ready for review with the following audit conclusion:

> Tenant invoices, driver-statement generation, reimbursements, report jobs, and filing-package generation are implemented with backend authority and reviewable operator or tenant workflows. However, passenger receipt remains explicitly deferred with the passenger surface, and the exact ops-console driver-earnings workflow named by `OC-017` is not present as written; authoritative detailed statement review currently lives in platform-admin payments.

This means final system closeout may claim finance/reporting operational completeness only if it keeps both caveats explicit:

1. passenger receipt is deferred, not implemented
2. detailed statement review is finance/platform-admin-led unless ops-console parity is added later

---

## Reviewer Notes

Please verify:

1. the packet does not over-claim passenger receipt implementation
2. the `OC-017` workflow-drift conclusion is supported by the current ops-console and platform-admin surfaces
3. the reporting/filing `PASS` conclusion is justified by the ops reports center, tenant reports page, and focused test evidence

If accepted, approve this task back to owner for final status handling.
