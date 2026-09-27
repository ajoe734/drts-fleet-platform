# UAT: SR-PARTNER-NOTIFY-FIX-ADMIN-20260927

## Objective
Verify the date DTO conversion, tenant picker authority proxy, and localization for partner notification panel.

## Findings & Remediation

1. **Date DTO Crash**
   - **Old behavior**: `createdAt`, `deliveredAt` etc returned as `Date` objects, serialized to `{}` by `deepToSnakeCase`. Panel crashes.
   - **New behavior**: `listPartnerNotificationDeliveries` explicitly converts Date objects to ISO strings using `this.toIso()`.
   - **Test Evidence**: `apps/api/tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts` verified that the production repository and serializer convert all 5 Date fields (`createdAt`, `deliveredAt`, `expiresAt`, `nextAttemptAt`, `leaseExpiresAt`) into React-renderable ISO strings and preserve nullable fields.
   - **Execution**: 
     - Command: `cd apps/api && pnpm exec vitest run tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts`
     - Exit code: 0

2. **Tenant Picker Authorization**
   - **Old behavior**: Panel passes `x-tenant-id`, but `control-plane-proxy` strips it via `CONTROL_PLANE_REQUEST_HEADER_BLOCKLIST`, causing empty tenant context. The proxy restored it only in bootstrap mode, but not in JWT mode.
   - **New behavior**: Proxy reads `x-tenant-id` from request headers before stripping, and passes it as `assumeTenantId` to `issueControlPlaneRequestAuth`. In JWT mode, the tenantId is now preserved and injected into the output `x-tenant-id` header when authorized.
   - **Test Evidence**: Added `tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/tenant-auth.test.ts` verifying that `assumeTenantId` translates correctly to `x-tenant-id` header output in both bootstrap and JWT modes, and fails with unauthorized forged tokens or missing assertion.
   - **Execution**: 
     - Command: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-admin-20260927/tenant-auth.test.ts`
     - Exit code: 0

3. **accepted_unknown Translation**
   - **Old behavior**: Missing `partnerNotification.accepted_unknown` key in both En and Zh.
   - **New behavior**: Added `Accepted (Unknown Device State)` for English and `夥伴已接受（狀態未知）` for Chinese.
   - **Test Evidence**: UI component and translation helper tests passed. 
   - **Execution**:
     - Command: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.test.ts tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx`
     - Exit code: 0

## Revision History
- **Base SHA**: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4
- **Candidate SHA**: 277ffe12a274c1a17d33f8849f80f4953ab297c7
