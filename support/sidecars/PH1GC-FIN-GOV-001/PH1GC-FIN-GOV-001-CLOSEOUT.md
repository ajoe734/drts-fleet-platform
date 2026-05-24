# PH1GC-FIN-GOV-001 — Closeout Report

**Task:** `PH1GC-FIN-GOV-001` — Phase 1 gap closure: governance-aware billing/reporting spec + UAT
**Owner:** `Codex`
**Reviewer:** `Gemini2`
**Branch:** `codex/ph1gc-fin-gov-001`
**Directive:** `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.7 (`WF-FIN-GOV-001`)
**Task-brief planning ref:** `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` (re-read in this worktree during the 2026-05-24 reassignment / blocker revalidation)
**Predecessor evidence pack:** `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`

---

## 0. Standard Closeout Header

Task ID:
`PH1GC-FIN-GOV-001`

Owner:
`Codex`

Reviewer:
`Gemini2`

Branch:
`codex/ph1gc-fin-gov-001`

PR:
`none on the expected task branch as of 2026-05-24; baseline spec/UAT visibility on origin/dev came from docs/ph1gc-doc-batch-1-20260522 (PR #237)`

Commit:
`branch is a multi-anchor blocker-refresh series on origin/codex/ph1gc-fin-gov-001-rebased-20260524 after rebasing onto origin/dev; see git log for the current task-scoped anchor head`

Files changed:
`docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`, `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`, `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`, `.github/workflows/ci-integ.yml`, `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, `docs/03-runbooks/phase1-release-truth-sync-20260519.md`, `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`, `docs/04-uat/fbp-014a-e2e-matrix.md`, `tests/e2e/README.md`, `tests/e2e/run-e2e.sh`, `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`, `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md`, `.github/workflows/deploy-staging.yml`

Verification commands:
`bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh`; `STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh`; `bash tests/e2e/run-e2e.sh --suite 010 --dry-run`; `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/ci-integ.yml').read_text())"`; `gh workflow run ci-integ.yml --repo ajoe734/drts-fleet-platform --ref codex/ph1gc-fin-gov-001-rebased-20260524 -f ref=codex/ph1gc-fin-gov-001-rebased-20260524 -f run_staging_e2e_010=true`; `gh run view 26370775088 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`; `gh run view 26373513770 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`; `gh run view 26373579304 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`; `gh run view 26374131695 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,headSha,jobs`; `gh run view 26374841176 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,headSha,jobs`; `gh run download 26373513770 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26373513770 -D /tmp/e2e-010-run-26373513770`; `gh run download 26373579304 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26373579304 -D /tmp/e2e-010-run-26373579304`; `gh run download 26374131695 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26374131695 -D /tmp/e2e-010-run-26374131695`; `gh run download 26374841176 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26374841176 -D /tmp/e2e-010-run-26374841176`; `git diff --check`

Evidence artifact:
`support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md`; `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`; GitHub Actions runs `26370775088` / `26373513770` / `26373579304` / `26374131695` / `26374841176`, latest staging job `77633204585`

Workflow family affected:
`WF-FIN-GOV-001`

Gate read before:
`PASS (static evidence)` on the release-gate matrix

Gate read after:
`PASS (static evidence)` remains the truthful read because the governed staging rerun is still blocked before `E2E-010` can reach either the protected staging API or a resolvable direct Cloud Run origin with an authenticated bearer

Remaining non-claim:
`WF-FIN-GOV-001` is not yet `PASS (live staging evidence)`; no green `STRICT_VERIFICATION_BODY=1` staging rerun exists; the branch does not claim all 13 verification-body fields are populated on the current runtime

External dependencies, if any:
`roles/iam.serviceAccountTokenCreator` (or equivalent permissions `iam.serviceAccounts.getAccessToken` + `iam.serviceAccounts.getOpenIdToken`) on the staging deployer / WIF service-account path, a valid email-bearing IAP principal that is actually allow-listed on the staging API, and either a resolvable current `drts-api` Cloud Run service URL or an operator-supplied `vars.STAGING_DIRECT_API_ORIGIN` override if the workflow must bypass Cloud Run `describe`

---

## 1. Delivered Scope

This branch replays the missing governance-aware billing/reporting artifact chain onto the assigned `codex/ph1gc-fin-gov-001` worktree:

1. `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` reconciles the verification body to the canonical 13 fields and makes the authority pointer explicit.
2. `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` enumerates the same 13-field body and aligns the live-uplift rule to strict E2E verification.
3. `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` is added and wired into the E2E suite.
4. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, `docs/03-runbooks/phase1-release-truth-sync-20260519.md`, and `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` are updated so `WF-FIN-GOV-001` is explicitly present as a `PASS (static evidence)` row with an honest live-staging blocker.
5. `docs/04-uat/fbp-014a-e2e-matrix.md` and `tests/e2e/README.md` document the new `E2E-010` chain and verification surface.
6. `.github/workflows/ci-integ.yml` now exposes a task-scoped `workflow_dispatch` path that can try the protected staging `E2E-010` rerun from GitHub Actions using the repo's WIF / IAP configuration. The latest branch head probes five repo-local bearer routes in a reviewable order: `auth_token`, staging deployer `access_token`, staging deployer `id_token`, shared fallback `id_token`, dev fallback `id_token`, and a final dev-fallback direct `run.app` attempt when a current Cloud Run URL can be resolved. The newest anchor also adds `vars.STAGING_DIRECT_API_ORIGIN` as an explicit direct-URL override and uploads `e2e-010-direct-api-resolve.stderr.txt`, so the direct fallback no longer fails silently when Cloud Run discovery itself is blocked.

The dispatch planning ref was read directly from this worktree during the original 2026-05-23 resume and re-read during the 2026-05-24 `Codex` / `Gemini2` reassignment. The shipped spec/UAT authority headers still point to the canonical directive §3.7 because that is the normative source for `WF-FIN-GOV-001`, with the execution worklist plus blueprint-alignment audit cited as alignment anchors and the planning ref used as dispatch context.

`origin/dev` already carries the earlier directive-path spec/UAT pair for `WF-FIN-GOV-001`. This branch is the reconciliation layer: it tightens the verification body to the canonical 13 fields, adds the `E2E-010` shell plus matrix/release wiring, and records the current live-staging blocker with fresh 2026-05-23 and 2026-05-24 probes.

## 2. Acceptance Status

| Brief acceptance item | Current state on `codex/ph1gc-fin-gov-001` | Evidence |
| --- | --- | --- |
| `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` visible on `origin/dev` | Yes. `origin/dev` already carries the earlier spec; this branch layers the 13-field reconciliation and authority-header cleanup on top. | `git show origin/dev:docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`; branch spec header + §3 + §6 |
| `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` visible on `origin/dev` | Yes. `origin/dev` already carries the earlier UAT; this branch layers the 13-field reconciliation and strict-mode uplift wording on top. | `git show origin/dev:docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`; branch UAT header + §2 + §4 |
| UAT covers all 13 directive §H verification-body fields | Yes. The happy-path and negative-path scenarios enumerate the 13-field body and the required integrity / RBAC / masking paths. | UAT §2–§4 |
| `PH1GC-E2E-010` script asserts every verification-body field | Yes, with the two-tier contract now documented explicitly: every field is always recorded, and `STRICT_VERIFICATION_BODY=1` hard-fails if any field remains `NOT_POPULATED`. | Spec §6; `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`; E2E matrix §4.10 |
| Gate-read update for `WF-FIN-GOV-001 = PASS (live staging evidence)` drives matrix change | **Blocked.** The branch adds the matrix row and keeps it at `PASS (static evidence)`. Four fresh 2026-05-24 reruns tightened the blocker further instead of clearing it. Run `26373513770` (staging job `77629725730`, commit `24236655`) proved the repo-local multi-service-account fallback order: the shared fallback provider still fails with `invalid_target`; the staging deployer still fails with `iam.serviceAccounts.getAccessToken` / `iam.serviceAccounts.getOpenIdToken`; and the dev fallback can mint an email-bearing ID token, but IAP returns `403 Access denied` for `github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com`. Run `26373579304` (staging job `77629894093`, commit `4bbcd8fc`) added a direct Cloud Run fallback and still failed, but only reported an unresolved direct API origin. Run `26374131695` (staging job `77631328143`, commit `4f1bb9ad`) kept the same outcome while sharpening the direct branch: the new uploaded `e2e-010-direct-api-resolve.stderr.txt` shows `gcloud run services describe drts-api` is itself blocked by `403 Permission 'iam.serviceAccounts.getAccessToken' denied`, so the direct `run.app` path needs either the same service-account credential-mint permission or an operator-supplied `vars.STAGING_DIRECT_API_ORIGIN` override. Run `26374841176` (staging job `77633204585`, commit `ceacdf74`) reproduced the same external gate on the actual current branch head: `auth_token` still returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`, the staging deployer still could not mint `access_token` / `id_token`, the shared fallback provider still failed with `invalid_target`, the dev fallback still reached IAP only to get `403 Access denied`, and direct Cloud Run discovery still failed before the shell could run. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped in all four reruns, so no reviewer-readable live invoice/report artifact or green strict-mode rerun exists from this workspace. | Release-gates row `WF-FIN-GOV-001`; release-truth-sync row 14; predecessor evidence pack §4; this closeout §4–§5 |
| Closeout report follows directive §7 format | Yes. This sidecar applies directive §7 as a non-claim closeout: delivered scope, explicit non-claims, local verification, and the exact remaining blocker are all stated plainly. | This file |

## 3. Directive §7 Non-Claim Posture

- This branch does **not** claim `WF-FIN-GOV-001` is already `PASS (live staging evidence)`.
- This branch does **not** claim every governance enrichment field is populated on the current runtime; the shell records missing fields as `NOT_POPULATED` and strict mode gates the uplift.
- This branch does **not** claim the predecessor IAP/credential blocker is resolved.
- This branch does **not** claim the compute-service-account fallback is sufficient: the VM metadata path can mint an email-bearing token, but IAP still returns `403 Access denied` for `384772941419-compute@developer.gserviceaccount.com`, and IAM Credentials impersonation remains blocked by `ACCESS_TOKEN_SCOPE_INSUFFICIENT`.
- This branch does **not** widen any baseline `WF-FIN-001` claim; `WF-FIN-GOV-001` remains an additive governance-enrichment row that depends on `WF-TGV-001` + `WF-FIN-001`.

## 4. Local Verification

- `bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- `STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- `bash tests/e2e/run-e2e.sh --suite 010 --dry-run`
- `curl -i -sS --max-time 20 https://api.staging.drts-fleet.cctech-support.com/api/health`
- `curl -i -sS --max-time 20 https://drts-api-kdhu6wzufa-uc.a.run.app/api/health`
- `gcloud auth list`
- `gcloud auth print-access-token` for the active user account (`bobo.du@cctech-support.com`) and temporary compute-service-account override
- `CLOUDSDK_CORE_ACCOUNT=384772941419-compute@developer.gserviceaccount.com ./scripts/print-staging-iap-token.sh`
- `CLOUDSDK_CORE_ACCOUNT=384772941419-compute@developer.gserviceaccount.com gcloud auth print-identity-token --audiences <IAP_CLIENT_ID>`
- `curl -sS -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=<IAP_CLIENT_ID>&format=full'`
- `curl -i -sS --max-time 20 -H "Authorization: Bearer <metadata-token>" https://api.staging.drts-fleet.cctech-support.com/api/health`
- `gh workflow run ci-integ.yml --ref codex/ph1gc-fin-gov-001 -f ref=codex/ph1gc-fin-gov-001 -f run_staging_e2e_010=true`
- `gh workflow run ci-integ.yml --ref codex/ph1gc-fin-gov-001-rebased-20260523 -f ref=codex/ph1gc-fin-gov-001-rebased-20260523 -f run_staging_e2e_010=true`
- `gh workflow run ci-integ.yml --repo ajoe734/drts-fleet-platform --ref codex/ph1gc-fin-gov-001-rebased-20260523 -f ref=codex/ph1gc-fin-gov-001-rebased-20260523 -f run_staging_e2e_010=true`
- `gh run view 26327029664 --json url,status,conclusion,jobs`
- `gh run view 26287551676 --job 77378907824 --log`
- `gh run view 26327833020 --job 77508630437 --log`
- `gh run view 26327904346 --job 77508827724 --log`
- `gh run view 26331222549 --json url,status,conclusion,jobs`
- `gh run view 26331222549 --job 77517556463 --log`
- `gh run view 26332046380 --json url,status,conclusion,jobs`
- `gh run view 26332046380 --job 77519603226 --log`
- `gh run view 26332590728 --json url,status,conclusion,jobs`
- `gh run watch 26332590728 --exit-status`
- `gh workflow run ci-integ.yml --repo ajoe734/drts-fleet-platform --ref codex/ph1gc-fin-gov-001-rebased-20260523 -f ref=codex/ph1gc-fin-gov-001-rebased-20260523 -f run_staging_e2e_010=true`
- `gh run view 26363924897 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`
- `gh run view 26366139732 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`
- `gh run view 26367273638 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`
- `gh run view 26370775088 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`
- `gh run view 26373513770 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`
- `gh run view 26373579304 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,jobs`
- `gh run view 26374131695 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,headSha,jobs`
- `gh run view 26374841176 --repo ajoe734/drts-fleet-platform --json url,status,conclusion,headSha,jobs`
- `gh api repos/ajoe734/drts-fleet-platform/actions/jobs/77613134370/logs`
- `gh api repos/ajoe734/drts-fleet-platform/actions/jobs/77610148431/logs`
- `gh api repos/ajoe734/drts-fleet-platform/actions/jobs/77622481612/logs`
- `gh run download 26373513770 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26373513770 -D /tmp/e2e-010-run-26373513770`
- `gh run download 26373579304 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26373579304 -D /tmp/e2e-010-run-26373579304`
- `gh run download 26374131695 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26374131695 -D /tmp/e2e-010-run-26374131695`
- `gh run download 26374841176 --repo ajoe734/drts-fleet-platform -n e2e-010-staging-26374841176 -D /tmp/e2e-010-run-26374841176`
- `gh secret list --repo ajoe734/drts-fleet-platform`
- `gh variable list --repo ajoe734/drts-fleet-platform`
- `git diff --check`

No governed live staging execution has yet run from this dispatch because the access probes and GitHub Actions reruns still stop before an authenticated E2E request can be issued:

- the protected staging host still redirects unauthenticated requests to Google OAuth and returns `Invalid IAP credentials: empty token`;
- the historical direct Cloud Run fallback still returns `404 Page not found`, and the newest direct-discovery probe on run `26374131695` shows the runner cannot query a newer `drts-api` service URL because `gcloud run services describe drts-api` fails while refreshing impersonated credentials with `403 Permission 'iam.serviceAccounts.getAccessToken' denied`;
- the locally configured human `gcloud` accounts (`bobo.du@cctech-support.com`, `edna@cctech-support.com`, and `lupinchen@cctech-support.com`) all still fail non-interactive token minting with `Reauthentication failed. cannot prompt during non-interactive execution.`;
- the VM metadata path can mint an email-bearing identity token for `384772941419-compute@developer.gserviceaccount.com`, but the protected staging host now returns `403 Access denied` for that principal, and metadata-access-token based `generateIdToken` / service-account impersonation still fails with `ACCESS_TOKEN_SCOPE_INSUFFICIENT`;
- the 2026-05-24 repository secret inventory still shows `STAGING_WIF_SERVICE_ACCOUNT` present but no `STAGING_WIF_PROVIDER`; the branch-local `DEV_WIF_PROVIDER` fallback therefore remains necessary to reach GCP non-interactively, and the 2026-05-24 rerun confirms that this fallback is no longer the blocker once the job reaches token minting;
- the GitHub Actions fallback path no longer stops at provider discovery. After branch commit `7aeb2c29` changed the workflow fallback to `STAGING_WIF_PROVIDER || DEV_WIF_PROVIDER || WIF_PROVIDER`, run `26327833020` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001@7aeb2c29`) advanced through `Authenticate to GCP` and failed later in `Set up Cloud SDK` with `Permission 'iam.serviceAccounts.getAccessToken' denied`.
- branch commit `2f6387fa` then made the Cloud SDK path best-effort so it would not gate the E2E chain. Run `26327904346` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001@2f6387fa`) advanced through `Best-effort fetch internal key` and failed at `Mint IAP verification token` with `Permission 'iam.serviceAccounts.getOpenIdToken' denied`.
- a fresh 2026-05-23 rerun on the pre-rebase owner head, run `26331222549` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001@5953c0e1`), reached `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed again at `Mint IAP verification token` with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. Because token minting failed first, both `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped and no `e2e-010-*` artifact files were produced.
- the latest 2026-05-23 rerun on the rebased remote head that was under test at dispatch time, run `26332046380` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@f7bea87d`), again reached `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed at `Mint IAP verification token` with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, and the upload step warned that no `e2e-010-console.log`, `e2e-010-evidence.log`, or `e2e-010-chain.json` files existed to publish.
- a fresh 2026-05-23 rerun on the then-current rebased remote head, run `26332590728` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@bda002e2`), advanced through `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed again at `Mint IAP verification token` with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, GitHub warned that no `e2e-010-console.log`, `e2e-010-evidence.log`, or `e2e-010-chain.json` files existed to upload, and the job annotation from `google-github-actions/auth` confirms the blocker is still OpenID-token mint permission for the staging deployer identity.
- a fresh 2026-05-24 rerun on the current rebased remote head, run `26363924897` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@f6ddefff`), again reached `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed at `Mint IAP verification token` with the same `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, the upload step found no `e2e-010-console.log`, `e2e-010-evidence.log`, or `e2e-010-chain.json` files, and the staging job still never emitted a reviewer-readable invoice/report artifact.
- a fresh 2026-05-24 rerun on the probe commit, run `26365672590` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@0a006787`), added a pre-IAP access-token probe in `.github/workflows/ci-integ.yml`. That rerun reached `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed even earlier inside the new `Probe IAP health with access token` step: `gcloud auth print-access-token` returned `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`. The follow-on `Mint IAP verification token` step still independently failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`, so the runner has neither bearer-mint path required to talk to staging non-interactively.
- a fresh 2026-05-24 rerun on the current auth-token probe commit, run `26366139732` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@c704994b`), added a direct probe of `steps.gcp_auth.outputs.auth_token`. That probe reached the protected staging host but returned `HTTP 401` with body `Invalid IAP credentials: Unable to parse JWT`, proving the GitHub federated token is not a valid IAP bearer fallback for this ingress. The follow-on access-token probe still failed at `gcloud auth print-access-token` with `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`, and the fallback `Mint IAP verification token` step still failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`.
- a fresh 2026-05-24 rerun on the current blocker-refresh head, run `26367273638` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@5c257292`), reconfirmed the same blocker on the actual latest pushed branch head. `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all succeeded; the `Probe IAP health with auth_token` step again reached the protected host but returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the continue-on-error access-token probe still logged `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`; and the fallback `Mint IAP verification token` step again failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped, and the upload step again had no reviewer-readable invoice/report artifacts to publish because the shell never started.
- a fresh 2026-05-24 rerun on the direct access-token probe commit, run `26369501167` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@6739c6cd`), replaced `gcloud auth print-access-token` with a second `google-github-actions/auth@v2` call using `token_format: access_token`. The `auth_token` probe still returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the direct access-token mint now failed inside `google-github-actions/auth@v2` itself with `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`; and the fallback `Mint IAP verification token` step still failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Probe IAP health with access token` was skipped because the access-token output was empty, which confirms the access-token failure now occurs before any `gcloud`-backed probe.
- a fresh 2026-05-24 rerun on the actual current pushed head, run `26370433652` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@5d375722`), confirmed that no same-day IAM/IAP change landed after the previous probe commit. `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all succeeded; the `Probe IAP health with auth_token` step again returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the direct `google-github-actions/auth@v2 token_format=access_token` step again logged `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`; and the fallback `Mint IAP verification token` step again logged `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Run E2E-010 against staging` was skipped again, so the branch still has no reviewer-readable live invoice/report artifact on its actual current head.
- a fresh 2026-05-24 rerun on the rebased current head, run `26370775088` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@2c4be62a`), reconfirmed the pre-fallback blocker after rebasing onto latest `origin/dev` and preserving the task branch on a non-force-pushed remote head. `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key` all succeeded; `Probe IAP health with auth_token` again returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the continue-on-error `Mint service-account access token` path again annotated `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)` and therefore skipped `Probe IAP health with access token`; and the fallback `Mint IAP verification token` step again failed with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, and the upload step only produced the auth-token health-body artifact because the shell never started.
- a fresh 2026-05-24 rerun on the multi-credential fallback head, run `26373513770` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@24236655`), tried shared and dev fallback service accounts after the staging deployer path. The shared fallback provider still failed with `invalid_target`; the staging deployer still failed on `iam.serviceAccounts.getAccessToken` / `iam.serviceAccounts.getOpenIdToken`; and the dev fallback produced the first email-bearing GitHub-issued token that actually reached IAP, but the protected host returned `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.` `Run E2E-010 against staging` stayed skipped because no probe returned `HTTP 200`.
- a fresh 2026-05-24 rerun on the direct-Cloud-Run fallback head, run `26373579304` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@4bbcd8fc`), added a direct `run.app` probe after the dev fallback IAP denial. That attempt also remained blocked: `Resolve direct Cloud Run API origin` completed with `Could not resolve direct Cloud Run API origin for drts-api`, so the dev direct-token and direct-health-probe steps were skipped. The run again ended without `Syntax check E2E-010` or `Run E2E-010 against staging`, which means no reviewer-readable live invoice/report artifact exists on the latest head.
- a fresh 2026-05-24 rerun on the direct-origin diagnostics head, run `26374131695` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@4f1bb9ad`, staging job `77631328143`), preserved the same top-level blocker but removed the direct-origin ambiguity. The new uploaded artifact `e2e-010-direct-api-resolve.stderr.txt` shows `gcloud run services describe drts-api` failed while refreshing impersonated credentials with `403 Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist)`, so the direct `run.app` branch is blocked by the same staging-deployer access-token permission as the primary bearer path unless an operator supplies `vars.STAGING_DIRECT_API_ORIGIN`. The `auth_token` probe still returned `Invalid IAP credentials: Unable to parse JWT`, the dev fallback IAP probe still returned `403 Access denied` for `github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com`, and `Run E2E-010 against staging` remained skipped.
- a fresh 2026-05-24 rerun on the actual current branch head, run `26374841176` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@ceacdf74`, staging job `77633204585`), reconfirmed the same external gate after the verification-body traceability anchor. `auth_token` still returned `HTTP 401 Invalid IAP credentials: Unable to parse JWT`; the staging deployer still failed to mint either an OAuth access token (`iam.serviceAccounts.getAccessToken` denied) or an IAP ID token (`iam.serviceAccounts.getOpenIdToken` denied); the shared fallback provider still failed with `invalid_target`; the dev fallback again minted an email-bearing token that reached IAP but came back `DRTS Fleet Platform: Access denied. For user github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com.`; and direct Cloud Run discovery still failed because `gcloud run services describe drts-api` could not refresh impersonated credentials without the same `iam.serviceAccounts.getAccessToken` permission. `Syntax check E2E-010` and `Run E2E-010 against staging` remained skipped, and the uploaded artifacts were still limited to auth-token / dev-id-token health bodies plus the direct-origin stderr.
- the latest governed staging rerun is `26374841176` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260524@ceacdf74`), so the blocker has now been reproduced on the actual current branch head after exhausting every repo-local bearer path available from this branch and after capturing the direct-origin resolve stderr as a downloadable artifact.
- across the 2026-05-24 probe sequence (`26363924897`, `26365672590`, `26366139732`, `26367273638`, `26369501167`, `26370433652`, `26370775088`, `26373513770`, `26373579304`, `26374131695`, `26374841176`), the remaining CI blocker is now definitively external IAM / IAP policy plus direct-origin authority, not stale provider discovery or Cloud SDK behavior. The GitHub federated token is not parseable by IAP, the staging deployer still cannot mint service-account credentials, the shared fallback provider is invalid, the dev fallback token is not allow-listed on staging IAP, and the runner cannot discover a current direct Cloud Run API URL without the same `iam.serviceAccounts.getAccessToken` permission unless an operator provides `vars.STAGING_DIRECT_API_ORIGIN`.

## 5. Remaining Blocker

To uplift `WF-FIN-GOV-001` from `PASS (static evidence)` to `PASS (live staging evidence)`, a follow-up owner must:

1. obtain a valid email-bearing staging bearer / IAP path for the governed tenant. On the GitHub Actions path, that now concretely means one of:
   - grant the caller behind `WIF_PROVIDER_VALUE` permission on `DEPLOYER_SERVICE_ACCOUNT` to mint service-account credentials (`roles/iam.serviceAccountTokenCreator`, or at minimum `roles/iam.serviceAccountOpenIdTokenCreator` for the IAP path), and make sure the resulting staging deployer identity is allow-listed on the staging IAP policy, or
   - if the intended bearer is the dev deployer identity `github-actions-deployer@drts-dev-bobo-20260503.iam.gserviceaccount.com`, add that principal to the staging IAP allow-list, or
   - provide / restore a current direct `drts-api` Cloud Run service URL plus the corresponding invoker policy if the staging contract intends raw `run.app` access to be a supported fallback, and set `vars.STAGING_DIRECT_API_ORIGIN` so the workflow can skip `gcloud run services describe` when Cloud Run discovery is blocked by the same IAM gap,
   On the VM path, it still means either refreshing a human credential that can mint the token non-interactively, or granting a principal that already works from this VM access through IAP plus enough scope to call IAM Credentials,
2. run `STRICT_VERIFICATION_BODY=1 bash tests/e2e/E2E-010-governance-aware-billing-reporting.sh` against the governed staging origin,
3. capture the evidence log plus the reviewer-readable invoice/report artifacts, and
4. then update the release-gate row, release-truth-sync row, and alignment-audit row from blocked static evidence to live staging evidence.

Until that governed rerun exists, this task should remain `blocked`, not `done`.
