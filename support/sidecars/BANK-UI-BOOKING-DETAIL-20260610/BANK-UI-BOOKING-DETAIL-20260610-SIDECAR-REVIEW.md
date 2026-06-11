# BANK-UI-BOOKING-DETAIL-20260610 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `BANK-UI-BOOKING-DETAIL-20260610` - bank-console booking detail (`BK_BookingDetail`)
**Parent Owner:** `Codex`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Claude2`
**Generated:** `2026-06-11` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent implementation branch.

This packet exists only to support reviewer handoff for
`BANK-UI-BOOKING-DETAIL-20260610`. The parent implementation remains the authority for
the booking-detail screen itself; this sidecar captures the machine-truth snapshot,
the cited implementation evidence, and the reviewer checks that were used to approve
the parent task before its owner closeout.

---

## 1. Scope Boundary

In scope:

- restate the sidecar and parent machine-truth anchors that matter for review
- summarize how parent acceptance maps to the implemented booking-detail surface
- record the implementation evidence pulled from parent closeout note and commit
  `76210f6a8e26fb0e128318444d6a828c5e581e7b`
- give `Claude2` a concrete reviewer checklist for the parent task and this support
  artifact

Out of scope:

- editing `apps/bank-console-web/**`, `packages/ui-tokens`, design canvas files, or any
  other parent runtime artifact
- changing L1/L2 product truth, task acceptance, or machine-truth lifecycle outside the
  normal `handoff` flow for this sidecar
- re-implementing or re-designing `BK_BookingDetail`

---

## 2. Machine-Truth Anchors

### Sidecar task - `BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-REVIEW`

Stable fields from `ai-status.json`:

- owner=`Codex`
- reviewer=`Claude2`
- status at packet start=`in_progress`
- depends_on=`CCAT-APP-SCAFFOLD-20260610`
- helper_parent=`BANK-UI-BOOKING-DETAIL-20260610`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-REVIEW.md`

Acceptance recorded for the sidecar:

- create support artifacts only
- do not edit canonical truth
- hand off the packet to the assigned reviewer

### Parent task - `BANK-UI-BOOKING-DETAIL-20260610`

Current machine-truth snapshot:

- owner=`Codex`
- reviewer=`Claude2`
- status=`done`
- depends_on=`CCAT-APP-SCAFFOLD-20260610`
- artifacts:
  - `apps/bank-console-web/app/bookings/[bookingId]/page.tsx`
  - `apps/api/src/modules/tenant-partner`
  - `docs/05-ui/drts-design-canvas/bank-screens-1.jsx`
  - `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`
  - `docs/05-ui/drts-design-canvas/bank-screens-3.jsx`
  - `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`
- parent `next` note now records owner closeout after review approval, with:
  - reviewed implementation preserved at evidence commit
    `76210f6a8e26fb0e128318444d6a828c5e581e7b`
  - metadata closeout commit=`38aeafc8e4a7ccc00ce259af7d3339249afc5e48`
  - push target=`origin/dev`
  - integration_status=`merged_to_dev`
  - verification passed:
    - `pnpm --filter @drts/bank-console-web typecheck`
    - `pnpm --filter @drts/bank-console-web build`

Implication:

- the parent task is already finalized independently of this sidecar
- this sidecar does not reopen or redefine the parent lifecycle; it only makes the
  review evidence durable and easier to audit than the single-line `next` field

---

## 3. Acceptance Mapping

Parent acceptance requires:

1. dispatch timeline + airport block + benefit block + quota impact rendered
2. read-only access-gated cross-link to ops detail
3. no dispatch mutation from this surface
4. screen matches `bank-screens` / screen-requirements intent
5. all cardholder and card references masked
6. zh-TW primary via central `t()` with no inline locale ternaries
7. issuer brand sourced from `@drts/ui-tokens`, not raw ad hoc palette
8. `pnpm --filter @drts/bank-console-web typecheck` and `build` pass

Evidence summary against that bar:

- timeline rendering is implemented in the parent page with the five-step strip and event
  feed (`created -> approved -> assigned -> en route -> completed/cancelled`)
- airport block is present with direction, flight, terminal, tolerance, pickup, dropoff,
  window, and greeting fields
- benefit block is present with program, masked benefit ref, masked issuer auth ref, and
  quota impact banner
- ops deep-link is explicitly state-gated via `allowed | forbidden | unavailable | stale`
- the page includes a read-only callout and exposes no mutate controls
- list/detail data fixtures mask cardholder, benefit, auth, driver, and vehicle
  references in `lib/bookings.ts`
- copy is routed through `t()` keys in `lib/translations.ts`
- parent implementation imports `BRAND_TEMPLATES` / `REALM_COLORS` from
  `@drts/ui-tokens`
- parent status note records both required bank-console verification commands as passing

---

## 4. Implementation Evidence

Primary implementation evidence comes from parent commit
`76210f6a8e26fb0e128318444d6a828c5e581e7b`
(`BANK-UI-BOOKING-DETAIL-20260610: implement booking detail screen`).

### A. Files changed in the parent commit

- `apps/bank-console-web/app/bookings/[bookingId]/page.tsx`
- `apps/bank-console-web/app/bookings/page.tsx`
- `apps/bank-console-web/app/globals.css`
- `apps/bank-console-web/lib/bookings.ts`
- `apps/bank-console-web/lib/translations.ts`

### B. Spot-check anchors from that commit

`apps/bank-console-web/app/bookings/[bookingId]/page.tsx`

- imports `BRAND_TEMPLATES` and `REALM_COLORS` from `@drts/ui-tokens`
- resolves booking via `getBookingDetail(bookingId)` and `notFound()` on miss
- maps ops-link states with explicit copy for `allowed`, `forbidden`, `unavailable`,
  and `stale`
- renders:
  - read-only bank-side callout
  - access-gated ops dispatch deep-link card
  - warning callouts for unavailable/stale ops link and driver-eligibility notice
  - dispatch timeline section
  - airport block section
  - booking header section
  - benefit/quota block section
  - masked fulfilment section
  - read-only constraints section

`apps/bank-console-web/lib/bookings.ts`

- defines `BookingOpsLinkState` as `allowed | forbidden | unavailable | stale`
- centralizes masking through `maskRef()` and `maskSegmentedRef()`
- seeds detail records with masked cardholder / benefit / auth / driver / vehicle refs
- includes representative review states:
  - assigned + ops link allowed
  - en route + ops link forbidden
  - completed + ops link stale
  - cancelled + ops link unavailable + driver eligibility informational note

`apps/bank-console-web/lib/translations.ts`

- provides centralized `bookings.detail.*` copy keys in both locale tables
- keeps booking-detail labels out of inline per-component locale ternaries

`apps/bank-console-web/app/globals.css`

- parent commit adds booking-detail styling and explicitly documents that shell/chrome
  colors come from tenant realm tokens
- reviewer should still scrutinize this file for UI-token compliance because it contains
  raw hex literals, even though the parent note says bank-console build checks passed

### C. Design-contract alignment anchors

Screen-requirements authority:

- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`
  §5.3 requires:
  - read-only fulfilment view
  - dispatch timeline
  - airport block
  - benefit block with quota impact
  - masked driver/vehicle
  - access-gated ops deep-link
  - no dispatch mutation

Parent implementation aligns with those required functional blocks.

---

## 5. Reviewer Handoff Notes

Reviewer: `Claude2`

Review outcome recorded for this sidecar:

- `Claude2` approved this packet with one correction: the artifact had to be committed
  and normally pushed before owner closeout so it becomes durable machine truth
- that correction is what this closeout addresses; no canonical implementation files are
  changed here

What the reviewer verified:

- the sidecar stays support-only and only adds
  `support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-REVIEW.md`
- parent `BANK-UI-BOOKING-DETAIL-20260610` evidence points to commit
  `76210f6a8e26fb0e128318444d6a828c5e581e7b`
- the acceptance summary here matches the parent task's machine-truth acceptance text

What to review on the parent implementation:

- booking-detail surface contains all required functional sections from screen
  requirements §5.3
- no mutate action leaks into the bank surface
- all exposed refs remain masked in both list data and detail data
- deep-link gating behavior is explicit and safe for forbidden/unavailable/stale cases
- translation usage remains centralized through `t()`
- issuer/realm styling respects the UI token contract and does not invent a new palette

Suggested reviewer commands:

- `git show --stat --oneline 76210f6a8e26fb0e128318444d6a828c5e581e7b --`
- `git show 76210f6a8e26fb0e128318444d6a828c5e581e7b:apps/bank-console-web/app/bookings/[bookingId]/page.tsx`
- `git show 76210f6a8e26fb0e128318444d6a828c5e581e7b:apps/bank-console-web/lib/bookings.ts`
- `git show 76210f6a8e26fb0e128318444d6a828c5e581e7b:apps/bank-console-web/lib/translations.ts`
- `git show 76210f6a8e26fb0e128318444d6a828c5e581e7b:apps/bank-console-web/app/globals.css`
- `git diff --check -- support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-REVIEW.md`

The reviewer action used for this sidecar was:

`AI_NAME=Claude2 scripts/ai-status.sh approve BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-REVIEW "<review conclusion>"`

The parent task was closed separately after its own review approval; this sidecar
approval did not itself finalize the parent task.

---

## 6. Owner Verification

Verification run for this sidecar refresh:

- read `AI_COLLABORATION_GUIDE.md`
- `AI_NAME=Codex scripts/ai-status.sh show BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show BANK-UI-BOOKING-DETAIL-20260610`
- inspected parent evidence through:
  - `git show --stat --oneline 76210f6a8e26fb0e128318444d6a828c5e581e7b --`
  - `git show <commit>:apps/bank-console-web/app/bookings/[bookingId]/page.tsx`
  - `git show <commit>:apps/bank-console-web/lib/bookings.ts`
  - `git show <commit>:apps/bank-console-web/lib/translations.ts`
  - `git show <commit>:apps/bank-console-web/app/globals.css`
  - `sed -n '1,260p' docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`
- whitespace check:
  - `git diff --check -- support/sidecars/BANK-UI-BOOKING-DETAIL-20260610/BANK-UI-BOOKING-DETAIL-20260610-SIDECAR-REVIEW.md`

Not re-run here:

- `pnpm --filter @drts/bank-console-web typecheck`
- `pnpm --filter @drts/bank-console-web build`

Reason:

- this sidecar is support-only; parent machine truth already records those runtime checks
  as passing, and this slice does not modify parent runtime files
