# Governance-Aware Billing / Reporting Spec

Status: draft formal spec for `FIN-GOV-SPEC-001`  
Date: 2026-05-19  
Scope: `WF-FIN-001` billing/reporting baseline plus the governance enrichment intended for `WF-FIN-GOV-001`

## Purpose

This document formalizes the finance-side governance chain that starts at tenant
booking and must remain reviewable through invoice generation, report export,
settlement breakdown, and sensitive artifact download audit.

The design target comes from the v3 directive workflow:

```text
booking with costCenterCode
→ quota reservation
→ approval evaluation snapshot
→ booking completed
→ invoice generated
→ report exported
→ costCenterCode / costCenterName / owner / approvalState included
→ partner program / eligibility reference included if partner booking
→ driver platform earnings included if forwarded / platform task
→ sensitive download audited
```

The directive also sets the acceptance bar:

- tenant invoice / report includes cost-center governance fields
- tenant invoice / report exposes `approvalState` and quota-impact readback
- platform earnings can be aggregated by `platformCode`
- partner reporting can be aggregated by `programId`,
  `benefitReference`, and `issuerAuthorizationRef`
- legacy unmapped cost centers are explicit
- download / export actions are audited

## Source Anchors

Primary sources for this spec:

1. `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
   §3.7
2. `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
   §4.1 `BE-CC-001-FU-BILLING`
3. `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
4. `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`
   (`use cost-center code in billing / reporting exports`)

Supporting runtime anchors:

- `packages/contracts/src/index.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`
- `apps/api/src/modules/platform-earnings/platform-earnings.service.ts`

## Position In The Workflow Matrix

`WF-FIN-001` already covers the baseline billing/reporting pipe and remains the
correct baseline gate for invoice generation, report jobs, and permissioned
artifact access. This spec defines the governance enrichment layer that the v3
directive names `WF-FIN-GOV-001`.

That means this document does not replace the existing finance baseline. It
formalizes the additional fields, audit requirements, and evidence language
needed when finance outputs must prove:

- tenant cost-center attribution
- quota and approval continuity
- partner-program attribution
- platform-source earnings attribution
- sensitive export governance

## Baseline Reality As Of 2026-05-19

The repo already contains the main governance upstream facts:

- `TenantCostCenterCoverageReport` exists in `packages/contracts/src/index.ts`
  and is served by `GET /api/tenant/cost-centers/coverage`
- tenant governance surfaces exist for quota summary, quota ledger, and
  approval-rule management, matching the evidence pack inventory
- `InvoiceLineRecord` and `PartnerRevenueSummaryRowRecord` already define
  finance-facing fields for cost-center, partner, and masked eligibility data

However, the runtime is only partially enriched today:

- `billing-settlement.service.ts` currently generates invoice lines with partner
  metadata but does not populate cost-center enrichment fields
- `reporting-filing.service.ts` emits partner revenue rows with
  `costCenterName: null`, `ownerUserId: null`, `activeFlag: null`, and
  `legacy_unmapped: false`
- `InvoiceLineRecord` and `PartnerRevenueSummaryRowRecord` do not yet expose
  explicit `approvalState` or quota-impact output fields even though the
  upstream governance snapshot already carries those facts
- `apps/api/tests/integration/tenant-governance-e2e.test.ts` explicitly records
  the current baseline that invoice lines do not yet carry cost-center / owner
  metadata, and that governance continuity is still proven mainly by upstream
  approval and audit artifacts

This spec therefore defines the required target behavior and the acceptable
evidence wording for the current partial state.

## Required Governance Chain

### 1. Booking And Governance Snapshot

At booking creation or update time, the tenant governance layer remains the
source of truth for:

- canonical `costCenter`
- quota preview / reservation outcome
- approval evaluation result and resulting `approvalState`
- partner-program context such as `partnerProgramId`,
  `eligibilityVerificationId`, `benefitReference`, and
  `issuerAuthorizationRef`

Finance outputs must consume these persisted facts. They must not recompute
tenant approval policy or eligibility decisions during invoice/report creation.

### 2. Cost-Center Coverage And Legacy Backfill

`BE-CC-001-FU-BILLING` defines two required finance-side behaviors:

1. a tenant coverage report that lists resolved, unresolved, and disabled
   cost-center hits without rewriting legacy bookings
2. export-time enrichment that resolves the canonical directory record from
   `BookingRecord.costCenter`

The coverage report is already formalized by
`TenantCostCenterCoverageReport` and `summarizeCostCenterCoverage(...)`. Its
purpose is migration visibility, not silent mutation.

Required export semantics:

- if the stored code resolves to an active directory record, include
  `costCenterCode`, `costCenterName`, `ownerUserId`, and `activeFlag`
- if the stored value maps to a disabled directory record, preserve the raw
  code and mark the row as unresolved with `activeFlag=false`
- if the stored value does not resolve, preserve the raw text and set
  `legacy_unmapped=true`

### 3. Invoice Enrichment

Tenant invoice lines are the tenant-facing finance artifact. For governed
business-dispatch bookings, each `InvoiceLineRecord` should carry:

- `costCenterCode`
- `costCenterName`
- `ownerUserId`
- explicit `approvalState`
- `activeFlag`
- `legacy_unmapped`
- `partnerId`, `partnerProgramId`, `partnerEntrySlug`
- `eligibilityVerificationId`
- `issuerAuthorizationRef`
- `benefitReference`

In addition to line-level fields, the invoice artifact or adjacent invoice
governance summary must expose the booking's quota result in a reviewer-readable
form. The preferred representation is the persisted
`TenantBookingQuotaImpactResult[]` (or a lossless projection of it) rather than
an inferred free-text note.

Masking rule:

- invoice exports may keep internal join references only if the export audience
  is authorized and the artifact is protected by the controlled-download path
- any reviewer-facing or broader reporting surface must apply the same masked
  export rule already used in reporting (`prefix...suffix` form)

### 4. Reporting Enrichment

Governance-aware reporting must support at least three finance views.

Tenant revenue / billing view:

- cost-center attribution by code, name, owner, active/disabled state
- explicit `approvalState` column or equivalent structured field for the billed
  booking
- explicit quota-impact readback sourced from the persisted
  `TenantBookingQuotaImpactResult[]` snapshot
- explicit unresolved legacy mapping flag

Partner-program view:

- `partnerId`
- `partnerProgramId`
- `partnerEntrySlug`
- `eligibilityVerificationId`
- masked `issuerAuthorizationRef`
- masked `benefitReference`

Platform-source settlement view:

- aggregation by `platformCode`
- driver/platform earnings readback aligned to the multi-platform earnings
  service
- explicit distinction between local full-service ledger paths and
  `shadow_only` forwarded settlement paths when the order source is external

### 5. Sensitive Artifact Governance

The directive requires audited download / export. For this workflow, that
applies to:

- tenant invoice artifact downloads
- report artifact downloads
- filing package downloads when finance data is packaged downstream

The required control model is:

- artifact URLs are time-bounded controlled downloads
- every artifact retains immutable signing / manifest metadata
- download or export creation emits audit entries with enough metadata to prove
  who generated or retrieved the sensitive artifact
- masked identifiers are used on broad reporting surfaces even when unmasked
  canonical values remain internal join keys

## Field Expectations By Output

| Output | Required governance fields | Notes |
| --- | --- | --- |
| Tenant invoice line | `costCenterCode`, `costCenterName`, `ownerUserId`, `approvalState`, `activeFlag`, `legacy_unmapped`, partner references when applicable | Current code only guarantees partner references; cost-center enrichment and explicit `approvalState` remain required follow-up |
| Tenant invoice governance summary | `quotaImpacts` from persisted `TenantBookingQuotaImpactResult[]` (or a lossless structured projection), plus any invoice-level approval/audit correlation keys | The directive requires quota-impact readback; this may live beside line items if repeating per line is not practical |
| Partner revenue summary row | invoice fields above plus masked `issuerAuthorizationRef` and masked `benefitReference` | `reporting-filing.service.ts` already masks partner references but still leaves cost-center enrichment null and does not expose explicit `approvalState` |
| Platform earnings summary | `platformCode` aggregation, driver/platform earnings totals, forwarded-vs-owned context | Reuse the existing platform earnings service rather than duplicating platform classification in finance code |
| Cost-center coverage report | `totalBookings`, `resolvedCount`, `unresolvedCount`, `disabledHits`, `unresolvedSamples[]` | Migration and cleanup visibility, not a settlement artifact |

## Evidence Language And Gate Discipline

The current sidecar evidence supports only a conservative read:

- `PASS (static evidence)` for invoice generation, report job creation, and
  permissioned artifact access
- not yet `PASS (live staging evidence)` for the governance-enriched finance
  slice

This wording must remain conservative because the 2026-05-19 staging rerun was
blocked by:

1. IAP / OIDC token minting failure in non-interactive `gcloud`
2. unusable direct Cloud Run fallback for the historical staging origin

Accordingly:

- do not describe `WF-FIN-GOV-001` as live-proven
- do describe the repo state as contract-complete in important seams but only
  partially runtime-enriched
- use the sidecar plus integration tests as the reviewable static baseline

## Implementation Requirements For The Matrix Row

The `WF-FIN-GOV-001` row content should require all of the following:

1. cost-center directory resolution is visible in billing and reporting outputs
2. unresolved / disabled cost centers are explicit rather than silently dropped
3. `approvalState` is an explicit finance output field rather than a fact that
   can only be inferred from upstream approval artifacts
4. quota impacts are visible in invoice/report outputs via persisted
   `TenantBookingQuotaImpactResult[]` data or a lossless structured projection
5. quota / approval continuity is reviewable from booking governance artifacts
   into finance artifacts
6. partner-program references remain available and masked appropriately on
   export surfaces
7. platform earnings can be grouped by `platformCode` for forwarded /
   multi-platform flows
8. invoice/report download actions remain auditable and time-bounded

## Open Gaps

As of this spec date, the remaining substantive gaps are:

1. invoice generation does not yet populate cost-center enrichment fields even
   though the contract allows them
2. partner revenue summary rows still default cost-center enrichment to null
3. `approvalState` is still mostly indirect via upstream audit / approval
   records rather than an explicit invoice/report output field
4. quota impacts are persisted upstream but not yet surfaced as a formal
   invoice/report output block
5. no fresh live staging evidence currently proves the fully enriched
   governance-aware finance chain end to end

Those gaps are consistent with the v2 status-truth note that `FIN-GOV-001`
remains a backlog/static-evidence pack rather than a live gate upgrade.
