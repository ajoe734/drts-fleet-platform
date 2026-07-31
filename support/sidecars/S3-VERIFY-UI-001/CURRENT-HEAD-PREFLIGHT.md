# S3-VERIFY-UI-001 Current-Head Preflight

## Control

| Field                   | Value                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| Primary task            | `S3-VERIFY-UI-001`                                                |
| Verification slices     | `S3-VERIFY-001..005`                                              |
| Owner                   | Fleet G                                                           |
| Implementation commit   | `778be942a`                                                       |
| Merged integration base | `29769289ce91aac57007953d89b7fa0559fe4d3b`                        |
| Working branch          | `codex/s3-verify-ui-001-final`                                    |
| Inspection date         | `2026-07-24`                                                      |
| Requirement             | `10_full_17_screen_fleets_execution_tasks_20260724.md`, section 9 |
| Scope decision          | Close repository-owned S-3 gaps without rebuilding S-3 screens.   |

The repository-owned implementation was replayed onto the merged rating and
certificate integration base. All commands below were run from the integrated
branch. No canonical design or specification file was edited.

## Result

| Slice                                   | Current result               | Release interpretation                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `S3-VERIFY-001` API/Driver/Ops          | `local_pass`                 | Current-head API, Driver, Ops, database, and hermetic checks pass.                                                                                                                                           |
| `S3-VERIFY-002` physical offline replay | `blocked_ext`                | Local durable-outbox and replay tests pass, but Android and iOS physical-device execution was not available.                                                                                                 |
| `S3-VERIFY-003` attachment scanning     | `local_pass` + `blocked_ext` | Upload intent, provider metadata verification, fail-closed scan state, Driver retry, persistence, audit, and tests are implemented. External malware-scanner contract/provider evidence remains unavailable. |
| `S3-VERIFY-004` alert-to-Ops p95        | `local_pass` + `blocked_ext` | The end-to-end timestamps and per-alert latency are implemented and hermetically exercised. Production traces and p95 remain unavailable and are not inferred from local samples.                            |
| `S3-VERIFY-005` forbidden vocabulary    | `local_pass_after_repair`    | Current-head visible-copy scan returns no forbidden vocabulary.                                                                                                                                              |

Fleet G is locally green for all repository-implementable checks.
`S3-VERIFY-UI-001` is not a production verification PASS while the explicit
physical-device, external scanner, and production-observability evidence
remains blocked.

## Existing Branch Reconciliation

### Verification branches

- `origin/gemini/s3-verify-001` was inspected. It is based on an older head and
  adds historical logs, two PNGs, and a claimed p95 benchmark.
- `origin/codex/s3-verify-001` was inspected. Its blocker analysis correctly
  distinguishes local tests from physical-device, attachment-provider, and
  production-observability evidence.
- Sidecar acceptance and unblock branches under both namespaces were inspected
  as supporting history. None was cherry-picked.

The Gemini evidence packet was not copied because several claims are not valid
on the authoritative head:

1. `db:verify` proves the attachment table and constraints exist. It does not
   prove upload, checksum enforcement, malware scanning, or per-file retry.
2. Its `0.023 ms` benchmark measures a local enqueue operation. It does not
   measure `fleetReportConfirmedAt -> opsAlertRenderedAt` in production.
3. `ops-console-sos-dashboard.png` is a general dispatch queue screenshot, not
   an Ops SOS dashboard.
4. `driver-app-sos-screen.png` is useful historical device evidence, but it was
   captured on an older head and does not prove the repaired current-head copy.
5. E2E-018 and E2E-021 verify device lifecycle and heartbeat replay. They do not
   replace Android/iOS SOS offline replay.

### Product branches

- `origin/codex/s3-ui-driver-001` and
  `origin/gemini/s3-ui-driver-001` are behind current `dev`; their S-3 Driver
  product files are already present on the authoritative head.
- `origin/codex/s3-ui-ops-001` and `origin/gemini/s3-ui-ops-001` are also behind
  current `dev`; their S-3 Ops product files are already present.

No product branch was merged or cherry-picked, and no S-3 screen was rebuilt.

## Reproducible Current-Head Evidence

### API

Current implementation commands:

```bash
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api lint
pnpm --dir apps/api exec vitest run \
  tests/unit/driver-sos.service.test.ts \
  tests/unit/driver-sos-attachment.service.test.ts \
  tests/unit/driver-sos-incident.test.ts \
  tests/integration/int-s3-001-driver-sos-idempotency.test.ts
pnpm --filter @drts/api test
```

Results:

- targeted S-3: `4` files and `15` tests passed;
- full API: `129` files and `870` tests passed;
- API TypeScript and ESLint passed.

This verifies:

- authenticated Driver SOS submission and realm restrictions;
- replay idempotency with exactly one SOS event, incident, timeline, and urgent
  alert outbox record;
- Ops incident list/detail/timeline read-model envelopes;
- first-writer-wins assignment conflict handling;
- incident event publication and local re-emission;
- resolved-incident matching-suppression release.
- explicit storage-provider unavailable state without an upload URL;
- upload-intent metadata validation and hermetic scanner outcomes;
- first-write-wins Ops render receipts and latency computation.

This is local API and unit/integration proof. It is not production
observability proof.

The full suite rewrote unrelated, tracked MAP evidence JSON as a test side
effect; those non-S-3 changes were discarded and are not part of this branch.

### Driver

Commands:

```bash
pnpm --filter @drts/driver-app test
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app lint
```

Results:

- `25` files and `119` tests passed;
- TypeScript passed;
- ESLint passed with zero warnings.

The targeted S-3 tests additionally cover valid UUID v4 client event IDs,
storage unavailable, upload/confirm, visible scan unavailable state, scanner
retry without duplicate upload, and attachment-pending state that does not
roll back an accepted SOS.

The React renderer emits pre-existing `act(...)` environment warnings in the
targeted incident tests. The tests still exit `0`; the warning is not used as
device evidence.

### Ops

Commands:

```bash
pnpm --filter @drts/ops-console-web test
pnpm --dir apps/ops-console-web exec vitest run \
  tests/unit/sos-view-model.test.ts --reporter=dot
```

Results:

- full Ops suite: `7` files and `29` tests passed;
- targeted SOS view model: `1` file and `3` tests passed;
- Ops TypeScript and ESLint passed.

The targeted tests verify SOS-only incident detection, critical-pending
priority, Driver/vehicle label enrichment, and de-duplication of alert render
receipts.

### Database

Command:

```bash
pnpm db:verify
```

Results:

- `V0061__s3_attachment_scan_and_alert_latency.sql` applied to localhost;
- `db:verify` passed with `56` schema migrations present.

The migration adds upload intents, scanner status/retry metadata, SHA-256 and
positive-size constraints, and the alert-render timestamp/latency fields.
Fleet coordination reserved `V0058`, `V0059`, and `V0060` for other work;
S-3 uses only `V0061`.

### Hermetic API scenarios

Current command:

```bash
pnpm --filter @drts/api build
API_START_CMD='pnpm --filter @drts/api start' \
  ./tests/e2e/run-e2e-hermetic.sh 017
```

Result: `PASS (1): 017`, `FAIL (0)`.

E2E-017 created one self-scoped Driver SOS, returned
`fleetReportConfirmedAt`, proved missing storage returns `unavailable` with no
`uploadUrl`, kept Driver out of the incident list, and recorded
`opsAlertRenderedAt`, `opsAlertReceiptRecordedAt`, and a nonnegative
`alertToOpsLatencyMs`.

The run produced a `178 ms` hermetic sample. It is only reproducible local
evidence that the timestamp chain is computable; it is not a production p95.

## Reproduced Product Repair

The current Driver SOS projection displayed the forbidden copy
`forwarded order`, `mirror order`, and Chinese mirror terminology. The domain
fields were valid, but the displayed copy violated `S3-VERIFY-005`.

The repair is limited to S-3-owned Driver files:

- `apps/driver-app/app/sos.tsx`
  - `forwarded order` -> `cross-platform order` in localized Chinese copy;
  - `mirror order` -> `related order` in localized Chinese copy;
  - related labels were localized without changing payload fields.
- `apps/driver-app/app/incident.tsx`
  - displayed mirror terminology -> related-order terminology.
- `apps/driver-app/tests/unit/incident-screen.test.ts`
  - expected SOS incident projection updated.

No transport property, contract, route, dispatch behavior, or canonical design
file changed.

## Forbidden-Vocabulary Check

Required projection terms:

```text
FSD
自駕
Tesla
sandbox
forwarded
mirror
external platform badge
safety operator
```

Current-head visible-copy scan:

```bash
rg -n -i \
  'FSD|自駕|Tesla|sandbox|forwarded order|mirror order|external platform badge|safety operator|鏡像' \
  apps/driver-app/app/sos.tsx \
  apps/driver-app/app/incident.tsx \
  apps/ops-console-web/app/sos \
  apps/ops-console-web/lib/sos-view-model.ts
```

Result after the repair: no visible-copy matches.

Internal identifiers such as `forwarded`, `mirrorOrderId`, and test fixture IDs
remain because they are transport/domain implementation names and are not
rendered labels. Renaming them would be an unrelated contract migration and is
not required by the projection rule.

## Attachment Scan Implementation

The repository-owned workflow is now implemented:

- Driver requests a short-lived upload intent after the SOS receipt exists;
- storage and scanner are injected provider ports;
- no storage provider returns explicit `storage_provider_unavailable` with no
  upload URL;
- confirm trusts provider-inspected object metadata, not client checksum input;
- content type, positive size, count, and SHA-256 format are enforced;
- missing scanner persists `scanStatus=unavailable` and stays fail closed;
- clean, infected, error, unavailable, and retry outcomes are audited and
  persisted per attachment;
- initial and supplemental Driver attachments use the same retryable workflow.

Hermetic fake providers prove port behavior only. They are not represented as
an external malware provider or production provider success.

## Alert Timestamp Implementation

The outbox now stores:

- `fleetReportConfirmedAt`;
- `opsAlertRenderedAt`, captured after the Ops SOS queue paints;
- `opsAlertReceiptRecordedAt`, captured by the API;
- `alertToOpsLatencyMs`, computed from fleet confirmation to Ops render.

Database conditional update plus `RETURNING` enforces first-write-wins across
API instances. No local duration is labeled as production p95.

## Explicit External Blockers

### `blocked_ext`: Android physical-device SOS offline replay

Required evidence includes disabling data, placing the emergency call, queuing
the fleet report, restarting the app, reconnecting, proving one Incident, and
preserving the original timestamp on a real Android device. No current-head
device session was available.

### `blocked_ext`: iOS physical-device SOS offline replay

The worker host is Linux and has no Xcode/iOS device environment. Local Vitest
and heartbeat replay cannot replace this evidence.

### `blocked_ext`: attachment scan provider

No external malware-scanning contract, credentials, callback environment,
quarantine store, or provider report was available. The repository provider
port is ready, but external provider execution remains blocked.

### `blocked_ext`: production observability

No production metric access or trace sample was available for
`fleetReportConfirmedAt -> opsAlertRenderedAt`. The fields now exist and are
computable, but the hermetic sample, Postgres event lag, and UI unit timing are
not production p95 substitutes.

## Remaining Closeout Work

1. Execute Android and iOS physical-device SOS offline replay.
2. Bind and validate the external storage/malware-scanner contract and retain
   provider/quarantine evidence.
3. Observe production
   `fleetReportConfirmedAt -> opsAlertRenderedAt` and report production p95.

## Publication Boundary

This worktree does not deploy or release any application. It contains S-3-owned
backend, Driver, Ops, contract/schema, tests, and this verification sidecar.
