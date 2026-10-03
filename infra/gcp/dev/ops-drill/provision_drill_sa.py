"""Fail closed on the unresolved clone-destination IAM boundary.

Do not turn --apply into an unconditioned clone grant. The approved constraints
require an IAM-enforced destination prefix, not just a runner input check.
"""
import argparse
import json
from pathlib import Path
import sys

from restore_drill import PROJECT, SOURCE, DrillError, command, gc, obj, require, write

SA_ID = "drts-dev-ops-drill"
SA = f"{SA_ID}@{PROJECT}.iam.gserviceaccount.com"
BLOCKER = "clone_destination_iam_enforcement_unverified"


def plan():
    # Match the existing provider trust verification in internal-key-exceptions
    # §14.1 (the task's §11.1 reference is stale at the current base).
    project = obj(gc("projects", "describe", PROJECT))
    number = str(project.get("projectNumber", ""))
    require(number.isdigit(), "project_number_missing")
    provider = obj(gc("iam", "workload-identity-pools", "providers", "describe", "github",
                      "--location=global", "--workload-identity-pool=github-actions"))
    require(provider.get("attributeMapping", {}).get("attribute.repository") == "assertion.repository", "provider_mapping_changed")
    require(provider.get("attributeCondition") == "assertion.repository=='ajoe734/drts-fleet-platform'", "provider_trust_changed")
    require(provider.get("oidc", {}).get("issuerUri") == "https://token.actions.githubusercontent.com" and not provider.get("disabled", False), "provider_issuer_or_state_changed")
    source_name = f"projects/{PROJECT}/instances/{SOURCE}"
    prefix = source_name + "-drill-"
    sql = "resource.service == 'sqladmin.googleapis.com' && "
    return {
        "status": "blocked_not_applied", "blocker": BLOCKER, "service_account": SA,
        "provider": f"projects/{number}/locations/global/workloadIdentityPools/github-actions/providers/github",
        "wif_member": f"principalSet://iam.googleapis.com/projects/{number}/locations/global/workloadIdentityPools/github-actions/attribute.repository/ajoe734/drts-fleet-platform",
        "wif_role_on_service_account": "roles/iam.workloadIdentityUser",
        "proposed_roles": [
            {"id": "drtsOpsDrillSourceClone", "permissions": ["cloudsql.instances.clone"],
             "condition": sql + f"resource.name == '{source_name}'",
             "apply": False, "reason": "source condition does not prove destination-prefix enforcement"},
            {"id": "drtsOpsDrillConnect", "permissions": ["cloudsql.instances.get", "cloudsql.instances.connect"],
             "condition": sql + f"(resource.name == '{source_name}' || resource.name.startsWith('{prefix}'))"},
            {"id": "drtsOpsDrillDelete", "permissions": ["cloudsql.instances.delete"],
             "condition": sql + f"resource.name.startsWith('{prefix}')"},
        ],
        "secret_binding": {"resource": f"projects/{PROJECT}/secrets/drts-dev-db-url", "role": "roles/secretmanager.secretAccessor"},
        "missing_design": [
            "documented IAM enforcement of clone destination or reviewed broker architecture",
            "least-privilege authorization for getLatestRecoveryTime and operation polling verified live",
            "idempotent resource application and effective inherited IAM audit after boundary resolution",
        ],
        "forbidden_permissions": ["cloudsql.instances.create", "cloudsql.instances.update", "cloudsql.instances.restoreBackup", "cloudsql.instances.restart"],
        "notes": "No resource, role, binding, secret or variable was created. Existing provider is repository-wide, not workflow-specific.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".local/sr-live-ops-001/iam-plan.json")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check-ready", action="store_true")
    args = parser.parse_args()
    if args.apply or args.check_ready:
        print(f"BLOCKED: {BLOCKER}; Supervisor must resolve the documented boundary before any IAM mutation or drill dispatch.", file=sys.stderr)
        return 2
    try:
        require(command(["gh", "variable", "get", "DEV_GCP_PROJECT_ID", "--repo", "ajoe734/drts-fleet-platform"]) == PROJECT, "live_project_changed")
        result = plan()
        write(Path(args.output), result)
        print("Read-only IAM plan written; provisioning remains BLOCKED.")
        return 0
    except (DrillError, OSError, ValueError, TypeError):
        print("IAM planning failed closed; no mutation attempted.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
