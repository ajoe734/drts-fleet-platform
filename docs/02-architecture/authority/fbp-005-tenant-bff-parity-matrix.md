# FBP-005 Tenant-Facing BFF Parity Matrix

Status: execution artifact for `FBP-005`  
Owner: Codex  
Reviewer: Qwen  
Updated: 2026-04-15

Primary citations:

- `phase1_prd_detailed_v1.md` §12.2
- `phase1_service_contracts_v1.md` §§3.2, 3.5, 3.11, 3.12, 3.13
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` §§3.2, 3.6, 3.13, 3.15, 3.18
- `docs/02-architecture/authority/rgp-002-authority-map.md` §§2, 4, 5
- `docs/02-architecture/tenant-commute-hub-boundary.md` §§1, 2, 4, 5

## 1. Scope

This matrix freezes the tenant-facing BFF state inside `drts-fleet-platform` before `FBP-006` cuts `tenant-commute-hub` over to the core repo authority.

It answers two questions only:

1. Which tenant portal pages already have a core-repo-backed BFF surface?
2. Which `/api/tenant/*` surfaces are still partial or missing and therefore must stay explicit in the cutover plan?

## 2. Tenant Portal Page -> API Matrix

| Tenant surface           | UI route(s)                                                   | Core repo endpoint(s)                                                                                                                                                                                                                                                              | Status      | Notes                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bookings                 | `/bookings/new`, `/booking-list`, `/booking-list/[bookingId]` | `POST /api/tenant/bookings`, `GET /api/tenant/bookings`, `GET /api/tenant/bookings/:bookingId`, `PUT /api/tenant/bookings/:bookingId`, `POST /api/tenant/bookings/:bookingId/cancel`                                                                                               | implemented | `FBP-005` rewired list/detail/update/cancel away from owned-order routes and onto tenant booking routes.                                    |
| Passengers               | `/passengers`                                                 | `GET /api/tenant/passengers`, `POST /api/tenant/passengers`                                                                                                                                                                                                                        | implemented | Upsert-only write model; delete remains soft/implicit through the same command path.                                                        |
| Addresses                | `/addresses`                                                  | `GET /api/tenant/addresses`, `POST /api/tenant/addresses`                                                                                                                                                                                                                          | implemented | Same upsert posture as passengers.                                                                                                          |
| Reports                  | `/reports`                                                    | `GET /api/tenant/reports/jobs`, `POST /api/tenant/reports/jobs`, `GET /api/tenant/reports/:jobId`                                                                                                                                                                                  | implemented | Legacy `/api/reports/*` aliases remain for non-tenant consumers; tenant portal now uses tenant-prefixed routes.                             |
| API Keys                 | `/api-keys`                                                   | `GET /api/tenant/api-keys`, `POST /api/tenant/api-keys`, `POST /api/tenant/api-keys/:apiKeyId/rotate`, `POST /api/tenant/api-keys/:apiKeyId/revoke`                                                                                                                                | implemented | Plaintext key is returned only at issue/rotate time.                                                                                        |
| Webhooks                 | `/webhooks`                                                   | `GET /api/tenant/webhooks`, `POST /api/tenant/webhooks`, `DELETE /api/tenant/webhooks/:webhookId`, `GET /api/tenant/webhooks/deliveries`, `GET /api/tenant/webhooks/:webhookId/deliveries`, `POST /api/tenant/webhooks/test`, `POST /api/tenant/webhooks/:webhookId/rotate-secret` | partial     | Read/create/delete/test/rotate/delivery-log are present. A dedicated metadata update command path for an existing endpoint is still absent. |
| Billing                  | `/billing`                                                    | `GET /api/tenant/billing/profile`, `POST /api/tenant/billing/profile`, `GET /api/tenant/invoices`, `GET /api/tenant/invoices/:invoiceId`, `POST /api/tenant/invoices/generate`                                                                                                     | implemented | Invoice artifacts are exposed as controlled signed URLs.                                                                                    |
| Notification preferences | `/notifications`                                              | `GET /api/tenant/notifications`, `POST /api/tenant/notifications`                                                                                                                                                                                                                  | implemented | This is the tenant-owned preference surface.                                                                                                |
| Tenant notification feed | `/webhooks` secondary panel                                   | `GET /api/tenant/notifications/feed`                                                                                                                                                                                                                                               | implemented | Added in `FBP-005` so the webhooks page no longer depends on ops-only `/api/notifications`.                                                 |
| SLA profile              | `/sla`                                                        | `GET /api/tenant/sla`, `POST /api/tenant/sla`                                                                                                                                                                                                                                      | implemented | Thresholds only; canonical SLA truth remains backend-owned.                                                                                 |
| Users                    | `/users`                                                      | `GET /api/tenant/users`, `POST /api/tenant/users`, `POST /api/tenant/users/:userId/role`                                                                                                                                                                                           | partial     | User list, invite, and role/status mutation exist. There is no standalone backend role catalog query yet.                                   |
| Roles catalog            | _(none)_                                                      | `_missing_: GET /api/tenant/roles`                                                                                                                                                                                                                                                 | missing     | Current UI uses the fixed `admin` / `operator` / `viewer` set locally.                                                                      |
| Audit trail              | `/audit`                                                      | `GET /api/tenant/audit`                                                                                                                                                                                                                                                            | implemented | `FBP-005` moved tenant portal audit reads off the ops/platform `/api/audit` route.                                                          |

## 3. `/api/tenant/*` Surface Freeze

| Endpoint family                  | Status      | Evidence / note                                                                        |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `/api/tenant/bookings*`          | implemented | Tenant create/list/detail/update/cancel all exist and tenant portal now consumes them. |
| `/api/tenant/passengers*`        | implemented | `tenant-partner` controller/service backed.                                            |
| `/api/tenant/addresses*`         | implemented | `tenant-partner` controller/service backed.                                            |
| `/api/tenant/reports*`           | implemented | Added as tenant aliases over reporting-filing job lifecycle.                           |
| `/api/tenant/api-keys*`          | implemented | Issue, rotate, revoke, list all exist.                                                 |
| `/api/tenant/webhooks*`          | partial     | Missing a first-class metadata update path for an existing endpoint.                   |
| `/api/tenant/billing/profile`    | implemented | Read/write billing profile exists.                                                     |
| `/api/tenant/invoices*`          | implemented | List/detail/generate exists.                                                           |
| `/api/tenant/notifications`      | implemented | Preferences GET/POST exists.                                                           |
| `/api/tenant/notifications/feed` | implemented | Added in `FBP-005` for tenant-facing notification readback.                            |
| `/api/tenant/sla`                | implemented | Read/write exists.                                                                     |
| `/api/tenant/users*`             | partial     | Invite + role/status update exist, but role catalog query is still missing.            |
| `/api/tenant/roles`              | missing     | Explicit backend role catalog endpoint not present.                                    |
| `/api/tenant/audit`              | implemented | Tenant-scoped audit feed exists.                                                       |

## 4. Wire / Authority Verification

| Concern                     | Result   | Evidence                                                                                                                                                                                              |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth realm + actor type     | patched  | `createTenantClient()` now sends supported bootstrap identity headers (`x-actor-type=tenant_admin`, `x-realm=tenant`, `x-tenant-id=tenant-demo-001`) instead of the invalid `tenant_user` actor type. |
| Tenant report authorization | patched  | `auth.policy.ts` now treats `tenant/reports/*` as tenant-authorized reporting routes.                                                                                                                 |
| Tenant audit authorization  | patched  | Tenant portal now reads `/api/tenant/audit`; it no longer depends on the platform/ops audit route.                                                                                                    |
| `X-Request-Id`              | patched  | `@drts/api-client` auto-injects `X-Request-Id` when the caller does not supply one.                                                                                                                   |
| `Idempotency-Key`           | patched  | `@drts/api-client` auto-injects `Idempotency-Key` on `POST` commands when absent.                                                                                                                     |
| Envelope shape              | patched  | Tenant-facing list responses now carry `items` plus `page_info` under the standard success envelope.                                                                                                  |
| `snake_case` wire contract  | verified | Global snake-case interceptor + exception filter remain active for all tenant routes.                                                                                                                 |
| Signed downloads            | verified | Billing invoices and report jobs still emit short-lived signed URLs from backend signing utilities; UI consumes the returned URL only.                                                                |

## 5. Remaining Gaps To Carry Into FBP-006

- `PATCH/POST /api/tenant/webhooks/:webhookId` style metadata update path is still absent; existing parity only covers create/delete/test/rotate-secret/delivery reads.
- `GET /api/tenant/roles` does not exist; the current tenant portal role selector is still a frontend-fixed enum list.
- `tenant-portal-web/README.md` still describes an earlier placeholder route set and should not be treated as the parity source of truth.

## 6. Cutover Guidance

- `FBP-006` should treat the matrix above as the freeze point for core-repo tenant authority.
- Anything marked `implemented` is safe to consume directly from `tenant-commute-hub`.
- Anything marked `partial` or `missing` must stay explicit in the cutover plan instead of being assumed complete.
