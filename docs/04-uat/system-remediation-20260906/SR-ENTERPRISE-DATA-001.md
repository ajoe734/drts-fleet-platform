# SR-ENTERPRISE-DATA-001 — 企業首頁／行程真資料及聯絡入口

## Current candidate and base

Recovery branch `claude/sr-enterprise-data-001-recovery-20260911`, fast-forwarded
onto `origin/dev` base `d9f6766596111b279a39a33e6107f048b75561bd` (includes the
merged `SR-ENTERPRISE-SEARCH-001` dependency, commit `6cddb9cba1` / PR #1970).
This task's candidate SHA is recorded at handoff via
`CANDIDATE_SHA=$(git rev-parse HEAD)` on this branch; see the machine-truth
`ai-status.sh show SR-ENTERPRISE-DATA-001` record for the exact value linked
to this handoff.

The 2026-09-06 audit SHA is historical observation, not current program truth.
This report re-verifies the described gaps against the current tree (see
"Reproduced at base" below) rather than assuming the audit is still accurate.

## Reproduced at base (before this change)

- `apps/enterprise-dispatch-web/app/page.tsx` and `apps/enterprise-dispatch-web/app/trip/page.tsx`
  rendered exclusively from `lib/enterprise-fixtures.ts`'s static
  `enterpriseBookings` array — no authoritative API call at all, so the home
  KPI/active-trip/upcoming cards and the trip page could never reflect a real
  tenant's actual bookings.
- `components/enterprise-booking-lifecycle.tsx`'s `EnterpriseBookingDetail`
  already called the real `getBooking(bookingId)` API, but `gatewayHref()`
  mapped any error that wasn't quota/policy/supply/5xx — including a genuine
  404 — to `null`, and the caller's `?? "degraded"` fallback then rendered
  the "服務暫時不穩定" (temporarily unstable) retry banner for a booking that
  simply does not exist. A missing booking was indistinguishable from a
  retryable transient fault.
- `app/trip/page.tsx`'s "聯絡司機" / "聯絡客服" buttons used `<EBtn>`, which
  renders a plain `<button type="button">` with no `onClick`/`href` — both
  buttons were inert regardless of trip state.
- `app/help/page.tsx`'s "撥打客服" / "線上客服" buttons were the same inert
  `<EBtn>` pattern.
- `EnterpriseBookingDetail` called `getEnterpriseDispatchTenantClient(enterpriseTenant.id)`
  with the fixture tenant UUID instead of the session-verified tenant id used
  by `EnterpriseBookingHistory` (`app/bookings/page.tsx`) — see "Known gap not
  fixed" below.

## Product changes in this task

- `app/page.tsx` (home) and `app/trip/page.tsx` are now server components that
  verify the `drts_tenant_session` cookie via the existing
  `verifyEnterpriseTenantSession` (same contract `EnterpriseBookingHistory`
  already uses), then call the authoritative
  `EnterpriseDispatchTenantClient.getDashboardSummary()` (new thin wrapper
  over the already-shipped `GET /api/tenant/dashboard`, added in
  `lib/api-client.ts`). No fixture booking data is used by either page
  anymore. Unauthenticated/expired sessions render the existing
  `EnterpriseGatePage kind="auth-required"`; a 401/403 from the API itself
  (session revoked between check and call) or a 5xx/network failure renders
  `auth-required`/`degraded` respectively via the new
  `classifyEnterpriseDashboardFetchError`.
- Home KPIs (`bookingCount`, `pendingApprovalCount`, `completedTripCount`),
  the "active trip" card, and the upcoming-bookings list are now populated
  from `TenantDashboardSummary.upcomingBookings` (`TenantBookingSummary[]`).
  Fields the authoritative summary does not provide (ETA minutes, delegate
  "booked by" attribution) are no longer fabricated — they are omitted or
  shown as an explicit "—" / "ETA not available", per
  "沿用權威 API／資料模型，不以 fixture...代替完成".
- List → home → trip → detail now reference the same real `bookingId`: home's
  upcoming rows and the trip page's detail button link to
  `/bookings/{bookingId}` for the actual authoritative booking.
- New pure module `lib/enterprise-trip-status.ts` (re-exported from
  `lib/api-client.ts`, mirroring the `enterprise-booking-search.ts` pattern
  from `SR-ENTERPRISE-SEARCH-001` so root Vitest can import it without
  resolving `@drts/api-client`): `selectActiveEnterpriseTrip`,
  `getEnterpriseTripProgressStage`, `getEnterpriseOrderStatusTone`,
  `classifyEnterpriseBookingFetchError`, `classifyEnterpriseDashboardFetchError`.
- `EnterpriseBookingDetail` now classifies fetch failures with
  `classifyEnterpriseBookingFetchError`. A 404 renders a dedicated
  `data-testid="enterprise-booking-not-found"` empty state ("找不到這筆預約")
  with a link back to `/bookings`, distinct from the retryable
  quota/no-supply/degraded gateway states. It is never described as a
  retryable temporary fault.
- Trip page contact actions are real and testable, honest about what data is
  actually authorized:
  - "聯絡司機" (`data-testid="enterprise-trip-contact-driver"`) is a disabled
    button with an explicit "司機聯絡資訊暫不提供" label — see "Driver contact:
    not implemented, and why" below for why this cannot be a real action yet.
  - "企業客服" (`data-testid="enterprise-trip-contact-support"`) is a real
    `tel:` action using the tenant's support phone (the same value already
    shown elsewhere in this app).
  - The detail button (`data-testid="enterprise-trip-detail-link"`) links to
    `/bookings/{bookingId}` for the real active booking.
  - When there is no active (non-terminal, non-exception) booking, the trip
    page renders an honest `data-testid="enterprise-trip-empty"` state instead
    of `return null` or a stale/fake trip.
- `app/help/page.tsx`'s call/online buttons are now a real `tel:` link
  (`data-testid="enterprise-help-call"`) and `mailto:` link
  (`data-testid="enterprise-help-online"`) using the tenant support
  phone/email already displayed on that page — no new data is disclosed.
- 18 `status.order.*` labels (one per `OwnedOrderStatus`) and the other new
  strings above were added to both `en`/`zh` catalogs in
  `lib/translations.ts` (verified 574/574 key parity between locales).
- `lib/enterprise-fixtures.ts`, `lib/dispatch-fixture-adapter.ts` are
  untouched: `enterpriseBookings`/`getEnterpriseBookings`/`getEnterpriseBooking`/
  `enterpriseDriver`/`getBookingStateMeta` are still real exports still used
  by `app/receipts/[bookingId]/page.tsx` and `components/ent-embed-screens.tsx`
  (both out of this task's write_scopes) — removing them would break those
  surfaces.

## Driver contact: not implemented, and why

`docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-DATA-001.md` (via
the merged `support/unblock/SR-ENTERPRISE-DATA-001` planning decision,
`c07d24e021`) explicitly found that no tenant-authorized driver-contact source
exists yet: `packages/contracts` `BookingRecord`/`DispatchAssignmentRecord`
expose `driverId`/`vehicleId` but no driver name or phone, and the demo
`enterpriseDriver` fixture ("張家豪 · 4.9 ★", "Toyota Alphard · ARJ-7720") is
explicitly documented as a demo proper-noun placeholder, not real data. Re-
verified against the current tree in this task: still true — no endpoint
reachable from `EnterpriseDispatchTenantClient` returns driver name/phone.
Per that planning decision, closing this requires registering a narrow
tenant-authorized contact producer through the supervisor (new
backend/contract/client scope), which is outside this task's `write_scopes`.
The trip page therefore always shows the honest "司機聯絡資訊暫不提供" disabled
state rather than inventing or reusing passenger/onsite contact as a driver
phone. `required_acceptance` item
`enterprise_authorized_driver_and_support_contact_actions` is therefore only
partially met (support contact is real and actionable; driver contact is
honestly unavailable, not faked) until that follow-up producer exists.

## Known gap not fixed: booking-detail direct-link tenant scoping

`EnterpriseBookingDetail` (`components/enterprise-booking-lifecycle.tsx`)
still resolves its API tenant context as `tenantId ?? enterpriseTenant.id`
when no `tenantId` prop is supplied. `app/bookings/[bookingId]/page.tsx` (the
only current caller) does not verify the tenant session or pass a `tenantId`
prop — unlike `app/bookings/page.tsx`, which verifies
`verifyEnterpriseTenantSession` and passes the verified tenantId into
`EnterpriseBookingHistory`. `enterpriseTenant.id` happens to equal the real
seeded demo tenant UUID (`10000000-0000-0000-0000-000000000201`, see
`infra/seeds/S0002__demo_operational_seed.sql`), so in the current
single-demo-tenant deployment this does not point at the wrong tenant's data.
It does, however, mean the direct `/bookings/{id}` route does not itself
enforce that the caller has a valid tenant session before issuing the API
call. Fixing this requires editing `app/bookings/[bookingId]/page.tsx` to add
the same session-verify-and-pass-prop pattern as `app/bookings/page.tsx` —
that file is not in this task's `write_scopes` (`append_write_scopes` for
this recovery only lists `components/enterprise-booking-lifecycle.tsx`, not
its page wrapper). `EnterpriseBookingDetail` was given an optional `tenantId`
prop so a future task can close this by editing only the page wrapper. Not
claiming this as done; flagging for supervisor scope follow-up.

## Local verification

All checks ran inside this isolated worktree; no product/browser/DB server
was started (per this task's VM restriction).

| Command | Result |
| --- | --- |
| `git diff --check` | exit 0 |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck` (`tsc --noEmit`) | exit 0 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-data-001/` | 13 passed (enterprise-trip-status.test.ts) |
| `pnpm --filter @drts/enterprise-dispatch-web test` (full app vitest) | 30 passed, 1 pre-existing failure (`tests/unit/enterprise-booking-lifecycle.test.ts`, `ApiClient.listTenantBookings` / `paged.items is not iterable`); reproduced identically on the unmodified base commit before this task's changes, confirmed pre-existing and unrelated to this task's write_scopes |
| `pnpm --filter @drts/enterprise-dispatch-web lint` (`eslint . --max-warnings=0`) | exit 0 |
| Locale key-parity check (`en` vs `zh` in `lib/translations.ts`) | 574/574 keys match, no orphans either side |

## Explicitly not done (do not treat as complete)

- No live/browser/CI acceptance run for this candidate. `required_acceptance`
  items `enterprise_booking_identity_empty_and_error_ui` and
  `enterprise_authorized_driver_and_support_contact_actions` need real
  HTTP/browser evidence (same pattern as `SR-ENTERPRISE-SEARCH-001`'s
  `.github/workflows/enterprise-search-acceptance.yml`) before this task can
  be marked `done`; this recovery did not add
  `.github/workflows/enterprise-data-acceptance.yml` or
  `tools/ci/test_enterprise_data_acceptance_workflow.py` (both are in
  `write_scopes` but were not reached in this pass — remaining work, not a
  silent scope cut).
- Driver contact remains honestly unavailable (see above) — not full
  acceptance for that half of `enterprise_authorized_driver_and_support_contact_actions`.
- The booking-detail direct-link tenant-session gap (see above) is not fixed.
- No physical device / production traffic verification of any kind.
- Owner does not self-approve: independent reviewer, this exact candidate's
  CI, and merge to `dev` are still required before `done`.
