# SR-LIVE-MAP-C114-COVERAGE-20260930

Current repair (2026-10-01): merge R2 prerequisite `5b0ec5283377ece785b0949245ae7dd6da1b0573` without discarding the historical readbacks below. R2 candidate `3ac29a96b69cbfc9f845c52c78596ceff58b67ae` has independent approval and CI; parent consumer/cleanup fixes and all four live acceptance gates remain pending. No live dispatch until configured and safe.

Historical hold (2026-10-01, before R2): the identity prerequisite helper merged as
`8da27255f3c668af61a7fd28654198d59993f38b`, but the executable readback below
still reproduces F-SESSION-CONTRACT on that product source. A verified Google
principal cannot issue the requested observer session, and the real driver
registration response breaks bootstrap after creating a binding that its catch
does not revoke. The helper's historical "resolved" claims below are superseded
by the [2026-10-01 readback](#identity-prerequisite-readback-2026-10-01).
Do not dispatch a live run or the historical internal-key recipe while these
defects remain. All four live gates remain pending.

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

### F-SESSION-CONTRACT: helper resolution claim (superseded by 2026-10-01 readback)

The following claim arrived with helper PR #2251 and is retained for review
traceability. It is **not** the current disposition; see the executable readback
at the end of this artifact.

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

## Supervisor rework: supported-session investigation (2026-09-30 23:31 UTC)

Dispatch supersedes the old Secret Manager / internal-key guidance. Owner read
the full task disposition and SD-DP-20260930-001, retained candidate
`e3c7ed02701c387d82786bcfd8877e2618851f3b`, and normally merged `origin/dev`
`739e7e9e44c5128550c79171c3fc48bf0b3b44b0` as anchor
`ba9937bac09a5343721d6bbea2dd094755e16369`. The merge brings in the product WIF
contract for executable investigation; it is not a new acceptance candidate.
The current WIF task branch `072d23233309c3dd5637af25d4a571bc2556d610`
has the same `AuthController` contract. No product auth source was changed.

### F-SESSION-CONTRACT / driver invitation: first use exists, renewal is missing

The answer to the dispatch's registration-code question is more precise than
"no issuance route":

1. `DriverProfileService.resolveProvisionableDriverId` treats a known profile ID
   as a provisionable code. Its real seed includes `drv-demo-002`.
   `DriverDeviceSessionService.register` calls `issueRegistrationInvitation`
   **only if no invitation with that code hash already exists**.
2. With an untouched repository, `POST auth/driver/device/register` using that
   profile ID issues a valid **15m** session with `driverBindingId === sid`, the
   device claim, and server-issued scopes `driver:read`, `driver:write`,
   `dispatch:read`. `JwtAuthService.verifyAccessToken` accepts it.
3. `POST auth/driver/device/refresh` rotates the refresh token and invalidates the
   prior access token. `POST auth/driver/device/revoke`, authenticated by the
   bound driver, revokes the binding, refresh family and durable IAM session.
4. Revocation does **not** reset the consumed invitation. A second registration
   for `drv-demo-002`, even with a different device ID, fails with
   `DRIVER_REGISTRATION_INVALID`. An invented code fails too. The only seeded
   aliases are for `drv-demo-001`; using that on-duty seed is not an alternative.
5. Repository-wide production caller search finds no public invitation issuer:
   `issueRegistrationInvitation` is called only by `register`. Its direct use
   from a test or manual database insertion is not an authorized live API.

This is a reusable hosted-run provisioning gap, not a reason to loosen the
single-use or device checks. Current dev invitation consumption is **unknown**;
the owner made no live registration call and did not consume the initial code.
The accepted decision explicitly prohibits reusing demo registration codes.

**Requested Supervisor product subtask:** expose an authenticated, audited,
purpose-limited invitation issuance path for the reserved offline `drv-demo-002`.
It must issue a new opaque, expiring, single-use code per run after checking
isolation, preserve the existing register/refresh/revoke contracts, and provide
an authorized cleanup/recovery path if registration succeeds but its response is
lost. Do not reactivate a used invitation, overwrite another binding or change
`validateDurableState`. Product scope needs review for
`apps/api/src/modules/auth/`, the route auth policy, relevant contracts and product
tests; these are outside this worker's harness write scope.

### F-SESSION-CONTRACT / observer: Google WIF does not yet issue this identity

The merged SEC-INTERNAL-KEY-WIF-MIGRATION implementation has two distinct paths:

- `x-drts-google-id-token` → `GoogleWorkloadIdentityAdapter` verifies Google JWKS,
  the registered service-account email, audience and route scopes. In
  `AuthController.issueToken`, this proof currently authorizes only
  `resolveCiTenantActorGrant` and the durable tenant-user issuance path. An ops
  request without a tenant grant fails with `WORKLOAD_CI_TENANT_ACTOR_DENIED`,
  **even after the Google principal has been verified and persisted**.
- `x-drts-workload-assertion` → `ServiceWorkloadIdentityAdapter` can issue a 15m
  system session, but uses a separately configured issuer/key/service-principal
  registry. The Google token cannot be relabeled as that proof. The WIF migration
  source explicitly says provisioning this custom signing material was rejected
  for dev/staging (DEV-WI-SECRETS-001); inventing a key is not a solution.

`resolveRouteAuthPolicy(GET, /api/regulatory-registry/drivers)` permits only
system/platform/ops and requires `regulatory:read`. A CI tenant session cannot
replace the observer. The map runner currently pins ops/live-map-observer; both
bootstrap and coverage consumers plus evidence gate must change together after
the observer contract is specified. Neither attaching an internal key nor
injecting membership claims is an acceptable fallback.

**Requested Supervisor coordination with the WIF task:** specify a supported
Google-native exchange for a registered read-only service observer, with the
actor/principal/audience and exact `regulatory:read` scope owned by the server,
15m expiry and a supported revocation contract; or identify a supported verified
workforce proof delivery mechanism. If selecting system realm, explicitly update
the observer contract per SD-DP-20260930-001 before the harness uses it. Preserve
the existing Google route/audience/replay checks and deny caller-selected roles,
principals or scopes. This needs product auth scope, not another map workflow
retry. The temporary internal-key exception now expires 2026-10-31; extending
it did not supply either missing identity.

### Provisioning and verification for this checkpoint

No new GitHub secret is requested or written. Existing `DEV_WIF_PROVIDER` and
`DEV_WIF_SERVICE_ACCOUNT` remain the cloud proof inputs. Exact transient proof
delivery names must follow the product contract; no imaginary secret is treated
as provisioned. The observer's API-side registry is
`WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS`, supplied by the WIF task's GCP
secret `drts-dev-workload-identity-google-service-principals`; configuring its
current tenant grants alone cannot fix observer issuance.

Read-only GitHub inspection still shows `DRTS_LIVE_MAP_TEST_DRIVER_ID` absent
and `DRTS_LIVE_MAP_ALLOWED_TARGETS` containing only API + ops. The required values
remain `drv-demo-002` and the exact Google origins listed above. Latest successful
deploy run `36744111603` reports workflow head
`cb479ddfc38195f86bd954c68db9f7b3bad4d32f`; this is metadata, not a health proof
that the map candidate is deployed. No deployment or live workflow was started
while the known proof/allowlist prerequisites were missing.

The new `supported-session-contract.test.ts` invokes real AuthController,
DriverDeviceSessionService, DriverProfileService, RegulatoryRegistryService,
JwtAuthService, GoogleWorkloadIdentityAdapter and repository memory adapters.
Only Google JWKS/network is replaced by an in-memory disposable issuer key; no
auth decision is mocked. The driver cases use real time, real signatures and
ordinary APIs, including negative cross-device refresh and cross-driver revoke.
The synthetic driver-001 is used only inside an isolated unit fixture. No live
key/token, database, notification transport, server or browser is involved.

| Finding / acceptance | Source and checkpoint result | Evidence | Remaining limit |
| --- | --- | --- | --- |
| F-SESSION-CONTRACT, generic driver/ops token rejection | Prior e3c7ed0 diagnostic replayed on merged product base: both signed sessions still fail durable verification | `session-contract.test.ts`, 2 passed rejection reproductions, exit 0; `.local/c114/session-prerequisites/baseline-test.log` | Historical path remains unsupported; not a successful session test |
| F-SESSION-CONTRACT, valid driver device session | Formal register → verify → refresh → verify → revoke invalidates old access and refresh credentials; cross-device/cross-driver negatives retained | `supported-session-contract.test.ts`, 4 tests passed, exit 0; `.local/c114/session-prerequisites/supported-contract.log` | Memory adapters only; no claim of dev/PG provisioning |
| F-SESSION-CONTRACT, repeat run | Code consumed on first register; after revoke, same code/new device and unissued code both rejected by production service | Same 4-test probe, second case | Needs per-run invitation issuer and recovery contract; product subtask requested |
| F-SESSION-CONTRACT, WIF observer | Real Google adapter persists verified service principal; real controller then rejects ops grant | Same 4-test probe, fourth case | Needs supported observer exchange; product/WIF scope requested |
| service_area_live_decisions_for_real_taiwan_addresses | Existing five address/decision probes retained | Prior harness evidence only | **Pending live**, credentials/targets/runtime unresolved |
| location_freshness_live_states | Existing fresh/real wait/stale/low-accuracy/restore probes retained | Unit session lifecycle is not freshness evidence | **Pending live**, renewable isolated driver proof required |
| browser_map_render_live | Hosted Chromium ready/imagery gate retained | No browser run started | **Pending live**, configured allowed targets and same-SHA runtime required |
| authorization_gate_and_allowed_targets_enforced | Existing strict authorization/target/SHA gates retained | 65 scoped unit tests pass, including existing gate negatives and Python evidence checks | **Pending live**, no skipped run credited as pass |

The first draft of the new unit probe had two fixture assertions wrong (JWT
uses `sub` before `toRequestIdentity`, and driver-003 has invalid credentials).
Those were corrected before the 4/4 result above. They are not product failures
or old/new repair evidence. This delivery diagnoses the supported-path boundary;
it does not claim the harness is repaired or all four acceptance keys are met.

Final local checks for this checkpoint (Node 22.23.2 / pnpm 10.33.0 /
Vitest 4.1.4), all finished and results read:

- `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/ --maxWorkers=2`:
  **65 passed across 7 files**, exit 0, including the existing 16 Python gate
  cases and both wire-shape coverage chains. Log: `unit-isolated.log`.
- `pnpm exec tsc -p tsconfig.json --noEmit`: **pass**, exit 0.
  Log: `typecheck-isolated.log`.
- ESLint (`--max-warnings=0`) and Prettier on the new test, plus
  `git diff --check`: **pass**, exit 0. Historical artifact sections are retained.
- Initial root typecheck exited 2 because shared `node_modules` resolved private
  ApiClient types from both canonical and isolated worktrees. Only this worker's
  22 symlinks were detached; `pnpm install --offline --frozen-lockfile --ignore-scripts`
  exited 0 and supplied independent links. No shared dependency target or tracked
  manifest/lockfile was changed. The repeat checks above are authoritative.
- Logs and read-only GitHub variable/deploy metadata are under
  `.local/c114/session-prerequisites/`. No live acceptance run was started.

Publish this as a **draft checkpoint**, not a handoff of a repaired harness.
The last acceptance candidate remains `e3c7ed02701c387d82786bcfd8877e2618851f3b`.
Route the concrete blockers to Claude2/Supervisor for the invitation product
subtask and coordination with the WIF owner, then resume this same owner task
after the supported contracts are available. Draft/scoped CI is not full
candidate CI or any of the four live acceptance results.

## Identity prerequisite readback (2026-10-01)

Supervisor resumed the parent after helper PR #2251 candidate
`f096e9da30381b8a73dbd4e6a349eeb2173cce79` was approved by Claude2 at
05:09 UTC and merged as `8da27255f3c668af61a7fd28654198d59993f38b`.
Owner read that complete approval and the prior reopen findings. In the assigned
worktree, published checkpoint `ef7c304ec20168e847ee236468de42d7e90f7551`
was normally merged with that dev head as
`ada8b5371223891710e8c5ea8ba11f5b0811105c`; no candidate was rewritten. PR #2247 remains a
draft investigation checkpoint. The last parent acceptance candidate remains
`e3c7ed02701c387d82786bcfd8877e2618851f3b`.

The unchanged merged tree passes **67 scoped unit tests**, including the helper's
new HTTP mocks. Those mocks do not prove the production issuance chain. The
extended `supported-session-contract.test.ts` uses the real controller, Google
adapter, signatures, driver service, idempotency service, serializer and memory
repositories to identify the remaining boundaries:

| Finding / trigger | Source and actual result on merged helper | Reproduction / evidence | Required repair boundary |
| --- | --- | --- | --- |
| F-SESSION-CONTRACT / Google observer, still unresolved | `AuthController.issueToken` always calls `resolveCiTenantActorGrant` for Google proofs; that resolver rejects the observer's empty tenant ID before issuing a session. Merely changing the header to `ops_observer` does not add a grant path. | Parameterized real Google-adapter probes for both `ops_user` and the exact new `ops_observer` request persist the verified Google principal, then receive `WORKLOAD_CI_TENANT_ACTOR_DENIED`. Only external JWKS/network is replaced with a disposable unit issuer. | Helper product owner must implement the registered observer proof/grant path, preserving audience/route/replay/durable checks. Do not add a fabricated tenant ID or internal-key fallback. Requires Supervisor-coordinated auth scope outside this parent. |
| F-WIRE / real registration response | `DriverDeviceProvisioningSession.accessToken` is a string; `expiresIn` is a sibling. `DriverDeviceSessionService.issueSession` returns that shape. `bootstrapMapSessions` instead expects `{accessToken:{token,expiresIn}}`, so the real response fails at `driver:register-device` while masking an undefined token. Actual driver scopes are `driver:read`, `driver:write`, `dispatch:read`, not the single mocked scope. | Real invite -> register response passes through `deepToSnakeCase` -> the actual bootstrap normalizer. A boundary stub supplies observer/provisioner auth only to isolate this independent defect; this is explicitly not WIF/auth success evidence. | Parent Codex updates the actual consumer and scope assertion to the formal contract after the supported issuance/cleanup contract is settled. Reuse this real-service regression instead of the fabricated registration response in `session-bootstrap.test.ts`. |
| F-SESSION-CONTRACT / partial registration cleanup, still unresolved | Bootstrap catch revokes only the registration code. `DriverDeviceSessionService.revokeInvitation` returns `revoked:false` for a consumed invite; the registered access token, binding and refresh family remain active. No environment values have been exported, so the workflow teardown cannot recover them. | The same real-service probe observes `revoked:false`, active binding and a token that still passes `verifyAccessToken`; ordinary bound-driver revoke at the end of the isolated unit fixture invalidates it. No live driver was touched. | Product owner must define supported recovery for lost registration responses. Parent must retain per-run recovery state before mutation, revoke binding/family on all partial failures and prove cleanup with the real service, including lost-response and failed-verification cases. |
| F-SESSION-CONTRACT / provisioning transport and least scope | `session-bootstrap.ts` and `session-teardown.ts` still read `drts-dev-jwt-secret` and mint a platform session via `x-drts-internal-key` for invitations. Observer defaults in `iam-policy-catalog.ts` additionally contain sandbox read scopes, and `AuthController.issueToken` still returns 8h for this actor. | Exact source inspection; the helper's positive observer test uses the internal key plus explicit `x-scopes`, not the hosted WIF request. `DRTS_E2E_PROVISIONING=true` alone cannot add the absent Google observer/provisioner grants. | Supervisor/product owner specifies supported short-lived proof for both observer and per-run invitation authorization. Parent will consume that contract without inventing a new secret, requesting a long-lived token, or loosening checks. |
| F-CONSUMER-DRIFT / later stages | Bootstrap records observer first with `ops_observer`, then driver. `runCoverage` still demands `ops_user`; `gate-evidence.py` still demands driver-first, `ops_user` and one driver scope. | Exact consumer/producer source comparison; these downstream stages are unreachable behind the current issuance failure. | Parent updates bootstrap, coverage, Python evidence gate and both-shape tests together once identity contract is corrected; no relaxed wildcard acceptance. |
| F-CLEANUP-GATE / new teardown calls | `session-teardown.ts` fetches use default redirect handling, omit per-response candidate checking and can print raw error bodies. Invite revoke failure does not set a nonzero result; workflow does not pass `TEARDOWN_OUTCOME` to `gate-evidence.py`. | Exact source inspection against the original redirect:error/SHA/no-raw-credential and mandatory-cleanup contracts. This teardown arrived in helper PR #2251. | Parent must use the same allowed-target/no-redirect/SHA/sanitized-error boundary for every cleanup request and require positive cleanup evidence in the final gate. Do not enable hosted mutation until this is repaired with partial-failure tests. |

The two new executable cases are defect reproductions: a green result confirms
the documented failure, not a working session or live acceptance. The first
parameterized draft regenerated its disposable signing key despite the adapter's
module-level JWKS cache, giving `WORKLOAD_ASSERTION_INVALID` on the second case.
The fixture now uses one in-memory issuer per file; both cases reach the intended
grant denial. This fixture error is retained in `reproduction.log` and is not
counted as product reproduction. The corrected six-case probe exits 0 in
`reproduction-final.log`.

### External prerequisites rechecked without live calls

Read-only GitHub inspection at 05:13-05:16 UTC still finds:

- `DRTS_LIVE_MAP_TEST_DRIVER_ID` absent; required value remains `drv-demo-002`,
  reserved offline, non-dispatchable and without an active client.
- `DRTS_LIVE_MAP_ALLOWED_TARGETS` still contains only API and ops origins.
  The complete exact comma-separated Google-origin proposal above remains the
  operator action; no worker variable or secret was written.
- Live `DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825` and
  `DEV_GCP_REGION=us-central1` agree with the current authorized Cloud Run rail.
  Latest successful deployment metadata is run `36792041310`, workflow head
  `b7b6c16baede48821861b19cf1354434f1716eee`; this is not evidence that the
  new map checkpoint or helper SHA is deployed.
- Latest map run remains failed `36686169334`. No known-failing hosted retry,
  deployment, local API call, product server, browser or Docker was started.

No new secret is requested. Existing `DEV_WIF_PROVIDER` and
`DEV_WIF_SERVICE_ACCOUNT` remain the external proof inputs. The observer and
invitation-authorizer registry/proof contract is still a product coordination
blocker; do not tell an operator that merely enabling E2E provisioning or adding
Google origins resolves it.

| Required acceptance | This readback result | Still required |
| --- | --- | --- |
| service_area_live_decisions_for_real_taiwan_addresses | Pending; retained production-oracle tests are unit evidence only | Correct supported sessions, same-SHA deployment and hosted real address/coordinate/decision artifacts |
| location_freshness_live_states | Pending; no dev telemetry written | Isolated renewable driver session, safe recovery and real >90-second wait plus low-accuracy/restoration evidence |
| browser_map_render_live | Pending; no browser started | Same-SHA hosted Chromium ready + decoded imagery + screenshots and no Google key/origin errors |
| authorization_gate_and_allowed_targets_enforced | Pending; original negatives remain, helper cleanup gaps identified | Repair cleanup boundary/gate and obtain complete successful same-SHA hosted evidence; skipped work is not pass |

Per §0.7, preserve the repeated F-SESSION-CONTRACT/cleanup findings and this
minimal reproduction instead of redispatching unchanged acceptance. Claude2 and
Supervisor must route the product portion back to the prerequisite owner and
coordinate its scopes. The parent Codex owns the harness fixes listed above
after that concrete supported contract is available. Keep PR #2247 draft and
the parent blocked; this diagnostic checkpoint is not a repaired candidate.


Final repository checks for the 2026-10-01 readback code checkpoint
`6e838d78dc2b661ecb54d9b31229fbce5a40fd6c` (the subsequent ledger-only commit
changes no executable code): Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4.

- `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/ --maxWorkers=2`:
  **69 passed / 7 files**, exit 0. This includes six supported-contract probes
  and the existing 16-case Python evidence gate. Log `unit-isolated.log`, SHA256
  `b5933538ef023852943a42cea24e13cce3e7881c00b93e8ac9d402b724254c76`.
- `pnpm exec tsc -p tsconfig.json --noEmit`: **pass**, exit 0, empty output
  `typecheck-isolated.log`.
- Scoped ESLint with `--max-warnings=0`, Prettier check and `git diff --check`:
  **pass**, exit 0. No runtime, browser or E2E server was started locally.
- Initial typecheck exited 2 because the worker's shared `node_modules`
  symlinks resolved private ApiClient types from both canonical and isolated
  paths. Detached only this worktree's 22 symlinks, preserving every shared
  target; `pnpm install --offline --frozen-lockfile --ignore-scripts` exited 0.
  The isolated checks above are authoritative; initial failure is retained.
- Logs, read-only variables, helper review and CI metadata are in
  `.local/c114/identity-readback-20261001/`. Hosted run conclusions are recorded
  through the release status CLI after completion. Draft integration jobs that
  skip execution do not constitute full CI or any live acceptance.

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
