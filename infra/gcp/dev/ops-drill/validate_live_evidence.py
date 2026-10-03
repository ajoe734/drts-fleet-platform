"""Validate downloaded hosted restore evidence, not capacity/restart acceptance."""
import argparse
from pathlib import Path
import re
import sys

from provision_drill_sa import SA
from restore_drill import PROJECT, REGION, SOURCE, DrillError, compare, obj, require, timestamp, validate_snapshot


def validate(folder, candidate, run_id, attempt):
    require(bool(re.fullmatch("[0-9a-f]{40}", candidate)), "candidate_missing")
    require(run_id.isdigit() and attempt.isdigit(), "run_identity_missing")
    restore, sweep, ready = (obj((Path(folder) / name).read_text()) for name in ("restore.json", "sweep.json", "readiness.json"))
    run_url = f"https://github.com/ajoe734/drts-fleet-platform/actions/runs/{run_id}"
    for record in (restore, sweep):
        require(record.get("candidate_sha") == candidate and record.get("run_url") == run_url and record.get("run_attempt") == attempt, "candidate_or_run_mismatch")
        require(record.get("target") == f"{SOURCE}-drill-{run_id}-{attempt}" and record.get("project") == PROJECT and record.get("source") == SOURCE and record.get("region") == REGION, "target_mismatch")
        require(bool(re.fullmatch("[0-9a-f]{40}", record.get("base_sha", ""))), "base_missing")
    require(ready.get("candidate_sha") == candidate and ready.get("service_account") == SA and re.fullmatch("[0-9a-f]{64}", ready.get("audit_sha256", "")), "operator_readiness_missing")
    require(0 <= (timestamp(restore.get("started_at")) - timestamp(ready.get("checked_at"))).total_seconds() <= 86400, "operator_readiness_stale")
    require(restore.get("status") == "restore_readback_passed" and restore.get("cleanup", {}).get("status") == "deleted", "restore_or_cleanup_failed")
    require(restore.get("clone_operation_id"), "clone_operation_missing")
    require(timestamp(restore["cleanup"].get("confirmed_at")) >= timestamp(restore.get("clone_started_at")), "cleanup_order_invalid")
    point = timestamp(restore.get("point_in_time"))
    restored = validate_snapshot(restore.get("clone_readback"))
    compare(validate_snapshot(restore.get("source_before")), restored, point)
    expected_rpo = compare(validate_snapshot(restore.get("source_after")), restored, point)
    require(restore.get("rpo_observation") == expected_rpo, "rpo_observation_inconsistent")
    for key in ("rto_runnable_seconds", "rto_readable_seconds", "readback_query_seconds"):
        require(type(restore.get(key)) in (int, float) and 0 < restore[key] < 3600, "timing_missing")
    require(restore["rto_readable_seconds"] >= restore["rto_runnable_seconds"], "rto_order_invalid")
    require(sweep.get("status") == "sweep_passed" and sweep.get("remaining_drill_instances") == [] and sweep.get("unexpected_destinations") == [], "sweep_failed")
    require(any(r.get("destination") == restore["target"] and r.get("insert_id") for r in sweep.get("create_audit_records", [])), "clone_audit_missing")
    return {"restore_readback": "passed", "capacity": "not_evaluated", "scheduled_restart": "not_evaluated"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--attempt", required=True)
    args = parser.parse_args()
    try:
        print(validate(args.folder, args.candidate, args.run_id, args.attempt))
    except (DrillError, OSError, ValueError, KeyError, TypeError):
        print("Hosted restore evidence missing, inconsistent or failed; no live acceptance.", file=sys.stderr)
        sys.exit(1)
