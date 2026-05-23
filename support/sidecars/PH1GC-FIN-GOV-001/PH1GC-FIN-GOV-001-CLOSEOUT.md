# PH1GC-FIN-GOV-001 — Closeout Report

**Task:** `PH1GC-FIN-GOV-001` — Phase 1 gap closure: governance-aware billing/reporting spec + UAT
**Owner:** `Codex`
**Reviewer:** `Claude`
**Branch:** `codex/ph1gc-fin-gov-001`
**Directive:** `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.7 (`WF-FIN-GOV-001`)
**Task-brief planning ref:** `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` (read in this worktree during the 2026-05-23 resume)
**Predecessor evidence pack:** `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`

---

## 1. Delivered Scope

This branch replays the missing governance-aware billing/reporting artifact chain onto the assigned `codex/ph1gc-fin-gov-001` worktree:

1. `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` reconciles the verification body to the canonical 13 fields and makes the authority pointer explicit.
2. `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` enumerates the same 13-field body and aligns the live-uplift rule to strict E2E verification.
3. `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` is added and wired into the E2E suite.
4. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, `docs/03-runbooks/phase1-release-truth-sync-20260519.md`, and `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` are updated so `WF-FIN-GOV-001` is explicitly present as a `PASS (static evidence)` row with an honest live-staging blocker.
5. `docs/04-uat/fbp-014a-e2e-matrix.md` and `tests/e2e/README.md` document the new `E2E-010` chain and verification surface.
6. `.github/workflows/ci-integ.yml` now exposes a task-scoped `workflow_dispatch` path that can try the protected staging `E2E-010` rerun from GitHub Actions using the repo's WIF / IAP configuration, so auth failures are captured as reviewable CI evidence instead of being inferred only from local `gcloud` probes.

The dispatch planning ref was read directly from this worktree during the 2026-05-23 resume. The shipped spec/UAT authority headers still point to the canonical directive §3.7 because that is the normative source for `WF-FIN-GOV-001`, with the execution worklist plus blueprint-alignment audit cited as alignment anchors and the planning ref used as dispatch context.

`origin/dev` already carries the earlier directive-path spec/UAT pair for `WF-FIN-GOV-001`. This branch is the reconciliation layer: it tightens the verification body to the canonical 13 fields, adds the `E2E-010` shell plus matrix/release wiring, and records the current live-staging blocker with fresh 2026-05-23 probes.

## 2. Acceptance Status

| Brief acceptance item | Current state on `codex/ph1gc-fin-gov-001` | Evidence |
| --- | --- | --- |
| `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` visible on `origin/dev` | Yes. `origin/dev` already carries the earlier spec; this branch layers the 13-field reconciliation and authority-header cleanup on top. | `git show origin/dev:docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`; branch spec header + §3 + §6 |
| `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` visible on `origin/dev` | Yes. `origin/dev` already carries the earlier UAT; this branch layers the 13-field reconciliation and strict-mode uplift wording on top. | `git show origin/dev:docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`; branch UAT header + §2 + §4 |
| UAT covers all 13 directive §H verification-body fields | Yes. The happy-path and negative-path scenarios enumerate the 13-field body and the required integrity / RBAC / masking paths. | UAT §2–§4 |
| `PH1GC-E2E-010` script asserts every verification-body field | Yes, with the two-tier contract now documented explicitly: every field is always recorded, and `STRICT_VERIFICATION_BODY=1` hard-fails if any field remains `NOT_POPULATED`. | Spec §6; `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`; E2E matrix §4.10 |
| Gate-read update for `WF-FIN-GOV-001 = PASS (live staging evidence)` drives matrix change | **Blocked.** The branch adds the matrix row and keeps it at `PASS (static evidence)`. Fresh 2026-05-23 probes still cannot obtain an email-bearing IAP token usable against governed staging, so no fresh reviewer-readable live invoice/report artifact or green strict-mode rerun is available from this workspace. | Release-gates row `WF-FIN-GOV-001`; release-truth-sync row 14; predecessor evidence pack §4; this closeout §4–§5 |
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
- `gh secret list --repo ajoe734/drts-fleet-platform`
- `gh variable list --repo ajoe734/drts-fleet-platform`
- `git diff --check`

No governed live staging execution was run from this dispatch because the 2026-05-23 access probes still stop before an authenticated E2E request can be issued:

- the protected staging host still redirects unauthenticated requests to Google OAuth and returns `Invalid IAP credentials: empty token`;
- the historical direct Cloud Run fallback still returns `404 Page not found`;
- the locally configured human `gcloud` accounts (`bobo.du@cctech-support.com`, `edna@cctech-support.com`, and `lupinchen@cctech-support.com`) all still fail non-interactive token minting with `Reauthentication failed. cannot prompt during non-interactive execution.`;
- the VM metadata path can mint an email-bearing identity token for `384772941419-compute@developer.gserviceaccount.com`, but the protected staging host now returns `403 Access denied` for that principal, and metadata-access-token based `generateIdToken` / service-account impersonation still fails with `ACCESS_TOKEN_SCOPE_INSUFFICIENT`;
- the GitHub Actions fallback path no longer stops at provider discovery. After branch commit `7aeb2c29` changed the workflow fallback to `STAGING_WIF_PROVIDER || DEV_WIF_PROVIDER || WIF_PROVIDER`, run `26327833020` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001@7aeb2c29`) advanced through `Authenticate to GCP` and failed later in `Set up Cloud SDK` with `Permission 'iam.serviceAccounts.getAccessToken' denied`.
- branch commit `2f6387fa` then made the Cloud SDK path best-effort so it would not gate the E2E chain. Run `26327904346` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001@2f6387fa`) advanced through `Best-effort fetch internal key` and failed at `Mint IAP verification token` with `Permission 'iam.serviceAccounts.getOpenIdToken' denied`.
- a fresh 2026-05-23 rerun on the pre-rebase owner head, run `26331222549` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001@5953c0e1`), reached `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed again at `Mint IAP verification token` with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. Because token minting failed first, both `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped and no `e2e-010-*` artifact files were produced.
- the latest 2026-05-23 rerun on the rebased remote head that was under test at dispatch time, run `26332046380` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@f7bea87d`), again reached `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed at `Mint IAP verification token` with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, and the upload step warned that no `e2e-010-console.log`, `e2e-010-evidence.log`, or `e2e-010-chain.json` files existed to publish.
- a fresh 2026-05-23 rerun on the current rebased remote head, run `26332590728` (`CI (integration trunk)` on `origin/codex/ph1gc-fin-gov-001-rebased-20260523@bda002e2`), advanced through `Authenticate to GCP`, `Set up Cloud SDK`, and `Best-effort fetch internal key`, then failed again at `Mint IAP verification token` with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied on resource (or it may not exist)`. `Syntax check E2E-010` and `Run E2E-010 against staging` were skipped again, GitHub warned that no `e2e-010-console.log`, `e2e-010-evidence.log`, or `e2e-010-chain.json` files existed to upload, and the job annotation from `google-github-actions/auth` confirms the blocker is still OpenID-token mint permission for the staging deployer identity.
- the present branch head `bda002e2` now records that newest governed staging rerun; no governed E2E shell execution or reviewer-readable invoice/report artifact can start until the staging principal can mint the IAP token.
- those five reruns show the remaining CI blocker is now service-account IAM for the staging deployer identity, not stale provider discovery. No governed E2E shell work or invoice/report evidence can start until an email-bearing IAP token can be minted.

## 5. Remaining Blocker

To uplift `WF-FIN-GOV-001` from `PASS (static evidence)` to `PASS (live staging evidence)`, a follow-up owner must:

1. obtain a valid email-bearing staging bearer / IAP path for the governed tenant. On the GitHub Actions path, that now specifically means granting the staging deployer identity whatever IAM binding is required to mint OpenID tokens for the configured service account (`iam.serviceAccounts.getOpenIdToken`, and if `gcloud`-based secret access is expected, `iam.serviceAccounts.getAccessToken` as well). On the VM path, it still means either refreshing a human credential that can mint the token non-interactively, or granting a principal that already works from this VM access through IAP plus enough scope to call IAM Credentials,
2. run `STRICT_VERIFICATION_BODY=1 bash tests/e2e/E2E-010-governance-aware-billing-reporting.sh` against the governed staging origin,
3. capture the evidence log plus the reviewer-readable invoice/report artifacts, and
4. then update the release-gate row, release-truth-sync row, and alignment-audit row from blocked static evidence to live staging evidence.

Until that governed rerun exists, this task should remain in `progress` / `blocker`, not `done`.
