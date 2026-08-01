# API Authentication Route Inventory & Policy Catalog

Status: `canonical auth route inventory`  
Date: 2026-08-01  
Task Reference: `IAM-P0-003`  
Hardening Plan: `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md` §5.1 (IAM-RISK-003)

---

## 1. Governance & Enforced Default-Deny Policy

1. **Global Default-Deny Security Guard (`BootstrapAuthGuard`)**:
   - Every incoming HTTP request to `apps/api` must be classified.
   - If a route is **not** explicitly marked with `@OpenRoute()` **and** no matching policy is resolved in `resolveRouteAuthPolicy()` (nor decorated with `@RequireScopes()` / `@RequireRealms()`), `BootstrapAuthGuard` fails closed by rejecting the request with `401 UNCLASSIFIED_ROUTE_DENIED`.
   - Anonymous access is **forbidden by default** across all unclassified endpoints.

2. **Automated CI Inventory Validation**:
   - `apps/api/tests/unit/auth-route-inventory.test.ts` scans all controller files (`apps/api/src/**/*.controller.ts`) at test time.
   - Any newly introduced controller route that is neither marked with `@OpenRoute()`, decorated with auth metadata, nor mapped in `auth.policy.ts` causes the CI suite to **fail immediately**.

3. **Open Route Exposure & Rate Limits**:
   - `apps/api/tests/unit/open-routes-exposure.test.ts` enforces that all public routes carry `@OpenRoute()` and explicit throttle controls, ensuring no sensitive secrets (such as JWT secrets, database credentials, or unmasked user data) are exposed on open endpoints.

---

## 2. API Route Classification Matrix

Below is the complete classification inventory of all API route groups across all controllers in `apps/api/src`:

| Route Path Pattern | Method(s) | Realm(s) | Required Scope(s) / Policy | Description / Classification |
|---|---|---|---|---|
| `/health` | `GET` | Open (Public) | None (`@OpenRoute()`) | System health probe & status readout |
| `/auth/token` | `POST` | Open / Internal Key | Internal Key validated | Bootstrap bearer token issuance |
| `/auth/tenant/bootstrap-session` | `POST` | Open (Public) | Invited user check | Tenant portal session issuance |
| `/auth/partner/bootstrap-session` | `POST` | Open (Public) | Partner key check | Partner portal session issuance |
| `/auth/driver/device/register` | `POST` | Open (Public) | Device binding check | Driver device registration session |
| `/auth/driver/device/refresh` | `POST` | Open (Public) | Refresh family check | Driver device session refresh |
| `/auth/driver/device/revoke` | `POST` | `platform, ops, driver` | None (Auth Required) | Authenticated driver device binding revoke |
| `/identity/context` | `GET` | Open (Public) | None (`@OpenRoute()`) | Caller identity context readout |
| `/identity/*` | Any | `platform, tenant` | `tenant:read / write` | Identity and account governance |
| `/tenant/roles` | `GET` | Open (Public) | None (`@OpenRoute()`) | Public tenant role catalog readout |
| `/tenant/webhooks` | Any | `platform, tenant` | `tenant:webhooks:read / write` | Tenant webhook administration |
| `/tenant/sla` | Any | `platform, tenant` | `tenant:sla:read / write` | Tenant SLA profile management |
| `/tenant/billing`, `/tenant/invoices` | Any | `platform, tenant` | `tenant:billing:read / write` | Tenant billing & invoice access |
| `/tenant/reports/*` | Any | `platform, tenant` | `reports:read / write` | Tenant reporting and artifact access |
| `/tenant/audit` | `GET` | `platform, tenant` | `audit:read` | Tenant audit feed access |
| `/tenant/*` | Any | `platform, tenant` | `tenant:read / write` | Tenant administration & profile access |
| `/partner/entries`, `/partner/entries/:slug` | `GET` | Open (Public) | None (`@OpenRoute()`) | Partner channel entry manifest lookup |
| `/partner/ingress/*` | `POST` | Open (Public) | Entry & handoff validation | Partner referral & embed handoff flows |
| `/partner/eligibility/verify` | `POST` | `partner` | `partner:eligibility:write` | Partner eligibility verification |
| `/partner/eligibility/*` | `GET` | `partner` | `partner:eligibility:read` | Partner eligibility lookup |
| `/partner/bookings`, `/partner/orders/*` | `GET, POST` | `partner` | `partner:book` | Partner-scoped booking & order access |
| `/partner/referral/*` | Any | `partner` | `billing:read` | Referral partner self-service portal |
| `/fleet-partner/*` | Any | `partner` | `billing:read` | Fleet partner portal self-service |
| `/admin/fleet-partners` | Any | `platform, ops` | `foundation:read / write` | Fleet partner administration |
| `/admin/fleet-partners/*` | Any | `platform, ops` | `foundation:read / write` (or `billing:*`) | Fleet partner billing & details |
| `/admin/drivers/*/fleet-affiliations` | Any | `platform, ops` | `foundation:read / write` | Driver fleet affiliation management |
| `/admin/vehicle-eligibility-matrix` | `GET, PUT` | `platform, ops` | None (Auth Required) | Vehicle eligibility matrix configuration |
| `/admin/service-products/*` | Any | `platform, ops` | None (Auth Required) | Service product catalog configuration |
| `/admin/flags/*`, `/feature-flags/*` | Any | `platform, ops` | `foundation:read / write` | Feature flag administration & overrides |
| `/admin/supply-review/*` | Any | `platform, ops` | `foundation:read / write` | Supply review submission governance |
| `/admin/tenant-governance/*` | Any | `platform, ops` | `foundation:read / write` | Tenant governance administration |
| `/platform-admin/multi-taxi-trip-records/export-jobs` | Any | `platform` | `multi_taxi_records:export` | Multi-taxi operational record export |
| `/platform-admin/*` | Any | `platform` | `foundation:read / write` | Platform admin master-data management |
| `/driver/profile/*` | Any | `driver` | `driver:read / write` | Driver self-service profile management |
| `/driver/location-heartbeats/batch`, `/driver/tracking-status` | Any | `platform, ops, driver` | None (Auth Required) | Driver location heartbeat & telemetry |
| `/ops/drivers/*/tracking-status` | `GET` | `platform, ops` | None (Auth Required) | Ops driver tracking status view |
| `/driver/tasks/*`, `/driver/task-events` | Any | `ops, driver` | `driver:read / write` | Driver task access & lifecycle |
| `/driver/task-views/*`, `/driver/forwarded-orders/*` | Any | `ops, driver` | `driver:read / write` | Driver task views & forwarded orders |
| `/driver/sos-events`, `/driver/sos-events/*` | Any | `driver` | `incident:write` | Driver SOS event & attachment submission |
| `/ops/driver-sos/*` | Any | `ops` | `incident:read / write` | Ops driver SOS alert latency & render |
| `/driver-settings/*` | Any | `platform, ops, driver` | `driver:read / write` | Driver preferences & settings |
| `/call-center/*`, `/callcenter/*` | Any | `ops` | `callcenter:read / write` | Callcenter phone-order & ride management |
| `/complaints`, `/complaints/*` | Any | `ops` | `complaints:read / write` | Complaint case management |
| `/incidents`, `/incidents/*` | Any | `platform, ops` | `incident:read / write` | Incident case & escalation management |
| `/accident-cases`, `/accident-cases/*` | Any | `platform, ops` | `incident:read / write` | Accident investigation & takeover facts |
| `/maintenance`, `/maintenance/*` | Any | `platform, ops` | `maintenance:read / write` | Maintenance case management |
| `/safety-operator/*` | Any | `ops` | `incident:read / write` | Safety operator shift & checklist access |
| `/vehicle-evidence/*` | Any | `platform, ops` | `incident:read / write` | Vehicle evidence recorder & bookmarking |
| `/orders/*`, `/dispatch/*`, `/passenger/orders/*` | Any | `platform, ops, tenant` | `dispatch:*` / `owned:*` | Owned mobility & dispatch queue operations |
| `/ops/dispatch-events` | `GET` | `ops` | `dispatch:read` | Ops dispatch event stream (SSE) |
| `/multi-taxi/rides`, `/multi-taxi/*`, `/passenger-rides/*` | Any | `platform, ops, tenant, partner` | `partner:book` | Multi-taxi passenger ride & rating status |
| `/roc`, `/roc/*` | Any | `ops` | None (Auth Required) | ROC operational models & actions |
| `/regulatory`, `/regulatory/*` | Any | `platform, ops` | `regulatory:read / write` | Regulatory reporting & notifications |
| `/regulatory-registry`, `/regulatory-registry/*` | Any | `platform, ops` | `regulatory:read / write` | Regulatory registry management |
| `/audit`, `/audit/*` | Any | `platform, ops` | `audit:read` | Audit log listing & evidence governance |
| `/notifications`, `/notifications/*` | Any | `platform, ops` | `notifications:read / write` | Notification inbox & read status |
| `/security-events`, `/security-events/*` | Any | `platform` | `audit:read` | Security event feed & matrix |
| `/driver-fee-plans`, `/reimbursements`, `/settlement/*`, `/payment-exceptions/*` | Any | `platform, ops` | `billing:read / write` | Billing, settlement, & payment exceptions |
| `/platform-earnings`, `/platform-earnings/*` | Any | `platform, ops` | `billing:read / write` | Platform earnings & financial metrics |
| `/reports/*`, `/filing-packages/*` | Any | `platform, ops` | `reports:read / write` | Reporting, filing, & export jobs |
| `/reporting-filing/*` | Any | `platform, ops` | `reports:read / write` | Reporting & filing package generation |
| `/service-area/*` | Any | `platform, ops` | `foundation:read / write` | Service area & stop policy administration |
| `/product-rules/*`, `/fare-anomaly/*` | Any | `platform, ops` | `foundation:read / write` | Product rules & fare anomaly monitoring |
| `/sandbox/*` | Any | `platform, ops` | `foundation:read / write` | Sandbox dispatch gate & compliance |
| `/assistant/*` | Any | `platform, ops` | `assistant:read / write` | AI Assistant tools & conversation flows |
| `/certificate-support/*` | Any | `platform, ops` | `regulatory:read / write` | Certificate support & compliance |
| `/feature-flags/*` | Any | `platform, ops` | `foundation:read / write` | Feature flag administration |
| `/geo/*` | Any | `platform, ops, tenant, driver, partner` | `foundation:read / write` | Geocoding & map service management |
| `/observability/*` | Any | `platform, ops` | `foundation:read / write` | Operational observability & telemetry |
| `/owned-mobility/*` | Any | `platform, ops, tenant` | `owned:read / write` | Owned mobility fleet operations |
| `/platform-presence/*` | Any | `platform, ops` | `foundation:read / write` | Platform presence & worker status |
| `/shift-attendance/*` | Any | `ops, driver` | `driver:read / write` | Driver shift attendance & clock-in |
| `/tesla-integration/*` | Any | `platform, ops` | `foundation:read / write` | Tesla integration vehicle binding & commands |
| `/forwarder/*` | Any | `ops, driver` | `forwarder:read / write` | Forwarder relay & task views |
| `/foundation/*`, `/system/foundation/*` | Any | `platform, ops` | `foundation:read / write` | Foundation manifest & status |

---

## 3. Verification & Compliance Evidence

- **Unit Tests**:
  - `apps/api/tests/unit/auth-route-inventory.test.ts` (Validates 100% of controller routes are classified & fail-closed mechanism)
  - `apps/api/tests/unit/open-routes-exposure.test.ts` (Validates open route metadata & data exposure safety)
  - `apps/api/tests/unit/auth-bootstrap.test.ts` (78 tests verifying bootstrap guard, realm/scope matrix, JWT bearer fast-path, and internal key middleware)
