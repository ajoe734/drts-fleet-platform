# Round 4 — Forwarded Order Flow (third-party platform)

## Plan

Verify the cross-platform forwarded-order invariants and driver actions:

- Functional: create a fresh forwarded order (forwarder ingress → broadcast),
  then driver **accept** — assert `sourcePlatform` and `routeLocked` are
  preserved; driver **reject** another — assert it leaves the driver view.
- Display: forwarded tasks surface as 外部平台 in the Jobs inbox alongside owned.

## Execution

Ops actor created two `forwarder_sandbox` orders broadcast to `drv-demo-001`;
driver realm acted on each. Metadata read from `GET /api/driver/task-views/:id`.

| Path   | Task            | accept/reject HTTP | sourcePlatform                                        | routeLocked                 | result                               |
| ------ | --------------- | -----------------: | ----------------------------------------------------- | --------------------------- | ------------------------------------ |
| ACCEPT | `FWD-9a239665…` |                201 | `forwarder_sandbox` → `forwarder_sandbox` (preserved) | `true` → `true` (preserved) | PASS                                 |
| REJECT | `FWD-24aaf8ab…` |                201 | (n/a)                                                 | (n/a)                       | task removed from driver view (PASS) |

## Results — PASS

| Check                           | Expected                      | Observed                                  | Verdict |
| ------------------------------- | ----------------------------- | ----------------------------------------- | ------- |
| Forwarder ingress + broadcast   | mirror order to driver        | broadcasted FWD task visible to driver    | PASS    |
| Accept preserves sourcePlatform | non-DRTS retained             | `forwarder_sandbox` retained after accept | PASS    |
| Accept preserves routeLocked    | stays true                    | `true` retained after accept              | PASS    |
| Reject                          | 201, offer leaves inbox       | task-view empty after reject              | PASS    |
| Jobs display                    | forwarded counted as 外部平台 | 外部平台 = 5 (forwarded), owned distinct  | PASS    |
| Owned in-progress cross-check   | R3 task shows 進行中          | 自營派單 進行中 card at top               | PASS    |

## Defects / Findings

None. Forwarded-order authority isolation holds on-device (route-locked, source
platform preserved through accept; rejected offers disappear). Status field name
differs between list and detail payloads (cosmetic; transitions themselves are
asserted by E2E-006).

## Test-case impact

`tests/e2e/E2E-006-driver-multi-platform.sh` already asserts forwarded accept +
metadata preservation + no-owned-assignment. Reject-removes-from-inbox is the one
behaviour not yet automated → candidate to extend E2E-006 (tracked for finalize).
