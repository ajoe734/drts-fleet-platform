#!/usr/bin/env python3
"""Dispatch the bilingual (en/zh-TW) i18n remediation wave to the supervisor.

Source of truth:
  - Spec (normative): docs/05-ui/i18n-multilingual-spec-20260604.md
  - Per-route fix plan: docs/05-ui/i18n-remediation-implementation-20260604.md
  - Raw per-line evidence: docs/05-ui/i18n-audit-20260604/appendix-*-cjk-lines.txt

Why this wave:
  A full page-by-page / field-by-field audit of ops-console-web (21 tsx) and
  platform-admin-web (22 tsx) found bilingual is NOT broken-by-missing-strings
  but broken-by-architecture: every page reinvents inline i18n (30+ local
  copy()/tx()/copyText() helpers, pervasive `locale === "en" ? a : b`, per-page
  copy objects) instead of going through the central lib/translations.ts t().
  Symptoms: (a) whole CN-only pages (admin pricing / tenant detail /
  reimbursements list; ops dashboard L736-746, dispatch detail L79/L415),
  (b) heavy code-switching in zh strings (adapter x34, override x22, dispatch
  x21, credential x18, session x16, ...), (c) inconsistent terminology
  (dispatch=派遣/派車/派送; forwarded/轉派; refresh variants; fallback variants).

Design (maximize parallel, minimize deps — per user):
  - I18N-WP0 is the ONLY hub: ships the i18n-guard lint, fixes ops i18n.tsx
    default en->zh, back-fills zh==en dict gaps, and lays down per-domain key
    block skeletons in BOTH translations.ts files to minimize merge conflicts.
  - Every page WP depends ONLY on I18N-WP0, never on each other. Each WP only
    ADDS its own domain key block to translations.ts (never edits others').
  - I18N-VERIFY depends on the whole set (full-repo guard 0-violation + en/zh
    screenshot regression).

Owner hints follow feedback_agent_workload_ratio.md (Codex/Codex2 heavy);
the supervisor availability-first scheduler may reshuffle owners.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-i18n-bilingual-remediation.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3  # avoids the supervisor concurrent-read OOM
REPO = Path(__file__).resolve().parents[2]
PHASE = "i18n-bilingual-remediation-202606"
PLANNING_REF = "docs/05-ui/i18n-remediation-implementation-20260604.md"

# Each entry: (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    # ── Foundation hub (the one necessary dependency) ──────────────────────
    (
        "I18N-WP0",
        "Claude2",
        "Codex2",
        "i18n foundation: guard lint + ops default zh + dict gap fill + key-block skeletons",
        "依規範 §5/§6：(1) 新增 tools/ci/i18n-guard.mjs，對 apps/*/app|components 的 tsx/ts（排除 translations.ts）fail：內聯 copy/tx/copyText helper、const copy = locale ===、locale === \"en|zh\" ? 顯示分支、內聯 {en,zh}、硬編碼 CJK、硬編碼 JSX 英文文字節點與 placeholder/title/label/aria-label/alt 裸字面；掛 CI 與 pre-commit，輸出 檔案:行 清單。(2) 修 apps/ops-console-web/lib/i18n.tsx：createContext 預設與 LanguageProvider defaultLocale 由 en 改 zh，對齊 getServerLocale。(3) 兩 app translations.ts 補譯殘留 zh==en 鍵（Accept pending/Manual fallback/Sync failed/Channel mix/Settlement matrix/Mismatch review/Insight/Forwarded reconciliation/Legal Hold 等）。(4) 兩 app translations.ts 預先加入各 domain 的空 key 區塊標頭（// ── <domain> (i18n remediation 20260604) ──）以降低後續 WP 衝突。(5) 把 formatOpsCodeLabel/formatPlatformCodeLabel 標註為須查字典（列 caveat）。",
        "",
        "tools/ci/i18n-guard.mjs,apps/ops-console-web/lib/i18n.tsx,apps/ops-console-web/lib/translations.ts,apps/platform-admin-web/lib/translations.ts",
        "i18n-guard runs in CI and pre-commit and emits file:line list; ops i18n.tsx default is zh; listed zh==en keys translated; both translations.ts have per-domain key-block headers; typecheck + build pass for both apps",
    ),

    # ════════════════ Ops Console (apps/ops-console-web) ════════════════
    # Every Ops WP: read規範 §1-§7 → 收斂該檔顯示字串進 ops translations.ts（補 en+zh）→
    # 刪內聯 copy/tx/locale===/{en,zh} → 套 §3 glossary → i18n-guard 該檔 0 violation。
    # 逐行待修清單： awk '/===== .*<file> =====/{f=1;next}/^===== /{f=0}f' \
    #   docs/05-ui/i18n-audit-20260604/appendix-ops-console-cjk-lines.txt
    (
        "I18N-OPS-01", "Codex", "Codex2",
        "Ops callcenter i18n centralize (worst code-switching)",
        "app/callcenter/page.tsx（132 CJK / 25 locale 三元）：通話工作面整頁中英夾雜最嚴重，session/callback/ETA/workspace/scope 滿地；含多個內聯 {en,zh} action 字典（L290-299）。全部收斂進 translations.ts，glossary：session→通話工作階段、callback→回撥、scope→權限範圍、workspace→工作區。",
        "I18N-WP0", "apps/ops-console-web/app/callcenter/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n; 0 hardcoded CJK; en/zh both present & glossary-clean; i18n-guard clean for file; typecheck+build pass",
    ),
    (
        "I18N-OPS-02", "Codex2", "Codex",
        "Ops dispatch detail i18n centralize",
        "app/dispatch/[dispatchId]/page.tsx（115/46）：L79「建立」、L415「人工覆核」純中文須補 en；timeline title 用 locale===\"zh\"；override/reconciliation/fallback 夾雜。glossary：override→車資覆寫/例外覆核、reconciliation→對帳、manual fallback→人工備援。",
        "I18N-WP0", "apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n; L79/L415 bilingual; glossary-clean; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-03", "Codex", "Claude2",
        "Ops complaints i18n centralize",
        "app/complaints/page.tsx（115/1）：empty-state 物件 L346-415 純中文須補 en；大量 tx(locale,…)；內聯 {en,zh} action 字典 L237-249。全收斂，statuses/categories/severity 一致化。",
        "I18N-WP0", "apps/ops-console-web/app/complaints/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n; empty-states bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-04", "Codex2", "Gemini",
        "Ops drivers (list+detail+platform-actions) i18n centralize",
        "app/drivers/[driverId]/page.tsx(111/3)+app/drivers/page.tsx(3/3)+components/driver-platform-actions.tsx：drivers L355/358「已綁定/未綁定」與 L1314 locale===\"zh\" 純中文；detail 全 copy()。glossary：re-auth、suppression→派遣抑制、binding→綁定。",
        "I18N-WP0", "apps/ops-console-web/app/drivers/,apps/ops-console-web/components/driver-platform-actions.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n across all 3 files; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-05", "Codex", "Codex2",
        "Ops vehicles (list+detail) i18n centralize",
        "app/vehicles/page.tsx(108/3)+app/vehicles/[vehicleId]/page.tsx(100/4)：全 copy()；欄位/空狀態/降級 banner 大量；offboarding/debrand 術語。glossary：dispatchable→可派遣、offboarding→退場、debrand→除標識。",
        "I18N-WP0", "apps/ops-console-web/app/vehicles/,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n both files; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-06", "Copilot", "Codex",
        "Ops contracts i18n centralize",
        "app/contracts/page.tsx(108/3)：全 copy()；KIND/COUNTERPARTY/TERM 表頭；forwarder/eligibility 夾雜。glossary：forwarded→轉派、eligibility→資格模式。",
        "I18N-WP0", "apps/ops-console-web/app/contracts/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-07", "Codex2", "Codex",
        "Ops maintenance i18n centralize (保修→維修 term unify)",
        "app/maintenance/page.tsx(91/2)：全 copy()；WO/排程/技師/費用。統一 maintenance 術語為「維修」（現用保修），對齊 glossary §3。",
        "I18N-WP0", "apps/ops-console-web/app/maintenance/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n; maintenance term unified; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-08", "Codex", "Claude",
        "Ops dispatch board (page+workflow+forwarded+auto-refresh) i18n centralize",
        "app/dispatch/page.tsx(80/20)+dispatch-workflow.tsx+forwarded-order-board.tsx(L235 純)+components/dispatch-auto-refresh.tsx：zh?: action label 群 L816-862；6 子看板文案；forwarded board 純中文補 en。glossary：dispatch→派遣、forwarded→轉派、queue→佇列。",
        "I18N-WP0", "apps/ops-console-web/app/dispatch/,apps/ops-console-web/components/dispatch-auto-refresh.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n across all 4 files; dispatch term unified to 派遣; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-09", "Codex2", "Codex",
        "Ops dashboard i18n centralize (CN-only column labels)",
        "app/dashboard/page.tsx(78/76)：**L736-746 純中文欄位（訂單/租戶/上車地/時窗/狀態/司機）須補 en**；CTA/empty/health 全 locale===。整頁收斂進 translations.ts。",
        "I18N-WP0", "apps/ops-console-web/app/dashboard/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n; L736-746 columns bilingual; en mode shows no CN; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-10", "Codex", "Codex2",
        "Ops incident detail (page+action-panel+refresh-tier) i18n centralize",
        "app/incidents/[incidentId]/page.tsx(77/67)+incident-detail-action-panel.tsx(40/40)+refresh-tier.tsx(6/6)：{en,zh} empty 字典 L102-153；action panel 全 locale===；refresh-tier L100-112 純中文 tier 詞補 en。",
        "I18N-WP0", "apps/ops-console-web/app/incidents/[incidentId]/,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n across 3 files; refresh-tier bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-11", "Copilot", "Codex2",
        "Ops incidents list + reports i18n centralize",
        "app/incidents/page.tsx(19/19)+app/reports/page.tsx(32/2)：reports 全 copyText()（filing package/artifact 夾雜）；incidents 列表時間/狀態。glossary：artifact→產物、filing package→申報包。",
        "I18N-WP0", "apps/ops-console-web/app/incidents/page.tsx,apps/ops-console-web/app/reports/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n both files; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-12", "Gemini", "Codex",
        "Ops feature-flags + attendance i18n centralize",
        "app/feature-flags/page.tsx(25/13)：flag 描述字典 L342-355 純中文補 en；app/attendance/page.tsx(16/19)：gantt 標籤/匯出。全收斂。",
        "I18N-WP0", "apps/ops-console-web/app/feature-flags/page.tsx,apps/ops-console-web/app/attendance/page.tsx,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n both files; flag descriptions bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-13", "Gemini2", "Codex2",
        "Ops approval-requests (page+actions, actions file un-i18n'd) centralize",
        "app/approval-requests/page.tsx(16/1)+approval-actions.tsx(7/1)：approval-actions.tsx 目前**未接 i18n**（全 copy()，含 confirm prompts）須改 t()；表頭 REQUEST/TENANT/STATUS/MODE/ORDER/APPROVERS/CREATED/ACTIONS。",
        "I18N-WP0", "apps/ops-console-web/app/approval-requests/,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n; approval-actions uses t(); i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-OPS-14", "Claude", "Codex",
        "Ops shell/assistant/error/empty chrome i18n centralize",
        "components/ops-assistant/*（assistant-widget、context-provider、publish-assistant-context）+ components/ops-shell.tsx + app/layout.tsx + app/error.tsx + app/page.tsx + lib/ops-shell-nav.ts + lib/ops-empty-state.ts：助理 widget UI chrome、shell nav、error/empty 通用文案確認全走 t()，補缺鍵。",
        "I18N-WP0", "apps/ops-console-web/components/ops-assistant/,apps/ops-console-web/components/ops-shell.tsx,apps/ops-console-web/lib/ops-shell-nav.ts,apps/ops-console-web/lib/ops-empty-state.ts,apps/ops-console-web/lib/translations.ts",
        "0 inline i18n / 0 hardcoded chrome; i18n-guard clean; typecheck+build pass",
    ),

    # ════════════════ Platform Admin (apps/platform-admin-web) ════════════════
    # 逐行清單： awk '...' docs/05-ui/i18n-audit-20260604/appendix-platform-admin-cjk-lines.txt
    (
        "I18N-ADM-01", "Codex", "Codex2",
        "Admin pricing i18n (whole page CN-only, top priority)",
        "app/pricing/page.tsx(59/0)：**整頁幾乎只有中文、未接雙語**——發佈版本/生效開始/生效結束/名稱/NT$ 85 起/setPublishError/subtitle/body 全硬編中文。整頁建立 en+zh 並走 t()。最高優先。",
        "I18N-WP0", "apps/platform-admin-web/app/pricing/page.tsx,apps/platform-admin-web/lib/translations.ts",
        "Whole page bilingual via t(); en mode shows no CN; 0 hardcoded; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-02", "Codex2", "Codex",
        "Admin partners (detail+list) i18n centralize",
        "app/partners/[entrySlug]/page.tsx(101/49)+app/partners/page.tsx(13/1)：per-page copy 巨物件；credential/secret/entry/readiness 夾雜；多 modal 文案。glossary：credential→憑證、secret→密鑰、readiness→上線準備度、partner entry→合作夥伴入口。",
        "I18N-WP0", "apps/platform-admin-web/app/partners/,apps/platform-admin-web/lib/translations.ts",
        "0 inline copy-object i18n both files; glossary-clean; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-03", "Codex", "Codex2",
        "Admin fleet i18n centralize (largest locale-ternary)",
        "app/fleet/page.tsx(98/71)：全 locale=== 表頭群；action label 字典 L293-307 純中文；offboarding/exclusivity 狀態。glossary：exclusivity→排他、offboarding→退場。",
        "I18N-WP0", "apps/platform-admin-web/app/fleet/page.tsx,apps/platform-admin-web/lib/translations.ts",
        "0 inline i18n; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-04", "Codex2", "Claude2",
        "Admin switchboard i18n centralize",
        "app/switchboard/page.tsx(80/3)：per-page copy 巨物件（牌貼/版本/稽核憑據），多為純中文需補 en。glossary：placard→牌貼、public info→公開資訊。",
        "I18N-WP0", "apps/platform-admin-web/app/switchboard/page.tsx,apps/platform-admin-web/lib/translations.ts",
        "0 inline copy-object; en added everywhere; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-05", "Codex", "Gemini",
        "Admin feature-flags i18n centralize",
        "app/feature-flags/page.tsx(64/6)：per-page copy 物件；rollout/override/tenant 夾雜。glossary：rollout→推行、override→覆寫。",
        "I18N-WP0", "apps/platform-admin-web/app/feature-flags/page.tsx,apps/platform-admin-web/lib/translations.ts",
        "0 inline copy-object; glossary-clean; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-06", "Codex2", "Codex",
        "Admin tenants (list+detail) i18n centralize (detail CN-only)",
        "app/tenants/page.tsx(48/7)+app/tenants/[tenantId]/page.tsx(12/1)：detail L235-240/619/693/761/770/803 **純中文**須補 en；list copy 物件含整段 nav 字典。",
        "I18N-WP0", "apps/platform-admin-web/app/tenants/,apps/platform-admin-web/lib/translations.ts",
        "0 inline i18n; detail bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-07", "Codex", "Codex2",
        "Admin reimbursements (list CN-only + batch detail) i18n centralize",
        "app/payments/reimbursements/page.tsx(7/3, **list 純中文** L128/256/440/452/465/478)+[batchId]/page.tsx(43/47, 全 locale===)。glossary：reimbursement→代墊、remittance proof→匯款憑證。",
        "I18N-WP0", "apps/platform-admin-web/app/payments/reimbursements/,apps/platform-admin-web/lib/translations.ts",
        "0 inline i18n both files; list bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-08", "Codex2", "Codex",
        "Admin home + shell + assistant route-context/overlay i18n centralize",
        "app/page.tsx(43/15)+components/admin-shell.tsx(31/14)+components/assistant/route-context.ts(25)+components/assistant/platform-assistant-overlay.tsx(15)：home copy 物件；shell nav {zh,en} 字典；route-context {zh,en} title 群；assistant overlay 純中文 chrome 補 en。",
        "I18N-WP0", "apps/platform-admin-web/app/page.tsx,apps/platform-admin-web/components/admin-shell.tsx,apps/platform-admin-web/components/assistant/route-context.ts,apps/platform-admin-web/components/assistant/platform-assistant-overlay.tsx,apps/platform-admin-web/lib/translations.ts",
        "0 inline i18n across 4 files; assistant chrome bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-09", "Codex", "Codex2",
        "Admin notices + health i18n centralize (health status CN-only)",
        "app/notices/page.tsx(38/4)+app/health/page.tsx(37/23)：health L282-294 狀態詞（正常/降級/中斷/未知/啟用/即將到期/缺失）**純中文**補 en；notices copy 物件。",
        "I18N-WP0", "apps/platform-admin-web/app/notices/page.tsx,apps/platform-admin-web/app/health/page.tsx,apps/platform-admin-web/lib/translations.ts",
        "0 inline i18n; health status bilingual; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-10", "Codex2", "Codex",
        "Admin payments + audit i18n centralize",
        "app/payments/page.tsx(34/12)+app/audit/page.tsx(16/1)：payments copy 物件（reconciliation/queue 夾雜）；audit copy 物件。glossary：reconciliation→對帳、legal hold→法定保留。",
        "I18N-WP0", "apps/platform-admin-web/app/payments/page.tsx,apps/platform-admin-web/app/audit/page.tsx,apps/platform-admin-web/lib/translations.ts",
        "0 inline copy-object both files; glossary-clean; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-11", "Copilot", "Codex",
        "Admin adapter-registry (incl un-i18n'd modal+layout) i18n centralize",
        "app/adapter-registry/page.tsx(32/1)+components/AdapterList.tsx(10/1)+components/EditAdapterModal.tsx(**未接 i18n**)+layout.tsx(**未接 i18n**)：adapter 夾雜最多(×34)。glossary：adapter→轉接器、credential→憑證、pause/retry 維運詞。",
        "I18N-WP0", "apps/platform-admin-web/app/adapter-registry/,apps/platform-admin-web/lib/translations.ts",
        "0 inline i18n; EditAdapterModal+layout use t(); adapter→轉接器; i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-12", "Gemini2", "Codex2",
        "Admin users + tenant-governance + mgmt/platform-ui shared i18n centralize",
        "app/users/page.tsx(25/1)+app/tenant-governance/page.tsx(19/7, L144-149 狀態詞 超標/警戒/正常 純中文)+components/mgmt/MgmtComponents.tsx(**未接 i18n**)+components/platform-ui.tsx(**未接 i18n**)：共用元件須改 t()。",
        "I18N-WP0", "apps/platform-admin-web/app/users/page.tsx,apps/platform-admin-web/app/tenant-governance/page.tsx,apps/platform-admin-web/components/mgmt/MgmtComponents.tsx,apps/platform-admin-web/components/platform-ui.tsx,apps/platform-admin-web/lib/translations.ts",
        "0 inline i18n; tenant-gov status bilingual; shared components use t(); i18n-guard clean; typecheck+build pass",
    ),
    (
        "I18N-ADM-13", "Gemini", "Codex",
        "Admin assistant sub-components (5 un-i18n'd) i18n centralize",
        "components/assistant/{AssistantComposer,AssistantMessageList,AssistantReceiptCard,AssistantActionPlanCard,AssistantConfirmationPanel}.tsx：5 個 assistant 子元件**完全未接 i18n**，UI chrome（送出/重試/確認/收據/計畫卡）須改 t() 並補 en+zh。",
        "I18N-WP0", "apps/platform-admin-web/components/assistant/,apps/platform-admin-web/lib/translations.ts",
        "All 5 components use t() with en+zh; i18n-guard clean; typecheck+build pass",
    ),

    # ── Final verification (depends on the whole set) ──────────────────────
    (
        "I18N-VERIFY", "Codex2", "Claude2",
        "Full-repo i18n guard 0-violation + en/zh regression",
        "全部 WP 完成後：跑全庫 tools/ci/i18n-guard.mjs 須 0 violation（兩 app）；en 模式逐頁無中文殘留、zh 模式逐頁無英文殘留（除 KEEP 術語）；語言鈕切換整頁即時無漏欄位；建議在 tests/e2e/ 補 locale 切換驗收。回報殘留清單。",
        "I18N-WP0,I18N-OPS-01,I18N-OPS-02,I18N-OPS-03,I18N-OPS-04,I18N-OPS-05,I18N-OPS-06,I18N-OPS-07,I18N-OPS-08,I18N-OPS-09,I18N-OPS-10,I18N-OPS-11,I18N-OPS-12,I18N-OPS-13,I18N-OPS-14,I18N-ADM-01,I18N-ADM-02,I18N-ADM-03,I18N-ADM-04,I18N-ADM-05,I18N-ADM-06,I18N-ADM-07,I18N-ADM-08,I18N-ADM-09,I18N-ADM-10,I18N-ADM-11,I18N-ADM-12,I18N-ADM-13",
        "tools/ci/i18n-guard.mjs,tests/e2e/",
        "tools/ci/i18n-guard.mjs reports 0 violations repo-wide; en/zh manual + e2e regression pass; residual report posted",
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
    cmd = ["bash", "tools/development-orchestrator/bin/ai-status.sh", "assign", task_id, owner, reviewer, title]
    result = subprocess.run(
        cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {result.stderr}\n")
        return False
    dep_note = f"  deps=[{deps.split(',')[0]}{'…' if ',' in deps else ''}]" if deps else "  deps=[] (hub)"
    print(f"  {task_id:14s} {owner:>8s} -> {reviewer:>8s} | {title[:58]}{dep_note}")
    return True


def main():
    print(
        f"Registering {len(TASKS)} tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
        f"Hub=I18N-WP0 (guard+defaults+dict skeletons); 27 page WPs depend only on WP0;\n"
        f"I18N-VERIFY depends on all.\n"
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
