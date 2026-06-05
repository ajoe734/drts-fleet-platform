# Dev gap audit summary

- Generated: 2026-06-05T08:30:59.782Z
- Platform Admin base URL: https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app
- Ops Console base URL: https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app

| App | Routes | Fully working | Broken |
| --- | ---: | ---: | --- |
| platform-admin | 18 | 18 | none |
| ops-console | 21 | 20 | `/vehicles/veh-demo-001` (HTTP 500) |

- Total broken routes: 1 / 39

## Broken routes

- ops-console /vehicles/veh-demo-001: HTTP 500; screenshot `.artifacts/func-audit/ops-console-vehicles-veh-demo-001.png`

## Manual checks

- pricingTabs: fail — expect(received).toBe(expected) // Object.is equality

Expected: "/pricing?tab=driver"
Received: "/pricing"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
