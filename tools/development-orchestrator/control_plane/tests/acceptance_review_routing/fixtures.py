from copy import deepcopy


def acceptance_task():
    return {
        "id": "SR-OPS-CAPACITY-FAILCLOSED-20261012",
        "status": "acceptance",
        "owner": "Codex2",
        "reviewer": "Codex",
        "mutates_canonical": True,
        "candidate_lifecycle_version": 1,
        "candidate_sha": "6d986764dc830dbb005caa4b8126d548ada23765",
        "candidate_generation": "b83c24ca0f484d92a8557327435d2b41",
        "candidate_branch": "codex2/c123",
        "reviewed_sha": "6d986764dc830dbb005caa4b8126d548ada23765",
        "ci_sha": "6d986764dc830dbb005caa4b8126d548ada23765",
        "ci_status": "success",
        "merge_sha": "1fba7476925bb29e6f2eeff7acbeb0ba16d0afb4",
        "depends_on": [],
        "required_acceptance": ["full900", "previous_gate"],
        "acceptance_evidence": {"previous_gate": "retained-existing-evidence"},
        "last_update": "2026-10-13T01:28:18Z",
        "next": "Full900 failed; assigned reviewer decision required",
        "eligible_agents": {"owner": ["Codex2"], "reviewer": ["Codex"]},
    }


def snapshot(task):
    return {key: task[key] for key in (
        "candidate_sha", "candidate_generation", "reviewed_sha", "merge_sha", "reviewer"
    )} | {"task_id": task["id"]}


def requested_task():
    task = deepcopy(acceptance_task())
    task["acceptance_review_request"] = {
        **snapshot(task),
        "request_id": "request-1",
        "state": "pending",
        "requested_by": "Supervisor",
        "requested_at": "2026-10-13T01:28:18Z",
        "reason": "Hosted full900 failed; producer/finalization defect",
        "evidence_ref": "docs/04-uat/c123-failed-full900.md",
    }
    return task
