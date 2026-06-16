#!/usr/bin/env python3
"""Dispatch the COMMUNITY-REFERRAL-CHANNEL frontend (page) wave.

Now that the design team's canvas is landed on dev (DESIGN-CANVAS-REFERRAL-20260614,
PR #688), the referral-channel pages can be built TO canvas. This is the frontend
counterpart to the backend CRC-* wave (dispatch-community-referral-channel-20260613.py).

Design source-of-truth (read BEFORE writing any UI; do NOT self-design):
  - Group A passenger-web embed: docs/05-ui/drts-design-canvas/Passenger Embed.html
    + passenger-embed-screens.jsx + pe-data.jsx
  - Group B channel partner portal: docs/05-ui/drts-design-canvas/fleet-referral.jsx
    (+ Fleet Partner Portal.html / fleet-screens.jsx)
  - Group C platform-admin referral mgmt: docs/05-ui/drts-design-canvas/platform-referral.jsx
    (+ Platform Admin.html / platform-screens*.jsx)
  Page requirements: docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md
  Architecture: docs/05-ui/community-app-referral-channel-spec-20260613.md

Guardrails (operator standing rules):
  - Build to the canvas + @drts/ui-tokens realm tokens. Do NOT invent/redesign UI;
    if a screen is missing from canvas, write a screen-requirements note and STOP.
  - zh-TW primary via central lib/translations.ts t(); no inline i18n.
  - No Lovable; drts-side apps/* only.
  - Each FE task depends on its backend feed (CRC-BE-*) so it builds against a real
    contract; the supervisor holds it until the dep lands on dev.

Usage:
    AI_NAME=Claude python3 scripts/dispatch-community-referral-fe-20260614.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3
REPO = Path(__file__).resolve().parents[1]
PHASE = "community-referral-fe-20260614"
PLANNING_REF = "docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md"

# (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    (
        "CRC-FE-001", "Claude2", "Codex",
        "passenger-web /embed/[entrySlug] — 5-state handoff + booking (Group A)",
        "依 canvas 'Passenger Embed.html' + passenger-embed-screens.jsx + pe-data.jsx：在 apps/passenger-web "
        "建 /embed/[entrySlug]，含 5 態身分狀態機（Handoff/Reauth/Unsupported/Consent/Fallback）+ compact "
        "內嵌叫車/行程/收據流程，依 partner entry 解品牌（themeAccent/brandingMetadata）。串 CRC-BE-002 handoff "
        "session、配合 CRC-BE-008 embed 安全 headers。realm token、zh-TW t()，照 canvas 不自創。",
        "CRC-BE-002,CRC-BE-008", "apps/passenger-web/app/embed/,apps/passenger-web/components/",
        "5 embed states render to canvas; partner-branded; booking/trip/receipt wired to handoff session; typecheck + build pass",
    ),
    (
        "CRC-FE-002", "Claude2", "Codex2",
        "Channel Partner Portal — referral revenue/statements/usage (Group B)",
        "依 canvas fleet-referral.jsx（+ Fleet Partner Portal.html）：複製 fleet-partner-portal-web /revenue + "
        "/statements 版型，新增 referral 區塊：渠道總覽（去重活躍叫車用戶數/行程數/GMV/應收分潤）、用量明細、"
        "分潤對帳單列表+明細（方向 DRTS 付夥伴）。串 CRC-BE-007 partner-scoped 唯讀 API。realm token、zh-TW t()。",
        "CRC-BE-007", "apps/fleet-partner-portal-web/app/",
        "Referral revenue/usage/statements render to canvas from BE-007 API; partner-scoped; typecheck + build pass",
    ),
    (
        "CRC-FE-003", "Codex", "Claude2",
        "platform-admin referral channel management (Group C)",
        "依 canvas platform-referral.jsx（+ Platform Admin.html）：擴充 apps/platform-admin-web/app/partners 的 "
        "partner-entries 管理，新增 referral 渠道：建立/編輯（displayName/entrySlug/partnerType=referral_channel/"
        "entryHost 白名單/themeAccent）、分潤費率設定（rateType percent|per_trip/value/currency/生效期間，串 "
        "CRC-BE-006）、ingress 憑證簽發/撤銷（憑證僅顯示一次）。realm token、zh-TW t()，照 canvas。",
        "CRC-BE-006", "apps/platform-admin-web/app/partners/",
        "Referral channel create/edit + rate config + ingress cred mgmt render to canvas; wired to APIs; typecheck + build pass",
    ),
    (
        "CRC-FE-VERIFY", "Codex2", "Claude2",
        "Frontend verification of the referral channel pages",
        "依 canvas + screen-requirements：跑 passenger-web / fleet-partner-portal-web / platform-admin-web 的 "
        "pnpm lint + typecheck + build 全綠；自查每頁對齊 canvas realm token、無套皮、zh-TW t() 無 inline i18n。",
        "CRC-FE-001,CRC-FE-002,CRC-FE-003",
        "apps/passenger-web/,apps/fleet-partner-portal-web/,apps/platform-admin-web/",
        "All three apps lint/typecheck/build green; pages match canvas realm tokens; no inline i18n",
    ),
]


def register(task):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["TASK_TITLE"] = title
    env["TASK_SUMMARY_ZH"] = f"[依據 {PLANNING_REF}] {summary_zh}"
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    cmd = ["bash", "scripts/ai-status.sh", "assign", task_id, owner, reviewer, title]
    r = subprocess.run(cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False)
    if r.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {r.stderr}\n"); return False
    print(f"  {task_id:14s} {owner:>8s} -> {reviewer:>8s} | {title[:48]}  deps=[{deps.split(',')[0] if deps else ''}{'…' if ',' in deps else ''}]")
    return True


def main():
    print(f"Registering {len(TASKS)} FRONTEND tasks under phase '{PHASE}' (build to canvas)\n")
    ok = 0
    for i, t in enumerate(TASKS):
        if register(t): ok += 1
        if i < len(TASKS) - 1: time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {ok}/{len(TASKS)} registered. Supervisor picks up on next scan (~60s).")
    return 0 if ok == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
