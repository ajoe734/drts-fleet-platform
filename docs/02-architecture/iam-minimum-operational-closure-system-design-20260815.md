# IAM Minimum Operational Closure System Design (2026-08-15)

**Status:** implementation-ready
**Baseline:** `origin/dev@85d76c539e2f25bc97dcf1ec18a44aea4f0fc389`
**GAP authority:** `docs/02-architecture/iam-minimum-operational-readiness-gap-20260815.md`
**Execution authority:** `docs/03-runbooks/iam-minimum-operational-closure-execution-tasks-20260815.md`

## 1. Goal and design constraints

This design closes only the IAM controls required to run the current Stage 1
system safely:

- a real human can sign in to the active tenant console;
- the browser never owns bootstrap identity headers or a readable bearer token;
- strict deployments cannot fall back to synthetic OIDC exchange;
- every API controller route has an explicit public or authenticated policy;
- account status, role changes, logout, and session revocation take effect;
- one strict staging candidate proves the complete path.

The design preserves the merged identity repository, session model, role
catalogue, resource-boundary guard, audit service, and default-deny guard. It
does not introduce a second identity database, a new policy engine, or password
authentication.

## 2. Canonical topology

```text
Browser
  -> tenant-console-web BFF /api/auth/tenant/login
  -> API /api/auth/tenant/login
  -> OIDC provider authorize endpoint (Authorization Code + PKCE)
  -> tenant-console-web BFF /api/auth/tenant/callback
  -> API /api/auth/tenant/callback-session
  -> HttpOnly tenant-console session cookie
  -> tenant-console BFF/proxy attaches Authorization: Bearer <session>
  -> API strict guard resolves principal, tenant, roles, scopes, and object boundary
```

The active application is `apps/tenant-console-web`. The retired
`tenant-portal-web` route may be used as migration reference only; it is not the
deployment target or acceptance surface.

## 3. Tenant-console authentication boundary

### 3.1 BFF routes

Add a tenant-console auth catch-all or equivalent explicit handlers:

| BFF route                   | Method | Behaviour                                                                                                                                                                  |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/tenant/login`    | GET    | Validate local return path, call API login with the exact callback URL and optional tenant hint, persist short-lived state envelope, redirect to IdP.                      |
| `/api/auth/tenant/callback` | GET    | Require code/state/state-cookie, call API callback-session with state token, create the managed session cookie, clear state, redirect only to a same-origin relative path. |
| `/api/auth/session`         | GET    | Read HttpOnly session, call API `/api/auth/session`, return 401 and clear cookie if inactive/revoked/expired.                                                              |
| `/api/auth/logout`          | POST   | Pass bearer to API `/api/auth/logout`, clear session/state/CSRF cookies even when upstream is already inactive.                                                            |
| `/api/auth/logout-all`      | POST   | Pass bearer to API `/api/auth/logout-all`, then clear local cookies.                                                                                                       |

### 3.2 Cookie contract

| Cookie                   | Readable by JS | Attributes                                                             | Lifetime                                     |
| ------------------------ | -------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| `drts_tenant_session`    | no             | `HttpOnly`, `Secure` in HTTPS/strict, `SameSite=Lax`, `Path=/`         | no longer than backend access/session expiry |
| `drts_tenant_oidc_state` | no             | `HttpOnly`, `Secure` in HTTPS/strict, `SameSite=Lax`, `Path=/api/auth` | 10 minutes maximum                           |
| `drts_tenant_csrf`       | yes            | `Secure` in HTTPS/strict, `SameSite=Lax`, `Path=/`                     | session lifetime                             |

The OIDC state envelope contains only the API-issued state token and a sanitized
relative return path. It must be integrity-protected with a dedicated BFF
secret or equivalent authenticated encryption. No access token, refresh token,
IdP token, or user profile is stored in browser-readable storage.

### 3.3 API request propagation

All active tenant-console API paths must converge on one authenticated transport:

1. Server components, server actions, and local Next route handlers read the
   HttpOnly cookie on the server and construct an `ApiClient` with
   `Authorization: Bearer ...`.
2. Browser requests use the same-origin `/control-plane-proxy`. The proxy reads
   the HttpOnly session and sends `Authorization: Bearer ...` upstream.
3. The proxy continues to drop inbound `x-actor-*`, `x-realm`, `x-roles`,
   `x-scopes`, internal-key, cookie, and serverless-auth headers. It must not add
   `x-realm: tenant`; realm and tenant come from the verified session.
4. `createTenantClient` remains only for explicitly non-strict local fixtures.
   Production active-app code must not import it or export demo actor IDs.

### 3.4 CSRF and request-origin control

For `POST`, `PUT`, `PATCH`, and `DELETE` through tenant-console BFF/proxy:

- require a same-origin `Origin` (or validated `Referer` only when Origin is not
  supplied by the user agent);
- require `x-csrf-token` to equal the CSRF cookie using constant-time comparison;
- never forward the CSRF cookie/token to the API;
- reject before calling upstream with a stable 403 code;
- keep CORS disabled for credentialed cross-origin browser use.

GET and HEAD remain non-mutating. Any existing GET with side effects must be
fixed rather than exempted.

### 3.5 Page protection and failure states

Tenant-console operational routes require an active session. Middleware may do
the cheap cookie-presence redirect, but the API session endpoint remains the
authority. The application must render or redirect consistently for:

- unauthenticated or expired session;
- suspended/inactive principal;
- missing tenant membership;
- insufficient role/scope;
- upstream unavailable.

It must not silently substitute `tenant-demo-001`, `demo-tenant-user`, fixture
rows, or an internal service identity for a failed human identity.

## 4. OIDC strict-mode configuration

### 4.1 Canonical provider settings

The generic PKCE callback-session path is the canonical browser login path.
Strict staging/production requires:

| Variable                      | Strict requirement                                                             |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `OIDC_ISSUER`                 | absolute HTTPS URL; no localhost or placeholder host                           |
| `OIDC_CLIENT_ID`              | non-empty concrete client ID                                                   |
| `OIDC_CLIENT_SECRET`          | secret-managed when provider/client type requires it                           |
| `OIDC_TOKEN_ENDPOINT`         | absolute HTTPS URL, or resolved from trusted issuer discovery before readiness |
| `OIDC_AUTHORIZATION_ENDPOINT` | absolute HTTPS URL, or trusted issuer discovery                                |
| `OIDC_MOCK_MODE`              | absent or exactly `false`; `true` is a startup error                           |
| BFF state/cookie secret       | secret-managed and at least 32 random bytes                                    |
| Callback allowlist            | exact tenant-console staging/production callback origins                       |

The existing `TENANT_OIDC_*` direct ID-token exchange may remain as a
compatibility endpoint, but active tenant-console code must use the generic PKCE
callback-session flow. Startup validation must not allow one configured path to
hide an invalid active path.

### 4.2 Fail-closed rules

- Synthetic authorization codes are allowed only when environment detection is
  local/test **and** `OIDC_MOCK_MODE=true` was explicitly set.
- Missing token endpoint/provider metadata in strict mode is a startup/readiness
  failure, never a switch to synthetic exchange.
- TLS certificate, issuer, audience, nonce, state, PKCE verifier, token expiry,
  or subject-membership failure returns a stable auth error and creates no
  session.
- Provider HTTP timeouts and 5xx responses return unavailable/denied; they do
  not retry with a mock code path.
- Secrets and authorization codes are redacted from logs and audit summaries.

## 5. Route-classification design

### 5.1 Classification invariant

Every method in every `*.controller.ts` must satisfy exactly one visible rule:

1. `@OpenRoute()` for intentionally unauthenticated endpoints; or
2. `@RequireRealms(...)` and, when a meaningful catalogue scope exists,
   `@RequireScopes(...)`; or
3. a deterministic entry in `resolveRouteAuthPolicy`.

Controller-local decorators are preferred for the 71-route closure because
they keep four implementation branches independent. Central policy is used only
where one existing route family already depends on it, such as notifications.

An authenticated route with an empty scope list is acceptable only for a shared
utility called by several realms when no existing scope accurately represents
it. The worker must still declare allowed realms and add negative realm tests.
Do not create a misleading scope merely to avoid an empty list.

### 5.2 Policy matrix: admin and tenant operations

| Route family                    | Allowed realms                         | Required scope                                | Additional boundary                                                                                   |
| ------------------------------- | -------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /notifications/read`      | system, platform, ops, driver          | `notifications:write`                         | actor-owned notification IDs only; extend catalogue realm only if required by verified Driver App use |
| Settlement invoice/matrix reads | system, platform, tenant, ops, partner | `billing:read`                                | tenant/partner/object constraints from identity                                                       |
| Driver fee plan publish         | system, platform, tenant, ops          | `billing:write`                               | tenant boundary and existing publish validation                                                       |
| Reconciliation issue reads      | system, platform, tenant, ops          | `billing:read`                                | tenant/object boundary                                                                                |
| Reconciliation issue mutations  | system, platform, tenant, ops          | `billing:write`                               | tenant/object boundary plus existing audit                                                            |
| Admin feature flag reads        | system, platform                       | `foundation:read`                             | no tenant-selected authority from request headers                                                     |
| Admin feature flag mutations    | system, platform                       | `foundation:write`                            | existing step-up/audit remains mandatory                                                              |
| Tenant governance summary       | system, platform                       | `tenant:sla:read`                             | requested tenant must be within platform authority                                                    |
| Product rule catalog            | system, platform, tenant, ops          | no scope; authenticated shared catalogue read | no secret/config material in response                                                                 |

### 5.3 Policy matrix: driver operations

| Route family                  | Allowed realms                | Required scope   | Additional boundary                                                     |
| ----------------------------- | ----------------------------- | ---------------- | ----------------------------------------------------------------------- |
| Driver settings list/read     | system, platform, ops, driver | `driver:read`    | driver can read self only; ops/platform need assignment/tenant boundary |
| Driver settings patch         | system, driver                | `driver:write`   | self only; never trust body/path driver ID without identity comparison  |
| Driver task views             | system, driver                | `dispatch:read`  | assigned driver only                                                    |
| Forwarded order accept/reject | system, driver                | `dispatch:write` | assigned task and current transition only                               |
| Shift clock-in/out/abandon    | system, driver                | `driver:write`   | self and assigned shift only                                            |
| Shift/attendance reads        | system, platform, ops, driver | `driver:read`    | driver self; operations constrained by tenant/assignment                |

### 5.4 Policy matrix: foundation and map

| Route family                                     | Allowed realms                                 | Required scope                         | Additional boundary                                                         |
| ------------------------------------------------ | ---------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| Foundation manifest                              | system, platform, ops                          | `foundation:read`                      | response must not expose secrets                                            |
| Geo health/search/resolve/reverse/route          | system, platform, tenant, ops, driver, partner | no scope; authenticated shared utility | existing input limits, provider allowlist, throttling, and secret redaction |
| Service-area definitions/geojson/evaluate        | system, platform, tenant, ops, driver          | no scope; authenticated shared utility | reads/evaluation only; no lifecycle mutation                                |
| Service-area admin reads                         | system, platform, ops                          | `foundation:read`                      | admin control plane only                                                    |
| Service-area create/update/review/publish/retire | system, platform, ops                          | `foundation:write`                     | object ID, transition, step-up where already required, and audit            |

No geo or service-area endpoint becomes public merely because a map page needs
it. Browser pages receive them through their authenticated BFF/proxy.

### 5.5 Policy matrix: sandbox and Tesla integrations

| Route family                                                          | Allowed realms        | Required scope                                | Additional boundary                                           |
| --------------------------------------------------------------------- | --------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Sandbox evaluate/read                                                 | system, platform, ops | `sandbox.compliance.read`                     | tenant/object boundary                                        |
| Sandbox disclosure/catalog/manual release mutations                   | system, platform, ops | `sandbox.compliance.manage`                   | existing approval, step-up, and audit controls                |
| Tesla regions                                                         | system, ops, driver   | no scope; authenticated integration bootstrap | no credentials in response                                    |
| Tesla OAuth, bind, pairing, telemetry configure, commands             | system, ops, driver   | `owned:write`                                 | bound driver/vehicle/object checks; tokens remain server-side |
| Tesla bindings, pairing status, telemetry, projection, command status | system, ops, driver   | `owned:read`                                  | bound driver/vehicle/object checks                            |

`public-sample` in a route name is not sufficient evidence for `@OpenRoute()`.
If product authority requires public access, that exception needs an explicit
response-redaction contract, throttle, abuse test, and documented rationale.

## 6. Full-inventory regression gate

Replace the fixed eight-controller allowlist with recursive discovery of all
`apps/api/src/**/*.controller.ts` files. The test must:

- fail if no controllers or fewer than the checked-in baseline are discovered;
- parse class and method decorators;
- resolve central policies using the normalized route and HTTP method;
- report controller, method, and route for every uncovered entry;
- assert zero uncovered routes;
- assert that every explicit scope exists in the IAM catalogue and permits each
  declared realm;
- retain representative runtime negative tests, because AST classification
  alone does not prove object ownership.

The count is diagnostic, not permanently hard-coded to 56. New controllers are
included automatically and must be classified in the same PR that adds them.

## 7. Session and account-security behaviour

Existing account lifecycle remains authoritative. The closure tests must prove:

- invited users cannot log in until invitation completion activates membership;
- suspended/inactive users cannot create a new session;
- suspending a user or changing its role invalidates prior sessions;
- tenant admins cannot change their own role/status or remove the final active
  tenant administrator;
- tenant admins can list/revoke only sessions in their tenant;
- self-service session revoke cannot target another principal;
- logout and logout-all revoke backend state before local cookie cleanup;
- cross-tenant IDs return bounded 404/403 without existence leakage;
- successful and denied administrative changes create redacted audit records.

No password policy is added because this system delegates human authentication
to OIDC and does not store local passwords.

## 8. Deployment and evidence design

The final candidate is deployed once to a strict staging environment with:

- `NODE_ENV=production` and `DRTS_ENV=staging`;
- strict auth/internal-key settings enabled;
- real OIDC provider endpoints and secret-mounted credentials;
- tenant-console callback origin in an exact allowlist;
- no demo actor or mock OIDC environment values;
- one seeded tenant admin, one lower-role user, one suspended user, and a second
  tenant for negative boundary tests.

Required exact-SHA evidence:

1. startup rejects missing endpoint and mock mode in a separate negative job;
2. tenant admin login, session read, one authorized read, and one authorized
   mutation succeed;
3. insufficient role, cross-tenant access, and unauthenticated access fail;
4. logout invalidates the session; role downgrade and suspension invalidate an
   already-issued session;
5. full route inventory reports zero unclassified routes;
6. logs/audit contain actor/action/result but no token, code, cookie, or secret;
7. deploy SHA, API revision, tenant-console revision, CI URL, and evidence URL
   all identify the same candidate.

## 9. Implementation boundaries for parallel work

To reduce merge conflicts:

- tenant auth owns only `apps/tenant-console-web` and its focused tests;
- strict OIDC owns auth startup config and PKCE service/tests;
- four route workers own disjoint controller sets and focused tests;
- only the admin route worker may adjust notifications catalogue/policy;
- route verification owns the dynamic inventory test after route workers merge;
- auth E2E owns cross-app test harnesses after tenant auth and OIDC merge;
- release owns staging workflow/config and UAT evidence after both verification
  tracks pass.

Workers must not broaden their artifact set merely to make a test pass. Any
unavoidable shared-file change is handed to the supervisor for ordered
integration rather than copied independently into multiple branches.

## 10. Acceptance definition

The design is implemented when GAP gates G1-G8 pass on one strict staging SHA,
the 70-test baseline remains green, all 71 routes are explicitly classified,
and active tenant-console source contains no operational demo identity path.
