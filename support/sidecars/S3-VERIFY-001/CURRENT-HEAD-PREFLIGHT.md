# S3-VERIFY-001 Current-Head Preflight

## Scope

- Task: `S3-VERIFY-001`
- Owner: `Codex`
- Reviewer: `Claude2`
- Inspected product/runtime commit: `b5e35eccab8150d8069213f6708254b1ce939872`
- Inspection date: `2026-07-25`

## Current-Head Inventory

| Acceptance slice                                    | Status                        | Evidence anchors                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| current-head driver/API E2E                         | `verified_repo_local`         | `tests/e2e/E2E-017-driver-sos-incident.sh` passed on `2026-07-25` against repo-local current-head API runtime `http://127.0.0.1:3013` with attachment providers disabled; evidence: `incidentId=INC-000001`, `sosEventId=df0ce043-3a63-4dcb-8223-e55dbbb045e5`, `eventNo=SOS-20260725022718-15B2A8`, fail-closed attachment intent `state=unavailable`, driver incident-list still `403`.              |
| attachment upload / checksum / scan / retry runtime | `verified_repo_local_nonprod` | `support/sidecars/S3-VERIFY-001/verify-attachment-scan.sh` passed on `2026-07-25` against repo-local current-head API runtime `http://127.0.0.1:3012` plus local controlled providers `127.0.0.1:3923/3924`; verifies presigned PUT, provider-computed SHA-256, infected verdict, retryable error -> clean rescan, and content-type rejection.                                                         |
| attachment adapter / repository tests               | `verified`                    | `apps/api/tests/unit/driver-sos-attachment.service.test.ts`, `apps/api/tests/unit/driver-sos-provider-adapters.test.ts`, `apps/api/tests/unit/driver-sos-verification.repository.test.ts` passed (`3` files / `20` tests).                                                                                                                                                                             |
| driver offline durable outbox + replay state        | `verified`                    | `apps/driver-app/tests/unit/driver-sos-attachment-upload.test.ts`, `apps/driver-app/tests/unit/driver-sos-outbox.test.ts` passed (`2` files / `7` tests).                                                                                                                                                                                                                                              |
| alert latency measurement surface                   | `measured_repo_local_nonprod` | `support/sidecars/S3-VERIFY-001/measure-alert-latency.sh` against `http://127.0.0.1:3012` measured `n=20`, `min=25ms`, `p50=26ms`, `p90=28ms`, `p95=29ms`, `max=30ms`; explicitly local hermetic loopback only, not production.                                                                                                                                                                        |
| screenshot evidence with runtime source label       | `partial`                     | `support/sidecars/DRV-UI-010/DRV-UI-010-VERIFICATION-PACKET.md:71-72,91-94`, `support/sidecars/DRV-UI-010/ui-text-snapshots.md:83-95`.                                                                                                                                                                                                                                                                 |
| Android / iOS physical offline replay               | `blocked_ext`                 | No device or emulator execution in this worker; task brief forbids replacing device evidence with local mock.                                                                                                                                                                                                                                                                                          |
| production alert p95                                | `blocked_ext`                 | Current head now exposes a measurable latency surface, but this worker has no production observability path; only local hermetic numbers were produced.                                                                                                                                                                                                                                                |
| forbidden-vocabulary scan                           | `failed_current_head`         | Current head is not green. `forwarded` / `mirror` remain on SOS-adjacent and broader driver-app surfaces (`apps/driver-app/app/incident.tsx:202,799,804,808`, `apps/driver-app/app/sos.tsx:1145-1159`) and `FSD` / `Tesla` / `sandbox` remain on safety-operator surfaces (`apps/driver-app/app/safety-operator.tsx:1015,1103,1222,1246`, `apps/driver-app/lib/safety-operator-fixtures.ts:12,28,63`). |

## Commands Executed

```bash
python3 scripts/ensure-local-node-modules.py repair
pnpm db:init
pnpm --filter @drts/contracts build
pnpm --filter @drts/api build
```

Executed at repo root on `2026-07-25`.

Result: local worktree dependencies repaired, migrations/seeds verified, and the
rebased current-head API build artifacts were regenerated for repo-local
verification.

```bash
env DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/drts_fleet_platform \
  DRTS_ENV=local NODE_ENV=development JWT_SECRET=ci-e2e-secret \
  CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret \
  API_HOST=127.0.0.1 API_PORT=3013 node apps/api/dist/main.js
env E2E_API_URL=http://127.0.0.1:3013 E2E_API_PATH_PREFIX=/api \
  bash tests/e2e/E2E-017-driver-sos-incident.sh
```

Executed on `2026-07-25`.

Result: `E2E-017` passed against repo-local current head with attachment
providers disabled, proving the fail-closed attachment-intent branch still
returns `state=unavailable` and no fabricated upload URL.

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

Executed on `2026-07-25`.

Result: attachment runtime verification passed against current head on a local
controlled-provider stack, and the local hermetic alert-latency sampler
measured `p95=29ms` (`n=20`).

```bash
env CI=true pnpm --dir apps/api exec vitest run \
  tests/unit/driver-sos-attachment.service.test.ts \
  tests/unit/driver-sos-provider-adapters.test.ts \
  tests/unit/driver-sos-verification.repository.test.ts --reporter=dot

env CI=true pnpm --dir apps/driver-app exec vitest run \
  tests/unit/driver-sos-attachment-upload.test.ts \
  tests/unit/driver-sos-outbox.test.ts --reporter=dot
```

Executed on `2026-07-25`.

Result: API `3` files / `20` tests `PASS`; driver-app `2` files / `7` tests
`PASS`.

```bash
git grep -nE 'FSD|自駕|Tesla|sandbox|safety operator|external platform badge' -- \
  apps/driver-app support/sidecars/DRV-UI-010 tests/e2e support/sidecars/S3-VERIFY-001
git grep -nE 'forwarded|mirror' -- \
  apps/driver-app support/sidecars/DRV-UI-010 tests/e2e support/sidecars/S3-VERIFY-001
```

Executed on `2026-07-25`.

Result: current head is not forbidden-vocabulary green; `forwarded` / `mirror`
remain widespread and `FSD` / `Tesla` / `sandbox` remain present on
safety-operator surfaces.

## Remaining Delta

1. `current-head E2E green` is satisfied, but only by splitting the current
   head into two honest local runtime modes:
   provider-disabled for `E2E-017` fail-closed behavior, and provider-enabled
   for attachment verification.
2. Android and iOS offline replay remain honest `blocked_ext`.
3. Attachment scan is now verified repo-locally against the landed runtime, but
   the evidence is explicitly local controlled-provider proof, not external S3
   or external malware-provider proof.
4. Alert latency is now measured repo-locally; production p95 remains
   `blocked_ext`.
5. Forbidden-vocabulary acceptance is currently failing on current head, so
   `S3-VERIFY-001` cannot honestly close as fully accepted verification.
