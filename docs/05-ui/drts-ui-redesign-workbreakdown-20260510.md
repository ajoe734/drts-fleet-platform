# DRTS UI Redesign — Supervisor Work Breakdown 20260510

## Purpose

Operational work breakdown for converting the design prototype in
`docs/05-ui/drts.zip` into shipped UI across all DRTS surfaces.

Inputs:

- `docs/05-ui/drts.zip` (design source of truth)
- `docs/05-ui/drts-zip-vs-current-ui-diff-report-20260510.md` (gap analysis)
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md` (prior pass)
- Existing UI task families in `ai-status.json`: `ADM-UI`, `DRV-UI`,
  `MGMT-UI`, `OPS-UI`, `SYS-UI`, `TEN-UI`, `XS-UI`

Output:

- A concrete task list shaped to drop into `ai-status.json` as new tasks and
  into `.orchestrator/task-briefs/` as briefs.

This document is **not** itself canonical truth. It is a supervisor seed.
Supervisor assigns final IDs, owners, reviewers, and acceptance commits.

---

## Goals

### G1 — Single source of UI truth

`packages/ui-web/` becomes the only authority for management-shell visual
language. Per-app `globals.css` ad-hoc rules (`.admin-card`, `.admin-table`,
`.admin-badge`, etc.) are deleted. Every console renders shell, table, KPI,
banner, stepper, timeline through `@drts/ui-web` primitives only.

### G2 — Authority semantics enforced in tokens

`owned` vs `forwarded` is a typed token, not a per-page color. Shared across
web (`@drts/ui-web`) and React Native (`@drts/ui-tokens`). Status vocabulary
(`broadcasted / accept_pending / lost_race / sync_failed / manual_fallback_required`)
shipped as enum + display strings, not free text.

### G3 — Visual parity to design canvas, surface by surface

Each console produces a Storybook panel that renders the redesigned screen
side by side with the original artboard PNG/HTML from `docs/05-ui/drts.zip`.
Visual review is human, manual, blocking before the surface's redesign tasks
move to `done`.

### G4 — Tenant Console parity gap closed

`apps/tenant-console-web` reaches feature parity with the 15 designed tenant
screens. Sunset `apps/tenant-portal-web` content is not migrated, only
re-implemented per design.

### G5 — Partner Booking exists as a real app

New `apps/partner-booking-web/` Next.js skeleton, white-label, tenant-swappable.
First reference tenant: CTBC World Elite per design. Not deployed in Wave 1,
but builds, lints, typechecks in CI.

### Non-goals (explicitly excluded)

- Migrating to Figma
- Reimplementing `apps/passenger-web` or `apps/concierge-portal-web`
  (deferred per `current-work.md`)
- Re-using `apps/tenant-portal-web` (sunset per
  `apps/tenant-portal-web/README.md`)
- A/B variants from the design canvas (only the chosen variant lands)
- Visual regression tooling (Storybook screenshot review only at this stage)

---

## Wave plan

### Wave 0 — Foundation alignment (1–2 days)

Pin design source of truth and intake the diff report into the orchestrator.
No code changes outside docs and orchestrator state.

### Wave 1 — Token + primitive substrate (1 week)

Build `packages/ui-tokens/`. Extend `@drts/ui-web` with authority tokens,
surface accents, dark mode, density, missing primitives.

### Wave 2 — Reference console (ops-console-web) (1–2 weeks)

Take ops-console-web from current state to parity with design canvas.
Replace `globals.css`, replace shell, redesign each route's page-level
treatment. Produce Storybook panels per screen as acceptance gate.

### Wave 3 — Mirror to platform-admin-web + tenant-console-web (2–3 weeks each, parallelizable after Wave 2)

After Wave 2 is `review_approved`, the same pattern is applied to platform
admin and tenant console. Tenant Console additionally closes the parity gap
(6 missing routes per diff report).

### Wave 4 — Driver app visual alignment (1 week)

`apps/driver-app` (Expo / React Native) imports `@drts/ui-tokens`, replaces
ad-hoc colors and status pill styling with token-based primitives. Behavior
unchanged; only visual reskin.

### Wave 5 — Partner Booking new app (1 week)

`apps/partner-booking-web/` skeleton stood up. Not internet-deployed in this
wave; passes CI and renders one happy-path screen using token + ui-web.

---

## Family + ID convention

Following the existing `<SURFACE>-<DOMAIN>-<NNN>` pattern in
`.orchestrator/task-briefs/`:

| Family      | Meaning                                       | Wave    |
| ----------- | --------------------------------------------- | ------- |
| `RDX-W0`    | Foundation: design intake, baselines          | Wave 0  |
| `TOK-UI`    | `packages/ui-tokens` (new, RN-safe constants) | Wave 1  |
| `DSY-UI`    | `packages/ui-web` extension + new primitives  | Wave 1  |
| `OPS-UI-RD` | Ops console redesign (reference impl)         | Wave 2  |
| `ADM-UI-RD` | Platform admin redesign mirror                | Wave 3  |
| `TEN-UI-RD` | Tenant console redesign + parity-fill         | Wave 3  |
| `DRV-UI-RD` | Driver app visual reskin                      | Wave 4  |
| `PBK-UI`    | Partner Booking new app                       | Wave 5  |
| `SBK-UI`    | Storybook + visual review infra               | Wave 1+ |

Existing `ADM-UI-001…005` etc. stay as-is (already closed or in review).
New work uses the `-RD` suffix to distinguish redesign sweep from earlier
incremental tasks.

---

## Wave 0 — Foundation tasks

### `RDX-W0-001` Pin design canvas as repo asset

- 中文說明：將 `drts.zip` 解壓到 `docs/05-ui/drts-design-canvas/` 並 commit，
  讓設計稿成為 repo 內 first-class 參照 (今天 zip 是 binary，看不到變更)。
- Phase: `Wave 0`
- Owner role: docs / repo curator
- Reviewer role: supervisor
- Depends on: none
- Artifacts:
  - `docs/05-ui/drts-design-canvas/` (extracted)
  - `docs/05-ui/README.md` (index pointing to canvas + diff report + this doc)
- Acceptance:
  - HTML files render in browser
  - `docs/05-ui/README.md` lists canvas, diff report, work breakdown
  - `git log -- docs/05-ui/drts-design-canvas/` shows commit
- Guardrails: do not modify the extracted canvas; treat it as immutable

### `RDX-W0-002` Seed UI redesign backlog into `ai-status.json`

- 中文說明：把本文件列出的 task 真的寫進 `ai-status.json`，並在
  `.orchestrator/task-briefs/` 建立對應 brief 檔。Supervisor only.
- Phase: `Wave 0`
- Owner: `Claude` (supervisor)
- Reviewer: `Codex` (governance)
- Depends on: `RDX-W0-001`
- Artifacts:
  - `ai-status.json` (new tasks added)
  - `.orchestrator/task-briefs/RDX-W0-*.md`
  - `.orchestrator/task-briefs/TOK-UI-*.md`
  - `.orchestrator/task-briefs/DSY-UI-*.md`
  - `.orchestrator/task-briefs/OPS-UI-RD-*.md`
  - `.orchestrator/task-briefs/SBK-UI-*.md`
- Acceptance:
  - All Wave 1 task IDs visible in `current-work.md` Task Board
  - All briefs follow existing brief schema (Status / Owner / Reviewer / 中文說明 / Short Summary / Dependencies / Acceptance / Artifacts / Guardrails)
- Guardrails: use `scripts/ai-status.sh` or `scripts/ai_status.py`; do not edit `current-work.md` directly

### `RDX-W0-003` Sprint mode hand-off

- 中文說明：當前 sprint 是 `master-closeout-wave`。本批 UI 重做不屬於原 sprint。
  需開新 sprint `ui-redesign-wave-202605`，或將其作為 closeout 後續波次掛在
  `supervisor_managed_execution` 下。Supervisor 決定後在 ai-status.json 紀錄。
- Phase: `Wave 0`
- Owner: `Claude` (supervisor)
- Depends on: `RDX-W0-002`
- Artifacts: `ai-status.json` (sprint metadata), `current-work.md` (regenerated)
- Acceptance: dashboard `docs-site/index.html` shows new sprint name after
  `./scripts/sync-state.sh`

---

## Wave 1 — Token + primitive substrate

### `TOK-UI-001` Create `packages/ui-tokens/`

- 中文說明：建立純 TS 常數的 token 套件。Web 與 RN 都 import。內容包含
  authority colors (owned/forwarded)、4 console accents、status vocabulary、
  display strings。零 React 依賴，零樣式系統依賴。
- Phase: `Wave 1`
- Owner role: shared infra
- Reviewer role: contracts
- Depends on: `RDX-W0-002`
- Artifacts:
  - `packages/ui-tokens/package.json` (`@drts/ui-tokens`, `type: module`, no peerDeps)
  - `packages/ui-tokens/src/index.ts`
  - `packages/ui-tokens/src/colors.ts` — `OWNED`, `FORWARDED`, `SURFACE_ACCENTS`, `STATUS_TONES` (light + dark variants)
  - `packages/ui-tokens/src/status.ts` — typed enum + zh-TW display strings: `broadcasted`, `accept_pending`, `confirmed`, `lost_race`, `cancelled`, `sync_failed`, `manual_fallback_required`, `received`
  - `packages/ui-tokens/src/density.ts` — `compact`, `comfortable` numeric scales
  - `packages/ui-tokens/tsconfig.json`
  - `pnpm-workspace.yaml` (already includes `packages/*`, verify)
- Acceptance:
  - `pnpm --filter @drts/ui-tokens typecheck` passes
  - `pnpm --filter @drts/ui-tokens build` passes (or no-build with tsc noEmit)
  - Imported successfully from a temporary test file in `packages/ui-web/` and `apps/driver-app/`
- Source mapping reference (do not copy code, derive equivalents):
  - design canvas `tokens.jsx` (driver app palette)
  - design canvas `mgmt-tokens.jsx` (`MGMT_ACCENTS`, `buildMgmtTheme`)
- Guardrails: no React, no Tailwind, no CSS-in-JS; consumable from RN

### `DSY-UI-001` Extend `management-theme.ts` with surface accents + authority

- 中文說明：在 `packages/ui-web/src/management-theme.ts` 加入 surface accent
  (platform=indigo, ops=coral, tenant=teal, partner=amber)、owned/forwarded
  色、dark mode 變體。從 `@drts/ui-tokens` 取常數，不再 hardcode。
- Phase: `Wave 1`
- Depends on: `TOK-UI-001`
- Artifacts:
  - `packages/ui-web/src/management-theme.ts` (extended)
  - `packages/ui-web/package.json` (add `@drts/ui-tokens` as workspace dep)
- Acceptance:
  - `pnpm --filter @drts/ui-web typecheck`
  - Existing consumers in 3 consoles still build:
    - `pnpm --filter @drts/platform-admin-web typecheck`
    - `pnpm --filter @drts/ops-console-web typecheck`
    - `pnpm --filter @drts/tenant-console-web typecheck`
- Guardrails: do not break existing exported types; additive only

### `DSY-UI-002` Authority + status primitives in ui-web

- 中文說明：在 ui-web 新增 / 完善 `<AuthorityBadge>`, `<AuthorityBanner>`,
  `<PlatformBadge>`，並擴充 `<StatusChip>` 支援所有 forwarded lifecycle tone。
  以 `@drts/ui-tokens` 的 status enum 為唯一字串來源。
- Phase: `Wave 1`
- Depends on: `DSY-UI-001`
- Artifacts:
  - `packages/ui-web/src/management-primitives.tsx` (extended)
  - `packages/ui-web/src/index.tsx` (re-exports)
- Acceptance:
  - `pnpm --filter @drts/ui-web typecheck`
  - `pnpm --filter @drts/ui-web test`
  - 對應 Storybook story 在 `SBK-UI-002` 中可消費
- Source mapping: design canvas `components.jsx` (Chip, PlatformBadge, AuthorityBanner)
- Guardrails: forwarded vs owned 必須是 prop type discriminated union，不可用 string literal

### `DSY-UI-003` Shell redesign — sidebar + topbar

- 中文說明：新增 `<ManagementSidebar>` 支援 grouped section + per-item badge，
  以及 `<ManagementTopbar>` 含 breadcrumb / search / env chip / user。Replace
  既有 `<AppSidebar>` 的 flat 結構。對應 diff report 中「Net difference」最大
  的痛點。
- Phase: `Wave 1`
- Depends on: `DSY-UI-002`
- Artifacts:
  - `packages/ui-web/src/management-sidebar.tsx` (new)
  - `packages/ui-web/src/management-topbar.tsx` (new)
  - `packages/ui-web/src/management-shell.tsx` (orchestrate the two)
  - `packages/ui-web/src/index.tsx`
- Acceptance:
  - `pnpm --filter @drts/ui-web typecheck`
  - 單元測試 sidebar grouped rendering + badge tone
  - 既有 3 console build 不破
- Source mapping: design canvas `mgmt-shell.jsx` (Sidebar, Topbar, NavItem)
- Guardrails: 保留 `<AppSidebar>` export 一段時間以便漸進切換；不可同時刪除舊元件與切換消費者

### `DSY-UI-004` Density + dark mode toggle support

- 中文說明：theme 加 `density: "compact" | "comfortable"` 與 `dark: boolean`，
  經由 React context 傳遞。提供 `<ManagementThemeProvider>` 與 `useTheme()` hook。
- Phase: `Wave 1`
- Depends on: `DSY-UI-003`
- Artifacts:
  - `packages/ui-web/src/management-theme-context.tsx` (new)
  - `packages/ui-web/src/index.tsx`
- Acceptance:
  - `pnpm --filter @drts/ui-web typecheck` & `test`
  - Provider 在 ops Storybook 環境可用
- Guardrails: 預設不 opt-in dark mode；不影響既有未 wrap 的頁面

### `SBK-UI-001` Storybook for `@drts/ui-web`

- 中文說明：在 `packages/ui-web/` 加 Storybook (Vite builder, Next.js compatible)，
  作為 acceptance gate 的視覺對照場域。
- Phase: `Wave 1`
- Depends on: `DSY-UI-001`
- Artifacts:
  - `packages/ui-web/.storybook/`
  - `packages/ui-web/package.json` (storybook scripts + devDeps)
  - `packages/ui-web/src/**/*.stories.tsx`
- Acceptance:
  - `pnpm --filter @drts/ui-web storybook` 可啟動
  - `pnpm --filter @drts/ui-web build-storybook` 在 CI 可跑
- Guardrails: 不引入 visual regression 工具（人工 review per G3）

### `SBK-UI-002` Stories for authority + status + shell

- 中文說明：為 `DSY-UI-002` / `DSY-UI-003` 的元件寫 story，並在每個 story 旁
  以 `<iframe>` 嵌入 `docs/05-ui/drts-design-canvas/<file>.html` 對應的 artboard
  作為 side-by-side 比對。
- Phase: `Wave 1`
- Depends on: `SBK-UI-001`, `DSY-UI-002`, `DSY-UI-003`, `RDX-W0-001`
- Artifacts:
  - `packages/ui-web/src/management-primitives.stories.tsx`
  - `packages/ui-web/src/management-sidebar.stories.tsx`
  - `packages/ui-web/src/management-topbar.stories.tsx`
- Acceptance:
  - 每個 story 有 `Designed` 與 `Built` 兩個並排欄
  - 人類 reviewer 在 review notes 中明確說「視覺通過」或列出差異
- Guardrails: side-by-side 用 iframe 引用 `docs/05-ui/drts-design-canvas/` 內的 HTML，不要重新 host

---

## Wave 2 — Reference console: ops-console-web

Wave 2 的目標是把 ops-console 做到「打開 deployed dev 感覺就是設計稿」的程度。
結束後其他 console 用 mirror 模式跟進。

### `OPS-UI-RD-001` Adopt new shell

- 中文說明：用 `<ManagementShell>` (DSY-UI-003) 替換 ops-console 既有
  `components/sidebar.tsx` + `app/layout.tsx`。Sidebar 改 grouped + badge。
- Phase: `Wave 2`
- Depends on: `DSY-UI-003`
- Artifacts:
  - `apps/ops-console-web/app/layout.tsx`
  - `apps/ops-console-web/components/sidebar.tsx` (deleted or thin shim)
- Acceptance:
  - `pnpm --filter @drts/ops-console-web typecheck`
  - `pnpm --filter @drts/ops-console-web build`
  - 手動 review：所有 14 條既有路徑導航結構與 design canvas `Ops Console.html` 對得上
- Guardrails: behavior 不可動，只動 chrome

### `OPS-UI-RD-002` Strip ad-hoc CSS, adopt ui-web

- 中文說明：刪除 `apps/ops-console-web/app/globals.css` 內 `.admin-card`,
  `.admin-table`, `.admin-badge` 等 ad-hoc rule，改用 `<Card>`, `<DataTable>`,
  `<StatusChip>`。Tailwind 4 utility 仍可用於 layout。
- Phase: `Wave 2`
- Depends on: `OPS-UI-RD-001`
- Artifacts:
  - `apps/ops-console-web/app/globals.css` (清理)
  - 各 page 改寫
- Acceptance:
  - `apps/ops-console-web/app/globals.css` 不再含 `.admin-*` rule (`grep -r '\.admin-' apps/ops-console-web/app/globals.css` 為空)
  - 既有 acceptance：typecheck / build / lint / test 全通過

### `OPS-UI-RD-003` Dashboard redesign

- 中文說明：`app/dashboard/page.tsx` 重做為設計稿的 6-KPI strip + 待處理 banner +
  健康訊號 + 當前 dispatch 隊列。資料來源不變，只動 presentation。
- Phase: `Wave 2`
- Depends on: `OPS-UI-RD-002`
- Artifacts: `apps/ops-console-web/app/dashboard/page.tsx`
- Acceptance:
  - typecheck / build / test
  - Storybook story `OpsDashboard / Built` 與 design canvas `Ops Console.html → OC_Dashboard` 並排可審
- Source mapping: design canvas `ops-screens.jsx::OC_Dashboard`

### `OPS-UI-RD-004` Dispatch (owned + forwarded) redesign

- 中文說明：`app/dispatch/page.tsx` 用 4 個 tab (Owned / Forwarded / Override
  governance / No-supply)，導入 `<AuthorityBadge>` 區分 owned vs forwarded。
  Mirror table 必須以 forwarded 色區分，不可裝成 owned。
- Phase: `Wave 2`
- Depends on: `OPS-UI-RD-002`, `DSY-UI-002`
- Artifacts:
  - `apps/ops-console-web/app/dispatch/page.tsx`
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
  - `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx`
- Acceptance:
  - typecheck / build / test
  - `<AuthorityBadge>` 在 forwarded row 必定為 `forwarded` tone (vitest snapshot)
  - Storybook 對照 `OC_DispatchOwned` + `OC_DispatchForwarded`
- Source mapping: `ops-screens.jsx::OC_DispatchOwned/OC_DispatchForwarded/OC_DispatchDetail`

### `OPS-UI-RD-005` Callcenter redesign

- 中文說明：依設計稿重做 `app/callcenter/page.tsx`，Sessions / Callback queue
  / Recordings 三 tab。既有 live command 行為保留。
- Depends on: `OPS-UI-RD-002`
- Artifacts: `apps/ops-console-web/app/callcenter/page.tsx`
- Acceptance: typecheck / build / test + Storybook 對照 `OC_Callcenter`

### `OPS-UI-RD-006` Complaints + Incidents redesign

- 中文說明：`app/complaints/page.tsx` + `app/incidents/page.tsx` 視覺對齊。
  Incident detail 既有 embedded workspace 模式保留 (diff report 已記錄這比設計稿
  更強，不是 regression)；只動視覺。
- Depends on: `OPS-UI-RD-002`
- Artifacts: `apps/ops-console-web/app/complaints/page.tsx`, `apps/ops-console-web/app/incidents/page.tsx`
- Acceptance: typecheck / build / test + Storybook 對照 `OC_Complaints` + `OC_IncidentDetail`

### `OPS-UI-RD-007` Reports / Revenue / Attendance / Maintenance

- 中文說明：4 個 reporting 頁同步重做，共用同一 PR。視覺一致性比個別深度更重要。
- Depends on: `OPS-UI-RD-002`
- Artifacts: 對應 4 個 `app/*/page.tsx`
- Acceptance: typecheck / build / test + Storybook 對照 `OC_Reports/Revenue/Attendance/Maintenance`

### `OPS-UI-RD-008` Master data (drivers / vehicles / contracts / flags)

- 中文說明：4 個 master data 頁同步重做。Flags 維持 read-only。
- Depends on: `OPS-UI-RD-002`
- Artifacts: 對應 4 個 `app/*/page.tsx`
- Acceptance: typecheck / build / test + Storybook 對照

### `OPS-UI-RD-009` Wave 2 closeout — visual review packet

- 中文說明：所有 OPS-UI-RD-001..008 進 review_approved 後，產出
  `docs/05-ui/ops-console-redesign-closeout-20260???.md`，附每個畫面的
  before / after / design canvas 三圖比對與 reviewer 簽名。
- Depends on: `OPS-UI-RD-001..008`
- Owner: supervisor or designated UI lead
- Artifacts: closeout doc
- Acceptance: 文件內每個 surface 標註 reviewer + 通過時間

---

## Wave 3 — Mirror to platform-admin + tenant-console

Wave 3 的兩個 console 可以平行 (different agent owners)。每個 console 各
自的 task 列表結構與 Wave 2 對稱。

### Platform Admin (`ADM-UI-RD-NNN`)

- `ADM-UI-RD-001` Adopt new shell (mirror `OPS-UI-RD-001`)
- `ADM-UI-RD-002` Strip ad-hoc CSS (mirror `OPS-UI-RD-002`)
- `ADM-UI-RD-003` Home + Health redesign
- `ADM-UI-RD-004` Tenants list + Tenant Detail / Rollout redesign
- `ADM-UI-RD-005` Partners list + Partner Detail redesign
- `ADM-UI-RD-006` Users + Fleet + Switchboard redesign
- `ADM-UI-RD-007` Pricing redesign (含 publish flow)
- `ADM-UI-RD-008` Payments + Reconciliation Detail redesign
- `ADM-UI-RD-009` Notices + Audit + Flags + Adapters redesign
- `ADM-UI-RD-010` Wave 3 platform closeout packet

每 task 同 Wave 2 規格：typecheck / build / test + Storybook 對照
`platform-screens.jsx` 中對應的 `PA_*` artboard。

Depends on: `Wave 2 closeout` (`OPS-UI-RD-009`) + Wave 1。

### Tenant Console — redesign + parity-fill

Tenant Console 是 diff report 標註的最大 gap。除了 redesign 還要補 6 條缺的路徑。
拆兩條 sub-line：

#### Sub-line A — redesign existing routes

- `TEN-UI-RD-001` Adopt new shell + strip ad-hoc CSS
- `TEN-UI-RD-002` Home + Bookings list + Booking Detail redesign
- `TEN-UI-RD-003` Audit + Users + Settings redesign
- `TEN-UI-RD-004` Replace internal-language copy in `components/tenant-shell.tsx`
  (移除 `TEN-UI-001` / `XS-UI-004` / `Authority: /api/tenant/*` 等 implementation
  language；改為使用者面文案)

#### Sub-line B — parity-fill new routes

- `TEN-UI-RD-010` New Booking 完整化 (現為 placeholder)
- `TEN-UI-RD-011` Passengers route 新增
- `TEN-UI-RD-012` Addresses route 新增
- `TEN-UI-RD-013` Cost Center route 新增
- `TEN-UI-RD-014` Rules route 新增
- `TEN-UI-RD-015` Invoices route 新增
- `TEN-UI-RD-016` Reports route 新增
- `TEN-UI-RD-017` API Keys 完整化 (現為 IA shell)
- `TEN-UI-RD-018` Webhooks 完整化 (現為 IA shell)

每個 parity-fill task 額外要求：

- 對應後端 contract 是否齊全 (passengers / addresses / cost centers / rules
  contracts) — 若無則先開 blocker、回到 `discussion_planning`
- 文件：`docs/05-ui/tenant-console-parity-decisions-20260???.md`

- `TEN-UI-RD-099` Wave 3 tenant closeout packet

Depends on: Wave 2 closeout + Wave 1。Sub-line B 各 task 可能個別 depends on
contract task。

---

## Wave 4 — Driver app visual reskin (`DRV-UI-RD-NNN`)

driver-app 是 Expo / React Native，**不能 import @drts/ui-web**，只能用
`@drts/ui-tokens`。

- `DRV-UI-RD-001` Wire `@drts/ui-tokens` 進 driver-app；建 RN-side primitives
  layer `apps/driver-app/components/ui/` (新檔，不取代 `components/ui/` 既有)
- `DRV-UI-RD-002` Reskin Workspace cockpit (`app/index.tsx` / `app/onboarding.tsx`)
- `DRV-UI-RD-003` Reskin Inbox (`app/jobs.tsx`)
- `DRV-UI-RD-004` Reskin Trip (`app/trip.tsx`) — 7 個 state 全部 visual 對齊
  (owned_active / forwarded_offered / forwarded_pending / forwarded_confirmed
  / forwarded_lost / forwarded_cancelled / sync_failed)
- `DRV-UI-RD-005` Reskin Platform Presence (`app/platform-presence.tsx`)
- `DRV-UI-RD-006` Reskin Earnings + Shift (`app/earnings.tsx`, `app/shift.tsx`)
- `DRV-UI-RD-007` Reskin SOS (`app/incident.tsx`)
- `DRV-UI-RD-008` Reskin Settings (`app/settings.tsx`)
- `DRV-UI-RD-009` Wave 4 driver closeout packet

每 task 共同 acceptance:

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app test`
- `pnpm --filter @drts/driver-app lint`
- Expo dev build run on Android emulator (manual screenshot vs design canvas)

Depends on: Wave 1 (`TOK-UI-001`)。可與 Wave 3 平行。

Guardrails (整波):

- 禁止改變 backend 行為、location heartbeat、provisioning flow
- A/B variants 不實作 (從 Workspace A/B、Inbox A/B 中各選一個落地)
- 既有 forwarded sync_failed 處理邏輯比 mock 更強，不可降級

---

## Wave 5 — Partner Booking new app (`PBK-UI-NNN`)

### `PBK-UI-001` Bootstrap `apps/partner-booking-web/`

- 中文說明：新增 Next.js 16 + React 19 + Tailwind 4 app，與其他 console
  package.json 對齊。預設 port 不衝突 (建議 3006)。White-label：以 tenant slug
  路由，`/[tenantSlug]/...`。
- Phase: `Wave 5`
- Depends on: Wave 1
- Artifacts:
  - `apps/partner-booking-web/package.json`
  - `apps/partner-booking-web/app/`, `components/`, `lib/`
  - `apps/partner-booking-web/Dockerfile`
  - 註冊到 `pnpm-workspace.yaml` (若 `apps/*` 已涵蓋則無需動)
  - `apps/partner-booking-web/README.md` (說明 white-label 路由規則)
- Acceptance:
  - `pnpm --filter @drts/partner-booking-web typecheck`
  - `pnpm --filter @drts/partner-booking-web build`
  - `pnpm --filter @drts/partner-booking-web lint`
- Guardrails: 不部署；只在 CI build。Brand 暫用 placeholder neutral，待
  PBK-UI-003 才上 CTBC 主題。

### `PBK-UI-002` Partner-side token + brand layer

- 中文說明：在 `@drts/ui-tokens` 內加 `BRAND_TEMPLATES`（CTBC、CATHAY、GRAND
  示範三個），每個含 primary / accent / hotline / card-art metadata。Partner
  app 從 token 取，不 hardcode。
- Depends on: `PBK-UI-001`, `TOK-UI-001`
- Artifacts: `packages/ui-tokens/src/brands.ts`, `apps/partner-booking-web/lib/brand.ts`
- Acceptance: typecheck both packages

### `PBK-UI-003` CTBC reference funnel — 7 screens

- 中文說明：實作設計稿的 7 個 screen，全部以 white-label component + CTBC brand
  template demo：Landing、Eligibility、Book、Confirmed、Trips、Receipt、Help。
  資料先用 mock；不接後端。
- Depends on: `PBK-UI-002`
- Artifacts: `apps/partner-booking-web/app/[tenantSlug]/(public|authenticated)/...`
- Acceptance:
  - 7 條路由皆可 render
  - Storybook 對照 `partner-screens.jsx::PB_*`
  - 視覺 review 通過

### `PBK-UI-004` Authority-safe negative paths

- 中文說明：保留現有 `apps/tenant-console-web/app/partner/` 中已實作的
  `eligible / ineligible / manual_review / inactive entry / eligibility-required`
  五條 negative path 處理（diff report 標註比 mock 強），移植進新 app 並維持。
- Depends on: `PBK-UI-003`
- Artifacts: `apps/partner-booking-web/app/[tenantSlug]/...`
- Acceptance: 5 條 negative path 在新 app 可重現

### `PBK-UI-005` 新舊 partner mode 共存政策

- 中文說明：新 `partner-booking-web` 與既有 `tenant-console-web/app/partner/`
  路由共存。Decision doc 明確說明：何時切換、是否棄置舊路徑、過渡期長度。
  Supervisor 與 governance reviewer 共同簽名。
- Phase: `Wave 5`
- Depends on: `PBK-UI-004`
- Artifacts: `docs/01-decisions/SD-DP-20260???-NNN-partner-booking-app-cutover.md`
- Acceptance: decision doc accepted (per existing `SD-DP-*` flow)

---

## Cross-cutting acceptance gates

每個 redesign task **共同** acceptance，supervisor 在 brief 範本中應內建：

1. `pnpm --filter @drts/<app> typecheck` ✅
2. `pnpm --filter @drts/<app> lint` ✅
3. `pnpm --filter @drts/<app> build` ✅
4. `pnpm --filter @drts/<app> test` ✅ (允許 `--passWithNoTests`)
5. 對應 Storybook story 可啟動，並在 design canvas iframe 旁 render ✅
6. Reviewer 在 `ai-status.json` 該 task 的 `review_notes_zh` 內留下視覺通過或差異列表 ✅
7. Commit hash + reviewer 紀錄按既有 closeout 格式 ✅

每個 PR **禁止**：

- 修改 `docs/05-ui/drts-design-canvas/`（凍結 source of truth）
- 修改 backend 行為以遷就 UI（若需要應另開 contract task）
- 在 `current-work.md` 直接編輯（人類摘要，自動產生）
- 跨 console 動別人的檔案（每 task 嚴格鎖定 artifact 範圍）

---

## Dependency graph (compact)

```
RDX-W0-001 (canvas pin)
    └─→ RDX-W0-002 (seed backlog)
            └─→ RDX-W0-003 (sprint mode)
                    └─→ TOK-UI-001 (ui-tokens package)
                            ├─→ DSY-UI-001 (extend management-theme)
                            │       ├─→ DSY-UI-002 (authority primitives)
                            │       │       └─→ SBK-UI-002 (stories)
                            │       ├─→ DSY-UI-003 (shell redesign)
                            │       └─→ DSY-UI-004 (density / dark mode)
                            ├─→ SBK-UI-001 (storybook)
                            └─→ DRV-UI-RD-001 (driver wire-up)

DSY-UI-003 + DSY-UI-002
    └─→ OPS-UI-RD-001..009 (Wave 2)
            └─→ ADM-UI-RD-001..010 (Wave 3 platform)
            └─→ TEN-UI-RD-001..099 (Wave 3 tenant)

TOK-UI-001
    └─→ PBK-UI-001 (partner app bootstrap)
            └─→ PBK-UI-002..005
```

---

## Owner role suggestions (final assignment by supervisor)

- `Claude` — supervisor / governance / arbitration (RDX-W0-\* + closeout reviews)
- `Codex` / `Codex2` — contracts, schema (TOK-UI-001 reviewer; TEN-UI parity contract checks)
- `Claude2` — adapter / API integration (TEN-UI parity-fill backend wiring if needed)
- `Gemini` / `Gemini2` — ci/cd, infra, build (SBK-UI-001 storybook infra; PBK-UI-001 bootstrap)
- `Qwen` — implementation (Wave 2/3/4 redesign tasks — pick by availability)
- `Copilot` — critique reviewer (cross-task contradiction & weakness check)

具體 assignment 每 task 由 supervisor 在 brief 內決定，遵循
`SUPERVISOR_OPERATING_MODEL.md` 的 routing policy。

---

## Estimated total scope

- Wave 0: 3 tasks
- Wave 1: 6 tasks
- Wave 2: 9 tasks
- Wave 3: 10 (admin) + 14 (tenant sub-line A+B) = 24 tasks
- Wave 4: 9 tasks
- Wave 5: 5 tasks

**約 56 個 task brief**。

依 token 一致性與 Storybook acceptance 兩個 gate，估計 6–8 週可全部
review_approved（假設 4 個 implementation lane 並行）。

---

## Out-of-scope (再次明示，避免 scope creep)

- 不重做 `apps/passenger-web`
- 不重做 `apps/concierge-portal-web`
- 不啟用 `apps/tenant-portal-web`
- 不引入 Figma、不引入 visual regression CI
- 不替換 Tailwind 4（仍可作為 layout utility）
- 不更動 `@drts/ui-web` 既有 export 的 type 簽章（只允許 additive 擴充，至少
  到 Wave 3 結束之前）
- 不在 Wave 5 內讓 `partner-booking-web` 上線；只到 CI build pass

---

## Hand-off

完成本文件後，supervisor 預期動作：

1. 接 `RDX-W0-001`：解壓 canvas、commit、寫 `docs/05-ui/README.md` index
2. 接 `RDX-W0-002`：將上述 56 個 task 寫入 `ai-status.json`，建對應 brief
3. 接 `RDX-W0-003`：決定 sprint mode（新 sprint vs closeout 後續波次）
4. 開始派 Wave 1 task，遵照 `SUPERVISOR_OPERATING_MODEL.md`

如果在 Wave 2 / 3 / 5 過程中發現 backend contract 缺口（例：tenant
passengers / cost-center 沒有 service 層），supervisor 應依
`SUPERVISOR_OPERATING_MODEL.md` 切回 `discussion_planning` 模式，不可在
implementation lane 內悄悄擴張 contract。
