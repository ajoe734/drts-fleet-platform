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
