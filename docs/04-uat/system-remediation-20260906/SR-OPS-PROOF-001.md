# SR-OPS-PROOF-001 — isolated restore and workload-proof preparation

## Evidence provenance

- Base SHA at this revision (`origin/dev`, 2026-09-08T13:45Z fetch): `6f4ac8c74ae3618b6109efd010014365a85d36d8`.
- Candidate SHA is intentionally emitted by every harness run and must be replaced by the final handoff candidate evidence.
- Source baseline: `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`.
- Authoritative API contract for the load workloads: `phase1_openapi_v1.yaml` (`POST /api/tenant/bookings`, `POST /api/orders/{orderId}/dispatch`, `POST /api/reports/jobs`).
- This revision responds to reviewer rejection of candidate `407fd11a998afa1d58a6beff8130308c17680eaf` (PR #1735). All three findings below (P1 destination-override bypass, P1 non-authoritative load requests, P2 missing manifest reconciliation) are fixed in this candidate; see "Fixes in this revision".

## What this task makes repeatable

`tools/system-remediation/ops-proof/ops-proof.sh` has three deliberately separate commands:

1. `inventory --output evidence/inventory.json` records the read-only present-state review and states the live gates that were not exercised.
2. `restore --snapshot SNAPSHOT --manifest MANIFEST --isolated-database-url URL --output evidence/restore.json` restores exactly one supplied PostgreSQL dump and reconciles the readback against a snapshot-linked manifest (see below).
3. `load --booking-url URL --dispatch-url URL --report-url URL --requests N --output evidence/load.jsonl` sends one authoritative-contract-shaped POST request per curl measurement per workload family, and writes one raw JSONL record per request including latency, status, curl exit code, and error text. It cannot omit a workload family.

The restore target must be a loopback PostgreSQL URL whose database name starts `drts_ops_proof_`. Load URLs must also be loopback. The harness exposes no source-DB option and rejects all other target hosts/names, query parameters, and fragments before invoking `pg_restore`; it therefore cannot be pointed at the formal production database by its normal URL, redirected through a libpq URI override, or used as an unapproved cloud load generator.

## Fixes in this revision (response to review rejection of `407fd11a9`)

1. **P1 — destination-override bypass (`ops-proof.sh` restore, was lines 78-84).** The prior guard validated only the WHATWG `hostname`/`pathname` of the isolated database URL, then forwarded the *entire* URL string to `pg_restore --dbname=`. libpq accepts URI query parameters (`?hostaddr=...`, `?host=...`, `?dbname=...`, `?service=...`) that override where the connection actually goes, and ambient `PGHOSTADDR`/`PGHOST`/`PGSERVICE` environment variables can do the same regardless of what the URL's authority component says. Fixed by: (a) rejecting any `?query` or `#fragment` on the restore URL outright — this harness never needs one, so the whole class of libpq URI parameter overrides is closed rather than allow/deny-listed; (b) invoking both `pg_restore` and `psql` through `env -u PGHOST -u PGHOSTADDR -u PGPORT -u PGDATABASE -u PGSERVICE -u PGSERVICEFILE ...` so ambient process environment cannot silently redirect the destination either. Regression: `tests/unit/system-remediation/sr-ops-proof-001/ops-proof.test.ts` → "restore destination-override bypass regression" (query-parameter and fragment cases) proves `pg_restore` is never invoked for either bypass input, using a stub `pg_restore` on `PATH` with an invocation marker file that must stay absent.
2. **P1 — non-authoritative load requests (`ops-proof.sh` load, was lines 103-115).** The prior `load` command issued serial, unauthenticated GET requests with no body, which cannot exercise a booking write, a dispatch attempt, or a report-job enqueue, and never recorded which source SHA produced the run. Fixed by: sending the exact method/body shape from the authoritative OpenAPI contract per workload — `POST` with a `TenantBookingCreateRequest`-shaped body for booking, `POST {}` for dispatch (per `POST /api/orders/{orderId}/dispatch`'s empty-object request schema), and `POST` with a `ReportJobCreateRequest`-shaped body for report; comparing the observed HTTP status to the contract's documented success status per workload (`201`/`201`/`202`) and recording a `success` boolean; recording `baseSha`/`candidateSha` on every JSONL line; and pacing requests within each workload with a fixed sleep interval derived from the accepted baseline burst rate (60/300/30 per minute from the confirmed baseline table below, not currently CLI-overridable), so a multi-request run approximates the accepted burst shape instead of firing everything as fast as possible. Regression: "load workload contract fidelity" test stubs `curl` (recording its invoked args, no real network I/O — see caveat below) and asserts method `POST`, `Content-Type: application/json`, and the exact contract-shaped body per workload.
3. **P2 — restore evidence without snapshot reconciliation (`ops-proof.sh` restore, was lines 85-89).** The prior `restore` command reported three raw counts (`trips`/`billing`/`audit`) with nothing to compare them against, so a wrong or partially-restored snapshot would silently pass. Fixed by: requiring a `--manifest FILE` binding a specific snapshot's `sha256` to `expectedCounts` (`trips`/`billing`/`audit`); rejecting the run before any restore tooling is invoked if the manifest's declared `snapshotSha256` does not match the supplied `--snapshot` file's actual digest; and, after readback, failing closed (exit 2, no evidence file written) if any restored count does not equal the manifest's expected value. Success evidence now includes `countsMatchManifest: true` alongside the raw readback. Regression: "restore manifest reconciliation" tests cover the match, the count-mismatch, and the manifest/snapshot-digest-mismatch cases against stubbed `pg_restore`/`psql`, and separately assert the stub processes never see `PGHOSTADDR=`/`PGHOST=` in their environment even when the test harness sets bogus values in the ambient environment.

## Confirmed baseline thresholds and workload shape

The harness records raw measurements rather than inventing a pass rate. The operator evaluating the JSONL must compare the results to the accepted baseline:

| Workload | 15-minute burst | Relevant p95 target |
| --- | ---: | ---: |
| Booking / intake | 60 requests per minute | synchronous response ≤ 2 s |
| Dispatch | 300 transitions per minute | candidate fetch + dispatch attempt write ≤ 10 s |
| Reporting | 30 jobs started per minute | report job enqueue ≤ 5 s |

Those values are quoted from the accepted operational baseline, not created by this task, and are now also the fixed pacing rate the `load` command uses between requests within each workload. A real run must retain the generated files as the resource evidence (snapshot SHA-256, manifest path, isolated database name, URLs, command exit codes, raw latency/error lines).

## Deliberately not claimed

No cloud backup inventory, Cloud SQL restore, authorized isolated cloud target, production load test, Cloud Run multi-instance restart, physical-device proof, or deployment health receipt was available in this worktree. These remain required evidence for `SR-LIVE-OPS-001`; this task does not represent them as successful.

## Local verification evidence

Re-verified in this session (candidate SHA `<see handoff>`, base `origin/dev` `6f4ac8c74ae3618b6109efd010014365a85d36d8`, worker cwd `.artifacts/worktrees/auto/claude-sr-ops-proof-001`):

- `bash -n tools/system-remediation/ops-proof/ops-proof.sh` — exit 0.
- `git diff --check` — exit 0.
- `npx vitest run tests/unit/system-remediation/sr-ops-proof-001/ops-proof.test.ts` — **10/10 tests passed** (up from 4 in the rejected candidate), covering: `inventory` provenance; the pre-existing loopback/workload-family/cloud-load fail-closed guards; the new query-parameter and URL-fragment destination-override bypass regressions (`pg_restore` proven never invoked); the new manifest match/mismatch/digest-mismatch restore regressions, including proof that `PGHOSTADDR`/`PGHOST` never reach the stubbed `pg_restore`/`psql` processes even when set in the ambient test environment; and the new load-workload contract-fidelity regression (method, headers, and per-workload authoritative request body).
- **Not exercised in this session**: an actual `pg_restore`/`psql`/`curl` round-trip against real PostgreSQL or a real HTTP server. This worker environment has no `pg_restore`, `psql`, `pg_dump`, or Docker access, so the restore success path is verified by the manifest-reconciliation regressions above against a stubbed `pg_restore`/`psql` (not a real database), not by an end-to-end run. The `load` command's contract-fidelity regression also stubs `curl` rather than performing a real HTTP round-trip: this sandbox's outbound-network approval broker was unreachable this session (`orchestrator_approval_broker` MCP connection timed out), and a real loopback `curl`/HTTP-server round-trip attempted during this work hung indefinitely rather than completing or failing, which is itself evidence that live network verification is not currently possible from this worker without that broker. A real snapshot restore and a real HTTP load run both remain required evidence for `SR-LIVE-OPS-001` or a follow-up task with working PostgreSQL client tools, Docker access, and network approval.
