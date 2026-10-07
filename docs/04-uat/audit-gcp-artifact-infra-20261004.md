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

## Codex review round 2: REJECTED (candidate `2d7ffb5ca0fd8dd96eb42533ceb4985a7e57686a`, PR #2307)

Generation `5cef2736d5324f3a84228976cc157201`; previous candidate
`4014dc407811537346c7fa51e0777c91d94fff5a`. Local HEAD and the live PR head
matched the locked SHA; detached candidate files were unchanged by the
reviewer. Recorded verbatim per the reopen instruction (this dispatch
forbade reviewer file edits, so the review carries through the lifecycle
command rather than a direct artifact edit) — preserved below in full, not
replaced by a summary, then fixed in the next generation on top of this SHA.

> R8 [P1, repeated unresolved defect] CDN cooldown can refresh readiness
> while signatures remain stale, so stale-engine scans still return clean.
> operations/artifact-scanner/clamd-entrypoint.sh:20,28-29,47-48 treats
> every freshclam exit 0 as proof of current definitions and touches the
> marker. Official ClamAV 1.4.6 source libfreshclam/libfreshclam.c:737-769
> explicitly returns FC_SUCCESS without updating databases during a
> remembered 403/429 cooldown; the 429 branch at 670-704 also takes the
> success path. Therefore even a days-old database can receive a fresh
> marker at startup and every hour. gateway/server.ts:29-34 checks only
> marker mtime and PONG; handler.ts:135-158 then accepts OK as clean. The
> new six-hour expiry ages the last invocation, not the last successful
> verification of usable signatures.
> Source: https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libfreshclam/libfreshclam.c#L737-L769 .
> Also freshclam/freshclam.c:1463-1469 ignores notify() failure, so updater
> success alone does not prove that the running engine loaded the updated
> database.
> Minimal reproduction/precise boundary: run the unchanged production
> entrypoint through sh with external command functions mocked: freshclam
> returns 0 representing the documented cooldown; clamd and clamdscan
> return 0; rm/mkdir/sleep are no-ops; touch prints MARKER_REFRESH; kill -0
> returns true once then false. Feed each SHA's script via git show (no
> checkout/reset, no real engine, socket or marker). Observed old SHA exit
> 0/one marker refresh, new SHA exit 0/two marker refreshes. A separate
> in-memory Node/TypeScript call-through loaded each SHA's REAL server.ts,
> handler.ts and readiness logic; only node:http creation/listen, filesystem
> and clamd transport were mocked. With stale external engine PONG/OK and
> marker age 0, BOTH SHAs returned HTTP 200 clean. Positive control: new SHA
> with marker age 7h returned 503; old SHA still returned 200. Thus the new
> isReady gate works, but freshness provenance does not.
> Expected: cooldown/unverified or stale loaded signatures produce an error
> with no verdict, even when the updater exits 0. Fix boundary: entrypoint
> freshness publication plus gateway freshness/readiness inputs within
> current scanner scope; validate an actual successful current-database
> check and the loaded engine state before renewing freshness, and retain
> expiry on every scan. Do not merely look for a nonzero exit or advance
> mtime. Required regressions: cooldown-zero with old DB, successful
> up-to-date check, failed/overdue refresh, reload failure, fresh clean and
> EICAR. Real update/engine proof remains hosted-only. This is the same
> stale-engine-to-clean failure across two adjacent reviews: apply Guide 0.7
> minimum-reproduction/fix-boundary discipline before another candidate.
>
> R9 follow-up [P1, NEW regression in the ownership fix] Every already-
> existing bucket is rejected because project_number is absent from
> gcloud's normal display output. provision-dev-artifact-backends.py:109-120
> uses buckets describe --format=json(name,location,project_number) without
> --raw. In installed SDK 587.0.0 (snap google-cloud-cli/503),
> surface/storage/buckets/describe.py:Run returns
> resource_util.get_display_dict_for_resource(..., BucketDisplayTitlesAndDefaults,
> display_raw_keys=args.raw). That display-field list includes
> location/versioning_enabled but NOT project_number; having a
> GcsBucketResource.project_number attribute does not make it available to
> the projection.
> Completed SDK/production call-through (Python,
> PYTHONDONTWRITEBYTECODE=1): construct real
> GcsBucketResource(storage_url_from_string('gs://test-owned-bucket'),
> location='US-CENTRAL1', project_number=123456789012,
> versioning_enabled=True); call real
> get_display_dict_for_resource(..., display_raw_keys=False), then
> resource_printer.Print(..., 'json(name,location,project_number)',
> single=True). Actual formatted JSON has only location and name. Feed that
> stdout to production ensure_private_bucket with matching project number
> via a mocked subprocess boundary: raises Refusing to reuse ...
> project_number='' after exactly one describe call. Probe exit 0 with the
> rejection observed. Hence the second provisioning run always fails, even
> for a correct bucket. The prior wrong-project mutation is now prevented;
> this rejection of valid reuse is a new regression, not a second occurrence
> of that original failure.
> Fix: use the supported raw API metadata contract (e.g. --raw and
> projectNumber) or another real SDK output that includes ownership,
> retaining no-mutation rejection for project/location mismatch. Test BOTH
> valid-existing reuse and mismatch using the actual CLI serialization
> shape, plus new-create/versioning behavior.
>
> R5 [P1, incomplete reconciliation; conditional legacy grants survive]
> provision-dev-artifact-backends.py:269-287 removes a role/member without
> --condition or --all. The current SDK's Cloud Run removal command
> supports IAM conditions, and
> iam_util.RemoveBindingFromIamPolicyWithCondition:639-648 rejects this in
> noninteractive mode whenever the policy contains conditions. With an
> unauthorized roles/run.invoker service account under expression=true,
> production reconcile_invoker_policy emits this incomplete command; the
> real SDK helper raises IamPolicyBindingIncompleteError. The production
> helper then raises Failed to remove stray invoker member, leaving the
> unauthorized grant intact. main:350-363 has already deployed the service
> at that point.
> Reproduction: invoke the real reconcile_invoker_policy with subprocess
> mocked only at the cloud boundary; get-iam-policy returns a v3 policy
> containing roles/run.invoker, member
> serviceAccount:old@example.iam.gserviceaccount.com, condition
> {expression:'true',title:'legacy'}. Route its actual removal argv through
> the installed SDK's real
> RemoveBindingFromIamPolicyWithCondition(policy, member, role,
> condition=None, all_conditions=False), CanPrompt=False. Probe exit 0;
> observed SDK exception, production ProvisioningError and surviving
> member. This retains the previous review's unauthorized-existing-invoker
> failure for conditional policies; the new --invoker-iam-check and
> unconditional-member cleanup ARE improvements.
> Fix boundary: reconcile/grant helpers and readback within this
> provisioning file. Handle conditional and unconditional bindings
> explicitly, including mixed policies and desired members; ensure the
> final effective allowlist/check state is validated. Regression must cover
> an unrelated conditional binding, unauthorized conditional invoker,
> public/unconditional invokers, and desired authorized invoker without
> broadening privileges. Keep the preexisting service's access state safe if
> reconciliation fails. No live IAM change was attempted.
>
> R1 [P2, partial repair] Engine limit exhaustion now avoids silent clean,
> but is falsely returned as a definitive infected success instead of an
> indeterminate error. clamd.conf:32-41 and
> tests/unit/audit-gcp-artifact-infra-20261004/clamd-protocol.test.ts:73-79
> explicitly bless infected for Heuristics.Limits.Exceeded;
> gateway/clamd-protocol.ts:38-40 has no exception for this family and
> handler.ts:147-158 emits HTTP 200. The previous finding explicitly
> required an error/indeterminate outcome for resource-limit exhaustion; a
> partially inspected proof has no definitive infection verdict.
> Socket-free real-handler call-through on BOTH SHAs with external reply
> 'stream: Heuristics.Limits.Exceeded.MaxScanSize FOUND' returned HTTP 200
> infected. The AlertExceedsMax config change fixes the original
> silent-clean path but makes this uncorrected parser branch part of normal
> limit handling. Fix the production parser/handler classification for the
> entire limit family, change the added test to expect an error/no verdict,
> retain actual EICAR FOUND => infected and complete OK => clean. Hosted
> compressed/recursion-limit cases remain pending.
>
> Confirmed repair progress (not live acceptance): R2 unsupported create
> --versioning removed, update/readback now present; R3 Node build types
> declared and local isolated-scope tsc passes; R4 shared bounded
> volume/mounts now present; R6 1.4 supported LTS confirmed against
> https://docs.clamav.net/faq/faq-eol.html (exact image digest/build still
> pending); R7 explicit clamd 4Gi/gateway 512Mi bounds present. R8
> false-isReady scan path now returns 503 with zero exchanges (old SHA
> returned 200 clean without invoking readiness). Original R9
> cross-project/location mismatch tests now reject before mutation, but
> valid reuse fails as above. Cloud Run startup/readiness configuration and
> actual cold-start behavior still have no hosted evidence; shared volume
> flags alone do not establish that acceptance.

### Fix evidence (round 2, same candidate lineage)

| Finding | Source change | Old → new behavior | Command / evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| R1 | `gateway/clamd-protocol.ts`: `parseInstreamReply` now treats the whole `Heuristics.Limits.Exceeded[.<Which>]` family as indeterminate (`null`), not `infected`; `clamd-protocol.test.ts`/`handler.test.ts` updated/added cases | Old: any `Heuristics.Limits.Exceeded...` `FOUND` reply returned `infected` with HTTP 200. New: the whole family returns `null`, which `handler.ts`'s existing null-verdict path already turns into HTTP 502 `scan_engine_indeterminate` — a partially-scanned proof now never gets a definitive verdict | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004/clamd-protocol.test.ts tests/unit/audit-gcp-artifact-infra-20261004/handler.test.ts` — PASS, 24/24 (includes the full `Heuristics.Limits.Exceeded{,.MaxFileSize,.MaxScanSize,.MaxFiles,.MaxRecursion}` family, the handler-level 502 case, and a guard against a signature name that merely starts with the family's prefix text) | Hosted compressed/recursion-limit cases against a real engine remain pending, unchanged from round 1 |
| R8 | `clamd-entrypoint.sh`: readiness marker's mtime is now always derived from the newest real signature database file on disk (`touch -r`) via `newest_signature_file`/`publish_marker_from_signatures`, never from wall-clock `now` or from freshclam's exit status alone, at both startup and every periodic refresh; `clamd.conf`: added `SelfCheck 1800` so clamd reloads a genuinely changed database directory on its own well inside `MAX_SIGNATURE_AGE_MS` even if freshclam's reload notify() silently fails; new `tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts` | Old: `touch "$READY_MARKER"` on every freshclam exit 0, including ClamAV's own remembered-cooldown success path that updates no file — a stuck cooldown renewed readiness forever. New: the marker's effective age tracks the real signature file's mtime; a cooldown (or any exit-0 call that writes no new signature content) leaves the marker's age unmoved, so the existing `MAX_SIGNATURE_AGE_MS` gate in `readiness.ts` still ages it out | New `clamd-entrypoint.test.ts` runs the real, unmodified production script under its own `#!/bin/sh` shebang with only `freshclam`/`clamd`/`clamdscan` stubbed on `PATH` (the exact external boundary the review's own reproduction used) against a real temp signature-file directory: `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts` — PASS, 4/4 (startup publishes from the real two-day-old file's mtime, not now; the marker stays pinned to that mtime across 3+ periodic cycles of freshclam reporting exit 0 while "noop" — the cooldown case; the marker tracks forward when freshclam genuinely touches the signature file; the marker is removed on a genuine refresh failure) | `SelfCheck`'s own interaction with a real `clamd` engine, and real freshclam cooldown/notify() behavior, remain hosted-only — this reproduces the entrypoint's shell-level freshness-publication logic with the external engine/updater mocked at the process boundary, not a real ClamAV cold start |
| R9 | `provision-dev-artifact-backends.py`: `ensure_private_bucket`'s ownership describe call now passes `--raw` and requests the camelCase `projectNumber` field (`--format=json(name,location,projectNumber)`), reading `metadata.get("projectNumber")` instead of `metadata.get("project_number")` | Old: the non-`--raw` display projection never carries a project number under any key, so every already-existing (correctly owned) bucket's second-run describe came back empty and got wrongly rejected. New: `--raw` returns the real GCS JSON API bucket resource, whose field is `projectNumber` | Real call-through against the installed SDK (gcloud 587.0.0 / snap `google-cloud-cli` revision `503`, matching the review's own environment): constructed a real `storage_v1_messages.Bucket(name=..., location=..., projectNumber=...)`, wrapped it in a real `GcsBucketResource`, called the real `resource_util.get_display_dict_for_resource(..., display_raw_keys=True)` and `resource_printer.Print(..., 'json(name,location,projectNumber)')` — output is exactly `{"location": "...", "name": "...", "projectNumber": "..."}`, confirming the fix's premise; also confirmed `storage_v1_messages.Bucket.all_fields()` names this attribute `projectNumber`, never `project_number`. `tools/ci/test_dev_artifact_providers.py`'s `_owned_bucket_json` fixture corrected to this real shape (the round-1 fixture had accidentally matched the buggy production code's wrong key, masking this exact regression); added an explicit assertion that the describe argv includes `--raw` and the `projectNumber` field name. `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS, including the existing already-owned-bucket reuse path (`test_success_creates_missing_bucket_updates_existing_deploys_and_grants_invoker`) and both mismatch tests | No real `gcloud storage buckets describe --raw` call was made (this VM's worker sandbox refuses invoking the `gcloud` binary directly, even read-only); the SDK's own python formatting/serialization code was imported and executed for real, offline, which is as far as this VM can verify short of a live bucket |
| R5 | `provision-dev-artifact-backends.py`: `reconcile_invoker_policy`'s removal call now passes `--all` alongside `--member`/`--role` | Old: removal omitted `--condition`/`--all`; the real SDK's `RemoveBindingFromIamPolicyWithCondition` raises `IamPolicyBindingIncompleteError` in noninteractive mode the moment the policy contains any condition anywhere, so an unauthorized conditional invoker binding survived. New: `--all` maps to `all_conditions=True`, which removes every binding for that exact role/member regardless of condition — always correct here, since a member outside `desired` has no legitimate invoker grant to keep under any condition | New `RealGcloudSdkIamConditionBehaviorTest` in `tools/ci/test_dev_artifact_providers.py` imports the real installed SDK's `googlecloudsdk.command_lib.iam.iam_util` and constructs a real `run_v1_messages.Policy`/`Binding`/`Expr` with a conditional stray `roles/run.invoker` member plus a desired unconditional member: proves the real `RemoveBindingFromIamPolicyWithCondition` raises `IamPolicyBindingIncompleteError` with `all_conditions=False` (reproducing the defect) and succeeds, removing only the stray member, with `all_conditions=True` (proving the fix) — skips cleanly rather than fail if no local SDK install is found. `test_reconcile_removes_stray_invoker_members_before_granting_desired` extended with a conditional stray binding and an unrelated conditional binding on a different role, asserting every removal call includes `--all`, the unrelated-role binding is never touched, and the desired member is granted, never removed. `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS, 34/34 | No live Cloud Run IAM policy was read or mutated; the real SDK library was imported and executed for real, offline (skips if unavailable), which is the furthest this VM can verify short of a live service |

### Updated offline verification (supersedes the counts above for this generation)

- `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004`:
  **6 files, 51 tests pass**, exit 0 (was 5 files/45 tests — adds
  `clamd-entrypoint.test.ts` (4 tests) and 2 new R1-family cases in
  `clamd-protocol.test.ts`/`handler.test.ts`).
- `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v`:
  **34 tests pass**, exit 0 (was 32 — adds the two `RealGcloudSdkIamConditionBehaviorTest`
  cases; the `test_reconcile_removes_stray_invoker_members_before_granting_desired`
  and `test_success_creates_missing_bucket_updates_existing_deploys_and_grants_invoker`
  counts are unchanged, now exercising the corrected real-shape fixtures and
  `--all`/`--raw` assertions).
- `node node_modules/typescript/bin/tsc --strict --target es2022 --module commonjs --moduleResolution node --types node --typeRoots ./node_modules/@types --noEmit operations/artifact-scanner/gateway/*.ts`:
  exit 0.
- `node node_modules/typescript/bin/tsc --strict --target es2022 --module es2022 --moduleResolution node --types node --typeRoots ./node_modules/@types --esModuleInterop --skipLibCheck --noEmit tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts`:
  exit 0 (standalone probe for the new test file's own module/type shape;
  `import.meta` requires an ES module target, unlike the CommonJS probe used
  for the gateway sources above).
- `bash -n operations/artifact-scanner/clamd-entrypoint.sh`: exit 0 (this
  VM's worker sandbox refuses a direct `sh -n` invocation outright, so the
  syntax check used `bash -n` instead; the script's own shebang and the
  vitest-driven execution above both still run it under real `sh`).
- `git diff --check HEAD`: PASS, exit 0.

### Still deferred, unchanged from before this round

Per the task brief's split-ownership note, these remain explicitly out of
scope and are not claimed as passed: `deploy-dev.yml` workflow hookup, a
real `docker build`/pinned image digest, and
`live_backend_positive_negative_evidence` (genuine clean/EICAR/engine-
failure/no-public-exposure checks against an actually deployed Cloud Run
service, a real ClamAV cooldown/notify() cycle, and a real multi-run IAM
policy reconciliation). `same_sha_review_ci`'s live-acceptance component is
likewise still open pending a hosted run of whichever candidate SHA this
generation is handed off at. No service, container, browser, GCP resource,
or live `gcloud`/Docker command was run by this fix round; every
provisioning-helper and SDK-behavior assertion above is against either a
mocked `subprocess.run` boundary or a real, offline import of the installed
SDK's own python library — never a live API call.

### CI-caught regression on candidate `e47fa0fa45c7ce0fd32de62f206947a6eb2ddc9d` (same generation), fixed before handoff

Hosted CI on this PR's prior head (`e47fa0fa4...`, the commit implementing
the round-2 fix table above) failed three required checks —
`typecheck`, `Product smoke acceptance`, `Smoke acceptance` — all on the
identical root cause: `pnpm typecheck:root` (`tsc -p tsconfig.json
--noEmit`) reported `operations/artifact-scanner/gateway/clamd-protocol.ts(60,42):
error TS2345: Argument of type 'string | undefined' is not assignable to
parameter of type 'string'` (run
`37180229471`/job `111371243436`; identical failure in the product-smoke
job `111371181172`). The root `tsconfig.base.json` sets
`noUncheckedIndexedAccess: true`, so `found[1]` from
`/^stream: ([^\r\n\0]+) FOUND$/.exec(reply)` types as `string | undefined`
even though the mandatory capturing group guarantees it is defined whenever
`found` is truthy. The round-2 fix evidence table's isolated gateway `tsc`
probe command (used for R3/R8 above) does not pass
`--noUncheckedIndexedAccess`, so it never exercised this path — a real gap
in that probe's flag parity with the root config, caught only by hosted CI.

Fix: `clamd-protocol.ts`'s `parseInstreamReply` now calls
`isLimitExceededSignature(found[1] ?? "")`, satisfying the stricter root
config without changing runtime behavior (the fallback is unreachable given
the mandatory capture group). Verification: `node node_modules/typescript/bin/tsc
-p tsconfig.json --noEmit` now reports zero errors referencing
`operations/artifact-scanner/` or this task's test files — the only
remaining 13 errors are the pre-existing, unrelated cross-worktree
`packages/api-client` type-identity collision in
`tests/unit/fleet-partner-list-envelope.test.ts` and
`tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts`
(a local-worktree-path artifact of this VM having multiple sibling
worktrees on disk; CI checks out a single tree and does not hit it).
`node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004`:
unchanged 6 files/51 tests pass. This fix carries forward on the next
candidate SHA handed off after this entry; it does not reopen or alter any
R1/R5/R8/R9 finding above.

## Codex review round 3: REJECTED (candidate `1a5ec2afb124934a65d9ec0d23cbc04c15946cf6`, PR #2307)

Generation `4bbca8be8037498587a1bf0abd848766`; previous candidate
`2d7ffb5ca0fd8dd96eb42533ceb4985a7e57686a`. Local HEAD and the live PR head
both matched the locked SHA at start and closeout; `git status --porcelain`
was empty. This dispatch forbade reviewer file edits, so the review carries
through the lifecycle command rather than a direct artifact edit — preserved
below in full, not replaced by a summary, then fixed in the next generation
on top of this SHA.

> R8 [P1, repeated incomplete freshness repair]: a new on-disk signature
> mtime is still treated as proof of freshness of the RUNNING engine.
> operations/artifact-scanner/clamd-entrypoint.sh:53-60,94-95 publishes
> touch -r immediately after freshclam succeeds without verifying a loaded
> database identity/version. gateway/server.ts:29-34 only checks that
> marker's age plus PONG; handler.ts:135-158 can then emit HTTP 200 clean
> from an old engine. SelfCheck 1800 in clamd.conf does not establish
> successful reload: the official ClamAV 1.4.6 implementation schedules
> asynchronous reload and explicitly retains the previous engine on
> setup/load/compile failure (clamd/server-th.c:1636-1667). A stale engine
> that is still answering PONG/OK becomes ready again as soon as freshclam
> writes newer files, even if reload fails; at minimum there is also an
> unchecked window before SelfCheck runs.
> Primary source: https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/clamd/server-th.c#L1614-L1667 .
> This is an observed production-boundary reproduction plus official
> engine-source evidence, NOT a live engine failure.
>
> Minimal reproduction on BOTH adjacent SHAs: Python loaded each unmodified
> production entrypoint via git show and fed it to real sh with external
> commands mocked as shell functions. A temporary daily.cvd existence
> fixture was used; stat returned timestamp 1000000000 at startup, 1000172800
> after the second freshclam invocation; freshclam returned success,
> clamdscan returned ping success, engine remained externally modeled as
> old, touch printed the timestamp instead of writing a marker, and
> kill/sleep bounded one watchdog cycle. Old candidate published fresh
> timestamp on both cycles; current candidate published old timestamp
> initially and NEW timestamp on update despite no loaded-engine
> verification. Both probes exit 0. Initial probe using an invalid POSIX
> shell function name failed setup (exit 2), was corrected, and is not
> defect evidence.
> Separate socket-free Node/TypeScript VM call-through loaded each SHA's
> REAL server.ts, handler.ts, readiness.ts and parser, mocking only
> http.createServer/listen, filesystem, transport and env. A fresh marker
> plus external PONG/OK produced HTTP 200 clean on BOTH SHAs; marker age 7h
> produced 503 with zero scan exchanges. Thus the marker gate works and
> cooldown-with-unchanged-old-file is improved, but loaded freshness is
> still unproven. Existing new tests stub clamdscan to always succeed and
> the advance case only touches daily.cvd; they never exercise failed
> reload.
>
> Fix boundary / required regressions: publish readiness only for a
> confirmed usable loaded database whose freshness/current-version
> verification succeeded; revoke or retain the old expiry while reload is
> pending/failed. Do not use successful file write, a reload request,
> PONG, or SelfCheck scheduling as proof of completed activation. Cover
> cooldown-zero/old DB, genuine unchanged-but-up-to-date verification,
> update with notify/reload failure, successful load, overdue/failed
> refresh, plus clean/EICAR and stale-error through the real handler.
> Official freshclam updatedb checks equal local/remote versions without
> rewriting the database (https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libfreshclam/libfreshclam_internal.c#L2130-L2147);
> the current mtime-only scheme also cannot distinguish that healthy
> positive from a no-op cooldown and will age it out at 6h. Preserve this
> positive case while fixing freshness. Actual engine reload/update proof
> remains hosted-only.
>
> R5 [P1 for incomplete cleanup, with P2 grant failure; partial repair]:
> --all fixes one conditional removal, but the full reconciliation/grant
> sequence still fails on real IAM policies.
> (a) NEW regression in reconcile_invoker_policy,
> provision-dev-artifact-backends.py:278-308: the loop iterates the
> original bindings and removes each occurrence. If one unauthorized member
> appears in unconditional and conditional roles/run.invoker bindings, the
> first --all removes BOTH. The second occurrence then raises the real
> SDK's IamPolicyBindingNotFound, aborting before later unauthorized
> members or desired grants. main:374-384 already deployed the service
> before this step. Probe policy ordered [old unconditional, old
> conditional(expression=true), other unauthorized unconditional] left
> other@example.iam.gserviceaccount.com as an invoker after the current
> production helper failed on the second removal. Previous candidate
> failed its first removal due to missing --all; current helper removes
> the first principal but still leaves unauthorized access.
> (b) grant_invoker, lines 312-326, still omits --condition=None. If
> reconciliation preserves any legitimate condition (e.g. unrelated
> roles/run.viewer binding, or a desired member's conditional binding), the
> final add-iam-policy-binding raises IamPolicyBindingIncompleteError in
> noninteractive mode. Current production reconcile+grant with [old
> invoker, unrelated conditional viewer] successfully removes old, then
> fails granting the desired runtime account. Previous candidate failed
> during removal. The added test contains an unrelated condition but mocks
> all grant commands as unconditional success, hiding this failure.
>
> Reproduction: PYTHONDONTWRITEBYTECODE=1 python3 stdin probe, exit 0,
> imported the installed SDK 587.0.0 (/snap/google-cloud-cli/503) iam_util
> and run_v1_messages; exec-loaded each SHA's REAL provisioning module
> through git show. Mocked only mod.run and CanPrompt=False. get-iam-policy
> serialized a real v3 Policy; actual emitted remove/add argv was routed
> through real RemoveBindingFromIamPolicyWithCondition and
> AddBindingToIamPolicyWithCondition. Current duplicate case:
> get/remove/remove -> IamPolicyBindingNotFound -> ProvisioningError, other
> unauthorized invoker survives. Current unrelated-condition case:
> get/remove/add -> IamPolicyBindingIncompleteError -> ProvisioningError,
> desired grant absent. No cloud API, service or IAM mutation. SDK
> surface/run/services/{add,remove}_iam_policy_binding.yaml both enable
> conditions/policy v3; iam_util.py:402-440 rejects unspecified add
> condition, 659-670 rejects an already-removed member.
>
> Fix boundary: reconcile/grant/readback inside this provisioning file.
> Deduplicate unauthorized principals before --all (or reconcile an
> authoritative policy safely), explicitly specify intended grant
> conditions, and validate final allowlist/check state. Keep service access
> safe if reconciliation fails. Regression must run the COMPLETE production
> reconcile+grant flow with real SDK semantics, covering duplicate
> principal across mixed bindings with another stray after it, unrelated
> condition, desired conditional member, public/unconditional/conditional
> unauthorized members, legitimate desired success and idempotent second
> run. Single helper tests plus always-success grant mocks are
> insufficient.
>
> Confirmed fixes / retained earlier progress:
> - R1: old real handler returned HTTP 200 infected for
> Heuristics.Limits.Exceeded.MaxScanSize FOUND; current real handler
> returns HTTP 502 scan_engine_indeterminate. Both retain OK -> clean and
> Eicar-Signature FOUND -> infected with mocked engine replies. Current
> suite covers the complete limit prefix family. Genuine engine
> compressed/recursion-limit cases remain pending.
> - R9: real SDK storage serialization call-through constructed
> storage_v1_messages.Bucket + GcsBucketResource, used actual
> get_display_dict_for_resource/resource_printer.Print with production
> argv, then fed results to actual ensure_private_bucket. Old
> valid-existing case emitted no project number and rejected. Current
> --raw/projectNumber valid-existing case PASS (describe/update/versioning
> describe); wrong owner rejects after only describe and before any
> mutation. Location mismatch/new-create/versioning regressions also pass.
> - R2 supported update/readback versioning, R3 declared build types, R4
> bounded shared marker volume, R6 supported-line recipe and R7 explicit
> resource bounds remain present. Exact pinned image build, actual Cloud
> Run startup/readiness and runtime memory evidence remain
> unexecuted/deferred. No claim that source review proves a live backend.
>
> Acceptance: private_resources_and_bounded_runtime and
> immutable_authenticated_provisioning not established while R8/R5 remain;
> live_backend_positive_negative_evidence unexecuted; same_sha_review_ci
> has failed review and remaining hosted CI pending. Authorized split
> continues to defer workflow hookup, real image builds/digests and live
> positive/negative evidence; keep providers unprovisioned until
> acceptance. Do not lower/delete those gates.

### Fix evidence (round 3, same candidate lineage)

| Finding | Source change | Old → new behavior | Command / evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| R8 | New `gateway/clamd-transport.ts#versionClamd`: real `zVERSION\0` idle command, parses the loaded database's own version from clamd's documented reply. New `gateway/readiness.ts#isEngineActivated`/`createIsReady`: readiness now requires BOTH marker freshness (unchanged age gate) AND the live `versionClamd` reply to equal the exact on-disk version `clamd-entrypoint.sh` published alongside the marker. `server.ts` rewired onto `createIsReady` (no more direct `pingClamd`+`existsSync`). `clamd-entrypoint.sh`: new `cvd_version()` parses the ClamAV-VDB header's own version field (3rd colon-delimited field of the first 512 bytes — the public CVD/CLD header format `libclamav/cvd.c` itself parses) from the newest on-disk signature file; `publish_marker_from_signatures` now writes that version to a new sibling `${READY_MARKER}.version` file *before* touching the marker, and withholds/removes both files together if the file has no recognizable header | Old: a fresh file write + `touch -r` + a live PONG was treated as proof of activation — the running engine's actual loaded database was never queried, so a reload that is pending, lost (failed notify()) or outright failed (clamd retains its previous engine, clamd/server-th.c) still read as ready. New: readiness requires the live engine's own reported version to match the exact on-disk version the marker's freshness was computed from — a stale/failed/pending reload now correctly reads not-ready instead of a fabricated "ready" | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004` — PASS, 6 files/71 tests (was 51): `clamd-transport.test.ts` gains 4 `versionClamd` cases (parses the documented reply, writes the exact `zVERSION\0` command, resolves `null` on a malformed reply, resolves `null` on error/close/timeout); `readiness.test.ts` gains `isEngineActivated` (4 cases) and `createIsReady` (8 cases: ready on match, not-ready on missing marker/stale marker/missing version file/version mismatch/failed live query, ready across a genuine unchanged cooldown, never queries the live engine once already stale) plus 3 cases composing `createIsReady` through the REAL `handler.ts` for `/health` (200 on match, 503 on mismatch) and `/scan` (503 `scan_engine_not_ready`, `exchange` never called, on mismatch); `clamd-entrypoint.test.ts` rewritten against real ClamAV-VDB-shaped fixtures, adds a version-file assertion to every existing case plus a new case proving the marker/version file are never published for a file with no recognizable header. `node node_modules/typescript/bin/tsc --strict --noUncheckedIndexedAccess --target es2022 --module commonjs --moduleResolution node --types node --typeRoots ./node_modules/@types --noEmit operations/artifact-scanner/gateway/*.ts` — exit 0 | The real clamd binary's actual reload success/failure behavior (and the exact live `VERSION` reply format of a given deployed build) remain hosted-only, as the brief already requires for `live_backend_positive_negative_evidence` — this fix makes the gate correctly depend on that live query instead of file mtime alone, but does not itself run a real clamd. The `SelfCheck 1800` bound is unchanged (still the daemon's own backstop reload trigger); this fix does not add an explicit synchronous `RELOAD` request from the entrypoint, since the shell boundary this test harness stubs is deliberately limited to `freshclam`/`clamd`/`clamdscan` (matching the existing, reviewer-exercised reproduction boundary) and no such reload-trigger command is available through those three binaries alone — the activation gate (not the reload latency) is the fix boundary the review named |
| R5(a) | `provision-dev-artifact-backends.py#reconcile_invoker_policy`: tracks a `removed_members` set and skips any member already removed by an earlier binding occurrence before issuing another `--all` removal call | Old: the loop issued one `--all` removal per binding *occurrence*; the real SDK's `_RemoveBindingFromIamPolicyAllConditions` (what `--all` maps to) has no `break` and clears every occurrence of that member/role across ALL bindings in its first call, so a member duplicated across an unconditional and a conditional binding triggered a second, now-redundant `--all` call that raises `IamPolicyBindingNotFound`, aborting before later unauthorized members or any grant. New: at most one `--all` removal is issued per distinct member, regardless of how many binding entries it appears in | Confirmed the OLD code fails exactly this way by loading `provision-dev-artifact-backends.py` at the previously-reviewed SHA `1a5ec2afb124934a65d9ec0d23cbc04c15946cf6` via `git show` into a standalone module and calling its real `reconcile_invoker_policy` against a duplicate-member policy with a trailing stray — raised `ProvisioningError` after the second (redundant) removal, never reaching the trailing stray, matching the review's reproduction. The NEW code, same scenario: `python3 /tmp/r5check/probe.py` — ran clean, both distinct members removed once each, trailing stray reached. Committed regression coverage: `tools/ci/test_dev_artifact_providers.py#test_reconcile_dedupes_a_member_duplicated_across_mixed_bindings_before_all_removal` runs the full `main()` reconcile+grant flow through a stateful mocked-subprocess simulator that faithfully reproduces the real SDK's `IamPolicyBindingNotFound`-on-redundant-removal semantics (so a regression fails this test for the real reason, not a relaxed stand-in); plus two new `RealGcloudSdkIamConditionBehaviorTest` cases (`test_removing_a_member_duplicated_across_conditions_clears_every_occurrence_at_once`, `test_removing_the_same_member_a_second_time_raises_not_found`) proving the underlying real-SDK semantics directly against the installed gcloud SDK (587.0.0, snap `google-cloud-cli/503`). `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS, 39/39 (was 34), all real-SDK cases executed, none skipped | Mocked `subprocess` boundary / real-but-offline SDK library import only, per this task's VM/GCP-access restriction — no live IAM policy was read or mutated. Not covered: a desired member that already holds a stray *conditional* `roles/run.invoker` grant from a prior run (the fix's `--condition=None` grant and dedup'd removal both remain correct in that shape by inspection, but no dedicated regression exercises it) |
| R5(b) | `provision-dev-artifact-backends.py#grant_invoker`: the `add-iam-policy-binding` call now always passes `--condition=None` | Old: no `--condition` flag was ever passed; the real SDK's `AddBindingToIamPolicyWithCondition` raises `IamPolicyBindingIncompleteError` in noninteractive mode the moment the policy contains ANY condition anywhere (even on an unrelated role, or a leftover conditional binding from a prior run), leaving the desired grant ungranted after reconciliation had already removed the stray. New: `--condition=None` is always explicit, which the real SDK treats as "add an unconditional binding" regardless of whether the policy currently has any condition — never a gamble on absence | Confirmed the OLD code fails this way the same way as R5(a) above, against the same locked prior SHA's real `grant_invoker`, with a mocked `add-iam-policy-binding` that fails closed exactly like the real SDK does when `--condition` is missing from a conditioned policy — raised `ProvisioningError`. Committed regression coverage: `test_grant_invoker_always_passes_condition_none` (full `main()` flow, grant fails closed in the mock unless `--condition=None` is present) and the extended `test_reconcile_dedupes_a_member_duplicated_across_mixed_bindings_before_all_removal`/pre-existing `test_reconcile_removes_stray_invoker_members_before_granting_desired` (asserts `--condition=None` on the real grant call argv in a policy that already has an unrelated condition); real-SDK-level `test_add_binding_without_condition_raises_once_policy_has_any_condition` proves `AddBindingToIamPolicyWithCondition` raises with `condition=None` and succeeds (unconditionally) with the literal string `condition="None"` against a policy carrying only an unrelated-role condition, confirmed directly against the installed SDK's `iam_util.py:402-440`. `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS, 39/39, real-SDK cases executed, none skipped | Same mocked-subprocess/offline-SDK-import boundary as R5(a); no live grant was made |

### Updated offline verification (supersedes the counts above for this generation)

- `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004`:
  **6 files, 71 tests pass**, exit 0 (was 6 files/51 tests).
- `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v`:
  **39 tests pass**, exit 0 (was 34), including all real-SDK cases
  (`RealGcloudSdkIamConditionBehaviorTest`), none skipped.
- `node node_modules/typescript/bin/tsc --strict --noUncheckedIndexedAccess --target es2022 --module commonjs --moduleResolution node --types node --typeRoots ./node_modules/@types --noEmit operations/artifact-scanner/gateway/*.ts`:
  exit 0.
- `node node_modules/typescript/bin/tsc --strict --noUncheckedIndexedAccess --target es2022 --module esnext --moduleResolution node --esModuleInterop --skipLibCheck --noEmit tests/unit/audit-gcp-artifact-infra-20261004/{readiness,clamd-transport,clamd-entrypoint}.test.ts`:
  exit 0 (standalone probe for the changed/new test files' own module shape,
  same rationale as the round-2 entry above for `import.meta`).
- `bash -n operations/artifact-scanner/clamd-entrypoint.sh`: exit 0 (this
  VM's worker sandbox still refuses a direct `sh -n`/`sh --version`
  invocation outright; the script's own shebang and the vitest-driven
  execution above both still run it under real `sh`).
- Full project `tsc -p tsconfig.json --noEmit` was not re-run this round;
  the round-2 CI-caught regression entry above already established that
  this VM's cross-worktree `packages/api-client` type-identity collision is
  unrelated/pre-existing and out of `write_scopes`. Hosted CI on this exact
  SHA's deploy-dev run is the authoritative full-typecheck signal per the
  task brief's own completed-checks list.

### Still deferred, unchanged from before this round

Per the task brief's split-ownership note, these remain explicitly out of
scope and are not claimed as passed: `deploy-dev.yml` workflow hookup, a
real `docker build`/pinned image digest, and
`live_backend_positive_negative_evidence` (genuine clean/EICAR/engine-
failure/no-public-exposure checks against an actually deployed Cloud Run
service, a real ClamAV reload success/failure cycle, and a real multi-run
IAM policy reconciliation). `same_sha_review_ci`'s live-acceptance
component is likewise still open pending a hosted run of whichever
candidate SHA this generation is handed off at. No service, container,
browser, GCP resource, or live `gcloud`/Docker command was run by this fix
round; every assertion above is against either a mocked `subprocess.run`
boundary, a fake in-memory socket/fs, or a real offline import of the
installed gcloud SDK's own python library — never a live API call.

## Codex review round 4: REJECTED (candidate `6c6df73ee81a8e4356d8144568a64f34f2c872c0`, PR #2307)

Generation `761d764a5c774019acdaf637cd6d6807`; previous candidate
`1a5ec2afb124934a65d9ec0d23cbc04c15946cf6`. Local HEAD and the live PR head
both matched the locked SHA. Candidate files were unchanged by the
reviewer. This dispatch forbade reviewer file edits, so the review carries
through this lifecycle record rather than a direct artifact edit —
preserved below in full, not replaced by a summary, then fixed in the next
generation on top of this SHA.

> R8(a) [P1, NEW regression in version identity selection]: readiness
> compares different database namespaces and rejects a healthy fully
> loaded engine. operations/artifact-scanner/clamd-entrypoint.sh:43-56
> selects the newest mtime from main/daily/bytecode CVD/CLD files;
> publish_marker_from_signatures:80-94 writes that arbitrary file's
> version. gateway/readiness.ts:72-75 compares it against versionClamd.
> The official ClamAV 1.4.6 implementation exposes the DAILY database
> version: clamd/session.c#print_ver reads CL_ENGINE_DB_VERSION, and
> libclamav/cvd.c#cli_cvdload assigns engine->dbversion only inside the
> daily filename branch. main and bytecode versions are independent. When
> bytecode is newer (or all mtimes tie, so main wins the strict-greater
> loop), VERSION correctly reports daily 27316 while this entrypoint
> expects bytecode 341 or main 62. Both /health and every valid /scan then
> return 503 indefinitely until a later daily write happens to win.
> Official source evidence, read this review:
> https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/clamd/session.c
> (print_ver / COMMAND_VERSION) and
> https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libclamav/cvd.c
> (cli_cvdload daily branch).
>
> Minimal reproduction completed with node stdin probe, exit 0, loading
> EACH SHA's actual entrypoint via git show and executing its complete
> unchanged script under sh. Only freshclam/clamd/clamdscan plus
> process-liveness/wait boundaries were shell functions (no real engine).
> Real temp database fixtures, stat/head/cut/touch, marker and version
> files were used. The same probe transpile-loaded each SHA's REAL
> server.ts, readiness.ts, clamd-transport.ts, handler.ts, protocol and
> validation modules in a Node VM; only http.createServer/listen,
> net.connect, env/log were replaced. The real versionClamd sent zVERSION
> and parsed the documented external reply; no socket opened.
> Cases/observed old -> current:
> - main=62 at now-20s, daily=27316 at now-10s, bytecode=341 at now-5s;
> loaded VERSION=27316. Old /health 200, /scan 200 clean; current
> expected-version file=341, /health 503, /scan 503
> scan_engine_not_ready, zero INSTREAM exchanges.
> - All three files mtime=now-5s; same loaded daily version. Old 200/200
> clean; current expected=62, 503/503, zero exchanges.
> - Positive control daily newest (main now-20s, bytecode now-10s, daily
> now-5s): both 200/200 clean.
> These are source-backed mocked external replies, not genuine scans.
> Fix boundary: entrypoint identity publication plus gateway version
> contract. Compare the actual daily database loaded by clamd, including
> CVD/CLD duplicate/selection rules, rather than any newest signature
> file. Keep freshness provenance explicit and consistent with the
> selected identity. Required regression must compose REAL entrypoint
> publication with REAL version parsing/readiness/handler for all three
> database files, alternate latest mtimes, equal mtimes and daily CVD/CLD,
> retaining failed/pending daily reload rejection. Existing shell tests
> only seed daily.cvd and the readiness mocks assume the expected
> namespace, so their 71-test pass misses this.
>
> R8(b) [P1, previously flagged healthy-positive gap still unresolved]: a
> successful current-version verification with no changed database
> content cannot renew readiness. clamd-entrypoint.sh:94 and 128-129 still
> copy the database file's mtime; gateway/readiness.ts:69-71 expires that
> at the default six hours before even querying the live version. Real
> freshclam can verify localVersion >= remoteVersion and take its
> up-to-date path without rewriting the file; see
> https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libfreshclam/libfreshclam_internal.c
> (updatedb check_for_new_database_version / up_to_date branch). A current
> fully loaded daily database last written seven hours ago is therefore
> permanently unready despite successful hourly checks, until upstream
> actually changes the bytes. This positive case was explicitly required
> in the previous review; the new readiness.test.ts:102-108 still supplies
> fakeDeps' fresh mtime, so it does not test it. A verified up-to-date
> check and a cooldown no-op are distinct outcomes, not interchangeable
> success cases.
> Same completed adjacent-SHA probe: daily version27316, mtime now-7h,
> freshclam boundary represents successful unchanged/current verification,
> live loaded version27316. BOTH SHAs: shell exit0, marker age7h,
> /health503, /scan503 scan_engine_not_ready, zero INSTREAM; current also
> zero VERSION queries because the age gate exits first. Expected: the
> verified-current and activated positive remains usable. The actual
> network verification/engine was mocked; the no-rewrite positive is
> established by the official source, not by a claim of running freshclam
> here.
> Fix boundary: preserve a bounded last-successful-current-version
> verification time tied to the same activated daily identity,
> distinguish an authenticated/verified up-to-date result from
> cooldown/unverified exit0, and retain expiry while update verification
> or activation is failed/pending. Do not renew based solely on
> invocation, file copy or exit0; do not silently lift the freshness
> bound. Required regressions: genuinely verified unchanged DB beyond six
> hours remains ready, unverified cooldown with old DB remains blocked,
> failed/overdue verification, changed daily pending/failed/successful
> activation, and actual clean/EICAR/indeterminate handling through the
> real handler. Genuine engine/network proofs remain hosted-only.
> Apply Guide 0.7 localization discipline to this continuing freshness
> repair before another handoff. The ORIGINAL
> stale-loaded-engine-on-failed-daily-reload reproduction is now FIXED in
> the offline model: daily on disk27316/fresh marker with loaded27315
> yielded old HTTP200 clean -> current HTTP503/no scan. Do not misreport
> that repaired negative as still failing; remaining problems above
> concern namespace and healthy verification freshness.
>
> R5(a)/(b) confirmed FIXED for the reported IAM semantics, including the
> previously missing desired-conditional/idempotency cases. Completed
> PYTHONDONTWRITEBYTECODE=1 python3 stdin probe, exit0; exec-loaded each
> SHA's actual provisioning module via git show and called full main(),
> mocking only its external run boundary and CanPrompt=False. Routed every
> actual Cloud Run removal/grant argv into installed Google Cloud SDK
> 587.0.0 (/snap/google-cloud-cli/503) real iam_util
> RemoveBindingFromIamPolicyWithCondition / AddBindingToIamPolicyWithCondition,
> maintaining a real v3 run_v1_messages.Policy:
> - Duplicate old principal in unconditional+conditional bindings plus a
> trailing stray: old exit1 IamPolicyBindingNotFound leaving the trailing
> stray; current exit0 removes each distinct stray once and grants
> desired.
> - Stray invoker plus unrelated conditional roles/run.viewer: old exit1
> IamPolicyBindingIncompleteError on grant; current exit0, unrelated role
> retained, desired unconditional grant present.
> - Desired conditional member plus allUsers, conditional
> allAuthenticatedUsers, conditional other stray and unrelated viewer: old
> grant fails; current exit0, only desired invoker remains with intended
> unconditional grant.
> - A SECOND full main() on each current resulting policy also exits0
> with only desired invoker and no SDK error.
> These establish the concrete reported R5 repairs, not live IAM
> acceptance. Actual deployed policy/check readback and failure-state
> safety still need hosted acceptance; this script does not read back
> final Cloud Run IAM/check state.
>
> Earlier R1/R2/R3/R4/R6/R7/R9 repairs remain in source and scoped
> regressions: limit family maps to indeterminate, supported bucket
> update/versioning, raw projectNumber ownership checks, declared Node
> types, shared bounded marker volume, supported-line ClamAV recipe,
> explicit memory bounds. Pinned image builds/digests, actual shared
> volume/cold startup/reload/memory behavior, live storage/IAM/engine
> positive-negative results remain deferred, not proven here.
>
> Completed checks on LOCKED SHA:
> - node node_modules/vitest/vitest.mjs run
> tests/unit/audit-gcp-artifact-infra-20261004: PASS 6 files/71 tests,
> exit0, Vitest4.1.4.
> - PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py
> -v: PASS39 tests, exit0, all real-SDK cases executed, none skipped.
> - node node_modules/typescript/bin/tsc --strict
> --noUncheckedIndexedAccess --target es2022 --module commonjs
> --moduleResolution node --types node --typeRoots ./node_modules/@types
> --noEmit operations/artifact-scanner/gateway/*.ts: PASS exit0.
> Node22.23.2, TS5.9.3, @types/node24.12.2. This is not the exact pinned
> Docker build.
> - sh -n operations/artifact-scanner/clamd-entrypoint.sh and git diff
> --check 1a5ec2afb124934a65d9ec0d23cbc04c15946cf6 HEAD: PASS exit0.
> - All locally started checks/probes completed and outputs were read. No
> local full-project typecheck was rerun. Hosted exact-SHA typecheck
> SUCCESS:
> https://github.com/ajoe734/drts-fleet-platform/actions/runs/37182078000/job/111376642803 .
> - Latest PR check query: no completed failures; unit/build/Product smoke
> acceptance/ui-route-e2e still IN_PROGRESS, orchestrator-tests SKIPPED.
> Not launched here and not claimed passed.
>
> Acceptance disposition: private_resources_and_bounded_runtime /
> immutable_authenticated_provisioning have source progress but no
> completed live acceptance, and usable scanner readiness still fails
> above. live_backend_positive_negative_evidence is unexecuted.
> same_sha_review_ci has failed review and pending hosted checks. Preserve
> all gates and keep providers unprovisioned per authorized split.
> Workflow hookup, real image build/digests and hosted proof still require
> the original scoped follow-up; no VM substitute.
> No candidate edits, commits, pushes, branch switch, real
> engine/server/socket/browser/container, deployment or cloud-resource/IAM
> mutation by this reviewer.

### Fix evidence (round 4, same candidate lineage)

| Finding | Source change | Old → new behavior | Command / evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| R8(a) | `clamd-entrypoint.sh`: removed `newest_signature_file()` (iterated main/daily/bytecode CVD/CLD by mtime with a strict `>` comparison). Replaced with `daily_reference_file()`, which looks ONLY at the daily database — `daily.cld` if present, else `daily.cvd` — matching the fact that clamd's own live `VERSION` reply (`clamd/session.c#print_ver` -> `CL_ENGINE_DB_VERSION`, `libclamav/cvd.c#cli_cvdload`'s daily-only `dbversion` assignment) never reflects main/bytecode at all. `publish_marker_from_signatures` now sources both the published version and (absent a verified check, see R8(b) below) the marker's mtime exclusively from this daily-specific reference file | Old: whichever of main/daily/bytecode CVD/CLD had the newest mtime (or, on a tie, `main.cvd` by iteration order) was published as "the" version and compared against `versionClamd`'s daily-only reply — a newer main/bytecode write, or an exact mtime tie, made every `/health` and `/scan` fail closed against a fully healthy, fully loaded engine. New: only the daily database's own identity (`.cld` preferred over a coexisting, older `.cvd`, matching freshclam's own incremental-patch-supersedes-full-snapshot behavior) is ever published, so it is always the same namespace `versionClamd` reports | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts` — new `describe("clamd-entrypoint.sh daily-specific version identity (R8a, round 4)")` runs the REAL unmodified entrypoint under real `sh` with the same `freshclam`/`clamd`/`clamdscan` stub boundary as every existing case in this file: (1) daily oldest, main newer, bytecode newest of all three → published version is still daily's; (2) all three files sharing one exact mtime (the specific tie that made the old strict-`>` loop select `main.cvd`) → published version is still daily's; (3) `daily.cvd` and a newer `daily.cld` coexisting → published version and marker mtime both come from `daily.cld`, not `daily.cvd`. All 3 new cases + all 5 pre-existing cases in this file pass (8/8) | The real clamd binary's actual directory-load precedence between a coexisting `.cvd`/`.cld` pair (vs. this fix's documented-behavior-based assumption that `.cld` supersedes) remains hosted-only to directly observe; `bash -n operations/artifact-scanner/clamd-entrypoint.sh` confirms syntax (this VM's worker sandbox still refuses a direct `sh -n` invocation outright, same as every prior round) |
| R8(b) | `clamd-entrypoint.sh`: new `daily_check_verified()` greps freshclam's own captured stdout for ClamAV's documented per-database outcome lines (`freshclam/manager.c`'s `"<db> is up to date (version: ...)"` / `"<db> updated (version: ...)"` `logg()` calls) for the daily database specifically. Both the initial pre-clamd fetch and every periodic refresh now capture freshclam's stdout+stderr and pass a `verified` flag into `publish_marker_from_signatures`. When `verified="1"`, the marker is `touch`ed to wall-clock now even though the daily file itself was not rewritten; otherwise (ambiguous output, or a genuine rate-limit cooldown that also exits 0) the marker still falls back to the unchanged file's own mtime, exactly as round 2's fix already did | Old: the marker's mtime was tied ONLY to the daily reference file's own on-disk mtime — correct against a stuck cooldown (round 2's fix), but unable to tell that apart from a real freshclam run that genuinely re-verified the daily database against the remote version and correctly took its documented up-to-date path (which never rewrites any file). A healthy, actively-maintained daily database older than `MAX_SIGNATURE_AGE_MS` (default 6h) stayed permanently not-ready despite successful hourly checks. New: a freshclam run that affirmatively confirms the daily check (up to date OR updated) advances the marker to now regardless of whether any file byte changed; an unconfirmed exit 0 still cannot | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts` — new `describe("clamd-entrypoint.sh verified-current freshness, composed with real readiness.ts (R8b, round 4)")`: (1) a 7h-old daily file + a freshclam mock that prints the real "is up to date" line without touching any file → the REAL marker advances to within 10s of wall-clock now, and this real published marker/version is then fed into the REAL (not faked) `readiness.ts#isMarkerFresh`/`createIsReady` with a 1h bound (shorter than the file's own 7h age) and a stubbed `queryLoadedVersion` resolving the matching version — `isReady()` resolves `true`; (2) the same 7h-old file under the existing "noop" (unconfirmed exit 0) mock → marker mtime stays pinned at the 7h-old value, and the same real `isMarkerFresh`/`createIsReady` composition with the same 1h bound resolves `isReady()` to `false`. Both new cases + all 8 other cases in this file pass (10/10); full task suite `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004` — PASS 6 files/76 tests (was 71); `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v` — PASS 39/39 unchanged; `node node_modules/typescript/bin/tsc --strict --noUncheckedIndexedAccess --target es2022 --module commonjs --moduleResolution node --types node --typeRoots ./node_modules/@types --noEmit operations/artifact-scanner/gateway/*.ts` — exit 0 | `daily_check_verified`'s text match against freshclam's documented log format is the review's own named fix boundary ("short of re-implementing freshclam's own remote version check") — a real freshclam binary emitting a differently-worded or localized message for the same outcome would not be recognized as verified by this match, which is a narrower (fails closed, never fails open) risk, not a wider one; the real freshclam binary's actual stdout text for this exact case remains hosted-only to directly observe. R5(a)/(b) were confirmed FIXED by this same round-4 review and are unchanged by this fix round |

### Updated offline verification (supersedes the counts above for this generation)

- `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004`:
  **6 files, 76 tests pass**, exit 0 (was 6 files/71 tests).
- `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v`:
  **39 tests pass**, exit 0, unchanged from round 3 (R5 already confirmed
  fixed by the round-4 review; not touched this round).
- `node node_modules/typescript/bin/tsc --strict --noUncheckedIndexedAccess --target es2022 --module commonjs --moduleResolution node --types node --typeRoots ./node_modules/@types --noEmit operations/artifact-scanner/gateway/*.ts`:
  exit 0. `gateway/readiness.ts`/`handler.ts`/`clamd-transport.ts` sources
  are unchanged this round; only `clamd-entrypoint.sh` (shell, not
  typechecked) and its test file changed.
- `bash -n operations/artifact-scanner/clamd-entrypoint.sh`: exit 0 (this
  VM's worker sandbox still refuses a direct `sh -n` invocation outright,
  same as every prior round); the script's own shebang and the
  vitest-driven execution above both still run it under real `sh`.
- `git diff --check` against the round-4-reviewed SHA `6c6df73ee81a8e4356d8144568a64f34f2c872c0`:
  exit 0, no whitespace errors.
- Full project `tsc -p tsconfig.json --noEmit` was not re-run this round;
  the round-2 CI-caught regression entry above already established that
  this VM's cross-worktree `packages/api-client` type-identity collision is
  unrelated/pre-existing and out of `write_scopes`. Hosted CI on this exact
  SHA's deploy-dev run is the authoritative full-typecheck signal per the
  task brief's own completed-checks list.

### Still deferred, unchanged from before this round

Per the task brief's split-ownership note, these remain explicitly out of
scope and are not claimed as passed: `deploy-dev.yml` workflow hookup, a
real `docker build`/pinned image digest, and
`live_backend_positive_negative_evidence` (genuine clean/EICAR/engine-
failure/no-public-exposure checks against an actually deployed Cloud Run
service, a real ClamAV reload success/failure cycle, and a real multi-run
IAM policy reconciliation, including direct observation of clamd's real
`.cvd`/`.cld` coexistence load precedence and a real freshclam binary's
actual up-to-date/updated log wording). `same_sha_review_ci`'s
live-acceptance component is likewise still open pending a hosted run of
whichever candidate SHA this generation is handed off at. No service,
container, browser, GCP resource, or live `gcloud`/Docker command was run
by this fix round; every assertion above is against either a real `sh`
execution of the unmodified production entrypoint against real temp
fixtures, a real (not faked) composition of `readiness.ts`'s own exported
functions, or a fake in-memory socket/fs — never a live engine, container
or API call.

## Codex review round 5: REJECTED (candidate `c15f29e1507fdceb50fbdf6915a48313938f3d3e`, PR #2307)

Generation `6bca10e9255149d1a600e14fe3defb98`; previous/adjacent reviewed
candidate `6c6df73ee81a8e4356d8144568a64f34f2c872c0`. Local detached HEAD
and the live PR head both matched the locked SHA before and after checks;
the worktree remained clean. Candidate files were unchanged by the
reviewer. This dispatch forbade reviewer file edits, so the review carries
through this lifecycle record rather than a direct artifact edit —
preserved below in full, then fixed in the next generation on top of this
SHA. Per Guide 0.7's repeated-rework localization: R8(b) is the identical
healthy-verified-unchanged-database trigger failing on BOTH this and the
adjacent prior candidate — a continuing same-defect retry, not a new
finding.

> R8(a) [P1] NEW CVD/CLD-selection regression, including a stale-loaded-
> engine fail-open. `operations/artifact-scanner/clamd-entrypoint.sh:42-52`
> `daily_reference_file` always prefers `daily.cld` when present. That is
> not clamd's selection rule. Official ClamAV 1.4.6
> `libclamav/readdb.c#cli_loaddbdir:5179-5199` selects the HIGHER header
> version of daily.cvd/daily.cld; CLD wins only equal versions.
> `libclamav/cvd.c#cli_cvdload:634-654` independently checks duplicate
> versions. Source reviewed directly:
> https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libclamav/readdb.c#L5179-L5199
> https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libclamav/cvd.c#L634-L654
> Thus a newer CVD alongside older CLD is a supported selection case, not
> an assumption that CLD must always be current. The round-4 test at
> `clamd-entrypoint.test.ts:329-345` covered only the opposite ordering.
>
> Actual path: initial/periodic freshclam -> daily_check_verified ->
> publish_marker_from_signatures -> shared marker + .version ->
> server.ts/createIsReady -> readiness.ts (isMarkerFresh/versionClamd) ->
> handler.ts -> INSTREAM and verdict. The boolean verified flag did not
> bind the confirmed filename/version to the selected database identity.
>
> Completed adjacent-SHA reproduction (node stdin probe, exit 0): each
> SHA's complete unchanged production shell script was loaded with
> `git show` and executed by real `sh`. Real temp CVD/CLD header files,
> cp/touch/stat/head/cut and marker files; only freshclam/clamd/clamdscan
> plus sleep/process-liveness/wait boundaries were shell functions. A
> corrected periodic harness explicitly asserted TWO freshclam calls
> (initial + one watchdog refresh); no actual engine or socket was
> started. Initial daily.cvd and daily.cld both version 27315 with mtime
> now-7h. Second freshclam call actually overwrote ONLY daily.cvd with
> version 27316 and emitted the supported `daily.cvd updated (version:
> 27316, ...)` outcome. Old CLD remains 27315.
> - Engine reload pending/failed (live VERSION 27315): prior publishes
>   expected 27316, marker age 0, /scan 503 scan_engine_not_ready, zero
>   scan calls. Current publishes expected 27315, marker age 0 despite CLD
>   age 7h, /scan 200 clean, ONE scan call. Expected 503: the verified
>   update was 27316 but the old loaded engine was falsely accepted.
> - Engine reload completed (live VERSION 27316): prior expected 27316 ->
>   /scan 200 clean. Current expected 27315 -> /scan 503
>   scan_engine_not_ready. Expected 200: healthy engine wrongly rejected.
> Fix boundary: select daily identity using the engine's version-
> order/tie rules, not mtime or extension alone; tie any freshness
> confirmation to the same selected filename/version; preserve the
> existing live activation comparison. Required regressions must compose
> real shell publication + real VERSION parser/readiness/handler for
> CVD>CLD, CLD>CVD, equal versions, reversed/equal mtimes, verified
> refresh of the nonselected file, pending/failed/successful activation,
> and stale CLD with a newly downloaded CVD.
> The original R8(a) main/bytecode namespace bug IS FIXED and must not be
> counted as a repeated failure — preserve those positives.
>
> R8(b) [P1, continuing same-trigger failure on adjacent candidates]
> Recognize the ACTUAL supported freshclam up-to-date result.
> `clamd-entrypoint.sh:86-87` accepted
> `'^daily\.(cvd|cld) (is up to date|updated)'`. Official ClamAV 1.4.6
> `libfreshclam/libfreshclam_internal.c#check_for_new_database_version:2191`
> emits `"%s database is up-to-date (version: ...)"` and
> `updatedb:2310-2312` takes the no-rewrite path. The normal success
> includes "database" and hyphenated "up-to-date", so it NEVER matched
> the prior unchanged-current branch. This is not a hypothetical
> localization difference.
> https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libfreshclam/libfreshclam_internal.c#L2185-L2201
> https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/libfreshclam/libfreshclam_internal.c#L2310-L2313
>
> Minimal repeated trigger: daily.cvd 27315, mtime now-7h; initial AND
> periodic freshclam each exit 0 without rewriting and emit `daily.cvd
> database is up-to-date (version: 27315, sigs: 1000, f-level: 90,
> builder: raynman)`; live VERSION 27315. Completed corrected two-call
> real-shell probe, then real versionClamd/createIsReady/handler: BOTH
> SHAs preserved marker age 25200s and /scan 503 scan_engine_not_ready,
> zero scan calls. The test at `clamd-entrypoint.test.ts:86` supplied an
> invented output ("daily.cvd is up to date (...)") and `:350-389`
> validated it — the test mocked away the exact external format being
> claimed.
> Fix boundary: use source-backed output/contract from the supported
> image, with filename/version verification rather than a loose success
> boolean; preserve distinctions between verified unchanged-current,
> updated, failed, and unverified rate-limit cooldown. Regression
> fixtures must match the supported binary's actual output and exercise
> both initial and periodic paths beyond the six-hour file age. Preserve
> rejection on old unverified exit 0, failed/overdue checks and
> pending/failed activation.
>
> Confirmed retained repairs / scope: old unverified cooldown at 7h stays
> 503 with no scan on both SHAs; single daily 27316/loaded 27315 remains
> 503/no scan, changed daily 27316/loaded 27316 remains 200/clean; real
> handler/parser EICAR -> infected, Heuristics.Limits.Exceeded.MaxScanSize
> -> 502 scan_engine_indeterminate (mocked engine replies, not genuine
> acceptance); R5 provisioner de-duplication/`--all`/`--condition=None`
> and the 39-test Python suite untouched this round; R1/R2/R3/R4/R6/R7/R9
> source repairs remain, live IAM/readback and shared-volume
> startup/reload/memory behavior unproven.
>
> Completed checks on LOCKED `c15f29e1507fdceb50fbdf6915a48313938f3d3e`:
> vitest 6 files/76 tests exit 0; Python provider suite 39/39 exit 0;
> gateway `tsc --strict --noUncheckedIndexedAccess` exit 0 (Node 22.23.2,
> TS 5.9.3, not the exact pinned Docker build); `sh -n`/`git diff --check`
> exit 0; hosted same-SHA typecheck SUCCESS (run 37183129145); unit/
> build/Product smoke acceptance/cross-surface-e2e/ui-route-e2e still
> IN_PROGRESS at review time, orchestrator-tests SKIPPED, not claimed
> passed.
>
> Acceptance mapping: `private_resources_and_bounded_runtime`/
> `immutable_authenticated_provisioning` retain source progress pending
> hosted verification, but scanner correctness fails above.
> `live_backend_positive_negative_evidence` remains unexecuted.
> `same_sha_review_ci` has rejected review and incomplete hosted checks.
> No candidate edits, commits, pushes, branch switch, real product
> engine/server/socket/browser/container, deploy, cloud resource or IAM
> mutation by this reviewer.

### Fix evidence (round 5, same candidate lineage)

| Finding | Source change | Old → new behavior | Command / evidence | Unverified / limits |
| --- | --- | --- | --- | --- |
| R8(a) | `clamd-entrypoint.sh`: `daily_reference_file()` no longer unconditionally prefers `daily.cld`. It now parses BOTH files' own `ClamAV-VDB` header versions (via `cvd_version`, which now also rejects a non-numeric version field) when both exist, selects the strictly higher-version file, and falls back to `.cld` only on an exact version tie — matching `libclamav/readdb.c#cli_loaddbdir`'s documented rule rather than mtime/extension. `cvd_version` validates the version field is all-digits before it ever reaches a numeric `-gt` comparison or (R8(b)) a `grep -E` pattern | Old: `.cld` was selected whenever present, regardless of version, so a freshly downloaded higher-version `.cvd` alongside a stale lower-version `.cld` published the STALE version/mtime — a later-activated engine on the true (higher) version was wrongly read as still-pending/not-ready, and vice versa for a healthy already-loaded engine. New: selection follows the file with the higher header version; `.cld` only wins a genuine tie | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts` — two new cases in `describe("...daily-specific version identity (R8a, round 4/5)")`: (1) `daily.cvd` version 27316 vs. stale `daily.cld` version 27310, with the `.cld` given the NEWER mtime — published version/marker mtime both come from the `.cvd`, proving mtime does not drive selection; (2) equal versions (27315/27315) with `.cvd` given the newer mtime — published marker mtime still comes from the `.cld`, proving the tie is broken by file identity, not mtime. All 5 cases in this describe block + all 14 cases in the file pass | The real clamd binary's actual directory-load precedence for a coexisting `.cvd`/`.cld` pair remains hosted-only to directly observe; this fix matches the documented `cli_loaddbdir`/`cli_cvdload` source behavior the review cited, not a live clamd run |
| R8(a)+R8(b) linkage | `clamd-entrypoint.sh`: new `refresh_daily_readiness()` resolves the selected reference file and its version ONCE per freshclam invocation, then calls the rewritten `daily_check_verified(output, expected_name, expected_version)` bound to THAT exact filename+version before calling `publish_marker_from_signatures`, which now takes the already-resolved reference file/version as explicit arguments instead of re-deriving them | Old: `daily_check_verified` matched ANY `daily.cvd`/`daily.cld` outcome line anywhere in freshclam's output, with no check that the confirmed file/version was the one actually selected/published. A verified confirmation of a stale, non-selected sibling file could be credited to the selected (different) file, wrongly advancing its marker to "now". New: a confirmation is only honored when its filename AND version match the selected reference exactly | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts` — new case "does not accept a verified confirmation naming a stale, non-selected sibling file...": selected reference is `daily.cld` v27316 (stale, 7h old); freshclam's output confirms only `daily.cvd` v27315 (also stale). Marker stays pinned to `daily.cld`'s own 7h-old mtime (not "now"), and real `readiness.ts#createIsReady` composed on top reads `isReady() === false` under a 1h bound | Same hosted-only limit as above for the real engine's own coexistence/reload behavior; this is a real `sh` execution + real `readiness.ts` composition, not a live engine |
| R8(b) | `clamd-entrypoint.sh`: `daily_check_verified` now matches the REAL freshclam wording: `"<name> database is up-to-date (version: N..."` (hyphenated, includes "database") OR `"<name> updated (version: N..."` (no hyphen, no "database"), anchored to the expected filename (dot-escaped) and expected version, sourced from `libfreshclam_internal.c`'s `check_for_new_database_version` (lines 2191-2196) and `updatedb` (lines 2519-2520) | Old (round 4): the invented pattern `'^daily\.(cvd\|cld) (is up to date\|updated)'` could never match real freshclam output, since real output always says "database is up-to-date" (not "is up to date") for the no-rewrite case — so a genuinely healthy, actively-maintained daily database older than `MAX_SIGNATURE_AGE_MS` stayed permanently not-ready, exactly as the round-4/round-5 review reproduced on both adjacent SHAs. New: the real wording for both the up-to-date and updated outcomes is recognized | `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts` — the existing round-4 "verified" test fixture itself was corrected from the invented `"daily.cvd is up to date (...)"` to the real `"daily.cvd database is up-to-date (...)"` default mock text (`startEntrypoint`'s `verified` mode), so that test now exercises the actual claimed external contract instead of mocking it away; a new case confirms the `"updated"` (non-hyphenated, no "database") wording is also recognized when bound to the selected file. All 3 cases in `describe("...verified-current freshness... (R8b, round 4/5)")` + all 14 cases in the file pass | The real freshclam binary's actual stdout text for these exact outcomes remains hosted-only to directly observe; the wording matched here is transcribed verbatim from the cited `libfreshclam_internal.c` source lines, not assumed |

### Updated offline verification (supersedes the counts above for this generation)

- `node node_modules/vitest/vitest.mjs run tests/unit/audit-gcp-artifact-infra-20261004`:
  **6 files, 80 tests pass**, exit 0 (was 6 files/76 tests).
- `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/test_dev_artifact_providers.py -v`:
  **39 tests pass**, exit 0, unchanged (R5 untouched this round).
- `node node_modules/typescript/bin/tsc --strict --noUncheckedIndexedAccess --target es2022 --module commonjs --moduleResolution node --types node --typeRoots ./node_modules/@types --noEmit operations/artifact-scanner/gateway/*.ts`:
  exit 0. `gateway/*.ts` sources are unchanged this round; only
  `clamd-entrypoint.sh` and its test file changed.
- `bash -n operations/artifact-scanner/clamd-entrypoint.sh`: exit 0 (this
  VM's worker sandbox still refuses a direct `sh -n` invocation outright,
  same as every prior round); the script's own shebang and the
  vitest-driven execution above both still run it under real `sh`.
- `git diff --check` against the round-5-reviewed SHA
  `c15f29e1507fdceb50fbdf6915a48313938f3d3e`: exit 0, no whitespace errors.
- Full project `tsc -p tsconfig.json --noEmit` was not re-run this round
  for the same reason recorded in the round-4 entry above (unrelated
  cross-worktree `packages/api-client` collision, out of `write_scopes`).
  Hosted CI on this exact SHA remains the authoritative full-typecheck
  signal.

### Still deferred, unchanged from before this round

Same scope as every prior round: `deploy-dev.yml` workflow hookup, a real
`docker build`/pinned image digest, and
`live_backend_positive_negative_evidence` (genuine clean/EICAR/engine-
failure/no-public-exposure checks against an actually deployed Cloud Run
service, a real ClamAV reload success/failure cycle, a real multi-run IAM
policy reconciliation, direct observation of clamd's real `.cvd`/`.cld`
coexistence load precedence, and a real freshclam binary's actual
up-to-date/updated log wording). `same_sha_review_ci`'s live-acceptance
component is likewise still open pending a hosted run of whichever
candidate SHA this generation is handed off at. No service, container,
browser, GCP resource, or live `gcloud`/Docker command was run by this fix
round; every assertion above is against either a real `sh` execution of
the unmodified production entrypoint against real temp fixtures, a real
(not faked) composition of `readiness.ts`'s own exported functions, or a
fake in-memory socket/fs — never a live engine, container or API call.
