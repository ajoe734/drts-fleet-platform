# SR-LIVE-MAP-C114-COVERAGE-20260930

Owner: Codex. Independent reviewer: Claude2. Base: `64b47218d`.
This artifact extends SR-LIVE-MAP-001; provider run 36658888280 on
`b35a1f83` does not prove the three new acceptance items.

## Implementation checkpoint

- Service areas: `ServiceAreaService.evaluate/evaluateStop` and V0049 are the
  authority. Taipei supports taxi products, airport supports only
  `credit_card_airport_transfer`. Taipei station pickup is denied within 220 m;
  the Xinyi 180 m policy requires manual review. Never infer a decision from
  an address label; evaluate Google's actual coordinates with production logic.
- Location: `DriverHeartbeatController` binds driver writes to the session.
  `RegulatoryRegistryService.classifyDriverLocationFreshness` observes age of
  `updatedAt` (90 seconds), while runtime eligibility uses `recordedAt`.
  This probe verifies the tracking observation contract. It will wait real time,
  use only current timestamps, and require a dedicated offline, non-dispatchable
  driver without vehicle/task context. No alert, order, or dispatch API is called.
- Browser: hosted Chromium must see ready state and downloaded map imagery;
  script success markers alone are insufficient. Credentials/trace must not be
  included in uploaded browser evidence.
- All probes fail closed on missing authorization, non-hosted execution, SHA
  mismatch, absent credentials or disallowed origins. No local live calls.

## Provisioning (operator / Supervisor only)

Existing `DRTS_LIVE_MAP_TEST_AUTHORIZED` must be exactly `true`.
New repository variables:

- `DRTS_LIVE_MAP_API_ORIGIN`: HTTPS origin of shared dev API (no `/api` suffix).
- `DRTS_LIVE_MAP_TEST_DRIVER_ID`: dedicated `live-map-[a-z0-9-]+` registry identity;
  offline, `dispatchEligible=false`, no assigned vehicle or tasks. No active
  mobile client may send heartbeats for this identity during acceptance.
- Extend `DRTS_LIVE_MAP_ALLOWED_TARGETS` (comma-separated HTTPS origins) with
  that API origin and the actual Google resource origins used by the ops page,
  including `https://maps.googleapis.com`, `https://maps.gstatic.com`.

New repository secrets (raw tokens, without the `Bearer ` prefix):

- `DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN`: deployment-issued driver realm session
  bound to the dedicated driver, valid through the run, including `driver:read`.
- `DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN`: deployment-issued system/platform/ops
  session with `regulatory:read`, used only to confirm offline registry state.

Worker must never provision secrets or mint tokens. As of dispatch inspection,
these variables/secrets are absent, and the allowlist contains only ops origin.
This is a pending live acceptance prerequisite, not a passed/skipped test.

## Verification ledger

| Finding / required acceptance                         | Source / change                          | Previous → candidate                    | Commands / evidence | Remaining limitation                |
| ----------------------------------------------------- | ---------------------------------------- | --------------------------------------- | ------------------- | ----------------------------------- |
| service_area_live_decisions_for_real_taiwan_addresses | V0049; ServiceAreaService.evaluate       | absent → in implementation              | pending             | Hosted credentials / API allowlist  |
| location_freshness_live_states                        | driver heartbeat batch + tracking-status | absent → in implementation              | pending             | Isolated driver and sessions        |
| browser_map_render_live                               | GoogleMapBaseLayer; live Playwright spec | disconnected → in implementation        | pending             | Hosted Chromium                     |
| authorization_gate_and_allowed_targets_enforced       | shared live-map-config.ts                | browser lacked gate → in implementation | pending             | Unit tests and hosted negative gate |

No candidate is locked at this checkpoint; no live acceptance is claimed.
