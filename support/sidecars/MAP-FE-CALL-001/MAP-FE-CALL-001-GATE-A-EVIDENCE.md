# MAP-FE-CALL-001 Gate A Evidence Packet

**Sidecar task:** `MAP-FE-CALL-001-SIDECAR-GATEA`
**Parent task:** `MAP-FE-CALL-001` - Callcenter P0 map booking
**Parent owner/reviewer:** `Codex` / `Claude2`
**Sidecar owner/reviewer:** `Codex` / `Codex2`
**Scope boundary:** support artifact only. This packet maps current callcenter map-booking evidence to Gate A and defines the remaining E2E proof needed before production-readiness can be claimed.

## 1. Gate A Verdict

Do **not** claim callcenter map booking is production-ready yet.

The current review surface appears to cover the important frontend guardrails: the callcenter phone-booking form renders a map/address pair picker, prevents coordinate-less normal submission, preserves pickup/dropoff coordinate payloads, and exposes service-area/manual-review states to the operator.

What is still missing is full backend/provider E2E evidence proving that a real phone booking:

- persists pickup and dropoff coordinates with provenance
- persists the immutable service-area snapshot
- blocks no-pickup/not-serviceable flows before normal dispatch
- routes manual-review and provider-degraded cases explicitly instead of silently creating a normal coordinate-less order
- remains visible in Ops with the same coordinates and policy decision

Gate A can pass only after those end-to-end assertions are attached to `MAP-QA-002` / `MAP-REL-001` evidence.

## 2. Current Implementation Anchors

These anchors were captured from the `MAP-FE-CALL-001` review surface in the canonical workspace.

| Area             | File / line anchor                                                  | Evidence value                                                                                                                              |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate logic       | `apps/ops-console-web/app/callcenter/map-booking.ts:56`             | `hasCallcenterAddressCoordinates` validates finite lat/lng and valid coordinate ranges.                                                     |
| Provenance gate  | `apps/ops-console-web/app/callcenter/map-booking.ts:71`             | `hasCallcenterCoordinateProvenance` requires provider/manual/reverse-geocode provenance before submit.                                      |
| Submission block | `apps/ops-console-web/app/callcenter/map-booking.ts:86`             | `getCallcenterMapBookingGate` blocks missing pickup/dropoff coordinates, missing provenance, preview-required/error, and `not_serviceable`. |
| Command payload  | `apps/ops-console-web/app/callcenter/map-booking.ts:116`            | `buildCallcenterMapOrderCommand` keeps pickup/dropoff coordinate payloads for order creation.                                               |
| Picker render    | `apps/ops-console-web/app/callcenter/page.tsx:2650`                 | `AddressMapPairPicker` is mounted for phone booking with pickup/dropoff picker IDs and serviceability callbacks.                            |
| Operator reason  | `apps/ops-console-web/app/callcenter/page.tsx:2711`                 | The page exposes `data-callcenter-map-booking-gate` plus serviceability/evaluating/error state for visible operator feedback.               |
| Unit coverage    | `apps/ops-console-web/tests/unit/callcenter-map-booking.test.ts:52` | Unit tests cover coordinate/provenance readiness and blocked coordinate-less submission.                                                    |
| Playwright smoke | `tests/e2e/ops-console-parity.spec.ts:335`                          | Smoke test confirms the map pair picker is present and initial submit is disabled when coordinates are absent.                              |

## 3. Evidence Already Present

The current evidence is useful, but it is branch/UI-slice evidence rather than production Gate A proof.

| Evidence                       | Current status                                                              | What it proves                                                                                         | What it does not prove                                                                         |
| ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Callcenter map gate unit tests | Present in `apps/ops-console-web/tests/unit/callcenter-map-booking.test.ts` | Pure gate helper rejects coordinate-less or policy-blocked submit and preserves command payload shape. | No backend persistence, no real provider behavior, no service-area snapshot assertion.         |
| Ops-console Playwright smoke   | Present in `tests/e2e/ops-console-parity.spec.ts`                           | Phone-booking UI mounts the picker and starts fail-closed when no coordinates are selected.            | No successful order creation, no backend policy denial, no provider outage/manual-review path. |
| Operator state rendering       | Present in callcenter page state/data attributes                            | Block/manual-review/degraded state can be exposed to the operator.                                     | No proof that backend reason codes and UI reason text remain aligned.                          |

## 4. Required Gate A E2E Scenarios

`MAP-QA-002` should add or reference these as final Gate A evidence. Each scenario must include exact command output, branch/SHA, and assertion notes.

| Scenario                                          | Required assertions                                                                                                                                                                                                            | Gate risk covered                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `E2E-CALL-MAP-001 serviceable phone booking`      | Select pickup/dropoff via deterministic provider/mock candidates; submit order; backend order stores pickup/dropoff lat/lng, provenance, provider candidate metadata, and service-area snapshot; Ops map shows matching pins.  | Prevents "UI looked pinned, backend lost coordinates" failure.              |
| `E2E-CALL-MAP-002 no-pickup / not-serviceable`    | Select a coordinate inside a blocked no-pickup or out-of-service polygon; submit remains disabled or backend rejects; visible operator reason includes machine reason code; no normal dispatchable order is created.           | Prevents illegal pickup/dropoff from entering dispatch.                     |
| `E2E-CALL-MAP-003 manual-review zone`             | Select coordinate in manual-review policy area; operator sees manual-review state; created record is marked manual-review / non-normal dispatch per backend contract; audit snapshot records policy version and reason.        | Prevents manual-review from being mistaken for normal serviceable dispatch. |
| `E2E-CALL-MAP-004 provider degraded / no geocode` | Mock provider timeout/no-match/quota failure; UI shows degraded state; coordinate-less normal submit is blocked; allowed manual fallback requires explicit coordinates/reason and manual-review outcome where policy requires. | Prevents outage from creating silent text-only dispatch.                    |
| `E2E-CALL-MAP-005 snapshot immutability`          | Create serviceable order, then change service-area policy fixture; existing order keeps original evaluation snapshot/version while new evaluation uses new policy.                                                             | Prevents audit drift after policy changes.                                  |
| `E2E-CALL-MAP-006 backend authority`              | Bypass or tamper frontend payload in API-level test; backend rejects missing coordinates/provenance or blocked policy.                                                                                                         | Prevents frontend-only safety.                                              |
| `E2E-CALL-MAP-007 observability hooks`            | Successful, blocked, manual-review, and provider-degraded paths emit expected audit/metric events from `MAP-OBS-001` contract.                                                                                                 | Prevents unobservable production failure modes.                             |

## 5. Minimum Verification Commands

Parent task review can use targeted callcenter commands, but Gate A closeout needs backend/provider E2E commands as well.

Recommended parent-level checks:

```bash
pnpm --filter @drts/ops-console-web test
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/ops-console-web lint
pnpm exec playwright test -c playwright.ops-console-parity.config.ts -g "callcenter phone booking is gated by the map pair picker"
```

Recommended Gate A release checks:

```bash
pnpm --filter @drts/contracts typecheck
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api lint
pnpm --filter @drts/api test
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/ops-console-web lint
pnpm --filter @drts/ops-console-web test
pnpm exec playwright test -c playwright.map-geofence-harness.config.ts --grep "callcenter|Gate A|serviceable|manual-review|provider degraded"
```

If `playwright.map-geofence-harness.config.ts` does not yet contain callcenter scenarios, `MAP-QA-002` should add them or document the exact substitute command that exercises the same backend/provider fixtures.

## 6. Handoff To QA And Release

`MAP-QA-002` should use this packet as the Gate A checklist and produce the final evidence file with:

- branch and commit SHA under test
- deterministic service-area and provider/mock fixture names
- exact command output for each scenario
- order ID or fixture ID for successful serviceable booking
- backend assertion showing persisted pickup/dropoff coordinates and provenance
- backend assertion showing immutable service-area snapshot/version
- UI screenshot or Playwright trace for visible operator blocked/manual-review/degraded reason
- Ops map assertion showing matching order pins
- audit/metric assertion when `MAP-OBS-001` is available

`MAP-REL-001` should not mark Gate A as pass until this QA evidence exists and references the final `MAP-FE-CALL-001` implementation SHA.

## 7. Do-Not-Claim Rules

`MAP-FE-CALL-001` and downstream release notes must not claim:

- "production-ready callcenter map booking"
- "Gate A pass"
- "E2E complete"
- "provider outage safe"
- "backend snapshot verified"
- "coordinate-less dispatch impossible"

Safe interim wording:

- "Callcenter map-booking UI guardrails are implemented and under review."
- "Coordinate/provenance submit gating has unit and UI smoke evidence."
- "Production Gate A remains pending backend/provider E2E and release evidence."

## 8. Parent Handoff

Recommended note for `MAP-FE-CALL-001`:

```text
Use support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md as the Gate A checklist. Parent review may validate the callcenter UI slice, but production Gate A must remain open until MAP-QA-002 proves serviceable, blocked, manual-review, provider-degraded, backend-authority, snapshot, Ops-visibility, and observability scenarios end to end.
```
