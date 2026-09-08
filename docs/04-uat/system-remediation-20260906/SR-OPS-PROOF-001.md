# SR-OPS-PROOF-001 — isolated restore and workload-proof preparation

## Evidence provenance

- Base SHA refreshed on 2026-09-08: `c4c4a35f88907df6bf68e781059dde397c06ba03` (`origin/dev`). Previous `70355aba…` evidence is historical.
- Candidate SHA is intentionally emitted by every harness run and must be replaced by the final handoff candidate evidence.
- Source baseline: `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`.

## What this task makes repeatable

`tools/system-remediation/ops-proof/ops-proof.sh` has three deliberately separate commands:

1. `inventory --output evidence/inventory.json` records the read-only present-state review and states the live gates that were not exercised.
2. `restore --snapshot SNAPSHOT --expected-manifest MANIFEST --isolated-database-url URL --output evidence/restore.json` restores one supplied PostgreSQL dump and reconciles snapshot-bound row fingerprints for `ops.phase1_owned_orders`, `billing.phase1_driver_statements`, and `admin.audit_logs`.
3. `load --booking-url URL --dispatch-url URL --report-url URL --requests N --output evidence/load.jsonl` writes one raw JSONL record per curl measurement, including latency, status, curl exit code, and error text. It cannot omit a workload family.

The restore target must be a loopback PostgreSQL URL whose database name starts `drts_ops_proof_`. Query parameters, fragments, percent encodings, PGSERVICE and PGOPTIONS overrides are rejected before connection. A catalog check rejects databases with existing relations; restore uses one transaction with exit-on-error and no destructive clean option. Load URLs must also be loopback; curl configuration and proxies are disabled, with bounded timeouts. Loopback alone does not prove infrastructure isolation: the operator must ensure there is no tunnel to a shared database and supply a trusted dump with a least-privilege disposable DB role. Actual isolation remains unverified here.

## Confirmed baseline thresholds and workload shape

The harness records raw measurements rather than inventing a pass rate. The operator evaluating the JSONL must compare the results to the accepted baseline:

| Workload         |            15-minute burst |                             Relevant p95 target |
| ---------------- | -------------------------: | ----------------------------------------------: |
| Booking / intake |     60 requests per minute |                      synchronous response ≤ 2 s |
| Dispatch         | 300 transitions per minute | candidate fetch + dispatch attempt write ≤ 10 s |
| Reporting        | 30 jobs started per minute |                        report job enqueue ≤ 5 s |

Those values are quoted from the accepted operational baseline, not created by this task. A real run must retain the generated files as the resource evidence (snapshot SHA-256, isolated database name, URLs, command exit codes, raw latency/error lines).

## Deliberately not claimed

No cloud backup inventory, Cloud SQL restore, authorized isolated cloud target, production load test, Cloud Run multi-instance restart, physical-device proof, or deployment health receipt was available in this worktree. These remain required evidence for `SR-LIVE-OPS-001`; this task does not represent them as successful.

## Local verification evidence

The unit regression executes `inventory`, proves a non-loopback restore target exits before restore tooling runs, and proves the load command rejects a missing dispatch/report workload. It does not manufacture a database dump or report live operation success.

An exploratory loopback-only run also produced all three raw workload records (HTTP 404 from an intentionally empty local server); this confirms recording mechanics only, not booking, dispatch, or reporting success.

## 2026-09-08 resumed verification — in progress, not accepted

Source trace: execution task SR-OPS-PROOF-001; capabilities C122 (backup and business-data restore), C123 (representative concurrent capacity), C124 (deployment version, health and rollback). Current migrations V0006/V0008/V0009 still define the three readback tables. No product business code was changed.

Tested implementation anchor: `05b94be80` (full SHA is emitted by inventory). This is not a handoff candidate. After rebasing onto current dev, the previously published task head was merged to retain ancestry and permit a normal non-force push.

| Actual command                                                                                         | Exit / observation                |
| ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-proof-001/ops-proof.test.ts` before changes | 0; 4 tests passed                 |
| Same command after safeguards                                                                          | 0; 10 tests passed                |
| `bash -n tools/system-remediation/ops-proof/ops-proof.sh`                                              | 0                                 |
| `git diff --check`                                                                                     | 0                                 |
| `command -v pg_restore` / `command -v psql`                                                            | both 1; binaries unavailable      |
| `git push -u origin codex/sr-ops-proof-001`                                                            | 0; anchor published without force |

New tests use command spies solely to prove that unsafe URL variants cannot connect and populated targets cannot invoke restore. They do not count as a real snapshot restoration.

Remaining implementation work: compare snapshot-bound expected business data with restored rows (counts alone are insufficient); support authoritative booking/dispatch/report request methods and payloads, concurrent baseline pacing, latency evaluation and failed HTTP result handling; replace the static inventory description with observed resource/deployment receipts. The current load command is a recording probe, not a capacity acceptance harness. The inventory command describes documented expectations, not observed cloud state.

No snapshot ID, isolated DB resource ID, live API credentials, cloud restore, deployment/rollback receipt or physical-device result was supplied or exercised in this continuation. No RPO/RTO values are invented. Live work remains subject to SR-LIVE-OPS-001 authorization. This task remains in progress and must not be handed off as complete on this evidence.

## 2026-09-08 load failure recording continuation

Dispatch base fetched and rebased: `40c231ba6718dbf7a7ee6662e446d44e48eabcb3`.
The add/add conflict contained only the existing exploratory HTTP 404 evidence;
that evidence was retained. The previously published task branch was merged after
rebase to preserve ancestry for a normal push. Implementation anchor:
`019014fcfb761356a701c2163b9be3d6b4e004a7`; no handoff candidate is locked.
The shared `origin/dev` ref advanced again during verification, so the fetched
base above identifies this continuation, not a claim to have tested later dev.

The load probe now emits base/candidate SHA and a `load_probe` kind on every
record. HTTP responses outside 200–299, curl failures, and malformed measurements
record an error and cause final exit 1, while still attempting and retaining all
three workload families. This fixes the previous false-success exit on HTTP 404
or 500. A 2xx response remains only transport evidence, not business acceptance.

| Actual command | Exit / observation |
| --- | --- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-proof-001/ops-proof.test.ts` before changes | 0; 10 tests |
| Same command after changes | 0; 15 tests |
| `bash -n tools/system-remediation/ops-proof/ops-proof.sh` | 0 |
| `pnpm exec eslint tests/unit/system-remediation/sr-ops-proof-001/ops-proof.test.ts` | 0 |
| `git diff --check` | 0 |
| `git push -u origin codex/sr-ops-proof-001` | 0; `30616dc70..019014fcf`, non-force |
| `command -v psql` and `command -v pg_restore` | 1 each; still unavailable |

The five added cases use curl command spies for HTTP 200, HTTP 500, HTTP 302,
connection failure and malformed output. They verify error recording and exit
semantics only; they supply no API, database, resource or capacity acceptance.
Remaining implementation and live gates listed above are unchanged. In
particular, true request methods/payloads, concurrent SLO pacing/evaluation,
snapshot-bound business reconciliation and observed deployment receipts remain
outstanding. Status remains `in_progress`.


## 2026-09-08 snapshot reconciliation continuation

Fetched base: `f2727a88e086d9b057324f0e6ce1de0aa11c3ce0`. Rebase
conflicts were duplicate historical task commits; all previous task safeguards
and evidence were retained. The published branch ancestry was merged back to
permit normal non-force push. Implementation anchor `980f17f6c` was pushed
successfully. This is an in-progress anchor, not a handoff candidate; a final
candidate remains unset.

The previous count-only readback used legacy tables. Current application
repositories establish runtime authority:

- `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts` uses
  `ops.phase1_owned_orders` (migration V0011 and subsequent alterations).
- `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`
  reads `billing.phase1_driver_statements` (migration V0012).
- `apps/api/src/modules/audit-notification/audit-log.repository.ts` writes
  `admin.audit_logs` (migration V0009).

`reconcile.mjs` now streams the complete persisted rows from those three tables,
ordered by `to_jsonb(t)::text COLLATE "C"`, using psql unaligned tuples-only
UTF-8 output with one newline per row. It fixes timezone to UTC, datestyle to
ISO/YMD and extra_float_digits to 3. It hashes those bytes with SHA-256 and counts
rows without retaining their contents. Readback uses read-only transactions.

The required operator-supplied JSON manifest has version `1`, algorithm
`psql-jsonb-lines-sha256-v1`, `snapshotSha256`, a nonempty `exportReference`, and
`tables` keyed by each of the three fully qualified table names. Each table
entry requires nonnegative integer `count` and lowercase 64-character `sha256`.
The trusted export process must produce these fingerprints from the same
consistent snapshot as the dump, with the exact SQL/settings above and a
compatible PostgreSQL version. Do not derive expected values from the restored
target. This tool does not contact a source database or authenticate the export
reference; manifest provenance must be reviewed separately. No example fixture
is presented as real backup evidence.

The manifest is checked before pg_restore. A wrong dump hash or missing table
fails closed. After restore, a mismatch writes the expected and actual
fingerprints into the receipt and exits 1; a failed readback exits 2 and does
not emit a successful receipt. The helper itself also rejects non-loopback
connections and URL/libpq overrides. Both restore and readback pin PGHOSTADDR
to 127.0.0.1, preventing an inherited remote hostaddr from redirecting libpq.
The disposable target must have no concurrent writers, no tunnels, and a
least-privilege restore role. The supplied dump and manifest must be immutable
for the run. These remain operator prerequisites, not observations established
by a loopback URL. The receipt no longer asserts productionDatabaseTouched=false
as if infrastructure isolation had been observed.

Validation in this continuation uses command spies only. It proves matching
fingerprints, same-count changed content, wrong snapshot, missing audit,
readback failure and refusal of a remote helper target. It does not prove an
actual PostgreSQL restore. `psql` and `pg_restore` are still unavailable, and no
trusted snapshot/export manifest or disposable database resource was supplied.

Remaining work before handoff: real local PostgreSQL reconciliation, authoritative
booking/dispatch/report methods and payloads with concurrent baseline pacing and
SLO evaluation, and observed deployment/resource inventory receipts. Live cloud
restore/load/deployment/rollback remains gated by SR-LIVE-OPS-001. No resource ID,
RPO/RTO achievement, capacity acceptance, CI, merge or physical-device success is
claimed here.

| Actual command (this continuation) | Exit / result |
| --- | --- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-proof-001/ops-proof.test.ts` before edits | 0; 15 tests passed |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-proof-001` after final test edits | 0; 2 files, 21 tests passed, including shell restore success/mismatch receipt checks with command spies |
| `pnpm exec eslint tests/unit/system-remediation/sr-ops-proof-001` | 0 |
| `bash -n tools/system-remediation/ops-proof/ops-proof.sh` | 0 |
| `git diff --check` | 0 |
| `command -v psql` / `command -v pg_restore` | 1 each; unavailable |
| `git push -u origin codex/sr-ops-proof-001` at implementation anchor | 0; `6efbf00be..980f17f6c`, non-force |

The subsequent evidence/test anchor SHA and push outcome are recorded in the
canonical `progress` update. No handoff candidate has been submitted.

## 2026-09-08 capacity and deployment inventory continuation

Fetched/rebased base: `5cff9b36082998a0295f2550039306dc1f84c3d2`.
Previously committed task files were compared against `0b0655d46` after rebase
with no task-file differences. Published ancestry was merged, retaining the
newer capacity/inventory implementation, and ordinary push succeeded at
`69433ee5f`. Tested implementation: `2cbfa40f58278ec20bbded69858800c8c2e09941`.
These are implementation anchors; no review candidate is locked.

`capacity --plan PLAN.json --output RAW.jsonl` now executes independent POST
requests at the baseline's 60/300/30 arrivals per minute, with a bounded
in-flight limit. It records generator overload as an unsent failed request,
rather than quietly reducing the requested rate. Each raw record retains
latency/error, schedule/launch lag, HTTP status, response hash, returned resource
IDs, request-body hash, plan hash, baseline file hash and base/candidate SHA.
Authorization header values and request/response bodies are not recorded.
Synchronous request-construction failures also produce raw failure records.

The operator plan requires `origin` (plain loopback HTTP origin),
`isolatedResourceId`, `durationSeconds` (>0 and <=900), `maxInFlight` (1..500),
and `workloads.booking`, `.dispatch`, `.report` arrays. Each array requires
exactly ceil(durationSeconds * rate / 60) independent requests, each with
`method: "POST"`, `path`, `headers` and `body`. All requests require unique
`idempotency-key` headers. Booking also requires `x-tenant-id` and the required
CreateTenantBookingCommand fields; dispatch uses distinct pre-provisioned order
IDs with `mode: "auto"`; reports require `jobType` and `format`. Actual field
values, authorization and independently prepared business resources must come
from the isolated environment. The validator does not replace API validation.

Authoritative route/command sources:
`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
(`tenant/bookings`, `orders/:orderId/dispatch`), report jobs API and
`packages/contracts/src/index.ts` (CreateTenantBookingCommand,
DispatchOrderCommand, CreateReportJobCommand). Paths include the `/api` prefix.
The adjacent `.summary.json` evaluates nearest-rank p95 and booking p99 against
the accepted baseline. `measurements_within_targets` is only a measurement
result; `acceptance` remains `not_established`, including on a full 900-second
schedule. Durable business readback, dispatch queue timing, backlog/concurrency
shape and monthly availability require separate evidence. The old `load`
command remains a transport probe.

`inventory --output FILE --project ID --region REGION --service NAME` captures
an actual read-only `gcloud run services describe` command, exit status and
selected raw identity/status output. It checks service identity, observed
generation and Ready/latest-created/latest-ready revision consistency. Failed
queries, malformed output and unready generations fail the command. It does
not infer source SHA from a revision name or claim application health/rollback.
Without resource arguments it records local tools and documentation hashes,
with deployment `not_requested`; this is not a cloud observation.

Actual local receipt is preserved at
`tools/system-remediation/ops-proof/evidence/inventory-20260908T163140Z.json`.
It observed Node v22.23.2, missing host psql/pg_restore (ENOENT), and no requested
deployment/resource. Docker server version was separately observed as 29.8.0;
no container, database or synthetic backup was created or counted as restoration.

| Actual command | Exit / result |
| --- | --- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-proof-001` before this continuation's edits | 0; 3 files / 28 tests |
| Same command after capacity failure handling and tests | 0; 4 files / 35 tests |
| `pnpm exec eslint tests/unit/system-remediation/sr-ops-proof-001` | 0 |
| `bash -n tools/system-remediation/ops-proof/ops-proof.sh` | 0 |
| `git diff --check` | 0 |
| `bash tools/system-remediation/ops-proof/ops-proof.sh inventory --output /tmp/SR-OPS-PROOF-001-inventory-20260908.json` | 0; local observations only |
| `docker info --format '{{.ServerVersion}}'` | 0; 29.8.0 |
| `git push origin codex/sr-ops-proof-001` at ancestry anchor | 0; `157b937fe..69433ee5f`, ordinary push |

Capacity regression uses a temporary real loopback HTTP listener with synthetic
responses solely to test mechanics: POST/body transmission, three workload
families, dispatch pacing, HTTP failure, missing success envelope, generator
overload, invalid request header, remote origin and duplicate-key rejection.
Inventory regressions use command spies, including stale deployment generation.
Neither supplies real business or cloud evidence.

Remaining inputs: trusted same-snapshot dump and independently exported manifest,
isolated database and authenticated API workload resources, and explicit cloud
project/region/service IDs for deployment observation. Remaining acceptance:
real restore/readback, representative capacity and business persistence,
immutable deployed build provenance, health and rollback. Cloud restore/load
and physical-device work remain under SR-LIVE-OPS-001 authorization. No RPO/RTO,
real resource ID, CI, merge or live success is claimed. Status remains
`in_progress`; supervisor should supply/route these inputs before final handoff.

## 2026-09-08 16:39 UTC dispatch — resource blocker

Fetched base: `1cdaaa5b5e5301de2da0a692c78c4cc29b0c10a9`.
Rebase replayed duplicate historical task commits; conflicts were resolved with
the published `133bfccd61530c3be7e82e9a9988bfd9e6a92756` task contents.
The final task directories and evidence document were byte-identical to that
published head before this evidence update. Published ancestry was merged to
retain normal non-force push. Tested anchor:
`f631527de93b7e168559d8f44e91c0786d307fb6`; this is not a handoff candidate.

| Actual command on the rebased anchor | Exit / result |
| --- | --- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-proof-001` | 0; 4 files, 35 tests |
| `pnpm exec eslint tests/unit/system-remediation/sr-ops-proof-001` | 0 |
| `bash -n tools/system-remediation/ops-proof/ops-proof.sh` | 0 |
| `git diff --check` | 0 |
| `bash tools/system-remediation/ops-proof/ops-proof.sh inventory --output /tmp/SR-OPS-PROOF-001-inventory-resumed.json` | 0; local observations only, host PostgreSQL tools still ENOENT |

Durable receipt: `tools/system-remediation/ops-proof/evidence/inventory-20260908T163858Z.json`.
Its `candidateSha` field identifies the tested anchor, not a locked review candidate.
No cloud resource was requested or observed.

Canonical `show SR-LIVE-OPS-001` still reports blocked, with this task among its
dependencies and no authorized isolated ops target. Supervisor must supply a
trusted dump and independently exported same-snapshot manifest, isolated DB/API
resource IDs and authenticated workload plan, and cloud project/region/service
IDs. Supervisor must also clarify preparation handoff versus live acceptance:
requiring LIVE-OPS completion before this task can hand off would conflict with
LIVE-OPS depending on this task. Do not silently weaken either acceptance set.
Until those inputs/boundaries are resolved, record this task as blocked instead
of repeatedly presenting tool regressions as progress toward real acceptance.
No real restore, capacity, health, rollback, RPO/RTO, CI or merge acceptance is
established. Final anchor/push result is recorded through canonical status.
