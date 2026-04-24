# DRTS Platform — Smoke Test Suite

Critical-path smoke harness for the DRTS staging (and local) API.

## Structure

```
tests/smoke/
├── lib/
│   └── helpers.sh          # Shared HTTP helpers, logging, state management
├── fixtures/
│   ├── booking-create.json
│   ├── dispatch-assign.json
│   ├── driver-task-accept.json
│   ├── billing-invoice.json
│   └── report-export.json
├── 01-health.sh
├── 02-booking-create.sh
├── 03-dispatch-assign.sh
├── 04-driver-task-accept.sh
├── 05-billing-invoice.sh
└── 06-report-export.sh
```

## Coverage

| Test                  | Critical path                                          |
| --------------------- | ------------------------------------------------------ |
| 01-health             | `GET /api/health` — API reachable                      |
| 02-booking-create     | `POST /api/tenant/bookings` + read-back                |
| 03-dispatch-assign    | `GET /api/dispatch/tasks`, `POST /api/dispatch/assign` |
| 04-driver-task-accept | `POST /api/driver/tasks/:id/accept` + status verify    |
| 05-billing-invoice    | `POST /api/tenant/invoices/generate` + retrieve        |
| 06-report-export      | `POST /api/reports/jobs` + poll to completed           |

Tests 03–04 are gracefully skippable when staging DB is empty (they log a warning and exit 0).

## Running

```bash
# Against protected staging — IAP bearer token + bootstrap app identity
export SMOKE_API_URL=https://api.staging.drts-fleet.cctech-support.com   # bare origin, no /api suffix
export SMOKE_AUTH_BEARER_TOKEN="$(./scripts/print-staging-iap-token.sh)"
export SMOKE_ACTOR_TYPE=system
export SMOKE_ACTOR_ID=smoke-system-001
export SMOKE_TENANT_ID=10000000-0000-0000-0000-000000000201   # TEN_ACME from S0002 seed
./scripts/run-smoke-tests.sh

# Against local dev
./scripts/run-smoke-tests.sh

# Run a single test
./scripts/run-smoke-tests.sh --suite "02"

# Verbose output on failure
./scripts/run-smoke-tests.sh --verbose
```

See `scripts/run-smoke-tests.sh --help` for the full option reference.

## Auth model

**The smoke harness now supports both IAP/OIDC Bearer auth and legacy bootstrap-header auth.**

Preferred order:

1. set `SMOKE_AUTH_BEARER_TOKEN` when the target staging service is protected by IAP / OIDC
2. keep bootstrap headers for the application-level actor / realm identity during the phased control-plane cutover
3. use bootstrap-only headers for local dev or direct non-IAP paths

There is still no `/api/auth/login` endpoint.

`lib/helpers.sh` sends the following headers automatically on every request:

| Header                | Env var                   | Default                                                          |
| --------------------- | ------------------------- | ---------------------------------------------------------------- |
| `authorization`       | `SMOKE_AUTH_BEARER_TOKEN` | unset; preferred when staging requires Bearer auth               |
| `x-actor-type`        | `SMOKE_ACTOR_TYPE`        | `system`                                                         |
| `x-actor-id`          | `SMOKE_ACTOR_ID`          | `smoke-system-001`                                               |
| `x-realm`             | `SMOKE_REALM`             | derived from actor type                                          |
| `x-tenant-id`         | `SMOKE_TENANT_ID`         | S0002 TEN_ACME UUID                                              |
| `x-drts-internal-key` | `SMOKE_INTERNAL_KEY`      | unset by default; required when staging sets `DRTS_INTERNAL_KEY` |

When `SMOKE_AUTH_BEARER_TOKEN` is present, the outer IAP boundary is satisfied first.
Bootstrap headers still carry the application-level caller identity for the current staged
control-plane migration.

## Staging URL and `/api` path prefix

`SMOKE_API_URL` must be the **bare origin** (scheme + host, no trailing slash, no path).

`lib/helpers.sh` automatically prepends `SMOKE_API_PATH_PREFIX` (default `/api`) to every
path before building the curl URL. This matches the NestJS global prefix configured in
`apps/api/src/main.ts` (`app.setGlobalPrefix("api", { exclude: ["health"] })`).

```bash
# Correct — bare origin only:
export SMOKE_API_URL=https://api.staging.drts-fleet.cctech-support.com
# helpers.sh produces: https://api.staging.drts-fleet.cctech-support.com/api/tenant/bookings  ✓
```

Do **not** append `/api` to `SMOKE_API_URL` — that would double-prefix every path:

```bash
# Wrong:
export SMOKE_API_URL=https://api.staging.drts-fleet.cctech-support.com/api
# helpers.sh would produce: .../api/api/tenant/bookings  ✗
```

If the ingress layer already strips the `/api` prefix (non-standard), override:

```bash
export SMOKE_API_PATH_PREFIX=""
```

Confirm the correct base URL from the Cloud Run service URL in the `WE-003` deploy config.

## Printing an IAP token

The repo includes a helper for the current staging IAP client:

```bash
./scripts/print-staging-iap-token.sh
```

Defaults:

- project: `autotaxi-492811`
- IAP client id / audience: `1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com`
- impersonated service account: `github-actions-deployer@autotaxi-492811.iam.gserviceaccount.com`

Override with:

```bash
DRTS_GCP_PROJECT_ID=autotaxi-492811 \
DRTS_STAGING_IAP_CLIENT_ID=...apps.googleusercontent.com \
DRTS_STAGING_TOKEN_SERVICE_ACCOUNT=github-actions-deployer@autotaxi-492811.iam.gserviceaccount.com \
./scripts/print-staging-iap-token.sh
```

## Environment variables

| Variable                  | Default                                | Description                                                                  |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `SMOKE_API_URL`           | `http://localhost:3001`                | API bare origin — no trailing slash, no path prefix (see note above)         |
| `SMOKE_API_PATH_PREFIX`   | `/api`                                 | Prepended to every path; matches NestJS global prefix — set `""` to skip     |
| `SMOKE_AUTH_BEARER_TOKEN` | _(unset)_                              | Preferred Bearer token for protected staging / IAP                           |
| `SMOKE_ACTOR_TYPE`        | `system`                               | Bootstrap auth actor type (`x-actor-type` header)                            |
| `SMOKE_ACTOR_ID`          | `smoke-system-001`                     | Bootstrap auth actor ID (`x-actor-id` header)                                |
| `SMOKE_REALM`             | _(derived from actor type)_            | Override only when realm differs from actor-type default                     |
| `SMOKE_TENANT_ID`         | `10000000-0000-0000-0000-000000000201` | TEN_ACME from S0002 seed; sent as `x-tenant-id`                              |
| `SMOKE_INTERNAL_KEY`      | _(unset)_                              | Optional internal gate header; defaults from `DRTS_INTERNAL_KEY` if exported |
| `SMOKE_DRIVER_ID`         | `10000000-0000-0000-0000-000000000381` | 張司機 from S0002 seed; used in dispatch assign                              |
| `SMOKE_VEHICLE_ID`        | `10000000-0000-0000-0000-000000000351` | ABC-1234 from S0002 seed; used in dispatch assign                            |
| `SMOKE_TIMEOUT`           | `30`                                   | curl timeout per request (seconds)                                           |
| `SMOKE_POLL_INTERVAL`     | `3`                                    | Seconds between status polls                                                 |
| `SMOKE_POLL_MAX`          | `20`                                   | Max poll attempts for async jobs                                             |

## Exit codes

- `0` — all tests passed (or tests 03–04 gracefully skipped on empty DB)
- `1` — one or more tests failed
- `2` — argument error
