#!/usr/bin/env python3
"""Dispatch the Ops Console body-parity remediation wave to the supervisor.

Source of truth: docs/05-ui/ops-console-body-parity-audit-20260602.md

Why a NEW wave (new task IDs) instead of re-opening UI-FE-OPS-*:
  The prior UI-FE-OPS-* per-page briefs are marked `review_approved` but the
  work is NOT on origin/dev (audit verified: /complaints/[caseNo] and
  /contracts/[contractId] are 404; /callcenter is still bespoke; detail pages
  still mix Management `Stepper`/`Timeline` + `WorkflowEmptyState`). Stranded
  review_approved tasks are not re-queued by `assign` (it does not reset
  status), so this wave uses fresh `OPS-PARITY-*` IDs (status -> backlog ->
  supervisor dispatch) that reference the audit doc.

Parallelism design (per user: maximize parallel, minimize unnecessary deps):
  - OPS-PARITY-PRIM is the ONLY upstream hub (adds the missing Canvas
    primitives so 13 page tasks don't each reinvent CanvasTimeline/etc).
  - OPS-PARITY-TITLES has ZERO deps (pure title/translation edits).
  - Every other page task depends ONLY on PRIM, never on each other.
  - OPS-PARITY-VERIFY depends on the whole set (route smoke + anti-mixing).

Owner hints follow feedback_agent_workload_ratio.md (Codex/Codex2 heavy).
Supervisor availability-first scheduler may reshuffle owners.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-ops-console-parity-remediation.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids the supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[2]
PHASE = "ops-console-parity-remediation-202606"
PLANNING_REF = "docs/05-ui/ops-console-body-parity-audit-20260602.md"
APP = "ops-console-web"

# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    # ── Foundation hub (the one necessary dependency) ──────────────────────
    (
        "OPS-PARITY-PRIM",
        "Claude2",
        "Codex2",
        "Add missing Canvas primitives (Stepper/Timeline/EmptyState/ActionButton/HealthBanner/StaleBanner/BiLabel)",
        "依審計 §6 P0-A：在 packages/ui-web/src/canvas-primitives 補齊 canvas 缺的 primitives 並從 @drts/ui-web barrel 以 Canvas* 匯出："
        "CanvasStepper、CanvasTimeline、CanvasEmptyState（6 個 EmptyReason）、CanvasActionButton（descriptor 驅動，low/medium/high 風險確認 + required reason）、"
        "CanvasHealthBanner、CanvasStaleBanner、CanvasBiLabel。視覺照 ops-screens-*.jsx mock。這是 de-mix / detail / forms-to-action 的共用基礎，須先落地避免各頁各自造輪子。"
        "與 platform-admin / tenant-console 共用，不要做成 ops 專用。",
        "",
        "packages/ui-web/src/canvas-primitives/index.tsx,packages/ui-web/src/index.tsx",
        "CanvasStepper/CanvasTimeline/CanvasEmptyState/CanvasActionButton/CanvasHealthBanner/CanvasStaleBanner/CanvasBiLabel exported from @drts/ui-web; storybook stories render; pnpm --filter @drts/ui-web typecheck + build-storybook pass",
    ),
    # ── Fully independent (no deps) ────────────────────────────────────────
    (
        "OPS-PARITY-TITLES",
        "Gemini",
        "Codex",
        "Ops Console title parity (8 pages) to canvas wording",
        "依審計 §6 P2-A：修正 PageHeader 標題用字對齊 canvas：dashboard 營運總覽（非儀表板）、complaints 客訴中心（非客訴管理）、incidents 事故中心（標題不可是 {count} 筆事故顯示中）、reports 報表（非報表中心）、vehicles 車輛（非車輛登記）、contracts 合約（非合約管理）、maintenance 車輛保修（非維修保養）、feature-flags 功能旗標 · read only、drivers 司機；detail 頁 PageHeader 標題須為 entity id + state pills（非卡片標題如時間軸）。改 lib/translations.ts + 各 page PageHeader title。",
        "",
        "apps/ops-console-web/lib/translations.ts,apps/ops-console-web/app/",
        "All 8 listed pages render the canvas title; detail pages show id+state-pill headers; pnpm --filter @drts/ops-console-web typecheck + build pass",
    ),
    # ── Missing routes (dep: PRIM only) ────────────────────────────────────
    (
        "OPS-PARITY-CMPID",
        "Claude2",
        "Codex",
        "Create /complaints/[caseNo] route (NEW, currently 404) per OC_ComplaintDetail",
        "依審計 §7.6 + ops-screens-2 OC_ComplaintDetail 新建 apps/ops-console-web/app/complaints/[caseNo]/page.tsx：header caseNo + SLA breached + severity pills；左欄 Case summary CanvasDL(3 欄) + cross-actor CanvasTimeline；右欄 PII-masked recording 卡 + linked-entities CanvasDL + recovery-notes banner；actions note/assign/resolve（medium）/escalate（high+reason）走 CanvasActionButton；notFound() 與 closed/resolved 唯讀變體；/complaints 列可點進來。全部用 Canvas primitives，不得用 Management Timeline。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/complaints/[caseNo]/page.tsx",
        "Route returns 200; row link from /complaints works; uses CanvasTimeline (no Management Timeline); escalate is high+reason; pnpm --filter @drts/ops-console-web typecheck + build pass",
    ),
    (
        "OPS-PARITY-CONID",
        "Copilot",
        "Codex",
        "Create /contracts/[contractId] route (NEW, currently 404) per OC_ContractDetail",
        "依審計 §7.19 + ops-screens-3 OC_ContractDetail 新建 apps/ops-console-web/app/contracts/[contractId]/page.tsx：header contract id + active + read-only·ops scope pills；operational-terms CanvasDL（modifiable window / proof / waiting / no-show / SLA profile / effective version / partner program / auth mode）；authority-redirect banner（mutation 在 Platform Admin /partners，新分頁）；linked tenant/partner CanvasDL；version-history CanvasTimeline。ops 端唯讀；/contracts 列可點進來。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/contracts/[contractId]/page.tsx",
        "Route returns 200; row link from /contracts works; read-only at ops; cross-app new-tab link present; uses CanvasTimeline; typecheck + build pass",
    ),
    # ── Callcenter full rebuild (dep: PRIM only) ───────────────────────────
    (
        "OPS-PARITY-CC",
        "Codex",
        "Claude",
        "Rebuild /callcenter on Canvas primitives (currently bespoke, 3373 lines)",
        "依審計 §7.4 + §6 P0-C：callcenter 目前只用 CanvasPageHeader、其餘全是手刻 <div>/<Input>（3373 行）。重建為 OC_Callcenter 三欄版面：Waiting list CanvasCard + active-session CanvasCard（CanvasDL/CanvasField/CanvasInput/CanvasSelect）+ 右欄 callback/recording CanvasCard；Q-OPS04 一個 agent 一個 active session；actions（new_session/close_session/create_callback/create_booking/transfer-to-complaint）走 CanvasActionButton；empty 用 CanvasEmptyState（no_data/external_unavailable）。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/callcenter/page.tsx",
        "Body uses CanvasCard/CanvasTable/CanvasActionButton/CanvasEmptyState (0 bespoke panels); one-active-session rule; transfer-to-complaint redirects; typecheck + build pass",
    ),
    # ── De-mix detail pages (dep: PRIM only; independent of each other) ─────
    (
        "OPS-PARITY-DEMIX-DSPID",
        "Codex2",
        "Codex",
        "De-mix /dispatch/[dispatchId]: Management Stepper/Timeline -> Canvas",
        "依審計 §7.3：dispatch/[dispatchId] 將 Management Stepper + Timeline 換成 CanvasStepper + CanvasTimeline；候選表/gate CanvasDL 對齊 canvas；CTA（fare override = high+reason）走 CanvasActionButton；確認 owned/forwarded domain badge；評估是否將 param 由 [dispatchId] 改名為 [workItemId]（或文件化 alias）。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx,apps/ops-console-web/app/dispatch/dispatch-workflow.tsx",
        "grep for Stepper/Timeline/WorkflowEmptyState/ManagementTone in this file returns 0; CTAs descriptor-driven; typecheck + build pass",
    ),
    (
        "OPS-PARITY-DEMIX-INCID",
        "Codex",
        "Codex2",
        "De-mix /incidents/[incidentId]: Management Timeline -> CanvasTimeline",
        "依審計 §7.8：incidents/[incidentId] 將 Management Timeline 換成 CanvasTimeline；CTA（notify_police/lift_suppression/close = high+reason，含 disabledReasonCode incident_open/recovery_required）走 CanvasActionButton；確認 PageHeader 標題為 inc id + critical/in_response pills（非卡片標題）；service-recovery 清單維持 canvas 樣式。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/incidents/[incidentId]/page.tsx,apps/ops-console-web/app/incidents/[incidentId]/incident-detail-action-panel.tsx",
        "grep Timeline/Management* in this route returns 0; high-risk CTAs descriptor-driven with disable reasons; header is id+pills; typecheck + build pass",
    ),
    (
        "OPS-PARITY-DEMIX-DRVID",
        "Codex2",
        "Claude2",
        "De-mix /drivers/[driverId]: Timeline/WorkflowEmptyState/ManagementTone -> Canvas",
        "依審計 §7.15：drivers/[driverId] 將 Management Timeline/TimelineItem/ManagementTone + WorkflowEmptyState 換成 CanvasTimeline/CanvasEmptyState；SOS active 時的 page chrome 狀態；force_offline/suppress = high+reason（disabledReasonCode sos_in_response/already_active）走 CanvasActionButton；6 個 tab 對齊 canvas。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/drivers/[driverId]/page.tsx",
        "grep Timeline/WorkflowEmptyState/ManagementTone/TimelineItem returns 0; SOS chrome state present; high-risk CTAs descriptor-driven; typecheck + build pass",
    ),
    (
        "OPS-PARITY-DEMIX-VEHID",
        "Claude",
        "Codex",
        "De-mix /vehicles/[vehicleId]: Timeline/WorkflowEmptyState/ManagementTone -> Canvas",
        "依審計 §7.17：vehicles/[vehicleId]（NEW Q-OPS02 已存在）將 Management Timeline/TimelineItem/ManagementTone + WorkflowEmptyState 換成 CanvasTimeline/CanvasEmptyState；offboarding banner + 跨 app 連結（Platform Admin /fleet·Offboarding，新分頁）；regulatory CanvasDL + maintenance 表；ops 端唯讀。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/vehicles/[vehicleId]/page.tsx",
        "grep Timeline/WorkflowEmptyState/ManagementTone/TimelineItem returns 0; cross-app new-tab links; read-only at ops; typecheck + build pass",
    ),
    (
        "OPS-PARITY-DEMIX-LIST",
        "Codex",
        "Codex2",
        "De-mix list pages: complaints Timeline + dispatch WorkflowEmptyState -> Canvas",
        "依審計 §7.5 + §7.2：complaints 列表頁移除/改用 CanvasTimeline（timeline 本屬 detail；列表頁不應有 Management Timeline）；dispatch 列表頁 + dispatch/forwarded-order-board.tsx 將 WorkflowEmptyState 換成 CanvasEmptyState；確認 6 子看板欄位對齊 canvas；forwarded board inspect adapter 開 Platform Admin /adapter-registry 新分頁。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/complaints/page.tsx,apps/ops-console-web/app/dispatch/page.tsx,apps/ops-console-web/app/dispatch/forwarded-order-board.tsx",
        "grep Timeline/WorkflowEmptyState in complaints+dispatch returns 0 (CanvasEmptyState only); 6 sub-board columns match canvas; typecheck + build pass",
    ),
    # ── Forms-to-actions on list pages (dep: PRIM only) ────────────────────
    (
        "OPS-PARITY-FORMS-INC",
        "Codex2",
        "Codex",
        "/incidents: inline forms -> modal+descriptor actions; add guardrail card + SOS banner",
        "依審計 §7.7：incidents 列表頁將 inline create form 移到 modal/drawer 後面，CTA 走 CanvasActionButton（create=medium）；新增 Governance guardrail 三條鐵律 info 卡；SOS critical banner；列表保持 table-first；標題對齊（與 TITLES 不衝突，以 TITLES 為準）。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/incidents/page.tsx",
        "Create form lives in modal behind CanvasActionButton; 3-rule guardrail card present; SOS banner; table-first; typecheck + build pass",
    ),
    (
        "OPS-PARITY-FORMS-MNT",
        "Gemini2",
        "Codex",
        "/maintenance: inline create/edit -> modal+descriptor actions (edit/complete)",
        "依審計 §7.13：maintenance 將 inline create/edit form 移到 modal/drawer；edit/complete 走 CanvasActionButton（含 disabledReasonCode completed/not_in_progress）；逾期高亮；4 個狀態 tab 對齊 canvas；table-first。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/maintenance/page.tsx",
        "Create/edit in modal; edit/complete descriptor-driven with disable reasons; overdue highlight; typecheck + build pass",
    ),
    (
        "OPS-PARITY-FORMS-RPT",
        "Gemini",
        "Codex2",
        "/reports: inline create-job -> modal; download/retry descriptor actions",
        "依審計 §7.10：reports 將 inline create-job form 移到 modal 後面；download（僅 ready 可用，disabledReasonCode still_running/expired）+ failed 的 retry 走 CanvasActionButton；expired artifact 視覺提示；保留 Report jobs/Filing packages/Schedules tabs。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/reports/page.tsx",
        "Create-job in modal; download/retry descriptor-driven with disable reasons; expired-artifact visual; typecheck + build pass",
    ),
    # ── Descriptor-CTA + state-contract pages (dep: PRIM only) ─────────────
    (
        "OPS-PARITY-CTA-DSH",
        "Codex",
        "Codex2",
        "/dashboard: CTAs -> CanvasActionButton; KPI/banner/top-5 parity",
        "依審計 §7.1：dashboard 將手刻 getActionButtonLabel CTA 改為 CanvasActionButton；6 KPI 集合/順序對齊 canvas（進行中訂單/派遣佇列/可派司機/位置失聯/客訴未結/事故進行中）；今日待處理 banner stack（SOS/no_supply/sync_failed）+ 健康訊號 pill 卡；當前 dispatch top-5 表欄位/state pill 對齊；degraded banner（page-critical 時）。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/dashboard/page.tsx",
        "CTAs via CanvasActionButton; KPI set/order matches canvas; today-todo banner stack + health card; top-5 table parity; typecheck + build pass",
    ),
    (
        "OPS-PARITY-CTA-APR",
        "Claude",
        "Codex2",
        "/approval-requests: approve/reject/escalate descriptor CTAs + tenant chip + role-gated nav",
        "依審計 §7.9：approval-requests 確認 cross-tenant tenant chip tone、timeout-warning pill；approve/reject/escalate 全部 high+reason 走 CanvasActionButton；確認 sidebar item 對非 ops_approval_triage/ops_manager/ops_compliance 角色隱藏（Q-OPS10）。複用既有 approval-actions.tsx。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/approval-requests/page.tsx,apps/ops-console-web/app/approval-requests/approval-actions.tsx",
        "approve/reject/escalate are high+reason CanvasActionButton; tenant chip + timeout pill present; nav item role-gated; typecheck + build pass",
    ),
    (
        "OPS-PARITY-REV",
        "Codex2",
        "Codex",
        "/revenue: CanvasStaleBanner + mismatch drawer + cross-app deep link verify",
        "依審計 §7.11：revenue 加上 CanvasStaleBanner（T3 surface 依 UiRefreshMetadata.dataFreshness）；確認 mismatch drawer 為唯讀並 deep-link 到 Platform Admin /payments/reconciliation/{issueId}（新分頁，Q-OPS14）；確認 in-app 不做 mutation；4 KPI + settlement matrix 對齊 canvas。",
        "OPS-PARITY-PRIM",
        "apps/ops-console-web/app/revenue/page.tsx",
        "CanvasStaleBanner on live surface; mismatch drawer read-only with cross-app new-tab link; no in-app mutation; typecheck + build pass",
    ),
    # ── Verification (depends on the whole set) ────────────────────────────
    (
        "OPS-PARITY-VERIFY",
        "Codex",
        "Codex2",
        "Ops Console parity verification: 20-route Playwright smoke + anti-mixing + screenshots",
        "依審計 §9：全 20 route Playwright smoke（非 404、單一 Ops Console shell、正確標題、必備 tabs/sub-boards、必備 tables/cards、必備 high-risk CTA）；anti-mixing 斷言：apps/ops-console-web 內 grep Stepper/Timeline/WorkflowEmptyState/Management* = 0（僅 Canvas* 等價物）；anti-legacy-CSS：無 .admin-*/.ops-* class；20 route 1440x950 截圖對照 Ops Console.html；遠端 dev 部署後再跑一次 smoke。",
        "OPS-PARITY-PRIM,OPS-PARITY-TITLES,OPS-PARITY-CMPID,OPS-PARITY-CONID,OPS-PARITY-CC,OPS-PARITY-DEMIX-DSPID,OPS-PARITY-DEMIX-INCID,OPS-PARITY-DEMIX-DRVID,OPS-PARITY-DEMIX-VEHID,OPS-PARITY-DEMIX-LIST,OPS-PARITY-FORMS-INC,OPS-PARITY-FORMS-MNT,OPS-PARITY-FORMS-RPT,OPS-PARITY-CTA-DSH,OPS-PARITY-CTA-APR,OPS-PARITY-REV",
        "apps/ops-console-web/,docs/05-ui/ops-console-parity-verification-20260602.md",
        "All 20 routes pass smoke; anti-mixing grep = 0; screenshot set produced; remote dev smoke clean after deploy",
    ),
]


def register(task):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["TASK_TITLE"] = title
    # command_assign does not persist planning_ref, so embed the audit-doc
    # path in the summary itself for worker traceability.
    env["TASK_SUMMARY_ZH"] = f"[依據 {PLANNING_REF}] {summary_zh}"
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    cmd = ["bash", "tools/development-orchestrator/bin/ai-status.sh", "assign", task_id, owner, reviewer, title]
    result = subprocess.run(
        cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    dep_note = f"  deps=[{deps}]" if deps else "  deps=[] (independent)"
    print(f"  {task_id:26s} {owner:>8s} -> {reviewer:>8s} | {title[:62]}{dep_note}")
    return True


def main():
    print(
        f"Registering {len(TASKS)} tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
        f"Hub=OPS-PARITY-PRIM; OPS-PARITY-TITLES independent; rest depend only on PRIM.\n"
    )
    ok = 0
    for i, task in enumerate(TASKS):
        if register(task):
            ok += 1
        if i < len(TASKS) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {ok}/{len(TASKS)} registered. Supervisor picks up on next scan (~60s).")
    return 0 if ok == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
