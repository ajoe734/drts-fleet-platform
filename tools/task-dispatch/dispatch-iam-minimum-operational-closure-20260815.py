#!/usr/bin/env python3
"""Register the minimum operational IAM DAG for supervisor execution.

This script writes machine truth only through the canonical ai-status command.
It does not start workers itself; the supervisor dispatches dependency-ready
tasks into isolated worktrees.

Usage:
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-iam-minimum-operational-closure-20260815.py --dry-run
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-iam-minimum-operational-closure-20260815.py
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-iam-minimum-operational-closure-20260815.py --allow-existing
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PHASE = "iam-minimum-operational-closure-20260815"
GAP_REF = "docs/02-architecture/iam-minimum-operational-readiness-gap-20260815.md"
SD_REF = "docs/02-architecture/iam-minimum-operational-closure-system-design-20260815.md"
EXECUTION_REF = (
    "docs/03-runbooks/"
    "iam-minimum-operational-closure-execution-tasks-20260815.md"
)


def default_status_root() -> Path:
    configured = os.environ.get("AI_STATUS_ROOT") or os.environ.get("ORCH_STATUS_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()

    result = subprocess.run(
        [
            "git",
            "-C",
            str(REPO),
            "rev-parse",
            "--path-format=absolute",
            "--git-common-dir",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        common_dir = Path(result.stdout.strip()).resolve()
        if common_dir.name == ".git":
            return common_dir.parent
    return REPO


STATUS_ROOT = default_status_root()
STATUS_FILE = STATUS_ROOT / "ai-status.json"


@dataclass(frozen=True)
class Task:
    task_id: str
    owner: str
    reviewer: str
    title: str
    summary: str
    depends_on: tuple[str, ...]
    artifacts: tuple[str, ...]
    acceptance: tuple[str, ...]
    priority: str
    wave: str
    workstream: str
    task_class: str = "implementation"
    required_acceptance: tuple[str, ...] = ()


TASKS = (
    Task(
        "IAM-OP-AUTH-001",
        "Claude2",
        "Codex2",
        "Cut active tenant console to managed OIDC sessions",
        "Implement SD sections 2-3 in active tenant-console-web: BFF login callback session logout/logout-all, HttpOnly cookies, same-origin CSRF, bearer forwarding, page protection, and removal of demo/bootstrap identity paths. Do not change API OIDC exchange logic.",
        (),
        (
            "apps/tenant-console-web/app/api/auth/",
            "apps/tenant-console-web/app/control-plane-proxy/",
            "apps/tenant-console-web/lib/api-client.ts",
            "apps/tenant-console-web/lib/auth/",
            "apps/tenant-console-web/middleware.ts",
            "apps/tenant-console-web/tests/",
        ),
        (
            "Active tenant console completes managed login callback and session read",
            "Server and browser API calls use bearer auth without bootstrap identity headers",
            "Mutations enforce same-origin and CSRF before upstream fetch",
            "Logout invokes backend revocation and clears cookies",
            "No active demo identity fallback remains",
            "Tenant-console test typecheck build and browser gates pass",
        ),
        "P0",
        "A",
        "tenant-auth",
    ),
    Task(
        "IAM-OP-OIDC-001",
        "Codex2",
        "Claude2",
        "Make generic OIDC PKCE fail-closed in strict mode",
        "Implement SD section 4: strict startup validation for generic OIDC provider settings and runtime synthetic exchange limited to explicit mock mode in local/test. Preserve tenant and partner callback contracts and do not edit tenant-console code.",
        (),
        (
            "apps/api/src/config/auth-startup-config.ts",
            "apps/api/src/modules/auth/oidc-pkce.service.ts",
            "tests/unit/auth-startup-config.test.ts",
            "tests/integration/auth-startup-config.integration.test.ts",
            "tests/security/iam-oidc-strict-negative.test.ts",
        ),
        (
            "Strict startup rejects missing invalid or mock OIDC configuration",
            "Synthetic codes require explicit mock mode plus local or test environment",
            "Provider and validation failures create no session",
            "Auth logs redact codes tokens verifiers cookies and secrets",
            "Existing IAM baseline and focused OIDC tests pass",
        ),
        "P0",
        "A",
        "oidc-runtime",
    ),
    Task(
        "IAM-OP-ROUTE-ADM-001",
        "Gemini",
        "Codex",
        "Classify admin billing notification and product routes",
        "Classify the 17 admin and tenant-operation routes from the GAP using SD section 5.2. Prefer local decorators, preserve central notification policy, and add realm scope tenant and object negative tests. Do not edit the global route inventory test.",
        (),
        (
            "apps/api/src/modules/audit-notification/notifications.controller.ts",
            "apps/api/src/modules/billing-settlement/billing-settlement.controller.ts",
            "apps/api/src/modules/feature-flags/feature-flags.controller.ts",
            "apps/api/src/modules/platform-admin/tenant-governance.controller.ts",
            "apps/api/src/modules/product-rule/product-rule.controller.ts",
            "apps/api/src/common/auth/auth.policy.ts",
            "packages/contracts/src/iam-policy-catalog.ts",
            "tests/security/iam-route-admin-negative.test.ts",
        ),
        (
            "All 17 GAP routes have explicit policy",
            "Valid documented callers continue to work",
            "Wrong realm scope tenant object and actor attempts fail",
            "Feature flag and billing writes retain step-up boundary and audit controls",
            "No route is made public to avoid policy selection",
            "Focused policy contract and negative tests pass",
        ),
        "P0",
        "A",
        "route-admin",
    ),
    Task(
        "IAM-OP-ROUTE-DRV-001",
        "Gemini2",
        "Claude",
        "Classify driver settings forwarded tasks and shifts",
        "Classify the 13 driver-operation routes from the GAP using SD section 5.3. Enforce self assigned-driver and assigned-task boundaries without trusting path or body driver IDs. Do not edit central policy catalogue or global route inventory.",
        (),
        (
            "apps/api/src/modules/driver-settings/",
            "apps/api/src/modules/forwarder/",
            "apps/api/src/modules/shift-attendance/",
            "tests/security/iam-route-driver-negative.test.ts",
        ),
        (
            "All 13 GAP routes have explicit realm and scope policy",
            "Driver settings shifts and task actions enforce self or assignment bounds",
            "Wrong driver task realm scope and unauthenticated attempts fail",
            "Denials do not leak object existence",
            "Existing driver flows and focused negative tests pass",
        ),
        "P0",
        "A",
        "route-driver",
    ),
    Task(
        "IAM-OP-ROUTE-MAP-001",
        "Claude",
        "Codex2",
        "Classify foundation geo and service-area routes",
        "Classify the 20 foundation map routes from the GAP using SD section 5.4. Keep shared utilities authenticated, restrict admin lifecycle to foundation authority, preserve transitions and audit, and do not expose provider secrets.",
        (),
        (
            "apps/api/src/modules/foundation/foundation.controller.ts",
            "apps/api/src/modules/geo/geo.controller.ts",
            "apps/api/src/modules/service-area/",
            "tests/security/iam-route-map-negative.test.ts",
        ),
        (
            "All 20 GAP routes have explicit policy",
            "Shared map reads allow only approved authenticated realms",
            "Service-area admin lifecycle rejects tenant driver and partner realms",
            "Lifecycle and object checks plus mutation audit remain enforced",
            "Geo responses and errors expose no secret values",
            "Map geofence and focused negative tests pass",
        ),
        "P0",
        "A",
        "route-map",
    ),
    Task(
        "IAM-OP-ROUTE-EXT-001",
        "Codex",
        "Gemini2",
        "Classify sandbox dispatch and Tesla integration routes",
        "Classify the 21 sandbox and Tesla routes from the GAP using SD section 5.5. Use existing sandbox compliance and owned scopes, enforce vehicle/driver binding, keep public-sample authenticated, and redact all integration secrets.",
        (),
        (
            "apps/api/src/modules/sandbox-dispatch-gate/",
            "apps/api/src/modules/tesla-integration/",
            "tests/security/iam-route-integrations-negative.test.ts",
        ),
        (
            "All 21 GAP routes have explicit policy",
            "Sandbox read and manage operations enforce compliance scopes",
            "Tesla read and mutation operations enforce owned scope and bindings",
            "Cross-driver realm scope unauthenticated and stale-binding attempts fail",
            "OAuth virtual-key and provider secrets are redacted",
            "Integration and focused negative tests pass",
        ),
        "P0",
        "A",
        "route-integrations",
    ),
    Task(
        "IAM-OP-AUTH-E2E-001",
        "Gemini2",
        "Codex",
        "Prove active tenant login and revocation end to end",
        "Build a production-mode hermetic tenant-console/API acceptance harness with a deterministic local OIDC provider, not API synthetic codes. Prove login state PKCE session CSRF logout logout-all role downgrade suspension and tenant isolation, with exact dependency SHAs.",
        ("IAM-OP-AUTH-001", "IAM-OP-OIDC-001"),
        (
            "tests/e2e/",
            "tests/security/",
            "docs/04-uat/",
        ),
        (
            "Active tenant login read write and logout pass in production mode",
            "State PKCE CSRF origin and unauthenticated negative cases fail",
            "Role downgrade suspension and revoke invalidate issued browser sessions",
            "Cross-tenant access fails without existence leakage",
            "Browser storage contains no bearer IdP token verifier or secret",
            "Evidence is exact-SHA and labelled hermetic rather than cloud staging",
        ),
        "P0",
        "B",
        "auth-acceptance",
        task_class="verification",
    ),
    Task(
        "IAM-OP-ROUTE-VERIFY-001",
        "Codex2",
        "Claude",
        "Enforce full dynamic route inventory and negative matrix",
        "Replace the fixed eight-controller allowlist with recursive all-controller discovery. Require zero unclassified methods, validate scope-realm catalogue compatibility, and run representative runtime negatives for all route groups. Return policy defects to their owner instead of editing policies here.",
        (
            "IAM-OP-ROUTE-ADM-001",
            "IAM-OP-ROUTE-DRV-001",
            "IAM-OP-ROUTE-MAP-001",
            "IAM-OP-ROUTE-EXT-001",
        ),
        (
            "tests/security/iam-route-inventory.test.ts",
            "tests/security/iam-auth-negative-matrix.test.ts",
            "tests/contract/",
            "docs/04-uat/",
        ),
        (
            "Inventory discovers every controller recursively without an allowlist",
            "Current evidence reports 56 controllers and zero unclassified routes",
            "A temporary unclassified route makes the test fail with route details",
            "Unknown scopes and realm catalogue mismatches fail",
            "Representative auth and object-boundary negatives pass",
            "Focused 70-test IAM baseline remains green",
        ),
        "P0",
        "B",
        "route-acceptance",
        task_class="verification",
    ),
    Task(
        "IAM-OP-REL-001",
        "Gemini",
        "Claude",
        "Deploy and prove one strict IAM staging candidate",
        "Integrate reviewed IAM-OP candidates, deploy one exact SHA to strict cloud staging with real or dedicated OIDC configuration, prove GAP G1-G8, and correct stale IAM readiness claims. Non-strict Dev and local harnesses are not cloud proof.",
        ("IAM-OP-AUTH-E2E-001", "IAM-OP-ROUTE-VERIFY-001"),
        (
            ".github/workflows/",
            "operations/",
            "docs/04-uat/",
            GAP_REF,
        ),
        (
            "Strict startup-negative job rejects missing provider and mock mode",
            "Exact-SHA active tenant login read write and logout pass in cloud staging",
            "Role suspension cross-tenant scope and unauthenticated negatives pass",
            "Full inventory reports zero unclassified routes on the same SHA",
            "CI deploy revisions and UAT evidence identify one SHA",
            "Final IAM documentation matches implemented and cloud-proven evidence",
        ),
        "P0",
        "C",
        "iam-release",
        task_class="release",
        required_acceptance=(
            "dev_deploy_run_url",
            "dev_deploy_sha",
            "operational_acceptance_run_url",
            "operational_acceptance_sha",
            "staging_deploy_run_url",
            "staging_deploy_sha",
            "strict_oidc_login_evidence",
            "route_inventory_evidence",
            "revocation_boundary_evidence",
            "gap_g1_g8_evidence",
        ),
    ),
)


def load_existing_tasks() -> dict[str, dict[str, object]]:
    if not STATUS_FILE.exists():
        return {}
    payload = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    return {
        str(item.get("id")): item
        for item in payload.get("tasks", [])
        if isinstance(item, dict) and item.get("id")
    }


def validate_graph() -> None:
    valid_agents = {"Claude", "Claude2", "Gemini", "Gemini2", "Codex", "Codex2"}
    seen: set[str] = set()
    errors: list[str] = []
    for item in TASKS:
        if item.task_id in seen:
            errors.append(f"duplicate task id: {item.task_id}")
        if item.owner not in valid_agents or item.reviewer not in valid_agents:
            errors.append(f"unsupported lane on {item.task_id}")
        if item.owner == item.reviewer:
            errors.append(f"owner equals reviewer on {item.task_id}")
        late = [dep for dep in item.depends_on if dep not in seen]
        if late:
            errors.append(
                f"{item.task_id} dependencies missing or not topological: "
                + ", ".join(late)
            )
        if not item.artifacts or not item.acceptance:
            errors.append(f"{item.task_id} has incomplete execution detail")
        seen.add(item.task_id)

    expected_roots = {
        "IAM-OP-AUTH-001",
        "IAM-OP-OIDC-001",
        "IAM-OP-ROUTE-ADM-001",
        "IAM-OP-ROUTE-DRV-001",
        "IAM-OP-ROUTE-MAP-001",
        "IAM-OP-ROUTE-EXT-001",
    }
    roots = {item.task_id for item in TASKS if not item.depends_on}
    if roots != expected_roots:
        errors.append(f"unexpected roots: {sorted(roots)}")
    if errors:
        raise RuntimeError("Invalid IAM task graph:\n- " + "\n- ".join(errors))


def metadata_for(item: Task) -> dict[str, object]:
    return {
        "planning_ref": GAP_REF,
        "system_design_ref": SD_REF,
        "execution_ref": EXECUTION_REF,
        "priority": item.priority,
        "wave": item.wave,
        "workstream": item.workstream,
        "task_class": item.task_class,
        "minimum_operational_iam": True,
        "release_gate": True,
        "mutates_canonical": True,
        "required_acceptance": list(item.required_acceptance),
        "registered_by": "dispatch-iam-minimum-operational-closure-20260815.py",
    }


def register(item: Task) -> None:
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Codex")
    env["AI_STATUS_ROOT"] = str(STATUS_ROOT)
    env["ORCH_STATUS_ROOT"] = str(STATUS_ROOT)
    env.update(
        {
            "TASK_PHASE": PHASE,
            "TASK_TITLE": item.title,
            "TASK_SUMMARY_ZH": (
                f"[GAP: {GAP_REF}; SD: {SD_REF}; Execution: {EXECUTION_REF}] "
                f"{item.summary}"
            ),
            "TASK_DEPENDS_ON": ",".join(item.depends_on),
            "TASK_ARTIFACTS": ",".join(item.artifacts),
            "TASK_ACCEPTANCE": ",".join(item.acceptance),
            "TASK_REQUIRED_ACCEPTANCE": ",".join(item.required_acceptance),
            "TASK_METADATA_JSON": json.dumps(metadata_for(item), ensure_ascii=False),
            "TASK_MUTATES_CANONICAL": "true",
        }
    )
    result = subprocess.run(
        [
            "bash",
            "tools/development-orchestrator/bin/ai-status.sh",
            "assign",
            item.task_id,
            item.owner,
            item.reviewer,
            item.title,
        ],
        cwd=REPO,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown assignment error").strip()
        raise RuntimeError(f"{item.task_id} registration failed: {detail}")


def verify_materialized(expected_ids: set[str]) -> None:
    current = load_existing_tasks()
    missing = sorted(expected_ids - current.keys())
    if missing:
        raise RuntimeError("Tasks missing after registration: " + ", ".join(missing))

    expected = {item.task_id: item for item in TASKS}
    errors: list[str] = []
    for task_id in sorted(expected_ids):
        wanted = expected[task_id]
        actual = current[task_id]
        checks = (
            (tuple(actual.get("depends_on") or ()), wanted.depends_on, "dependencies"),
            (actual.get("priority"), wanted.priority, "priority"),
            (actual.get("phase"), PHASE, "phase"),
            (
                tuple(actual.get("required_acceptance") or ()),
                wanted.required_acceptance,
                "required acceptance",
            ),
        )
        for observed, target, label in checks:
            if observed != target:
                errors.append(f"{task_id} {label} mismatch")
        if not actual.get("artifacts") or not actual.get("acceptance"):
            errors.append(f"{task_id} missing artifacts or acceptance")
        if actual.get("owner") == actual.get("reviewer"):
            errors.append(f"{task_id} owner equals reviewer")
    if errors:
        raise RuntimeError(
            "Materialized task verification failed:\n- " + "\n- ".join(errors)
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print the DAG without changing machine truth.",
    )
    parser.add_argument(
        "--allow-existing",
        action="store_true",
        help="Skip existing task IDs after verifying materialized fields.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_graph()
    roots = [item.task_id for item in TASKS if not item.depends_on]
    print(
        f"Validated {len(TASKS)} IAM tasks; status_root={STATUS_ROOT}; "
        f"roots={','.join(roots)}"
    )
    for item in TASKS:
        deps = ",".join(item.depends_on) or "<root>"
        print(
            f"{item.task_id:24s} P={item.priority} W={item.wave} "
            f"{item.owner:7s}->{item.reviewer:7s} deps={deps}"
        )
    if args.dry_run:
        return 0

    existing = load_existing_tasks()
    collisions = sorted(item.task_id for item in TASKS if item.task_id in existing)
    if collisions and not args.allow_existing:
        print(
            "Refusing to overwrite existing machine-truth tasks: "
            + ", ".join(collisions)
            + ". Re-run with --allow-existing only after verifying the partial wave.",
            file=os.sys.stderr,
        )
        return 2

    registered: set[str] = set()
    for item in TASKS:
        if item.task_id in existing:
            registered.add(item.task_id)
            print(f"SKIP {item.task_id}: already present")
            continue
        register(item)
        registered.add(item.task_id)
        print(f"ASSIGNED {item.task_id}: {item.owner} -> {item.reviewer}")

    verify_materialized(registered)
    print(
        f"Materialized and verified {len(registered)}/{len(TASKS)} tasks. "
        "The supervisor may dispatch the six dependency-ready roots."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
