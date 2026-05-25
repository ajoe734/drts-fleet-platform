#!/usr/bin/env python3
"""Dispatch the Phase 1 UI Implementation Wave tasks to the supervisor.

Reads task definitions below and registers each via ``ai-status.sh assign``.
Idempotent: re-running updates existing tasks in place (per ai_status.py's
``command_assign``).

Source: docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md
Phase: phase1-ui-implementation-wave-202605
Total: 90 tasks (13 BE + 5 CL + 1 FE-TOKENS + 4 FE umbrellas + 67 FE sub-tasks)

Owner suggestions follow the workload ratio
``feedback_agent_workload_ratio.md`` (Codex/Codex2 ≈ 70%, Claude/Claude2 ≈
20%, Gemini/Gemini2/Copilot ≈ 10%). Supervisor's availability-first
scheduler may reshuffle (per
``feedback_supervisor_ignores_explicit_owner.md``); these are best-effort
hints, not commitments.

Usage::

    AI_NAME=Claude python3 scripts/dispatch-ui-impl-wave-tasks.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

# 3-second sleep between assigns avoids the OOM that hit the prior
# UI-HANDOFF-2026-05-20 batch when supervisor concurrent reads thrashed.
# See scripts/dispatch-ui-handoff-tasks-followup.sh for the precedent.
INTER_ASSIGN_SLEEP_SECONDS = 3

REPO = Path(__file__).resolve().parents[1]
PHASE = "phase1-ui-implementation-wave-202605"
PLANNING_REF = (
    "docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md"
)

# ---------------------------------------------------------------------------
# Task data
# ---------------------------------------------------------------------------
# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv,
#              artifacts_csv, acceptance_text)
# Acceptance is a single string (parse_csv_env stores it as one item; OK
# because most acceptance criteria are multi-clause sentences anyway).
# ---------------------------------------------------------------------------

# Layer 1 — Backend (13 tasks)
BACKEND_TASKS = [
    (
        "UI-BE-001",
        "Codex",
        "Claude2",
        "ActionReceipt response wrapper + audit-id capture (pilot module)",
        "建立 apps/api/src/common/ 共用 ActionReceipt response wrapper；pilot module 採用；vitest 覆蓋 happy + failure。",
        "",
        "apps/api/src/common/",
        "Shared utility returns ActionReceipt envelope; one pilot module adopts and emits ActionReceipt; vitest covers happy + failure paths",
    ),
    (
        "UI-BE-002",
        "Gemini",
        "Codex",
        "UiHealthEnvelope on /api/health + degraded-service taxonomy",
        "/api/health 改回傳 UiHealthEnvelope；degradedServices[] 列出依賴與 severity；vitest 覆蓋 healthy / degraded / down。",
        "",
        "apps/api/src/modules/health/",
        "/api/health returns UiHealthEnvelope shape; per-dependency degradedServices[]; vitest covers 3 states",
    ),
    (
        "UI-BE-003",
        "Codex2",
        "Claude",
        "Notification module (UserNotificationRecord storage + endpoints + emitters)",
        "新增 notification module：UserNotificationRecord storage、GET /api/notifications、POST /{id}/read、POST /read-bulk、per-realm filter；event emitters 涵蓋 Q-X06 taxonomy。",
        "UI-BE-001",
        "apps/api/src/modules/notification/",
        "Endpoints implemented; per-realm filter works; vitest covers 5+ event types from Q-X06 taxonomy",
    ),
    (
        "UI-BE-004-OPS",
        "Codex",
        "Codex2",
        "Search endpoint for ops-console (cross-entity)",
        "新增 GET /api/ops/search?q=...&types=...；result grouped by category；範圍 orders / dispatch / drivers / vehicles / complaints / incidents。",
        "",
        "apps/api/src/modules/search/",
        "GET /api/ops/search returns SearchResultRecord grouped by category; vitest covers cross-entity + grouping",
    ),
    (
        "UI-BE-004-ADM",
        "Codex2",
        "Gemini",
        "Search endpoint for platform-admin (cross-entity)",
        "新增 GET /api/platform/search；範圍 tenants / partners / users / adapter registry / audit。",
        "",
        "apps/api/src/modules/search/",
        "GET /api/platform/search returns SearchResultRecord grouped by category; vitest",
    ),
    (
        "UI-BE-004-TEN",
        "Gemini2",
        "Codex",
        "Search endpoint for tenant-console (cross-entity)",
        "新增 GET /api/tenant/search；範圍 bookings / passengers / addresses / cost-centers / invoices。",
        "",
        "apps/api/src/modules/search/",
        "GET /api/tenant/search returns SearchResultRecord grouped by category; vitest",
    ),
    (
        "UI-BE-005",
        "Claude2",
        "Codex2",
        "Tenant /api/tenant/integration-governance/readiness aggregated endpoint",
        "新增 aggregated readiness endpoint，回傳 TenantIntegrationReadinessSummary（api-keys / webhooks / notifications / sla / reports / modules / partner-entries 各子系統 ready/partial/not_provisioned/blocked）。",
        "",
        "apps/api/src/modules/tenant-integration/",
        "Single endpoint returns TenantIntegrationReadinessSummary; no orchestrated subqueries from UI side; vitest covers 4 sub-system status levels",
    ),
    (
        "UI-BE-006",
        "Codex2",
        "Claude",
        "Tenant rollout state machine module (TenantRolloutStateMachineRecord + transitions)",
        "新增 tenant rollout state machine：sandbox/pilot/production/rollback_hold × pending/ready/approved/blocked；transition handlers；availableActions[] 計算；audit emit。",
        "UI-BE-001",
        "apps/api/src/modules/tenant-rollout/",
        "Storage + transition handlers; availableActions[] per stage/gate combination; vitest covers 4 stages × 4 gate states",
    ),
    (
        "UI-BE-007-DSP",
        "Codex",
        "Codex2",
        "Dispatch read-model envelope wrapping + availableActions",
        "dispatch module read-model 加 UiRefreshMetadata + EmptyStateEnvelope + availableActions[]；6 個 EmptyReason 都覆蓋；owned + forwarded 端點。",
        "UI-BE-001",
        "apps/api/src/modules/dispatch/,apps/api/src/modules/owned-mobility/",
        "Owned + forwarded queue endpoints return envelopes; availableActions[] per row; 6 EmptyReason coverage; vitest",
    ),
    (
        "UI-BE-007-CMP",
        "Codex2",
        "Codex",
        "Complaint read-model + backend-computed slaStatus (Q-OPS13)",
        "complaint module read-model 加 envelope；新增 backend-computed slaStatus / slaDueAt / slaBreachedAt（不再 client-side derive）。",
        "UI-BE-001",
        "apps/api/src/modules/complaint/",
        "ComplaintCaseRecord gains slaStatus/slaDueAt/slaBreachedAt; backend computes; vitest covers within_sla/warning/breached",
    ),
    (
        "UI-BE-007-INC",
        "Codex",
        "Claude",
        "Incident read-model + DriverMatchingSuppression integration (Q-OPS09)",
        "incident module read-model 加 envelope；新增 DriverMatchingSuppression 模型（incident-created → suppress 24h default；ops_manager 可延長）。",
        "UI-BE-001",
        "apps/api/src/modules/incident/",
        "DriverMatchingSuppression linked to incident lifecycle; 24h default + ops_manager extension; vitest",
    ),
    (
        "UI-BE-007-BKG",
        "Claude2",
        "Codex2",
        "Booking command pattern (Q-TEN04) + editableUntil (Q-TEN05)",
        "tenant booking endpoints 改 command pattern：POST /api/tenant/bookings/commands/{create,update,cancel}；accepted+pending 狀態；availableActions + editableUntil + readOnlyReasonCode。",
        "UI-BE-001",
        "apps/api/src/modules/owned-mobility/,apps/api/src/modules/tenant-partner/",
        "Command endpoints accept synchronous + accepted+pending state; editableUntil + readOnlyReasonCode + availableActions[]; vitest",
    ),
    (
        "UI-BE-008",
        "Gemini",
        "Codex2",
        "DriverOpsInstruction module (ops issues, driver receives)",
        "新增 DriverOpsInstruction module：storage + ops-side endpoint（建立 instruction）+ driver-side endpoint（讀取 + ack）+ expiresAt 處理。",
        "UI-BE-003",
        "apps/api/src/modules/driver-instruction/",
        "Storage + ops-side create + driver-side read; expiresAt handling; vitest",
    ),
]

# Layer 2 — api-client (5 tasks)
CLIENT_TASKS = [
    (
        "UI-CL-001",
        "Claude2",
        "Codex",
        "Generic response unwrapper (UiHealthEnvelope + UiRefreshMetadata)",
        "在 packages/api-client/src/ 加 generic unwrap<T>：回傳 { data: T; refresh: UiRefreshMetadata; health: UiHealthEnvelope }；既有 method 漸進採用。",
        "UI-BE-002",
        "packages/api-client/src/",
        "Generic unwrap returns data + refresh + health; typecheck clean across apps",
    ),
    (
        "UI-CL-002",
        "Codex",
        "Codex2",
        "Notification client methods",
        "加 listNotifications / markNotificationRead / markNotificationsBulkRead；type-safe 對應 UserNotificationRecord。",
        "UI-BE-003",
        "packages/api-client/src/",
        "Methods exposed; typecheck clean",
    ),
    (
        "UI-CL-003",
        "Codex2",
        "Gemini2",
        "Search client methods per realm",
        "加 searchOps / searchPlatform / searchTenant；對應 backend search endpoints；回傳 SearchResultRecord[]。",
        "UI-BE-004-OPS,UI-BE-004-ADM,UI-BE-004-TEN",
        "packages/api-client/src/",
        "Three methods exposed; typecheck clean",
    ),
    (
        "UI-CL-004",
        "Gemini2",
        "Codex",
        "Tenant integration-governance readiness method",
        "加 getTenantIntegrationReadiness：回傳 TenantIntegrationReadinessSummary。",
        "UI-BE-005",
        "packages/api-client/src/",
        "Single method exposed; typecheck clean",
    ),
    (
        "UI-CL-005",
        "Gemini",
        "Codex2",
        "Driver-side ops instruction client methods",
        "加 listOpsInstructions / acknowledgeOpsInstruction；給 apps/driver-app 用。",
        "UI-BE-008",
        "packages/api-client/src/",
        "Driver-callable methods exposed; typecheck clean",
    ),
]

# Layer 3a — Frontend tokens (1 task; paired with UI-FE-OPS-DSH per user
# decision §10.4: 2 lock-step PRs)
TOKEN_TASKS = [
    (
        "UI-FE-TOKENS",
        "Claude2",
        "Codex2",
        "New @drts/ui-web design tokens + primitives matching design canvas v0.6",
        "依 docs/05-ui/drts-design-canvas/ v0.6 重做 @drts/ui-web design tokens（base palette + per-app accent: ops=#FCA5A5 / admin=#A5B4FC / tenant=#5EEAD4 / driver=#7BC0FF）+ primitives。Lock-step 跟 UI-FE-OPS-DSH 一起 review（分兩個 PR）。",
        "UI-BE-007-DSP",
        "packages/ui-web/src/canvas-primitives/,packages/ui-web/src/canvas-tokens.ts",
        "Tokens exported; ops/admin/tenant accents derivable; ops-console-web first page (UI-FE-OPS-DSH) consumes successfully; typecheck + storybook clean",
    ),
]

# Layer 3b — Frontend per-app sub-tasks (67 tasks)
#
# Each entry: (id, owner, reviewer, page-label, app, page-path-rel, deps_csv)
# Title + summary_zh + artifact + acceptance generated formulaically below.
#
# Owner distribution within each app rotates through the workload ratio.

OPS_SUBTASKS = [
    # id-suffix, owner, reviewer, page-label, path
    ("DSH", "Claude2", "Codex2", "Dashboard", "dashboard/page.tsx"),
    ("DSP", "Codex", "Codex2", "Dispatch (multi-board)", "dispatch/page.tsx"),
    ("DSPID", "Codex2", "Codex", "Dispatch detail / workspace", "dispatch/[dispatchId]/page.tsx"),
    ("CC", "Codex", "Claude", "Call center workspace", "callcenter/page.tsx"),
    ("CMP", "Codex2", "Codex", "Complaints list", "complaints/page.tsx"),
    ("CMPID", "Claude2", "Codex", "Complaint detail (NEW per Q-OPS01)", "complaints/[caseNo]/page.tsx"),
    ("INC", "Codex", "Codex2", "Incidents list", "incidents/page.tsx"),
    ("INCID", "Codex2", "Codex", "Incident detail", "incidents/[incidentId]/page.tsx"),
    ("APR", "Claude", "Codex2", "Approval requests (cross-tenant)", "approval-requests/page.tsx"),
    ("RPT", "Gemini", "Codex", "Reports", "reports/page.tsx"),
    ("REV", "Codex", "Codex2", "Revenue review", "revenue/page.tsx"),
    ("ATT", "Codex2", "Codex", "Attendance", "attendance/page.tsx"),
    ("MNT", "Gemini2", "Codex", "Maintenance", "maintenance/page.tsx"),
    ("DRV", "Codex", "Codex2", "Drivers list", "drivers/page.tsx"),
    ("DRVID", "Codex2", "Claude2", "Driver detail / earnings / platform binding", "drivers/[driverId]/page.tsx"),
    ("VEH", "Codex", "Codex2", "Vehicles list", "vehicles/page.tsx"),
    ("VEHID", "Claude", "Codex", "Vehicle detail (NEW per Q-OPS02)", "vehicles/[vehicleId]/page.tsx"),
    ("CON", "Codex2", "Codex", "Contracts list", "contracts/page.tsx"),
    ("CONID", "Copilot", "Codex", "Contract detail (NEW per Q-OPS03)", "contracts/[contractId]/page.tsx"),
    ("FF", "Copilot", "Codex2", "Feature flags (read-only)", "feature-flags/page.tsx"),
]

ADM_SUBTASKS = [
    ("HOME", "Codex", "Codex2", "Platform home", "page.tsx"),
    ("TEN", "Codex2", "Codex", "Tenants list", "tenants/page.tsx"),
    ("TENID", "Codex", "Claude2", "Tenant detail / rollout workspace", "tenants/[tenantId]/page.tsx"),
    ("TENGOV", "Claude2", "Codex2", "Tenant governance dashboard", "tenant-governance/page.tsx"),
    ("PRT", "Codex2", "Codex", "Partners list", "partners/page.tsx"),
    ("PRTID", "Codex", "Codex2", "Partner entry detail (credential modal)", "partners/[entrySlug]/page.tsx"),
    ("USR", "Codex2", "Gemini", "Platform users", "users/page.tsx"),
    ("FLT", "Codex", "Claude2", "Fleet & compliance (multi-tab)", "fleet/page.tsx"),
    ("SWB", "Codex2", "Codex", "Public info & placards (switchboard)", "switchboard/page.tsx"),
    ("PRC", "Codex", "Codex2", "Pricing governance (multi-tab)", "pricing/page.tsx"),
    ("PAY", "Codex2", "Codex", "Payments / settlement", "payments/page.tsx"),
    ("REIMB", "Claude", "Codex", "Reimbursement batch queue (NEW)", "payments/reimbursements/page.tsx"),
    ("REIMBID", "Gemini", "Codex2", "Reimbursement batch detail (NEW)", "payments/reimbursements/[batchId]/page.tsx"),
    ("HLT", "Gemini2", "Codex", "Platform health", "health/page.tsx"),
    ("NTC", "Codex", "Codex2", "Notices + maintenance mode (multi-tab)", "notices/page.tsx"),
    ("AUD", "Codex2", "Codex", "Audit & evidence governance", "audit/page.tsx"),
    ("FF", "Copilot", "Codex2", "Feature flags (write authority)", "feature-flags/page.tsx"),
    ("ADP", "Codex", "Codex2", "Adapter registry (split authority)", "adapter-registry/page.tsx"),
]

TEN_SUBTASKS = [
    ("HOME", "Codex", "Codex2", "Workspace home", "page.tsx"),
    ("BKG", "Codex2", "Codex", "Bookings list", "bookings/page.tsx"),
    ("BKGNEW", "Codex", "Codex2", "Booking create (NEW route per Q-TEN02)", "bookings/new/page.tsx"),
    ("BKGID", "Codex2", "Codex", "Booking detail (editableUntil + accepted+pending)", "bookings/[bookingId]/page.tsx"),
    ("PSG", "Codex", "Claude2", "Passenger directory", "passengers/page.tsx"),
    ("ADR", "Claude", "Codex2", "Address book (NEW per Q-TEN02)", "addresses/page.tsx"),
    ("USR", "Codex2", "Codex", "Tenant users", "users/page.tsx"),
    ("NTF", "Gemini", "Codex", "Notification preferences (NEW per Q-TEN02)", "notifications/page.tsx"),
    ("SLA", "Claude2", "Codex", "SLA profile (NEW per Q-TEN02)", "sla/page.tsx"),
    ("WH", "Codex", "Codex2", "Webhook management (real engine per Q-TEN08)", "webhooks/page.tsx"),
    ("APIK", "Codex2", "Codex", "API key management (plaintext-once per Q-TEN09)", "api-keys/page.tsx"),
    ("BILL", "Gemini2", "Codex", "Billing overview (NEW per Q-TEN02)", "billing/page.tsx"),
    ("INV", "Codex", "Codex2", "Invoices", "invoices/page.tsx"),
    ("CC", "Codex2", "Codex", "Cost centers (Q-TEN11)", "cost-centers/page.tsx"),
    ("RUL", "Codex", "Claude2", "Approval rules (Q-TEN12)", "rules/page.tsx"),
    ("IG", "Claude2", "Codex", "Integration governance (aggregated per Q-TEN10)", "integration-governance/page.tsx"),
    ("RPT", "Codex2", "Codex", "Reports (NEW per Q-TEN02)", "reports/page.tsx"),
    ("AUD", "Codex", "Codex2", "Audit trail (cross-actor per Q-TEN13)", "audit/page.tsx"),
    ("FF", "Copilot", "Codex2", "Feature flags (read-only NEW per Q-TEN02)", "feature-flags/page.tsx"),
    ("SET", "Copilot", "Codex", "Tenant settings", "settings/page.tsx"),
]

DRV_SUBTASKS = [
    # Driver app uses Expo Router file routes (no /page.tsx pattern)
    ("ONB", "Codex2", "Claude2", "Onboarding (provisioning)", "onboarding.tsx"),
    ("IDX", "Codex", "Codex2", "Workspace cockpit (index)", "index.tsx"),
    ("JOB", "Codex2", "Codex", "Unified task inbox", "jobs.tsx"),
    ("TRP", "Codex", "Claude2", "Trip operation (one primary action)", "trip.tsx"),
    ("PP", "Codex2", "Codex", "Platform presence (4 reauth mechanisms)", "platform-presence.tsx"),
    ("EAR", "Codex", "Codex2", "Earnings", "earnings.tsx"),
    ("SHF", "Codex2", "Codex", "Shift / clock in-out (Q-DRV09)", "shift.tsx"),
    ("SOS", "Claude2", "Codex2", "SOS incident (press-and-hold 2s)", "incident.tsx"),
    ("SET", "Codex", "Codex2", "Settings + platform binding", "settings.tsx"),
]

# Layer 3c — FE umbrellas (4)
UMBRELLA_TASKS = [
    (
        "UI-FE-OPS-UMBRELLA",
        "Claude",
        "Codex2",
        "Ops Console rebuild — umbrella status / closeout",
        "Ops Console 重做 umbrella：所有 sub-task 完成後做 closeout doc + storybook 確認 + 整 app smoke test。",
        "UI-FE-TOKENS,UI-FE-OPS-DSH,UI-FE-OPS-DSP,UI-FE-OPS-DSPID,UI-FE-OPS-CC,UI-FE-OPS-CMP,UI-FE-OPS-CMPID,UI-FE-OPS-INC,UI-FE-OPS-INCID,UI-FE-OPS-APR,UI-FE-OPS-RPT,UI-FE-OPS-REV,UI-FE-OPS-ATT,UI-FE-OPS-MNT,UI-FE-OPS-DRV,UI-FE-OPS-DRVID,UI-FE-OPS-VEH,UI-FE-OPS-VEHID,UI-FE-OPS-CON,UI-FE-OPS-CONID,UI-FE-OPS-FF",
        "docs/05-ui/ops-console-rebuild-closeout-*.md",
        "All 20 sub-tasks done; closeout doc references each per spec packet §5; storybook parity stories pass; smoke test in dev VM clean",
    ),
    (
        "UI-FE-ADM-UMBRELLA",
        "Claude",
        "Claude2",
        "Platform Admin rebuild — umbrella status / closeout",
        "Platform Admin 重做 umbrella：所有 sub-task 完成後做 closeout。",
        "UI-FE-ADM-HOME,UI-FE-ADM-TEN,UI-FE-ADM-TENID,UI-FE-ADM-TENGOV,UI-FE-ADM-PRT,UI-FE-ADM-PRTID,UI-FE-ADM-USR,UI-FE-ADM-FLT,UI-FE-ADM-SWB,UI-FE-ADM-PRC,UI-FE-ADM-PAY,UI-FE-ADM-REIMB,UI-FE-ADM-REIMBID,UI-FE-ADM-HLT,UI-FE-ADM-NTC,UI-FE-ADM-AUD,UI-FE-ADM-FF,UI-FE-ADM-ADP",
        "docs/05-ui/platform-admin-rebuild-closeout-*.md",
        "All 18 sub-tasks done; closeout doc; storybook; smoke test clean",
    ),
    (
        "UI-FE-TEN-UMBRELLA",
        "Claude",
        "Codex",
        "Tenant Console rebuild — umbrella status / closeout",
        "Tenant Console 重做 umbrella（含 9 個 NEW route）：所有 sub-task 完成後做 closeout + Q-TEN01 cutover 規劃確認。",
        "UI-FE-TEN-HOME,UI-FE-TEN-BKG,UI-FE-TEN-BKGNEW,UI-FE-TEN-BKGID,UI-FE-TEN-PSG,UI-FE-TEN-ADR,UI-FE-TEN-USR,UI-FE-TEN-NTF,UI-FE-TEN-SLA,UI-FE-TEN-WH,UI-FE-TEN-APIK,UI-FE-TEN-BILL,UI-FE-TEN-INV,UI-FE-TEN-CC,UI-FE-TEN-RUL,UI-FE-TEN-IG,UI-FE-TEN-RPT,UI-FE-TEN-AUD,UI-FE-TEN-FF,UI-FE-TEN-SET",
        "docs/05-ui/tenant-console-rebuild-closeout-*.md",
        "All 20 sub-tasks done; closeout doc; 9 NEW routes ship; smoke test clean; Q-TEN01 cutover plan referenced",
    ),
    (
        "UI-FE-DRV-UMBRELLA",
        "Claude2",
        "Codex2",
        "Driver App rebuild — umbrella status / closeout",
        "Driver App 重做 umbrella（獨立 design system 不共用 @drts/ui-web）：所有 sub-task 完成後做 closeout + device-class verification (412×892 + 360×780)。",
        "UI-FE-DRV-ONB,UI-FE-DRV-IDX,UI-FE-DRV-JOB,UI-FE-DRV-TRP,UI-FE-DRV-PP,UI-FE-DRV-EAR,UI-FE-DRV-SHF,UI-FE-DRV-SOS,UI-FE-DRV-SET",
        "docs/05-ui/driver-app-rebuild-closeout-*.md",
        "All 9 sub-tasks done; closeout doc; two device class screenshots; SOS press-and-hold 2s contract verified",
    ),
]


# ---------------------------------------------------------------------------
# Generation helpers for FE per-page sub-tasks
# ---------------------------------------------------------------------------

# Per-app metadata used to generate FE sub-task fields formulaically.
FE_APP_META = {
    "OPS": {
        "app_slug": "ops-console-web",
        "canvas_html": "Ops Console.html",
        "packet": "docs/05-ui/ops-console-design-handoff-packet-20260525.md",
        "common_deps": [
            "UI-FE-TOKENS",
            "UI-BE-007-DSP",
            "UI-CL-001",
        ],
    },
    "ADM": {
        "app_slug": "platform-admin-web",
        "canvas_html": "Platform Admin.html",
        "packet": "docs/05-ui/platform-admin-design-handoff-packet-20260525.md",
        "common_deps": [
            "UI-FE-TOKENS",
            "UI-BE-006",
            "UI-CL-001",
        ],
    },
    "TEN": {
        "app_slug": "tenant-console-web",
        "canvas_html": "Tenant Console.html",
        "packet": "docs/05-ui/tenant-console-design-handoff-packet-20260525.md",
        "common_deps": [
            "UI-FE-TOKENS",
            "UI-BE-005",
            "UI-BE-007-BKG",
            "UI-CL-001",
            "UI-CL-004",
        ],
    },
    "DRV": {
        "app_slug": "driver-app",
        "canvas_html": "Driver App.html",
        "packet": "docs/05-ui/driver-app-design-handoff-packet-20260525.md",
        "common_deps": [
            "UI-BE-007-DSP",
            "UI-BE-008",
            "UI-CL-002",
            "UI-CL-005",
        ],
    },
}


def build_fe_subtask(app_key, suffix, owner, reviewer, label, path):
    meta = FE_APP_META[app_key]
    task_id = f"UI-FE-{app_key}-{suffix}"
    title = f"{meta['app_slug']}: rebuild {label} page to canvas {meta['canvas_html']}"
    summary_zh = (
        f"依設計稿 {meta['canvas_html']} + packet {meta['packet']} §5 重做 "
        f"{label} 螢幕：sitemap、必備資料、必備動作 (availableActions)、"
        f"6 EmptyReason、refresh tier、cross-app deep links 全部按 spec 落實。"
        f" 視覺照 canvas；行為照 packet；contract 用 @drts/contracts ui-runtime。"
    )
    deps = ",".join(meta["common_deps"])
    artifact = f"apps/{meta['app_slug']}/app/{path}"
    acceptance = (
        f"Visual matches {meta['canvas_html']} corresponding artboard; "
        f"behaviour matches packet §5 entry for {label}; "
        f"availableActions drives CTAs; EmptyReason 6 states rendered distinctly; "
        f"refresh tier wired; pnpm --filter @drts/{meta['app_slug']} typecheck + build pass"
    )
    return (task_id, owner, reviewer, title, summary_zh, deps, artifact, acceptance)


def all_tasks():
    """Return the combined list of all 90 tasks in registration order."""
    out = []
    out.extend(BACKEND_TASKS)
    out.extend(CLIENT_TASKS)
    out.extend(TOKEN_TASKS)
    for app_key, subs in [
        ("OPS", OPS_SUBTASKS),
        ("ADM", ADM_SUBTASKS),
        ("TEN", TEN_SUBTASKS),
        ("DRV", DRV_SUBTASKS),
    ]:
        for suffix, owner, reviewer, label, path in subs:
            out.append(build_fe_subtask(app_key, suffix, owner, reviewer, label, path))
    out.extend(UMBRELLA_TASKS)
    return out


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def register(task):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["TASK_TITLE"] = title
    env["TASK_SUMMARY_ZH"] = summary_zh
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    cmd = [
        "bash",
        "scripts/ai-status.sh",
        "assign",
        task_id,
        owner,
        reviewer,
        title,
    ]
    result = subprocess.run(
        cmd,
        env=env,
        cwd=str(REPO),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    print(f"  {task_id:30s}  {owner:>8s} -> {reviewer:>8s}  | {title[:80]}")
    return True


def main():
    tasks = all_tasks()
    print(
        f"Registering {len(tasks)} tasks under phase '{PHASE}'\n"
        f"(workload ratio per feedback_agent_workload_ratio.md — supervisor "
        f"may reshuffle)\n"
    )
    success = 0
    for i, task in enumerate(tasks):
        if register(task):
            success += 1
        if i < len(tasks) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(
        f"\nDone: {success}/{len(tasks)} tasks registered. "
        f"Supervisor will pick them up on next scan cycle "
        f"(typically within 60s)."
    )
    if success != len(tasks):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
