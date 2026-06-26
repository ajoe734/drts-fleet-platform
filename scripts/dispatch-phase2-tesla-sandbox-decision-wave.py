#!/usr/bin/env python3
"""Dispatch the Phase 2 system-design decision-landing wave (C1-C6).

Registers the 6 P2-DP-C*-001 tasks defined by the AUTHORITATIVE system-design
decision packet (C1-C6 ACCEPTED) via ``scripts/ai-status.sh assign``. Idempotent.

Scope: repo-buildable (Gate B) backend/contracts/test only. UI screens stay
visual-team-gated (C2 task is token + shell scaffold ONLY, no screen design).
External-contract values (B1-B5) stay capability-gated and are NOT invented.

Source:
  docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md
  docs/02-architecture/phase2_tesla_fsd_sandbox_execution_plan_20260625.md (§2b)

Owner/reviewer follow workload ratio (Codex-heavy); supervisor may reshuffle.

Usage::

    AI_NAME=Claude python3 scripts/dispatch-phase2-tesla-sandbox-decision-wave.py
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
    "docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md"
)

# (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance_text)
TASKS = [
    (
        "P2-DP-C5-001",
        "Codex2",
        "Codex",
        "Phase2 canonical audit event catalog + Phase2AuditContext + ActionReceipt",
        "依裁決 §C5/§7：在 packages/contracts 建立 canonical audit event catalog 常數（§7.3 全表，<domain>.<resource>.<past_tense_action>）"
        "與 Phase2AuditContext 型別；提供 emit helper（各模組共用）；所有 write command 回 ActionReceipt(含 auditId)；"
        "append-only：報告修正用 amendment event(supersedesAuditId/amendsResourceVersion) 不 update 原 event；"
        "原始 provider payload/token/signed URL/乘客敏感資料不得寫進 audit summary。此為近-foundation，先 land 供他模組 emit。",
        "P2-WP0",
        "packages/contracts/src/,apps/api/src/common/",
        "Audit catalog constants exported & exhaustive vs §7.3; Phase2AuditContext compiles; emit helper writes append-only; "
        "ActionReceipt returned by sample command; sensitive fields excluded; unit tests green",
    ),
    (
        "P2-DP-C1-001",
        "Codex",
        "Codex2",
        "platform-admin Compliance/Investigation route group + scopes + deep-links",
        "依裁決 §C1/§3：Compliance & Investigation 併入 apps/platform-admin-web（route group /platform-admin/compliance、/investigations、"
        "/evidence/*、/regulatory-reports）；12 scopes(§3.4)，export.request≠export.approve、legal_hold.release.request≠approve 四眼分離；"
        "CrossAppResourceLink backend-provided deep-link（ROC 不拼 raw URL）；§10.3 之 compliance/investigations/evidence-exports/"
        "legal-holds API。ROC 只給事件摘要+freeze status+deep-link，不可 release hold / 下載原始完整證據。",
        "P2-WP0,P2-ACC-002,P2-EVD-002",
        "apps/api/src/modules/accident-investigation/,apps/api/src/modules/platform-admin/,apps/platform-admin-web/",
        "Route group + scopes enforced; export request and approve require different actors; ROC scope cannot release hold; "
        "deep-link is backend-provided; compliance/investigations APIs live; unit+integration green",
    ),
    (
        "P2-DP-C2-001",
        "Claude",
        "Codex",
        "ROC design-system: roc semantic token aliases + Ops-shell scaffold (no screens)",
        "依裁決 §C2/§4：packages/ui-tokens 新增 roc semantic aliases（§4.3 全表，中性深色 control-plane + 藍青 accent；"
        "status 色須過弱色對比測試）；apps/roc-console-web 採 Ops Console shell + @drts/ui-web primitives 之 scaffold（AppShell/Sidebar/"
        "drawer 接線、availableActions 驅動 CTA、write action 回 ActionReceipt）。**僅 token + shell scaffold，不含任何螢幕設計**——"
        "ROC 螢幕待視覺團隊 canvas，不得由 LLM 設計畫面。不建第二套 component library。",
        "P2-WP0,P2-ROC-001",
        "packages/ui-tokens/,apps/roc-console-web/",
        "roc token aliases resolve to existing semantic tokens; contrast test passes; roc-console-web shell builds reusing "
        "Ops shell + ui-web primitives; NO bespoke screen UI added; availableActions+ActionReceipt wired; typecheck+build green",
    ),
    (
        "P2-DP-C3-001",
        "Codex2",
        "Codex",
        "Sandbox fulfillment visibility contract + tenant/partner projection APIs",
        "依裁決 §C3/§5：新增 SandboxFulfillmentVisibilityRecord 與 mode/state/disclosure/reason enums(§5.2)；"
        "tenant/partner projection API(§10.3 GET .../sandbox-fulfillment)；partner webhook events(§5.5)；backend 只回 messageCode + "
        "user-safe category，frontend 只 i18n；passenger/tenant/partner 各自可見度依 §5.3-5.5，不外洩 FSD 內部事件/reason/raw takeover；"
        "provider_brand_disclosed 僅 partner 且政策允許。",
        "P2-WP0,P2-FBK-001,P2-GATE-001",
        "packages/contracts/src/,apps/api/src/modules/sandbox-dispatch-gate/,apps/api/src/modules/owned-mobility/",
        "Visibility record + enums exported; tenant/partner projection endpoints return messageCode not internal reason; "
        "partner webhook emits contract-approved fields only; passenger projection hides FSD internals; unit+integration green",
    ),
    (
        "P2-DP-C4-001",
        "Codex",
        "Claude2",
        "Fulfillment segment ledger + sandbox billing treatment (no fallback surcharge)",
        "依裁決 §C4/§6：新增 FulfillmentSegmentRecord 與 SandboxBillingTreatmentRecord(fallbackSurchargeApplied 固定 false)；"
        "同一 booking 一張顧客發票；fallback 不自動加收 passenger/tenant；human driver 走 Phase1 正常結算；AV/fallback 額外成本進 "
        "internal cost/partner subsidy ledger 不動 fare component；invoice/report dimensions(§6.4)；中途 fallback：AV segment 結束+人駕 "
        "segment 建立、發票仍一張。",
        "P2-WP0,P2-FBK-001",
        "packages/contracts/src/,apps/api/src/modules/billing-settlement/,apps/api/src/modules/sandbox-dispatch-gate/",
        "Segment ledger + billing treatment persisted; fallbackSurchargeApplied always false; AV->human fallback adds no "
        "customer charge; human driver gets Phase1 settlement; mixed fulfillment yields one invoice; unit+integration green",
    ),
    (
        "P2-DP-C6-001",
        "Claude2",
        "Codex2",
        "Legal-hold precedence + four-eyes release + deletion scheduler guard",
        "依裁決 §C6/§8：legal-hold precedence(§8.1 active hold>regulator>contract>normal>deletion request)；state machine "
        "draft→active→release_requested→released；place hold 本體(§8.4)；release four-eyes(B≠A，authority-triggered 需 release reference)；"
        "deletion scheduler 在同一 consistency boundary 檢查(§8.6) 全部條件，任一不過即 skip 並發 evidence.deletion.skipped_due_to_hold；"
        "provider 資料屆期前本地 preserve+驗 checksum(§8.7)；deletion request 衝突建 EvidenceDeletionExceptionRecord(§8.8)；hold scope "
        "遞迴 propagation(§8.9)。",
        "P2-WP0,P2-EVD-002",
        "packages/contracts/src/,apps/api/src/modules/vehicle-evidence/,apps/api/src/modules/accident-investigation/",
        "Hold precedence enforced; release requires different approver; active hold blocks deletion (skip event emitted); "
        "provider near-expiry triggers local preserve+checksum; deletion exception recorded on conflict; unit+integration green",
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
    print(f"  {task_id:16s}  {owner:>8s} -> {reviewer:>8s}  | {title[:70]}")
    return True


def main() -> int:
    print(
        f"Registering {len(TASKS)} Phase 2 decision-landing tasks under phase '{PHASE}'\n"
        f"(C1-C6 ACCEPTED; repo-buildable / Gate B; UI screens still canvas-gated)\n"
    )
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
