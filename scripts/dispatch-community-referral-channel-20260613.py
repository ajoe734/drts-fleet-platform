#!/usr/bin/env python3
"""Dispatch the COMMUNITY-REFERRAL-CHANNEL backend (non-page) execution wave.

Source of truth:
  - Spec: docs/05-ui/community-app-referral-channel-spec-20260613.md
  - Screen reqs (design team, NOT autoworker): docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md

What this wave is:
  Social/community property-management App embeds DRTS ride-hailing; third-party
  referral channel with attribution + revenue-share. This is the MIRROR DIRECTION
  of the existing card-airport `partner_airport` channel (issuer_pays_drts) →
  the referral channel pays the OTHER way (`drts_pays_partner`).

  Verified against the live repo before dispatch (P0, 2026-06-13):
    - PartnerChannelEntry, tenant-partner ingress credentials, and the
      `partnerEntrySlug` attribution chain (command → order.partnerEntrySlug →
      billing-settlement repo) ALREADY EXIST and are test-covered
      (apps/api/tests/unit/owned-mobility.service.test.ts +
       billing-settlement.service.test.ts, 61 tests pass).
    - So this wave EXTENDS those modules; it does NOT rebuild attribution or
      partner entities. The only structurally-new pieces are the durable
      passenger-identity binding, the s2s handoff endpoint, and generalizing the
      settlement statement engine off its hardwired partner_airport direction.

Strict boundary (operator standing rules):
  - NO LLM UI DESIGN. This wave is BACKEND / API / INFRA ONLY. Every screen
    (passenger-web /embed, Channel Partner Portal, platform-admin referral mgmt)
    is handed to the human design team via the screen-requirements doc and is
    explicitly OUT OF SCOPE here. A task that touches a .tsx page surface is a
    DEFECT in this wave — the one app-infra exception (CRC-BE-008 embed security
    headers/middleware) is config/headers, never a page layout.
  - No Lovable. drts-side only.
  - zh-TW primary via central t() for any user-facing string a backend error
    surfaces.

Design (maximize parallel, minimize deps):
  - CRC-WP0 is the only foundation hub: lands contracts (referral channel type,
    durable-binding record, revenue-share rule, partner_referral settlement
    direction) + module scaffolds so downstream tasks don't collide.
  - Backend tasks depend on WP0 (+ their direct backend dep).
  - CRC-VERIFY depends on the whole set.

Owner hints follow feedback_agent_workload_ratio.md (Codex/Codex2 heavy); the
supervisor availability-first scheduler may reshuffle owners.

Usage:
    AI_NAME=Claude python3 scripts/dispatch-community-referral-channel-20260613.py
  (register against the live canonical root; run from the canonical working tree)
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids the supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[1]
PHASE = "community-referral-channel-20260613"
PLANNING_REF = "docs/05-ui/community-app-referral-channel-spec-20260613.md"

# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    # ── Foundation hub (the one necessary dependency) ──────────────────────
    (
        "CRC-WP0", "Claude2", "Codex2",
        "Contracts + scaffolds for referral channel / durable binding / revenue-share / settlement direction",
        "依 spec §5/§6：(1) 於 packages/contracts/src/ 新增並 export：referral 渠道型別（partnerType "
        "'referral_channel' 對應值或新 enum 成員）、ReferralRevenueShareRule（rateType=percent|per_trip、"
        "value、currency、effective 期間）、PartnerUserIdentityLinkRecord（entrySlug+partnerUserRef→"
        "drtsPassengerId、status、consentScope、lastSeenAt）、settlement 新方向常數 'drts_pays_partner' 與 "
        "channelKey 'partner_referral'。(2) 在 apps/api/src/modules/ 補對應 module 骨架/註冊，不實作商業邏輯。"
        "務必只擴充既有 tenant-partner / billing-settlement / owned-mobility，不新建第二套 partner 或結算引擎。",
        "", "packages/contracts/src/,apps/api/src/modules/",
        "Contracts compile & export; scaffolds registered; pnpm --filter @drts/contracts build + pnpm --filter @drts/api typecheck pass",
    ),

    # ════════════════ Identity / handoff (durable binding) ════════════════
    (
        "CRC-BE-001", "Codex", "Claude2",
        "Durable partner-user → passenger identity binding store",
        "依 spec §4.2/§5：新增 partner_user_identity_link 持久綁定（key=(entrySlug, partnerUserRef) → "
        "drtsPassengerId），含 repository（resolveOrCreate / touchLastSeen / status）與 migration。"
        "partnerUserRef 對 DRTS 不透明；同一 ref 必回同一 drtsPassengerId（重開頁面找得回行程的根本）。附 tests。",
        "CRC-WP0", "apps/api/src/modules/tenant-partner/,apps/api/migrations/",
        "Same (entrySlug,partnerUserRef) always resolves the same passenger; new ref creates one; migration applies; typecheck + test pass",
    ),
    (
        "CRC-BE-002", "Codex2", "Codex",
        "POST /partner/ingress/handoff — s2s token exchange minting short-lived passenger session",
        "依 spec §4.1/§7：實作 s2s handoff 端點：用既有 TenantPartnerService ingress 憑證驗證來源夥伴 → "
        "呼叫 CRC-BE-001 resolveOrCreate 綁定 → 簽發短期乘客 session JWT（payload 含 partnerEntrySlug + "
        "drtsPassengerId + 短 exp）。憑證絕不落前端；非授權來源拒絕。沿用既有 jwt-auth.service 簽發路徑。附 tests。",
        "CRC-BE-001", "apps/api/src/modules/tenant-partner/,apps/api/src/common/auth/",
        "Valid ingress cred → short-lived passenger JWT carrying partnerEntrySlug; invalid cred rejected; reopen reuses binding; typecheck + test pass",
    ),
    (
        "CRC-BE-003", "Codex", "Claude2",
        "Wire referral attribution from session identity into owned-passenger booking create",
        "依 spec §4.1 + P0：embed 乘客建單路徑要把 session identity 的 partnerEntrySlug 灌入建單 command，"
        "使 order.partnerEntrySlug 落地（P0 已證實 sink 端 owned-mobility→billing-settlement 通；本任務補 source 端）。"
        "確保 referral 渠道走 owned-mobility 既有派遣（D4），不另建供給。附 tests 斷言 referral 單的 partnerEntrySlug 正確。",
        "CRC-WP0,CRC-BE-002", "apps/api/src/modules/owned-mobility/",
        "Referral-context booking stamps order.partnerEntrySlug from identity; non-referral stays null; typecheck + test pass",
    ),

    # ════════════════ Settlement / revenue-share ════════════════
    (
        "CRC-BE-004", "Codex2", "Codex",
        "settlement-matrix: add partner_referral channel (drts_pays_partner)",
        "依 spec §6：在 settlement-matrix.ts 新增 channelKey 'partner_referral'（payerType=DRTS 平台、"
        "方向 drts_pays_partner、reconciliationPath=referral 對帳單+歸因稽核）。附 matrix 一致性 tests。",
        "CRC-WP0", "apps/api/src/modules/billing-settlement/",
        "partner_referral channel present with drts_pays_partner; matrix tests pass; typecheck pass",
    ),
    (
        "CRC-BE-005", "Codex", "Claude2",
        "Generalize settlement statement engine off hardwired partner_airport direction",
        "依 spec §6：settlement-statement.types.ts / 引擎目前寫死 SETTLEMENT_STATEMENT_DIRECTION="
        "'issuer_pays_drts' 與 CHANNEL_KEY='partner_airport'。泛化成依 channelKey 取方向，新增 referral 對帳單"
        "（每夥伴/每期：tripCount、GMV fareTotal、分潤額），沿用既有 artifactRef/manifestHash 稽核。"
        "不可破壞既有 partner_airport 對帳單行為（回歸測試保留）。附 referral 方向 tests。",
        "CRC-WP0,CRC-BE-004", "apps/api/src/modules/billing-settlement/",
        "Statement engine emits both issuer_pays_drts and drts_pays_partner correctly; partner_airport regression intact; typecheck + test pass",
    ),
    (
        "CRC-BE-006", "Codex2", "Claude2",
        "Referral revenue-share rate config + per-trip share computation",
        "依 spec §5(D2)：referral 分潤費率設定（rateType percent|per_trip + value + currency + effective），"
        "attach 於 partner entry 或獨立 rate store；結算時對每筆完成行程計算分潤額並進對帳單。費率變更寫 audit。附 tests。",
        "CRC-WP0,CRC-BE-005", "apps/api/src/modules/billing-settlement/,apps/api/src/modules/tenant-partner/",
        "Per-trip share computed per configured rate; rate change audited; statement totals reconcile; typecheck + test pass",
    ),

    # ════════════════ Partner-facing read API (feeds the portal) ════════════════
    (
        "CRC-BE-007", "Claude2", "Codex",
        "Partner-scoped read API: referral usage + revenue + statements",
        "依 spec §4.3/§8(P4)：為 Channel Partner Portal 提供 partner-scoped 唯讀 API："
        "GET 該夥伴 每期 usage（去重活躍用戶數、tripCount）、revenue 摘要、statements 列表+明細。"
        "嚴格限縮在呼叫方自己的 entrySlug（不得跨夥伴讀）；沿用既有 partner auth。附 tests（含越權拒絕）。",
        "CRC-BE-005", "apps/api/src/modules/tenant-partner/,apps/api/src/modules/billing-settlement/",
        "Partner sees only own usage/revenue/statements; cross-partner read denied; typecheck + test pass",
    ),

    # ════════════════ App-infra (non-page) + deploy ════════════════
    (
        "CRC-BE-008", "Codex", "Codex2",
        "passenger-web embed security headers/middleware (non-page config)",
        "依 spec §7：passenger-web 加 embed 安全設定（next headers / middleware，非頁面版面）：CSP "
        "frame-ancestors 由 partner entry entryHost 白名單動態決定、postMessage origin 白名單、X-Frame-Options 處理。"
        "非授權 host 不得內嵌。只動設定/中介層，不得設計或實作任何 .tsx 頁面（頁面屬設計團隊）。附 header 斷言測試。",
        "CRC-WP0", "apps/passenger-web/next.config.ts,apps/passenger-web/middleware.ts",
        "Authorized entryHost can frame; others blocked; postMessage origin enforced; no page layout introduced; build pass",
    ),
    (
        "CRC-INFRA-001", "Claude", "Codex2",
        "Add passenger-web to deploy-dev pipeline",
        "依 spec §3：passenger-web 目前不在 deploy-dev。比照既有 *-web 服務在 .github/workflows/deploy-dev.yml "
        "的 prepare resolve / build&push / deploy services 三段加入 passenger-web（waji profile service 命名 "
        "drts-dev-passenger-web）。僅 CI/部署設定，不動產品碼。",
        "", ".github/workflows/deploy-dev.yml",
        "passenger-web builds, pushes, and deploys in deploy-dev without breaking existing services; workflow lints",
    ),

    # ════════════════ Verify ════════════════
    (
        "CRC-VERIFY", "Codex2", "Claude2",
        "End-to-end backend verification of the referral channel",
        "依 spec 全文：整合測試 handoff → 綁定解析（含重開重用同一乘客）→ referral 建單歸因 → 完成行程 → "
        "partner_referral 對帳單產生且分潤額正確；並確保 partner_airport 不回歸。跑 pnpm --filter @drts/contracts build、"
        "pnpm --filter @drts/api typecheck/test 全綠。",
        "CRC-BE-001,CRC-BE-002,CRC-BE-003,CRC-BE-004,CRC-BE-005,CRC-BE-006,CRC-BE-007,CRC-BE-008,CRC-INFRA-001",
        "apps/api/tests/",
        "Full handoff→attribution→referral-statement integration test passes; partner_airport regression intact; contracts build + api typecheck + test all green",
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
    result = subprocess.run(
        cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    dep_note = f"  deps=[{deps.split(',')[0]}{'…' if ',' in deps else ''}]" if deps else "  deps=[] (hub)"
    print(f"  {task_id:16s} {owner:>8s} -> {reviewer:>8s} | {title[:50]}{dep_note}")
    return True


def main():
    print(
        f"Registering {len(TASKS)} BACKEND/INFRA (non-page) tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
        f"Hub=CRC-WP0 (contracts + scaffolds); all pages are OUT OF SCOPE (design team).\n"
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
