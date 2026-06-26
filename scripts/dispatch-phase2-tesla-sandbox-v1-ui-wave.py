#!/usr/bin/env python3
"""Dispatch the Phase 2 V1 fallback UI build tasks (passenger + tenant).

Visual team delivered the V1 canvas (pe-fallback.jsx, tenant-av-fallback.jsx)
into docs/05-ui/drts-design-canvas/. These two existing-app fallback surfaces
previously had NO UI task; dispatch them now. Workers implement against the
canvas (IA authority), text via backend messageCode only. Idempotent.

Source:
  docs/05-ui/drts-design-canvas/pe-fallback.jsx (4 passenger states)
  docs/05-ui/drts-design-canvas/tenant-av-fallback.jsx (tenant list/detail)
  decisions C3 (visibility) + S1 (message catalog) + C4 (no surcharge)

Usage:
    AI_NAME=Claude python3 scripts/dispatch-phase2-tesla-sandbox-v1-ui-wave.py
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
    "docs/02-architecture/phase2_tesla_fsd_sandbox_open_decisions_visual_team_20260626.md"
)

TASKS = [
    (
        "P2-UI-PAX-001",
        "Codex2",
        "Claude",
        "Passenger AV->human fallback states (per pe-fallback canvas)",
        "依 canvas docs/05-ui/drts-design-canvas/pe-fallback.jsx build 乘客端 fallback 四態：PE_FbVehicleChange / "
        "PE_FbServiceContinuing / PE_FbHumanAssigned / PE_FbEtaUpdated（套 referral-embed-web，passenger-web 同 pattern）。"
        "硬規則：所有文案由 backend passengerMessageCode 渲染（MsgSlot），**canvas/前端不寫死文案**；乘客**不顯示** Tesla reason "
        "code / FSD transition / operational hold / incident 分類 / evidence freeze / legal hold / 安全員/ROC 姓名；不出現第二張 "
        "booking 或加收提示（fallbackSurchargeApplied=false）。接 P2-DP-C3-001 visibility projection + P2-DP-S1-001 message catalog。",
        "P2-DP-C3-001,P2-DP-S1-001",
        "apps/referral-embed-web/,apps/passenger-web/,docs/05-ui/drts-design-canvas/pe-fallback.jsx",
        "4 passenger fallback states match canvas; all copy rendered from passengerMessageCode (no hardcoded text); no FSD "
        "internals shown; no surcharge / second-booking; typecheck+build pass",
    ),
    (
        "P2-UI-TEN-001",
        "Codex",
        "Codex2",
        "Tenant Console AV fallback list/detail (per tenant-av-fallback canvas)",
        "依 canvas docs/05-ui/drts-design-canvas/tenant-av-fallback.jsx build apps/tenant-console-web：TN_AvFallbackList / "
        "TN_AvFallbackDetail。顯示 planned vs actual fulfillment、fallback stage、ETA 變更、billing/SLA treatment；文案走 "
        "tenantMessageCode（TnMsgSlot）；不顯示 raw event / technical reason dictionary / 事故證據原檔 / ROC internal notes。"
        "接 P2-DP-C3-001 tenant projection + P2-DP-S1-001 catalog。",
        "P2-DP-C3-001,P2-DP-S1-001",
        "apps/tenant-console-web/,docs/05-ui/drts-design-canvas/tenant-av-fallback.jsx",
        "Tenant fallback list/detail match canvas; planned vs actual + fallback stage + ETA + billing/SLA shown; copy from "
        "tenantMessageCode; no raw event/internal reason exposed; typecheck+build pass",
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
    result = subprocess.run(cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False)
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    print(f"  {task_id:16s}  {owner:>8s} -> {reviewer:>8s}  | {title[:62]}")
    return True


def main() -> int:
    print(f"Registering {len(TASKS)} Phase 2 V1 fallback UI tasks under '{PHASE}'\n")
    success = 0
    for i, task in enumerate(TASKS):
        if register(task):
            success += 1
        if i < len(TASKS) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {success}/{len(TASKS)} tasks registered.")
    return 0 if success == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
