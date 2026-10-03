"""Read-only post-run inventory and Admin Activity audit; never bulk deletes."""
import argparse
import datetime as dt
import json
from pathlib import Path
import sys
import time

from provision_drill_sa import SA
from restore_drill import PREFIX, DrillError, context, gc, iso, obj, require, utcnow, write


def destination(entry):
    payload = entry.get("protoPayload", {})
    request = payload.get("request", {})
    body = request.get("body", request)
    if payload.get("methodName") == "cloudsql.instances.clone":
        return body.get("cloneContext", {}).get("destinationInstanceName")
    return body.get("name")


def sweep(target, evidence_file, output):
    evidence = context(target)
    evidence["status"] = "sweep_failed"
    evidence["audit_window_start"] = iso(utcnow() - dt.timedelta(days=400))
    evidence["audit_window_end"] = iso(utcnow())
    write(output, evidence)
    try:
        prior = obj(Path(evidence_file).read_text()) if Path(evidence_file).exists() else {}
        for key in ("target", "candidate_sha", "run_url", "run_attempt"):
            require(not prior or prior.get(key) == evidence[key], "sweep_evidence_mismatch")
        instances = obj(gc("sql", "instances", "list"))
        require(isinstance(instances, list), "inventory_missing")
        require(all(isinstance(i.get("name"), str) for i in instances), "inventory_name_missing")
        evidence["remaining_drill_instances"] = sorted(i["name"] for i in instances if i["name"].startswith(PREFIX))
        # Admin Activity is read-only and includes clone request destinations.
        # A full page could hide events; never call a truncated scan clean.
        query = (f'log_id("cloudaudit.googleapis.com/activity") protoPayload.serviceName="cloudsql.googleapis.com" '
                 f'protoPayload.authenticationInfo.principalEmail="{SA}" '
                 '(protoPayload.methodName="cloudsql.instances.clone" OR protoPayload.methodName="cloudsql.instances.create") '
                 f'timestamp>="{evidence["audit_window_start"]}" timestamp<="{evidence["audit_window_end"]}"')
        records = []
        for attempt in range(4):
            records = obj(gc("logging", "read", query, "--limit=1000", "--order=asc"))
            require(isinstance(records, list) and len(records) < 1000, "audit_missing_or_truncated")
            if not prior.get("clone_operation_id") or any(destination(r) == target for r in records):
                break
            if attempt < 3:
                time.sleep(20)  # Hosted only; allow Admin Activity ingestion.
        safe = []
        for record in records:
            name = destination(record)
            # LRO completion records can omit the request. Correlate them to
            # the first entry by operation ID; never infer a destination from
            # the source resourceName or silently discard an unknown record.
            if not name and record.get("operation", {}).get("last") is True:
                operation_id = record["operation"].get("id")
                matches = [r for r in records if operation_id and r.get("operation", {}).get("id") == operation_id and destination(r)]
                require(len({destination(r) for r in matches}) == 1, "audit_completion_uncorrelated")
                name = destination(matches[0])
            require(isinstance(name, str) and name and record.get("insertId") and record.get("timestamp"), "audit_destination_or_identity_missing")
            safe.append({"destination": name, "insert_id": record["insertId"], "timestamp": record["timestamp"],
                         "method": record["protoPayload"]["methodName"]})
        evidence["create_audit_records"] = safe
        evidence["unexpected_destinations"] = sorted({r["destination"] for r in safe if not r["destination"].startswith(PREFIX)})
        # Lost clone response still requires the inventory; a known accepted
        # operation additionally needs an audit entry, never an empty fake pass.
        require(not prior.get("clone_operation_id") or any(r["destination"] == target for r in safe), "own_clone_audit_not_observed")
        require(not evidence["remaining_drill_instances"], "drill_instances_remain")
        require(not evidence["unexpected_destinations"], "non_drill_create_by_drill_sa")
        evidence["status"] = "sweep_passed"
    except (DrillError, OSError, ValueError, TypeError, KeyError) as error:
        evidence["failure_code"] = str(error) if isinstance(error, DrillError) else "invalid_sweep_response"
    finally:
        evidence["finished_at"] = iso(utcnow())
        write(output, evidence)
    # Names only, never raw audit payloads/credentials. No automatic deletion of
    # a foreign instance: operator must investigate exact IDs in the artifact.
    print(json.dumps({k: evidence.get(k, []) for k in ("remaining_drill_instances", "unexpected_destinations")}))
    require(evidence["status"] == "sweep_passed", "sweep_failed_operator_inspection_required")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        sweep(args.target, args.evidence, args.output)
        return 0
    except (DrillError, OSError, ValueError, TypeError, KeyError):
        print("Post-run sweep failed; inspect sanitized sweep artifact and exact resource IDs.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
