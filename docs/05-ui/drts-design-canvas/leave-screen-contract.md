# Leave Screen Contract — SR-LEAVE-FE-001-CANVAS

Canonical design canvas for the driver/ops leave workflow (Gap `N01`, Capability
`C052`). This is the visual source of truth for `SR-LEAVE-FE-001` per the UI
Design Contract in the task brief — implementation must match this canvas, not
invent new visuals.

Status: `in_progress` (design canvas only; no production code). Owner `Claude2`,
Reviewer `Codex2`.

## Authority chain

1. `phase1_prd_detailed_v1.md` §9.4.7 (Shift & Attendance: 請假申請)
2. `docs/04-uat/system-remediation-20260906/feature-contracts.md` §2 (Family 1:
   Driver Leave Workflow) — state machine, IAM mapping, business invariants
3. `packages/contracts/src/system-remediation.ts` (`SR-CONTRACT-001`, done,
   merged `e6415ede5`) — `DriverLeaveRecord`, `DriverLeaveType`,
   `DriverLeaveStatus`, command/filter shapes, error codes
4. `packages/ui-tokens/src/realms.ts` `REALM_COLORS` — mirrored in this canvas
   by `driver-tokens.jsx` (independent mobile design system, Q-X04) and
   `mgmt-tokens.jsx` `REALM_COLORS` (ops console realm chips, Q-TEN13)

## Files added

| File | Extends | Realm |
| --- | --- | --- |
| `driver-leave.jsx` | `Driver App.html` (loaded after `driver-supply.jsx`) | driver-tokens.jsx blue realm |
| `ops-leave.jsx` | `Ops Console.html` (loaded after `ops-mtx-queue.jsx`) | mgmt-tokens.jsx ops (coral) realm, `Pill tone="driver"` for cross-actor driver chips |

Both files follow the existing "increment" pattern used by `driver-supply.jsx`
/ `ops-mtx-queue.jsx`: they only add new screen functions and fixture data,
they do not modify shared primitives/tokens files. `Driver App.html` and
`Ops Console.html` each gained one `<script>` include plus one new
`DCSection`/`DCArtboard` block; no existing route, artboard, or nav entry was
edited.

## Five requirement groups (契約 §2.3 / §2.5 / §2.6 traceability)

Both driver and ops canvases are organized around the same five groups so the
two surfaces stay cross-consistent (SA §6.8 rule: App / API record / Ops
Console must agree).

| # | Group | Driver App (`driver-leave.jsx`) | Ops Console (`ops-leave.jsx`) | API / contract source |
| - | --- | --- | --- | --- |
| 1 | List / empty | `DRV_LeaveList` (`default`, `empty`) | `OC_LeaveQueue` (pending/approved/rejected/withdrawn tabs) | `GET /api/driver-leave/requests` — driver forced-filters to own `driverId`; ops filters by `driverId`/`status`/date range |
| 2 | Create + date/timezone validation | `DRV_LeaveForm` (`default`, `error_range`, `error_order`, `error_invalid`, `error_overlap`, `keyboard`) | `OC_LeaveDetail` (decision form: approve/reject + optional `reviewNotes`) | `POST /api/driver-leave/requests` (`CreateDriverLeaveCommand`) → `POST /:leaveId/review` (`ReviewDriverLeaveCommand`) |
| 3 | Detail / withdraw / terminal state | `DRV_LeaveDetail` (`pending`, `approved`, `rejected`, `withdrawn`) + `DRV_LeaveConflict` (`withdraw_conflict`, `missing_fields`, `forbidden`, `not_found`) | `OC_LeaveConflict` (`invalid_state`, `overlap`) | `POST /:leaveId/withdraw`; `409 LEAVE_INVALID_STATE_TRANSITION` guards re-decision or re-withdraw of a non-`pending` record; `400`/`403`/`404` per §2.6 |
| 4 | Shift reassignment linkage | `DRV_LeaveShiftImpact` | `OC_LeaveShiftImpact` | Business invariant §2.3.3: approved leave annotates overlapping `ops.phase1_driver_shifts.record` with `{ leaveReassigned: true, leaveId }`; IDs land in `DriverLeaveRecord.impactedShiftIds` |
| 5 | Attendance / dispatch conflict | `DRV_LeaveDispatchConflict` (`clock_in_blocked`, `presence_ineligible`) | `OC_LeaveShiftImpact` eligibility column + `OC_LeaveHistory` audit trail | `409 DRIVER_ON_LEAVE` on `clock-in` / `platform-presence/online`; `ops.phase1_driver_matching_suppressions` (`reason: DRIVER_ON_LEAVE`) |

### Fixture cross-consistency (SA §6.8)

`FX_DRV_LEAVE` (driver-leave.jsx) represents one driver's own leave history —
all four records share `driverId: 'drv_0186'` (吳明翰). `FX_OPS_LEAVE`
(ops-leave.jsx) carries the same `driverId`/`driver` value for the matching
`leaveId`s (`lv_d82a1b5c`, `lv_9c31a204`, `lv_71e9f830`, `lv_5b204a11`), plus
one extra request (`lv_c47b9012`, driver drv_0201) to keep `OC_LeaveQueue` a
realistic multi-driver queue. `impactedShiftIds` is only ever non-empty for
`approved` records (per §2.3 invariant 3); a still-`pending` request's
possible overlap is carried on `previewShiftIds` instead (consumed only by
`OC_LeaveDetail`'s "班次重疊預覽" card), so the pre-decision preview and the
post-approval `impactedShiftIds` field are never conflated.

`OC_LeaveHistory` is the ops-side audit companion to group 3/4 (decided
requests with `reviewedBy`/`reviewedAt`/`reviewNotes`), matching the
`LEAVE_FORBIDDEN_ACCESS` / `LEAVE_NOT_FOUND` isolation guarantees that keep
one driver from reading another's records (AC-LEAVE-NEG-3).

## Date validation, timezone, and server conflict states shown

- All times are authored in UTC on the wire (`DriverLeaveRecord.startTime` /
  `endTime`, ISO 8601). Every screen that shows a leave record's start/end
  displays the Asia/Taipei (UTC+8) local string **alongside** the raw UTC
  value (see `DRV_LeaveForm` field rows and `OC_LeaveDetail`'s `DL` block) so
  the UTC-normalization step in the contract stays visible, not hidden.
  Submission/review timestamps (`createdAt`/`reviewedAt`) follow the same
  rule: `ops-leave.jsx`'s `fmtTaipei()` helper converts them to a Taipei
  local string for the primary display, with the raw UTC ISO value kept as a
  smaller secondary line explicitly labeled `UTC` (`OC_LeaveQueue`'s "提交時間
  （UTC+8）" column, `OC_LeaveDetail`'s subtitle, `OC_LeaveHistory`'s "審核時間
  （UTC+8）" column) — no screen shows a bare sliced ISO string un-converted
  and un-labeled.
- Grace period: `MAX_PAST_APPLICATION_GRACE_MS = 15 * 60 * 1000` is called out
  verbatim in `DRV_LeaveForm`'s info banner and reused in the
  `error_range` variant's error copy.
- `400 LEAVE_INVALID_TIME_RANGE` covers three distinct causes per §2.6, and
  `DRV_LeaveForm` demonstrates all three as separate variants instead of only
  the "too early" case: `error_range` (`startTime` more than 15 minutes in the
  past), `error_order` (`endTime <= startTime`), `error_invalid` (unparseable
  date string). Each variant puts the inline field error on the field that
  actually caused it (start vs. end) and disables the submit button.
- `error_overlap`'s demo request (09/15 09:00–18:00 Taipei /
  `2026-09-15T01:00:00Z`–`2026-09-15T10:00:00Z`) is deliberately chosen to sit
  fully inside `lv_9c31a204`'s approved range (09/14 00:00–09/16 15:59 UTC),
  so the rendered `409 LEAVE_OVERLAPPING_REQUEST` banner reflects a genuinely
  intersecting interval, not just a same-day coincidence.
- Error codes rendered with their literal `code` string plus HTTP status, per
  `feature-contracts.md` §2.6:
  - `400 LEAVE_INVALID_TIME_RANGE` — `DRV_LeaveForm variant="error_range" |
    "error_order" | "error_invalid"`
  - `400 LEAVE_MISSING_REQUIRED_FIELDS` — `DRV_LeaveConflict
    variant="missing_fields"`
  - `409 LEAVE_OVERLAPPING_REQUEST` — `DRV_LeaveForm variant="error_overlap"`,
    `OC_LeaveConflict variant="overlap"`
  - `409 LEAVE_INVALID_STATE_TRANSITION` — `OC_LeaveConflict
    variant="invalid_state"` (ops re-decision guard) and `DRV_LeaveConflict
    variant="withdraw_conflict"` (driver taps 撤回 on a `pending` record that
    ops has, in the same race window, already approved/rejected; no canonical
    screen existed for this before — the driver side previously only modeled
    the already-known pending/terminal states, not the mid-flight race)
  - `403 LEAVE_FORBIDDEN_ACCESS` — `DRV_LeaveConflict variant="forbidden"`,
    plus the structural guarantee that the driver-forced `driverId` filter on
    `DRV_LeaveList` / `DRV_LeaveDetail` never surfaces another driver's record
    to begin with
  - `404 LEAVE_NOT_FOUND` — `DRV_LeaveConflict variant="not_found"`
  - `409 DRIVER_ON_LEAVE` — `DRV_LeaveDispatchConflict` (`clock_in_blocked`,
    `presence_ineligible`)

`DRV_LeaveConflict` (driver) mirrors the existing `OC_LeaveConflict` (ops)
full-screen pattern — code chip, title, body, single reload/return CTA, no
override control — so both surfaces render the shared `LEAVE_*` error
contract the same way instead of each side inventing its own treatment.

## Mobile keyboard focus safe area

`DRV_LeaveForm variant="keyboard"` renders the reason field focused (brand
outline + halo). Layering, top to bottom: scrollable content under a fixed
app bar, then `DrvStickyAction` (submit row, with an `info` line stating it
stays pinned above the system keyboard), then the simulated keyboard block
(`safe-area-inset-bottom` label) as the last/bottom-most element — so the
submit row always renders above the keyboard, never underneath it. The
keyboard block uses theme tokens (`t.surfaceLo` / `t.border` / `t.textDim`),
not a hardcoded hex palette, so it tracks light/dark like the rest of the
canvas. The `Driver App.html` artboard for this variant also passes
`tabHidden` to the `Phone` wrapper, since a real on-screen keyboard covers
the bottom tab bar; showing it between the submit row and the keyboard block
would contradict the "submit row sits directly above the keyboard" claim.
This mirrors the existing `DrvStickyAction` pattern already used by every
other driver form-adjacent screen (`DRV_PermissionGate`, `DRV_TrackingStatus`)
— no new sticky-footer mechanism was introduced.

## Terminal-state actions

- Driver: `DRV_LeaveDetail` shows a withdraw CTA only when `status ===
  'pending'`. For `approved` / `rejected` / `withdrawn` the sticky action bar
  switches to a single non-destructive "返回列表" button with an explicit
  "此假單已為終態，不可再變更" note — no withdraw/edit affordance is shown for
  terminal states.
- Ops: `OC_LeaveQueue` only renders `approve`/`reject` `ActionButton`s on the
  `pending` tab; `approved`/`rejected`/`withdrawn` tabs render a read-only
  "詳情" link into `OC_LeaveHistory`. `OC_LeaveConflict` makes the "no
  override" rule explicit (matches the existing `OC_QueueDenial` pattern in
  `ops-mtx-queue.jsx`).
- Driver: if a `pending` request's 撤回 CTA is tapped in the window after ops
  has already decided it, the server returns `409
  LEAVE_INVALID_STATE_TRANSITION` — shown by `DRV_LeaveConflict
  variant="withdraw_conflict"`, which offers only a reload CTA (no local
  override), then re-renders the now-terminal `DRV_LeaveDetail`.

## Review notes policy

`ReviewDriverLeaveCommand.reviewNotes` (`packages/contracts/src/
system-remediation.ts:65-68`) is `reviewNotes?: string` — optional for both
`approve` and `reject`. `OC_LeaveQueue`'s and `OC_LeaveDetail`'s `reject`
`ActionButton`s use `requiresReason: false` and the `Field` hint on
`OC_LeaveDetail` says reviewNotes is optional for either decision. Do not set
`requiresReason: true` for reject — that would be a business rule invented by
this canvas, not one present in the approved contract.

## Navigation — unchanged

- Driver: leave screens are reachable from the existing `settings` tab
  (`DrvTabBar` items are `home` / `jobs` / `trip` / `platform` / `settings`
  only — no new tab was added).
- Ops: leave screens are mounted under the existing `approvals` sidebar entry
  (`OPS_NAV` already has `key: 'approvals', label: '審批佇列 · Approval
  Requests'`) via `breadcrumb={['案件處理', '審批佇列', '請假審核']}` — no new
  top-level nav item was added.

## Non-goals / explicitly deferred

- No live API wiring, no state management — per the design canvas README,
  these are Babel-standalone prototypes with inline fixture data only.
- Academy/training (`N02`) and Host read-only projection (`N03`) screens are
  out of scope for this task; only Family 1 (Driver Leave Workflow) is
  covered here.
- Push-notification copy for "已上線司機進入請假區間自動下線" (AC-LEAVE-POS-4)
  is referenced in banner copy but no push/toast primitive exists in either
  design system yet — flagged for the implementation owner, not invented here.
