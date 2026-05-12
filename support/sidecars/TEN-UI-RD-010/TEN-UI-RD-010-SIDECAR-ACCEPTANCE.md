# TEN-UI-RD-010 Sidecar Acceptance Packet

This document is the parallel support packet for **TEN-UI-RD-010** (`New Booking 完整化` / `TN_NewBooking`). It records the acceptance checklist, dependency map, and contract-gap anchors that a reviewer needs in order to either (a) accept a narrowed delegate-booking shipment of the parent task or (b) confirm the parent should stay `blocked` until the missing tenant contracts are added.

It does **not** modify canonical truth. It only consolidates anchors that already exist in `ai-status.json`, `docs/05-ui/tenant-console-parity-decisions-20260510.md`, `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`, and the published tenant contracts.

## §1 Scope & Boundary

- **Task ID:** `TEN-UI-RD-010-SIDECAR-ACCEPTANCE`
- **Parent Task:** `TEN-UI-RD-010`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Claude`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** Hand the parent-task owner (`Codex2`) and parent reviewer (`Codex`) a single, citation-anchored checklist that distinguishes which acceptance gates can be satisfied today vs. which require a supervisor decision before reopening.

Guardrails for this packet:

- Add no new tenant contract claims; cite only what is already published.
- Do not edit `apps/tenant-console-web/**`, `packages/contracts/**`, `packages/api-client/**`, or any L1/L2 truth.
- All output is confined to `support/sidecars/TEN-UI-RD-010/`.

## §2 Machine-Truth Anchors (as of 2026-05-12)

### Parent Task: `TEN-UI-RD-010`

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| Title        | New Booking 完整化                                      |
| Phase        | Wave 3                                                  |
| Owner        | `Codex2`                                                |
| Reviewer     | `Codex`                                                 |
| Status       | `blocked`                                               |
| Depends on   | `TEN-UI-RD-001`                                         |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` |
| Last update  | `2026-05-10T18:26:24Z`                                  |
| Waiting for  | `Claude` (this packet)                                  |

Recorded `next` (verbatim, machine truth):

> Validated tenant new-booking contract. `CreateTenantBookingCommand` supports delegate-booking fields (`bookedBy`, `onsiteContact`, `costCenter`) but no tenant cost-center directory or approval-rule read model exists; `ProductRuleCatalog` exposes pricing authority only. Blocking before inventing TN_NewBooking rule automation or selector-driven cost-center UX.

### Sidecar Task: `TEN-UI-RD-010-SIDECAR-ACCEPTANCE`

| Field               | Value         |
| ------------------- | ------------- |
| Owner               | `Claude`      |
| Reviewer            | `Codex2`      |
| Status              | `in_progress` |
| `task_class`        | `sidecar`     |
| `mutates_canonical` | `false`       |

## §3 Dependency Map

### Upstream Dependencies

#### `TEN-UI-RD-001` — Adopt new shell + strip ad-hoc CSS

- **Status:** `done`
- **Owner:** `Claude2` • **Reviewer:** `Codex`
- **Anchor commit:** `515f271395a583fe25be16c110dbf232f4ebcf87` ("feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target")
- **Push:** `origin/feat/claude2-ui-redesign-foundation`
- **What it provides to TEN-UI-RD-010:**
  - The new tenant shell + `page-primitives` (`PageHero`, `SurfaceCard`, `CalloutPanel`) used by the existing `apps/tenant-console-web/app/bookings/new/page.tsx` placeholder.
  - The `globals.css` strip means TN_NewBooking can rely on canvas-aligned primitives instead of ad-hoc CSS classes.
  - Storybook parity target (`packages/ui-web/src/tenant-shell.stories.tsx`) is the existing artboard regression baseline; TN_NewBooking only needs to add its own story alongside.

### Transitive (informational, not blocking this sidecar)

- `DSY-UI-003` is `TEN-UI-RD-001`'s upstream; already satisfied. No further design-token gate.

### Cross-task contract gaps (block parent, not this packet)

These are **not** dependencies in the `ai-status.json` sense, but the parent's `blocked` rationale cannot clear until at least one of them is resolved at the contract layer:

- Tenant cost-center directory read model (currently absent — see §5).
- Tenant approval-rule read/evaluation model (currently absent).
- Tenant cost-center quota / remaining-usage read model.
- Tenant booking draft / save command.

The peer tasks that would produce these contracts are also blocked today:

- `TEN-UI-RD-013` (TN_CostCenter) — `blocked`, identical contract gap rationale.
- `TEN-UI-RD-014` (TN_Rules) — `blocked`, identical contract gap rationale.

Reopening `TEN-UI-RD-010` should be sequenced after either (a) those contracts land or (b) a supervisor decision narrows TEN-UI-RD-010's scope to authority-safe delegate-booking framing only.

## §4 Acceptance Checklist for Parent Task (`TEN-UI-RD-010`)

The list is split into "satisfiable today (narrowed scope)" and "requires contract / supervisor decision". Reviewer `Codex` should not accept the parent task with §4.B unchecked unless the supervisor has explicitly approved the narrowed scope in §4.A.

### A. Satisfiable today — narrowed delegate-booking scope

If the supervisor chooses option **(2)** in §6 of `docs/05-ui/tenant-console-parity-decisions-20260510.md` ("narrow the UI acceptance"), these are the gates:

- [ ] Route shell `apps/tenant-console-web/app/bookings/new/page.tsx` uses the shared `page-primitives` from `TEN-UI-RD-001` (no ad-hoc CSS classes reintroduced).
- [ ] Form binds only to fields published on `CreateTenantBookingCommand` in `packages/contracts/src/index.ts`:
  - `bookedBy`, `onsiteContact`, `costCenter` (string)
  - booking route, passenger, schedule, service-bucket fields already exposed by the command
- [ ] `costCenter` rendered as a **free-text** input (or non-authoritative typeahead with no claimed directory backing). The UI must **not** label the input as canonical authority or imply quota enforcement.
- [ ] Submit posts via the published tenant booking creation endpoint (no fabricated draft/save endpoint).
- [ ] No UI affordance for: cost-center selector backed by a directory, auto-applied approval-rule copy, quota impact card, draft-save button.
- [ ] Storybook parity story added at `packages/ui-web/src/tenant-new-booking.stories.tsx` (new file) matching the `TN_NewBooking` artboard at the narrowed-scope level.
- [ ] Standard technical gates pass:
  - [ ] `pnpm --filter @drts/tenant-console-web typecheck`
  - [ ] `pnpm --filter @drts/tenant-console-web lint`
  - [ ] `pnpm --filter @drts/tenant-console-web test`
  - [ ] `pnpm --filter @drts/tenant-console-web build`
  - [ ] `pnpm --filter @drts/ui-web exec storybook build` (regression for the new story)
- [ ] Commit subject contains `TEN-UI-RD-010`; trailers include `LLM-Agent`, `Task-ID`, `Reviewer` per `AI_COLLABORATION_GUIDE.md` §5.
- [ ] Push recorded as a normal, non-force push to `origin/feat/claude2-ui-redesign-foundation` (or current redesign branch).

### B. Requires contract decision before reopen (currently blocked)

These are gates that **cannot** be satisfied with today's contracts. Mark each one explicitly. Acceptance must not "pencil-whip" these:

- [ ] Cost-center selector backed by an authoritative tenant directory list.
- [ ] Auto-applied approval-rule preview that names the matched rule and approver(s).
- [ ] Quota / remaining-usage indicator for the selected cost center.
- [ ] Draft-save affordance that round-trips through a published draft command.

Each unchecked gate in §4.B must reference the supervisor decision (§6 of `docs/05-ui/tenant-console-parity-decisions-20260510.md`) that either added the missing contract or accepted the narrower scope.

### C. Guardrails — must all hold

- [ ] No new fields added to `packages/contracts/src/index.ts` from this task.
- [ ] No new endpoints added to `apps/api/src/modules/owned-mobility/**` or `apps/api/src/modules/tenant-partner/**` from this task.
- [ ] No inferred client-local draft semantics or fake approval gates (matches the boundary copy in the current placeholder).
- [ ] No `--no-verify`, no `--force` push, no commit amend on previously-pushed history.

## §5 Contract-Gap Evidence (anchors only, no new claims)

The parent `blocked` rationale is anchored by the following already-recorded sources. This packet adds no new contract claims; it only consolidates pointers.

- **Decision record** (canonical for this blocker):
  - `docs/05-ui/tenant-console-parity-decisions-20260510.md` → section `TEN-UI-RD-010 — TN_NewBooking contract validation`.
- **Published create-booking command (allowed scope):**
  - `packages/contracts/src/index.ts` → `CreateTenantBookingCommand`.
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`.
- **Published product-rule catalog (pricing authority only, no approval rules):**
  - `packages/contracts/src/index.ts` → `ProductRuleCatalog`.
  - `apps/api/src/modules/product-rule/product-rule.controller.ts`.
- **Design target (richer than current contract):**
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` → `TN_NewBooking`.
- **Redesign backlog instruction (block instead of invent contract):**
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`.
  - `ai-status.json` → task `TEN-UI-RD-010`.
- **Existing placeholder route** (already aligned to the new shell from `TEN-UI-RD-001`):
  - `apps/tenant-console-web/app/bookings/new/page.tsx`.

## §6 Reviewer Handoff Notes (for `Codex2`)

1. **Truth-anchor check.** Confirm that `ai-status.json` still records `TEN-UI-RD-010.status = blocked`, `depends_on = [TEN-UI-RD-001]`, and that `TEN-UI-RD-001` is `done` with commit `515f271`. If those drifted, the dependency map in §3 needs a refresh before this packet is approved.
2. **Parity-decision freshness.** Re-read `docs/05-ui/tenant-console-parity-decisions-20260510.md` § "TEN-UI-RD-010 — TN_NewBooking contract validation". If a supervisor decision has since landed (either option 1 — add contracts, or option 2 — narrow scope), call it out in the approval note so the parent owner knows which branch of §4 to execute against.
3. **Cross-task coupling.** TN_NewBooking, TN_CostCenter (`TEN-UI-RD-013`), and TN_Rules (`TEN-UI-RD-014`) all share the same contract gap. Approving a narrowed §4.A path here should not implicitly unblock those two; flag if you see scope leakage.
4. **Sidecar closure.** This is a support-only artifact. Close with `NO_COMMIT_REQUIRED=1` once approved.
5. **No canonical edits.** Verify that the only changed/added path under this task is `support/sidecars/TEN-UI-RD-010/TEN-UI-RD-010-SIDECAR-ACCEPTANCE.md`.

## §7 Open Questions / Notes

- The placeholder route already states "no fake draft semantics" as a boundary. If supervisor chooses §6 option (1) and a draft command is added, this acceptance packet's §4.B will need to be re-issued — a new sidecar revision rather than an in-place mutation is preferred.
- If the eventual narrowed-scope implementation needs a typeahead over historical free-text `costCenter` values (drawing from `OwnedOrderRecord` history rather than a directory), reviewer should call out whether that crosses into "implied authority" territory.
- The redesign branch (`feat/claude2-ui-redesign-foundation`) is currently shared across multiple Wave 3/4 tasks; the parent owner should rebase or sequence their commit so TN_NewBooking changes are isolable for review.
