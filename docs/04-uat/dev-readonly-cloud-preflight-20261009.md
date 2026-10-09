# Shared-dev read-only cloud preflight — 2026-10-09

Task: `SR-DEV-READONLY-CLOUD-PREFLIGHT-20261009`. Implementation owner Pi; independent reviewer Codex2. This is repository tooling, not product acceptance or a change to Gemini2's reviewed upload harness.

## Observed blocker and existing authority

The existing Operator gcloud user refresh fails with `Reauthentication failed. cannot prompt during non-interactive execution.` The original fail-closed deployment preflight stopped before any new deployment reservation/dispatch. The authorized deploy workflow already uses existing `DEV_WIF_PROVIDER` / `DEV_WIF_SERVICE_ACCOUNT`; this helper reuses that identity for read-only metadata. No IAM, service account, token export, account switch, local login or persistent authentication change is implemented.

Reviewed product predecessor: upload candidate `915f35d34fb31c3f62b33e84af9de38482d83df3`, generation `c1686efa10f445d5aa395da8c9300c73`; normal merge/product source `03a1c98af9bddfacf3feb2b0b9b8bd00283717bf`. Its review, 90 scoped tests, matching CI, merged-source CI and source acceptance key are separate and preserved. Last established actual runtime is `8d7e14eaa8debbe967d6cf6f05359ce70e30b3c7`; deployment 37864425192 failed operational acceptance 15/16 with zero skips. Six genuine PDF receipt/confirm/hash/size/MIME readbacks do not replace the missing full16/C125/native/external/manual/same-release/owned-cleanup gates.

## Implementation

- Add an explicit, default-false manual read-only metadata job to the already registered `ci-integ.yml`. It cannot run on a PR/push. The full existing CI graph stays mandatory even when this flag is enabled; no aggregate, scope classifier, draft logic or existing job permissions/concurrency are disabled.
- Before existing WIF authentication, validate current project/region, full immutable definition and prior runtime SHA; definition must equal actual `GITHUB_SHA` and checked-out HEAD. Dispatch after review/normal merge through an immutable audit tag, not a mutable-source assumption.
- `read-dev-cloud-metadata.py` calls only `gcloud run services describe` and `get-iam-policy`, fixed current project/region/nine-service inventory, checked return code/JSON, 30s per-read limit. It never invokes a product/scanner endpoint, changes IAM/service/bucket/DB/config, warms/scans, runs provisioning/restore, or exports credentials.
- Check Ready/latest-created/latest-ready/100% traffic, immutable current-project image digests, expected runtime identity, all seven private console policies, unchanged existing API public binding and scanner invokers, approved GCS/scanner references, separate scanner identity and exact default loopback/env/scale/concurrency.
- Export only nonsecret source/provider fields, selected revision/image/identity/IAM metadata and a scanner full-spec hash. API secret env and raw stderr are not exported; unknown scanner nonce/fault/freshness/environment/command overrides fail closed. Full-spec hash allows exact comparison with the independently collected prior scanner baseline without exporting arbitrary raw fields.

The output is control-plane metadata, not an acceptance receipt. `product_http_invocations=0`, `mutations=0`, `product_acceptance=false` explicitly retain this boundary. The Operator still verifies timestamp, actual workflow/source provenance, baseline IAM/spec equality, current variables and no overlapping shared windows before one authorized immutable03a product deployment. Product source remains03a, not the helper merge SHA.

## Executed implementation checks

Socket-free, in isolated owner worktree from03a, before handoff:

| Check | Actual result |
| --- | --- |
| `python3 -m unittest tools/ci/test_dev_cloud_metadata_preflight.py -v` | Exit0, 26 tests passed. Actual collector invoked; only subprocess cloud boundary mocked. |
| `python3 -m unittest tools/ci/test_workflow_timeouts.py tools/ci/test_classify_change_scope.py tools/ci/test_dev_artifact_providers.py tools/ci/test_check_test_coverage.py` | Exit0, 56 tests passed. |
| `python3 tools/ci/check_test_coverage.py` | Exit0, all93 test files yield tests CI runs. |
| `git diff --check` | Exit0. |

Tests exercise all18 exact read commands, JSON/failure/timeout/schema handling, all7 private policies, expected source/provider/URL/identity/digest/traffic binding, scanner scale and nonce/fault/env/command rejection, no secret leakage, and actual manual immutable WIF workflow wiring without disabling fullCI. The older source has no hosted-only metadata helper; missing-file failure is not claimed as a product behavior regression. The actual older OAuth-preflight failure is the recorded trigger; the new valid read-only scenario is mocked source verification until genuine hosted execution.

## Pending gates (not prefilled)

- Independent exact helper SHA/generation review, matching all applicable hosted CI, normal protected merge.
- One genuine existing-WIF hosted metadata job, exact immutable definition, all nine actual services / 18 actual reads and preserved baseline checks. Hosted permission failure remains a concrete blocker, never triggers new grants.
- Then one standard authorized shared-dev immutable product03a deploy/actualfull16zero-skips/eight document chains, source/provider/private IAM/scanner/default restoration/owned cleanup.
- Original C125 supply AND case attachment/cross-role and full44/134/native/external/manual/same-release/finaltodo remain separately required.

Acceptance keys: `readonly_cloud_preflight_exact_sha_review_ci_merge` and `readonly_cloud_preflight_genuine_hosted_current_metadata`. No key is established by these mocks, worker success, this document or a future reviewer verdict. No product/dev/browser/HTTP/DB/Docker/ClamAV servers or infrastructure are started on the VM; root dirty/user files and all old data/history are preserved.
