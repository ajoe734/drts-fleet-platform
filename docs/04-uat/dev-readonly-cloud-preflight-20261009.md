# Shared-dev read-only cloud preflight — 2026-10-09

Task `SR-DEV-READONLY-CLOUD-PREFLIGHT-20261009`; original implementation owner Pi, independent reviewer Codex2. Repository tooling only; the original Gemini2 upload harness and its seven source scopes are unchanged. No product/dev/browser/HTTP/DB/Docker/ClamAV infrastructure is started on this VM.

## Genuine chronology and current repair

1. Existing Operator user OAuth failed `Reauthentication failed. cannot prompt during non-interactive execution.` Original03a deployment preflight stopped before dispatch. Existing authorized `DEV_WIF_PROVIDER` / `DEV_WIF_SERVICE_ACCOUNT` is reused, with no identity/grant/login/account/token export/persistent auth change.
2. Historical helper candidate `616e5d1c9157a33e0fff47a6a6332598f48a2272`, generation `af6fbd51099d4a838319d543180fbb72`: 26 collector tests +56 related checks passed; coverage93 before tracking /94 after tracking. Independent Codex2 approval04:08:53Z, matching hosted CI37881988713/37881988770 green, protected PR2455 normal merge04:17:38Z as `9c41ee0e7bab05a7c854b473596a8ff8c69afbe6`. This is historical approval, not approval of this repair.
3. One authorized immutable `audit/dev-readonly-preflight-20261009` metadata definition9c job37883443679: actual existing-WIF authentication **succeeded**; immutable definition/checkout/current-target checks succeeded; metadata collector terminal job **failed**04:21:29Z with `Image is not a current-project immutable digest`. No snapshot accepted, no product deployment, no cancellation or unchanged metadata redispatch.
4. Genuine shape defect: Cloud Run **service** template stores the requested reference `us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts/api:8d7e14eaa8de`; actual expected runtime env has full `8d7e14eaa8debbe967d6cf6f05359ce70e30b3c7`. Requested tags are not deployed immutable-byte authority. Codex2 canonically reopened04:26:58Z, restricting repair to existing collector/test/UAT scopes, with an additional narrowly bound read-only ready-revision describe. Original CI workflow remains byte-identical to9c.
5. This working repair reads the authoritative ready revision and keeps immutable digest enforcement; it does **not** weaken the gate to accept tags as digests. Fresh exact-source review, matching full CI, normal merge and new immutable hosted metadata execution remain pending. Do not claim future approval/self-SHA or use old source approval as current acceptance.

## Authority, inventory and fail-closed validation

The registered `ci-integ.yml` manual `readonly_dev_metadata` input stays default-false. PR/push cannot run cloud metadata. All existing full-CI jobs, classifier, permissions, concurrency and aggregates remain mandatory even in manual metadata mode. Before existing WIF authentication: full immutable `inputs.ref == GITHUB_SHA == checked-out HEAD`, full expected prior-runtime SHA, fixed current project `drts-dev-devcc-20260825` / region `us-central1`. No default-branch unregistered workflow or provisioning/restore workaround.

The stdlib collector permits exactly **27 bounded control-plane reads**: nine fixed service describes, nine IAM-policy reads, nine `gcloud run revisions describe` reads. Revision resource is derived only from a service that passes name/Ready/latest-created/latest-ready/100% traffic and strict service-prefix revision-name validation; never caller-supplied arbitrary resource/project/region/verb. Each checked JSON subprocess has30s timeout; hosted job10min limit fails closed if unavailable.

Ready revision must match its metadata name, `serving.knative.dev/service` label, Ready condition, expected service identity, exact named/unnamed container inventory and requested repository/reference. Immutable `images` come from actual revision `status.imageDigest`, complete named resolved container statuses, or explicitly immutable multi-container revision references. Reject missing/malformed/mutable/foreign-project or repository/conflicting/partial digests, mismatch with an explicitly requested digest, wrong service/revision/identity, escaped resources, and partial reads. Service `requested_images` is explicitly separated and never treated as digest provenance. No guessed digest or tag resolution through an unrelated registry resource.

All original controls remain: seven consoles reject allUsers/allAuthenticatedUsers; existing API allUsers binding and scanner runtime+deployer invokers unchanged; dedicated scanner identity; approved GCS document/remittance buckets, cloud-run-clamd/60000/source/URL binding; scanner min0/max1/concurrency1, gateway127.0.0.1:3310/ready marker, exact default env and no nonce/fault/freshness/secret/command override. Scanner full service-spec hash is compared with the independently captured baseline by the Operator.

Only sanitized selected source/provider/revision/requested-reference/resolved-digest/identity/IAM fields, UTC observation and definition provenance are exported. API secret env/raw stderr/credential data are not exported; unknown scanner overrides fail without leaking their values. Explicit output: `mutations=0`, `product_http_invocations=0`, `product_acceptance=false`. No product/scanner warming/scan HTTP, service/IAM/DB/bucket/provision/domain or public-access changes.

## Actually executed repair checks (before handoff)

| Actual command | Observed result |
| --- | --- |
| `python3 -m unittest tools/ci/test_dev_cloud_metadata_preflight.py -v` | Exit0, **45/45**, zero skips; actual collector, only external subprocess mocked. |
| `python3 -m unittest tools/ci/test_workflow_timeouts.py tools/ci/test_classify_change_scope.py tools/ci/test_dev_artifact_providers.py tools/ci/test_check_test_coverage.py` | Exit0, **56/56**. |
| `python3 tools/ci/check_test_coverage.py` | Exit0, **94** CI-covered test files. |
| `python3 -m py_compile operations/verification/read-dev-cloud-metadata.py tools/ci/test_dev_cloud_metadata_preflight.py` | Exit0. |
| `git diff --check` | Exit0. |

Committed old-fail/new-pass test imports the **actual immutable616 helper via git**, not copied logic: identical legitimate service-tag/ready-revision fixture → old fails exact image gate after2 service/IAM calls; new completes all27 actual collector calls and returns expected full runtime SHA and revision digest references from mocked external metadata. Regression negatives reach the named revision/linkage/identity/digest/inventory/read stages; retained existing security/redaction/full-CI tests pass. Actual unnamed single-container API and named2-container scanner shapes are covered, including multi-container immutable revision references without the legacy primary status field. These are socket-free source checks, not genuine hosted metadata, runtime bytes, product-role acceptance or full16.

## Still open and separate

Acceptance keys: `readonly_cloud_preflight_exact_sha_review_ci_merge` (fresh candidate, not historical616) and `readonly_cloud_preflight_genuine_hosted_current_metadata` (fresh genuine successful existing-WIF job/all27 reads/actual9-service bindings/baseline equality/freshness). No key is established by this document or mock success. Operator validates actual job/artifact/definition provenance and timestamp, current variables and no overlapping shared deployment/scanner/provision/domain/product-acceptance windows.

Then one standard immutable product deployment remains **`03a1c98af9bddfacf3feb2b0b9b8bd00283717bf`**, not any metadata helper merge. Original harness candidate915/gen c168/review/CI/merge/source-key remain preserved. Last actual product37864425192/runtime8d remains **15/16 failed, zero skips**; six327-byte real PDF receipt/confirm/hash/MIME/readbacks do not establish full16. Require fresh actual same-source build/runtime, full16 zero skips, original legitimate-role/private/provider/scanner controls and exact owned fixture cleanup. C125 **supply AND case attachment/cross-role**, application composite, full44/134/native/external/manual/same-release and final `SR-ACCEPT-001` todo remain separately open. Root unrelated dirty/user files, old workflows/branches/worktrees, failed runs/artifacts and user data are preserved.
