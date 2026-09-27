# UAT: SR-PARTNER-NOTIFY-FIX-ADMIN-20260927

## Objective
Verify the date DTO conversion, tenant picker authority proxy, and localization for partner notification panel.

## Findings & Remediation

1. **Date DTO Crash**
   - **Old behavior**: `createdAt`, `deliveredAt` etc returned as `Date` objects, serialized to `{}` by `deepToSnakeCase`. Panel crashes because React fails to render raw objects.
   - **New behavior**: `listPartnerNotificationDeliveries` explicitly converts Date objects to ISO strings using `this.toIso()`.
   - **Test Evidence**: `apps/api/tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts` verified that the production repository and serializer convert all 5 Date fields (`createdAt`, `deliveredAt`, `expiresAt`, `nextAttemptAt`, `leaseExpiresAt`) into React-renderable ISO strings and preserve nullable fields. The test asserts the full serialization boundary (DB mock -> deepToSnakeCase -> api client `deepToCamelCase` -> React renderToStaticMarkup).
   - **Execution**:
     - Command: `pnpm --filter api exec vitest run tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts`
     - Exit code: 0

2. **Tenant Picker Authorization**
   - **Old behavior**: Panel passes `x-tenant-id`, but `control-plane-proxy` strips it via `CONTROL_PLANE_REQUEST_HEADER_BLOCKLIST`, causing empty tenant context. The proxy restored it only in bootstrap mode, but not in JWT mode.
   - **New behavior**: Proxy reads `x-tenant-id` from request headers before stripping, and passes it as `assumeTenantId` to `issueControlPlaneRequestAuth`. In JWT mode, the tenantId is now preserved and injected into the output `x-tenant-id` header when authorized.
   - **Test Evidence**: Appended `tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts` verifying the actual call chain from Next `GET` -> `issueControlPlaneRequestAuth` -> `BootstrapAuthGuard`. Mocked only upstream fetch transport. Confirmed that both bootstrap and JWT modes pass `assumeTenantId` correctly, and strict IAP mode correctly returns 401 when assertion is missing or forged.
   - **Execution**:
     - Command: `pnpm --filter api exec vitest run tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts`
     - Exit code: 0
     - Command: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/tenant-auth.test.ts`
     - Exit code: 0

3. **accepted_unknown Translation**
   - **Old behavior**: Missing `partnerNotification.accepted_unknown` key in both En and Zh.
   - **New behavior**: Added `Accepted (Unknown Device State)` for English and `夥伴已接受（狀態未知）` for Chinese.
   - **Test Evidence**: UI component and translation helper tests passed. The real localized output was verified directly using `translations.t`.
   - **Execution**:
     - Command: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/translations.test.ts`
     - Exit code: 0

## Revision History
- **Base SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4

Note: Hosted CI, full browser E2E, and production PG testing are delegated to parent C205 QA integration tasks. This document scoped to API mocks and explicit unit/integration boundaries as permitted.
