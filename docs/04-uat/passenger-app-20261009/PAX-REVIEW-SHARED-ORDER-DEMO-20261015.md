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
  The new three-role case started at **10:24:44.780766 UTC** and the job was
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

| Finding / acceptance | Source / repair | Old result → replacement verification | Evidence / command | Remaining limits |
| --- | --- | --- | --- | --- |
| R13: new case has no time to finish/report within the old combined job | `ci-integ.yml::ui-shared-order-e2e`, original `e2e` aggregate; original spec plus `progress.ts::createJourneyProgress` | Actual old job cancellation with no new artifact → socket-free journal test proves the started stage and safe endpoint facts are persisted before completion, and thrown errors propagate with a failed stage | `journey-progress.test.ts`; `progress-test.log`; old `ui.log`, `unit.log`, GitHub deadline annotations | Precise old hang remains unknown. A replacement hosted run must localize it and execute all three orders; journal tests are not browser evidence |
| Original suite and timeout preservation | Existing workflow/jobs and unchanged browser assertions | Five legacy browser commands and exactly one new case retained; both required by the original aggregate; 25-minute limits unchanged; all other jobs unchanged | `workflow-placement-proof.py` / `.json`; existing workflow timeout/scope/coverage checks, 17 tests pass; `assertion-invariance.json`, 160 original/current calls in the same order | Structural verification starts no runtime and grants no CI green |
| `pax-review-demo_real-shared-order-across-roles` | All original production repositories and three PG companions retained | 8202 historical three PG passes retained; replacement acceptance pending, zero credit | Replacement same-SHA full CI and genuine three-role UUID/peer readback required | No PG/browser runtime is started on this VM |
| `pax-review-demo_external-simulation-and-complete-journeys` | Original three independent journeys and external-provider disclosures retained | Pending, zero credit | Replacement hosted one-test/three-order completion, relational records and role screenshots required | No successful orders are inferred from the old `Running 1 test` line |
| `pax-review-demo_hosted-browser-and-shared-dev-delivery` | Same existing hosted workflow and original combined shared-dev delivery task | Pending, zero credit | Same-SHA source review/full CI, normal merge, immutable combined publish/Cloud Run deployment and new shared-dev smoke required | No separate Demo-only publisher, deploy or old-release substitution |

Initial root typecheck used the Supervisor's canonical dependency symlinks and
failed with missing packages and mixed canonical/worktree private class types
(`typecheck.log`, exit 2). This is not a product assertion result. The owner
removed only this task worktree's 22 dependency symlinks and completed
`CI=true pnpm install --frozen-lockfile --offline --ignore-scripts` (exit 0,
`install.log`). Canonical dependencies, tracked manifests and lockfiles were
not changed. Replacement checks and their final results are recorded separately.
