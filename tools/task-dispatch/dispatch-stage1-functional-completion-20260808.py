#!/usr/bin/env python3
"""Register the Stage 1 functional-completion DAG for supervisor execution.

The script changes machine truth only through ``tools/development-orchestrator/bin/ai-status.sh``. It does
not start agents itself. The continuously running supervisor dispatches ready
tasks to isolated auto-worker branches.

Usage:
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py --dry-run
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py --allow-existing

Set ``AI_STATUS_ROOT`` when the canonical machine-truth checkout differs from
this source checkout.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
STATUS_ROOT = Path(
    os.environ.get("AI_STATUS_ROOT")
    or os.environ.get("ORCH_STATUS_ROOT")
    or REPO
).expanduser().resolve()
STATUS_FILE = STATUS_ROOT / "ai-status.json"
PHASE = "stage1-functional-completion-20260808"
GAP_REF = "docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md"
EXECUTION_REF = (
    "docs/03-runbooks/"
    "stage1-dev-functional-completion-execution-tasks-20260808.md"
)


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
    mutates_canonical: bool = False


def task(
    task_id: str,
    owner: str,
    reviewer: str,
    title: str,
    summary: str,
    depends_on: tuple[str, ...],
    artifacts: tuple[str, ...],
    acceptance: tuple[str, ...],
    priority: str,
    wave: str,
    workstream: str,
    *,
    task_class: str = "implementation",
    mutates_canonical: bool = False,
) -> Task:
    return Task(
        task_id=task_id,
        owner=owner,
        reviewer=reviewer,
        title=title,
        summary=summary,
        depends_on=depends_on,
        artifacts=artifacts,
        acceptance=acceptance,
        priority=priority,
        wave=wave,
        workstream=workstream,
        task_class=task_class,
        mutates_canonical=mutates_canonical,
    )


# Topological order is mandatory. Dependencies are registered before children
# so the supervisor never mistakes an unregistered dependency for completion.
TASKS = (
    task(
        "S1F-REF-001", "Claude2", "Codex2",
        "Wire the formal Referral booking form to the existing BFF",
        "Read the accepted Passenger Embed HTML and JSX canvas before editing. Replace fixture-only booking controls with semantic form state and submit the user's actual values through the existing referral create-booking BFF. Preserve the formal yuhe-residence entry and add validation pending success failure plus API readback evidence without redesigning the UI.",
        (),
        (
            "apps/referral-embed-web/components/",
            "apps/referral-embed-web/lib/",
            "apps/referral-embed-web/tests/",
            "docs/05-ui/drts-design-canvas/Passenger Embed.html",
            "docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx",
        ),
        (
            "Formal yuhe-residence entry creates a non-fixture booking ID",
            "Submitted values equal browser-entered values",
            "Refresh reads back the same booking",
            "Referral component tests typecheck build and browser test pass",
        ),
        "P0", "A", "referral",
    ),
    task(
        "S1F-ENT-001", "Codex2", "Claude2",
        "Replace Enterprise Dispatch static controls with a real booking form",
        "Read the complete Enterprise Dispatch HTML and JSX design sources before editing. Replace presentation-only EInput and segment controls with semantic form controls bound to live passenger address cost-centre quota and policy-preview data. Remove the deployed submit dependency on getEnterpriseBookingCommandFixture without redesigning the accepted canvas.",
        (),
        (
            "apps/enterprise-dispatch-web/app/bookings/new/",
            "apps/enterprise-dispatch-web/components/",
            "apps/enterprise-dispatch-web/lib/",
            "apps/enterprise-dispatch-web/tests/",
            "docs/05-ui/drts-design-canvas/Enterprise Dispatch.html",
            "docs/05-ui/drts-design-canvas/ent-screens-1.jsx",
            "docs/05-ui/drts-design-canvas/ent-embed-flow.jsx",
            "docs/05-ui/drts-design-canvas/ent-states.jsx",
        ),
        (
            "Every required field is keyboard and pointer editable",
            "Policy and quota preview follows actual draft values",
            "Production submit path does not use a command fixture",
            "Enterprise tests typecheck and build pass",
        ),
        "P0", "A", "enterprise",
    ),
    task(
        "S1F-FLT-001", "Gemini", "Codex",
        "Correct Fleet Portal Dev identity period and live-data truth",
        "Bind deployed Dev to the valid fleet partner identity and current period. Remove the flp_002 deployed fallback and healthy-API fixture substitution. Provide only the minimum current-period published fee-plan data required for trips and quality. Missing scope must render a configuration error instead of selecting a demo principal.",
        (),
        (
            "apps/fleet-partner-portal-web/lib/",
            "apps/fleet-partner-portal-web/app/",
            ".github/workflows/deploy-dev.yml",
            "infra/",
            "tests/e2e/",
            "docs/05-ui/drts-design-canvas/Fleet Partner Portal.html",
        ),
        (
            "Dev dashboard does not claim design sample data is active",
            "All fleet reads use one valid fleet and the current period",
            "Trips and quality do not fail because of a hard-coded old period",
            "Missing fleet scope fails visibly and focused tests pass",
        ),
        "P0", "A", "fleet-data",
    ),
    task(
        "S1F-BANK-001", "Gemini2", "Claude",
        "Replace Bank Console static arrays with scoped Dev read models",
        "Read the complete Bank Console HTML and JSX canvases before editing. Add a server-side API client and replace fixed June 2026 dashboard booking programme contract statement user and audit arrays with scoped Dev reads. Use the current period and honest loading empty forbidden and degraded states. Do not re-enable Partner Booking.",
        (),
        (
            "apps/bank-console-web/app/",
            "apps/bank-console-web/lib/",
            "apps/bank-console-web/tests/",
            "docs/05-ui/drts-design-canvas/Bank Console.html",
            "docs/05-ui/drts-design-canvas/bank-screens-1.jsx",
            "docs/05-ui/drts-design-canvas/bank-screens-2.jsx",
            "docs/05-ui/drts-design-canvas/bank-screens-3.jsx",
        ),
        (
            "Displayed IDs and totals reconcile with direct API readback",
            "Healthy API paths contain no operational fixture rows",
            "Bank and role switching cannot cross scope",
            "Bank loader tests typecheck and build pass",
        ),
        "P1", "A", "bank",
    ),
    task(
        "S1F-ADM-002", "Claude", "Codex2",
        "Remove Platform Admin false fallbacks and inert operational actions",
        "Read the matching Platform Admin canvas before each UI change. Replace partner reimbursement and fleet route-local operational fixtures with explicit loading empty forbidden and degraded states. Wire backend-supported Stage 1 actions and disable or remove controls that only report that an endpoint is not connected.",
        (),
        (
            "apps/platform-admin-web/app/partners/",
            "apps/platform-admin-web/app/payments/reimbursements/",
            "apps/platform-admin-web/app/fleet/",
            "apps/platform-admin-web/lib/",
            "apps/platform-admin-web/tests/",
            "docs/05-ui/drts-design-canvas/Platform Admin.html",
        ),
        (
            "API failure never renders plausible operational fixture rows",
            "No enabled action displays a not-wired alert",
            "Unsupported actions are disabled or absent",
            "Platform route permission typecheck and build gates pass",
        ),
        "P1", "A", "platform-truth",
    ),
    task(
        "S1F-DRV-001", "Gemini2", "Codex",
        "Replay the current-SHA Android Driver journey",
        "Run the accepted Driver App flow on an Android emulator against the current Dev candidate. Prove login and bind task view accept start complete reconnect readback and SOS while preserving unsynchronised offline proof. Record the exact app and API SHA. Do not add iOS or public store-distribution scope.",
        (),
        (
            "apps/driver-app/",
            "tests/e2e/",
            "docs/04-uat/",
            "docs/05-ui/drts-design-canvas/Driver App.html",
            "docs/05-ui/drts-design-canvas/driver-screens-1.jsx",
            "docs/05-ui/drts-design-canvas/driver-sos.jsx",
        ),
        (
            "Current candidate completes login accept start complete reconnect and SOS",
            "Completed trip and SOS have operator or API readback",
            "Evidence records exact app and API SHA",
            "No mobile distribution requirement is introduced",
        ),
        "P1", "A", "driver", task_class="verification",
    ),
    task(
        "S1F-REF-002", "Claude2", "Codex2",
        "Complete Referral active history cancel rating and receipt lifecycle",
        "Consume the route-provided liveData for operational screens and wire the existing active history cancel rating and receipt BFF calls. Preserve formal partner scope and handoff sessions. Implement pending success empty expired forbidden and failure states according to the accepted Passenger Embed canvas.",
        ("S1F-REF-001",),
        (
            "apps/referral-embed-web/components/",
            "apps/referral-embed-web/app/api/referral/",
            "apps/referral-embed-web/lib/",
            "apps/referral-embed-web/tests/",
            "docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx",
            "docs/05-ui/drts-design-canvas/pe-fallback.jsx",
        ),
        (
            "Create refresh cancel journey has API readback",
            "Completed trip rating and receipt journey has API readback",
            "Operational screens do not derive booking state from fixtures",
            "Existing handoff allowlist and app gates stay green",
        ),
        "P0", "B", "referral",
    ),
    task(
        "S1F-ENT-002", "Codex2", "Claude2",
        "Complete Enterprise booking create read update and cancel lifecycle",
        "Submit the user's real draft through the existing tenant booking command API and read the result through history and detail. Implement supported update and cancel plus policy quota no-supply and degraded states according to the accepted Enterprise canvas.",
        ("S1F-ENT-001",),
        (
            "apps/enterprise-dispatch-web/app/bookings/",
            "apps/enterprise-dispatch-web/components/",
            "apps/enterprise-dispatch-web/lib/",
            "apps/enterprise-dispatch-web/tests/",
            "docs/05-ui/drts-design-canvas/ent-screens-1.jsx",
            "docs/05-ui/drts-design-canvas/ent-screens-2.jsx",
            "docs/05-ui/drts-design-canvas/ent-states.jsx",
        ),
        (
            "Browser create read update cancel passes with one booking ID",
            "Persisted values equal browser input before and after update",
            "Policy quota no-supply and degraded states are explicit",
            "Enterprise app and focused lifecycle gates pass",
        ),
        "P0", "B", "enterprise",
    ),
    task(
        "S1F-FLT-002", "Claude2", "Codex2",
        "Build Fleet supply onboarding and submission UI",
        "Read the Fleet Portal canvas supply JSX and accepted screen-requirements document before editing. Build supply dashboard driver and vehicle create document upload submission list/detail submit withdraw and revision/resubmit against the already implemented fleet-partner APIs. Do not invent a new visual design or a second backend state machine.",
        ("S1F-FLT-001",),
        (
            "apps/fleet-partner-portal-web/app/supply/",
            "apps/fleet-partner-portal-web/components/",
            "apps/fleet-partner-portal-web/lib/",
            "apps/fleet-partner-portal-web/tests/",
            "docs/05-ui/drts-design-canvas/fleet-supply.jsx",
            "docs/05-ui/fleet-partner-portal-supply-onboarding-screen-requirements-20260619.md",
        ),
        (
            "Fleet user creates uploads submits and reads back one submission",
            "Pre-approval submission does not enter canonical supply",
            "Withdraw and revision resubmit transitions pass",
            "Fleet UI matches supplied designs and app gates pass",
        ),
        "P0", "B", "fleet-supply",
    ),
    task(
        "S1F-FLT-003", "Gemini", "Codex",
        "Wire Fleet statement document and case actions",
        "Read the Fleet Portal HTML and fleet-screens JSX before changing controls. Wire existing statement download confirm and dispute plus Stage 1 document and case actions. Extend or replace presentation-only action buttons with real handlers and request states. Disable unsupported remind upload respond or training actions instead of pretending they work.",
        ("S1F-FLT-001",),
        (
            "apps/fleet-partner-portal-web/app/statements/",
            "apps/fleet-partner-portal-web/app/documents/",
            "apps/fleet-partner-portal-web/app/cases/",
            "apps/fleet-partner-portal-web/components/",
            "apps/fleet-partner-portal-web/tests/",
            "docs/05-ui/drts-design-canvas/fleet-screens.jsx",
        ),
        (
            "Every enabled action causes a request download or navigation",
            "Unavailable actions are disabled with a clear reason",
            "Statement changes survive refresh and remain fleet scoped",
            "Fleet focused tests typecheck and build pass",
        ),
        "P1", "B", "fleet-actions",
    ),
    task(
        "S1F-BANK-002", "Gemini2", "Claude",
        "Complete Bank statement downloads and minimum role actions",
        "Implement the existing statement artifact and download path plus only the read and export actions defined by the accepted Bank Console canvas. Preserve masked PII and server-enforced role scope. Disable unsupported mutations and do not link to or re-enable paused Partner Booking.",
        ("S1F-BANK-001",),
        (
            "apps/bank-console-web/app/statements/",
            "apps/bank-console-web/lib/",
            "apps/bank-console-web/tests/",
            "docs/05-ui/drts-design-canvas/Bank Console.html",
            "docs/05-ui/drts-design-canvas/bank-screens-2.jsx",
        ),
        (
            "Current-period statement downloads a non-fixture artifact",
            "Unauthorised roles cannot export",
            "Unsupported mutations are not enabled",
            "Partner Booking remains paused and app gates pass",
        ),
        "P1", "B", "bank",
    ),
    task(
        "S1F-ADM-001", "Codex2", "Claude2",
        "Build Platform Admin supply review queue and detail",
        "Read platform-supply-review JSX and the accepted screen-requirements document before editing. Build the review queue and detail with existing list detail start review request revision approve and reject APIs. Show document comparison actor reason and result. Approval must be the only transition that provisions canonical supply.",
        ("S1F-FLT-002",),
        (
            "apps/platform-admin-web/app/supply-review/",
            "apps/platform-admin-web/lib/",
            "apps/platform-admin-web/tests/",
            "docs/05-ui/drts-design-canvas/platform-supply-review.jsx",
            "docs/05-ui/platform-admin-supply-review-screen-requirements-20260619.md",
        ),
        (
            "Browser completes revision and approval for one fleet submission",
            "Approval alone provisions canonical registry",
            "Wrong role and scope attempts are denied by the server",
            "Platform Admin focused tests typecheck and build pass",
        ),
        "P0", "C", "platform-supply",
    ),
    task(
        "S1F-CHAN-001", "Gemini", "Codex",
        "Bind Channel Partner Portal to the formal Yuhe identity",
        "Resolve the canonical Dev partner tenant programme and entry IDs for yuhe-residence and inject all four values during Channel Portal deployment. Deployed Dev must fail visibly when formal configuration is absent rather than falling back to referral-demo-community. Reconcile a formal Referral booking through the same partner usage and statement read model.",
        ("S1F-REF-002",),
        (
            "apps/channel-partner-portal-web/lib/",
            "apps/channel-partner-portal-web/tests/",
            ".github/workflows/deploy-dev.yml",
            "tests/e2e/",
        ),
        (
            "Channel response evidence reports yuhe-residence",
            "Formal Referral booking appears in the same partner usage model",
            "No demo partner data appears in deployed Dev",
            "Partner boundary deployment and focused tests pass",
        ),
        "P1", "C", "channel",
    ),
    task(
        "S1F-UIX-001", "Claude2", "Codex",
        "Add release-blocking cross-surface operational browser acceptance",
        "Create a deterministic deployed-browser suite that performs every Stage 1 create read update cancel submit approve download and downstream-read journey rather than checking visible markers. Assert backend IDs and state after every operation. Fail on enabled inert controls or fixture leakage and prove Partner Booking plus Concierge remain 404.",
        (
            "S1F-REF-002",
            "S1F-ENT-002",
            "S1F-FLT-003",
            "S1F-ADM-001",
            "S1F-ADM-002",
            "S1F-BANK-002",
            "S1F-CHAN-001",
        ),
        (
            "tests/e2e/",
            "tests/smoke/",
            "scripts/",
            "docs/04-uat/",
        ),
        (
            "All formal cross-surface journeys pass against one candidate SHA",
            "Every mutation records API or database readback",
            "Fixture leakage and enabled inert controls fail the suite",
            "Paused Partner Booking and retired Concierge return 404",
        ),
        "P0", "D", "acceptance", task_class="verification",
    ),
    task(
        "S1F-REL-001", "Gemini", "Claude",
        "Integrate and deploy one verified Stage 1 functional candidate",
        "Integrate only independently reviewed S1F commits in dependency order. Run the existing CI 22 API E2E 39-route suite Driver evidence and the operational browser suite. Deploy exactly that candidate SHA once through the normal Dev workflow and rerun the functional journeys plus paused-surface checks against deployed URLs.",
        ("S1F-UIX-001", "S1F-DRV-001"),
        (
            ".github/workflows/",
            "scripts/",
            "tests/e2e/",
            "tests/smoke/",
            "docs/04-uat/",
        ),
        (
            "All reviewed dependency commits are reachable from candidate dev",
            "CI API route native and operational suites pass",
            "Deployed revisions and evidence identify the exact candidate SHA",
            "All GAP completion gates G1 through G8 pass",
        ),
        "P0", "E", "release", task_class="release", mutates_canonical=True,
    ),
    task(
        "S1F-DOC-001", "Codex2", "Claude",
        "Publish final Stage 1 functional truth and active URL matrix",
        "Update the functional GAP with each closeout commit run URL and evidence. Reconcile the active URL inventory and remove Concierge plus paused Partner Booking from active-service claims. Remove stale fixture preview and false completion wording and publish the operator matrix of URL role supported operations and external gate.",
        ("S1F-REL-001",),
        (
            "docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md",
            "docs/02-architecture/app-entry-url-index-20260616.md",
            "docs/03-runbooks/",
            "docs/04-uat/",
            "CANONICAL_DOCUMENT_MAP.md",
        ),
        (
            "Every functional GAP is closed or explicitly external or deferred",
            "Active URL documentation matches deployed inventory",
            "Completion wording matches implemented and live-proven evidence",
            "Documentation link and consistency checks pass",
        ),
        "P1", "E", "documentation", task_class="documentation",
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
    seen: set[str] = set()
    errors: list[str] = []
    valid_agents = {"Claude", "Claude2", "Gemini", "Gemini2", "Codex", "Codex2"}
    for item in TASKS:
        if item.task_id in seen:
            errors.append(f"duplicate task id: {item.task_id}")
        if item.owner not in valid_agents or item.reviewer not in valid_agents:
            errors.append(f"unsupported lane on {item.task_id}")
        if item.owner == item.reviewer:
            errors.append(f"owner equals reviewer on {item.task_id}")
        missing_or_late = [dep for dep in item.depends_on if dep not in seen]
        if missing_or_late:
            errors.append(
                f"{item.task_id} dependencies are missing or not topological: "
                + ", ".join(missing_or_late)
            )
        if not item.artifacts or not item.acceptance:
            errors.append(f"{item.task_id} has incomplete execution details")
        seen.add(item.task_id)
    expected_roots = {
        "S1F-REF-001",
        "S1F-ENT-001",
        "S1F-FLT-001",
        "S1F-BANK-001",
        "S1F-ADM-002",
        "S1F-DRV-001",
    }
    actual_roots = {item.task_id for item in TASKS if not item.depends_on}
    if actual_roots != expected_roots:
        errors.append(f"unexpected roots: {sorted(actual_roots)}")
    if errors:
        raise RuntimeError("Invalid Stage 1 functional task graph:\n- " + "\n- ".join(errors))


def metadata_for(item: Task) -> dict[str, object]:
    return {
        "planning_ref": GAP_REF,
        "execution_ref": EXECUTION_REF,
        "priority": item.priority,
        "wave": item.wave,
        "workstream": item.workstream,
        "task_class": item.task_class,
        "functional_completion": True,
        "minimal_security_scope": True,
        "release_gate": item.priority == "P0" or item.task_id.startswith("S1F-REL"),
        "mutates_canonical": item.mutates_canonical,
        "registered_by": "dispatch-stage1-functional-completion-20260808.py",
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
                f"[GAP: {GAP_REF}; Execution: {EXECUTION_REF}] {item.summary}"
            ),
            "TASK_DEPENDS_ON": ",".join(item.depends_on),
            "TASK_ARTIFACTS": ",".join(item.artifacts),
            "TASK_ACCEPTANCE": ",".join(item.acceptance),
            "TASK_METADATA_JSON": json.dumps(metadata_for(item), ensure_ascii=False),
            "TASK_MUTATES_CANONICAL": "true" if item.mutates_canonical else "false",
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
    actual = load_existing_tasks()
    missing = sorted(expected_ids - actual.keys())
    if missing:
        raise RuntimeError("Tasks missing after registration: " + ", ".join(missing))
    expected_by_id = {item.task_id: item for item in TASKS}
    valid_agents = {"Claude", "Claude2", "Gemini", "Gemini2", "Codex", "Codex2"}
    errors: list[str] = []
    for task_id in sorted(expected_ids):
        expected = expected_by_id[task_id]
        current = actual[task_id]
        checks = (
            (tuple(current.get("depends_on") or ()), expected.depends_on, "dependencies"),
            (current.get("priority"), expected.priority, "priority"),
            (current.get("phase"), PHASE, "phase"),
        )
        for actual_value, expected_value, field in checks:
            if actual_value != expected_value:
                errors.append(f"{task_id} {field} mismatch")
        if not current.get("artifacts") or not current.get("acceptance"):
            errors.append(f"{task_id} missing artifacts or acceptance")
        owner = str(current.get("owner") or "")
        reviewer = str(current.get("reviewer") or "")
        if owner not in valid_agents or reviewer not in valid_agents or owner == reviewer:
            errors.append(f"{task_id} has invalid owner/reviewer routing")
    if errors:
        raise RuntimeError("Materialized task verification failed:\n- " + "\n- ".join(errors))


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
        help="Skip existing task IDs after verifying their materialized fields.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_graph()
    roots = [item.task_id for item in TASKS if not item.depends_on]
    print(f"Validated {len(TASKS)} functional tasks; roots={','.join(roots)}")
    for item in TASKS:
        deps = ",".join(item.depends_on) or "<root>"
        print(
            f"{item.task_id:16s} P={item.priority} W={item.wave} "
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
        "The supervisor may dispatch dependency-ready roots."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
