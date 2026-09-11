#!/usr/bin/env bash
# SR-OPS-PROOF-001: repeatable, isolated-only operations evidence harness.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ops-proof.sh inventory --output FILE [--project ID --region REGION --service NAME]
  ops-proof.sh restore --snapshot FILE --expected-manifest FILE --isolated-database-url URL --output FILE
  ops-proof.sh capacity --plan FILE --output FILE
  ops-proof.sh load --booking-url URL --dispatch-url URL --report-url URL --output FILE [--requests N] [--header 'Name: value']

The restore command intentionally has no source-database option. It will only
connect to a loopback database named drts_ops_proof_*. Load targets must be
explicitly supplied; this tool never discovers or targets a production service.
EOF
}

die() { echo "[ops-proof] $*" >&2; exit 2; }
command_name="${1:-}"; shift || true
expected_manifest=""; helper="$(dirname "${BASH_SOURCE[0]}")/reconcile.mjs"
output=""; snapshot=""; isolated_database_url=""; booking_url=""; dispatch_url=""; report_url=""; requests=1
headers=()
project=""; region=""; service=""; plan=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) plan="${2:-}"; shift 2 ;;
    --project) project="${2:-}"; shift 2 ;;
    --region) region="${2:-}"; shift 2 ;;
    --service) service="${2:-}"; shift 2 ;;
    --output) output="${2:-}"; shift 2 ;;
    --expected-manifest) expected_manifest="${2:-}"; shift 2 ;;
    --snapshot) snapshot="${2:-}"; shift 2 ;;
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
base_sha="$(git rev-parse origin/dev 2>/dev/null || git rev-parse HEAD)"
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
    node "$(dirname "${BASH_SOURCE[0]}")/inventory.mjs" "$output" "$base_sha" "$candidate_sha" "$project" "$region" "$service"
    ;;
  restore)
    [[ -f "$snapshot" ]] || die "--snapshot must name an existing PostgreSQL dump"
    [[ "$isolated_database_url" =~ ^postgres(ql)?:// ]] || die "isolated database URL must use postgres:// or postgresql://"
    # libpq accepts query parameters such as host/service/dbname that can
    # override the authority checked below. Never forward those overrides.
    [[ "$isolated_database_url" != *'?'* && "$isolated_database_url" != *'#'* && "$isolated_database_url" != *'%'* && "$isolated_database_url" != *'\'* ]] || die "restore URL must not contain query, fragment, percent-encoded or backslash overrides"
    [[ -z "${PGSERVICE:-}" && -z "${PGOPTIONS:-}" ]] || die "PGSERVICE and PGOPTIONS must be unset for isolated restore"
    target_host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$isolated_database_url")"
    target_database="$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$isolated_database_url")"
    [[ "$target_host" == "localhost" || "$target_host" == "127.0.0.1" ]] || die "restore target host must be loopback, never a shared or production database"
    [[ "$target_database" =~ ^drts_ops_proof_[a-z0-9_]+$ ]] || die "restore target database must match drts_ops_proof_*"
    export PGHOSTADDR=127.0.0.1
    command -v pg_restore >/dev/null || die "pg_restore is required for an actual restore"
    command -v psql >/dev/null || die "psql is required for restore readback"
    existing_relations="$(psql -X "$isolated_database_url" --no-align --tuples-only --set ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'")"
    [[ "$existing_relations" == "0" ]] || die "restore requires an empty disposable database; refusing to overwrite existing relations"
    [[ -f "$expected_manifest" ]] || die "--expected-manifest is required; counts alone cannot prove restoration"
    node "$helper" validate "$expected_manifest" "$snapshot"
    pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname="$isolated_database_url" "$snapshot"
    reconciliation_status=0
    readback="$(node "$helper" verify "$expected_manifest" "$snapshot" "$isolated_database_url")" || reconciliation_status=$?
    [[ -n "$readback" ]] || die "restored database readback failed; restoration is not verified"
    snapshot_sha256="$(sha256sum "$snapshot" | awk '{print $1}')"
    write_json "$(node - "$base_sha" "$candidate_sha" "$now" "$target_database" "$snapshot_sha256" "$readback" <<'NODE'
const [baseSha, candidateSha, observedAt, database, snapshotSha256, readback] = process.argv.slice(2);
console.log(JSON.stringify({taskId:"SR-OPS-PROOF-001",kind:"isolated_restore",observedAt,baseSha,candidateSha,resource:{isolatedDatabase:database,snapshotSha256},readback:JSON.parse(readback),isolationPolicy:"loopback-empty-disposable-target; operator must exclude tunnels"}));
NODE
)"
    exit "$reconciliation_status"
    ;;
  capacity)
    [[ -f "$plan" ]] || die "--plan must name an operator-supplied workload plan"
    node "$(dirname "${BASH_SOURCE[0]}")/capacity.mjs" "$plan" "$output" "$base_sha" "$candidate_sha"
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
    : > "$output"
    load_failed=0
    for workload in booking dispatch report; do
      url_var="${workload}_url"; url="${!url_var}"
      for ((i=1; i<=requests; i++)); do
        curl_args=(--disable --noproxy '*' --proto '=http,https' --connect-timeout 5 --max-time 30 --silent --show-error --output /dev/null --write-out '%{http_code} %{time_total}')
        for header in "${headers[@]}"; do curl_args+=(--header "$header"); done
        set +e
        raw="$(curl "${curl_args[@]}" "$url" 2>&1)"; exit_code=$?
        set -e
        if ! node - "$output" "$workload" "$i" "$url" "$raw" "$exit_code" "$base_sha" "$candidate_sha" "$now" <<'NODE'
const fs = require("node:fs");
const [output, workload, sequence, url, raw, exitCode, baseSha, candidateSha, observedAt] = process.argv.slice(2);
const match = raw.match(/(\d{3})\s+([0-9.]+)$/);
const httpStatus = match ? Number(match[1]) : null;
const latencyMs = match ? Number(match[2]) * 1000 : null;
const error = Number(exitCode) !== 0 ? raw
  : !match || !Number.isFinite(latencyMs) ? "Invalid curl measurement"
  : httpStatus < 200 || httpStatus >= 300 ? `HTTP ${httpStatus}` : null;
fs.appendFileSync(output, JSON.stringify({taskId:"SR-OPS-PROOF-001", kind:"load_probe", baseSha, candidateSha, observedAt, workload, sequence:Number(sequence), url, rawCurl:raw, curlExitCode:Number(exitCode), httpStatus, latencyMs, error}) + "\n");
process.exitCode = error === null ? 0 : 1;
NODE
        then
          load_failed=1
        fi
      done
    done
    exit "$load_failed"
    ;;
  *) usage >&2; exit 2 ;;
esac
