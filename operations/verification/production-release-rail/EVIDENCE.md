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

## Completed repository checks

Node `v22.23.2`; pnpm `10.33.0`; locked TypeScript `5.9.3`, Vitest `4.1.4`.
Dependencies were installed offline with scripts disabled into this isolated
worktree after stale shared dependency symlinks were unlinked locally. No
canonical dependency directories were removed or changed.

- Three scoped Vitest suites pass (132 cases): new production rail regression,
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
results. No independent review rejection has occurred for this candidate.

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
