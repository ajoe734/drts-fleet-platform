# E2E-TENBIZ-012 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `E2E-TENBIZ-012-UNBLOCK-PLANNING-DECISION`  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Primary Upstream Dependency:** `BE-TENBIZ-001`  
**Last Revised:** `2026-06-06T08:09Z (UTC)`  
**Scope:** support-only artifact; no canonical truth or runtime implementation changes.

---

## 1) Scope Boundary

本 sidecar 只整理 `E2E-TENBIZ-012-UNBLOCK-PLANNING-DECISION` 的 acceptance framing、dependency map、repo baseline、reviewer hotspots 與 handoff 指引。

- In scope: SD workflow gate anchor, current E2E shell behavior, upstream dependency mapping, runnable-vs-probe split, reviewer checklist, machine-truth handoff wording.
- Out of scope: 不修改 `tests/e2e/E2E-012-tenant-business-operations.sh`、不修改 `BE-TENBIZ-001`、不修改 canonical product truth、不中途把 parent 任務描述成已完成。

---

## 2) Shared Truth Snapshot

- Sidecar task `E2E-TENBIZ-012-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE` was dispatched to `Codex` with reviewer `Codex2`.
- Formal upstream dependency is `BE-TENBIZ-001`.
- Required artifact path is `support/sidecars/E2E-TENBIZ-012-UNBLOCK-PLANNING-DECISION/E2E-TENBIZ-012-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.md`.
- Dispatch registration ties `E2E-TENBIZ-012` to `tests/e2e/E2E-012-tenant-business-operations.sh` and acceptance text `E2E-012 passes at least in staging`.
- SD §9 defines workflow family `WF-TEN-BIZ-001` with the target chain:
  `tenant login -> create booking -> trip completed -> dashboard counts -> payable summary -> statement -> report export includes order/user/cost center/service product`.

---

## 3) Repo Baseline Anchors

### 3.1 Dispatch / Planning Anchors

- `scripts/dispatch-phase1-svc-fleet-tenantops.py:219-224`
  - registers `E2E-TENBIZ-012`
  - owner `Codex`, reviewer `Codex2`
  - hard dependency `BE-TENBIZ-001`
  - artifact `tests/e2e/E2E-012-tenant-business-operations.sh`
- `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md:656-676`
  - maps `WF-TEN-BIZ-001` to `E2E-012-tenant-business-operations.sh`
  - states the required end-to-end chain for tenant business operations

### 3.2 Runnable E2E Shell Baseline

- `tests/e2e/E2E-012-tenant-business-operations.sh`
  - sets `SCENARIO="E2E-012"` and records chain evidence
  - hard-fails on booking/order binding loss, dispatch assignment failure, driver completion failure, invoice generation failure, or report-job queue/completion failure
  - probes `GET /tenant/dashboard`, `GET /tenant/payables/summary`, and `GET /tenant/statements`
  - requires report filters for `tenantId`, `orderId`, `userId`, `costCenterCode`, `serviceProduct`
  - records optional row-level export fields `orderId`, `userId`, `costCenterCode`, `serviceProduct`
  - ends with an explicit warning that invoice/report-job evidence currently acts as the runnable fallback
  - still carries stale header/warning text claiming dashboard/payables/statements routes are absent, so reviewers should trust the executable probe behavior plus current controller surface over that prose

### 3.3 Current API Surface Relevant To E2E-012

- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:137-151`
  - exposes `GET /tenant/dashboard`
- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:98-138`
  - exposes `GET /tenant/payables/summary`
  - exposes `GET /tenant/statements`
  - exposes `POST /tenant/invoices/generate`
- `apps/api/tests/unit/tenant-partner.service.test.ts:1964-2055`
  - covers tenant business dashboard summary and tenant order/service-program views in unit scope

### 3.4 Practical Interpretation

目前 repo baseline 不是「完全缺 tenant business surfaces」，而是：

- dashboard/payables/statements routes exist in code,
- E2E shell still treats those surfaces as probes rather than hard gates,
- shell comments still describe those routes as not-yet-present, so the packet must separate stale script prose from current controller reality,
- invoice generation plus report-job completion are the current mandatory runnable evidence for the workflow chain,
- export row schema for all SD columns is still tolerated as partial via `record_optional_report_field`.

這代表 parent planning decision 的 acceptance 必須清楚區分：

- what is already runnable and should hard-fail today,
- what is visible in API surface but not yet required as a strict pass gate,
- what still depends on `BE-TENBIZ-001` tightening the shell or backend behavior.

---

## 4) Acceptance Checklist For The Parent Planning Decision

以下 checklist 不創造新產品語意，只把既有 dispatch/SD/repo baseline 轉成 reviewer-facing acceptance framing。

### AC-1 — Support packet stays sidecar-only

- [ ] only support artifact work is captured in this sidecar
- [ ] no canonical L1/L2 truth is edited
- [ ] no runtime/API/test implementation is claimed as part of this sidecar closeout

### AC-2 — Upstream dependency is explicit and preserved

- [ ] `BE-TENBIZ-001` is called out as the formal upstream dependency
- [ ] the packet does not imply `E2E-TENBIZ-012` can be marked done before `BE-TENBIZ-001` satisfies the flow
- [ ] the packet identifies which acceptance points are blocked or softened by current upstream state

### AC-3 — Workflow gate is mapped to SD truth

- [ ] the packet cites `WF-TEN-BIZ-001`
- [ ] the packet restates the SD §9 chain: login, booking, trip completion, dashboard, payables, statements, export fields
- [ ] the packet distinguishes SD target behavior from current shell/runtime fallback behavior

### AC-4 — Runnable baseline is accurately represented

- [ ] hard-fail steps in `tests/e2e/E2E-012-tenant-business-operations.sh` are listed correctly:
  - booking/order binding
  - dispatch assignment
  - driver task completion
  - invoice generation containing completed order evidence
  - report job queue/completion and filter preservation
- [ ] probe-only steps are listed correctly:
  - `/tenant/dashboard`
  - `/tenant/payables/summary`
  - `/tenant/statements`
  - row-level export field presence
- [ ] the packet does not incorrectly state that these routes are absent from the repo

### AC-5 — API surface and evidence gaps are separated

- [ ] the packet notes `GET /tenant/dashboard` exists in `tenant-partner.controller.ts`
- [ ] the packet notes `GET /tenant/payables/summary` and `GET /tenant/statements` exist in `billing-settlement.controller.ts`
- [ ] the packet explains why route existence alone is not sufficient acceptance evidence for the E2E workflow
- [ ] the packet keeps invoice/report-job continuity as the current hard runnable fallback

### AC-6 — Reviewer can decide without reopening canonical planning

- [ ] the packet gives `Codex2` enough evidence anchors to review without reading large machine-truth files wholesale
- [ ] the packet provides a handoff note and suggested approval framing
- [ ] the packet leaves parent implementation decisions to the parent owner

---

## 5) Dependency Map

### Formal Upstream Dependency

| Task | Type | Why It Matters |
| --- | --- | --- |
| `BE-TENBIZ-001` | hard upstream | provides the tenant-business backend/BFF behavior that `E2E-TENBIZ-012` is meant to validate end-to-end |

### Parent Runtime / Evidence Dependencies

| Dependency | Type | Why It Matters |
| --- | --- | --- |
| `tests/e2e/E2E-012-tenant-business-operations.sh` | execution artifact | captures the current runnable chain, probes, and evidence log semantics |
| `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` | API surface | provides `/tenant/dashboard` endpoint presence anchor |
| `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` | API surface | provides `/tenant/payables/summary`, `/tenant/statements`, and tenant invoice endpoints |
| `apps/api/tests/unit/tenant-partner.service.test.ts` | baseline evidence | shows tenant business dashboard/order/service-program logic exists in unit scope |
| `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` | canonical planning anchor | defines `WF-TEN-BIZ-001` and the target E2E chain |
| `scripts/dispatch-phase1-svc-fleet-tenantops.py` | machine registration anchor | records the dependency, owner/reviewer, artifact, and target acceptance wording |

### Downstream Interpretation

`E2E-TENBIZ-012-UNBLOCK-PLANNING-DECISION` should be considered ready to review once the acceptance packet makes these boundaries explicit:

- `BE-TENBIZ-001` remains the implementation dependency.
- The shell already proves a substantial tenant booking -> dispatch -> driver completion -> invoice -> report chain.
- Dashboard/payables/statements and row-level export columns must be reviewed as surfaced-but-not-yet-strict portions unless new evidence says otherwise.

---

## 6) Reviewer Hotspots (`Codex2`)

Prioritize these checks:

1. Confirm the packet stays support-only and does not mutate canonical truth or runtime files.
2. Confirm the packet does not collapse `BE-TENBIZ-001` into a vague dependency; it must stay explicit.
3. Confirm the SD target chain is preserved exactly enough for review without inventing new gates.
4. Confirm the packet accurately reflects the shell split between hard-fail and probe behavior.
5. Confirm the packet corrects the tempting but inaccurate conclusion that dashboard/payables/statements are missing from the repo entirely.
6. Confirm the packet frames invoice generation and report-job continuity as the current runnable fallback evidence, not as the final product truth.

---

## 7) Suggested Review / Approval Language

Suggested approval note:

> `E2E-TENBIZ-012 acceptance packet is ready for handoff: it keeps BE-TENBIZ-001 explicit as the hard upstream dependency, maps WF-TEN-BIZ-001 to the current E2E shell, separates hard-fail chain evidence from probe-only tenant-business surfaces, anchors dashboard/payables/statements to real controller routes, and stays within support-only sidecar scope without modifying canonical truth.`

If rejecting/reopening, the likely failure modes are:

- packet claims routes are absent when they exist,
- packet overstates current E2E strictness,
- packet understates `BE-TENBIZ-001`,
- packet drifts into implementation instructions that belong to the parent owner.

---

## 8) Handoff Note

This packet is complete as a support artifact and ready for `Codex2` review. It does not mark the parent task done, and it does not assert staging execution success. Its job is to make the planning-decision acceptance boundary reviewable, with dependency and evidence anchors compact enough for sidecar review.
