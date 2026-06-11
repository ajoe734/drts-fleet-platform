# BANK-UI-BOOKING-DETAIL-20260610 Sidecar Acceptance Packet

This document is the parallel support packet for `BANK-UI-BOOKING-DETAIL-20260610` ("BANK-UI-BOOKING-DETAIL: bank-console booking detail (BK_BookingDetail)"). It does not change canonical truth. It consolidates the current repo facts, dependency constraints, and reviewer-facing acceptance gates that the sidecar reviewer (`Claude2`) and parent-task lane need before the parent task can be reviewed.

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

The dispatch script and parent acceptance text correctly cite `docs/05-ui/drts-design-canvas/bank-screens-*.jsx` as the visual authority. The important nuance is that this worktree is based on `dev`, while the authoritative bank canvas was ingested on a separate branch and is verifiable from commit `4dad0cfa`:

- `git show 4dad0cfa:docs/05-ui/drts-design-canvas/bank-screens-1.jsx | grep -n BK_BookingDetail` returns `234:function BK_BookingDetail({ theme: th }) {`.
- The same artifact exports `BK_BookingDetail` from line `308`, confirming it is part of the ingested bank canvas set.
- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §4.1 says the bank console needed a full new canvas because no corporate tenant canvas could be extended. That is a pre-ingest design handoff statement, not proof that the bank canvas still does not exist after `4dad0cfa`.

Therefore the current design-authority state is:

1. behavioural scope is anchored and reviewable from the screen-requirements doc, especially §5.2
2. realm-token/chrome constraints are anchored in the scaffold and `@drts/ui-tokens`
3. the specific `BK_BookingDetail` visual authority does exist, but reviewers working from `dev` must check out the canvas-ingest branch or use `git show 4dad0cfa:.../bank-screens-1.jsx` when validating parity

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
- [ ] Reviewer confirms the visual implementation matches `BK_BookingDetail` from `docs/05-ui/drts-design-canvas/bank-screens-1.jsx:234` at commit `4dad0cfa`, using the ingest branch or `git show` if the local `dev` worktree does not yet contain that canvas file.

### C. Verification gates

- [ ] `pnpm --filter @drts/bank-console-web typecheck`
- [ ] `pnpm --filter @drts/bank-console-web build`
- [ ] `scripts/check_ui_realm_tokens.py`
- [ ] Manual or Storybook parity check against `BK_BookingDetail` from the ingested bank canvas (`bank-screens-1.jsx:234` at `4dad0cfa`), even if validation must be done via `git show` rather than the local `dev` tree.

### D. Guardrails

- [ ] No canonical truth files are edited as part of this sidecar packet.
- [ ] Parent review should reject any implementation that silently falls back to invented styling because the reviewer failed to consult the ingested `BK_BookingDetail` canvas authority.
- [ ] Parent review should reject any implementation that adds dispatch mutation controls, unmasks cardholder/card references, or bypasses the shared translation path.

## §5 Reviewer Risk Notes

### Risk 1: visual authority is on the ingest branch, not this `dev` worktree

The review risk is not "canvas missing"; it is "reviewer checks only the `dev` worktree and misses the already-ingested authority." Review cannot honestly mark visual parity complete unless the reviewer validates against `BK_BookingDetail` at `docs/05-ui/drts-design-canvas/bank-screens-1.jsx:234` from commit `4dad0cfa`, either by checking out the ingest branch or by using `git show` directly.

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
- [x] The packet records that `BK_BookingDetail` exists in the ingested bank canvas (`bank-screens-1.jsx:234` at `4dad0cfa`) and that review on `dev` must consult that authority explicitly.
- [x] The only support artifact content for this task is this file under `support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/`.

## §7 Reviewer Handoff Notes (for `Claude2`)

1. Reconfirm the parent task still targets `BK_BookingDetail` under `apps/bank-console-web/app/bookings/[bookingId]/page.tsx` and remains owned by `Claude2` with reviewer `Codex2`.
2. Reconfirm whether `CCAT-APP-SCAFFOLD-20260610` has a canonical task record elsewhere or has already been absorbed/closed out, because this session could only verify scaffold presence from the repo tree.
3. Before approving the parent task, verify the detail route is real and not replaced by `PendingScreen`.
4. Treat `BK_BookingDetail` at `bank-screens-1.jsx:234` / `4dad0cfa` as the design authority even if the local `dev` worktree does not yet contain the bank canvas files. Do not waive parity review just because a plain filesystem scan on `dev` comes up empty.
5. Approval for this sidecar should verify that the only task-scoped content edit is `support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-ACCEPTANCE.md`, plus machine-truth state transitions recorded through `scripts/ai-status.sh`.
