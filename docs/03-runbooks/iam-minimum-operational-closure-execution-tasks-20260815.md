# IAM Minimum Operational Closure Execution Tasks (2026-08-15)

**Status:** ready for supervisor registration and parallel dispatch
**Baseline:** `origin/dev@85d76c539e2f25bc97dcf1ec18a44aea4f0fc389`
**GAP:** `docs/02-architecture/iam-minimum-operational-readiness-gap-20260815.md`
**SD:** `docs/02-architecture/iam-minimum-operational-closure-system-design-20260815.md`
**Registration:** `tools/task-dispatch/dispatch-iam-minimum-operational-closure-20260815.py`

## 1. Dispatch rules

1. The supervisor, not the planning agent, creates worker branches and starts
   auto workers.
2. Every worker starts from current `origin/dev`, reads the GAP and SD, and
   records the exact base SHA.
3. Owner and reviewer are different lanes. Owner hints may be health-reassigned
   by the supervisor without changing task scope.
4. Workers edit only listed artifacts. Shared-file expansion requires a
   supervisor note before editing.
5. Each implementation task produces a normal PR and candidate SHA. Task status
   becomes done only after independent review, same-SHA CI, merge, and required
   acceptance evidence.
6. Existing strict default-deny must not be weakened. `@OpenRoute()` requires an
   explicit public rationale and abuse-control test.
7. No task may claim cloud staging evidence from local harnesses or non-strict
   Dev.

## 2. Dependency graph

```text
Wave A: six independent roots

IAM-OP-AUTH-001  ----+
                      +--> IAM-OP-AUTH-E2E-001 --+
IAM-OP-OIDC-001  ----+                           |
                                                  +--> IAM-OP-REL-001
IAM-OP-ROUTE-ADM-001 --+                         |
IAM-OP-ROUTE-DRV-001 --+                         |
IAM-OP-ROUTE-MAP-001 --+--> IAM-OP-ROUTE-VERIFY-001
IAM-OP-ROUTE-EXT-001 --+
```

Maximum initial concurrency is six. Wave B has two independent tasks. Only the
final exact-SHA strict staging task joins the two tracks.

## 3. Wave A root tasks

### IAM-OP-AUTH-001 - Cut active tenant console to managed OIDC sessions

**Priority:** P0
**Owner hint:** Claude2
**Reviewer hint:** Codex2
**Dependencies:** none
**Workstream:** tenant-auth

**Execution prompt**

Implement SD sections 2 and 3 in the active `tenant-console-web`. Add the
tenant login/callback/session/logout/logout-all BFF boundary, managed cookies,
same-origin plus CSRF protection, and authenticated API transport. Remove all
active operational use of `DEMO_ACTOR_ID`, demo tenant fallback, direct
`x-actor-*`/`x-realm` identity headers, and `createTenantClient`. The proxy must
derive Authorization from the HttpOnly session and continue to block caller
identity/internal headers. Preserve existing UI design and data contracts.
Do not edit API OIDC exchange logic; that belongs to `IAM-OP-OIDC-001`.

**Owned artifacts**

- `apps/tenant-console-web/app/api/auth/`
- `apps/tenant-console-web/app/control-plane-proxy/`
- `apps/tenant-console-web/lib/api-client.ts`
- `apps/tenant-console-web/lib/auth/`
- `apps/tenant-console-web/middleware.ts`
- tenant-console call sites that currently import demo identity constants
- `apps/tenant-console-web/tests/`
- focused BFF/proxy tests under `tests/`

**Acceptance**

- Login redirects through API and callback creates only HttpOnly managed session state.
- Session endpoint reports the verified tenant principal and tenant boundary.
- Server and browser API calls attach bearer auth without bootstrap identity headers.
- Mutating proxy calls reject missing/wrong origin or CSRF token before upstream fetch.
- Logout and logout-all call backend revocation then clear local cookies.
- Revoked/expired/suspended sessions cannot continue and never fall back to demo identity.
- `rg` finds no operational `DEMO_ACTOR_ID`, `demo-tenant-user`, or `createTenantClient` use in the active tenant console.
- Tenant-console unit, typecheck, build, and focused browser tests pass.

### IAM-OP-OIDC-001 - Make generic OIDC PKCE fail-closed in strict mode

**Priority:** P0
**Owner hint:** Codex2
**Reviewer hint:** Claude2
**Dependencies:** none
**Workstream:** oidc-runtime

**Execution prompt**

Implement SD section 4. Extend strict startup validation for the generic PKCE
provider configuration and prevent `performOidcCodeExchange` from entering the
synthetic branch unless the environment is local/test and mock mode was
explicitly enabled. Keep existing tenant and partner callback contracts stable.
Do not edit tenant-console code.

**Owned artifacts**

- `apps/api/src/config/auth-startup-config.ts`
- `apps/api/src/modules/auth/oidc-pkce.service.ts`
- auth environment helpers only when required
- `tests/unit/auth-startup-config.test.ts`
- `tests/integration/auth-startup-config.integration.test.ts`
- focused OIDC PKCE tests
- deployment environment documentation for OIDC variables, not workflow rollout

**Acceptance**

- Strict startup rejects missing issuer/client/provider endpoint configuration.
- Strict startup rejects `OIDC_MOCK_MODE=true` and placeholder/insecure provider URLs.
- Local/test synthetic codes work only with explicit mock enablement.
- Missing provider config never selects synthetic exchange in strict mode.
- Provider timeout, invalid state/nonce/PKCE, wrong issuer/audience, and suspended membership create no session.
- Logs and errors contain no code, token, verifier, cookie, or client secret.
- Existing 70-test IAM baseline and new strict OIDC tests pass.

### IAM-OP-ROUTE-ADM-001 - Classify admin, billing, notification, and product routes

**Priority:** P0
**Owner hint:** Gemini
**Reviewer hint:** Codex
**Dependencies:** none
**Workstream:** route-admin

**Execution prompt**

Classify the 17 admin/tenant-operation routes in GAP section 5 using SD section
5.2. Prefer controller decorators. Preserve central notification policy and
extend its driver realm/catalogue only when the verified Driver App caller
requires it. Add runtime negative tests for realm/scope and tenant/object
boundaries. Do not edit the global route-inventory test; that belongs to the
verification task.

**Owned artifacts**

- `apps/api/src/modules/audit-notification/notifications.controller.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
- `apps/api/src/modules/feature-flags/feature-flags.controller.ts`
- `apps/api/src/modules/platform-admin/tenant-governance.controller.ts`
- `apps/api/src/modules/product-rule/product-rule.controller.ts`
- `apps/api/src/common/auth/auth.policy.ts` only for notification-family completion
- `packages/contracts/src/iam-policy-catalog.ts` only for notification driver-realm alignment
- `tests/security/iam-route-admin-negative.test.ts`

**Acceptance**

- All 17 listed routes have explicit policy and continue valid documented callers.
- Unauthenticated, wrong-realm, missing-scope, and cross-boundary attempts fail.
- Feature flag mutations remain platform-only with step-up/audit protections.
- Billing writes cannot escape caller tenant/object boundaries.
- Driver notification acknowledgement is actor-owned and cannot mark another actor's notification.
- No route is made public to avoid choosing a policy.
- Focused controller, policy, contract, and negative tests pass.

### IAM-OP-ROUTE-DRV-001 - Classify driver settings, forwarded tasks, and shifts

**Priority:** P0
**Owner hint:** Gemini2
**Reviewer hint:** Claude
**Dependencies:** none
**Workstream:** route-driver

**Execution prompt**

Classify the 13 driver-operation routes in GAP section 5 using SD section 5.3.
Enforce self/assigned-driver and assigned-task boundaries in service/controller
entry points rather than trusting path/body driver IDs. Do not edit central
policy catalogue or the global route-inventory test.

**Owned artifacts**

- `apps/api/src/modules/driver-settings/driver-settings.controller.ts`
- driver-settings boundary service code only when a missing check is proven
- `apps/api/src/modules/forwarder/forwarder.controller.ts`
- forwarder boundary service code only when a missing check is proven
- `apps/api/src/modules/shift-attendance/shift-attendance.controller.ts`
- shift-attendance boundary service code only when a missing check is proven
- `tests/security/iam-route-driver-negative.test.ts`

**Acceptance**

- All 13 listed routes have explicit realm/scope policy.
- Driver reads/settings/shifts are self-bound; task actions are assignment-bound.
- Ops/platform read access is bounded and cannot mutate driver self state unless explicitly authorized by existing contract.
- Wrong driver ID, wrong task assignment, wrong realm, missing scope, and unauthenticated attempts fail without existence leakage.
- Existing driver flow tests and new negative tests pass.

### IAM-OP-ROUTE-MAP-001 - Classify foundation, geo, and service-area routes

**Priority:** P0
**Owner hint:** Claude
**Reviewer hint:** Codex2
**Dependencies:** none
**Workstream:** route-map

**Execution prompt**

Classify the 20 foundation/map routes in GAP section 5 using SD section 5.4.
Shared geo and service-area reads may use explicit authenticated realm policy
without an invented scope. Admin lifecycle routes require foundation write
authority and existing transition/audit rules. Keep all map endpoints
authenticated; do not expose provider configuration or secret presence.

**Owned artifacts**

- `apps/api/src/modules/foundation/foundation.controller.ts`
- `apps/api/src/modules/geo/geo.controller.ts`
- `apps/api/src/modules/service-area/service-area.controller.ts`
- service-area boundary service code only when a missing object/transition check is proven
- `tests/security/iam-route-map-negative.test.ts`

**Acceptance**

- All 20 listed routes have explicit policy.
- Geo and normal service-area reads work for only the SD-approved authenticated realms.
- Service-area admin reads/writes reject tenant/driver/partner realms.
- Create/update/review/publish/retire enforce object and lifecycle transitions and audit mutations.
- Geo health and errors do not reveal provider credentials or secret values.
- Existing map/geofence tests and new negative tests pass.

### IAM-OP-ROUTE-EXT-001 - Classify sandbox dispatch and Tesla integration routes

**Priority:** P0
**Owner hint:** Codex
**Reviewer hint:** Gemini2
**Dependencies:** none
**Workstream:** route-integrations

**Execution prompt**

Classify the 21 sandbox/Tesla routes in GAP section 5 using SD section 5.5.
Use existing sandbox compliance and owned-mobility scopes. Enforce vehicle and
driver binding before returning telemetry, pairing, command, or token-related
state. Treat `public-sample` as authenticated unless a separate accepted public
contract is produced. Never return or log Tesla OAuth/virtual-key secrets.

**Owned artifacts**

- `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller.ts`
- sandbox boundary service code only when a missing check is proven
- `apps/api/src/modules/tesla-integration/tesla-integration.controller.ts`
- Tesla boundary service code only when a missing binding check is proven
- `tests/security/iam-route-integrations-negative.test.ts`

**Acceptance**

- All 21 listed routes have explicit policy.
- Sandbox reads/manage operations enforce the corresponding compliance scope and realm.
- Tesla mutation/read operations enforce owned write/read and driver/vehicle binding.
- Cross-driver vehicle, wrong realm/scope, unauthenticated, and stale binding attempts fail.
- OAuth tokens, virtual-key material, and provider secrets are absent from responses/logs/audit.
- Existing integration tests and new negative tests pass.

## 4. Wave B verification tasks

### IAM-OP-AUTH-E2E-001 - Prove active tenant login and revocation end to end

**Priority:** P0
**Owner hint:** Gemini2
**Reviewer hint:** Codex
**Dependencies:** `IAM-OP-AUTH-001`, `IAM-OP-OIDC-001`
**Workstream:** auth-acceptance

**Execution prompt**

Build a hermetic production-mode acceptance harness around the active
tenant-console BFF and API. Use a deterministic local OIDC provider/test server,
not the API synthetic-code fallback. Prove login, state/PKCE, session use,
CSRF, logout, logout-all, role downgrade, suspension, and tenant isolation.
Record exact candidate SHAs for both dependencies.

**Owned artifacts**

- `tests/e2e/` IAM tenant-console specifications and harness
- `tests/security/` browser/session negative cases
- focused test configuration/fixtures
- `docs/04-uat/` hermetic evidence packet

**Acceptance**

- Active tenant-console login/callback/session/read/write/logout passes in production mode.
- State replay, wrong nonce/PKCE, missing CSRF, cross-origin mutation, and unauthenticated calls fail.
- Role downgrade, suspension, and backend revoke invalidate an issued browser session.
- Cross-tenant read/write fails without leaking object existence.
- Browser storage contains no bearer, IdP token, code verifier, or secret.
- Evidence is candidate-bound and clearly labelled hermetic, not cloud staging.

### IAM-OP-ROUTE-VERIFY-001 - Enforce full dynamic route inventory and negative matrix

**Priority:** P0
**Owner hint:** Codex2
**Reviewer hint:** Claude
**Dependencies:** `IAM-OP-ROUTE-ADM-001`, `IAM-OP-ROUTE-DRV-001`, `IAM-OP-ROUTE-MAP-001`, `IAM-OP-ROUTE-EXT-001`
**Workstream:** route-acceptance

**Execution prompt**

Replace the fixed route allowlist with recursive all-controller discovery as
specified by SD section 6. Verify zero unclassified methods and validate that
decorator scopes/realms are compatible with the catalogue. Run representative
runtime negative tests for all four route groups. Do not change route policies
to make the inventory pass; return defects to the owning task.

**Owned artifacts**

- `tests/security/iam-route-inventory.test.ts`
- shared inventory helper under `tests/security/` if useful
- `tests/security/iam-auth-negative-matrix.test.ts`
- route-classification contract tests
- `docs/04-uat/` route inventory evidence

**Acceptance**

- Test discovers all current controller files recursively; no hand-maintained controller allowlist remains.
- Current diagnostic evidence reports 56 controllers and zero unclassified routes.
- Adding a temporary unclassified controller method makes the test fail with file/method/route details.
- Unknown scopes and scope/realm catalogue mismatches fail the suite.
- Representative unauthenticated, realm, scope, cross-tenant, cross-driver, and object-boundary negatives pass.
- Focused 70-test IAM baseline remains green.

## 5. Wave C release task

### IAM-OP-REL-001 - Deploy and prove one strict IAM staging candidate

**Priority:** P0
**Owner hint:** Gemini
**Reviewer hint:** Claude
**Dependencies:** `IAM-OP-AUTH-E2E-001`, `IAM-OP-ROUTE-VERIFY-001`
**Workstream:** iam-release

**Execution prompt**

Integrate only independently reviewed IAM-OP candidate commits in dependency
order. Create one exact candidate SHA and deploy it through a normal strict
staging workflow with real/dedicated OIDC provider configuration. Capture GAP
G1-G8 evidence and correct prior IAM documents that overstate full route or
cloud readiness. Do not use non-strict Dev or a local harness as cloud proof.

**Owned artifacts**

- strict staging workflow/configuration under `.github/workflows/` and `operations/`
- staging secret/config references without secret values
- `docs/04-uat/iam-minimum-operational-closure-20260815.md`
- GAP status/evidence table after proof
- stale IAM UAT completion wording directly contradicted by final evidence

**Required acceptance evidence**

- `dev_deploy_run_url` (orchestrator compatibility field; value must be the strict staging deploy run)
- `dev_deploy_sha` (orchestrator compatibility field; same strict staging candidate SHA)
- `operational_acceptance_run_url` (orchestrator compatibility field; value must be the strict IAM acceptance run)
- `operational_acceptance_sha` (orchestrator compatibility field; same strict staging candidate SHA)
- `staging_deploy_run_url`
- `staging_deploy_sha`
- `strict_oidc_login_evidence`
- `route_inventory_evidence`
- `revocation_boundary_evidence`
- `gap_g1_g8_evidence`

**Acceptance**

- Startup-negative job rejects missing provider config and mock mode.
- Exact-SHA strict staging login/read/write/logout passes through active tenant console.
- Role downgrade, suspension, cross-tenant, insufficient-scope, and unauthenticated negatives pass.
- Full inventory reports zero unclassified routes on the same SHA.
- API and tenant-console revisions, CI, deploy, and UAT evidence all identify the same SHA.
- Final docs distinguish implemented, hermetic-tested, cloud-proven, external, and deferred status.

## 6. Supervisor integration order

The supervisor may merge Wave A candidates in any review-complete order because
their primary file ownership is disjoint. The only planned shared-file change is
the notification realm/catalogue adjustment under `IAM-OP-ROUTE-ADM-001`.

After all four route tasks merge, dispatch route verification. After tenant auth
and OIDC merge, dispatch auth E2E. The release task starts only when both Wave B
tasks are done. No worker should wait for unrelated `S1F-DOC-001`; the supervisor
may run that documentation task independently.

## 7. Stop and escalation conditions

Workers stop and report to the supervisor when:

- a required policy contradicts an accepted business contract;
- a shared file outside owned artifacts is unavoidable;
- a real IdP/staging secret or callback registration is unavailable;
- current `origin/dev` changed the same controller/auth files after task start;
- a test exposes a broader data-boundary defect than the listed route group.

A provider quota, external IdP registration, or cloud permission issue is
recorded as external evidence/blocker. An old sandbox error is not reusable
evidence unless it reproduces on the current worker and current base SHA.
