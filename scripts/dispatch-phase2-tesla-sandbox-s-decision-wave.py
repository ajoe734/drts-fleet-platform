#!/usr/bin/env python3
"""Dispatch the Phase 2 S1-S6 decision-response wave.

Registers the 6 P2-DP-S*-001 tasks from the system-design team's ACCEPTED
S1-S6 response (S1=A,S2=B,S3=A,S4=A,S5=A,S6=B). Idempotent. Repo-buildable
(Gate B). Deps are set so S-tasks EXTEND the already-dispatched C-tasks (e.g.
S3 extends C4 billing, S4 merges with C5 audit) rather than collide.

Source:
  docs/02-architecture/phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md
  docs/02-architecture/phase2-tesla-fsd-sandbox/10b_phase2_ddl_decision_packet_addendum.sql

Usage:
    AI_NAME=Claude python3 scripts/dispatch-phase2-tesla-sandbox-s-decision-wave.py
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
    "docs/02-architecture/phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md"
)

TASKS = [
    (
        "P2-DP-S5-001",
        "Codex",
        "Codex2",
        "DDL addendum migration: 6 decision-packet tables (S5=a)",
        "依 S5 裁決：把 phase2-tesla-fsd-sandbox/10b_phase2_ddl_decision_packet_addendum.sql 落為 migration（接 10_ 之後），6 表："
        "av_evidence.evidence_legal_holds / evidence_legal_hold_release_requests / evidence_deletion_exceptions、"
        "av_sandbox.fulfillment_segments / sandbox_billing_treatments / sandbox_fulfillment_visibility，全 CREATE IF NOT EXISTS，"
        "與 C3/C4/C6 task migration 冪等共存（這支為權威，C3/C4/C6 consume 不重建）。對應 contracts 由 P2-WP0/各 C task 提供。",
        "P2-WP0",
        "apps/api/src/migrations/,docs/02-architecture/phase2-tesla-fsd-sandbox/10b_phase2_ddl_decision_packet_addendum.sql",
        "Migration applies cleanly on PostGIS; 6 tables match 10b addendum exactly; idempotent re-run; indexes present; "
        "no collision with C3/C4/C6 migrations (IF NOT EXISTS); typecheck/migration test green",
    ),
    (
        "P2-DP-S1-001",
        "Codex2",
        "Codex",
        "PassengerDisclosurePolicy + message catalog + acknowledgement (S1=a)",
        "依 S1 裁決(a)：新增 PassengerDisclosurePolicy / PassengerDisclosureMessageCatalog(Entry) / PassengerAcknowledgementRecord "
        "contracts + storage + API；channelRules 含 acknowledgementMode（per_booking_checkbox / program_level_contract / verbal_recorded "
        "/ operator_confirmed_notice）；載入 baseline message catalog v1（§1.6 的 messageCode，en-US 逐字、zh-TW baseline 標 legalApproved=false）；"
        "前端只用 messageCode 不硬寫文案；requiresAcknowledgement=true 必建 PassengerAcknowledgementRecord；缺 policy/catalog → AV passenger "
        "assignment fail_closed（可建 booking 不派 AV）。接 P2-DP-C3-001 之 visibility/messageCode。",
        "P2-DP-C3-001",
        "packages/contracts/src/,apps/api/src/modules/sandbox-dispatch-gate/,apps/api/src/modules/owned-mobility/",
        "Disclosure policy + catalog + acknowledgement persisted; missing config => AV assignment fail-closed; messageCode is "
        "sole text authority (no hard-coded legal copy); acknowledgement recorded when required; baseline v1 catalog loaded; unit+integration green",
    ),
    (
        "P2-DP-S3-001",
        "Codex2",
        "Claude2",
        "Fallback cost policy resolver (S3=a, default platform)",
        "依 S3 裁決(a)：新增 SandboxFallbackCostPolicyRecord（scope experiment/partner_program/tenant_contract、reasonOverrides、"
        "passengerSurchargeAllowed:false）+ resolver；precedence regulatory/safety > experiment > partner > tenant > platform default；"
        "baseline decision table（§3.4，平台原因一律 platform；partner/tenant 僅有合約時轉嫁）；找不到 policy → fallbackCostAbsorber=platform、"
        "policyResolution=default_platform_no_contract、audit sandbox.billing.fallback_cost_policy.defaulted。接 P2-DP-C4-001 之 "
        "SandboxBillingTreatmentRecord。",
        "P2-DP-C4-001",
        "packages/contracts/src/,apps/api/src/modules/billing-settlement/",
        "Resolver returns correct absorber per precedence+decision table; platform-cause fallbacks => platform; partner/tenant only "
        "with contract; no policy => default_platform_no_contract + audit; passenger never surcharged; unit+integration green",
    ),
    (
        "P2-DP-S4-001",
        "Claude",
        "Codex",
        "Phase2 audit context integration — single emitter, shared Phase1 store (S4=a)",
        "依 S4 裁決(a)：Phase2 audit **共用 Phase1 append-only audit store**，domain prefix + Phase2AuditContext JSONB 擴充；"
        "**與 P2-DP-C5-001 合併為單一 audit emitter**（C5 定全 audit 本體，S4 定 phase2 擴充欄位 + storage 策略），不得產生兩套；"
        "audit row 寫 Phase1 table、summary 不放大 payload、原始 Tesla payload 進 Raw Vault、evidence access 同時寫 Phase1 row + "
        "av_evidence.evidence_access_logs；查詢沿用既有 audit query + phase2 filter。",
        "P2-DP-C5-001",
        "packages/contracts/src/,apps/api/src/common/,apps/api/src/modules/audit-notification/",
        "Phase2 events land in Phase1 audit store via single emitter (no second store); Phase2AuditContext extension present; "
        "evidence access dual-written; existing audit query + phase2 filter works; no duplicate emitter vs C5; unit+integration green",
    ),
    (
        "P2-DP-S2-001",
        "Codex",
        "Codex2",
        "Compliance CMP_Regulator panel scope + regulator-cases API (S2=b, no portal)",
        "依 S2 裁決(b)：**不建獨立 regulator portal**。在 platform-admin Compliance 擴 CMP_Regulator panel（§2.3：experiment/case selector、"
        "manifest summary、bundle status、notification status、controlled export button、legal hold/masking indicator、access log table、"
        "export receipt panel）；baseline API GET/POST /api/platform-admin/compliance/regulator-cases[/{caseId}][/exports|/access-logs]；"
        "不新增外部 regulator login realm；沿用 controlled export + masking。",
        "P2-UI-CMP-001,P2-DP-C1-001",
        "apps/platform-admin-web/,apps/api/src/modules/accident-investigation/,docs/05-ui/drts-design-canvas/compliance-screens.jsx",
        "CMP_Regulator panel shows the §2.3 elements; regulator-cases API live; no external login realm added; controlled export + "
        "masking reused; matches canvas; typecheck+build pass",
    ),
    (
        "P2-DP-S6-001",
        "Codex2",
        "Codex",
        "KPI baseline collection mode (S6=b, collect-only no hard alert)",
        "依 S6 裁決(b)：Phase2 KPI 先蒐集+顯示，不設硬 alert 門檻；所有 KPI target 顯示 targetStatus=baseline_collecting；baseline 收集期 "
        "30 天或 50 trips（取先到，B2 另有要求以 B2 為準）；顯示 readiness/eligibility/provider completeness/takeover correlation/freeze success/"
        "fallback success/notification timeliness/telemetry freshness/export success/legal-hold release cycle。**安全閘門仍硬性**（feed missing/"
        "telemetry stale/recorder offline/operator missing/outside area/experiment expired/legal hold blocks deletion/notification overdue）"
        "維持 alert/fail-closed，與 KPI target 分離。",
        "P2-ROC-001,P2-REG-002",
        "apps/api/src/modules/regulatory-reporting/,apps/api/src/modules/operational-observability/",
        "KPI dashboard shows targetStatus=baseline_collecting (no hard threshold); baseline window configurable; safety gates still "
        "hard alert/fail-closed and separated from KPI targets; unit+integration green",
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
    print(f"  {task_id:16s}  {owner:>8s} -> {reviewer:>8s}  | {title[:64]}")
    return True


def main() -> int:
    print(f"Registering {len(TASKS)} Phase 2 S1-S6 decision-response tasks under '{PHASE}'\n")
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
