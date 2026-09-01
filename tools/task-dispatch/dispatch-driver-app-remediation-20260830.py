#!/usr/bin/env python3
"""Register the 2026-08-30 driver-app remediation DAG for supervisor execution.

This script writes machine truth only through the canonical ai-status command.
It does not start workers itself; the supervisor dispatches dependency-ready
tasks into isolated worktrees.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-driver-app-remediation-20260830.py --dry-run
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-driver-app-remediation-20260830.py
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-driver-app-remediation-20260830.py --allow-existing
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PHASE = "driver-app-remediation-20260830"
GAP_REF = "driver-app-issue-list-20260830"
EXECUTION_REF = "docs/03-runbooks/driver-app-remediation-tasks-20260830.md"


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
    # ---------------- Wave A: structural + foundation, disjoint file sets ----------------
    Task(
        "DRV-NAV-001",
        "Claude",
        "Codex2",
        "Bottom tab bar in the root navigator, present on every screen",
        "app/_layout.tsx uses a bare expo-router Stack (line 98) and renders no tab bar at all, so the five main destinations only exist as stack screens and nothing persists across navigation. Restructure to a router-level tab group so 工作台/任務/行程/平台/設定 are the five tabs and every existing screen -- including detail and sub-screens -- renders inside it. Each tab keeps its own navigation stack and its own scroll/route state across tab switches. This task MOVES route files, so it is the structural prerequisite for every other screen task in this phase: land it first and keep it purely structural. Do not change copy, styling, or business logic here; those belong to DRV-TEXT-001 and DRV-RWD-001.",
        (),
        (
            "apps/driver-app/app/",
            "apps/driver-app/components/",
            "apps/driver-app/lib/driver-navigation.ts",
            "apps/driver-app/tests/unit/",
        ),
        (
            "The five tabs 工作台/任務/行程/平台/設定 are declared once in the root navigator, not per screen",
            "Every route that existed before this change is still reachable and renders inside the tab shell",
            "Entering a sub-screen from any tab keeps the tab bar visible and the correct tab marked active",
            "Switching tabs and returning preserves the prior tab's navigation stack and scroll position",
            "The bar is fixed to the bottom, does not scroll with content, and content reserves bottom inset so nothing is occluded",
            "iOS Home Indicator and Android system navigation insets are honoured via safe-area insets, not hardcoded padding",
            "A test asserts the tab bar renders for a sub-screen route, so a future screen cannot silently drop it",
            "No user-visible copy and no business logic changed by this task",
        ),
        "P1", "A", "navigation-shell", ("DRIVER-APP-ISSUE-6",), ("tabbar-always-present",),
    ),
    Task(
        "DRV-AUTH-001",
        "Codex",
        "Claude2",
        "One token lifecycle: storage, restore, single-flight refresh, global 401/403",
        "lib/api-client.ts refreshes the driver device session only inside startup hydration (line 433). There is no per-request refresh on expiry and no concurrency control, so N in-flight calls hitting an expired access token each race their own refresh and can clobber each other's rotated refresh token. isDriverSessionAuthFailure exists at line 226 but there is no single global policy for what 401 versus 403 means. Make one module the sole authority for read/write/refresh/clear of the session, with a single-flight refresh that concurrent callers await rather than duplicate. Define and apply one global outcome policy: 401 retries once after a successful refresh then logs out; 403 never triggers refresh and never logs out. On refresh failure clear the session and every protected cache. This task owns the lib layer only -- route guards are DRV-AUTH-002.",
        (),
        (
            "apps/driver-app/lib/api-client.ts",
            "apps/driver-app/lib/driver-identity-bootstrap.ts",
            "apps/driver-app/tests/unit/driver-auth-states.test.ts",
            "apps/driver-app/tests/unit/",
        ),
        (
            "Exactly one module reads, writes, refreshes and clears the stored session; no other call site touches SecureStore session keys",
            "A test drives N concurrent requests against an expired access token and asserts exactly one refresh call is made and all N succeed",
            "A rotated refresh token is persisted before any waiter resumes, so no waiter reuses a consumed token",
            "401 is retried once after refresh; a second 401 clears the session; 403 neither refreshes nor logs out and surfaces a permission message",
            "Refresh failure clears the stored session, the in-memory session, and protected cached data in one path",
            "App restart with a valid stored session restores identity without a network round trip being required to render",
            "Backgrounding, foregrounding, and network loss/regain are covered by tests and do not leave a half-authenticated state",
            "No token, refresh token or device secret is written to logs; existing redaction at api-client.ts:108-116 still covers every new log site",
        ),
        "P0", "A", "auth-token-lifecycle", ("DRIVER-APP-ISSUE-2",), ("no-silent-auth-drift",),
    ),
    Task(
        "BE-DRV-AUTHZ-001",
        "Codex2",
        "Claude",
        "Prove the API enforces driver authorization server-side",
        "Requirement 2 states the backend must actually verify permission rather than relying on the app hiding features. Audit every driver-facing endpoint -- driver-profile, driver-settings, driver-sos, incident, platform-presence, safety-operator and the driver routes of trip/job modules -- and establish for each whether an unauthenticated request and a wrong-driver authenticated request are both rejected at the server. Fix what is missing. Report findings as a table of endpoint versus enforcement rather than a prose summary. Do not weaken any existing guard, and do not change driver-app code in this task.",
        (),
        (
            "apps/api/src/modules/driver-profile/",
            "apps/api/src/modules/driver-settings/",
            "apps/api/src/modules/driver-sos/",
            "apps/api/src/modules/auth/",
            "apps/api/tests/",
            "tests/security/",
        ),
        (
            "Every driver-facing endpoint is enumerated with its current guard, in a table committed to the repo",
            "An unauthenticated request to each protected endpoint is rejected with 401 and a test asserts it",
            "An authenticated driver requesting another driver's resource is rejected with 403 and a test asserts it",
            "Enforcement is derived from the route/guard registration at runtime, not a hand-maintained list, so a new endpoint cannot be added unguarded without failing the test",
            "Any endpoint found unguarded is fixed in this task, not deferred",
            "No apps/driver-app file is modified by this task",
        ),
        "P0", "A", "auth-server-enforcement", ("DRIVER-APP-ISSUE-2",), ("no-silent-auth-drift",),
    ),

    # ---------------- Wave B: screen work, after the navigation shell lands ----------------
    Task(
        "DRV-KBD-001",
        "Claude2",
        "Codex",
        "Keyboard avoidance on every input screen except the SOS pair",
        "There is currently no KeyboardAvoidingView and no keyboardShouldPersistTaps anywhere in apps/driver-app/app or components -- the behaviour is simply absent, not merely wrong. Give every screen that has a text input a shared keyboard-avoiding scroll container so the focused field, and the next control after it, stay visible. Handle iOS and Android separately: iOS needs padding behaviour against the keyboard frame, Android needs the windowSoftInputMode and inset behaviour that matches the tab shell from DRV-NAV-001. The tab bar and any bottom action button must not be occluded when the keyboard is open. app/sos.tsx and app/incident.tsx are OUT OF SCOPE and owned by DRV-SOS-001 -- do not edit them.",
        ("DRV-NAV-001",),
        (
            "apps/driver-app/app/",
            "apps/driver-app/components/",
            "apps/driver-app/tests/unit/",
        ),
        (
            "One shared keyboard-avoiding container is used by every in-scope input screen rather than per-screen ad hoc handling",
            "With the keyboard open the focused field and the control that follows it are both visible, with visible spacing between field and keyboard",
            "Dismissing the keyboard restores the layout with no residual offset or stranded scroll position",
            "Long forms scroll to their end while the keyboard is open",
            "iOS and Android paths are both implemented and each is exercised by a test",
            "The bottom tab bar and any bottom submit button are not occluded by the keyboard",
            "app/sos.tsx and app/incident.tsx are unmodified by this task",
        ),
        "P1", "B", "keyboard-avoidance", ("DRIVER-APP-ISSUE-1",), ("keyboard-never-occludes-focus",),
    ),
    Task(
        "DRV-SOS-001",
        "Codex2",
        "Claude",
        "SOS reports to the platform, never to the phone's emergency dialer",
        "app/sos.tsx:828 calls Linking.openURL('tel:...'), which is the OS emergency/dialer linkage the requirement says is wrong. Meanwhile app/incident.tsx already implements the intended flow -- typed situation, optional detail, 2-second press-and-hold (SOS_HOLD_DURATION_MS = 2000), submit to the platform -- and lib/driver-sos-outbox.ts already queues offline. The platform API already exists at apps/api/src/modules/driver-sos (@Controller('driver/sos-events')) with an ops alert channel at @Controller('ops/driver-sos'). So this is consolidation, not new construction: remove the OS linkage, converge the two screens onto one platform-reporting flow over the existing API, and make the status honest. A weak or lost network must never render as success -- only a platform acknowledgement may. Carry the required payload: situation and detail, driver/vehicle/device identity, current order and trip, send time, live location, network and delivery state, and a unique event id used for idempotent retry. This task owns app/sos.tsx, app/incident.tsx and lib/driver-sos-outbox.ts including their keyboard and layout behaviour.",
        ("DRV-NAV-001",),
        (
            "apps/driver-app/app/sos.tsx",
            "apps/driver-app/app/incident.tsx",
            "apps/driver-app/lib/driver-sos-outbox.ts",
            "apps/driver-app/lib/strings.ts",
            "apps/driver-app/tests/unit/",
        ),
        (
            "No Linking.openURL to tel:, and no OS emergency-SOS invocation, remains anywhere in apps/driver-app; a test pins this so it cannot return",
            "The six situations 乘客衝突/交通事故/車輛故障/醫療緊急/路線威脅/其他 are selectable and submitted as a typed value",
            "Submission requires a ~2 second press-and-hold; a shorter press submits nothing and a repeated hold cannot create a duplicate event",
            "The submitted payload carries situation, detail, driver/vehicle/device identity, current order and trip, send time, live location, network state and a unique event id",
            "Success state is rendered only on platform acknowledgement; a timeout, offline, or failed send renders as pending or failed and never as success",
            "Offline queueing shows its real state to the user, and replay is idempotent on the event id so the platform records one event",
            "An expired or invalid token surfaces an explicit, safe outcome; the send never fails silently",
            "Verification is end-to-end: the platform is shown to hold the event with correct situation, driver, trip, time and location -- an in-app success banner is not accepted as proof",
            "No internal identifier such as incident_category, passenger_conflict or press_and_hold_2s appears in any user-visible string",
        ),
        "P0", "B", "sos-platform-reporting", ("DRIVER-APP-ISSUE-5",), ("sos-reaches-platform",),
    ),
    Task(
        "DRV-AUTH-002",
        "Codex",
        "Claude2",
        "Route guards and feature entries agree with the server's answer",
        "With the token lifecycle owned by DRV-AUTH-001 and server enforcement proven by BE-DRV-AUTHZ-001, make the app's visible state agree with both. Today identity, route access, feature entry points and data queries are decided in several places, which is how a screen can look signed-in while its API calls are unauthorized. Route access and entry-point visibility must derive from the single session authority, and a screen must never render protected data it has not been authorized to fetch. Signing out or losing identity must clear protected caches and rendered data in the same path. Do not restyle or rewrite copy here.",
        ("DRV-NAV-001", "DRV-AUTH-001", "BE-DRV-AUTHZ-001"),
        (
            "apps/driver-app/app/_layout.tsx",
            "apps/driver-app/app/",
            "apps/driver-app/lib/driver-identity-routing.ts",
            "apps/driver-app/lib/driver-online-gate.ts",
            "apps/driver-app/tests/unit/",
        ),
        (
            "Route access and feature-entry visibility derive from the single session authority established by DRV-AUTH-001, with no second source of truth",
            "An unauthenticated session can reach no protected route and can render no protected data, asserted per protected route by a test",
            "An authenticated driver with permission can reach every feature they are entitled to; no entry point is hidden from a driver the server would allow",
            "Identity, permission, feature flags and rendered screen state are consistent -- a test asserts a screen cannot render protected data it was not authorized to fetch",
            "Sign-out and identity loss clear protected caches and rendered data in one path, verified after returning to a previously visited protected screen",
            "Network loss, network switch, and background/foreground return do not leave a screen showing stale protected data",
        ),
        "P0", "B", "auth-app-consistency", ("DRIVER-APP-ISSUE-2",), ("no-silent-auth-drift",),
    ),

    # ---------------- Wave C: sweeps over the settled code ----------------
    Task(
        "DRV-TEXT-001",
        "Claude",
        "Codex2",
        "Remove internal system and integration vocabulary from the UI",
        "Confirmed leaks: app/index.tsx renders Workspace sitemap, packet §5.3, Phase 1, CrossAppResourceLink, open_jobs, open_trip and open_settings; lib/strings.ts and app/sos.tsx carry passenger_conflict; app/safety-operator.tsx:1101 and :1165 label a field literally deviceId. Sweep every screen, card, modal, toast and error message and remove development, spec and debug wording. Where the information genuinely matters to a driver, rewrite it as a short plain sentence about what they can do -- do not merely shorten the jargon. No program identifier, API field, route name, feature flag or spec number may remain visible. Cover the normal, loading, empty, error, offline and insufficient-permission states of each screen, and make sure no build configuration can re-expose developer text in a release build. Change strings only: no layout restructuring, that is DRV-RWD-001.",
        ("DRV-NAV-001", "DRV-KBD-001", "DRV-SOS-001"),
        (
            "apps/driver-app/app/",
            "apps/driver-app/lib/strings.ts",
            "apps/driver-app/lib/operational-labels.ts",
            "apps/driver-app/components/",
            "apps/driver-app/tests/unit/",
        ),
        (
            "None of Workspace sitemap, packet §5.3, Phase 1, CrossAppResourceLink, open_jobs, open_trip, open_settings, incident_category, passenger_conflict or press_and_hold_2s reaches any user-visible string",
            "A test scans rendered user-facing strings for snake_case identifiers, PascalCase type names, section markers and spec numbers, and fails on a new one -- so this cannot regress",
            "Field labels name the thing in user language rather than the API field, including the deviceId labels at safety-operator.tsx:1101 and :1165",
            "Loading, empty, error, offline and insufficient-permission states of each screen are checked, not just the happy path",
            "Retained information is rewritten as a short actionable user sentence, and each rewrite is justified in the task result",
            "A release build cannot surface developer-only text through a configuration flag",
            "No layout structure or styling is changed by this task",
        ),
        "P1", "C", "user-facing-copy", ("DRIVER-APP-ISSUE-3",), ("no-internal-vocabulary",),
    ),
    Task(
        "DRV-RWD-001",
        "Codex2",
        "Claude",
        "Responsive layout across the device matrix, no overflow or clipping",
        "Run last, over the settled code. Long identifiers already overflow: safety-operator.tsx:1101 and :1165 and settings.tsx:634 and :642 render DeviceId and BindingId, and index.tsx, sos.tsx, onboarding.tsx and safety-operator.tsx use position:'absolute' with fixed widths and heights. Remove fixed sizing and absolute positioning that is not genuinely required, move to flexible wrapping layout, and give long identifiers a deliberate treatment -- wrap, truncate with the full value still obtainable, or offer copy. Titles, status chips, buttons and fields must stay inside their containers. Honour iOS Dynamic Type and Android font and display scaling, and check notch, Dynamic Island, rounded corners, status bar and safe areas. Verify across the device matrix in the runbook: effective widths near 320/360/375/393/402/412/430/440 dp/pt at 100%, 125%, 150% and maximum accessibility text size.",
        ("DRV-TEXT-001", "DRV-KBD-001", "DRV-AUTH-002"),
        (
            "apps/driver-app/app/",
            "apps/driver-app/components/",
            "apps/driver-app/lib/theme.ts",
            "apps/driver-app/tests/unit/",
            "docs/04-uat/",
        ),
        (
            "No unnecessary fixed width, fixed height or absolute positioning remains; each one kept is justified in the task result",
            "DeviceId and BindingId render without overflow at the narrowest supported width and the largest text scale, with the full value still obtainable by the user",
            "Titles, status chips, buttons and fields stay inside their containers with no overlap, clipping or unreasonable line breaks",
            "Every main screen is evidenced at the narrow, middle and wide widths of the runbook matrix on both iOS and Android",
            "100%, 125%, 150% and maximum accessibility text scale are each evidenced, and no control becomes unreachable at the largest size",
            "Safe area, notch, Dynamic Island, rounded corners and status bar are honoured, and the tab bar from DRV-NAV-001 is unaffected",
            "Keyboard-open, loading, error, empty and extreme-long-text states are included in the evidence, not only the default state",
            "Evidence is per screen per width, recorded under docs/04-uat/ -- a statement that it was checked is not accepted",
        ),
        "P1", "C", "responsive-layout", ("DRIVER-APP-ISSUE-4",), ("no-layout-overflow",),
    ),
)


EXPECTED_ROOTS = {"DRV-NAV-001", "DRV-AUTH-001", "BE-DRV-AUTHZ-001"}
VALID_AGENTS = {"Claude", "Claude2", "Codex", "Codex2"}


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
    for item in TASKS:
        if item.task_id in seen:
            errors.append(f"duplicate task id: {item.task_id}")
        if item.owner not in VALID_AGENTS or item.reviewer not in VALID_AGENTS:
            errors.append(
                f"{item.task_id} uses a lane outside the requested Claude/Codex set"
            )
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
            errors.append(f"{item.task_id} is not traceable to an issue and a gate")
        seen.add(item.task_id)

    roots = {item.task_id for item in TASKS if not item.depends_on}
    if roots != EXPECTED_ROOTS:
        errors.append(f"unexpected roots: {sorted(roots)}")

    covered = {gap for item in TASKS for gap in item.gap_ids}
    expected_gaps = {f"DRIVER-APP-ISSUE-{n}" for n in range(1, 7)}
    missing_gaps = sorted(expected_gaps - covered)
    if missing_gaps:
        errors.append("issues with no task: " + ", ".join(missing_gaps))

    if errors:
        raise RuntimeError(
            "Invalid driver-app remediation task graph:\n- " + "\n- ".join(errors)
        )


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
        "driver_app_remediation": True,
        "mutates_canonical": True,
        "required_acceptance": list(item.required_acceptance),
        "registered_by": "dispatch-driver-app-remediation-20260830.py",
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
                f"[Issue: {'/'.join(item.gap_ids)}; Execution: {EXECUTION_REF}] "
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
        )
        for observed, target, label in checks:
            if observed != target:
                errors.append(
                    f"{task_id} {label} mismatch: {observed!r} != {target!r}"
                )
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
        f"Validated {len(TASKS)} driver-app remediation tasks; "
        f"status_root={STATUS_ROOT}; phase={PHASE}"
    )
    print(f"roots (dispatchable immediately): {', '.join(roots)}")
    for item in TASKS:
        deps = ",".join(item.depends_on) or "<root>"
        print(
            f"{item.task_id:18s} P={item.priority} W={item.wave} "
            f"{item.owner:8s}->{item.reviewer:8s} "
            f"issue={'/'.join(item.gap_ids):22s} deps={deps}"
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
        "The supervisor may dispatch DRV-NAV-001, DRV-AUTH-001 and BE-DRV-AUTHZ-001 "
        "immediately; the rest wait on their dependencies."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
