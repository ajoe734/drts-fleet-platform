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

## Codex review round 1: REJECTED (candidate `4014dc407811537346c7fa51e0777c91d94fff5a`, PR #2307)

Generation `bd147b762e914a15aac8ee9580ae55bd`. Codex reviewed the locked
candidate above without editing it and returned 9 findings (R1–R8 `P1`, R9
`P2`), reproduced verbatim below for traceability, then fixed in this same
generation on top of that SHA.

> R1 [P1] Scan-limit exhaustion can become clean. `clamd.conf:23-27` sets
> `MaxFileSize`/`MaxScanSize`/`MaxRecursion` without `AlertExceedsMax`
> (default no); an allowed request exceeding those bounds can be
> skipped/partially scanned while clamd still returns OK.
>
> R2 [P1] `provision-dev-artifact-backends.py:101-107` passes `--versioning`
> to `gcloud storage buckets create`, which does not support it; the
> `update` branch (116-122) never asserts versioning either, so new buckets
> fail CLI parsing and existing buckets never get versioning enabled.
>
> R3 [P1] `Dockerfile.gateway:11-14` installs `typescript@5.7.3` but never
> `@types/node`, even though the gateway sources import `node:http`/`net`/
> `fs`/`crypto` and use `Buffer`/`process`; an isolated compiler probe
> reproduced TS2307/TS2580 failures.
>
> R4 [P1] `provision-dev-artifact-backends.py:171-178` deploys the gateway
> and clamd containers with no shared volume/mount; the readiness marker
> `clamd-entrypoint.sh` writes in its own container filesystem is never
> visible to `server.ts`'s own filesystem check, so `/health` stays 503
> even once the sidecar is ready.
>
> R5 [P1] `provision-dev-artifact-backends.py:167` only ever supplies
> `--no-allow-unauthenticated`; it never re-enables invoker IAM checks or
> reconciles the existing IAM policy, so a service previously deployed with
> invoker checks disabled (or with a stray `allUsers`/other grant) stays
> publicly invocable after re-provisioning.
>
> R6 [P1] `Dockerfile.clamd:11` pins `clamav/clamav:1.3`, which the official
> EOL matrix lists as EOL (database-download support ended 2026-02-07).
>
> R7 [P1] `provision-dev-artifact-backends.py:177-178` supplies no
> `--memory` for the clamd container, leaving a fresh deploy at the Cloud
> Run 512MiB default; ClamAV documents >1.2GiB just to load its engine.
>
> R8 [P1] `clamd-entrypoint.sh:19` runs `freshclam` exactly once; there is
> no periodic refresh or signature-age expiry, and `handler.ts:131-149`
> never calls `isReady` before a scan (only `/health` does), so a
> long-lived instance can keep returning `clean` against stale definitions.
>
> R9 [P2] `provision-dev-artifact-backends.py:93-98` treats any bucket the
> WIF identity can describe as reusable; `--project` scopes billing for the
> request, not ownership of a globally-named `gs://` bucket, so a wrong
> accessible bucket could receive the API data grant.

### Fix evidence (this generation, same candidate lineage)

| Finding | Source change | Old → new behavior | Command / evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| R1 | `clamd.conf`: added `AlertExceedsMax yes`; `clamd-protocol.test.ts` added a case for the literal `Heuristics.Limits.Exceeded FOUND` reply | Old: limit-exceeded config left `AlertExceedsMax` at its "no" default (silently skips to OK). New: `AlertExceedsMax yes` turns an exceeded limit into a definitive `FOUND`, which `parseInstreamReply` already treats as fail-closed `infected`, never a fabricated clean | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004` — PASS, new case included in the 45/45 total below | No real ClamAV engine was run to observe an actual oversized/compressed-content exceedance; this is a config + parser-contract regression, not a hosted engine test (still required per the brief's deferred `live_backend_positive_negative_evidence`) |
| R2 | `provision-dev-artifact-backends.py`: `--versioning` moved from `buckets create` (unsupported there) to `buckets update` (both new and existing buckets), plus a `buckets describe --format=value(versioning_enabled)` readback that fails closed if not `true` | Old: `buckets create --versioning` would fail CLI parsing; existing buckets never got versioning. New: create has no `--versioning`; update always asserts it; a readback verifies it stuck | `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS (`test_success_creates_missing_bucket_updates_existing_deploys_and_grants_invoker`, `test_versioning_not_confirmed_fails_closed`) | No real `gcloud` call was made (mocked subprocess boundary only, per this task's VM/GCP-access restriction); readback is proven against mocked stdout, not a live bucket |
| R3 | `Dockerfile.gateway`: build stage now installs `@types/node@22.10.2` alongside `typescript@5.7.3` and passes `tsc --types node` | Old: isolated compiler probe failed TS2307/TS2580 (missing `node:*` module/global types). New: same probe passes | Isolated probe re-run with only `typescript` + a real `npm`-resolved `@types/node` (including its `undici-types` transitive dependency) on the build-context file set: `tsc --strict --target es2022 --module commonjs --moduleResolution node --types node --noEmit <gateway/*.ts>` — exit 0 | This VM does not run `docker build`; the probe emulates the Dockerfile's exact `npm install` package set and compiler flags but is not the real multi-stage image build (same limitation the prior candidate already declared for digest resolution) |
| R4 | `provision-dev-artifact-backends.py`: added `--add-volume name=clamav-ready,type=in-memory,size-limit=1Mi` plus `--add-volume-mount volume=clamav-ready,mount-path=/var/run/clamav-ready` on both the `gateway` and `clamd` containers | Old: no volume flags were ever passed; the two containers' filesystems were fully isolated. New: one in-memory volume is declared once and mounted at the same path in both containers, so the marker clamd writes is visible to the gateway's `existsSync` check | `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS (`test_success_creates_missing_bucket_updates_existing_deploys_and_grants_invoker` asserts exactly one `--add-volume` and two matching `--add-volume-mount` entries) | No real Cloud Run multi-container deploy was started; the in-memory volume's "shared within one instance, not across instances" semantics are taken from `gcloud run deploy --help`'s documented flag description, not an observed live mount. Hosted positive cold-start evidence remains the deferred acceptance item |
| R5 | `provision-dev-artifact-backends.py`: added `--invoker-iam-check` to the deploy call, and a new `reconcile_invoker_policy()` that reads the existing IAM policy (`get-iam-policy`) and removes (`remove-iam-policy-binding`) any `roles/run.invoker` member not in `--invoker-member`, before granting the desired members | Old: only `--no-allow-unauthenticated` was passed (ingress only); invoker-IAM-check state and any stray existing grant (including public ones) were left untouched across re-provisioning. New: the check is explicitly re-enabled every run, and every grant outside the desired list — public or not — is removed first | `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS (`test_reconcile_removes_stray_invoker_members_before_granting_desired` proves `allUsers` and an old service account are both removed while the desired member is granted, not removed) | Mocked subprocess boundary only; the real Cloud Run IAM API's exact JSON policy shape was not exercised live, only the SDK's own documented `get-iam-policy --format=json` / `remove-iam-policy-binding` contract |
| R6 | `Dockerfile.clamd`: base image bumped `clamav/clamav:1.3` → `clamav/clamav:1.4` with a comment requiring the hosted pipeline to re-check the EOL matrix before accepting the resolved digest | Old: pinned to an EOL line whose database-download support had already ended. New: pinned to the current supported LTS line as of this fix | Source/comment change only; `git diff --check HEAD^ HEAD` — PASS | This VM has no network access to re-fetch `docs.clamav.net/faq/faq-eol.html` live; the hosted build pipeline must reconfirm the exact current supported patch tag before resolving/accepting a digest, exactly as this file already requires for the digest itself |
| R7 | `provision-dev-artifact-backends.py`: added `--memory 512Mi` on the `gateway` container and `--memory 4Gi` on the `clamd` container | Old: no `--memory` flag; a fresh deploy defaulted to Cloud Run's 512MiB total, well under ClamAV's documented >1.2GiB engine-load floor. New: clamd gets an explicit 4GiB bound matching ClamAV's documented 3-4GiB recommendation | `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS (asserts exactly `{"512Mi", "4Gi"}` across the two `--memory` occurrences) | No live Cloud Run deploy or signature-load memory profiling was performed; this is the documented static floor, not an observed runtime measurement |
| R8 | `clamd-entrypoint.sh`: added a bounded `freshclam` refresh loop that only bumps the readiness marker's mtime on success (and removes it on failure); new `gateway/readiness.ts#isMarkerFresh` pure age check wired into `server.ts`'s `isReady`; `handler.ts` now calls `config.isReady()` before every scan, not only at `/health` | Old: `freshclam` ran exactly once at startup; `isReady` only checked marker existence + a live ping, and `/scan` never called it at all. New: a stale or failed-refresh marker (age > `MAX_SIGNATURE_AGE_MS`, default 6h) fails `isReady`, and every `/scan` request is gated on it, not only `/health` | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004` — PASS: `readiness.test.ts` (4 cases: fresh, exact boundary, stale, far-past) and `handler.test.ts`'s new "rejects a scan without ever contacting clamd when isReady resolves false" case (asserts `exchange` is never called) | The shell-side periodic refresh loop itself is exercised only by the hosted build/deploy pipeline per this file's existing header note, not by local unit tests — this VM runs no containers. Only the pure `isMarkerFresh` age-gating logic and the handler's pre-scan gate are unit-tested offline |
| R9 | `provision-dev-artifact-backends.py`: `ensure_private_bucket` now resolves the target project's `projectNumber` once (`gcloud projects describe`) and, on an existing bucket, compares both `project_number` and `location` from `buckets describe --format=json(...)` before any update/IAM call, raising before mutation on a mismatch | Old: `--project` was assumed to prove ownership of a globally-named bucket; any bucket the identity could merely describe was silently reused and mutated. New: a location or project-number mismatch raises `ProvisioningError` before `buckets update` or `add-iam-policy-binding` is ever called | `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS (`test_existing_bucket_location_mismatch_rejected_before_any_mutation`, `test_existing_bucket_project_mismatch_rejected_before_any_mutation`, both assert zero `update`/`add-iam-policy-binding` calls) | Mocked subprocess boundary only; GCS's real `projectNumber` field semantics were confirmed by reading the installed `gcloud` SDK's `storage_v1_messages.Bucket` definition and `GcsBucketResource`'s `project_number`/`location`/`versioning_enabled` attributes (SDK snap `503`), not by describing a live bucket |

### Updated offline verification (supersedes the counts above for this generation)

- `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004`:
  **5 files, 45 tests pass**, exit 0 (was 4 files/39 tests — adds
  `readiness.test.ts` and the R1/R8 cases above).
- `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v`:
  **32 tests pass**, exit 0 (was 28 — adds the R2/R5/R9 provisioning-helper
  regressions above).
- `git diff --check HEAD^ HEAD`: PASS, exit 0.
- Isolated gateway compiler probe (R3): exit 0 (was exit 2) against the
  build stage's exact `typescript` + `@types/node` package set, described
  above.
- `node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit`:
  same pre-existing, unrelated 26 errors as before this change, all in
  `tests/unit/fleet-partner-list-envelope.test.ts` and
  `tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`
  from a cross-worktree `packages/api-client` type-identity collision
  against the sibling `claude2-audit-artifact-durability-20261002`
  worktree path; zero errors reference `operations/artifact-scanner/` or
  any file touched by this task. Out of `write_scopes` and pre-existing;
  not introduced or fixed by this change.

### Still deferred, unchanged from before this round

Per the task brief's split-ownership note, these remain explicitly out of
scope and are not claimed as passed: `deploy-dev.yml` workflow hookup, a
real `docker build`/pinned image digest, and
`live_backend_positive_negative_evidence` (genuine clean/EICAR/engine-
failure/no-public-exposure checks against an actually deployed Cloud Run
service). `same_sha_review_ci`'s live-acceptance component is likewise
still open pending a hosted run of whichever candidate SHA this generation
is handed off at. No service, container, browser, GCP resource, or live
`gcloud`/Docker command was run by this fix round; every provisioning-
helper assertion above is against a mocked `subprocess.run` boundary.
