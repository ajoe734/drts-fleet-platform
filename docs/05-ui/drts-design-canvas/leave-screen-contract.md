# Driver Leave — Canonical Screen Contract

**Date:** 2026-09-10
**Task:** `SR-LEAVE-FE-001-CANVAS` (canvas authoring, explicit supervisor authorization)
**Parent (blocked until this lands + is reviewed):** `SR-LEAVE-FE-001`
**Owner lane:** Claude · **Reviewer:** Codex2
**Status:** canonical canvas addition — closes the "canvas gap" blocker recorded against
`SR-LEAVE-FE-001` (see `docs/03-runbooks/system-remediation-20260906/SR-LEAVE-FE-001.md`).
This is design authority, **not** the product implementation.
**Behaviour / data authority:**
`docs/04-uat/system-remediation-20260906/feature-contracts.md` §2 (Family 1: Driver Leave Workflow) ·
`packages/contracts/src/system-remediation.ts` · `packages/api-client/src/system-remediation.ts`
**Visual authority (tokens):** `packages/ui-tokens/src/realms.ts` (`driver`, `ops` realms) ·
`docs/05-ui/drts-design-canvas/driver-tokens.jsx` · `docs/05-ui/drts-design-canvas/mgmt-tokens.jsx`

## 1. Canvas gap closed

`docs/03-runbooks/system-remediation-20260906` (execution task `SR-LEAVE-FE-001`, gap `N01`,
capability `C052`) required driver leave-request and supervisor leave-review screens.
Before this task, `Driver App.html` / `Ops Console.html` and their `.jsx` bundles had no
leave-specific artboard — the closest surfaces were `DRV_Shift` (clock-in/odometer) and
`OC_Attendance` (shift Gantt), neither of which is the leave workflow. This task adds:

- `driver-leave.jsx` — `DRV_LeaveList`, `DRV_LeaveCreate`, `DRV_LeaveDetail`
- `ops-leave.jsx` — `OC_Leave`, `OC_LeaveDetail`
- New `DCSection`s wired into `Driver App.html` (`§08 · 請假 Leave`) and
  `Ops Console.html` (`§05d · 請假管理 Leave Management`)

No existing artboard, route, or navigation ownership was changed. `Driver App.html`'s tab
bar (`DrvTabBar`, defined in `driver-primitives.jsx`, out of this task's write scope) and
`Ops Console.html`'s sidebar (`OPS_NAV`, defined in `ops-screens-1.jsx`, out of scope) are
unmodified — see §6.

## 2. State machine (authority: feature-contracts.md §2.3)

```text
[*] --> pending    : driver submits (POST /api/driver-leave/requests)
pending --> withdrawn : driver withdraws (POST /:id/withdraw)
pending --> approved  : ops approves  (POST /:id/review {decision: approve})
pending --> rejected  : ops rejects   (POST /:id/review {decision: reject})
approved  --> [*]  : terminal (shift reassignment annotation + dispatch suppression)
rejected  --> [*]  : terminal
withdrawn --> [*]  : terminal
```

Both `DRV_LeaveDetail` and `OC_LeaveDetail` render a `terminal` boundary computed as
`status !== 'pending'`: no withdraw / approve / reject affordance renders for a terminal
record (artboards `leave-detail-rejected`, `leave-detail-approved` on both apps).

## 3. Field contract

Mirrors `packages/contracts/src/system-remediation.ts` verbatim — this canvas does not
invent fields.

| Contract type | Fields rendered |
| --- | --- |
| `CreateDriverLeaveCommand` | `leaveType` (chip group, 5 values), `startTime`, `endTime` (local Asia/Taipei display, UTC on the wire), `reason` (free text) |
| `DriverLeaveRecord` | `leaveId`, `driverId` (+ `driverName` join on the ops side only — not a contract field, table-display convenience), `leaveType`, `startTime`, `endTime`, `reason`, `status`, `reviewedByPrincipalId`, `reviewedAt`, `reviewNotes`, `impactedShiftIds`, `createdAt`, `updatedAt` |
| `WithdrawDriverLeaveCommand` | `reason?` — canvas shows the withdraw action; the optional reason capture itself is deferred to the withdraw confirmation the implementation lane builds (no canvas modal invented for this optional field to avoid over-specifying an unconfirmed interaction) |
| `ReviewDriverLeaveCommand` | `decision` (`approve` \| `reject`), `reviewNotes?` — canvas makes `reviewNotes` **required** in the reject modal per `requiresReason: true` on the reject `ActionButton` descriptor (artboard `leave-detail-reject-modal`) |
| `DriverLeaveQueryFilter` | `status` tabs on both list screens; `driverId` / time-range filtering is represented as the `篩選` (`Btn icon="filter"`) affordance on `OC_Leave`, not expanded into a full filter panel (no authority doc specifies its exact field layout) |

## 4. Action contract per role / state

| Role | State | Available action | Canvas artboard |
| --- | --- | --- | --- |
| driver | (any) | create new leave | `leave-create-idle` (Driver App) |
| driver | `pending` (own) | withdraw | `leave-detail-pending` (Driver App) |
| driver | `approved`/`rejected`/`withdrawn` (own) | read-only, no mutation | `leave-detail-approved`, `leave-detail-rejected` (Driver App) |
| driver | other driver's leave | forbidden | `leave-detail-forbidden` (Driver App, `403 LEAVE_FORBIDDEN_ACCESS`) |
| ops (tenant-scoped) | `pending` (in-tenant) | approve / reject (`reviewNotes` required on reject) | `leave-detail-pending`, `leave-detail-reject-modal` (Ops Console) |
| ops (tenant-scoped) | `approved`/`rejected`/`withdrawn` | read-only, no mutation | `leave-detail-approved`, `leave-detail-rejected` (Ops Console) |
| ops (tenant-scoped) | stale record (concurrent review/withdraw) | blocked recheck | `leave-detail-conflict` (Ops Console, `409 LEAVE_INVALID_STATE_TRANSITION`) |

Ops actions are rendered with `ActionButton` (`mgmt-auth.jsx`), computed client-side from
`status` (there is no `ResourceActionDescriptor` field on `DriverLeaveRecord` yet) —
consistent with how `OC_Maintenance` / other existing Ops Console screens compute
enablement from record status rather than a server-supplied descriptor.

## 5. Date, timezone, and server-conflict rules (authority: feature-contracts.md §2.3.1–2, §2.6)

- **Invariant:** `endTime > startTime`.
- **Grace window:** `startTime >= now - 15 minutes` (`MAX_PAST_APPLICATION_GRACE_MS`).
  Violating either rule returns `400 LEAVE_INVALID_TIME_RANGE`; the canvas shows this as an
  inline field error under the offending date field (`leave-create-timerange`,
  `leave-create-past` on Driver App), not a top-level banner — the error is
  field-attributable, so it renders at the field.
- **Timezone:** all `startTime`/`endTime` values are ISO 8601 UTC on the wire
  (`DriverLeaveRecord.startTime`/`endTime`). Both driver and ops screens display the
  human-readable value labeled `Asia/Taipei (UTC+8)` for date entry (`DRV_LeaveCreate`
  field captions) and the literal UTC timestamp for confirmed/reviewed records (`DRV_
  LeaveDetail`, `OC_LeaveDetail`, `OC_Leave` table — suffixed `UTC`) so the two timezones
  are never visually ambiguous.
- **Overlap conflict:** `409 LEAVE_OVERLAPPING_REQUEST` when the requested window overlaps
  an existing `pending`/`approved` leave for the same driver. Rendered as a dismissable
  top-of-form banner on `DRV_LeaveCreate` (`leave-create-conflict`), since — unlike the
  time-range rule — the conflict is not attributable to a single field.
  `403 LEAVE_FORBIDDEN_ACCESS` / `404 LEAVE_NOT_FOUND` are rendered as the existing
  `DrvEmpty`/`EmptyState` `permission_denied` reason (`leave-detail-forbidden`).
- **Stale-state conflict on review:** `409 LEAVE_INVALID_STATE_TRANSITION` (reviewing or
  withdrawing an already non-`pending` record) is rendered as an ops-side blocking banner
  with a `重新整理 · refetch` action (`leave-detail-conflict`); this is orthogonal to
  `LEAVE_OVERLAPPING_REQUEST`, which only applies at create time.

## 6. Mobile keyboard, focus, and safe-area coverage

- `DRV_LeaveCreate` accepts `focusField` (`'start' | 'end' | 'reason'`) which renders a
  focus ring (`box-shadow` halo in `t.brandBg`, border in `t.brand`) on the active field —
  no new color, reuses the existing driver brand token from `driver-tokens.jsx`.
- `DRV_LeaveCreate` accepts `keyboard` (`'ios' | 'android'`), rendering the **existing**
  canvas keyboard primitives (`IOSKeyboard` from `ios-frame.jsx`, `AndroidKeyboard` from
  `android-frame.jsx` — already landed for Partner Booking Web) docked at the bottom of the
  phone frame. These represent OS chrome, not app-branded UI, so reusing them does not
  introduce a new design system into the driver app (which is otherwise independent of
  `@drts/ui-web` / other consoles per Q-X04).
- The sticky submit action (`DrvStickyAction` → `送出申請 · submit`) renders **above** the
  keyboard overlay in DOM order, demonstrating that the primary CTA must stay in the safe
  area above the on-screen keyboard rather than being occluded by it — this is the
  concrete rule the implementation must preserve (e.g. via `KeyboardAvoidingView` /
  `useAnimatedKeyboard` on Expo, or `env(safe-area-inset-bottom)` scroll padding).
  Artboards: `leave-create-kb-ios`, `leave-create-kb-android`.
- Terminal-state screens (`leave-detail-approved`, `leave-detail-rejected` on both apps)
  intentionally omit the sticky action bar and instead show a locked/terminal notice,
  confirming no dangling mutable control survives into a terminal state on a small screen
  where an accidental tap is costlier to recover from.

## 7. Artboard index

**Driver App.html** (`DCSection id="leave"`, driver realm / amber tokens):
`leave-list-pending`, `leave-list-approved`, `leave-list-empty`, `leave-list-error`,
`leave-create-idle`, `leave-create-timerange`, `leave-create-past`,
`leave-create-conflict`, `leave-create-submitting`, `leave-create-kb-ios`,
`leave-create-kb-android`, `leave-detail-pending`, `leave-detail-approved`,
`leave-detail-rejected`, `leave-detail-forbidden`.

**Ops Console.html** (`DCSection id="leave"`, ops realm / coral tokens):
`leave-list-pending`, `leave-list-all`, `leave-list-empty`, `leave-list-error`,
`leave-detail-pending`, `leave-detail-reject-modal`, `leave-detail-approved`,
`leave-detail-rejected`, `leave-detail-conflict`.

## 8. Mock data disclosure

`FX_DRIVER_LEAVES` (`driver-leave.jsx`) and `FX_OPS_LEAVES` (`ops-leave.jsx`) are
illustrative canvas fixtures only. `leaveId`, `driverId`, `shiftId` values are fabricated
strings shaped like the contract's examples — they are not real resource IDs and must not
be cited as integration or acceptance evidence. Production wiring uses
`createDriverLeave` / `listDriverLeaves` / `listDriverLeavesEnvelope` /
`withdrawDriverLeave` / `reviewDriverLeave` (`packages/api-client/src/system-remediation.ts`).

## 9. Explicitly out of scope for this task

- `apps/driver-app/**`, `apps/ops-console-web/**`, and any other product code or API —
  this task is canvas-only per its `write_scopes`.
- `driver-primitives.jsx` (`DrvTabBar`) and `ops-screens-1.jsx` (`OPS_NAV`) — both own
  actual cross-screen navigation and are outside this task's `write_scopes`. `OC_Leave` /
  `OC_LeaveDetail` render with `active="leave"`, which will not highlight a sidebar item
  until whoever owns `OPS_NAV` (expected: `SR-WIRE-001` lane) adds the entry. This is a
  known, deliberate gap, not a defect in this canvas addition.
- VM/browser preview, Playwright, or any live server — not run for this task per the
  dispatch's VM restriction; this canvas was authored and self-reviewed by static reading
  of the Babel-standalone source only.

## 10. Closeout boundary

This artifact and the two `.jsx`/two `.html` changes unblock `SR-LEAVE-FE-001` (implementation)
by supplying the canonical visual truth its dispatch required before implementation could
start. `SR-LEAVE-FE-001` should not claim canvas parity until this commit has been reviewed
(`Codex2`) and merged; the parent task remains blocked until then per its own note.
