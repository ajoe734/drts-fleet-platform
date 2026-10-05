#!/usr/bin/env python3
"""Offline CLI boundary only. Never connects, binds a port, or loads credentials."""
import base64
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
    if args[:2] == ["variable", "get"]:
        print({"DEV_GCP_PROJECT_ID": "drts-dev-devcc-20260825", "DEV_GCP_REGION": "us-central1",
               "DEV_GCP_CLOUDSQL_INSTANCE": "drts-dev-devcc-20260825:us-central1:drts-dev-db"}[args[2]])
    elif args[:2] == ["variable", "set"]:
        (root / "ready.json").write_text(args[args.index("--body") + 1])
    else:
        fail()
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
    assert "--project=drts-dev-devcc-20260825" in args
    if args[:3] == ["secrets", "versions", "access"]:
        if scenario == "secret_failure":
            fail()
        secret = os.environ.get("DRILL_FAKE_DB_URL", "postgresql://drill-user:TOP-SECRET-PASSWORD@/drts?host=/cloudsql/private-db")
        # Match the SDK: explicit JSON is the response resource, not raw data.
        if "--format=json" in args:
            emit({"name": "projects/123/secrets/drts-dev-db-url/versions/1",
                  "payload": {"data": base64.b64encode(secret.encode()).decode()}})
        print(secret)
        sys.exit(0)
    assert "--format=json" in args
    if args[:2] == ["projects", "describe"]:
        emit({"projectNumber": "1234567890"})
    if args[:4] == ["iam", "workload-identity-pools", "providers", "describe"]:
        emit({"attributeMapping": {"attribute.repository": "assertion.repository"},
              "attributeCondition": "true" if scenario == "bad_trust" else "assertion.repository=='ajoe734/drts-fleet-platform'",
              "oidc": {"issuerUri": "https://token.actions.githubusercontent.com"}})
    state_file = root / "iam.json"
    iam = json.loads(state_file.read_text()) if state_file.exists() else {"accounts": [], "roles": {}, "project": {"bindings": []}, "secret": {"bindings": []}, "sa": {"bindings": []}}

    def save(value):
        state_file.write_text(json.dumps(iam))
        emit(value)

    def flag(name):
        return next(a.split("=", 1)[1] for a in args if a.startswith("--" + name + "="))

    if args[:2] == ["projects", "get-ancestors"]:
        emit([{"type": "project", "id": "drts-dev-devcc-20260825"}, {"type": "organization", "id": "123"}])
    if args[:2] == ["organizations", "get-iam-policy"]:
        if scenario == "ancestor_denied":
            fail()
        emit({"bindings": ([{"role": "roles/owner", "members": ["serviceAccount:drts-dev-ops-drill@drts-dev-devcc-20260825.iam.gserviceaccount.com"]}] if scenario == "inherited_owner" else [])})
    if args[:3] == ["iam", "service-accounts", "list"]:
        emit(iam["accounts"] + ([{"email": "other@project.iam.gserviceaccount.com"}] if scenario == "other_sa_access" else []))
    if args[:2] == ["secrets", "list"]:
        emit([{"name": "projects/123/secrets/drts-dev-db-url"}] + ([{"name": "projects/123/secrets/other"}] if scenario == "other_secret_access" else []))
    if args[:3] == ["iam", "service-accounts", "create"]:
        iam["accounts"].append({"email": "drts-dev-ops-drill@drts-dev-devcc-20260825.iam.gserviceaccount.com"})
        save({})
    if args[:3] == ["iam", "roles", "list"]:
        emit(list(iam["roles"].values()))
    if args[:3] == ["iam", "roles", "describe"]:
        if args[3] == "roles/owner":
            emit({"includedPermissions": ["cloudsql.instances.delete", "resourcemanager.projects.setIamPolicy"]})
        emit(iam["roles"][args[3]])
    if args[:3] == ["iam", "roles", "create"]:
        iam["roles"][args[3]] = {"name": "projects/drts-dev-devcc-20260825/roles/" + args[3], "includedPermissions": flag("permissions").split(","), "stage": "GA"}
        save({})
    policy_key = "project" if args[0] == "projects" else "secret" if args[0] == "secrets" else "sa" if args[:2] == ["iam", "service-accounts"] else None
    if policy_key and "get-iam-policy" in args:
        if (scenario == "other_secret_access" and args[2] == "other") or (scenario == "other_sa_access" and "other@project.iam.gserviceaccount.com" in args):
            emit({"bindings": [{"role": "roles/secretmanager.secretAccessor" if policy_key == "secret" else "roles/iam.serviceAccountTokenCreator", "members": ["serviceAccount:drts-dev-ops-drill@drts-dev-devcc-20260825.iam.gserviceaccount.com"]}]})
        emit(iam[policy_key])
    if policy_key and "add-iam-policy-binding" in args:
        item = {"role": flag("role"), "members": [flag("member")]}
        condition = flag("condition")
        if condition != "None":
            title, expression = condition.split(",expression=", 1)
            item["condition"] = {"title": title.removeprefix("title="), "expression": expression}
        iam[policy_key]["bindings"].append(item)
        save({})
    if args[:3] == ["sql", "instances", "list"]:
        emit([{"name": "drts-dev-db"}] + ([{"name": "drts-dev-db-drill-999-1"}] if scenario == "leftover" else []))
    if args[:2] == ["logging", "read"]:
        if scenario == "audit_denied":
            fail()
        if scenario == "audit_empty":
            emit([])
        record = {"insertId": "audit-1", "timestamp": now.isoformat(),
                  "protoPayload": {"methodName": "cloudsql.instances.clone", "request": {"body": {"cloneContext": {"destinationInstanceName": "drts-dev-db-drill-123-1"}}}}}
        if scenario == "audit_unknown":
            record["protoPayload"]["request"] = {}
        if scenario == "audit_foreign":
            other = json.loads(json.dumps(record))
            other["protoPayload"]["request"]["body"]["cloneContext"]["destinationInstanceName"] = "unexpected-extra-clone"
            emit([record, other])
        if scenario in ("audit_lro", "audit_lro_unknown"):
            record["operation"] = {"id": "operation-1", "first": True}
            other = {"insertId": "audit-2", "timestamp": now.isoformat(),
                     "operation": {"id": "operation-1" if scenario == "audit_lro" else "unknown-operation", "last": True},
                     "protoPayload": {"methodName": "cloudsql.instances.clone"}}
            emit([record, other])
        emit([record] * 1000 if scenario == "audit_truncated" else [record])
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
