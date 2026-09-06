# SR-OPS-SHELL-001 Remediation Evidence: 營運助理遮擋與跨app導航

- **Task ID**: `SR-OPS-SHELL-001`
- **Owner**: `Gemini2`
- **Reviewer**: `Gemini`
- **Worktree**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-ops-shell-001`
- **Branch**: `gemini2/sr-ops-shell-001`
- **Base SHA**: `afefd55d3d23dd361d2dd81fd5f80eedb6671002`
- **Timestamp**: 2026-09-06T06:26:00Z
- **Reference Gaps**: R18 (404 on cross-app audit link from ops console), R19 (Ops Assistant panel obstruction of dispatch board and core CTAs at 1440px/390px)
- **Capability Ref**: C048 (`docs/04-uat/system-remediation-20260906/source/capabilities.json`)

---

## 1. Problem Statement & Root Cause Analysis

### R18: Cross-App Audit Navigation 404
- **Observation**: Clicking the `/audit ↗` link or audit receipts in the Ops Assistant or dispatch board navigated to relative URLs (e.g. `/platform-admin/audit` or `/_apps/platform-admin/audit` or `/audit?auditId=...`) on the current ops console origin (`http://localhost:3003`). Because the ops console Next.js app does not host platform-admin routes, this resulted in an immediate 404 error.
- **Root Cause**:
  1. `assistant-actions.ts` lacked logic to resolve the distinct Platform Admin origin (`http://localhost:3002` or `platform-admin.<domain>`).
  2. Action Hrefs and audit receipts were rendered with relative paths instead of absolute URLs targeted to the Platform Admin application.
  3. No application-level shell interceptor existed to handle relative platform-admin links rendered within page content.

### R19: Ops Assistant Panel Obstruction & Accessibility
- **Observation**:
  1. On first load, the Ops Assistant panel defaulted to an expanded 420x360 window positioned at `(1000, 620)`, directly covering the right-hand dispatch controls, filter bars, and `/audit ↗` links on both 1440px desktop and 390px mobile viewports.
  2. When minimized, clamping and docking logic used the full panel height (360px) rather than the minimized bar height (64px), causing the minimized panel to float awkwardly above the bottom edge.
  3. Closing or toggling the assistant failed to return keyboard focus, stranding keyboard and screen-reader users.
  4. The portal container risked capturing pointer events even when the widget was minimized.
- **Root Cause**:
  1. `buildDefaultState()` initialized with `minimized: false`.
  2. `clampRect()` and `resolveDockedPosition()` did not distinguish between expanded height (`rect.height`) and minimized height (`MINIMIZED_HEIGHT = 64`).
  3. Focus management refs were missing for the launcher button and modal handles.

---

## 2. Remediations Implemented

### 1. `apps/ops-console-web/components/ops-assistant/assistant-actions.ts`
- Added `resolvePlatformAdminOrigin()`:
  - Resolves `NEXT_PUBLIC_PLATFORM_ADMIN_URL` or `PLATFORM_ADMIN_ORIGIN`.
  - In browser contexts, translates `localhost:3003` to `localhost:3002`, or `ops.<domain>` / `ops-console.<domain>` to `platform-admin.<domain>`.
- Added `buildPlatformAdminCrossAppHref()`:
  - Constructs absolute target URLs to `/audit` or `/payments` on the platform-admin origin.
  - Automatically appends resource context query parameters (`auditId`, `resourceType`, `resourceId`).
- Updated `resolveAssistantActionHref()`:
  - Ensures platform-admin cross-app actions always return absolute external URLs.
- Added cross-app audit action with entity context to `/dispatch` route actions.

### 2. `apps/ops-console-web/components/ops-assistant/assistant-widget.tsx`
- **Default Minimized State**:
  - `buildDefaultState()` now defaults to `minimized: true` and docks directly to the bottom right:
    `y = Math.max(edgeGap, viewport.height - MINIMIZED_HEIGHT - edgeGap)`.
  - The dispatch board and core CTAs remain 100% visible and unobstructed on initial page load at 1440px desktop and 390px mobile viewports.
- **Effective Height Clamping**:
  - `clampRect()` and `resolveDockedPosition()` use `effectiveHeight = rect.minimized ? MINIMIZED_HEIGHT : rect.height`.
  - Minimized bar stays flush against the bottom edge and never floats awkwardly in the viewport center.
- **Keyboard Focus Management**:
  - Added `launcherRef` and `dragHandleRef`.
  - Closing or minimizing the assistant automatically returns focus to `launcherRef`.
  - Opening the assistant moves focus to `dragHandleRef`.
- **Pointer Events**:
  - Added `node.style.pointerEvents = "none"` to the root portal container so clicks outside the widget pass through to the page seamlessly.
- **Receipt Links**:
  - `appendReceipt()` uses `buildPlatformAdminCrossAppHref()` to render absolute cross-app links opening in `target="_blank" rel="noreferrer"`.

### 3. `apps/ops-console-web/components/ops-shell.tsx`
- Added `handleClickCapture` link interceptor:
  - Intercepts clicks on anchor elements linking to `/platform-admin/*`, `/_apps/platform-admin/*`, or relative `/audit`.
  - Rewrites target to absolute platform-admin URL and safely opens in a new tab (`window.open(targetUrl, "_blank", "noopener,noreferrer")`).
  - Prevents 404 errors from any legacy relative audit links in the ops console shell.

### 4. `tests/unit/system-remediation/sr-ops-shell-001/ops-shell-and-assistant.test.ts`
- Added 19 comprehensive unit tests verifying:
  - Platform Admin origin resolution (env vars, localhost port mapping, domain replacement).
  - Cross-app audit & payments URL construction with query parameters (`auditId`, `resourceType`, `resourceId`).
  - Ops assistant action resolution on dispatch board.
  - 1440px desktop viewport clamping (unobstructed layout, bottom anchoring).
  - 390px mobile viewport clamping (fits within screen width and height).
  - Minimized height calculation (`effectiveHeight = 64`).
  - Default minimized state configuration.
  - Keyboard focus return on close/minimize.
  - `OpsShell` link capture intercepting relative audit links and converting to absolute platform-admin URLs.

### 5. `apps/ops-console-web/components/ops-assistant/translations.ts`
- Added localized translations module for Ops Assistant cross-app action descriptions to satisfy `i18n-guard.mjs`.
- Eliminated inline locale conditional ternary from `assistant-actions.ts`.
- Removed unused variables (`WIDGET_MIN_WIDTH`, `HEADER_HEIGHT`) in `assistant-widget.tsx` and unit tests.

---

## 3. Verification & Test Evidence

### Command Outputs

#### 1. Vitest Unit Test Suite
```bash
$ pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-ops-shell-001

 ✓ tests/unit/system-remediation/sr-ops-shell-001/ops-shell-and-assistant.test.ts (19 tests) 31ms

 Test Files  1 passed (1)
      Tests  19 passed (19)
   Start at  06:35:01
   Duration  900ms
```

#### 2. Next.js Typecheck
```bash
$ pnpm --filter @drts/ops-console-web typecheck

> @drts/ops-console-web@0.1.0 typecheck /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-ops-shell-001/apps/ops-console-web
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
```

#### 3. Root ESLint
```bash
$ pnpm lint:root

> drts-fleet-platform@0.1.0 lint:root /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-ops-shell-001
> eslint eslint.config.mjs playwright*.config.ts vitest.config.ts tests --max-warnings=0
(clean, exit code 0)
```

#### 4. Ops Console Package Lint
```bash
$ pnpm --filter @drts/ops-console-web lint

> @drts/ops-console-web@0.1.0 lint /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-ops-shell-001/apps/ops-console-web
> eslint . --max-warnings=0
(clean, exit code 0)
```

#### 5. i18n Guard
```bash
$ node tools/ci/i18n-guard.mjs
i18n-guard: OK (517 files scanned across 10 apps, 52 exemption(s) from i18n-guard-baseline.json)
```

#### 6. Git Diff Formatting
```bash
$ git diff --check
(clean, no trailing whitespace or format issues)
```

---

## 4. Scope Compliance
All changes are strictly confined to the allowed write scopes:
- `apps/ops-console-web/components/ops-assistant/`
- `apps/ops-console-web/components/ops-shell.tsx`
- `tests/unit/system-remediation/sr-ops-shell-001/`
- `docs/04-uat/system-remediation-20260906/SR-OPS-SHELL-001.md`
