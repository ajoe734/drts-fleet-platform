#!/usr/bin/env python3
"""Register the truthful Stage 1 release-finalization DAG."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PHASE = "s1f-release-finalization-20260821"
GAP_REF = "docs/02-architecture/s1f-release-finalization-gap-20260821.md"
SD_REF = "docs/02-architecture/s1f-release-finalization-system-design-20260821.md"
EXECUTION_REF = "docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md"


def default_status_root() -> Path:
    configured = os.environ.get("AI_STATUS_ROOT") or os.environ.get("ORCH_STATUS_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    result = subprocess.run(
        ["git", "-C", str(REPO), "rev-parse", "--path-format=absolute", "--git-common-dir"],
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
    wave: str
    workstream: str
    task_class: str = "verification"
    mutates_canonical: bool = True
    required_acceptance: tuple[str, ...] = ()


TASKS = (
    Task(
        "S1F-REL-FIN-AUD-001", "Codex2", "Gemini2",
        "Reconcile Stage 1 release status and SHA evidence",
        "Audit active machine truth, PR #1451, Git ancestry, evidence files, and GitHub Actions. Produce a discrepancy ledger for candidate, CI, merge, deploy, and acceptance SHAs. Never classify PR CI as deployment evidence.",
        (),
        ("docs/04-uat/", "support/sidecars/S1F-REL-FIN-AUD-001/"),
        (
            "Every SHA and workflow URL is classified by lifecycle role",
            "Unsupported existing completion claims are identified",
            "No product or deployment configuration is changed",
        ),
        "A", "release-evidence", mutates_canonical=False,
    ),
    Task(
        "S1F-REL-FIN-PRE-001", "Gemini", "Codex",
        "Lock and preflight one deployable Stage 1 candidate",
        "Select one immutable SHA and verify reviewed dependency ancestry, required CI, deploy workflow syntax, candidate manifests, and hermetic release gates. Write a machine-readable candidate lock; do not deploy.",
        (),
        ("docs/04-uat/", "operations/verification/", "tests/e2e/", ".github/workflows/deploy-dev.yml"),
        (
            "Exactly one full candidate SHA is locked",
            "Reviewed Stage 1 dependencies are ancestors",
            "Required CI, workflow syntax, and manifests pass",
            "The candidate does not come from a dirty worktree",
        ),
        "A", "release-preflight", mutates_canonical=False,
    ),
    Task(
        "S1F-REL-FIN-GCP-001", "Claude2", "Gemini2",
        "Verify the external GCP billing and Artifact Registry gate",
        "Verify whether Dev project number 952590575714 can authorize Artifact Registry operations. If billing is unavailable, preserve the current provider error and do not trigger another deploy. Complete only when the external gate is demonstrably open; never use the legacy project as fallback.",
        (),
        ("docs/04-uat/", "support/sidecars/S1F-REL-FIN-GCP-001/", ".github/workflows/deploy-dev.yml"),
        (
            "Configured Dev project, region, and registry are recorded",
            "Billing and Artifact Registry readiness are verified",
            "A closed gate remains non-complete with exact remediation evidence",
            "No legacy project fallback is introduced",
        ),
        "A", "release-infrastructure", mutates_canonical=False,
        required_acceptance=("gcp_billing_ready_evidence",),
    ),
    Task(
        "S1F-REL-FIN-DEP-001", "Gemini2", "Claude",
        "Deploy the locked Stage 1 candidate to Dev",
        "After candidate and GCP gates pass, run the normal Deploy - Dev workflow once for the locked SHA. Capture image tag, migration, deployed revisions, URLs, and health jobs without bypassing failures or weakening runtime IAM.",
        ("S1F-REL-FIN-PRE-001", "S1F-REL-FIN-GCP-001"),
        (".github/workflows/deploy-dev.yml", "operations/", "docs/04-uat/"),
        (
            "Build and push, migration, deployment, and health checks succeed",
            "Workflow and required job URLs are recorded",
            "Deployed revisions identify the locked SHA",
            "Paused Partner Booking enforcement succeeds",
        ),
        "B", "release-deploy", task_class="implementation",
        required_acceptance=("dev_deploy_run_url", "dev_deploy_sha", "dev_service_urls"),
    ),
    Task(
        "S1F-REL-FIN-UAT-001", "Codex", "Gemini",
        "Run same-SHA Stage 1 operational acceptance",
        "Run the repository operational browser and HTTP acceptance against the URLs from the successful Dev deploy. Verify required journeys, candidate SHA headers, and paused or retired 404 behaviour.",
        ("S1F-REL-FIN-DEP-001",),
        ("operations/verification/", "tests/e2e/", "tests/smoke/", "docs/04-uat/"),
        (
            "Operational acceptance succeeds against deployed Dev URLs",
            "Every active API or BFF surface reports the deployed SHA",
            "Required browser journeys pass with backend readback",
            "Partner Booking, Concierge, and Passenger retired surfaces return 404",
        ),
        "C", "release-acceptance",
        required_acceptance=("operational_acceptance_run_url", "operational_acceptance_sha", "retired_surface_404_evidence"),
    ),
    Task(
        "S1F-REL-FIN-CLOSE-001", "Claude", "Codex2",
        "Publish truthful Stage 1 release finalization evidence",
        "Replace stale or unsupported completion claims with one final evidence pack. Reconcile candidate, CI, merge, deployment, and acceptance SHAs and map actual results to G1-G8. Close only when all required fields contain real evidence.",
        ("S1F-REL-FIN-AUD-001", "S1F-REL-FIN-UAT-001"),
        ("docs/04-uat/s1f-rel-001-release-candidate-evidence.md", "docs/04-uat/"),
        (
            "Evidence contains no pending fields or PR-CI-as-deploy substitution",
            "All SHA transitions are identical or explicitly proven",
            "G1-G8 claims cite actual tests and deployment jobs",
            "Closeout occurs only after deployment and operational acceptance",
        ),
        "D", "release-closeout", task_class="release",
        required_acceptance=(
            "dev_deploy_run_url", "dev_deploy_sha",
            "operational_acceptance_run_url", "operational_acceptance_sha",
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
            errors.append(f"{item.task_id} dependencies missing or not topological: {', '.join(late)}")
        if not item.artifacts or not item.acceptance:
            errors.append(f"{item.task_id} has incomplete execution detail")
        seen.add(item.task_id)
    expected_roots = {
        "S1F-REL-FIN-AUD-001",
        "S1F-REL-FIN-PRE-001",
        "S1F-REL-FIN-GCP-001",
    }
    roots = {item.task_id for item in TASKS if not item.depends_on}
    if roots != expected_roots:
        errors.append(f"unexpected roots: {sorted(roots)}")
    if errors:
        raise RuntimeError("Invalid release-finalization graph:\n- " + "\n- ".join(errors))


def metadata_for(item: Task) -> dict[str, object]:
    return {
        "planning_ref": GAP_REF,
        "system_design_ref": SD_REF,
        "execution_ref": EXECUTION_REF,
        "priority": "P0",
        "wave": item.wave,
        "workstream": item.workstream,
        "task_class": item.task_class,
        "release_finalization": True,
        "minimal_security_scope": True,
        "external_gate": item.task_id == "S1F-REL-FIN-GCP-001",
        "mutates_canonical": item.mutates_canonical,
        "required_acceptance": list(item.required_acceptance),
        "registered_by": "dispatch-s1f-release-finalization-20260821.py",
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
            "TASK_SUMMARY_ZH": f"[GAP: {GAP_REF}; SD: {SD_REF}; Execution: {EXECUTION_REF}] {item.summary}",
            "TASK_DEPENDS_ON": ",".join(item.depends_on),
            "TASK_ARTIFACTS": ",".join(item.artifacts),
            "TASK_ACCEPTANCE": ",".join(item.acceptance),
            "TASK_REQUIRED_ACCEPTANCE": ",".join(item.required_acceptance),
            "TASK_METADATA_JSON": json.dumps(metadata_for(item), ensure_ascii=False),
            "TASK_MUTATES_CANONICAL": "true" if item.mutates_canonical else "false",
        }
    )
    result = subprocess.run(
        [
            "bash", "tools/development-orchestrator/bin/ai-status.sh", "assign",
            item.task_id, item.owner, item.reviewer, item.title,
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
            (actual.get("phase"), PHASE, "phase"),
            (tuple(actual.get("required_acceptance") or ()), wanted.required_acceptance, "required acceptance"),
        )
        for observed, target, label in checks:
            if observed != target:
                errors.append(f"{task_id} {label} mismatch")
        if not actual.get("artifacts") or not actual.get("acceptance"):
            errors.append(f"{task_id} missing artifacts or acceptance")
    if errors:
        raise RuntimeError("Materialized task verification failed:\n- " + "\n- ".join(errors))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-existing", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_graph()
    roots = [item.task_id for item in TASKS if not item.depends_on]
    print(f"Validated {len(TASKS)} tasks; status_root={STATUS_ROOT}; roots={','.join(roots)}")
    for item in TASKS:
        deps = ",".join(item.depends_on) or "<root>"
        print(f"{item.task_id:24s} W={item.wave} {item.owner:7s}->{item.reviewer:7s} deps={deps}")
    if args.dry_run:
        return 0
    existing = load_existing_tasks()
    collisions = sorted(item.task_id for item in TASKS if item.task_id in existing)
    if collisions and not args.allow_existing:
        raise RuntimeError("Refusing to overwrite existing tasks: " + ", ".join(collisions))
    for item in TASKS:
        if item.task_id not in existing:
            register(item)
    verify_materialized({item.task_id for item in TASKS})
    print("Registered and verified release-finalization DAG.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
