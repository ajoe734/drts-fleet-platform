# BANK-UI-BOOKING-DETAIL-20260610 Sidecar Acceptance Packet

This document is the parallel support packet for `BANK-UI-BOOKING-DETAIL-20260610` ("BANK-UI-BOOKING-DETAIL: bank-console booking detail (BK_BookingDetail)"). It does not change canonical truth. It consolidates the current repo facts, dependency constraints, and reviewer-facing acceptance gates that the assigned reviewer (`Codex2`) and parent-task owner (`Claude2`) need before the parent task can be reviewed.

Anchors used here come from:

- `scripts/ai-status.sh show BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-ACCEPTANCE`
- `scripts/ai-status.sh show BANK-UI-BOOKING-DETAIL-20260610`
- `scripts/dispatch-bank-console-screens-20260610.sh`
- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`
- `apps/bank-console-web/app/layout.tsx`
- `apps/bank-console-web/components/bank-shell.tsx`
- `apps/bank-console-web/app/bookings/page.tsx`
- `apps/bank-console-web/components/pending-screen.tsx`
- `apps/bank-console-web/lib/navigation.ts`
- `packages/ui-tokens/src/realms.ts`

## §1 Scope & Boundary

- **Task ID:** `BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-ACCEPTANCE`
- **Parent Task:** `BANK-UI-BOOKING-DETAIL-20260610`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Mutates Canonical:** `false`
- **Objective:** Hand off a reviewer-facing acceptance checklist, dependency map, and repo-baseline notes for the bank-console booking-detail slice without editing runtime code, canonical product truth, or the parent backlog item.

Guardrails for this packet:

- Do not alter `BANK-UI-BOOKING-DETAIL-20260610` scope beyond the machine-truth acceptance and the dispatch brief.
- Do not claim implementation is present where the scaffold still shows placeholders or missing routes.
- Keep this sidecar output confined to `support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/`.

## §2 Machine-Truth Anchors

### Parent Task: `BANK-UI-BOOKING-DETAIL-20260610`

| Field | Value |
| --- | --- |
| Title | `BANK-UI-BOOKING-DETAIL: bank-console booking detail (BK_BookingDetail)` |
| Phase | `bank-console-screens-202606` |
| Owner | `Claude2` |
| Reviewer | `Codex2` |
| Status | `in_progress` |
| Depends on | `CCAT-APP-SCAFFOLD-20260610` |
| Artifact target | `apps/bank-console-web/app/bookings/[bookingId]/page.tsx`, `apps/api/src/modules/tenant-partner` |
| Acceptance in machine truth | `dispatch timeline + airport block + benefit block + quota impact rendered`; `read-only access-gated cross-link to ops detail`; `no dispatch mutation from this surface`; `screen matches its BK_* function in docs/05-ui/drts-design-canvas/bank-screens-*.jsx`; `all cardholder and card references masked`; `zh-TW primary via central t() no inline locale ternaries`; `issuer brand (navy+gold) sourced from a @drts/ui-tokens token set not raw hex so scripts/check_ui_realm_tokens.py passes`; `pnpm --filter @drts/bank-console-web typecheck and build pass` |
| Last update | `2026-06-11T11:12:52Z` |

### Sidecar Task: `BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status | `in_progress` |
| `task_class` | `sidecar` |
| `helper_kind` | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Artifact | `support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-ACCEPTANCE.md` |

### Functional brief anchor

`docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §5.2 defines the booking-detail scope directly:

- purpose: read-only fulfilment view of one ride
- must surface: dispatch lifecycle timeline, airport block, benefit block, read-only cross-link to ops detail
- no dispatch mutation from the bank surface

That aligns with the dispatch script entry for `BANK-UI-BOOKING-DETAIL-20260610`.

## §3 Dependency Map

### Direct dependency: `CCAT-APP-SCAFFOLD-20260610`

This dependency is declared by both the parent machine-truth task and `scripts/dispatch-bank-console-screens-20260610.sh`. The repo slice available in this worktree shows the scaffold is present at least at the app-shell level:

- `apps/bank-console-web/app/layout.tsx` exists and wraps the app with `BankShell`.
- `apps/bank-console-web/components/bank-shell.tsx` exists and fixes the shell to the `tenant` realm chrome via `buildCanvasTheme({ surface: "tenant", dark: true, density: "compact" })`.
- `apps/bank-console-web/lib/navigation.ts` exists and defines the bank-console route family for `/`, `/bookings`, `/contracts`, `/statements`, `/programs`, `/users`, `/audit`.
- `apps/bank-console-web/components/pending-screen.tsx` exists and explicitly states that routes without delivered design should remain honest placeholders instead of invented final UI.

Machine-truth lookup for `CCAT-APP-SCAFFOLD-20260610` did not return a task record in this worktree session, so this packet treats the dependency state as:

- declared in dispatch and parent task metadata
- partially evidenced by repo presence of `apps/bank-console-web`
- not independently machine-verified here because no task slice was available via `scripts/ai-status.sh show CCAT-APP-SCAFFOLD-20260610`

Reviewer should recheck that dependency status before treating the parent task as unblocked by state alone.

### Current repo baseline for the parent task

The scaffold baseline is real, but the booking-detail route is not yet present in this worktree:

- `apps/bank-console-web/app/bookings/page.tsx` exists and already implements the bookings list slice.
- `apps/bank-console-web/app/bookings/[bookingId]/page.tsx` does **not** exist yet.
- `find apps/bank-console-web/app/bookings -maxdepth 3 -type f` currently returns only `apps/bank-console-web/app/bookings/page.tsx`.

This means the sidecar packet should be read as a review-prep artifact, not as proof that `BK_BookingDetail` has landed.

### Design-authority caveat

The dispatch script and parent acceptance text both cite `docs/05-ui/drts-design-canvas/bank-screens-*.jsx` as the visual authority. In the current repo snapshot, those files are absent:

- `docs/05-ui/drts-design-canvas/` contains the established canvases for ops / platform / tenant / partner / driver, but no `bank-screens-1.jsx`, `bank-screens-2.jsx`, or `bank-screens-3.jsx`.
- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §4.1 simultaneously says the entire `bank-console-web` app needs a new design canvas because there is no existing corporate tenant canvas to extend.

Therefore the current design-authority state is:

1. behavioural scope is anchored and reviewable from the screen-requirements doc
2. realm-token/chrome constraints are anchored in the scaffold and `@drts/ui-tokens`
3. the specific `bank-screens-*.jsx` acceptance anchor named in machine truth is not yet present in this repo snapshot and should be treated as an open dependency/risk during review

## §4 Parent-Task Acceptance Checklist (`BANK-UI-BOOKING-DETAIL-20260610`)

These are the reviewer-facing gates for the parent task, derived from the parent machine-truth record, the dispatch script, and the screen-requirements brief.

### A. Scope gates

- [ ] Deliver `apps/bank-console-web/app/bookings/[bookingId]/page.tsx` as the bank-console booking-detail route.
- [ ] Render the dispatch lifecycle timeline with the milestones required by the task brief: created, approved if applicable, assigned, en route, completed or cancelled.
- [ ] Render the airport block with flight number, terminal, and direction.
- [ ] Render the benefit block with program, masked benefit reference, masked issuer authorisation reference, and quota impact for the trip.
- [ ] Provide a read-only deep-link to ops dispatch detail that is access-gated; forbidden states must not expose a misleading active control.
- [ ] Keep the entire surface read-only from the bank side; no dispatch mutation action may be added here.

### B. Design and content gates

- [ ] All cardholder and card references remain masked.
- [ ] zh-TW remains primary through the shared `t()` translation path; no inline locale ternaries.
- [ ] App chrome continues to use the `tenant` realm token surface from `@drts/ui-tokens`; issuer identity may appear as data/branding, not as a hardcoded replacement palette.
- [ ] Any issuer navy/gold accent introduced inside the page is sourced from the shared token/brand layer rather than raw hex values.
- [ ] Reviewer confirms the visual implementation matches the intended `BK_BookingDetail` canvas once the missing `bank-screens-*.jsx` source is available, or records the absence explicitly if review happens before that canvas lands.

### C. Verification gates

- [ ] `pnpm --filter @drts/bank-console-web typecheck`
- [ ] `pnpm --filter @drts/bank-console-web build`
- [ ] `scripts/check_ui_realm_tokens.py`
- [ ] Manual or Storybook parity check against the final bank booking-detail canvas anchor once the `bank-screens-*.jsx` files exist.

### D. Guardrails

- [ ] No canonical truth files are edited as part of this sidecar packet.
- [ ] Parent review should reject any implementation that silently falls back to invented styling because the named bank canvas files are missing.
- [ ] Parent review should reject any implementation that adds dispatch mutation controls, unmasks cardholder/card references, or bypasses the shared translation path.

## §5 Reviewer Risk Notes

### Risk 1: visual authority path mismatch

The named `docs/05-ui/drts-design-canvas/bank-screens-*.jsx` files are absent in this repo snapshot, even though they are referenced by machine truth and the dispatch script. Review cannot honestly mark visual parity complete unless:

- those files land before parent review, or
- the reviewer records that visual parity is blocked on the missing canvas artifact

### Risk 2: scaffold dependency is implied, not independently resolved here

`CCAT-APP-SCAFFOLD-20260610` is the declared blocker, but it was not retrievable as a standalone machine-truth task slice in this session. The repo suggests the scaffold has materially landed, yet the reviewer should verify that the dependency gate is really satisfied in canonical status before approving downstream completion claims.

### Risk 3: route inventory currently stops at list view

The current route family shows `/bookings` but not `/bookings/[bookingId]`. If the parent task claims completion without adding the concrete detail route, that is a straightforward regression against scope.

## §6 Packet Completeness Check

- [x] The packet is anchored to machine-truth slices for the sidecar task and parent task.
- [x] The packet records the direct dependency `CCAT-APP-SCAFFOLD-20260610` and the limitation that its task slice was not retrievable here.
- [x] The packet records the actual scaffold baseline under `apps/bank-console-web/`.
- [x] The packet explicitly records that `/bookings/[bookingId]` is not present in the current worktree baseline.
- [x] The packet ties functional scope to `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §5.2.
- [x] The packet records the design-authority mismatch around the absent `bank-screens-*.jsx` files.
- [x] The only support artifact content for this task is this file under `support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/`.

## §7 Reviewer Handoff Notes (for `Claude2`)

1. Reconfirm the parent task still targets `BK_BookingDetail` under `apps/bank-console-web/app/bookings/[bookingId]/page.tsx` and remains owned by `Claude2` with reviewer `Codex2`.
2. Reconfirm whether `CCAT-APP-SCAFFOLD-20260610` has a canonical task record elsewhere or has already been absorbed/closed out, because this session could only verify scaffold presence from the repo tree.
3. Before approving the parent task, verify the detail route is real and not replaced by `PendingScreen`.
4. Treat the missing `bank-screens-*.jsx` files as a concrete review caveat. If the parent task reaches review before those canvas files land, record the visual-parity limitation explicitly instead of silently waiving it.
5. Approval for this sidecar should verify that the only task-scoped content edit is `support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-ACCEPTANCE.md`, plus machine-truth state transitions recorded through `scripts/ai-status.sh`.
