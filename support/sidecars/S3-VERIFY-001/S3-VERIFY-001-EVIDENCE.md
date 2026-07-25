# S3-VERIFY-001 Evidence And Blocker Report

## Summary

Current head `b5e35eccab8150d8069213f6708254b1ce939872` was rebased onto
`origin/dev` and re-verified on `2026-07-25`. This pass confirms that the
landed Driver SOS attachment runtime, checksum enforcement, scan lifecycle, and
alert-latency metrics surface are present and exercisable at current head.

The task is still **not closable**. Two acceptance items remain honest external
blockers and one acceptance item is a direct current-head failure:

- Android / iOS offline replay still requires device or simulator evidence.
- Production alert p95 still requires real production observability.
- Forbidden-vocabulary scan is **not green** on current head.

This packet does not defer those gaps to nonexistent `S3-VERIFY-002..005`
tasks. It records the actual state of the single board task `S3-VERIFY-001`.

## Verified Locally

### Repo-local E2E

- `tests/e2e/E2E-017-driver-sos-incident.sh`
  executed on `2026-07-25` against repo-local current-head API runtime
  `http://127.0.0.1:3013` with attachment providers disabled. It verifies:
  - driver realm can `POST /api/driver/sos-events`
  - spoofed `driverId` is overwritten by authenticated driver context
  - correlated `incidentId`, `sosEventId`, and `eventNo` are returned
  - attachment intent fails closed with `state=unavailable` and no fabricated
    `uploadUrl` when providers are disabled
  - driver realm remains blocked from `GET /api/incidents` with `403`

  Evidence:
  - `incidentId=INC-000001`
  - `sosEventId=df0ce043-3a63-4dcb-8223-e55dbbb045e5`
  - `eventNo=SOS-20260725022718-15B2A8`
  - `fleetReportConfirmedAt=2026-07-25T02:27:18.314Z`

### Attachment Upload / Checksum / Scan Runtime

- `support/sidecars/S3-VERIFY-001/verify-attachment-scan.sh`
  executed on `2026-07-25` against repo-local current-head API runtime
  `http://127.0.0.1:3012` with:
  - local controlled S3-compatible stub `http://127.0.0.1:3923`
  - local controlled HTTPS JSON malware scanner stub
    `http://127.0.0.1:3924`

  This verifies:
  - upload intent returns `state=ready` with a presigned SigV4 PUT URL
  - persisted checksum is provider-computed SHA-256, not a client-forged value
  - persisted size is provider-computed, not a client-forged value
  - clean uploads persist `scanStatus=clean`
  - EICAR-marked uploads persist `scanStatus=infected`
  - transient scanner failures persist `scanStatus=error`
  - `retry-scan` clears a transient error without requiring a second upload
  - disallowed content types are rejected at intent time

  Honesty boundary:
  this is **local controlled-provider runtime proof**, not external S3 or
  external malware-provider proof.

### Alert Latency Measurement Surface

- `support/sidecars/S3-VERIFY-001/measure-alert-latency.sh`
  executed on `2026-07-25` against repo-local current-head API runtime
  `http://127.0.0.1:3012`.

  Observed distribution over `n=20` local hermetic samples:
  - `min=25ms`
  - `p50=26ms`
  - `p90=28ms`
  - `p95=29ms`
  - `max=30ms`

  Honesty boundary:
  this is **not** a production p95. It measures API-side timestamp chain plus
  local loopback only.

### API

- `apps/api/tests/unit/driver-sos-attachment.service.test.ts`
- `apps/api/tests/unit/driver-sos-provider-adapters.test.ts`
- `apps/api/tests/unit/driver-sos-verification.repository.test.ts`

Executed on `2026-07-25`: `3` files / `20` tests `PASS`.

These suites cover the landed runtime claims reviewer called out:

- presigned upload intent
- provider-computed SHA-256 and metadata verification
- fail-closed scanner behavior
- unavailable provider behavior without fabricated upload URL
- persisted scan-attempt and retry semantics

### Driver

- `apps/driver-app/tests/unit/driver-sos-attachment-upload.test.ts`
- `apps/driver-app/tests/unit/driver-sos-outbox.test.ts`

Executed on `2026-07-25`: `2` files / `7` tests `PASS`.

These cover current-head driver attachment draft handling, upload metadata
projection, and durable offline outbox behavior.

### Screenshot Runtime Source

- `support/sidecars/DRV-UI-010/DRV-UI-010-VERIFICATION-PACKET.md:71-72`
  identifies the `Incident / SOS` screenshot set.
- `support/sidecars/DRV-UI-010/DRV-UI-010-VERIFICATION-PACKET.md:91-94`
  labels the runtime source as Android native app package
  `com.cctechsupport.drts.driver` at `1080x1920`.
- `support/sidecars/DRV-UI-010/ui-text-snapshots.md:83-95`
  provides auditable extracted text for the captured incident screen.

## Forbidden-Vocabulary Scan

The task-level forbidden-vocabulary gate is **not green** on current head.

### Findings

- `forwarded` / `mirror` remain on SOS-adjacent runtime surfaces:
  - `apps/driver-app/app/incident.tsx:202,799,804,808`
  - `apps/driver-app/app/sos.tsx:1145-1159`
  - `apps/driver-app/tests/unit/driver-sos-outbox.test.ts:59,72`

- `forwarded` remains widespread across broader driver-app task and trip
  surfaces, for example:
  - `apps/driver-app/app/jobs.tsx`
  - `apps/driver-app/app/trip.tsx`
  - `apps/driver-app/lib/trip-workflow.ts`

- `FSD` / `Tesla` / `sandbox` remain present on safety-operator surfaces:
  - `apps/driver-app/app/safety-operator.tsx:1015,1103,1222,1246`
  - `apps/driver-app/lib/safety-operator-fixtures.ts:12,28,63`
  - `apps/driver-app/tests/unit/safety-operator-screen.test.ts:141`

This means the acceptance item `forbidden-vocab scan green` currently fails on
current head and cannot be honestly marked complete.

## External Or Blocked Evidence

### `blocked_ext`: Android / iOS offline replay

The task brief requires real device or simulator evidence for Android and iOS
offline replay. This worker has no such execution surface and must not
substitute local mocks.

### `blocked_ext`: Production alert p95

The local hermetic sampler proves the measurement surface works. It does not
produce a production p95. Real production observability access is still
required.

## Command Record

```bash
python3 scripts/ensure-local-node-modules.py repair
pnpm db:init
pnpm --filter @drts/contracts build
pnpm --filter @drts/api build
```

Executed at repo root on `2026-07-25`: dependency repair, DB verification, and
current-head build all succeeded.

```bash
env DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/drts_fleet_platform \
  DRTS_ENV=local NODE_ENV=development JWT_SECRET=ci-e2e-secret \
  CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret \
  API_HOST=127.0.0.1 API_PORT=3013 node apps/api/dist/main.js
env E2E_API_URL=http://127.0.0.1:3013 E2E_API_PATH_PREFIX=/api \
  bash tests/e2e/E2E-017-driver-sos-incident.sh
```

Executed on `2026-07-25`: `E2E-017` passed on repo-local current head with
attachment providers disabled.

```bash
node support/sidecars/S3-VERIFY-001/attachment-provider-stubs.mjs 3923 3924
env DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/drts_fleet_platform \
  DRTS_ENV=local NODE_ENV=development JWT_SECRET=ci-e2e-secret \
  CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret \
  DRIVER_SOS_PROVIDER_ALLOW_HTTP_LOCAL=true \
  DRIVER_SOS_ATTACHMENT_STORAGE_PROVIDER=s3-compatible \
  DRIVER_SOS_S3_PROVIDER_NAME=s3-compatible \
  DRIVER_SOS_S3_BUCKET=driver-sos-local \
  DRIVER_SOS_S3_REGION=us-east-1 \
  DRIVER_SOS_S3_ENDPOINT=http://127.0.0.1:3923 \
  DRIVER_SOS_S3_FORCE_PATH_STYLE=true \
  DRIVER_SOS_S3_ACCESS_KEY_ID=test \
  DRIVER_SOS_S3_SECRET_ACCESS_KEY=test \
  DRIVER_SOS_ATTACHMENT_SCANNER_PROVIDER=https-json \
  DRIVER_SOS_SCANNER_PROVIDER_NAME=https-json-malware-scanner \
  DRIVER_SOS_SCANNER_URL=http://127.0.0.1:3924 \
  DRIVER_SOS_SCANNER_AUTH_TOKEN=s3-verify-001-scanner-token \
  DRIVER_SOS_SCANNER_TIMEOUT_MS=5000 \
  API_HOST=127.0.0.1 API_PORT=3012 node apps/api/dist/main.js
env E2E_API_URL=http://127.0.0.1:3012 E2E_API_PATH_PREFIX=/api \
  bash support/sidecars/S3-VERIFY-001/verify-attachment-scan.sh
env E2E_API_URL=http://127.0.0.1:3012 E2E_API_PATH_PREFIX=/api SAMPLES=20 \
  bash support/sidecars/S3-VERIFY-001/measure-alert-latency.sh
```

Executed on `2026-07-25`: attachment runtime verification passed and local
hermetic latency measured `p95=29ms`.

```bash
env CI=true pnpm --dir apps/api exec vitest run \
  tests/unit/driver-sos-attachment.service.test.ts \
  tests/unit/driver-sos-provider-adapters.test.ts \
  tests/unit/driver-sos-verification.repository.test.ts --reporter=dot

env CI=true pnpm --dir apps/driver-app exec vitest run \
  tests/unit/driver-sos-attachment-upload.test.ts \
  tests/unit/driver-sos-outbox.test.ts --reporter=dot
```

Executed on `2026-07-25`: API `3` files / `20` tests `PASS`; driver-app
`2` files / `7` tests `PASS`.

```bash
git grep -nE 'FSD|自駕|Tesla|sandbox|safety operator|external platform badge' -- \
  apps/driver-app support/sidecars/DRV-UI-010 tests/e2e support/sidecars/S3-VERIFY-001
git grep -nE 'forwarded|mirror' -- \
  apps/driver-app support/sidecars/DRV-UI-010 tests/e2e support/sidecars/S3-VERIFY-001
```

Executed on `2026-07-25`: current head is not forbidden-vocabulary green.
