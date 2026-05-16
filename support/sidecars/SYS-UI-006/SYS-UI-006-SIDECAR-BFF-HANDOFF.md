# SYS-UI-006 BFF And Frontend Handoff Packet

- Sidecar Task: `SYS-UI-006-SIDECAR-BFF-HANDOFF`
- Parent Task: `SYS-UI-006`
- Helper Kind: `bff_handoff_packet`
- Sidecar Owner / Reviewer: `Codex` / `Claude2`
- Parent Owner / Reviewer: `Claude2` / `Codex`
- Date: `2026-05-09`
- Class: support / sidecar only; no canonical-truth mutation

## Purpose

This packet prepares `SYS-UI-006` for execution without reopening product
truth. It turns the parent scope into a build-ready handoff for the matrix
author by separating:

- the auth / bootstrap seams that already exist in repo
- the governance mutations that already belong to a control-plane surface
- the negative-flow states that already have route-level evidence
- the consumer-facing rows that still have to stay explicit blockers

It does not claim the parent matrix is already finished. It gives the parent
owner a current evidence map and a clean starting point for the first additive
matrix draft.

## Shared-Truth Baseline

- `SYS-UI-006` is explicitly an additive-docs-first slice. Its minimum matrix
  must cover tenant login / bootstrap / session expiry, driver onboarding /
  rebind / revoke / degraded recovery, partner ingress auth failure paths,
  invite / suspend / role change / revoke, rotate / revoke / disable / retry,
  RBAC-denied states, and unauthenticated / expired / degraded /
  not-eligible / cancelled flows.
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:306-345`
- `SYS-UI-001` fixed the landing zones for this wave:
  partner booking mode in `apps/tenant-console-web`, passenger in
  `apps/passenger-web`, and call point / concierge in
  `apps/assisted-entry-web`; `apps/tenant-portal-web` remains sunset for new
  product work.
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:14-25`
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:29-35`
- Canonical ownership is still split by plane:
  `Platform Admin` owns tenant onboarding and partner credentials,
  `Ops Console` owns callcenter / callback / complaint work,
  `Tenant Console` owns tenant self-service,
  `Driver App` owns device-bound execution,
  and the reopened passenger / assisted-entry surfaces stay separate from those
  control planes.
  `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:1541-1586`
- Repo scan on `2026-05-09` found no `apps/passenger-web` or
  `apps/assisted-entry-web` directory. Passenger and assisted-entry rows are
  therefore topology-fixed but not route-materialized yet.

## Repo Baseline

### 1. Tenant auth truth exists, but it is split across tenant surfaces

- `apps/tenant-portal-web` has the real tenant bootstrap session path today:
  `/login` calls `createTenantPortalSession()`, stores a backend-issued bearer
  token in the `tenant-portal-session` HTTP-only cookie, and builds tenant
  clients from that cookie-backed authority context.
  `apps/tenant-portal-web/app/login/page.tsx:16-86`
  `apps/tenant-portal-web/app/login/actions.ts:13-32`
  `apps/tenant-portal-web/lib/api-client.ts:15-121`
- The same app already resolves identity context and derives capability-gated
  navigation from backend roles / scopes rather than demo-local UI roles.
  `apps/tenant-portal-web/lib/rbac.ts:45-128`
  `apps/tenant-portal-web/lib/rbac.ts:158-265`
- Its route handlers already express session expiry as HTTP `401` instead of a
  silent fallback path.
  `apps/tenant-portal-web/app/api/bookings/[orderId]/update/route.ts:16-23`
  `apps/tenant-portal-web/app/api/bookings/[orderId]/cancel/route.ts:15-22`
- `apps/tenant-portal-web/app/users` also already wires invite and role/status
  updates through `createTenantUser()` and `updateTenantRole()`, both gated by
  `requireCapability(canManageUsers)`.
  `apps/tenant-portal-web/app/users/page.tsx:12-24`
  `apps/tenant-portal-web/app/users/page.tsx:80-128`
  `apps/tenant-portal-web/app/users/page.tsx:145-243`
  `apps/tenant-portal-web/app/users/actions.ts:12-18`
  `apps/tenant-portal-web/app/users/actions.ts:36-76`
  `packages/api-client/src/index.ts:1338-1352`
- By contrast, the tenant-admin root of `apps/tenant-console-web` still
  hard-wires `tenant-demo-001` and `demo-tenant-user`.
  `apps/tenant-console-web/lib/api-client.ts:1-17`
- Its `/users` route is intentionally read-oriented and explicitly says invite,
  role change, and suspend still belong to the command matrix rather than this
  selected-shell page.
  `apps/tenant-console-web/app/users/page.tsx:39-44`
  `apps/tenant-console-web/app/users/page.tsx:76-137`

Carry-forward meaning:

- The parent matrix should not flatten "tenant" into one app-level truth.
- `tenant-portal-web` is the current route-level evidence for real tenant login,
  session expiry, RBAC gating, invite, and user-role mutation.
- `tenant-console-web` tenant-admin routes still need explicit caveats whenever
  the matrix talks about selected-shell parity.

### 2. Partner mode already has a repo-local route group and auth boundary

- `apps/tenant-console-web/app/partner/*` is not just a placeholder. It has a
  dedicated login surface that asks for `entrySlug` and API key, warns that the
  secret is platform-issued, and states that partner mode never inherits
  tenant-admin authority.
  `apps/tenant-console-web/app/partner/(public)/login/page.tsx:7-38`
  `apps/tenant-console-web/app/partner/(public)/login/partner-login-form.tsx:17-99`
- The session helper creates an HTTP-only `drts_partner_session_v1` cookie from
  `createPartnerBootstrapSession()`, redirects back to `/partner/login` when
  the cookie is missing or expired, and builds a bearer client scoped to the
  partner realm plus tenant header.
  `apps/tenant-console-web/lib/partner-session.ts:16-27`
  `apps/tenant-console-web/lib/partner-session.ts:76-127`
- The authenticated route group exposes only partner-safe nav:
  `/partner/start`, `/partner/eligibility`, and `/partner/booking/new`.
  `apps/tenant-console-web/app/partner/(authenticated)/layout.tsx:10-25`
  `apps/tenant-console-web/app/partner/(authenticated)/layout.tsx:33-53`
- The start page makes the boundary explicit: no tenant users, audit,
  integrations, settings, billing, or dispatch authority live in partner mode.
  `apps/tenant-console-web/app/partner/(authenticated)/start/page.tsx:25-31`
  `apps/tenant-console-web/app/partner/(authenticated)/start/page.tsx:101-163`
- Booking creation already blocks inactive entries, requires an eligibility
  verification id when the entry mode requires it, and states that backend
  rejection reasons stay visible instead of silently falling back to
  tenant-admin flows.
  `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx:16-24`
  `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx:34-69`
  `apps/tenant-console-web/app/api/partner/bookings/route.ts:71-85`
  `apps/tenant-console-web/app/api/partner/bookings/route.ts:162-203`
- The partner eligibility route also already returns `401` when the partner
  session is missing or expired.
  `apps/tenant-console-web/app/api/partner/eligibility/route.ts:22-29`

Carry-forward meaning:

- `SYS-UI-006` can already harvest real repo-local evidence for partner login,
  bootstrap, session expiry, inactive-entry rejection, eligibility-required,
  and entry-scoped booking boundaries.
- The matrix should still keep `SYS-UI-002` open as the broader productization
  slice, because the full-system packet still treats partner mode as an active
  downstream wave.
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:184-216`

### 3. Platform Admin already owns most invite / suspend / revoke control-plane actions

- Tenant onboarding, lifecycle, and role-governance commands already exist in
  `@drts/api-client`:
  `updatePlatformTenantOnboarding()`, `activateTenant()`, `suspendTenant()`,
  `inviteTenantRole()`, and `acknowledgeTenantRole()`.
  `packages/api-client/src/index.ts:1663-1800`
- `apps/platform-admin-web/app/tenants/[tenantId]` already wires suspend,
  activate / rollback-hold, invite, and acknowledge actions into the tenant
  governance detail view.
  `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx:393-445`
  `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx:1663-1758`
- Internal platform staff invite / role update / suspend / activate already
  exist in `apps/platform-admin-web/app/users`.
  `apps/platform-admin-web/app/users/page.tsx:36-153`
  `apps/platform-admin-web/app/users/page.tsx:433-460`
- Partner entry lifecycle and ingress credential governance also already exist:
  activate / deactivate / revoke entry plus issue / revoke ingress credential.
  `packages/api-client/src/index.ts:1548-1634`
  `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:196-255`
  `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx:743-861`
- Driver device-binding revocation already exists in the platform fleet surface.
  `packages/api-client/src/index.ts:2158-2168`
  `apps/platform-admin-web/app/fleet/page.tsx:354-363`

Carry-forward meaning:

- The parent matrix does not need to invent new control-plane mutations for
  invite / suspend / revoke / credential rotation.
- What remains is surfacing those states consistently in the consumer-facing
  routes and documenting where those routes do not exist yet.

### 4. Partner backend auth contract and negative paths are already strong

- `@drts/api-client` already ships the partner bootstrap and eligibility seams:
  `createPartnerBootstrapSession()`, `listPartnerEntries()`, `getPartnerEntry()`,
  `verifyPartnerEligibility()`, and
  `getPartnerEligibilityVerification()`.
  `packages/api-client/src/index.ts:420-456`
- The controller exposes open partner-entry reads, partner eligibility verify,
  and platform-admin partner credential issuance / revocation.
  `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:83-227`
  `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:230-259`
- The backend explicitly rejects revoked entries, inactive entries, and partner
  identity scope mismatch, and it records accepted vs rejected ingress attempts
  in audit terms.
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:4279-4314`
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:4408-4491`
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:4598-4615`

Carry-forward meaning:

- Partner auth-failure rows can be written now from actual backend + route
  behavior.
- Missing work is mostly matrix consolidation and any remaining route polish,
  not contract discovery.

### 5. Driver device auth, revoke, and degraded recovery already have route-level evidence

- `@drts/api-client` already exposes device register / refresh / revoke.
  `packages/api-client/src/index.ts:2136-2168`
- `apps/driver-app/lib/api-client.ts` maps revoked, suspended, retired, and
  invalid-cert auth failures into concrete user-facing messages, clears the
  stored session, and refuses to provide a driver client when identity is not
  provisioned.
  `apps/driver-app/lib/api-client.ts:207-238`
  `apps/driver-app/lib/api-client.ts:261-271`
  `apps/driver-app/lib/api-client.ts:399-441`
  `apps/driver-app/lib/api-client.ts:526-546`
- `/onboarding` already has distinct unprovisioned and degraded states and
  blocks work entry until registration or reinitialization succeeds.
  `apps/driver-app/app/onboarding.tsx:1193-1244`
  `apps/driver-app/app/onboarding.tsx:1252-1290`
- Reauth-required platform states are elevated in both the onboarding cockpit
  and the platform-presence screen.
  `apps/driver-app/app/onboarding.tsx:1392-1413`
  `apps/driver-app/app/platform-presence.tsx:195-220`
- Bootstrap routing explicitly sends unprovisioned, revoked, and suspended
  identities back to `/onboarding`, and the unit tests lock that behavior.
  `apps/driver-app/lib/driver-identity-bootstrap.ts:29-86`
  `apps/driver-app/lib/driver-identity-routing.ts:7-14`
  `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts:14-100`
- The driver product spec still says registration, degraded resolution, and
  reauth prominence are part of the required UX.
  `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:220-245`
  `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:250-275`

Carry-forward meaning:

- Driver rows are the strongest already-implemented negative-flow evidence in
  the full-system wave.
- The matrix should explicitly list: unprovisioned, registration error,
  binding revoked, driver suspended, driver retired / revoked, cert invalid,
  reauth-required, and degraded workspace.

### 6. Passenger and assisted-entry are still topology-fixed but unmaterialized

- The topology decision and full-system packet both reserve
  `apps/passenger-web` and `apps/assisted-entry-web` as the landing zones for
  passenger and call point / concierge flows.
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:16-25`
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:29-35`
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:93-99`
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:218-304`
- PRD still requires passenger create / ETA / status / cancel / history /
  receipt / complaint flows and call-point login / fixed-site selection /
  proxy booking / ETA / dispatch-result / escalation flows.
  `phase1_prd_detailed_v1.md:452-489`
  `phase1_prd_detailed_v1.md:548-569`
- The backend summary already knows about `tenant`, `partner`, `site`, and
  `call_point` roots, but repo-local site / call-point frontend helpers have
  not been materialized yet.
  `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:68-80`
- `Ops Console` callcenter remains the internal fallback / control-plane
  workspace for phone booking, callback, recording, and complaint transfer.
  It is not the external site-bound portal.
  `apps/ops-console-web/lib/api-client.ts:20-47`
  `apps/ops-console-web/app/callcenter/page.tsx:235-257`
  `apps/ops-console-web/app/callcenter/page.tsx:317-418`
  `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:1579-1584`

Carry-forward meaning:

- Passenger and assisted-entry rows must be explicit blockers to
  `SYS-UI-003` / `SYS-UI-004` / `SYS-UI-005` unless the parent task creates
  those surfaces first.
- The matrix can still cite Ops callcenter as the current escalation target for
  assisted-entry failure handling.

## Reusable Query / Command Inventory

| Matrix area                          | Reusable query / command seam                                                                                                                                                               | Current route-level evidence                                                                                                                                                 | How `SYS-UI-006` should use it                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant login / session               | `createTenantBootstrapSession()`, `getIdentityContext()`                                                                                                                                    | `apps/tenant-portal-web/app/login/*`, `apps/tenant-portal-web/lib/api-client.ts`, `apps/tenant-portal-web/lib/rbac.ts`                                                       | Use as the authoritative tenant login / bootstrap / session-expiry baseline. Do not attribute these flows to `tenant-console-web` tenant-admin routes yet. |
| Tenant user lifecycle                | `listTenantUsers()`, `listTenantRoles()`, `createTenantUser()`, `updateTenantRole()`                                                                                                        | `apps/tenant-portal-web/app/users/page.tsx`, `apps/tenant-portal-web/app/users/actions.ts`                                                                                   | Use for invite / role-change / suspend rows on the tenant side. Keep selected-shell `/users` as read-only evidence unless a later task upgrades it.        |
| Tenant integration lifecycle         | `issueApiKey()`, `rotateApiKey()`, `revokeApiKey()`, `listWebhooks()`, `createWebhookEndpoint()`, `updateWebhookEndpoint()`, `deleteWebhookEndpoint()`                                      | `apps/tenant-portal-web/app/api-keys/page.tsx`, `apps/tenant-portal-web/app/webhooks/page.tsx`; methods in `packages/api-client/src/index.ts:1251-1319`                      | Use for rotate / revoke / disable rows where the full-system matrix asks for credential lifecycle coverage.                                                |
| Partner auth / eligibility           | `createPartnerBootstrapSession()`, `verifyPartnerEligibility()`, `getPartnerEligibilityVerification()`                                                                                      | `apps/tenant-console-web/lib/partner-session.ts`, `apps/tenant-console-web/app/api/partner/session/route.ts`, `apps/tenant-console-web/app/api/partner/eligibility/route.ts` | Use for partner login, session expiry, eligibility-required, inactive-entry, and signed-in boundary rows.                                                  |
| Partner booking create               | `createTenantBooking()` with `partnerEntrySlug` and optional `eligibilityVerificationId`                                                                                                    | `apps/tenant-console-web/app/api/partner/bookings/route.ts`, `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx`                                      | Use for success / denial / negative-path rows that stop short of tenant-admin fallback.                                                                    |
| Platform-admin tenant governance     | `activateTenant()`, `suspendTenant()`, `inviteTenantRole()`, `acknowledgeTenantRole()`                                                                                                      | `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`                                                                                                                    | Use as the control-plane authority source for invite / suspend / acknowledgement rows.                                                                     |
| Platform-admin partner governance    | `activatePlatformPartnerEntry()`, `deactivatePlatformPartnerEntry()`, `revokePlatformPartnerEntry()`, `issuePlatformPartnerIngressCredential()`, `revokePlatformPartnerIngressCredential()` | `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`                                                                                                                  | Use as the authority source for entry revoke / credential rotation / credential revoke rows.                                                               |
| Driver identity                      | `registerDriverDevice()`, `refreshDriverDeviceSession()`, `revokeDriverDeviceBinding()`                                                                                                     | `apps/driver-app/lib/api-client.ts`, `apps/driver-app/app/onboarding.tsx`, `apps/platform-admin-web/app/fleet/page.tsx`                                                      | Use for registration, rebind, revoke, suspended, retired, and degraded recovery rows.                                                                      |
| Assisted-entry fallback / escalation | `listCallSessions()`, `openCallSession()`, `quoteCallEta()`, `linkCallOrder()`, `attachRecordingCallback()`, `createCallbackTask()`, `transferCallToComplaint()`                            | `apps/ops-console-web/app/callcenter/page.tsx`, `packages/api-client/src/index.ts:773-871`                                                                                   | Use as the current internal control-plane evidence for assisted-entry escalation while `apps/assisted-entry-web` is still absent.                          |

## Operator Journey Handoff

### 1. Tenant admin login to access-governance flow

Canonical journey:

1. Tenant user signs in with a backend bootstrap session.
2. UI reads identity context and resolves role-based navigation.
3. Admin can invite users, assign roles, suspend access, and push changes into
   audit.

Source:

- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:1399-1447`

Current repo evidence:

- Real tenant sign-in and cookie session: `apps/tenant-portal-web/app/login/*`
  and `apps/tenant-portal-web/lib/api-client.ts:67-121`
- Capability-derived authority: `apps/tenant-portal-web/lib/rbac.ts:99-128`
- Invite and role/status mutation: `apps/tenant-portal-web/app/users/actions.ts:36-76`
- Selected-shell caveat: `apps/tenant-console-web/app/users/page.tsx:134-137`

Handoff note:

- Matrix rows should explicitly distinguish
  `tenant-portal-web` authority-backed flows from
  `tenant-console-web` selected-shell read parity.

### 2. Partner sign-in to eligibility to booking flow

Canonical journey:

1. Partner caller enters partner mode.
2. Entry context and branding load.
3. Eligibility runs when required.
4. Booking create is allowed only when the entry status and eligibility result
   allow it.
5. Tenant-admin governance never leaks into the partner workspace.

Source:

- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:1399-1406`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:1463-1477`

Current repo evidence:

- Partner login form + API key secret warning:
  `apps/tenant-console-web/app/partner/(public)/login/page.tsx:12-30`
- Session cookie and redirect-on-expiry:
  `apps/tenant-console-web/lib/partner-session.ts:76-127`
- Partner-safe nav boundary:
  `apps/tenant-console-web/app/partner/(authenticated)/layout.tsx:10-25`
- Inactive-entry / missing-eligibility blocking:
  `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx:34-69`
  `apps/tenant-console-web/app/api/partner/bookings/route.ts:79-85`
  `apps/tenant-console-web/app/api/partner/bookings/route.ts:162-172`
- Backend scope-mismatch / revoked-entry protection:
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:4279-4314`
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:4417-4491`

Handoff note:

- Partner rows are already concrete enough to classify as implemented or
  rejected-with-message in the first draft of `SYS-UI-006`.

### 3. Driver device registration to degraded recovery flow

Canonical journey:

1. Driver submits registration code and device label.
2. Unprovisioned devices stay blocked from work pages.
3. A valid session opens the cockpit.
4. Auth or platform degradation becomes prominent.
5. Reauth / revoke / suspend sends the driver back through onboarding.

Source:

- `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:220-275`

Current repo evidence:

- Registration screen and block on unprovisioned devices:
  `apps/driver-app/app/onboarding.tsx:1193-1244`
- Degraded workspace state:
  `apps/driver-app/app/onboarding.tsx:1252-1290`
- Reauth prominence:
  `apps/driver-app/app/onboarding.tsx:1392-1413`
  `apps/driver-app/app/platform-presence.tsx:195-220`
- Auth-failure routing back to onboarding:
  `apps/driver-app/lib/driver-identity-bootstrap.ts:29-86`
  `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts:57-100`

Handoff note:

- The parent matrix should list revoked binding, suspended driver, retired /
  revoked driver, invalid certificate, registration error, reauth-required,
  and degraded feature-flag states as distinct rows.

### 4. Call point / concierge to ops escalation flow

Canonical journey:

1. Site-bound operator signs in with site identity.
2. Operator selects a fixed site.
3. Operator creates a proxy booking.
4. Operator sees ETA and dispatch result.
5. Failure or remediation escalates into the control plane.

Source:

- `phase1_prd_detailed_v1.md:548-569`

Current repo evidence:

- There is no `apps/assisted-entry-web` route tree yet.
- The nearest implemented control-plane flow is Ops callcenter:
  open session, link / create order, callback, recording gate, complaint
  transfer, and linked dispatch trace.
  `apps/ops-console-web/app/callcenter/page.tsx:235-257`
  `apps/ops-console-web/app/callcenter/page.tsx:317-418`
  `packages/api-client/src/index.ts:773-871`

Handoff note:

- The matrix should mark external assisted-entry login / fixed-site / proxy
  booking rows as blocked to `SYS-UI-005`, while still using Ops callcenter as
  the evidence-backed escalation target.

### 5. Passenger direct booking to receipt / complaint flow

Canonical journey:

1. Passenger creates immediate or reserved booking.
2. Passenger sees ETA and dispatch status.
3. Passenger may cancel.
4. Passenger can review history and receipt.
5. Passenger can escalate to support / complaint.

Source:

- `phase1_prd_detailed_v1.md:452-489`

Current repo evidence:

- The topology is fixed to `apps/passenger-web`, but no route tree exists yet.
- The closest existing read / mutation authority is still tenant booking and
  order-detail truth, not a passenger-facing shell.
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:29-35`
  `packages/api-client/src/index.ts:481-507`

Handoff note:

- Passenger auth, session-expiry, cancel, receipt, and complaint rows should be
  written as explicit blockers to `SYS-UI-003` / `SYS-UI-004`, not guessed as
  implied by tenant or ops surfaces.

## Concrete Gaps To Preserve As Blockers

| Gap                                                                            | Why it matters for `SYS-UI-006`                                                                                                                                                      | Evidence                                                                                                                                                  | Named downstream owner                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/passenger-web` does not exist yet                                        | Passenger login, session-expiry, cancel, receipt, and complaint rows still have no route-level UI evidence.                                                                          | topology decision + repo scan + PRD: `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:16-25`; `phase1_prd_detailed_v1.md:452-489` | `SYS-UI-003`, `SYS-UI-004`                                                                              |
| `apps/assisted-entry-web` does not exist yet                                   | Site login, fixed-site selection, proxy booking, ETA, dispatch-result, and denied / degraded assisted-entry rows still have no external portal.                                      | topology decision + repo scan + PRD: `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:16-25`; `phase1_prd_detailed_v1.md:548-569` | `SYS-UI-005`                                                                                            |
| Tenant auth truth is split across `tenant-portal-web` and `tenant-console-web` | The matrix can easily over-claim selected-shell parity if it ignores that real tenant auth lives in the sunset portal while the selected shell still hard-codes demo tenant context. | `apps/tenant-portal-web/lib/api-client.ts:67-121`; `apps/tenant-console-web/lib/api-client.ts:1-17`                                                       | parent author decision inside `SYS-UI-006`, with follow-up likely landing in tenant selected-shell work |
| Tenant user governance is also split                                           | `tenant-portal-web` supports invite / role update / suspend, while `tenant-console-web` `/users` still stops short of those commands.                                                | `apps/tenant-portal-web/app/users/actions.ts:36-76`; `apps/tenant-console-web/app/users/page.tsx:134-137`                                                 | parent author decision inside `SYS-UI-006`                                                              |
| Site / call-point backend roots exist without a repo-local frontend helper     | The domain model already acknowledges `site` / `call_point`, but there is no app helper or route tree to verify those auth rows in UI.                                               | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:68-80`                                                                                  | `SYS-UI-005`                                                                                            |

## Recommended Matrix Build Order

1. Start with the implemented rows:
   tenant-portal auth, tenant user lifecycle, tenant integration lifecycle,
   tenant-console partner mode, platform-admin governance, driver onboarding /
   revoke / reauth, and ops callcenter escalation.
2. Write rows by route group, not by repo or product name. In particular,
   separate:
   `tenant-portal-web` tenant auth,
   `tenant-console-web` tenant-admin shell,
   `tenant-console-web/app/partner/*` partner auth,
   `driver-app`,
   `platform-admin-web`,
   and `ops-console-web`.
3. For each row, record:
   entry route, bootstrap source, positive action, negative-state handling,
   backend command/query seam, and whether the row is implemented, blocked, or
   delegated.
4. Only after the matrix exists should the parent task decide whether any
   targeted UI fix is truly needed. The packet already shows several areas
   where the missing work is classification, not new contract design.

## Parent Handoff Summary

`SYS-UI-006` does not start from zero. The repo already has:

- real tenant bootstrap and RBAC evidence in `tenant-portal-web`
- real partner bootstrap / eligibility / booking-funnel evidence in the
  `tenant-console-web` partner route group
- platform-admin control-plane invite / suspend / revoke / credential actions
- driver device registration / revoke / degraded recovery evidence
- ops callcenter escalation evidence

What is still missing is the first explicit, cross-surface matrix that tells
the truth about those seams and keeps passenger / assisted-entry gaps honest.
