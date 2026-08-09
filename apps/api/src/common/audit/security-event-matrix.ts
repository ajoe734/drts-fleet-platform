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
    description:
      "Driver device binding was revoked by a server-authoritative actor.",
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
  {
    eventType: "iap_subject.resolved",
    eventFamily: "auth",
    description:
      "Verified IAP workforce subject resolved to durable platform or ops membership.",
    privileged: false,
    tenantScoped: false,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "iap_subject.denied",
    eventFamily: "auth",
    description:
      "Rejected IAP workforce assertion, wrong audience, missing token, spoof attempt, or inactive user.",
    privileged: false,
    tenantScoped: false,
    requiredOutcomes: ["denied", "failure"],
  },
  {
    eventType: "iap_group_drift.detected",
    eventFamily: "role",
    description:
      "Group drift detected between IAP assertion groups and durable role bindings; least privilege applied.",
    privileged: true,
    tenantScoped: false,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "internal_key.used",
    eventFamily: "credential",
    description:
      "Temporary internal key exception usage recorded with owner, scope, and key state.",
    privileged: true,
    tenantScoped: false,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "internal_key_drift.detected",
    eventFamily: "credential",
    description:
      "Internal key drift alert triggered by undocumented, expired, revoked, or invalid internal key presentation.",
    privileged: true,
    tenantScoped: false,
    requiredOutcomes: ["denied", "failure", "expired", "revoked"],
  },
  {
    eventType: "access_review.campaign_created",
    eventFamily: "governance",
    description: "New privileged access review campaign created.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "access_review.decision_made",
    eventFamily: "governance",
    description:
      "Privileged access review decision (certify, reduce, remove, defer) executed with evidence.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
  {
    eventType: "access_review.overdue_alert",
    eventFamily: "governance",
    description:
      "Access review campaign overdue alert triggered and policy remediation applied.",
    privileged: true,
    tenantScoped: true,
    requiredOutcomes: ["success"],
  },
] as const;
