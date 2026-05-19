# Governance-Aware Billing / Reporting UAT - 2026-05-19

**Task:** `FIN-GOV-UAT-001`
**Owner:** `Codex2`
**Reviewer:** `Codex`
**Date:** `2026-05-19`
**Artifact status:** `ready_for_review`
**Workflow read:** `WF-FIN-001` baseline remains `PASS (static evidence)`; `WF-FIN-GOV-001` governance enrichment is documented here but not yet promoted to a separate live pass

## 1. Purpose

This pack formalizes the UAT read for the governance-aware billing and
reporting slice requested by the Phase 1 v3 directive:

```text
booking with costCenterCode
-> quota reservation
-> approval evaluation snapshot
-> booking completed
-> invoice generated
-> report exported
-> governance fields visible
-> sensitive download/export audited
```

Per the planning decision recorded in
`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`,
the conservative model is:

- `WF-FIN-001` stays the baseline billing/reporting family.
- `WF-FIN-GOV-001` is the governance-aware enrichment dimension.
- the companion automated path is the remapped `E2E-010` governance billing
  flow from the v3 numbering recommendation, even though that shell script does
  not exist in this worktree yet.

This document therefore does two things:

1. define the UAT scenarios the governance enrichment must satisfy
2. state the current evidence read without overstating static evidence as a live
   staging promotion

## 2. Current Evidence Basis

### 2.1 Primary artifact

Primary sidecar:

- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`

That packet confirms:

- prior live baseline billing proof already exists through
  `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`
- repo-local finance smoke anchors still exist
- governance-aware API and integration seams are present
- a fresh `2026-05-19` live rerun was attempted but blocked by staging ingress
  credentials and the missing direct Cloud Run fallback

### 2.2 Supporting repo anchors

- `tests/smoke/05-billing-invoice.sh`
- `tests/smoke/06-report-export.sh`
- `tests/e2e/E2E-004-tenant-attribution.sh`
- `tests/e2e/E2E-005-tenant-governance.sh`
- `apps/api/tests/integration/tenant-governance-e2e.test.ts`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`

### 2.3 Current honest read

- Invoice generation and report export already have named baseline evidence.
- Governance-related quota, approval, and audit seams exist in API and
  integration coverage.
- The current sidecar does **not** provide a fresh staging artifact that a
  reviewer can use to read cost-center-aware invoice context, quota ledger
  visibility, partner-program aggregation, or platform-earnings aggregation as
  a live promotion.
- This pack should therefore be read as `UAT defined + static evidence mapped`,
  not as `governance billing live pass achieved`.

## 3. Scope Boundary

### In scope

- cost center attribution into invoice/reporting
- quota usage and quota-ledger visibility for governed bookings
- approval snapshot continuity into audit and downstream finance review
- partner-program reporting references when the booking family requires them
- platform-earnings separation by `platformCode`
- sensitive invoice/report export access with audit trace

### Out of scope for this artifact

- renaming the release-gate matrix row in place
- claiming a new live gate without fresh staging evidence
- partner live issuer proof outside the existing partner-gated scope
- production settlement proof beyond repo/static evidence

## 4. Governance UAT Scenario Matrix

Status vocabulary used below:

- `PASS (static evidence)` means the repo or sidecar already gives reviewable
  proof, but not a fresh live rerun
- `BLOCKED FOR LIVE` means the scenario is designed and partially anchored, but
  the current workspace cannot elevate it due to the staging gate recorded in
  `FIN-GOV-001`

| ID | Scenario | Expected outcome | Current read | Evidence anchor | Gap to close |
| --- | --- | --- | --- | --- | --- |
| `FG-01` | Enterprise booking billed with explicit cost center | Generated invoice and finance review both preserve `costCenterCode` and readable cost-center context for the governed booking chain. | `BLOCKED FOR LIVE` | `FIN-GOV-001` §2.3, §3; directive §3.7.3; baseline live chain in `FBP-014B` | Current static evidence only proves the governed booking and audit linkage; it does not attach a reviewer-readable invoice or export artifact with explicit cost-center attribution. |
| `FG-02` | Quota reservation and quota ledger continuity | Governed booking creates quota usage before billing, and reviewers can read quota summary plus ledger continuity tied to the completed booking. | `PASS (static evidence)` | `FIN-GOV-001` §2.3; `tenant-governance-e2e.test.ts`; `GET /api/tenant/quotas*` endpoints named in sidecar | Need staging readback for `GET /api/tenant/quotas`, `GET /api/tenant/cost-centers/:code/quota`, and `GET /api/tenant/quotas/ledger`. |
| `FG-03` | Approval evaluation snapshot survives to billing review | Approval request / approval-rule state remains inspectable through audit even after invoice generation succeeds. | `PASS (static evidence)` | `FIN-GOV-001` §2.3; sidecar endpoint inventory; directive workflow step `approval evaluation snapshot` | Need one reviewer-readable chain connecting governed booking, approval request, audit entries, and generated invoice/report output. |
| `FG-04` | Governance-aware report export | Exported report includes governance fields required by the directive: cost center identity, owner, approval state, and equivalent reviewer-readable finance dimensions. | `BLOCKED FOR LIVE` | directive §3.7.3-§3.7.4; `tests/smoke/06-report-export.sh`; `FIN-GOV-001` §2.2 | Current repo proves report-job creation and artifact availability, but not a captured export showing the governance columns. |
| `FG-05` | Partner-program finance reconciliation | Partner-facing finance output can aggregate or filter by `programId`, `benefitReference`, and `issuerAuthorizationRef` when the booking belongs to a partner program. | `BLOCKED FOR LIVE` | directive §3.7.4; partner reconciliation requirement in origin execution worklist §G1 | No sidecar in this task captures a governed partner booking flowing into finance output with those fields visible. |
| `FG-06` | Platform earnings separation | Driver/platform earnings can be summarized by `platformCode` for forwarded or platform-routed work without collapsing them into a generic finance total. | `BLOCKED FOR LIVE` | directive §3.7.3-§3.7.4; origin worklist §G1 | Current `FIN-GOV-001` packet does not attach a finance/report artifact demonstrating platform-level earnings separation. |
| `FG-07` | Legacy unmapped cost center labeling | A booking that cannot map to a canonical cost center is explicitly labeled as legacy or unmapped instead of silently disappearing from finance review. | `BLOCKED FOR LIVE` | directive §3.7.4 | No captured repo or sidecar artifact in this task proves the `legacy_unmapped` reviewer surface yet. |
| `FG-08` | Sensitive invoice/report download audit | Every invoice or export download remains permissioned and produces an audit trail. | `PASS (static evidence)` | `phase1-workflow-acceptance-release-gates.md` `WF-FIN-001` row; `FIN-GOV-001` §2.2-§2.3 | Need a fresh staging audit sample attached to the same governance-aware run rather than the generic baseline finance read. |
| `FG-09` | Unauthorized finance access denied | Non-finance or cross-scope users cannot download governance-sensitive finance artifacts, and the denial is auditable. | `PASS (static evidence)` | `phase1-workflow-acceptance-release-gates.md` negative-path table for `WF-FIN-001` (`NP-FIN-002` to `NP-FIN-004`) | Governance-specific denied-access evidence is not separately attached in the current sidecar. |

## 5. Acceptance Read Against The Directive

Directive acceptance target:

- tenant invoice / report includes cost-center governance fields
- platform earnings can aggregate by `platformCode`
- partner report can aggregate by `programId` / `benefitReference` /
  `issuerAuthorizationRef`
- `legacy_unmapped` cost center is explicit
- download / export is audited

Current read:

| Directive target | Current read | Reason |
| --- | --- | --- |
| Cost-center governance fields in invoice/report | `BLOCKED FOR LIVE` | Upstream governed-booking linkage is evidenced, but the sidecar explicitly says invoice-line schema no longer embeds cost-center metadata directly and no reviewer-readable invoice/report artifact is attached. |
| Platform earnings by `platformCode` | `NOT YET PROVEN` | Required by the directive, but not evidenced in the current governance sidecar. |
| Partner report by `programId` / `benefitReference` / `issuerAuthorizationRef` | `NOT YET PROVEN` | The current task has no partner-program finance output attached. |
| Explicit `legacy_unmapped` labeling | `NOT YET PROVEN` | No captured artifact in repo or sidecar demonstrates this reviewer surface. |
| Audited download/export | `PASS (static evidence)` | Baseline finance gate already requires permissioned download audit; governance sidecar confirms this remains part of the required read. |

## 6. Non-Claims

This artifact does **not** claim:

- `WF-FIN-GOV-001` has been promoted to `PASS (live staging evidence)`
- a fresh `2026-05-19` staging invoice/export packet was collected
- partner-program and platform-earnings finance dimensions are fully proven in
  a reviewer-readable artifact
- the future `E2E-010` governance billing shell exists or has passed in this
  worktree

## 7. Recommended Rerun Path

When valid staging credentials are available, the next evidence pass should
capture one named chain that includes:

1. governed booking created with `costCenterCode`
2. quota reservation / ledger readback
3. approval rule or approval request readback
4. booking completion
5. invoice generation
6. report export
7. audited download or export access

Minimum rerun command set:

```bash
./scripts/run-smoke-tests.sh --suite '05|06'
./tests/e2e/run-e2e.sh --scenario E2E-005
```

Governance API readback targets called out by `FIN-GOV-001`:

- `GET /api/tenant/quotas`
- `GET /api/tenant/cost-centers/:code/quota`
- `GET /api/tenant/quotas/ledger`
- `GET /api/tenant/approval-rules`
- `GET /api/audit`

The future automation target should be the v3-remapped governance flow:

- `tests/e2e/E2E-010-governance-billing-reporting.sh` after the numbering
  decision is materialized in code

## 8. References

- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`
- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
- `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/04-uat/phase1-uat-scenarios.md`
