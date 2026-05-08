# XS-UI-004 — Shared Query And Filter Model Normalization

Date: 2026-05-08
Owner: Codex2
Reviewer: Codex
Depends on: `XS-UI-001`
Execution packet: `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
Primary spec: `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
Related packets:

- `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
- `support/sidecars/XS-UI-003/command-action-matrix.md`

## 0. Purpose

The execution packet explicitly requires one shared query/filter model for
selected admin and tenant tables so downstream `TEN-UI-*` work does not invent
per-page semantics for search, status chips, date windows, or pagination
(`docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md:264-285`).

This packet does two things:

1. audits the current implemented list surfaces and records where semantics are
   already drifting
2. recommends one reusable DTO / URL shape for search, status, date-range, and
   pagination

## 1. Current drift snapshot

The current surfaces are all using ad hoc local state or one-off query params:

| Surface                      | Current behavior                                                                                                                                                                                                                                                                                          | Drift / risk                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Platform Admin > /tenants`  | Local `filter` state mixes rollout stage (`sandbox`, `pilot`, `production`) with real tenant status (`rollback_hold`) in one union; all rows come from unfiltered `listPlatformTenants()` (`apps/platform-admin-web/app/tenants/page.tsx:40-56`, `111-159`; `packages/api-client/src/index.ts:1534-1538`) | `status` and `stage` are already collapsed into one client-only concept. No search, no date-range, no server pagination.            |
| `Platform Admin > /partners` | Local `filter` state mixes persisted `status` with derived `attention`; all rows come from unfiltered `listPlatformPartnerEntries()` (`apps/platform-admin-web/app/partners/page.tsx:32-50`, `100-140`; `packages/api-client/src/index.ts:1540-1544`)                                                     | `attention` is not a canonical backend status. Using the same filter lane for both makes future query params ambiguous.             |
| `Platform Admin > /users`    | Local `filter` state is status-only; all rows come from unfiltered `listPlatformAdminUsers()` (`apps/platform-admin-web/app/users/page.tsx:34-49`, `75-111`; `packages/api-client/src/index.ts:1675-1677`)                                                                                                | Semantically cleaner than tenants/partners, but still no shared search/date/pagination contract.                                    |
| `Platform Admin > /fleet`    | Full vehicle/driver/contract lists are fetched in parallel and partitioned by local tab state only (`apps/platform-admin-web/app/fleet/page.tsx:97-125`)                                                                                                                                                  | No shared list-query layer at all. Search/date/pagination would drift separately per tab if added page-locally.                     |
| `Tenant > /booking-list`     | Only `?status=` is read from URL, then the page fetches all bookings and filters client-side (`apps/tenant-portal-web/app/booking-list/page.tsx:30-47`); the filter bar hardcodes `/booking-list?status=...` (`apps/tenant-portal-web/components/booking-filter-bar.tsx:22-28`)                           | The one implemented URL contract is already too narrow for the product spec, which requires list query/filter behavior on bookings. |
| `Tenant > /users`            | No search/filter/pagination at all; list view renders the full `users` result (`apps/tenant-portal-web/app/users/page.tsx:8-29`, `55-89`)                                                                                                                                                                 | Tenant user status filtering is required by the product model, but the page has no shared list query surface yet.                   |

Backend and client evidence behind the drift:

- current list controllers generally expose no query DTO at all:
  `GET /api/platform-admin/tenants` (`apps/api/src/modules/platform-admin/tenants.controller.ts:17-20`),
  `GET /api/platform-admin/partner-entries` (`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:107-110`),
  `GET /api/platform-admin/users` (`apps/api/src/modules/platform-admin/platform-admin.controller.ts:133-136`),
  `GET /api/tenant/users` (`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:364-372`),
  `GET /api/tenant/bookings` (`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:203-214`)
- the shared api-client currently exposes only no-arg list methods, so each page
  invents local filtering after the fact (`packages/api-client/src/index.ts:538-540`,
  `1330-1335`, `1534-1544`, `1675-1677`, `1824-1833`, `1897-1900`)
- list envelopes already share page metadata shape through `toApiListData()`,
  but most consumers ignore it (`apps/api/src/common/api-envelope.ts:27-49`);
  `listTenantBookings()` currently hardcodes page `1` and `pageSize = items.length`
  (`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:801-815`)

## 2. Normalization rules

These rules are the shared contract for downstream management and tenant list
surfaces.

### 2.1 Reserve `status` for persisted backend status enums only

`status` must mean a real record status that already exists on the wire, for
example:

- tenant `status`
- partner-entry `status`
- platform-user `status`
- booking `orderStatus`
- tenant-user `status`

Do not overload `status` with:

- rollout stage
- derived readiness / attention flags
- tab choice
- date presets

This matters immediately because `/tenants` currently mixes `rollout.stage` with
`status`, and `/partners` mixes `status` with a derived `attention` bucket.

### 2.2 Use separate keys for separate semantics

- `q`: free-text search
- `status`: persisted status enum list
- `stage`: rollout or lifecycle stage list when the surface has a distinct
  stage axis
- `dateField`: which timestamp field the range applies to
- `dateFrom`: inclusive ISO-8601 lower bound
- `dateTo`: inclusive ISO-8601 upper bound
- `page`: 1-based page number
- `pageSize`: requested page size

Derived UI-only chips such as `attention` should stay local-only until a backend
owner publishes a real query field. They must not masquerade as `status`.

### 2.3 Reuse the existing page-based envelope

The current common envelope is page-number based, not cursor based
(`apps/api/src/common/api-envelope.ts:7-49`). The shared request shape should
therefore standardize on `page` + `pageSize` for this wave instead of letting
some pages invent `cursor`, others invent `limit`, and others ignore
pagination entirely.

### 2.4 Date ranges must be field-qualified

The product spec asks for list filtering by period or status in multiple places,
including booking tracking and management list views
(`docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:921-922`,
`1411`, `882-884`). A raw `from` / `to` pair is not enough because different
surfaces filter on different timestamps. The request must say which field is
being ranged.

## 3. Recommended shared DTO shape

Recommended transport shape for `@drts/api-client` and all list routes in this
wave:

```ts
export interface SharedListQueryV1 {
  q?: string;
  status?: string[];
  stage?: string[];
  dateField?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}
```

Recommended URL encoding:

```text
?q=acme&status=active,invited&stage=pilot&dateField=updatedAt&dateFrom=2026-05-01T00:00:00Z&dateTo=2026-05-08T23:59:59Z&page=1&pageSize=25
```

Encoding rules:

- `status` and `stage` are comma-delimited multi-select lists
- omit absent fields; do not send empty strings as semantic values
- `dateFrom` / `dateTo` stay ISO strings in UTC
- page defaults should be `page=1`, `pageSize=25` unless a surface has an
  explicit UX reason to choose another value

## 4. Surface-by-surface mapping

### 4.1 Platform Admin tenants

Recommended mapping:

- `q`: match tenant `name`, `code`, and `id`
- `status`: tenant persisted statuses such as `active`, `paused`,
  `rollback_hold`
- `stage`: rollout stages such as `sandbox`, `pilot`, `production`
- `dateField`: default `updatedAt`
- `page` / `pageSize`: standard page controls

Rule:

- move the current `rollback_hold` chip under `status`
- move `sandbox` / `pilot` / `production` under `stage`
- do not keep one overloaded `filter` union

### 4.2 Platform Admin partner entries

Recommended mapping:

- `q`: match `displayName`, `entrySlug`, `tenantId`, `programId`,
  `partnerCode`
- `status`: `active`, `inactive`, `revoked`
- `dateField`: default `updatedAt`
- `page` / `pageSize`: standard page controls

Rule:

- keep `attention` as a derived local chip until backend publishes a canonical
  readiness filter field
- if a backend readiness query is later added, use a distinct key such as
  `readinessState`, not `status`

### 4.3 Platform Admin users

Recommended mapping:

- `q`: match `displayName`, `email`, `userId`
- `status`: `active`, `invited`, `suspended`
- `dateField`: `createdAt` or `updatedAt`
- `page` / `pageSize`: standard page controls

Rule:

- this surface can adopt `SharedListQueryV1` directly with no extra axis

### 4.4 Platform Admin fleet

Recommended mapping:

- keep separate list resources per tab (`vehicles`, `drivers`, `contracts`)
- reuse the same `SharedListQueryV1` keys per resource rather than building
  three incompatible mini-DTOs

Rule:

- `activeTab` is navigation state, not a filter field
- if search/status/date are introduced, they should apply inside the selected
  resource with the same parameter names

### 4.5 Tenant booking list

Recommended mapping:

- `q`: match booking id / order id, passenger display, pickup / dropoff summary
- `status`: `OwnedOrderStatus[]`
- `dateField`: `reservationStart` by default, optionally `createdAt`
- `page` / `pageSize`: standard page controls

Rule:

- replace the current one-off `?status=` URL-only contract with the shared
  multi-field query shape
- move filtering server-side or api-client-side around the canonical query,
  rather than fetching all rows and trimming in page code

This is the most urgent downstream consumer because the booking list is the only
tenant list surface already exposing URL query semantics today.

### 4.6 Tenant users

Recommended mapping:

- `q`: match `displayName`, `email`, `userId`
- `status`: `invited`, `active`, `suspended`
- `page` / `pageSize`: standard page controls

Rule:

- if `TEN-UI-007` adds status chips or search, it must consume the shared keys
  above instead of inventing `roleStatus`, `inviteStatus`, or separate
  per-form filters unless backend semantics truly differ

## 5. Downstream implementation guidance

- `TEN-UI-002` should treat this packet as the shell-level query convention for
  tenant routes that surface lists.
- `TEN-UI-004` should use `SharedListQueryV1` for bookings and stop baking
  booking-list-specific `?status=` semantics into route helpers.
- `TEN-UI-007` should adopt the same `q` / `status` / `page` / `pageSize`
  model for tenant users, audit, and adjacent governance lists.
- if management surfaces later introduce search/date filtering, they should use
  the same parameter names and only add new keys when the new axis is truly a
  distinct domain concept.

## 6. Explicit non-goals and blockers

- This packet does not claim every backend endpoint already supports the shared
  query DTO; today, most do not.
- This packet does not create a readiness/attention backend filter owner for
  partner entries; that remains derived UI state until a separate contract is
  recorded.
- This packet does not force fleet/registry resources into one common endpoint;
  it only requires one shared query vocabulary across those per-resource lists.

## 7. Acceptance closeout

Acceptance requested by the execution packet is satisfied when this packet is
filed as the canonical normalization recommendation for search, status,
date-range, and pagination semantics across the selected admin and tenant list
surfaces.
