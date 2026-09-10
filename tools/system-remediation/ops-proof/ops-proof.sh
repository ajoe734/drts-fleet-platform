#!/usr/bin/env bash
# SR-OPS-PROOF-001: repeatable, isolated-only operations evidence harness.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ops-proof.sh inventory --output FILE
  ops-proof.sh restore --snapshot FILE --manifest FILE --isolated-database-url URL --output FILE
  ops-proof.sh load --booking-url URL --dispatch-url URL --report-url URL --output FILE [--requests N] [--header 'Name: value']

The restore command intentionally has no source-database option. It will only
connect to a loopback database named drts_ops_proof_*, rejects any connection
URL that carries query parameters (host/hostaddr/dbname overrides), and clears
ambient PG* connection environment variables before invoking pg_restore/psql
so neither the URL nor the process environment can redirect the destination.
It also requires a --manifest JSON file binding the snapshot's sha256 to
expected trip/billing/audit counts, and fails the run if the restored counts
do not match. Load targets must be explicitly supplied; this tool never
discovers or targets a production service, and it sends the same HTTP
method/body shape as the authoritative API contract (phase1_openapi_v1.yaml)
for booking creation, dispatch requests, and report job creation.
EOF
}

die() { echo "[ops-proof] $*" >&2; exit 2; }
command_name="${1:-}"; shift || true
output=""; snapshot=""; manifest=""; isolated_database_url=""
booking_url=""; dispatch_url=""; report_url=""; requests=1
headers=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output="${2:-}"; shift 2 ;;
    --snapshot) snapshot="${2:-}"; shift 2 ;;
    --manifest) manifest="${2:-}"; shift 2 ;;
    --isolated-database-url) isolated_database_url="${2:-}"; shift 2 ;;
    --booking-url) booking_url="${2:-}"; shift 2 ;;
    --dispatch-url) dispatch_url="${2:-}"; shift 2 ;;
    --report-url) report_url="${2:-}"; shift 2 ;;
    --requests) requests="${2:-}"; shift 2 ;;
    --header) headers+=("${2:-}"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[[ -n "$command_name" && -n "$output" ]] || { usage >&2; exit 2; }
mkdir -p "$(dirname "$output")"
base_sha="$(git rev-parse --verify -q origin/dev 2>/dev/null || git rev-parse HEAD)"
candidate_sha="$(git rev-parse HEAD)"
now="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"

write_json() {
  local payload="$1"
  node - "$output" "$payload" <<'NODE'
const fs = require("node:fs");
const [output, payload] = process.argv.slice(2);
fs.writeFileSync(output, `${JSON.stringify(JSON.parse(payload), null, 2)}\n`);
NODE
}

case "$command_name" in
  inventory)
    write_json "$(node - "$base_sha" "$candidate_sha" "$now" <<'NODE'
const [baseSha, candidateSha, observedAt] = process.argv.slice(2);
console.log(JSON.stringify({
  taskId: "SR-OPS-PROOF-001", kind: "read_only_inventory", observedAt,
  baseSha, candidateSha,
  sources: [
    "docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md",
    "docs/03-runbooks/operational-sla-degradation-runbook.md",
    "docs/03-runbooks/production-deploy-rail-spec-20260519.md"
  ],
  findings: {
    restore: "No cloud backup receipt was read; live restore remains SR-LIVE-OPS-001 gated.",
    workload: "Baseline defines intake 60/min, dispatch 300/min, reporting 30 jobs/min bursts for 15 minutes.",
    deployment: "Deploy evidence must identify immutable source SHA and health result."
  },
  liveNotPerformed: ["cloud_backup_read", "cloud_restore", "production_load", "physical_device_validation"]
}));
NODE
)"
    ;;
  restore)
    [[ -f "$snapshot" ]] || die "--snapshot must name an existing PostgreSQL dump"
    [[ "$isolated_database_url" =~ ^postgres(ql)?:// ]] || die "isolated database URL must use postgres:// or postgresql://"
    [[ "$isolated_database_url" != *'?'* && "$isolated_database_url" != *'#'* ]] || die "restore target URL must not carry query parameters or a fragment; libpq URI params (host/hostaddr/port/dbname/service) could override the validated destination"
    target_host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$isolated_database_url")"
    target_database="$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$isolated_database_url")"
    [[ "$target_host" == "localhost" || "$target_host" == "127.0.0.1" || "$target_host" == "::1" ]] || die "restore target host must be loopback, never a shared or production database"
    [[ "$target_database" =~ ^drts_ops_proof_[a-z0-9_]+$ ]] || die "restore target database must match drts_ops_proof_*"
    [[ -f "$manifest" ]] || die "--manifest must name an existing JSON file binding the snapshot sha256 to expected trip/billing/audit counts"

    snapshot_sha256="$(sha256sum "$snapshot" | awk '{print $1}')"
    manifest_json="$(node - "$manifest" "$snapshot_sha256" <<'NODE'
const fs = require("node:fs");
const [manifestPath, snapshotSha256] = process.argv.slice(2);
let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (err) {
  console.error(`manifest is not valid JSON: ${err.message}`);
  process.exit(1);
}
const declared = parsed && parsed.snapshotSha256;
if (typeof declared !== "string" || !/^[a-f0-9]{64}$/.test(declared)) {
  console.error("manifest snapshotSha256 must be a 64-character hex sha256 digest");
  process.exit(1);
}
if (declared !== snapshotSha256) {
  console.error(`manifest snapshotSha256 (${declared}) does not match the supplied snapshot file (${snapshotSha256})`);
  process.exit(1);
}
const expected = parsed && parsed.expectedCounts;
if (!expected || typeof expected !== "object") {
  console.error("manifest expectedCounts must be an object with trips/billing/audit integer counts");
  process.exit(1);
}
for (const key of ["trips", "billing", "audit"]) {
  if (!Number.isInteger(expected[key]) || expected[key] < 0) {
    console.error(`manifest expectedCounts.${key} must be a non-negative integer`);
    process.exit(1);
  }
}
console.log(JSON.stringify({ snapshotSha256: declared, expectedCounts: expected }));
NODE
)" || die "restore manifest failed validation against the snapshot"

    command -v pg_restore >/dev/null || die "pg_restore is required for an actual restore"
    command -v psql >/dev/null || die "psql is required for restore readback"
    # Clear ambient libpq destination overrides so the validated URL, not the
    # process environment, decides where pg_restore/psql actually connect.
    pg_env=(env -u PGHOST -u PGHOSTADDR -u PGPORT -u PGDATABASE -u PGSERVICE -u PGSERVICEFILE)
    "${pg_env[@]}" pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$isolated_database_url" "$snapshot"
    counts="$("${pg_env[@]}" psql "$isolated_database_url" --no-align --tuples-only --set ON_ERROR_STOP=1 -c "SELECT json_build_object('trips', (SELECT count(*) FROM ops.orders), 'billing', (SELECT count(*) FROM billing.driver_statements), 'audit', (SELECT count(*) FROM admin.audit_logs))::text")"

    comparison="$(node -e '
const manifest = JSON.parse(process.argv[1]);
const actual = JSON.parse(process.argv[2]);
const expected = manifest.expectedCounts;
const mismatches = Object.keys(expected).filter((key) => expected[key] !== actual[key]);
console.log(JSON.stringify({ expected, actual, mismatches }));
' "$manifest_json" "$counts")"
    mismatch_count="$(node -e 'console.log(JSON.parse(process.argv[1]).mismatches.length)' "$comparison")"
    [[ "$mismatch_count" == "0" ]] || die "restored counts do not match snapshot manifest: $comparison"

    write_json "$(node - "$base_sha" "$candidate_sha" "$now" "$target_database" "$snapshot_sha256" "$manifest" "$counts" <<'NODE'
const [baseSha, candidateSha, observedAt, database, snapshotSha256, manifestPath, readback] = process.argv.slice(2);
console.log(JSON.stringify({taskId:"SR-OPS-PROOF-001",kind:"isolated_restore",observedAt,baseSha,candidateSha,resource:{isolatedDatabase:database,snapshotSha256,manifestPath},readback:JSON.parse(readback),countsMatchManifest:true,productionDatabaseTouched:false}));
NODE
)"
    ;;
  load)
    [[ "$requests" =~ ^[1-9][0-9]*$ ]] || die "--requests must be a positive integer"
    [[ -n "$booking_url" && -n "$dispatch_url" && -n "$report_url" ]] || die "load requires booking, dispatch, and report URLs"
    command -v curl >/dev/null || die "curl is required for load measurement"
    for workload in booking dispatch report; do
      url_var="${workload}_url"; url="${!url_var}"
      target_host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$url")" || die "$workload URL is invalid"
      [[ "$target_host" == "localhost" || "$target_host" == "127.0.0.1" || "$target_host" == "::1" ]] || die "$workload load target must be loopback; authorized cloud load belongs to SR-LIVE-OPS-001"
    done
    # Method/body/expected status are taken from the authoritative contract
    # (phase1_openapi_v1.yaml): POST /api/tenant/bookings (TenantBookingCreateRequest, 201),
    # POST /api/orders/{orderId}/dispatch (empty object body, 201),
    # POST /api/reports/jobs (ReportJobCreateRequest, 202).
    declare -A workload_expected_status=( [booking]="201" [dispatch]="201" [report]="202" )
    # Baseline burst rates from docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md
    declare -A workload_rate_per_minute=( [booking]="60" [dispatch]="300" [report]="30" )
    : > "$output"
    for workload in booking dispatch report; do
      url_var="${workload}_url"; url="${!url_var}"
      expected_status="${workload_expected_status[$workload]}"
      rate_per_minute="${workload_rate_per_minute[$workload]}"
      sleep_seconds="$(node -e 'console.log(60 / Number(process.argv[1]))' "$rate_per_minute")"
      for ((i=1; i<=requests; i++)); do
        request_body="$(node - "$workload" "$i" "$now" <<'NODE'
const [workload, sequence, observedAt] = process.argv.slice(2);
if (workload === "booking") {
  const scheduledAt = new Date(Date.parse(observedAt) + 3600_000).toISOString();
  console.log(JSON.stringify({
    bookingType: "oneway",
    scheduledAt,
    pickup: { addressText: "SR-OPS-PROOF-001 pickup", lat: 25.033, lng: 121.5654 },
    dropoff: { addressText: "SR-OPS-PROOF-001 dropoff", lat: 25.0478, lng: 121.5319 },
    passenger: { fullName: "SR-OPS-PROOF-001 load probe", mobile: "0900000000" },
    note: `ops-proof load workload sequence ${sequence}`,
  }));
} else if (workload === "dispatch") {
  console.log(JSON.stringify({}));
} else {
  console.log(JSON.stringify({
    jobType: "ops_proof_load_probe",
    format: "csv",
    filters: { sequence: Number(sequence) },
  }));
}
NODE
)"
        curl_args=(--silent --show-error --output /dev/null --write-out '%{http_code} %{time_total}' --request POST --header 'Content-Type: application/json' --data "$request_body")
        for header in "${headers[@]}"; do curl_args+=(--header "$header"); done
        set +e
        raw="$(curl "${curl_args[@]}" "$url" 2>&1)"; exit_code=$?
        set -e
        node - "$output" "$base_sha" "$candidate_sha" "$workload" "$i" "$url" "$request_body" "$expected_status" "$raw" "$exit_code" <<'NODE'
const fs = require("node:fs");
const [output, baseSha, candidateSha, workload, sequence, url, requestBody, expectedStatus, raw, exitCode] = process.argv.slice(2);
const match = raw.match(/(\d{3})\s+([0-9.]+)$/);
const httpStatus = match ? Number(match[1]) : null;
fs.appendFileSync(output, JSON.stringify({
  taskId: "SR-OPS-PROOF-001", kind: "load_request", baseSha, candidateSha,
  workload, sequence: Number(sequence), method: "POST", url,
  requestBody: JSON.parse(requestBody),
  rawCurl: raw, curlExitCode: Number(exitCode),
  httpStatus, latencyMs: match ? Number(match[2]) * 1000 : null,
  expectedStatus: Number(expectedStatus),
  success: Number(exitCode) === 0 && httpStatus === Number(expectedStatus),
  error: Number(exitCode) === 0 ? null : raw,
}) + "\n");
NODE
        if [[ "$i" -lt "$requests" ]]; then
          sleep "$sleep_seconds"
        fi
      done
    done
    ;;
  *) usage >&2; exit 2 ;;
esac
