# SR-LIVE-MAP-C114-COVERAGE-20260930

Current status (2026-10-03): WIF and workforce prerequisites are merged and
Supervisor reports both deployed by successful run `37086000826`, runtime
`cccd9b1118e2008adccabc117fef94bcebdccfe0`. The harness now pins that runtime
separately from its test candidate; see [the final delivery ledger](#final-delivery-and-dispatch-2026-10-03).
All four hosted live acceptance gates remain pending independent review, same-SHA
CI and Supervisor dispatch. The historical blockers below are preserved for audit;
they are superseded by this section and the final ledger.

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

## Parent consumer and cleanup repair after R2 (2026-10-01)

R2 `3ac29a96b69cbfc9f845c52c78596ceff58b67ae` was approved by Claude2 and
merged as `5b0ec5283377ece785b0949245ae7dd6da1b0573`. The full final review and
preceding registry fail-open findings were read through the release CLI. The
parent preserves its published history: merge checkpoint `a8178786d`, consumer
checkpoint `728f62b7f`, cleanup/test checkpoint `70a0ed9f2`. The historical
parent candidate `e3c7ed02701c387d82786bcfd8877e2618851f3b` is not rewritten.
This section supersedes the earlier current-hold/resolved claims; historical
findings and evidence remain above.

### Repaired parent findings

- F-CONSUMER-DRIFT: coverage now accepts exactly `ops/ops_observer/live-map-observer`
  with `regulatory:read` and the formal driver scopes `dispatch:read`,
  `driver:read`, `driver:write`. Bootstrap consumes the real serialized string
  access token with sibling `expiresIn=15m`. The Python gate checks both exact
  identities, cardinality and scopes independent of producer order, rejecting
  the old identity, missing/extra scopes and duplicate identities.
- F-CLEANUP-GATE: a single `revokeMapInvitation` consumer uses the R2 consumed
  invitation API, which revokes its bound device and refresh family. Every
  request validates hosted authorization/allowed targets, rejects redirects,
  requires the candidate SHA header, enforces a timeout and requires
  `data.revoked === true`. Errors omit raw responses and credentials. Teardown
  no longer reads Secret Manager or mints another platform token.
- Recovery is exported to the hosted job's masked `GITHUB_ENV` before device
  registration: `DRTS_LIVE_MAP_CLEANUP_SESSION_TOKEN` is the per-run provisioner
  bearer token (raw token, no `Bearer ` prefix), and `DRTS_LIVE_MAP_INVITE_CODE`
  is the opaque registration code. These are ephemeral step values, **not new
  repository secrets**. They are never included in uploaded artifacts. Both
  coverage session tokens are exported only after both identities verify.
  Bootstrap performs immediate cleanup on partial failure; `always()` teardown
  retries using the retained state, including a lost registration response.
  A failed export before registration triggers immediate cleanup, and cannot
  produce successful acceptance without positive teardown evidence.
- Before issuing an invitation, bootstrap checks the live registry through the
  observer and requires `drv-demo-002` to remain offline/non-dispatchable.
  Coverage retains its task/vehicle/isolation checks before telemetry. The
  operator must still reserve the driver and prevent a concurrent mobile client.
- Workflow gate now requires `TEARDOWN_OUTCOME=success` and candidate-bound
  `evidence-cleanup.json` with the reserved driver and confirmed revocation.
  A missing cleanup artifact, false result, skipped/failed/missing step or
  foreign SHA cannot pass. The explicit artifact allowlist adds only this
  redacted JSON; no recovery token/code or raw session file is uploaded.

### New concrete product blocker: F-WORKFORCE-VERSION

The first real-time regression intermittently failed durable verification for
`ops_user` despite successful WIF issuance; the next identical run passed.
This was investigated rather than dismissed as flakiness. The parameterized
production probe now fixes only the **unit Date boundary** and proves:

1. `AuthController.issueToken` captures time T and passes `tokenVersion=T` to
   `JwtAuthService.issueSessionToken` with `ensurePrincipal=true`.
2. The JWT service captures its own time T+1ms and persists
   `principal.updatedAt=T+1ms`; the signed token and active session retain T.
3. `JwtAuthService.validateDurableState` compares that token version against
   the maximum principal/membership/role-binding timestamp and returns false.
4. Both registered `ops_user` and the exact required `ops_observer` exhibit
   this failure. At delta=0 they verify successfully; at delta=1ms both signed
   tokens have active sessions but `verifyAccessToken` returns null.

Command: `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/supported-session-contract.test.ts --maxWorkers=2`,
11 cases passed, exit 0 (`version-race.log`). **Two passing cases reproduce the
unresolved defect; this is not usable-session/live acceptance evidence.** The
wrapper advances unit time then delegates to the original `issueSessionToken`;
controller, Google adapter, signatures, repository and durable verifier are real.
Only external Google JWKS/network and time are substituted. No live timestamp is
forged and no durable verification is bypassed.

Repair boundary for the product owner: coordinate the issuance version with the
actual persisted workforce principal/membership/role-binding version, preserving
signature, membership, role/scope and revocation checks. Do not weaken the
verifier, retry until two clocks happen to agree, or freeze hosted time. Required
regressions: same-tick and crossed-tick issuance for both roles, subsequent role/
principal changes invalidating the token, and the real bootstrap session probe.
Product files `apps/api/src/modules/auth/auth.controller.ts` and
`apps/api/src/common/auth/jwt-auth.service.ts` are outside this parent scope.
Supervisor must route this finding to the product owner; parent code changes do
not reopen or overwrite R2's recorded review/CI evidence.

### Verification ledger and limits

| Finding / acceptance | Production source and change | Previous → repair evidence | Commands / evidence | Outstanding limitation |
| --- | --- | --- | --- | --- |
| F-CONSUMER-DRIFT | `runCoverage`, `bootstrapMapSessions`, `gate-evidence.verify` | Same new tests against isolated `a8178786d` harness reject both API wire shapes at identity/scope checks; repaired chains pass | `old-runner.log` exit 1; final scoped Vitest; `old-python-gate.log` exit 1 vs 23 passing Python checks | HTTP/time simulated; formal service-area oracle and serializer are real |
| F-CLEANUP-GATE | `revokeMapInvitation`, `teardownMapSessions`, workflow gate | Old gate accepts missing cleanup with otherwise legacy-valid evidence; new gate rejects absent/failed/foreign cleanup | `old-cleanup-gate.log` exit 1; cleanup negatives and real-driver regressions in scoped Vitest | No hosted teardown run yet; interrupted runner with no remaining cleanup execution is an operator recovery event, never pass |
| Partial registration/recovery | Actual controller/device service/serializer and bootstrap | Real registration succeeds; lost response, failed verification and lost cleanup response all recover; repeated teardown invalidates access and refresh tokens | Four parameterized `supported-session-contract` cases pass; old harness lacks recovery state before register | Observer/provisioner HTTP auth deliberately stubbed for these driver cases; separate WIF probe exposes version defect |
| F-WORKFORCE-VERSION | Real `AuthController.issueToken` → `JwtAuthService.issueSessionToken/validateDurableState` | T→T verifies; T→T+1ms rejects both roles on merged R2 source | Four parameterized clock-boundary probes; `version-race.log` | **Unresolved product blocker**; no auth-source edits in parent |
| service_area_live_decisions_for_real_taiwan_addresses | V0049 / evaluator / five mandatory service cases retained | Both-shape units pass; actual Google coordinates and dev decisions absent | Scoped coverage tests; no new live run | Pending valid sessions, operator targets and same-SHA deployment |
| location_freshness_live_states | Tracking observation / real 95s hosted wait / accurate restoration retained | Unit state flow passes; no live heartbeat sent | Scoped coverage plus real binding lifecycle tests | Pending isolated driver and real hosted observation; no eligibility-reason claim |
| browser_map_render_live | Hosted Chromium / ready / imagery / screenshots retained | Browser remains wired; script-only/Google-error/missing-image evidence rejected | Python evidence gate | Pending same-SHA deployed ops and Google origins; no local browser |
| authorization_gate_and_allowed_targets_enforced | Bootstrap/coverage/cleanup strict gate and SHA checks | Positive and denial cases pass, cleanup can no longer be omitted | Scoped Vitest/Python; redirect and foreign-target negatives | Full hosted acceptance remains pending; unit/mock success is not live pass |

Old-run replay uses `git archive a8178786d` under `.local/`, with current
regression cases pointed at those unchanged harness functions and the merged R2
product dependencies. No active worktree reset. Old-run failures include expected
identity/scope failures, recovery-state assertions and the renamed error stage;
none are missing-package failures. The cleanup-specific Python replay retains
the old valid identity fixture so its failures are not masked by identity drift.

Local logs: `.local/c114/consumer-cleanup-20261001/`. Initial baseline could not
load dependencies because the worker's links pointed into a reaped sibling. Only
22 links in this worktree were detached; offline frozen installation with
`--ignore-scripts` succeeded. No shared target, manifest or lockfile changed.
The first new WIF probe also assumed the original Google subject lookup survived
`ensurePrincipal`; it does not. The corrected probe checks the actual principal
ID and durable token, exposing the independent version race above. Initial
fixture/environment failures are retained and are not defect-reproduction proof.

### Current operator actions; no secret or variable writes by this worker

Read-only GitHub inspection at 10:53 UTC still finds `DRTS_LIVE_MAP_TEST_DRIVER_ID`
absent and `DRTS_LIVE_MAP_ALLOWED_TARGETS` limited to the API/ops origins. Set the
reserved ID to `drv-demo-002` and the exact comma-separated Google-origin list
already specified above. Latest live map run remains failed `36686169334`.
Latest deploy attempt `36844351637` failed; last successful deploy metadata is
`36792041310`, head `b7b6c16baede48821861b19cf1354434f1716eee`, not this parent
candidate. Live project/region remain `drts-dev-devcc-20260825` / `us-central1`.
No known-failing live run or deployment was dispatched here.

Correct the earlier R2 illustrative registry example before use: the audience
must match this harness's Google ID-token audience, and the route must authorize
the actual exchange. Exact API-side environment name remains
`WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS`; existing GCP secret name remains
`drts-dev-workload-identity-google-service-principals`. The observer entry format
is below; the operator supplies the real numeric principal ID and service account
email for the existing WIF identity, without duplicating that account's entry or
adding other roles to this observer. No worker reads/writes registry secret values.

```json
{
  "serviceAccountEmail": "<actual WIF service-account email>",
  "principalId": "<actual registered principal ID>",
  "actorId": "live-map-observer",
  "roles": ["ops_observer"],
  "scopes": ["regulatory:read"],
  "allowedTokenAudiences": ["https://drts-dev-api-r6ykdme3wa-uc.a.run.app"],
  "routeScopes": ["POST auth/token"]
}
```

This does not resolve F-WORKFORCE-VERSION. Provisioner issuance still follows the
inherited R2 temporary platform session path using existing `drts-dev-jwt-secret`;
its compatibility with deployed strict-auth settings and persisted platform
membership must be confirmed by the operator/product owner. It is not a newly
implemented narrow WIF provisioner. `x-scopes=driver:provision` is a request,
not proof of narrow resulting privileges: current product issuance derives
workforce scopes from persisted role bindings. Observer TTL remains 8h and driver
TTL 15m; the harness does not claim both tokens are 15-minute credentials.
No new repository secret is requested, and no internal-key exception is extended.

Keep PR #2247 a recoverable **draft checkpoint**, not a repaired candidate
handoff, until the supported observer is reliable. All four parent live gates
remain pending. The owner does not call `done` or claim R2's code review as parent
Cloud Run acceptance. Supervisor should coordinate the product version fix and
operator provisioning, then resume the same parent owner for same-SHA CI,
independent review and hosted acceptance.

Final local verification for this checkpoint (Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4), all completed and read:

- Scoped Vitest: **94 passed / 8 files**, exit 0, including the 23-case Python gate. Two of the WIF clock cases intentionally reproduce F-WORKFORCE-VERSION.
- Root TypeScript, scoped ESLint `--max-warnings=0`, changed-code/workflow Prettier, YAML cleanup wiring and `git diff --check`: **pass**, exit 0.
- Old harness replay: **12 failed / 44 passed**, exit 1. Old Python gate: two valid-current-identity cases rejected, exit 1. Legacy-valid cleanup-only probe: three tests / seven subcase failures, exit 1, proving the old gate accepts missing cleanup.
- No local product/API/PG/browser/E2E server, Docker, live telemetry, deployment or secret/variable write. Hosted checks are recorded after completion in the PR/status checkpoint, not inferred from these unit results.

Evidence hashes under the local log directory above:

- `unit-final.log`: SHA256 `f0f287fecea60b56bcb1cd3ba893beb8f49246eae2fd91aef001286ee3884b4d`.
- `typecheck-final.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `lint-final.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `version-race.log`: SHA256 `abbe6c90ee6bf4fdbc9bf62f3c38164baefa2b2fad96694f84360377f560353f`.
- `old-runner.log`: SHA256 `9fdd25bf5af0b2cf74f8afc8428162b09db11dc4dbcddf95bb522686616687dd`.
- `old-python-gate.log`: SHA256 `adb8fed5faee13068c7b9874405633e4b6d979b8f050778fc7329a8f6c55ddeb`.
- `old-cleanup-gate.log`: SHA256 `b98722ea22e45dda373b1d4e59e16cfb72e8d9d48f0be26424e13175052953a4`.

## WIF migration composition (2026-10-02)

`SEC-INTERNAL-KEY-LIVE-MAP-PLATFORM-SESSION-WIF-20261002` merged this draft's
published `5d23550587b1bbb6ce33be0d8948cc50a6dbd07f` into its own task branch
at `8405c7040`. Both published histories remain intact; PR #2247 and the parent's
blocked lifecycle are unchanged. The receiving candidate owns the WIF issuance
slice and retains F-CONSUMER-DRIFT/F-CLEANUP-GATE repairs, offline isolation,
mandatory candidate-bound cleanup evidence, and all real device recovery probes.

The earlier internal-key provisioner and illustrative observer registry steps
above are historical. The current operator instructions are
[`internal-key-exceptions.md` §11](../../../../docs/02-architecture/internal-key-exceptions.md#11-sec-internal-key-live-map-platform-session-wif-20261002).
They define separate observer and provisioning accounts/principals; the latter
has no workforce roles and only a fixed-driver provisioning grant. Recovery now
uses masked `DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN` plus
`DRTS_LIVE_MAP_INVITE_CODE`; after expiry teardown exchanges a fresh WIF proof.
These remain per-job values, never uploaded or repository secrets.

The new task also reproduced a separate composition defect: exchanging another
Google assertion on a shared observer/provisioner principal changes its durable
version and invalidates the observer. Its 1-second production-path probe failed
on `8405c7040` and passes with independent principals at `88b5bc275`. This does
**not** repair F-WORKFORCE-VERSION: the original two crossed-tick observer/ops-user
probes still demonstrate that outstanding product defect. All four C114 hosted
acceptance keys remain pending; no service, browser, deployment, live API call,
or cloud/variable/secret mutation was performed by this composition task.

## Final delivery and dispatch (2026-10-03)

This dispatch supersedes the historical hold and same-test-SHA deployment recipe.
Supervisor explicitly requests the hosted map run against deployed
`cccd9b1118e2008adccabc117fef94bcebdccfe0`, with the repaired harness candidate
handed to Claude2 first. The parent preserves all published history: merge
checkpoint `9f2a7c60a` composes `origin/dev` at
`a1b84bd336b3e3179abd01a3f753a299275cc423`, including WIF PR #2269 and workforce
PR #2277. Conflict resolution retains the reviewed WIF composition, all parent
isolation/recovery cases, and the corrected crossed-tick verification assertions.
No product source is changed by the final parent diff.

### F-DISPATCH-RUNTIME: independently pin the test and deployment

Previously `validateLiveMapGate` unconditionally set `deployedSha=candidateSha`;
`verifyLiveDeployment`, session requests, cleanup and the Python gate repeated
that assumption. A new test-only candidate could not exercise Supervisor's
already-deployed version. Tests added against unchanged checkpoint `9f2a7c60a`
reproduced seven failures (58 pass) across coverage/bootstrap/teardown: different
explicit runtime rejected, malformed runtime inputs ignored, and the candidate
runtime accepted despite a different expected runtime. The old Python gate also
failed the separate-runtime positive and accepted mismatched session/cleanup
runtime evidence (26 tests: three failures plus one expected positive error).

Workflow input `deployed_sha` now supplies
`DRTS_LIVE_MAP_EXPECTED_DEPLOYED_SHA` to the **map job only**. It must be 40
lowercase hex characters; blank workflow input defaults to `candidate_sha`.
There is no repository-variable or response-derived fallback. The historical
`DRTS_LIVE_MAP_DEPLOYED_SHA` repository variable remains unused. Candidate SHA
must still match the actual workflow source SHA and checkout. Health body/header,
every API response, ops configuration/pages and cleanup must match the explicit
expected runtime. All evidence retains the harness candidate; deployment,
sessions, cleanup, coverage, browser and run status also record the runtime.
The final Python gate reads the expectation from dispatch environment, never from
an artifact. Even mutually consistent foreign-runtime artifacts fail against a
different requested runtime. Missing/skipped evidence and failed cleanup remain
nonzero exits.

### Findings and required acceptance

| Finding / acceptance | Source and final change | Previous → current evidence | Command / evidence | Pending limitation |
| --- | --- | --- | --- | --- |
| F-DISPATCH-RUNTIME | `live-map-config`, `verifyLiveDeployment`, `createMapSessionRequest`, `revokeMapInvitation`, workflow input and `gate-evidence.py` | Seven TypeScript failures and Python gate failures at `9f2a7c60a` → 67 tests pass in four files, including 26 Python cases | `.local/c114/final-handoff-20261003/deployed-pin-before.log` exit 1, `evidence-before.log` exit 1, `deployed-pin-after.log` exit 0; Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4 | Hosted execution pending; HTTP/time boundaries are simulated |
| F-WORKFORCE-VERSION | Merged `AuthController.issueToken` / `JwtAuthService` fix; `supported-session-contract` tests | Original crossed-tick rejection is replaced by successful real durable verification for both roles and both time deltas | PR #2277, candidate `ff3d5fc28261768d61c49fb7edb288f36210cfbc`, independent review and CI `37037738953`; rerun with final suite below | Live observer exchange remains part of parent acceptance |
| F-CONSUMER-DRIFT / F-CLEANUP-GATE / WIF composition | Existing reviewed bootstrap, fixed-driver provisioner, recovery and mandatory cleanup retained | Helper WIF candidate `d635d0d153abc2907cae4b45a6e7b5841dd9dd41` passed CI `36956504350`; final suite rechecks real token/device paths | PR #2269; provisioning scope and same-driver denial tests; final checks below | Interrupted runner without cleanup is an operator recovery event, never acceptance pass |
| service_area_live_decisions_for_real_taiwan_addresses | `ServiceAreaService.evaluate/evaluateStop`, V0049, `service-area-cases`, `runCoverage` unchanged | Five mandatory decisions over four public Taiwan addresses; actual Google point feeds the production geometry oracle; product response compared and saved | Re-read product symbols and V0049; final coverage tests; hosted `evidence-coverage.json` required | Real geocodes/dev decisions pending; unit coordinates are simulated |
| location_freshness_live_states | `DriverHeartbeatController`, `classifyDriverLocationFreshness`, observability active-driver filter, `runCoverage` unchanged | Fresh → real hosted 95s wait → stale → 150m low accuracy → restored fresh; offline isolation and no tasks/vehicle required before writes | Final unit suite; hosted timestamps, acknowledgements, snapshots and cleanup evidence required | Driver `drv-demo-002` must stay reserved with no other writer; no runtime eligibility-reason-code claim |
| browser_map_render_live | Existing Chromium spec/config uses the shared deployment gate; ready + decoded imagery + two screenshots remain mandatory | Actual hosted `/dispatch` and `/callcenter` assertions remain wired; evidence gate rejects script-only/missing/error evidence | Python gate and static config review; hosted `evidence-browser.json`, both PNGs required | No local browser run; actual Google rendering pending |
| authorization_gate_and_allowed_targets_enforced | Strict `true`, GitHub-hosted check, HTTPS exact-origin allowlist, redirect refusal, candidate/workflow equality and explicit runtime pin | Positive separate-runtime chains and no-request refusal cases pass; old runtime cannot self-authorize through evidence | Final suite, malformed/full-SHA and foreign-runtime negatives | Hosted preflight and allowlisted browser traffic still required |

The selected product paths (`apps/api/src/common/auth`, modules `auth`,
`regulatory-registry`, `service-area`, `apps/ops-console-web`, V0049) have no diff
between the deployed `cccd9b11` source and merged checkpoint. The oracle therefore
uses the same selected source as the requested runtime; observed health/headers
are still mandatory on the actual hosted run.

### Exact Supervisor dispatch and configuration

Read-only GitHub inspection confirms deploy run
[37086000826](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37086000826)
concluded success at `cccd9b1118e2008adccabc117fef94bcebdccfe0`.
The health SHA itself was reported by Supervisor; this worker made no live API
call. Live GitHub variables now contain `DRTS_LIVE_MAP_TEST_AUTHORIZED=true`,
`DRTS_LIVE_MAP_TEST_DRIVER_ID=drv-demo-002`, the API/ops origins and the complete
Google-origin allowlist listed earlier. Project/region are
`drts-dev-devcc-20260825` / `us-central1`. Earlier claims that these values are
absent are historical. Registry D/E rollout is Supervisor-provided evidence;
actual observer/provisioning exchange must still pass in the hosted job.

No new GitHub secret or repository variable is needed. Existing secret
`DEV_WIF_PROVIDER` and Google map key secrets are consumed by the workflow.
The WIF accounts are `drts-dev-live-map-observer@drts-dev-devcc-20260825.iam.gserviceaccount.com`
and `drts-dev-live-map@drts-dev-devcc-20260825.iam.gserviceaccount.com`, with
API-origin and API-origin-plus-`/driver-provisioning` audiences respectively.
Google assertion variables and masked session/recovery variables remain ephemeral
job values. The worker writes no cloud resources, registry, secrets or variables.

Supervisor runs the following only after checking that PR #2247's head equals
the reviewed candidate recorded by handoff. Dispatch the **candidate branch**,
not `dev` or `main`, because map enforces actual workflow SHA = candidate SHA.
If merge auto-deleted this branch, restore the branch at that exact handoff SHA
with an ordinary push before dispatch; do not substitute the merge SHA or new
trunk head. The checked-out candidate must remain unchanged through this run.

```bash
CANDIDATE_SHA="$(gh pr view 2247 --repo ajoe734/drts-fleet-platform --json headRefOid --jq .headRefOid)"
gh workflow run live-entry-map-acceptance.yml \
  --repo ajoe734/drts-fleet-platform \
  --ref codex/sr-live-map-c114-coverage-20260930 \
  -f candidate_sha="$CANDIDATE_SHA" \
  -f deployed_sha=cccd9b1118e2008adccabc117fef94bcebdccfe0 \
  -f run_entry_profile=false \
  -f run_map_profile=true
```

This worker does not dispatch it. Inspect artifact
`live-map-acceptance-<CANDIDATE_SHA>` and all six evidence JSON files, run status,
and both map PNGs. A green deployment or unit suite is not these four acceptance
gates. Owner hands off to Claude2 and never calls `done`.
