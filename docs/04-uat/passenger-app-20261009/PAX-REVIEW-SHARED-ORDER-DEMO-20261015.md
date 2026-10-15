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
