# IAM Minimum Operational Readiness GAP (2026-08-15)

**Status:** audited against current code; implementation not yet complete
**Baseline:** `origin/dev@85d76c539e2f25bc97dcf1ec18a44aea4f0fc389`
**Scope:** minimum login, account, authorization, session, and deployment controls required for normal system operation
**System design:** `docs/02-architecture/iam-minimum-operational-closure-system-design-20260815.md`
**Execution plan:** `docs/03-runbooks/iam-minimum-operational-closure-execution-tasks-20260815.md`

## 1. Executive conclusion

The repository has a substantial IAM baseline. It is not accurate to say that
login, account management, or authorization are absent. The merged baseline
already includes bearer sessions, tenant and partner OIDC exchange, tenant user
invitation and activation, role/status changes, last-admin and self-escalation
protections, current/all-device logout, session revocation, audit records, and a
strict default-deny guard.

It is also not accurate to call IAM operationally complete. Three minimum
closure gaps remain:

1. The active `tenant-console-web` still creates API clients with demo actor
   bootstrap headers instead of an authenticated browser session. Those headers
   are rejected by the strict guard.
2. The checked-in route inventory covers only 8 of 56 controllers. A full
   controller audit finds 71 unclassified routes. Strict staging/production
   rejects all 71 with `AUTH_ROUTE_UNCLASSIFIED`.
3. The generic PKCE exchange can use synthetic test codes whenever the token
   endpoint is absent, even when `OIDC_MOCK_MODE` was not explicitly enabled.
   No strict startup gate currently prevents that configuration.

The minimum closure is therefore **not** a new enterprise IAM programme. It is
one active tenant login cutover, one strict OIDC configuration gate, explicit
classification of the 71 routes, full-inventory regression coverage, and one
production-like staging proof.

## 2. Audit method and evidence

The audit used the latest fetched `origin/dev`, not an older worker checkout or
task-board claim.

| Evidence                   | Current result                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git baseline               | `85d76c539e2f25bc97dcf1ec18a44aea4f0fc389`                                                                                                                                                                                                                                                                                                                                         |
| IAM focused suite          | 8 files passed, 70 tests passed                                                                                                                                                                                                                                                                                                                                                    |
| Focused command            | `pnpm exec vitest run tests/unit/iam-min-accses-001.test.ts tests/unit/auth-bootstrap.test.ts tests/unit/bootstrap-auth-guard-strict-env.test.ts tests/unit/auth-startup-config.test.ts tests/integration/auth-startup-config.integration.test.ts tests/security/iam-auth-negative-matrix.test.ts tests/security/iam-route-inventory.test.ts tests/contract/iam-contracts.test.ts` |
| Controller count           | 56 `*.controller.ts` files under `apps/api/src`                                                                                                                                                                                                                                                                                                                                    |
| Checked-in inventory count | 8 controller files in `tests/security/iam-route-inventory.test.ts:9`                                                                                                                                                                                                                                                                                                               |
| Full one-time audit        | 71 unclassified routes in 13 controllers; audit-only patch was reverted after capture                                                                                                                                                                                                                                                                                              |
| Latest integration CI      | success, run `31853109553`                                                                                                                                                                                                                                                                                                                                                         |
| Latest Dev deployment      | build, migration, service deploy, and health checks succeeded in run `31853505985`                                                                                                                                                                                                                                                                                                 |
| Latest Dev final status    | failed in operational browser acceptance: 10 functional journeys failed and 6 passed; this is not IAM closure evidence                                                                                                                                                                                                                                                             |
| Strict cloud IAM proof     | absent; existing IAM UAT evidence is a local hermetic staging harness                                                                                                                                                                                                                                                                                                              |

The current Dev workflow is intentionally not strict. It deploys
`DRTS_ENV=development`, `AUTH_MODE=explicit`, and
`DRTS_INTERNAL_KEY_ENFORCED=false` at `.github/workflows/deploy-dev.yml:778`.
The shared web configuration also injects a fixed tenant ID at line 842. A green
Dev health check therefore cannot prove production-like login or authorization.

## 3. What is already complete

These items are present in merged code and should be preserved rather than
reimplemented:

| Capability                             | Evidence and boundary                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strict route default-deny              | `bootstrap-auth.guard.ts:237-251` returns 403 `AUTH_ROUTE_UNCLASSIFIED` when a strict route has no explicit policy.                                                |
| Bearer session validation              | `/api/auth/session`, session persistence, expiry, revocation, and negative tests exist.                                                                            |
| Tenant and partner OIDC entry/exchange | `/api/auth/:realm/login`, tenant callback-session, and partner callback-session exist.                                                                             |
| Tenant user lifecycle                  | Tenant users can be invited, accepted, assigned a basic role, suspended/reactivated through status updates, and protected from self-escalation/last-admin removal. |
| Session controls                       | Current logout, logout-all, self session listing/revoke, tenant admin session inventory/revoke, and invalidation after role/status change are implemented.         |
| Driver device sessions                 | Device register, refresh rotation, revoke, and reuse protections exist.                                                                                            |
| Scope and realm catalogue              | `packages/contracts/src/iam-policy-catalog.ts` defines realms, role families, bounded scopes, and resource-constraint metadata.                                    |
| Negative IAM suite                     | The focused 70-test set passes on the audited SHA.                                                                                                                 |

Machine truth records `IAM-MIN-AUTH-001`, `IAM-MIN-ACCSES-001`, and
`IAM-MIN-REL-001` as done and merged. Those records establish implementation
history, but they do not override contradictory current-code or live-deployment
evidence.

## 4. Open GAPs

### GAP-IAM-01: active tenant console has no operational human login

**Severity:** P0
**Current behaviour:** `apps/tenant-console-web/lib/api-client.ts:5-23`
creates a singleton using `tenant-demo-001`, `demo-tenant-user`, and
`createTenantClient`. The factory sends `x-actor-type`, `x-actor-id`, `x-realm`,
and `x-tenant-id` bootstrap headers at
`packages/api-client/src/index.ts:4234-4250`.

The active tenant console has no `/api/auth/*` BFF route or auth middleware.
Several pages and local route handlers also send demo actor headers directly.
The OIDC BFF under `tenant-portal-web` is not an operational answer because that
application is classified as retired and is not deployed.

**Impact:** the active tenant UI cannot operate against strict staging or
production with a real tenant principal. It either relies on non-strict Dev
fallbacks or receives authentication/authorization failures.

**Minimum closure:** add the tenant-console BFF login/callback/session/logout
boundary, attach its HttpOnly session to all server and proxy API calls, enforce
CSRF on browser mutations, remove active-app demo actor headers, and prove role
and suspension invalidation.

### GAP-IAM-02: route inventory gives false completeness

**Severity:** P0
**Current behaviour:** `tests/security/iam-route-inventory.test.ts:9-18`
hard-codes only eight controllers. The second test verifies that those files
exist; it does not verify that every controller is included.

A full 56-controller scan produced this exact distribution:

| Workstream                     | Controllers                                                                       | Unclassified routes |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------: |
| Admin and tenant operations    | notifications, billing-settlement, feature-flags, tenant-governance, product-rule |                  17 |
| Driver operations              | driver-settings, forwarder, shift-attendance                                      |                  13 |
| Foundation and map             | foundation, geo, service-area                                                     |                  20 |
| Sandbox and Tesla integrations | sandbox-dispatch-gate, tesla-integration                                          |                  21 |
| **Total**                      | **13 controllers**                                                                |              **71** |

Because strict default-deny is working correctly, this is primarily an
availability and incomplete-policy problem, not a permissive bypass. The routes
work in non-strict Dev but are denied in staging/production.

### GAP-IAM-03: generic OIDC exchange is not fail-closed in strict environments

**Severity:** P0
**Current behaviour:** `oidc-pkce.service.ts:903-915` uses a real token endpoint
only when one is configured and `OIDC_MOCK_MODE` is false. Otherwise it accepts
synthetic test-code paths. A missing endpoint therefore silently selects the
offline branch.

The strict startup validator checks `TENANT_OIDC_*` values used by the separate
direct tenant ID-token endpoint, but it does not fully gate the generic
`OIDC_*` PKCE path used by callback-session.

**Impact:** a strict deployment can start without a usable real IdP exchange,
and a configuration error may expose synthetic behaviour outside local tests.

**Minimum closure:** strict startup must reject missing/invalid generic OIDC
provider settings and `OIDC_MOCK_MODE=true`; runtime synthetic exchange must be
limited to local/test plus explicit mock enablement.

### GAP-IAM-04: no production-like cloud proof for the active tenant path

**Severity:** P1 release blocker
**Current behaviour:** existing IAM UAT evidence identifies itself as a local
hermetic staging harness and leaves cloud staging pending. Dev is deliberately
non-strict and uses fixed demo authority.

**Minimum closure:** deploy one exact candidate SHA to a strict staging
environment with a real or dedicated test IdP, then capture login, callback,
authenticated read/write, logout, role downgrade, suspended-account denial,
cross-tenant denial, and zero-unclassified-route evidence.

## 5. Full unclassified route inventory

This list is the acceptance baseline. A route may be intentionally public only
when the implementation task records the reason and adds an explicit
`@OpenRoute()` plus abuse-control test. Merely restoring non-strict fallback is
not acceptable.

### Admin and tenant operations (17)

- `POST /notifications/read`
- `GET /settlement/invoices`
- `GET /settlement/matrix`
- `POST /driver-fee-plans/publish`
- `GET /settlement/reconciliation-issues`
- `POST /settlement/reconciliation-issues`
- `POST /settlement/reconciliation-issues/:issueId/assign`
- `POST /settlement/reconciliation-issues/:issueId/comment`
- `POST /settlement/reconciliation-issues/:issueId/resolve`
- `POST /settlement/reconciliation-issues/:issueId/reopen`
- `GET /admin/flags`
- `GET /admin/flags/:key`
- `PATCH /admin/flags/:key`
- `POST /admin/flags/:key/tenant-overrides`
- `GET /admin/flags/:key/enabled`
- `GET /admin/tenant-governance/summary`
- `GET /product-rule/catalog`

### Driver operations (13)

- `GET /driver-settings`
- `GET /driver-settings/:driverId`
- `PATCH /driver-settings/:driverId`
- `GET /driver/task-views`
- `GET /driver/task-views/:taskId`
- `POST /driver/forwarded-orders/:taskId/accept`
- `POST /driver/forwarded-orders/:taskId/reject`
- `POST /shift-attendance/clock-in`
- `POST /shift-attendance/clock-out`
- `GET /shift-attendance/shifts`
- `GET /shift-attendance/shifts/:shiftId`
- `POST /shift-attendance/shifts/:shiftId/abandon`
- `GET /shift-attendance/attendance`

### Foundation and map (20)

- `GET /system/foundation/manifest`
- `GET /geo/health`
- `GET /geo/search`
- `POST /geo/resolve`
- `POST /geo/reverse`
- `POST /geo/route`
- `GET /service-area/definitions`
- `GET /service-area/admin/geojson`
- `GET /service-area/geojson`
- `POST /service-area/evaluate`
- `POST /service-area/admin/service-areas`
- `POST /service-area/admin/service-areas/:serviceAreaId/update`
- `POST /service-area/admin/service-areas/:serviceAreaId/submit-review`
- `POST /service-area/admin/service-areas/:serviceAreaId/publish`
- `POST /service-area/admin/service-areas/:serviceAreaId/retire`
- `POST /service-area/admin/stop-policies`
- `POST /service-area/admin/stop-policies/:stopPolicyId/update`
- `POST /service-area/admin/stop-policies/:stopPolicyId/submit-review`
- `POST /service-area/admin/stop-policies/:stopPolicyId/publish`
- `POST /service-area/admin/stop-policies/:stopPolicyId/retire`

### Sandbox and Tesla integrations (21)

- `POST /sandbox/dispatch/evaluate`
- `POST /sandbox/dispatch/passenger-disclosure/policies`
- `GET /sandbox/dispatch/passenger-disclosure/policies/:policyId`
- `POST /sandbox/dispatch/passenger-disclosure/catalog`
- `GET /sandbox/dispatch/passenger-disclosure/catalog`
- `POST /sandbox/dispatch/manual-release`
- `GET /tesla-integration/regions`
- `POST /tesla-integration/oauth/session`
- `POST /tesla-integration/oauth/token/refresh`
- `POST /tesla-integration/oauth/token/revoke`
- `GET /tesla-integration/vehicles/discover`
- `GET /tesla-integration/vehicles/bindings`
- `POST /tesla-integration/vehicles/bind`
- `POST /tesla-integration/virtual-key/pairing`
- `GET /tesla-integration/virtual-key/pairing/:vehicleId`
- `POST /tesla-integration/telemetry/configure`
- `GET /tesla-integration/telemetry/:vehicleId/status`
- `GET /tesla-integration/telemetry/:vehicleId/public-sample`
- `GET /tesla-integration/telemetry/:vehicleId/projection`
- `POST /tesla-integration/commands`
- `GET /tesla-integration/commands/:commandId`

## 6. Explicitly out of scope

The minimum closure does not require SCIM, SAML federation, social login,
password storage/reset, adaptive risk scoring, quarterly access-review
campaigns, PAM vaulting, custom policy DSL, per-field ABAC, or multi-region IdP
failover. Existing break-glass and privileged-governance features may remain,
but this work does not expand them.

## 7. Completion gates

IAM minimum operational readiness is complete only when all gates pass on one
candidate SHA:

| Gate | Required evidence                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------- |
| G1   | Active tenant console completes real OIDC login and session read.                                    |
| G2   | No active tenant-console path sends demo actor/bootstrap identity headers.                           |
| G3   | Browser mutations pass same-origin/CSRF checks; cross-site or missing-token mutations fail.          |
| G4   | Logout revokes the backend session; role downgrade and suspension invalidate prior sessions.         |
| G5   | Full dynamic controller inventory reports 56/56 controllers scanned and zero unclassified routes.    |
| G6   | Representative realm, scope, object-boundary, cross-tenant, and unauthenticated negative tests pass. |
| G7   | Strict startup rejects mock/missing OIDC provider configuration.                                     |
| G8   | Exact-SHA strict cloud staging login, authorization, revocation, and audit evidence is recorded.     |

Until G1-G8 pass, documentation must say **implemented baseline, operational
IAM closure pending**, not **IAM complete**.
