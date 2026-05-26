#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(
    os.environ.get("AI_STATUS_ROOT")
    or os.environ.get("ORCH_STATUS_ROOT")
    or Path(__file__).resolve().parents[1]
).resolve()
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
    "Claude2": {
        "capability_lane": ["integration", "api-implementation", "adapter-execution", "acceptance"],
        "default_branch": "feat/claude2-integration-slices",
        "target_workload": 20,
    },
    "Gemini": {
        "capability_lane": ["runtime-packaging", "ci-cd", "infra", "worker-ops"],
        "default_branch": "feat/gemini-runtime-infra",
        "target_workload": 20,
    },
    "Gemini2": {
        "capability_lane": ["runtime-packaging", "ci-cd", "infra", "worker-ops"],
        "default_branch": "feat/gemini2-runtime-infra",
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
    "Copilot": {
        "capability_lane": ["research-ingest", "external-search", "spec-review", "critique"],
        "default_branch": "feat/copilot-spec-critique",
        "target_workload": 15,
    },
}

RETIRED_AGENTS = {
    "Qwen": {
        "capability_lane": ["integration", "api-implementation", "adapter-execution", "acceptance"],
        "default_branch": "feat/qwen-integration-slices",
        "target_workload": 0,
    },
}

AGENT_ALIASES = {
    "grok": "Copilot",
    "copilot": "Copilot",
    "copilot (legacy alias)": "Copilot",
    "copilot host": "Copilot",
    "copilot_host": "Copilot",
    "claude2": "Claude2",
    "claude 2": "Claude2",
    "gemini2": "Gemini2",
    "gemini 2": "Gemini2",
    "codex2": "Codex2",
    "codex 2": "Codex2",
}

STATUS_LABELS = {
    "backlog": "backlog",
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
    "ai-status.json",
    "current-work.md",
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
NON_CANONICAL_LAYER_FILES = {
    "ai-activity-log.jsonl",
    "current-work.md",
    "docs-site/index.html",
}


def default_canonical_document_layers() -> dict[str, list[str]]:
    return {
        "L0 Collaboration": [
            "AI_COLLABORATION_GUIDE.md",
            "ai-status.json",
        ],
        "L1 Product Truth": [
            "phase1_system_analysis_v1.md",
            "docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md",
            "phase1_prd_detailed_v1.md",
            "phase1_service_contracts_v1.md",
            "phase1_migration_plan_v1.md",
        ],
        "L1.5 Accepted System Design Decisions": [
            "docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md",
            "docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md",
            "docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md",
            "docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md",
            "docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md",
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


def short_summary(text: Any, max_length: int = 280) -> str:
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(raw) <= max_length:
        return raw
    clipped = raw[: max_length - 1].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped + "…"


def sync_canonical_document_metadata(state: dict[str, Any]) -> None:
    default_layers = default_canonical_document_layers()
    layers = state.get("canonical_document_layers")
    if not isinstance(layers, dict) or not layers:
        layers = default_layers
    else:
        normalized_layers: dict[str, list[str]] = {}
        for key, value in layers.items():
            if isinstance(value, list):
                normalized_layers[str(key)] = [
                    str(item)
                    for item in value
                    if str(item).strip() and str(item) not in NON_CANONICAL_LAYER_FILES
                ]
        if not normalized_layers:
            normalized_layers = default_layers
        merged_layers: dict[str, list[str]] = {}
        for key, documents in default_layers.items():
            merged_layers[key] = list(documents)
            for document in normalized_layers.get(key, []):
                if document not in merged_layers[key]:
                    merged_layers[key].append(document)
        for key, documents in normalized_layers.items():
            if key not in merged_layers:
                merged_layers[key] = list(documents)
        layers = merged_layers
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
    parts.append("Use current-work.md only as a human summary view.")
    parts.append("Use ai-activity-log.jsonl only when you need recent history.")
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
        parts.append("Follow the canonical lifecycle backlog/todo -> in_progress -> review -> review_approved -> done.")
        parts.append("Use scripts/ai-status.sh for every state change.")
    return " ".join(parts)


def read_repo_text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def has_required_snippets(path: str, snippets: list[str]) -> tuple[bool, list[str]]:
    full_text = read_repo_text(path)
    missing = [snippet for snippet in snippets if snippet not in full_text]
    return not missing, missing


def build_doc_sync_audit_report(state: dict[str, Any]) -> tuple[bool, list[str]]:
    checks = [
        (
            "Operational execution packet cites both accepted operational supplements",
            "docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md",
            [
                "docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md",
                "docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md",
            ],
        ),
        (
            "Execution task board records the operational packet -> ai-status materialization path",
            "docs/03-runbooks/execution-next-wave-task-board.md",
            [
                "docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md",
                "materialized into `ai-status.json`",
                "`OPX-ID-*`",
                "`OPX-MD-*`",
                "`OPX-IN-*`",
                "`OPX-DP-*`",
                "`OPX-CM-*`",
                "`OPX-GV-*`",
            ],
        ),
        (
            "Canonical map links the controlled sync path from supplements to packet, task board, and code-backed audit",
            "CANONICAL_DOCUMENT_MAP.md",
            [
                "docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md",
                "## 6. Controlled Sync Path",
                "docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md",
                "docs/03-runbooks/execution-next-wave-task-board.md",
                "docs/00-context/current-system-blueprint-alignment-audit-20260421.md",
            ],
        ),
        (
            "Docs index exposes one entry point for truth docs, packets, and audits",
            "docs/README.md",
            [
                "docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md",
                "## Decision-To-Backlog Sync Path",
                "CANONICAL_DOCUMENT_MAP.md",
                "docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md",
                "docs/00-context/current-system-blueprint-alignment-audit-20260421.md",
            ],
        ),
    ]

    lines = ["Decision-to-backlog/code-to-doc sync audit"]
    success = True
    for label, path, snippets in checks:
        ok, missing = has_required_snippets(path, snippets)
        if ok:
            lines.append(f"OK   {label} [{path}]")
            continue
        success = False
        lines.append(f"FAIL {label} [{path}]")
        for snippet in missing:
            lines.append(f"  missing: {snippet}")

    sync_canonical_document_metadata(state)
    expected_canonical = {
        "docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md",
        "docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md",
        "docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md",
    }
    canonical_files = canonical_file_set(state)
    missing_canonical = sorted(expected_canonical - canonical_files)
    if missing_canonical:
        success = False
        lines.append("FAIL Canonical document layers are missing operational supplements/decisions in ai-status metadata")
        for path in missing_canonical:
            lines.append(f"  missing: {path}")
    else:
        lines.append("OK   Canonical document layers include the operational supplements and accepted decision layer [ai-status.json]")

    return success, lines


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
    push_remote = os.environ.get("PUSH_REMOTE", "").strip()
    push_branch = os.environ.get("PUSH_BRANCH", "").strip()
    push_ref = os.environ.get("PUSH_REF", "").strip()
    push_commit = os.environ.get("PUSH_COMMIT", "").strip() or commit_hash
    reviewer = canonical_agent_name(task.get("reviewer"))
    timestamp = iso_now()

    if commit_required:
        if no_commit_required:
            raise SystemExit("NO_COMMIT_REQUIRED is only allowed for sidecar or non-canonical tasks")
        if not commit_hash:
            raise SystemExit("done requires COMMIT_HASH for canonical tasks")
        if not git_commit_exists(commit_hash):
            raise SystemExit(f"COMMIT_HASH does not resolve to a local commit: {commit_hash}")
        if not commit_subject:
            raise SystemExit("done requires COMMIT_SUBJECT for canonical tasks")
        if not push_remote or not push_branch:
            raise SystemExit("done requires PUSH_REMOTE and PUSH_BRANCH for canonical tasks after a normal non-force push")
        if any(ch.isspace() for ch in push_remote) or any(ch.isspace() for ch in push_branch):
            raise SystemExit("PUSH_REMOTE and PUSH_BRANCH must not contain whitespace")
        if push_commit != commit_hash:
            raise SystemExit("PUSH_COMMIT must match COMMIT_HASH for canonical tasks")
        return {
            "commit_hash": commit_hash,
            "commit_subject": commit_subject,
            "commit_agent": canonical_agent_name(commit_agent),
            "commit_reviewer": reviewer,
            "commit_recorded_at": timestamp,
            "push_remote": push_remote,
            "push_branch": push_branch,
            "push_ref": push_ref or f"{push_remote}/{push_branch}",
            "push_commit": push_commit,
            "push_recorded_at": timestamp,
        }

    if no_commit_required:
        return {
            "commit_hash": "-",
            "commit_subject": "no-commit closeout",
            "commit_agent": canonical_agent_name(commit_agent),
            "commit_reviewer": reviewer,
            "commit_recorded_at": timestamp,
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
    legacy_alias_match = re.fullmatch(r"(.+?)\s+\(legacy alias\)", trimmed, re.IGNORECASE)
    if legacy_alias_match:
        trimmed = legacy_alias_match.group(1).strip()
    canonical_by_lower = {agent.lower(): agent for agent in {**KNOWN_AGENTS, **RETIRED_AGENTS}}
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
            "review_order": ["Claude2", "Gemini", "Gemini2", "Copilot", "Claude"],
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
            entry = json.loads(line)
            if isinstance(entry, dict):
                # Tolerate legacy or external review log schemas so summary generation
                # does not fail when adjacent tooling writes timestamp/summary fields.
                if "ts" not in entry and entry.get("timestamp"):
                    entry["ts"] = entry["timestamp"]
                if "message" not in entry and entry.get("summary"):
                    entry["message"] = entry["summary"]
                if "type" not in entry and entry.get("action"):
                    entry["type"] = entry["action"]
            logs.append(entry)
        except json.JSONDecodeError as exc:
            print(
                f"Warning: skipping malformed ai-activity-log.jsonl line {line_no}: {exc}",
                file=sys.stderr,
            )
    return logs


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


def save_state(state: dict[str, Any]) -> None:
    atomic_write_text(STATUS_FILE, json.dumps(state, indent=2, ensure_ascii=False) + "\n")


def append_log(entry: dict[str, Any]) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def ensure_agent(name: str, *, allow_retired: bool = False) -> dict[str, Any]:
    canonical = canonical_agent_name(name)
    if canonical not in KNOWN_AGENTS:
        if allow_retired and canonical in RETIRED_AGENTS:
            return RETIRED_AGENTS[canonical]
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
    from_name = canonical_agent_name(from_agent)
    if from_name == owner:
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


def ensure_owner_resume_handoff(
    state: dict[str, Any],
    task: dict[str, Any],
    *,
    from_agent: str,
    timestamp: str,
    message: str,
) -> None:
    owner = canonical_agent_name(task.get("owner"))
    if not owner:
        return
    from_name = canonical_agent_name(from_agent)
    if from_name == owner:
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
        pending_owner_handoff["message"] = message
        return

    state.setdefault("handoffs", []).append(
        {
            "task_id": task.get("id"),
            "from": from_name,
            "to": owner,
            "message": message,
            "status": "pending",
            "created_at": timestamp,
        }
    )


def apply_unblock_parent_resolution(
    state: dict[str, Any],
    task: dict[str, Any],
    *,
    actor: str,
    timestamp: str,
    message: str,
) -> None:
    if str(task.get("task_class") or "").lower() != "unblock":
        return
    parent_id = str(task.get("helper_parent") or "").strip()
    if not parent_id:
        return
    parent = get_task(state, parent_id)
    if parent is None:
        return

    resume_status = os.environ.get("PARENT_STATUS", "").strip().lower() or "todo"
    if resume_status not in {"backlog", "todo", "in_progress", "blocked"}:
        raise SystemExit("PARENT_STATUS must be backlog, todo, in_progress, or blocked")
    parent_message = (
        os.environ.get("PARENT_NEXT", "").strip()
        or f"Unblock resolution complete via {task.get('id')}: {message}"
    )
    parent_waiting_for_raw = os.environ.get("PARENT_WAITING_FOR", "").strip()
    parent_waiting_for = canonical_agent_name(parent_waiting_for_raw) if parent_waiting_for_raw else ""
    if parent_waiting_for:
        ensure_agent(parent_waiting_for)
    elif resume_status == "blocked":
        parent_waiting_for = canonical_agent_name(parent.get("waiting_for")) or canonical_agent_name(parent.get("owner"))

    task["resolved_parent_status"] = resume_status
    task["resolved_parent_next"] = parent_message
    if parent_waiting_for:
        task["resolved_parent_waiting_for"] = parent_waiting_for
    else:
        task.pop("resolved_parent_waiting_for", None)

    parent["status"] = resume_status
    parent["last_update"] = timestamp
    parent["next"] = parent_message
    if parent_waiting_for and resume_status == "blocked":
        parent["waiting_for"] = parent_waiting_for
    else:
        parent.pop("waiting_for", None)

    if resume_status == "blocked":
        state.setdefault("blockers", []).append(
            {
                "task_id": parent_id,
                "owner": canonical_agent_name(parent.get("owner")),
                "waiting_for": parent_waiting_for,
                "message": parent_message,
                "status": "open",
                "created_at": timestamp,
            }
        )
        mark_handoffs_done(state, parent_id)
    else:
        mark_blockers_resolved(state, parent_id)
        mark_handoffs_done(state, parent_id)
        ensure_owner_resume_handoff(
            state,
            parent,
            from_agent=actor,
            timestamp=timestamp,
            message=parent_message,
        )
    append_log(
        {
            "ts": timestamp,
            "agent": actor,
            "type": "parent_resume",
            "task_id": parent_id,
            "message": parent_message,
        }
    )


# Closeout commit subject pattern: `<TASK-ID>: <summary>`. Deliberately
# excludes `wip(<TASK-ID>):` anchor commits — they carry the trailer but are
# not closeouts. Mirrors scripts/git/check_commit_trailers.py SUBJECT_RE,
# minus the optional `wip(...)` prefix.
CLOSEOUT_SUBJECT_RE = re.compile(r"^([A-Z][A-Z0-9-]*[A-Z0-9]):\s+\S")
GIT_LOG_RECORD_SEP = "\x1e"
GIT_LOG_FIELD_SEP = "\x1f"


def _git_log_closeouts(ref: str) -> dict[str, dict[str, str]]:
    """Return {task_id: {sha, subject, body, commit_date}} for the most recent
    closeout commit reachable from `ref` for each task ID. A commit is a
    closeout if its subject matches CLOSEOUT_SUBJECT_RE and the captured
    task_id is also present as a `Task-ID:` trailer.
    """
    fmt = GIT_LOG_FIELD_SEP.join(
        ["%H", "%cI", "%s", "%(trailers:key=Task-ID,valueonly,separator=%x1d)"]
    ) + GIT_LOG_RECORD_SEP
    try:
        result = subprocess.run(
            ["git", "log", ref, f"--format={fmt}"],
            cwd=str(ROOT),
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return {}
    if result.returncode != 0:
        return {}
    closeouts: dict[str, dict[str, str]] = {}
    for record in result.stdout.split(GIT_LOG_RECORD_SEP):
        record = record.strip("\n")
        if not record:
            continue
        parts = record.split(GIT_LOG_FIELD_SEP)
        if len(parts) < 4:
            continue
        sha, commit_date, subject, trailers_raw = parts[0], parts[1], parts[2], parts[3]
        match = CLOSEOUT_SUBJECT_RE.match(subject)
        if not match:
            continue
        subject_task_id = match.group(1)
        # Strip the trailing `(#NNN)` PR suffix GitHub adds on squash merges
        # before checking trailer consistency.
        trailer_task_ids = {
            value.strip() for value in trailers_raw.split("\x1d") if value.strip()
        }
        if trailer_task_ids and subject_task_id not in trailer_task_ids:
            continue
        existing = closeouts.get(subject_task_id)
        if existing is None or commit_date > existing.get("commit_date", ""):
            closeouts[subject_task_id] = {
                "sha": sha,
                "subject": subject,
                "commit_date": commit_date,
            }
    return closeouts


def _git_remote_branch_for_ref(ref: str) -> tuple[str, str]:
    """Split `origin/dev` → (`origin`, `dev`). Falls back to (`origin`, ref)."""
    if "/" in ref:
        remote, _, branch = ref.partition("/")
        return remote, branch
    return "origin", ref


def apply_git_merge_reconciliation(
    state: dict[str, Any], *, ref: str | None = None
) -> list[dict[str, str]]:
    """Bridge artifact-merged → state-machine-done drift.

    Workers that ship via PR + merge but skip `ai-status.sh done` leave the
    state machine stuck in `in_progress`/`review`/`backlog` even though the
    closeout commit is on the integration trunk. This walks `ref` (default
    origin/dev), finds closeout commits keyed by Task-ID, and finalizes any
    task whose closeout has merged but whose state machine never advanced.

    Returns a list of `{task_id, sha, prior_status}` dicts for everything it
    moved.
    """
    target_ref = (ref or os.environ.get("RECONCILE_REF") or "origin/dev").strip() or "origin/dev"
    closeouts = _git_log_closeouts(target_ref)
    if not closeouts:
        return []
    remote, branch = _git_remote_branch_for_ref(target_ref)
    timestamp = iso_now()
    reconciled: list[dict[str, str]] = []
    for task in state.get("tasks", []):
        if task.get("status") == "done":
            continue
        task_id = str(task.get("id") or "")
        closeout = closeouts.get(task_id)
        if not closeout:
            continue
        prior_status = str(task.get("status") or "")
        actor = canonical_agent_name(task.get("owner")) or current_actor()
        task["status"] = "done"
        task["last_update"] = timestamp
        task["next"] = f"reconciled from {remote}/{branch}@{closeout['sha'][:12]}"
        task["commit_hash"] = closeout["sha"]
        task["commit_subject"] = closeout["subject"]
        task["commit_agent"] = actor
        task["commit_reviewer"] = canonical_agent_name(task.get("reviewer"))
        task["commit_recorded_at"] = timestamp
        task["push_remote"] = remote
        task["push_branch"] = branch
        task["push_ref"] = target_ref
        task["push_commit"] = closeout["sha"]
        task["push_recorded_at"] = timestamp
        task["reconciled_from_git_at"] = timestamp
        task["reconciled_from_git_ref"] = target_ref
        task["reconciled_from_git_prior_status"] = prior_status
        task.pop("waiting_for", None)
        mark_blockers_resolved(state, task_id)
        mark_handoffs_done(state, task_id)
        # Unblock parents are not auto-resumed here: parent resume needs
        # PARENT_STATUS/PARENT_NEXT input that the human flow supplies. We
        # only resolve their open blocker/handoff via the calls above.
        append_log(
            {
                "ts": timestamp,
                "agent": actor,
                "type": "reconciled_from_git",
                "task_id": task_id,
                "message": task["next"],
                "commit_hash": closeout["sha"],
                "prior_status": prior_status,
                "ref": target_ref,
            }
        )
        reconciled.append(
            {
                "task_id": task_id,
                "sha": closeout["sha"],
                "prior_status": prior_status,
            }
        )
    return reconciled


def validate_state(state: dict[str, Any]) -> None:
    sync_canonical_document_metadata(state)
    normalize_state_agents(state)
    for task in state["tasks"]:
        task_done = task.get("status") == "done"
        ensure_agent(task["owner"], allow_retired=task_done)
        reviewer = canonical_agent_name(task.get("reviewer"))
        if reviewer:
            ensure_agent(reviewer, allow_retired=task_done)
        if reviewer and task["owner"] == reviewer:
            raise SystemExit(f"Task {task['id']} has identical owner and reviewer")
        waiting_for = canonical_agent_name(task.get("waiting_for"))
        if waiting_for:
            ensure_agent(waiting_for, allow_retired=task_done)

    for blocker in state.get("blockers", []):
        ensure_agent(blocker["owner"])
        ensure_agent(blocker["waiting_for"])

    for handoff in state.get("handoffs", []):
        handoff_done = handoff.get("status") == "done"
        ensure_agent(handoff["from"], allow_retired=handoff_done)
        ensure_agent(handoff["to"], allow_retired=handoff_done)


def normalize_state_agents(state: dict[str, Any]) -> None:
    for task in state.get("tasks", []):
        task["owner"] = canonical_agent_name(task.get("owner"))
        task["reviewer"] = canonical_agent_name(task.get("reviewer"))
        if task.get("waiting_for"):
            task["waiting_for"] = canonical_agent_name(task.get("waiting_for"))

    for blocker in state.get("blockers", []):
        blocker["owner"] = canonical_agent_name(blocker.get("owner"))
        blocker["waiting_for"] = canonical_agent_name(blocker.get("waiting_for"))
        if not blocker.get("message") and blocker.get("reason"):
            blocker["message"] = blocker["reason"]

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
        if not name or name not in KNOWN_AGENTS or name in seen_names:
            continue
        deduped_agents.append(agent)
        seen_names.add(name)
    state["agents"] = deduped_agents

    by_owner: dict[str, list[dict[str, Any]]] = {name: [] for name in KNOWN_AGENTS}
    task_map = {task["id"]: task for task in state["tasks"]}
    for task in state["tasks"]:
        if task["owner"] in by_owner:
            by_owner[task["owner"]].append(task)

    for name in KNOWN_AGENTS:
        agent = get_agent(state, name)
        owned = by_owner.get(name, [])
        active = [task for task in owned if task["status"] in {"in_progress", "review", "blocked"}]
        approved = [task for task in owned if task["status"] == "review_approved"]
        queued = [task for task in owned if task["status"] in {"todo", "backlog"}]
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

        current_task_ids = agent.get("current_task_ids", [])
        agent["current_task"] = current_task_ids[0] if current_task_ids else None

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
            "Claude2": "Pick the next API or integration slice that is unblocked and ready to implement.",
            "Gemini": "Pick the next infra, rollout, or runtime slice that is ready for execution review.",
            "Gemini2": "Pick the next infra, rollout, or runtime slice that is ready for execution review.",
            "Codex": "Pick the next contracts, schema, or state-system slice that is unblocked and ready to implement.",
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
        "Claude2": "implementation-boundary review",
        "Gemini": "rollout, infra, and evidence review",
        "Gemini2": "rollout, infra, and evidence review",
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
            "backlog": 0,
            "review": 0,
            "review_approved": 0,
            "todo": 0,
        }

    for task in state["tasks"]:
        owner = task["owner"]
        if owner not in summary:
            continue
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
        next_text = (agent.get("next") or "No active assignment")[:200]
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

    lines.extend(["", "## Task Board (active only)", "", "| ID | Phase | Task | Owner | Status | Depends On |", "|---|---|---|---|---|---|"])

    active_board_tasks = [t for t in state["tasks"] if t.get("status") != "done"]
    for task in active_board_tasks:
        depends = ", ".join(f"`{item}`" for item in task.get("depends_on", [])) or "-"
        lines.append(
            "| `{id}` | {phase} | {title} | {owner} | {status} | {depends} |".format(
                id=cell(task["id"]),
                phase=cell(task["phase"]),
                title=cell(display_task_title(task)),
                owner=cell(task["owner"]),
                status=cell(task["status"]),
                depends=cell(depends),
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
            blocker_message = blocker.get("message") or blocker.get("reason") or "-"
            lines.append(
                f"| `{blocker['task_id']}` | {blocker['owner']} | {blocker['waiting_for']} | {blocker_message} | {blocker['status']} |"
            )
    else:
        lines.append("| _(none)_ | - | - | - | - |")

    lines.extend(["", "## Review Notes (active tasks)", "", "| Task | Reviewer | 修正重點 | Review File |", "|---|---|---|---|"])
    review_tasks = [task for task in state["tasks"] if task.get("review_notes_zh") and task.get("status") != "done"]
    if review_tasks:
        for task in review_tasks:
            note_html = "<br>".join(task.get("review_notes_zh", []))
            lines.append(
                f"| `{task['id']}` | {cell(task['reviewer'])} | {cell(note_html)} | {cell(task.get('review_file') or '-')} |"
            )
    else:
        lines.append("| _(none)_ | - | - | - |")

    lines.extend(["", "## Completion Evidence (last 10)", "", "| Task | Commit | Subject | LLM Agent | Reviewer | Recorded At |", "|---|---|---|---|---|---|"])
    completion_tasks = [task for task in state["tasks"] if task.get("status") == "done" and task.get("commit_hash")]
    if completion_tasks:
        for task in completion_tasks[-10:]:
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

    atomic_write_text(CURRENT_WORK_FILE, "\n".join(lines) + "\n")


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
            "status": "backlog",
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
    if task["status"] in {"backlog", "todo", "review_approved"}:
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
    apply_unblock_parent_resolution(
        state,
        task,
        actor=actor,
        timestamp=timestamp,
        message=message,
    )
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
    # Bridge git-merged closeouts → state-machine `done` for tasks whose
    # workers shipped via PR + merge but skipped `ai-status.sh done`. The
    # supervisor calls `ai-status.sh sync` on every reassignment cycle, so
    # this catches drift soon after a merge lands on origin/dev.
    apply_git_merge_reconciliation(state)
    return None


def command_reconcile_from_git(state: dict[str, Any], args: list[str]) -> None:
    ref = args[0].strip() if args else os.environ.get("RECONCILE_REF", "").strip() or "origin/dev"
    reconciled = apply_git_merge_reconciliation(state, ref=ref)
    if not reconciled:
        print(f"reconcile-from-git: no drift found against {ref}")
        return
    print(f"reconcile-from-git: finalized {len(reconciled)} task(s) against {ref}")
    for entry in reconciled:
        print(
            f"  {entry['task_id']}: {entry['prior_status']} -> done "
            f"(commit {entry['sha'][:12]})"
        )


def command_prompt(state: dict[str, Any], _args: list[str]) -> None:
    print(build_onboarding_prompt(state))


def command_audit(state: dict[str, Any], args: list[str]) -> None:
    audit_name = args[0].strip().lower() if args else "doc-sync"
    if audit_name != "doc-sync":
        raise SystemExit("Usage: audit [doc-sync]")
    success, lines = build_doc_sync_audit_report(state)
    print("\n".join(lines))
    if not success:
        raise SystemExit(1)


def main(argv: list[str]) -> int:
    state = load_state()
    command = argv[1] if len(argv) > 1 else "sync"
    args = argv[2:]

    read_only_commands = {
        "audit": command_audit,
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
        "reconcile-from-git": command_reconcile_from_git,
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
