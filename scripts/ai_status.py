#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STATUS_FILE = ROOT / "ai-status.json"
LOG_FILE = ROOT / "ai-activity-log.jsonl"
CURRENT_WORK_FILE = ROOT / "current-work.md"
DOCS_SITE_DIR = ROOT / "docs-site"

KNOWN_AGENTS = {
    "Claude": {
        "capability_lane": ["governance-review", "architecture-arbitration", "control-plane"],
        "default_branch": "feat/claude-governance-review",
        "target_workload": 15,
    },
    "Gemini": {
        "capability_lane": ["runtime-packaging", "ci-cd", "infra", "worker-ops"],
        "default_branch": "feat/gemini-runtime-infra",
        "target_workload": 20,
    },
    "Codex": {
        "capability_lane": ["contracts", "schema", "state-system", "acceptance"],
        "default_branch": "feat/codex-phase1-architecture",
        "target_workload": 30,
    },
    "Codex2": {
        "capability_lane": ["contracts", "schema", "state-system", "acceptance"],
        "default_branch": "feat/codex2-parallel-worker",
        "target_workload": 15,
    },
    "Qwen": {
        "capability_lane": ["integration", "api-implementation", "adapter-execution", "acceptance"],
        "default_branch": "feat/qwen-integration-slices",
        "target_workload": 20,
    },
    "Copilot": {
        "capability_lane": ["research-ingest", "external-search", "spec-review", "critique"],
        "default_branch": "feat/copilot-spec-critique",
        "target_workload": 15,
    },
}

AGENT_ALIASES = {
    "qwen": "Qwen",
    "qwen coder": "Qwen",
    "qwen2.5-coder": "Qwen",
    "qwen3": "Qwen",
    "千問": "Qwen",
    "grok": "Copilot",
    "copilot": "Copilot",
    "copilot host": "Copilot",
    "copilot_host": "Copilot",
    "codex2": "Codex2",
    "codex 2": "Codex2",
}

STATUS_LABELS = {
    "todo": "todo",
    "in_progress": "in_progress",
    "review": "review",
    "review_approved": "review_approved",
    "blocked": "blocked",
    "done": "done",
}

VALID_EXECUTION_MODES = {
    "discussion_planning",
    "supervisor_managed_execution",
}

DEPENDENCY_DONE_STATUSES = {"done"}
EXTERNAL_TASK_PREFIXES = {"OC", "RS", "LP", "OSS", "SPIKE"}
FIRST_PROMPT_PRIORITY = [
    "AI_COLLABORATION_GUIDE.md",
    "current-work.md",
    "ai-status.json",
    "SUPERVISOR_OPERATING_MODEL.md",
    "MULTI_LLM_CONSENSUS_WORKFLOW.md",
    "PHASE1_DISCUSSION_ASSIGNMENTS.md",
    "CANONICAL_DOCUMENT_MAP.md",
    "phase1_prd_detailed_v1.md",
    "phase1_system_analysis_v1.md",
    "phase1_service_contracts_v1.md",
    "phase1_migration_plan_v1.md",
]
OPTIONAL_CURRENT_WORK_REFERENCES = (
    ("SUPERVISOR_OPERATING_MODEL.md", "Supervisor operating model"),
    ("MULTI_LLM_CONSENSUS_WORKFLOW.md", "Consensus workflow"),
    ("PHASE1_DISCUSSION_ASSIGNMENTS.md", "Discussion assignments"),
    ("LLM_READOUT_TEMPLATE.md", "Readout template"),
    ("LLM_CROSS_REVIEW_TEMPLATE.md", "Cross-review template"),
    ("PHASE1_CONSENSUS_PACKET_TEMPLATE.md", "Consensus packet template"),
    ("CANONICAL_DOCUMENT_MAP.md", "Canonical map"),
    ("PHASE1_OPEN_QUESTIONS.md", "Open questions"),
)


def default_canonical_document_layers() -> dict[str, list[str]]:
    return {
        "L0 Collaboration": [
            "AI_COLLABORATION_GUIDE.md",
            "ai-status.json",
            "current-work.md",
        ],
        "L1 Product Truth": [
            "phase1_system_analysis_v1.md",
            "phase1_prd_detailed_v1.md",
            "phase1_service_contracts_v1.md",
            "phase1_migration_plan_v1.md",
        ],
        "L2 Execution Rules": [
            "phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/README.md",
            "phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md",
            "phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md",
            "phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md",
            "phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md",
            "phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md",
            "phase1_db_migration_extracted/README.md",
        ],
    }


def flatten_canonical_document_layers(layers: dict[str, list[str]]) -> list[str]:
    flattened: list[str] = []
    for documents in layers.values():
        for document in documents:
            if document not in flattened:
                flattened.append(document)
    return flattened


def sync_canonical_document_metadata(state: dict[str, Any]) -> None:
    layers = state.get("canonical_document_layers")
    if not isinstance(layers, dict) or not layers:
        layers = default_canonical_document_layers()
    else:
        normalized_layers: dict[str, list[str]] = {}
        for key, value in layers.items():
            if isinstance(value, list):
                normalized_layers[str(key)] = [str(item) for item in value]
        if not normalized_layers:
            normalized_layers = default_canonical_document_layers()
        layers = normalized_layers
    state["canonical_document_layers"] = layers
    state["canonical_files"] = flatten_canonical_document_layers(layers)


def canonical_file_set(state: dict[str, Any]) -> set[str]:
    sync_canonical_document_metadata(state)
    return {
        str(item)
        for item in state.get("canonical_files", [])
        if str(item).strip()
    }


def canonical_tier_labels(state: dict[str, Any]) -> list[str]:
    sync_canonical_document_metadata(state)
    layers = state.get("canonical_document_layers", {})
    return [f"`{name}`" for name in layers]


def human_join(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def build_onboarding_prompt(state: dict[str, Any]) -> str:
    canonical_files = canonical_file_set(state)
    prompt_files = [
        item
        for item in FIRST_PROMPT_PRIORITY
        if item in canonical_files or (ROOT / item).exists()
    ]
    if not prompt_files:
        prompt_files = FIRST_PROMPT_PRIORITY[:3]

    parts = [f"Read {human_join(prompt_files)} first."]
    if "ai-activity-log.jsonl" in canonical_files:
        parts.append("Use ai-activity-log.jsonl when you need recent history.")
    parts.append("Treat generated views as derived from machine-readable state.")
    if state.get("execution_mode") == "discussion_planning":
        discussion_artifacts = state.get("discussion_artifacts", {})
        starter_draft = discussion_artifacts.get(
            "starter_draft",
            "docs/02-architecture/consensus/phase1/starter-draft.md",
        )
        parts.append(
            "Before implementation fan-out, submit a structured readout covering non-negotiables, source of truth, "
            "state machine constraints, open questions, and implementation impact."
        )
        parts.append(
            f"Use {starter_draft} as the shared working draft, "
            "LLM_READOUT_TEMPLATE.md for your readout, and LLM_CROSS_REVIEW_TEMPLATE.md for cited review rounds."
        )
        parts.append("Do not create supervisor tasks until the consensus packet is accepted by the human.")
    else:
        parts.append("Follow the canonical lifecycle todo -> in_progress -> review -> review_approved -> done.")
        parts.append("Use scripts/ai-status.sh for every state change.")
    return " ".join(parts)


def task_requires_commit(task: dict[str, Any]) -> bool:
    if task.get("task_class") == "sidecar":
        return False
    if task.get("mutates_canonical") is False:
        return False
    return True


def git_commit_exists(commit_hash: str) -> bool:
    if not commit_hash.strip():
        return False
    result = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", f"{commit_hash.strip()}^{{commit}}"],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


def completion_metadata_from_env(task: dict[str, Any], actor: str) -> dict[str, Any]:
    commit_required = task_requires_commit(task)
    no_commit_required = os.environ.get("NO_COMMIT_REQUIRED", "").strip().lower() in {"1", "true", "yes"}
    commit_hash = os.environ.get("COMMIT_HASH", "").strip()
    commit_subject = os.environ.get("COMMIT_SUBJECT", "").strip()
    commit_agent = os.environ.get("COMMIT_AGENT", "").strip() or actor
    reviewer = canonical_agent_name(task.get("reviewer"))

    if commit_required:
        if no_commit_required:
            raise SystemExit("NO_COMMIT_REQUIRED is only allowed for sidecar or non-canonical tasks")
        if not commit_hash:
            raise SystemExit("done requires COMMIT_HASH for canonical tasks")
        if not git_commit_exists(commit_hash):
            raise SystemExit(f"COMMIT_HASH does not resolve to a local commit: {commit_hash}")
        if not commit_subject:
            raise SystemExit("done requires COMMIT_SUBJECT for canonical tasks")
        return {
            "commit_hash": commit_hash,
            "commit_subject": commit_subject,
            "commit_agent": canonical_agent_name(commit_agent),
            "commit_reviewer": reviewer,
            "commit_recorded_at": iso_now(),
        }

    if no_commit_required:
        return {
            "commit_hash": "-",
            "commit_subject": "no-commit closeout",
            "commit_agent": canonical_agent_name(commit_agent),
            "commit_reviewer": reviewer,
            "commit_recorded_at": iso_now(),
        }
    return {}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_agent_name(name: str | None) -> str:
    if name is None:
        return ""
    trimmed = str(name).strip()
    if not trimmed:
        return ""
    canonical_by_lower = {agent.lower(): agent for agent in KNOWN_AGENTS}
    lowered = trimmed.lower()
    if lowered in canonical_by_lower:
        return canonical_by_lower[lowered]
    alias_target = AGENT_ALIASES.get(lowered)
    if alias_target:
        return alias_target
    return trimmed


def current_actor(default: str = "Codex") -> str:
    return canonical_agent_name(os.environ.get("AI_NAME", default))


def default_state() -> dict[str, Any]:
    timestamp = iso_now()
    canonical_layers = default_canonical_document_layers()
    return {
        "project": "drts-fleet-platform",
        "execution_mode": "discussion_planning",
        "consensus_status": "workflow_ready",
        "sprint": "2026-04-10-phase1-multi-llm-consensus",
        "objective": (
            "Run a two-mode supervisor workflow: first discussion and planning over the DRTS Phase 1 specifications, "
            "then supervisor-managed implementation, with automatic re-entry into discussion when execution finds unresolved design issues."
        ),
        "updated_at": timestamp,
        "canonical_document_layers": canonical_layers,
        "canonical_files": flatten_canonical_document_layers(canonical_layers),
        "seed_design_files": [
            "CANONICAL_DOCUMENT_MAP.md",
            "TARGET_ARCHITECTURE.md",
            "ROADMAP.md",
            "DEVELOPMENT_WORKBREAKDOWN.md",
            "PHASE1_DECISION_LEDGER.md",
            "PHASE1_OPEN_QUESTIONS.md",
            "SUPERVISOR_OPERATING_MODEL.md",
            "MULTI_LLM_CONSENSUS_WORKFLOW.md",
            "PHASE1_DISCUSSION_ASSIGNMENTS.md",
            "LLM_READOUT_TEMPLATE.md",
            "LLM_CROSS_REVIEW_TEMPLATE.md",
            "PHASE1_CONSENSUS_PACKET_TEMPLATE.md",
            "docs/02-architecture/consensus/phase1/README.md",
            "docs/02-architecture/consensus/phase1/consensus-packet.md",
        ],
        "discussion_mode": "supervisor_baton_review_loop",
        "discussion_workspace": "docs/02-architecture/consensus/phase1",
        "supervisor_modes": {
            "discussion_planning": {
                "purpose": "Read canonical specs, debate design, converge on planning, and produce an accepted consensus packet.",
                "entry_gate": "system analysis plus design and execution references are available in the repo",
                "exit_gate": "human accepts the consensus packet",
            },
            "supervisor_managed_execution": {
                "purpose": "Assign implementation work to owners and reviewers through the supervisor task lifecycle.",
                "entry_gate": "accepted consensus packet exists",
                "exit_gate": "execution discovers unresolved semantics, conflicting contracts, or wave changes that require renewed discussion",
            },
        },
        "mode_transition_rules": [
            "Supervisor stays running across both modes; only routing policy changes.",
            "discussion_planning -> supervisor_managed_execution after the consensus packet is accepted by the human.",
            "supervisor_managed_execution -> discussion_planning when implementation hits unresolved product semantics, contract conflicts, or major planning drift.",
            "After discussion resolves the issue, the supervisor may resume implementation mode without restarting the control plane.",
        ],
        "discussion_artifacts": {
            "starter_draft": "docs/02-architecture/consensus/phase1/starter-draft.md",
            "baton_log": "docs/02-architecture/consensus/phase1/baton-log.md",
            "supervisor_queue": "docs/02-architecture/consensus/phase1/supervisor-queue.md",
            "review_round_1": "docs/02-architecture/consensus/phase1/review-round-1.md",
            "review_round_2": "docs/02-architecture/consensus/phase1/review-round-2.md",
            "consensus_packet": "docs/02-architecture/consensus/phase1/consensus-packet.md",
        },
        "discussion_loop": {
            "supervisor": "Claude",
            "starter": "Codex",
            "current_owner": "Codex",
            "review_order": ["Qwen", "Gemini", "Copilot", "Claude"],
            "loop_rule": "Only the current owner edits starter-draft.md. Reviewers write cited feedback. Supervisor advances the baton.",
            "promotion_gate": "human_accepts_consensus_packet",
        },
        "agents": [
            {
                "name": name,
                "capability_lane": meta["capability_lane"],
                "status": "idle",
                "current_task_ids": [],
                "branch": meta["default_branch"],
                "next": f"Produce docs/02-architecture/consensus/phase1/{name.lower()}-readout.md",
                "last_update": None,
            }
            for name, meta in KNOWN_AGENTS.items()
        ],
        "tasks": [],
        "handoffs": [],
        "blockers": [],
        "workload": {name: meta["target_workload"] for name, meta in KNOWN_AGENTS.items()},
    }


def load_state() -> dict[str, Any]:
    if not STATUS_FILE.exists() or STATUS_FILE.read_text(encoding="utf-8").strip() == "":
        return default_state()
    state = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    sync_canonical_document_metadata(state)
    normalize_state_agents(state)
    return state


def load_logs() -> list[dict[str, Any]]:
    if not LOG_FILE.exists():
        return []
    logs: list[dict[str, Any]] = []
    for line_no, line in enumerate(LOG_FILE.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            logs.append(json.loads(line))
        except json.JSONDecodeError as exc:
            print(
                f"Warning: skipping malformed ai-activity-log.jsonl line {line_no}: {exc}",
                file=sys.stderr,
            )
    return logs


def save_state(state: dict[str, Any]) -> None:
    STATUS_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def append_log(entry: dict[str, Any]) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def ensure_agent(name: str) -> dict[str, Any]:
    canonical = canonical_agent_name(name)
    if canonical not in KNOWN_AGENTS:
        raise SystemExit(f"Unknown agent: {name}")
    return KNOWN_AGENTS[canonical]


def get_agent(state: dict[str, Any], name: str) -> dict[str, Any]:
    name = canonical_agent_name(name)
    ensure_agent(name)
    for agent in state["agents"]:
        if agent["name"] == name:
            return agent
    meta = KNOWN_AGENTS[name]
    agent = {
        "name": name,
        "capability_lane": meta["capability_lane"],
        "status": "idle",
        "current_task_ids": [],
        "branch": meta["default_branch"],
        "next": "",
        "last_update": None,
    }
    state["agents"].append(agent)
    return agent


def get_task(state: dict[str, Any], task_id: str) -> dict[str, Any] | None:
    for task in state["tasks"]:
        if task["id"] == task_id:
            return task
    return None


def parse_csv_env(name: str) -> list[str]:
    value = os.environ.get(name, "").strip()
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_delimited_env(name: str, delimiter: str = "||") -> list[str]:
    value = os.environ.get(name, "").strip()
    if not value:
        return []
    return [item.strip() for item in value.split(delimiter) if item.strip()]


def parse_json_env(name: str) -> dict[str, Any]:
    value = os.environ.get(name, "").strip()
    if not value:
        return {}
    payload = json.loads(value)
    if not isinstance(payload, dict):
        raise SystemExit(f"{name} must decode to a JSON object")
    return payload


def parse_bool_env(name: str) -> bool | None:
    value = os.environ.get(name)
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise SystemExit(f"{name} must be a boolean-like string")


def task_metadata_from_env() -> dict[str, Any]:
    metadata = parse_json_env("TASK_METADATA_JSON")
    explicit_fields = {
        "task_class": os.environ.get("TASK_CLASS", "").strip() or None,
        "helper_parent": os.environ.get("TASK_HELPER_PARENT", "").strip() or None,
        "helper_kind": os.environ.get("TASK_HELPER_KIND", "").strip() or None,
        "auto_created_by": os.environ.get("TASK_AUTO_CREATED_BY", "").strip() or None,
    }
    for key, value in explicit_fields.items():
        if value is not None:
            metadata[key] = value

    for env_name, field_name in (
        ("TASK_AUTO_GENERATED", "auto_generated"),
        ("TASK_MUTATES_CANONICAL", "mutates_canonical"),
    ):
        parsed = parse_bool_env(env_name)
        if parsed is not None:
            metadata[field_name] = parsed

    return metadata


def dependency_is_satisfied(task_map: dict[str, dict[str, Any]], dep_id: str) -> bool:
    dependency = task_map.get(dep_id)
    if dependency is None:
        return True
    return dependency.get("status") in DEPENDENCY_DONE_STATUSES


def ensure_review_finalize_handoff(
    state: dict[str, Any],
    task: dict[str, Any],
    *,
    from_agent: str,
    timestamp: str,
    message: str | None = None,
) -> None:
    owner = canonical_agent_name(task.get("owner"))
    if not owner:
        return
    pending_owner_handoff = next(
        (
            handoff
            for handoff in state.get("handoffs", [])
            if handoff.get("task_id") == task.get("id")
            and handoff.get("to") == owner
            and handoff.get("status") != "done"
        ),
        None,
    )
    if pending_owner_handoff:
        if message:
            pending_owner_handoff["message"] = message
        return

    state.setdefault("handoffs", []).append(
        {
            "task_id": task.get("id"),
            "from": canonical_agent_name(from_agent),
            "to": owner,
            "message": message or "Review approved. Owner must finalize this task to move it from review_approved to done.",
            "status": "pending",
            "created_at": timestamp,
        }
    )


def validate_state(state: dict[str, Any]) -> None:
    sync_canonical_document_metadata(state)
    normalize_state_agents(state)
    for task in state["tasks"]:
        ensure_agent(task["owner"])
        ensure_agent(task["reviewer"])
        if task["owner"] == task["reviewer"]:
            raise SystemExit(f"Task {task['id']} has identical owner and reviewer")
        if task["status"] == "blocked" and not task.get("waiting_for"):
            raise SystemExit(f"Blocked task {task['id']} is missing waiting_for")

    for blocker in state.get("blockers", []):
        ensure_agent(blocker["owner"])
        ensure_agent(blocker["waiting_for"])

    for handoff in state.get("handoffs", []):
        ensure_agent(handoff["from"])
        ensure_agent(handoff["to"])


def normalize_state_agents(state: dict[str, Any]) -> None:
    for task in state.get("tasks", []):
        task["owner"] = canonical_agent_name(task.get("owner"))
        task["reviewer"] = canonical_agent_name(task.get("reviewer"))
        if task.get("waiting_for"):
            task["waiting_for"] = canonical_agent_name(task.get("waiting_for"))

    for blocker in state.get("blockers", []):
        blocker["owner"] = canonical_agent_name(blocker.get("owner"))
        blocker["waiting_for"] = canonical_agent_name(blocker.get("waiting_for"))

    for handoff in state.get("handoffs", []):
        handoff["from"] = canonical_agent_name(handoff.get("from"))
        handoff["to"] = canonical_agent_name(handoff.get("to"))

    for agent in state.get("agents", []):
        agent["name"] = canonical_agent_name(agent.get("name"))


def recompute_agents(state: dict[str, Any]) -> None:
    deduped_agents: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    for agent in state.get("agents", []):
        name = agent.get("name")
        if not name or name in seen_names:
            continue
        deduped_agents.append(agent)
        seen_names.add(name)
    state["agents"] = deduped_agents

    by_owner: dict[str, list[dict[str, Any]]] = {name: [] for name in KNOWN_AGENTS}
    task_map = {task["id"]: task for task in state["tasks"]}
    for task in state["tasks"]:
        by_owner.setdefault(task["owner"], []).append(task)

    for name in KNOWN_AGENTS:
        agent = get_agent(state, name)
        owned = by_owner.get(name, [])
        active = [task for task in owned if task["status"] in {"in_progress", "review", "blocked"}]
        approved = [task for task in owned if task["status"] == "review_approved"]
        queued = [task for task in owned if task["status"] == "todo"]
        ready = [
            task
            for task in queued
            if all(dependency_is_satisfied(task_map, dep_id) for dep_id in task.get("depends_on", []))
        ]
        waiting = [task for task in queued if task not in ready]

        if any(task["status"] == "blocked" for task in active):
            agent["status"] = "blocked"
            agent["current_task_ids"] = [task["id"] for task in active]
        elif any(task["status"] == "in_progress" for task in active):
            agent["status"] = "working"
            agent["current_task_ids"] = [task["id"] for task in active]
        elif any(task["status"] == "review" for task in active):
            agent["status"] = "reviewing"
            agent["current_task_ids"] = [task["id"] for task in active]
        elif approved:
            agent["status"] = "finalize"
            agent["current_task_ids"] = [task["id"] for task in approved]
        elif ready:
            agent["status"] = "ready"
            agent["current_task_ids"] = [task["id"] for task in ready]
        elif waiting:
            agent["status"] = "waiting"
            agent["current_task_ids"] = [task["id"] for task in waiting[:3]]
        else:
            agent["status"] = "idle"
            agent["current_task_ids"] = []

        if active:
            latest = sorted(
                active,
                key=lambda task: task.get("last_update") or "",
                reverse=True,
            )[0]
            agent["next"] = latest.get("next", "")
            agent["last_update"] = latest.get("last_update")
        elif approved:
            agent["next"] = approved[0].get("next", "")
            agent["last_update"] = approved[0].get("last_update")
        elif ready:
            agent["next"] = ready[0].get("next", "")
            agent["last_update"] = ready[0].get("last_update")
        elif waiting:
            agent["next"] = waiting[0].get("next", "")
            if not agent.get("last_update"):
                agent["last_update"] = waiting[0].get("last_update")
        elif queued:
            agent["next"] = queued[0].get("next", "")
        else:
            agent["next"] = default_next_for_idle_agent(state, name)
            if not agent.get("last_update"):
                agent["last_update"] = None


def default_next_for_idle_agent(state: dict[str, Any], agent_name: str) -> str:
    execution_mode = str(state.get("execution_mode", "")).strip()
    discussion_loop = state.get("discussion_loop", {}) if isinstance(state.get("discussion_loop"), dict) else {}

    if execution_mode == "discussion_planning":
        return planning_next_for_idle_agent(state, agent_name, discussion_loop)

    if execution_mode == "supervisor_managed_execution":
        execution_defaults = {
            "Claude": "Review incoming implementation slices and route unresolved semantic conflicts back to discussion mode.",
            "Gemini": "Pick the next infra, rollout, or runtime slice that is ready for execution review.",
            "Codex": "Pick the next contracts, schema, or state-system slice that is unblocked and ready to implement.",
            "Qwen": "Pick the next API or integration slice that is unblocked and ready to implement.",
            "Copilot": "Critique active implementation slices for contradictions, testing gaps, and weak assumptions.",
        }
        return execution_defaults.get(agent_name, "Wait for the next execution slice.")

    return ""


def planning_next_for_idle_agent(
    state: dict[str, Any],
    agent_name: str,
    discussion_loop: dict[str, Any],
) -> str:
    starter = canonical_agent_name(str(discussion_loop.get("starter", "")).strip())
    supervisor = canonical_agent_name(str(discussion_loop.get("supervisor", "")).strip())
    current_owner = canonical_agent_name(str(discussion_loop.get("current_owner", "")).strip())
    review_order = [
        canonical_agent_name(str(name).strip())
        for name in discussion_loop.get("review_order", [])
        if str(name).strip()
    ]
    workspace = str(state.get("discussion_workspace", "")).strip()
    workspace_label = Path(workspace).name if workspace else "current planning session"

    review_focus = {
        "Qwen": "implementation-boundary review",
        "Gemini": "rollout, infra, and evidence review",
        "Copilot": "scope-completeness and critique review",
        "Claude": "final synthesis and architecture arbitration",
    }

    if agent_name == current_owner:
        if agent_name == supervisor:
            return (
                f"CURRENT OWNER - synthesize cited reviews for {workspace_label}, "
                "resolve scope disagreements, and advance the consensus packet."
            )
        focus = review_focus.get(agent_name, "cited review")
        return (
            f"CURRENT OWNER - write the active {focus} for {workspace_label} "
            "and update the current review round."
        )

    if agent_name == starter:
        return (
            f"Starter draft already delivered for {workspace_label}; stay available "
            "for rebuttal, source-of-truth corrections, and synthesis support."
        )

    if agent_name == supervisor:
        owner_label = current_owner or "the active reviewer"
        return (
            f"Monitor {owner_label}'s active baton for {workspace_label}, arbitrate cited disagreements, "
            "and prepare the consensus packet once review quorum converges."
        )

    if agent_name in review_order:
        focus = review_focus.get(agent_name, "cited review")
        if current_owner in review_order:
            current_index = review_order.index(current_owner)
            agent_index = review_order.index(agent_name)
            if agent_index > current_index:
                return (
                    f"Stand by for the {focus} in {workspace_label} after {current_owner} "
                    "finishes the current baton pass."
                )
            if agent_index < current_index:
                return (
                    f"Your primary {focus} pass for {workspace_label} is behind the baton; "
                    "stay available for follow-up challenge, clarification, or synthesis."
                )
        return f"Prepare the next {focus} for {workspace_label}."

    return f"Read the canonical specs and contribute to the next discussion round for {workspace_label}."


def recompute_workload(state: dict[str, Any]) -> None:
    summary: dict[str, dict[str, int]] = {}
    for name in KNOWN_AGENTS:
        summary[name] = {
            "total": 0,
            "active": 0,
            "blocked": 0,
            "done": 0,
            "review": 0,
            "review_approved": 0,
            "todo": 0,
        }

    for task in state["tasks"]:
        owner = task["owner"]
        bucket = summary[owner]
        bucket["total"] += 1
        bucket[task["status"] if task["status"] in bucket else "todo"] += 1
        if task["status"] in {"in_progress", "review", "blocked"}:
            bucket["active"] += 1

    state["workload"] = {name: KNOWN_AGENTS[name]["target_workload"] for name in KNOWN_AGENTS}
    state["workload_summary"] = summary


def task_delivery_layer(task: dict[str, Any]) -> str:
    explicit = str(task.get("delivery_layer") or "").strip().lower()
    if explicit in {"primary", "project"}:
        return "primary"
    if explicit in {"external", "upstream"}:
        return "external"
    prefix = task["id"].split("-", 1)[0]
    if prefix in EXTERNAL_TASK_PREFIXES:
        return "external"
    return "primary"


def display_task_title(task: dict[str, Any]) -> str:
    title = str(task.get("title") or "")
    if task.get("task_class") != "sidecar":
        return title

    markers = ["[Sidecar]"]
    if task.get("auto_generated"):
        markers.append("[Auto]")
    if task.get("helper_parent"):
        markers.append(f"[Parent {task['helper_parent']}]")
    marker_text = " ".join(markers)
    if title:
        return f"{marker_text} {title}"
    return marker_text


def write_current_work(state: dict[str, Any], logs: list[dict[str, Any]]) -> None:
    def cell(value: Any) -> str:
        text = "-" if value is None or value == "" else str(value)
        return text.replace("|", "\\|").replace("\n", "<br>")

    def append_layer_table(lines: list[str], tasks: list[dict[str, Any]]) -> None:
        lines.extend(
            [
                "| ID | Phase | Task | Owner | Status | Depends On | 中文說明 |",
                "|---|---|---|---|---|---|---|",
            ]
        )
        if not tasks:
            lines.append("| _(none)_ | - | - | - | - | - | - |")
            return
        for task in tasks:
            depends = ", ".join(f"`{item}`" for item in task.get("depends_on", [])) or "-"
            lines.append(
                "| `{id}` | {phase} | {title} | {owner} | {status} | {depends} | {summary} |".format(
                    id=cell(task["id"]),
                    phase=cell(task["phase"]),
                    title=cell(display_task_title(task)),
                    owner=cell(task["owner"]),
                    status=cell(task["status"]),
                    depends=cell(depends),
                    summary=cell(task.get("summary_zh") or "-"),
                )
            )

    current_logs = logs[-20:]
    canonical_files = canonical_file_set(state)
    tier_labels = canonical_tier_labels(state)
    seed_design_files = [str(item) for item in state.get("seed_design_files", []) if str(item).strip()]
    discussion_mode = str(state.get("discussion_mode", "")).strip()
    discussion_workspace = str(state.get("discussion_workspace", "")).strip()
    execution_mode = str(state.get("execution_mode", "")).strip()
    supervisor_modes = state.get("supervisor_modes", {}) if isinstance(state.get("supervisor_modes"), dict) else {}
    mode_transition_rules = state.get("mode_transition_rules", [])
    discussion_loop = state.get("discussion_loop", {}) if isinstance(state.get("discussion_loop"), dict) else {}
    discussion_artifacts = (
        state.get("discussion_artifacts", {}) if isinstance(state.get("discussion_artifacts"), dict) else {}
    )
    active_tasks = [task for task in state["tasks"] if task.get("status") != "done"]
    primary_tasks = [task for task in active_tasks if task_delivery_layer(task) == "primary"]
    external_tasks = [task for task in active_tasks if task_delivery_layer(task) == "external"]
    current_sprint_lines = [
        f"- Sprint: `{state['sprint']}`",
        "- Canonical files: " + ", ".join(f"`{item}`" for item in state["canonical_files"]),
        "- Canonical tiers: " + (", ".join(tier_labels) if tier_labels else "-"),
    ]
    for path, label in OPTIONAL_CURRENT_WORK_REFERENCES:
        if path in canonical_files or path in seed_design_files:
            current_sprint_lines.append(f"- {label}: `{path}`")
    if seed_design_files:
        current_sprint_lines.append("- Seed design files: " + ", ".join(f"`{item}`" for item in seed_design_files))
    if discussion_mode:
        current_sprint_lines.append(f"- Discussion mode: `{discussion_mode}`")
    if execution_mode:
        current_sprint_lines.append(f"- Active supervisor mode: `{execution_mode}`")
    if supervisor_modes:
        current_sprint_lines.append(
            "- Supported supervisor modes: "
            + ", ".join(f"`{name}`" for name in supervisor_modes)
        )
    if discussion_workspace:
        current_sprint_lines.append(f"- Discussion workspace: `{discussion_workspace}`")
    if discussion_loop.get("supervisor"):
        current_sprint_lines.append(f"- Discussion supervisor: `{discussion_loop['supervisor']}`")
    if discussion_loop.get("starter"):
        current_sprint_lines.append(f"- Discussion starter: `{discussion_loop['starter']}`")
    if discussion_loop.get("current_owner"):
        current_sprint_lines.append(f"- Current baton owner: `{discussion_loop['current_owner']}`")
    review_order = discussion_loop.get("review_order")
    if isinstance(review_order, list) and review_order:
        current_sprint_lines.append("- Review order: " + ", ".join(f"`{item}`" for item in review_order))
    if discussion_artifacts:
        current_sprint_lines.append(
            "- Discussion artifacts: "
            + ", ".join(f"`{path}`" for path in discussion_artifacts.values() if str(path).strip())
        )
    if isinstance(mode_transition_rules, list) and mode_transition_rules:
        current_sprint_lines.append("- Mode transitions: " + " | ".join(str(rule) for rule in mode_transition_rules))
    current_sprint_lines.append("- Dashboard: `docs-site/index.html`")

    lines: list[str] = [
        "# Current Work",
        "",
        "This file is generated from `ai-status.json` and `ai-activity-log.jsonl`.",
        "Do not treat this file as the machine-readable source of truth.",
        "",
        f"Last updated: {state['updated_at']}",
        "",
        "## Objective",
        "",
        state["objective"],
        "",
        "## Current Sprint",
        "",
        *current_sprint_lines,
        "",
        "## Active Slices",
        "",
    ]

    for agent in state["agents"]:
        next_text = agent.get("next") or "No active assignment"
        lines.append(f"- `{agent['name']}`: {', '.join(agent['capability_lane'])}; next: {next_text}")

    lines.extend(
        [
            "",
            "## Delivery Layers",
            "",
            "### Primary Project Work",
            "",
        ]
    )
    append_layer_table(lines, primary_tasks)
    lines.extend(
        [
            "",
            "### External / Upstream Integration Work",
            "",
        ]
    )
    append_layer_table(lines, external_tasks)

    lines.extend(["", "## Task Board", "", "| ID | Phase | Task | 中文說明 | Owner | Reviewer | Status | Depends On | Last Update | Next |", "|---|---|---|---|---|---|---|---|---|---|"])

    for task in state["tasks"]:
        depends = ", ".join(f"`{item}`" for item in task.get("depends_on", [])) or "-"
        lines.append(
            "| `{id}` | {phase} | {title} | {summary} | {owner} | {reviewer} | {status} | {depends} | {last_update} | {next} |".format(
                id=cell(task["id"]),
                phase=cell(task["phase"]),
                title=cell(display_task_title(task)),
                summary=cell(task.get("summary_zh") or "-"),
                owner=cell(task["owner"]),
                reviewer=cell(task["reviewer"]),
                status=cell(task["status"]),
                depends=cell(depends),
                last_update=cell(task.get("last_update") or "-"),
                next=cell(task.get("next") or "-"),
            )
        )

    lines.extend(["", "## Handoff Queue", "", "| Task | From | To | Message | Status | Created At |", "|---|---|---|---|---|---|"])
    pending_handoffs = [handoff for handoff in state.get("handoffs", []) if handoff.get("status") != "done"]
    if pending_handoffs:
        for handoff in pending_handoffs:
            lines.append(
                f"| `{handoff['task_id']}` | {handoff['from']} | {handoff['to']} | {handoff['message']} | {handoff['status']} | {handoff['created_at']} |"
            )
    else:
        lines.append("| _(none)_ | - | - | - | - | - |")

    lines.extend(["", "## Blockers", "", "| Task | Owner | Waiting For | Message | Status |", "|---|---|---|---|---|"])
    open_blockers = [blocker for blocker in state.get("blockers", []) if blocker.get("status") == "open"]
    if open_blockers:
        for blocker in open_blockers:
            lines.append(
                f"| `{blocker['task_id']}` | {blocker['owner']} | {blocker['waiting_for']} | {blocker['message']} | {blocker['status']} |"
            )
    else:
        lines.append("| _(none)_ | - | - | - | - |")

    lines.extend(["", "## Review Notes", "", "| Task | Reviewer | 修正重點 | Review File |", "|---|---|---|---|"])
    review_tasks = [task for task in state["tasks"] if task.get("review_notes_zh")]
    if review_tasks:
        for task in review_tasks:
            note_html = "<br>".join(task.get("review_notes_zh", []))
            lines.append(
                f"| `{task['id']}` | {cell(task['reviewer'])} | {cell(note_html)} | {cell(task.get('review_file') or '-')} |"
            )
    else:
        lines.append("| _(none)_ | - | - | - |")

    lines.extend(["", "## Completion Evidence", "", "| Task | Commit | Subject | LLM Agent | Reviewer | Recorded At |", "|---|---|---|---|---|---|"])
    completion_tasks = [task for task in state["tasks"] if task.get("status") == "done" and task.get("commit_hash")]
    if completion_tasks:
        for task in completion_tasks:
            lines.append(
                "| `{task_id}` | {commit_hash} | {subject} | {agent} | {reviewer} | {recorded_at} |".format(
                    task_id=cell(task["id"]),
                    commit_hash=cell(task.get("commit_hash") or "-"),
                    subject=cell(task.get("commit_subject") or "-"),
                    agent=cell(task.get("commit_agent") or "-"),
                    reviewer=cell(task.get("commit_reviewer") or task.get("reviewer") or "-"),
                    recorded_at=cell(task.get("commit_recorded_at") or "-"),
                )
            )
    else:
        lines.append("| _(none)_ | - | - | - | - | - |")

    lines.extend(["", "## Latest Checkpoints", ""])
    if current_logs:
        for entry in current_logs:
            task_id = f" `{entry['task_id']}`" if entry.get("task_id") else ""
            lines.append(f"- {entry['ts']} {entry['agent']}:{task_id} {entry['message']}")
    else:
        lines.append("- No checkpoints yet.")

    CURRENT_WORK_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def sync_docs_site() -> None:
    DOCS_SITE_DIR.mkdir(parents=True, exist_ok=True)
    mirror_files = [
        STATUS_FILE,
        LOG_FILE,
        CURRENT_WORK_FILE,
        ROOT / ".orchestrator" / "state.json",
        ROOT / ".orchestrator" / "approval-queue.json",
    ]
    rename_map = {
        "state.json": "orchestrator-state.json",
        "approval-queue.json": "approval-queue.json",
    }
    for path in mirror_files:
        if path.exists():
            target_name = rename_map.get(path.name, path.name)
            shutil.copy2(path, DOCS_SITE_DIR / target_name)


def sync_all(state: dict[str, Any]) -> None:
    sync_canonical_document_metadata(state)
    normalize_state_agents(state)
    validate_state(state)
    normalize_handoffs(state)
    recompute_agents(state)
    recompute_workload(state)
    state["updated_at"] = iso_now()
    save_state(state)
    logs = load_logs()
    write_current_work(state, logs)
    sync_docs_site()


def mark_blockers_resolved(state: dict[str, Any], task_id: str) -> None:
    for blocker in state.get("blockers", []):
        if blocker["task_id"] == task_id and blocker["status"] == "open":
            blocker["status"] = "resolved"
            blocker["resolved_at"] = iso_now()


def mark_handoffs_done(state: dict[str, Any], task_id: str) -> None:
    for handoff in state.get("handoffs", []):
        if handoff["task_id"] == task_id and handoff["status"] != "done":
            handoff["status"] = "done"
            handoff["resolved_at"] = iso_now()


def mark_handoffs_done_for_actor(state: dict[str, Any], task_id: str, actor: str) -> None:
    for handoff in state.get("handoffs", []):
        if handoff["task_id"] == task_id and handoff.get("to") == actor and handoff["status"] != "done":
            handoff["status"] = "done"
            handoff["resolved_at"] = iso_now()


def normalize_handoffs(state: dict[str, Any]) -> None:
    task_map = {task["id"]: task for task in state["tasks"]}
    pending_by_task: dict[str, list[dict[str, Any]]] = {}
    for handoff in state.get("handoffs", []):
        if handoff.get("status") == "done":
            continue
        pending_by_task.setdefault(handoff["task_id"], []).append(handoff)

    for task_id, pending in pending_by_task.items():
        task = task_map.get(task_id)
        if task:
            task_status = task.get("status")
            if task_status in {"in_progress", "blocked", "done"}:
                for handoff in pending:
                    handoff["status"] = "done"
                    handoff["resolved_at"] = iso_now()
                continue
            if task_status == "review_approved":
                owner = canonical_agent_name(task.get("owner"))
                owner_handoffs = [handoff for handoff in pending if handoff.get("to") == owner]
                for handoff in pending:
                    if handoff not in owner_handoffs:
                        handoff["status"] = "done"
                        handoff["resolved_at"] = iso_now()
                if not owner_handoffs:
                    ensure_review_finalize_handoff(
                        state,
                        task,
                        from_agent=canonical_agent_name(task.get("reviewer")),
                        timestamp=iso_now(),
                        message=task.get("next"),
                    )
                continue

        for handoff in pending[:-1]:
            handoff["status"] = "done"
            handoff["resolved_at"] = iso_now()

    for task in state.get("tasks", []):
        if task.get("status") != "review_approved":
            continue
        task_id = task.get("id")
        owner = canonical_agent_name(task.get("owner"))
        pending = [
            handoff
            for handoff in state.get("handoffs", [])
            if handoff.get("task_id") == task_id and handoff.get("status") != "done"
        ]
        owner_handoffs = [handoff for handoff in pending if handoff.get("to") == owner]
        for handoff in pending:
            if handoff not in owner_handoffs:
                handoff["status"] = "done"
                handoff["resolved_at"] = iso_now()
        if not owner_handoffs:
            ensure_review_finalize_handoff(
                state,
                task,
                from_agent=canonical_agent_name(task.get("reviewer")),
                timestamp=iso_now(),
                message=task.get("next"),
            )


def command_assign(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 3:
        raise SystemExit("Usage: assign <task-id> <owner> <reviewer> [title]")
    task_id, owner, reviewer = args[0], canonical_agent_name(args[1]), canonical_agent_name(args[2])
    title = args[3] if len(args) > 3 else os.environ.get("TASK_TITLE")
    summary_zh = os.environ.get("TASK_SUMMARY_ZH")
    metadata = task_metadata_from_env()
    ensure_agent(owner)
    ensure_agent(reviewer)
    if owner == reviewer:
        raise SystemExit("Reviewer cannot equal owner")

    task = get_task(state, task_id)
    timestamp = iso_now()
    if task is None:
        task = {
            "id": task_id,
            "title": title,
            "summary_zh": summary_zh,
            "phase": os.environ.get("TASK_PHASE", "Unassigned"),
            "owner": owner,
            "reviewer": reviewer,
            "status": "todo",
            "depends_on": parse_csv_env("TASK_DEPENDS_ON"),
            "artifacts": parse_csv_env("TASK_ARTIFACTS"),
            "acceptance": parse_csv_env("TASK_ACCEPTANCE"),
            "next": "Assignment created",
            "last_update": timestamp,
        }
        task.update(metadata)
        state["tasks"].append(task)
    else:
        task["owner"] = owner
        task["reviewer"] = reviewer
        if title:
            task["title"] = title
        if summary_zh:
            task["summary_zh"] = summary_zh
        if metadata:
            task.update(metadata)
        task["last_update"] = timestamp
        task["next"] = "Ownership updated"

    agent = get_agent(state, owner)
    if os.environ.get("TASK_BRANCH"):
        agent["branch"] = os.environ["TASK_BRANCH"]

    append_log(
        {
            "ts": timestamp,
            "agent": current_actor(),
            "type": "assign",
            "task_id": task_id,
            "message": f"Assigned {task_id} to {owner} with reviewer {reviewer}",
        }
    )


def command_start(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: start <task-id> <message>")
    task_id, message = args[0], args[1]
    actor = current_actor()
    ensure_agent(actor)
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("owner") != actor:
        raise SystemExit(f"Only the owner ({task.get('owner')}) can start {task_id}")
    timestamp = iso_now()
    task["status"] = "in_progress"
    task["last_update"] = timestamp
    task["next"] = message
    mark_handoffs_done_for_actor(state, task_id, actor)
    mark_blockers_resolved(state, task_id)
    append_log({"ts": timestamp, "agent": actor, "type": "start", "task_id": task_id, "message": message})


def command_progress(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: progress <task-id> <message>")
    task_id, message = args[0], args[1]
    actor = current_actor()
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("owner") != actor:
        raise SystemExit(f"Only the owner ({task.get('owner')}) can progress {task_id}")
    timestamp = iso_now()
    if task["status"] in {"todo", "review_approved"}:
        task["status"] = "in_progress"
    task["last_update"] = timestamp
    task["next"] = message
    mark_handoffs_done_for_actor(state, task_id, actor)
    append_log({"ts": timestamp, "agent": actor, "type": "progress", "task_id": task_id, "message": message})


def command_note(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: note <task-id> <message>")
    task_id, message = args[0], args[1]
    actor = current_actor()
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    timestamp = iso_now()
    task["last_update"] = timestamp
    task["next"] = message
    append_log({"ts": timestamp, "agent": actor, "type": "note", "task_id": task_id, "message": message})


def command_reopen(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: reopen <task-id> <message>")
    task_id, message = args[0], args[1]
    actor = current_actor()
    ensure_agent(actor)
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    owner = canonical_agent_name(task.get("owner"))
    reviewer = canonical_agent_name(task.get("reviewer"))
    if actor not in {owner, reviewer}:
        raise SystemExit(f"Only the owner ({owner}) or reviewer ({reviewer}) can reopen {task_id}")
    timestamp = iso_now()
    task["status"] = "in_progress"
    task["last_update"] = timestamp
    task["next"] = message
    task.pop("waiting_for", None)
    mark_blockers_resolved(state, task_id)
    mark_handoffs_done(state, task_id)
    if actor == reviewer and owner and owner != reviewer:
        state.setdefault("handoffs", []).append(
            {
                "task_id": task_id,
                "from": reviewer,
                "to": owner,
                "message": message,
                "status": "pending",
                "created_at": timestamp,
            }
        )
    append_log({"ts": timestamp, "agent": actor, "type": "reopen", "task_id": task_id, "message": message})


def command_handoff(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 3:
        raise SystemExit("Usage: handoff <task-id> <to-agent> <message>")
    task_id, to_agent, message = args[0], canonical_agent_name(args[1]), args[2]
    actor = current_actor()
    ensure_agent(actor)
    ensure_agent(to_agent)
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("owner") != actor:
        raise SystemExit(f"Only the owner ({task.get('owner')}) can hand off {task_id} for review")
    if task.get("reviewer") != to_agent:
        raise SystemExit(
            f"{task_id} handoff target must match the assigned reviewer ({task.get('reviewer')}); reassign reviewer first if needed"
        )
    timestamp = iso_now()
    task["status"] = "review"
    task["last_update"] = timestamp
    task["next"] = message
    mark_handoffs_done_for_actor(state, task_id, actor)
    mark_blockers_resolved(state, task_id)
    state.setdefault("handoffs", []).append(
        {
            "task_id": task_id,
            "from": actor,
            "to": to_agent,
            "message": message,
            "status": "pending",
            "created_at": timestamp,
        }
    )
    append_log({"ts": timestamp, "agent": actor, "type": "handoff", "task_id": task_id, "message": f"Handoff to {to_agent}: {message}"})


def command_blocker(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 3:
        raise SystemExit("Usage: blocker <task-id> <message> <waiting-for>")
    task_id, message, waiting_for = args[0], args[1], canonical_agent_name(args[2])
    actor = current_actor()
    ensure_agent(actor)
    ensure_agent(waiting_for)
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("owner") != actor:
        raise SystemExit(f"Only the owner ({task.get('owner')}) can block {task_id}")
    timestamp = iso_now()
    task["status"] = "blocked"
    task["waiting_for"] = waiting_for
    task["last_update"] = timestamp
    task["next"] = message
    mark_handoffs_done_for_actor(state, task_id, actor)
    state.setdefault("blockers", []).append(
        {
            "task_id": task_id,
            "owner": actor,
            "waiting_for": waiting_for,
            "message": message,
            "status": "open",
            "created_at": timestamp,
        }
    )
    append_log({"ts": timestamp, "agent": actor, "type": "blocker", "task_id": task_id, "message": f"Blocked on {waiting_for}: {message}"})


def command_done(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: done <task-id> <message>")
    task_id, message = args[0], args[1]
    actor = current_actor()
    ensure_agent(actor)
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("owner") != actor:
        raise SystemExit(f"Only the owner ({task.get('owner')}) can finalize {task_id} to done")
    if task.get("status") != "review_approved":
        raise SystemExit(f"{task_id} must be review_approved before it can move to done")
    completion_metadata = completion_metadata_from_env(task, actor)
    timestamp = iso_now()
    task["status"] = "done"
    task["last_update"] = timestamp
    task["next"] = message
    task.update(completion_metadata)
    task.pop("waiting_for", None)
    mark_blockers_resolved(state, task_id)
    mark_handoffs_done(state, task_id)
    append_log({"ts": timestamp, "agent": actor, "type": "done", "task_id": task_id, "message": message})


def command_approve(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: approve <task-id> <message>")
    task_id, message = args[0], args[1]
    actor = current_actor()
    ensure_agent(actor)
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("reviewer") != actor:
        raise SystemExit(f"Only the reviewer ({task.get('reviewer')}) can approve {task_id}")
    if task.get("status") != "review":
        raise SystemExit(f"{task_id} must be in review before it can move to review_approved")

    timestamp = iso_now()
    task["status"] = "review_approved"
    task["last_update"] = timestamp
    task["next"] = message
    task.pop("waiting_for", None)

    review_notes = parse_delimited_env("REVIEW_NOTES_ZH")
    if review_notes:
        task["review_notes_zh"] = review_notes

    review_file = os.environ.get("REVIEW_FILE", "").strip()
    if review_file:
        task["review_file"] = review_file

    mark_blockers_resolved(state, task_id)
    mark_handoffs_done_for_actor(state, task_id, actor)
    ensure_review_finalize_handoff(
        state,
        task,
        from_agent=actor,
        timestamp=timestamp,
        message=message,
    )
    append_log({"ts": timestamp, "agent": actor, "type": "review_approved", "task_id": task_id, "message": message})


def command_mode(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 1:
        raise SystemExit("Usage: mode <discussion_planning|supervisor_managed_execution> [message]")
    mode = args[0].strip()
    message = args[1] if len(args) > 1 else f"Switched supervisor mode to {mode}"
    if mode not in VALID_EXECUTION_MODES:
        raise SystemExit(f"Unsupported execution mode: {mode}")

    timestamp = iso_now()
    state["execution_mode"] = mode
    if mode == "supervisor_managed_execution":
        state["consensus_status"] = "accepted"
    else:
        state["consensus_status"] = "workflow_ready"

    append_log(
        {
            "ts": timestamp,
            "agent": current_actor(),
            "type": "mode",
            "message": message,
        }
    )


def command_sync(state: dict[str, Any], _args: list[str]) -> None:
    return None


def command_prompt(state: dict[str, Any], _args: list[str]) -> None:
    print(build_onboarding_prompt(state))


def main(argv: list[str]) -> int:
    state = load_state()
    command = argv[1] if len(argv) > 1 else "sync"
    args = argv[2:]

    read_only_commands = {
        "prompt": command_prompt,
    }

    commands = {
        "assign": command_assign,
        "start": command_start,
        "progress": command_progress,
        "note": command_note,
        "reopen": command_reopen,
        "handoff": command_handoff,
        "blocker": command_blocker,
        "done": command_done,
        "approve": command_approve,
        "mode": command_mode,
        "sync": command_sync,
    }

    if command in read_only_commands:
        read_only_commands[command](state, args)
        return 0

    if command not in commands:
        raise SystemExit(f"Unknown command: {command}")

    state_before = deepcopy(state)
    commands[command](state, args)
    try:
        sync_all(state)
    except Exception:
        save_state(state_before)
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
