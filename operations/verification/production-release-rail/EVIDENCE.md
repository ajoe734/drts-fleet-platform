# SR-PROD-FULL-SURFACE-RAIL-20261012 delivery evidence

Owner: Codex. Independent reviewer: Gemini2. This artifact belongs to the original
registered task and retains its findings and acceptance limits. No cloud mutation
or production/provider call was performed by the worker. The original interrupted
Claude2 billing attempt remains at
`.orchestrator/evidence/claude2-20261011T234715Z-2aa5dc2e.json`; no retry or edit.

Task specification: canonical
`.local/full-system-goal-20261011/production-rail-repair-spec.txt`, SHA-256
`48eac7b88a4dbeff4562054c429bc831fe1de2c47e9b3e36e9f859fd111d6c08`.
Original source: `6bc5f4af6afeffb327ece5f2b0ef3fe056aa5924` (dispatch base).
Recoverability anchors: `5e08f3dc7`, `9dfa06454`, `52960b6b7`. They are checkpoints,
not review candidates. Final full candidate SHA, branch and PR are recorded by
`ai-status.sh handoff`; same-SHA check logs are stored under canonical
`.local/sr-prod-full-surface-rail-20261012/checks-<CANDIDATE_SHA>.log`.

## Findings and acceptance map

| Finding / required acceptance                                                                      | Actual source and repair                                                                                                                                                                                                                                                                               | Old reproduction → revised result                                                                                                                                                                                                                                                                                         | Command / version / evidence                                                                                                                                                                                        | Remaining limits                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: only three active services deployed; `production_complete_topology_regression`                 | Old workflow's three `Deploy —` shell steps; current dev ten-service graph, the ten real Dockerfiles/ports and `runtime/web/control-plane-web-proxy.mjs`. New `rail.cjs:TOPOLOGY/buildPlan/deployArgs`, workflow matrix and `run.cjs:deploy`                                                           | Test executes the old shell steps with only gcloud stubbed: exactly API/platform/ops. Revised production builder executes ten deploys and eleven builds, actual ports, private ingress, digest images and distinct BFF secret/env contracts. Paused/retired services excluded.                                            | `pnpm exec vitest run tests/unit/sr-prod-full-surface-rail-20261012/production-rail.test.ts ...`; baseline resolved directly through `git show` without resetting this worktree. Same-SHA log below.                | Cloud image builds, live deployments and running service observations not executed. Regression pass is not live topology acceptance.                                                                                                    |
| F2: incomplete strict auth; `production_strict_auth_config_fail_closed_regression`                 | `apps/api/src/main.ts:validateAuthStartupConfig`, `config/auth-startup-config.ts:buildAuthStartupConfigReport`; `passenger-app.module.ts` production payment/capture/recovery/OTP factories and SMTP transport. New `preflight.cjs:validators/validateRuntime/preflight` invokes these exact functions | Old deployed API env extracted from its executed args fails the current production report (missing OIDC client, cookie/CSRF and peppers). Revised valid fixture passes actual startup checks; missing, unsafe, partial, fake provider, invalid policy, invalid secret and malformed registry cases reject before rollout. | Same Vitest command; production functions are not mocked. Cloud Secret Manager/IAM, map network and HTTP transport are stubbed explicitly. Numeric secret versions are fixed before any build; no values persisted. | Real Secret Manager entries/access and provider validity are not proven. Optional providers remain unavailable unless explicitly complete; enabled capture cannot invent an adapter or policy.                                          |
| F3: mutable helper checkout and short image tags; `production_exact_sha_review_ci_protected_merge` | Old deploy/health default checkouts; new `resolve-tag` resolves origin tag once, every helper checkout uses that full SHA, `run.cjs:imageManifest/assertRevision` verifies all eleven image digests and exact source/revision/runtime/traffic                                                          | Regression rejects incomplete/different-SHA image manifests, mutable images/latest mounts, unhealthy/old/mixed-traffic revisions and wrong digest/SHA. All workflow jobs retain `production` review and non-cancellable release concurrency.                                                                              | Vitest workflow graph + actual command/evidence builder checks; `git diff --check`, workflow timeout tests.                                                                                                         | Independent exact-candidate Gemini2 review, hosted CI and protected `dev` merge pending at owner handoff. No owner `done`, approve or merge command.                                                                                    |
| F4: surface-specific ownership/auth defaults could drift                                           | Actual `fleet-partner-portal-web/lib/api-client.server.ts`, Channel Partner `referral-bootstrap-identity.ts`, Enterprise session/BFF routes, Bank session/artifact signer, Referral cookie secret, Passenger BFF route                                                                                 | Required real ownership settings reject absence; no development IDs are supplied by the rail. IAP OAuth transport audience and assertion resource audience are separate. Real Bank signer is exercised and its RSA signature checked; Bank IAP key must be ES256. Passenger inherits no console JWT/tenant secrets.       | Caller-specific setting regressions, actual Bank signer and source inspection.                                                                                                                                      | Production canonical ownership/memberships, IAP key rotation and Bank statement/session fixtures require operator verification.                                                                                                         |
| F5: health/HTTP 200 alone could falsely pass deployment smoke                                      | Actual identity context is `OpenRoute`; real Bank export is CSV; Enterprise tenant bookings, Referral active-trip and Passenger account BFFs have separate routes. `rail.cjs` constrains paths/predicates, `run.cjs:assertProbe/verify` executes all ten                                               | Anonymous identity-context expectations, redirects, HTML login pages, wrong JSON/CSV fixtures and forbidden fabricated actor headers reject. Positive tests produce one ten-service SHA artifact without credentials or response bodies. Identity context requires an approved principal and `jwt_bearer`.                | Actual verifier with read-only SDK and fetch boundary stubs; positive and rejection regressions.                                                                                                                    | Real signed private fixture credentials and actual protected frontend/backend routing not tested on this VM. No browser, product server, Docker/Compose, local PG, device, restore, legal/manual or full end-to-end acceptance claimed. |

## Additional pre-handoff registry finding

A targeted real preflight probe against published checkpoint
`5cd26b13286546b1eb212afe893726cf6bd168ed` confirmed that a one-character
custom workload audience supplied as a JSON string instead of an array could
be accepted through JavaScript spread. The new regression failed with exit 1
(`expected function to throw`, not a dependency/fixture failure). The repaired
preflight rejects non-array audience bindings before emitting a plan; the same
regression then passes. No application validator or authorization code was
weakened. Original reproduction log: canonical
`.local/sr-prod-full-surface-rail-20261012/registry-reproduction-5cd26b13286546b1eb212afe893726cf6bd168ed.log`.
This was an owner finding before handoff, not an independent review rejection.
Published history is preserved through a normal follow-up commit/push.

## Completed repository checks

Node `v22.23.2`; pnpm `10.33.0`; locked TypeScript `5.9.3`, Vitest `4.1.4`.
Dependencies were installed offline with scripts disabled into this isolated
worktree after stale shared dependency symlinks were unlinked locally. No
canonical dependency directories were removed or changed.

- Three scoped Vitest suites pass (133 cases): new production rail regression,
  existing `sec-wif-registry-staging-prod-wiring-20261002.test.ts`, and existing
  `auth-startup-config.test.ts`. All checks complete before handoff.
- `pnpm exec tsc -p tsconfig.json --noEmit`: pass.
- Scoped ESLint on production `.cjs` helpers and the task tests: pass.
- `python3 -m unittest tools/ci/test_workflow_timeouts.py`: 3 tests pass.
- `python3 tools/ci/check_test_coverage.py`: pass; new tests are included in the
  existing root Vitest/CI discovery path.
- `node tools/ci/check-repo-classification.mjs`: pass.
- Scoped Prettier and `git diff --check`: pass.

Early local harness failures (nine of the first 59 checks) were invalid fixture
route-scope syntax and an overly early assertion on a cloud read. They were
corrected to production `GET /api/*` scope syntax and explicit non-secret URL
validation. They are not counted as old-product defect reproduction. The final
old-product reproduction executes the original three deployment commands and
actual strict production report successfully, then confirms their deficient
results. This describes the first owner round. Gemini2 subsequently rejected
candidate `d4dcd9d4acadf6dc8bb5fdda9a36c354047596da` on F-PUBLIC-ENTRY; the repair
evidence below supersedes the staff-only exposure assumptions in that round.

## Read-only external observations and pending release gates

2026-10-12 GitHub variable-name readback confirms many new required controls are
still absent, including `PROD_GCP_PASSENGER_APP_SERVICE`, `PROD_OIDC_CLIENT_ID`,
JWT/cookie/fixture settings and separate frontend audiences. Target public vars:
`drts-prod-devcc-20260825 / us-central1`. No secret values were queried through
GitHub. `production` still has a required-reviewer rule (one reviewer) and a
branch policy. `dev` protection requires Commit trailers, Runtime mirror guard,
Smoke acceptance and ci-integ. This is policy readback, not same-SHA CI/merge or
cloud readiness evidence. Stored readback:
canonical `.local/sr-prod-full-surface-rail-20261012/github-policy-readback.json`.

Actual operator deployment remains deferred until configuration, fixtures,
review/CI/protected merge and required production-environment approval. The
updated existing runbook lists every required name, immutable procedure,
rollback requirements and acceptance limits. Tags predating the new helper fail
closed; provision a reviewed compatible rollback release before live rollout.

## F-PUBLIC-ENTRY repair after independent review

Review source: Gemini2 `reopen`, 2026-10-12T00:23:25Z, candidate
`d4dcd9d4acadf6dc8bb5fdda9a36c354047596da`, generation
`9d829eced02646adb5811476737d2c5b`; original operator finding:
canonical `.local/full-system-goal-20261011/production-entry-review-finding.txt`.
This is the first independent rejection of this trigger, not a second-round
resubmission. The earlier F1–F5/registry findings remain covered by regressions.

| Finding / acceptance                                                                          | Actual callers and repair boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Old → revised result                                                                                                                                                                                                                                                                                                                                                                     | Command / version / evidence                                                                                                                                                                                                                                                                                                                                                                                                      | Unverified conditions                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-PUBLIC-ENTRY; `production_complete_topology_regression`                                     | `PassengerOAuthController.providers` is OpenRoute; first-party passenger BFF forwards session separately from workload transport. `BootstrapAuthGuard.activatePassenger` denies `/me` without a passenger identity. Referral `resolveEmbedContext` supplies anonymous standalone fallback; `getReferralActiveTripServer` requires an active signed referral session. `rail.cjs:buildPlan`, new `public-entry.cjs`, actual `preflight` and `verify` use a public LB/IAP transport policy for these two origins, preserving private Run backends and seven consoles/API. | Direct Node probe of rejected builder with the real fixture and no employee frontend client IDs exits 1 with `PROD_REFERRAL_EMBED_IAP_CLIENT_ID`. The regression re-executes that exact old Git source via an isolated temporary file, then the revised real builder passes. New policy/anonymous-entry regressions pass in the scoped 98-case suite; final combined check counts below. | `node -e` builder probe, Node v22.23.2; canonical `.local/sr-prod-full-surface-rail-20261012/public-entry-reproduction-d4dcd9d4acadf6dc8bb5fdda9a36c354047596da.log`. `pnpm exec vitest run tests/unit/sr-prod-full-surface-rail-20261012/production-rail.test.ts`. SDK IAM/NEG and HTTP responses only are stubbed; parsing, policy enforcement, deployment arguments and response predicates execute production rail functions. | Approved real production public-entry IAM/OAuth policy evidence is unavailable. No real origin, cloud policy, provider login or SMS/email delivery verified. This remains a deployment blocker; public product scope is retained.     |
| F-PUBLIC-ENTRY missing/unsafe setting; `production_strict_auth_config_fail_closed_regression` | `publicEntryConfig` requires both public surfaces, an explicit `iap-public-entry` mode, separate actual global backend names, approval issue/PR, canonical referral entry/allowed host and real expected login methods. `buildPlan` requires selected credential names and exact passenger OAuth callbacks. Preflight reads enabled IAP, exact serverless NEG/Run target, unconditional `allUsers` IAP grant, private Run IAM with IAP agent and internal/LB ingress before secrets/build.                                                                             | Missing/partial/unsafe config, workforce-only or Google-users-only grant, conditional grant, wrong/tagged backend, missing IAP agent, public Run shortcut, disabled IAP/IAM and unavailable external reads all reject. Staff Google client IDs are no longer required for public surfaces. Existing startup/registry/secret rejection cases continue to run.                             | Same actual preflight suite; error names identify `F-PUBLIC-ENTRY deployment blocker`. Repository metadata readback missing `PROD_PUBLIC_ENTRY_CONFIG_JSON`, `PROD_GCP_PASSENGER_APP_SERVICE`, separate passenger Google client/secret-name and callback allowlist. Canonical `.local/sr-prod-full-surface-rail-20261012/public-entry-vars-readback.jsonl`; environment overrides not assessed.                                   | Approval URL syntax and fixture policy snapshots are not actual approval/cloud proof. Operator must supply approval and actual IAM/OAuth settings through the authorized cloud workflow; alternate topology needs a reviewed adapter. |
| F-PUBLIC-ENTRY real release verification; `production_exact_sha_review_ci_protected_merge`    | `run.cjs:verify` re-reads external policy and produces hashes in the same source-SHA artifact; new `verifyPublicEntry` GETs `/login`, anonymous providers and canonical embed fallback, then anonymous/invalid-cookie personal-data routes. Signed customer probes use only their session cookie; eight private surfaces retain employee IAP transport.                                                                                                                                                                                                                | Redirects, wrong/empty providers, generic edge denial and personal-data HTTP200 reject; valid anonymous entry + application denial pass. Ten revision/digest/SHA identities and all ten authenticated read probes remain required.                                                                                                                                                       | Production verifier with read-only cloud/fetch stubs, actual command builder and SHA evidence checks. Final candidate identity is written by handoff after normal commit/push.                                                                                                                                                                                                                                                    | Exact new candidate Gemini2 review, hosted CI/protected merge pending. Runtime public smoke is mandatory in operator release, not executed on VM. No false whole-system/provider/device/manual acceptance.                            |

Recoverability checkpoint: `f8fbb8e31` (normal push, never rewritten).
The initial Vitest reproduction could not run because supervisor restored stale
dependency symlinks; that MODULE_NOT_FOUND is not the defect reproduction.
The direct Node probe above reproduced the actual defect independently. One
dependency install inadvertently followed the shared `node_modules` symlink and
regenerated repository dependency links; no tracked source, database volume or
user data was changed. Worktree symlinks were then unlinked locally and its locked
dependencies installed offline with scripts disabled; checks use this isolated
install. Dependency restoration details and final check results are recorded in
the machine-specific canonical `.local/` logs, not represented as product evidence.

The six affected VM-safe suites pass **203 tests** (including 103 real rail
cases, the existing strict-auth/Google registry checks, passenger guard ingress,
Referral embed security and Passenger BFF transport). The first combined command
mistyped the startup suite path and ran only five suites; the corrected command
uses `tests/unit/auth-startup-config.test.ts`, and all six suites completed.
The new SMS case exercises `UnconfiguredSmsPort.availability`, matching the actual
`PassengerAppModule` binding: a required phone-login policy blocks before build
because an OTP pepper is not an SMS adapter. Email policy requires the actual
factory's durable `postgres` outbox and a platform SMTP transport. These blockers
preserve required customer methods; they do not assert missing adapters are ready.

Full root TypeScript check, scoped ESLint/Prettier, workflow timeout unit checks,
test discovery, repository classification, commit trailers and diff checks pass
(exit 0). Versions are the same locked Node/pnpm/TypeScript/Vitest versions listed
above. Canonical dependencies were restored with a locked offline install using
their own virtual store: no root dependency links still point into this task
worktree, and the canonical Vitest entry resolves. The assigned task worktree
keeps its own isolated dependencies. Restoration log:
canonical `.local/sr-prod-full-surface-rail-20261012/dependency-restoration.log`.

Final immutable candidate verification is retained at canonical
`.local/sr-prod-full-surface-rail-20261012/checks-<CANDIDATE_SHA>.log`; the full SHA
and matching remote/PR head are recorded by handoff. Separate completed regression
and typecheck output: `public-entry-regressions.log` and
`public-entry-typecheck.log` in the same canonical directory. All public HTTP/cloud
boundaries in these checks are mocked; no local product server, browser test
server, Compose, PG, actual production request or cloud mutation was performed.

## F-ARTIFACT-PROVIDERS repeated-rework repair (2026-10-12)

Review source: canonical
`.local/sr-prod-full-surface-rail-20261012/review-gemini2-012215320817.md`.
Rejected adjacent candidates are `d4dcd9d4acadf6dc8bb5fdda9a36c354047596da`
and `012215320817c4cfb8ca442d5b46755e9e03cff3`. Gemini2 confirms that the latter
fixed F-PUBLIC-ENTRY; its independent artifact-provider finding remains here
rather than being overwritten by that earlier success.

Before editing, the owner reran the operator's exact d4 probe (exit 0) against
the preserved frozen worktree. All seven supplied provider settings were absent
from API env; actual factories selected unprovisioned document/proof/scanner
adapters and the document read rejected without object/network access.
Receipt: canonical `.local/sr-prod-full-surface-rail-20261012/provider-repro-d4.json`.
The new regression also loads the exact **012** preflight/rail/public-entry
sources via `git show`, calls the real unchanged production factories and proves
the same field loss/unavailable result. It then executes the repaired preflight
with the same seven explicit inputs and selects native durable adapters.

Repair boundary: only this rail's helper, fixture/tests and production runbook.
Product constructors, authorization, factories and their callers are unchanged.
Read actual `document-artifact-runtime.config.ts:createDocumentArtifactStore`,
`remittance-proof-runtime.config.ts:createRemittanceProofStorage/createRemittanceProofScanner`,
native/S3 clients and both scanner constructors, plus ControlledDownloadModule,
BillingSettlementModule and FleetDocumentStorageService factory consumers.
`artifact-config.cjs:artifactConfig`, called by real `rail.cjs:buildPlan`, now
requires explicit selected-provider fields and managed S3 credential pairs,
rejecting absent/test/unprovisioned/partial/unknown/stale/raw-credential inputs.
`preflight.cjs:validators/validateArtifactRuntime/validateRuntime` executes real
factories with resolved secret values before a plan can be emitted. API deploy
arguments retain every selected field and enabled numeric secret mount.

| Finding / required acceptance                                                                               | Source and repair                                                                                                | Old reproduction → repaired result                                                                                                                                                                                                                                                                                                                                                                                              | Commands, results and evidence                                                                                                                                                                                                                                                  | Unverified limits                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-ARTIFACT-PROVIDERS seven-field loss                                                                       | Actual `buildPlan -> preflight -> validateRuntime`; new `artifactConfig` and real storage/scanner factories      | Exact d4 operator probe and exact 012 preflight select all three unprovisioned adapters. Repaired same seven-field fixture selects GcsDocumentArtifactStoreAdapter, GcsRemittanceProofStorageAdapter and CloudRunRemittanceProofScannerAdapter; actual `deployArgs` contains all seven settings.                                                                                                                                | Operator probe exit 0; task Vitest suite 142 tests exit 0. `provider-repro-d4.json`, `provider-regressions.log` under canonical task `.local/`.                                                                                                                                 | No real object read, scanner call or production policy verified.                                                                                                      |
| F-ARTIFACT-PROVIDERS selected-provider completeness; `production_strict_auth_config_fail_closed_regression` | `artifactConfig`, `validators`, `validateArtifactRuntime`, pinned API secrets                                    | All eight GCS/S3 document/proof × Cloud Run/native clamd combinations select real supported adapters. Every required GCS/scanner field, S3 field/credential pair and native scanner field must exist. Invalid buckets, raw credentials, unsafe endpoint, test/unavailable provider and stale scanner fields fail. Actual factories reject invalid native bucket names; removing emitted providers rejects unavailable adapters. | Real preflight and factory regressions; SDK secret/IAM boundaries alone stubbed. No factory/validator logic is mocked. S3 secret refs pinned to `:7`; values absent from plan and deploy args. Same final-SHA check log below.                                                  | Factory availability asserts configuration only, not live credentials/IAM/objects/scanner health. Production bucket/scanner settings and live evidence still missing. |
| F-PUBLIC-ENTRY retained; `production_complete_topology_regression`                                          | Existing public-entry policy checks, all ten deployment/verification commands and protected API/private consoles | Prior public-entry/anonymous denial/strict auth/registry regressions remain passing with mandatory artifact config. Ten active services and eleven immutable builds remain required; no retired/paused surface added.                                                                                                                                                                                                           | Ten affected VM-safe suites pass 328 tests, including all 142 rail cases, native providers, proof closure, C125 upload/proxy and previous public-boundary suites. `provider-affected-suites.log` (304/8) and `provider-public-boundary.log` (24/2); final combined check below. | Real public IAM/OAuth entry evidence, passenger provider delivery and full production topology acceptance remain pending. No private-only substitute.                 |
| Full C125 live gates retained                                                                               | Runbook durable-provider section and unchanged C125 source/live acceptance                                       | Explicitly retain supply AND case/reply/composite binary uploads, genuine correlated scan, durable cross-instance/restart readback, legal fleet/platform roles and cross-identity/public denials. Offline upload/proxy/native-provider suites pass; no live gate declared closed.                                                                                                                                               | Content/reference review and affected existing production-function tests. [Original C125 evidence](../../../tests/unit/C125-REAL-UPLOAD-STORAGE-20261005.md) retains its own outstanding limits.                                                                                | Genuine hosted supply AND case/composite and legal-role evidence still required. Configuration alone cannot close C125/full system.                                   |
| `production_exact_sha_review_ci_protected_merge`                                                            | Protected immutable workflow graph unchanged; new commit normally pushed on same PR #2569                        | Exact tag/SHA/digest/secret-version checks remain passing; final local/remote/PR identity is checked before owner handoff.                                                                                                                                                                                                                                                                                                      | Final full SHA from machine handoff; canonical `.local/sr-prod-full-surface-rail-20261012/checks-<CANDIDATE_SHA>.log` records versions, argv and exit codes.                                                                                                                    | New exact-candidate Gemini2 review, hosted CI, protected merge and named external acceptance pending; owner does not call done or deploy.                             |

Node 22.23.2 / pnpm 10.33.0 / TypeScript 5.9.3 / Vitest 4.1.4.
Completed root typecheck, scoped ESLint/Prettier, workflow timeout checks,
test discovery, repository classification, trailer and whitespace checks are
retained in the final-SHA log before handoff. Earlier missing `nodemailer`
and test-only TypeScript annotations were corrected and are not behavioral
reproduction evidence. This dispatch had inherited shared dependency symlinks:
the first offline install aborted without removal (exit 1); detached only this
worker's symlinks, preserving targets, then locked offline `--ignore-scripts`
installation completed (exit 0). Logs: `provider-dependencies.log` and
`provider-dependencies-isolated.log`. No product/browser/PG/Compose servers,
cloud mutation, actual provider or object requests were started.

## Hosted CI repair: shallow history and stale governance assertions

Independent Gemini2 approval of `742317648e9ef88c5aa9864471fee5db1a943614`
was followed by completed integration CI
[run 38189683552](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38189683552),
which failed in unit and cross-surface E2E. The unit result was **3 failed,
7,754 passed, 75 skipped**. Its only failed file was this task's regression
suite: three `git show <old-commit>:<path>` calls cannot resolve historical
objects in the runner's shallow checkout. Lint, typecheck, build, integration,
IAM negative matrix and UI-route E2E passed. The separate prior product-smoke
job was cancelled after the repair checkpoint push; it is not a pass.

The owner reopened the original task for this concrete CI repair. Checkpoint
`3cfcba689aa4cb012b7c0938c7651d2bd4e356b5` preserves the exact five original
git blobs in `tests/unit/sr-prod-full-surface-rail-20261012/historical-sources.json`,
with each full source commit, path and SHA-256. `historicalSource` verifies the
content hash before executing the unchanged historical function or workflow
shell step. All five stored strings were separately compared byte-for-byte
against their recorded git blobs. No factory, validator or previous defective
implementation is replaced by a fabricated replica, and no network fetch of
old source is needed during tests.

| Finding / acceptance                                          | Actual source and repair                                                                                                                                                                                                                         | Old reproduction → repaired result                                                                                                                                                                                                                                                           | Commands / execution version / evidence                                                                                                                                                                                                                                                                                                                                   | Remaining limits                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-CI-SHALLOW; topology / strict-auth regressions              | `production-rail.test.ts:historicalSource` and the exact-source fixture replace only old git-object lookup                                                                                                                                       | Real depth-1 clones: old `742317648e9ef88c5aa9864471fee5db1a943614` yields 3 failed / 139 passed (exit 1); checkpoint `3cfcba689aa4cb012b7c0938c7651d2bd4e356b5` yields 142 passed (exit 0). Original topology, F-PUBLIC-ENTRY and F-ARTIFACT-PROVIDERS defects still execute and reproduce. | `git clone --depth 1 --no-local --branch codex/sr-prod-full-surface-rail-20261012 file://<assigned-worktree> <canonical-.local-clone>`; `pnpm exec vitest run tests/unit/sr-prod-full-surface-rail-20261012/production-rail.test.ts`; canonical task `.local/shallow-old-742317648.log` / `shallow-new-3cfcba689.log`. Both clones report `--is-shallow-repository=true`. | New exact-candidate hosted CI remains required; checkpoint is not a review candidate.                                                                                                                               |
| F-CI-E2E009; `production_exact_sha_review_ci_protected_merge` | `tests/e2e/E2E-009-prod-rail-dry-run.sh` requires ten obsolete workflow-layout literals. The actual workflow uses explicit remote tag fetch → full commit SHA, `toJSON(vars)` → `buildPlan`, and the preflight's validated registry-host output. | Running the unchanged standalone static scenario at `742317648` reproduces the hosted missing `git ls-remote ... "$tag"` assertion (exit 1), without API/PG/browser servers. A read-only literal audit finds ten obsolete assertions.                                                        | `bash tests/e2e/E2E-009-prod-rail-dry-run.sh`; `e2e009-repro-742317648.log`, `e2e009-literal-audit-742317648.log` and hosted `ci-742317648-cross-surface-e2e.log` under canonical task `.local/`.                                                                                                                                                                         | E2E file is outside dispatched write scopes. Supervisor must check conflicts and extend the original task scope before applying its repair; no inert workflow strings or security-gate removal to hide the failure. |

A concrete E2E-009 patch is retained for Supervisor scope coordination at
canonical `.local/sr-prod-full-surface-rail-20261012/E2E-009-proposal.patch`.
It checks the current immutable workflow wiring, the actual config builder and
validated registry output, and executes the existing 142-case offline
production-function suite. Its machine-specific draft invocation passes
(exit 0; `E2E-009-proposal-local.log`), but **the tracked E2E scenario remains
unchanged and failing**. This draft result is not hosted or merged acceptance.
No handoff is issued while the required governance gate is unresolved.

The worker inherited canonical dependency symlinks again at dispatch; only
worker symlinks were detached, preserving all targets, and a locked offline
`--ignore-scripts` install restored an isolated dependency tree (exit 0;
`ci-repair-isolated-dependencies.log`). An initial clone invocation without
Vitest and a subsequent run with missing nodemailer are setup failures,
not reproduction evidence; the old/new results above were rerun with complete
locked dependencies. Affected whole-suite checks use the existing final-SHA
check runner and retain each command and exit code in `checks-3cfcba689aa4cb012b7c0938c7651d2bd4e356b5.log` / `.json`.
The production provider/public-policy settings and all C125 live gates remain
pending exactly as recorded above. No production or provider request, cloud
mutation, VM product/preview/browser/PG server or Compose infrastructure ran.

## Authorized E2E-009 repair and frozen shallow verification (2026-10-12)

Supervisor extended the original task's canonical `write_scopes` to the exact
`tests/e2e/E2E-009-prod-rail-dry-run.sh` file after reviewing the concrete proposal
and confirming no active writer conflict. The earlier scope blocker above is
resolved by that authorization, not waived. Recoverability anchor
`3c7d4502d0d6ad200332b6783bb12cfe32a99efc` applies the reviewed patch and accurately
labels the scenario as offline workflow wiring plus production-function checks.
No central CI workflow, lockfile, config or additional product helper changed.

The scenario now checks explicit remote tag fetch and commit resolution,
`toJSON(vars)` feeding the real `buildPlan`, and the preflight's frozen registry
host reaching Docker authentication. It executes the existing real plan,
preflight, deploy/migration/verification builders and storage/scanner factories
in the 142-case suite. Only external cloud/HTTP boundaries are stubbed. Existing
production environment, tag, registry, staging/build, migrate, deploy, health,
manual dispatch, concurrency and rollback assertions remain required; there is
no skip, inert workflow string or gate waiver.

| Finding / required acceptance                                                                                    | Actual source and repair                                                                                    | Old reproduction → repaired result                                                                                                                                                                                                           | Commands / versions / evidence                                                                                                                                                                                                           | Unverified limits                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-CI-SHALLOW; `production_complete_topology_regression` / `production_strict_auth_config_fail_closed_regression` | Hash-verified exact historical sources from `3cfcba689`; E2E-009 executes `production-rail.test.ts`         | Frozen depth-1 `742317648e9ef88c5aa9864471fee5db1a943614`: 3 failed / 139 passed, exit 1. Frozen depth-1 `3c7d4502d0d6ad200332b6783bb12cfe32a99efc`: 142 passed within E2E-009, exit 0. Both report shallow=true; old objects remain absent. | Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4; `pnpm exec vitest run tests/unit/sr-prod-full-surface-rail-20261012/production-rail.test.ts`; canonical task `.local/shallow-old-742317648-dispatch.log`, `shallow-e2e009-new-3c7d4502d.log` | Offline mocks do not establish live topology, IAM/OAuth, provider or C125 acceptance.                                                                              |
| F-CI-E2E009; `production_exact_sha_review_ci_protected_merge`                                                    | Authorized scenario checks current workflow/helper wiring and executes actual production functions          | Frozen old E2E-009 fails on obsolete `git ls-remote` literal, exit 1. Tracked repair passes all four chain stages in both owner worktree and depth-1 clone, exit 0.                                                                          | `bash tests/e2e/E2E-009-prod-rail-dry-run.sh`; `.local/e2e009-old-dispatch.log`, `e2e009-3c7d4502d.log`, `shallow-e2e009-new-3c7d4502d.log`; chain/evidence files beside logs                                                            | Fresh same-SHA Gemini2 review, full hosted CI, protected merge and named acceptance remain pending; auto-merge is disabled.                                        |
| Previous F-PUBLIC-ENTRY / F-ARTIFACT-PROVIDERS and full C125 gates                                               | Original helper/product boundary regressions remain required; production runtime logic unchanged this round | Ten affected suites pass 328 tests, exit 0, including topology, strict auth, Google registry, public customer boundaries, real artifact factories and upload/proxy regressions.                                                              | `.local/checks-3c7d4502d0d6ad200332b6783bb12cfe32a99efc.log`; final exact candidate checks are recorded in `.local/checks-<CANDIDATE_SHA>.log` / `.json` before handoff                                                                  | Production configuration/public policy/native storage/scanner and genuine supply AND case/reply/composite/legal-role evidence remain outstanding exactly as above. |

Frozen clones were created with `git clone --depth 1 --no-local --branch
codex/sr-prod-full-surface-rail-20261012 file://<assigned-worktree>` under canonical
`.local/`; neither active worktree nor published history was reset or rewritten.
Locked offline `--ignore-scripts` dependencies were installed in the new clone.
Inherited owner dependency symlinks were detached only in this assigned worker,
preserving all canonical targets, then restored with a locked offline install
(exit 0; `e2e009-isolated-dependencies.log`). All started local checks finish and
their results are read before exact-SHA handoff. No product/preview/browser/PG
server, Compose infrastructure, live provider request or cloud mutation ran.
