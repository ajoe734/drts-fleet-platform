# SR-OPS-PROOF-001 — isolated restore and workload-proof preparation

## Evidence provenance

- Base SHA observed before implementation: `70355aba97c23dd1cd592b71f1d3dfe6315d91ff` (`origin/dev`).
- Candidate SHA is intentionally emitted by every harness run and must be replaced by the final handoff candidate evidence.
- Source baseline: `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`.

## What this task makes repeatable

`tools/system-remediation/ops-proof/ops-proof.sh` has three deliberately separate commands:

1. `inventory --output evidence/inventory.json` records the read-only present-state review and states the live gates that were not exercised.
2. `restore --snapshot SNAPSHOT --isolated-database-url URL --output evidence/restore.json` restores exactly one supplied PostgreSQL dump and reads back `ops.orders`, `billing.driver_statements`, and `admin.audit_logs` counts.
3. `load --booking-url URL --dispatch-url URL --report-url URL --requests N --output evidence/load.jsonl` writes one raw JSONL record per curl measurement, including latency, status, curl exit code, and error text. It cannot omit a workload family.

The restore target must be a loopback PostgreSQL URL whose database name starts `drts_ops_proof_`. Load URLs must also be loopback. The harness exposes no source-DB option and rejects all other target hosts/names before invoking `pg_restore`; it therefore cannot be pointed at the formal production database by its normal URL or used as an unapproved cloud load generator.

## Confirmed baseline thresholds and workload shape

The harness records raw measurements rather than inventing a pass rate. The operator evaluating the JSONL must compare the results to the accepted baseline:

| Workload | 15-minute burst | Relevant p95 target |
| --- | ---: | ---: |
| Booking / intake | 60 requests per minute | synchronous response ≤ 2 s |
| Dispatch | 300 transitions per minute | candidate fetch + dispatch attempt write ≤ 10 s |
| Reporting | 30 jobs started per minute | report job enqueue ≤ 5 s |

Those values are quoted from the accepted operational baseline, not created by this task. A real run must retain the generated files as the resource evidence (snapshot SHA-256, isolated database name, URLs, command exit codes, raw latency/error lines).

## Deliberately not claimed

No cloud backup inventory, Cloud SQL restore, authorized isolated cloud target, production load test, Cloud Run multi-instance restart, physical-device proof, or deployment health receipt was available in this worktree. These remain required evidence for `SR-LIVE-OPS-001`; this task does not represent them as successful.

## Local verification evidence

The unit regression executes `inventory`, proves a non-loopback restore target exits before restore tooling runs, and proves the load command rejects a missing dispatch/report workload. It does not manufacture a database dump or report live operation success.

An exploratory loopback-only run also produced all three raw workload records (HTTP 404 from an intentionally empty local server); this confirms recording mechanics only, not booking, dispatch, or reporting success.
