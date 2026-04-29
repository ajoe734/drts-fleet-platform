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
