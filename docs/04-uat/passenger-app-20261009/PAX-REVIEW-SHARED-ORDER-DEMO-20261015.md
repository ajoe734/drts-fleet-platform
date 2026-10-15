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
