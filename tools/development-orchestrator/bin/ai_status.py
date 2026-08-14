#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

STATUS_AUTHORITY_VERSION = "2026-08-02.v1"
STATUS_AUTHORITY_HANDSHAKE = "ORCH-STATUS-AUTHORITY-003"

ROOT = Path(
    os.environ.get("AI_STATUS_ROOT")
    or os.environ.get("ORCH_STATUS_ROOT")
    or Path(__file__).resolve().parents[3]
).resolve()

_SCRIPT_DIR = Path(__file__).resolve().parent
_TOOL_ROOT = _SCRIPT_DIR.parent
_LOCAL_ROOT = _SCRIPT_DIR.parents[2].resolve()
if str(_TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(_TOOL_ROOT))

from control_plane.usecases.task_board_commands import (  # noqa: E402
    TaskBoardCommandExecutor,
    TaskBoardCommandRuntime,
)


def ensure_canonical_delegation(argv: list[str] | None = None) -> None:
    if ROOT != _LOCAL_ROOT and not os.environ.get("_AI_STATUS_DELEGATED"):
        canonical_script = (
            ROOT / "tools" / "development-orchestrator" / "bin" / "ai_status.py"
        ).resolve()
        if canonical_script.exists() and canonical_script != Path(__file__).resolve():
            os.environ["_AI_STATUS_DELEGATED"] = "1"
            os.environ["AI_STATUS_ROOT"] = str(ROOT)
            os.environ["ORCH_STATUS_ROOT"] = str(ROOT)
            cmd_args = (argv if argv is not None else sys.argv)[1:]
            os.execv(sys.executable, [sys.executable, str(canonical_script)] + cmd_args)


STATUS_FILE = ROOT / "ai-status.json"
LOG_FILE = ROOT / "ai-activity-log.jsonl"
TASK_ARCHIVE_FILE = ROOT / "ai-task-archive.jsonl"
CURRENT_WORK_FILE = ROOT / "current-work.md"
DASHBOARD_DIR = _TOOL_ROOT / "dashboard"

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

AGENT_ALIASES = {
    "copilot": "Copilot",
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
    "integrating": "integrating",
    "acceptance": "acceptance",
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
    "tools/development-orchestrator/dashboard/index.html",
}
LOG_ENTRY_START_RE = re.compile(r'(?=\{"(?:ts|timestamp)"\s*:)')


def _jsonl_lock_path(path: Path) -> Path:
    return path.with_name(f".{path.name}.lock")


@contextmanager
def _hold_jsonl_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = _jsonl_lock_path(path).open("a+", encoding="utf-8")
    try:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def _append_jsonl_line(path: Path, line: str) -> None:
    payload = (line + "\n").encode("utf-8")
    with _hold_jsonl_lock(path):
        fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o644)
        try:
            written = 0
            while written < len(payload):
                chunk = os.write(fd, payload[written:])
                if chunk == 0:
                    raise OSError(f"short write while appending {path}")
                written += chunk
        finally:
            os.close(fd)


def _normalize_log_entry(entry: dict[str, Any]) -> dict[str, Any]:
    if "ts" not in entry and entry.get("timestamp"):
        entry["ts"] = entry["timestamp"]
    if "message" not in entry and entry.get("summary"):
        entry["message"] = entry["summary"]
    if "type" not in entry and entry.get("action"):
        entry["type"] = entry["action"]
    return entry


def _decode_log_line(line: str) -> list[dict[str, Any]]:
    cleaned = line.replace("\x00", "").strip()
    if not cleaned:
        return []
    try:
        entry = json.loads(cleaned)
        return [_normalize_log_entry(entry)] if isinstance(entry, dict) else []
    except json.JSONDecodeError:
        starts = [match.start() for match in LOG_ENTRY_START_RE.finditer(cleaned)]
        if not starts:
            return []
        starts.append(len(cleaned))
        entries: list[dict[str, Any]] = []
        for index, start in enumerate(starts[:-1]):
            fragment = cleaned[start:starts[index + 1]].strip()
            try:
                entry = json.loads(fragment)
            except json.JSONDecodeError:
                continue
            if isinstance(entry, dict):
                entries.append(_normalize_log_entry(entry))
        return entries


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
        parts.append("Follow the canonical lifecycle backlog/todo -> in_progress -> review -> integrating -> acceptance -> done.")
        parts.append("Use tools/development-orchestrator/bin/ai-status.sh for every state change.")
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


CANDIDATE_CI_STATUSES = {"queued", "running", "success", "failure", "merge_conflict", "closed"}
LEGACY_INTEGRATION_FIELDS = {
    "integration_status",
    "integration_recorded_at",
    "required_integration_status",
    "required_evidence_fields",
    "merged_ref",
    "commit_hash",
    "commit_subject",
    "commit_agent",
    "commit_reviewer",
    "commit_recorded_at",
    "push_remote",
    "push_branch",
    "push_ref",
    "push_commit",
    "push_recorded_at",
    "dev_deploy_run_url",
    "dev_deploy_sha",
    "dev_deploy_source_ref",
}


def candidate_required(task: dict[str, Any]) -> bool:
    return task.get("mutates_canonical") is not False


def required_acceptance(task: dict[str, Any]) -> list[str]:
    values = task.get("required_acceptance") or []
    if not isinstance(values, list):
        return []
    return [str(value).strip() for value in values if str(value).strip()]


def acceptance_complete(task: dict[str, Any]) -> bool:
    evidence = task.get("acceptance_evidence") or {}
    if not isinstance(evidence, dict):
        return False
    return all(str(evidence.get(name) or "").strip() for name in required_acceptance(task))


def candidate_is_locked(task: dict[str, Any]) -> bool:
    candidate_sha = str(task.get("candidate_sha") or "").strip()
    return bool(candidate_sha and (candidate_sha == "not_applicable" or git_commit_exists(candidate_sha)))


def clear_candidate_evidence(task: dict[str, Any], *, preserve_failed_sha: bool = False) -> None:
    candidate_sha = task.get("candidate_sha") if preserve_failed_sha else None
    for key in ("candidate_sha", "candidate_branch", "reviewed_sha", "ci_sha", "ci_status", "ci_run_url", "pr_url", "merge_sha"):
        task.pop(key, None)
    if candidate_sha:
        task["candidate_sha"] = candidate_sha


def transition_after_merge(state: dict[str, Any], task: dict[str, Any], *, message: str, timestamp: str) -> None:
    task["last_update"] = timestamp
    task["next"] = message
    task.pop("waiting_for", None)
    mark_blockers_resolved(state, str(task.get("id") or ""))
    mark_handoffs_done(state, str(task.get("id") or ""))
    if required_acceptance(task) and not acceptance_complete(task):
        task["status"] = "acceptance"
        return
    task["status"] = "done"
    apply_unblock_parent_resolution(
        state,
        task,
        actor=current_actor("Supervisor"),
        timestamp=timestamp,
        message=message,
    )


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
        "status_authority_version": STATUS_AUTHORITY_VERSION,
        "status_authority_handshake": STATUS_AUTHORITY_HANDSHAKE,
    }


def load_state() -> dict[str, Any]:
    if not STATUS_FILE.exists() or STATUS_FILE.read_text(encoding="utf-8").strip() == "":
        state = default_state()
    else:
        state = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    state["status_authority_version"] = STATUS_AUTHORITY_VERSION
    state["status_authority_handshake"] = STATUS_AUTHORITY_HANDSHAKE
    sync_canonical_document_metadata(state)
    normalize_state_agents(state)
    return state


def load_logs() -> list[dict[str, Any]]:
    if not LOG_FILE.exists():
        return []
    logs: list[dict[str, Any]] = []
    for line_no, line in enumerate(LOG_FILE.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        entries = _decode_log_line(line)
        if entries:
            logs.extend(entries)
            continue
        if line.replace("\x00", "").strip():
            print(
                f"Warning: skipping malformed ai-activity-log.jsonl line {line_no}",
                file=sys.stderr,
            )
    return logs


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


def _retention_keeps() -> dict[str, int]:
    """Resolve status-file retention keep counts from orchestrator config.

    ai_status.py owns every ai-status.json mutation (the worker
    ``ai-status.sh`` CLI invokes it for each transition), so retention is part
    of this canonical transaction. Without it, handoffs/tasks regrow unbounded
    (17.8k handoffs / 8.7 MB by the 2026-05-31 incident) and the file blows
    past the 256 KB cap the chair/coordination worker Read tool enforces,
    re-breaking machine-truth reads. Keeps are read from the orchestrator
    config (config.local.json overrides config.json). See
    feedback_ai_status_handoff_bloat.
    """
    supervisor_cfg: dict[str, Any] = {}
    for name in ("config.json", "config.local.json"):
        path = ROOT / ".orchestrator" / name
        try:
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                section = data.get("supervisor") if isinstance(data, dict) else None
                if isinstance(section, dict):
                    supervisor_cfg.update(section)
        except (OSError, ValueError):
            continue
    return {
        "handoffs": int(supervisor_cfg.get("handoff_keep_count", 200)),
        "tasks": int(supervisor_cfg.get("task_keep_count", 150)),
        "blockers": int(supervisor_cfg.get("blocker_keep_count", 100)),
    }


def archive_task_bodies(dropped: list[dict[str, Any]]) -> None:
    """Append the full bodies of pruned done-tasks to ``ai-task-archive.jsonl``
    so completed-task detail (summary/owner/review notes/artifacts) stays
    auditable after the live status file drops them — ``archived_task_ids`` only
    keeps the id. Append-only JSONL + O_APPEND is used deliberately: ai_status.py
    is the dominant, highly concurrent writer (~153k invocations), so a
    read-modify-write of a single JSON object would race and lose records. A task
    is dropped from ``state["tasks"]`` exactly once, so no de-dup is needed here.
    Best-effort: archival must never block or fail a status write."""
    if not dropped:
        return
    stamp = iso_now()
    try:
        with TASK_ARCHIVE_FILE.open("a", encoding="utf-8") as handle:
            for task in dropped:
                if not task.get("id"):
                    continue
                record = dict(task)
                record["_archived_at"] = stamp
                record["_archived_by"] = "ai_status.py"
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        pass


def prune_state_for_size(state: dict[str, Any]) -> None:
    """Bound the unbounded audit tails (done handoffs, done tasks, resolved
    blockers) in place as part of the canonical status transaction. Pending
    handoffs and open blockers are never trimmed, and dropped done-task ids are
    recorded in ``archived_task_ids`` (dependency-safe because
    ``dependencies_satisfied`` treats a missing dep as archived/done).
    Dropped done-task bodies are appended to ``ai-task-archive.jsonl`` first so
    their detail stays auditable (see ``archive_task_bodies``)."""
    keeps = _retention_keeps()

    handoffs = state.get("handoffs")
    if isinstance(handoffs, list):
        keep = keeps["handoffs"]
        done = [x for x in handoffs if str(x.get("status") or "").lower() == "done"]
        if len(done) > keep:
            pending = [x for x in handoffs if str(x.get("status") or "").lower() != "done"]
            state["handoffs"] = pending + done[-keep:]

    tasks = state.get("tasks")
    if isinstance(tasks, list):
        keep = keeps["tasks"]
        done = [t for t in tasks if str(t.get("status") or "").lower() == "done"]
        if len(done) > keep:
            dropped = done[:-keep] if keep > 0 else done
            dropped_ids = {t.get("id") for t in dropped if t.get("id")}
            if dropped_ids:
                archive_task_bodies(dropped)
                state["tasks"] = [
                    t
                    for t in tasks
                    if str(t.get("status") or "").lower() != "done" or t.get("id") not in dropped_ids
                ]
                archived = state.setdefault("archived_task_ids", [])
                if isinstance(archived, list):
                    already = set(archived)
                    for tid in (t.get("id") for t in dropped):
                        if tid and tid not in already:
                            archived.append(tid)
                            already.add(tid)

    blockers = state.get("blockers")
    if isinstance(blockers, list):
        keep = keeps["blockers"]
        resolved = [b for b in blockers if str(b.get("status") or "").lower() == "resolved"]
        if len(resolved) > keep:
            dropped = {id(b) for b in (resolved[:-keep] if keep > 0 else resolved)}
            state["blockers"] = [b for b in blockers if id(b) not in dropped]


def save_state(state: dict[str, Any]) -> None:
    prune_state_for_size(state)
    atomic_write_text(STATUS_FILE, json.dumps(state, indent=2, ensure_ascii=False) + "\n")


def append_log(entry: dict[str, Any]) -> None:
    _append_jsonl_line(LOG_FILE, json.dumps(entry, ensure_ascii=False))


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

    acceptance = parse_csv_env("TASK_REQUIRED_ACCEPTANCE")
    if acceptance:
        metadata["required_acceptance"] = acceptance

    return metadata


def dependency_is_satisfied(task_map: dict[str, dict[str, Any]], dep_id: str) -> bool:
    dependency = task_map.get(dep_id)
    if dependency is None:
        return True
    return dependency.get("status") in DEPENDENCY_DONE_STATUSES


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


def validate_state(state: dict[str, Any]) -> None:
    sync_canonical_document_metadata(state)
    normalize_state_agents(state)
    for task in state["tasks"]:
        ensure_agent(task["owner"])
        reviewer = canonical_agent_name(task.get("reviewer"))
        if reviewer:
            ensure_agent(reviewer)
        if reviewer and task["owner"] == reviewer:
            raise SystemExit(f"Task {task['id']} has identical owner and reviewer")
        waiting_for = canonical_agent_name(task.get("waiting_for"))
        if waiting_for:
            ensure_agent(waiting_for)

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
        integrating = [task for task in owned if task["status"] in {"integrating", "acceptance"}]
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
        elif integrating:
            agent["status"] = "integrating"
            agent["current_task_ids"] = [task["id"] for task in integrating]
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
        elif integrating:
            agent["next"] = integrating[0].get("next", "")
            agent["last_update"] = integrating[0].get("last_update")
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
            "integrating": 0,
            "acceptance": 0,
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
    return str(task.get("title") or "")


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
    current_sprint_lines.append("- Dashboard: `tools/development-orchestrator/dashboard/index.html`")

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
            message = blocker.get("message") or blocker.get("reason") or ""
            lines.append(
                f"| `{blocker['task_id']}` | {blocker['owner']} | {blocker['waiting_for']} | {message} | {blocker['status']} |"
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


def sync_dashboard() -> None:
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
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
            shutil.copy2(path, DASHBOARD_DIR / target_name)


def sync_task_briefs(state: dict[str, Any]) -> None:
    orchestrator_dir = ROOT / ".orchestrator"
    if not orchestrator_dir.exists():
        return
    from common import ensure_task_brief, load_config

    config = load_config(orchestrator_dir / "config.json")
    for task in state.get("tasks", []):
        if isinstance(task, dict) and task.get("id"):
            ensure_task_brief(config, task=task, status=state, runtime_state=state)


def sync_all(state: dict[str, Any]) -> None:
    sync_canonical_document_metadata(state)
    normalize_state_agents(state)
    validate_state(state)
    normalize_handoffs(state)
    recompute_agents(state)
    recompute_workload(state)
    state["updated_at"] = iso_now()
    save_state(state)
    sync_task_briefs(state)
    logs = load_logs()
    write_current_work(state, logs)
    sync_dashboard()


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
            if task_status in {"in_progress", "integrating", "acceptance", "blocked", "done"}:
                for handoff in pending:
                    handoff["status"] = "done"
                    handoff["resolved_at"] = iso_now()
                continue

        for handoff in pending[:-1]:
            handoff["status"] = "done"
            handoff["resolved_at"] = iso_now()

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
            "candidate_lifecycle_version": 1,
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
        task.setdefault("candidate_lifecycle_version", 1)

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


def command_reassign(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 4:
        raise SystemExit("Usage: reassign <task-id> <owner> <reviewer> <message>")
    task_id = args[0]
    owner = canonical_agent_name(args[1])
    reviewer = canonical_agent_name(args[2])
    message = args[3]
    actor = current_actor()
    if actor != "Supervisor":
        raise SystemExit("Only Supervisor can reassign a task")
    ensure_agent(owner)
    ensure_agent(reviewer)
    if owner == reviewer:
        raise SystemExit("Reviewer cannot equal owner")
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")

    old_owner = canonical_agent_name(task.get("owner"))
    old_reviewer = canonical_agent_name(task.get("reviewer"))
    expected_owner = canonical_agent_name(os.environ.get("TASK_EXPECTED_OWNER"))
    expected_reviewer = canonical_agent_name(os.environ.get("TASK_EXPECTED_REVIEWER"))
    if expected_owner and expected_owner != old_owner:
        raise SystemExit(f"{task_id} owner changed before reassignment")
    if expected_reviewer and expected_reviewer != old_reviewer:
        raise SystemExit(f"{task_id} reviewer changed before reassignment")

    owner_changed = owner != old_owner
    reviewer_changed = reviewer != old_reviewer
    status = str(task.get("status") or "").lower()
    if owner_changed and status not in {"backlog", "todo", "in_progress"}:
        raise SystemExit(f"Owner reassignment is not allowed while {task_id} is {status}")
    if reviewer_changed and status not in {"todo", "in_progress", "review"}:
        raise SystemExit(f"Reviewer reassignment is not allowed while {task_id} is {status}")

    timestamp = iso_now()
    task["owner"] = owner
    task["reviewer"] = reviewer
    if owner_changed and os.environ.get("TASK_REASSIGN_REOPEN") == "1":
        task["status"] = "todo"
        clear_candidate_evidence(task)
    task["last_update"] = timestamp
    task["next"] = message
    task.setdefault("candidate_lifecycle_version", 1)

    evidence_ref = os.environ.get("TASK_EVIDENCE_REF", "").strip()
    if evidence_ref:
        refs = list(task.get("evidence_refs", []) or [])
        if evidence_ref not in refs:
            refs.append(evidence_ref)
        task["evidence_refs"] = refs

    for handoff in state.get("handoffs", []) or []:
        if handoff.get("task_id") != task_id or handoff.get("status") == "done":
            continue
        target = canonical_agent_name(handoff.get("to"))
        if target in {old_owner, old_reviewer} and target not in {owner, reviewer}:
            handoff["status"] = "done"
            handoff["resolved_at"] = timestamp

    handoff_to = canonical_agent_name(os.environ.get("TASK_HANDOFF_TO"))
    if handoff_to:
        ensure_agent(handoff_to)
        state.setdefault("handoffs", []).append(
            {
                "task_id": task_id,
                "from": canonical_agent_name(os.environ.get("TASK_HANDOFF_FROM")) or old_owner or old_reviewer,
                "to": handoff_to,
                "message": message,
                "status": "pending",
                "created_at": timestamp,
            }
        )
    append_log(
        {
            "ts": timestamp,
            "agent": actor,
            "type": "reassign",
            "task_id": task_id,
            "message": message,
            "owner": owner,
            "reviewer": reviewer,
        }
    )


def command_resume_blocked(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 3:
        raise SystemExit("Usage: resume-blocked <task-id> <status> <message>")
    task_id, resume_status, message = args[0], str(args[1]).strip().lower(), args[2]
    actor = current_actor()
    if actor != "Supervisor":
        raise SystemExit("Only Supervisor can resume a blocked task")
    if resume_status not in {"backlog", "todo", "in_progress"}:
        raise SystemExit(f"Unsupported resume status: {resume_status}")
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("status") != "blocked":
        raise SystemExit(f"{task_id} is not blocked")
    timestamp = iso_now()
    task["status"] = resume_status
    task["last_update"] = timestamp
    task["next"] = message
    task.pop("waiting_for", None)
    task.setdefault("candidate_lifecycle_version", 1)
    mark_blockers_resolved(state, task_id)
    append_log(
        {
            "ts": timestamp,
            "agent": actor,
            "type": "blocked_task_resumed",
            "task_id": task_id,
            "message": message,
            "resume_status": resume_status,
            "helper_task_id": os.environ.get("TASK_RESUME_HELPER_ID", "").strip() or None,
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
    if task["status"] in {"backlog", "todo", "integrating", "acceptance"}:
        task["status"] = "in_progress"
        clear_candidate_evidence(task)
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
    clear_candidate_evidence(task)
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
    candidate_sha = os.environ.get("CANDIDATE_SHA", "").strip()
    candidate_branch = os.environ.get("CANDIDATE_BRANCH", "").strip()
    if candidate_required(task):
        if not candidate_sha:
            raise SystemExit("handoff requires CANDIDATE_SHA for canonical tasks")
        if not git_commit_exists(candidate_sha):
            raise SystemExit(f"CANDIDATE_SHA does not resolve to a local commit: {candidate_sha}")
        if not candidate_branch:
            raise SystemExit("handoff requires CANDIDATE_BRANCH for canonical tasks")
    else:
        candidate_sha = "not_applicable"
        candidate_branch = "not_applicable"

    timestamp = iso_now()
    clear_candidate_evidence(task)
    task["candidate_sha"] = candidate_sha
    task["candidate_branch"] = candidate_branch
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
    append_log(
        {
            "ts": timestamp,
            "agent": actor,
            "type": "candidate_handoff",
            "task_id": task_id,
            "candidate_sha": candidate_sha,
            "message": f"Candidate {candidate_sha[:12]} handed to {to_agent}: {message}",
        }
    )


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


def command_system_block(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: system-block <task-id> <message>")
    task_id, message = args[0], args[1]
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    timestamp = iso_now()
    task["status"] = "blocked"
    task["next"] = message
    task["last_update"] = timestamp
    evidence_ref = os.environ.get("EVIDENCE_REF", "").strip()
    if evidence_ref:
        refs = list(task.get("evidence_refs") or [])
        if evidence_ref not in refs:
            refs.append(evidence_ref)
        task["evidence_refs"] = refs
    append_log(
        {
            "ts": timestamp,
            "agent": current_actor("Supervisor"),
            "type": "system_block",
            "task_id": task_id,
            "message": message,
        }
    )


def command_done(state: dict[str, Any], args: list[str]) -> None:
    raise SystemExit(
        "done is derived by the candidate lifecycle. Owners hand off a locked candidate; "
        "reviewers approve it; the GitHub bus records same-SHA CI and merge; "
        "record-acceptance supplies any remaining external evidence."
    )


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
        raise SystemExit(f"{task_id} must be in review before it can move to integrating")
    if not candidate_is_locked(task):
        raise SystemExit(f"{task_id} has no locked candidate to approve")

    reviewed_sha = os.environ.get("REVIEWED_SHA", "").strip() or str(task.get("candidate_sha") or "")
    if reviewed_sha != task.get("candidate_sha"):
        raise SystemExit("REVIEWED_SHA must exactly match CANDIDATE_SHA")

    timestamp = iso_now()
    task["reviewed_sha"] = reviewed_sha
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
    mark_handoffs_done(state, task_id)
    if candidate_required(task):
        task["status"] = "integrating"
    else:
        task["merge_sha"] = "not_applicable"
        transition_after_merge(state, task, message=message, timestamp=timestamp)
    append_log(
        {
            "ts": timestamp,
            "agent": actor,
            "type": "candidate_approved",
            "task_id": task_id,
            "candidate_sha": reviewed_sha,
            "message": message,
        }
    )


def command_reconcile_candidate(state: dict[str, Any], args: list[str]) -> None:
    if not args:
        raise SystemExit("Usage: reconcile-candidate <task-id> [message]")
    task_id = args[0]
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    if task.get("status") == "done":
        return

    candidate_sha = str(task.get("candidate_sha") or "").strip()
    if not candidate_sha or candidate_sha == "not_applicable":
        return
    head_sha = os.environ.get("CANDIDATE_HEAD_SHA", "").strip()
    ci_status = os.environ.get("CANDIDATE_CI_STATUS", "").strip().lower()
    merge_sha = os.environ.get("MERGE_SHA", "").strip()
    timestamp = iso_now()

    if ci_status and ci_status not in CANDIDATE_CI_STATUSES:
        raise SystemExit(f"CANDIDATE_CI_STATUS must be one of: {', '.join(sorted(CANDIDATE_CI_STATUSES))}")
    if head_sha and head_sha != candidate_sha:
        task["status"] = "in_progress"
        clear_candidate_evidence(task)
        task["last_update"] = timestamp
        task["next"] = "Candidate changed after review; previous review and CI evidence were invalidated."
        mark_handoffs_done(state, task_id)
        append_log(
            {
                "ts": timestamp,
                "agent": current_actor("Supervisor"),
                "type": "candidate_invalidated",
                "task_id": task_id,
                "candidate_sha": candidate_sha,
                "head_sha": head_sha,
                "message": task["next"],
            }
        )
        return

    for env_name, key in (("PR_URL", "pr_url"), ("CANDIDATE_BRANCH", "candidate_branch"), ("CI_RUN_URL", "ci_run_url")):
        value = os.environ.get(env_name, "").strip()
        if value:
            task[key] = value
    if ci_status:
        task["ci_status"] = ci_status
        task["ci_sha"] = candidate_sha

    if task.get("status") == "review" and ci_status not in {"failure", "merge_conflict", "closed"}:
        task["last_update"] = timestamp
        task["next"] = args[1] if len(args) > 1 else f"Candidate {candidate_sha[:12]} is ready for reviewer evidence."
    elif ci_status in {"failure", "merge_conflict", "closed"}:
        task["status"] = "in_progress"
        task["last_update"] = timestamp
        task["next"] = args[1] if len(args) > 1 else f"Candidate CI {ci_status}; owner must repair and hand off a new candidate."
        mark_handoffs_done(state, task_id)
    elif merge_sha:
        if task.get("reviewed_sha") != candidate_sha:
            raise SystemExit("Cannot record merge without reviewer approval for the same candidate SHA")
        if task.get("ci_sha") != candidate_sha or task.get("ci_status") != "success":
            raise SystemExit("Cannot record merge without successful CI for the same candidate SHA")
        task["merge_sha"] = merge_sha
        transition_after_merge(
            state,
            task,
            message=args[1] if len(args) > 1 else f"Candidate {candidate_sha[:12]} merged as {merge_sha[:12]}.",
            timestamp=timestamp,
        )
    else:
        task["status"] = "integrating"
        task["last_update"] = timestamp
        task["next"] = args[1] if len(args) > 1 else f"Candidate {candidate_sha[:12]} is awaiting same-SHA CI/merge evidence."

    append_log(
        {
            "ts": timestamp,
            "agent": current_actor("Supervisor"),
            "type": "candidate_reconciled",
            "task_id": task_id,
            "candidate_sha": candidate_sha,
            "ci_status": ci_status,
            "merge_sha": merge_sha,
            "message": task.get("next"),
        }
    )


def command_record_acceptance(state: dict[str, Any], args: list[str]) -> None:
    if len(args) < 2:
        raise SystemExit("Usage: record-acceptance <task-id> <message>")
    task_id, message = args[0], args[1]
    task = get_task(state, task_id)
    if task is None:
        raise SystemExit(f"Unknown task: {task_id}")
    actor = current_actor()
    allowed = {canonical_agent_name(task.get("owner")), canonical_agent_name(task.get("reviewer")), "Supervisor"}
    if actor not in allowed:
        raise SystemExit(f"Only the owner, reviewer, or Supervisor can record acceptance for {task_id}")
    if task.get("status") != "acceptance":
        raise SystemExit(f"{task_id} is not awaiting acceptance evidence")

    evidence = parse_json_env("ACCEPTANCE_EVIDENCE_JSON")
    allowed_keys = set(required_acceptance(task))
    unexpected = sorted(set(evidence) - allowed_keys)
    if unexpected:
        raise SystemExit(f"Acceptance evidence is not required for {task_id}: {', '.join(unexpected)}")
    if not evidence:
        raise SystemExit("ACCEPTANCE_EVIDENCE_JSON must include at least one required evidence key")
    task.setdefault("acceptance_evidence", {}).update(evidence)
    timestamp = iso_now()
    transition_after_merge(state, task, message=message, timestamp=timestamp)
    append_log(
        {
            "ts": timestamp,
            "agent": actor,
            "type": "acceptance_recorded",
            "task_id": task_id,
            "message": message,
        }
    )


def command_migrate_candidate_lifecycle(state: dict[str, Any], _args: list[str]) -> None:
    """One-way conversion of pre-candidate state. It never trusts old approvals."""
    timestamp = iso_now()
    migrated = 0
    for task in state.get("tasks", []):
        if not isinstance(task, dict):
            continue
        if task.get("candidate_lifecycle_version") == 1:
            continue
        legacy_status = str(task.get("status") or "")
        legacy_required = str(task.get("required_integration_status") or "").strip().lower()
        required = required_acceptance(task)
        if legacy_required == "dev_deployed" and "dev_deployed" not in required:
            required.append("dev_deployed")
        for field in task.get("required_evidence_fields") or []:
            name = str(field).strip()
            if name and name not in required:
                required.append(name)
        if required:
            task["required_acceptance"] = required

        legacy_evidence = {
            key: task.get(key)
            for key in required
            if str(task.get(key) or "").strip()
        }
        if legacy_required == "dev_deployed" and all(
            str(task.get(key) or "").strip()
            for key in ("dev_deploy_run_url", "dev_deploy_sha", "dev_deploy_source_ref")
        ):
            legacy_evidence["dev_deployed"] = task.get("dev_deploy_run_url")
        if legacy_evidence:
            task.setdefault("acceptance_evidence", {}).update(legacy_evidence)

        if legacy_status == "review_approved":
            task["status"] = "in_progress"
            task["next"] = "Legacy review approval was not bound to a candidate SHA; owner must hand off a new candidate."
            mark_handoffs_done(state, str(task.get("id") or ""))
        if legacy_status != "done":
            for key in LEGACY_INTEGRATION_FIELDS:
                task.pop(key, None)
        task["candidate_lifecycle_version"] = 1
        task["candidate_lifecycle_migrated_at"] = timestamp
        migrated += 1
    append_log(
        {
            "ts": timestamp,
            "agent": current_actor("Supervisor"),
            "type": "candidate_lifecycle_migrated",
            "message": f"Migrated {migrated} task records to candidate lifecycle v1.",
        }
    )
    print(f"migrate-candidate-lifecycle: migrated {migrated} task record(s)")


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
    # Kept as a no-op entrypoint for the periodic supervisor call. Git history
    # is deliberately not a source of truth for task completion.
    return None


def command_prompt(state: dict[str, Any], _args: list[str]) -> None:
    print(build_onboarding_prompt(state))


def command_show(state: dict[str, Any], args: list[str]) -> None:
    """Print ONE task as JSON. Cheap alternative to ``Read ai-status.json``
    (which is ~2 MB and burns ~500K input tokens every time a worker reads
    it). Usage: ``show <TASK-ID>``."""
    if not args:
        raise SystemExit("Usage: show <task-id>")
    task_id = args[0].strip()
    for task in state.get("tasks", []) or []:
        if str(task.get("id") or "").strip() == task_id:
            print(json.dumps(task, ensure_ascii=False, indent=2))
            return
    raise SystemExit(f"Task not found: {task_id}")


def command_list(state: dict[str, Any], args: list[str]) -> None:
    """Print compact one-line-per-task summary (id, status, owner, reviewer,
    last_update). Filterable by --status / --owner / --reviewer / --phase to
    keep output small. Usage:

      list                              # all tasks
      list --status in_progress         # only tasks in this status
      list --owner Codex2 --status todo # combine filters
    """
    filters = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a.startswith("--") and i + 1 < len(args):
            filters[a[2:]] = args[i + 1].strip()
            i += 2
        else:
            i += 1
    tasks = state.get("tasks", []) or []
    rows = []
    for t in tasks:
        if not isinstance(t, dict):
            continue
        if any(str(t.get(k) or "") != v for k, v in filters.items()):
            continue
        rows.append(t)
    for t in rows:
        print(
            "{id:<32s} {status:<16s} owner={owner:<10s} reviewer={reviewer:<10s} {last}".format(
                id=str(t.get("id") or "")[:32],
                status=str(t.get("status") or "")[:16],
                owner=str(t.get("owner") or "-")[:10],
                reviewer=str(t.get("reviewer") or "-")[:10],
                last=str(t.get("last_update") or "")[:19],
            )
        )
    if not rows:
        print("(no matches)")


def command_audit(state: dict[str, Any], args: list[str]) -> None:
    audit_name = args[0].strip().lower() if args else "doc-sync"
    if audit_name != "doc-sync":
        raise SystemExit("Usage: audit [doc-sync]")
    success, lines = build_doc_sync_audit_report(state)
    print("\n".join(lines))
    if not success:
        raise SystemExit(1)


def _command_runtime() -> TaskBoardCommandRuntime:
    return TaskBoardCommandRuntime(
        status_file=STATUS_FILE,
        load_state=load_state,
        save_state=save_state,
        sync_all=sync_all,
        read_only_commands={
        "audit": command_audit,
        "prompt": command_prompt,
        "show": command_show,
        "list": command_list,
        },
        mutation_commands={
        "assign": command_assign,
        "reassign": command_reassign,
        "resume-blocked": command_resume_blocked,
        "start": command_start,
        "progress": command_progress,
        "note": command_note,
        "reopen": command_reopen,
        "handoff": command_handoff,
        "blocker": command_blocker,
        "system-block": command_system_block,
        "done": command_done,
        "approve": command_approve,
        "reconcile-candidate": command_reconcile_candidate,
        "record-acceptance": command_record_acceptance,
        "migrate-candidate-lifecycle": command_migrate_candidate_lifecycle,
        "mode": command_mode,
        "sync": command_sync,
        },
    )


def execute_command(command: str, args: list[str]) -> Any:
    return TaskBoardCommandExecutor(_command_runtime()).execute_with_result(command, args)


def main(argv: list[str]) -> int:
    ensure_canonical_delegation(argv)
    command = argv[1] if len(argv) > 1 else "sync"
    execute_command(command, argv[2:])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
