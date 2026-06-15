#!/usr/bin/env python3
"""Dispatch the i18n FULL-SWEEP remediation wave (2026-06-14).

Inventory of every business-app entry point (2026-06-14) found bilingual (en/zh-TW)
coverage is complete in the central catalogs but broken at the PAGE layer:

  DEFECT B — tenant-console-web has the full i18n stack (lib/i18n.tsx + 844-key
    translations.ts at 100% en/zh parity) but its 27 admin page files BYPASS t() and
    hardcode zh-TW literals; the app has a language toggle, so EN view stays Chinese.
  DEFECT C — passenger-web (~121), tenant-portal-web (~274, staging-deployed),
    concierge-portal-web (~86) are English-only with NO i18n infra at all → Taiwanese
    users see only English.

Healthy (no action): platform-admin, bank-console, ops-console, enterprise-dispatch,
partner-booking, fleet-partner-portal. Out of scope: driver-app (Expo RN), assisted-entry
(placeholder).

Design (maximize parallel, minimize merge conflict — per operator):
  - Each of the 3 frontend apps = ONE self-contained task (no shared files → fully
    parallel, zero conflict). Builds the full canonical stack + converts all pages.
  - tenant-console = HUB + spokes. HUB lays per-domain key-block headers in BOTH the en
    and zh blocks of translations.ts; each spoke depends ONLY on HUB, owns disjoint page
    files, and adds keys ONLY under its own domain header.
  - VERIFY depends on the whole set.

Planning / source of truth: docs/05-ui/i18n-fullsweep-20260614.md
Owner hints follow feedback_agent_workload_ratio.md; supervisor availability-first
scheduler may reshuffle owners.

Usage:
    AI_NAME=Claude python3 scripts/dispatch-i18n-fullsweep-20260614.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids the supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[1]
PHASE = "i18n-fullsweep-20260614"
PLANNING_REF = "docs/05-ui/i18n-fullsweep-20260614.md"

_CANON = (
    "目標 i18n 標準（照既有健康 app 如 tenant-console/enterprise-dispatch）：lib/translations.ts "
    "(Locale=\"en\"|\"zh\"; const en={}; const zh:Record<keyof typeof en,string>={}; t(key,locale,params)) + "
    "lib/i18n.tsx (\"use client\" LanguageProvider 讀 cookie/localStorage + router.refresh()，useTranslation()→{locale,setLocale,t}) + "
    "lib/locale-config.ts (LOCALE cookie \"drts-locale-v2\") + lib/server-locale.ts (getServerLocale 伺服端讀 cookie)；"
    "layout.tsx <html lang={locale}> 包 <LanguageProvider defaultLocale={await getServerLocale()}>；shell 內語言切換鈕呼叫 setLocale。"
    "zh-TW 為主 (defaultLocale=\"zh\")。禁止 inline i18n：不得 locale===\"en\"?a:b、不得內聯 {en,zh}、不得本地 copy()/tx() helper、"
    "不得硬編碼 CJK 或硬編碼 JSX 英文文字/placeholder/title/aria-label/alt 字面，全部走 t()。glossary：booking 訂單、trip 行程、"
    "receipt 收據、dispatch 派車、driver 司機、passenger 乘客、eligibility 資格、quota 額度、cost center 成本中心、webhook Webhook、"
    "API key API 金鑰、audit 稽核、settlement 結算、invoice 發票、statement 對帳單、notification 通知、rule 規則、SLA 服務水準、"
    "feature flag 功能旗標、settings 設定、degraded 降級、unsupported 不支援、reauth 重新驗證、read-only 唯讀。"
    "不得自行重設計 UI；有 design canvas 規格須對齊。No Lovable，僅動 drts apps/*。"
)
_FE_ACCEPT = (
    "full canonical i18n stack present (translations.ts/i18n.tsx/locale-config/server-locale); layout wraps LanguageProvider with "
    "<html lang>; shell has working language toggle; zh-TW primary; every page/component/route-data string via t() with en+zh; "
    "0 hardcoded CJK; 0 hardcoded user-facing English literals; 0 inline i18n; eslint --max-warnings=0 + typecheck + next build pass"
)
_TC_ACCEPT = (
    "target files: 0 hardcoded CJK, 0 hardcoded user-facing English, 0 inline i18n; all strings via central t() with en+zh; new keys "
    "added ONLY under this task's own domain header in lib/translations.ts (both en and zh blocks), glossary-consistent; "
    "eslint --max-warnings=0 + typecheck + next build pass for tenant-console-web"
)

# (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    # ─────────── DEFECT C: English-only frontends — build full stack (fully parallel) ───────────
    (
        "I18N2-FE-PASSENGER", "Claude2", "Codex",
        "passenger-web full bilingual i18n (zh-TW primary)",
        "apps/passenger-web 目前純英文、完全無 i18n 基建 (lang=\"en\"、無 provider)。建立完整 canonical 堆疊並把 17 路由全部雙語化："
        "components/passenger-shell.tsx + lib/navigation.ts (passengerNavItems/bookingFlowRoutes/tripFlowRoutes 的 label/note/outcome/body) "
        "+ app/**/page.tsx (/, book, book/{denied,ineligible,no-supply,degraded}, trip, trip/{cancel,completed,read-only,cancelled,reauth-required}, "
        "trips, receipts, auth, unauthenticated, unsupported)。乘客面 zh-TW 為主。" + _CANON,
        "", "apps/passenger-web/lib/,apps/passenger-web/components/,apps/passenger-web/app/", _FE_ACCEPT,
    ),
    (
        "I18N2-FE-CONCIERGE", "Codex", "Claude2",
        "concierge-portal-web full bilingual i18n",
        "apps/concierge-portal-web 純英文、無 i18n 基建（已有非 i18n 的 ConciergePortalProvider，LanguageProvider 需巢狀於其外或內並存）。"
        "建立 canonical 堆疊並雙語化 10 路由：/, login, start, lookup, callbacks, bookings/new, degraded, ineligible, denied, "
        "recording-unavailable，含 desk-catalog 等 lib 內顯示字串。" + _CANON,
        "", "apps/concierge-portal-web/lib/,apps/concierge-portal-web/components/,apps/concierge-portal-web/app/", _FE_ACCEPT,
    ),
    (
        "I18N2-FE-TENANTPORTAL", "Codex2", "Claude",
        "tenant-portal-web full bilingual i18n",
        "apps/tenant-portal-web 純英文、無 i18n 基建，但於 deploy-staging 部署中（非死碼）。注意它與 tenant-console-web 路由高度重疊"
        "(addresses/api-keys/audit/billing/feature-flags/users/webhooks/settings/notifications/passengers/reports/sla/booking-list…)；"
        "先確認與 tenant-console 的關係/意圖，若確為應淘汰的舊鏡像則於任務留言回報並停手，否則建立 canonical 堆疊並雙語化全部 17 路由。" + _CANON,
        "", "apps/tenant-portal-web/lib/,apps/tenant-portal-web/components/,apps/tenant-portal-web/app/", _FE_ACCEPT,
    ),

    # ─────────── DEFECT B: tenant-console HUB (lay key-block skeleton) ───────────
    (
        "I18N2-TC-HUB", "Claude", "Codex2",
        "tenant-console i18n hub: per-domain key-block headers (conflict-minimizing skeleton)",
        "apps/tenant-console-web 已有完整 i18n 堆疊與 844 鍵 (en/zh 對等) 但 admin 頁面全部硬編碼 zh-TW 繞過 t()。本 HUB 只做骨架，不轉頁面："
        "在 lib/translations.ts 的 en 區塊 (約 L3-1109) 與 zh 區塊 (約 L1110-2140) 各自加入每個 domain 的空 key-block 區塊標頭註解 "
        "(// ── settings / webhooks / apiKeys / costCenters / reports / rules / sla / audit / invoices / billing / passengers / addresses / "
        "users / integrationGovernance / notifications / featureFlags / home (i18n-fullsweep 20260614) ──)，讓各 spoke 在自己 domain 標頭下 append、"
        "降低 translations.ts merge 衝突。確認 zh 仍為 Record<keyof typeof en,string> 不破型別、typecheck+build 綠。" + _CANON,
        "", "apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),

    # ─────────── DEFECT B: tenant-console spokes (each depends ONLY on HUB) ───────────
    (
        "I18N2-TC-SETTINGS", "Codex", "Codex2",
        "tenant-console settings i18n centralize",
        "app/settings/page.tsx (256 CJK) + app/settings/settings-notification-table.tsx：硬編碼 zh-TW（如「無上限」「尚未設定」"
        "「重新抓取目前 settings snapshot。」等）全部收斂進 translations.ts settings 區塊 (en+zh) 並改走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/settings/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-WEBHOOKS", "Codex2", "Codex",
        "tenant-console webhooks i18n centralize",
        "app/webhooks/page.tsx (315 CJK) + app/webhooks/secret-reveal-card.tsx：webhook 端點/密鑰揭露/測試派送字串全部收斂進 "
        "translations.ts webhooks 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/webhooks/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-APIKEYS", "Claude2", "Gemini",
        "tenant-console api-keys i18n centralize",
        "app/api-keys/api-key-manager.tsx (227 CJK) + app/api-keys/page.tsx：API 金鑰管理字串收斂進 translations.ts apiKeys 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/api-keys/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-COSTCENTERS", "Gemini", "Codex",
        "tenant-console cost-centers i18n centralize",
        "app/cost-centers/cost-centers-manager.tsx (190 CJK) + app/cost-centers/page.tsx + app/cost-centers/actions.ts：成本中心字串"
        "收斂進 translations.ts costCenters 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/cost-centers/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-REPORTS", "Codex", "Gemini2",
        "tenant-console reports i18n centralize",
        "app/reports/reports-manager.tsx (164 CJK)（含其 page.tsx）：報表字串收斂進 translations.ts reports 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/reports/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-RULES", "Codex2", "Claude2",
        "tenant-console rules i18n centralize",
        "app/rules/rules-manager.tsx (163 CJK)（含其 page.tsx）：規則字串收斂進 translations.ts rules 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/rules/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-SLA-AUDIT", "Gemini2", "Codex2",
        "tenant-console sla + audit i18n centralize",
        "app/sla/sla-manager.tsx (139) + app/sla/page.tsx + app/audit/page.tsx (137)：SLA 與稽核字串收斂進 translations.ts sla/audit 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/sla/,apps/tenant-console-web/app/audit/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-INVOICES-BILLING", "Copilot", "Codex",
        "tenant-console invoices + billing i18n centralize",
        "app/invoices/page.tsx (132) + app/billing/page.tsx (62)：發票與帳務字串收斂進 translations.ts invoices/billing 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/invoices/,apps/tenant-console-web/app/billing/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-PAX-ADDR", "Gemini", "Codex2",
        "tenant-console passengers + addresses i18n centralize",
        "app/passengers/page.tsx (120) + app/addresses/page.tsx (103)：乘客與地址字串收斂進 translations.ts passengers/addresses 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/passengers/,apps/tenant-console-web/app/addresses/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-USERS-INTGOV", "Codex", "Copilot",
        "tenant-console users + integration-governance i18n centralize",
        "app/users/page.tsx (92) + app/integration-governance/page.tsx + app/integration-governance/refresh-control.tsx：使用者與整合治理字串"
        "收斂進 translations.ts users/integrationGovernance 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/users/,apps/tenant-console-web/app/integration-governance/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-NOTIFICATIONS", "Claude2", "Codex",
        "tenant-console notifications i18n centralize",
        "app/notifications/page.tsx (82) + app/notifications/notification-matrix-form.tsx + app/notifications/constants.ts：通知矩陣字串"
        "收斂進 translations.ts notifications 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/notifications/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-FEATUREFLAGS", "Copilot", "Gemini",
        "tenant-console feature-flags i18n centralize",
        "app/feature-flags/page.tsx (67)：功能旗標字串收斂進 translations.ts featureFlags 區塊並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/feature-flags/,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),
    (
        "I18N2-TC-HOME-SHARED", "Claude", "Codex2",
        "tenant-console home + shared lib i18n centralize",
        "app/page.tsx (60) + lib/notification-canvas.tsx (30) + lib/formatters.ts：首頁與共用 lib 內顯示字串（formatters 內的「趟/月」「無上限」"
        "「尚未設定」等回傳字串須改為可由 caller 以 locale/t 提供，或移入 translations.ts home 區塊）收斂並走 t()。" + _CANON,
        "I18N2-TC-HUB", "apps/tenant-console-web/app/page.tsx,apps/tenant-console-web/lib/notification-canvas.tsx,apps/tenant-console-web/lib/formatters.ts,apps/tenant-console-web/lib/translations.ts", _TC_ACCEPT,
    ),

    # ─────────── VERIFY ───────────
    (
        "I18N2-VERIFY", "Codex2", "Claude2",
        "i18n full-sweep verification (4 apps green + guard)",
        "對 passenger-web / concierge-portal-web / tenant-portal-web / tenant-console-web 跑 pnpm eslint --max-warnings=0 + typecheck + next build 全綠；"
        "新增/執行 scripts/i18n-guard.mjs（掃 4 app 的 app|components|lib 的 tsx/ts 排除 translations.ts，fail：內聯 copy/tx helper、locale=== 顯示三元、"
        "內聯 {en,zh}、硬編碼 CJK、硬編碼 JSX 英文文字節點與 placeholder/title/label/aria-label/alt 裸字面）達 0 violation；抽查 en/zh 兩語皆正確渲染、glossary 一致。" + _CANON,
        "I18N2-FE-PASSENGER,I18N2-FE-CONCIERGE,I18N2-FE-TENANTPORTAL,I18N2-TC-SETTINGS,I18N2-TC-WEBHOOKS,I18N2-TC-APIKEYS,I18N2-TC-COSTCENTERS,I18N2-TC-REPORTS,I18N2-TC-RULES,I18N2-TC-SLA-AUDIT,I18N2-TC-INVOICES-BILLING,I18N2-TC-PAX-ADDR,I18N2-TC-USERS-INTGOV,I18N2-TC-NOTIFICATIONS,I18N2-TC-FEATUREFLAGS,I18N2-TC-HOME-SHARED",
        "scripts/i18n-guard.mjs,apps/passenger-web/,apps/concierge-portal-web/,apps/tenant-portal-web/,apps/tenant-console-web/",
        "all 4 apps eslint+typecheck+build green; i18n-guard 0 violations across the 4 apps; en/zh both render; glossary consistent",
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
    dep0 = deps.split(",")[0] if deps else ""
    print(f"  {task_id:24s} {owner:>8s} -> {reviewer:>8s} | {title[:44]:44s} deps=[{dep0}{'…' if ',' in deps else ''}]")
    return True


def main():
    print(f"Registering {len(TASKS)} tasks under phase '{PHASE}'\n")
    ok = 0
    for i, t in enumerate(TASKS):
        if register(t): ok += 1
        if i < len(TASKS) - 1: time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {ok}/{len(TASKS)} registered. Supervisor picks up on next scan (~60s).")
    return 0 if ok == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
