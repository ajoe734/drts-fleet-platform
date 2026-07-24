# E2E-MTX-UI-FULL-001 Current-Head Preflight

## Control

| Field                | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| Task ID              | `E2E-MTX-UI-FULL-001`                                  |
| Fleet                | H                                                      |
| Baseline             | `origin/dev@1021f3e8c`                                 |
| Evidence date        | `2026-07-24`                                           |
| Canonical packet     | `10_full_17_screen_fleets_execution_tasks_20260724.md` |
| Owned change surface | Fleet H unit contract and this sidecar only            |
| Deployment           | Not performed                                          |

The baseline includes all merged feature work through `P5-HOLD-001`, including
fare migration `V0059`, payment migration `V0060`, and S3 migration `V0061`.
This packet performs a source and evidence census. It does not claim that a
route/contract census is a live-provider or persisted cross-surface E2E.

## Acceptance Decision

| Acceptance area                                     | Result                     | Interpretation                                                                                                                                                                                    |
| --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exactly 17 approved Screen IDs                      | `verified`                 | The automated census asserts the canonical ID set and rejects duplicates or omissions.                                                                                                            |
| Production route or embedded surface for 17 screens | `verified`                 | Every ID maps to an existing production route source and explicit `data-screen-id` or typed `screenId` surface marker.                                                                            |
| Backend read/command authority source               | `verified`                 | Every screen group maps to an existing production controller authority.                                                                                                                           |
| Forbidden control boundary                          | `verified`                 | Census rejects queue bypass endpoints/controls, fare amount overrides, payment mark-paid controls, and enabled legal-hold mutations.                                                              |
| Migration order                                     | `verified`                 | `V0059`, `V0060`, and `V0061` exist in sequence.                                                                                                                                                  |
| Full persisted cross-surface positive flow          | `partial` / `blocked_repo` | No current suite persists one identity through authorization, queue, Passenger, fare/payment/certificate, rating, record, and export. Existing browser suites cannot be combined into that claim. |
| Full negative cross-surface flow                    | `partial` / `blocked_repo` | Feature-local negative tests exist, but no single persisted suite proves the full canonical sequence and readback.                                                                                |
| Payment recovery                                    | `blocked_command`          | No approved mutation/provider contract exists. The read UI remains fail-closed and does not invent mark-paid.                                                                                     |
| Certificate regeneration                            | `blocked_command`          | No approved regeneration command exists; the control remains disabled.                                                                                                                            |
| S3 physical-device and production evidence          | `blocked_ext`              | Android/iOS physical replay, external malware scanner evidence, and production alert-to-Ops p95 are unavailable.                                                                                  |
| Live fare and PSP execution                         | `blocked_ext`              | No live provider execution was available for this acceptance run.                                                                                                                                 |

## Release Verdict

The 17/17 production screen implementation is verified at source/contract
level. The program is **not ready for an unconditional production release**
under the full-suite acceptance definition because the persisted cross-surface
flow is not implemented, fare anomaly production wiring and the certificate
writer remain repository gaps, and the command/external blockers above remain
open.

This verdict does not reject the merged read-only and fail-closed screens. It
separates their implementation completion from evidence that has not actually
been produced.

## Evidence Rules

- `PW-L` means a browser test using a local production route and local API
  process. It is not a production-environment run.
- `PW-C` means a browser test with controlled, mocked, or fixture API responses.
  It is rendering and interaction evidence only.
- Unit and integration tests establish contracts and authority behavior. They
  do not substitute for a persisted browser journey.
- No Fleet H test uses `page.route()` or starts four services to manufacture a
  successful flow.
- No provider, payment recovery command, certificate writer, fare producer, or
  legal-hold mutation is added by Fleet H.

The complete per-screen classification is in `EVIDENCE-MATRIX.md`.

## Repository-Owned Gaps

1. Wire the production quote workflow to record and resolve canonical fare
   anomalies. The read/retry authority exists, but the production producer is
   not connected.
2. Implement the production certificate writer/artifact pipeline that persists
   completed-trip receipts and HTML/PDF references. Certificate Support
   correctly fails closed when this source is absent.
3. Add a true persisted cross-surface acceptance harness using one set of
   authorization, vehicle, order, trip, rating, record, and export identifiers.
   Positive flow must not use `page.route()` to create success.
4. Add Passenger browser coverage for disclosure, payment/certificate states,
   and rating submission against the same persisted journey.

## Command-Gated Gaps

- Payment recovery remains disabled until an approved idempotent mutation,
  provider adapter, authorization rule, and audit receipt exist.
- Certificate regeneration remains disabled until an approved command and
  writer pipeline exist.
- Legal-hold create/release remain disabled until evidence-governance mutation
  commands are approved. Canonical hold read/filter is already present.

## External Evidence Gaps

- Android and iOS physical-device SOS offline replay.
- External malware scanner contract/provider execution.
- Production `fleetReportConfirmedAt -> opsAlertRenderedAt` traces and p95.
- Live fare-provider and PSP execution evidence.

## Verification

Final command results:

```text
Fleet H route/contract census: PASS, 1 file / 5 tests
Existing feature evidence: inventoried in EVIDENCE-MATRIX.md from merged sidecars
Root typecheck: BLOCKED_ENV, isolated worktree lacks workspace package links
i18n guard: PASS, 461 files / 0 exemptions
git diff --check: PASS
```

The root typecheck reached the new test and identified one strict indexed-access
error, which was corrected before the final census rerun. The remaining errors
are unresolved package imports such as `@nestjs/common` from workspace-local
dependencies that are absent in this isolated worktree; they are not source
diagnostics introduced by these three files.

No existing heavy suite was rerun. Its exact unit, integration, and controlled
Playwright evidence is classified in the matrix from merged feature sidecars.
No deployment, push, migration execution, or production provider call is part
of this Fleet H commit.
