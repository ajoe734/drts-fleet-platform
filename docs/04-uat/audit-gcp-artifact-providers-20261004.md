# Native GCP artifact providers — 2026-10-04

Task: `AUDIT-GCP-ARTIFACT-PROVIDERS-20261004`  
Owner: Pi; independent reviewer: Codex  
Base: `354e6b4c968b7e944713ce720e7a81442d7b89b3` (`dev`)

## Authority and delivery boundary

The user explicitly authorized adding necessary cloud resources on2026-10-04. The live target remains `drts-dev-devcc-20260825`, `us-central1`; the historical suspended project is NOT a target. That permission does not lift the VM hosting restriction. This change adds native first-party API clients; it does not create resources, deploy the API, grant IAM, or claim live acceptance.

The independent infrastructure task `AUDIT-GCP-ARTIFACT-INFRA-20261004` (Claude2/Codex, PR#2307) owns the genuine ClamAV gateway/images, private resource provisioning and provider resolver. Its initial4014dc407811537346c7fa51e0777c91d94fff5a candidate was independently rejected for nine findings; it is NOT an accepted backend. Do not enable providers until repaired infrastructure is independently approved, provisioned and verified. Original voice#2303 ownership/review is unchanged and its latest observed24ba5161c9452dcbe54222306a8372be4e4dcb2d review remains reopened.

Local gcloud credential refresh requires reauthentication. The authorized delivery alternative is the EXISTING GitHub WIF deployment workflow using reviewed immutable source, not another identity or a VM substitute. Before deployment reread exact-source AGENTS/workflow/branch strategy/custom-domain runbook and verify live DEV_GCP variables. Preserve existing data, source and all preceding audit results.

## Implementation and public configuration

No package/lock/dependency changes. GCS uses Google's documented JSON API directly, **not assumed S3 API compatibility** and not fabricated AWS credentials:

- `DOCUMENT_ARTIFACT_STORAGE_PROVIDER=gcs`, `DOCUMENT_ARTIFACT_GCS_BUCKET=<approved private bucket>`.
- `REMITTANCE_PROOF_STORAGE_PROVIDER=gcs`, `REMITTANCE_PROOF_GCS_BUCKET=<approved private bucket>`.
- `REMITTANCE_PROOF_SCANNER_PROVIDER=cloud-run-clamd`, `REMITTANCE_PROOF_SCANNER_URL=<exact HTTPS Cloud Run origin>`, optional `REMITTANCE_PROOF_SCANNER_TIMEOUT_MS`100..60000 (default60000).
- Existing S3, direct clamd and unprovisioned choices remain. Memory remains non-strict test-only: the proof factory now also rejects a test NODE_ENV override when APP_ENV/DRTS_ENV explicitly says production/staging.
- Configured provider availability is NOT a live-health assertion. Missing storage, auth, engine or transport still fails closed at the consumed operation.

### Native storage

`common/google-cloud/google-cloud-object-client.ts` consumes Cloud Run metadata OAuth tokens, requires the Google metadata response marker, and never prints tokens or response bodies. Metadata/storage/scanner HTTP error domains are distinguished: metadata404 is NOT object absence, metadata412 is NOT conditional-write rejection. All redirects are forbidden.

Objects are uploaded as multipart JSON/media with transfer MD5; **domain/content identity remains SHA256**, not MD5. Successful acknowledgements must match bucket, key, positive uint64 generation, size, MIME and actual transfer digest. Create uses `ifGenerationMatch=0`; CAS uses the exact observed generation STRING without Number precision loss. There is no blind retry of ambiguous uploads. Reads fetch metadata and then pin the immutable generation for the body; a missing pinned generation is an error, not a null current object. Validate bounded metadata/body, exact length and transfer digest. The entire operation (credentials, request, body) has a30s deadline; cancellation closes readers and no late credential result starts a new request.

`GcsDocumentArtifactStoreAdapter` implements the existing producer/controlled-download contract, max25MiB, immutable captured command/bytes, atomic create/CAS and SHA256 recomputation. Conditional conflicts read the real winner rather than returning the losing render or a caller-mutated foreign key. Existing publication backup/recovery logic is unchanged.

`GcsRemittanceProofStorageAdapter` implements max10MiB, supported PDF/PNG/JPEG/WebP, random single-use15min staged reference, SHA256 content-addressed bytes, durable conditional consumed marker, cross-instance reads and content/MIME validation. Concurrent consumers cannot both succeed. A lost claim acknowledgement is NOT permission to consume twice. Expiration currently controls admission; it is not a claim of physical byte deletion. Any lifecycle policy for staged/consumed objects belongs to reviewed provisioning and must not delete durable content or resurrect a still-valid consumed stage.

### IAM-authenticated real-scanner client

The client captures the immutable scan identity/bytes, verifies stored SHA256/size/MIME, obtains a metadata ID token with the EXACT configured origin as audience and POSTs actual bytes to `/scan`. Only HTTPS `.run.app` root origins without userinfo, paths, ports, queries or fragments are accepted. No redirects or secret-valued configuration.

First-party gateway contract: actual bytes, actual MIME, `X-Content-SHA256`; response `{sha256,sizeBytes,verdict:"clean"|"infected"}` only after definitive real ClamAV INSTREAM processing. Client limits the reply to4096bytes and checks exact correlation and verdict. Malformed/foreign/unknown/unauthorized/unavailable replies never become clean. Infected becomes rejected; errors propagate so the existing proof service retains its fail-closed pending/retry behavior. The client cannot establish remote signature freshness on its own; the reviewed gateway must reject stale signatures and incomplete/limit-exhausted scans. No EICAR-only runtime implementation is introduced.

API references (protocol, not claims of live execution):
- https://cloud.google.com/storage/docs/json_api/v1/objects/insert
- https://cloud.google.com/storage/docs/json_api/v1/objects/get
- https://cloud.google.com/storage/docs/request-preconditions
- https://cloud.google.com/run/docs/securing/service-identity
- https://cloud.google.com/run/docs/authenticating/service-to-service

## Verification and preserved failures

All tests below are socket-free: real factories/client/storage/scanner code runs with ONLY external metadata/GCS/scanner transport doubled. Cloud transport doubles enforce multipart integrity, generation conditions and archived versions; this is NOT live GCS locking/IAM or genuine ClamAV acceptance. TCP connect/listen and UDP bind/send were prohibited by the preserved preload. DB variables were removed. No product server, browser, PostgreSQL or container was started here.

1. Initial native selection:28 tests passed. Expanded credential/reader/deadline/identity selection:45 passed.
2. Added caller-mutation conflict regression against the unfinished new adapter: **1fail/47pass**. A held conditional PUT failed412, and the implementation incorrectly returned a bystander report after the caller mutated the submitted placard command. Capturing the command before asynchronous work repairs it. Corrected final native selection:48 tests.
3. Initial wider selection: **91fail/153pass**. The inherited shell had `NODE_ENV=production`, so90 legacy tests lacked their explicit test-mode signing fixture; one assertion still expected the old S3-only unsupported-provider error. No network prohibition failure occurred. Preserved this log rather than claiming an earlier pass. Corrected the runner to explicit `NODE_ENV=test` (strict-env tests still set their own strict inputs) and updated ONLY that obsolete expected error to list both supported providers; no production guard was relaxed.
4. Final inspected selection: **12files/244tests PASS, zero skips**: native48 plus existing artifact durability/S3, proof client/closure, SR-PROOF-001 and SR-PLACARD-001 suites. Covers actual existing signed-download, publication repair, scanner and proof authorization regressions as well as native transport behavior.
5. Root and API TypeScript checks PASS; changed-source/new-test lint PASS. The first combined command reached its100s harness deadline after root TS passed, interrupting API checking; the preserved rerun and final API checks passed. This is harness interruption, not an API type defect.
6. Frozen/offline/ignore-scripts installation used a private initially absent node_modules; no symlinked/shared dependencies were modified. Lockfile before/after hashes equal. Only required local auth declarations were built.

Reproducible safe selection:

```bash
env -u DATABASE_URL -u API_DATABASE_URL -u TEST_DATABASE_URL -u PG_DATABASE_URL \
  NODE_ENV=test \
  NODE_OPTIONS=--require=/home/lupin/workspace/drts-fleet-platform/.local/audit-followthrough-20261003/no-network.cjs \
  pnpm exec vitest run \
  tests/unit/audit-gcp-artifact-providers-20261004/ \
  tests/unit/audit-artifact-durability-s3-20261003.test.ts \
  tests/unit/audit-artifact-durability-20261002.test.ts \
  tests/unit/audit-proof-client.test.ts tests/unit/audit-proof-closure.test.ts \
  tests/unit/system-remediation/sr-proof-001/ \
  tests/unit/system-remediation/sr-placard-001/ --maxWorkers=1 --no-cache
```

Machine evidence: `.local/audit-followthrough-20261003/gcp-native-{first-tests,expanded-tests,identity-before,final-scoped-tests,final-scoped-tests-corrected,final-root-ts,final-api-ts,final-lint}.log`, private-install/auth-build/lock snapshots and formatting logs. Interrupted first API check remains beside its successful retry.

## Acceptance status

Implementation and local checks are a handoff, NOT approval or deployment. Independent Codex review and genuine hosted CI must bind the same full candidate SHA; record merge and deployed source separately. Required keys: `native_generation_atomicity`, `proof_storage_and_scan_fail_closed`, `runtime_configuration_validation`, `same_sha_review_ci`.

Live completion still requires reviewed infrastructure and workflow hookup, immutable image digests, private bucket/versioning/ownership/IAM readback, scanner IAM-check enforcement and anonymous denial, actual supported-engine signatures/startup/freshness, clean/EICAR/engine-limit negatives, and actual application producer/read/scan acceptance on shared Cloud Run. No resource creation, live token, bucket read/write, paid runtime, real financial/PSTN/mail operation, or live acceptance is claimed by this document.
