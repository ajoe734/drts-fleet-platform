# SR-LIVE-MAP-C114-COVERAGE-20260930

Owner: Codex. Independent reviewer: Claude2. Base: `64b47218d`.
This artifact extends SR-LIVE-MAP-001; provider run 36658888280 on
`b35a1f83` does not prove the three new acceptance items.

## Implementation and source audit

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
  `OperationalObservabilityService.buildDriverStateMetrics` only counts
  dispatch-eligible/available drivers in stale-location alerts, excluding this
  offline identity. Each heartbeat rechecks isolation. Low-accuracy cleanup runs
  in `finally` and must restore fresh accurate offline telemetry to pass.
  This does **not** claim runtime eligibility reason codes were tested: it asserts
  the live tracking API's `fresh`, `stale`, `low_accuracy` observations.
- Browser: hosted Chromium must see ready state and downloaded map imagery;
  script success markers alone are insufficient. Credentials/trace must not be
  included in uploaded browser evidence.
- All probes fail closed on missing authorization, non-hosted execution, SHA
  mismatch, absent credentials or disallowed origins. No local live calls.

## Provisioning (operator / Supervisor only)

Existing `DRTS_LIVE_MAP_TEST_AUTHORIZED` must be exactly `true`.
New repository variables:

- `DRTS_LIVE_MAP_DEPLOYED_SHA`: full 40-character lowercase SHA of the already
  deployed shared dev runtime, as reported by API and ops `x-drts-candidate-sha`.
  This may differ from the **test candidate SHA**. Both are recorded explicitly;
  this test-only change does not deploy the candidate. A header mismatch fails.
- `DRTS_LIVE_MAP_API_ORIGIN`: HTTPS origin of shared dev API (no `/api` suffix).
- `DRTS_LIVE_MAP_TEST_DRIVER_ID`: dedicated `live-map-[a-z0-9-]+` registry identity;
  offline, `dispatchEligible=false`, no assigned vehicle or tasks. No active
  mobile client may send heartbeats for this identity during acceptance.
- Extend `DRTS_LIVE_MAP_ALLOWED_TARGETS` (comma-separated HTTPS origins) with
  that API origin and the actual Google resource origins used by the ops page,
  including `https://maps.googleapis.com`, `https://maps.gstatic.com`. Google
  Fonts can additionally require `https://fonts.googleapis.com` and
  `https://fonts.gstatic.com`; any further resource origin must be explicitly
  reviewed/allowlisted. Blocked origins (without paths/keys) appear in browser
  evidence. No wildcard domains, paths, credentials, HTTP or redirect escape.

New repository secrets (raw tokens, without the `Bearer ` prefix):

- `DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN`: deployment-issued driver realm session
  bound to the dedicated driver (`identity.actorId` exactly equals the configured
  ID), valid through the run (allow 20 minutes), including `driver:read`. Tokens
  must come from the supported device/session issuance path; no bootstrap header
  bypass or locally signed token is accepted by this harness.
- `DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN`: deployment-issued system/platform/ops
  session with `regulatory:read`, used only to confirm offline registry state.

Worker must never provision secrets or mint tokens. As of dispatch inspection,
these variables/secrets are absent, and the allowlist contains only ops origin.
This is a pending live acceptance prerequisite, not a passed/skipped test.

## Reproduction and checks

At base `64b47218d`, the map workflow had only provider smoke, and the browser
config accepted an origin without authorization/allowlist checks. The newly
required service/location/browser artifacts did not exist. These were coverage
gaps, not a claim of an already reproduced product decision defect.

The actual tsx entrypoint initially exposed a decorator transform failure:
root tsconfig includes tests but excludes API source. The scoped
`tsconfig.live.json` includes the production evaluator; its subprocess regression
now reaches the authorization gate with exit 1 and **no network calls**. Both
workflow coverage commands use that same explicit config.

Local checks (Node 22.23.2, pnpm 10.33.0; logs under `.local/c114/`):

- `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/ --maxWorkers=2`:
  41 tests passed (includes 12 Python evidence-gate cases and actual tsx gate
  subprocess). HTTP/time boundaries are mocked in unit tests; the production
  service-area evaluator and V0049 comparison are real. This is not live evidence.
- `pnpm exec tsc -p tsconfig.json --noEmit`: passed before final documentation;
  final same-tree result is recorded in handoff.
- Scoped ESLint and Prettier: final results recorded in handoff.
- No product server, database, browser, E2E server, container or external live
  call was started on this VM. The initial broken shared dependency links were
  detached in this worktree only; independent frozen dependencies were installed.

## Verification ledger

| Finding / required acceptance                         | Source / change                                                                                          | Previous → candidate                                                                                                  | Commands / evidence                                                                                                               | Remaining limitation                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| service_area_live_decisions_for_real_taiwan_addresses | V0049; ServiceAreaService.evaluate; service-area-cases.ts; coverage-runner.ts                            | absent → 5 mandatory probes over 4 public addresses, two outside-area products                                        | Unit oracle uses production logic; hosted evidence-coverage.json must contain address, geocode, basis, expected and actual result | Real Google + dev responses pending operator configuration             |
| location_freshness_live_states                        | DriverHeartbeatController; RegulatoryRegistryService.classifyDriverLocationFreshness; coverage-runner.ts | absent → fresh, real 95s wait, stale, low_accuracy, restored fresh                                                    | Unit orchestration/isolation negatives pass; hosted evidence includes ack, timestamps, waited_ms and live snapshots               | Dedicated offline identity and valid driver/observer sessions required |
| browser_map_render_live                               | GoogleMapBaseLayer; live spec/config; hosted workflow                                                    | disconnected → required Chromium step with ready + decoded imagery + map screenshots                                  | Missing imagery, missing screenshots, Google errors rejected by evidence gate                                                     | Actual hosted browser run pending; no local browser executed           |
| authorization_gate_and_allowed_targets_enforced       | live-map-config.ts; coverage HTTP redirect:error; Chromium request interception including redirects      | ungated browser → hosted-only strict true, exact HTTPS origins, candidate/workflow equality, deployment header checks | Unit unauthorized/disallowed-host/wrong-session/on-duty/wrong-deployment cases pass; no request on config rejection               | Hosted gate run and same-SHA CI tracked by lifecycle                   |

## Hosted execution and handoff

Dispatch `live-entry-map-acceptance.yml` on the **candidate branch/ref itself**,
with `candidate_sha=<full candidate SHA>`, `run_entry_profile=false`, and
`run_map_profile=true`. The workflow source SHA must equal the requested SHA.
Run only after the operator has provisioned the values above; absent values
produce a nonzero preflight and a failed run status, never a passing skip.
The workflow serializes all map jobs around the dedicated driver.

Download `live-map-acceptance-<candidate SHA>` and inspect `run-status.json`,
`evidence-map.json`, `evidence-coverage.json`, `evidence-browser.json`, and both
map PNGs. `gate-evidence.py` requires all steps/evidence to pass on that candidate
and both new runtime probes to match the configured deployed SHA. Trace/video,
raw auth session responses, registry data and provider keys are never uploaded.

Candidate SHA, PR and same-SHA CI/live run URLs belong to the canonical handoff
record; this versioned artifact travels with that candidate. Checkpoints
`c440a12a6` and `b1babc8f0` are recoverability commits, not acceptance results.
Owner does not close the task. Claude2 must independently review the candidate;
live acceptance remains outstanding until the hosted evidence above passes.
