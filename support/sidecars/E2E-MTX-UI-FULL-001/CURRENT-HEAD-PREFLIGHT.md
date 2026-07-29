# E2E-MTX-UI-FULL-001 Current-Head Preflight

## Control

| Field                | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| Task ID              | `E2E-MTX-UI-FULL-001`                                  |
| Fleet                | H                                                      |
| Baseline             | `origin/dev@cf26c0c43`                                 |
| Evidence date        | `2026-07-24`                                           |
| Canonical packet     | `10_full_17_screen_fleets_execution_tasks_20260724.md` |
| Candidate            | `codex/mtx-release-gaps-20260724`                      |
| Owned change surface | Repository release gaps, tests, and this sidecar       |
| Deployment           | Not performed                                          |

The candidate starts from the final 17-screen census and closes the
repository-owned fare producer, certificate writer/regeneration, payment
recovery command, legal-hold action, SOS provider-adapter, and persisted p95
instrumentation gaps. It does not claim that hermetic tests are live-provider,
physical-device, or production-environment evidence.

## Acceptance Decision

| Acceptance area                                     | Result          | Interpretation                                                                                                                                                                                    |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exactly 17 approved Screen IDs                      | `verified`      | The automated census asserts the canonical ID set and rejects duplicates or omissions.                                                                                                            |
| Production route or embedded surface for 17 screens | `verified`      | Every ID maps to an existing production route source and explicit `data-screen-id` or typed `screenId` surface marker.                                                                            |
| Backend read/command authority source               | `verified`      | Every screen group maps to an existing production controller authority.                                                                                                                           |
| Forbidden control boundary                          | `verified`      | Census rejects queue bypass endpoints/controls, fare amount overrides, and payment mark-paid controls; legal hold uses canonical evidence governance.                                             |
| Migration order                                     | `verified`      | `V0059` through `V0063` exist in sequence and were applied to the local verification database.                                                                                                    |
| Full persisted cross-surface positive flow          | `partial`       | No current suite persists one identity through authorization, queue, Passenger, fare/payment/certificate, rating, record, and export. Existing browser suites cannot be combined into that claim. |
| Full negative cross-surface flow                    | `partial`       | Feature-local negative tests exist, but no single persisted suite proves the full canonical sequence and readback.                                                                                |
| Fare anomaly producer                               | `verified`      | Assignment records canonical anomalies and resolves prior order anomalies only after a valid route/fare assignment.                                                                               |
| Payment recovery                                    | `verified_repo` | Authorized, idempotent, audited commands and UI exist; the default provider remains fail-closed and no mark-paid action exists.                                                                   |
| Certificate writer/regeneration                     | `verified_repo` | Completion writer, HTML/PDF artifacts, `V0062`, and audited idempotent regeneration exist.                                                                                                        |
| Legal hold create/release                           | `verified_repo` | Records UI calls the existing evidence-governance authority and handles confirmation, 403, 409, and 503.                                                                                          |
| S3 adapters and p95 instrumentation                 | `verified_repo` | S3-compatible storage, HTTPS scanner, actual object SHA-256 inspection, and persisted p95 query/display are implemented.                                                                          |
| S3 physical-device and production evidence          | `blocked_ext`   | Android/iOS physical replay, real storage/scanner execution, and production alert-to-Ops samples are unavailable.                                                                                 |
| Live fare and PSP execution                         | `blocked_ext`   | No live provider execution was available for this acceptance run.                                                                                                                                 |

## Release Verdict

The 17/17 production screen implementation and the listed repository-owned
release gaps are verified. The candidate is ready for PR/CI and staging
evaluation, but **not for unconditional production approval** until the P0
live-provider, physical-device, and production-trace evidence exists. The
single persisted cross-surface journey remains a P1 acceptance gap.

## Evidence Rules

- `PW-L` means a browser test using a local production route and local API
  process. It is not a production-environment run.
- `PW-C` means a browser test with controlled, mocked, or fixture API responses.
  It is rendering and interaction evidence only.
- Unit and integration tests establish contracts and authority behavior. They
  do not substitute for a persisted browser journey.
- Controlled browser tests remain classified `PW-C`; they do not manufacture a
  production claim.
- Provider adapters default to unavailable when environment configuration is
  absent.
- No test or UI can mark a failed/manual-recovery payment as paid.

The complete per-screen classification is in `EVIDENCE-MATRIX.md`.

## Repository-Owned Gaps

1. Add a true persisted cross-surface acceptance harness using one set of
   authorization, vehicle, order, trip, rating, record, and export identifiers.
   Positive flow must not use `page.route()` to create success.
2. Add Passenger browser coverage for disclosure, payment/certificate states,
   and rating submission against the same persisted journey.

## Command-Gated Gaps

There are no remaining repository `blocked_command` items in this closeout
wave. Live payment and fare execution stays disabled until an approved provider
adapter is provisioned with external credentials.

## External Evidence Gaps

- Android and iOS physical-device SOS offline replay.
- Real S3-compatible storage and malware scanner execution.
- Production `fleetReportConfirmedAt -> opsAlertRenderedAt` traces and p95.
- Live fare-provider and PSP execution evidence.

## Verification

Integrated candidate command results:

```text
Fleet H route/contract census: PASS, 1 file / 5 tests
API full suite: PASS, 138 files / 965 tests
Root unit suite: PASS
Workspace typecheck: PASS, 27/27 tasks
Workspace lint: PASS, 20/20 tasks
i18n guard: PASS, 461 files / 0 exemptions
Certificate Playwright: PASS, 7/7
Payment Playwright: PASS, 5/5
Records/legal-hold Playwright: PASS, 1/1
V0062/V0063 local migration apply: PASS
Database verification after apply: PASS, 61 migrations
git diff --check: PASS
```

No deployment or production provider call was performed. Local migration and
controlled browser results are repository acceptance evidence only.
