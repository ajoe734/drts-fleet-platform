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

| Test                  | Critical path                                   |
| --------------------- | ----------------------------------------------- |
| 01-health             | `GET /health` — API reachable                   |
| 02-booking-create     | `POST /tenant/bookings` + read-back             |
| 03-dispatch-assign    | `GET /dispatch/tasks`, `POST /dispatch/assign`  |
| 04-driver-task-accept | `POST /driver/tasks/:id/accept` + status verify |
| 05-billing-invoice    | `POST /tenant/invoices/generate` + retrieve     |
| 06-report-export      | `POST /reports/jobs` + poll to completed        |

Tests 03–04 are gracefully skippable when staging DB is empty (they log a warning and exit 0).

## Running

```bash
# Against staging (requires SMOKE_AUTH_TOKEN)
export SMOKE_API_URL=https://api-staging.drts.internal
export SMOKE_AUTH_TOKEN=<bearer-token>
./scripts/run-smoke-tests.sh

# Against local dev
./scripts/run-smoke-tests.sh --api-url http://localhost:3001

# Run a single test
./scripts/run-smoke-tests.sh --suite "02"

# Verbose output on failure
./scripts/run-smoke-tests.sh --verbose
```

See `scripts/run-smoke-tests.sh --help` for the full option reference.

## Environment variables

| Variable              | Default                 | Description                            |
| --------------------- | ----------------------- | -------------------------------------- |
| `SMOKE_API_URL`       | `http://localhost:3001` | API base URL                           |
| `SMOKE_AUTH_TOKEN`    | _(none)_                | Bearer token                           |
| `SMOKE_TENANT_ID`     | `smoke-tenant-01`       | Tenant used in billing/report fixtures |
| `SMOKE_DRIVER_ID`     | `smoke-driver-01`       | Driver used in dispatch assign         |
| `SMOKE_VEHICLE_ID`    | `smoke-vehicle-01`      | Vehicle used in dispatch assign        |
| `SMOKE_TIMEOUT`       | `30`                    | curl timeout per request (seconds)     |
| `SMOKE_POLL_INTERVAL` | `3`                     | Seconds between status polls           |
| `SMOKE_POLL_MAX`      | `20`                    | Max poll attempts for async jobs       |

## Exit codes

- `0` — all tests passed
- `1` — one or more tests failed
- `2` — argument error
