# Stage 1 Dev Functional Completeness GAP

Status: accepted execution baseline

Audit date: `2026-08-08`

Code baseline: `origin/dev@7e5a29d5a19a51eae01bcdfd44ab80a82a8b02cf`

Execution packet: `docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md`

Registration script: `tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py`

## 1. Decision

Stage 1 is not functionally complete yet.

The Dev runtime, deployment rail and core APIs are healthy, but several active
product surfaces still substitute fixtures for live data, expose inert actions,
or submit a fixed test command instead of the operator's input. A page returning
HTTP 200 is availability evidence, not proof that its business operation works.

This GAP closes the smallest usable product, not a military-grade or enterprise-
governance programme. The completion rule is deliberately practical:

1. a user can enter or select the required data;
2. an enabled action reaches the approved API/BFF;
3. the resulting state survives refresh and can be read back;
4. supported lifecycle operations such as update, cancel, submit or approve work;
5. failures are shown honestly instead of being replaced by sample data.

## 2. Scope boundary

### 2.1 In scope

- Formal Referral Embed booking lifecycle.
- Enterprise Dispatch employee booking lifecycle.
- Fleet Partner supply onboarding, statements and operational actions.
- Platform Admin supply review and truthful operational states.
- Bank Console live Dev read models and minimum downloads.
- Channel Partner Portal alignment to the formal referral identity.
- Current-commit Driver App Dev emulator replay.
- Browser-to-API-to-readback acceptance and one exact-SHA Dev release.

### 2.2 Explicitly not a Stage 1 blocker

- Real bank or issuer credentials and issuer-owned KYC/benefit systems.
- Grab or another external order-forwarding platform.
- Public mobile-store distribution and signing-account ownership.
- Live CTI, recording, regulatory filing or external declaration systems.
- Complete MFA step-up governance, two-person break-glass, access-review
  campaigns, full incident exercises, security dashboards and other Stage 1.5
  hardening that does not prevent the minimum user journey.
- First-party passenger app/web, AV/ODD sandbox or Phase 2 functions.

### 2.3 Surfaces that must stay stopped

- Partner Booking remains paused. Both `/ctbc/program/site` and
  `/ctbc/program/embed` must continue returning 404 and must not be redeployed by
  this wave.
- Concierge Portal remains retired and must continue returning 404.

## 3. Evidence baseline

| Evidence                               | Result                 | What it proves                                                          | What it does not prove                                   |
| -------------------------------------- | ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| CI integration trunk run `31244094092` | success                | lint, typecheck, unit, integration, IAM negative matrix and builds pass | active UI actions complete a business lifecycle          |
| Hermetic API/business E2E              | 22/22                  | core API state machines work in the harness                             | each public browser surface calls those APIs correctly   |
| Deterministic UI route suite           | 39/39                  | selected Platform/Ops routes render and basic safe interactions work    | mutation buttons, downloads and destructive actions work |
| Dev deploy run `31244225462`           | success                | images, migrations, Cloud Run deploy and health checks succeed          | rendered values are live rather than fixtures            |
| Deployed UI smoke                      | 3001 combinations pass | routes return expected visible markers across viewports/locales         | 3001 business operations exist or work                   |

The latest live verification returned HTTP 200 for the active API and eight web
surfaces. The paused Partner Booking and retired Concierge URLs returned 404 as
required.

## 4. Surface status

| Surface                | Runtime | Functional status                                                                          | Decision                               |
| ---------------------- | ------: | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| API                    |     200 | core business API is substantially implemented                                             | retain; acceptance consumer            |
| Ops Console            |     200 | core dispatch and operations have real handlers                                            | retain; add cross-surface journey only |
| Tenant Console         |     200 | create/update/cancel and governance forms are substantially live                           | retain; add journey evidence only      |
| Platform Admin         |     200 | core administration works but supply review is absent and some actions/fallbacks are false | GAP                                    |
| Fleet Partner Portal   |     200 | design fixtures, invalid default fleet scope and missing supply UI prevent real operation  | GAP P0                                 |
| Referral Embed         |     200 | formal visual entry exists but booking lifecycle is not wired                              | GAP P0                                 |
| Enterprise Dispatch    |     200 | form is a static canvas and submit uses a command fixture                                  | GAP P0                                 |
| Bank Console           |     200 | principal read models are fixed 2026-06 demo arrays                                        | GAP P1                                 |
| Channel Partner Portal |     200 | live loader exists but identity is still `referral-demo-community`                         | GAP P1                                 |
| Driver App             |  native | API/device/SOS tests pass; current-SHA native journey is not replayed                      | acceptance GAP                         |
| Partner Booking        |     404 | correctly paused                                                                           | freeze                                 |
| Concierge Portal       |     404 | correctly retired                                                                          | freeze                                 |

## 5. Confirmed functional gaps

### GAP-S1F-REF — Referral Embed does not execute a booking lifecycle

Priority: P0

Implementation evidence:

- `apps/referral-embed-web/lib/embed-booking-api.ts` and the BFF routes under
  `apps/referral-embed-web/app/api/referral/` already expose create, cancel,
  rating, receipt, active and history operations.
- `apps/referral-embed-web/components/passenger-embed.tsx` renders
  `embedResident`, `embedTrip`, `embedSavedPlaces` and `embedVehicles` fixture
  values.
- The booking screen has no usable input/select/form contract. The confirmation
  action only navigates to `?screen=trip`; it does not POST a booking.
- Cancel and rating similarly change the rendered screen without executing the
  corresponding BFF calls.
- The route provides `liveData`, but the component does not consume it, so
  active/history/receipt results are not the live source of truth.

Minimum closure:

- Match `docs/05-ui/drts-design-canvas/Passenger Embed.html` and
  `passenger-embed-screens.jsx`; do not design from screenshots or invent a new UI.
- From `/embed/yuhe-residence`, enter the minimum trip details and create a real
  booking through the existing BFF.
- Refresh and resume the same active booking; show live history and receipt.
- Cancel and rate through the existing BFF with pending, success and failure states.
- A browser test must assert the returned booking ID and backend readback.

### GAP-S1F-ENT — Enterprise Dispatch submits fixed fixture data

Priority: P0

Implementation evidence:

- `apps/enterprise-dispatch-web/app/bookings/new/page.tsx` builds the page from
  `enterprise-fixtures`.
- `EInput` in `components/ent-kit.tsx` is a visual `div/span`, not an input, and
  the segment control has no form state.
- `BookingSubmitButton` calls the API with
  `getEnterpriseBookingCommandFixture()` regardless of what the user intends.
- Existing tests prove the fixed command can be posted; they do not fill a form
  or prove that browser input became the command.

Minimum closure:

- Match `Enterprise Dispatch.html`, `ent-screens-1.jsx`, `ent-screens-2.jsx`,
  `ent-embed-flow.jsx` and `ent-states.jsx` exactly.
- Use real input/select state and live passenger, address, cost-centre, quota and
  policy-preview data.
- Submit the user's values and provide list, detail, edit and cancel lifecycle.
- Cover validation, quota/policy rejection and no-supply/degraded states without
  building a new approval engine.
- Browser acceptance must perform create-read-update-cancel.

### GAP-S1F-FLT — Fleet Partner cannot onboard supply through the portal

Priority: P0

Implementation evidence:

- The live dashboard declares that it is showing design sample data.
- `apps/fleet-partner-portal-web/lib/api-client.server.ts` falls back to fixture
  fleet ID `flp_002` when no scope is injected; that ID returns 404 in Dev.
- The valid Dev partner `fleet-demo-001` can read drivers, vehicles, readiness
  and statements. Trips and quality fail for the hard-coded `2026-06` period
  because there is no active published driver fee plan for that period.
- The portal has read routes but no `/supply`, driver/vehicle create, document
  upload, submission detail, submit or withdraw UI.
- The supply submission/review APIs already exist and API E2E-019 covers their
  state machine, so the missing layer is primarily UI and Dev configuration.
- Several actions use a presentation-only `CanvasActionButton` and have no
  request handler.

Minimum closure:

- Bind Dev to a valid fleet partner identity and derive the active period rather
  than hard-coding June 2026. Publish only the minimum fee-plan fixture needed
  for the current Dev period.
- Match `Fleet Partner Portal.html`, `fleet-screens.jsx`, `fleet-supply.jsx`,
  `fleet-partner-portal-supply-onboarding-screen-requirements-20260619.md` and
  `fleet-partner-portal-design-handoff-20260604.md`.
- Create driver/vehicle supply, upload required documents, submit, read back and
  withdraw/resubmit from the Fleet Portal.
- Wire statement download/confirm/dispute and only the cases/documents actions
  backed by an existing Stage 1 endpoint. Disable unsupported actions.
- Platform review must provision canonical registry only after approval.

### GAP-S1F-ADM — Platform Admin supply review and truthful failure states

Priority: P0 for supply review; P1 for truthfulness cleanup

Implementation evidence:

- The API has admin supply-review list, detail, start review, request revision,
  approve and reject operations, but Platform Admin has no corresponding routes.
- `docs/05-ui/drts-design-canvas/platform-supply-review.jsx` and
  `docs/05-ui/platform-admin-supply-review-screen-requirements-20260619.md`
  provide the accepted UI contract.
- Partner detail and reimbursement detail can substitute route-local fixtures
  when API access fails.
- Some `/fleet` controls advertise actions that only display an alert saying the
  mutation endpoint is not connected.

Minimum closure:

- Build the accepted supply-review queue/detail and existing API mutations.
- Show explicit loading, empty, forbidden and degraded states. Never replace an
  operational API failure with plausible fixture rows.
- Wire the Stage 1 actions returned by backend capability data. Disable or remove
  controls that have no supported endpoint.

### GAP-S1F-BANK — Bank Console is a static demonstration

Priority: P1

Implementation evidence:

- `apps/bank-console-web/lib/home-data.ts`, `bookings.ts`,
  `contracts-data.ts` and `statements.ts` are static arrays/constants.
- Periods and dates are fixed to June 2026, and application pages do not load
  Dev order, programme, contract, settlement, user or audit read models.
- Current tests cover route rendering, locale/role/bank switching and sign-out;
  they do not reconcile the UI against the Dev API or exercise a download.

Minimum closure:

- Match `Bank Console.html` and `bank-screens-{1,2,3}.jsx`; no visual redesign.
- Read the current scoped Dev booking, programme usage, contract, statement,
  user and audit data through a server-side client/BFF.
- Derive the current period; show honest empty/degraded states.
- Make the minimum statement download/export work and enforce existing role
  capability hints. Do not re-enable cardholder Partner Booking.

### GAP-S1F-CHAN — Channel Portal is attached to the demo entry

Priority: P1

Implementation evidence:

- Referral Embed deployment defaults to the formal `yuhe-residence` entry.
- `apps/channel-partner-portal-web/lib/referral-bootstrap-identity.ts` defaults
  to partner `partner-referral-demo-001`, programme
  `program-referral-community` and entry `referral-demo-community`.
- The Dev deploy does not inject `DRTS_PARTNER_ID`, `DRTS_TENANT_ID`,
  `DRTS_PARTNER_PROGRAM_ID` or `DRTS_PARTNER_ENTRY_SLUG` for this service.
- Live response evidence therefore identifies `referral-demo-community` even
  though the passenger-facing formal route is `yuhe-residence`.

Minimum closure:

- Resolve and inject the exact formal partner, tenant, programme and entry IDs.
- A booking created at `/embed/yuhe-residence` must appear in the same partner's
  usage/statement read model.
- Preserve partner scoping and show an honest configuration error if the formal
  identity is absent; never fall back to the demo identity in deployed Dev.

### GAP-S1F-UAT — Current smoke does not prove operations

Priority: P0 release gate

The current suites are valuable but route-oriented. Stage 1 needs one release-
blocking browser journey that proves state transitions across surfaces:

1. formal Referral create, refresh/resume, cancel, rating and receipt;
2. Enterprise create, read, update and cancel;
3. Fleet supply create/upload/submit followed by Platform revision/approve and
   readiness/registry readback;
4. Tenant/Ops creation, assignment and trip-state readback using existing flows;
5. Bank and Channel read the resulting scoped data;
6. every enabled action either performs its operation or is removed/disabled;
7. paused/retired URLs remain 404.

### GAP-S1F-DRV — Driver native evidence is not tied to the current release SHA

Priority: P1 acceptance gate

Driver SOS, device lifecycle and heartbeat replay pass at API level. The minimum
remaining work is an Android emulator replay against the exact candidate SHA:
login/bind, view task, accept, start, complete, reconnect/readback and SOS. iOS
or public distribution is not required for this Stage 1 closure.

## 6. Minimum security and safety bar

Only controls needed to keep the minimum product honest remain blocking:

- login, logout and expired-session recovery;
- server-side tenant/partner/role isolation for reads and writes;
- no shared secret in browser code, URL or storage;
- CSRF/session handling already required by the existing BFF boundary;
- audit record for create, update, cancel, submit, approve and reject;
- missing Dev auth/scope configuration fails visibly instead of selecting a
  default demo principal.

The Stage 1.5 IAM programme continues independently but must not prevent these
functional tasks from being dispatched unless a concrete cross-tenant or secret
exposure regression is found.

## 7. Completion gates

Stage 1 may be declared functionally complete only when all gates pass:

| Gate                   | Required evidence                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| G1 Active data truth   | no active UI shows fixture/preview rows while its API is healthy                           |
| G2 Action truth        | every enabled control performs a request/download/navigation and has result/error state    |
| G3 Lifecycle truth     | create/update/cancel/submit/approve operations survive refresh and API/DB readback         |
| G4 Cross-surface truth | formal Referral and Fleet supply records are visible in their downstream scoped surfaces   |
| G5 Native truth        | current-SHA Android emulator journey passes                                                |
| G6 Runtime truth       | exact accepted SHA is deployed and all active services pass health plus operation journeys |
| G7 Frozen surfaces     | Partner Booking and Concierge remain stopped with HTTP 404                                 |
| G8 Regression truth    | existing 22/22 API E2E, 39-route suite, build/typecheck and deployed smoke stay green      |

Until these gates pass, the release statement is: **Dev infrastructure and core
APIs are operational; Stage 1 user-operation completion is in progress.**

## 8. Traceability

| GAP          | Execution tasks                             |
| ------------ | ------------------------------------------- |
| GAP-S1F-REF  | `S1F-REF-001`, `S1F-REF-002`                |
| GAP-S1F-ENT  | `S1F-ENT-001`, `S1F-ENT-002`                |
| GAP-S1F-FLT  | `S1F-FLT-001`, `S1F-FLT-002`, `S1F-FLT-003` |
| GAP-S1F-ADM  | `S1F-ADM-001`, `S1F-ADM-002`                |
| GAP-S1F-BANK | `S1F-BANK-001`, `S1F-BANK-002`              |
| GAP-S1F-CHAN | `S1F-CHAN-001`                              |
| GAP-S1F-UAT  | `S1F-UIX-001`, `S1F-REL-001`, `S1F-DOC-001` |
| GAP-S1F-DRV  | `S1F-DRV-001`                               |
