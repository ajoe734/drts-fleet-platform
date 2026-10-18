# PAX-BUREAU-TERMINAL-DISPLAY-20261018

Three review-drill findings about driver terminal state and passenger contact
verification copy, each a display-only correction — no completion gating,
mileage/duration accounting, or in-trip location tracking requirement changed.

## Finding 1 — review heartbeat panel implied the wrong order state

`apps/driver-app/lib/driver-location-heartbeat.ts::installReviewLocationProducer`
hard-coded `"等待接單"` (waiting for a new order) whenever `activeTaskId` was
`null`, including right after a cancelled/declined/completed task cleared the
active heartbeat. The real trip's primary status was already correct; only the
yellow review-drill overlay implied the opposite. The panel now reports
`"目前沒有活動任務"` (no active task right now) — an accurate statement about
whether the location producer currently has an active task, without inventing
a historical order's state. Supply-position cadence, queue handling, and
tracking logic are unchanged.

## Finding 2 — tracking descriptor ignored terminal task status

`apps/driver-app/app/trip.tsx::getTrackingDescriptor` only looked at
`locationTrackingState`/`recordingActive` and defaulted an idle task to
`"待開始"` (not yet started), and `recordingActive` treated any historical
`recordingId` as still live. A completed/cancelled/rejected owned task could
therefore show a tracking badge promising tracking would still start, or that
it was still recording.

`getTrackingDescriptor` now takes the task's terminal status and returns
`"已結束"` (ended, for completed) or `"已停止"` (stopped, for
cancelled/rejected) before falling through to the existing in-progress
branches. `recordingActive` is forced to `false` once the owned task is
terminal, so a finished recording's `recordingId` is read as history, not as a
live recording. Completion conditions, mileage/duration accounting, and the
requirement to close in-trip location tracking are unchanged — this only
changes what is displayed once the task is already terminal.

## Finding 3 — unverified-contact-phone copy duplicated itself and didn't say which verification was missing

`apps/passenger-app-web/lib/booking/translations.ts::unverifiedPhone` read
`"聯絡手機尚未驗證（未驗證）"` — the "not verified" fact stated twice — and gave
no path to resolve it or indication that this is the separate *contact*-phone
verification, not login OTP verification. Per
`packages/contracts/src/passenger-app.ts`, `PassengerAccount.verifiedPhone`
(login OTP) and `contactPhoneVerified` (session-bound contact OTP) are
independent fields; a login-verified phone never implies the contact phone is
verified.

The copy now reads: `"聯絡手機尚未驗證；此驗證與登入手機號碼驗證各自獨立，請前往
帳號管理完成聯絡手機驗證。"` (states the real fact once, names the two
verifications as independent, and points to account management).
`BookingScreen`'s existing unverified-contact branch (shown only when
`!account.contactPhoneVerified && !settings.requireSmsVerification`, mutually
exclusive with the earlier `phoneReady` gate) now also renders the existing
`/account` link next to the notice.

## Verification performed on this VM (repo-level only; no product/browser server started)

- `apps/driver-app` unit test `tests/unit/driver-location-heartbeat.test.ts`:
  5/5 passed.
- `tests/unit/driver-owned-reject-20261017/owned-reject-screen.test.ts`
  (extends the real mounted Trip + SDK probe, not a text self-check): 13/13
  passed, including 3 new terminal-state cases
  (`terminal-completed`/`terminal-cancelled`/`terminal-rejected`) asserting no
  reject action, no stale "待開始"/"追蹤 · 開啟" labels, and the correct
  `"追蹤 · 已結束"`/`"追蹤 · 已停止"` label for a historical `recordingId`.
- New `tests/unit/pax-bureau-terminal-display-20261018/unverified-contact-phone.test.tsx`
  against the real `BookingScreen`/`@drts/passenger-client`/`@drts/ui-web`
  sources (no mocked business logic): 4/4 passed — single non-duplicated
  notice, `/account` link present, notice absent once `contactPhoneVerified`
  is true, and a `verifiedPhone` (login OTP) match alone does not suppress the
  contact-phone notice.
- `apps/driver-app`: `tsc --noEmit` clean; full `apps/driver-app` unit suite
  (39 files / 550 tests) passed.
- `apps/passenger-app-web`: `next typegen` + `tsc --noEmit` clean (an
  intermittent `@drts/api-client` module-resolution gap seen mid-task was a
  missing local `node_modules` install for this app's worktree copy,
  independent of this change; confirmed resolved and re-verified with a
  second, independent `tsc --noEmit` run after restoration).
  `tests/unit/pax-web-booking-ui-20261009` (6 files / 124 tests, covering
  booking UI, fares, current-location and review-standard-address) passed.
- `eslint --max-warnings=0` on every file this task modified: clean.

## Outstanding acceptance item requiring shared/hosted verification

`pax-bureau-display_same-release-original-visuals` calls for an original
visual/data comparison of this version's completed/cancelled/declined and
passenger-contact-prompt presentation **after** the Root's unified immutable
shared deployment. That requires the shared Cloud Run / hosted review
environment; this VM only runs repo-level checks and must not start a
product, browser, or Compose server. Local unit evidence above is necessary
but not sufficient for that acceptance item — it must be captured against the
shared deployment once this candidate has merged, consistent with how
`PAX-SHORT-LEAD-REVIEW-20261018` separated local unit verification from
hosted/shared browser acceptance.
