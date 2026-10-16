# DEV-PAX-REVIEW-ENV-TRANSPORT-20261016

Owner: Codex. Independent reviewer: Claude2. Date: 2026-10-16.

## Finding and repair boundary

The failed immutable source `2aed20cee7c80fca77aeb326ab6c8b8377fee0dd`
interpolated `steps.api_env.outputs.vars` directly into the double-quoted Bash
argument in `jobs.deploy`, step `Deploy — api`. Bash consumed the JSON quotes
before the external CLI received the argument. Both
`PSP_TOKEN_ENCRYPTION_KEY_NAME` and `PAX_PAYMENT_CAPTURE_POLICY` became invalid
JSON. The unchanged `paymentRuntimeFromEnv` → `PaymentTokenCipher` path throws
`Payment token encryption configuration or envelope is invalid.` before API
listen, matching revision `drts-dev-api-00092-9j6`.

The workflow now binds that output as step environment variable `API_ENV_VARS`
and passes `--set-env-vars "$API_ENV_VARS"`. The API consumer is the only
workflow change. The original env producer, secret references and complete
provider groups, explicit public simulation selection, payment readers,
60000ms retry policy, runtime timeouts, auth and other nine service deployment
paths retain their existing behavior.

Task specification SHA-256:
`1e2b5a359ca489206a7e00516745c225b64928839cc2d3fbdba3facecc4a03aa`.
Dependency remains `BANK-CONSOLE-DOCKER-TEST-BOUNDARY-20261015`.
This is the first candidate from this owner; the preempted prior worker had no
frozen candidate or review findings. Recovery anchors:
`31355e6598b59eb97eaafb24b2c4cf111c0b34d8` (minimal workflow repair),
`4d64a2228` (portable regression before harness refinements).
The final candidate identity is recorded by the canonical handoff, so this
file can be included in that candidate without a self-referential SHA.

## Verification evidence

| Finding / required acceptance                                     | Actual source and change                                                                                                                                                   | Old reproduction → repaired result                                                                                                                                                                                                                                                                                                    | Command, exit, version, evidence                                                                                                                                                                | Remaining requirement                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON transport drops quotes                                       | `.github/workflows/deploy-dev.yml`, `Deploy — api` env binding and `--set-env-vars`; original `paymentRuntimeFromEnv`, `PaymentTokenCipher`, `paymentCapturePolicyFromEnv` | Frozen old Bash run scalar exits 0 but original cipher throws the exact startup exception; isolated original capture reader also rejects its malformed policy. Current workflow preserves the entire CLI env payload byte-for-byte, original cipher encrypt/decrypt succeeds and policy is exactly `[60000]`, `false`, `[1000,3000]`. | `pnpm exec vitest run tests/unit/dev-pax-review-env-transport-20261016/transport.test.ts`: 6 passed, exit 0; broad command below: 89 passed, exit 0. Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4. | Hosted runtime is separate below.                                                                                                                                                                                                                                 |
| Normal deployment and complete/absent/partial provider groups     | Actual `Resolve passenger app optional secret mounts`, `Build API env vars`, `Deploy — api` and `operations/deployment/deploy-cloud-run-service.sh`                        | Non-rehearsal values and unavailable payment behavior preserved. Absent/partial groups use the existing public profile; complete groups retain original Secret Manager references without inline profile values. Existing per-secret omission cases and other deployment contracts also pass.                                         | Same broad run, including existing `deployment-contract.test.ts` (41 tests).                                                                                                                    | Complete provider values and real provider availability are external; no secret values read.                                                                                                                                                                      |
| `dev-pax-env-transport_real-shell-and-original-reader-regression` | Tests under `tests/unit/dev-pax-review-env-transport-20261016/` import the unchanged production readers                                                                    | Local old-fails/new-passes proof PASS, 6 own tests plus 83 related tests PASS.                                                                                                                                                                                                                                                        | Broad command below, exit 0; local logs and JSON report below.                                                                                                                                  | Independent exact-SHA review, full own hosted CI and normal protected merge remain pending; local proof alone does not close this full key.                                                                                                                       |
| `dev-pax-env-transport_actual-immutable-API-startup`              | Existing immutable publish / automatic Deploy Dev rail, API revision and full-SHA health readback                                                                          | NOT RUN by source worker. No fixed API startup credit claimed.                                                                                                                                                                                                                                                                        | No workflow dispatch, rerun, cloud mutation or product server was started by this worker.                                                                                                       | After exact-SHA review/CI/merge, root is sole publisher: verify live variables and accepted source, deduplicate, publish once, verify new API revision starts and health/runtime source matches the full immutable SHA. Prior API health cannot satisfy this key. |

Broad socket-free command (exit 0, 6 files / 89 tests passed):

```bash
pnpm exec vitest run \
  tests/unit/dev-pax-review-env-transport-20261016 \
  tests/unit/cloud-run-deploy-retry.test.ts \
  tests/unit/deploy-dev-google-oidc.test.ts \
  tests/unit/pax-review-shared-order-demo-20261015/simulation-profile.test.ts \
  tests/unit/pax-payment-core-20261009/capture-policy.test.ts \
  tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts
```

Machine-specific results are under
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/codex-env-transport-20261016/`:
`vitest-final.log`, `vitest-final-results.json`, `typecheck-final.log`,
`typecheck-scoped-final.log`, `tsconfig.scoped.json`.
The recorded broad run also passed JSON/default reporter flags to save that
report. Final executable code was checked at
`5b90ca48a` (the final candidate adds this verification record only).

- Final broad regression: exit 0, 6 files / 89 tests passed, no skips.
- Scoped typecheck of the committed regression and imported production readers:
  `pnpm exec tsc -p <evidence-directory>/tsconfig.scoped.json --noEmit`, exit 0.
  This config extends the repository root config and includes the new test.
- `pnpm typecheck:root`: exit 2. The final log has 75 diagnostics outside this
  task's changed paths: missing local workspace resolutions for
  `@drts/tenant-auth` and `@drts/passenger-client`, their downstream exports,
  duplicate canonical/worktree `ApiClient` types, and existing caller type
  errors. No diagnostic remains in the new test. Full hosted CI is pending;
  this is not a repository-wide typecheck pass.
- ESLint for `transport.test.ts` and Prettier for the workflow, test and UAT:
  exit 0. `git diff --check`: exit 0.

Harness setup observations (not product regression passes): the initial fixture
omitted the workflow's workload identity env defaults and failed under Bash
nounset; the fixture now supplies synthetic defaults and uses noninteractive
`--noprofile --norc`. The initial broad run hit the default 5-second test limit
because the negative control unnecessarily ran a second full pipeline; it now
uses its intact pre-transport payload to isolate the original capture reader.
No product or test timeout was increased. Lint's counted-space regex and
formatting findings were corrected before final checks.
The first root/scoped typecheck also identified five strict indexed-access
diagnostics in the new fixture. Explicit undefined checks corrected them;
the final scoped typecheck and broad regression were then rerun and passed.

## External mock and historical source qualification

The regression executes the actual workflow Bash producer and consumer, the
original deployment wrapper, and imports the real production payment modules.
Only external gcloud is stubbed: metadata presence, synthetic service origins,
and final argv capture. Python in the real producer reads the repository's
public simulation profile. No reader, cipher, policy validator or PSP selection
logic is mocked. Fixtures are public synthetic values; complete-group tests
capture references only and do not pretend to prove provider availability.
No API, DB, browser, Docker, Compose or listening socket runs here.

The fixture decoder handles only the workflow's explicit `^@^` format by
splitting entries at `@` and each entry at its first `=`. It preserves JSON/CSV
commas and base64 `=`. It does not claim to execute or validate the Google SDK.
The earlier diagnostic independently used real installed gcloud `ArgDict` and
unchanged immutable readers; the committed portable test requires no SDK path
or historical git objects.

`old-deploy-api.sh` is the verbatim `run` scalar from the failed immutable
workflow (YAML indentation removed), SHA-256
`7c064392b10d730d9dbb523f44dc80d0f2c135ea0498eed1109a810db8dc574c`.
The test checks this digest before executing the historical negative control.
The current workflow script and its actual step env binding are read from the
checkout under test, so restoring the old inline expression fails the current
positive tests. The original readers still match the prior diagnostic hashes:

| Original production file    | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `payment-runtime.config.ts` | `d7a72847a745c934428ded370c5f1c0d62807b8b56e4233834fb922de444c37a` |
| `payment-token-cipher.ts`   | `3d974d3a3e47e963611698b14dda8df5e55b2494f514df6a824c812abc1893ee` |
| `payment-capture.config.ts` | `db85ba9a83b36b1ac7dbcc24aacf7f1a5091ab07f1d1dbee32024afbdd1c81c5` |

Prior evidence in
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/`:

- `startup-readback-c0630-hosted-results/actual-failedAPIrevision-00092-application-exception-qualified-receipt.json`, SHA-256 `29825b480381ac88981b6e02882e841cd1e783fe90eb2d7e562db6162de11d2b`: actual failed revision exception from run `38837210486`, job `116768906560`, artifact `12019204491`.
- `api-env-transport-2aed-reproduction/actual-old-fails-fixed-draft-passes-original-payment-runtime-receipt.json`, SHA-256 `4260317a856f93c2d78aa033d37445cdf24a73ea7d982f01c975d796c93193d6`: real Bash, installed ArgDict and immutable original-reader diagnostic.
- `API-JSON-transport-R3-actual-preempted-precandidate-source-normal-route-audit.json`: preserves the prior pre-candidate boundary and assigns this normal Codex-author / Claude2-review continuation.

The existing PAX task continues its own ten-service and fresh-three-UUID
acceptance. This source task adds no whole-diagnostic or whole-demo DONE gate,
does not duplicate root publication, and does not change provider/worker
controls or other held candidates.

## ENV-001: existing CI wiring assertion follow-up

Previous candidate: `e6d085775406618857caa074236dd3aae1df2c05`, generation
`d0e0ec18183340e888951ca658335358`, PR #2726. Its actual CI runs
`38842679024` / job `116786243834` and `38842679046` / job `116786270751`
failed at `tools/ci/test_dev_artifact_providers.py:284`,
`DevArtifactProvidersTest.test_workflow_wires_outputs_into_existing_api_arguments_only`.
That assertion still required the broken direct JSON interpolation in Bash.
The earlier cancelled runs `38842672126` / `38842672187` are historical;
neither cancellations nor these failures provide CI pass evidence.

The extra exact test-file scope was granted by Supervisor. Only the obsolete
assertion changes: require the actual API step `env` mapping immediately before
`run`, and the quoted `--set-env-vars "$API_ENV_VARS"` argument. All other
provider/output/argument assertions and all real Bash/original-reader
regressions remain intact. No workflow, reader, provider, validator, timeout or
runtime setting changes in this follow-up.

| Finding / required acceptance                                     | Source and repair                                                              | Old → repaired result                                                                                                                                                                                  | Command / version / evidence                                                                                                                                                                                                                                                                                                                                        | Remaining requirement                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ENV-001, obsolete API wiring assertion                            | `tools/ci/test_dev_artifact_providers.py`, existing wiring test                | At `e6d085775406618857caa074236dd3aae1df2c05`, the single test fails (exit 1); at repair anchor `fb89dece6e13b8493cf03b4180ed2c98af5ce847`, all 39 tests in the existing file pass (exit 0), no skips. | `python3 -m unittest tools.ci.test_dev_artifact_providers.DevArtifactProvidersTest.test_workflow_wires_outputs_into_existing_api_arguments_only` before repair; `python3 -m unittest tools/ci/test_dev_artifact_providers.py` after repair. Python 3.12.3; `env-001/old-e6d-wiring.log` and `env-001/fixed-python.log` under the existing evidence directory above. | Fresh exact-candidate review, full own hosted CI and protected merge remain required.           |
| `dev-pax-env-transport_real-shell-and-original-reader-regression` | Unchanged committed real workflow Bash / wrapper / original reader regressions | At repair anchor, the same broad command above passes 6 files / 89 tests (exit 0), no skips, including old-source negative control and corrected transport positive cases.                             | `env-001/fixed-vitest.log`, Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4.                                                                                                                                                                                                                                                                                              | This local pass does not close the full acceptance key; fresh review / CI / merge are pending.  |
| `dev-pax-env-transport_actual-immutable-API-startup`              | Existing root sole immutable publisher                                         | NOT RUN; no startup or deployment credit.                                                                                                                                                              | No worker dispatch/rerun/deployment or VM product service.                                                                                                                                                                                                                                                                                                          | New immutable API revision startup and actual full-SHA health/runtime readback remain required. |

Independent Claude2 review source:
`/home/lupin/workspace/drts-fleet-platform/.orchestrator/logs/20261016T025517525189Z-claude2-claude2-368d99.log`.
The reviewer independently reran the 89 tests and identified ENV-001 in actual
CI logs, then attempted the normal `reopen`. Its final report explicitly says
that approval broker `CONNECT_TIMEOUT` / deferred calls prevented that
transaction. The canonical activity log, checked on this owner dispatch,
contains no successful reviewer `reopen`; Supervisor's scope assignment and
current `in_progress` owner dispatch are present. The owner does not impersonate
Claude2 or claim that attempted transaction succeeded. Repair anchors preserve
the narrow change and completed checks; formal new-candidate handoff awaits
the original reviewer's normal lifecycle decision, as required by this brief.

Root CI diagnosis:
`api-env-transport-hosted-results/actual-e6d-first-CI-failure-obsolete-API-env-wiring-test-scope-diagnosis.json`
under the prior evidence root, SHA-256
`8fded31926d047dc2d3aadbfe85c4ce48c427609bea48f4281ec83bcb47990ed`.
Repair test-file SHA-256:
`30f5cc3c665a79858b7ba3c3db3770805b12c578126ab102b89279dd75898bb4`.
