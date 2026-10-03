#!/usr/bin/env python3
"""Offline CLI boundary only. Never connects, binds a port, or loads credentials."""
import datetime as dt
import json
import os
from pathlib import Path
import signal
import sys

kind = sys.argv[1]
args = sys.argv[2:]
root = Path(os.environ["DRILL_FAKE_DIR"])
scenario = os.environ.get("DRILL_FAKE_SCENARIO", "success")
with (root / "commands.jsonl").open("a") as stream:
    # argv must not contain the URL/password; pgpass is deliberately never read.
    stream.write(json.dumps([kind, *args]) + "\n")


def emit(value):
    print(json.dumps(value))
    sys.exit(0)


def fail():
    # Adversarial CLI errors can expose URLs. Runner must not relay them.
    print("postgresql://drill-user:TOP-SECRET-PASSWORD@private-db/drts", file=sys.stderr)
    sys.exit(1)


now = dt.datetime.now(dt.timezone.utc)
point = now - dt.timedelta(seconds=120)
if kind == "proxy":
    signal.pause()  # Dummy process only; no listening socket.
elif kind == "gh":
    print("drts-dev-devcc-20260825")
elif kind == "psql":
    assert "--no-password" in args and "--set=ON_ERROR_STOP=1" in args
    assert os.environ["PGHOST"] == "127.0.0.1"
    assert "default_transaction_read_only=on" in os.environ["PGOPTIONS"]
    assert Path(os.environ["PGPASSFILE"]).stat().st_mode & 0o777 == 0o600
    if scenario == "readback_failure" and os.environ["PGPORT"] == "15433":
        fail()
    stamp = "2026-01-01T00:00:00+00:00"
    tables = ["ops.phase1_owned_orders", "core.phase1_tenant_passengers", "reg.phase1_registry_contracts", "ops.phase1_notification_mail_deliveries"]
    rows = [{"table_name": table, "row_count": 3, "cutoff_count": 3,
             "max_created_at": stamp, "max_updated_at": stamp, "cutoff_last_write": stamp} for table in tables]
    if scenario == "missing_table":
        rows.pop()
    if scenario == "mismatch" and os.environ["PGPORT"] == "15433":
        rows[0]["row_count"] = rows[0]["cutoff_count"] = 2
    if scenario == "post_point" and os.environ["PGPORT"] == "15433":
        rows[0]["max_updated_at"] = (now + dt.timedelta(hours=1)).isoformat()
    emit({"observed_at": now.isoformat(), "database_bytes": 123456, "tables": rows})
elif kind == "gcloud":
    assert "--project=drts-dev-devcc-20260825" in args and "--format=json" in args
    if args[:2] == ["projects", "describe"]:
        emit({"projectNumber": "1234567890"})
    if args[:4] == ["iam", "workload-identity-pools", "providers", "describe"]:
        emit({"attributeMapping": {"attribute.repository": "assertion.repository"},
              "attributeCondition": "true" if scenario == "bad_trust" else "assertion.repository=='ajoe734/drts-fleet-platform'",
              "oidc": {"issuerUri": "https://token.actions.githubusercontent.com"}})
    if args[:3] == ["sql", "instances", "describe"]:
        name = args[3]
        if name != "drts-dev-db":
            if scenario == "describe_denied":
                fail()
            if not (root / "created").exists() and scenario != "preexisting":
                print("ERROR: (gcloud.sql.instances.describe) HTTPError 404: instance does not exist", file=sys.stderr)
                sys.exit(1)
        emit({"name": name, "state": "RUNNABLE", "region": "us-central1", "databaseVersion": "POSTGRES_15",
              "settings": {"tier": "db-custom-1-3840", "dataDiskSizeGb": "10", "availabilityType": "ZONAL",
                           "backupConfiguration": {"pointInTimeRecoveryEnabled": scenario != "no_pitr"},
                           "ipConfiguration": {"ipv4Enabled": True}, "deletionProtectionEnabled": False}})
    if args[:3] == ["sql", "instances", "get-latest-recovery-time"]:
        if scenario == "stale_point":
            point -= dt.timedelta(hours=1)
        emit({"earliestRecoveryTime": (now - dt.timedelta(days=1)).isoformat(), "latestRecoveryTime": point.isoformat()})
    if args[:3] == ["secrets", "versions", "access"]:
        if scenario == "secret_failure":
            fail()
        print("postgresql://drill-user:TOP-SECRET-PASSWORD@private-db/drts?host=/cloudsql/private-db")
        sys.exit(0)
    if args[:3] == ["sql", "instances", "clone"]:
        assert args[3] == "drts-dev-db" and args[4] == "drts-dev-db-drill-123-1"
        assert "--async" in args and any(a.startswith("--point-in-time=") for a in args)
        (root / "created").touch()
        if scenario == "clone_failure":
            fail()  # Represents API failure after possible resource creation.
        if scenario == "missing_operation":
            emit({})
        emit({"name": "real-shaped-operation-id", "operationType": "CLONE", "targetId": args[4]})
    if args[:3] == ["sql", "operations", "describe"]:
        emit({"status": "DONE", **({"error": {"errors": [{"code": "ERROR"}]}} if scenario == "operation_error" else {})})
    if args[:3] == ["sql", "instances", "delete"]:
        assert args[3] == "drts-dev-db-drill-123-1" and "--async" in args
        if scenario == "cleanup_failure":
            fail()
        (root / "created").unlink(missing_ok=True)
        emit({"name": "delete-operation-id"})
    raise AssertionError("Unexpected CLI command: " + repr(args))
else:
    raise AssertionError("Unexpected executable")
