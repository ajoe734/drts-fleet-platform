# IAM-UI-PLAT-001 — BFF and Frontend Handoff Packet

- Sidecar Task: `IAM-UI-PLAT-001-SIDECAR-BFF-HANDOFF`
- Parent Task: `IAM-UI-PLAT-001` (Build Platform Admin account role session review and break-glass surfaces)
- Helper Kind: `bff_handoff_packet`
- Parent Owner: `Gemini2`
- Parent Reviewer: `Claude`
- Sidecar Owner: `Gemini`
- Sidecar Reviewer: `Gemini2`
- Date: `2026-08-05`
- Dependency: `IAM-ACC-002` (Durable platform admin persistence — `done`, commit `45abc7b295d7`)
- Class: support / sidecar — does not mutate canonical truth

---

## 1. Purpose

This packet prepares the BFF query inventory, frontend operator journeys, security guardrails, and design contract anchors required for the parent task `IAM-UI-PLAT-001`.

The parent task `IAM-UI-PLAT-001` is responsible for delivering the Platform Admin Identity & Access Management (IAM) governance surfaces, including:
1. **Users & Memberships Management** (`/users` or `/platform-admin/users`)
2. **User Invite & Role Allocation** (`/users/invite`)
3. **User Detail & Privileged Audit Timeline** (`/users/[userId]`)
4. **Role Change & SoD Approval Workflow** (`/roles/approval`)
5. **Account Suspension & Credential Revocation** (`/users/[userId]/suspend`)
6. **Access Certification Reviews** (`/access-reviews`)
7. **Break-Glass Emergency Protocol & Active Session Banner** (`/break-glass`)

This document is execution-oriented support context. It does not alter canonical truth in `phase1_*` specs, `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`, or `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`.

---

## 2. Canonical & Design Anchors

### 2.1 Specification & Architecture Anchors
- **Stage 1.5 Architecture Hardening Plan**: [`docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md)
  - §8.1-8.3: Break-glass request, two-person approval, 60-minute non-refreshable session, persistent active banner, and post-use review.
  - §13.1: Platform Admin UI/UX required screens (`Users`, `Invite User`, `User Detail`, `Role Change`, `Suspend/Disable`, `Access Reviews`, `Break Glass`).
  - §13.4: Common UX security rules (server authority, masked error details, zero secret leakage in DOM/logs/URL).
  - §14.1-14.2: Audit logging and canonical security event fields.
- **Stage 1.5 Execution Runbook**: [`docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md)
  - Section 5.5: `IAM-UI-PLAT-001` execution contract ("Build Platform Admin users, memberships, sessions, role approval, access review and break-glass surfaces using backend authority. Include risk/SoD/expiry state and persistent privileged-session banner.").

### 2.2 UI Design Canvas & Token Anchors
- **Design Canvas**: `docs/05-ui/drts-design-canvas/Platform Admin.html` and `platform-screens.jsx` (`PA_Users`).
- **UI Design System**: `packages/ui-tokens` (`@drts/ui-tokens` management/platform admin realm tokens).
- **Shared Primitives**: `packages/ui-web` (`@drts/ui-web`) and `apps/platform-admin-web/components/platform-ui.tsx`.

### 2.3 Codebase Baseline & Dependencies
- **Preceding Dependency**: `IAM-ACC-002` (Durable Platform Admin Persistence, landed by Codex in `apps/api/src/modules/platform-admin/` and `apps/api/src/modules/identity/`).
- **Web App Surface**: `apps/platform-admin-web/`
  - Current Users Page: [`apps/platform-admin-web/app/users/page.tsx`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/apps/platform-admin-web/app/users/page.tsx)
  - Authority Hook & Client: [`apps/platform-admin-web/lib/admin-client.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/apps/platform-admin-web/lib/admin-client.ts) and [`apps/platform-admin-web/lib/platform-admin-client-factory.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/apps/platform-admin-web/lib/platform-admin-client-factory.ts)
  - Server Authority Context: [`apps/platform-admin-web/lib/server-platform-admin-authority.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/apps/platform-admin-web/lib/server-platform-admin-authority.ts)
  - Control Plane Proxy: [`apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts)
- **API Client & Contracts**: `@drts/api-client` ([`packages/api-client/src/index.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/packages/api-client/src/index.ts)) and `@drts/contracts` ([`packages/contracts/src/index.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-ui-plat-001-sidecar-bff-handoff/packages/contracts/src/index.ts)).

---

## 3. Authority & Security Guardrails

These non-negotiable security guardrails apply to all UI implementations in `IAM-UI-PLAT-001`:

1. **Server-Issued Authority Only**:
   - The frontend MUST NOT infer user roles, permissions, or break-glass access from client state alone. All role displays and action buttons must reflect responses from `/api/platform-admin/users` or `/api/auth/me`.
2. **Separation of Duties (SoD) & Last-Admin Protection**:
   - Role updates or user suspensions that would remove the last active `superadmin` or violate SoD policies (e.g. self-approving elevated roles) must be rejected by backend authority and clearly communicated via server-returned error codes (e.g., `LAST_ADMIN_PROTECTION_TRIGGERED`, `SOD_VIOLATION`).
3. **Break-Glass Emergency Protocol**:
   - Break-glass sessions require two-person approval.
   - Session duration is hard-capped at 60 minutes with no refresh capability.
   - When active, a persistent, un-dismissible, glowing high-contrast banner (`BreakGlassBanner`) MUST render at the top of ALL Platform Admin pages showing remaining time countdown and an immediate "Emergency Exit / Terminate Session" action button.
4. **Append-Only Privileged Audit Logging**:
   - Every administrative action (invite, role change, suspend, break-glass request, approval, access review certification) MUST generate append-only audit events via `IAM-AUD-001` backend tracking with actor ID, reason, and before-after state diff.
5. **Strict Data Protection**:
   - Sensitive credentials, MFA recovery keys, or secret tokens MUST NEVER be rendered in client logs, toasts, URL search params, or DOM debug attributes.

---

## 4. Surface-By-Surface Operator Journey & BFF Query Inventory

### 4.1 Surface 1: Users & Memberships List (`/users` or `/platform-admin/users`)

- **Design Intent**:
  - Displays all durable Platform Admin users, their primary role (`superadmin`, `admin`, `operator`, `viewer`), status (`active`, `suspended`, `invited`), MFA enrollment state, last login timestamp, and active sessions count.
- **Current Code Baseline**:
  - `apps/platform-admin-web/app/users/page.tsx` renders a basic list calling `client.listPlatformAdminUsers()`.
- **Available BFF Queries**:
  | Need | API Method | Path | Status |
  |---|---|---|---|
  | List platform users | `client.listPlatformAdminUsers()` | `GET /api/platform-admin/users` | **Available** |
  | Get user record | `client.getPlatformAdminUser(userId)` | `GET /api/platform-admin/users/{userId}` | **Gap (Need Endpoint)** |
- **BFF Gaps**:
  - `PlatformAdminUserRecord` currently contains only `userId`, `email`, `displayName`, `roleCode`, `status`, `createdAt`, `updatedAt`.
  - **Gap 1**: Missing `mfaEnabled` (boolean), `lastLoginAt` (string | null), and `activeSessionsCount` (number) in `PlatformAdminUserRecord`.
  - **Gap 2**: No filtering by `roleCode` or `status` parameters in `GET /api/platform-admin/users`.
- **Carry-Forward for Parent Owner (`Gemini2`)**:
  - Extend `PlatformAdminUserRecord` in `@drts/contracts` (or create a view model envelope) to surface `mfaStatus`, `lastLoginAt`, and `activeSessionsCount`.
  - Update `apps/platform-admin-web/app/users/page.tsx` to use shared `@drts/ui-web` components (`StatusChip`, `KpiRow`, `DataTable`).

---

### 4.2 Surface 2: Invite User & Role Allocation (`/users/invite`)

- **Design Intent**:
  - Form for inviting new internal Platform Admin staff.
  - Operator selects role, inputs email and display name, previews scope boundaries, and views role risk level (e.g., `superadmin` = High Risk, SoD approval required).
- **Current Code Baseline**:
  - Form currently in modal on `apps/platform-admin-web/app/users/page.tsx` invoking `client.createPlatformAdminUser(command)`.
- **Available BFF Queries**:
  | Need | API Method | Path | Status |
  |---|---|---|---|
  | Invite / Create User | `client.createPlatformAdminUser(command)` | `POST /api/platform-admin/users` | **Available** |
  | Role Risk Catalog | `client.getPlatformRoleCatalog()` | `GET /api/platform-admin/roles` | **Gap (Need Endpoint)** |
- **BFF Gaps**:
  - `CreatePlatformAdminUserCommand` supports `{ email, displayName, roleCode }`.
  - **Gap 1**: Invitation expiry (`expiresAt`) and explicit invitation resend/cancel endpoints (`POST /api/platform-admin/invitations/{id}/resend`, `DELETE /api/platform-admin/invitations/{id}`) are missing in the BFF client.
  - **Gap 2**: Pre-flight role risk preview (showing required approval chains if `superadmin` is requested) is missing.
- **Carry-Forward for Parent Owner (`Gemini2`)**:
  - Implement role risk indicator badges in the invitation UI (e.g. High Risk tag when selecting `superadmin`).
  - Wire error handling for duplicate email or domain policy restrictions.

---

### 4.3 Surface 3: User Detail & Privileged Audit Timeline (`/users/[userId]`)

- **Design Intent**:
  - Dedicated detail workspace for a single platform user.
  - Surfaces: (1) Account Summary & MFA status, (2) Role History & Assignment Changes, (3) Active Sessions with remote revoke actions, (4) Audit Timeline of privileged actions performed by/on this user.
- **Current Code Baseline**:
  - No dedicated page `/users/[userId]` exists in `apps/platform-admin-web/app/`.
- **Available BFF Queries**:
  | Need | API Method | Path | Status |
  |---|---|---|---|
  | User Audit Logs | `client.listAuditLogs({ actorId })` | `GET /api/audit?actorId={userId}` | **Partial (Query Param Gap)** |
  | Active User Sessions | `client.listUserSessions(userId)` | `GET /api/platform-admin/users/{userId}/sessions` | **Gap (Need Endpoint)** |
  | Revoke User Session | `client.revokeUserSession(userId, sessionId)` | `POST /api/platform-admin/users/{userId}/sessions/{sessionId}/revoke` | **Gap (Need Endpoint)** |
  | Revoke All Sessions | `client.revokeAllUserSessions(userId)` | `POST /api/platform-admin/users/{userId}/sessions/revoke-all` | **Gap (Need Endpoint)** |
- **BFF Gaps**:
  - `listAuditLogs()` currently takes no filter arguments in `@drts/api-client`.
  - Dedicated session management endpoints for platform admin users are not exposed in `@drts/api-client`.
- **Carry-Forward for Parent Owner (`Gemini2`)**:
  - Create route `apps/platform-admin-web/app/users/[userId]/page.tsx`.
  - Add session list & revoke endpoints to `apps/api/src/modules/platform-admin/` and `@drts/api-client`.

---

### 4.4 Surface 4: Role Change & SoD Approval Workflow (`/roles/approval`)

- **Design Intent**:
  - Workflow for requesting and approving role elevation (e.g., `operator` -> `superadmin`).
  - Displays: (1) Before-After Role Diff, (2) SoD (Separation of Duties) Risk Warning, (3) Last-Admin Protection Check, (4) Approver Action (Approve / Reject with reason).
- **Current Code Baseline**:
  - Immediate role update exists via `client.updatePlatformAdminUserRole(userId, command)`.
- **Available BFF Queries**:
  | Need | API Method | Path | Status |
  |---|---|---|---|
  | Direct Role Update | `client.updatePlatformAdminUserRole(userId, command)` | `POST /api/platform-admin/users/{userId}/role` | **Available** |
  | Request Role Elevation | `client.requestRoleChange(command)` | `POST /api/platform-admin/role-requests` | **Gap (Need Endpoint)** |
  | List Pending Approvals | `client.listPendingRoleRequests()` | `GET /api/platform-admin/role-requests?status=pending` | **Gap (Need Endpoint)** |
  | Approve/Reject Request | `client.decideRoleRequest(requestId, decision)` | `POST /api/platform-admin/role-requests/{id}/decision` | **Gap (Need Endpoint)** |
- **BFF Gaps**:
  - Currently `updatePlatformAdminUserRole` applies role updates immediately without a two-person approval queue for high-privilege roles.
- **Carry-Forward for Parent Owner (`Gemini2`)**:
  - If high-risk role changes require approval, implement two-step request/approve endpoints or document direct updates with server-side SoD checks.
  - Surface server-returned SoD warnings (`SOD_CONFLICT_DETECTED`) in a `CalloutBanner` component.

---

### 4.5 Surface 5: Account Suspension & Credential Revocation (`/users/[userId]/suspend`)

- **Design Intent**:
  - Emergency/operational account suspension dialog or sub-view.
  - Operator must provide a mandatory reason and select revocation scope (e.g. revoke all active sessions, invalidate refresh tokens, block login).
- **Current Code Baseline**:
  - `UpdatePlatformAdminUserRoleCommand` accepts optional `status?: "active" | "suspended" | "invited"`.
- **Available BFF Queries**:
  | Need | API Method | Path | Status |
  |---|---|---|---|
  | Set Status to Suspended | `client.updatePlatformAdminUserRole(userId, { roleCode, status: "suspended" })` | `POST /api/platform-admin/users/{userId}/role` | **Partial** |
  | Explicit Suspend Command | `client.suspendPlatformAdminUser(userId, { reason })` | `POST /api/platform-admin/users/{userId}/suspend` | **Gap (Need Endpoint)** |
- **BFF Gaps**:
  - Updating status via `updatePlatformAdminUserRole` does not currently enforce a mandatory audit `reason` string in the request payload.
- **Carry-Forward for Parent Owner (`Gemini2`)**:
  - Add dedicated `POST /api/platform-admin/users/{userId}/suspend` endpoint with `{ reason: string }` body to guarantee audited suspension reasons.
  - Ensure suspension triggers immediate session revocation across all active tokens.

---

### 4.6 Surface 6: Access Certification Reviews (`/access-reviews`)

- **Design Intent**:
  - Quarterly or event-triggered privileged access review console.
  - Displays active campaigns, overdue user access certifications, and provides actions: (1) Certify Access, (2) Reduce Role Scope, (3) Revoke Access.
- **Current Code Baseline**:
  - No access review pages exist in `apps/platform-admin-web/`.
- **Available BFF Queries**:
  | Need | API Method | Path | Status |
  |---|---|---|---|
  | List Review Campaigns | `client.listAccessReviewCampaigns()` | `GET /api/platform-admin/access-reviews` | **Gap (Need Endpoint)** |
  | Certify User Access | `client.certifyUserAccess(campaignId, userId, decision)` | `POST /api/platform-admin/access-reviews/{id}/certify` | **Gap (Need Endpoint)** |
- **BFF Gaps**:
  - Access review endpoints do not yet exist in `@drts/api-client`.
- **Carry-Forward for Parent Owner (`Gemini2`)**:
  - Create `apps/platform-admin-web/app/platform-admin/access-reviews/page.tsx` scaffold.
  - If backend endpoints are pending, structure the UI around a clean mock/contract adapter aligned with `@drts/contracts`.

---

### 4.7 Surface 7: Break-Glass Emergency Protocol & Active Session Banner (`/break-glass`)

- **Design Intent**:
  - High-security break-glass emergency activation and management page.
  - Features:
    1. **Request Break-Glass**: Form with emergency reason, target scope, and duration (max 60m).
    2. **Two-Person Approval Queue**: Independent approver verifies emergency justification.
    3. **Active Privileged-Session Banner**: Rendered site-wide on ALL Platform Admin pages during active break-glass.
    4. **Emergency Exit**: Button on banner & page to immediately terminate break-glass session and audit the activity.
- **Current Code Baseline**:
  - No break-glass pages or global banner components exist in `apps/platform-admin-web/`.
- **Available BFF Queries**:
  | Need | API Method | Path | Status |
  |---|---|---|---|
  | Request Break-Glass | `client.requestBreakGlass(command)` | `POST /api/platform-admin/break-glass/request` | **Gap (Need Endpoint)** |
  | Approve Break-Glass | `client.approveBreakGlass(requestId, decision)` | `POST /api/platform-admin/break-glass/approve` | **Gap (Need Endpoint)** |
  | Get Break-Glass Status | `client.getBreakGlassStatus()` | `GET /api/platform-admin/break-glass/status` | **Gap (Need Endpoint)** |
  | Terminate Break-Glass | `client.terminateBreakGlass(sessionId)` | `POST /api/platform-admin/break-glass/terminate` | **Gap (Need Endpoint)** |
- **BFF Gaps**:
  - Break-glass endpoints (`/api/platform-admin/break-glass/*`) need to be declared in `@drts/contracts` and implemented in `apps/api/src/modules/platform-admin/`.
- **Carry-Forward for Parent Owner (`Gemini2`)**:
  - Build `BreakGlassBanner` component in `apps/platform-admin-web/components/break-glass-banner.tsx` and attach it inside `apps/platform-admin-web/components/admin-shell.tsx` or `layout.tsx`.
  - Ensure banner displays active countdown timer, reason, and an immediate "Terminate Session" button.

---

## 5. BFF Query Gap Summary Table

| Surface | Functionality | Current API Status in `@drts/api-client` | Required Endpoint / Contract Action |
|---|---|---|---|
| **Users List** | List Platform Users | `GET /api/platform-admin/users` (Available) | Add `mfaEnabled`, `lastLoginAt`, `activeSessions` fields to record shape |
| **Invite User** | Invite Admin User | `POST /api/platform-admin/users` (Available) | Add role risk indicator & invitation expiration support |
| **User Detail** | View Sessions & Revoke | Missing in API Client | Add `GET /api/platform-admin/users/{id}/sessions` & `POST .../revoke` |
| **Role Change** | Elevate Role / Approval | `POST /api/platform-admin/users/{id}/role` (Direct Update) | Add pending request queue for high-risk roles if two-person approval is required |
| **Suspend User** | Audited Suspension | Status field update in role POST (Partial) | Add `POST /api/platform-admin/users/{id}/suspend` with mandatory `reason` |
| **Access Reviews** | Campaign & Certification | Missing in API Client | Add `GET /api/platform-admin/access-reviews` & `POST .../certify` |
| **Break Glass** | Emergency Protocol & Banner | Missing in API Client | Add `/api/platform-admin/break-glass/*` endpoints & global `BreakGlassBanner` component |

---

## 6. Cross-Surface Design & Engineering Guidelines

1. **Design System & Theme Tokens**:
   - MUST use `@drts/ui-tokens` platform admin realm colors (e.g. primary indigo/slate palette). Hardcoded hex codes in components or `globals.css` are defects.
2. **Shared UI Primitives**:
   - Reuse components from `@drts/ui-web` or `components/platform-ui.tsx`:
     - `SectionHeader` / `PageHeader`
     - `KpiRow` & `KpiCard`
     - `StatusChip` (active: success, suspended: warn/danger, invited: info)
     - `CalloutBanner` (for SoD warnings, break-glass alerts, and system notices)
     - `DataTable` & `DataFilterBar`
3. **i18n & Translation Parity**:
   - All user-facing strings must use `useTranslation()` from `lib/i18n.tsx` with keys under `users.*`, `roles.*`, `breakGlass.*`, `accessReviews.*`.
4. **Proxy & Auth Path**:
   - All API requests MUST route through `usePlatformAdminClient()` which uses the control-plane proxy (`/control-plane-proxy/...`) with `@drts/control-plane-auth` headers.

---

## 7. Open Questions & Escalations

1. **Break-Glass Notification Channel**:
   - *Question*: When break-glass is requested, should notification route to Security Slack/Webhook or Email?
   - *Recommendation*: Default to triggering an `IAM-AUD-001` critical audit event & forwarding to webhook alert.
2. **Role Elevation Approval Policy**:
   - *Question*: Do all role changes require approval, or only transitions to `superadmin`?
   - *Recommendation*: Direct update for `viewer`/`operator` with audit log; mandatory approval queue for `superadmin` role assignments.
3. **Access Review Campaign Lifecycle**:
   - *Question*: Is campaign creation automated quarterly or manually initiated by security admins?
   - *Recommendation*: Support manual campaign initiation initially via `/api/platform-admin/access-reviews/create`.

---

## 8. Do-Not-Break Invariants

- **Do NOT bypass server authority**: Role grants or access checks MUST NOT be mocked or calculated on the frontend.
- **Do NOT leak credentials**: Secrets, tokens, and raw hashes must never appear in DOM, logs, or URL queries.
- **Do NOT delete audit history**: All actions must be append-only audit events.
- **Do NOT allow hidden break-glass sessions**: The `BreakGlassBanner` must be visible across all pages while break-glass is active.

---

## 9. Acceptance & Handoff Verification

- [x] Artifact created at `support/sidecars/IAM-UI-PLAT-001/IAM-UI-PLAT-001-SIDECAR-BFF-HANDOFF.md`.
- [x] No canonical truth files modified by this sidecar slice.
- [x] BFF query inventory and gap analysis completed against `@drts/api-client` and `@drts/contracts`.
- [x] Security guardrails, UX rules, and operator journeys defined.
- [x] Ready for handoff to reviewer `Gemini2`.
