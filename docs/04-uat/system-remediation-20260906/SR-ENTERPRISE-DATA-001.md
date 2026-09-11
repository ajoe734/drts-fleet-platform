# SR-ENTERPRISE-DATA-001 — 企業首頁／行程真資料及聯絡入口

## Current candidate and base

This task's core product change (home/trip real dashboard data, honest 404,
real contact actions) already merged to `origin/dev` as `c6580b50dc49` via
PR #1981 (squash of candidates `a3800a45b6f1` and `f95970a9019e`). This
recovery branch (`claude/sr-enterprise-data-001-recovery-20260911`) carries a
follow-up: the real Postgres+browser acceptance workflow for this task's
`required_acceptance` items, opened as a new PR (#1984) since #1981 was
already closed. That follow-up's first CI run
(`gh run view 34578967536`, `CANDIDATE_SHA=ebe1b6428575`) failed with a
genuine seed-script bug (see "CI failure found and fixed" below), and the PR
also had a real merge conflict against `origin/dev` (both sides touched
`docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-DATA-001.md`) because
`origin/dev` advanced past the #1981 squash-merge while this branch still
carried the pre-squash commits. This merge (`git merge origin/dev`, `origin/dev`
at `f31c2489fc9f`) resolves that conflict on top of the fixed seed script.
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

All checks below ran fresh in this session, inside this isolated worktree,
after the `git merge origin/dev` described above (the prior session's
`node_modules` symlink issue that blocked `tsc`/`vitest` in this worktree is
no longer present). No product/browser/DB server was started (per this
task's VM restriction).

| Command | Result |
| --- | --- |
| `git diff --check` | exit 0 |
| `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` | `[consistency] OK` (0 findings, all 4 sub-checks) |
| `python3 -m unittest tools.ci.test_enterprise_data_acceptance_workflow -v` | 13/13 passed |
| `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/enterprise-data-acceptance.yml'))"` | parses; `jobs: ['browser-acceptance']` |
| `node --check tests/e2e/system-remediation/sr-enterprise-data-001/enterprise-data-browser-server.mjs` | exit 0 |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck` (`tsc --noEmit`) | exit 0 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-data-001/` | 13 passed (enterprise-trip-status.test.ts) |
| `pnpm --filter @drts/enterprise-dispatch-web test` (full app vitest) | 30 passed, 1 pre-existing failure (`apps/enterprise-dispatch-web/tests/unit/enterprise-booking-lifecycle.test.ts`, `ApiClient.listTenantBookings` / `paged.items is not iterable`); same failure as documented in the prior session, unrelated to this task's write_scopes |
| `pnpm --filter @drts/enterprise-dispatch-web lint` (`eslint . --max-warnings=0`) | exit 0 |

None of these commands exercise the real Postgres/HTTP/Chromium path the
acceptance workflow drives; that only runs on GitHub-hosted CI (see "CI
failure found and fixed" above and "Explicitly not done" below).

## CI failure found and fixed (this pass)

PR #1984's first real run (`gh run view 34578967536`, job
`browser-acceptance`, `CANDIDATE_SHA=ebe1b6428575`) started the real
`AppModule` against a migrated disposable Postgres container and failed at
the seed step:

```
error: insert or update on table "identity_invitations" violates foreign
key constraint "identity_invitations_issuer_principal_id_fkey"
detail: Key (issuer_principal_id)=(data-seed-<suffix>) is not present in
table "identity_principals".
```

Root cause: `enterprise-data-browser-server.mjs`'s `session()` helper calls
`TenantPartnerService.createTenantUser(tenantId, command, requestId,
bootstrap)`, which internally calls `issueTenantInvitation` and writes the
`bootstrap` actor's `actorId` as `issuer_principal_id` — a real FK into
`iam.identity_principals` (`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`,
`createTenantUser` → `issueTenantInvitation`). The bootstrap actor's own
principal row was never created before that write. The sibling
`SR-ENTERPRISE-SEARCH-001` harness
(`tests/e2e/system-remediation/sr-enterprise-search-001/enterprise-search-browser-server.mjs`)
avoids this by issuing a session token for the bootstrap actor with
`ensurePrincipal: true` (which calls
`IdentityRepository.ensurePrincipalRecord`) before calling
`createTenantUser`; this script was missing that step. Fixed by adding the
identical `jwt.issueSessionToken(bootstrap, { ensurePrincipal: true, ... })`
call before `session()` is defined. This candidate SHA has not yet been
re-run in real CI after the fix — that is the next required verification,
not yet recorded as acceptance evidence.

## Follow-up: candidate CI fix (this doc only)

PR #1981's first CI run on `a3800a45b6f1` failed the "Canonical consistency"
check (`python3 tools/ci/git/check_canonical_consistency.py --ci`): this
document's `cited-paths` check flagged three backtick-wrapped paths that do
not exist verbatim in the tree —
*tests/unit/enterprise-booking-lifecycle.test.ts* (missing the
`apps/enterprise-dispatch-web/` prefix; the file exists at
`apps/enterprise-dispatch-web/tests/unit/enterprise-booking-lifecycle.test.ts`,
now corrected above) and *.github/workflows/enterprise-data-acceptance.yml* /
*tools/ci/test_enterprise_data_acceptance_workflow.py* (genuinely not added
in this pass, per "Explicitly not done" below; switched from backtick to
italic so the checker's existence gate — correctly — does not read them as a
claim that they exist). No product code changed in this follow-up; re-run
locally with `python3 tools/ci/git/check_canonical_consistency.py --ci --base
origin/dev --head HEAD`, output `[consistency] OK` (0 findings across all four
sub-checks). All other PR #1981 checks (candidate, e2e, ci-integ, lint,
typecheck, unit, i18n guard, BFF-only imports, commit trailers, smoke
acceptance, product smoke acceptance) were already passing before this
follow-up and are unaffected by it.

## Acceptance harness added in this recovery pass

Added the real HTTP/browser acceptance runner that was previously listed as
missing (see "Explicitly not done" below for what it still does *not*
prove), following `SR-ENTERPRISE-SEARCH-001`'s
`.github/workflows/enterprise-search-acceptance.yml` pattern:

- `.github/workflows/enterprise-data-acceptance.yml` — single `browser-acceptance`
  job. Builds the real `@drts/api` and `@drts/enterprise-dispatch-web`
  packages, migrates a disposable Postgres service container, boots the real,
  unmodified `AppModule` plus a real production `next start` server, and
  drives Chromium against both over real HTTP.
- `tests/e2e/system-remediation/sr-enterprise-data-001/enterprise-data-browser-server.mjs` —
  seeds one real booking by inserting directly into
  `ops.phase1_owned_orders` (the same table the production write path
  writes) *before* `NestFactory.create(AppModule)` boots. This ordering is
  load-bearing: `OwnedMobilityService` hydrates its in-memory order cache
  from persisted state exactly once, in `onModuleInit`, and
  `GET /api/tenant/bookings/:bookingId` (the booking-detail endpoint) reads
  only that in-memory cache — a row inserted after boot would be visible to
  the live-DB-backed list/search endpoint but invisible to booking detail.
  Seeding first keeps the dashboard summary and the booking-detail page
  reading the identical underlying record
  (`OwnedMobilityModule.onModuleInit` wires
  `TenantPartnerService.registerOrderFeedProvider` to
  `OwnedMobilityService.listOrders()`, so both are backed by the same
  in-memory array by construction). Also creates a second, genuinely empty
  tenant (zero orders) and issues real JWT tenant sessions for both via
  `TenantPartnerService.createTenantUser` / `JwtAuthService.issueSessionToken`,
  the same way the search browser harness does.
- `tests/e2e/system-remediation/sr-enterprise-data-001/enterprise-data-browser.spec.ts` —
  six Playwright scenarios: (1) home upcoming list → trip page → booking
  detail all resolve to the exact same seeded `bookingId`; (2) the trip
  page's driver-contact button is `disabled` and never renders a fabricated
  number, while the support-contact link's `href` is a real
  `tel:` action built from `enterpriseTenant.supportPhone`; (3) the help
  page's call/online actions are real `tel:`/`mailto:` links from the same
  tenant contact fixture; (4) a `bookingId` that was never inserted anywhere
  resolves to the `enterprise-booking-not-found` testid, with zero instances
  of the `enterprise-booking-api-state` (retryable-degraded) testid; (5) the
  zero-booking tenant sees `enterprise-home-upcoming-empty` and
  `enterprise-trip-empty`, never a fabricated trip; (6) a request with no
  session cookie cannot render any `enterprise-home-upcoming-*` row.
- `tools/ci/test_enterprise_data_acceptance_workflow.py` — contract test
  asserting the workflow YAML's structure (triggers, Postgres service,
  build-before-migrate-before-seed-before-harness ordering, the zero-skip
  gate, the run-status heredoc, and that session tokens are never uploaded
  as artifacts) and that the `.mjs`/`.spec.ts` files contain the seed-before-
  boot ordering and the testid coverage described above. Run locally with
  `python3 -m unittest tools.ci.test_enterprise_data_acceptance_workflow -v`:
  13/13 passed.
- Added `data-testid="enterprise-booking-detail-id"` to
  `EnterpriseBookingDetail`'s title in
  `components/enterprise-booking-lifecycle.tsx` so the identity assertion
  above has a stable hook (previously the booking id was unlabelled text).

## Explicitly not done (do not treat as complete)

- **This exact candidate SHA has not yet run green in GitHub Actions.** The
  prior candidate (`ebe1b6428575`) did run for real on GitHub-hosted CI (see
  "CI failure found and fixed" above) and failed on a genuine seed-script
  bug, which is fixed in this commit. The fix has not yet been re-verified
  by a real CI run — that run happens automatically on push to
  `claude/sr-enterprise-data-001-recovery-20260911` / PR #1984.
  `required_acceptance` items `enterprise_booking_identity_empty_and_error_ui`
  and `enterprise_authorized_driver_and_support_contact_actions` are not
  satisfied until that run is green and its `run-status.json` /
  `system-remediation-report.json` artifacts are recorded as acceptance
  evidence — do not record acceptance evidence from this doc alone.
- Driver contact remains honestly unavailable (see above) — not full
  acceptance for that half of `enterprise_authorized_driver_and_support_contact_actions`.
- The booking-detail direct-link tenant-session gap (see above) is not fixed.
- No physical device / production traffic verification of any kind.
- Owner does not self-approve: independent reviewer, this exact candidate's
  CI, and merge to `dev` are still required before `done`.
