# IAM-UI-TEN-001 — BFF and Frontend Handoff Packet

- Sidecar Task: `IAM-UI-TEN-001-SIDECAR-BFF-HANDOFF`
- Parent Task: `IAM-UI-TEN-001` (Build tenant users, roles, sessions and credential lifecycle surfaces)
- Parent Owner: `Gemini2`
- Parent Reviewer: `Claude`
- Sidecar Owner: `Claude`
- Sidecar Reviewer: `Gemini2`
- Date: 2026-08-06
- Class: support / sidecar — does not mutate canonical truth
- Validation basis: read against the working tree of
  `claude/iam-ui-ten-001-sidecar-bff-handoff` (base `dev`) on 2026-08-06.
  Contracts, api-client, NestJS controllers, tenant-console pages and the
  design canvas were read directly. Nothing was exercised against a live
  backend.

## Purpose

Give the parent owner a ready-made map of what the BFF can actually serve for
`IAM-UI-TEN-001`, what it cannot, and which parts of the required UX have no
design authority yet. The packet exists so the parent owner does not have to
re-derive the tenant IAM contract surface, and so the design-contract gap is
discovered before UI is written rather than during review.

This is execution context. It does not replace canonical truth in
`phase1_*`, the architecture plan, or the execution task registry.

## Canonical Anchors

- Architecture plan:
  `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
  - §13.2 Tenant Console required screens — lines 464–469
  - §13.4 common UX security rules — lines 478–483
  - §10.3 API keys and service credentials — lines 364–372
- Execution tasks:
  `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
  - `IAM-UI-TEN-001` execution contract — line 158
  - Wave E membership — line 89
- Canonical IAM contracts (from `IAM-CTR-001`):
  `packages/contracts/src/iam-contracts.ts`
  - error codes — lines 1–19
  - `IamMutationMetadata` — lines 21–28
  - `IamSessionInventoryQuery` — lines 38–44
  - `IamInvitationMutationCommand` — lines 53–57
  - `IamCredentialMutationCommand` — lines 84–90
  - `IAM_STAGE15_OPERATION_CATALOG` — lines 92–261
- Tenant IAM read/write models: `packages/contracts/src/index.ts`
  - `IdentityContext` — lines 788–825
  - `TenantUserRoleStatus` / `TenantUserRoleRecord` / `CreateTenantUserCommand`
    / `UpdateTenantRoleCommand` / `TenantRoleCatalogRecord` — lines 2576–2607
  - `TenantApiKeyRecord` / `IssueTenantApiKeyCommand` /
    `RotateTenantApiKeyCommand` / `TenantApiKeyIssued` — lines 2610–2690
  - `IntegrationCredentialSignals` — lines 1029–1035
- UI runtime contract: `packages/contracts/src/ui-runtime.ts`
  - `ResourceActionDescriptor` — lines 147–153
- BFF client: `packages/api-client/src/index.ts`
  - `getIdentityContext()` — lines 919–921
  - tenant credentials/webhooks — lines 2577–2662
  - tenant approval requests — lines 2520–2566
  - tenant users/roles — lines 2714–2731
- Backend authority: `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  (tenant users/roles lines 1396–1456; api-keys lines 1456–1530) and
  `apps/api/src/modules/identity/identity.controller.ts` (`GET /api/identity/context`)
- Visual authority: `packages/ui-tokens/src/realms.ts` lines 12–33 (`tenant`
  realm teal `#0F766E` light / `#5EEAD4` dark) plus
  `docs/05-ui/drts-design-canvas/Tenant Console.html` and
  `docs/05-ui/drts-design-canvas/tenant-screens-2.jsx`
  (`TN_Users` lines 3–33, `TN_ApiKeys` lines 35–76)

## Dependency Readiness — Read This First

`IAM-UI-TEN-001` declares `depends_on = [IAM-ACC-003, IAM-SES-003, IAM-PRT-001,
IAM-MFA-001]`. As of 2026-08-06 only one of the four has landed:

| Dependency | Status | What the UI needs from it | Consequence if it does not land first |
|---|---|---|---|
| `IAM-PRT-001` | `done` | credential expiry ownership + dual rotation fields | Already available on `TenantApiKeyRecord`; see §3 below — the fields exist and are simply not rendered yet. |
| `IAM-ACC-003` | `in_progress` (`Codex`) | invitation resend/revoke, suspend/disable, last-admin and self-escalation server errors | Without it there is **no endpoint** behind the `resend_invitation` / `suspend` affordances the page already draws. |
| `IAM-SES-003` | `todo` (`Claude`) | session inventory, logout-all, boundary-safe admin revoke | Without it the entire `Sessions` screen from plan §13.2 has no data source. |
| `IAM-MFA-001` | `in_progress` (`Gemini`, review rejected on PR #1303) | step-up requirement and MFA state | Without it there is no server-issued signal for "this mutation needs step-up". |

**Recommendation to the parent owner:** treat `IAM-UI-TEN-001` as
implementable today only for the Users/Roles read surface and the
API-key/Webhook credential-governance surface. Sessions and step-up must be
sequenced behind `IAM-SES-003` and `IAM-MFA-001`, or explicitly delivered as
documented not-yet-available states — never as frontend-invented state.

## Authority Guardrails

Restated so they are not re-decided under design pressure:

- **UI hiding is never the only enforcement** (plan §19.2, execution tasks
  line 189). Every disabled affordance must correspond to a server-side denial.
- **Role and status labels must come from the server response**, not from
  frontend-hardcoded role inference (plan line 481).
- **403 must say "missing permission or approval required"** without revealing
  whether another tenant or user exists (plan line 482).
- **No token or secret in URL, toast, analytics, DOM debug data or client log**
  (plan line 480).
- **Plaintext key appears exactly once** (parent acceptance; canvas
  `TN_ApiKeys` banner at `tenant-screens-2.jsx:49–51` cites `Q-TEN09
  plaintext-once`).
- **Session and credential data is tenant bounded and masked** (parent
  acceptance; plan line 467 — tenant admins see masked summaries for their own
  tenant only).
- **Visual truth is `packages/ui-tokens` + the design canvas.** The tenant
  realm is teal (`#0F766E` / `#5EEAD4`). Do not introduce a raw hex palette in
  `globals.css` or components, and do not reskin with shadcn/Canvas defaults.

## Canonical BFF Operation Inventory For This Task

Derived from `IAM_STAGE15_OPERATION_CATALOG`
(`packages/contracts/src/iam-contracts.ts:92–261`), cross-checked against
`packages/api-client/src/index.ts` and the NestJS controllers.

| Need (plan §13.2) | Catalog operation | api-client method | Backend route | Ready? |
|---|---|---|---|---|
| Caller identity / authority projection | `getIdentityContext` | `getIdentityContext()` | `GET /api/identity/context` | ✅ |
| Tenant user list | `listTenantUsers` | `listTenantUsers()` | `GET /api/tenant/users` | ✅ |
| Role catalog | `listTenantRoles` | `listTenantRoles()` | `GET /api/tenant/roles` | ✅ (see open question 6) |
| Invite user | `createTenantUser` | `createTenantUser(cmd)` | `POST /api/tenant/users` | ✅ backend, ❌ not wired in UI |
| Role change | `updateTenantUserRole` | `updateTenantRole(userId, cmd)` | `POST /api/tenant/users/{userId}/role` | ✅ backend, ❌ not wired in UI |
| Suspend user | — | — | — (folded into `UpdateTenantRoleCommand.status`) | ⚠️ no dedicated operation |
| **Resend invitation** | — | — | — | ❌ **missing** |
| **Revoke invitation** | — | — | — | ❌ **missing** |
| **Session inventory (self)** | — | — | — | ❌ **missing** (`IAM-SES-003`) |
| **Logout-all / admin revoke** | — | — | — | ❌ **missing** (`IAM-SES-003`) |
| Approval requests | `listTenantApprovalRequests` + approve/reject/escalate | `listTenantApprovalRequests()` etc. | `/api/tenant/approval-requests*` | ✅ |
| API key list | `listTenantApiKeys` | `listApiKeys()` | `GET /api/tenant/api-keys` | ✅ |
| API key issue | `issueTenantApiKey` | `issueApiKey(cmd)` | `POST /api/tenant/api-keys` | ✅ |
| API key rotate | `rotateTenantApiKey` | `rotateApiKey(id, cmd)` | `POST /api/tenant/api-keys/{id}/rotate` | ✅ |
| API key revoke | `revokeTenantApiKey` | `revokeApiKey(id)` | `POST /api/tenant/api-keys/{id}/revoke` | ⚠️ accepts no body — see §3 |
| Webhook endpoints + deliveries | not in IAM catalog | `listWebhooks()`, `createWebhookEndpoint()`, `updateWebhookEndpoint()`, `disableWebhookEndpoint()`, `deleteWebhookEndpoint()`, `listWebhookDeliveries()`, `retryWebhookDelivery()` | `/api/tenant/webhooks*` | ✅ (tenant-integration governance, not IAM Stage 1.5) |

`IamSessionInventoryQuery` (`iam-contracts.ts:38–44`) and
`IamInvitationMutationCommand` (`iam-contracts.ts:53–57`) are **defined types
with no operation in the catalog and no route**. The contract anticipated these
surfaces; the endpoints have not been published yet.

## Surface-By-Surface Operator Journey

### 1. `/users` — Users & Roles

**Design intent** (plan line 466): tenant-scoped list, invite, resend, revoke,
role change, suspend, last-admin protection.

**Canvas** (`tenant-screens-2.jsx:3–33`, `TN_Users`): `tc_admin`-only page.
Header action `invite` (medium risk). Table columns NAME / EMAIL / ROLE /
STATE / UPDATED / ACTIONS, with per-row `role` (medium risk) and `suspend`
(high risk, `requiresReason: true`) descriptors, both gated on
`status === 'active'` with `disabledReasonCode: 'not_active'`.

**Current implementation** (`apps/tenant-console-web/app/users/page.tsx`,
1676 lines, server component, `force-dynamic`):

- Loads via `Promise.allSettled([getIdentityContext(), listTenantUsers(),
  listTenantRoles()])` (lines 710–716) with per-source failure classification.
- Renders `availableActions` descriptors issued by the backend envelope, plus
  `emptyState`, `refreshMetadata` and `crossAppLinks`.
- Already handles `invite`, `create_user`, `create_tenant_user`,
  `resend_invitation`, `resend_invite`, `update_role`, `role`,
  `update_tenant_role`, `suspend`, `refresh` in its label/icon/sort maps
  (lines 785–860).
- Themed with `buildCanvasTheme({ surface: "tenant", dark: true, density:
  "compact" })` — realm-token compliant, matches the canvas.

**The critical finding — the action buttons are inert.**
`ActionDescriptorButton` (lines 871–915) renders a `CanvasBtn` and only wraps
it in an `<a href>` when a caller supplies `href`. The single call site that
supplies `resolveHref` returns a URL **only for `refresh`** (lines 1248–1251).
Row-level actions call `ActionDescriptorList` with no `resolveHref` at all
(lines 1225–1236). There is no `app/users/actions.ts`, no form, and no client
component in that route.

Net effect: **invite, resend, role change and suspend are display-only
affordances.** The page looks complete and enforces nothing. This is the
largest single item of work in `IAM-UI-TEN-001` and it is not visible from the
screenshot.

**BFF gaps:**

1. `resend_invitation` has **no endpoint and no catalog operation**. The page
   already labels the action. Owner: `IAM-ACC-003` (`Codex`).
2. Invitation revoke likewise has no endpoint. `IamInvitationMutationCommand`
   exists but is unrouted.
3. `suspend` is expressible only as `UpdateTenantRoleCommand.status =
   "suspended"` (`index.ts:2596–2600`) — the command carries **no reason
   field**, yet the canvas marks `suspend` as `requiresReason: true`. Either
   `IAM-ACC-003` adds mutation metadata, or the UI must not pretend the reason
   is recorded.
4. `TenantUserRoleRecord` (`index.ts:2578–2588`) has no `lastLoginAt`, no MFA
   state, no membership id and no session count. Plan §13.1 asks for those on
   Platform Admin; §13.2 does not require them for Tenant Console, so this is
   acceptable — but do **not** synthesize them client-side.
5. Last-admin protection and self-escalation must come from server errors
   (`IAM_MEMBERSHIP_NOT_ACTIVE`, `AUTHZ_SCOPE_DENIED`, `AUTH_APPROVAL_REQUIRED`
   in `iam-contracts.ts:1–17`). There is no "is last admin" read model, and one
   should not be invented — compute nothing locally; render the server refusal.

**Carry-forward:**

- Wire the four mutations through Next.js server actions, mirroring the
  existing, working pattern in `app/api-keys/actions.ts` (typed error codes →
  i18n key → flash payload → `revalidatePath`). That file is the in-repo
  reference; do not invent a second pattern.
- Keep the descriptor-driven enable/disable, but make `disabledReasonCode`
  visible to the operator rather than only a `title` tooltip (line 889).
- Preserve the `Promise.allSettled` + `LoadFailure` classification. Partial
  failure of the role catalog must not blank the user list.

### 2. Sessions — no surface exists

**Design intent** (plan line 467): self-service "log out other sessions"; the
tenant admin sees only masked summaries scoped to their own tenant.

**Current state:** there is no `/sessions` route in
`apps/tenant-console-web/lib/navigation.ts` (the nav lists home, bookings,
passengers, addresses, cost-centers, rules, users, notifications, sla, billing,
invoices, reports, api-keys, webhooks, integration-governance, feature-flags,
settings, audit — no sessions entry). There is no api-client method, no
catalog operation, and no backend route.

`IdentityContext` (`index.ts:788–825`) does expose the caller's own
`sessionId`, `tokenId`, `tokenVersion`, `authTime`, `amr`, `acr` and
`policyVersion` — the `IAM-SES-002` authority projection landed. That is enough
to describe **the current session** and nothing else. It is not a session
inventory.

**BFF gap:** the whole surface. Owner: `IAM-SES-003` (status `todo`, owner
`Claude`). `IamSessionInventoryQuery` already defines the query shape
(`actorId`, `realm`, `tenantId`, `includeRevoked`, `limit`), so the contract
direction is settled; the operation is simply not published.

**Carry-forward:** do not build a placeholder sessions page backed by
`IdentityContext` alone. A single-row "your current session" table would read
as a delivered feature while providing none of the revoke capability the plan
requires. Either sequence behind `IAM-SES-003` or ship an explicit
not-yet-available state and record the omission in parent verification.

### 3. `/api-keys` — Credential lifecycle

**Design intent** (plan line 468): owner, scope, expiry, last used, rotation
due, revoke impact.

**Canvas** (`tenant-screens-2.jsx:35–76`, `TN_ApiKeys`): plaintext-once banner
citing `Q-TEN09`; table NAME / PREFIX / MASK / SCOPE / LAST / EXPIRES / STATE;
row actions `rotate` and `revoke`, both high risk with `requiresReason: true`;
header action `issue`, high risk with `requiresReason: true`.

**Current implementation** (`app/api-keys/page.tsx` + `api-key-manager.tsx`
1833 lines + `actions.ts` 227 lines): genuinely wired. Server actions issue,
rotate and revoke; scopes validated against `TENANT_API_KEY_ALLOWED_SCOPES`;
expiry requires an explicit timezone offset; plaintext key is surfaced once in
a flash payload with copy and download affordances.

**Two concrete defects to carry forward:**

1. **The revoke reason is collected and then discarded.**
   `revokeTenantApiKeyAction` (`actions.ts:191–227`) reads `reason`, throws
   `revocationReasonRequired` when it is empty — and then calls
   `client.revokeApiKey(apiKeyId)`. `revokeApiKey` sends no body
   (`api-client/src/index.ts:2660–2664`) and the controller accepts none
   (`tenant-partner.controller.ts:1490–1508`). The operator is told a reason is
   required; the audit record never receives it. Fix requires a contract change
   (see open question 2) — until then the UI must not imply the reason is
   retained.
2. **Issue does not collect a reason at all**, although the canvas marks
   `issue` as `requiresReason: true`. The UI is less strict than the design.

**Pure-frontend gap — no backend work needed.** `TenantApiKeyRecord`
(`index.ts:2610–2635`) already carries every governance field plan §13.2 asks
for, and the page renders **none** of them:

| Contract field | Plan §13.2 need | Rendered today |
|---|---|---|
| `ownerRef` / `ownerName` / `ownerType` | "owner" | ❌ |
| `purpose`, `resourceScope` | scope context | ❌ |
| `lastUsedWorkload` | "last used" detail | ❌ |
| `signals.approachingExpiry` / `.dormant` / `.expired` / `.autoRevoked` | "rotation due" | ❌ |
| `overlapEndsAt` | dual-rotation window | ❌ |
| `rotatedFromApiKeyId` / `supersededByApiKeyId` | rotation lineage | ❌ |
| `autoRevokedAt` | revoke impact | ❌ |
| `keyName`, `keyPrefix`, `maskedSuffix`, `scopes`, `lastUsedAt`, `expiresAt`, `revokedAt`, `revokeReason` | baseline table | ✅ |

Those first seven rows are exactly what `IAM-PRT-001` (`done`) delivered on the
partner side. Surfacing them on the tenant page is the highest value / lowest
risk work in this task.

**Carry-forward:** add a rotation-posture column driven by
`IntegrationCredentialSignals` (`index.ts:1029–1035`) and an owner column from
`ownerName`/`ownerType`. Keep plaintext-once exactly as it is — it is correct
today and is a parent acceptance criterion. Do not persist `plaintextKey`
anywhere beyond the single flash render.

### 4. `/webhooks` — Endpoint credentials

**Design intent** (plan line 468, shared with API keys): rotation impact and
revoke impact must be legible before mutation.

**Current implementation** (`app/webhooks/page.tsx`, 2946 lines, plus
`secret-reveal-card.tsx`): endpoint CRUD, disable, delivery list and retry all
exist through `listWebhooks` / `createWebhookEndpoint` /
`updateWebhookEndpoint` / `disableWebhookEndpoint` / `deleteWebhookEndpoint` /
`listWebhookDeliveries` / `retryWebhookDelivery`
(`api-client/src/index.ts:2599–2658`).

**Scope note:** webhooks are **not** in `IAM_STAGE15_OPERATION_CATALOG`. They
belong to tenant-integration governance
(`TenantWebhookGovernancePolicy`, `index.ts:2693–2704`), which already encodes
`rotationOverlapDays`, `approachingExpiryThresholdDays`,
`dormantUseThresholdDays` and `autoDisableAfterConsecutiveFailures`.

**Recommendation:** keep `IAM-UI-TEN-001` scoped to making the *credential
posture* on this page consistent with the API-keys page (same signal chips,
same rotation-overlap language). Do not re-open webhook delivery/retry
behaviour under an IAM task — that is a different owner and a different
acceptance surface.

## Cross-Surface Findings

### F1. Canonical mutation metadata is defined but unroutable

`IamMutationMetadata` (`iam-contracts.ts:21–28`) requires `reasonCode` and
`expectedVersion`, and optionally carries `approvalId`, `approvalRequestId` and
`stepUpReference`. Every Stage 1.5 mutation command wraps it.

None of the tenant routes accept it:

- `CreateTenantUserCommand` = `{ email, displayName, roleCode }` — no metadata.
- `UpdateTenantRoleCommand` = `{ roleCode, status?, approvalNotificationOptOut? }`
  — no metadata.
- `IssueTenantApiKeyCommand` / `RotateTenantApiKeyCommand` — no metadata.
- `revokeApiKey` — no body at all.

Consequence: `IAM_CONCURRENCY_CONFLICT` (optimistic concurrency via
`expectedVersion`), `IAM_REASON_REQUIRED`, `IAM_APPROVAL_REFERENCE_REQUIRED` and
`IAM_STEP_UP_REQUIRED` are **unreachable on tenant surfaces** — the client
cannot supply the fields that would trigger or satisfy them. A frontend that
renders a reason box today is rendering decoration.

This is the root cause behind both the discarded revoke reason and the
unrecordable suspend reason. It is a contract decision, not a UI decision.

### F2. `ResourceActionDescriptor` cannot express step-up

Plan line 469 requires: *"對 finance / technical / admin 操作顯示 MFA /
step-up 狀態，不得只在失敗後顯示 generic 403"* — show step-up state **before**
the mutation, not as a post-hoc 403.

`ResourceActionDescriptor` (`ui-runtime.ts:147–153`) is
`{ action, enabled, disabledReasonCode?, requiresReason?, riskLevel }`. There
is no `requiresStepUp`, no `stepUpSatisfied`, no `approvalRequired`.

`IdentityContext` exposes `amr`, `acr` and `authTime`, so the frontend can tell
*how* the current session authenticated and *when* — but there is no
server-issued policy saying which tenant operations demand step-up. Hardcoding
that list in the frontend would be exactly the "UI hiding as the only
enforcement" failure the plan forbids (§19.2), and it would drift from the
policy the API enforces.

Recommended resolution: extend `ResourceActionDescriptor` additively with
`requiresStepUp?: boolean` and `stepUpSatisfied?: boolean`, populated by the
backend from the same policy that raises `AUTH_STEP_UP_REQUIRED` /
`IAM_STEP_UP_REQUIRED`. One additive field serves Platform Admin, Tenant
Console and Driver App. Owner: contracts (`Codex`) + `IAM-MFA-001` (`Gemini`).

### F3. Design canvas has no artboard for the required security UX

Searched `docs/05-ui/drts-design-canvas/**` for step-up / MFA / 多因素 /
二階段: **zero hits in any file, for any app.** Searched the tenant artboards
for a session inventory: none.

The canvas covers `/users` (list) and `/api-keys` (list + `SecretRevealModal`).
It does **not** cover:

1. **Tenant session inventory + revoke** — plan line 467.
2. **Step-up / MFA challenge and pre-mutation state** — plan line 469.
3. **Invite drawer/modal** — the canvas shows the `invite` button only, never
   the form.
4. **Role-change before/after diff with last-admin protection** — the canvas
   shows a `role` button only; the diff view is specified for Platform Admin
   (§13.1 line 459) with no tenant equivalent.
5. **Suspend confirmation with reason and session-revoke impact** — the canvas
   shows a `suspend` button marked `requiresReason: true`, but no reason dialog.

Per the UI Design Contract, the parent owner must **write a screen-requirements
note and stop**, not substitute their own design. In-repo precedent for the
format:
`docs/05-ui/drts-design-canvas/tenant-map-picker-screen-requirements-20260703.md`
and `.../address-map-picker-screen-requirements-20260630.md`.

Suggested filename:
`docs/05-ui/drts-design-canvas/tenant-iam-screen-requirements-20260806.md`,
authored by the parent owner (`Gemini2`), listing the five gaps above with
their plan citations. Note that gaps 1 and 2 are cross-app — Platform Admin
(`IAM-UI-PLAT-001`) and Driver App (`IAM-UI-DRV-001`) need the same missing
step-up artboard, so a shared note is more useful than three tenant-local ones.

### F4. The realm token baseline is already correct — keep it

`app/users/page.tsx` uses `buildCanvasTheme({ surface: "tenant", dark: true,
density: "compact" })` and `@drts/ui-web` Canvas primitives throughout. The
`tenant` realm resolves to teal (`packages/ui-tokens/src/realms.ts:12–16`).
There is no raw hex palette in the tenant IAM pages today.

Self-check before parent review: `grep -nE '#[0-9a-fA-F]{6}'` over the diff
should return nothing outside `packages/ui-tokens`. Any new hex constant in
`globals.css` or a component is a defect per the design contract.

## Open Questions To Escalate

None of these are sidecar work. Each needs a decision before parent closeout.

1. **Invitation resend/revoke endpoints.** Will `IAM-ACC-003` publish them, and
   under which catalog operation ids? Owner: `Codex`. Until then the page's
   `resend_invitation` label points at nothing. Default: keep the descriptor
   disabled with a server-issued `disabledReasonCode` — never a client-side
   guess.
2. **Mutation metadata on tenant routes (F1).** Do `createTenantUser`,
   `updateTenantUserRole`, `issueTenantApiKey`, `rotateTenantApiKey` and
   `revokeTenantApiKey` accept `IamMutationMetadata`? Owner: contracts
   (`Codex`) with `IAM-ACC-003`. Default: do not render reason inputs whose
   value is discarded; if the field cannot be sent, remove the input and
   document the limitation.
3. **Step-up descriptor field (F2).** Additive `requiresStepUp` /
   `stepUpSatisfied` on `ResourceActionDescriptor`? Owner: contracts (`Codex`)
   + `IAM-MFA-001` (`Gemini`). Default: render the server's
   `AUTH_STEP_UP_REQUIRED` / `IAM_STEP_UP_REQUIRED` error clearly, and record
   in parent verification that pre-mutation step-up display is not yet
   satisfiable. Do not hardcode a step-up operation list in the frontend.
4. **Sessions surface sequencing.** Does `IAM-UI-TEN-001` wait for
   `IAM-SES-003`, or ship with a documented not-available state? Owner: parent
   `Gemini2` + reviewer `Claude`. Default: document, do not fake.
5. **Screen-requirements note ownership (F3).** Who authors the shared
   step-up/session artboard request — `IAM-UI-TEN-001`, `IAM-UI-PLAT-001`, or a
   single cross-app note? Owner: parent `Gemini2`, coordinating with the
   `IAM-UI-PLAT-001` owner. Default: one shared note, referenced by all three
   UI tasks.
6. **`GET /api/tenant/roles` is marked `@OpenRoute()`**
   (`tenant-partner.controller.ts:1408–1414`), so the tenant role catalog is
   anonymously readable. That is a route-classification question for
   `IAM-P0-003`, not a UI question — flagged here only because the users page
   depends on the endpoint and would break if the classification changes.
   Owner: `IAM-P0-003`. Do not "fix" it from the UI lane.

Default posture for every question above: **do not invent local truth on the
frontend; document the limitation in parent verification.**

## Do-Not-Break List

When the parent owner opens these files, preserve:

- `Promise.allSettled` + `LoadFailure` classification in
  `users/page.tsx:710–770`. A failed role-catalog fetch must not blank the user
  list, and `permission_denied` must stay distinguishable from `fetch_failed`.
- Backend-issued `availableActions` / `emptyState` / `refreshMetadata` /
  `crossAppLinks` consumption. Do not replace server descriptors with a
  frontend-computed action list — that is the enforcement boundary.
- `descriptor.riskLevel` → button variant mapping (`users/page.tsx:887–888`);
  high risk renders `danger`. Keep it consistent with the canvas descriptors.
- Plaintext-once behaviour in `api-key-manager.tsx`. `plaintextKey` must never
  be written to storage, URL, analytics or log, and must not survive a
  re-render of the list.
- Scope allowlist validation against `TENANT_API_KEY_ALLOWED_SCOPES`
  (`actions.ts:36–61`) and the explicit-timezone requirement for `expiresAt`
  (`actions.ts:64–79`).
- `buildCanvasTheme({ surface: "tenant", ... })` on every tenant IAM page.
- The tenant-bounded `x-tenant-id` header path through `getTenantClient()` —
  do not introduce a second, differently-configured `ApiClient` instance.

## Acceptance For This Sidecar

- Packet exists at
  `support/sidecars/IAM-UI-TEN-001/IAM-UI-TEN-001-SIDECAR-BFF-HANDOFF.md`. ✓
- Support artifacts only; no canonical truth mutated. ✓ (single new file under
  `support/sidecars/`)
- BFF query inventory enumerated against `IAM_STAGE15_OPERATION_CATALOG`,
  `packages/api-client/src/index.ts` and the NestJS controllers as of
  2026-08-06. ✓
- Operator journeys captured for Users/Roles, Sessions, API Keys and Webhooks. ✓
- Frontend handoff materials: carry-forward lists, do-not-break list, design
  canvas gap analysis, dependency readiness table. ✓
- Open contract questions enumerated with escalation owners and defaults. ✓
- Handed off to reviewer `Gemini2` via `scripts/ai-status.sh handoff`. ✓
- Review approved by `Gemini2` on 2026-08-06: packet judged comprehensive and
  accurate, all acceptance criteria met, no canonical truth mutated. Returned to
  owner `Claude` for closeout. ✓

### Re-verification pass — 2026-08-06

The load-bearing claims were re-checked against the working tree before handoff,
because a packet that is merely plausible is worse than no packet:

| Claim | Check | Result |
|---|---|---|
| `/users` actions are inert | `app/users/` contains `page.tsx` only — no `actions.ts`, no client component; `resolveHref` appears at `page.tsx:1250` and returns a URL only when `descriptor.action === "refresh"`; row-level `ActionDescriptorList` passes no `resolveHref` | confirmed |
| Revoke reason is discarded | `actions.ts:191–227` reads `reason`, throws `revocationReasonRequired` if empty, then calls `client.revokeApiKey(apiKeyId)`; `api-client/src/index.ts:2660` is `revokeApiKey(keyId: string)` — no body parameter | confirmed |
| No tenant sessions surface | `apps/tenant-console-web/app/` route list has no `sessions` entry | confirmed |
| Canvas has no step-up/MFA artboard | `grep -riE 'step-?up\|MFA\|多因素\|二階段' docs/05-ui/drts-design-canvas/` → **0 hits** across all apps | confirmed |
| Dependency table still current | `IAM-PRT-001` `done`; `IAM-ACC-003` `in_progress`; `IAM-SES-003` `todo`; `IAM-MFA-001` `in_progress` | unchanged |
| Support-only scope | `git diff --stat origin/dev...HEAD` → 1 file, `support/sidecars/**` | confirmed |

Parent task `IAM-UI-TEN-001` is `todo` (owner `Gemini2`, reviewer `Claude`), so
this packet lands before implementation starts — which is the point.

## Verification That Was Not Possible Here

- This is a documentation artifact; it has no executable acceptance command.
  The parent task's acceptance (a11y, i18n, typecheck, build, E2E) is unaffected
  by this sidecar and was not run.
- Contract and route shapes were verified by reading
  `packages/contracts/src/`, `packages/api-client/src/index.ts` and
  `apps/api/src/modules/**/*.controller.ts`. They were **not** exercised against
  a live backend, so runtime response envelopes (in particular which
  `availableActions` the backend actually emits for `/api/tenant/users`) are
  unconfirmed. The parent owner should confirm the emitted descriptor set
  before relying on `resend_invitation` / `suspend` appearing at all.
- Dependency statuses were read from machine truth on 2026-08-06 and will move.
  Re-check `IAM-ACC-003`, `IAM-SES-003` and `IAM-MFA-001` before sequencing.
- No E2E spec for tenant users exists today (`tests/e2e/` contains
  `E2E-004-tenant-attribution.sh`, `E2E-005-tenant-governance.sh`,
  `E2E-012-tenant-business-operations.sh`, `tenant-map-booking-ui.spec.ts` —
  none cover the IAM journeys). The parent task's E2E acceptance therefore
  implies new coverage, not extension of an existing spec.

## Closeout Note

This packet does not commit canonical implementation. It is research and
handoff material to make `IAM-UI-TEN-001` faster for `Gemini2` and sharper for
`Claude`'s parent review.

The two things most likely to be missed without it:

1. the `/users` action buttons are **inert** — the surface looks finished and
   enforces nothing; and
2. the design canvas has **no step-up or session artboard anywhere in the
   repo**, so part of plan §13.2 cannot be implemented without a
   screen-requirements note first.

If new BFF gaps surface during parent implementation, append to "Open
Questions" rather than silently filling the gap with frontend-only state.
