# E2E-TENBIZ-012 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `E2E-TENBIZ-012` - E2E-012 tenant-business-operations  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Codex2`  
**Sidecar Owner:** `Claude2`  
**Sidecar Reviewer:** `Codex`  
**Last Revised:** `2026-06-06 (UTC)`  
**Status:** `REVIEW-STAGE SUPPORT ARTIFACT` - support-only packet for reviewer handoff; does not modify canonical truth, runtime behavior, or parent task ownership.

---

## 1. Scope Boundary

This sidecar exists because the review-stage helper task had no support artifact at its declared path when reviewed.

In scope:

- freeze the current machine-truth snapshot for `E2E-TENBIZ-012` and this sidecar
- map the declared dependency edge to `BE-TENBIZ-001`
- summarize the actual runnable surface already present for `tests/e2e/E2E-012-tenant-business-operations.sh`
- flag evidence drift that the reviewer and parent owner must read correctly

Out of scope:

- editing `ai-status.json`, parent task ownership, or canonical product truth
- changing `tests/e2e/E2E-012-tenant-business-operations.sh`
- changing API/runtime implementation in `apps/api/**` or client contracts
- claiming staging pass evidence that is not recorded in machine truth

---

## 2. Machine-Truth Snapshot

### Sidecar - `E2E-TENBIZ-012-SIDECAR-ACCEPTANCE`

- owner=`Claude2`
- reviewer=`Codex`
- status=`review`
- depends_on=`BE-TENBIZ-001`
- helper_parent=`E2E-TENBIZ-012`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/E2E-TENBIZ-012/E2E-TENBIZ-012-SIDECAR-ACCEPTANCE.md`

### Parent - `E2E-TENBIZ-012`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- depends_on=`BE-TENBIZ-001`
- artifact=`tests/e2e/E2E-012-tenant-business-operations.sh`
- acceptance=`E2E-012 passes at least in staging`
- `next` currently states:
  `Inspect tenant-business ops flow, compare existing E2E patterns, and implement the missing E2E-012 script.`

### Machine-truth drift that matters

- The parent artifact script already exists at `tests/e2e/E2E-012-tenant-business-operations.sh`, so the parent `next` note is stale relative to the repo surface.
- `scripts/ai-status.sh show BE-TENBIZ-001` currently returns `Task not found: BE-TENBIZ-001`, so the declared upstream dependency edge exists in task metadata but is not presently reviewable as a live task record from this workspace.
- This packet documents both drifts only; it does not repair machine truth.

---

## 3. Authoritative Product / Execution Anchors

These are the minimum sources the reviewer should use when judging `E2E-TENBIZ-012`:

- `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md`
  - `WF-TEN-BIZ-001` flow definition
  - tenant payable summary references
- `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md`
  - `GET /api/tenant/dashboard`
  - `GET /api/tenant/trips`
  - `GET /api/tenant/payables/summary`
  - `GET /api/tenant/payables/line-items`
  - `GET /api/tenant/service-programs[/{programId}]`
  - workflow mapping `WF-TEN-BIZ-001 -> E2E-012-tenant-business-operations.sh`
- `scripts/dispatch-phase1-svc-fleet-tenantops.py`
  - original dispatch contract for parent `E2E-TENBIZ-012`

Implementation anchors presently visible in-repo:

- `tests/e2e/E2E-012-tenant-business-operations.sh`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
- `packages/api-client/src/index.ts`

---

## 4. Dependency Map

### Formal dependency edge

| Dependency | Machine-truth status from this workspace | Why it matters |
| --- | --- | --- |
| `BE-TENBIZ-001` | `declared, but task record not currently retrievable via scripts/ai-status.sh show` | Parent E2E flow depends on tenant dashboard, orders/trips, payables, statements, invoices, and service-program surfaces promised by the backend slice. |

### Effective repo-level dependency evidence

Even though the live task record for `BE-TENBIZ-001` is not retrievable here, the repo already exposes the main HTTP surfaces that `E2E-012` expects:

| Surface | Anchor |
| --- | --- |
| `GET /tenant/dashboard` | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` |
| `GET /tenant/orders`, `GET /tenant/orders/:orderId` | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` |
| `GET /tenant/trips` | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` |
| `GET /tenant/service-programs[/:programId]` | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` |
| `GET /tenant/payables/summary`, `GET /tenant/payables/line-items` | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` |
| `GET /tenant/statements` | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` |
| `GET /tenant/invoices`, `GET /tenant/invoices/:invoiceId`, `POST /tenant/invoices/generate` | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` |

Dependency reading for reviewers:

- Treat `BE-TENBIZ-001` as logically required.
- Do not treat the missing live task record as proof the backend slice is absent.
- Do treat it as a machine-truth observability gap that should stay explicit in review notes.

---

## 5. Parent Delivery Surface Snapshot

`tests/e2e/E2E-012-tenant-business-operations.sh` is present and shell-valid (`bash -n` passes). The flow currently covers:

1. tenant actor discovery via `/tenant/users`
2. cost-center creation via `/tenant/cost-centers`
3. booking creation and read-back via `/tenant/bookings`
4. dispatch assignment via `/dispatch/tasks`, `/dispatch/assign`
5. driver lifecycle to completed via `/driver/tasks/*`
6. tenant business surfaces:
   - `/tenant/dashboard`
   - `/tenant/payables/summary`
   - `/tenant/statements`
7. invoice fallback / continuity evidence:
   - `/tenant/invoices/generate`
   - `/tenant/invoices/:invoiceId`
8. reporting chain via `/tenant/reports/jobs` and `/tenant/reports/:jobId`
9. audit read-back via `/tenant/audit`
10. stitched chain assertions for `bookingId -> orderId -> dispatchJobId -> taskId -> invoiceId -> reportJobId`

This is already more than a stub: it is a runnable E2E shell with hard-fail and probe branches.

---

## 6. Review-Critical Drift

### Drift A: parent `next` note vs actual repo surface

- Machine truth says the parent still needs the missing `E2E-012` script implemented.
- Repo reality: the script already exists and is non-empty.
- Reviewer implication: assess the quality and acceptance-readiness of the existing script, not whether the file is missing.

### Drift B: script comments vs current API surface

At the top of `tests/e2e/E2E-012-tenant-business-operations.sh`, the script says:

- tenant dashboard / payables / statements routes are not yet present
- those checks are therefore only probe-and-record gates

Repo reality now differs:

- `/tenant/dashboard` exists in `tenant-partner.controller.ts`
- `/tenant/payables/summary` and `/tenant/statements` exist in `billing-settlement.controller.ts`

Reviewer implication:

- the current script is conservative relative to repo surface
- probe-only handling may under-assert acceptance for SD §3 / §9
- this packet does not judge whether the script should be tightened; it flags the gap so the parent reviewer does not misread probe behavior as canonical truth

### Drift C: dependency visibility vs repo surface

- declared dependency `BE-TENBIZ-001` is not retrievable as a live task
- repo code and client surfaces strongly suggest substantial backend delivery already exists

Reviewer implication:

- keep this as an evidence hygiene note, not a blocker by itself

---

## 7. Acceptance Checklist

Legend:

- `[SIDEcar]` = acceptance for this helper packet
- `[PARENT]` = reviewer-facing checkpoint for the parent task

### Sidecar packet acceptance

- [x] `[SIDEcar]` Packet created only under `support/sidecars/E2E-TENBIZ-012/`
- [x] `[SIDEcar]` No canonical truth or runtime files were changed
- [x] `[SIDEcar]` Dependency map is recorded from machine truth plus repo-visible anchors
- [x] `[SIDEcar]` Reviewer-critical drift is made explicit

### Parent evidence readiness snapshot

- [x] `[PARENT]` Declared parent artifact exists at `tests/e2e/E2E-012-tenant-business-operations.sh`
- [x] `[PARENT]` Script parses under `bash -n`
- [x] `[PARENT]` Script covers tenant booking -> dispatch -> driver completion -> invoice -> report chain
- [x] `[PARENT]` Script probes tenant dashboard/payables/statements surfaces directly
- [ ] `[PARENT]` Machine truth records a staging pass for `E2E-012`
- [ ] `[PARENT]` Reviewer has explicit evidence that dashboard/payables/statements are asserted at the strictness expected by SD §9
- [ ] `[PARENT]` Live dependency record for `BE-TENBIZ-001` is reviewable from the task board

---

## 8. Reviewer Hotspots

When `Codex2` reviews the parent task, the highest-signal questions are:

1. Does the current E2E shell satisfy the SD §9 flow strongly enough, or does probe-only treatment for dashboard/payables/statements need tightening now that those routes exist?
2. Is the parent task still truly `in_progress`, or is machine truth stale and awaiting a reviewer/owner handoff refresh?
3. Does the missing live task-board record for `BE-TENBIZ-001` require separate status repair, even if repo code already contains the intended surfaces?

---

## 9. Verification Performed For This Sidecar

- `bash -n tests/e2e/E2E-012-tenant-business-operations.sh` -> PASS
- Reviewed dispatch contract in `scripts/dispatch-phase1-svc-fleet-tenantops.py`
- Reviewed repo anchors for tenant business APIs in:
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
- Queried machine-truth slices with:
  - `scripts/ai-status.sh show E2E-TENBIZ-012-SIDECAR-ACCEPTANCE`
  - `scripts/ai-status.sh show E2E-TENBIZ-012`
  - `scripts/ai-status.sh show BE-TENBIZ-001` -> `Task not found`

This sidecar does not claim a staging execution of `E2E-012`; it only prepares the acceptance packet and dependency map required by the dispatch brief.
