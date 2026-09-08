# SR-OPS-PROOF-001 — isolated restore and workload-proof preparation

## Evidence provenance

- Base SHA refreshed on 2026-09-08: `c4c4a35f88907df6bf68e781059dde397c06ba03` (`origin/dev`). Previous `70355aba…` evidence is historical.
- Candidate SHA is intentionally emitted by every harness run and must be replaced by the final handoff candidate evidence.
- Source baseline: `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`.

## What this task makes repeatable

`tools/system-remediation/ops-proof/ops-proof.sh` has three deliberately separate commands:

1. `inventory --output evidence/inventory.json` records the read-only present-state review and states the live gates that were not exercised.
2. `restore --snapshot SNAPSHOT --isolated-database-url URL --output evidence/restore.json` restores exactly one supplied PostgreSQL dump and reads back `ops.orders`, `billing.driver_statements`, and `admin.audit_logs` counts.
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
