# Platform Admin — Identity Access & Break-Glass Security Screen Requirements

**Date:** 2026-08-13  
**Task:** `IAM-UI-PLAT-001`  
**Surfaces:**  
- `apps/platform-admin-web/app/users/page.tsx`
- `apps/platform-admin-web/app/users/users-governance-components.tsx`
- `apps/platform-admin-web/lib/platform-admin-iam-client.ts`
- `apps/platform-admin-web/components/break-glass-context.tsx`
- `apps/platform-admin-web/components/admin-shell.tsx`  
**Status:** App-specific screen-requirements artifact extending `docs/05-ui/drts-design-canvas/Platform Admin.html` and `platform-screens.jsx` (`PA_Users`).  
**Author lane:** Gemini  
**Visual authority:** `docs/05-ui/drts-design-canvas/Platform Admin.html` · `docs/05-ui/drts-design-canvas/platform-screens.jsx` (`PA_Users`) · `@drts/ui-tokens` · `@drts/ui-web`

---

## 1. Canvas Gap & Scope Confirmation

- `docs/05-ui/drts-design-canvas/platform-screens.jsx` defines `PA_Users` showing the core Platform Admin staff table.
- However, Stage 1.5 identity & access account security hardening (`stage1-5-identity-access-account-security-hardening-plan-20260801.md` §13.1) specifies additional governance surfaces:
  1. **Users & Memberships**: Durable user list, memberships across realms/tenants, MFA status, last-login timestamp, active session count, user detail drawer with session revocation and audit timeline.
  2. **Privileged Role Requests & Approvals**: Step-up approval workflow, two-person approval, before-after role diff, Separation of Duties (SoD) violation warning, last-admin protection warning, temporary grant expiry, and manual grant removal.
  3. **Access Reviews**: Access review campaigns list, campaign details with review items, certify/reduce/remove decisions, overdue sweep triggering, and audit evidence query.
  4. **Break-Glass Emergency Access**: Break-glass request creation, two-person approval, activation with duration (max 60m), and persistent active-session banner with countdown TTL and exit control.

Implication:
- The Platform Admin users surface (`/users`) is extended into a multi-tab governance workspace:
  - `Users` (`users`): Workforce user list, invite drawer, role update & suspend/activate, detail drawer.
  - `Sessions` (`sessions`): Active session inventory, masked token summaries, remote session revocation.
  - `Role Approvals` (`role-approvals`): Privileged role requests, before-after diffs, SoD conflict warnings, step-up approval triggers.
  - `Access Reviews` (`access-reviews`): Review campaigns, overdue sweeps, certifying/reducing/removing role bindings, audit evidence logs.
  - `Break-Glass` (`break-glass`): Emergency access request, two-person approval, activation token issuance, and emergency grant close.
- A persistent `BreakGlassBanner` is mounted at the shell level (`AdminShell`) whenever an emergency access grant or break-glass session token is active.

---

## 2. Tokens & Design System Compliance

- Surface realm: `platform` (`REALM_COLORS.platform` light/dark tokens from `@drts/ui-tokens`).
- Theme build: `buildCanvasTheme({ surface: "platform", density: "compact" })` from `@drts/ui-web`.
- Palette: Light fg `#4F46E5`, bg `#EEF2FF`, border `#C7D2FE`; Dark fg `#A5B4FC`, bg `#1E1B4B`, border `#312E81`.
- Canvas primitives used:
  - `CanvasShell` / `AdminShell`
  - `CanvasPageHeader`
  - `CanvasCard`
  - `CanvasPill` (toned with `success`, `warn`, `danger`, `accent`, `info`, `neutral`)
  - `CanvasBtn` (variants `primary`, `secondary`, `ghost`, `danger`)
  - `CanvasTable`
  - `CanvasBanner`
  - `CanvasField`, `CanvasInput`, `CanvasSelect`
  - `CanvasIcon`
- Zero hardcoded custom hex strings, zero un-tracked typefaces.

---

## 3. Surface & Data Contracts

### 3.1 Users & Memberships
- Displays user record table with avatar, display name, email, role badge, status badge (`active`, `invited`, `suspended`), last login, active sessions count.
- Detail drawer displays:
  - Associated memberships and scope bounds.
  - Active sessions with `maskSessionRecord` output and "Revoke Session" action.
  - Credentials & MFA registration state.
  - Historical role audit timeline.

### 3.2 Privileged Role Approvals & SoD
- Form to submit `CreatePrivilegedRoleRequestCommand` with requested role, justification, and step-up proof reference.
- Renders before-after role diff pill (e.g. `operator` → `superadmin`).
- Highlights SoD warnings (`IAM_SOD_VIOLATION`) when requester matches target or conflicting roles exist.
- Enforces Last-Admin Protection (`IAM_LAST_ADMIN_PROTECTION`) when modifying or removing the final active `superadmin`.

### 3.3 Access Reviews
- Campaign creation modal (`CreateAccessReviewCampaignCommand`).
- Items table showing target principal, role, decision state (`pending`, `certified`, `reduced`, `removed`, `overdue`).
- Decision actions:
  - `Certify`: Retain current role binding.
  - `Reduce`: Demote role to `reducedRoleCode`.
  - `Remove`: Revoke role binding immediately.
  - `Overdue Sweep`: Evaluate and auto-remediate overdue items per policy.
- Queryable access review audit evidence log.

### 3.4 Break-Glass Emergency Access & Persistent Banner
- Form to submit `CreateBreakGlassRequestCommand` (scopes, reasonCode, reasonText, proofReference).
- Two-person approval control (`ApproveBreakGlassRequestCommand`).
- Activation (`IamBreakGlassActivationCommand`) issuing short-lived emergency session token with `sessionBanner = "BREAK_GLASS_ACTIVE"`.
- Persistent Top Banner:
  - Rendered at top of `AdminShell` when active.
  - Red/danger banner with 🚨 icon, countdown timer (minutes/seconds remaining), granted scopes list, and `[Exit Break-Glass]` action.
  - Exit invokes `CloseBreakGlassGrantCommand` and clears local break-glass state.
