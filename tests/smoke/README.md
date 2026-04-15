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
# Obtain a Bearer token first (staging does not provide static tokens):
TOKEN=$(curl -s -X POST https://api-staging.drts.internal/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@drts.internal","password":"<smoke-password>"}' \
  | jq -r '.data.accessToken')

# Against staging
export SMOKE_API_URL=https://api-staging.drts.internal
export SMOKE_AUTH_TOKEN="$TOKEN"
./scripts/run-smoke-tests.sh

# Against local dev
./scripts/run-smoke-tests.sh --api-url http://localhost:3001

# Run a single test
./scripts/run-smoke-tests.sh --suite "02"

# Verbose output on failure
./scripts/run-smoke-tests.sh --verbose
```

See `scripts/run-smoke-tests.sh --help` for the full option reference.

### Staging URL and `/api` path prefix

The `SMOKE_API_URL` value must be the **base URL without any trailing path prefix**.
All test scripts append paths like `/health`, `/tenant/bookings`, etc. directly.

If the staging API gateway adds an `/api` prefix at the ingress layer, set:

```bash
export SMOKE_API_URL=https://api-staging.drts.internal   # scripts append /health, /tenant/... etc.
```

Do **not** include `/api` in `SMOKE_API_URL` — that would produce double-prefixed paths
(e.g. `/api/tenant/bookings` → `/api/api/tenant/bookings`).
Confirm the correct base URL from the Cloud Run service URL in `WE-003` deploy config.

## Environment variables

| Variable              | Default                 | Description                                               |
| --------------------- | ----------------------- | --------------------------------------------------------- |
| `SMOKE_API_URL`       | `http://localhost:3001` | API base URL (no trailing `/api` prefix — see note above) |
| `SMOKE_AUTH_TOKEN`    | _(none)_                | Bearer token (obtain via `POST /api/auth/login`)          |
| `SMOKE_TENANT_ID`     | `tenant-demo-001`       | Tenant used in billing/report fixtures                    |
| `SMOKE_DRIVER_ID`     | `drv-demo-001`          | Driver used in dispatch assign                            |
| `SMOKE_VEHICLE_ID`    | `veh-demo-001`          | Vehicle used in dispatch assign                           |
| `SMOKE_TIMEOUT`       | `30`                    | curl timeout per request (seconds)                        |
| `SMOKE_POLL_INTERVAL` | `3`                     | Seconds between status polls                              |
| `SMOKE_POLL_MAX`      | `20`                    | Max poll attempts for async jobs                          |

## Exit codes

- `0` — all tests passed
- `1` — one or more tests failed
- `2` — argument error
