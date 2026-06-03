#!/usr/bin/env python3
"""Dispatch the dev-runtime functional-gap fix wave.

Source of truth: docs/05-ui/dev-runtime-functional-gap-report-20260603.md
(a browser-verified audit of the live dev deploy). Each task below targets a
bug that was confirmed visually / first-hand, with the code root cause already
located, so workers can go straight to the fix.

Usage:
    AI_NAME=Claude python3 scripts/dispatch-dev-runtime-gap-fixes.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[1]
PHASE = "dev-runtime-gap-fixes-202606"
PLANNING_REF = "docs/05-ui/dev-runtime-functional-gap-report-20260603.md"

# (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    (
        "GAP-OPS-LIST-RSC",
        "Codex",
        "Claude",
        "Fix HTTP 500 on /drivers /vehicles /contracts (RSC function-prop in <Table>)",
        "依報告 §2.2：這三頁是 async server component，把帶 render 函式的欄位（r: ({row}) => <JSX/>）傳給 client <Table>"
        "（drivers:1528 / vehicles:2130 / contracts:1962），RSC 禁止傳函式 → 資料有回應時 render 就 500（本地無 API 走空狀態才 200）。"
        "修法：把每頁的表格（欄位定義 + <Table>）抽成一個 \"use client\" 子元件，server 端只傳可序列化的 rows 進去，render 函式留在 client 子元件內，"
        "比照已正常的 /complaints、/incidents（它們整頁就是 \"use client\"）。不要把整個資料抓取頁改成 client（會失去 server fetch）。"
        "三頁同模式，逐頁驗證 dev 上回 200 並能看到資料列。",
        "",
        "apps/ops-console-web/app/drivers/page.tsx,apps/ops-console-web/app/vehicles/page.tsx,apps/ops-console-web/app/contracts/page.tsx",
        "All three routes return 200 against a reachable API (no 'Functions cannot be passed to Client Components'); rows render; "
        "pnpm --filter @drts/ops-console-web typecheck + build pass; verified on dev after deploy.",
    ),
    (
        "GAP-PA-FLEET-SHELL",
        "Claude2",
        "Codex",
        "Fix /fleet double shell (殼中殼): remove inner <CanvasShell>",
        "依報告 §2.3：app/layout.tsx 已用 <AdminShell> 包住所有頁，但只有 fleet/page.tsx 又自己包一層 <CanvasShell>（fleet/page.tsx:1715），"
        "造成畫面出現兩個完整的 PLATFORM ADMIN sidebar（截圖證實）。修法：移除 fleet 頁內那層 <CanvasShell> 外殼，直接 render 內容，"
        "與其他所有 PA 頁一致（其餘頁都沒有 <CanvasShell>）。保留頁面內容/tabs/表格本身，只拿掉多餘外殼與其帶來的 sidebar/topbar。",
        "",
        "apps/platform-admin-web/app/fleet/page.tsx",
        "Only one PLATFORM ADMIN sidebar renders on /fleet (no nested shell, single <main>); content/tabs intact; "
        "pnpm --filter @drts/platform-admin-web typecheck + build pass; verified on dev after deploy.",
    ),
    (
        "GAP-PA-PRICING-TABS",
        "Codex2",
        "Claude",
        "Fix /pricing tab switching (cannot leave passenger tab)",
        "依報告 §2.4（user 第一手回報）：進到 /pricing?tab=passenger 後點其他 tab 切不過去。成因是 activeTab 本地 state（:615）與一個把 "
        "params.set('tab', activeTab) 寫回 URL 的 useEffect（:644-650）以及從 URL 讀回 activeTab 的路徑（~:636-641）互相打架；tab 按鈕 onClick 只 setActiveTab（:1063-1067）。"
        "修法：讓 URL 成為單一真實來源——activeTab 由 useSearchParams 推導，點 tab 用 router 導頁（或 replace ?tab=），移除會回寫並覆蓋使用者選擇的衝突 effect。"
        "確認四個 tab（passenger/driver/subsidy/history）來回切換都正常、重新整理後維持當前 tab。",
        "",
        "apps/platform-admin-web/app/pricing/page.tsx",
        "Clicking each of passenger/driver/subsidy/history switches content and is reversible (round-trip); reload preserves the active tab; "
        "pnpm --filter @drts/platform-admin-web typecheck + build pass; verified on dev after deploy.",
    ),
    (
        "GAP-E2E-SUITE",
        "Codex",
        "Codex2",
        "Deterministic per-page/per-function e2e suite (ops-console + platform-admin)",
        "依報告 §5：目前 tests/e2e 只有 assistant+parity smoke，沒有逐頁逐功能測試。建立確定性的 Playwright 套件，對全部 39 條 route（ops 21 + admin 18）做明確斷言："
        "(a) 單一 shell（PLATFORM ADMIN / Ops shell sidebar 只出現一次、只有一個 <main>）；(b) 無 JS pageerror、無未預期 console error；(c) 每個 tab strip：逐 tab 點擊內容變更且可來回（round-trip）；"
        "(d) 每個 enabled 非破壞性按鈕點擊不崩潰；(e) 主要表單能開啟/關閉 modal。對需要資料的頁面用 seeded demo 資料或 mock。wire 進 CI（可先 build + start 本地或指向 dev URL）。"
        "這支套件要能抓到本報告列出的所有 bug（fleet 雙殼、pricing tab、三頁 500）作為迴歸保護。",
        "",
        "tests/e2e/,playwright.config.ts",
        "Suite covers all 39 routes with shell/pageerror/tab-roundtrip/button assertions; fails on the known bugs before their fixes and passes after; runs in CI.",
    ),
    (
        "GAP-VERIFY",
        "Claude",
        "Codex",
        "Re-run browser gap audit on dev after fixes; confirm 0 broken routes",
        "依報告 §6：上述修復都 merge + 部署到 dev 後，重跑瀏覽器稽核（HTTP 全 route + 視覺/功能），確認：ops 4 個 500 全清、/fleet 單殼、/pricing tab 正常、"
        "payments/attendance tab 手動覆核。產出更新後的 scoreboard 與截圖對照，覆寫 docs/05-ui/dev-runtime-functional-gap-report-20260603.md 的 §1/§3。",
        "GAP-OPS-LIST-RSC,GAP-PA-FLEET-SHELL,GAP-PA-PRICING-TABS,GAP-E2E-SUITE",
        "docs/05-ui/dev-runtime-functional-gap-report-20260603.md,.artifacts/func-audit/",
        "All 39 routes verified on dev: 0 HTTP 500, single shell everywhere, all tab strips round-trip; report scoreboard updated to 0 broken.",
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
    dep_note = f"  deps=[{deps}]" if deps else "  deps=[] (independent)"
    print(f"  {task_id:22s} {owner:>8s} -> {reviewer:>8s} | {title[:58]}{dep_note}")
    return True


def main():
    print(
        f"Registering {len(TASKS)} dev-runtime gap-fix tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
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
