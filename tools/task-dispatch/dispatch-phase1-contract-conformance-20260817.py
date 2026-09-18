#!/usr/bin/env python3
"""Register the Phase 1 contract conformance DAG for supervisor execution.

This script writes machine truth only through the canonical ai-status command.
It does not start workers itself; the supervisor dispatches dependency-ready
tasks into isolated worktrees.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-phase1-contract-conformance-20260817.py --dry-run
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-phase1-contract-conformance-20260817.py
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-phase1-contract-conformance-20260817.py --allow-existing
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PHASE = "phase1-contract-conformance-20260817"
GAP_REF = (
    "docs/02-architecture/"
    "phase1-prd-service-contracts-conformance-audit-20260817.md"
)
EXECUTION_REF = (
    "docs/03-runbooks/phase1-contract-conformance-execution-tasks-20260817.md"
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
    gap_ids: tuple[str, ...]
    gates: tuple[str, ...]
    task_class: str = "implementation"
    required_acceptance: tuple[str, ...] = ()


TASKS = (
    Task(
        "CONF-AUDIT-001",
        "Codex",
        "Claude",
        "Enforce audit-log immutability in the database",
        "Close GAP-CONF-03. Add a BEFORE UPDATE OR DELETE trigger on admin.audit_logs so the append-only claim in PRD 13.3 and 14.2.7 is enforced by the database rather than by repository convention. Confirm the production role before deciding whether REVOKE adds anything; owners and superusers are not bound by REVOKE. Provide a privileged archival path so lawful retention deletion never requires removing the protection. Do not change the audit repository or calling code.",
        (),
        (
            "infra/migrations/",
            "operations/database/",
            "tests/security/",
            GAP_REF,
        ),
        (
            "Direct UPDATE on admin.audit_logs raises an exception and changes no row",
            "Direct DELETE on admin.audit_logs raises an exception and changes no row",
            "Both are proven by an automated negative test rather than a manual transcript",
            "INSERT and existing read paths are unaffected and the audit suite stays green",
            "Migration is idempotent and rerun-safe in existing infra/migrations style",
            "Production connection role is stated in the PR and justifies the REVOKE decision",
            "Retention archival path is documented and never requires disabling the protection",
        ),
        "P1",
        "A",
        "audit-integrity",
        ("GAP-CONF-03",),
        ("C1",),
    ),
    Task(
        "CONF-IDEM-001",
        "Codex2",
        "Gemini",
        "Settle idempotency semantics and land the shared foundation",
        "Close the design half of GAP-CONF-01. Decide replay-versus-conflict wire semantics and land the shared mechanism the three endpoint tasks will apply. Implement none of the nine commands here. Derive the helper from the four existing correct implementations rather than inventing a pattern. The database UNIQUE constraint is mandatory: a service-layer look-up-then-insert check fails under exactly the concurrency retries produce. Scope uniqueness to object and operation.",
        (),
        (
            "docs/02-architecture/",
            "apps/api/src/common/",
            "infra/migrations/",
            "packages/contracts/src/",
            "tests/unit/",
        ),
        (
            "Replay-versus-conflict semantics are decided and recorded with the response code for each of the three cases",
            "Helper covers unseen key executes, matching payload replays stored response, differing payload returns conflict",
            "Response storage is part of the pattern since replay requires it",
            "Pattern mandates a database UNIQUE constraint and documents why a service-layer check alone is insufficient",
            "Uniqueness scoping guidance is explicit including tenant-scoped order creation",
            "Payload comparison is defined precisely enough for three workers to implement it identically",
            "Helper unit tests pass including a concurrent-insert case",
        ),
        "P0",
        "A",
        "idempotency-foundation",
        ("GAP-CONF-01",),
        ("C2",),
    ),
    Task(
        "CONF-EVENT-001",
        "Claude",
        "Codex2",
        "Decide the domain event contract and implement nothing",
        "Close GAP-CONF-02 by producing a decision, not code. Contracts 5.2 specifies about 40 topics; 26 do not exist, there is no event bus or outbox, and DomainEventEnvelope is used only by two WebSocket stream types. Establish that this is an architecture mismatch rather than a coding defect, then choose between ratifying the monolith or introducing a transactional outbox. Fold GAP-CONF-07 write-authority drift into the decision. Adding a subset of topics is explicitly rejected.",
        (),
        (
            "docs/01-decisions/",
            "phase1_service_contracts_v1.md",
            "docs/03-runbooks/",
            "CANONICAL_DOCUMENT_MAP.md",
        ),
        (
            "Decision states option a or b with reasoning and names who accepted it",
            "Contracts sections 5.2 6 and 7.1 are internally consistent with the chosen option",
            "The three existing mechanisms are documented with their real topic names",
            "The invoice.issued versus tenant.invoice.generated discrepancy is resolved in one direction",
            "Option b produces a sized follow-up packet and no production code",
            "Option a marks section 5.2 unambiguously as not implemented in Phase 1",
            "No new event topic was added to the codebase by this task",
        ),
        "P0",
        "A",
        "event-architecture",
        ("GAP-CONF-02", "GAP-CONF-07"),
        ("C7",),
        task_class="planning",
    ),
    Task(
        "CONF-DOC-001",
        "Gemini2",
        "Claude",
        "Reconcile decided scope that documents still call open",
        "Move Q-006 and Q-008 out of PHASE1_OPEN_QUESTIONS.md Open Items citing MSC-P1-001, which already decided both. Give each of the five unresolved contracts section 10 review questions an owner and a decision route without deciding them here. Record the call_point_id contract-type gap in the owning backlog. Documentation only.",
        (),
        (
            "PHASE1_OPEN_QUESTIONS.md",
            "phase1_service_contracts_v1.md",
            GAP_REF,
        ),
        (
            "Q-006 and Q-008 appear under resolved items citing MSC-P1-001 and no longer under Open Items",
            "Each of the five section 10 questions has a named owner and a decision route",
            "No question is silently closed without a decision reference",
            "The call_point_id contract-type gap is recorded in an owning backlog",
            "No code or schema changed",
        ),
        "P2",
        "A",
        "doc-truth",
        ("GAP-CONF-02",),
        ("C10",),
        task_class="documentation",
    ),
    Task(
        "CONF-IDEM-002",
        "Gemini",
        "Codex",
        "Idempotency for order booking and dispatch commands",
        "Apply the CONF-IDEM-001 pattern to three of the nine specified commands in owned-mobility: create passenger order, create tenant booking, and dispatch assign/redispatch. These carry the highest duplicate cost since a duplicate order dispatches a second vehicle and charges again. Reconcile the existing referral body-field idempotencyKey path with the header contract so two competing mechanisms do not remain.",
        ("CONF-IDEM-001",),
        (
            "apps/api/src/modules/owned-mobility/",
            "infra/migrations/",
            "tests/integration/",
        ),
        (
            "All three commands reject a missing key with the decided error code",
            "Repeated key with identical payload replays the stored response and creates no second record",
            "Repeated key with differing payload returns conflict",
            "Uniqueness is enforced by a database constraint not only a service-layer lookup",
            "Referral body-field path and header contract are reconciled with documented precedence",
            "Existing owned-mobility tests stay green",
        ),
        "P0",
        "B",
        "idempotency-orders",
        ("GAP-CONF-01",),
        ("C3",),
    ),
    Task(
        "CONF-IDEM-003",
        "Codex",
        "Gemini2",
        "Idempotency for finance and reporting commands",
        "Apply the CONF-IDEM-001 pattern to driver payout request and reimbursement batch approval in billing-settlement, and create report job plus generate filing package in reporting-filing. Duplicate execution here moves money with no automated recovery and produces duplicate filing packages whose manifest hashes disagree; packages are immutable once complete so a duplicate is not correctable. Reuse the shared helper rather than copying the existing payment recovery validation a second time.",
        ("CONF-IDEM-001",),
        (
            "apps/api/src/modules/billing-settlement/",
            "apps/api/src/modules/reporting-filing/",
            "infra/migrations/",
            "tests/integration/",
        ),
        (
            "All listed commands reject a missing key with the decided error code",
            "Repeated key with identical payload replays the stored response and creates no second batch job or package",
            "Repeated key with differing payload returns conflict",
            "Uniqueness is enforced by a database constraint",
            "Filing package manifest and checksum immutability is preserved and proven unaffected",
            "Existing payment recovery idempotency continues to pass and is not duplicated by the new helper",
        ),
        "P0",
        "B",
        "idempotency-finance",
        ("GAP-CONF-01",),
        ("C3",),
    ),
    Task(
        "CONF-IDEM-004",
        "Claude2",
        "Codex2",
        "Idempotency for callcenter complaint and webhook commands",
        "Apply the CONF-IDEM-001 pattern to create call-center order in callcenter, create complaint case in complaint, and webhook test delivery in tenant-partner. Contracts 3.10 makes case_no unique and immutable, so a duplicate case creates two independent SLA timers. Call-center order creation is an orchestration per contracts 4.5; the key must cover the whole orchestration so a retry cannot create a second order while reusing the first call session link.",
        ("CONF-IDEM-001",),
        (
            "apps/api/src/modules/callcenter/",
            "apps/api/src/modules/complaint/",
            "apps/api/src/modules/tenant-partner/",
            "infra/migrations/",
            "tests/integration/",
        ),
        (
            "All three commands reject a missing key with the decided error code",
            "Repeated key with identical payload replays the stored response and creates no second order case or delivery",
            "Repeated key with differing payload returns conflict",
            "Call-center order creation is idempotent across the full orchestration not only at the Order Service boundary",
            "One complaint retry yields exactly one case_no and one SLA timer",
            "Uniqueness is enforced by a database constraint",
        ),
        "P0",
        "B",
        "idempotency-crm",
        ("GAP-CONF-01",),
        ("C3",),
    ),
    Task(
        "CONF-CODE-001",
        "Codex2",
        "Gemini",
        "Minimum lead time naming alignment and clock-in vehicle check",
        "Close GAP-CONF-06 and GAP-CONF-08 and apply the audit naming register. Lead time is a real weakening: PRD 9.1.1 requires a minimum advance booking time but the implementation only checks the pickup is in the future, so a booking one minute ahead passes. Add the shift-attendance vehicle dispatchability check per PRD 9.4.7. For the remaining naming rows align the specification to the implementation since implemented names are equal or finer-grained.",
        (),
        (
            "apps/api/src/modules/owned-mobility/",
            "apps/api/src/modules/shift-attendance/",
            "phase1_service_contracts_v1.md",
            "tests/unit/",
        ),
        (
            "A booking inside the minimum lead time is rejected with the agreed code and the threshold is configurable",
            "The threshold value is confirmed with product and recorded in the PR",
            "Clock-in rejects an undispatchable vehicle without weakening the assignment-time check",
            "Contracts section 4.1 lists implemented error codes with specified names mapped to them",
            "No working error code was renamed purely to match older wording",
            "Existing owned-mobility and shift-attendance tests stay green",
        ),
        "P2",
        "C",
        "contract-conformance",
        ("GAP-CONF-06", "GAP-CONF-08"),
        ("C9",),
    ),
    Task(
        "CONF-STATE-001",
        "Claude",
        "Gemini2",
        "Resolve the two absent state models as spec or implementation",
        "GAP-CONF-04 and GAP-CONF-05 are model gaps whose correct resolution is an unasked product question. Ask it and record the answer; do not implement before the answer exists. Forwarded orders have 8 of 13 states with MAPPED ELIGIBLE NATIVE_IN_PROGRESS REJECTED and EXPIRED absent. Driver status has no enum and presence is binary. If the current model suffices amend the PRD and say why; otherwise produce a sized packet.",
        (),
        (
            "docs/01-decisions/",
            "phase1_prd_detailed_v1.md",
            "docs/03-runbooks/",
        ),
        (
            "Both gaps are resolved as specification amendment or sized implementation with recorded product rationale",
            "An amendment states why the current model is sufficient in terms a future auditor can check",
            "A chosen implementation produces a sized packet and no production code here",
            "Contracts section 3.7 forwarder reconciliation stays consistent with the outcome",
            "No state value was added to the codebase by this task",
        ),
        "P2",
        "C",
        "state-model",
        ("GAP-CONF-04", "GAP-CONF-05"),
        ("C8",),
        task_class="planning",
    ),
    Task(
        "CONF-IDEM-005",
        "Gemini2",
        "Claude2",
        "Bind client idempotency keys to user intent",
        "Close the client half of GAP-CONF-01. packages/api-client injects Idempotency-Key into every POST using a fresh crypto.randomUUID per call, so the key changes on every retry and defeats server-side idempotency even after Wave B lands. Replace per-call generation with per-intent binding and remove blanket auto-injection, because a key that differs per attempt presents the appearance of protection while providing none.",
        ("CONF-IDEM-002", "CONF-IDEM-003", "CONF-IDEM-004"),
        (
            "packages/api-client/src/",
            "apps/tenant-console-web/",
            "apps/enterprise-dispatch-web/",
            "apps/referral-embed-web/",
            "tests/",
        ),
        (
            "One user intent retried N times sends one identical key on all N attempts proven by test",
            "Blanket per-POST key generation is removed from api-client",
            "No surface generates a fresh key per attempt for any of the nine commands",
            "Surfaces that cannot yet bind a key omit the header explicitly rather than sending a throwaway value",
            "A duplicate browser submission against a Wave B endpoint creates exactly one record",
            "Existing client tests typecheck and builds pass",
        ),
        "P0",
        "C",
        "idempotency-client",
        ("GAP-CONF-01",),
        ("C5",),
    ),
    Task(
        "CONF-VERIFY-001",
        "Codex",
        "Claude",
        "Prove idempotency under concurrency and guard against regression",
        "Prove GAP-CONF-01 is closed and make it stay closed. Sequential proof is insufficient: the failure idempotency prevents is two parallel attempts at one intent, which is what a double-click and a timeout resend produce. Test all nine commands with genuinely concurrent submissions of the same key. Add a regression guard that discovers create-type commands recursively rather than reading a fixed list, modelled on iam-route-inventory. Return defects to the owning task rather than adjusting the test.",
        ("CONF-IDEM-005",),
        (
            "tests/integration/",
            "tests/security/",
            "docs/04-uat/",
        ),
        (
            "Each of the nine commands is proven idempotent under genuinely parallel submission creating exactly one record",
            "The concurrency test fails if the database UNIQUE constraint is removed",
            "The regression guard discovers create-type commands rather than reading a fixed list",
            "A temporary unprotected create command makes the guard fail with file controller and method detail",
            "Client-side key stability is covered end to end for at least one browser surface",
            "Evidence is candidate-SHA-bound and states plainly whether it is hermetic or cloud-proven",
        ),
        "P0",
        "D",
        "idempotency-acceptance",
        ("GAP-CONF-01",),
        ("C4", "C6"),
    ),
)


EXPECTED_ROOTS = {
    "CONF-AUDIT-001",
    "CONF-IDEM-001",
    "CONF-EVENT-001",
    "CONF-DOC-001",
    "CONF-CODE-001",
    "CONF-STATE-001",
}


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
        if not item.gap_ids or not item.gates:
            errors.append(f"{item.task_id} is not traceable to a GAP and a gate")
        seen.add(item.task_id)

    roots = {item.task_id for item in TASKS if not item.depends_on}
    if roots != EXPECTED_ROOTS:
        errors.append(f"unexpected roots: {sorted(roots)}")

    # Every idempotency endpoint task must be gated by the semantics decision;
    # three workers inventing three replay semantics is the failure this prevents.
    for item in TASKS:
        if item.workstream.startswith("idempotency-") and item.task_id not in (
            "CONF-IDEM-001",
        ):
            if "CONF-IDEM-001" not in _transitive_deps(item.task_id):
                errors.append(f"{item.task_id} does not depend on CONF-IDEM-001")

    if errors:
        raise RuntimeError(
            "Invalid contract conformance task graph:\n- " + "\n- ".join(errors)
        )


def _transitive_deps(task_id: str) -> set[str]:
    by_id = {item.task_id: item for item in TASKS}
    resolved: set[str] = set()
    pending = list(by_id[task_id].depends_on)
    while pending:
        current = pending.pop()
        if current in resolved or current not in by_id:
            continue
        resolved.add(current)
        pending.extend(by_id[current].depends_on)
    return resolved


def metadata_for(item: Task) -> dict[str, object]:
    return {
        "planning_ref": GAP_REF,
        "execution_ref": EXECUTION_REF,
        "priority": item.priority,
        "wave": item.wave,
        "workstream": item.workstream,
        "task_class": item.task_class,
        "gap_ids": list(item.gap_ids),
        "completion_gates": list(item.gates),
        "contract_conformance": True,
        "mutates_canonical": True,
        "required_acceptance": list(item.required_acceptance),
        "registered_by": "dispatch-phase1-contract-conformance-20260817.py",
    }


def register(item: Task) -> None:
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["AI_STATUS_ROOT"] = str(STATUS_ROOT)
    env["ORCH_STATUS_ROOT"] = str(STATUS_ROOT)
    env.update(
        {
            "TASK_PHASE": PHASE,
            "TASK_TITLE": item.title,
            "TASK_SUMMARY_ZH": (
                f"[GAP: {GAP_REF}; Execution: {EXECUTION_REF}] {item.summary}"
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
        f"Validated {len(TASKS)} contract conformance tasks; "
        f"status_root={STATUS_ROOT}; roots={','.join(roots)}"
    )
    for item in TASKS:
        deps = ",".join(item.depends_on) or "<root>"
        print(
            f"{item.task_id:16s} P={item.priority} W={item.wave} "
            f"{item.owner:7s}->{item.reviewer:7s} "
            f"gap={'/'.join(item.gap_ids):24s} deps={deps}"
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
