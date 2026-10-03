"""Operator-only additive IAM provisioning; default is a read-only plan.

Supervisor decision 2026-10-03T02:20Z accepts the non-enforceable clone
destination. Never broaden source clone or prefix delete on an API failure.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

from restore_drill import PROJECT, REGION, SOURCE, DrillError, command, gc, iso, obj, require, utcnow, write

SA_ID = "drts-dev-ops-drill"
SA = f"{SA_ID}@{PROJECT}.iam.gserviceaccount.com"
MEMBER = "serviceAccount:" + SA
REPO = "ajoe734/drts-fleet-platform"
SECRET = "drts-dev-db-url"
READY_VAR = "DEV_OPS_DRILL_READY"


def role_specs():
    source = f"projects/{PROJECT}/instances/{SOURCE}"
    sql = "resource.service == 'sqladmin.googleapis.com' && "
    return [
        {"id": "drtsOpsDrillSourceClone", "permissions": ["cloudsql.instances.clone"],
         "expression": sql + f"resource.name == '{source}'"},
        {"id": "drtsOpsDrillTemporary", "permissions": ["cloudsql.instances.get", "cloudsql.instances.connect", "cloudsql.instances.delete"],
         "expression": sql + f"resource.name.startsWith('{source}-drill-')"},
        {"id": "drtsOpsDrillSourceRead", "permissions": ["cloudsql.instances.get", "cloudsql.instances.connect"],
         "expression": sql + f"resource.name == '{source}'"},
        # Project listing and Admin Activity audit are read-only. Operations.get
        # uses instances.get above; no invented cloudsql.operations permission.
        {"id": "drtsOpsDrillInventory", "permissions": ["cloudsql.instances.list", "logging.logEntries.list"],
         "expression": None},
    ]


def binding(spec):
    result = {"role": f"projects/{PROJECT}/roles/{spec['id']}", "members": [MEMBER]}
    if spec["expression"]:
        result["condition"] = {"title": spec["id"], "expression": spec["expression"]}
    return result


def plan():
    for name, expected in (("DEV_GCP_PROJECT_ID", PROJECT), ("DEV_GCP_REGION", REGION),
                           ("DEV_GCP_CLOUDSQL_INSTANCE", f"{PROJECT}:{REGION}:{SOURCE}")):
        require(command(["gh", "variable", "get", name, "--repo", REPO]) == expected, "live_variables_changed")
    number = str(obj(gc("projects", "describe", PROJECT)).get("projectNumber", ""))
    require(number.isdigit(), "project_number_missing")
    provider = obj(gc("iam", "workload-identity-pools", "providers", "describe", "github",
                      "--location=global", "--workload-identity-pool=github-actions"))
    require(provider.get("attributeMapping", {}).get("attribute.repository") == "assertion.repository", "provider_mapping_changed")
    require(provider.get("attributeCondition") == "assertion.repository=='ajoe734/drts-fleet-platform'", "provider_trust_changed")
    require(provider.get("oidc", {}).get("issuerUri") == "https://token.actions.githubusercontent.com" and not provider.get("disabled", False), "provider_issuer_or_state_changed")
    return {
        "status": "plan_only", "service_account": SA,
        "provider": f"projects/{number}/locations/global/workloadIdentityPools/github-actions/providers/github",
        "wif_member": f"principalSet://iam.googleapis.com/projects/{number}/locations/global/workloadIdentityPools/github-actions/attribute.repository/{REPO}",
        "roles": role_specs(), "project_bindings": [binding(s) for s in role_specs()],
        "secret_binding": {"secret": SECRET, "role": "roles/secretmanager.secretAccessor"},
        "readiness_variable": READY_VAR,
        "residual_risk": "Clone destination is NOT IAM-enforceable. A misused token can create extra clones costing money and copying dev data in this project. No SQL Admin API overwrite/update/restore or non-drill delete is granted. Existing DB credentials retain their database privileges; read-only SQL is a runner control, not a database authorization boundary.",
        "source_condition": "Source-only clone condition retained. If Cloud SQL rejects it, stop for operator/Supervisor evidence; no automatic unconditional fallback.",
    }


def same_binding(left, right):
    return left.get("role") == right["role"] and left.get("condition", {}) == right.get("condition", {})


def audit_policy(policy, allowed, *, inherited=False):
    """Reject unknown grants, including ambiguous group/public inheritance.

    A conservative audit: it never assumes a group excludes the SA. Unknown
    grants require operator investigation, not automatic removal or acceptance.
    """
    for entry in policy.get("bindings", []):
        members = entry.get("members", [])
        if MEMBER in members:
            require(not inherited and any(same_binding(entry, b) for b in allowed), "unexpected_sa_grant")
        broad = any(m in ("allUsers", "allAuthenticatedUsers") or m.startswith(("group:", "domain:", "principalSet:")) for m in members)
        if broad:
            # Exact repository WIF binding is allowed only on this dedicated SA.
            if any(entry == b for b in allowed):
                continue
            role = obj(gc("iam", "roles", "describe", entry["role"]))
            permissions = role.get("includedPermissions")
            require(isinstance(permissions, list), "role_permissions_missing")
            require(not any(p.startswith(("cloudsql.", "secretmanager.", "iam.serviceAccounts.", "iam.roles.")) or p.endswith("setIamPolicy") for p in permissions), "ambiguous_public_or_group_grant")


def inventory(design, complete=False):
    """Read all policies before any write. A failed read is never 'not found'."""
    ancestors = obj(gc("projects", "get-ancestors", PROJECT))
    require(isinstance(ancestors, list) and any(a.get("type") == "project" and a.get("id") == PROJECT for a in ancestors), "ancestors_missing")
    policies = []
    for ancestor in ancestors:
        kind = ancestor.get("type")
        require(kind in ("project", "folder", "organization"), "unknown_ancestor")
        prefix = ("projects",) if kind == "project" else ("resource-manager", "folders") if kind == "folder" else ("organizations",)
        policy = obj(gc(*prefix, "get-iam-policy", str(ancestor["id"])))
        audit_policy(policy, design["project_bindings"], inherited=kind != "project")
        policies.append(policy)
    project_policy = policies[next(i for i, a in enumerate(ancestors) if a["type"] == "project")]
    accounts = obj(gc("iam", "service-accounts", "list"))
    account = next((a for a in accounts if a.get("email") == SA), None)
    if account:
        require(not account.get("disabled", False), "service_account_disabled")
    roles = obj(gc("iam", "roles", "list", "--show-deleted"))
    existing = {}
    for spec in design["roles"]:
        name = f"projects/{PROJECT}/roles/{spec['id']}"
        match = next((r for r in roles if r.get("name") == name), None)
        if match:
            role = obj(gc("iam", "roles", "describe", spec["id"]))
            require(not role.get("deleted") and role.get("stage") != "DISABLED" and set(role.get("includedPermissions", [])) == set(spec["permissions"]), "existing_custom_role_drift")
            existing[spec["id"]] = role
    secret_policy = obj(gc("secrets", "get-iam-policy", SECRET))
    secret_binding = {"role": "roles/secretmanager.secretAccessor", "members": [MEMBER]}
    audit_policy(secret_policy, [secret_binding])
    wif = {"role": "roles/iam.workloadIdentityUser", "members": [design["wif_member"]]}
    sa_policy = obj(gc("iam", "service-accounts", "get-iam-policy", SA)) if account else {"bindings": []}
    require(all(b == wif for b in sa_policy.get("bindings", [])), "unexpected_sa_impersonation_grant")
    if complete:
        require(account and len(existing) == len(design["roles"]), "provisioning_incomplete")
        require(all(any(MEMBER in b.get("members", []) and same_binding(b, wanted) for b in project_policy.get("bindings", [])) for wanted in design["project_bindings"]), "project_binding_missing")
        require(any(MEMBER in b.get("members", []) and same_binding(b, secret_binding) for b in secret_policy.get("bindings", [])), "secret_binding_missing")
        require(wif in sa_policy.get("bindings", []), "wif_binding_missing")
    return {"account": account, "roles": existing, "project_policy": project_policy,
            "secret_policy": secret_policy, "sa_policy": sa_policy,
            "audit_digest": hashlib.sha256(json.dumps([policies, existing, secret_policy, sa_policy], sort_keys=True).encode()).hexdigest()}


def apply(design, state):
    if not state["account"]:
        gc("iam", "service-accounts", "create", SA_ID, "--display-name=Dev isolated restore drill")
    for spec, wanted in zip(design["roles"], design["project_bindings"]):
        if spec["id"] not in state["roles"]:
            gc("iam", "roles", "create", spec["id"], "--title=" + spec["id"], "--stage=GA", "--permissions=" + ",".join(spec["permissions"]))
        if not any(MEMBER in b.get("members", []) and same_binding(b, wanted) for b in state["project_policy"].get("bindings", [])):
            condition = "None" if not spec["expression"] else "title=" + spec["id"] + ",expression=" + spec["expression"]
            gc("projects", "add-iam-policy-binding", PROJECT, "--member=" + MEMBER, "--role=" + wanted["role"], "--condition=" + condition)
    if not any(MEMBER in b.get("members", []) and b.get("role") == "roles/secretmanager.secretAccessor" for b in state["secret_policy"].get("bindings", [])):
        gc("secrets", "add-iam-policy-binding", SECRET, "--member=" + MEMBER, "--role=roles/secretmanager.secretAccessor", "--condition=None")
    if not state["sa_policy"].get("bindings"):
        gc("iam", "service-accounts", "add-iam-policy-binding", SA, "--member=" + design["wif_member"], "--role=roles/iam.workloadIdentityUser", "--condition=None")


def confirm(action, sha):
    require(sys.stdin.isatty() and not os.environ.get("GITHUB_ACTIONS"), "interactive_operator_required")
    phrase = f"{action} {SA} {sha}"
    print("Review the plan and residual risk above. No database clone will be run.")
    require(input(f"Type exactly: {phrase}\n> ") == phrase, "operator_confirmation_declined")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".local/sr-live-ops-001/iam-plan.json")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    modes.add_argument("--check-ready", action="store_true")
    args = parser.parse_args()
    try:
        design = plan()
        sha = command(["git", "rev-parse", "HEAD"])
        require(bool(re.fullmatch("[0-9a-f]{40}", sha)), "immutable_sha_required")
        design["candidate_sha"] = sha
        write(Path(args.output), design)
        print(json.dumps(design, indent=2))
        if not (args.apply or args.check_ready):
            return 0
        require(command(["git", "status", "--porcelain", "--", "infra/gcp/dev/ops-drill", ".github/workflows/live-ops-restore-drill.yml"]) == "", "dirty_provisioner")
        state = inventory(design, complete=args.check_ready)
        confirm("APPLY" if args.apply else "READY", sha)
        if args.apply:
            apply(design, state)
            inventory(design, complete=True)
            print("IAM applied and read back. Run --check-ready separately to publish candidate readiness.")
        else:
            # Read again after the prompt; do not attest a stale policy snapshot.
            state = inventory(plan(), complete=True)
            receipt = {"candidate_sha": sha, "service_account": SA, "provider": design["provider"],
                       "checked_at": iso(utcnow()), "audit_sha256": state["audit_digest"]}
            command(["gh", "variable", "set", READY_VAR, "--repo", REPO, "--body", json.dumps(receipt)])
            write(Path(args.output), receipt)
            print("Operator readiness recorded for this candidate only; hosted restore acceptance is still pending.")
        return 0
    except (DrillError, OSError, ValueError, TypeError, KeyError, EOFError) as error:
        code = str(error) if isinstance(error, DrillError) else "invalid_input_or_runtime"
        print(f"IAM operator command failed closed: {code}. Partial IAM setup may require a reviewed rerun; no readiness was promised.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
