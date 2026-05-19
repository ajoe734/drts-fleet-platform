# Governance-Aware Billing / Reporting UAT — 2026-05-19

- **Task:** `FIN-GOV-UAT-001`
- **Owner:** `Codex`
- **Reviewer:** `Codex2`
- **Workflow family:** `WF-FIN-GOV-001`
- **Depends on:** `WF-FIN-001`, `WF-TGV-001`
- **Companion automation:** `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` (named by the v3 numbering decision in `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` and carried into `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`, not present in this worktree yet)
- **Primary evidence pack:** `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
- **Artifact status:** `provisional`
- **Overall read:** `governance-aware finance UAT is defined; current proof remains mostly static evidence plus an older baseline live finance chain`

This document defines the UAT scenarios for the governance enrichment row
`WF-FIN-GOV-001`. It does not replace baseline finance semantics from
`WF-FIN-001`, and it does not supersede the forthcoming architecture spec at
`docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`.
Its purpose is to map reviewer-usable UAT scenarios to the evidence that exists
today, while clearly marking the scenarios that are still blocked or not yet
proven.

## 1. Scope and authority

Per `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` and
`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`:

- `WF-FIN-001` remains the baseline billing / invoice / report-export row.
- `WF-FIN-GOV-001` is a separate governance-aware enrichment row.
- `WF-FIN-GOV-001` depends on `WF-TGV-001` for cost-center / quota / approval
  semantics and on `WF-FIN-001` for the billing / reporting carrier path.
- The intended automated path is `E2E-010`, not the already-shipped `E2E-009`.

The required governance-aware finance behaviors from the directive and
resolution are:

- `costCenterCode` appears in billing / reporting outputs
- `costCenterName` / `ownerUserId` / `activeFlag` enrichment is reviewable
- `legacy_unmapped` is explicit when directory enrichment is unavailable
- quota usage and approval-request continuity remain traceable into finance
- partner-program / eligibility references remain visible when applicable
- sensitive export / download access is permissioned and audited

Status legend used below:

- `PASS (static evidence)` = repo-local code/tests/docs prove the scenario shape
- `PARTIAL STATIC EVIDENCE` = part of the scenario is proven, but key reviewer
  evidence is still missing
- `NOT VERIFIED` = current repo evidence does not support the claim yet
- `BLOCKED` = environment / credential gating prevents fresh live confirmation

## 2. Scenario matrix

| ID | Scenario | Current read | Evidence anchors | Gap to close |
| --- | --- | --- | --- | --- |
| `FG-01` | Governed booking reserves quota and opens approval before dispatch | `PASS (static evidence)` | `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`; `apps/api/tests/integration/tenant-governance-e2e.test.ts` | Fresh staging readback of quota summary / quota ledger tied to the same booking |
| `FG-02` | Approved governed booking completes and still generates a tenant invoice | `PASS (static evidence)` | `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`; `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`; `tests/smoke/05-billing-invoice.sh`; `apps/api/tests/integration/tenant-governance-e2e.test.ts` | Fresh governed staging rerun after valid IAP token / ingress access |
| `FG-03` | Revenue-summary export preserves governance keys and masked partner references | `PASS (static evidence)` | `tests/smoke/06-report-export.sh`; `apps/api/tests/unit/reporting-filing.service.test.ts`; `packages/contracts/src/index.ts` | Reviewer-readable staging export artifact for the governed scenario |
| `FG-04` | Finance exports show `costCenterName` / `ownerUserId` enrichment and `legacy_unmapped` behavior | `NOT VERIFIED` | `packages/contracts/src/index.ts`; `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`; `apps/api/tests/integration/tenant-governance-e2e.test.ts` | Positive evidence that enrichment fields are populated and unmapped rows are flagged |
| `FG-05` | Sensitive report / filing download is tenant-scoped and audited | `PASS (static evidence)` | `apps/api/tests/unit/reporting-filing.service.test.ts`; `apps/api/src/modules/reporting-filing/reporting-filing.service.ts` | Optional staging download capture under tenant scope |
| `FG-06` | Platform / forwarder finance context stays separated from tenant-enterprise finance | `PARTIAL STATIC EVIDENCE` | `apps/api/tests/unit/billing-settlement.service.test.ts`; `packages/contracts/src/index.ts` | Reviewer-readable finance artifact showing `platformCode` or `forwarded_shadow` context in the governance flow |
| `FG-07` | Fresh live governance-aware billing/reporting rerun on staging | `BLOCKED` | `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` | Valid IAP/OIDC token minting and a reachable staging ingress |

## 3. Detailed scenarios

### `FG-01` Governed booking reserves quota and opens approval before dispatch

**Preconditions**

- Tenant has a cost-center directory entry, quota policy, and approval rule.
- Booking is created with a governance-relevant `costCenterCode`.

**Steps**

1. Create a tenant booking under governance rules.
2. Read back the booking approval state.
3. Read the matching approval request.
4. Read quota summary and quota ledger for the same booking.
5. Attempt dispatch before approval.

**Expected**

- Booking enters `approvalState = pending`.
- Approval request is created and remains pending until an approver acts.
- Quota ledger records a reserve entry for the booking.
- Quota summary shows pending reserved usage.
- Dispatch is blocked while approval is pending.

**Current evidence**

- `apps/api/tests/integration/tenant-governance-e2e.test.ts` proves the
  approval-request creation, quota reserve entry, and dispatch block.
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` lists the tenant
  governance endpoints that should be used for a live follow-up:
  `GET /api/tenant/quotas`, `GET /api/tenant/cost-centers/:code/quota`,
  `GET /api/tenant/quotas/ledger`, `GET /api/tenant/approval-rules`, `GET /api/audit`.

### `FG-02` Approved governed booking completes and still generates a tenant invoice

**Preconditions**

- `FG-01` reached a pending approval request.
- A finance approver is available.

**Steps**

1. Approve the pending request.
2. Dispatch, assign, accept, start, and complete the task.
3. Generate a tenant invoice for the closed billing period.
4. Open the invoice artifact or response detail.

**Expected**

- Approval state moves to `approved`.
- Completion succeeds after approval.
- Invoice generation succeeds for the governed booking.
- Audit includes invoice-generation evidence.

**Current evidence**

- `apps/api/tests/integration/tenant-governance-e2e.test.ts` proves that a
  governed booking can complete and later generate a tenant invoice.
- `tests/smoke/05-billing-invoice.sh` remains the named baseline invoice probe.
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` proves an earlier
  live `booking -> dispatch -> driver -> billing/audit` chain on staging.
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` records that the
  2026-05-19 governed rerun was blocked before a fresh live artifact could be captured.

**Important limitation**

The current integration test only proves invoice generation continuity. It does
not prove that the invoice line itself already carries reviewer-readable
`costCenterName` / owner enrichment.

### `FG-03` Revenue-summary export preserves governance keys and masked partner references

**Preconditions**

- A completed booking exists for the `credit_card_airport_transfer` path.
- The booking carries partner-program and eligibility context.

**Steps**

1. Create a `revenue_summary` report job.
2. Open the report detail or artifact.
3. Review the exported partner revenue rows.

**Expected**

- Revenue rows include `costCenterCode`.
- Rows preserve `partnerProgramId`, `partnerEntrySlug`, and
  `eligibilityVerificationId`.
- `issuerAuthorizationRef` and `benefitReference` are masked rather than raw.

**Current evidence**

- `apps/api/tests/unit/reporting-filing.service.test.ts` proves masked
  `issuerAuthorizationRef` / `benefitReference` on revenue-summary output.
- `packages/contracts/src/index.ts` defines the export shape for
  `PartnerRevenueSummaryRowRecord`, including governance-related fields.
- `tests/smoke/06-report-export.sh` remains the named baseline report-export
  probe, but it does not itself prove the governance-specific row content.

### `FG-04` Finance exports show enrichment and `legacy_unmapped` behavior

**Preconditions**

- One governed booking resolves to an active directory entry.
- A second governed booking uses a legacy or unmapped cost-center value.

**Steps**

1. Generate the relevant tenant invoice and partner revenue export.
2. Inspect whether enriched governance fields are populated.
3. Inspect whether the unmapped row is explicitly flagged.

**Expected**

- Resolved rows expose `costCenterCode`, `costCenterName`, `ownerUserId`, and
  `activeFlag`.
- Unmapped rows preserve the raw cost-center reference and set
  `legacy_unmapped = true`.

**Current evidence**

- `packages/contracts/src/index.ts` allows these fields on invoice and report
  row types.
- Current repo-local evidence does **not** prove the positive behavior yet:
  - `apps/api/tests/integration/tenant-governance-e2e.test.ts` explicitly says
    invoice lines no longer carry cost-center / owner metadata directly.
  - `apps/api/src/modules/reporting-filing/reporting-filing.service.ts` still
    seeds `costCenterName`, `ownerUserId`, and `activeFlag` as `null`, and
    `legacy_unmapped` as `false` in its current revenue-summary rows.

**UAT interpretation**

Treat this as a required scenario with a current evidence gap, not as a passed
claim.

### `FG-05` Sensitive report / filing download is tenant-scoped and audited

**Preconditions**

- A report job or filing package exists for a tenant-scoped actor.
- A second actor from a different tenant is available for the negative path.

**Steps**

1. Open the report detail as the owning tenant.
2. Attempt to open the same report as a different tenant.
3. Issue a filing package download and inspect audit traces.

**Expected**

- Same-tenant access succeeds.
- Cross-tenant access is forbidden.
- Report download issuance writes an audit record.
- Filing package download issuance writes an audit record.

**Current evidence**

- `apps/api/tests/unit/reporting-filing.service.test.ts` proves:
  - tenant-scoped report access
  - `REPORT_JOB_TENANT_SCOPE_FORBIDDEN` on cross-tenant access
  - audit actions `issue_report_artifact_download` and
    `issue_filing_package_download`
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts` is the
  current implementation anchor for those audit actions.

### `FG-06` Platform / forwarder finance context stays separated from tenant-enterprise finance

**Preconditions**

- Finance output includes both owned and forwarded-order lanes.

**Steps**

1. Review settlement-matrix output for owned, partner, phone, and forwarded channels.
2. Review finance queue or reconciliation output for a forwarded mismatch case.
3. Confirm that tenant-enterprise and external-platform responsibilities remain distinct.

**Expected**

- `tenant_enterprise` remains a platform-finance-owned invoice path.
- `partner_airport` retains partner reimbursement context.
- `forwarded_shadow` retains external-platform payout / shadow-ledger semantics.
- Forwarder reconciliation evidence exposes `platformCode` and shadow-finance context.

**Current evidence**

- `apps/api/tests/unit/billing-settlement.service.test.ts` proves channel-aware
  settlement rows and forwarded reconciliation issue shape.
- `packages/contracts/src/index.ts` exposes the corresponding settlement and
  reconciliation record types.

**Limitation**

Current evidence is still repo-local. This is not yet a reviewer-readable live
finance export proving governance-aware `platformCode` aggregation end to end.

### `FG-07` Fresh live governance-aware rerun on staging

**Preconditions**

- Valid staging IAP/OIDC token minting is available.
- The protected staging ingress is reachable with that token.

**Steps**

1. Re-run `tests/smoke/05-billing-invoice.sh`.
2. Re-run `tests/smoke/06-report-export.sh`.
3. Probe governance endpoints for quota, cost-center quota, quota ledger,
   approval rules, and audit.
4. Capture one reviewer-readable chain tying cost center, quota usage, approval
   audit, and invoice/report output to the same booking.

**Expected**

- Fresh staging artifacts confirm the governance-aware finance chain.
- The rerun can be cited to upgrade the governance slice beyond static evidence.

**Current blocker**

`support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` records the
2026-05-19 rerun failure:

- protected staging host redirected to Google IAP with `Invalid IAP credentials: empty token`
- local `gcloud` token helper failed non-interactively due reauthentication
- historical direct Cloud Run fallback returned `404`

## 4. Reviewer checklist

Approve this UAT document only if all of the following are true:

- It clearly separates `WF-FIN-001` baseline scope from `WF-FIN-GOV-001`
  enrichment scope.
- It uses `E2E-010` naming, not the older conflicting `E2E-009` reference.
- It cites `FIN-GOV-001` as the primary evidence pack and does not over-claim a
  fresh live pass.
- It explicitly marks enrichment / `legacy_unmapped` behavior as not yet proven
  in current repo evidence.
- It preserves tenant-scoped audit requirements for report and filing downloads.

## 5. Follow-up needed to convert this pack to a stronger pass

1. Land or expose the named `E2E-010-governance-aware-billing-reporting.sh`
   automation path.
2. Capture a fresh staging rerun with valid IAP credentials.
3. Produce reviewer-readable finance artifacts showing:
   - populated `costCenterName` / `ownerUserId` enrichment
   - explicit `legacy_unmapped` behavior
   - quota / approval continuity tied to the same invoice or report export
   - governance-aware partner / platform finance outputs where applicable
