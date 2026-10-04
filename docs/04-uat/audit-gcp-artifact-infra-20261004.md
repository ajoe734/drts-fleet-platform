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
