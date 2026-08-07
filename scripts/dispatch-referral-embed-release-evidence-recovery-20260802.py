#!/usr/bin/env python3
"""Register Referral Embed release-evidence recovery tasks for supervisor dispatch."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
PHASE = "referral-embed-release-evidence-recovery-20260802"
PLANNING_REF = "docs/03-runbooks/referral-embed-release-evidence-recovery-execution-tasks-20260802.md"


TASKS = [
    {
        "id": "ORCH-REL-GATE-002",
        "owner": "Codex2",
        "reviewer": "Codex",
        "title": "Enforce acceptance-driven release integration closeout",
        "summary": "Preserve the REL-REF-EMBED-001 incident trail and implement task-level required integration status/evidence enforcement. Reject not_applicable or merge-only closeout for dev-deployment tasks, and prevent git reconciliation from auto-closing them without deployment evidence.",
        "deps": "",
        "artifacts": f"{PLANNING_REF},scripts/ai_status.py,.orchestrator/integration_gate.py,.orchestrator/test_ai_status.py,.orchestrator/skills/integration-closeout.md",
        "acceptance": "Regression reproduces and rejects the REL-REF-EMBED-001 bypass; required_integration_status=dev_deployed cannot close with not_applicable/merged_to_dev or git reconciliation alone; configured PR/CI/merge/deploy/live evidence is mandatory; explicit support-only tasks remain valid; focused tests and full orchestrator tests pass; reviewed change merged to dev",
        "metadata": {
            "task_class": "orchestrator_control",
            "mutates_canonical": True,
            "required_integration_status": "merged_to_dev",
            "incident_of": "REL-REF-EMBED-001",
        },
    },
    {
        "id": "REL-REF-EMBED-002",
        "owner": "Codex",
        "reviewer": "Codex2",
        "title": "Recover real Referral Embed dev deployment and live proof",
        "summary": "Supersede the false REL-REF-EMBED-001 closeout. Deploy the reviewed origin/dev tree, record PR/CI/merge/Deploy-Dev/SHA evidence, and verify the formal Yuhe Referral URL, session-driven authorized flow, denial paths, CSP, and paused-service constraints against the canonical Passenger Embed design.",
        "deps": "ORCH-REL-GATE-002",
        "artifacts": ".github/workflows/deploy-dev.yml,docs/02-architecture/app-entry-url-index-20260616.md,support/sidecars/REL-REF-EMBED-002/",
        "acceptance": "Required CI passes; exact reviewed tree is deployed by successful Deploy-Dev; formal and Cloud Run URLs have timestamped live evidence; authorized flow works; missing/replay/cross-entry fail closed; CSP is correct; canonical HTML/JSX parity is retained; Partner Booking and Concierge remain stopped; machine truth is dev_deployed with all required evidence",
        "metadata": {
            "task_class": "release",
            "mutates_canonical": True,
            "required_integration_status": "dev_deployed",
            "required_evidence_fields": [
                "pr_url",
                "ci_run_url",
                "merge_commit",
                "dev_deploy_run_url",
                "dev_deploy_sha",
                "live_verification_urls",
            ],
            "supersedes": "REL-REF-EMBED-001",
        },
    },
    {
        "id": "AUDIT-REF-LIVE-002",
        "owner": "Codex2",
        "reviewer": "Codex",
        "title": "Independently audit Referral Embed deploy and live evidence",
        "summary": "Do not trust the release sidecar. Independently verify Deploy-Dev conclusion and SHA ancestry, reproduce timestamped formal-domain and Cloud Run checks, exercise authorized and fail-closed paths, and confirm Partner Booking and Concierge remain stopped.",
        "deps": "REL-REF-EMBED-002",
        "artifacts": "support/sidecars/AUDIT-REF-LIVE-002/",
        "acceptance": "Deploy run/SHA/origin-dev ancestry agree; timestamped live evidence is reproducible; authorized and denial paths are independently observed; paused services remain down; any mismatch reopens or blocks the release claim",
        "metadata": {
            "task_class": "sidecar",
            "mutates_canonical": False,
            "required_integration_status": "not_applicable",
            "audits": "REL-REF-EMBED-002",
        },
    },
]


def register(task: dict[str, object]) -> bool:
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Codex")
    env["TASK_TITLE"] = str(task["title"])
    env["TASK_SUMMARY_ZH"] = f"[依據 {PLANNING_REF}] {task['summary']}"
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = str(task["deps"])
    env["TASK_ARTIFACTS"] = str(task["artifacts"])
    env["TASK_ACCEPTANCE"] = str(task["acceptance"])
    env["TASK_METADATA_JSON"] = json.dumps(task["metadata"], ensure_ascii=False)
    result = subprocess.run(
        [
            "bash",
            "scripts/ai-status.sh",
            "assign",
            str(task["id"]),
            str(task["owner"]),
            str(task["reviewer"]),
            str(task["title"]),
        ],
        cwd=REPO,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        sys.stderr.write(f"FAILED {task['id']}: {result.stderr}\n")
        return False
    print(f"{task['id']}: {task['owner']} -> {task['reviewer']} deps=[{task['deps']}]")
    return True


def main() -> int:
    completed = 0
    for index, task in enumerate(TASKS):
        completed += int(register(task))
        if index < len(TASKS) - 1:
            time.sleep(3)
    print(f"Registered {completed}/{len(TASKS)} tasks for supervisor-managed execution.")
    return 0 if completed == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
