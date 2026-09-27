# UAT: SR-PARTNER-NOTIFY-FIX-ADMIN-20260927

## Objective
Verify the date DTO conversion, tenant picker authority proxy, and localization for partner notification panel.

## Findings & Remediation

1. **Date DTO Crash**
   - **Old behavior**: `createdAt`, `deliveredAt` etc returned as `Date` objects, serialized to `{}` by `deepToSnakeCase`. Panel crashes.
   - **New behavior**: `listPartnerNotificationDeliveries` explicitly converts Date objects to ISO strings using `this.toIso()`.
   - **Test Evidence**: Unit and integration tests verify the response schema now provides string values instead of Date objects.

2. **Tenant Picker Authorization**
   - **Old behavior**: Panel passes `x-tenant-id`, but `control-plane-proxy` strips it via `CONTROL_PLANE_REQUEST_HEADER_BLOCKLIST`, causing empty tenant context.
   - **New behavior**: Proxy reads `x-tenant-id` from request headers before stripping and passes it as `assumeTenantId` to `issueControlPlaneRequestAuth`, injecting it into the signed identity and output headers.
   - **Test Evidence**: Added `tenant-auth.test.ts` verifying that `assumeTenantId` translates correctly to `x-tenant-id` header output when verified.

3. **accepted_unknown Translation**
   - **Old behavior**: Missing `partnerNotification.accepted_unknown` key in both En and Zh.
   - **New behavior**: Added `Accepted (Unknown Device State)` for English and `夥伴已接受（狀態未知）` for Chinese.
   - **Test Evidence**: Checked `translations.ts`.
