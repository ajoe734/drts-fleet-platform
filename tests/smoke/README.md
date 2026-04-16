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
# Against staging — bootstrap auth, no login required
export SMOKE_API_URL=https://api-staging.drts.internal   # bare origin, no /api suffix
export SMOKE_ACTOR_TYPE=platform_admin
export SMOKE_ACTOR_ID=smoke-platform-admin-001
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

**The API uses bootstrap-header authentication — there is no `/api/auth/login` endpoint.**

`lib/helpers.sh` sends the following headers automatically on every request:

| Header         | Env var            | Default                    |
| -------------- | ------------------ | -------------------------- |
| `x-actor-type` | `SMOKE_ACTOR_TYPE` | `platform_admin`           |
| `x-actor-id`   | `SMOKE_ACTOR_ID`   | `smoke-platform-admin-001` |
| `x-realm`      | `SMOKE_REALM`      | derived from actor type    |
| `x-tenant-id`  | `SMOKE_TENANT_ID`  | S0002 TEN_ACME UUID        |

The `platform_admin` actor type (realm: `platform`) covers all six smoke routes.
No password, token fetch, or user account is required for smoke runs.

## Staging URL and `/api` path prefix

`SMOKE_API_URL` must be the **bare origin** (scheme + host, no trailing slash, no path).

`lib/helpers.sh` automatically prepends `SMOKE_API_PATH_PREFIX` (default `/api`) to every
path before building the curl URL. This matches the NestJS global prefix configured in
`apps/api/src/main.ts` (`app.setGlobalPrefix("api", { exclude: ["health"] })`).

```bash
# Correct — bare origin only:
export SMOKE_API_URL=https://api-staging.drts.internal
# helpers.sh produces: https://api-staging.drts.internal/api/tenant/bookings  ✓
```

Do **not** append `/api` to `SMOKE_API_URL` — that would double-prefix every path:

```bash
# Wrong:
export SMOKE_API_URL=https://api-staging.drts.internal/api
# helpers.sh would produce: .../api/api/tenant/bookings  ✗
```

If the ingress layer already strips the `/api` prefix (non-standard), override:

```bash
export SMOKE_API_PATH_PREFIX=""
```

Confirm the correct base URL from the Cloud Run service URL in the `WE-003` deploy config.

## Environment variables

| Variable                | Default                                | Description                                                              |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `SMOKE_API_URL`         | `http://localhost:3001`                | API bare origin — no trailing slash, no path prefix (see note above)     |
| `SMOKE_API_PATH_PREFIX` | `/api`                                 | Prepended to every path; matches NestJS global prefix — set `""` to skip |
| `SMOKE_ACTOR_TYPE`      | `platform_admin`                       | Bootstrap auth actor type (`x-actor-type` header)                        |
| `SMOKE_ACTOR_ID`        | `smoke-platform-admin-001`             | Bootstrap auth actor ID (`x-actor-id` header)                            |
| `SMOKE_REALM`           | _(derived from actor type)_            | Override only when realm differs from actor-type default                 |
| `SMOKE_TENANT_ID`       | `10000000-0000-0000-0000-000000000201` | TEN_ACME from S0002 seed; sent as `x-tenant-id`                          |
| `SMOKE_DRIVER_ID`       | `10000000-0000-0000-0000-000000000381` | 張司機 from S0002 seed; used in dispatch assign                          |
| `SMOKE_VEHICLE_ID`      | `10000000-0000-0000-0000-000000000351` | ABC-1234 from S0002 seed; used in dispatch assign                        |
| `SMOKE_TIMEOUT`         | `30`                                   | curl timeout per request (seconds)                                       |
| `SMOKE_POLL_INTERVAL`   | `3`                                    | Seconds between status polls                                             |
| `SMOKE_POLL_MAX`        | `20`                                   | Max poll attempts for async jobs                                         |

## Exit codes

- `0` — all tests passed (or tests 03–04 gracefully skipped on empty DB)
- `1` — one or more tests failed
- `2` — argument error
