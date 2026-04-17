# FBP-011 Review Packet & Evidence Summary

**Sidecar Task:** `FBP-011-SIDECAR-REVIEW`  
**Parent Task:** `FBP-011`  
**Helper Kind:** `review_packet`  
**Prepared by:** Codex  
**Assigned Reviewer:** Copilot  
**Parent Reviewer:** Qwen  
**Date:** 2026-04-15 (UTC)  
**Status:** IN PROGRESS - ready to hand off for review

---

## 1. Purpose

This sidecar is a support-only reviewer packet for the parent finance-compliance completion task
`FBP-011`.

Its job is to preserve the current machine-truth trail, summarize the review-ready claim already
submitted by the parent owner, and give the assigned sidecar reviewer a clean path-scoped evidence
map.

This document does **not** modify canonical truth, runtime behavior, contracts, registry state, or
governance state.

---

## 2. Shared-Truth Baseline

The shared coordination files establish the following baseline:

- `ai-status.json` records parent task `FBP-011` as `review`, owner `Codex`, reviewer `Qwen`,
  `depends_on=[]`, with these three acceptance bullets:
  - `tenant billing、driver fee、reimbursement、invoice / statement / filing flows 對齊 blueprint breadth`
  - `financial truth 與 artifact lifecycle 維持後端 authority，不出現前端自算真值`
  - `reporting / filing output 與 operator surfaces 能正確對接`
- `current-work.md` mirrors that `FBP-011` is still in `review` and that `FBP-012` and `FBP-013`
  are downstream tasks that explicitly depend on it.
- `ai-activity-log.jsonl` preserves the parent review chain:
  - `2026-04-15T19:28:45Z`: Codex handed `FBP-011` to Copilot with the review-ready claim and
    validation commands
  - `2026-04-15T19:28:54Z`: the parent review was auto-reassigned from `Copilot` to `Qwen`
    because Copilot's `--model claude` path was unavailable
- The owner handoff message states that `FBP-011` is review-ready because it added:
  - reimbursement approve/pay plus statement list/lookup filters in
    `billing-settlement`
  - filing-package list support in `reporting-filing`
  - shared API-client coverage for fee plans, reimbursements, and filing packages
  - platform-admin pricing/payments finance surfaces
  - ops-console reports support for filing package generation/history
- The same handoff message also records the validation set:
  - `pnpm --filter @drts/contracts build`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api-client typecheck`
  - `pnpm --filter @drts/platform-admin-web typecheck`
  - `pnpm --filter @drts/ops-console-web typecheck`
  - `pnpm exec vitest run tests/unit/billing-settlement.test.ts tests/unit/reporting-filing.test.ts tests/unit/client-integration.test.ts`
  - `pnpm --filter @drts/api lint`
  - `pnpm --filter @drts/platform-admin-web lint`
  - `pnpm --filter @drts/ops-console-web lint`

Important reviewer notes:

- The parent task is **not** `review_approved` or `done`.
- The parent task row does **not** currently carry `commit_hash` / `commit_subject`, and there is
  no `FBP-011` entry in the completion-evidence table yet.
- This packet therefore treats the current review target as a **review-ready working-tree slice**
  rather than a finalized machine-recorded commit.

---

## 3. Review Scope and Evidence Shape

### 3.1 Path-Scoped Working-Tree Review

At packet creation time, `git rev-parse --short HEAD` returns `71d9fa8`, which is the recorded
`FBP-009` closeout commit. `FBP-011` has not yet been captured as a separate completion commit in
machine truth.

For reviewer purposes, the relevant current diff is the path-scoped overlay on top of `71d9fa8`
restricted to the finance / filing slice.

`git diff --name-only -- ...` on the parent-task paths returns exactly 11 relevant files:

- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
- `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`
- `apps/ops-console-web/app/reports/page.tsx`
- `apps/platform-admin-web/app/payments/page.tsx`
- `apps/platform-admin-web/app/pricing/page.tsx`
- `packages/api-client/src/index.ts`
- `tests/unit/billing-settlement.test.ts`
- `tests/unit/client-integration.test.ts`
- `tests/unit/reporting-filing.test.ts`

`git diff --stat -- ...` over those same paths reports:

- 11 files changed
- 1953 insertions
- 354 deletions

### 3.2 Dirty-Worktree Guardrail

The repo-wide worktree contains unrelated changes outside `FBP-011`. Review should therefore stay
path-scoped to the 11 files above plus the owner handoff message and validation commands already
recorded in shared truth.

This packet intentionally does **not** treat unrelated dirty files as part of the parent review.

---

## 4. Implementation Evidence Snapshot

### 4.1 Billing / Statement / Reimbursement Authority

`apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` now exposes the key
finance command/query surface the parent handoff claimed:

- `GET /tenant/billing/profile`, `POST /tenant/billing/profile`,
  `POST /tenant/invoices/generate`, `GET /tenant/invoices`, and
  `GET /tenant/invoices/:invoiceId` at lines 29-77
- `GET /driver-fee-plans` and `POST /driver-fee-plans/publish` at lines 79-94
- `POST /driver-statements/generate`, filtered `GET /driver-statements`, and
  `GET /driver-statements/:statementId` at lines 96-131
- filtered `GET /reimbursements`, `POST /reimbursements/:batchId/approve`,
  `POST /reimbursements/:batchId/pay`, and `GET /reimbursements/:batchId`
  at lines 133-194

`apps/api/src/modules/billing-settlement/billing-settlement.service.ts` provides the reviewable
server-authority behavior behind those routes:

- `listDriverStatements(periodMonth?)` filters server-side by period at lines 666-673
- `listReimbursementBatches(filters)` filters by status, month, driver, and statement at
  lines 692-710
- `approveReimbursementBatch(...)` validates statement identity, persists the approved batch, and
  writes `approve_reimbursement_batch` audit/notification evidence at lines 712-768
- `markReimbursementPaid(...)` rejects unpaid/unapproved transitions, requires
  `remittanceProofId`, updates the related statement payout status, persists both records, and
  writes `mark_reimbursement_paid` audit evidence at lines 770-867

This directly supports the parent claim that finance truth remains authoritative on the backend,
not in the browser.

### 4.2 Reporting / Filing Authority

`apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` now exposes:

- shared plus tenant-prefixed report job create/list/get routes at lines 17-71
- filing-package generate/list/get routes at lines 73-99

`apps/api/src/modules/reporting-filing/reporting-filing.service.ts` shows:

- `listReportJobs()` and `getReportJob()` as authoritative read surfaces at lines 189-196
- `generateFilingPackage(...)` creating a queued package, writing audit metadata, and then
  completing the package at lines 198-242
- `listFilingPackages()` as an explicit list surface at lines 249-253

This matches the owner handoff claim that filing-package list support now exists as a first-class
operator surface.

### 4.3 Shared API-Client Coverage

`packages/api-client/src/index.ts` now includes the typed finance / filing methods the handoff
referenced:

- `listDriverFeePlans` and `publishDriverFeePlan` at lines 612-618
- `generateDriverStatements`, `listDriverStatements`, and `getDriverStatement`
  at lines 620-636
- `listReimbursementBatches`, `approveReimbursementBatch`, and `markReimbursementPaid`
  at lines 639-673
- `createReportJob`, `listReportJobs`, `createTenantReportJob`, `listTenantReportJobs`,
  `generateFilingPackage`, and `listFilingPackages` at lines 714-748

This is the typed client parity bridge between the backend authority and the two operator UIs.

### 4.4 Platform-Admin Finance Surface

`apps/platform-admin-web/app/payments/page.tsx` is now an authoritative finance console rather
than a placeholder:

- it loads invoices, driver statements, and reimbursement batches from the API client at
  lines 88-106
- it triggers invoice generation at lines 112-128
- it triggers driver statement generation at lines 130-144
- it triggers reimbursement approve/pay actions at lines 146-182
- it renders invoice artifact links at lines 420-449
- it renders driver statement payout status at lines 470-517
- it renders reimbursement workflow, remittance proof, and action buttons at lines 528-620

The page copy explicitly states that invoice generation stays server-side and that amounts are not
calculated in the browser (lines 283-287).

### 4.5 Platform-Admin Pricing / Settlement Surface

`apps/platform-admin-web/app/pricing/page.tsx` now separates draft pricing templates from
authoritative settlement fee-plan publication:

- it loads both pricing rules and driver fee plans at lines 65-80
- it creates draft platform pricing rules at lines 94-115
- it publishes platform pricing rules at lines 117-130
- it publishes driver fee plans through the billing-settlement service at lines 132-153
- the UI copy at lines 362-367 explicitly states that settlement fee plans are immutable after
  publication and are consumed directly by statements and reimbursements
- published immutable fee-plan records are rendered at lines 443-500

This is the finance-compliance bridge between commercial draft planning and authoritative driver
settlement truth.

### 4.6 Ops Reporting / Filing Surface

`apps/ops-console-web/app/reports/page.tsx` now provides the operator-facing reporting / filing
surface the handoff described:

- it loads report jobs and filing packages together at lines 74-90
- it creates report jobs through `client.createReportJob(...)` at lines 92-112
- it generates immutable filing packages through `client.generateFilingPackage(...)` at
  lines 114-131
- it advertises the page as "Create report jobs and immutable filing packages from the
  authoritative reporting service" at lines 142-147
- it renders report-job artifact download history at lines 309-377
- it renders immutable filing-package history, manifest hash, and ZIP/PDF artifact links at
  lines 380-467

This matches the owner claim that the ops reports surface can now generate filing packages and
review history.

### 4.7 Test Evidence

The unit/integration evidence aligns with the owner's review handoff:

- `tests/unit/billing-settlement.test.ts`
  - immutable fee-plan publication and statement generation for SC-031 at lines 57-122
  - reimbursement generation without moving finance truth into the UI for SC-032 at
    lines 124-159
  - reimbursement approve/pay lifecycle with payout-status propagation and audit events at
    lines 161-216
- `tests/unit/reporting-filing.test.ts`
  - immutable filing package with manifest/hash/download metadata for SC-033 at lines 34-87
  - dispatch recording index export with explicit missing-recording flags for SC-034 at
    lines 89-180
- `tests/unit/client-integration.test.ts`
  - list-envelope coverage for `/api/reports/jobs`, `/api/driver-statements`,
    `/api/driver-fee-plans`, `/api/reimbursements`, and `/api/filing-packages`
    at lines 257-280
  - canonical reimbursement list/approve/pay routes at lines 309-368

---

## 5. Parent Acceptance Criteria Evaluation

Using only shared machine truth plus the current path-scoped implementation evidence:

| Parent AC                                                                                              | Review posture       | Evidence                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tenant billing、driver fee、reimbursement、invoice / statement / filing flows 對齊 blueprint breadth` | `REVIEW_READY_CLAIM` | billing-settlement controller/service routes, pricing/payments platform-admin surfaces, ops reports filing surface, billing/reporting/client tests                 |
| `financial truth 與 artifact lifecycle 維持後端 authority，不出現前端自算真值`                         | `REVIEW_READY_CLAIM` | server-side generate/list/approve/pay logic in billing-settlement, reporting-filing package generation, payments page copy stating no browser-side settlement math |
| `reporting / filing output 與 operator surfaces 能正確對接`                                            | `REVIEW_READY_CLAIM` | API-client report/filing methods, tenant/shared report routes, ops reports page, filing/history rendering, report/filing tests                                     |

Important:

- These are **review-ready claims**, not sidecar-issued approvals.
- Only the parent reviewer `Qwen` can approve `FBP-011` itself.

---

## 6. Reviewer-Facing Findings

No new blocking issue was found while assembling this sidecar packet.

The key review nuance to preserve is:

- `FBP-011` is currently in `review` without a machine-recorded completion commit.
- The evidence shape is therefore: shared-truth review handoff + path-scoped working-tree diff +
  the validation commands already recorded in the handoff.
- If the parent review passes, the owner will still need to create a real commit before the parent
  task can legally move from `review_approved` to `done`, because the status script requires
  `COMMIT_HASH` for canonical tasks.

This is not a blocker for the sidecar packet. It is simply a review/closeout constraint that
should remain explicit.

---

## 7. Reviewer Checklist For Copilot

Copilot should validate:

1. This packet remains support-only and does not alter canonical truth or runtime code.
2. The parent-task baseline is faithfully reconstructed from `ai-status.json`,
   `current-work.md`, and `ai-activity-log.jsonl`.
3. The packet clearly states that `FBP-011` is being reviewed as a path-scoped working-tree slice,
   not a machine-recorded completion commit.
4. The 11-file evidence map accurately matches the current finance / filing review scope.
5. The implementation evidence actually supports the owner handoff claims around:
   reimbursement approve/pay, statement filters, filing-package listing, typed client coverage,
   platform-admin pricing/payments surfaces, and ops reports filing history.
6. The packet preserves the distinction between:
   - sidecar review support
   - parent review authority (`Qwen`)
   - later canonical closeout obligations (`COMMIT_HASH` before `done`)

If those checks pass, Copilot can approve this sidecar and return it to Codex for
`NO_COMMIT_REQUIRED=1` closeout.

---

## 8. Handoff Commands

**Owner (Codex) -> Reviewer (Copilot)**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-011-SIDECAR-REVIEW Copilot "FBP-011 review packet ready in support/sidecars/FBP-011/FBP-011-SIDECAR-REVIEW.md. It preserves the parent review-stage machine truth, records the working-tree evidence shape over 11 finance/filing files, and summarizes billing-settlement, reporting-filing, platform-admin pricing/payments, ops reports, and typed client/test coverage without mutating canonical truth."
```

---

## 9. Reviewer Actions

**Reviewer (Copilot) -> review_approved**

```bash
AI_NAME=Copilot python3 scripts/ai_status.py approve FBP-011-SIDECAR-REVIEW "FBP-011 review packet ready: parent review-stage machine truth is preserved, the 11-file working-tree evidence map is accurate, and finance-compliance review anchors are correctly packaged as support-only material."
```

**Reviewer (Copilot) -> reopen**

```bash
AI_NAME=Copilot python3 scripts/ai_status.py reopen FBP-011-SIDECAR-REVIEW "packet needs revision: [specify machine-truth mismatch / working-tree evidence error / reviewer-target mismatch / scope violation]"
```

---

## 10. Owner Closeout Steps

After sidecar review approval, the owner can close the sidecar without a commit:

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done FBP-011-SIDECAR-REVIEW "Owner finalized approved sidecar; FBP-011 review packet and evidence summary are ready in support/sidecars/FBP-011/ for the parent reviewer and downstream finance-compliance closeout."
```

---

## 11. Notes For Parent Owner / Parent Reviewer

1. This sidecar packet is not the `FBP-011` review verdict. It is only a reviewer aid.
2. `Qwen` remains the formal reviewer for the parent task.
3. Because `FBP-011` is still missing machine-tracked completion metadata, parent closeout should
   record a real commit before attempting `done`.
4. If the parent review finds a functional gap, reopen the parent task directly. Do not patch the
   sidecar to hide a parent implementation issue.

---

## 12. Change Log

- 2026-04-15 - Codex created the initial `FBP-011` review packet from shared machine truth, the
  recorded parent review handoff, and the current 11-file finance/filing working-tree evidence
  slice.
