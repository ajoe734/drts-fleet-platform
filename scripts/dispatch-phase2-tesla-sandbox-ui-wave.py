#!/usr/bin/env python3
"""Dispatch the Phase 2 UI build wave — now that design canvas has landed.

The design team delivered canvas for all Phase 2 surfaces under
docs/05-ui/drts-design-canvas/ (roc-screens-1/2.jsx, driver-safety-operator.jsx,
compliance-screens.jsx, platform-sandbox.jsx, ops-av-fallback.jsx). UI build is
therefore unblocked. Workers IMPLEMENT against the canvas (the IA authority) —
they do NOT design UI. Each task cites the exact canvas file + component names.

Tasks depend on their backend counterparts (still in backlog); the supervisor
gates them until deps complete, so dispatching now just expresses the full wave.

Source:
  docs/05-ui/drts-design-canvas/ (canvas = authority)
  docs/02-architecture/phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md
  docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md

Usage::

    AI_NAME=Claude python3 scripts/dispatch-phase2-tesla-sandbox-ui-wave.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3
REPO = Path(__file__).resolve().parents[1]
PHASE = "phase2-tesla-fsd-sandbox-202606"
PLANNING_REF = (
    "docs/02-architecture/phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md"
)

# (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance_text)
TASKS = [
    (
        "P2-UI-ROC-001",
        "Codex",
        "Claude",
        "ROC Console app scaffold + board surfaces (per roc canvas)",
        "依 canvas docs/05-ui/drts-design-canvas/roc-screens-1.jsx（IA authority，勿自行重設計）build apps/roc-console-web 之 RocShell "
        "與 ROC_Overview/ROC_LiveBoard/ROC_Trips/ROC_Vehicles/ROC_VehicleDetail/ROC_Provider/ROC_Handover；沿用 Ops shell + @drts/ui-web + "
        "P2-DP-C2-001 之 roc token。硬規則：核准區域 overlay 不顯示方向盤/perception/RSU；telemetry 鮮度與監理事件鮮度兩個分開指標；"
        "CTA 全由 backend availableActions；無 remote driving；狀態標 evidence source；文字走 i18n t()。",
        "P2-DP-C2-001,P2-ROC-001",
        "apps/roc-console-web/,docs/05-ui/drts-design-canvas/roc-screens-1.jsx",
        "roc-console-web builds; listed screens match canvas; dual freshness rendered as two separate indicators; CTAs from "
        "availableActions; no remote-driving control; evidence-source tags shown; pnpm --filter roc-console-web typecheck+build pass",
    ),
    (
        "P2-UI-ROC-002",
        "Codex2",
        "Codex",
        "ROC Console takeover/alerts/incidents/evidence/reports (per roc canvas)",
        "依 canvas roc-screens-2.jsx build ROC_Takeover/ROC_Alerts/ROC_Incidents/ROC_Evidence/ROC_Reports。Takeover queue 必為三欄"
        "（Tesla 原廠事件 / 安全員回報 / ROC 處置）並列、絕不合併成單一真相；Evidence 只顯示 summary+freeze status，原始證據 deep-link 到 "
        "Platform Admin（CrossAppResourceLink，後端提供 investigationLink，前端不拼 URL）；actions=availableActions；write 回 ActionReceipt。",
        "P2-UI-ROC-001,P2-CORR-001,P2-DP-C1-001",
        "apps/roc-console-web/,docs/05-ui/drts-design-canvas/roc-screens-2.jsx",
        "Takeover screen shows 3 non-merged columns; evidence deep-links to platform-admin via backend link; ActionReceipt "
        "shown on writes; matches canvas; typecheck+build pass",
    ),
    (
        "P2-UI-SAFE-001",
        "Codex",
        "Claude2",
        "Driver App Safety Operator Mode (per driver-safety-operator canvas)",
        "依 canvas driver-safety-operator.jsx build driver-app 內安全員 realm：SOFrame/SOModeBar/SOSyncStrip + SO_Provisioning/SO_Pretrip/"
        "SO_ActiveTrip(含 takeover report)/SO_IncidentUpload/SO_ShiftHandover。與一般司機 mode 分離；離線暫存 + 未同步狀態可視（client "
        "generated id 去重）；takeover 時間可改但留 audit；不顯示也不控制 Tesla FSD internal controls；文字 i18n。",
        "P2-SAFE-001",
        "apps/driver-app/,docs/05-ui/drts-design-canvas/driver-safety-operator.jsx",
        "Safety Operator realm separate from normal driver mode; offline queue + unsynced indicator; takeover report captures "
        "editable-with-audit time; no FSD control UI; matches canvas; driver-app build/typecheck pass",
    ),
    (
        "P2-UI-CMP-001",
        "Codex2",
        "Codex",
        "platform-admin Compliance & Investigation pages (per compliance canvas)",
        "依 canvas compliance-screens.jsx build apps/platform-admin-web 之 Compliance/Investigation route group（§C1）：CmpShell + "
        "CMP_Dashboard/CMP_TripDetail/CMP_TakeoverReview/CMP_Accident/CMP_Timeline/CMP_Manifest/CMP_Export/CMP_LegalHold/CMP_ReportJobs/"
        "CMP_Regulator。同步 timeline 每 fact 標 data-confidence（provider_signed…）；export 需 step-up+reason；legal-hold release 四眼；"
        "scope 驅動可見/可操作；用 Platform Admin governance shell。",
        "P2-DP-C1-001,P2-ACC-002,P2-EVD-002",
        "apps/platform-admin-web/,docs/05-ui/drts-design-canvas/compliance-screens.jsx",
        "Compliance/investigation pages under /platform-admin/* match canvas; timeline marks confidence; export gated by "
        "step-up+reason; legal-hold release shows four-eyes; scope-driven actions; typecheck+build pass",
    ),
    (
        "P2-UI-ADM-001",
        "Claude",
        "Codex2",
        "platform-admin Sandbox Governance pages (per platform-sandbox canvas)",
        "依 canvas platform-sandbox.jsx build apps/platform-admin-web 沙盒治理頁：PA_Experiments/PA_ExperimentDetail/PA_SandboxSuspend + "
        "PSB_AreasEditor(PostGIS polygon/route 繪製)/PSB_VehicleEnroll/PSB_OperatorQual/PSB_TeslaIntegration/PSB_Capabilities/PSB_Policies。"
        "版本/effective-date 可見；capability 缺失明示 gated；suspend/resume 流程；接 P2-GOV-001/002 contracts；i18n。",
        "P2-GOV-001,P2-GOV-002",
        "apps/platform-admin-web/,docs/05-ui/drts-design-canvas/platform-sandbox.jsx",
        "Sandbox governance pages match canvas; area/route editor draws geometry; capability-missing shown as gated; "
        "suspend/resume flow wired; versions effective-dated in UI; typecheck+build pass",
    ),
    (
        "P2-UI-OPS-001",
        "Codex",
        "Codex2",
        "ops-console AV fallback / passenger recovery (per ops-av-fallback canvas)",
        "依 canvas ops-av-fallback.jsx build apps/ops-console-web：OC_AvFallback/OC_PassengerRecovery/OC_SandboxExceptions。沿用同一 booking "
        "顯示改派、修正 ETA、sandbox exception 列表；passenger 文案走 backend messageCode（§C3，不外洩 FSD internal reason）；不加收提示"
        "（fallback 不 surcharge）；接 P2-FBK-001 + P2-DP-C3-001 projection。",
        "P2-FBK-001,P2-DP-C3-001",
        "apps/ops-console-web/,docs/05-ui/drts-design-canvas/ops-av-fallback.jsx",
        "AV fallback + passenger recovery + sandbox exceptions match canvas; same-booking context preserved; messages from "
        "backend messageCode (no internal reason leak); no surcharge shown; typecheck+build pass",
    ),
]


def register(task) -> bool:
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
    cmd = ["bash", "scripts/ai-status.sh", "assign", task_id, owner, reviewer, title]
    result = subprocess.run(
        cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    print(f"  {task_id:16s}  {owner:>8s} -> {reviewer:>8s}  | {title[:66]}")
    return True


def main() -> int:
    print(
        f"Registering {len(TASKS)} Phase 2 UI build tasks under phase '{PHASE}'\n"
        f"(design canvas landed; workers implement against canvas, not redesign)\n"
    )
    success = 0
    for i, task in enumerate(TASKS):
        if register(task):
            success += 1
        if i < len(TASKS) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {success}/{len(TASKS)} tasks registered. Gated by backend deps until ready.")
    return 0 if success == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
