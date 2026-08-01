import type { SecurityEventMatrixEntry } from "@drts/contracts";

export const SECURITY_EVENT_POLICY_VERSION =
  "stage1.5-identity-access-account-security-20260801.v1";

export const SECURITY_EVENT_MATRIX: readonly SecurityEventMatrixEntry[] = [
  {
    eventType: "tenant_bootstrap_session.issued",
    eventFamily: "auth",
    description:
      "Successful tenant bootstrap session issuance after identity and membership resolution.",
    privileged: false,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "tenant_bootstrap_session.denied",
    eventFamily: "auth",
    description:
      "Rejected tenant bootstrap session attempts, including suspended, unknown, and cross-tenant cases.",
    privileged: false,
    tenantScoped: true,
    requiredOutcomes: ["denied", "failure"],
  },
  {
    eventType: "partner_bootstrap_session.issued",
    eventFamily: "auth",
    description:
      "Successful partner bootstrap exchange backed by a registered credential.",
    privileged: false,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "partner_bootstrap_session.denied",
    eventFamily: "auth",
    description:
      "Rejected partner bootstrap attempts, including wrong entry and invalid credentials.",
    privileged: false,
    tenantScoped: true,
    requiredOutcomes: ["denied", "failure"],
  },
  {
    eventType: "driver_device_session.registered",
    eventFamily: "session",
    description: "Driver device provisioning created a new active session.",
    privileged: false,
    tenantScoped: false,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "driver_device_session.refreshed",
    eventFamily: "session",
    description: "Driver device refresh rotation succeeded.",
    privileged: false,
    tenantScoped: false,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "driver_device_session.revoked",
    eventFamily: "device",
    description: "Driver device binding was revoked by a server-authoritative actor.",
    privileged: true,
    tenantScoped: false,
    requiredOutcomes: ["revoked", "success"],
  },
  {
    eventType: "tenant_user.invited",
    eventFamily: "invitation",
    description: "Tenant user invitation and membership creation.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "tenant_user.role_updated",
    eventFamily: "role",
    description: "Tenant user role or account status mutation.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "tenant_api_key.issued",
    eventFamily: "credential",
    description: "Tenant API credential issuance with masked metadata only.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "tenant_api_key.rotated",
    eventFamily: "credential",
    description: "Tenant API credential rotation with the old key revoked.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["success", "revoked"],
  },
  {
    eventType: "tenant_api_key.revoked",
    eventFamily: "credential",
    description: "Tenant API credential revocation.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["revoked", "success"],
  },
  {
    eventType: "authz.denied",
    eventFamily: "policy",
    description:
      "Realm, scope, or resource authorization denial that must remain queryable for investigations.",
    privileged: false,
    tenantScoped: true,
    requiredOutcomes: ["denied"],
  },
  {
    eventType: "break_glass.activated",
    eventFamily: "break_glass",
    description:
      "Break-glass short-lived activation, approval, and expiration events.",
    privileged: true,
    tenantScoped: false,
    requiredOutcomes: ["success", "expired", "revoked"],
  },
] as const;
