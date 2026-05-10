#!/usr/bin/env python3
"""
One-shot seed of UI-redesign tasks (Waves 0..5) into ai-status.json.

Drives scripts/ai_status.py::command_assign() in-process so we get one
save_state() / sync_all() at the end (instead of N separate writes).

Source of truth for task definitions:
docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md

Re-running is safe: if any seeded id already exists the script aborts
without modifying state.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
os.chdir(ROOT)

import ai_status  # noqa: E402

PLAN_REF = "docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md"

TASKS: list[dict] = [
    # ───── Wave 0 ─────────────────────────────────────────────────
    {
        "id": "RDX-W0-001",
        "title": "Pin design canvas as repo asset",
        "summary_zh": "將 drts.zip 解壓到 docs/05-ui/drts-design-canvas/ 並 commit，讓設計稿成為 repo 內 first-class 參照。",
        "phase": "Wave 0",
        "owner": "Claude2",
        "reviewer": "Claude",
        "depends_on": [],
        "artifacts": ["docs/05-ui/drts-design-canvas/", "docs/05-ui/README.md"],
        "acceptance": [
            "HTML files render in browser",
            "docs/05-ui/README.md lists canvas / diff report / work breakdown",
            "git log -- docs/05-ui/drts-design-canvas/ shows commit",
        ],
    },
    {
        "id": "RDX-W0-002",
        "title": "Seed UI redesign backlog into ai-status.json",
        "summary_zh": "把 work breakdown 列出的 task 寫進 ai-status.json (本 task 即在執行中)。",
        "phase": "Wave 0",
        "owner": "Claude2",
        "reviewer": "Claude",
        "depends_on": ["RDX-W0-001"],
        "artifacts": ["ai-status.json", ".orchestrator/task-briefs/"],
        "acceptance": [
            "All Wave 0..5 task IDs visible in ai-status.json tasks[]",
            "current-work.md regenerated and Task Board reflects backlog",
            "No ID collision with existing tasks",
        ],
    },
    {
        "id": "RDX-W0-003",
        "title": "Sprint mode hand-off",
        "summary_zh": "決定 UI redesign 是新 sprint (ui-redesign-wave-202605) 或掛在 closeout 後續波次；於 ai-status.json 記錄。",
        "phase": "Wave 0",
        "owner": "Claude",
        "reviewer": "Codex",
        "depends_on": ["RDX-W0-002"],
        "artifacts": ["ai-status.json", "current-work.md"],
        "acceptance": ["docs-site/index.html shows new sprint name after ./scripts/sync-state.sh"],
    },
    # ───── Wave 1 — tokens + primitives + storybook ──────────────
    {
        "id": "TOK-UI-001",
        "title": "Create packages/ui-tokens (cross-stack design tokens)",
        "summary_zh": "建立純 TS 常數的 token 套件。Web 與 RN 都 import。內容包含 owned/forwarded authority colors、4 console accents、status vocabulary、display strings、density scales。零 React/Tailwind 依賴。",
        "phase": "Wave 1",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["RDX-W0-002"],
        "artifacts": [
            "packages/ui-tokens/package.json",
            "packages/ui-tokens/src/index.ts",
            "packages/ui-tokens/src/colors.ts",
            "packages/ui-tokens/src/status.ts",
            "packages/ui-tokens/src/density.ts",
            "packages/ui-tokens/tsconfig.json",
        ],
        "acceptance": [
            "pnpm --filter @drts/ui-tokens typecheck",
            "Imported successfully from packages/ui-web/ and apps/driver-app/ via temporary test import",
            "No React / Tailwind / CSS-in-JS dependency",
        ],
    },
    {
        "id": "DSY-UI-001",
        "title": "Extend management-theme.ts with surface accents + authority",
        "summary_zh": "在 packages/ui-web/src/management-theme.ts 加入 4 console accent (platform=indigo, ops=coral, tenant=teal, partner=amber)、owned/forwarded 色、dark mode 變體；常數從 @drts/ui-tokens 取。",
        "phase": "Wave 1",
        "owner": "Claude2",
        "reviewer": "Codex2",
        "depends_on": ["TOK-UI-001"],
        "artifacts": [
            "packages/ui-web/src/management-theme.ts",
            "packages/ui-web/package.json",
        ],
        "acceptance": [
            "pnpm --filter @drts/ui-web typecheck",
            "pnpm --filter @drts/platform-admin-web typecheck",
            "pnpm --filter @drts/ops-console-web typecheck",
            "pnpm --filter @drts/tenant-console-web typecheck",
        ],
    },
    {
        "id": "DSY-UI-002",
        "title": "Authority + status primitives in ui-web",
        "summary_zh": "新增 / 完善 <AuthorityBadge>, <AuthorityBanner>, <PlatformBadge>，並擴充 <StatusChip> 支援所有 forwarded lifecycle tone。以 @drts/ui-tokens status enum 為唯一字串來源。",
        "phase": "Wave 1",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["DSY-UI-001"],
        "artifacts": [
            "packages/ui-web/src/management-primitives.tsx",
            "packages/ui-web/src/index.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ui-web typecheck",
            "pnpm --filter @drts/ui-web test",
            "Forwarded vs owned uses discriminated union prop type (no string literal)",
        ],
    },
    {
        "id": "DSY-UI-003",
        "title": "Shell redesign — sidebar + topbar",
        "summary_zh": "新增 <ManagementSidebar> (grouped section + per-item badge) 與 <ManagementTopbar> (breadcrumb / search / env / user)，替換現有扁平 <AppSidebar>。",
        "phase": "Wave 1",
        "owner": "Claude2",
        "reviewer": "Codex2",
        "depends_on": ["DSY-UI-002"],
        "artifacts": [
            "packages/ui-web/src/management-sidebar.tsx",
            "packages/ui-web/src/management-topbar.tsx",
            "packages/ui-web/src/management-shell.tsx",
            "packages/ui-web/src/index.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ui-web typecheck",
            "Sidebar grouped rendering + badge tone unit test",
            "All 3 existing console builds pass",
            "Old <AppSidebar> still exported for gradual migration",
        ],
    },
    {
        "id": "DSY-UI-004",
        "title": "Density + dark mode toggle support",
        "summary_zh": "Theme 加 density (compact/comfortable) 與 dark (boolean)，提供 <ManagementThemeProvider> + useTheme() hook 供 console 與 storybook 使用。",
        "phase": "Wave 1",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["DSY-UI-003"],
        "artifacts": [
            "packages/ui-web/src/management-theme-context.tsx",
            "packages/ui-web/src/index.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ui-web typecheck",
            "pnpm --filter @drts/ui-web test",
            "Provider works in storybook environment",
        ],
    },
    {
        "id": "SBK-UI-001",
        "title": "Storybook for @drts/ui-web",
        "summary_zh": "為 packages/ui-web 加 Storybook (Vite builder, Next.js compatible)。作為視覺對照 acceptance gate 的場域。",
        "phase": "Wave 1",
        "owner": "Gemini",
        "reviewer": "Codex",
        "depends_on": ["DSY-UI-001"],
        "artifacts": [
            "packages/ui-web/.storybook/",
            "packages/ui-web/package.json",
        ],
        "acceptance": [
            "pnpm --filter @drts/ui-web storybook 可啟動",
            "pnpm --filter @drts/ui-web build-storybook 在 CI 通過",
        ],
    },
    {
        "id": "SBK-UI-002",
        "title": "Stories for authority + status + shell with canvas side-by-side",
        "summary_zh": "為 DSY-UI-002 / DSY-UI-003 元件寫 story，每個 story 旁以 <iframe> 嵌入 docs/05-ui/drts-design-canvas/<file>.html 對應 artboard 作 side-by-side 比對。",
        "phase": "Wave 1",
        "owner": "Gemini2",
        "reviewer": "Copilot",
        "depends_on": ["SBK-UI-001", "DSY-UI-002", "DSY-UI-003", "RDX-W0-001"],
        "artifacts": [
            "packages/ui-web/src/management-primitives.stories.tsx",
            "packages/ui-web/src/management-sidebar.stories.tsx",
            "packages/ui-web/src/management-topbar.stories.tsx",
        ],
        "acceptance": [
            "Each story has Designed + Built side-by-side panes",
            "Reviewer signs off in ai-status.json review_notes_zh",
        ],
    },
    # ───── Wave 2 — Ops console reference impl ───────────────────
    {
        "id": "OPS-UI-RD-001",
        "title": "Adopt new shell in ops-console-web",
        "summary_zh": "用 <ManagementShell> (DSY-UI-003) 替換 ops-console 既有 sidebar + layout。Sidebar 改 grouped + badge。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["DSY-UI-003"],
        "artifacts": [
            "apps/ops-console-web/app/layout.tsx",
            "apps/ops-console-web/components/sidebar.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ops-console-web typecheck",
            "pnpm --filter @drts/ops-console-web build",
            "All 14 routes navigation matches design canvas Ops Console.html",
        ],
    },
    {
        "id": "OPS-UI-RD-002",
        "title": "Strip ad-hoc CSS, adopt ui-web primitives",
        "summary_zh": "刪除 ops-console-web/app/globals.css 內 .admin-* 規則，pages 改用 <Card> / <DataTable> / <StatusChip>。Tailwind 4 utility 仍可用。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["OPS-UI-RD-001"],
        "artifacts": ["apps/ops-console-web/app/globals.css"],
        "acceptance": [
            "grep -r '.admin-' apps/ops-console-web/app/globals.css 為空",
            "pnpm --filter @drts/ops-console-web typecheck / build / lint / test 全通過",
        ],
    },
    {
        "id": "OPS-UI-RD-003",
        "title": "Dashboard redesign per OC_Dashboard",
        "summary_zh": "重做 app/dashboard/page.tsx 為 6-KPI strip + 待處理 banner + 健康訊號 + 當前 dispatch 隊列。資料源不變。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex2",
        "depends_on": ["OPS-UI-RD-002"],
        "artifacts": ["apps/ops-console-web/app/dashboard/page.tsx"],
        "acceptance": [
            "pnpm --filter @drts/ops-console-web typecheck / build / test",
            "Storybook OpsDashboard/Built 與 OC_Dashboard 並排可審",
        ],
    },
    {
        "id": "OPS-UI-RD-004",
        "title": "Dispatch (owned + forwarded) redesign",
        "summary_zh": "app/dispatch 4 tab (Owned / Forwarded / Override governance / No-supply)，<AuthorityBadge> 區分；mirror table 必為 forwarded 色，不可裝成 owned。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["OPS-UI-RD-002", "DSY-UI-002"],
        "artifacts": [
            "apps/ops-console-web/app/dispatch/page.tsx",
            "apps/ops-console-web/app/dispatch/dispatch-workflow.tsx",
            "apps/ops-console-web/app/dispatch/forwarded-order-board.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ops-console-web typecheck / build / test",
            "Vitest snapshot 確認 forwarded row 一定是 forwarded tone",
            "Storybook 對照 OC_DispatchOwned + OC_DispatchForwarded",
        ],
    },
    {
        "id": "OPS-UI-RD-005",
        "title": "Callcenter redesign",
        "summary_zh": "app/callcenter/page.tsx 三 tab (Sessions / Callback queue / Recordings)。既有 live command 行為保留。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["OPS-UI-RD-002"],
        "artifacts": ["apps/ops-console-web/app/callcenter/page.tsx"],
        "acceptance": [
            "pnpm --filter @drts/ops-console-web typecheck / build / test",
            "Storybook 對照 OC_Callcenter",
        ],
    },
    {
        "id": "OPS-UI-RD-006",
        "title": "Complaints + Incidents redesign",
        "summary_zh": "app/complaints + app/incidents 視覺對齊。Incident detail embedded workspace 模式保留 (比 mock 強，不是 regression)；只動視覺。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex2",
        "depends_on": ["OPS-UI-RD-002"],
        "artifacts": [
            "apps/ops-console-web/app/complaints/page.tsx",
            "apps/ops-console-web/app/incidents/page.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ops-console-web typecheck / build / test",
            "Storybook 對照 OC_Complaints + OC_IncidentDetail",
        ],
    },
    {
        "id": "OPS-UI-RD-007",
        "title": "Reports / Revenue / Attendance / Maintenance redesign",
        "summary_zh": "4 個 reporting 頁同 PR 重做，視覺一致性優先。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex",
        "depends_on": ["OPS-UI-RD-002"],
        "artifacts": [
            "apps/ops-console-web/app/reports/page.tsx",
            "apps/ops-console-web/app/revenue/page.tsx",
            "apps/ops-console-web/app/attendance/page.tsx",
            "apps/ops-console-web/app/maintenance/page.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ops-console-web typecheck / build / test",
            "Storybook 對照 OC_Reports / Revenue / Attendance / Maintenance",
        ],
    },
    {
        "id": "OPS-UI-RD-008",
        "title": "Master data (drivers / vehicles / contracts / flags) redesign",
        "summary_zh": "4 個 master data 頁同步重做。Flags 維持 read-only。",
        "phase": "Wave 2",
        "owner": "Claude2",
        "reviewer": "Codex2",
        "depends_on": ["OPS-UI-RD-002"],
        "artifacts": [
            "apps/ops-console-web/app/drivers/page.tsx",
            "apps/ops-console-web/app/vehicles/page.tsx",
            "apps/ops-console-web/app/contracts/page.tsx",
            "apps/ops-console-web/app/feature-flags/page.tsx",
        ],
        "acceptance": [
            "pnpm --filter @drts/ops-console-web typecheck / build / test",
            "Storybook 對照",
        ],
    },
    {
        "id": "OPS-UI-RD-009",
        "title": "Wave 2 closeout — visual review packet",
        "summary_zh": "OPS-UI-RD-001..008 全部 review_approved 後，產出 closeout 文件，附每個畫面的 before/after/canvas 三圖比對與 reviewer 簽名。",
        "phase": "Wave 2",
        "owner": "Claude",
        "reviewer": "Copilot",
        "depends_on": [
            "OPS-UI-RD-001",
            "OPS-UI-RD-002",
            "OPS-UI-RD-003",
            "OPS-UI-RD-004",
            "OPS-UI-RD-005",
            "OPS-UI-RD-006",
            "OPS-UI-RD-007",
            "OPS-UI-RD-008",
        ],
        "artifacts": ["docs/05-ui/ops-console-redesign-closeout-20260???.md"],
        "acceptance": ["每個 surface 標註 reviewer + 通過時間"],
    },
]

# ───── Wave 3 — Platform Admin (mirror) + Tenant (parity) ────────
ADM_SPECS = [
    ("ADM-UI-RD-001", "Adopt new shell in platform-admin-web", "Sidebar / topbar 改用 <ManagementShell>。", ["DSY-UI-003"]),
    ("ADM-UI-RD-002", "Strip ad-hoc CSS, adopt ui-web primitives", "刪除 platform-admin-web/app/globals.css 內 .admin-* 規則。", ["ADM-UI-RD-001"]),
    ("ADM-UI-RD-003", "Home + Health redesign", "PA_Home + PA_Health 對齊。", ["ADM-UI-RD-002"]),
    ("ADM-UI-RD-004", "Tenants list + Tenant Detail / Rollout redesign", "PA_Tenants + PA_TenantDetail。Stepper / DL / Roles & invites table 視覺對齊。", ["ADM-UI-RD-002"]),
    ("ADM-UI-RD-005", "Partners list + Partner Detail redesign", "PA_Partners + PA_PartnerDetail。", ["ADM-UI-RD-002"]),
    ("ADM-UI-RD-006", "Users + Fleet + Switchboard redesign", "PA_Users + PA_Fleet + PA_Switchboard。", ["ADM-UI-RD-002"]),
    ("ADM-UI-RD-007", "Pricing redesign (含 publish flow)", "PA_Pricing + publish stepper。", ["ADM-UI-RD-002"]),
    ("ADM-UI-RD-008", "Payments + Reconciliation Detail redesign", "PA_Payments + PA_ReconDetail。", ["ADM-UI-RD-002"]),
    ("ADM-UI-RD-009", "Notices + Audit + Flags + Adapters redesign", "PA_Notices + PA_Audit + PA_Flags + PA_Adapters。", ["ADM-UI-RD-002"]),
]
TEN_RD_SPECS = [
    ("TEN-UI-RD-001", "Adopt new shell + strip ad-hoc CSS", "Tenant console shell + globals.css 清理。", ["DSY-UI-003"]),
    ("TEN-UI-RD-002", "Home + Bookings list + Booking Detail redesign", "TN_Home + TN_Bookings + TN_BookingDetail。", ["TEN-UI-RD-001"]),
    ("TEN-UI-RD-003", "Audit + Users + Settings redesign", "TN_Audit + TN_Users + TN_Settings。", ["TEN-UI-RD-001"]),
    ("TEN-UI-RD-004", "Replace internal-language copy in tenant-shell.tsx", "移除 TEN-UI-001 / XS-UI-004 / Authority: /api/tenant/* 等 implementation language；改使用者面文案。", ["TEN-UI-RD-001"]),
]
TEN_PARITY_SPECS = [
    ("TEN-UI-RD-010", "New Booking 完整化", "TN_NewBooking — 現為 placeholder，補完代訂 / cost-center 套規則。"),
    ("TEN-UI-RD-011", "Passengers route 新增", "TN_Passengers — sunset portal 邏輯不遷移，依設計重做。"),
    ("TEN-UI-RD-012", "Addresses route 新增", "TN_Addresses。"),
    ("TEN-UI-RD-013", "Cost Center route 新增", "TN_CostCenter — 需確認 backend contract，不齊全則回 discussion_planning。"),
    ("TEN-UI-RD-014", "Rules route 新增", "TN_Rules — 審批與配額。"),
    ("TEN-UI-RD-015", "Invoices route 新增", "TN_Invoices — 對帳單。"),
    ("TEN-UI-RD-016", "Reports route 新增", "TN_Reports。"),
    ("TEN-UI-RD-017", "API Keys 完整化", "TN_ApiKeys — 現為 IA shell。"),
    ("TEN-UI-RD-018", "Webhooks 完整化", "TN_Webhooks — 現為 IA shell + 投遞紀錄。"),
]
DRV_SPECS = [
    ("DRV-UI-RD-001", "Wire @drts/ui-tokens into driver-app + RN primitives layer", "建 apps/driver-app/components/ui-rn/，吃 ui-tokens；不取代既有 components/ui。", ["TOK-UI-001"]),
    ("DRV-UI-RD-002", "Reskin Workspace cockpit", "app/index.tsx + app/onboarding.tsx 視覺對齊 ScreenWorkspace + ScreenProvisioning。", ["DRV-UI-RD-001"]),
    ("DRV-UI-RD-003", "Reskin Inbox", "app/jobs.tsx 對齊 ScreenInbox。", ["DRV-UI-RD-001"]),
    ("DRV-UI-RD-004", "Reskin Trip — 7 states 全 visual 對齊", "owned_active / forwarded_offered / pending / confirmed / lost / cancelled / sync_failed。既有 forwarded sync_failed 邏輯不可降級。", ["DRV-UI-RD-001"]),
    ("DRV-UI-RD-005", "Reskin Platform Presence", "app/platform-presence.tsx 對齊 ScreenPlatform。", ["DRV-UI-RD-001"]),
    ("DRV-UI-RD-006", "Reskin Earnings + Shift", "對齊 ScreenEarnings + ScreenShift。", ["DRV-UI-RD-001"]),
    ("DRV-UI-RD-007", "Reskin SOS", "app/incident.tsx 對齊 ScreenSOS。", ["DRV-UI-RD-001"]),
    ("DRV-UI-RD-008", "Reskin Settings", "app/settings.tsx 對齊 ScreenSettings。", ["DRV-UI-RD-001"]),
]
PBK_SPECS = [
    ("PBK-UI-001", "Bootstrap apps/partner-booking-web (white-label Next.js)", "新 Next 16 + React 19 + Tailwind 4 app，port 3006，[tenantSlug] 路由。Build / lint / typecheck 通過；不部署。", ["TOK-UI-001"]),
    ("PBK-UI-002", "Partner-side token + brand layer", "@drts/ui-tokens 加 BRAND_TEMPLATES (CTBC, CATHAY, GRAND)。Partner app 從 token 取，不 hardcode。", ["PBK-UI-001"]),
    ("PBK-UI-003", "CTBC reference funnel — 7 screens", "Landing / Eligibility / Book / Confirmed / Trips / Receipt / Help — 全部 white-label component + CTBC brand demo。Mock data。", ["PBK-UI-002"]),
    ("PBK-UI-004", "Authority-safe negative paths", "保留 tenant-console-web/app/partner/ 既有 5 條 negative path (eligible / ineligible / manual_review / inactive / eligibility-required) 並移植。", ["PBK-UI-003"]),
    ("PBK-UI-005", "新舊 partner mode 共存政策 (decision doc)", "Decision doc 簽核：何時切換 / 過渡期 / 棄置策略。Supervisor + governance reviewer 共同簽。", ["PBK-UI-004"]),
]


def _add_admin(out: list[dict]) -> None:
    for tid, title, sm, deps in ADM_SPECS:
        extra = [] if tid in ("ADM-UI-RD-001", "ADM-UI-RD-002") else ["OPS-UI-RD-009"]
        out.append({
            "id": tid, "title": title, "summary_zh": sm, "phase": "Wave 3",
            "owner": "Claude2", "reviewer": "Codex2",
            "depends_on": deps + extra,
            "artifacts": ["apps/platform-admin-web/"],
            "acceptance": [
                "pnpm --filter @drts/platform-admin-web typecheck / build / test",
                "Storybook 對照對應 PA_* artboard",
            ],
        })
    out.append({
        "id": "ADM-UI-RD-010",
        "title": "Wave 3 platform closeout packet",
        "summary_zh": "ADM-UI-RD-001..009 全 review_approved 後產出 closeout 文件。",
        "phase": "Wave 3",
        "owner": "Claude",
        "reviewer": "Copilot",
        "depends_on": [f"ADM-UI-RD-{i:03d}" for i in range(1, 10)],
        "artifacts": ["docs/05-ui/platform-admin-redesign-closeout-20260???.md"],
        "acceptance": ["每個 surface 標註 reviewer + 通過時間"],
    })


def _add_tenant(out: list[dict]) -> None:
    for tid, title, sm, deps in TEN_RD_SPECS:
        extra = [] if tid == "TEN-UI-RD-001" else ["OPS-UI-RD-009"]
        out.append({
            "id": tid, "title": title, "summary_zh": sm, "phase": "Wave 3",
            "owner": "Claude2", "reviewer": "Codex",
            "depends_on": deps + extra,
            "artifacts": ["apps/tenant-console-web/"],
            "acceptance": [
                "pnpm --filter @drts/tenant-console-web typecheck / build / test",
                "Storybook 對照 TN_* artboard",
            ],
        })
    for tid, title, sm in TEN_PARITY_SPECS:
        out.append({
            "id": tid, "title": title, "summary_zh": sm, "phase": "Wave 3",
            "owner": "Claude2", "reviewer": "Codex",
            "depends_on": ["TEN-UI-RD-001"],
            "artifacts": ["apps/tenant-console-web/app/"],
            "acceptance": [
                "pnpm --filter @drts/tenant-console-web typecheck / build / test",
                "Storybook 對照對應 TN_* artboard",
                "若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract",
            ],
        })
    out.append({
        "id": "TEN-UI-RD-099",
        "title": "Wave 3 tenant closeout packet",
        "summary_zh": "TEN-UI-RD-001..018 全 review_approved 後產出 closeout 文件，含 parity-fill 決策。",
        "phase": "Wave 3",
        "owner": "Claude",
        "reviewer": "Copilot",
        "depends_on": [t[0] for t in TEN_RD_SPECS] + [t[0] for t in TEN_PARITY_SPECS],
        "artifacts": [
            "docs/05-ui/tenant-console-redesign-closeout-20260???.md",
            "docs/05-ui/tenant-console-parity-decisions-20260???.md",
        ],
        "acceptance": ["每個 surface 標註 reviewer + 通過時間"],
    })


def _add_driver(out: list[dict]) -> None:
    for tid, title, sm, deps in DRV_SPECS:
        out.append({
            "id": tid, "title": title, "summary_zh": sm, "phase": "Wave 4",
            "owner": "Claude2", "reviewer": "Codex2",
            "depends_on": deps,
            "artifacts": ["apps/driver-app/"],
            "acceptance": [
                "pnpm --filter @drts/driver-app typecheck / lint / test",
                "Expo dev build on Android emulator + manual screenshot vs canvas",
                "Backend / location heartbeat / provisioning flow 不可動",
            ],
        })
    out.append({
        "id": "DRV-UI-RD-009",
        "title": "Wave 4 driver closeout packet",
        "summary_zh": "DRV-UI-RD-001..008 全 review_approved 後產出 closeout 文件。",
        "phase": "Wave 4",
        "owner": "Claude",
        "reviewer": "Copilot",
        "depends_on": [f"DRV-UI-RD-{i:03d}" for i in range(1, 9)],
        "artifacts": ["docs/05-ui/driver-app-redesign-closeout-20260???.md"],
        "acceptance": ["每個 surface 標註 reviewer + 通過時間"],
    })


def _add_partner(out: list[dict]) -> None:
    for tid, title, sm, deps in PBK_SPECS:
        out.append({
            "id": tid, "title": title, "summary_zh": sm, "phase": "Wave 5",
            "owner": "Gemini" if tid == "PBK-UI-001" else "Claude2",
            "reviewer": "Codex" if tid != "PBK-UI-005" else "Claude",
            "depends_on": deps,
            "artifacts": ["apps/partner-booking-web/"],
            "acceptance": [
                "pnpm --filter @drts/partner-booking-web typecheck / build / lint",
                "Storybook 對照對應 PB_* artboard (PBK-UI-003 起)",
            ],
        })


def main() -> int:
    state = ai_status.load_state()
    existing_ids = {t["id"] for t in state.get("tasks", [])}
    plan = list(TASKS)
    _add_admin(plan)
    _add_tenant(plan)
    _add_driver(plan)
    _add_partner(plan)

    collisions = [t["id"] for t in plan if t["id"] in existing_ids]
    if collisions:
        print(f"ABORT — id collisions: {collisions}", file=sys.stderr)
        return 2

    print(f"Seeding {len(plan)} tasks…", file=sys.stderr)
    for spec in plan:
        os.environ["TASK_TITLE"] = spec["title"]
        os.environ["TASK_SUMMARY_ZH"] = spec["summary_zh"]
        os.environ["TASK_PHASE"] = spec["phase"]
        os.environ["TASK_DEPENDS_ON"] = ",".join(spec.get("depends_on") or [])
        os.environ["TASK_ARTIFACTS"] = ",".join(spec.get("artifacts") or [])
        os.environ["TASK_ACCEPTANCE"] = ",".join(spec.get("acceptance") or [])
        os.environ["TASK_METADATA_JSON"] = json.dumps({"planning_ref": PLAN_REF})
        os.environ["AI_STATUS_ACTOR"] = "Claude2"
        ai_status.command_assign(state, [spec["id"], spec["owner"], spec["reviewer"], spec["title"]])

    ai_status.sync_all(state)
    ai_status.save_state(state)

    after = {t["id"] for t in state["tasks"]}
    added = sorted(after - existing_ids)
    print(f"Added {len(added)} tasks", file=sys.stderr)
    print(f"First 5: {added[:5]}", file=sys.stderr)
    print(f"Last 3: {added[-3:]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
