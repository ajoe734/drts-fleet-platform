# Auth Plane-Separation Matrix

This runbook is the operator-facing summary for `OPX-ID-002`.

It defines the one primary auth path per realm and clarifies which headers are
canonical production trust signals versus local/direct-path fallback helpers.

Decision anchor:

- `docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md`

## Matrix

| Realm      | Plane          | Primary path                                                                                               | Default Bearer header  | Default IAP target | Notes                                                                                         |
| ---------- | -------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `system`   | control-plane  | service-issued Bearer token, with `/api/auth/token` available for explicit token issuance                  | `authorization`        | yes                | `x-drts-internal-key` remains a local/direct-path fallback, not the production trust boundary |
| `platform` | control-plane  | `platform-admin-web` -> `/control-plane-proxy/*` -> inner Bearer into API                                  | `x-drts-authorization` | yes                | outer `authorization` may carry IAP metadata token; app auth is the inner Bearer              |
| `ops`      | control-plane  | `ops-console-web` -> `/control-plane-proxy/*` -> inner Bearer into API                                     | `x-drts-authorization` | yes                | same split as platform-admin                                                                  |
| `tenant`   | business-plane | `/api/auth/tenant/bootstrap-session` issues invited-user Bearer session                                    | `authorization`        | no                 | tenant portal remains application-auth-first                                                  |
| `partner`  | business-plane | `/api/auth/partner/bootstrap-session` exchanges `entrySlug` + API key for Bearer session                   | `authorization`        | no                 | partner ingress stays off the default IAP boundary                                            |
| `driver`   | business-plane | `/api/auth/driver/device/register` and `/api/auth/driver/device/refresh` issue device-bound Bearer session | `authorization`        | no                 | revoked bindings must fail even if the JWT still parses                                       |

## Hard Rules

1. Protected control-plane traffic must not depend on browser-supplied bootstrap actor headers.
2. Tenant, partner, and driver production traffic must not be routed behind the default control-plane IAP boundary.
3. `x-drts-internal-key` is only for local/direct-path fallback or break-glass diagnostics.
4. If a route uses control-plane proxy auth, `x-drts-authorization` is the app-layer Bearer source of truth.
5. The control-plane proxy scope preset for an actor type must mirror
   `AUTH_SCOPE_PRESETS` for that same actor type. See "Scope Grants" below.

## Scope Grants

The control-plane proxy does not just forward a caller; it **mints** the
identity. `issueControlPlaneRequestAuth()`
(`packages/control-plane-auth/src/index.ts`) writes an explicit scope list into
`x-scopes`, or into the `scopes` claim of the inner `x-drts-authorization`
Bearer when `JWT_SECRET` is set.

The API's `deriveScopes()` honours an explicit scope list verbatim and only
falls back to `AUTH_SCOPE_PRESETS`
(`apps/api/src/common/auth/auth.constants.ts`) when none was supplied. So for
every browser request through the proxy the proxy preset **replaces** the API
preset rather than supplementing it.

Consequence for operators and reviewers: granting a control-plane actor type a
new scope in `AUTH_SCOPE_PRESETS` alone changes nothing for the console that
needs it. The surface keeps returning `403 AUTH_SCOPE_DENIED` and keeps writing
`reject_authorization` audit rows, while API-side tests that assert against
`AUTH_SCOPE_PRESETS` stay green. Mirror the grant into
`CONTROL_PLANE_SCOPE_PRESETS` in the same change. Parity is pinned by
`apps/api/tests/unit/ops-driver-tasks-scope.test.ts`.

### Cross-plane read: ops reads driver tasks

`GET /api/driver/tasks` is listed under the business-plane `/api/driver/*`
family, but its route policy deliberately admits the `ops` realm as well as
`driver` — Ops dispatch surfaces (`/sos/board`, `/dashboard`, `/dispatch`) join
driver/vehicle assignment onto dispatch jobs from it. Ops holds `driver:read`
only; the write half (`driver:write`) stays out of the ops grant, so the read is
the boundary. Other `/api/driver/*` routes (profile, SOS submission, device
session) remain driver-realm only.

## Route Families

- Control-plane:
  - `/api/platform-admin/*`
  - `/api/ops/*`
  - `/api/roc/*`
- Business-plane:
  - `/api/auth/tenant/bootstrap-session`
  - `/api/auth/partner/bootstrap-session`
  - `/api/auth/driver/device/register`
  - `/api/auth/driver/device/refresh`
  - `/api/tenant/*`
  - `/api/partner/*`
  - `/api/driver/*`

## Fallback Policy

- Bootstrap actor headers remain acceptable for local development, explicit
  diagnostics, and legacy direct-path helpers where the repo still documents
  them.
- Those headers are not the claimed production trust model for protected
  control-plane flows.
- When both outer `authorization` and inner `x-drts-authorization` are present,
  the API should treat `x-drts-authorization` as the application-layer caller
  identity.
