"""Real CLI orchestration. All child output is private; evidence is allowlisted.

No database/server is started here except the Cloud SQL Auth Proxy on a hosted
runner. Offline tests substitute the CLI boundary, never claim live acceptance.
"""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time

PROJECT = "drts-dev-devcc-20260825"
REGION = "us-central1"
SOURCE = "drts-dev-db"
PREFIX = SOURCE + "-drill-"
TABLES = {
    "ops.phase1_owned_orders",
    "core.phase1_tenant_passengers",
    "reg.phase1_registry_contracts",
    "ops.phase1_notification_mail_deliveries",
}


class DrillError(Exception):
    pass


class CommandTimeout(DrillError):
    pass


def require(value, code):
    if not value:
        raise DrillError(code)


def timestamp(value):
    require(isinstance(value, str), "missing_timestamp")
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        require(result.tzinfo is not None, "timestamp_timezone_missing")
        return result
    except ValueError:
        raise DrillError("invalid_timestamp") from None


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def iso(value):
    return value.isoformat().replace("+00:00", "Z")


def command(args, *, env=None, timeout=90, input_text=None):
    try:
        result = subprocess.run(args, env=env, input=input_text, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise CommandTimeout("child_command_timeout") from None
    except OSError:
        raise DrillError("child_unavailable_or_timeout") from None
    require(result.returncode == 0, "child_command_failed")
    return result.stdout.strip()


def gc(*args, timeout=90):
    return command(["gcloud", *args, "--project=" + PROJECT, "--quiet", "--format=json"], timeout=timeout)


def obj(raw):
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        raise DrillError("missing_or_invalid_json") from None


def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n")
    os.replace(temp, path)


def validate_target(target):
    require(bool(re.fullmatch(r"drts-dev-db-drill-[0-9]+-[0-9]+", target)), "unsafe_target")
    require(len(target) <= 63, "target_too_long")


def context(target):
    validate_target(target)
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted", "hosted_runner_required")
    require(os.environ.get("GITHUB_REPOSITORY") == "ajoe734/drts-fleet-platform", "wrong_repository")
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "main_dispatch_required")
    require(os.environ.get("DEV_GCP_PROJECT_ID") == PROJECT and os.environ.get("DEV_GCP_REGION") == REGION, "live_variables_changed")
    require(os.environ.get("DEV_GCP_CLOUDSQL_INSTANCE") == f"{PROJECT}:{REGION}:{SOURCE}", "source_changed")
    require(target == PREFIX + os.environ.get("GITHUB_RUN_ID", "") + "-" + os.environ.get("GITHUB_RUN_ATTEMPT", ""), "target_run_mismatch")
    sha = os.environ.get("CANDIDATE_SHA", "")
    base = os.environ.get("BASE_SHA", "")
    require(bool(re.fullmatch("[0-9a-f]{40}", sha)) and bool(re.fullmatch("[0-9a-f]{40}", base)), "immutable_shas_required")
    require(command(["git", "rev-parse", "HEAD"]) == sha, "checkout_sha_mismatch")
    command(["git", "merge-base", "--is-ancestor", base, sha])
    return {"schema_version": 1, "candidate_sha": sha, "base_sha": base,
            "project": PROJECT, "region": REGION, "source": SOURCE, "target": target,
            "run_url": f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{os.environ['GITHUB_RUN_ID']}",
            "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"], "started_at": iso(utcnow()),
            "status": "failed", "cleanup": {"status": "not_created"},
            "capacity_acceptance": "pending_representative_workload_and_SLO",
            "scheduler_acceptance": "separate_read_only_evidence_required"}


def describe(name):
    """Do not conflate permission/network failures with nonexistence."""
    result = subprocess.run(["gcloud", "sql", "instances", "describe", name,
                             "--project=" + PROJECT, "--format=json"],
                            capture_output=True, text=True, timeout=90)
    if result.returncode == 0:
        return obj(result.stdout)
    # Match the SDK command's exact NOT_FOUND marker, not arbitrary 'not found'.
    if "(gcloud.sql.instances.describe) HTTPError 404:" in result.stderr:
        return None
    raise DrillError("describe_failed_not_404")


def cleanup(target, timeout=900):
    validate_target(target)
    deadline = time.monotonic() + timeout
    # An in-flight clone may appear after a failed/timeout API response. Require
    # deletion request acceptance, then absence; an initial 404 is not success.
    accepted = False
    while time.monotonic() < deadline:
        try:
            gc("sql", "instances", "delete", target, "--async")
            accepted = True
        except DrillError:
            pass
        current = describe(target)
        if current is None and accepted:
            return {"status": "deleted", "confirmed_at": iso(utcnow())}
        time.sleep(10)
    raise DrillError("cleanup_unconfirmed_operator_required")


def validate_snapshot(value):
    require(isinstance(value, dict), "readback_not_object")
    timestamp(value.get("observed_at"))
    require(type(value.get("database_bytes")) is int and value["database_bytes"] > 0, "database_size_missing")
    rows = value.get("tables")
    require(isinstance(rows, list) and len(rows) == len(TABLES), "tables_missing")
    require(all(isinstance(row, dict) for row in rows), "table_row_not_object")
    require({r.get("table_name") for r in rows} == TABLES, "tables_wrong")
    safe = []
    for row in rows:
        for key in ("row_count", "cutoff_count"):
            require(type(row.get(key)) is int and row[key] >= 0, "count_missing")
        require(row["cutoff_count"] <= row["row_count"], "invalid_cutoff_count")
        for key, count in (("max_created_at", row["row_count"]), ("max_updated_at", row["row_count"]), ("cutoff_last_write", row["cutoff_count"])):
            if count:
                timestamp(row.get(key))
            else:
                require(row.get(key) is None, "empty_table_timestamp")
        safe.append({k: row[k] for k in ("table_name", "row_count", "max_created_at", "max_updated_at", "cutoff_count", "cutoff_last_write")})
    require(any(r["row_count"] > 0 for r in safe), "all_tables_empty")
    return {"observed_at": value["observed_at"], "database_bytes": value["database_bytes"], "tables": safe}


def compare(source, clone, point):
    source = {r["table_name"]: r for r in source["tables"]}
    ages = {}
    for row in clone["tables"]:
        expected = source[row["table_name"]]
        require(row["row_count"] == row["cutoff_count"], "clone_has_post_point_writes")
        require(row["row_count"] == expected["cutoff_count"] and row["cutoff_last_write"] == expected["cutoff_last_write"], "readback_mismatch_or_concurrent_source_change")
        if row["row_count"]:
            age = (point - max(timestamp(row["max_created_at"]), timestamp(row["max_updated_at"]))).total_seconds()
            require(age >= 0, "clone_write_after_point")
            ages[row["table_name"]] = age
        else:
            ages[row["table_name"]] = None
    return {"point_to_last_present_write_seconds": ages,
            "meaning": "observed write age; idle time is included, not a proven data-loss bound"}


class Readback:
    def __init__(self, folder):
        # No URL, password, user or database name ever enters argv, logs or evidence.
        # Unlike gc(), do NOT append --format=json: that returns a resource
        # envelope with base64 payload.data, not the raw UTF-8 secret value.
        secret = command(["gcloud", "secrets", "versions", "access", "latest",
                          "--secret=drts-dev-db-url", "--project=" + PROJECT, "--quiet"])
        try:
            parsed = obj(command(["node", str(Path(__file__).with_name("db_credentials.mjs"))],
                                 input_text=secret, timeout=10))
            user, password, db = (parsed[key] for key in ("user", "password", "database"))
            require(all(isinstance(value, str) and value for value in (user, password, db)), "invalid_db_secret")
        except (DrillError, ValueError, KeyError, TypeError):
            raise DrillError("invalid_db_secret") from None
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        require(not any(c in password + user + db for c in "\n\r\0"), "invalid_db_secret")
        # Withhold credentials completely rather than echoing them in a mask command.
        # Credentials only cross private pipes and mode-0600 pgpass.
        escape = lambda s: s.replace("\\", "\\\\").replace(":", "\\:")
        pgpass = Path(folder) / "pgpass"
        with os.fdopen(os.open(pgpass, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(f"127.0.0.1:*:{escape(db)}:{escape(user)}:{escape(password)}\n")
        self.env.update(PGHOST="127.0.0.1", PGUSER=user, PGDATABASE=db,
                        PGPASSFILE=str(pgpass), PGSSLMODE="disable", PGCONNECT_TIMEOUT="5",
                        PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=3000")
        self.processes = []

    def start(self, name, port):
        process = subprocess.Popen(["cloud-sql-proxy", "--address=127.0.0.1", "--port=" + str(port),
                                    f"{PROJECT}:{REGION}:{name}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.processes.append(process)

    def snapshot(self, port):
        env = dict(self.env, PGPORT=str(port))
        started = time.monotonic()
        raw = command(["psql", "-X", "-q", "-A", "-t", "--no-password", "--set=ON_ERROR_STOP=1",
                       "--set=point=" + self.point, "--file=" + str(Path(__file__).with_name("readback.sql"))], env=env, timeout=45)
        return validate_snapshot(obj(raw)), time.monotonic() - started

    def readable(self, port, timeout=120):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                return self.snapshot(port)
            except DrillError:
                require(all(p.poll() is None for p in self.processes), "proxy_exited")
                time.sleep(3)
        raise DrillError("readback_timeout_or_missing_evidence")

    def close(self):
        for process in self.processes:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


def run(target, output):
    evidence = context(target)
    write(output, evidence)
    clone_attempted = False
    reader = None
    previous_handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}
    def interrupted(_signum, _frame):
        raise DrillError("interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        require(describe(target) is None, "target_already_exists_do_not_delete")
        source = describe(SOURCE)
        require(source and source.get("state") == "RUNNABLE" and source.get("region") == REGION, "source_not_ready")
        settings = source.get("settings", {})
        require(source.get("databaseVersion") == "POSTGRES_15" and settings.get("tier") == "db-custom-1-3840" and settings.get("availabilityType") == "ZONAL", "source_cost_profile_changed")
        require(settings.get("dataDiskSizeGb") == "10" and settings.get("backupConfiguration", {}).get("pointInTimeRecoveryEnabled") is True, "source_backup_profile_changed")
        require(settings.get("deletionProtectionEnabled", False) is False, "clone_delete_protection_risk")
        require(settings.get("ipConfiguration", {}).get("ipv4Enabled") is True, "hosted_runner_network_unavailable")
        evidence["source_configuration"] = {"tier": settings["tier"], "disk_gb": settings["dataDiskSizeGb"], "database_version": source["databaseVersion"], "availability_type": settings["availabilityType"]}
        window = obj(gc("sql", "instances", "get-latest-recovery-time", SOURCE))
        point = timestamp(window.get("latestRecoveryTime")) - dt.timedelta(seconds=60)
        require(timestamp(window.get("earliestRecoveryTime")) <= point <= utcnow(), "invalid_recovery_window")
        require((utcnow() - point).total_seconds() <= 900, "recovery_point_stale")
        evidence["point_in_time"] = iso(point)
        evidence["recovery_window"] = {k: window[k] for k in ("earliestRecoveryTime", "latestRecoveryTime")}
        with tempfile.TemporaryDirectory(prefix="ops-drill-private-") as folder:
            try:
                reader = Readback(folder)
                reader.point = iso(point)
                reader.start(SOURCE, 15432)
                before, _ = reader.readable(15432)
                evidence["source_before"] = before
                started = time.monotonic()
                evidence["clone_started_at"] = iso(utcnow())
                # Persist ownership intent BEFORE the mutation, including uncertain API outcomes.
                clone_attempted = True
                evidence["cleanup"] = {"status": "required"}
                write(output, evidence)
                operation = obj(gc("sql", "instances", "clone", SOURCE, target,
                                   "--point-in-time=" + iso(point), "--async"))
                require(operation.get("name") and operation.get("operationType") == "CLONE" and operation.get("targetId") == target, "clone_operation_missing")
                evidence["clone_operation_id"] = operation["name"]
                deadline = started + 1800
                while True:
                    status = obj(gc("sql", "operations", "describe", operation["name"]))
                    require(not status.get("error"), "clone_operation_failed")
                    if status.get("status") == "DONE":
                        break
                    require(time.monotonic() < deadline, "clone_timeout")
                    time.sleep(10)
                clone = describe(target)
                require(clone and clone.get("state") == "RUNNABLE", "clone_not_runnable")
                require(clone.get("region") == REGION and clone.get("databaseVersion") == source["databaseVersion"]
                        and clone.get("settings", {}).get("tier") == settings["tier"]
                        and clone.get("settings", {}).get("dataDiskSizeGb") == settings["dataDiskSizeGb"], "clone_profile_mismatch")
                evidence["rto_runnable_seconds"] = time.monotonic() - started
                reader.start(target, 15433)
                restored, query_seconds = reader.readable(15433)
                evidence["rto_readable_seconds"] = time.monotonic() - started
                evidence["clone_readback"] = restored
                after, _ = reader.snapshot(15432)
                evidence["source_after"] = after
                # Compare both observations; concurrent changes produce an explicit failure.
                compare(before, restored, point)
                evidence["rpo_observation"] = compare(after, restored, point)
                evidence["readback_query_seconds"] = query_seconds
                evidence["status"] = "restore_readback_passed"
            finally:
                if reader:
                    reader.close()
    except (DrillError, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        evidence["status"] = "failed"
        evidence["failure_code"] = str(error) if isinstance(error, DrillError) else "unexpected_runtime_failure"
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        if clone_attempted:
            try:
                evidence["cleanup"] = cleanup(target)
            except (DrillError, OSError, subprocess.TimeoutExpired):
                evidence["cleanup"] = {"status": "unconfirmed", "operator_action": "delete exact target after checking clone operation"}
                evidence["status"] = "failed"
        evidence["finished_at"] = iso(utcnow())
        write(output, evidence)
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)
    require(evidence["status"] == "restore_readback_passed" and evidence["cleanup"]["status"] == "deleted", "drill_failed_see_sanitized_evidence")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--cleanup-only", action="store_true")
    args = parser.parse_args()
    try:
        if args.cleanup_only:
            current = context(args.target)
            evidence = obj(Path(args.evidence).read_text())
            for key in ("target", "candidate_sha", "run_url", "run_attempt"):
                require(evidence.get(key) == current[key], "cleanup_evidence_mismatch")
            if evidence.get("cleanup", {}).get("status") in ("required", "unconfirmed"):
                evidence["cleanup"] = cleanup(args.target)
                write(args.evidence, evidence)
        else:
            run(args.target, args.evidence)
        print("Restore drill command finished; inspect evidence scope and acceptance gaps.")
        return 0
    except (DrillError, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        # Never print exception payloads: CLI/connection failures may contain credentials.
        print("Restore drill failed; inspect sanitized evidence and resource cleanup.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
