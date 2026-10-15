# PAX-REVIEW-SHARED-ORDER-DEMO-20261015

Owner: Codex2. Reviewer: Codex. Accepted base:
`a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1` (core shared-order task merged).
This is the original task's implementation and evidence record. An anchor is
not a candidate or an acceptance result.

2026-10-15 checkpoint: the external-port historical reproduction uses the same
real tests against accepted SHA `a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1`.
It records two product assertion failures (production synthetic fields and
first-capture failure), followed by passing current-source assertions.
`ports-regression-fixed.log` records 409 passes / 6 PG skips;
`driver-regression.log` records 542 existing Driver passes. A temporary BFF
extraction regression (missing original CSRF helper) was found and restored
before these passes. The finite Driver producer/storage runner still needs its
Expo dependency aliases verified; its initial import failure is not a product
reproduction. Hosted browser/PG and shared-dev acceptance remain pending.

The hosted lane now includes the actual production Passenger build, exported
Driver (standalone and mounted), three independent journeys, real relational
readback and phase artifacts. It has not been executed on this VM. The explicit
review profile uses the existing legal 1-minute scheduling configuration,
retains future/minimum-lead checks, and waits for the requested pickup before
starting. Normal default remains 15 minutes. Day/night tariffs and timestamps
must reflect the real clock.

Supervisor granted targeted Owned Mobility and Forwarder source repairs after
caller diagnosis found that Ops orders/jobs and Driver task views still read
process-local startup arrays. These are required for a peer API started before
booking to see and act on the same committed order. The next repair preserves
the synchronous internal interfaces and existing driver/tenant checks and
assignment/task locking; it does not reload global state per request.

## Implementation units and evidence

| Finding / acceptance                                        | Production source and change                                                                                                                                  | Before → after                                                                                       | Command / version / evidence                                                               | Pending and limits                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| External SMS unavailable for rehearsal                      | `ReviewSmsPort` and `ReviewDemoController.requestOtp` call `PassengerOtpService.request`; ordinary OTP verify still creates the account/session               | Source: prior `UnconfiguredSmsPort` unavailable; new simulated inbox limited to illustrative numbers | `tests/unit/pax-review-shared-order-demo-20261015/external-ports.test.ts`; results pending | Unit persistence boundary only; real PG/session browser pending                                               |
| Capture failure was impossible after successful bind        | `FakePaymentProvider.capture`, `PaymentChargeService.processOrder`; durable attempt metadata selects simulated first failure, then success under the same key | Same scenario must fail first capture and preserve retry schedule                                    | Same test file; results pending                                                            | Existing charge repository and financial policy unchanged; no direct payment status writer; hosted PG pending |
| Production build rejected synthetic fields                  | `createSyntheticPaymentFields` explicit `review` adapter, `paymentFieldsForRuntime`; runtime API selection through `ReviewDemoProvider`                       | Normal production remains unavailable; explicit shared review supports opaque synthetic fields       | Same test file; historical and current results pending                                     | Production build and shared Cloud Run pending                                                                 |
| `pax-review-demo_real-shared-order-across-roles`            | Existing booking / Ops dispatch / driver lifecycle retained                                                                                                   | Pending                                                                                              | Hosted browser and relational readback pending                                             | No acceptance credit yet                                                                                      |
| `pax-review-demo_external-simulation-and-complete-journeys` | New entry and external adapter wiring in progress                                                                                                             | Pending                                                                                              | Three independent orders, exception controls and downloads pending                         | No acceptance credit yet                                                                                      |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Existing `ci-integ.yml` hosted route job is the designated lane                                                                                               | Pending                                                                                              | Exact candidate review / CI / merge, immutable publish and Cloud Run pending               | VM product / browser / PG servers forbidden and not started                                                   |

Initial checks on this fresh worktree found incomplete inherited dependency
links (`@nestjs/common` and Node type definitions missing). That is a tooling
failure, not a reproduction or product pass. Worktree dependency links are
replaced with an isolated frozen-lockfile installation; canonical dependencies
are preserved. Machine logs live under `.local/pax-review-shared-order-demo-20261015/`.

## Intended operator flow (not execution evidence)

Keep `/demo` and its local-only behavior. `/review` will explicitly enter the
shared backend rehearsal, use simulated SMS delivery followed by ordinary OTP
verification, and navigate to the existing booking/payment/ride/history pages.
Review mode is selected at API runtime by `PAX_REVIEW_DEMO_ENABLED=true` with
an explicit nonproduction `DRTS_ENV`; it does not depend on Next dev mode or a
build-time public flag. Existing guards and private service access apply.

The fake PSP still requires its existing explicit sandbox/encryption
configuration and charge policy. A newly bound rehearsal method can select
success or first-capture failure. Each order uses its own durable attempt
counter; retries call the existing executor and do not advance its clock,
re-submit completion, replace the order, or write `paid` from the UI.

Complete rehearsal acceptance also requires live Ops and Driver sessions,
New Taipei route/supply setup, tracker input, normal/high-score,
failed-payment/retry/low-score/case, cancelled/history orders, exception
controls, hosted artifacts and shared-dev delivery. These remain implementation
work; the initial adapter anchor does not claim them complete.

## Persisted Ops / Driver repair checkpoint

The actual `OwnedMobilityController.listOrders/getOrder/listDispatchJobs`,
Driver list/detail and mutation access helper, and
`ForwarderController.listDriverTaskViews/getDriverTaskView` consumed startup
arrays. A peer initialized before booking could return an empty 200 or 404.
The unified task-view path is Driver `/jobs`' primary source; forcing legacy
fallback would not repair it.

New public async read facades use production repository reads. Missing rows
and database errors remain missing/errors even when the old internal cache was
previously warm. Internal synchronous APIs retain their contracts. Commands
load only the target order's jobs/assignments/tasks/attempts/traces/disclosures
in one MVCC statement, then enter the original dispatch/driver commands and
their reservation, assignment and task locks. Unrelated orders and outboxes
are not reloaded. Original Driver alias/ownership checks, forwarded visibility
and unified sorting remain in effect.

`reproduce-persisted-reads.py` runs the same two real controller cases against
immutable accepted callers at `a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1`.
It relocates imports only and records two assertion failures (`[]` instead of
the committed order/task), with current synchronous service contracts intact.
An initial relocation attempt could not resolve Nest dependencies and is
explicitly not reproduction evidence; the corrected receipt has
`product_failure_reproduced: true`. Current cases pass, including warm-cache
deletion/error authority, native Driver alias access and foreign-driver denials.

The new hosted PG companion initializes a real peer before booking, dispatches
through that peer's real controller, assigns through the original instance,
reads Ops jobs/candidates and unified Driver list/detail, accepts through the
peer's native locked command and rereads the changed status from the original
instance. It uses the formal migration harness and external qualification
fixture only. It has not run on this VM and carries no acceptance credit.

Original controller tests now await public reads and provide the new
repository interfaces. Their business/identity/forbidden/envelope assertions
were retained. The old socket-free Ops map fixture records and rereads the
production service's actual write payloads at its existing external persistence
boundary; it does not claim PG evidence.

## Operator configuration and finite journeys

Entry: Passenger `/review`, Ops `/review`, actual exported Driver Web
`/review-driver/onboarding` (also standalone in hosted CI). Passenger login
uses illustrative `0900000000`–`0900000099` simulated delivery followed by
ordinary OTP verification and HttpOnly account session. Ops uses its existing
session. Its prepare action creates only two explicitly synthetic qualification
and supply groups, then issues the existing Driver device-registration code.
The Driver enters that code through its real onboarding page. Session and
device storage are credentials/recovery markers, never alternative order state.

API review mode requires `PAX_REVIEW_DEMO_ENABLED=true` and nonproduction
`DRTS_ENV`. Shared-dev workflow opts in with `DEV_PAX_REVIEW_DEMO_ENABLED=true`,
retains private Cloud Run access, and passes the existing OTP pepper and grouped
PSP merchant/key/sandbox/token-cipher configuration. Review uses fake PSP,
explicit capture policy (60-second retry), synthetic authorization and the
existing `SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES=1`. Default 15-minute policy
outside this explicit profile is unchanged. No fake clock or guard bypass is
used. CI selects a future minute with 2–3 minutes' real margin and waits until
requested pickup before starting. Actual day/night tariff may be 85/105 TWD;
it must never be relabelled as daytime evidence.

1. New order A: real quote/booking, assign B then reassign A while Passenger is
   disconnected, reconnect, real Driver accept/depart/arrive/start/complete,
   captured synthetic PSP payment, five-star rating and separate HTML download.
2. New order B: newly bind the explicit first-capture-failure scenario, complete
   another actual Driver journey, observe failure/attempt 1 and blocked rating,
   attempt another booking and observe the original unpaid guard's 409, use
   ordinary charge executor retry after its durable due time, captured attempt 2
   under the same payment/order/key, one-star contact consent and actual Ops CRM
   case, then download.
3. New order C: pause synthetic supply, real no-supply dispatch, restore and
   redispatch/assign, Passenger cancellation, reload and history. No captured
   payment or rating may appear for this order.

The explicit GPS port emits real-time samples to the actual tracker listeners
and existing ingestion queue; completion distance/duration come from that
tracker. Pause/resume retains a real gap and never backfills. Hosted A waits
for the real freshness threshold to become stale. Native permission/background
capability and completion guards are retained. Formal PG joins and deployed
account-owned record reads verify UUIDs, requested/start/completed timestamps,
trip metrics, payment attempts, rating consent and CRM link. Screenshots,
downloads and the whitelisted journal omit authentication/OTP/device secrets.

## Check results and remaining delivery

All commands use Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4.

| Check                                                    | Result and log under `.local/pax-review-shared-order-demo-20261015/`                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| External-port old-source reproduction                    | Two product assertion failures as expected; `historical/verification.json`                                                       |
| Persisted caller old-source reproduction                 | Two product assertion failures as expected; `historical-reads/verification.json`                                                 |
| Payment / OTP / BFF / shared-order regression            | 577 pass, 10 hosted PG skips; `final-ports-regression.log`                                                                       |
| Existing API controller/repository/Forwarder regression  | 63 pass; `api-caller-final.log`                                                                                                  |
| Existing Driver regression                               | 542 pass; `driver-regression.log`                                                                                                |
| New Driver producer / recovery boundary                  | 3 pass, Driver tsconfig exit 0; `driver-finite-final.log`, `driver-tests-typecheck.log`                                          |
| Ops map existing regression                              | 1 pass after read-interface adaptation; `ops-map-final-fixed.log`                                                                |
| Production Passenger and SDK build                       | Exit 0; `passenger-production-build.log`                                                                                         |
| Production API build / API, Passenger, Driver typechecks | Exit 0; respective `api-production-build`, `api-typecheck-persisted-fixed`, `web-typecheck-final`, `driver-typecheck-final` logs |
| Root typecheck                                           | Exit 0 after native type-context separation and original async caller adaptation; `root-typecheck-candidate.log`                 |
| Hosted formal PG / three-role browser / shared dev       | Pending, never run on VM                                                                                                         |

Checkpoint branches/anchors are `356cbefc3`, `b31fcb44d`, `7c34a5853` and the
subsequent persisted-reader anchor. They are recovery records, not accepted
candidates. No PR/candidate/CI/merge/deployment result is claimed here.

Remaining acceptance keys are all pending:
`pax-review-demo_real-shared-order-across-roles`,
`pax-review-demo_external-simulation-and-complete-journeys`, and
`pax-review-demo_hosted-browser-and-shared-dev-delivery`. After final checks and
exact-SHA handoff, the candidate must pass review/hosted CI, merge, immutable
publish/release deployment to the live verified shared Cloud Run project and
the new deployed-browser smoke. Old 14+16 checks are not this feature's proof.

Known external simulator limits: fake PSP capture success is idempotent and
first-failure selection uses the durable attempt count, but legacy fake
readback/refund maps remain process memory. This finite rehearsal does not
claim real provider reconciliation/refund/restart durability. Qualifications,
SMS, map selection, GPS, PSP and notification are simulated and labelled;
backend account/order/dispatch/task/payment/rating/case facts remain real.

## Delivery wiring and final caller feedback

Supervisor's immutable `7c34a5853` delivery check found D2: the most recent
release run `38656657549` had absent/partial OTP and payment groups, while
review capture was enabled. The original runtime correctly rejects unavailable
capture; CI's previous separate filled configuration could not prove shared-dev
startup. The new explicit `review-demo/simulation-profile.json` supplies PUBLIC
synthetic OTP/provider/cipher environment values only for absent groups during
the opt-in review deployment. Complete existing groups retain their references;
ordinary optional-group behavior is unchanged. No cipher implementation, real
provider credential, Secret Manager value, IAM policy or crypto fallback was
added. The stable named public simulation ring is passed explicitly into the
original cipher contract, is identical in hosted CI and shared dev, and is
strictly for synthetic provider tokens. This is not protection for real
customer financial tokens. Keep its historical key entries if this simulation
profile is deliberately rotated; do not swap it for an unrelated ring while
retained rehearsal tokens still need to decrypt.

`simulation-profile.test.ts` calls the real runtime/capture configuration
readers, confirms missing groups remain unavailable, proves the explicit
profile configures capture, binds a retry token, encrypts it with one runtime
and decrypts with a fresh peer, then observes first failure/second success.
The existing real OTP/account/session/replay test now consumes the exact same
profile through `otpOptionsFromEnv`. `final-simulation-iam.log` records 27 passes
(five adapter/profile cases plus 22 existing IAM cases). An initial profile
test used the wrong capture-command field; it was corrected to the actual
`token` contract before these passes and is not product-failure evidence.

The exact Python selector embedded in the workflow was executed for all four
OTP/payment completeness combinations, injecting only the absent slots:
`workflow-profile-selector.json`. Both workflow YAML files parse, all 87 shell
blocks pass `bash -n`, and no runtime/deployment was started. D1 (optional empty
Ops origin) is not triggered on the current target: live Ops origin is absolute.
The reviewed entry requires that existing configured origin; this checkpoint
does not claim a new empty-origin fallback.

Root typecheck exposed two existing security-test callers of the newly async
HTTP facade. Supervisor granted those exact files; only await/rejection
adaptation and formatting changed. Original Driver self/query mismatch,
cross-driver 403/404, hidden existence and all business assertions remain.
`iam-route-final.log` records 10 passes and the combined final log also includes
all 12 authz cases. These adapt existing checks and add no security mechanism.

Supervisor's early static browser feedback at fixed `7c34a5853` identified
`C_DRIVER_SAME_ORDER_ASSERTION` and `HISTORY_RENDERED_UUID_ASSERTIONS`. The C
journey now opens the actual assigned task in Driver and asserts the exact
task/order header before Passenger cancellation, reloads the same view and
asserts terminal cancellation with no enabled accept/start/complete controls.
History now asserts the three rendered `/rides/<UUID>` links and C's rendered
Passenger cancellation status before its screenshot. These assertions are
implemented and typechecked, with actual hosted results still pending.

## Review of candidate 356ed9c628d6692bc6c3281b6c21090c30635c44

Original reviewer Codex returned this candidate (generation
`d1e487713c4e4ba7aa74395fe3b9cd4f`). Keep the findings below until their
individual evidence and the replacement candidate are reviewed. Evidence for
this round is under `.local/pax-review-shared-order-demo-20261015/ci-rework-356ed9c/`.

R1 checkpoint `a7b6d52ff8d73d399cb8809090236f2bca79d271` was normally pushed.
Both actual app typechecks completed with exit 0 (`r1-ops-typecheck.log`,
`r1-passenger-typecheck.log`). This is an anchor, not the replacement candidate.

R2 checkpoint: the unchanged session-registration regression against the old
`356ed9c` production module now fails at the actual registry `requireDriver`
assertion; current production session/registry/profile code passes all 3 new
cases, including suspension and missing/error authority. The historical module
is relocated by import paths only; initial missing-Nest imports were tooling,
not reproduction. `r2-session-reproduction.json` and `r2-session-old.log` record
the corrected product reproduction; `r2-session-current.log` records the new
3-pass result. External database query responses retain actual production
INSERT payloads; the existing disconnected invitation store is used. Neither
result claims PostgreSQL or browser acceptance.

The targeted registry reader reuses `lockDriver(driverId)` without a client
(a read without `FOR UPDATE`). Dispatch supply reads one service-bucket MVCC
snapshot of the original registry/qualification/location tables. The public
Owned async preparation loads this before the unchanged command and lock
paths. Booking reads current effective authorizations through the existing
repository mapper, then uses the original ambiguity/default/window selection.
The original request/address/time validation was extracted into one shared
Owned function, so invalid schedules still fail before storage reads; the
48 original booking-access cases remain unchanged. Ops work-state keeps its
synchronous internal setter and adds an HTTP facade that awaits the actual
existing master-write promise, including rejection. Driver registration/JWT
checks load their target driver before the original eligibility assertion, and
registration loads the target profile before its original binding writer.

Current narrow results: API typecheck exit 0 after building the existing
workspace dependency; original API registry/multi-taxi suites 64 pass
(`r2-api-regression.log`); booking timing plus new session cases 51 pass
(`r2-timing-regression.log`). The earlier combined 177-pass/1-failure result
exposed the pre-storage timing expectation and was repaired by shared
validation, without weakening its assertion. Full affected regression and the
new two-preinitialized-instance real prepare/invite/register/dispatch PG case
remain pending. The old `356ed9c` hosted browser job was cancelled by GitHub
concurrency on the R1 push; its partial logs are retained and are not passes.

### R1 / R2 replacement source closeout

The replacement commit is identified by the exact SHA in the canonical handoff
and the round's `manifest.json`; anchors `a7b6d52ff` and `b3cf54f0f` remain
published recovery history. No rebase, amendment or force push was used.

| Finding / required acceptance                               | Current source and exact check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Old candidate → replacement source                                                                                                                                                                                                                                                                                                 | Evidence and remaining limits                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1: inline UI copy / labels                                 | Typed Passenger review dictionary, scoped bilingual Ops dictionary with the existing locale provider; guard/baseline unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `356ed9c`: i18n exit 1 with 84 violations → replacement source: exit 0, 646 files / 81 existing exemptions. App typechecks and production Passenger build exit 0.                                                                                                                                                                  | `i18n-final.log`, `r1-ops-typecheck.log`, `r1-passenger-typecheck.log`, `passenger-production-build.log`. Hosted same-SHA CI and browser interaction still pending.                                                                                                                                       |
| R2: dynamic driver/profile/session/supply authority         | Registry target read through original `lockDriver` without a transaction client; service-bucket MVCC context through production tables/mappers; session and JWT await target authority before original assertions. Profile is target-loaded for register, refresh, invitation/manual revoke and device rebind. Async booking uses persisted effective authorizations and the unchanged original selection rules. Ops work-state awaits its actual save promise; sync internal setter remains. Batch heartbeat target read occurs after the original field checks, preserving their ordering. | Same successful-registration case against old production session module fails at the real registry assertion; replacement's 4 cases pass (register/profile, suspension, missing/error authority, failed work-state ACK). Original booking-access assertions remain unchanged, including invalid schedule rejection before storage. | `r2-session-reproduction.json`, `r2-session-old.log`, `r2-last-root-regression.log`, `r2-last-api-regression.log`. Controlled DB wire and disconnected invitation store only; this is not PG evidence. Initial import/quote-union/stub failures are tooling or interface adaptation, recorded separately. |
| `pax-review-demo_real-shared-order-across-roles`            | New `dynamic-supply.hosted.test.ts` constructs two real service graphs and independent DB pools before prepare; seeds only established qualification templates via production repository; invokes real prepare/invite, peer register, actual profile/token checks, peer Ops work-state, quote/booking/dispatch/assignment, unified Driver list/detail and original native accept, then passenger/PG readback. Existing persisted-role companion remains.                                                                                                                                     | Pending hosted execution; locally skipped deliberately.                                                                                                                                                                                                                                                                            | All qualification, order, session and repository code is real in this companion. Direct controller calls do not claim HTTP guard/browser coverage; full hosted app lane remains required. No acceptance credit.                                                                                           |
| `pax-review-demo_external-simulation-and-complete-journeys` | Original UI entry, simulator and three-order browser journeys retained. New peer companion checks foreign-driver session/task refusals and a freshly persisted suspension through original JWT/session checks.                                                                                                                                                                                                                                                                                                                                                                               | Pending hosted complete journeys.                                                                                                                                                                                                                                                                                                  | Existing external port/driver tests and their earlier evidence remain; no real SMS/GPS/PSP/qualification/provider reconciliation claims. No acceptance credit.                                                                                                                                            |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Existing hosted lane selects both new PG tests and the original three-role browser spec. Replacement requires its own review/CI/merge and immutable shared-dev delivery.                                                                                                                                                                                                                                                                                                                                                                                                                     | Pending. Old cancelled run and anchor CI are not replacement evidence.                                                                                                                                                                                                                                                             | No product/PG/browser/preview server or Compose was run on this VM. No merge/deploy/production claim. All three keys remain pending.                                                                                                                                                                      |

Final affected batch: `r2-affected-final.log` records 312 passes / 12 deliberate
hosted skips; `r2-api-final.log` records 90 passes. The final heartbeat/profile
and remaining repository interface adaptations are additionally covered by
`r2-last-root-regression.log` (30 passes) and `r2-last-api-regression.log`
(42 passes). Counts overlap and must not be summed. The expanded notification,
rating, payment, receipt and remaining MultiTaxi caller regression is recorded
in `r2-other-callers-final.log` (605 passes / 9 hosted skips, exit 0).
`root-typecheck-final.log` is exit 0 after adding the actual fare response's
serviceable discriminant check to the hosted test. Production API build and
lint closeout logs are recorded separately. Full browser/PG/shared-dev results
are not inferred from these socket-free checks.

| Finding / acceptance                                      | Source and repair boundary                                                                                                                                                                                                                                                                                                                                                                  | Before → after                                                                                                                                | Commands / evidence                                                                                                                                       | Pending and limits                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1: new rehearsal copy blocks i18n CI                     | Passenger review pages, payment scenario selector and review components use the new typed `components/review-demo/translations.ts`; Ops `/review` uses its scoped `translations.ts` and the existing `useTranslation` locale. Original zh text, accessible names and business requests are retained.                                                                                        | Exact old candidate: 84 violations, exit 1. Current source: 646 files, 11 apps, 81 existing exemptions, exit 0. No guard or baseline changes. | `pnpm run i18n:guard`; hosted run `38702985278`, job `116316041211`; `i18n-hosted.log`, `i18n-before-installed.log`, `i18n-after.log`.                    | Replacement hosted CI/browser pending. Initial local missing-TypeScript failure was tooling only; isolated frozen dependencies restored before the actual reproduction. |
| R2: prepare on A, driver registration on preinitialized B | `ReviewSupplyService.prepare` previously reloaded only its local registry/authorization arrays; `DriverDeviceSessionService.register` → `assertDriverAuthEligible` → registry `requireDriver` cannot see the newly committed driver on B. Repair must use targeted persisted authority for registration/session/heartbeat and dispatch, preserving existing eligibility and command checks. | Reviewer supplied precise static evidence; no PG reproduction on this VM. Repair pending.                                                     | Reviewer disposition is recorded in the original task machine state; hosted two-preinitialized-instance true prepare/invite/register regression required. | No acceptance credit; no global reload, peer restart, single-instance configuration or weakened guard.                                                                  |
| All three existing required acceptance keys               | Same real shared-order, simulated-port journeys and hosted/shared-dev delivery requirements above.                                                                                                                                                                                                                                                                                          | Pending.                                                                                                                                      | Original same-SHA CI is still being collected; replacement must receive its own review/CI/merge and immutable deployment evidence.                        | No merged/deployed/browser claim from socket-free checks.                                                                                                               |

### Candidate 507584277ab7 rework: R3 integration fixture readers

The original reviewer reopened exact candidate
`507584277ab764aa67b2f9e62e5b12ff9edc3181`, generation
`f464a823eba34ba0b9ca86c44acb506b`, at 08:47:50Z. R1 is confirmed removed by
same-candidate hosted i18n checks. R2's original peer-registration failure is
repaired in the reviewed source; formal PG/browser evidence remains required.
The earlier R2 "repair pending" row above records the initial review, not the
latest disposition. The new R3 is an integration-fixture compatibility failure,
not a repeat of the original registration defect.

Evidence for this round lives under canonical
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate-507-ci-followup/`.
The first local attempt could not import Nest dependencies (3 suites, no tests,
exit 1); this is tooling failure only. The task worktree's 22 dependency links
were preserved under its `.local/pax-review-r3-dependency-links/` and replaced
with an isolated frozen/offline install. Canonical dependencies were not edited.

| Finding / acceptance                           | Source and repair boundary                                                                                                                                                                                                                                                                                                                                       | Old candidate → current source                                                                                                                                                       | Command / evidence                                                                                                                                                                                                                                                                                                          | Pending and limits                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| R3: heartbeat and reporting readers            | The enabled repository substitutes in `int-mob-001-batch-heartbeat-idempotency`, `int-rep-001-daily-dispatch-records` and `int-rep-002-six-month-operations-summary` lacked `lockDriver`. Add target reads from each fixture's stored driver rows and preserve writes to those rows. The heartbeat restart case explicitly persists its initialized master rows. | Hosted integration job `116330597027`: 4 failures in these files. The two socket-free reporting files reproduce 2 failures → 3 original assertions pass.                             | Hosted run `38707202699`; `integration-job116330597027.log`; `socket-free-integration-before-installed.log` / `socket-free-integration-after.log`.                                                                                                                                                                          | The HTTP heartbeat suite remains hosted-only. No assertion, case, expected status, timeout or product guard was relaxed.               |
| R3: MultiTaxi authorization reader             | `int-mtx-001-runtime-authority` now reads its own authorization writes through `findEffectiveAuthorizations`.                                                                                                                                                                                                                                                    | Original source: missing-method failure before booking; current source: 2 original cases pass, including persisted readback and spoofed-entry refusal.                               | Same before/after logs; command: `pnpm --filter @drts/api exec vitest run tests/integration/int-mtx-001-runtime-authority.test.ts tests/integration/int-rep-001-daily-dispatch-records.test.ts tests/integration/int-rep-002-six-month-operations-summary.test.ts`. Before: 3 fail / 2 pass, exit 1. After: 5 pass, exit 0. | Storage is an external substitute; this is not PostgreSQL evidence.                                                                    |
| R3: UV cancellation token-failure path         | The `uv-exec-006` token-failure substitute lacked the same reader, so `createRide` rejected before initial workflow persistence. Store and return its actual authorization writes; keep all delayed-write, no-early-cancel/read, error-code and durable cancellation assertions.                                                                                 | Hosted original case: writes length remains 0; repair awaiting hosted execution.                                                                                                     | `integration-job116330597027.log`, failure at original line 2544.                                                                                                                                                                                                                                                           | Requires real PostgreSQL. It was not run on this VM.                                                                                   |
| Cross-surface dispatch 500, separately tracked | `findDispatchSupplyContext` joins `reg.phase1_registry_vehicles.vehicle_id` (V0012 `varchar`) to `reg.vehicles.vehicle_id` (V0004 `uuid`) through `USING`. The new query must preserve textual snapshot IDs and normalized license metadata without casting synthetic IDs to UUID.                                                                               | Hosted cross-surface job `116330597072`: 15 scenarios pass / 7 fail, including dispatch HTTP 500. The type mismatch is precise static evidence; no local PG reproduction is claimed. | `cross-surface-job116330597072.log`; formal migrations V0004 / V0012 and production repository method.                                                                                                                                                                                                                      | Repair and formal-schema hosted regression pending.                                                                                    |
| All three required acceptance keys             | Original requirements remain unchanged.                                                                                                                                                                                                                                                                                                                          | Pending; zero acceptance credit.                                                                                                                                                     | Original candidate's remaining hosted jobs are being collected before the next ordinary push.                                                                                                                                                                                                                               | Independent new-candidate review/CI, true PG and browser journeys, merge, immutable shared-dev delivery and new smoke remain required. |

### R4: formal schema compatibility of the targeted supply query

The repair changes only `RegulatoryRegistryRepository.findDispatchSupplyContext`:
`reg.vehicles c ON c.vehicle_id::text = v.vehicle_id` compares the canonical
UUID as text to the existing runtime key. This follows `loadState`'s string-key
association and preserves synthetic text IDs. It does not cast arbitrary
runtime IDs to UUID, change a migration, skip failed reads or fall back to cache.

The new `dispatch-supply-schema.hosted.test.ts` uses the existing isolated
PostgreSQL harness and all official migrations. It inserts data into the real
normalized table, writes both a textual vehicle and a UUID vehicle through the
production snapshot repository, then calls the actual targeted reader. It
checks both vehicles, normalized license metadata fallback, the correct
pair/driver context and exclusion of another service bucket. No reader or
schema is substituted. The old query is statically incompatible with V0004 /
V0012, but dynamic old/new PG results are still pending.

The original same-order dynamic-supply and persisted-role PG companions remain
unchanged. The socket-free namespace run completed with 15 passes / 3 hosted
skips, exit 0 (`review-namespace-after.log`); those skips are not PG passes.
All three required acceptance keys remain pending with zero credit. The full
old-candidate hosted unit/browser results will be retained before ordinary push;
the next candidate must obtain fresh same-SHA checks and review.

### R5: preserve the original offline demo under the new global provider

Exact candidate `507584277ab764aa67b2f9e62e5b12ff9edc3181` completed hosted
UI job `116330597209` with failure in the unchanged
`tests/e2e/pax-functional-demo.spec.ts:225`: the original local journey made
four unexpected `GET /api/passenger-app/review-demo/config` requests. The
subsequent new three-role browser command therefore did not execute, and its
missing artifact is not a browser pass. Full log:
`ui-route-job116330597209.log` in this round's evidence directory.

`ReviewDemoProvider` was mounted globally and fetched unconditionally. The
repair uses the real local demo store subscription and current route to skip
configuration requests on `/demo`, its child routes and any persisted active
local journey. Exiting local mode loads the existing shared configuration;
normal `/review` still enables the real shared flow. The old browser assertion
and all original local-demo behavior remain unchanged.

The new `review-context.test.tsx` renders the actual provider and uses the real
`startDemo` / `stopDemo` storage and events. Only Next's pathname and the external
configuration HTTP response are substituted. The provider was byte-identical
to candidate 507 when the new case reproduced 2 failures / 1 pass (exit 1,
`review-context-before.log`). Current source: 3 pass, exit 0
(`review-context-after-fixed-resolver.log`), covering initial local entry/terms, active local
journey reload and exit, and the positive shared review entry. Production
browser execution remains required; this React regression is not browser or
shared-dev delivery evidence.

The first post-change provider run resolved Next from the root peer variant,
so its pathname substitute did not reach the app dependency and the run failed.
The final fixture targets the app's own Next dependency; the successful result
above uses that resolution. The PG companion's initial typecheck errors were
fixture construction/bucket errors, corrected to the existing event publisher
and `standard_taxi` / `business_dispatch` contract before final verification.

### R3–R5 replacement verification closeout

The candidate identity is the full SHA and branch recorded by the next owner
handoff. Published history is preserved; local anchors `3e57a0a6f`,
`e1649b6dc` and `c9129e381` are recoverable checkpoints. No product, HTTP,
PostgreSQL, browser or Compose server was started on the VM.

| Finding / required acceptance                               | Source and final boundary                                                                                                                                                                                | Before → current result                                                                                                                                                          | Commands / evidence, exit codes                                                                                                                                                                                                                                                           | Still unverified                                                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R3: enabled integration substitutes lack target readers     | Five original integration fixtures now return their own initialized/written driver or authorization rows. All original assertions and failure injection remain.                                          | Three socket-free files: 3 failures / 2 passes → 5 passes. The original heartbeat restart case additionally passes; the HTTP case was excluded by its exact test-name selection. | Before/after integration logs above; `heartbeat-restart-after.log`, command `pnpm --filter @drts/api exec vitest run tests/integration/int-mob-001-batch-heartbeat-idempotency.test.ts -t 'reconstructs current tracking context'`: 1 pass / 1 deliberately unselected HTTP test, exit 0. | Full hosted integration, including the unchanged PG delayed-cancellation assertions and HTTP heartbeat case.                                   |
| R4: UUID / text supply join                                 | One production repository join converts only the normalized UUID key to text. Official-schema companion covers synthetic and normalized IDs, license fallback, pair/driver context and bucket exclusion. | Old hosted dispatch: HTTP 500; precise V0004/V0012 mismatch. Source repaired, formal PG result pending.                                                                          | `cross-surface-job116330597072.log`; `dispatch-supply-schema.hosted.test.ts`; local namespace 15 passes / 3 hosted skips, exit 0.                                                                                                                                                         | Both existing dynamic-supply and persisted-role companions plus the new formal-schema case must execute on hosted PG. No PG credit from skips. |
| R5: local demo unexpectedly calls the review API            | Actual global provider skips `/demo` routes and persisted local sessions, using the existing store; shared configuration still loads after exit and at `/review`.                                        | Exact hosted old browser failure and React 2 failures / 1 pass → React 3 pass.                                                                                                   | `review-context-before.log`, `review-context-after-fixed-resolver.log`; `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/review-context.test.tsx`, exit 1 → 0.                                                                                                      | Repeat unchanged production browser demo and then execute the new shared-order journeys.                                                       |
| `pax-review-demo_real-shared-order-across-roles`            | Original UUID/role/peer requirements and all original cases remain.                                                                                                                                      | Pending; zero acceptance credit.                                                                                                                                                 | Scoped R1/R2 root regression: 63 pass / 3 hosted skips; API regression: 60 pass, both exit 0. Logs: `r1-r2-root-regression.log`, `api-regression.log`.                                                                                                                                    | True formal-schema PG peer and browser results on the replacement SHA. Counts overlap other runs and are not additive.                         |
| `pax-review-demo_external-simulation-and-complete-journeys` | Three independent journeys and explicit external simulation labels remain unchanged.                                                                                                                     | Pending; zero acceptance credit.                                                                                                                                                 | Existing positive/negative session, registry, MultiTaxi and IAM cases above; production Passenger build exit 0 (`passenger-production-build.log`).                                                                                                                                        | Real hosted three-order completion, cancellation, payment retry/rating and abnormal controls. No SMS/GPS/PSP operational claims.               |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Same-candidate CI/review/merge, immutable shared-dev source and new hosted smoke remain required.                                                                                                        | Pending; zero acceptance credit.                                                                                                                                                 | Root typecheck exit 0 (`root-typecheck-final.log`); API production build exit 0 (`api-production-build.log`); original i18n guard: 646 files / 81 existing exemptions, exit 0; both scoped lint batches exit 0.                                                                           | Full replacement CI and original reviewer, merge, immutable publish/deployment and new shared-dev smoke. No deployed or completed claim.       |

### Final old-candidate hosted results: R4 confirmed, R6 and R7 located

The remaining original runs were read before any new push. Regular CI
`38707202722`, product-smoke job `116329714770`, completed with 9565 passes /
47 skips / 8 failures across three files (`product-smoke-job116329714770.log`).
The true `dynamic-supply.hosted.test.ts` failed at the production supply query
with `operator does not exist: character varying = uuid`, dynamically confirming
R4's schema diagnosis. This is an old-candidate failure, not a repaired PG pass.
The integration unit job `116330597088` finished as `cancelled`, with no complete
unit summary (`unit-job116330597088.log`); it was not cancelled by an owner push.

| Finding                                                     | Exact caller and minimal reproduction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Repair boundary / current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                          | Remaining verification                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R6: dispatch acknowledgement precedes its actual job write  | `persisted-roles.hosted.test.ts:78` calls peer HTTP assign immediately after dispatch; `prepareOrderAction` cannot find the returned job in PG. Controller `dispatchOrder` awaits an idempotent service callback that previously called synchronous `_executeDispatchOrder`, whose repository promise was only tracked in `pendingWorkflowWrites`. New `dispatch-ack.test.ts` calls the real controller/service/repository, gates only the external job INSERT and demonstrates that both successful-write and rejected-write cases acknowledged before the gate: 2 failures, exit 1 (`dispatch-ack-before.log`). | Return the original promise from `persistChanges`; the existing HTTP-required dispatch path awaits exactly that command's write before applying its result or completing idempotency. Internal synchronous callers and original dispatch preparation, guards, payload, reservations and persistence mechanism remain. No global write drain or cache fallback. The new probe checks response and inserted job identity, waiting behavior and propagation of a failed write. | Original peer formal-PG case, same-SHA full CI and cross-role browser remain required. First post-repair probe exposed an incorrect new fixture expectation of `orderId` in the existing `DispatchJob` response; it was corrected to the real `dispatchJobId` contract. This fixture issue is recorded separately from the successfully reproduced acknowledgement defect. |
| R7: C050 device-binding fixture has no readable master rows | Six failures in `tests/unit/system-remediation/sr-qa-driver-001/device-session-binding.test.ts`: its old enabled repository query returned `rows: []` for every call. The new authority reader therefore returns `DRIVER_NOT_FOUND` before the original binding/suspension assertions. Original file reproduces 6 failures / 1 pass, exit 1 (`device-binding-before.log`).                                                                                                                                                                                                                                        | Supervisor granted the exact existing file. Its fixture now uses the real repository and an external query boundary that writes/reads its own initialized driver records, following the existing session fixture. Original revoke, rebind, foreign/missing identity, suspension and documented multi-device behavior assertions are unchanged. No shared helper or product authorization change.                                                                            | Full original suite rerun and hosted candidate CI. This external query substitute is not PG evidence.                                                                                                                                                                                                                                                                      |

R3–R7 are one continued task. All earlier findings and all three original
required acceptance keys are retained; none receives acceptance credit from
these scoped checks. Source repairs still require the original reviewer and
replacement hosted evidence, normal merge and immutable shared-dev delivery.

Final replacement-source checks (all completed and results read):

- `final-root-regression.log`: 131 pass / 3 deliberately hosted-only skips,
  exit 0. Includes original OwnedMobility/idempotency/Ops map/session/registry/
  IAM cases, all new namespace cases, both dispatch-write probes and all seven
  original C050 assertions.
- `final-api-regression.log`: 243 pass, exit 0, including original Owned
  service/controller/repository/durable sinks/compliance, Forwarder/controller
  scope, registry, MultiTaxi and the three socket-free integration files.
- `heartbeat-restart-after.log`: 1 pass / 1 deliberately unselected HTTP case,
  exit 0; `final-root-typecheck.log`, `final-api-build.log` and `final-lint.log`
  all exit 0. Counts overlap earlier runs and must not be summed.
- Production Passenger build, original i18n guard and source format checks
  completed with exit 0 as recorded above. No product changes were made after
  these checks; the closeout adds documentation and evidence identity only.

R6's final success checks the returned `dispatchJobId` equals the ID of the
actually acknowledged INSERT for this order; failure returns the original
write rejection. R7's old 6 failures / 1 pass become all 7 passes. These
socket-free probes do not grant PG, HTTP-server, browser or shared-dev credit.
The original hosted R3 HTTP/PG assertions, R4 formal-schema and dynamic-supply
companions, R6 peer assignment and R5 unchanged demo browser must still pass
for the replacement candidate. All three required acceptance keys remain
pending until their original lifecycle evidence is recorded.

## Candidate 33fb hosted follow-up: R8 configuration module format

Source review approved candidate
`33fb3e1b5d2586e076807a184ab8e8c3e4f9d5cd`, generation
`68670d3680534e9cbd6411043fa5bbc9`, at 2026-10-15 09:17:28 UTC. Its own
integration job `116342719706` passed, as did cross-surface job
`116342719775`. These results do not grant the three acceptance keys.

Hosted UI job `116342719770` in run `38711016527` passed the original
offline Passenger browser (1 test) and Driver producer/storage cases (3 tests),
then failed before executing the new three-role browser. Playwright reported
`ReferenceError: exports is not defined in ES module scope` while loading
`playwright.pax-review-shared-order.config.ts:3:23`. Its CommonJS transform
retained `import.meta.url` from the profile path, causing Node 22 to treat the
transformed module as ESM. The absent new browser artifact is not a test pass.

| Finding / acceptance                                        | Source and repair boundary                                                                                                                                                                                                                                                         | Before → current result                                                                                                                                                                                                                           | Command / evidence                                                                                                                                                                                                                                                                                                                                    | Pending and limits                                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R8: rehearsal configuration cannot load                     | `playwright.pax-review-shared-order.config.ts` reads the same simulation profile using `resolve(__dirname, ...)`, consistent with the repository's CommonJS package. All server declarations, environment values, hosted-only guard, timeouts and browser assertions are retained. | Formal Playwright `loadConfigFromFile` on unchanged 33fb reproduces the same ReferenceError, exit 1. With the path repair the same probe loads all five declared servers and checks the actual OTP/payment profile, exit 0; no server is started. | Canonical `.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate-33fb-ci-followup/`: `ui-route-e2e.log`, `load-config-only.cjs`, `config-before.log`, `config-after-hosted.log`. Command: `GITHUB_ACTIONS=true NODE_PATH="$PWD/node_modules" node <evidence-dir>/load-config-only.cjs`; Node 22.23.2 / Playwright 1.59.1. | Shared-dev selection and non-hosted rejection probes, type/lint checks and full replacement hosted CI still required. Config loading is socket-free and cannot establish browser/PG behavior. |
| `pax-review-demo_real-shared-order-across-roles`            | Original same-UUID and real PG requirements remain.                                                                                                                                                                                                                                | Pending; zero credit.                                                                                                                                                                                                                             | Original 33fb PG/root results still being collected before the next push.                                                                                                                                                                                                                                                                             | New candidate must obtain its own review and CI.                                                                                                                                              |
| `pax-review-demo_external-simulation-and-complete-journeys` | Original three journeys, real internal transitions and explicit external simulation remain.                                                                                                                                                                                        | Pending; zero credit.                                                                                                                                                                                                                             | Original offline browser passed; the new journeys did not execute.                                                                                                                                                                                                                                                                                    | Three-role/browser/order evidence remains required.                                                                                                                                           |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Normal same-SHA review/CI/merge then immutable shared-dev delivery remain.                                                                                                                                                                                                         | Pending; zero credit.                                                                                                                                                                                                                             | Hosted UI failure above; original unit/product-smoke jobs still running.                                                                                                                                                                                                                                                                              | Preserve the original results before pushing; no merge/deploy/completion claim.                                                                                                               |

The first dependency install aborted with
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, exit 1, without replacing the
Supervisor-provided link to canonical dependencies. It is tooling evidence,
not a product test. Subsequent checks use an isolated worktree installation;
canonical dependencies and data are preserved. No product, browser, PG, preview
or Compose service is started on the VM.

R8 socket-free checks completed and results were read: the same actual
configuration loader passes the hosted profile (five declarations, no services
started) and shared-dev profile (zero declarations), while a non-hosted load
still rejects with the original hosted-only error. The negative probe exits 1
as expected; its verification wrapper exits 0. Logs are
`config-after-hosted.log`, `config-after-shared-dev.log` and
`config-after-local-denied.log`. The unchanged review namespace has 20 passes
and 3 hosted-only skips (`review-namespace.log`, exit 0). Root TypeScript,
scoped ESLint, Prettier and diff checks pass (all exit 0). The isolated frozen,
offline, scripts-disabled install completed (`isolated-install-fixed.log`,
exit 0), without modifying canonical dependencies.

The still-running 33fb unit job's partial log additionally reports one failed
`dynamic-supply.hosted.test.ts` case at 09:26:05 UTC. Its final stack and the
other two PG companion outcomes are pending collection; this failure is
retained as unresolved and is not inferred to be the config-loader defect.
The next source candidate has not been pushed while these original hosted
results remain outstanding.

### R8 reachable evidence helper and R9 final PG evidence query

The actual browser import graph contains one more `import.meta.url`, in
`tests/e2e/pax-review-shared-order/evidence.ts::requireApi`. After the config
repair, the real Playwright `loadTestFile` reproduces the same module-format
error there, exit 1 (`suite-before-fixed-probe.log`). Its source was unchanged
from 33fb. The helper now resolves the same API package path with `__dirname`,
retaining its real `pg` dependency and relational query. The collection-only
probe blocks server listen and child-process APIs and does not execute tests.
Its first invocation passed the wrong config argument to the internal loader
(`suite-before.log`, TypeError); this was a probe error and receives no product
reproduction credit. The corrected probe uses the actual loaded config.

All original 33fb jobs have now finished and were read before pushing:
regular product-smoke job `116342345746` has 9602 passes / 47 skips / 1 failure,
exit 1; integration-trunk unit job `116342719683` is cancelled, with no final
full-unit summary or pass credit. Owner did not cancel it or push new source
while it ran. The regular `test-results` artifact `11961980499` contains the
actual structured result; `regular-root-summary.json` extracts the three new
PG companions and their statuses. Raw logs and the original artifact ZIP are
retained in this round's canonical evidence directory.

### R8/R9 replacement-source verification closeout

Final source changes are limited to the two CommonJS-compatible path reads and
the real task-row JSON projection. Product services, SQL migrations, original
assertions, workflow gates, timeouts, role guards and deployment configuration
are unchanged in this follow-up. Anchors `090b6507d`, `540731931` and
`573bbcb2d` preserve the original candidate and each repair/evidence unit.

All locally started checks completed and their results were read:

- `suite-after-hosted-fixed-resolver.log` and
  `suite-after-shared-dev-fixed-resolver.log`: the actual Playwright 1.59.1
  loaders load config plus the real test module/helper and collect the original
  three-order test, exit 0 in each mode. No test body, server or browser runs.
  Earlier `suite-after-hosted.log` / `suite-after-shared-dev.log` used the
  canonical loader alongside the isolated worktree's Playwright instance,
  causing a duplicate-suite tooling error (exit 1), not a product regression.
  The corrected resolver is anchored to this worktree's `package.json`.
- `final-root-typecheck.log`, `final-lint.log`, final Prettier and diff checks:
  exit 0. Prior namespace results remain 20 passes / 3 hosted-only skips; none
  executes R9's repaired final PG query on this VM.
- `test-results.zip` matches GitHub artifact `11961980499`'s declared SHA-256
  `6762adc2dbb685e28298c4a269ddd8e86714fa61bde87539bf002020bc573f53`.
  `regular-root-summary.json` retains its actual one failed dynamic-supply
  assertion plus two passed PG companions. Regular full CI failed; cancelled
  integration-trunk unit has no full pass credit. Both runs' candidate head
  is 33fb; their checkout in the logs is the synthetic PR merge
  `15eb580a4bccae49f80a082e2dc3ba27ddf730aa`, not a deployment/merge claim.

The canonical evidence directory above includes `manifest.json` with command
results, original run/artifact identities and file hashes. The replacement
full SHA is recorded by the owner handoff after ordinary non-force push and
local/remote/PR-head agreement. New CI is pending and must establish the fixed
PG query and actual browser journeys. Original reviewer approval of 33fb does
not transfer to the replacement SHA. All three required acceptance keys
remain pending; no shared-dev deployment or completion is claimed.

| Finding / acceptance                                                 | Actual result / source                                                                                                                                                                                                                                                                                                                                                                                                                                | Repair and remaining verification                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R9: final dynamic-supply proof selects a nonexistent physical column | Real hosted `dynamic-supply.hosted.test.ts:335` fails with `column "driver_id" does not exist` after the actual prepare, cross-instance registration/profile/token/work-state, booking, dispatch/candidate/assignment, native acceptance and suspension assertions. V0011 defines the task row with `record jsonb`; production `OwnedMobilityRepository.persistChanges` writes the driver's ID inside that record, not a physical `driver_id` column. | Select `record->>'driverId' AS driver_id` from the same committed row. Preserve the existing order/driver/status equality assertion and all preceding guards. No product, migration, fixture, skip, timeout or retry changes. Replacement hosted PG is pending; static schema review and local hosted skips are not a repaired PG pass. |
| Prior R4 / R6 formal PG companions                                   | On 33fb regular CI, `persisted-roles.hosted.test.ts` and `dispatch-supply-schema.hosted.test.ts` each execute and pass without skips; integration-trunk also reports the former passed before cancellation.                                                                                                                                                                                                                                           | These establish the original source's targeted peer/ACK and supply-join repairs. They are retained as historical evidence; replacement CI must still execute them.                                                                                                                                                                      |
| All three required acceptance keys                                   | Still pending with zero credit. New browser never executed on 33fb.                                                                                                                                                                                                                                                                                                                                                                                   | Replacement source review, same-SHA full CI/browser/PG, normal merge, immutable shared-dev delivery and new smoke remain required.                                                                                                                                                                                                      |

## R10: review SMS response metadata entered the ordinary login command

Codex's 2026-10-15 09:44:26 UTC review reopened candidate
`9c784946ee129de82c7c13dde1ac16e8e3769c7b`, generation
`b3a44382eb144cc8b43a17fbe3c03fc7`, for
`review-otp-proof-response-spread-into-verify-command`. The same page was
unchanged from `33fb3e1b5d2586e076807a184ab8e8c3e4f9d5cd`. Original diagnosis:
canonical `.local/passenger-transport-bureau-review-20261015/review-demo-candidate33fb-otp-proof-request-shape-readonly-diagnosis.json`,
SHA256 `d6838ed2acfcdfd0fb41c6cbe4a0380013cfbe32239f75ec6078e6598d850903`.
This section extends R1–R9 and preserves their remaining verification duties.

The owner independently followed `PassengerOtpService.request` →
`ReviewDemoController.requestOtp` → `ReviewEntry` → `PassengerClient.login` →
Passenger BFF → `PassengerOtpController.verify`. The response really includes
`success`, `message` and `simulatedDelivery`; a TypeScript state annotation
does not remove them. The BFF preserves the verify body and the ordinary
parser rejects those extra fields before OTP consumption/session creation.

The only product repair is in `apps/passenger-app-web/app/review/page.tsx`:
save `{ challenge: result.data.challenge, code: result.data.code }` instead of
the entire response. Existing OTP parsers, service contracts, guards, profile
and consent writes, SDK, BFF cookies and hosted three-order assertions remain
unchanged. Anchors `dc907f1fc` and `44d2f5642` preserve the regression and repair.

`tests/unit/pax-review-shared-order-demo-20261015/review-login.test.tsx` renders
the actual page and runtime provider, clicks consent/SMS/login, invokes the
actual SDK and BFF and dispatches the serialized body to production review,
OTP and account controllers/services. Only HTTP transport and persistence
ports use an in-memory unit boundary; SMS uses the existing explicit review
provider. The real response serializer, OTP challenge consumption, account
creation, JWT signing/verification, BFF HttpOnly cookie issuance and token
redaction run. The test also checks unknown metadata and duplicate
provider/channel rejection, replay rejection, profile/consent persistence,
logout cookie clearing/session revocation and a second passenger's distinct
account/session. No localStorage account or generated token substitutes are
used. This is socket-free component/service evidence, not HTTP-server, PG or
browser evidence.

Canonical evidence directory for this repair:
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate-9c78-otp-caller-rework/`.
The manifest records source/log hashes, exact commands and exit codes. Node
22.23.2, pnpm 10.33.0, Vitest 4.1.4 and TypeScript 5.9.3 are used.

| Finding / acceptance                                        | Source and repair                                                                              | Before → repaired result                                                                                                                                                                                                       | Command / evidence                                                                                                                                                                                 | Remaining limits                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| R10: response spread prevents first review login            | Actual `ReviewEntry` OTP response handler projects challenge/code; production parser unchanged | On unchanged 9c784946 product source, the new page/SDK/BFF/parser case fails with 400 where 200 is required (exit 1). The identical case after projection passes (exit 0), including actual account/session and negative cases | `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/review-login.test.tsx --maxWorkers=1 --reporter=verbose`; `before-final.log`, `after.log`                                   | Hosted actual browser login and all three journeys still required                     |
| R1–R9 affected offline regression                           | Entire review namespace plus original OTP and account/session namespaces                       | 202 pass, 3 hosted-only skips, exit 0; counts overlap the focused case and must not be added                                                                                                                                   | `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/ tests/unit/pax-otp-20261009/ tests/unit/pax-account-session-20261009/ --maxWorkers=2 --reporter=verbose`; `regression.log` | Three skips are the original PG companions; no PG pass credit                         |
| `pax-review-demo_real-shared-order-across-roles`            | Original persisted order/task/dispatch assertions retained                                     | Pending, zero credit                                                                                                                                                                                                           | Same-candidate hosted full CI and all three formal-schema PG companions required                                                                                                                   | In-memory account stores in this regression do not demonstrate PG or peer order reads |
| `pax-review-demo_external-simulation-and-complete-journeys` | Original real three-order browser remains unchanged                                            | Pending, zero credit                                                                                                                                                                                                           | New candidate's genuine login, role UI, payment/rating/case/cancellation journey evidence required                                                                                                 | Unit login does not grant browser/journey credit                                      |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Original hosted lane and immutable Cloud Run deployment retained                               | Pending, zero credit                                                                                                                                                                                                           | Same-SHA review/CI, normal merge, immutable publish/deploy and new shared-dev smoke required                                                                                                       | No runtime, browser, preview, PG or Compose service starts on this VM                 |

The Supervisor-provided task-root `node_modules` link pointed at canonical
dependencies with missing/broken links. The owner unlinked only that task
symlink and completed `CI=true pnpm install --frozen-lockfile --offline
--ignore-scripts` in this worktree (exit 0, `install.log`). No tracked package
or lockfile change and no canonical dependency/data mutation occurred. This
installation is tooling evidence, not product verification.

The final regression is also rerun against the immutable 9c784946 page using
`vitest.before.config.ts` in the evidence directory. Its Vite load hook obtains
that exact page with `git show 9c784946ee129de82c7c13dde1ac16e8e3769c7b:<path>`;
all real imports and the current regression remain in place. Command:
`pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/review-login.test.tsx --config .local/pax-review-shared-order-demo-20261015/otp-caller-rework/vitest.before.config.ts --maxWorkers=1 --reporter=verbose`.
It reproduces the same 400 assertion failure, exit 1
(`immutable-before.log`), without editing/resetting the active product tree.

Root typecheck, Passenger `next typegen && tsc --noEmit`, scoped ESLint and
format checks pass. Because the root tsconfig does not include `.tsx` tests,
the owner also explicitly includes this new regression in the temporary
`tsconfig.review-login.json`. Its initial run found only a test transport
`RequestInit.signal` type mismatch (exit 2, `login-typecheck.log`); specifying
the method/headers/body passed to `NextRequest` fixes it without changing
product behavior or assertions. The final explicit test typecheck passes
(exit 0, `login-typecheck-final.log`). `regression-final.log` records the final
combined regression after that adaptation. Earlier failed probes remain
recorded rather than counted as passes.

## R11–R12: preserve the completed 9c784946 CI results and repair its failures

Both original 9c784946 workflows finished naturally before any replacement
push: integration run `38714607388` and regular run `38714607466` each ended
with failure. Their `cancel-in-progress: true` configuration was retained;
the owner did not cancel them or supersede their unfinished checks.

- Regular Product smoke job `116354366639` reports root **9617 pass / 47
  skip**, including **one actual pass each** for `persisted-roles.hosted`,
  `dynamic-supply.hosted` and `dispatch-supply-schema.hosted`. These are the
  original candidate's PG results, including R9's repaired JSON projection;
  they are not replacement-candidate acceptance credit.
- The subsequent API unit suite fails **8 tests / 1726 pass**. Every failed
  test is in `apps/api/tests/unit/auth-bootstrap.test.ts`, all under the
  existing driver device-session controller cases. The stack reaches
  `prepareDriverAuthority` → `requireDriver`, returning `DRIVER_NOT_FOUND`;
  the invalid-certification case receives 404 before its original 403 check.
  Integration-trunk unit job `116354796182` also fails. No full CI pass claim.
- Integration job `116354796105` passes its original 49 files / 348 tests;
  cross-surface job `116354796409` passes 2 files / 5 tests.
- UI job `116354796327` passes the original 39-route suite, tenant map 5,
  partner booking 21, concierge map 6, original Passenger offline browser 1
  and Driver producer/storage 3. The new three-order browser executes and
  fails at line 377 while waiting for the Ops prepared message, before
  driver registration or Passenger login. These old results are retained
  separately from the new unverified journeys.

The actual new-browser artifact `11962508992` is preserved as
`prior-ui-artifact.zip`; its metadata and downloaded SHA256 both equal
`1704db050dd9d8bc9f9d1da204d21192aa047fb4a1a40a4755551a1995458524`.
It contains the original report and error-context, with no successful order
evidence. The original browser does not capture the prepare response status;
the 401 below is an independent socket-free reproduction, not a claimed
hosted network trace.

| Finding / acceptance                                                     | Source and repair boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Before → repaired result                                                                                                                                                                                                                                                                                                            | Command / evidence                                                                                                                                                                                                   | Remaining limits                                                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R11: Ops prepare command is placed under the Passenger session namespace | Actual Ops `SharedOrderReviewOps.command` sent `/api/passenger-app/review-demo/prepare`. Unchanged `BootstrapAuthGuard.canActivate` treats this prefix as a Passenger session request before ordinary realm handling; the real Ops BFF issues an Ops proxy token. Move only prepare to `ReviewDemoOpsController` at `/api/ops/review-demo/prepare`, register it in `PassengerAppModule`, and update the existing Ops caller. Retain the exact `RequireRealms("ops", "platform", "system")`, flag check and original `ReviewSupplyService.prepare`; remove the unusable Passenger prepare route. No guard/policy/IAM changes. | Actual page/SDK/BFF/guard probe on the old route returns 401 `unauthorized`, before supply invocation (exit 1). Repaired route returns 200 with real Ops identity and displays the original prepared message (exit 0). Anonymous and Passenger requests still reject; disabled rehearsal still returns 404 before supply execution. | `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/ops-prepare-route.test.tsx --maxWorkers=1 --reporter=verbose`; `ops-route-before-fixed-probe.log`, `ops-route-after.log`. Anchor `b11f350b8`. | The supply executor is a controlled boundary in this route test; it does not claim PG/supply/browser success. The unchanged formal-schema companions and new actual hosted UI must execute on the replacement candidate. |
| R12: API auth-controller fixture cannot read its own driver master rows  | `apps/api/tests/unit/auth-bootstrap.test.ts::createAuthFixture` used the existing enabled repository helper whose external query always returned no rows. Its local query boundary now retains the fixture's seeded and actually saved driver records for the production repository's targeted reader. Shared helper and all production services/guards remain unchanged.                                                                                                                                                                                                                                                    | Same original file: 8 fail / 93 pass, exit 1 → 101 pass, exit 0. All existing registration, refresh, revoke, admin recovery, rebind, invalid-certification and suspension assertions are retained.                                                                                                                                  | `pnpm --filter @drts/api exec vitest run tests/unit/auth-bootstrap.test.ts --maxWorkers=1 --reporter=verbose`; `auth-bootstrap-before.log`, `auth-bootstrap-after.log`. Anchor `60b36fe7f`.                          | Unit database boundary only; no new PG claim and no pass credit for the failed original full CI.                                                                                                                         |
| R10/R11 immutable reproduction                                           | `vitest.before.config.ts` supplies the exact 9c784946 Passenger page, Ops page and review controller using `git show`; it retains real imported SDK/BFF/guard/parser modules.                                                                                                                                                                                                                                                                                                                                                                                                                                                | Final two UI cases both fail for their actual original defects, exit 1; repaired-source regression recorded separately.                                                                                                                                                                                                             | `two-ui-immutable-before-final.log`; run the same config command with both `review-login.test.tsx` and `ops-prepare-route.test.tsx` as arguments.                                                                    | No active worktree reset or historical-source edits.                                                                                                                                                                     |
| All three original required acceptance keys                              | Original real shared order / external simulation and three journeys / hosted browser and immutable shared-dev delivery requirements remain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Pending, zero credit for replacement candidate.                                                                                                                                                                                                                                                                                     | Same-SHA review/full CI, all three real PG companions, genuine hosted three-role UI, normal merge, immutable publish/Cloud Run deploy and new smoke.                                                                 | No VM product/HTTP/PG/browser/preview/Compose services; no fabricated session, SQL business shortcut, skipped login, weakened assertion, timeout or CI-gate change.                                                      |

The first Ops probe used jsdom's HTTP `import.meta.url` with Node's
`createRequire` and failed before collecting tests (`ops-route-before.log`,
exit 1). Resolving the actual API package from the worker cwd fixes the probe;
only the subsequent 401 assertion is reproduction evidence. Its first explicit
TSX typecheck also reported a test-only optional `headers` mismatch; normalize
that transport value with `new Headers(init?.headers)`. Both tooling failures
remain recorded, without product failure/pass credit. Existing review
controller constructor callers were adapted only to remove its moved supply
dependency; their original ownership assertions remain intact.

### R10–R12 replacement-source verification closeout

All owner-started checks have finished and their results were read:

- `closeout-regression.log`: **203 pass / 3 original hosted PG skips**,
  exit 0, across the full review namespace plus original OTP and Passenger
  account/session namespaces. Both actual UI callers pass along with their
  original positive and negative paths. Counts overlap prior focused runs.
- `auth-bootstrap-after.log`: **101 pass**, exit 0, for the unchanged original
  API auth-controller assertions with their corrected external row fixture.
- `two-ui-immutable-before-final.log`: **2 expected failures**, exit 1, using
  the final UI regressions against the immutable old source. The failures
  remain the actual Ops route 401 and Passenger OTP command 400; no import or
  dependency failure is counted as reproduction.
- `closeout-root-typecheck.log`, `closeout-api-build.log`,
  `two-ui-tests-typecheck-final.log`, `closeout-lint.log`, final format and
  diff checks: exit 0. Earlier Passenger route generation/typecheck also
  passed; its page source is unchanged since that check except for the
  already verified OTP projection. No API/product runtime is started by the
  TypeScript build.

The final repair changes only the Passenger OTP proof projection, the Ops
prepare route/controller registration and caller, its minimal constructor
test adaptations, and the original API test fixture's external row boundary.
The original browser steps, three UUID assertions, formal PG schema/repository
companions, service business rules, authorization policy/guards, workflow
gates, timeouts and deployment configuration remain unchanged. The final
canonical evidence manifest identifies the exact normally pushed candidate,
all nine source hashes and the original plus replacement-check logs.

Replacement same-SHA source review/full CI, actual three-role browser and
formal PG runs, normal merge, immutable shared-dev deployment and new smoke
remain outstanding. Neither original PG greens nor socket-free UI/service
passes satisfy the three required acceptance keys by themselves.

## R13: retain cancellation evidence and give the existing journey its own job

Candidate `8202fd6cd154e6c11aee5b7e4eb3301bf8be7081`, generation
`fff1329b386e4e609bcbc1bb8f713b65`, received Codex's source approval at
10:13:13 UTC. Both original CI workflows have now finished naturally:

- Regular run `38718262317` succeeded. Product smoke job `116366360799`
  reports root **9619 pass / 47 skip**, API **1734 pass / 0 skip** and one
  actual pass each for all three original formal-schema PG companions.
- Integration-trunk run `38718262400` was cancelled by its existing job
  deadlines. Unit job `116366719848` exceeded **20 minutes**; its final
  **9591 pass / 75 skip** output does not turn that cancelled job green.
- UI job `116366719855` exceeded **25 minutes**. It passed the original
  route/tenant/partner/concierge suites (**39 / 5 / 21 / 6**), original
  Passenger offline case (**1**) and Driver producer/storage cases (**3**).
  The runner announced the new case at **10:24:44.780766 UTC** and the job was
  cancelled at **10:36:20.531398 UTC**, before the original 720-second case
  limit could report a failure. No new case result, order UUID or shared-order
  artifact was produced. Starting the case is not three-order completion;
  the missing artifact does not mean the case never started.

Raw logs and GitHub annotations establish execution limits, but cannot locate
the precise uncompleted UI operation. No product bug or product fix is inferred
from those cancellations. The Supervisor's original task specification update
at 10:40 UTC explicitly supersedes the earlier same-job placement assumption:
the same existing three-order case may have its own job in `ci-integ.yml`,
retaining the existing 25-minute limit and mandatory original aggregate.

The replacement changes only execution placement and diagnosis:

- `ui-route-e2e` keeps all five original browser commands and its offline-demo
  artifact. `ui-shared-order-e2e` has the same candidate/scope conditions and
  its own original PostGIS/migration/seed setup, real API, production PAX and
  mounted/standalone Driver exports. It runs the original Driver checks and
  the same one-test/three-order case. Both results are required by the existing
  `e2e` aggregate, which remains required by `ci-integ`.
- `createJourneyProgress` writes `safe-progress.json` before each major UI
  operation, updates completed/failed states, and immediately records only
  role/method/allowlisted pathname/status. It records no response body,
  headers, origin, query/fragment, OTP, invitation code or exception text.
  Its file is inside the existing shared-order artifact directory; a killed
  test no longer needs teardown or reporter completion to leave its last stage.
  The mounted Driver page is observed too. Fixed stage names also reach stdout.
- The journal does not alter operation results or swallow exceptions. The
  original 160 `expect` calls and their order are identical under TypeScript
  AST normalization. Business waits, role login, UUID, history, payment, case,
  freshness, real pickup time and all original timeouts remain intact. Product
  source, auth policy, IAM, deployment configuration and other CI jobs are
  unchanged in this replacement.

Evidence directory, retained alongside all R1–R12 evidence:
canonical `.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate8202-hosted-results/`.
Its final manifest binds the normally pushed candidate, source hashes, commands,
tool versions, historical logs and replacement results.

| Finding / acceptance                                                   | Source / repair                                                                                                        | Old result → replacement verification                                                                                                                                                                         | Evidence / command                                                                                                                                                                 | Remaining limits                                                                                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R13: new case has no time to finish/report within the old combined job | `ci-integ.yml::ui-shared-order-e2e`, original `e2e` aggregate; original spec plus `progress.ts::createJourneyProgress` | Actual old job cancellation with no new artifact → socket-free journal test proves the started stage and safe endpoint facts are persisted before completion, and thrown errors propagate with a failed stage | `journey-progress.test.ts`; `progress-test.log`; old `ui.log`, `unit.log`, GitHub deadline annotations                                                                             | Precise old hang remains unknown. A replacement hosted run must localize it and execute all three orders; journal tests are not browser evidence |
| Original suite and timeout preservation                                | Existing workflow/jobs and unchanged browser assertions                                                                | Five legacy browser commands and exactly one new case retained; both required by the original aggregate; 25-minute limits unchanged; all other jobs unchanged                                                 | `workflow-placement-proof.py` / `.json`; existing workflow timeout/scope/coverage checks, 17 tests pass; `assertion-invariance.json`, 160 original/current calls in the same order | Structural verification starts no runtime and grants no CI green                                                                                 |
| `pax-review-demo_real-shared-order-across-roles`                       | All original production repositories and three PG companions retained                                                  | 8202 historical three PG passes retained; replacement acceptance pending, zero credit                                                                                                                         | Replacement same-SHA full CI and genuine three-role UUID/peer readback required                                                                                                    | No PG/browser runtime is started on this VM                                                                                                      |
| `pax-review-demo_external-simulation-and-complete-journeys`            | Original three independent journeys and external-provider disclosures retained                                         | Pending, zero credit                                                                                                                                                                                          | Replacement hosted one-test/three-order completion, relational records and role screenshots required                                                                               | No successful orders are inferred from the old `Running 1 test` line                                                                             |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`               | Same existing hosted workflow and original combined shared-dev delivery task                                           | Pending, zero credit                                                                                                                                                                                          | Same-SHA source review/full CI, normal merge, immutable combined publish/Cloud Run deployment and new shared-dev smoke required                                                    | No separate Demo-only publisher, deploy or old-release substitution                                                                              |

Initial root typecheck used the Supervisor's canonical dependency symlinks and
failed with missing packages and mixed canonical/worktree private class types
(`typecheck.log`, exit 2). This is not a product assertion result. The owner
removed only this task worktree's 22 dependency symlinks and completed
`CI=true pnpm install --frozen-lockfile --offline --ignore-scripts` (exit 0,
`install.log`). Canonical dependencies, tracked manifests and lockfiles were
not changed. Replacement checks and their final results are recorded separately.

R13 replacement-source checks have finished: full review/OTP/account-session
namespaces **204 pass / 3 original hosted-PG skips**, exit 0
(`regression-final.log`); root `tsc -p tsconfig.json --noEmit` and scoped
ESLint exit 0 after isolated dependency installation (`typecheck-final.log`,
`lint-final.log`). The real Playwright config and suite load in both hosted
and shared-dev modes, collecting the original one case with **zero test bodies,
zero browsers and zero servers executed**. The configuration still declares
five hosted servers and zero shared-dev servers, with the same 720-second case
limit. Collection is not browser acceptance. Existing workflow checks pass
17 tests; the separate YAML placement probe and final assertion invariance
probe pass. Code/workflow formatting and `git diff --check` pass. All original
acceptance keys remain pending for the replacement candidate.

## R14 — hosted Passenger loopback Origin / real BFF OTP 403

The adjacent reviewed candidate is `cacbf41cf5db2a75f727b44cd70d40cdaadd8324`
(PR #2643, generation `1bc8f013f6454fac9bb7e8b2697f9e73`). Its genuine
hosted browser run `38722534735`, job `116381648484`, failed: Ops prepare
201/invite 201 and Driver register 201/jobs 200 passed; Passenger config was
200, then `POST /api/passenger-app/review-demo/otp` returned 403. No A/B/C
UUID was created. The 720-second timeout and context-close cleanup error are
later consequences. The old safe journal did not capture the response body;
its internal error code cannot be retroactively claimed as observed.

Source diagnosis follows the actual caller, not a guessed provider failure:
`ReviewEntry` posts `{ target }` to the BFF; `route.ts::checkCSRF` compares
Origin with `new URL(request.url).origin` before forwarding. The path allowlist
permits this POST, it needs no Passenger cookie, and
`ReviewDemoController::requestOtp` is an open route using the ordinary OTP
service. With the exact locked Next **16.3.8**, its real `NextRequest` normalizes
`http://127.0.0.1:3319` to `http://localhost:3319` while preserving Origin as
`http://127.0.0.1:3319`. The original hosted config and browser default used
the IP, so the formal BFF reproduces **403 / CSRF_CHECK_FAILED** without
reaching upstream HTTP.

The bounded repair makes the hosted Passenger Next bind hostname, readiness
URL and browser default all `localhost:3319`. Shared-dev environment overrides
and production BFF/CSRF/auth/OTP code remain unchanged. A new assertion waits
for the real button's OTP response and checks success immediately, before the
next login action; on failure its message includes only status and the fixed
known code `CSRF_CHECK_FAILED` or `unclassified`, never a raw response or OTP.
All original journey assertions, genuine login and business waits remain.

| Finding / acceptance                                        | Source / repair                                                                                                                  | Old result → replacement verification                                                                                                                                                                    | Evidence / command                                                                                                                                  | Remaining limits                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R14: configured loopback origin fails OTP before upstream   | `playwright.pax-review-shared-order.config.ts`, original spec Passenger origin; unchanged BFF `checkCSRF` and real `NextRequest` | Same test on untouched cacbf sources: 1 assertion failure, 6 refusal cases pass; the failure is actual 403 / CSRF_CHECK_FAILED, not an import error. Replacement: all 7 pass within the final regression | `hosted-passenger-origin.test.ts`; local `r14-origin/before.log`, `before-source-binding.json`, `next-request-probe.log`, `regression.log` (exit 0) | Mocked boundary is upstream HTTP only. This proves the configuration defect, not the uncaptured old browser response body or a completed journey |
| OTP HTTP failure visibility                                 | Original real button/response in `pax-review-shared-order-demo.spec.ts`                                                          | New success assertion precedes the existing login button action                                                                                                                                          | Same original hosted one-test/three-order runner required                                                                                           | No retry, timeout increase, account substitute or CSRF relaxation                                                                                |
| `pax-review-demo_real-shared-order-across-roles`            | Original real repositories and three PG companions retained                                                                      | Pending, zero new credit                                                                                                                                                                                 | Same-candidate CI, three formal PG companions and browser UUID/peer readback                                                                        | No VM runtime/PG/browser started                                                                                                                 |
| `pax-review-demo_external-simulation-and-complete-journeys` | All original A/B/C journey assertions retained                                                                                   | Pending, zero credit                                                                                                                                                                                     | Hosted three-order completion and relational/screenshot evidence                                                                                    | Unit transport mock gives no journey credit                                                                                                      |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Original workflow and combined immutable shared-dev delivery retained                                                            | Pending, zero credit                                                                                                                                                                                     | New source review/full CI, normal merge, combined publish/Cloud Run deployment and fresh shared-dev smoke                                           | No separate publisher/deployment or historical-result substitution                                                                               |

Machine-specific evidence is retained under local
`.local/pax-review-shared-order-demo-20261015/r14-origin/` and copied to canonical
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidatecacbf-otp-origin-rework/`
at handoff. The Supervisor restored
canonical dependency symlinks before this dispatch; their Next version was
16.2.3. The owner removed only this worktree's 22 `node_modules` symlinks and
installed the frozen lock offline with scripts disabled (exit 0). All actual
reproduction results above use locked 16.3.8; canonical dependencies and tracked
manifests/lockfile were not modified.

The final affected review/OTP/account-session/web-shell regression completed
**263 pass / 3 original hosted-PG skips**, exit 0 (`regression.log`), including
the actual review page, strict OTP parsers, account/JWT/session behavior and BFF
tests. Root `tsc -p tsconfig.json --noEmit`, scoped ESLint, formatting and
`git diff --check` all completed with exit 0. The TypeScript AST comparison
against cacbf retains all **160 original assertion-call nodes in order** and
adds only the single immediate OTP success assertion (two call nodes);
`assertion-invariance.cjs` / `.json` also confirm the integration workflow and
product Passenger BFF are byte-for-byte unchanged. No Playwright CLI, test body,
browser, product server or PG runtime was started on this VM. These are scoped
source checks only: the replacement candidate's full hosted CI, three PG
companions, all three real UI journeys, review/merge and immutable combined
shared-dev delivery remain pending, with no acceptance credit borrowed from
cacbf or earlier candidates.

## R15 — native fetch receiver in the real review callers

The adjacent candidate is `469ff83fb96272cb04cd353c278996e7b1598f13`,
generation `061672f6c0744164a0b5015b89622bc7`, PR #2643. Its new hosted
browser run `38726751853`, job `116400119099`, really failed in 34.398 seconds
with zero skips: Ops supply/invite and Driver bootstrap passed, review OTP
returned 201, and the Passenger account output did not appear after clicking
login. No A/B/C order was created. The original artifact `11969949181` ZIP
has SHA256 `7c817cff6c5260189f32481f44c07486a3fffd3054b618a7ab2df5119cd68618`.
Its error-context and safe journal were read; neither records the subsequent
verify/account HTTP result or a JavaScript exception. The old browser's
underlying exception/status remains unobserved.

The actual call path is `ReviewEntry` → `PassengerClient.login/request` →
Passenger BFF → strict `PassengerOtpController.verify` → ordinary OTP/account
services, followed by real profile/consent updates and account readback.
The review page supplies native `fetch` directly as `fetchFn`. The SDK calls
`this.fetchFn(...)`, making the SDK object the platform operation's receiver.
The review record page supplies the same unbound function. Other live Passenger
callers already pass the `passengerFetch` wrapper, which calls `fetch` normally.
The [Fetch method](https://fetch.spec.whatwg.org/#fetch-method) is a global
interface operation; [Web IDL operation invocation](https://webidl.spec.whatwg.org/#dfn-create-operation-function)
checks its receiver. Node/arrow-function HTTP mocks did not enforce this browser
boundary, which explains why the earlier unit case could miss this source defect.

The bounded product repair supplies `(url, init) => fetch(url, init)` in the
review entry and record page. Both continue to use live HTTP, the same SDK,
BFF and API contracts. Neither wrapper chooses local demo transport. OTP
projection, consent/profile writes, session cookies, account ownership and all
business guards remain unchanged. The test journal additionally permits only
the exact verify and account endpoint paths, retaining role/method/path/status
without bodies, query strings, credentials, OTPs or exception text.

| Finding / acceptance                                                  | Source / repair                                                                                                  | Old result → replacement result                                                                                                                                                                                                                 | Command / evidence                                                                                                                                                                                                                                                                      | Remaining limits                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R15: native fetch receives the SDK object during genuine review login | `app/review/page.tsx`; unchanged production `PassengerClient.request`, BFF, OTP/account controllers and services | On unchanged 469 product files, the real page/button regression fails with rejected `/me` and `/auth/otp/verify` invocations, exit 1. With the wrapper, genuine login/profile/consent, replay refusal, logout and second-account isolation pass | `review-login.test.tsx`; `before-source-binding.json`, `before-login.log`, `after-focused.log`                                                                                                                                                                                          | Native receiver behavior and HTTP/persistence are simulated unit boundaries. This is not actual Chromium execution or proof of the uncaptured historical exception                               |
| Same receiver defect in the record entry                              | `app/review/records/[id]/page.tsx`, real component and SDK                                                       | Untouched 469 record caller fails the receiver assertion, exit 1; wrapper renders the returned record and download control                                                                                                                      | `review-record-fetch.test.tsx`; `before-record-qualified.log`, `after-focused.log`                                                                                                                                                                                                      | HTTP record fixture only; no ownership, PG or completed-journey credit. Initial `before-record.log` failed because the test omitted async React `act`; it is not qualified reproduction evidence |
| Missing verify/account failure localization                           | `tests/e2e/pax-review-shared-order/progress.ts` and original journal regression                                  | All three focused cases pass, exit 0; verify 201, account GET 200 and PATCH 400 are retained without URL secrets                                                                                                                                | `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/review-login.test.tsx tests/unit/pax-review-shared-order-demo-20261015/review-record-fetch.test.tsx tests/unit/pax-review-shared-order-demo-20261015/journey-progress.test.ts --maxWorkers=2 --reporter=verbose` | New same-source hosted execution still required; original browser assertions and waits unchanged                                                                                                 |
| `pax-review-demo_real-shared-order-across-roles`                      | Original formal PG companions and UUID/peer assertions retained                                                  | Pending, zero new acceptance credit                                                                                                                                                                                                             | Replacement candidate full CI, three PG companions and three-role browser                                                                                                                                                                                                               | VM runtime/PG/browser prohibited                                                                                                                                                                 |
| `pax-review-demo_external-simulation-and-complete-journeys`           | Original complete A/B/C journeys retained                                                                        | Pending, zero credit                                                                                                                                                                                                                            | Replacement hosted three-order evidence                                                                                                                                                                                                                                                 | Unit transport success does not establish journey completion                                                                                                                                     |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`              | Existing workflow and combined immutable Cloud Run delivery retained                                             | Pending, zero credit                                                                                                                                                                                                                            | Same-SHA review/full CI, normal merge, combined immutable publish/deploy and fresh shared-dev smoke                                                                                                                                                                                     | No old-browser rerun, separate deployment or historical PASS substitution                                                                                                                        |

Evidence is recorded in worktree
`.local/pax-review-shared-order-demo-20261015/r15-login/` and copied at handoff
to canonical `.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate469-native-fetch-rework/`.
`before-source-binding.json` verifies all four relevant product source hashes
against immutable 469 before repair. Tests use Node 22.23.2, pnpm 10.33.0,
locked Next 16.3.8 and Vitest 4.1.4. Only this worktree's 22 restored canonical
dependency symlinks were unlinked, followed by offline frozen installation with
scripts disabled, exit 0; canonical dependencies and tracked lockfiles remain
unchanged. No product server, browser, Playwright CLI, PG or Compose was started.
Final affected review/OTP/account-session/web-shell/web-auth regression completed
**384 pass / 3 original hosted-PG skips**, exit 0 (`regression.log`). The focused
three-case run also completed, exit 0 (`after-focused.log`); counts overlap.
Root typecheck, Passenger `next typegen && tsc --noEmit`, explicit typecheck of
both TSX regressions, scoped ESLint, Prettier and `git diff --check` all completed
with exit 0. The TypeScript AST/source probe confirms all 28 original login
assertion-call nodes remain in order (30 now), and the original browser spec,
config, CI/deploy workflows, SDK, BFF and OTP/account controllers/services are
byte-identical to 469 (`source-invariants.cjs` / `.json`).

The final identical two regressions were also run with a local Vite load hook
reading only the two product pages from immutable 469 via `git show`, without
resetting or editing the active tree. Both fail specifically at the receiver
assertions, exit 1 (`immutable-before.log`), while their repaired sources pass
in the final regression. Command: `pnpm exec vitest run
tests/unit/pax-review-shared-order-demo-20261015/review-login.test.tsx
tests/unit/pax-review-shared-order-demo-20261015/review-record-fetch.test.tsx
--config .local/pax-review-shared-order-demo-20261015/r15-login/vitest.before.config.ts
--maxWorkers=2 --reporter=verbose`. The earlier hook-config attempt used an
incorrect relative config import and failed at startup
(`immutable-before-config-error.log`); it is not reproduction evidence.
All local checks have terminated and their results were read. The original
469 run's remaining jobs are left to its existing collector; no rerun or
cancellation was requested. These changes require new same-source review and
hosted CI/browser/PG results before any of the original acceptance keys qualify.

## R16 — hosted booking caller follows the actual page controls

Adjacent candidate `4981eb876369967293a63cb2aecc963876267fec`, generation
`5cf7d7ad308c4aa9af583958829ee3d9`, was source-approved by the assigned reviewer.
Its hosted run `38732133441`, job `116413522566`, failed one browser case in
34.7 seconds, zero skips. The safe journal now proves ordinary OTP verification
201, account GET/PATCH 200 and the successful simulated PSP binding stage.
The next stage, `A Passenger book`, failed at the nonexistent heading locator;
there is no created order UUID or completed A/B/C journey. Artifact `11971113636`
ZIP SHA256 is `58bd9de21db9c1359a8551bc70f00f03a8e76b175a91c5bb29916ac62b03629b`,
matching GitHub's artifact digest. The journal/error context and direct job log
are under `.local/pax-review-shared-order-demo-20261015/r16-hosted/`.

The actual root is `Home` → `PaymentBookingHome` → `BookingScreen` →
`AuthScreen`/`P5Header`. The existing title is a styled `div`, not a heading.
`BookingScreen` first loads settings and any required fee acknowledgement,
then displays `BookingForm`; its payment radio controls are in the subsequent
`BookingConfirmationSheet`, after quote. The old `book()` instead requires a
heading, uses ordinary address labels instead of the actual `DEMO_T.pickup` /
`dropoff` values (`示範上車地點` / `示範下車地點`), samples the fee button
before loading completes, and selects payment before quote. These are test caller
mismatches; product UI and business rules are retained.

The new socket-free regression reads/transpiles the actual `book()` declaration
from the hosted spec and drives the real root components, SDK and BFF through a
Testing Library DOM adapter. Only the browser driver/assertions and upstream HTTP
are simulated. It covers both first-use and already-recorded fee acknowledgement.
With all five relevant source hashes matching immutable 4981, both cases fail at
the title lookup (`before.log`, exit 1), with the real title and form/disclosure
present in DOM. An initial harness run lacked Next's router context and failed
before exercising the caller (`before-harness-error.log`); it is not qualified
reproduction evidence.

| Finding / acceptance                                                            | Source / repair                                                                                                                    | Old → repaired result                                                                                                         | Command / evidence                                                                                                                                                                                                                                                                                                                               | Remaining limits                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R16: nonexistent heading, ordinary address labels and early fee-button sampling | Actual `Home`, `PaymentBookingHome`, `BookingScreen`, `BookingForm`, `P5Header`, `DEMO_T`; only the hosted `book()` caller changes | Same final two regressions against immutable 4981 fail at the heading; repaired caller passes for both acknowledgement states | `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/hosted-booking-caller.test.tsx --config .local/pax-review-shared-order-demo-20261015/r16-hosted/vitest.before.config.mts --maxWorkers=2 --reporter=verbose`, exit 1, two assertion failures (`final-immutable-before.log`); source hashes in `before-source-binding.json` | Socket-free DOM driver and external HTTP fixtures, not Chromium or PG. The historical browser proves only its first locator failure; subsequent caller mismatches are from production source and the DOM regression |
| R16: payment controls belong to the quote confirmation                          | `BookingScreen` confirmation branch and `PaymentMethodChoice`; move exact method selection after quote in `book()`                 | Repaired caller submits exactly one ride using the requested nondefault card even with another default card present           | Final focused run of `hosted-booking-caller.test.tsx` plus `journey-progress.test.ts`, 3 pass, exit 0 (`final-focused.log`)                                                                                                                                                                                                                      | External quote/payment/order responses are fixtures; no claim of real booking or PSP capture                                                                                                                        |
| Safe booking failure localization                                               | Existing `createJourneyProgress.response` adds exact settings/fares/quotes/payment-methods paths                                   | Real journal regression retains status/method/path without response bodies or URL secrets                                     | Same focused run, exit 0; existing secret omission and failed-stage assertions retained                                                                                                                                                                                                                                                          | New same-source hosted execution still required                                                                                                                                                                     |
| `pax-review-demo_real-shared-order-across-roles`                                | Original same-UUID, independent instances, refresh and relational assertions retained                                              | Pending, zero new acceptance credit                                                                                           | Replacement candidate's full hosted CI and three PG companions                                                                                                                                                                                                                                                                                   | No runtime/PG/browser on this VM                                                                                                                                                                                    |
| `pax-review-demo_external-simulation-and-complete-journeys`                     | Original three independent A/B/C journeys and business waits retained                                                              | Pending, zero credit                                                                                                          | Replacement hosted three-order browser evidence                                                                                                                                                                                                                                                                                                  | This source repair's single-order fixture is not a completed journey                                                                                                                                                |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`                        | Existing authorized workflow, normal merge and combined immutable Cloud Run release retained                                       | Pending, zero credit                                                                                                          | Same-SHA review/full CI, merge, original combined publish/deploy and fresh smoke                                                                                                                                                                                                                                                                 | No old candidate rerun or separate deployment                                                                                                                                                                       |

The affected review / booking / payment / account-session / web-shell regression
completed **424 pass / 3 original hosted-PG skips**, exit 0 (`regression.log`).
The last test-only fixture strengthens the requested-card case by adding another
default card; the final focused rerun then completed 3 pass, exit 0. Root typecheck,
explicit TSX/caller typecheck, scoped ESLint and formatting/diff checks are
recorded with this evidence. The DOM adapter emits React `act` warnings during
the simulated route transition; these are not browser results. Intermediate
`after-focused.log` / `title-only-before-payment.log` still fail at the original
address label mismatch, not at the payment radios. `after-labels.log` reached the
final HTTP assertion but the first assertion adapter omitted a matcher; it is
not a product failure. The first immutable load hook failed at transform due to
replacement-string expansion (`immutable-before-hook-error.log`), not at a
product assertion; the corrected function replacement produced the qualified
two failures above. The initial explicit TSX check lacked the locked Next
router's required fixture `bfcacheId`; the final fixture typecheck passes.

`source-invariants.cjs` / `.json` establish that the hosted spec outside `book()`
is byte-identical to 4981, all 16 remaining business assertion-call nodes inside
`book()` are retained, and its two locator assertions were adapted to the actual
visible title and exact card. Two additional readiness assertion-call nodes bring
the helper from 20 to 22. Every tracked product app/package, CI/deploy workflow
and hosted config remains unchanged. There is no timeout, clock, retry, skip,
order-count or business-guard change.

The remaining Passenger selectors in this same spec were also checked against
their actual producers: `BookingScreen`'s quote amount/confirmation checkbox and
button; `PaymentMethodsScreen` / `PAY_T` bind controls and unpaid notice;
`RatingStars` / `RatingCard`'s exact 1/5-star buttons, low-score support checkbox
and submit button; the cancellation views; history's actual `/rides/${id}` links
and `乘客取消`; `ReviewRideControls`' order output/retry button; and
`ReviewRecordPage`'s HTML download button. Their visible names/contracts match;
their future A/B/C runtime behavior remains unverified by this source audit.

Evidence is copied at handoff to canonical
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate4981-booking-caller-rework/`.
Node 22.23.2, pnpm 10.33.0, locked Next 16.3.8 and Vitest 4.1.4 were used.
Only this isolated worktree's 22 dependency symlinks were removed and replaced by
an offline frozen installation with scripts disabled, exit 0; canonical
dependencies and lockfiles remain unchanged. No Playwright CLI, browser, product
HTTP/preview/server, PG or Compose runtime was started on this VM. The original
4981 browser failure is fully archived. The task-spec supplement at 12:28 UTC
explicitly removes waiting for the remaining old-generation CI jobs: after this
round's own checks, push normally and hand off the replacement SHA. No manual
cancellation or rerun was requested; any concurrency-driven cancellation of old
jobs is partial/cancelled evidence, never PASS. All three acceptance keys remain
pending.

## R17 — preserve the failed booking and obtain a safe public error code

The adjacent candidate is `f4a9485d31e63dd3dfbef65468d0add80e53a3ec`,
generation `4ddbb80c573544fbab9244d3265538b0`. Its actual hosted run
`38735390758`, job `116424495438`, failed one case after 20.992 seconds,
with zero skips. Ops/Driver bootstrap, Passenger login/account, card binding
and the actual booking form reached quote HTTP 201, then ride HTTP 409.
No A/B/C UUID was obtained. The archived receipt SHA256 is
`1c1f5b12e3711e5f87fe81334ec08a5f034ddb241eb16564edadec6fb556331e`;
artifact `11973631880` ZIP/GitHub digest is
`35685f5b20ad4b6c641f80479655475a1c3f87f474df0022916f4092698373a8`.
Both and the raw job log were independently hashed again this round.

**The original HTTP 409 remains unresolved.** That execution did not retain
its error code, body or failure screen. Reading the actual caller through
`BookingScreen.submit`, `PassengerBookingClient.createRide`, the BFF,
`PassengerBookingController.createRide`, `PassengerBookingService.createRide`,
the transactional booking repository, MultiTaxi/Owned creation and existing
service-product/authorization/payment guards has not established which guard
rejected that request. `source-read-boundary.json` binds these inspected
sources to the old candidate. No business rule or product source was changed
on the strength of an unobserved cause.

This replacement is a **diagnostic candidate**, as allowed by the task-spec
R17 supplement. The original `status < 300` assertion now supplies a message
from `bookingResponseDiagnostic`: HTTP status and a literal public code from
a finite allowlist of existing booking/BFF errors. All other response values,
including unknown code strings, become `unclassified`; messages, details,
headers, URLs, raw bodies and parse exceptions are never printed. Success
responses are not parsed by the diagnostic. The message enters the existing
hosted failure report; no new collector, workflow, timeout or runtime is added.

| Finding / acceptance                                        | Source and change                                                                                                    | Old result → replacement result                                                                                                                                                                               | Commands / execution / evidence                                                                                                                                                                                                                                                                                                                                    | Remaining limit                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R17: ride HTTP 409 has no locatable error code              | Actual hosted `book()` success assertion; new `tests/e2e/pax-review-shared-order/booking-diagnostic.ts`              | Same actual caller with controlled upstream 409 fails in both versions. Old immutable f4 lacks the diagnostic and fails two new message assertions; replacement retains rejection and reports each fixed code | `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/hosted-booking-caller.test.tsx --config .local/pax-review-shared-order-demo-20261015/r17-booking-diagnostic/vitest.before.config.mts --maxWorkers=2 --reporter=verbose`: exit 1, 2 assertion failures / 2 pass (`immutable-before.log`); replacement focused command below: 15 pass, exit 0 | This reproduces the diagnostic gap, **not** the historical booking rejection. The two controlled codes are not attributed to the old hosted request |
| R17: prevent diagnostic response disclosure                 | Actual diagnostic boundary, exercised through genuine Home/SDK/BFF plus malformed/unknown/non-JSON/success responses | Fixed public codes only; unknown values stay unclassified; original HTTP assertion and no-navigation behavior preserved                                                                                       | `booking-diagnostic.test.ts`, `hosted-booking-caller.test.tsx`, `journey-progress.test.ts` focused run, exit 0, 15 pass (`focused.log`)                                                                                                                                                                                                                            | HTTP and DOM driver are fixtures; no Chromium or PG ran here                                                                                        |
| `pax-review-demo_real-shared-order-across-roles`            | Original three roles, order creation and UUID assertions retained                                                    | Pending, zero credit                                                                                                                                                                                          | Replacement same-SHA hosted browser and existing PG companions required                                                                                                                                                                                                                                                                                            | Original 409 root cause still needs actual hosted code/runtime evidence and, if indicated, a product repair                                         |
| `pax-review-demo_external-simulation-and-complete-journeys` | Original A/B/C, payment, cancellation, history, support and real business waits retained                             | Pending, zero credit                                                                                                                                                                                          | Original complete journey remains mandatory                                                                                                                                                                                                                                                                                                                        | No completed order is claimed from this diagnostic regression                                                                                       |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Existing review/full CI/merge and combined immutable Cloud Run delivery retained                                     | Pending, zero credit                                                                                                                                                                                          | New fixed SHA needs its own reviewer/full hosted results; normal merge and original shared-dev delivery/smoke follow                                                                                                                                                                                                                                               | No rerun of known-red f4, separate deployment or VM runtime                                                                                         |

The focused command was `pnpm exec vitest run
tests/unit/pax-review-shared-order-demo-20261015/booking-diagnostic.test.ts
tests/unit/pax-review-shared-order-demo-20261015/hosted-booking-caller.test.tsx
tests/unit/pax-review-shared-order-demo-20261015/journey-progress.test.ts
--maxWorkers=2 --reporter=verbose`. The affected review / booking / payment /
account-session / web-shell regression completed **436 pass / 3 original
hosted-PG skips**, exit 0 (`regression.log`). Root and explicit caller TSX
typechecks and scoped ESLint completed with exit 0. React `act` warnings in the
DOM navigation adapter remain warnings, not browser evidence. All started
checks finished and their results were read before handoff.

`source-invariants.cjs` / `.json` compare the complete spec AST against f4:
after removing exactly one diagnostic import and one assertion message,
every original operation and assertion is identical. All tracked apps/packages,
CI/deploy workflows, hosted config, relational evidence and safe-progress
helpers are unchanged. No booking guard, successful-status expectation,
unpaid rejection assertion, order count, clock or wait is weakened.

Evidence is copied at handoff to canonical
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidatef4-booking-diagnostic/`.
Execution source is anchor `6f024142b5dd52538041491b6fdd61e2e84c13bf`;
subsequent source changes are this UAT prose only. Node 22.23.2, pnpm 10.33.0,
locked Next 16.3.8 and Vitest 4.1.4 were used. Only this task worktree's 22
dependency symlinks were replaced by an offline frozen installation with scripts
disabled, exit 0; canonical dependencies and lockfiles were preserved.
No Playwright CLI, browser, product/preview/HTTP server, PG or Compose ran on
this VM. Same-source hosted execution is the concrete missing condition for
locating R17; source review must keep that finding open. Per the existing
delivery supplement, the new fixed diagnostic candidate can be pushed without
waiting for the known-red generation's remaining CI. Its sole collector records
any natural cancellation as partial/cancelled, never PASS. All three acceptance
keys remain pending.

## R18 — prepare the real reservation product and read it across instances

The adjacent candidate is `24ca09a5eb6218689dac958cc4a4a1fb9a890e53`,
generation `9a5788a10dfe4939b777ef0a36e036fa`. Its actual hosted run
`38737881286`, job `116433168022`, failed with zero skips: quote HTTP 201,
then ride HTTP 409. Raw log line 2324 reports the existing fixed diagnostic
`Passenger booking status=409 code=SERVICE_PRODUCT_INACTIVE`. A never acquired
an order UUID; B/C were not reached. The qualified receipt SHA256 is
`464a645c54dac2558814f68d2dc304bba69a26b0878751fb56a128a94352efff`;
the raw log SHA256 is
`0997f89f1099c3bc65be4157240a254784bc4717c5e1f6628f72090fe93f1ee0`.
Artifact `11974284903` has ZIP/GitHub digest
`3d7ac58ad8b032a66b1ed541cc946e060872842e4f609a2eb2d77c80f2e6858c`.
This locates 24ca's rejection; it does not retrospectively assign a code to
f4's unrecorded response.

The actual path is `PassengerBookingService.createRide` →
`MultiTaxiService.createTrustedPassengerRide` →
`OwnedMobilityService.createMultiTaxiRide` / `buildAndPersistMultiTaxiRide`.
The last method rejects the reservation product when its master is inactive.
`DEFAULT_RUNTIME_SERVICE_PRODUCTS` deliberately defaults
`seed-taxi-reservation` to `active: false`. V0057 enables the independent
`multi_taxi_direct` / `taxi_reservation` policy, but does not create or enable
a product master. The original `ReviewSupplyService.prepare` prepared only
qualification, authorization and supply data. Initialization-only product
snapshots also leave previously initialized peers stale after preparation.

The enabled nonproduction preparation now refreshes that exact product context,
then awaits the established `ServiceProductService.createServiceProduct` or
`updateServiceProduct` to enable the real master. Existing IDs, billing,
meter/license/proof configuration and unrelated products are retained. It
creates no orders, assignments, tasks or payments, and does not change the
runtime policy or the ordinary inactive default. `PassengerAppModule` imports
the existing `ServiceProductModule` to share its singleton with the existing
MultiTaxi/Owned modules.

`ServiceProductRepository.findRuntimeContext` reads only the requested type
and profile/policy key using the official V0027/V0057 tables.
`ServiceProductService.prepareRuntimeProfileServiceProduct` replaces only that
context; missing rows remove stale values, and read errors reject the command.
All three MultiTaxi intake paths refresh before the original policy check.
The native Owned intake refreshes before its original builder and active check,
including direct internal callers. Its existing no-repository synchronous
behavior and call-center voice-intent fence are retained.

Per Supervisor's integration supplement, the owner normally merged
`abffadbbc` from `origin/dev` as `8f5292e2611c25abe79fb54f7d83b003ad6dcc2f`.
This preserves accepted `SERVICE-PRODUCT-PERSISTENCE-ACK-20261015`, merge
`48980f0efa0a6572e21b93ada16a123a2a77399b` / PR #2663. No published history
was rewritten. Every accepted ServiceProduct class member is unchanged except
for the new narrow reader. Preparation uses its real ACK-before-cache/audit
create/update behavior; the earlier direct repository-write anchor is superseded.

| Finding / acceptance                                                               | Source and change                                                                                                            | Old result → replacement result                                                                                                                                                                                                                | Commands / execution / evidence                                                                                                                                                                     | Remaining limit                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R18: real reservation booking rejects `SERVICE_PRODUCT_INACTIVE` after preparation | `ReviewSupplyService.prepare`, existing ServiceProduct create/update, module injection; original Owned active guard retained | Same genuine preparation and PassengerBooking/MultiTaxi/Owned/repository caller with SQL-response fixtures: immutable 24ca rejects HTTP-equivalent 409; replacement commits order, ownership history and digest-only access with the same UUID | `service-product-preparation.test.ts`; immutable command below exits 1 with the exact code; replacement 16/16 pass, exit 0 (`integrated-focused.log`)                                               | SQL transport responses are controlled; no PG/browser acceptance credit                  |
| R18: preinitialized peers must read the prepared master                            | Targeted repository/service reader, three MultiTaxi entry points and native Owned intake                                     | Preinitialized B reads A's persisted master; subsequent deactivation/deletion and read failures still reject without a new order                                                                                                               | Focused 16 cases and full root/API regressions below; native Owned positive and negative cases included                                                                                             | Actual cross-instance PG case remains hosted                                             |
| Preserve accepted ACK and all independent rejection boundaries                     | Formal create/update/policy methods, existing defaults/guards, unchanged V0027/V0057 schema                                  | Existing master fields and unrelated products survive repeated prepare; disabled/production modes, write failure, pending ACK, inactive/expired/future/missing policy remain correct; accepted ACK regression 6/6 pass                         | `integrated-source-invariants.json` checks all accepted class members against merged dev, original product defaults/guard/readers and Owned validator/builder; root/API checks below                | No new policy, schema, clock or external-service exemption                               |
| `pax-review-demo_real-shared-order-across-roles`                                   | Existing real three-role order and UUID assertions retained                                                                  | Pending, zero acceptance credit                                                                                                                                                                                                                | `dynamic-supply.hosted.test.ts` now injects real ServiceProductService/Repository into both preinitialized peers and verifies persisted master plus B's stale→fresh snapshot around genuine booking | New exact-candidate hosted PG, Driver registration/task and cross-role readback required |
| `pax-review-demo_external-simulation-and-complete-journeys`                        | Original A/B/C, payment, support, cancellation, history and business waits unchanged                                         | Pending, zero acceptance credit                                                                                                                                                                                                                | Whole hosted browser spec and evidence/progress/diagnostic helpers are byte-identical to 24ca                                                                                                       | All three real UUID journeys still required; local order fixture is not their substitute |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`                           | Existing workflow/config and immutable Cloud Run delivery unchanged                                                          | Pending, zero acceptance credit                                                                                                                                                                                                                | New same-SHA review/full CI, normal merge, combined shared-dev immutable source and fresh smoke remain mandatory                                                                                    | No workflow rerun, separate deployment or VM product/browser/PG runtime                  |

Final execution source is `4640d199dd785b1addc0bf85a3910db79a9f9d1c`;
the handoff candidate adds only this UAT prose. The final commands were:

- `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/service-product-preparation.test.ts --config .local/pax-review-shared-order-demo-20261015/r18-service-product/vitest.before.config.mts -t 'prepares on A, then commits' --maxWorkers=2 --reporter=verbose`: **exit 1**, one genuine `SERVICE_PRODUCT_INACTIVE` failure, 15 cases filtered by the explicit name selection (`integrated-qualified-before-corrected.log`). The load hook uses `git show` of immutable 24ca for the five affected product/supply/MultiTaxi/Owned sources; it does not reset the worktree or mock product logic.
- `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015 tests/unit/pax-booking-history-20261009 tests/unit/pax-shared-order-flow-20261015 tests/unit/pax-payment-core-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-web-shell-20261009 tests/unit/service-product.test.ts tests/unit/service-product-persistence-ack-20261015 --maxWorkers=2 --reporter=verbose`: **exit 0**, **724 pass / 22 original environment skips**, 52 passing files / 7 skipped (`integrated-regression.log`). The skips include the original formal PG/native HTTP suites and the three review PG companions; no skip was added or relaxed. DOM `act` warnings remain warnings.
- `pnpm exec vitest run apps/api/tests/unit/service-product.service.test.ts apps/api/tests/unit/multi-taxi.service.test.ts apps/api/tests/unit/multi-taxi-passenger-authority.test.ts apps/api/tests/unit/vehicle-eligibility.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts --config .local/pax-review-shared-order-demo-20261015/r18-service-product/vitest.api.config.mts --maxWorkers=2 --reporter=verbose`: **exit 0**, **175 pass**, 6 files (`integrated-api-regression.log`). The local config only includes these existing native suites and the root aliases.
- `pnpm exec tsc -p tsconfig.json --noEmit` and `pnpm exec tsc -p apps/api/tsconfig.json --noEmit`: **exit 0** (`integrated-typecheck-root.log`, `integrated-typecheck-api.log`). Scoped ESLint with `--max-warnings=0`, Prettier, source-invariant checks and `git diff --check`: **exit 0**.

All started checks were terminal and their results were read. Initial fixture
attempts omitted profile/master persistence dependencies and failed before the
target behavior; they are retained as fixture errors, not reproduction evidence.
The initial root typecheck identified missing address/agent fields in the new
direct-intake fixture; its corrected typed fixture passed. The initial standalone
API typecheck lacked the control-plane-auth build output; the existing package
was compiled with `pnpm --filter @drts/control-plane-auth build`, exit 0, before
the passing final API check. The first integrated immutable hook omitted Owned
and produced an old/new interface TypeError; the corrected five-source hook
above produces the actual original 409. Earlier pre-merge checks are retained
separately and do not substitute for the final integrated results.

Evidence is copied to canonical
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate24ca-service-product/`,
with source and evidence SHA256 manifests. Node 22.23.2, pnpm 10.33.0,
Vitest 4.1.4 and locked Next 16.3.8 / React 19.3.0 were used. Only this task
worktree's 22 dependency symlinks were replaced by an offline frozen install
with scripts disabled, exit 0; canonical dependencies were not changed. The
merged trunk's existing lockfile addition is preserved; owner implementation
does not edit dependencies. No product/preview/HTTP listener, PG, browser,
Playwright CLI or Compose runtime was started here. No old known-red workflow
was rerun or manually cancelled. Its original collector retains natural
partial/cancelled results. All three required acceptance keys remain pending.

## R19 — diagnose the first real Ops assignment rejection

**The assignment defect remains unresolved. This is a diagnostic candidate.**
Adjacent candidate `22a75b20144b55077ac33b9a77aaee66e1025d8f`, generation
`6f2e96e0198e4b7f87caec6b668f86f2`, actually created A through the Passenger
UI: order `533a6ed1-f265-4431-9bfd-26e75f91dc77`, rides POST 201 and
detail/events GET 200. Ops read that UUID and created dispatch
`789393cb-ae33-4e9e-8f9f-5877fd43a039` with POST 201; candidates GET was 200.
The first assign to `pax-review-driver-b` returned 409 at spec 198:27,
callsite 473:9. Reassignment, Passenger offline recovery, Driver acceptance and
B/C were not reached. Run `38742300946`, job `116449427281` reports one failed
case, zero skips. Artifact `11977911069` contains report, error context and
safe progress only; there is no screenshot, trace or completed-order fact JSON.
It provides no assignment error code. A database serialization error elsewhere
in the raw log is not evidence of this request's guard or cause.

The collector's qualified receipt SHA256 is
`c0f3fc0daaf0955121bd5b72e5221f1231caa98f80368a1c6910ea5a2a351521`.
The raw job log SHA256 is
`4e72cba7591f1b0091b2e60e463fa4734b5a72955252143ef2b052b764d12a28`.
The artifact ZIP matches GitHub's digest
`781d6248a691438d7664382a0eb3d339f3c838b3d744287c97ceccc39cc06e6b`.
These are actual 22a results, not a replay or a successful three-order run.

The actual caller is `SharedOrderReviewOps.command` → `getOpsClient` /
`ApiClient.post` → existing Ops `control-plane-proxy` →
`OwnedMobilityController.assignDispatch` / `reassignDispatch` →
`prepareOrderAction` → existing idempotency and `createDispatchAssignment`.
The latter locks current order/job/assignment authority, checks the operating
authorization, builds passenger disclosure/credential/rating/fare snapshots,
rechecks product/supply/training/leave/platform eligibility, and reserves
resources before committing. All of these product sources remain byte-identical
to 22a. The accepted ServiceProduct ACK and R18 product preparation/readback
are retained. No unverified mapping, guard or concurrency change is guessed.

Only the existing hosted helper's HTTP assertion gains
`dispatchResponseDiagnostic(result, reassign)` as its message. It projects
22 literal public codes from the formal Owned/idempotency sources. For the
single wrapping `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` code, it may also
project seven fixed public `reasonCodes` enums, in bounded stable order without
duplicates. Unknown values, messages, other details, identities, headers, URLs,
tokens and parsing exceptions never enter the diagnostic. Successful responses
are not parsed by it. The original `<300` assertion, response handling,
assign/reassign UI clicks, payloads, idempotency keys, business waits, three
UUIDs, payment/cancellation/history assertions and all earlier findings remain.
The original booking diagnostic is unchanged.

| Finding / acceptance                                        | Source and change                                                                                                                     | Old result → replacement result                                                                                                                                                                                                                        | Commands / execution / evidence                                                                                                                                           | Remaining limit                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R19: first actual assign rejects 409 without a public code  | Original hosted `assign` helper; new `dispatch-diagnostic.ts`; formal Owned and idempotency code mappings in `source-invariants.json` | 22a hosted: actual 409, no code. Same real Ops DOM → SDK → BFF → actual spec helper with controlled upstream responses: immutable 22a has 2 successful cases and 8 missing-diagnostic failures; replacement has 10 pass, still rejecting every 409/502 | `hosted-dispatch-caller.test.tsx`; `immutable22a-before.log` exit 1; `ops-caller-final.log` and `focused-final.log` exit 0                                                | Controlled responses locate the diagnostic gap only. Their P5/eligibility codes cannot be assigned to the historic 409; actual source repair still requires the next hosted code |
| Preserve command, response and failure boundaries           | Actual rendered Ops buttons, real client/BFF, bounded parser; no product edits                                                        | Assign and reassign success return the existing data; public, unknown and non-JSON failures still throw. Actual UUID/driver/vehicle/reason payload and matching idempotency headers are asserted; only fixed code/reason enums appear                  | Focused 4 files / 32 pass, exit 0; full AST after removing one import and one assertion message equals 22a; all 29 literals mapped to formal source                       | HTTP transport is the external substitute; no production assignment, PG or browser claim                                                                                         |
| Preserve R1–R18 source and regressions                      | Original task UAT/finding history, unchanged apps/packages/workflows/config and evidence/progress/booking helpers                     | Existing product and guard behavior retained                                                                                                                                                                                                           | Final regression and type/lint/format results below; source invariants exit 0                                                                                             | Earlier candidate CI/PG results are not new-candidate credit                                                                                                                     |
| `pax-review-demo_real-shared-order-across-roles`            | Existing same-order role and peer assertions retained                                                                                 | Pending, zero acceptance credit. 22a reached one real A UUID and Ops dispatch, then rejected assign                                                                                                                                                    | Original three formal-schema PG companions and new same-source hosted run remain required                                                                                 | No B/C UUID, Driver acceptance or complete cross-role journey yet                                                                                                                |
| `pax-review-demo_external-simulation-and-complete-journeys` | Original external ports and A/B/C flow retained                                                                                       | Pending, zero acceptance credit                                                                                                                                                                                                                        | All original assertions, real waits and actions unchanged                                                                                                                 | No completed three-order browser evidence; no inference from controlled diagnostic fixtures                                                                                      |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`    | Existing hosted CI and immutable shared-dev delivery retained                                                                         | Pending, zero acceptance credit                                                                                                                                                                                                                        | New exact-SHA review/full CI, three PG cases without skips, three-role browser, normal merge, sole combined immutable Cloud Run deployment and fresh smoke still required | No VM runtime, workflow rerun/manual cancellation, separate deployment or delivery claim                                                                                         |

Execution source is `882b942f13884730cf2af298daf6623d44e492d1`; the
handoff candidate adds only this UAT prose. Evidence is preserved under canonical
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate22a-dispatch-diagnostic/`
with source/evidence hashes and exact command/exit records. Commands include:

- `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/hosted-dispatch-caller.test.tsx --config .local/pax-review-shared-order-demo-20261015/r19-hosted-followup/vitest.before.config.mts --maxWorkers=2 --reporter=verbose`: exit 1, 8 diagnostic-message assertion failures / 2 success cases. The local transform changes only the spec read path to a `git show` copy of immutable 22a; it neither resets the worktree nor mocks product logic. This reproduces missing diagnostics, not the historical assignment root cause.
- Focused original booking/progress plus new dispatch parser/caller: exit 0, 32 pass (`focused-final.log`), including real `ApiRequestError` envelopes and the actual Ops DOM/SDK/BFF. The upstream HTTP fixtures deliberately control public-code, eligibility, unknown-code and non-JSON responses; they do not execute a production assignment.
- `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015 tests/unit/pax-booking-history-20261009 tests/unit/pax-shared-order-flow-20261015 tests/unit/pax-payment-core-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-web-shell-20261009 tests/unit/service-product.test.ts tests/unit/service-product-persistence-ack-20261015 --maxWorkers=2 --reporter=verbose`: exit 0, 745 pass / 22 original environment skips, 54 passing / 7 skipped files (`regression-final.log`, final source 882b942f). The three original review PG companions and original native HTTP/PG suites remain skipped on this VM. The earlier 745/22 run preceded the type-only test-adapter correction and is retained separately; the final run above used the committed corrected source. Counts overlap with focused cases and are not additive.
- Root TypeScript and an explicit TSX caller typecheck: exit 0 (`typecheck-root.log`, `typecheck-caller-final.log`). Scoped ESLint, Prettier, source invariants and `git diff --check`: exit 0.

The first new DOM fixture incorrectly decoded the BFF's ArrayBuffer request
as a string, so all ten cases timed out before the simulated upstream replied.
The next fixture exposed `request.method` as a string rather than Playwright's
method function, causing ten adapter failures. Both are preserved as fixture
errors, not product reproductions. After correcting those external adapters,
the actual caller's ten cases pass. The initial explicit TSX check also rejected
two Testing Library `exact` options; they were removed, preserving its default
exact string matching, then the final typed source passed. The final focused
run uses that corrected source. Existing DOM `act` warnings remain warnings.

Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4 and locked Next 16.3.8 / React 19.3.0
were used. Only this worktree's 22 dependency symlinks were replaced by an
offline frozen installation with scripts disabled, exit 0; canonical dependencies
and lockfiles were not edited. No VM product/preview/HTTP/PG/browser/Compose
runtime or Playwright CLI ran. The old known-red run was naturally cancelled by
ordinary checkpoint pushes; its original sole collector retains partial results.
All checks started in this owner turn are terminal and their results were read.
All three required acceptance keys remain pending.

## R19a / R19b — formal wire diagnostics and preserved-history replacement

**R19 assignment still fails; this replacement fixes its diagnostic and commit
history defects. It does not claim a completed journey.** The independent
review of `a9e751ef15e354e04c10c4a855f99f06edcdc91a`, generation
`7f93297c98634027bb2a119c1b0c7b95`, returned the two R19a findings. Its real
hosted run `38746031158`, job `116461579702`, subsequently failed at the first
assign with `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` (raw line 2351). Preparation,
registration, Passenger login/binding, A booking and Ops dispatch passed.
Reassignment, Driver acceptance and B/C were not reached. The missing reason
output is not evidence that reasons were empty. Artifact `11979951904` ZIP
matches GitHub digest
`41335d723cb895073ad0e82f13da67ded1ac87b1c9fe8b1a2191179553882794`;
the raw log hash is
`026cfdf4de95a95aaa27b312b1628804611fc760d21f419b73292cfb0a282f55`.
The original sole collector retains the qualified receipt and remaining jobs.

The actual production wire path is `ApiRequestError` → globally registered
`SnakeCaseExceptionFilter.catch` → `deepToSnakeCase` → transparent Ops BFF.
The diagnostic now reads `details.reason_codes`, retaining internal
`reasonCodes` compatibility, and projects only the existing seven fixed enums.
It also recognizes the existing `REDISPATCH_ASSIGNMENT_ALREADY_CLOSED` from
`OwnedMobilityRepository.loadOrderCancellationForUpdate`. That guard is reached
by both assignment commands through `createDispatchAssignment` when an active
assignment has zero or multiple tasks. No product guard, payload, assertion,
timeout or eligibility policy changes in this repair.

The regression uses the actual exception filter with only its HTTP response
adapter substituted. Four reconciliation cases use the actual repository guard
with SQL row responses substituted, then the real filter and diagnostic. The
actual Ops DOM/SDK/BFF caller now receives error fixtures serialized through the
production `deepToSnakeCase`. Success, both commands, unknown/malformed fields
and non-JSON refusal remain covered. These are diagnostic checks, not a PG
execution or a reproduction of the historical eligibility root cause.

| Finding / acceptance                                               | Source and repair                                                                          | Old → replacement result                                                              | Execution and evidence                                                                                             | Remaining limit                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| R19a F1: genuine HTTP eligibility reasons disappear                | `dispatch-diagnostic.ts`; actual filter/serializer and Ops caller regressions              | Immutable a9e loses known reasons; replacement retains only the fixed enums           | Two-file immutable run: 9 fail / 21 pass, exit 1; replacement focused run: 41 pass, exit 0                         | Controlled HTTP boundary; exact historical reason still unknown                                                                  |
| R19a F2: real repository reconciliation code prints `unclassified` | Same helper; actual `loadOrderCancellationForUpdate` guard with 0/2 tasks, assign/reassign | Immutable a9e loses the code; replacement projects it and preserves the 409 rejection | Same before/after runs; product repository/filter execute without substituting their logic                         | Not evidence that this was the historical assignment cause                                                                       |
| R19b: published 882b subject fails existing commit check           | Authorized replacement branch from accepted dev; original refs/PR preserved                | Old range exits 1 for `test(...)`; replacement range passes unchanged checker         | `recovery-proof.json`, bundle verification, original job `116460248280`; final candidate rechecks its entire range | New same-SHA hosted CI and review still required                                                                                 |
| R19: genuine first assign fails                                    | Original Ops → Owned transaction, eligibility recheck/current driver requirements          | a9e now proves the wrapper code above, but no fixed reason is available               | Qualified original run/job/artifact above, one failed browser case / zero skips                                    | Product finding remains unresolved; correct preparation/readback only after specific reason is established, retaining all guards |
| `pax-review-demo_real-shared-order-across-roles`                   | All original role/UUID and three formal-schema PG companions retained                      | Pending, zero acceptance credit                                                       | Original sources byte-identical to a9e except the diagnostic and two tests                                         | New exact-candidate PG execution with zero skips and full Driver/Passenger/Ops journey required                                  |
| `pax-review-demo_external-simulation-and-complete-journeys`        | Original A/B/C, payment/support/cancellation/history and real waits retained               | Pending, zero acceptance credit                                                       | Actual hosted browser spec, booking/progress/evidence helpers unchanged                                            | Three completed independent real UUID journeys still required                                                                    |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`           | Original workflow/config and immutable Cloud Run delivery retained                         | Pending, zero acceptance credit                                                       | Replacement same-SHA review/full CI, normal merge and sole combined immutable deployment remain required           | No VM runtime, deployment, workflow rerun/cancellation or delivery claim                                                         |

R19b was explicitly authorized in the original task spec. Original published
branch `codex2/pax-review-shared-order-demo-20261015` and PR #2643 remain at
a9e. Local original checkpoints `7828201c2` and
`5bd1886938eeef8b3b82afda6464304772faf81a` are preserved, with a verified Git
bundle in the evidence. Replacement branch is
`codex2/pax-review-shared-order-demo-20261015-recovery-r19a`, based on accepted
dev `9b343586196bfa963d170d3d5a9683b012398111`. Applying the full binary diff
of the clean Git merge tree produced the exact same tree
`ab4785777dcc675068c82e2bcecd653034aff5c2`, committed and normally pushed as
`efae20f8d9a10f007703215e9efa4d21c48d7a52`. All 111 task paths are retained;
no rebase, amend, reset, force-push, checker change or old-ref deletion occurred.
That implementation checkpoint is the execution source; the final candidate
adds only this UAT update. The only task-source differences from a9e are the
helper and its two regression files. The additional accepted dev history is
preserved separately, including its unrelated history-recovery document.

Static source proof verifies all 42 accepted ServiceProduct service members and
eight repository members, except their already-reviewed added targeted readers,
are unchanged. Accepted Tenant/Fleet ACK ancestry and production sources, and
Owned's accepted `createReferralPassengerBooking` method, are retained. The
original complete browser spec and workflow/deploy/config are byte-identical
to a9e. Prior R1–R18 evidence and limits above remain applicable as history,
not new-candidate CI or acceptance credit.

Final checks, all terminal and read, used Node 22.23.2 / pnpm 10.33.0 /
Vitest 4.1.4 and the locked dependencies:

- `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/dispatch-diagnostic.test.ts tests/unit/pax-review-shared-order-demo-20261015/hosted-dispatch-caller.test.tsx --config .local/pax-review-shared-order-demo-20261015/r19a-wire/vitest.before.config.mts --maxWorkers=2 --reporter=verbose`: **exit 1, 9 fail / 21 pass** (`before-formal-filter-repository.log`). The load hook reads only the helper from immutable a9e via `git show`; it neither resets the worktree nor replaces the product filter/repository/caller.
- The same two files plus original booking diagnostic and journey progress, without the hook: **exit 0, 41 pass** (`focused-formal-filter-repository.log`).
- The original full namespace plus booking-history/shared-order/payment/account-session/web-shell and service-product/accepted-ACK regressions: **exit 0, 754 pass / 22 original environment skips**, 54 passing / seven skipped files (`recovery-regression.log`, source efae). Those skips include the three formal review PG companions and original native HTTP/PG suites; no skip was added or relaxed. Counts overlap with focused checks and must not be added.
- Root TypeScript and explicit TSX caller TypeScript: **exit 0** (`recovery-typecheck-root.log`, `recovery-typecheck-caller.log`). Scoped ESLint, Prettier, source equivalence/accepted ACK proof, verified preservation bundle and diff whitespace check: **exit 0**. Original DOM `act` warnings remain warnings.

Earlier local checks are retained separately: first narrow reproduction 3 fail /
11 pass; first immutable caller run 7 fail / 19 pass; first focused run 37 pass;
first broad regression 750 pass / 22 original skips. They precede the stronger
actual filter/repository cases and do not replace final results. No tooling or
fixture failure was classified as product reproduction in this turn. Only 22
task-worktree dependency symlinks were detached for an offline frozen install
with scripts disabled (exit 0); canonical dependencies and lockfiles were not
changed. No product/preview/HTTP listener, PG, browser, Playwright CLI or Compose
runtime was started on this VM.

Command logs, configuration, preservation bundle, source mapping and hash
manifest are copied to canonical
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidatea9e-r19a-recovery/`.
All three required acceptance keys remain pending.

## R21 / R21b — opt-in reservation capability preparation and native authority

The source repair and socket-free reproduction are complete; the replacement
still needs its own hosted assignment, complete A/B/C journeys and delivery.
Adjacent candidate `af0cc0a9c87d6cd9ec03ef802588ee4ea59769ce`, generation
`3bc08899bc9a4d4e9d7aa814e51dbd1d`, actually failed in run `38748481563`,
job `116472642648`: `Ops assign status=409
code=ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT
reasons=VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT` (raw line 2351).
A order `a191b1b8-0b63-4ada-9eca-48bd28f16cfe` and dispatch job
`96554269-a558-4530-9f73-62be09d27a4f` were created. The latter is a
dispatchJobId, not evidence of a DriverTask.taskId. Reassign, Driver acceptance,
the trip and B/C were not reached. The qualified receipt SHA256 is
`0e5bbdcb277640d2217794fbde30fe20e10326b49c86e72f1aa6960a86035b8c`;
artifact `11980817300` matches GitHub digest
`0cba4f0fa7827401f556d6a4dcc8b155826d4b214888eefc141709a46f76ad4e`.
Its report, safe progress and error context contain no completed-three-order
facts, screenshot or trace. Its narrower public reason is not retrospectively
assigned to a9e or 22a, and `unsupported_product` was not printed by that run.

The actual source path is the Ops review page / SDK / BFF →
`OwnedMobilityController.assignDispatch` or `reassignDispatch` →
`prepareOrderAction` → `OwnedMobilityService.createDispatchAssignment` →
`assertAssignmentEligibilityRecheck` →
`VehicleEligibilityService.assertDispatchAssignmentEligible`. The latter
checks the precise booking product against the registry's real vehicle license
and canonical capability matrix. `ReviewSupplyService.prepare` previously
created vehicles with the original template's `multi_purpose_taxi` license and
enabled the reservation product, while its native capability mapping omitted
`taxi_reservation`. Actual prepare data sent to the real validator reproduces
`unsupported_product` for both rehearsal vehicles; this locates a definite
source defect without claiming access to the historical PG matrix's finer reason.

The opt-in prepare now uses the same `VehicleEligibilityService` exported by
`VehicleEligibilityModule`, with the real repository and matrix. It extends
only `supportedProducts` for active, currently effective capabilities of the
offered, product-allowed license types. Existing IDs, other products, license
types, inactive/expired status, seats, meter/permit/training/document fields and
other matrix records remain intact. An empty table is materialized from the
existing defaults, then amended for the offered type. `amendMatrix` serializes
with the existing replace-all writer using the formal table, upserts only new
or changed records, and acknowledges COMMIT before publishing cache/audit or
reporting readiness. Prepare then runs the ordinary qualification assertion
for both offered pairs. Failure is propagated through the existing command.

`findByLicenseTypes` reads only the requested types and whether native matrix
configuration exists, in one PG statement. `prepareVehicleCapabilities` merges
that context into the existing cache; missing configured capabilities and read
errors cannot authorize from stale/default capability. Owned's async candidate
entries and both final assignment paths await that reader and the existing
targeted service-product reader before the unchanged qualification recheck.
The persisted assignment branch retains its original order/resource locks,
authorization, disclosure/rating/fare snapshots and transaction. Its in-memory
branch retains synchronous behavior when no persistence reader is enabled.
Bucket-to-vehicle selection happens only after the reader's existing enabled
check, avoiding an unnecessary dependency on registry listing in that mode.

R21b is applied: ordinary `DEFAULT_MATRIX` is AST-identical to af0. The initial
checkpoint's two global mapping additions were removed by ordinary follow-up
commit, preserving published history. Only explicit review preparation enables
this simulated supply mapping through canonical configuration. No validator,
ordinary product activation policy, business guard or browser assertion was
relaxed. All original R1–R20 evidence/limits remain above. Original ServiceProduct,
Tenant/Fleet/C117 ACK source and browser/workflow/deploy/config remain preserved;
no new workflow, acceptance key, timeout, authentication policy or hosting mode
was introduced.

| Finding / acceptance                                              | Source and repair                                                                                                                         | Old → replacement result                                                                                                                                                                                                                                                      | Command / source / evidence                                                                                                                                                      | Remaining limit                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R19/R20/R21: first real assign rejects the prepared vehicle       | Native ReviewSupply → VehicleEligibility service/repository; Passenger module imports the exported eligibility module                     | Immutable af0's two real-prepare/real-validator cases fail their eligibility assertions; replacement passes both, plus eleven authority/ACK/refusal cases                                                                                                                     | `reservation-capability.test.ts`; `immutable-af0c-matching-before.log` exit 1, two fail / eleven name-filtered; final root regression exit 0                                     | SQL transport is controlled. Full product assignment after this repair still requires new hosted evidence; af0's failure is not erased      |
| R21: peer capability/product authority and last-moment revocation | Owned candidate entries and final assign/reassign preparation; native targeted matrix and existing product readers                        | Real Owned candidate query offers the prepared vehicle; a later native matrix revocation causes real assign to reject with `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` and creates no task                                                                                        | Same new test; final root regression; the existing dynamic-supply PG companion now injects/initializes the real eligibility service instead of omitting this optional dependency | In-memory Owned case verifies the caller and guard, not PG locking; formal-schema companion still needs hosted execution                    |
| R21: preserve existing configuration and persistence ACK          | Locked native matrix amendment, COMMIT-before-cache/audit; ordinary qualification assertions retained                                     | Repeated prepare preserves custom ID/fields/other licenses; delayed COMMIT delays readiness/audit; failed write rejects without durable change/success audit; later unsupported/inactive/expired/missing/meter, inactive product, offline driver and failed reads are refused | Thirteen new cases in final regression; original five API unit files retain every assertion                                                                                      | SQL result/transaction transport is the substitute. No PG concurrency claim; inactive and other normal qualification guards remain required |
| R21b: ordinary configuration remains unchanged                    | Original DEFAULT_MATRIX and disabled-reader path                                                                                          | Original default AST is identical; all four API cases initially exposed by eager listing now pass unchanged after selection moves behind the persistence-enabled check                                                                                                        | `source-invariants.json`; final five-file API regression, exit 0 / 193 pass                                                                                                      | No fixture, guard or expectation was weakened to obtain the pass                                                                            |
| `pax-review-demo_real-shared-order-across-roles`                  | Original same-UUID roles/peer tests retained; dynamic-supply PG case gains the real qualification dependency                              | Pending, zero acceptance credit                                                                                                                                                                                                                                               | New exact candidate must execute all three formal-schema PG companions without skips, plus real Passenger/Ops/Driver flow                                                        | af0 reached A booking/job only; no replacement hosted success is claimed                                                                    |
| `pax-review-demo_external-simulation-and-complete-journeys`       | Original opt-in simulated external ports, independent A/B/C, actual business waits/payment/rating/case/cancel/history assertions retained | Pending, zero acceptance credit                                                                                                                                                                                                                                               | Complete original browser spec and all assertions are byte-unchanged from af0                                                                                                    | Three independent completed journeys and exceptions remain unverified on the new candidate                                                  |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`          | Original hosted lane and combined immutable Cloud Run delivery retained                                                                   | Pending, zero acceptance credit                                                                                                                                                                                                                                               | Same-SHA independent review/full CI, normal merge, sole combined immutable shared-dev deployment and fresh smoke remain required                                                 | No VM product runtime, manual rerun/cancellation, deployment or delivery claim                                                              |

Execution source for the final checks is
`e64c548958669396ba426d3db867ace7f970a030`; the final handoff adds only this
UAT evidence. Canonical evidence is under
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate-af0c-r21-repair/`:

- The immutable-before command is `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/reservation-capability.test.ts -t 'real prepare makes' --config .local/pax-review-shared-order-demo-20261015/r20-vehicle-eligibility/vitest.before.config.mts --maxWorkers=2 --reporter=verbose`: exit 1, two actual eligibility assertion failures. Eleven other cases were filtered by `-t`, not executed or credited. The load hook reads only the four original production modules via `git show af0:<path>`; it never resets the worktree or substitutes core behavior. The initial separate valid old probe additionally records the exact `unsupported_product` error from the real validator.
- The original full task namespace plus booking-history/shared-order/payment/account-session/web-shell, product/accepted-ACK, vehicle-eligibility and UV013 regressions: `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015 tests/unit/pax-booking-history-20261009 tests/unit/pax-shared-order-flow-20261015 tests/unit/pax-payment-core-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-web-shell-20261009 tests/unit/service-product.test.ts tests/unit/service-product-persistence-ack-20261015 tests/unit/vehicle-eligibility.test.ts tests/unit/uv-exec-013.test.ts --maxWorkers=2 --reporter=verbose`: exit 0, **798 pass / 22 original environment skips**, 57 passing / seven skipped files (`regression-final.log`). The three review PG companions and original native HTTP/PG suites remain unexecuted on this VM; no skip was added or relaxed.
- From `apps/api`, `pnpm exec vitest run tests/unit/vehicle-eligibility.service.test.ts tests/unit/owned-mobility.service.test.ts tests/unit/owned-mobility.controller.test.ts tests/unit/forwarder.service.test.ts tests/unit/regulatory-registry.service.test.ts --config ../../vitest.config.ts --maxWorkers=2 --reporter=verbose`: exit 0, **193 pass / zero skips**, five passing files (`api-regression-final.log`). These are socket-free service/controller tests, not a PG or mounted HTTP execution. Counts overlap with narrower checks and are not additive.
- Root `pnpm exec tsc -p tsconfig.json --noEmit`: exit 0 (`typecheck-final-optin.log`). API `pnpm --filter @drts/api typecheck`: exit 0 after the existing contracts/control-plane-auth prebuild sequence (`build-contracts.log`, `build-auth.log`, `typecheck-api-final.log`). Its first attempt exited 2 because this fresh worktree lacked the control-plane-auth build output; no product or dependency source changed to correct that prerequisite. Final lint/format, source invariants, commit trailer and canonical/diff checks are recorded alongside the command results in the manifest.

Earlier iterations are retained separately, without claiming green final credit.
The first local config accidentally selected the broad root include and was
terminated (exit 143). Probe fixtures initially omitted profile storage and a
driver-key filter; later new-test iterations omitted the fifth constructor
argument, treated a location timestamp as a JSON record, lacked initial
persisted templates/authorization rows or the event publisher. Those fixture
errors are not product reproductions. After the SQL transport was corrected and
the real event service used, the immutable module run fails at the intended
eligibility assertion. The initial API regression was 189 pass / four failures
from eager listing in the no-persistence path; the final run preserves the
original fixture and all assertions. An earlier root 798/22 run started before
the final R21b corrections and is retained without fixed-source credit;
the final log above uses the corrected committed source. Existing DOM `act`
warnings remain warnings.

Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4 and locked dependencies were used for
final checks. Only this isolated worktree's 22 dependency symlinks were detached
for an offline frozen install with scripts disabled (exit 0); canonical
dependencies and lockfiles were untouched. No product/preview/HTTP listener,
PG, browser, Playwright CLI or Compose runtime ran on this VM. All locally
started required checks are read to completion before handoff. New hosted CI
may remain pending at handoff under the original candidate lifecycle; none of
the three acceptance keys receives credit from these local checks.

## R22 — locate the pending Driver UI operation without guessing its cause

The original collector's `review-demo-candidate53bc-hosted-results/actual-new-browser-first-failure-qualified-results.json`
records candidate `53bc89e2f041b494d7ec3e928828a3b0becc1843`, generation
`878d0fd3242546eb9754a6116cbffd99`, run `38754769793`, job
`116491803543`. A booking, dispatch, assignment and reassignment passed;
A order UUID is `5e3d1a04-67f6-4946-a7f7-81f23ef40636` and its dispatch job
is `eb4be28d-7390-401e-aac6-d17eead712b2`. The latter is not a proven Driver
Task ID. `Driver read assigned trip and accept` then exhausted the original
720-second case limit. The artifact has Driver tasks/task-views HTTP 200,
no acceptance response, no Driver screenshot and no completed order facts.
That does not prove which await failed or whether an acceptance request was
sent. The later `browserContext.close: Test ended` is a cleanup error.

This candidate addresses the missing diagnosis. It does **not** claim a fix
for the still-unlocated hosted Driver failure. The actual Driver Jobs/Trip,
Canvas controls, identity client and SDK were inspected and exercised without
a server: a legitimate pending-task response produces the existing open-trip
control, the same order UUID, and the genuine SDK acceptance command. This
rules out changing those labels on the strength of an old summary. Native
rendering, routing, storage/location and upstream HTTP are fixture boundaries
in this contract check; it does not exercise browser loading, hit testing,
CORS, the live API or PG and cannot establish hosted acceptance.

`readAssignedTripAndAccept` now leaves separate persisted progress for navigation,
opening the trip, verifying its UUID and submitting/receiving acceptance.
Individual navigation/click/response waits are bounded at 30 seconds; the
original 12-minute case, zero retries, selectors, POST method/path and successful
HTTP assertion remain. The listener is installed before the actual click and
both promises are observed together. On failure, the spec attempts a screenshot
only when the Driver URL is exactly its post-registration jobs/trip route;
failed screenshot capture creates no placeholder. It closes all contexts while
preserving the original failure. On successful journeys a cleanup failure still
fails the test. No credentials, request bodies, headers or storage are added to
the journal; onboarding is never captured by this failure hook.

| Finding / acceptance                                              | Actual source and change                                                                                                            | Before → after                                                                                                                                         | Command, exit, source and evidence                                                                                                                                                                                                   | Remaining limitation                                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R22: hosted Driver operation remains unknown                      | Actual Jobs/Trip → Driver identity client → SDK tasks/task-views/accept; original hosted receipt above                              | 53bc: A assign/reassign pass, Driver stage times out; replacement hosted result **pending**                                                            | Original collector receipt and artifact `11983839261`, ZIP/GitHub digest `d38b05cfcd607b9ae2b877eeb9fa2805f8bb585db2f69ba082d9e1696737fcd37`                                                                                         | Still unresolved until the new exact candidate's real browser result identifies/completes the operation; no runtime fix claimed                         |
| R22: one aggregate stage hid the pending operation                | Spec `readAssignedTripAndAccept`, original `createJourneyProgress`; actual Jobs/Trip/Canvas/client/SDK contract probe               | Immutable old caller: four diagnosis assertions fail; corrected caller: all four cases pass, including missing job, failed navigation and HTTP refusal | `old-caller-diagnosis.log`, exit 1 / four expected diagnosis failures; `regression-final.log`, exit 0 / 285 pass, 16 original environment skips, 31 passing and six skipped files; source `6b83e94df4232a0556848ccc26ff3874d99433bf` | This reproduces inadequate diagnosis using controlled HTTP/browser failures, **not** the unknown hosted timeout cause; refused commands remain failures |
| R22: cleanup obscured primary failure and no Driver image existed | Spec failure catch and context cleanup                                                                                              | Earlier cleanup error retained in old receipt; source now preserves the primary error and attempts only an eligible Driver image                       | Scoped ESLint/Prettier and root TypeScript, each exit 0; source review of the failure hook                                                                                                                                           | Actual failed-browser image capture remains unexecuted on this VM                                                                                       |
| Preserve previous findings and complete journeys                  | Main browser try block, booking/assignment helpers, remaining finish actions/business waits; product/accepted ACK sources           | Identical AST for the complete main three-order block and unchanged helpers; all product sources unchanged from 53bc                                   | `check-source-invariants.cjs` / `source-invariants.json`, exit 0; CI/deploy/config git blobs unchanged                                                                                                                               | Prior source/hosted evidence retains its original SHA; no old green result is credited to this candidate                                                |
| `pax-review-demo_real-shared-order-across-roles`                  | Original same-UUID UI and formal PG companions retained                                                                             | Pending, zero credit                                                                                                                                   | New exact-candidate full CI and three formal-schema PG companions without skips still required                                                                                                                                       | No live Driver acceptance/complete journey established by local fixtures                                                                                |
| `pax-review-demo_external-simulation-and-complete-journeys`       | Original external simulation, three independent orders, payment/case/rating/cancellation/history and actual business waits retained | Pending, zero credit                                                                                                                                   | Entire original main three-order block and remaining finish actions preserved                                                                                                                                                        | A completion and B/C runtime execution still required                                                                                                   |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`          | Original hosted workflow/config and combined immutable Cloud Run delivery retained                                                  | Pending, zero credit                                                                                                                                   | New exact-candidate independent review/full CI/browser, normal merge, sole immutable shared-dev deployment and fresh smoke still required                                                                                            | No deployment, browser run, workflow dispatch/rerun/cancellation or VM runtime was performed here                                                       |

All final executable checks used source
`6b83e94df4232a0556848ccc26ff3874d99433bf`; the handoff commit only appends
this evidence. Canonical evidence is under
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate53bc-r22-driver-diagnosis/manifest.json`.
Commands:

- Immutable-before: `PAX_REVIEW_DRIVER_CALLER_SOURCE_REF=53bc89e2f041b494d7ec3e928828a3b0becc1843 pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/driver-acceptance-caller.test.ts --maxWorkers=2 --reporter=verbose`, exit 1 / four diagnosis assertions fail. The probe reads the actual old acceptance phase through `git show`; it never resets the worktree or substitutes core UI/SDK functions. Positive old operation succeeds before its missing-substage assertion fails; negative fixtures preserve the original generic stage rather than identify their failed operation.
- Final regression: `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015 tests/unit/pax-shared-order-flow-20261015 tests/unit/pax-booking-history-20261009 --maxWorkers=2 --reporter=verbose`, exit 0 / **285 pass, 16 original environment skips**. The four new caller cases pass. PG/native HTTP suites remain skipped under their original environment checks, with no new skip or relaxed assertion.
- `pnpm exec tsc -p tsconfig.json --noEmit`, exit 0. Scoped ESLint (`--max-warnings=0`) and Prettier check for the three executable changed files both exit 0. Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4 and the candidate's frozen dependencies were used. Only this isolated worktree's 22 dependency symlinks were detached before offline frozen installation with scripts disabled (exit 0); canonical dependencies and lockfiles were untouched.

The initial native-renderer probe omitted `proofRequirements` from its HTTP
fixture and failed; `caller-first.log` preserves that fixture error without
product-reproduction credit. It was corrected before the immutable old/new
comparison. The first cleanup implementation failed ESLint's `no-unsafe-finally`;
the committed replacement closes contexts outside a throwing finally. Earlier
pre-install successful probes are retained without final-source credit. Final
required local checks all reached terminal results and were read; hosted CI for
the handoff candidate remains pending. No product/preview/HTTP/PG/browser server,
Playwright CLI or Compose ran on this VM.

## R22b — capture the Driver Page used by the current journey

Review of `094eb3893d974598cf9bf6d804d43e556ba44d28`, generation
`4c6d1c0d8ca34576a2c8c6fc4e3d0d77`, identified a concrete diagnostic defect:
B passes `mountedDriver` and the Passenger `/review-driver` base to registration
and completion, but the catch used A's outer `driver` and `DRIVER` base. With A
still on its completed trip, a B failure captured A instead of B. This finding
is separate from the still-unknown hosted A timeout recorded under R22 above.

The spec now retains the current Driver Page and its actual base. A starts with
the original Driver entry; B selects its mounted Page before registration; C
selects A's Page again before its Driver navigation. The existing failure hook
uses that pair for its exact jobs/trip URL check and screenshot. The original
image-only attachment, five-second capture limit, exclusion of onboarding/query
URLs, no-placeholder behavior, primary-error preservation and successful-journey
cleanup failure propagation remain. No new DOM, response-body or credential
capture was added.

The regression extracts and executes the **complete actual E2E callback** from
the requested source, including context creation, role selection, catch,
attachment and cleanup. Page/HTTP boundaries, journey helpers and unrelated
steps are fixtures so controlled registration/completion failures can reach the
real hook. Thus the test validates the hook's Page selection and error handling;
its byte buffers are fixture screenshots, not real browser images or completed
business journeys. It does not reproduce the unknown hosted timeout cause.

| Finding / acceptance                                            | Source and change                                                                                                       | Old → corrected result                                                                                                                       | Checks and evidence                                                                                         | Remaining limitation                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| R22b: B registration/navigation/acceptance failure captures A   | Spec `activeDriver`, actual B `registerDriver`/`finish` call sites and failure catch; `driver-failure-evidence.test.ts` | Immutable 094 callback: 8 failures / 4 passes, including actual capture A instead of expected B; corrected callback: all 12 cases pass       | `old-094-hook-frozen.log`, exit 1; `new-hook.log`, exit 0; final regression includes all 12 cases           | Actual hosted A/B screenshots still require the real browser lane                                         |
| R22b: evidence/cleanup errors must preserve the primary failure | Actual callback catch and success cleanup                                                                               | A/B jobs/trip, B onboarding/query/closed Page, screenshot/attachment/cleanup refusal and successful-journey cleanup refusal checked          | Same regression; no substitute A image or placeholder when B has no eligible image                          | Browser lifecycle is a fixture boundary, not runtime acceptance                                           |
| Preserve R22 diagnosis and all previous repairs                 | All 11 spec helpers, complete three-order try block excluding only the two active-Page assignments                      | Helper ASTs and original journey operations/assertions unchanged from 094; all product/accepted ACK/workflow/deploy/config sources unchanged | `check-source-invariants.cjs` / `source-invariants.json`, exit 0                                            | Original R22 unknown hosted failure remains unresolved; no product fix claimed                            |
| `pax-review-demo_real-shared-order-across-roles`                | Existing real same-UUID journeys and formal PG companions retained                                                      | Pending, zero credit                                                                                                                         | New candidate independent review/full CI and three formal-schema PG companions without skips required       | Fixture hook tests cannot establish live shared orders                                                    |
| `pax-review-demo_external-simulation-and-complete-journeys`     | Original three orders, payment/case/rating/cancellation/history, 720-second case and zero retries retained              | Pending, zero credit                                                                                                                         | Final local affected regression: 297 pass / 16 original environment skips; 32 passing and six skipped files | Full real A/B/C journeys remain required                                                                  |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`        | Existing hosted workflow and combined immutable Cloud Run delivery retained                                             | Pending, zero credit                                                                                                                         | New same-SHA full CI/browser, normal merge and sole immutable shared-dev delivery/fresh smoke required      | No VM product/HTTP/PG/browser/preview/Compose or Playwright CLI; no workflow dispatch/rerun/cancel/deploy |

Executable verification source is
`e81d1456860c6c84d093806439b4364dd5b87cfb`; the handoff commit adds only
this UAT evidence. Canonical evidence is
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate094-r22b-active-driver/manifest.json`.

- Old: `PAX_REVIEW_FAILURE_SOURCE_REF=094eb3893d974598cf9bf6d804d43e556ba44d28 pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/driver-failure-evidence.test.ts --maxWorkers=2 --reporter=verbose`, exit 1 / **8 fail, 4 pass**. It reads the old callback with `git show`, without resetting any worktree. Failures are Page-selection assertions, not missing fixtures/dependencies.
- Final: `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015 tests/unit/pax-shared-order-flow-20261015 tests/unit/pax-booking-history-20261009 --maxWorkers=2 --reporter=verbose`, exit 0 / **297 pass, 16 original environment skips**. The previous four real Driver caller probes also pass. No skip or business assertion was changed.
- Final root `pnpm exec tsc -p tsconfig.json --noEmit`, scoped ESLint (`--max-warnings=0`), Prettier, commit trailers and `git diff --check` pass. The first typecheck found a possibly undefined Page in the new fixture; `typecheck.log` retains exit 2, and the fixture now explicitly rejects an unexpected extra context. `typecheck-final.log` is exit 0.
- Node 22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4, Next 16.3.8 and Nest 11.2.7. After the shared dependency links lost a formatting tool, only this worktree's 22 symlinks were detached. Offline frozen installation with scripts disabled passed; canonical dependencies, sources and lockfiles were untouched. The immutable old comparison was repeated under these same frozen dependencies.

All checks started for this handoff reached terminal results and were read.
Old hosted CI remains bound to its own SHA; it is not evidence for this repair.

## R23 — restore the Driver device session before cold-route admission

Candidate `c202165cecf6cae91cf6669ecf2b3969047de46b`, generation
`d3d835365cb94eb9a8ec273fe562b1c3`, reached A booking, dispatch and
assign/reassign in hosted run `38762503624`, job `116518108045`. A's order UUID
was `9c084d5b-b817-4660-8119-101dfdee80dc`; dispatch job
`b0fe546d-8756-4fec-b23f-f0b9403ab24a` is not a proven Driver Task ID. The
new precise failure was `Driver open current trip from jobs`: the actual
`開啟目前行程` locator timed out after 30 seconds at spec line 222. Driver
tasks/task-views returned 200, with no acceptance response. Artifact
`11987555269` has ZIP/GitHub digest
`a53b916b58e3d2013a13581781ef62f8cd29e9b926ebdf387275bf05964d4c39`.
It contains no Driver screenshot or recorded final Driver URL. Therefore the
source reproduction below does **not** establish that this hosted run actually
ended on onboarding, or that its entire failure has now been resolved.

The actual Jobs and Trip components read `isDriverIdentityProvisioned()` during
their initial render and immediately returned `Redirect` when it was false.
On document reload, the identity module starts empty; the root heartbeat's
effect awaits `initializeDriverIdentity()` to restore the stored device session.
Both screens could redirect before that read started. A later successful
heartbeat/task HTTP read cannot undo the already rendered redirect. The previous
caller probe registered the identity in the same module before rendering, so it
did not cover this cold-document boundary.

Supervisor added the exact Jobs/Trip/layout paths under the original task's R23
scope. Only Jobs and Trip changed: each initializes readiness from the existing
`isDriverIdentityHydrated`, awaits the existing single-flight initializer when
needed, and keeps its loading view until the restore settles. It then uses the
original provisioned check and task loader. Missing, malformed or unreadable
stored identity still reaches onboarding; existing session invalidation,
ownership, task commands and acceptance refusals remain unchanged. The layout,
identity client, SDK, tracking and backend/accepted ACK sources are unchanged.

The regression executes both **actual screen components**, Canvas controls,
identity/storage adapter and SDK. It first obtains a valid session through the
real registration client and a fixture HTTP response, then clears only the
Node module instance to represent a new document with the persisted session.
It records actual Redirect renders before simulating completion of the root's
initializer. Web uses the production sessionStorage branch; native uses the
production SecureStore branch. Native renderer/router/location and upstream
HTTP are fixtures. These tests establish the source ordering defect and its
repair, with no browser, real device/session authority, PG or business acceptance
credit. No order or successful server acceptance is fabricated as runtime proof.

| Finding / acceptance                                          | Source and change                                                                                                | Old → corrected result                                                                                                                                                 | Checks and evidence                                                                                                                                 | Remaining limitation                                                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| R23: a valid stored session redirects on cold Jobs/Trip entry | `jobs.tsx::JobsScreen`, `trip.tsx::TripScreen`; existing `initializeDriverIdentity` / `isDriverIdentityHydrated` | Immutable c202 actual screens render onboarding with `identityReads=0`; corrected Web/Native Jobs/Trip restore and display the existing assigned task without redirect | `old-c202-reload.log`: exit 1, all 16 ordering cases fail; `new-reload-caller.log`: exit 0, 20 pass including original four acceptance caller cases | The actual hosted final URL was not recorded; new hosted journey must confirm the runtime outcome               |
| R23: preserve ordinary unprovisioned behavior                 | Same actual components; empty, malformed and storage-read-refused cases on both platforms                        | Old redirect precedes stored identity read; corrected redirect follows the attempted restore and exposes no order detail                                               | Same 16-case matrix; final affected regression includes every case                                                                                  | Fixture storage failures are not real device failures; no auth policy changed                                   |
| Preserve prior R22/R22b and accepted product behavior         | Original full E2E spec/config, current-Driver failure hook, backend, identity and tracking retained verbatim     | Original three-order main flow, same UUID/2xx/accept assertions, 720-second case and zero retries unchanged; four caller and 12 failure-hook cases pass                | `source-invariants.json`; full affected regression: exit 0, 381 pass / 16 original skips; Driver unit suite: exit 0, 542 pass / zero skips          | Local skips remain unverified; no old CI/PG/browser result is transferred to this SHA                           |
| `pax-review-demo_real-shared-order-across-roles`              | Original true same-order API/PG and cross-instance paths retained                                                | Pending, zero acceptance credit                                                                                                                                        | Same new candidate needs full CI and three formal-schema PG companions without skips                                                                | Socket-free fixtures cannot establish shared backend orders                                                     |
| `pax-review-demo_external-simulation-and-complete-journeys`   | Original A/B/C, payment/retry/case/rating/cancellation/history and real business-time waits retained             | Pending, zero acceptance credit                                                                                                                                        | New exact candidate must complete all original three independent-order browser journeys                                                             | This source fix does not claim complete A or executed B/C                                                       |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`      | Existing hosted workflow and immutable combined Cloud Run delivery retained                                      | Pending, zero acceptance credit                                                                                                                                        | New exact-SHA independent review/full CI/browser, normal merge and sole immutable shared-dev deployment/fresh smoke required                        | No workflow dispatch/rerun/cancel/deploy or VM product/HTTP/PG/browser/preview/Compose/Playwright CLI performed |

Executable verification source is
`ab0f208f208cc3c17b247bc05c0d653b2b238aa0`; the handoff commit only adds this
UAT evidence. Canonical evidence is
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidatec202-r23-cold-reload/manifest.json`.

- Immutable before: `PAX_REVIEW_DRIVER_SCREEN_SOURCE_REF=c202165cecf6cae91cf6669ecf2b3969047de46b pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/driver-identity-reload.test.ts --maxWorkers=2 --reporter=verbose`, exit 1 / **16 ordering assertion failures**, with no missing-dependency or fixture failure. The loader reads the complete old screen sources with `git show`; no worktree is reset.
- Corrected narrow probe: `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/driver-identity-reload.test.ts tests/unit/pax-review-shared-order-demo-20261015/driver-acceptance-caller.test.ts --maxWorkers=2 --reporter=verbose`, exit 0 / **20 pass**.
- Final affected regression: `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015 tests/unit/pax-shared-order-flow-20261015 tests/unit/pax-booking-history-20261009 tests/unit/driver-completion-actual-fare-input-20261013 tests/unit/driver-app-trip-workflow.test.ts tests/unit/driver-app-trip-metrics.test.ts tests/unit/driver-app-completion-proof.test.ts --maxWorkers=2 --reporter=verbose`, exit 0 / **381 pass, 16 original environment skips**, 37 passing / six skipped files. No skip or business assertion was relaxed.
- `pnpm --filter @drts/driver-app exec vitest run --maxWorkers=2 --reporter=dot`, exit 0 / **542 pass, zero skips**, 39 files; includes identity bootstrap/routing, token lifecycle, invalidation and task/completion rules.
- Root `pnpm exec tsc -p tsconfig.json --noEmit` and Driver `pnpm exec tsc -p apps/driver-app/tsconfig.json --noEmit`: both exit 0. Scoped ESLint (`--max-warnings=0`), Prettier, commit trailers and `git diff --check`: exit 0.
- Only this assigned worktree's 22 dependency symlinks were detached before `pnpm install --offline --frozen-lockfile --ignore-scripts`, exit 0. Canonical dependency directories and lockfiles were untouched. Versions: Node 22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4, Next 16.3.8, Nest 11.2.7, Driver React 19.1.0. Both old and new probes use these same frozen dependencies.

The old 5bd branch and PR 2643 remain preserved. This repair continues the
already authorized R19b recovery branch / PR 2673 in the assigned isolated cwd;
no rebase, amend, reset, force push or canonical-root branch switch occurred.
All checks started for this repair reached terminal results and were read.
Hosted CI for the new handoff SHA remains pending under the original bus/collector.

## R24 / R25 — retain the real empty Jobs evidence and inject its owned reader

**Correction to the first 041 artifact listing:** the absence of a separate PNG
in the ZIP did not mean there was no screenshot. Candidate
`04105926cd6cefd795505b71174407ad4c6c646b`, generation
`4cac082f38c34758820874e943860ee8`, has an inline
`driver-assigned-trip-failure` image in `report.json`. The owner independently
decoded its original bytes and viewed it: Jobs has All selected, all three
counts are zero, and the empty-task panel replaces the current-trip action.
The review GPS banner says awaiting acceptance, coordinate 1/9. The PNG is
55,125 bytes, SHA256
`b5b1d19cc9fbdf7a02745febff708d4a48c4877d742e521f54a083053f4ca60b`.
The literal final URL and original task response body remain unrecorded.

Actual hosted run `38765467677`, job `116529004287`, reached A order
`6efbcc80-4892-4ac0-b8f4-ca2a5eaf3515`: booking, dispatch, assign and reassign
passed; `開啟目前行程` then timed out after 30 seconds at spec line 222.
Dispatch job `16b792cb-f40d-4ece-924c-216b9bfc696e` is not a proven Driver
Task ID. Driver tasks/task-views returned 200; acceptance and B/C were not
reached. Artifact `11989171420` ZIP SHA256 matches GitHub's digest
`e088b8d75bf86be9113787eabb9ece51584719478830f6ba34303ad6ac5e735b`.
The job failed before the run's later natural cancellation. Its actual execution
commit was synthetic merge `4f2dc095892fef0af97814b21ee5b0078d824397`
(041 into `409bad360e89ec4e8e6e48c337f42295e15210d8`). These results are
not completion or acceptance credit for this repair.

The R25 source receipt identifies an additional real integration defect:
evaluating the production CommonJS AppModule import graph records `Object` at
ForwarderService's optional OwnedMobilityService constructor parameter. Direct
isolated loading records the correct class. With no explicit token, Nest can
omit this dependency; the actual `listDriverTaskViewsForRead` then returns its
existing empty fallback without reaching OwnedMobility's persisted reader.
Jobs treats that successful empty list as authoritative. This source defect
matches the observed empty Jobs; it does not retroactively reveal the hosted
process's unrecorded provider instance or response body.

The only product change imports Nest `forwardRef` and adds
`@Inject(forwardRef(() => OwnedMobilityService))` to that existing parameter.
Its position and `@Optional`, every service method, existing PG ForRead paths,
controller contracts, driver scoping and business rules remain unchanged.
The module already imports OwnedMobilityModule via forwardRef. No module,
identity, SDK, guard, workflow, deploy or configuration change is needed.

The new regression loads the complete actual AppModule import graph in fresh
CommonJS processes with production decorator metadata enabled. It uses Nest's
real prototype creation, optional dependency resolution and constructor
injection, then calls the real ForwarderController → ForwarderService →
OwnedMobilityService → OwnedMobilityRepository. Only unrelated providers and
external SQL responses are fixtures. A valid synthetic DriverTaskRecord and a
foreign-driver row exercise the real filtering/mapping; the assigned caller's
query cannot substitute another driver. A refused database read must propagate.
No Nest application/bootstrap/hooks, socket listener, PG, order creation or
successful acceptance is run or fabricated as runtime evidence.

The already-published small R24 failure-hook change is retained in this same
functional candidate. It records only a fixed route classification and three
fixed UI visibility flags from the active A/B Page. Queries, raw URLs, arbitrary
page text and HTTP bodies are excluded. Jobs/trip trailing slashes are handled;
onboarding, query-bearing or closed pages are not photographed. A navigation
during those probes prevents capture. The original three-order try block and
all 11 helpers remain identical, including UUID/2xx/accept assertions, the
720-second case and zero retries.

| Finding / acceptance                                              | Source and change                                                                               | Old → corrected result                                                                                                                                                                                                                                              | Commands / evidence                                                                                                                             | Remaining limitation                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R24: actual 041 empty Jobs picture was missed in ZIP-only listing | Original inline report attachment, independently decoded and viewed                             | Corrected the evidence interpretation; actual zero-task Jobs is observed                                                                                                                                                                                            | `hosted-failure-qualification.json`, original ZIP/report, decoded PNG and hashes                                                                | Literal final URL and original HTTP body remain unknown; screenshot alone cannot prove DI internals                    |
| R25: AppModule import order silently omits the owned task reader  | `ForwarderService` constructor; actual Nest injector and controller/Owned repository regression | Frozen 041: direct control passes, App caller returns no tasks/executes no SQL and succeeds in the database-error scenario; **2 fail / 1 pass**, exit 1. Corrected: **3 pass**, exit 0, with assigned task/UUID/actions, foreign isolation and DB-error propagation | `forwarder-owned-injection.test.ts`, `old-041-injection-final.log`, `new-injection-final.log`; final regression reruns all three                | SQL responses and unrelated providers are fixtures; not full Nest app initialization, PG or browser acceptance         |
| Retain existing failure and cold-reload behavior                  | Actual complete E2E callback, Jobs/Trip caller and identity regressions                         | Same final hook tests on frozen 041: **12 fail / 12 pass**, exit 1; corrected hook cases pass, including navigation during capture; original caller/identity cases pass                                                                                             | `old-041-hook-source72.log`; `regression-r25-final.log`; `source-invariants.json` proves unchanged helpers/three-order flow and product methods | Hook Page/image boundaries are fixtures, not new hosted screenshots or completed journeys                              |
| `pax-review-demo_real-shared-order-across-roles`                  | Existing real shared-order API/PG/peer assertions retained                                      | Pending, zero credit                                                                                                                                                                                                                                                | New candidate independent review/full CI and three formal-schema PG companions without skips still required                                     | No old candidate PG result is transferred; 16 local environment skips remain unverified                                |
| `pax-review-demo_external-simulation-and-complete-journeys`       | Original independent A/B/C, payment/retry/case/rating/cancel/history retained                   | Pending, zero credit                                                                                                                                                                                                                                                | All original browser operations and successful acceptance assertions retained                                                                   | Full real three-order browser journey remains required; source/SQL fixtures are insufficient                           |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`          | Existing hosted workflow and combined immutable Cloud Run delivery retained                     | Pending, zero credit                                                                                                                                                                                                                                                | Same-SHA review/full CI/browser, normal merge, sole immutable shared-dev deployment and fresh smoke still required                              | No VM product/HTTP/PG/browser/preview/Compose or Playwright CLI; no workflow dispatch/rerun/manual cancellation/deploy |

Executable verification source is
`31e0aa24559bbffd4f255e934b0fff02917eb684`; the handoff commit adds only
this UAT evidence. Canonical owner evidence, exact command/result ledger and
source/evidence SHA256 manifest are under
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate041-r24-r25-owned-injection/`.

- Old: `PAX_REVIEW_FORWARDER_SOURCE_REF=04105926cd6cefd795505b71174407ad4c6c646b pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/forwarder-owned-injection.test.ts --maxWorkers=2 --reporter=verbose`: exit 1, **2 behavioral assertion failures / 1 direct-load control pass**. All old source is read through `git show`; no active worktree is reset. The final old and new comparisons use the same corrected prototype fixture.
- New narrow injection test, same command without the source override: exit 0, **3 pass**. Initial replacement-probe failures came from omitting Nest's prototype setup before using its injector; that fixture error is retained in `new-injection.log` and is not a product reproduction. The fixture now follows the real InstanceLoader's `loadPrototype` → `loadProvider` order.
- Final affected regression: `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015 tests/unit/pax-shared-order-flow-20261015 tests/unit/pax-booking-history-20261009 tests/unit/forwarder.test.ts tests/unit/cross-app/owned-mobility-ops-map-api-closeout-proof.test.ts tests/security/iam-route-driver-negative.test.ts tests/security/iam-driver-authz-enforcement.test.ts --maxWorkers=2 --reporter=dot`: exit 0, **355 pass / 16 original environment skips**, 38 passing / six skipped files. Existing React act and intentional rejected-write warnings remain warnings. No skip or business assertion was relaxed.
- `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.controller.test.ts tests/unit/forwarder.service.test.ts tests/unit/owned-mobility.controller.test.ts tests/unit/ops-driver-tasks-scope.test.ts --maxWorkers=2 --reporter=dot`: exit 0, **56 pass / zero skips**. Narrow probes are already included in the final root regression.
- API production build and final root TypeScript: exit 0. The build ran at `6b67c2473f95e0dff668bd5f51c9c6ddb3e20759`; its product blob is unchanged at the final verification source. Scoped ESLint (`--max-warnings=0`), Prettier, source invariants, trailers and diff checks pass. The earlier fixture `this` alias lint failure is retained and corrected without a rule exemption.
- Node 22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4, Nest 11.2.7 and Next 16.3.8. Only this assigned worktree's 22 dependency symlinks were detached before an offline frozen installation with scripts disabled, exit 0; canonical dependencies and lockfiles were untouched.

All checks started in this owner turn reached terminal results and were read.
Earlier checkpoints and their logs remain preserved; they are not separate
review candidates. The final functional candidate retains the original recovery
branch and PR 2673 with ordinary non-force pushes. New hosted CI remains pending
under the original bus/collector; all three acceptance keys remain pending.

## R26 — read completion requirements through the assigned Driver task

Candidate `338c505a9e28a5ffc4a562b300b91f25de61b277` actually passed A's
Jobs/Trip UUID, acceptance, departure, pickup arrival, start, tracked distance
and real GPS freshness expiry/recovery in hosted run `38769921074`, job
`116544070469`. A was order `687dc077-e4cb-4985-88d4-d51c9e20a654`, task
`99cf67d0-d913-4736-ac4e-a1eed9d38ad8`. The next operation stalled at spec
line 343: Playwright resolved the actual-start-fare input but reported
`readonly` / `element is not editable` until the original 720-second case
deadline. The journal records Driver `GET /api/orders/<same UUID>` as 403.
There was no completion response, new payment result or completed A/B/C
evidence. The artifact ZIP/GitHub digest agrees at
`b002751dbc03ae04fad06464d79e14d0b4d33b12cabd0901da963e5deb64c5a2`.
Its failure attachment says the Driver page was already closed; the default
error-context snapshot is Passenger's on-trip page, not a Driver screenshot.

`TripScreen.loadTrip` used the general Ops order reader. The unchanged guard
refuses that reader for Driver; the catch clears `orderDetail`, making
`completionOrder` absent and the existing `proofRequirementsUnavailable`
condition lock both fare input and completion. Jobs used the same general
reader for its owned task cards. Neither Driver task DTO supplies the missing
authoritative fare and proof context.

The correction adds `GET driver/tasks/:taskId/order` beside the existing task
reader. It reuses `assertDriverTaskAccess` and `getOrderForRead(task.orderId)`;
the existing `driver/tasks*` policy, `driver:read`, driver aliases, task ownership
and DB miss/error behavior remain authoritative. The SDK exposes
`getDriverTaskOrder`, and Trip/Jobs use it for owned tasks. Forwarded tasks retain
their original order-reader branch. Completion inputs, fixed-price authority,
proof/tracking checks and command behavior are unchanged. The formal-schema PG
peer companion now also checks this same-order reader and foreign-driver refusal;
that new PG assertion remains unexecuted on the VM.

| Finding / acceptance                                                 | Source / change                                                                                                                         | Old → corrected evidence                                                                                                                                                                                                                                                                  | Command / result / evidence                                                                                                                            | Remaining limitation                                                                                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R26: Driver cannot edit actual fare after starting its assigned trip | `TripScreen.loadTrip`, `JobsScreen.loadTasks`, SDK `getDriverTaskOrder`, `OwnedMobilityController.getDriverTaskOrder`                   | Frozen 338 actual Trip/Jobs: three behavioral assertion failures; two unavailable/mismatched-order refusal controls pass. Corrected actual screens expose assigned-order fare data, preserve fixed-price no-override behavior and emit the entered metered breakdown through the real SDK | `old-final-source.log`: exit 1, 3 fail / 2 pass; corrected cases included in `final-regression.log`: exit 0, 431 pass / 16 original skips              | Native rendering/storage/location and upstream HTTP are fixtures; captured completion is deliberately refused by the fixture, not accepted as real business evidence |
| R26: preserve existing realm/ownership/persistence behavior          | Real `BootstrapAuthGuard`, controller → service → production repository                                                                 | General order read still refuses Driver; task order read admits the existing role/scope; anonymous/partner and foreign Driver refuse; missing task/order and DB errors do not revive a warm cache                                                                                         | `driver-task-order.test.ts`; `new-narrow-final.log`: exit 0; API suite `api-scope.log`: exit 0, 56 pass / zero skips                                   | SQL responses are the external fixture boundary; these cases are not PG/runtime acceptance                                                                           |
| R26: standalone and Passenger-mounted SDK/BFF transport              | Existing real SDK and `review-driver-api` GET handler, unchanged service-auth transport                                                 | Task ID reaches the task-scoped route, product Bearer remains separate from Google service auth, response is decoded to the existing order contract; existing refusal/disabled-path cases remain                                                                                          | `bff-final-typed.log`: exit 0, 3 pass; original Driver suite `driver-suite.log`: exit 0, 542 pass / zero skips                                         | External HTTP/Google metadata responses are fixtures; the new hosted browser must exercise both entries                                                              |
| Preserve original fare/proof/replay regression                       | Exact scoped `trip-caller-probe.cjs` HTTP fixture recognizes the new route and retains the legacy route for its frozen original control | Initial 22 fail / 27 pass exposed the stale external fixture route; only its route recognition changed, all original assertions remain; all cases pass in the corrected affected regression                                                                                               | `fare-suite-initial.log`; `final-regression.log`, exit 0                                                                                               | Initial fixture failures are retained, not reported as product reproductions or skipped                                                                              |
| Preserve published history after owner commit-subject error          | Original branch/PR 2673 and `d0c807dab` remain intact; replacement `recovery-r26` starts at accepted dev `431966bdf`                    | Trailer checker rejects the published `test(TASK-ID):` subject; clean replacement checker passes. All 125 task files match published `b60162afe` byte-for-byte, all 41 newer accepted trunk files remain intact                                                                           | `trailers.log`: exit 1; `recovery-trailers.log`: exit 0; `recovery-source-equivalence.json`, `recovery-trunk-preservation.json`, `recovery-scope.json` | No rebase/amend/reset/force push, checker exception or product omission; replacement requires its own review/CI                                                      |
| `pax-review-demo_real-shared-order-across-roles`                     | Existing real PG/peer/task identity paths and new task order reader                                                                     | Pending, zero credit                                                                                                                                                                                                                                                                      | New exact candidate still requires full CI and three formal-schema PG companions with zero skips                                                       | No previous candidate PG result is transferred; local environment skips remain unverified                                                                            |
| `pax-review-demo_external-simulation-and-complete-journeys`          | Original independent A/B/C, payment/retry/rating/case/cancellation/history and business-time waits                                      | Pending, zero credit                                                                                                                                                                                                                                                                      | Original full browser spec is byte-identical to 338; new candidate must complete every original operation                                              | 338 reached A on-trip only; no complete A or executed B/C is claimed                                                                                                 |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery`             | Existing hosted CI and combined immutable Cloud Run delivery                                                                            | Pending, zero credit                                                                                                                                                                                                                                                                      | New exact-SHA review/full CI/browser, normal merge, sole immutable shared-dev deployment and fresh smoke remain necessary                              | No VM product/PG/HTTP/browser/preview/Compose/Playwright CLI or workflow dispatch/rerun/manual cancellation/deployment                                               |

Canonical command/result ledger, before/after source hashes and original hosted
archive/log receipts are under
`.local/passenger-transport-bureau-review-20261015/codex2-owner-evidence/candidate338c-r26-completion-order/`.
The replacement executable source is
`dc84c6dd3419efcd1d35f84035dfafd56ba4a084`; subsequent source changes only add
this UAT evidence. Before replacement, root and Driver TypeScript, API production
build, scoped ESLint/Prettier and diff checks passed. The new-base checks are
recorded separately and must reach terminal results before handoff.

The first new probe incorrectly expected NTD instead of canonical TWD and used
a nonterminal fixture refusal that triggered the existing replay behavior.
The first mounted-BFF fixture omitted Google metadata, and its first TypeScript
version used an unresolved root alias / incompatible NextRequest input type.
Those fixture/type errors are retained in the ledger and corrected without a
product rule exemption. They are not old-product reproductions. Dependencies
were installed offline/frozen with scripts disabled after detaching only this
task cwd's 22 inherited dependency symlinks; canonical dependencies and lockfiles
were untouched. Node 22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4.
