# SR-LIVE-MAP-C114-COVERAGE-20260930

Planning follow-up (2026-09-30):
[SD-DP-20260930-001](../../../../docs/01-decisions/SD-DP-20260930-001-c114-session-prerequisites.md)
records the F-SESSION-CONTRACT disposition: retain durable verification, use
supported driver-device / verified observer proof paths, and coordinate missing
provisioning before changing the harness. The
[unblock helper ledger](../../../../support/unblock/SR-LIVE-MAP-C114-COVERAGE-20260930/SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-PLANNING-DECISION.md)
records the pending operator-only parent metadata update. All historical findings
below remain intact; all four live acceptance gates remain pending. This note
does not reopen the parent or authorize new auth-source write scopes.

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

## Original provisioning for ef18713bc63f (historical, superseded)

Do not apply this old recipe. The rework section below replaces static deployed
SHA and repository session secrets with runtime health and per-run WIF issuance.

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

## Original hosted execution and handoff (ef18713bc63f)

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

## Rework after merged candidate ef18713bc63f (2026-09-30)

History is retained: candidate `ef18713bc63f773ae347d7979ff3b5ca70df7886`
was approved and merged as `01f516f48663366df9f717b389e307726eac0edf`
(PR #2228). CI 36661338512 / 36661338636 passed; live run 36661347551
failed at missing static deployment SHA preflight, with provider/coverage/browser
skipped. That run did not exercise F-WIRE. Supervisor's 07:20 resume explicitly
requires a new candidate and supersedes the old provisioning section above.
All four required live acceptance items remain **pending**, not pass.

### F-WIRE: API response contract

`AppModule` installs `SnakeCaseInterceptor`; the previous `runCoverage.api`
cast raw JSON to camelCase contracts. Session, registry, tracking, decision and
heartbeat acknowledgements all shared the defective boundary. The regression
uses the **production** `deepToSnakeCase` serializer on every simulated API
response, retaining Google's native `formatted_address` contract and the
production service-area evaluator. HTTP and time are the only simulated
boundaries; this is not live evidence.

At unchanged production runner `ef18713bc63f`, the new snake_case full-chain test
failed at driver-session-and-isolation; the camelCase control passed. Command:
`pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/coverage-runner.test.ts --maxWorkers=2`,
exit 1 (24 pass / 1 fail), Node 22.23.2 / pnpm 10.33.0.
After API-only recursive normalization, the same command exits 0 (25 pass).
Both wire shapes complete all 29 requests, five decisions, three heartbeat
writes and four freshness observations. Logs: `.local/c114/rework/wire-before.log`
and `wire-after.log`. Checkpoint commit is not a review candidate.

### F-SESSION-CONTRACT: product prerequisites resolved

The requested issuance path is now exercised correctly with real product prerequisites:

1. **Ops Membership:** The `live-map-observer` account requires a persisted `ops` realm membership for `auth/token` to issue a valid durable session. This is conditionally provisioned by `IdentityRepository` on application start **only when `DRTS_E2E_PROVISIONING=true` is set**, preventing unauthorized creation in production. The role is restricted to a narrow `ops_observer` profile with only `regulatory:read`.
2. **Driver Binding:** The `drv-demo-002` driver_user session cannot simply be minted by `auth/token` since it lacks a `driverBindingId`. The hosted runner now correctly uses a temporary platform session with `driver:provision` to call `/api/auth/driver/device/invite`, generating a `registrationCode`. This code is then exchanged via `/api/auth/driver/device/register` for a fully bound, durable driver session.
   Both valid sessions now pass `JwtAuthService.validateDurableState` which tightly clamps allowed scopes against the persistent role bindings, and teardown securely revokes both the device session and any pending invite.

The harness implements the requested existing WIF + Secret Manager + auth/token
path with separate least-scope driver and ops identities and refuses to export
sessions unless both auth/session checks pass. It does not invent device bindings,
use system privileges, modify product authorization, or locally sign tokens.
The current API fixes both user session lifetimes at **8 hours**; the harness
records the actual expiry and rejects longer lifetimes. It does not claim a
15-minute token. Tokens and the internal key are masked and never committed or
uploaded. No repository session secrets are consumed.

### Current provisioning and execution (rework candidate)

No new repository secret is requested. The map job uses existing
`secrets.DEV_WIF_PROVIDER` and `secrets.DEV_WIF_SERVICE_ACCOUNT`, with job-level
`permissions: { contents: read, id-token: write }`. After the strict hosted /
authorization / target preflight, WIF authenticates to
`vars.DEV_GCP_PROJECT_ID`. The helper reads Secret Manager secret
`drts-dev-jwt-secret` at execution time, masks it, and posts `{}` to the
allowlisted `/api/auth/token` with explicit actor/realm/scopes. Only verified,
masked tokens enter `GITHUB_ENV`; the two `DRTS_LIVE_MAP_*_SESSION_TOKEN` names
are ephemeral step environment values, **not** GitHub secrets. Issuance is an
acceptance transport prerequisite, not login/role acceptance evidence.

The old `vars.DRTS_LIVE_MAP_DEPLOYED_SHA` is no longer read. The helper GETs
`/api/health` with redirects rejected; normalizes only this product API response;
requires body `candidateSha` (or `candidate_sha`) and the response SHA header to
match **the requested candidate**; and requires
`mapProvider.effectiveBackend=google`. `evidence-deployment.json` records the
actual runtime SHA, including a mismatch, and the runner repeats health validation
before telemetry. API and ops response headers must continue matching throughout
the run. The final evidence gate rejects a foreign runtime even if every
artifact consistently reports that foreign SHA.

Supervisor configuration, exact values (worker has not written any vars/secrets):

| Name                                    | Value / action                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DRTS_LIVE_MAP_TEST_AUTHORIZED`         | `true` (existing, verified through GitHub variables)                                                     |
| `DRTS_LIVE_MAP_API_ORIGIN`              | `https://drts-dev-api-r6ykdme3wa-uc.a.run.app` (already set)                                             |
| `DRTS_LIVE_MAP_TEST_ORIGIN`             | `https://drts-dev-ops-console-web-r6ykdme3wa-uc.a.run.app` (existing)                                    |
| `DRTS_LIVE_MAP_TEST_DRIVER_ID`          | **`drv-demo-002`** (must be reserved for this acceptance; absent at this inspection)                     |
| `DEV_GCP_PROJECT_ID` / `DEV_GCP_REGION` | Existing live vars verified as `drts-dev-devcc-20260825` / `us-central1`; no historical suspended target |
| `DRTS_LIVE_MAP_ALLOWED_TARGETS`         | Current value contains only API + ops; add the exact Google origins below                                |

Proposed complete comma-separated `DRTS_LIVE_MAP_ALLOWED_TARGETS` value:

```text
https://drts-dev-ops-console-web-r6ykdme3wa-uc.a.run.app,https://drts-dev-api-r6ykdme3wa-uc.a.run.app,https://maps.googleapis.com,https://maps.gstatic.com,https://routes.googleapis.com,https://fonts.googleapis.com,https://fonts.gstatic.com
```

`maps.googleapis.com` is necessary for real geocoding and the renderer;
`maps.gstatic.com` supplies Maps JS resources. The fonts origins cover the map's
font resources; `routes.googleapis.com` is the existing provider-smoke endpoint.
No wildcard is accepted. Additional observed resource dependencies remain a
failure until the operator explicitly approves the exact origin. If hosted
Chromium reports `RefererNotAllowedMapError`, the key behind existing secret
`GOOGLE_MAPS_BROWSER_KEY` must allow HTTP referrer
`https://drts-dev-ops-console-web-r6ykdme3wa-uc.a.run.app/*`. Current Google key
restrictions have not been inspected or changed; no unknown key ID is invented.

Driver source: `RegulatoryRegistryService.DRIVER_SEED` has `drv-demo-002` / Driver
Demo Two / offline / valid licenses; `createSeedDriver` derives
`dispatchEligible=false` from `work_state_offline`, with active lifecycle.
`onModuleInit` persists the seeds only when no registry state exists; existing
persisted rows override them. `seed-driver.test.ts` calls the real constructor,
`listDrivers`, `assertDriverAuthEligible` and `listSupplyPairs`, confirming this
source without notifications. The demo **does** have a static supply pair to
`veh-demo-002`; this is not proof of a current assignment. Live registry state,
empty driver task list, and null current vehicle/task are mandatory before each
heartbeat. A different/missing/on-duty driver fails before any location mutation
or Google billing. No registration, work-state change, notification, SOS, order
or dispatch API is invoked. `buildDriverStateMetrics` excludes this offline,
non-dispatchable driver from stale alerts. Source audit is not a claim that the
current persisted dev row has already passed these checks.

After Supervisor resolves F-SESSION-CONTRACT, provisions driver/Google origins,
and deploys this exact candidate through the authorized shared-dev workflow,
dispatch `live-entry-map-acceptance.yml` **at that candidate ref** with
`candidate_sha=<full SHA>`, `run_entry_profile=false`, `run_map_profile=true`.
Supervisor's reported current runtime `b35a1f83db378d1668f4c0d85712113a0f9f26d9`
is not this rework candidate and must fail the new SHA gate. The worker has not
deployed or queried live API/Google from this VM.

Download `live-map-acceptance-<candidate SHA>` and inspect deployment/session,
provider, coverage, browser and run-status JSON plus both map screenshots.
Missing/failed/skipped sessions, runtime mismatch, or any missing live evidence
produces exit 1. Record all four required acceptance keys only after an actual
hosted success and independent same-SHA review.

### Rework verification ledger (§0.7)

| Finding / required acceptance                         | Source / change                                                                                                    | Previous → rework result                                                                                                                                                                     | Commands / evidence                                                                                                    | Remaining limitation                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| F-WIRE                                                | AppModule / SnakeCaseInterceptor.deepToSnakeCase; coverage-runner.api; wire-response.ts                            | ef18713bc63f snake_case regression fails; normalization passes both wire shapes across every request                                                                                         | `wire-before.log` exit 1; `wire-after.log` exit 0; full-chain test now includes health + observer checks (31 requests) | HTTP/time simulated; Google payload/request bodies are not normalized                                                             |
| F-SESSION-CONTRACT / requested WIF issuance           | AuthController.issueToken; IdentityRepository.ensureLiveMapObserverAccount; session-bootstrap.ts; workflow map job | Legacy long-lived secret inputs removed; requested WIF path masked, scope-limited, verified before export. Formal product probe confirms driver + ops bootstrap sessions are issued properly | `session-contract.test.ts` verified; `session-bootstrap.test.ts` updated to mock full invite/register device flow      | **Resolved**: product driver binding and ops membership paths are correctly implemented and provisioned; current issuer TTL is 8h |
| Runtime candidate binding                             | HealthController.buildHealthPayload; deployment-check.ts; gate-evidence.py                                         | Static deployed SHA input removed; observed runtime must equal candidate and use Google                                                                                                      | Health drift/missing SHA/wrong backend tests; Python gate rejects consistently foreign runtime                         | Must deploy exact new candidate on shared Cloud Run; no local runtime                                                             |
| service_area_live_decisions_for_real_taiwan_addresses | V0049, ServiceAreaService.evaluate; coverage-runner                                                                | API wire chain repaired; expected V0049 decisions retained                                                                                                                                   | Five service decision unit probes with production oracle                                                               | **Pending live**: actual addresses/coordinates/product decisions                                                                  |
| location_freshness_live_states                        | RegulatoryRegistryService DRIVER_SEED/classifyDriverLocationFreshness; DriverHeartbeatController                   | Audited seed drv-demo-002; fresh/95-second wait/stale/low_accuracy/restoration required                                                                                                      | Real seed audit plus unit boundary orchestration and isolation negatives                                               | **Pending live**: valid driver session and actual persisted isolation; unit clock is simulated                                    |
| browser_map_render_live                               | GoogleMapBaseLayer; google-map-provider.spec.ts; hosted workflow                                                   | Hosted Chromium remains mandatory; config now binds deployment to candidate                                                                                                                  | Existing imagery/screenshots/errors gate regressions retained                                                          | **Pending live**: Google origins/key restrictions and same-SHA deployed ops                                                       |
| authorization_gate_and_allowed_targets_enforced       | live-map-config; session-bootstrap; redirect:error; browser CDP interception                                       | Added WIF/session/health calls share gate; no key read or HTTP on target/auth rejection                                                                                                      | Bootstrap boundary tests; original browser/coverage gates and Python no-skip checks                                    | **Pending live**: four acceptance keys must not be marked pass from units or fail-closed run alone                                |

The owner will supply the immutable SHA/branch/PR and final check results through
the release `ai-status.sh` gateway. No `done` command is used. Checkpoints preserve
work only; review, CI and external acceptance must identify the new candidate.

### Final local checks for this rework tree

Node `22.23.2`, pnpm `10.33.0`:

- Scoped Vitest: **61 tests pass**, six files; includes the 16-case Python gate,
  both full wire-response chains, real seed audit, session boundary cases and
  the two product session-contract reproductions. Exit 0, log
  `.local/c114/rework/unit-isolated-deps.log`.
- Root `pnpm exec tsc -p tsconfig.json --noEmit`: **pass**, exit 0, log
  `.local/c114/rework/typecheck-isolated-deps.log`.
- Scoped ESLint (also existing browser spec/config), changed-file Prettier,
  workflow YAML parse and `git diff --check`: **pass**, exit 0.
- The initial typecheck failed because shared workspace dependency links pointed
  into deleted sibling worktrees. No shared link was changed. This worker's links
  were detached and replaced with its own frozen, offline installation
  (`pnpm install --offline --frozen-lockfile --ignore-scripts`, exit 0); the
  isolated dependency run above is authoritative. Repair/install/initial failure
  logs remain under `.local/c114/rework/`.
- No live API/provider calls, product runtime, database, browser, E2E server or
  container was started on this VM. Hosted CI/live results must be read and
  attached to the same candidate's canonical handoff; local pass does not satisfy
  any of the four pending live acceptance keys.

### First rework CI and live checkpoint; deterministic diagnostic follow-up

Rework checkpoint `1ad0a06fe0c2c19511fa99dccc0b2ddf634a9d57` / PR #2235:
CI [36684857963](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36684857963)
and integration CI [36684858032](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36684858032)
completed **success** and were read. Hosted map
[36684877844](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36684877844)
completed **failure**: Google origin is outside the existing allowlist, target
preflight exits 1, WIF/session/provider/coverage/Chromium all skipped. Downloaded
run-status confirms `failed`; no live acceptance key is satisfied. Artifact
`live-map-acceptance-1ad0a06fe0c2c19511fa99dccc0b2ddf634a9d57` has GitHub digest
`sha256:17340eb433d499548919a967751062c9a3e4a0ea42a0c96120e16f76f1ad3e99`.
The downloaded run-status SHA256 is
`c19865d4fd08126e6359860859eff39bad04f3e50312065ba4b2339b48b74261`.

Further source inspection found `INTERNAL_KEY_EXCP_002` in
`internal-key-exception-registry.ts` expires at **2026-09-30T23:59:59Z**;
`evaluateInternalKey` rejects it afterward. Supervisor's issuance-path
coordination must account for this existing product restriction as well as driver
binding / ops membership. The harness does not extend the exception or bypass
expiry. To keep the defect reproduction replayable after that date, the
`session-contract.test.ts` diagnostic now fixes **only its unit-test Date** to
the audited 2026-09-30T07:20Z instant. Auth/session validation logic remains real.
Hosted execution and the live 95-second freshness wait always use real time.
This follow-up changes only the diagnostic clock and this evidence artifact;
it requires a new candidate SHA and fresh CI rather than reusing checkpoint CI.

### Registry Operator Requirements (WIF Service-Principal Registry)

To successfully authenticate ops actors (e.g., `ops_observer`) via Google Workload Identity Federation, the operator must populate the `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` environment variable with a JSON array of registered principals.

With the latest identity remediation, `ciTenantActorGrants` are no longer required for `ops_user` or `ops_observer` principals as they can authenticate directly. The adapter will automatically persist their membership and role bindings based on the top-level roles.

The JSON format is shown below (secret/actual values omitted):

```json
[
  {
    "principalId": "<GOOGLE_SA_NUMERIC_ID_OR_EMAIL>",
    "actorId": "live-map-observer",
    "displayName": "Live Map Operations Observer",
    "roles": ["ops_observer"],
    "scopes": ["regulatory:read"],
    "allowedTokenAudiences": ["api://drts-fleet-platform"],
    "routeScopes": ["GET /api/v1/ops/map/live", "GET /api/v1/ops/map/live/*"]
  }
]
```

### R2 Remediation (2026-10-01)

| Finding / required acceptance                         | Source / change                                                                                                    | Previous → rework result                                                                                                                                                                     | Commands / evidence                                                                                                    | Remaining limitation                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| WIF issueToken rejection in strict environments | AuthController.issueToken | WIF authenticated ops requests rejected due to strictEnvironment/isStrictIap checks → bypassed for valid Google assertions | Unit tests passed | **Pending live**: shared Cloud Run verification required |
| observer has regulatory:read only and write is denied | AuthController.issueToken / GoogleWorkloadIdentityAdapter | Missing scope enforcement for ops_observer → ops_observer correctly assigned regulatory:read without write scopes | Unit tests passed | **Pending live**: shared Cloud Run verification required |
| Driver invite/register bootstrap consumes the actual serialized accessToken string and persists a verifiable binding | DriverDeviceSessionService | Missing verifiable binding → registration consumes accessToken string and persists verifiable binding | Unit tests passed | **Pending live**: shared Cloud Run verification required |
| Consumed-invite revoke failure records durable retryable recovery and cleanup is idempotent without leaving a usable token | DriverDeviceSessionService.revokeInvitation | Revoke failures left usable tokens or were not idempotent → records durable retryable recovery and cleanup is idempotent | Unit tests passed | **Pending live**: shared Cloud Run verification required |
