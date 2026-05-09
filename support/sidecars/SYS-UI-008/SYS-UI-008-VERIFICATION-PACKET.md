# SYS-UI-008 Full-System UI Verification Packet

- Task: `SYS-UI-008` — Full-System UI Verification Packet
- Owner / Reviewer: `Codex` / `Claude2`
- Execution packet: `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
- Primary topology decision: `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- Generated: `2026-05-09` (UTC)
- Machine-truth status at draft time: `in_progress` in `ai-status.json`

This packet is the only acceptable verification basis for any future
full-system UI completion claim. It consolidates the current machine-truth
dependency baseline, the actual route inventory now present in repo, the
accepted deviations inherited from earlier waves, the remaining route-level
incompleteness, the external gates that still matter, and the only truthful
completion claim that can be made from the current working tree.

## 1. Verification Summary

- All seven formal dependencies are `done` in `ai-status.json`:
  `TEN-UI-009`, `SYS-UI-002`, `SYS-UI-003`, `SYS-UI-004`, `SYS-UI-005`,
  `SYS-UI-006`, and `SYS-UI-007`.
- Every in-scope family now has an explicit repo landing zone and at least one
  concrete route inventory:
  - tenant admin: `apps/tenant-console-web`
  - partner mode: `apps/tenant-console-web/app/partner/*`
  - passenger: `apps/passenger-web`
  - concierge / assisted entry: `apps/concierge-portal-web`
  - ops: `apps/ops-console-web`
  - platform admin: `apps/platform-admin-web`
  - driver: `apps/driver-app`
- The current repo truth is **not** strong enough to claim
  `complete` or `complete except named external blockers`.
- The only truthful current claim is:
  **`incomplete with route-level reasons`**.

Why the claim is still incomplete:

1. `apps/tenant-console-web` still carries selected-shell placeholders on
   `/bookings/new`, `/api-keys`, and `/webhooks`, and its bootstrap remains
   demo-local rather than backend-issued.
2. `apps/passenger-web` materializes topology and route-safe states, but
   passenger auth, request submit, trip mutation wiring, and complaint/support
   closure are not fully productized.
3. `apps/concierge-portal-web` is materially present, but assisted-entry login
   is still repo-local bootstrap and live CTI / recording activation remains
   externally gated.

External gates still matter as a second layer of qualification, but they are
not the only reason the claim cannot yet advance.

## 2. Dependency Closure

| Task         | Status | Commit / closeout evidence | Contribution to the full-system claim                                                             |
| ------------ | ------ | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `TEN-UI-009` | `done` | `16fea58`                  | Tenant-console route-by-route packet, accepted deviations, and RBAC qualifications.               |
| `SYS-UI-002` | `done` | `beb0c7a`                  | Repo-local partner mode with signed session cookie, eligibility, create, and confirmation routes. |
| `SYS-UI-003` | `done` | `1b97717`                  | Passenger shell baseline and receipt landing-zone materialization.                                |
| `SYS-UI-004` | `done` | `4b0fe88`                  | Passenger booking, active-trip, and named negative-flow routes.                                   |
| `SYS-UI-005` | `done` | `4041817`                  | Concierge / call-point portal materialization in repo-local form.                                 |
| `SYS-UI-006` | `done` | `b5fc869`                  | Cross-surface auth / invite / revoke / denial / degraded matrix.                                  |
| `SYS-UI-007` | `done` | `489ca1e`                  | Forwarded-authority explanation across tenant / ops / admin / driver surfaces.                    |

Machine-truth route families outside the formal dependency list but used as
supporting verification anchors are also already `done`:

- `DRV-MAT-010` — driver app verification packet
- `DRV-MP-005`, `DRV-MP-006`, `DRV-MP-007` — trip, platform presence, and
  earnings authority completion
- `OPS-UI-006`, `OPS-UI-007`, `OPS-UI-008` — dispatch and callcenter hardening
- `ADM-UI-006` — partner-detail readiness hardening

## 3. Surface Landing-Zone Map

| Surface family               | Current repo landing zone               | Classification                           | Notes                                                                                                                             |
| ---------------------------- | --------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tenant admin                 | `apps/tenant-console-web`               | `implemented with qualification`         | Formal in-repo tenant target from `TEN-UI-001`; still leans on sunset `apps/tenant-portal-web` for some auth/RBAC/mutation depth. |
| Partner mode                 | `apps/tenant-console-web/app/partner/*` | `implemented`                            | Constrained shell with signed cookie bootstrap, eligibility, create, and confirmation only.                                       |
| Passenger                    | `apps/passenger-web`                    | `topology materialized, not fully wired` | Route family exists and negative states are explicit; auth/submit/support closure is not complete.                                |
| Concierge / assisted entry   | `apps/concierge-portal-web`             | `repo-local bootstrap`                   | Real portal exists, but topology docs still name `apps/assisted-entry-web`; production auth and CTI remain gated.                 |
| Assisted-entry naming bridge | `apps/assisted-entry-web`               | `documentation bridge only`              | README explicitly says the real implementation lives in `apps/concierge-portal-web`.                                              |
| Ops                          | `apps/ops-console-web`                  | `implemented`                            | Internal control-plane workspace, distinct from concierge portal.                                                                 |
| Platform admin               | `apps/platform-admin-web`               | `implemented`                            | Governance surface is route-materialized and remains the authority for tenant/partner/fleet/platform posture.                     |
| Driver                       | `apps/driver-app`                       | `implemented with external proof gates`  | Route inventory and tests are present; mobile distribution and live adapter evidence remain external gates.                       |
| Legacy tenant portal         | `apps/tenant-portal-web`                | `sunset carry-over evidence only`        | Not the formal landing zone, but still supplies some current auth/RBAC/mutation evidence used by `TEN-UI-009` and `SYS-UI-006`.   |

## 4. Route Inventory

Classification tags used below:

- `implemented`
- `implemented with qualification`
- `accepted deviation`
- `topology-only`
- `repo-local bootstrap`
- `blocked`

### 4.1 Tenant Admin (`apps/tenant-console-web`)

Primary inventory source:
`apps/tenant-console-web/lib/navigation.ts:12-85`,
`apps/tenant-console-web/components/tenant-shell.tsx:12-87`,
`support/sidecars/TEN-UI-009/TEN-UI-009-VERIFICATION-PACKET.md`

| Route                   | Status                           | Evidence                                                                                                                        | Verification note                                                                                                                    |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                     | `implemented with qualification` | `apps/tenant-console-web/app/page.tsx`, `support/sidecars/TEN-UI-009/TEN-UI-009-VERIFICATION-PACKET.md` §5                      | Real tenant home route, but shell bootstrap still comes from demo tenant identity.                                                   |
| `/bookings`             | `implemented with qualification` | `apps/tenant-console-web/app/bookings/page.tsx`, `support/sidecars/TEN-UI-009/TEN-UI-009-VERIFICATION-PACKET.md` §5             | Real list/detail oversight, with forwarded-authority warning carried by `SYS-UI-007`.                                                |
| `/bookings/[bookingId]` | `implemented with qualification` | `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx`, `support/sidecars/TEN-UI-009/TEN-UI-009-VERIFICATION-PACKET.md` §5 | Real detail page and allowed commands, but timeline and some downstream context remain derived/qualified.                            |
| `/bookings/new`         | `accepted deviation`             | `apps/tenant-console-web/app/bookings/new/page.tsx:11-33`                                                                       | Page explicitly says the route is live in the shell but the policy-aware intake form still belongs to an upstream tenant slice.      |
| `/api-keys`             | `accepted deviation`             | `apps/tenant-console-web/app/api-keys/page.tsx:10-32`                                                                           | IA slot exists, but deeper issue / rotate / revoke product depth is still carried as legacy evidence.                                |
| `/webhooks`             | `accepted deviation`             | `apps/tenant-console-web/app/webhooks/page.tsx:10-37`                                                                           | IA slot exists, but full endpoint management and delivery tooling are still qualified.                                               |
| `/audit`                | `implemented`                    | `apps/tenant-console-web/app/audit/page.tsx`, `support/sidecars/TEN-UI-009/TEN-UI-009-VERIFICATION-PACKET.md` §5                | Read-only tenant evidence trail is present.                                                                                          |
| `/users`                | `implemented with qualification` | `apps/tenant-console-web/app/users/page.tsx:39-137`                                                                             | Reads tenant users and backend role catalog, but invite / role-change / suspend mutations are not productized in the selected shell. |
| `/settings`             | `implemented with qualification` | `apps/tenant-console-web/app/settings/page.tsx`, `support/sidecars/TEN-UI-009/TEN-UI-009-VERIFICATION-PACKET.md` §5             | Real aggregate view, but not a formal dedicated tenant settings contract.                                                            |

Tenant-selected-shell blockers that still matter to the system claim:

- Demo tenant bootstrap remains hard-coded:
  `apps/tenant-console-web/lib/api-client.ts:3-17`
- Partner routes intentionally short-circuit the tenant shell:
  `apps/tenant-console-web/components/tenant-shell.tsx:16-18,56-67`
- Current production traffic note remains explicit:
  `apps/tenant-console-web/components/tenant-shell.tsx:64-67`

### 4.2 Partner Mode (`apps/tenant-console-web/app/partner/*`)

Primary inventory source:
`apps/tenant-console-web/app/partner/(authenticated)/layout.tsx:10-26`,
`apps/tenant-console-web/components/partner-shell.tsx:41-189`,
`support/sidecars/SYS-UI-002/SYS-UI-002-SIDECAR-ACCEPTANCE.md`

| Route                          | Status        | Evidence                                                                                                                            | Verification note                                                                                         |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/partner`                     | `implemented` | `apps/tenant-console-web/app/partner/page.tsx`                                                                                      | Redirect surface that routes authenticated vs unauthenticated callers correctly.                          |
| `/partner/login`               | `implemented` | `apps/tenant-console-web/app/partner/(public)/login/page.tsx`, `apps/tenant-console-web/lib/partner-session.ts:17-45,156-182`       | Backend-issued partner bootstrap with signed HTTP-only cookie `drts_partner_session_v2`.                  |
| `/partner/start`               | `implemented` | `apps/tenant-console-web/app/partner/(authenticated)/start/page.tsx`, `apps/tenant-console-web/components/partner-shell.tsx:75-159` | Entry summary, partner-safe boundary, and no tenant-admin nav leakage.                                    |
| `/partner/eligibility`         | `implemented` | `apps/tenant-console-web/app/partner/(authenticated)/eligibility/page.tsx:11-64`                                                    | Explicit eligible / ineligible / manual-review handling; negative outcomes do not fall through to create. |
| `/partner/booking/new`         | `implemented` | `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx:11-68`                                                    | Create route enforces active entry and eligibility gate before submit.                                    |
| `/partner/booking/[bookingId]` | `implemented` | `apps/tenant-console-web/app/partner/(authenticated)/booking/[bookingId]/page.tsx:23-132`                                           | Confirmation route stops at proof-of-intake; update / cancel remain out of scope by design.               |

Partner-specific accepted boundary:

- Partner mode is intentionally not a queue-management or booking-edit surface.
  That is a design guardrail, not missing work:
  `apps/tenant-console-web/app/partner/(authenticated)/booking/[bookingId]/page.tsx:112-123`

### 4.3 Passenger (`apps/passenger-web`)

Primary inventory source:
`apps/passenger-web/lib/navigation.ts:8-161`,
`support/sidecars/SYS-UI-003/SYS-UI-003-SIDECAR-ACCEPTANCE.md`,
`support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-ACCEPTANCE.md`

| Route                   | Status                           | Evidence                                                     | Verification note                                                                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | `topology-only`                  | `apps/passenger-web/app/page.tsx`                            | Home route exists and links all passenger route families, but it does not prove live passenger session or booking wiring.     |
| `/auth`                 | `topology-only`                  | `apps/passenger-web/app/auth/page.tsx:18-55`                 | Explicit auth entry exists, but the page itself says channel-specific transport and identity seams are still being wired.     |
| `/book`                 | `topology-only`                  | `apps/passenger-web/app/book/page.tsx:32-75`                 | Real booking-entry route exists, but the page explicitly says live `POST /bookings` integration belongs to a downstream wave. |
| `/book/denied`          | `implemented`                    | `apps/passenger-web/app/book/denied/page.tsx`                | Dedicated negative route.                                                                                                     |
| `/book/ineligible`      | `implemented`                    | `apps/passenger-web/app/book/ineligible/page.tsx`            | Dedicated negative route.                                                                                                     |
| `/book/no-supply`       | `implemented`                    | `apps/passenger-web/app/book/no-supply/page.tsx`             | Dedicated negative route.                                                                                                     |
| `/book/degraded`        | `implemented`                    | `apps/passenger-web/app/book/degraded/page.tsx`              | Dedicated negative route.                                                                                                     |
| `/trip`                 | `topology-only`                  | `apps/passenger-web/app/trip/page.tsx:45-149`                | Real active-trip route exists, but it remains a route-level materialization rather than a proven live rider session surface.  |
| `/trip/cancel`          | `topology-only`                  | `apps/passenger-web/app/trip/cancel/page.tsx`                | Cancel authority is framed correctly, but live mutation wiring is not fully closed.                                           |
| `/trip/completed`       | `implemented with qualification` | `apps/passenger-web/app/trip/completed/page.tsx`             | Completion route exists and hands into receipt ownership honestly.                                                            |
| `/trip/read-only`       | `implemented`                    | `apps/passenger-web/app/trip/read-only/page.tsx`             | Source-owned authority boundary is explicit.                                                                                  |
| `/trip/cancelled`       | `implemented`                    | `apps/passenger-web/app/trip/cancelled/page.tsx`             | Dedicated negative route with named cancelling actor.                                                                         |
| `/trip/reauth-required` | `implemented`                    | `apps/passenger-web/app/trip/reauth-required/page.tsx:18-69` | Explicit reauth-required guard that hides trip data until re-verification.                                                    |
| `/trips`                | `topology-only`                  | `apps/passenger-web/app/trips/page.tsx`                      | Trip history landing exists, but it is still part of the topology/materialization layer.                                      |
| `/receipts`             | `implemented with qualification` | `apps/passenger-web/app/receipts/page.tsx:27-65`             | Receipt center is explicit and source-owned, but it does not invent delivery channels or override source ownership.           |
| `/unauthenticated`      | `implemented`                    | `apps/passenger-web/app/unauthenticated/page.tsx`            | Dedicated auth-failure route.                                                                                                 |
| `/unsupported`          | `implemented`                    | `apps/passenger-web/app/unsupported/page.tsx`                | Dedicated unsupported/source-owned fallback route.                                                                            |

Passenger routes that are still missing for a full-system claim:

- No complaint or support route is present under `apps/passenger-web/app`.
- `phase1_prd_detailed_v1.md` still requires passenger-side complaint
  escalation and complaint linkage (`:1455`, `:1490`).
- `phase1_service_contracts_v1.md` still carries complaint and passenger channel
  auth requirements (`:76`, `:866`, `:684`, `:706`).

This means passenger topology is no longer deferred, but passenger product
closure is still incomplete.

### 4.4 Concierge / Assisted Entry (`apps/concierge-portal-web`)

Primary inventory source:
`apps/concierge-portal-web/lib/navigation.ts:8-60`,
`support/sidecars/SYS-UI-005/SYS-UI-005-SIDECAR-ACCEPTANCE.md`

| Route                    | Status                           | Evidence                                                                                                       | Verification note                                                                                                           |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | `implemented`                    | `apps/concierge-portal-web/app/page.tsx`                                                                       | Landing route frames assisted-entry boundary and the explicit guardrail routes.                                             |
| `/login`                 | `repo-local bootstrap`           | `apps/concierge-portal-web/app/login/page.tsx:21-31`                                                           | Page explicitly says canonical truth requires site-bound sign-in, but the repo currently uses local desk bootstrap.         |
| `/start`                 | `implemented`                    | `apps/concierge-portal-web/app/start/page.tsx`, `apps/concierge-portal-web/components/session-guard.tsx:48-63` | Fixed-site desk selection is explicit and required before assisted entry begins.                                            |
| `/bookings/new`          | `implemented with qualification` | `apps/concierge-portal-web/app/bookings/new/page.tsx:107-118,249-257`                                          | Proxy booking route is real and uses backend seams, but it is still under repo-local auth/bootstrap and external CTI gates. |
| `/lookup`                | `implemented with qualification` | `apps/concierge-portal-web/app/lookup/page.tsx:132-229`                                                        | Read-back route is real; recent IDs are stored in browser state while order/call truth comes from backend APIs.             |
| `/callbacks`             | `implemented`                    | `apps/concierge-portal-web/app/callbacks/page.tsx`                                                             | Callback follow-up exists as a first-class route.                                                                           |
| `/denied`                | `implemented`                    | `apps/concierge-portal-web/app/denied/page.tsx`                                                                | Explicit denied guardrail route.                                                                                            |
| `/ineligible`            | `implemented`                    | `apps/concierge-portal-web/app/ineligible/page.tsx`                                                            | Explicit ineligible guardrail route.                                                                                        |
| `/degraded`              | `implemented`                    | `apps/concierge-portal-web/app/degraded/page.tsx`                                                              | Explicit degraded/read-only fallback route.                                                                                 |
| `/recording-unavailable` | `implemented`                    | `apps/concierge-portal-web/app/recording-unavailable/page.tsx`                                                 | Explicit CTI/recording escalation route to ops.                                                                             |

Concierge-specific claim limiters:

- Session guard still names repo-local bootstrap as the current reality:
  `apps/concierge-portal-web/components/session-guard.tsx:17-25,30-44`
- `apps/assisted-entry-web/README.md:1-12` says topology docs still point at
  `apps/assisted-entry-web` while the implementation lives in
  `apps/concierge-portal-web`.

### 4.5 Ops (`apps/ops-console-web`)

Primary inventory source:
`apps/ops-console-web/components/sidebar.tsx:29-87`,
`apps/ops-console-web/README.md`,
`support/sidecars/SYS-UI-007/SYS-UI-007-VERIFICATION-PACKET.md`

| Route                 | Status        | Evidence                                                                                                             | Verification note                                                                                         |
| --------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/dashboard`          | `implemented` | `apps/ops-console-web/components/sidebar.tsx:29-35`                                                                  | Route is part of the active console nav and README baseline.                                              |
| `/dispatch`           | `implemented` | `apps/ops-console-web/components/sidebar.tsx:35-36`, `support/sidecars/SYS-UI-007/SYS-UI-007-VERIFICATION-PACKET.md` | Dispatch family includes owned/forwarded authority and workflow hardening from `OPS-UI-006`/`OPS-UI-007`. |
| `/complaints`         | `implemented` | `apps/ops-console-web/components/sidebar.tsx:36-40`                                                                  | Complaint center route is present in the active console.                                                  |
| `/callcenter`         | `implemented` | `apps/ops-console-web/components/sidebar.tsx:41-45`, `OPS-UI-008` closeout                                           | Internal phone-order/callback/recording-transfer workspace remains here, not in concierge.                |
| `/reports`            | `implemented` | `apps/ops-console-web/components/sidebar.tsx:46-50`                                                                  | Reporting route exists as part of the active console.                                                     |
| `/revenue`            | `implemented` | `apps/ops-console-web/components/sidebar.tsx:51-55`                                                                  | Revenue review route exists.                                                                              |
| `/attendance`         | `implemented` | `apps/ops-console-web/components/sidebar.tsx:56-60`                                                                  | Route exists.                                                                                             |
| `/incidents`          | `implemented` | `apps/ops-console-web/components/sidebar.tsx:61-65`                                                                  | Route exists.                                                                                             |
| `/maintenance`        | `implemented` | `apps/ops-console-web/components/sidebar.tsx:66-70`                                                                  | Route exists.                                                                                             |
| `/vehicles`           | `implemented` | `apps/ops-console-web/components/sidebar.tsx:71-75`                                                                  | Route exists.                                                                                             |
| `/drivers`            | `implemented` | `apps/ops-console-web/components/sidebar.tsx:76-77`                                                                  | Driver list route exists.                                                                                 |
| `/drivers/[driverId]` | `implemented` | `find apps/ops-console-web/app -path '*/page.tsx'` route scan                                                        | Detail route exists.                                                                                      |
| `/contracts`          | `implemented` | `apps/ops-console-web/components/sidebar.tsx:77-81`                                                                  | Route exists.                                                                                             |
| `/feature-flags`      | `implemented` | `apps/ops-console-web/components/sidebar.tsx:82-86`                                                                  | Route exists.                                                                                             |

Ops-family note:

- The dedicated concierge portal is intentionally separate; ops remains the
  internal control-plane workspace, which is consistent with the topology
  decision and `SYS-UI-005`.

### 4.6 Platform Admin (`apps/platform-admin-web`)

Primary inventory source:
`apps/platform-admin-web/components/admin-nav.tsx:62-104`,
`apps/platform-admin-web/README.md`,
`support/sidecars/SYS-UI-007/SYS-UI-007-VERIFICATION-PACKET.md`

| Route                                | Status        | Evidence                                                                                                                   | Verification note                                                                  |
| ------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/`                                  | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:62-64`                                                                   | Governance home route exists.                                                      |
| `/health`                            | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:64-65`, `support/sidecars/SYS-UI-007/SYS-UI-007-VERIFICATION-PACKET.md`  | Route carries forwarded adapter health, credential, auth, and degradation posture. |
| `/tenants`                           | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:65-66`                                                                   | Route exists.                                                                      |
| `/tenants/[tenantId]`                | `implemented` | `find apps/platform-admin-web/app -path '*/page.tsx'` route scan                                                           | Tenant detail route exists.                                                        |
| `/partners`                          | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:66-70`                                                                   | Route exists.                                                                      |
| `/partners/[entrySlug]`              | `implemented` | `ADM-UI-006` closeout                                                                                                      | Partner detail readiness route exists and was hardened.                            |
| `/users`                             | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:71-72`                                                                   | Route exists.                                                                      |
| `/fleet`                             | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:72-73`                                                                   | Route exists.                                                                      |
| `/switchboard`                       | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:73-77`                                                                   | Route exists.                                                                      |
| `/pricing`                           | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:78-82`                                                                   | Route exists.                                                                      |
| `/payments`                          | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:83-87`                                                                   | Route exists.                                                                      |
| `/payments/reconciliation/[issueId]` | `implemented` | `find apps/platform-admin-web/app -path '*/page.tsx'` route scan                                                           | Reconciliation detail route exists.                                                |
| `/notices`                           | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:88-89`                                                                   | Route exists.                                                                      |
| `/audit`                             | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:89-94`                                                                   | Route exists.                                                                      |
| `/feature-flags`                     | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:94-99`                                                                   | Route exists.                                                                      |
| `/adapter-registry`                  | `implemented` | `apps/platform-admin-web/components/admin-nav.tsx:99-103`, `support/sidecars/SYS-UI-007/SYS-UI-007-VERIFICATION-PACKET.md` | Route carries adapter readiness posture that matters to forwarded authority.       |

Platform-admin route family is materially complete in repo-local terms. Its
remaining limits are mostly external-gated live adapter / issuer / rollout
evidence rather than missing route topology.

### 4.7 Driver (`apps/driver-app`)

Primary inventory source:
`support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md` §§3-4,
`find apps/driver-app/app -maxdepth 1 -type f`

| Route                | Status        | Evidence                                              | Verification note                                                         |
| -------------------- | ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `/`                  | `implemented` | `apps/driver-app/app/index.tsx:1-4`, `DRV-MAT-010` §3 | Root redirect to `/onboarding`.                                           |
| `/onboarding`        | `implemented` | `DRV-MAT-010` §4                                      | Registration / bootstrap / degraded states verified in the driver packet. |
| `/jobs`              | `implemented` | `DRV-MAT-010` §4, `SYS-UI-007` route evidence         | Forwarded statuses and ready/empty/error states are explicit.             |
| `/trip`              | `implemented` | `DRV-MAT-010` §4, `DRV-MP-005`, `SYS-UI-007`          | Trip authority and forwarded-state posture are explicit.                  |
| `/incident`          | `implemented` | `DRV-MAT-010` §4                                      | Incident/SOS route exists.                                                |
| `/earnings`          | `implemented` | `DRV-MAT-010` §4, `DRV-MP-007`                        | Finance authority split is explicit.                                      |
| `/platform-presence` | `implemented` | `DRV-MAT-010` §4, `DRV-MP-006`                        | Platform presence / reauth / sync posture is explicit.                    |
| `/shift`             | `implemented` | `DRV-MAT-010` §4                                      | Shift route exists with ready/disabled/error states.                      |
| `/settings`          | `implemented` | `DRV-MAT-010` §4                                      | Settings route exists with ready/error states.                            |

Driver-family qualifier:

- `DRV-MAT-010` already records visual evidence as `BLOCKED` because this
  environment lacks Android tooling (`adb` / emulator). That is an external
  proof/tooling gate, not a route-topology gap.

## 5. Cross-Surface Auth / Registration / Negative-Flow Readout

`support/sidecars/SYS-UI-006/SYS-UI-006-MATRIX.md` remains the detailed route
matrix. For the full-system claim, the important summary is:

| Flow family                                              | Current posture                                                        | Why it matters to the claim                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tenant login / dynamic RBAC bootstrap                    | `implemented in legacy tenant portal; selected shell still demo-local` | Full-system tenant-admin closure cannot be claimed while the selected shell still lacks real backend-issued bootstrap. |
| Partner login / eligibility / create                     | `implemented`                                                          | Partner intake is materially productized, subject to issuer/live external gates.                                       |
| Passenger auth / reauth                                  | `topology-only / partial`                                              | Route-safe states exist, but the backend-issued passenger auth seam is not fully closed.                               |
| Concierge site-bound login                               | `repo-local bootstrap`                                                 | Assisted-entry auth is still not a production-grade site/call-point contract.                                          |
| Platform-admin invite / revoke / governance              | `implemented`                                                          | Control-plane governance routes exist and are not the main blocker for the claim.                                      |
| Tenant selected-shell invite / role change / suspend     | `not fully productized`                                                | Selected shell stops at read/reporting for users.                                                                      |
| Driver onboarding / revoke / degraded recovery           | `implemented`                                                          | Driver route family is materially verified.                                                                            |
| Negative denial / degraded / unsupported / reauth routes | `materialized across passenger, partner, concierge, tenant, driver`    | The repo no longer hides these as prose-only states.                                                                   |

## 6. Inherited Accepted Deviations

These qualifiers are real and must stay explicit, but they are not hidden
contradictions:

1. `apps/tenant-portal-web` is sunset, yet it still carries some current tenant
   auth/RBAC/mutation evidence used by `TEN-UI-009`. This is acceptable only as
   carry-over evidence, not as the formal landing zone.
2. Partner mode is intentionally constrained to sign-in, eligibility, create,
   and confirmation. It does not expose list/edit/cancel/governance surfaces.
3. Passenger receipt ownership remains source-owned. `apps/passenger-web`
   explicitly allows DRTS receipts, external references, and unsupported cases,
   and it does not invent delivery channels.
4. `apps/assisted-entry-web` is intentionally a documentation bridge while the
   actual portal lives in `apps/concierge-portal-web`.
5. Driver visual proof remains tooling-blocked in this environment, but route
   registration, typecheck, and tests are already evidenced in `DRV-MAT-010`.

## 7. Remaining Route-Level Incomplete Reasons

These are the reasons the current claim must remain `incomplete`, even before
considering external gates.

### 7.1 Tenant-admin selected shell is not fully productized

- Demo bootstrap remains hard-coded:
  `apps/tenant-console-web/lib/api-client.ts:3-17`
- `/bookings/new` explicitly declares itself a placeholder:
  `apps/tenant-console-web/app/bookings/new/page.tsx:11-33`
- `/api-keys` and `/webhooks` expose IA/governance framing but not the full
  selected-shell lifecycle depth:
  `apps/tenant-console-web/app/api-keys/page.tsx:10-32`,
  `apps/tenant-console-web/app/webhooks/page.tsx:10-37`
- `/users` is read/reporting-oriented in the selected shell and explicitly
  defers unsupported user lifecycle mutations:
  `apps/tenant-console-web/app/users/page.tsx:134-137`

### 7.2 Passenger surface is route-materialized but not fully closed

- `/auth` explicitly says channel-specific auth wiring is still being wired:
  `apps/passenger-web/app/auth/page.tsx:23-29`
- `/book` explicitly says live submit belongs to a downstream wave:
  `apps/passenger-web/app/book/page.tsx:70-74`
- No complaint/support route exists in `apps/passenger-web/app`, while PRD truth
  still requires complaint linkage/escalation.

### 7.3 Concierge surface is materially present but not production-auth complete

- `/login` explicitly says dedicated call-point bootstrap contract is still
  absent:
  `apps/concierge-portal-web/app/login/page.tsx:27-31`
- Session guard still waits on repo-local assisted-entry bootstrap:
  `apps/concierge-portal-web/components/session-guard.tsx:17-25`
- The naming seam between `apps/assisted-entry-web` and
  `apps/concierge-portal-web` is still explicit:
  `apps/assisted-entry-web/README.md:1-12`

## 8. External Blockers Still Relevant To UI Completion

These are real blockers, but they are **not** the only reason the full-system
UI claim remains short of complete.

| External gate                                      | Current impact on UI routes                                                                                                                | Evidence                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `EXT-001` real bank / issuer eligibility           | Partner eligibility and benefit-backed booking can be productized in repo, but live issuer activation and proof remain external-gated.     | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`             |
| `EXT-002` real forwarder adapter proof             | Admin / ops / driver forwarded-authority routes exist, but live forwarder proof and callback evidence remain external-gated.               | `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`    |
| `EXT-003` driver mobile distribution               | Driver route family exists, but installable mobile distribution and tester proof remain external-gated.                                    | `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`  |
| `EXT-004` live CTI / recording / filing activation | Concierge and ops phone-order / recording / filing flows exist in repo, but live CTI callback and filing activation remain external-gated. | `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` |

## 9. Completion Claim

### 9.1 Current truthful claim

The only acceptable current full-system UI completion claim is:

> **`incomplete with route-level reasons`**

### 9.2 Exact reasons attached to that claim

1. Tenant admin is not fully closed on the selected shell because real
   tenant-issued bootstrap is absent and three top-level routes remain
   placeholder / partial surfaces.
2. Passenger routes are present and auditable, but passenger auth, booking
   submit, trip mutation wiring, and complaint/support closure are not fully
   productized.
3. Concierge / assisted-entry routes are present, but production-grade
   site-bound auth and live CTI/recording evidence are still missing.

### 9.3 What would have to become true before the claim can advance

To move from `incomplete with route-level reasons` to
`complete except named external blockers`, the repo would at minimum need:

1. tenant-admin selected-shell bootstrap and top-level workflow closure
   (`/bookings/new`, `/api-keys`, `/webhooks`, `/users` mutation depth);
2. passenger auth / booking / trip / support closure beyond topology-only
   materialization;
3. concierge production-auth seam resolution plus a settled
   `assisted-entry-web` vs `concierge-portal-web` naming posture.

Only after those repo-local route gaps close would the remaining qualifier set
reduce to the named external gates in §8.

## 10. Verification Commands Used For This Packet

This task is docs-first. No product code was changed while producing the packet.
Verification for this packet therefore focused on machine-truth and route
inventory inspection:

| Command / check                                | Purpose                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `jq '.tasks[]                                  | select(.id==...)' ai-status.json`                                                                           | Confirmed dependency/task status and closeout metadata from machine truth.                    |
| `find apps/.../app -name page.tsx              | sort`                                                                                                       | Rebuilt the actual route inventory for tenant / passenger / concierge / ops / admin surfaces. |
| `find apps/driver-app/app -maxdepth 1 -type f` | Rebuilt the current Expo route inventory for the driver app.                                                |
| `rg -n ...` across product/spec/decision docs  | Reconfirmed topology and PRD anchors for passenger, concierge, partner, and forwarded-authority qualifiers. |

Follow-up verification required before handoff:

- `git diff --check -- support/sidecars/SYS-UI-008/SYS-UI-008-VERIFICATION-PACKET.md`
