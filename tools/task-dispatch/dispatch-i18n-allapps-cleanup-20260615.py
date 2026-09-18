#!/usr/bin/env python3
"""Dispatch the i18n ALL-APPS cleanup wave (2026-06-15).

Re-audit (2026-06-15, tools/ci/i18n-guard.mjs extended to all 9 business web apps)
found the 6 apps the first wave's inventory had marked "healthy" (catalog en/zh
parity was complete) actually carry ~889 i18n-guard violations at the PAGE layer —
the original pass only checked catalog parity + a useTranslation import, not the
rendered JSX. Breakdown:
  ops-console-web 286, platform-admin-web 263, partner-booking-web 179,
  enterprise-dispatch-web 85, bank-console-web 40, fleet-partner-portal-web 36.
Categories: inline {en,zh} map 485, hardcoded jsx-text 186, locale-ternary 135,
hardcoded jsx attribute 59, local tx-helper 24.

The hardcoded jsx-text/attribute ones (~245, concentrated in partner-booking
components/airport-transfer-site.tsx=114 and across enterprise-dispatch pages=85)
are REAL displayed-text defects: monolingual zh literals that show Chinese even in
the English view. The inline {en,zh}/ternary/tx ones render bilingually but bypass
the central lib/translations.ts t().

passenger-web / concierge-portal-web / tenant-console-web are already 0-violation
(first wave). tenant-portal-web retired (FBP-007); driver-app = Expo RN (separate).

Each app-task is independent (its own files + its own app's translations.ts), so
they run fully parallel with no shared-file conflict.

Prereq landed first: orchestrator RCA fixes (worktree node_modules auto-provision +
unblock-recursion guard) so this wave does NOT strand like the tenant-console spokes.

Planning / guard: tools/ci/i18n-guard.mjs (run `node tools/ci/i18n-guard.mjs` after
extending APPS to all 9; 0 violations is the acceptance bar).

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-i18n-allapps-cleanup-20260615.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3
REPO = Path(__file__).resolve().parents[2]
PHASE = "i18n-allapps-cleanup-20260615"
PLANNING_REF = "tools/ci/i18n-guard.mjs"

_CANON = (
    "標準：所有 user-facing 字串走中央 lib/translations.ts 的 t()（client 用 useTranslation()，server 用 getServerLocale()+t(key,locale,params)），"
    "en/zh 雙語對等。**消除該 app 所有 i18n-guard violation**：把 inline {en,zh} 物件、`locale===\"zh\"?a:b` 三元、本地 copy/tx helper、"
    "硬編碼 JSX 文字節點、硬編碼 placeholder/title/aria-label/alt 全部收斂進 translations.ts 並走 t()。新增鍵須 en+zh 都有、glossary 一致"
    "（booking 訂單、trip 行程、receipt 收據、dispatch 派車、driver 司機、passenger 乘客、pickup 上車、drop-off 下車、review 確認/覆核）。"
    "自檢：把 tools/ci/i18n-guard.mjs 的 APPS 暫時指向本 app 跑 `node tools/ci/i18n-guard.mjs` 應 0 violation；並 eslint --max-warnings=0 + typecheck + next build 綠。"
    "不得自行重設計 UI；只做字串外部化。No Lovable，只動 drts apps/*。"
)
_ACC = (
    "i18n-guard 對該 app 0 violation；所有顯示字串經中央 t() 雙語；新增鍵 en+zh 對等、glossary 一致；"
    "eslint --max-warnings=0 + typecheck + next build 綠。"
)

# (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    (
        "I18N3-PARTNER-BOOKING", "Claude", "Codex",
        "partner-booking-web i18n cleanup (179 viol; airport-transfer-site 114 hardcoded zh)",
        "apps/partner-booking-web 有 179 個 violation，最大宗是 components/airport-transfer-site.tsx 的 114 個**硬編碼 zh JSX 文字**（返回列表/查看收據/上車地點/建立預約/送出預約… 英文檢視會顯示中文）+ app/demo/page.tsx 8 個 + 56 個 inline/三元。全部收斂進 lib/translations.ts 走 t()。" + _CANON,
        "", "apps/partner-booking-web/", _ACC,
    ),
    (
        "I18N3-ENTDISPATCH", "Codex", "Claude",
        "enterprise-dispatch-web i18n cleanup (85 hardcoded jsx-text)",
        "apps/enterprise-dispatch-web 有 85 個**全是硬編碼 JSX 文字**（散在 app/page.tsx、bookings/new|review|submitted、trip、help、components/enterprise-shell.tsx 等）。注意此 app 的 translations.ts 在 app/lib/translations.ts。全部走 t()。" + _CANON,
        "", "apps/enterprise-dispatch-web/", _ACC,
    ),
    (
        "I18N3-OPS", "Claude2", "Codex",
        "ops-console-web i18n cleanup (286 viol; mostly inline {en,zh}/tx)",
        "apps/ops-console-web 有 286 個 violation（多為 inline {en,zh} map + locale 三元 + 本地 tx helper，少數 jsx-text）。收斂進 lib/translations.ts t()。catalog 已大、注意 glossary 與既有鍵一致勿重複。" + _CANON,
        "", "apps/ops-console-web/", _ACC,
    ),
    (
        "I18N3-PLATADMIN", "Codex", "Gemini2",
        "platform-admin-web i18n cleanup (263 viol incl 34 jsx-text)",
        "apps/platform-admin-web 有 263 個 violation（34 硬編碼 jsx-text + 大量 inline {en,zh}/三元）。注意既有 lib/localized-labels.ts 是正規 {en,zh} 對映（可保留或併入 t()，依 guard 結果）。收斂進 translations.ts t()。" + _CANON,
        "", "apps/platform-admin-web/", _ACC,
    ),
    (
        "I18N3-BANK", "Gemini2", "Claude",
        "bank-console-web i18n cleanup (40 viol)",
        "apps/bank-console-web 有 40 個 violation。此 app 用 server-side t()+resolveLocale（無 i18n.tsx 屬正常）。收斂剩餘 inline/硬編碼進 lib/translations.ts，走既有 server t() 模式。" + _CANON,
        "", "apps/bank-console-web/", _ACC,
    ),
    (
        "I18N3-FLEET", "Claude", "Codex",
        "fleet-partner-portal-web i18n cleanup (36 viol)",
        "apps/fleet-partner-portal-web 有 36 個 violation（CJK 多在 lib/fleet-portal-fixtures.ts / data.server.ts 與少數頁面）。fixtures 若為純後端 mock 資料可標註豁免，頁面顯示字串走 t()。" + _CANON,
        "", "apps/fleet-partner-portal-web/", _ACC,
    ),
    (
        "I18N3-GUARD", "Claude2", "Codex",
        "extend i18n-guard to all 9 apps + wire CI",
        "把 tools/ci/i18n-guard.mjs 的 APPS 永久擴展為全部 9 個業務 web app（passenger/concierge/tenant-console + ops-console/platform-admin/enterprise-dispatch/partner-booking/fleet-partner-portal/bank-console）；加進 CI（ci-integ 或專屬 workflow）對 PR 跑、0 violation 才綠；保留合理豁免機制（fixtures/純後端 mock 資料）。" + _CANON,
        "", "tools/ci/i18n-guard.mjs,.github/workflows/", "i18n-guard covers all 9 apps; wired into CI failing on violations; documented exemption mechanism",
    ),
    (
        "I18N3-VERIFY", "Codex", "Claude",
        "all-apps i18n verification (9 apps 0 guard violations + builds green)",
        "對全部 9 個 app 跑 tools/ci/i18n-guard.mjs 達 0 violation；對有改動的 app 跑 eslint+typecheck+next build 全綠；抽查 en/zh 兩語渲染正確、glossary 一致。" + _CANON,
        "I18N3-PARTNER-BOOKING,I18N3-ENTDISPATCH,I18N3-OPS,I18N3-PLATADMIN,I18N3-BANK,I18N3-FLEET,I18N3-GUARD",
        "apps/,tools/ci/i18n-guard.mjs",
        "i18n-guard 0 violations across all 9 apps; changed apps eslint+typecheck+build green; en/zh both render",
    ),
]


def register(task):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["TASK_TITLE"] = title
    env["TASK_SUMMARY_ZH"] = f"[依據 {PLANNING_REF} 全 app 稽核] {summary_zh}"
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    cmd = ["bash", "tools/development-orchestrator/bin/ai-status.sh", "assign", task_id, owner, reviewer, title]
    r = subprocess.run(cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False)
    if r.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {r.stderr}\n"); return False
    dep0 = deps.split(",")[0] if deps else ""
    print(f"  {task_id:22s} {owner:>8s} -> {reviewer:>8s} | {title[:46]:46s} deps=[{dep0}{'…' if ',' in deps else ''}]")
    return True


def main():
    print(f"Registering {len(TASKS)} tasks under phase '{PHASE}'\n")
    ok = 0
    for i, t in enumerate(TASKS):
        if register(t): ok += 1
        if i < len(TASKS) - 1: time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {ok}/{len(TASKS)} registered. Supervisor picks up on next scan.")
    return 0 if ok == len(TASKS) else 1


if __name__ == "__main__":
    sys.exit(main())
