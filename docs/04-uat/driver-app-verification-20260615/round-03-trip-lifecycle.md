# Round 3 — Trip Lifecycle (`行程` / `app/trip.tsx`)

## Plan

Drive an owned task through the driver state machine and verify the Trip
workspace reflects each state.

- Functional: `pending_acceptance → accept → depart → arrived_pickup → start`
  with status assertions after each transition (driver realm API).
- Display: 行程作業台 for `on_trip` — route map, pickup/dropoff nodes, live trip
  timer, status pill, 完成行程 CTA, SOS.

## Execution (task `2b98fc7a-fd2c-4aaf-8c74-2ae7ca2c8fe8`)

| Step           | Endpoint                            | HTTP | Resulting `status` |
| -------------- | ----------------------------------- | ---: | ------------------ |
| accept         | `POST /api/driver/tasks/:id/accept` |  201 | `accepted`         |
| depart         | `POST …/depart`                     |  201 | `enroute_pickup`   |
| arrived_pickup | `POST …/arrived_pickup`             |  201 | `arrived_pickup`   |
| start          | `POST …/start`                      |  201 | `on_trip`          |

Then opened `drts-driver://trip` → `screens/r3-trip-on-trip.png`.

## Results — PASS

| Check                        | Expected                    | Observed                                            | Verdict |
| ---------------------------- | --------------------------- | --------------------------------------------------- | ------- |
| State transitions            | each 201, status advances   | accepted→enroute_pickup→arrived_pickup→on_trip      | PASS    |
| Trip screen for on_trip      | 行程作業台 + in-progress UI | 行程進行中, 自營派單 DRTS 行程主控                  | PASS    |
| Live trip timer              | counts since `start`        | 00:03:34 running                                    | PASS    |
| Route map                    | pickup + dropoff markers    | green pickup + red dropoff on map                   | PASS    |
| Trip nodes                   | 取貨點 / 送達點             | 待確認上車點 / 待確認下車點                         | PASS    |
| Fare/distance/duration tiles | render                      | 距離 0.00km / 時長 / 車資 金額待確認                | PASS    |
| Complete CTA                 | present (gated)             | 完成行程 button + "完單前需先載入訂單佐證需求" hint | PASS    |
| SOS                          | present                     | SOS button rendered                                 | PASS    |

## Defects / Findings

1. **[Expected behaviour, documented] Background-location gate.** Opening the Trip
   screen for an `on_trip` task requests `ACCESS_BACKGROUND_LOCATION` (active-trip
   heartbeat; `app.json` `isAndroidBackgroundLocationEnabled:true`). On Android 11+
   this can only be granted via system Settings, so the app routes there until
   granted. After granting FINE+COARSE+BACKGROUND the trip screen renders. Worth a
   clear in-app rationale/CTA before the Settings hop (UX follow-up). Heartbeat
   behaviour itself is covered in Round 10.

## Test-case impact

The owned task lifecycle accept→…→on_trip→complete is already covered end-to-end
by `tests/e2e/E2E-001-enterprise-dispatch.sh`. No new automated case for R3.
