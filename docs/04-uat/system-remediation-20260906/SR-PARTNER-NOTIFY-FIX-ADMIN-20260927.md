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

## Cross-Review Findings & Verification (Guide 0.7 Table)

| Finding / Acceptance Key | Source Location & Contract | Old Behavior (aab0fab6) -> New Behavior (5ad58e8d) | Command, Exit Code, Exec Version & Evidence | Unverified Items & Limitations |
| ------------------------ | -------------------------- | -------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| **R1 [P1] tenant picker still fails in JWT deployments** / `tenant_picker_server_authority_preserved` | `packages/control-plane-auth/src/index.ts:578-630`, `TenantPartnerController` requires `@Headers("x-tenant-id")` | **aab0fab6**: HTTP400 TENANT_ID_REQUIRED in JWT mode because `x-tenant-id` header was not injected output. -> **5ad58e8d**: Injects `x-tenant-id` into header in both JWT and bootstrap modes. | `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/tenant-auth.test.ts` (Exit 0, Pass) | In-memory probe only mocks upstream fetch transport. Hosted C205/full matrix and real browser integration not run or claimed. |
| **R2 [P2] date serialization/rendering regression missing** / `delivery_dates_renderable` | `MultiTaxiRepository.listPartnerNotificationDeliveries` -> `deepToSnakeCase` -> API Client -> `PartnerNotificationPanel` | **585087a2** (Base): Raw Dates become `{}` causing React renderToStaticMarkup to crash. -> **5ad58e8d**: Returns ISO strings; React rendering succeeds and preserves nullable fields. | `pnpm --filter api exec vitest run tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts` (Exit 0, Pass) | DB query mocked. No real PG or full browser claim. |
| **accepted_unknown_localized** | `apps/platform-admin-web/lib/translations.ts` | **Base**: Missing translation key for `accepted_unknown`. -> **5ad58e8d**: Helper returns "Accepted (Unknown Device State)" (en) / "夥伴已接受（狀態未知）" (zh). | `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/translations.test.ts` (Exit 0, Pass) | UI rendering in real browser is parent QA responsibility. |
