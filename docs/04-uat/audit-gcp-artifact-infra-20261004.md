# GCP artifact infrastructure: scanner gateway, images and provisioning helper

Task: `AUDIT-GCP-ARTIFACT-INFRA-20261004` — Claude2 / reviewer Codex. Split from
`AUDIT-GCP-ARTIFACT-PROVIDERS-20261004` (Pi / Codex, the API-side GCS/scanner
clients) per `.local/project-fixes-20261002/GCP-PROVIDERS-20261004.md`; this
task owns only the infrastructure side: the private scanner backend
image/config, the reviewed provisioning helper, and the provider resolver's
gcs/cloud-run-clamd configuration surface. It does not edit any `apps/api`
file, and it does not touch `.github/workflows/deploy-dev.yml` — see
"Explicitly out of scope this round" below.

## What this adds

- `operations/artifact-scanner/gateway/{clamd-protocol,validate,clamd-transport,handler,server}.ts`:
  a standalone, zero-npm-dependency Node gateway implementing the first-party
  contract in GCP-PROVIDERS-20261004.md §"FIRST-PARTY gateway contract":
  `POST /scan` takes exact proof bytes with an allowed `Content-Type` and a
  matching `X-Content-SHA256` header, forwards them to a sidecar clamd over
  loopback TCP using clamd's documented INSTREAM protocol (byte-identical
  framing/reply-parsing to the existing
  `apps/api/src/modules/billing-settlement/clamd-remittance-proof-scanner.adapter.ts`,
  duplicated rather than imported because `operations/` sits outside
  `pnpm-workspace.yaml`), and returns `{sha256, sizeBytes, verdict}` **only**
  after a real, definitive clamd reply. Every other condition — bad input,
  transport failure, an indeterminate reply such as a size-limit `ERROR` —
  is an error response, never a fabricated `clean`. `GET /health` reports
  readiness from a shared marker file plus a live `zPING\0` to the sidecar;
  it never claims scan success.
- `operations/artifact-scanner/{Dockerfile.gateway,Dockerfile.clamd,clamd.conf,clamd-entrypoint.sh}`:
  the gateway image (multi-stage: `tsc` at build time, zero runtime
  dependencies) and the ClamAV sidecar image (official `clamav/clamav` base,
  genuine `freshclam` signature fetch before `clamd` starts, loopback-only
  `TCPAddr 127.0.0.1`, bounded `StreamMaxLength`/`MaxFileSize`/`MaxScanSize`
  matching the gateway's 10 MiB bound, readiness marker written only after a
  live ping succeeds).
- `operations/deployment/provision-dev-artifact-backends.py`: idempotent,
  reviewed provisioning helper. Creates/updates the two private buckets
  (uniform bucket-level access, public access prevention, versioning,
  re-asserted on every run), grants `roles/storage.objectAdmin` to the API
  runtime SA at bucket scope only, deploys the two-container Cloud Run
  scanner service with `--no-allow-unauthenticated`,
  `--min-instances 0 --max-instances 1 --concurrency 1`, and grants
  `roles/run.invoker` only to explicitly listed service accounts (rejects
  `allUsers`/`allAuthenticatedUsers` and any non-digest image reference
  before making any gcloud call). Never touches a secret. Never grants a
  project-level role.
- `operations/deployment/resolve-dev-artifact-providers.py`: extended with
  `gcs` (alongside existing `s3`/`unprovisioned`) for both storage
  namespaces, and `cloud-run-clamd` (alongside existing `clamd`) for the
  scanner. Both new branches validate and reject before publishing anything,
  exactly like the existing `s3`/`clamd` branches; see the updated operator
  contract below. This file and `tools/ci/test_dev_artifact_providers.py`
  are shared write scope with `AUDIT-DEV-PROVIDER-CONFIG-20261003`'s prior
  work — the existing `s3`/`clamd` behavior and the workflow-wiring
  assertions are unchanged.
- `tests/unit/audit-gcp-artifact-infra-20261004/`: pure, socket-free vitest
  coverage for the gateway (protocol framing/parsing, MIME/hash validation,
  the clamd transport with an injected fake connector, and the full request
  handler with fake req/res objects). `tools/ci/test_dev_artifact_providers.py`
  gained resolver tests for `gcs`/`cloud-run-clamd` and a full
  `DevArtifactBackendsProvisioningTest` class that mocks every
  `subprocess.run` call — no real gcloud, bucket, IAM binding or Cloud Run
  service is ever touched by the test suite.

## Operator configuration contract (additions)

For each prefix `REMITTANCE_PROOF` and `DOCUMENT_ARTIFACT`:

| GitHub variable | Meaning |
| --- | --- |
| `DEV_<PREFIX>_STORAGE_PROVIDER` | now `s3`, `gcs`, or `unprovisioned` (default). |
| `DEV_<PREFIX>_GCS_BUCKET` | Required private bucket when `gcs` is selected. No region/endpoint/credential fields: auth is the ambient Cloud Run metadata identity. |

Scanner:

- `DEV_REMITTANCE_PROOF_SCANNER_PROVIDER`: now `clamd`, `cloud-run-clamd`, or
  default `unprovisioned`.
- `DEV_REMITTANCE_PROOF_SCANNER_URL`: required for `cloud-run-clamd`. Must be
  an exact `https` root origin — no userinfo, query, fragment, path or
  internal whitespace. Either `s3` or `gcs` proof storage must also be
  configured.
- `DEV_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS`: integer 100–60000, default
  60000.

This resolver change alone does not deploy anything, grant IAM, or call a
provider — same boundary as the existing `s3`/`clamd` branches.

## Explicitly out of scope this round

Per GCP-PROVIDERS-20261004.md's split-ownership note, this candidate
deliberately stops at isolated helpers:

- **`deploy-dev.yml` is not touched.** Wiring
  `provision-dev-artifact-backends.py` and the resolver's new output
  suffixes into the deploy pipeline is a separate, explicitly scoped
  follow-up — the deploy workflow currently overlaps
  `SR-LIVE-MAP-C114-COVERAGE-20260930`'s acceptance window (already merged
  at `3b0b0e7f3`), and the brief asks to request exact hookup scope only
  after the isolated pieces are reviewed.
- **No live resource was provisioned.** `provision-dev-artifact-backends.py`
  was never executed against a real project: local `gcloud` credential
  refresh fails with "Reauthentication failed: cannot prompt during
  non-interactive execution" (confirmed again on 2026-10-04; this is a
  session-auth limitation, not a permissions denial, and is not license to
  select or fall back to a different identity). Real provisioning requires
  the already-authorized GitHub Actions WIF deploy rail, which this task
  cannot invoke directly.
- **No pinned image digest was produced.** `Dockerfile.gateway` and
  `Dockerfile.clamd` name a build recipe and a mutable base tag
  respectively; resolving either to a `name@sha256:<digest>` reference (and
  then exercising `provision-dev-artifact-backends.py`'s refusal of anything
  else) requires a real `docker build`/`buildx imagetools inspect`, which
  this VM does not run (no product servers, browsers or container
  infrastructure here — see the guardrail in the task brief).
- **No live backend positive/negative evidence exists yet.** The
  `live_backend_positive_negative_evidence` acceptance item — a genuine
  clean file, a genuine EICAR rejection, an engine-failure case, and a
  no-public-exposure check against the actual deployed Cloud Run service —
  requires a running sidecar with real signatures and a real Cloud Run IAM
  boundary. Per GCP-PROVIDERS-20261004.md: "actual engine/listener/E2E
  checks are hosted only." This cannot be produced locally; it is a
  follow-up once the workflow-hookup scope above is granted and the hosted
  pipeline actually deploys this candidate.

Reviewer: `private_resources_and_bounded_runtime` and
`immutable_authenticated_provisioning` are reviewable now from the source
(bucket/IAM/Cloud Run flags, digest-only image acceptance, upfront
validation before any side effect). `live_backend_positive_negative_evidence`
and `same_sha_review_ci`'s live-acceptance component remain open pending the
hookup-scope decision and a hosted run of this exact candidate SHA — they
are not claimed as passed here.

## Offline verification

`node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004`:
**4 files, 39 tests pass** — clamd INSTREAM framing/parsing (chunk
boundaries, empty/oversized rejection, OK/FOUND/indeterminate replies), MIME
allowlist/sha256 validation, the clamd transport (OK, error, early close,
oversized reply, trailing-data, timeout, synchronous connect failure, and
the zPING ready check) against an injected fake socket, and the full
`/scan`/`/health` request handler against fake req/res objects (unsupported
MIME, bad/missing hash header, empty body, 10 MiB cutoff with connection
`destroy()`, hash mismatch, clean/infected verdicts, engine-unavailable and
indeterminate-reply never producing a verdict). No real socket, container,
browser or cloud call is opened by this suite.

`node tools/ci/check-repo-classification.mjs`: **5872** repository files
classified, including the new `operations/artifact-scanner/` tree (rule
`product-operations`, `^operations/`); `tests/` and `docs/04-uat/` paths are
covered by the existing `cross-system-tests`/`documentation-trees` rules
once committed. Docker COPY-boundary check passes for both new Dockerfiles.

`python3 tools/ci/check_test_coverage.py`: **83** tracked Python test files
yield tests wired into CI.

`PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v`:
**28 tests pass** — the prior 16 `s3`/`clamd` resolver regressions
unchanged, 6 new resolver tests for `gcs`/`cloud-run-clamd` (including exact
HTTPS-root-origin rejection and "requires configured proof storage" for
both storage kinds), and 7 new provisioning-helper tests covering digest-tag
rejection, invalid name rejection, the create-vs-update idempotency branch,
the exact `gcloud`/deploy argv for both the bucket IAM grant and the
multi-container deploy, fail-fast ordering (a bucket-create failure never
reaches IAM/deploy; a deploy failure never reaches invoker grants), and that
no call ever references Secret Manager.

`node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit`: no
errors in `operations/artifact-scanner/` or
`tests/unit/audit-gcp-artifact-infra-20261004/` (these files are pulled into
the program via the test imports; `operations/` itself is outside the root
tsconfig's `include` glob and outside `pnpm-workspace.yaml`, matching every
other `operations/` script in this repo).

Independent review and hosted CI must bind the final candidate SHA recorded
in the handoff; these owner results are not approval, deployment or live
acceptance.
