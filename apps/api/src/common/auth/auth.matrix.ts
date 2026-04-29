import type { AuthRealmPathRecord } from "@drts/contracts";

export const AUTH_REALM_PATH_MATRIX: AuthRealmPathRecord[] = [
  {
    realm: "system",
    plane: "control_plane",
    primaryPath: "service_bearer",
    bearerHeader: "authorization",
    defaultIapProtected: true,
    tokenIssuancePath: "/api/auth/token",
    refreshPath: null,
    productionNotes:
      "System callers should use server-issued Bearer auth. x-drts-internal-key and free-form bootstrap headers remain local/direct-path fallback only.",
  },
  {
    realm: "platform",
    plane: "control_plane",
    primaryPath: "control_plane_inner_bearer",
    bearerHeader: "x-drts-authorization",
    defaultIapProtected: true,
    tokenIssuancePath: "/api/auth/token",
    refreshPath: null,
    productionNotes:
      "Protected platform-admin traffic is expected to arrive through the control-plane proxy with an inner Bearer token; browser-supplied bootstrap headers are not the production trust path.",
  },
  {
    realm: "ops",
    plane: "control_plane",
    primaryPath: "control_plane_inner_bearer",
    bearerHeader: "x-drts-authorization",
    defaultIapProtected: true,
    tokenIssuancePath: "/api/auth/token",
    refreshPath: null,
    productionNotes:
      "Protected ops-console traffic is expected to arrive through the control-plane proxy with an inner Bearer token; browser-supplied bootstrap headers are not the production trust path.",
  },
  {
    realm: "tenant",
    plane: "business_plane",
    primaryPath: "tenant_bootstrap_bearer",
    bearerHeader: "authorization",
    defaultIapProtected: false,
    tokenIssuancePath: "/api/auth/tenant/bootstrap-session",
    refreshPath: null,
    productionNotes:
      "Tenant portal sessions originate from invited-user bootstrap exchange and then use Bearer auth on the direct app path, not the default IAP boundary.",
  },
  {
    realm: "partner",
    plane: "business_plane",
    primaryPath: "partner_bootstrap_bearer",
    bearerHeader: "authorization",
    defaultIapProtected: false,
    tokenIssuancePath: "/api/auth/partner/bootstrap-session",
    refreshPath: null,
    productionNotes:
      "Partner callers exchange entrySlug plus API key for a short-lived Bearer session and remain outside the default IAP boundary.",
  },
  {
    realm: "driver",
    plane: "business_plane",
    primaryPath: "driver_device_bearer",
    bearerHeader: "authorization",
    defaultIapProtected: false,
    tokenIssuancePath: "/api/auth/driver/device/register",
    refreshPath: "/api/auth/driver/device/refresh",
    productionNotes:
      "Driver app identity is device-bound and refreshable through direct API auth; revoked bindings must fail even if the JWT still parses.",
  },
];
