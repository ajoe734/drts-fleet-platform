#!/usr/bin/env python3
"""Dispatch the Pack-Delta tasks (BE delta + tests/gate) to the supervisor.

This is the follow-up materialization to PR #285 (`UI-IMPL-WAVE-PLAN-001`)
and PR #286 (`UI-IMPL-WAVE-DISPATCH-001` — 90 task registration). PR #288
landed the 12 system-design docs.

This script registers 11 additional tasks that the original wave plan did
not explicitly enumerate but the 2026-05-24 pack (`docs/03-runbooks/
system-design-pack-implementation-runbook-20260524.md` PR3+PR5) requires:

- 7 BE delta tasks (UI-BE-009 .. UI-BE-015) covering pack endpoints the
  wave missed: /api/admin/health/ui, tenant rollout-state RPC pair, driver
  summary endpoints, notification archive/summary extensions, pricing
  publish per pack §state machine, DriverMatchingSuppression standalone
  module, and availableActions ADR enforcement audit.
- 4 test/gate tasks (UI-TEST-001..003, UI-GATE-001) covering pack PR5:
  contract serialization unit tests, per-app integration tests for the
  three load-bearing contracts, regression test that disabled descriptors
  prevent mutation, and release-gate matrix update.

The script directly mutates ai-status.json (idempotent: re-running updates
existing tasks in place). We bypass `scripts/ai-status.sh assign` because
the supervisor sync path on origin/dev has a known KeyError bug on
blockers missing the `message` field (fix is OPS-STATUS-BLOCKER-FALLBACK,
unmerged at time of writing). Direct mutation matches the task schema
emitted by `scripts/ai_status.py::command_assign`.

Source:
- docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md
- docs/02-architecture/ui-authority-actions-contract-20260524.md §8 ADR PACK-LAND-202605
- docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md §8
- docs/02-architecture/notification-inbox-contract-20260524.md §4
- docs/02-architecture/driver-platform-binding-and-offline-contract-20260524.md §7
- docs/04-api/ui-functional-contracts-20260524.md §4

Owner notes:
- Pack-delta tasks default to Codex / Codex2 sub-lanes (70% workload share
  per feedback_agent_workload_ratio.md). Gemini is NOT used for backend
  endpoint work in this batch because the wave already has 3 Gemini-owned
  tasks starved (UI-BE-002, UI-BE-008, UI-CL-005); see PR description.

Usage::

    python3 scripts/dispatch-pack-delta-tasks.py
"""
from __future__ import annotations

import datetime as _dt
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
AI_STATUS_PATH = REPO / "ai-status.json"
PHASE = "phase1-ui-implementation-wave-202605"
PLANNING_REF = (
    "docs/03-runbooks/system-design-pack-implementation-runbook-20260524.md"
)


# ---------------------------------------------------------------------------
# Task data — Batch 2 (BE delta — 7 tasks)
# ---------------------------------------------------------------------------
# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv,
#              artifacts_csv, acceptance_text)
# ---------------------------------------------------------------------------

BE_DELTA_TASKS = [
    (
        "UI-BE-009-HEALTH-UI",
        "Codex",
        "Codex2",
        "GET /api/admin/health/ui returns UiHealthEnvelope (Pack realtime §5)",
        "Pack realtime-data-model-20260524.md §5 列出 /api/admin/health/ui 為 platform-admin chrome health summary。與 UI-BE-002 (/api/health) 平行：UI-BE-002 為 generic dependency health，本 task 為 platform-admin scoped 的 chrome health envelope（含 admin-specific indicators：rollout governance pending count、partner credential expiring count、adapter unhealthy count）。",
        "UI-BE-002",
        "apps/api/src/modules/platform-admin/",
        "GET /api/admin/health/ui returns UiHealthEnvelope; indicators[] populated with admin-scoped keys (rollout_pending, partner_credentials_expiring, adapters_unhealthy); blockers[] populated when relevant; vitest covers healthy + degraded + unhealthy states",
    ),
    (
        "UI-BE-010-ROLLOUT-RPC",
        "Codex2",
        "Claude2",
        "Tenant rollout RPC pair: GET rollout-state + POST rollout/advance (Pack platform-admin §8)",
        "Pack platform-admin-control-plane-state-machines-20260524.md §8 列出 GET /api/admin/tenants/{tenantId}/rollout-state 與 POST /api/admin/tenants/{tenantId}/rollout/advance。現行 UI-BE-006 雖實作 state machine，但 RPC 介面只有 POST tenants/:id/rollout 與 POST tenants/:id/rollback-hold。需新增 GET ...rollout-state（讀 TenantRolloutStateMachineRecord）與 POST .../rollout/advance（含 actor / version diff / reason / nextStage 並 emit ActionReceipt）。",
        "UI-BE-006,UI-BE-001",
        "apps/api/src/modules/platform-admin/tenants.controller.ts,apps/api/src/modules/tenant-rollout/",
        "GET /api/admin/tenants/{tenantId}/rollout-state returns TenantRolloutStateMachineRecord (incl. gates + nextActions + rollback); POST .../rollout/advance accepts target stage + reason + evidence refs, returns ActionReceipt; vitest covers all 4 stages × 4 gate transitions + rejection on invalid transition",
    ),
    (
        "UI-BE-011-DRIVER-SUMMARY",
        "Codex",
        "Codex2",
        "Driver summary endpoints: /api/driver/workspace/summary + /api/driver/platform-presence/summary (Pack realtime §5)",
        "Pack realtime-data-model-20260524.md §5 列出兩個 driver summary endpoint。/api/driver/workspace/summary 回傳 task counts by state + active trip ref + outstanding DriverOpsInstruction count + UiRefreshMetadata。/api/driver/platform-presence/summary 回傳 binding states per platform + matching suppression count + UiHealthEnvelope。皆為 fast tier 3-5s polling 來源。",
        "UI-BE-007-DSP,UI-BE-008",
        "apps/api/src/modules/driver-app/,apps/api/src/modules/platform-presence/",
        "Both endpoints return correct contract envelopes with UiRefreshMetadata; counts derived from existing read models (no new schema); vitest covers stale vs fresh; pact with apps/driver-app fixtures",
    ),
    (
        "UI-BE-012-NOTIF-EXT",
        "Codex2",
        "Claude",
        "Notification inbox extensions: archive + summary endpoints (Pack notification-inbox §4)",
        "Pack notification-inbox-contract-20260524.md §4 列出 POST /api/notifications/archive 與 GET /api/notifications/summary。現行 UI-BE-003 已實作 GET /api/notifications + POST /read + POST /read-bulk，但缺 archive (UserNotificationStatus='archived') 與 summary (unread counts by severity + channel)。",
        "UI-BE-003",
        "apps/api/src/modules/audit-notification/notifications.controller.ts",
        "POST /api/notifications/archive accepts ids array + transitions status to 'archived'; GET /api/notifications/summary returns unread count by severity + channel; vitest covers idempotent archive + summary aggregation",
    ),
    (
        "UI-BE-013-PRICING-PUBLISH",
        "Codex",
        "Codex2",
        "Pricing publish state machine + ActionReceipt (Pack platform-admin §5)",
        "Pack platform-admin-control-plane-state-machines-20260524.md §5 規範 pricing publish state machine: draft → review_required → scheduled → published → superseded / rollback_hold。Publish 必須帶 actor / version diff / effective time / reason + audit receipt。現行 /platform-admin/pricing-rules/:ruleId/publish 路徑不同且未回 ActionReceipt。本 task 在 architecture doc 註明 alias OR 新增 /api/admin/pricing/{versionId}/publish 並回 ActionReceipt。",
        "UI-BE-001",
        "apps/api/src/modules/platform-admin/platform-admin.controller.ts,docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md",
        "Publish endpoint returns ActionReceipt with auditId; state machine enforced (cannot publish from non-review_required); high-risk requiresReason=true; vitest covers all 6 state transitions",
    ),
    (
        "UI-BE-014-MATCHING-SUPPR",
        "Codex2",
        "Codex",
        "DriverMatchingSuppression standalone module (Pack driver-platform-binding §7)",
        "Pack driver-platform-binding-and-offline-contract-20260524.md §7 把 DriverMatchingSuppression 列為與 DriverOpsInstruction 平行的 peer producer module。現行 UI-BE-007-INC 只把它折進 incident 子查詢。本 task 拆出 standalone module：ops-side POST /api/ops/drivers/{driverId}/matching-suppression (create), driver-side GET /api/driver/matching-suppression (read), POST .../{suppressionId}/release。Suppression record 帶 reason taxonomy (9 reasons per §3) + releaseAction descriptor + auditId。",
        "UI-BE-007-INC,UI-BE-001",
        "apps/api/src/modules/driver-matching-suppression/",
        "Three endpoints implemented; record matches DriverMatchingSuppression contract; 9 reason codes accepted; release emits ActionReceipt; vitest covers create / list / release / forbidden-cross-actor",
    ),
    (
        "UI-BE-015-ACTIONS-EMBED",
        "Codex",
        "Claude2",
        "Audit availableActions embedding across all wave BE modules (ADR PACK-LAND-202605)",
        "Pack docs/02-architecture/ui-authority-actions-contract-20260524.md §8 ADR 規定不實作 standalone */actions endpoints，必須在 detail/list response 嵌入 availableActions: ResourceActionDescriptor[]。本 task 巡查所有 wave Layer 1 已完成的模組 (UI-BE-006/007-DSP/007-CMP/007-BKG/007-INC) 確認 OwnedOrderRecord / BookingRecord / DispatchRecord / ComplaintCaseRecord / IncidentRecord / TenantRolloutStateMachineRecord / PartnerEntryRecord 全部嵌入 availableActions[]，缺者補上。建立 lint rule 防止未來新增 mutating resource 沒有 availableActions。",
        "UI-BE-006,UI-BE-007-DSP,UI-BE-007-CMP,UI-BE-007-BKG,UI-BE-007-INC",
        "apps/api/src/modules/,apps/api/scripts/lint-available-actions.ts",
        "Audit report committed; 100% of mutating resources expose availableActions[]; lint rule fails CI when a new resourceType ships without availableActions; vitest covers descriptor availability='disabled' is honored downstream",
    ),
]


# ---------------------------------------------------------------------------
# Task data — Batch 3 (Tests + release gate — 4 tasks)
# ---------------------------------------------------------------------------

TEST_GATE_TASKS = [
    (
        "UI-TEST-001",
        "Codex2",
        "Codex",
        "Contract serialization unit tests for all 12 ui-runtime contracts (Pack PR5)",
        "Pack 00_INDEX.md §minimum acceptance: 'At least one unit or integration test proves each contract can be serialized, deserialized, and consumed by one of the app surfaces.' 新增 packages/contracts/test/ui-runtime.serialization.spec.ts 涵蓋 12 個 contract round-trip：minimal example + maximal example + edge cases (null fields, empty arrays, all union variants)。若 zod schemas 存在則 also validate against them。",
        "",
        "packages/contracts/test/ui-runtime.serialization.spec.ts",
        "All 12 contracts have at least 2 round-trip cases (min + max); all union/enum variants exercised; pnpm --filter @drts/contracts test green",
    ),
    (
        "UI-TEST-002",
        "Codex",
        "Codex2",
        "Per-app-family integration tests for ActionReceipt + ResourceActionDescriptor + UiRefreshMetadata (Pack PR5)",
        "Pack docs/04-api/ui-functional-contracts-20260524.md §5: 'Integration tests cover ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata in at least one endpoint per app family.' 為 4 個 app family (platform-admin / ops-console / tenant / driver) 各補一個 integration test：選一個 mutating endpoint，斷言 response 結構 + availableActions array + receipt.auditId + refresh metadata 都符合 contract。",
        "UI-BE-001,UI-BE-007-DSP,UI-BE-007-BKG",
        "apps/api/tests/integration/pack-contract-coverage.spec.ts",
        "4 integration tests pass (one per app family); each asserts ActionReceipt structure + availableActions presence + UiRefreshMetadata; pnpm --filter @drts/api test green",
    ),
    (
        "UI-TEST-003",
        "Claude2",
        "Codex",
        "UI regression: descriptor availability='disabled' prevents mutation (Pack §6 invariant)",
        "Pack 00_INDEX.md §implementation-rule invariant: 'UI cannot invent action permission... No app hard-codes a write CTA when the backend says the action is unavailable.' 對 4 個 app 各加一個 unit test 模擬 backend 回 ResourceActionDescriptor.availability='disabled'，斷言對應 UI 按鈕 disabled state + click handler 不發 mutation。Suggested test framework: vitest + @testing-library/react (web apps) / @testing-library/react-native (driver-app)。",
        "UI-CL-001",
        "apps/platform-admin-web/test/,apps/ops-console-web/test/,apps/tenant-console-web/test/,apps/driver-app/test/",
        "4 regression tests pass (one per app); each test renders a CTA with descriptor.availability='disabled' and asserts no API call fires on click; tests live alongside the consuming screen",
    ),
    (
        "UI-GATE-001",
        "Claude",
        "Claude2",
        "Release-gate matrix update: add pack workflow-family to branch-strategy (Pack invariant 7)",
        "Pack 00_INDEX.md §implementation-rule invariant 7: 'The existing workflow-family release-gate discipline remains binding.' 在 docs/ops/branch-strategy.md 的 release-gate matrix 加入 phase1-ui-implementation-wave-202605 workflow family，列出必要 gates (contracts compile / docs landed / 12 contract round-trip pass / 4 app smoke / no disabled-descriptor CTA enabled)。同步更新 docs-site 鏡像。",
        "",
        "docs/ops/branch-strategy.md,docs-site/docs/ops/branch-strategy.md",
        "Release-gate matrix lists 6 phase1-ui-implementation-wave-202605 gates; CI workflow / required checks updated to enforce; docs-site mirror in sync",
    ),
]


def _parse_csv(value):
    return [s.strip() for s in value.split(",") if s.strip()]


def all_tasks():
    out = []
    out.extend(BE_DELTA_TASKS)
    out.extend(TEST_GATE_TASKS)
    return out


def _now_iso():
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_task_obj(entry, timestamp):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = entry
    return {
        "id": task_id,
        "title": title,
        "summary_zh": summary_zh,
        "phase": PHASE,
        "owner": owner,
        "reviewer": reviewer,
        "status": "backlog",
        "depends_on": _parse_csv(deps),
        "artifacts": _parse_csv(artifacts),
        "acceptance": [acceptance],
        "planning_ref": PLANNING_REF,
        "next": "Assignment created",
        "last_update": timestamp,
    }


def _format_task_block(task_obj):
    """Render a single task as the indented JSON block (matching neighbours).

    Each task in ai-status.json sits inside the `tasks: [ ... ]` array at
    4-space indentation. ``json.dumps(indent=2)`` produces 2-space
    indentation; we re-indent each line by adding the 4-space prefix so the
    block lines up with siblings.
    """
    raw = json.dumps(task_obj, indent=2, ensure_ascii=False)
    lines = raw.split("\n")
    # First line is "{" — prefix 4 spaces. Subsequent lines: their content
    # is already prefixed with 2 spaces relative to "{"; we want them
    # at 6 spaces (4 for array indent + 2 for object members).
    out = []
    for idx, line in enumerate(lines):
        if idx == 0:
            out.append("    " + line)
        else:
            out.append("    " + line)
    return "\n".join(out)


def _find_tasks_array_close(text):
    """Find the byte offset of the closing ``]`` of the top-level
    ``tasks`` array. Returns the offset *of* the closing bracket character
    so callers can splice immediately before it.
    """
    key = text.index('"tasks":')
    open_idx = text.index("[", key)
    depth = 0
    i = open_idx
    n = len(text)
    while i < n:
        c = text[i]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise RuntimeError("Could not locate closing ] of tasks array")


def inject_tasks(text, new_task_objs):
    """Insert ``new_task_objs`` immediately before the closing bracket of
    the top-level ``tasks`` array. Preserves the rest of the file byte-for
    byte so the diff is bounded to the new entries only.
    """
    close_idx = _find_tasks_array_close(text)
    # Walk backwards to find the last non-whitespace char (which should be
    # the previous task's closing brace ``}``). Insert a comma after it,
    # then the new task blocks, then a newline so the closing bracket is on
    # its own line.
    j = close_idx - 1
    while j >= 0 and text[j].isspace():
        j -= 1
    if text[j] != "}":
        raise RuntimeError(
            f"Expected previous element to end with '}}', found {text[j]!r} at {j}"
        )
    # Replace whitespace gap between the previous '}' and the closing ']'
    # with ",\n" + new task blocks + "\n  " (two-space indent for ']').
    blocks = ",\n".join(
        _format_task_block(obj) for obj in new_task_objs
    )
    insertion = ",\n" + blocks + "\n  "
    new_text = text[: j + 1] + insertion + text[close_idx:]
    return new_text


def main():
    tasks = all_tasks()
    print(f"[dispatch-pack-delta] registering {len(tasks)} tasks")
    print(f"  Batch 2 (BE delta): {len(BE_DELTA_TASKS)}")
    print(f"  Batch 3 (tests + gate): {len(TEST_GATE_TASKS)}")
    print(f"  AI status: {AI_STATUS_PATH}")

    with AI_STATUS_PATH.open("r", encoding="utf-8") as f:
        raw = f.read()

    # Validate parseability + filter out already-present task ids
    state = json.loads(raw)
    existing_ids = {t.get("id") for t in state.get("tasks", []) if t.get("id")}

    timestamp = _now_iso()
    new_objs = []
    skipped = 0
    for entry in tasks:
        task_id = entry[0]
        if task_id in existing_ids:
            print(f"  =skipped {task_id} (already present)")
            skipped += 1
            continue
        new_objs.append(_build_task_obj(entry, timestamp))
        print(f"  +creating {task_id} -> owner={entry[1]} reviewer={entry[2]}")

    if not new_objs:
        print("[dispatch-pack-delta] nothing to do; all task ids already present")
        return 0

    new_text = inject_tasks(raw, new_objs)
    # Validate again
    json.loads(new_text)

    with AI_STATUS_PATH.open("w", encoding="utf-8") as f:
        f.write(new_text)

    print(
        f"[dispatch-pack-delta] done: inserted={len(new_objs)} skipped={skipped}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
