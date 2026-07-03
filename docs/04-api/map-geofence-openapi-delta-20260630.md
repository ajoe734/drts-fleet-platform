# Map / Geofence API Delta

Date: 2026-06-30

Status: `MAP-BE-003` endpoint coverage delta

This document records the geo and service-area API surface used by the
map/geofence production wave. The existing `docs/04-api/openapi-spec.yaml` is a
tenant-governance focused OpenAPI document, so this delta is the authoritative
map/geofence endpoint reference until the platform-wide OpenAPI bundle is
merged.

## Envelope

All success responses use the shared API envelope:

```ts
{
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  }
}
```

All error responses use:

```ts
{
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable: boolean;
    traceId: string;
  };
}
```

`@drts/api-client` unwraps success envelopes and throws `ApiClientError` for
non-2xx responses while preserving `statusCode`, `code`, `details`,
`retryable`, `traceId`, and `rawBody`.

## Geo Gateway

### `GET /api/geo/health`

Purpose: expose provider runtime health, fail-closed state, key restriction
inputs, and quota thresholds before map/geocode UI is enabled.

Success data: `GeoProviderHealthResponse`

Important fields:

| Field                | Meaning                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `status`             | `healthy`, `degraded`, or `unhealthy`.                                         |
| `failClosed`         | When `true`, search/resolve/reverse reject with `GEO_PROVIDER_NOT_CONFIGURED`. |
| `mockAllowed`        | Whether mock mode is allowed for the current environment.                      |
| `missingSecretNames` | Exact provider secret names missing for the configured mode.                   |
| `quota`              | Daily/minute quota and warning/critical thresholds.                            |
| `keyRestrictions`    | Browser origins and native package/bundle restriction inputs.                  |
| `checks`             | Machine-readable pass/warn/fail checks for deployment gates.                   |

Common unhealthy causes:

| Cause                                           | Expected behavior                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `MAP_PROVIDER_MODE=mock` in staging/production  | Fail closed unless `MAP_PROVIDER_ALLOW_MOCK_IN_PROD=true` break-glass set. |
| `MAP_PROVIDER_MODE=external` without server key | Fail closed with `missingSecretNames=["MAP_PROVIDER_SERVER_KEY"]`.         |
| `MAP_PROVIDER_MODE=disabled`                    | Fail closed for all provider-backed geo operations.                        |

### `GET /api/geo/search`

Purpose: provider-neutral address/place search for callcenter, tenant,
concierge, partner, ops, admin, and driver surfaces.

Query:

| Field                | Type                   | Required | Notes                                                |
| -------------------- | ---------------------- | -------- | ---------------------------------------------------- |
| `q`                  | string                 | yes      | Search text. Empty strings are rejected.             |
| `nearLat`            | number                 | no       | Must be paired with `nearLng`.                       |
| `nearLng`            | number                 | no       | Must be paired with `nearLat`.                       |
| `locale`             | string                 | no       | Provider hint only.                                  |
| `limit`              | integer                | no       | Positive integer; backend caps to provider-safe max. |
| `surface`            | `GeoResolutionSurface` | no       | Used for audit and provider policy.                  |
| `requestedByActorId` | string                 | no       | Actor requesting the search.                         |

Success data: `GeoSearchResponse`

Common errors:

| HTTP | Code                       | Retryable | Meaning                                                       |
| ---- | -------------------------- | --------- | ------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`         | false     | Missing `q`, invalid `limit`, or unsupported `surface`.       |
| 400  | `INVALID_COORDINATE`       | false     | `nearLat` / `nearLng` are incomplete or out of bounds.        |
| 503  | `GEO_PROVIDER_UNAVAILABLE` | true      | Provider outage; UI must render degraded/manual-review state. |

### `POST /api/geo/resolve`

Purpose: turn a selected provider candidate or manual pin into an auditable
`ResolvedAddressPayload`.

Body: `ResolveAddressCommand`

Success data: `GeoResolveResponse`

Common errors:

| HTTP | Code                       | Retryable | Meaning                                         |
| ---- | -------------------------- | --------- | ----------------------------------------------- |
| 400  | `VALIDATION_ERROR`         | false     | Missing `addressText` or unsupported `surface`. |
| 400  | `INVALID_COORDINATE`       | false     | `selectedPoint` is out of bounds.               |
| 503  | `GEO_PROVIDER_UNAVAILABLE` | true      | Provider candidate cannot be resolved now.      |

### `POST /api/geo/reverse`

Purpose: reverse-geocode a selected coordinate into an auditable address payload.

Body: `ReverseGeocodeCommand`

Success data: `GeoReverseResponse`

Common errors:

| HTTP | Code                       | Retryable | Meaning                                               |
| ---- | -------------------------- | --------- | ----------------------------------------------------- |
| 400  | `VALIDATION_ERROR`         | false     | Unsupported `surface`.                                |
| 400  | `INVALID_COORDINATE`       | false     | `location` is out of bounds.                          |
| 503  | `GEO_PROVIDER_UNAVAILABLE` | true      | Provider outage; UI must retain the pin/manual state. |

## Service-Area Authority

### `GET /api/service-area/definitions`

Purpose: fetch active service-area boundaries and stop policies for map overlays,
admin review, and deterministic E2E fixtures.

Success data: `ServiceAreaDefinitionsResponse`

Required data fields:

| Field          | Notes                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `serviceAreas` | Active/draft/retired records visible to the caller. Current backend returns active seeded definitions. |
| `stopPolicies` | Pickup/dropoff/manual-review policy geometries.                                                        |
| `generatedAt`  | Backend freshness timestamp for overlays and cache invalidation.                                       |

### `GET /api/service-area/admin/geojson`

Purpose: export governed service-area and stop-policy records as a GeoJSON
FeatureCollection for Platform Admin map editors, review screens, and
controlled import/export workflows.

Success data: `ServiceAreaGeoJsonResponse`

Required data fields:

| Field         | Notes                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `type`        | Always `FeatureCollection`.                                                                            |
| `features`    | Service-area and stop-policy features. Circles are rendered as polygons for map layers.                |
| `properties`  | Lifecycle status, effective dates, version refs, service product scope, and original `sourceGeometry`. |
| `generatedAt` | Backend freshness timestamp for editor cache invalidation.                                             |

### `POST /api/service-area/admin/service-areas`

Purpose: create a draft service-area boundary.

Body: `CreateServiceAreaBoundaryCommand`

Success data: `ServiceAreaAdminMutationResponse`

Lifecycle endpoints:

| Endpoint                                                        | Body                                | Notes                                                     |
| --------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| `POST /api/service-area/admin/service-areas/{id}/update`        | `UpdateServiceAreaBoundaryCommand`  | Draft/review records only; active/retired are immutable.  |
| `POST /api/service-area/admin/service-areas/{id}/submit-review` | none                                | Moves draft to review.                                    |
| `POST /api/service-area/admin/service-areas/{id}/publish`       | `PublishServiceAreaBoundaryCommand` | Publishes draft/review records and enforces window guard. |
| `POST /api/service-area/admin/service-areas/{id}/retire`        | `RetireServiceAreaBoundaryCommand`  | Retires a record and captures audit/effective cutoff.     |

### `POST /api/service-area/admin/stop-policies`

Purpose: create a draft pickup/dropoff/both stop policy.

Body: `CreateStopPolicyCommand`

Success data: `ServiceAreaAdminMutationResponse`

Lifecycle endpoints:

| Endpoint                                                        | Body                       | Notes                                                     |
| --------------------------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| `POST /api/service-area/admin/stop-policies/{id}/update`        | `UpdateStopPolicyCommand`  | Draft/review records only; active/retired are immutable.  |
| `POST /api/service-area/admin/stop-policies/{id}/submit-review` | none                       | Moves draft to review.                                    |
| `POST /api/service-area/admin/stop-policies/{id}/publish`       | `PublishStopPolicyCommand` | Publishes draft/review records and enforces window guard. |
| `POST /api/service-area/admin/stop-policies/{id}/retire`        | `RetireStopPolicyCommand`  | Retires a record and captures audit/effective cutoff.     |

### `POST /api/service-area/evaluate`

Purpose: backend-authoritative serviceability decision for pickup/dropoff points.

Body: `EvaluateServiceAreaCommand`

Success data: `ServiceAreaEvaluationResult`

Decision handling:

| Decision          | UI / booking behavior                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| `serviceable`     | Booking may continue, subject to normal business rules.                          |
| `manual_review`   | Booking must be marked for operator review; do not silently dispatch.            |
| `not_serviceable` | Booking must be blocked or explicitly routed into an allowed exception workflow. |

Common errors:

| HTTP | Code                      | Retryable | Meaning                                                  |
| ---- | ------------------------- | --------- | -------------------------------------------------------- |
| 400  | `INVALID_COORDINATE`      | false     | Pickup/dropoff coordinates are missing or out of bounds. |
| 400  | `INVALID_SERVICE_PRODUCT` | false     | Unsupported service product type.                        |
| 400  | `VALIDATION_ERROR`        | false     | Invalid `requestedAt` timestamp.                         |

## Client Methods

`packages/api-client/src/index.ts` exposes:

| Method                                    | Endpoint                                                        |
| ----------------------------------------- | --------------------------------------------------------------- |
| `getGeoProviderHealth()`                  | `GET /api/geo/health`                                           |
| `searchGeo(query)`                        | `GET /api/geo/search`                                           |
| `resolveGeo(command)`                     | `POST /api/geo/resolve`                                         |
| `reverseGeo(command)`                     | `POST /api/geo/reverse`                                         |
| `getServiceAreaDefinitions()`             | `GET /api/service-area/definitions`                             |
| `getServiceAreaGeoJson()`                 | `GET /api/service-area/admin/geojson`                           |
| `evaluateServiceArea(command)`            | `POST /api/service-area/evaluate`                               |
| `createServiceAreaBoundary(command)`      | `POST /api/service-area/admin/service-areas`                    |
| `updateServiceAreaBoundary(id, command)`  | `POST /api/service-area/admin/service-areas/{id}/update`        |
| `submitServiceAreaBoundaryForReview(id)`  | `POST /api/service-area/admin/service-areas/{id}/submit-review` |
| `publishServiceAreaBoundary(id, command)` | `POST /api/service-area/admin/service-areas/{id}/publish`       |
| `retireServiceAreaBoundary(id, command)`  | `POST /api/service-area/admin/service-areas/{id}/retire`        |
| `createStopPolicy(command)`               | `POST /api/service-area/admin/stop-policies`                    |
| `updateStopPolicy(id, command)`           | `POST /api/service-area/admin/stop-policies/{id}/update`        |
| `submitStopPolicyForReview(id)`           | `POST /api/service-area/admin/stop-policies/{id}/submit-review` |
| `publishStopPolicy(id, command)`          | `POST /api/service-area/admin/stop-policies/{id}/publish`       |
| `retireStopPolicy(id, command)`           | `POST /api/service-area/admin/stop-policies/{id}/retire`        |

New map/geofence surfaces should use these methods instead of ad hoc `fetch`
unless a package boundary blocks use of `@drts/api-client`; any exception must
be recorded in the task handoff.
