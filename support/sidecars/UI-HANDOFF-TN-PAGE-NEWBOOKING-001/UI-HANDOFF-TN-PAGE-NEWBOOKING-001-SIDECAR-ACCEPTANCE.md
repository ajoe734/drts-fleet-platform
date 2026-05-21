# UI-HANDOFF-TN-PAGE-NEWBOOKING-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Task ID:** `UI-HANDOFF-TN-PAGE-NEWBOOKING-001-SIDECAR-ACCEPTANCE`
**Parent Task:** `UI-HANDOFF-TN-PAGE-NEWBOOKING-001`
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-21` (UTC)
**Scope:** support-only artifact; does not edit canonical truth, runtime
implementation, or contract truth.

This packet is the reviewer-facing acceptance companion for the tenant-console
`TN_NewBooking` handoff slice. It does not reopen or replace the already
approved tenant new-booking implementation. Instead, it packages the current
review surface, the dependency chain the reviewer should keep in mind, and the
acceptance checklist for a support-only handoff.

The sidecar is intentionally bounded to support material only:

- no L1/L2 product-truth edits
- no `ai-status.json` manual edits
- no changes to `apps/tenant-console-web` runtime source
- no contract reshaping beyond what has already shipped in the parent path

## 1. Handoff Intent

`UI-HANDOFF-TN-PAGE-NEWBOOKING-001` is a packaging / reviewer-enablement task
for the tenant new-booking page, not a new implementation lane. The underlying
runtime route and parity story already exist and were previously accepted under
the tenant redesign wave.

Reviewer goal:

1. confirm the packet points at the current, non-placeholder review surface
2. confirm dependency framing is honest and does not claim new canonical truth
3. use the checklist here to assess the parent handoff slice cleanly

## 2. Current Review Surface

The current review surface for `TN_NewBooking` is the shipped tenant-console
route and its parity story, not the old selected-shell placeholder described in
older verification packets.

| Surface | Source | Reviewer focus |
| --- | --- | --- |
| Runtime route shell | `apps/tenant-console-web/app/bookings/new/page.tsx` | Route now loads active passengers, addresses, and cost centers, renders metric cards, then mounts the real booking form. |
| Runtime form | `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx` | Verify policy preview, approval posture, quota impact, and submit guardrails stay on published tenant contracts only. |
| Story parity surface | `packages/ui-web/src/tenant-new-booking.stories.tsx` | Verify the handoff still maps to the `TN_NewBooking` canvas surface rather than an obsolete placeholder narrative. |
| Selected-shell chrome | `apps/tenant-console-web/components/tenant-shell.tsx` | Route must stay inside the selected tenant shell baseline and not diverge into a legacy portal frame. |
| Tenant navigation | `apps/tenant-console-web/lib/navigation.ts` | `/bookings/new` remains a first-class tenant navigation target. |

## 3. Machine-Truth / Historical Anchors

This sidecar does not redefine parent implementation status; it anchors on the
latest visible accepted closeout evidence already present in repo documents.

### 3.1 Shipped implementation anchor

`docs/05-ui/tenant-console-redesign-closeout-20260514.md` records
`TEN-UI-RD-010 — TN_NewBooking parity-fill` as approved and later merged to
`dev`.

Relevant anchors from that closeout:

- reviewer approval recorded on `2026-05-18T15:18:15Z`
- reviewed implementation branch noted as `origin/codex2/ten-ui-rd-010`
- merge closeout commit recorded as `12616aa` in the redesign closeout
- later machine-truth closeout notes in `ai-status.json` tie the dev merge to
  commit `7673f8a4568e6ceddeadc05ce744d389a7d05b0b`

Reviewer implication:

- this packet must not describe the page as a placeholder
- this packet must not invent a second acceptance bar that conflicts with the
  already accepted TN_NewBooking implementation
- any new issue found here is a handoff / evidence issue unless it proves a
  real regression in the shipped route

### 3.2 Sidecar lifecycle anchor

The dispatch brief for this task defines the sidecar acceptance bar as:

- `Create support artifacts only`
- `Do not edit canonical truth`
- `Hand off the packet to the assigned reviewer`

That is the full acceptance scope for this file.

## 4. Dependency Map

These are reviewer-relevant dependencies for the handoff slice. They are not a
claim that new runtime or contract work is required in this sidecar.

| Dependency | Status / source | Why it matters for review |
| --- | --- | --- |
| `UI-CANVAS-DS-001` | sidecar acceptance packet exists at `support/sidecars/UI-CANVAS-DS-001/UI-CANVAS-DS-001-SIDECAR-ACCEPTANCE.md` | TN_NewBooking reuses tenant design-system primitives and should be reviewed as a composed surface, not as ad hoc one-off UI chrome. |
| `UI-CANVAS-TN-CHROME-001` | dispatch-declared dependency; no same-id packet was found in this worktree search | Reviewer should still confirm the route sits in the tenant shell/chrome baseline rather than treating this missing sidecar lookup as permission to drift. |
| `TEN-UI-RD-001` shell baseline | documented in `docs/05-ui/tenant-console-redesign-closeout-20260514.md` | Practical shell anchor for the tenant chrome dependency: selected-shell tenant chrome and shared Storybook shell were already established here. |
| `TEN-UI-RD-010` shipped page | redesign closeout + `ai-status.json` | The handoff packet must reflect the actual shipped page and its guardrails. |
| Published tenant booking contracts | runtime imports and shipped form logic | Review must remain contract-safe: no local draft-save system, no tenant-side fare authority, no hidden approval override. |

### Dependency gap note

I could not locate a task/artifact with the exact id `UI-CANVAS-TN-CHROME-001`
from this worktree via repo search. For this packet, the nearest concrete
review anchor is the shipped tenant shell baseline (`TEN-UI-RD-001`) and the
current tenant-shell runtime/story usage. That ambiguity should be treated as a
traceability note, not silently papered over.

## 5. Parent Behavior Review Notes

The live `TN_NewBooking` route now does the following:

- loads active tenant passengers, addresses, and cost centers before render
- keeps booking-on-behalf flow explicit via selected passenger + `bookedBy`
  metadata
- previews quota impact and approval evaluation from route-local policy preview
  endpoints
- submits through the tenant booking command path rather than inventing local
  persistence
- keeps estimated spend preview-only instead of treating it as tenant-owned
  fare authority

Reviewer should pay attention to these guardrails already visible in the route
copy and form logic:

- no fake draft-save workflow
- no tenant-side `quotedFare` authority
- blocked approval decisions prevent submit
- approval-required decisions allow submit but keep backend-owned approval state
- passenger / address / cost-center inputs are directory-backed, not invented

## 6. Reviewer Checklist

Use this checklist when reviewing the parent handoff slice.

1. Verify support-only scope.
   - Only `support/sidecars/UI-HANDOFF-TN-PAGE-NEWBOOKING-001/` should be
     touched by this sidecar task.
   - No canonical truth or runtime source should be altered by the packet.

2. Verify the packet points to the current route/story pair.
   - Runtime surface is `apps/tenant-console-web/app/bookings/new/page.tsx`
     plus `tenant-booking-create-form.tsx`.
   - Story surface is `packages/ui-web/src/tenant-new-booking.stories.tsx`.
   - Packet must not repeat the obsolete placeholder framing from older tenant
     verification documents.

3. Verify tenant chrome / shell framing.
   - `/bookings/new` still renders inside the selected tenant shell.
   - Navigation and story shell still treat this as the tenant new-booking
     route.

4. Verify contract-safe behavior claims.
   - Packet must not imply local fare-authority submission, draft persistence,
     or approval override semantics.
   - Packet should reflect quota-preview / approval-evaluation behavior as
     preview + backend-owned decisioning.

5. Verify dependency framing honesty.
   - `UI-CANVAS-DS-001` should be treated as a real support dependency.
   - Missing exact lookup for `UI-CANVAS-TN-CHROME-001` should remain called
     out as a traceability note, not hidden.

6. Verify reviewer handoff readiness.
   - Packet should give Codex enough context to review without reopening
     canonical truth.
   - If a real regression is discovered, it should be routed as a parent-task
     or new-task issue, not patched inside this sidecar.

## 7. Expected Reviewer Conclusion Shape

If accepted, the reviewer approval note should say that:

- the packet remains support-only
- the dependency map is honest about the design-system and tenant-shell anchors
- the packet points to the current shipped TN_NewBooking route/story surface
- no canonical truth or runtime implementation was modified by the sidecar

If rejected, the reopen note should identify one of these classes:

- packet still describes obsolete placeholder behavior
- dependency framing overclaims missing or unpublished truth
- packet scope leaked into runtime / canonical changes
- reviewer cannot trace the tenant chrome dependency clearly enough

## 8. Delivery Summary

This sidecar packet contributes exactly one support artifact:

- `support/sidecars/UI-HANDOFF-TN-PAGE-NEWBOOKING-001/UI-HANDOFF-TN-PAGE-NEWBOOKING-001-SIDECAR-ACCEPTANCE.md`

It is ready to hand off to `Codex` for review as a support-only acceptance
packet.
