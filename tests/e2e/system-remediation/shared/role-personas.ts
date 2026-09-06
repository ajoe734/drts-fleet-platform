import type { UatTenantContext } from "./namespace-manager";

export type TestEnvironmentMode = "local" | "sandbox" | "live";

export interface RolePersona {
  key: string;
  name: string;
  displayName: string;
  actorType:
    | "platform_admin"
    | "tenant_admin"
    | "ops_user"
    | "driver_user"
    | "partner_api_key"
    | "referral_passenger"
    | "system";
  actorId: string;
  realm: "platform" | "tenant" | "ops" | "driver" | "partner" | "system";
  roleFamilies: readonly string[];
  roles: readonly string[];
  scopes: readonly string[];
  email: string;
  phone: string;
  tenantId?: string | undefined;
  partnerId?: string | undefined;
  driverId?: string | undefined;
}

export interface BaselinePersonas {
  platform_admin: RolePersona;
  ops_dispatcher: RolePersona;
  bank_finance: RolePersona;
  partner_api: RolePersona;
}

/**
 * Baseline canonical platform personas.
 */
export const BASELINE_PERSONAS: BaselinePersonas = {
  platform_admin: {
    key: "platform_admin",
    name: "Platform Administrator",
    displayName: "Platform Admin (Super)",
    actorType: "platform_admin",
    actorId: "actor-plat-admin-001",
    realm: "platform",
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: [
      "identity:read",
      "foundation:read",
      "foundation:write",
      "audit:read",
      "notifications:read",
      "notifications:write",
      "tenant:read",
      "tenant:write",
      "tenant:webhooks:read",
      "tenant:webhooks:write",
      "tenant:sla:read",
      "tenant:sla:write",
      "tenant:billing:read",
      "tenant:billing:write",
      "billing:read",
      "billing:write",
      "regulatory:read",
      "regulatory:write",
      "incident:read",
      "incident:write",
      "maintenance:read",
      "maintenance:write",
      "reports:read",
      "reports:write",
      "forwarder:read",
    ],
    email: "superadmin@drts.internal",
    phone: "0912-000-000",
  },
  ops_dispatcher: {
    key: "ops_dispatcher",
    name: "Fleet Ops Dispatcher",
    displayName: "Ops Dispatcher",
    actorType: "ops_user",
    actorId: "actor-ops-dispatch-001",
    realm: "ops",
    roleFamilies: ["ops"],
    roles: ["ops_dispatcher"],
    scopes: [
      "fleet:read",
      "fleet:write",
      "dispatch:read",
      "dispatch:write",
      "order:read",
      "order:write",
      "incident:read",
      "incident:write",
    ],
    email: "dispatch@drts.internal",
    phone: "0912-111-222",
  },
  bank_finance: {
    key: "bank_finance",
    name: "Bank Finance Officer",
    displayName: "Bank Finance Officer",
    actorType: "platform_admin",
    actorId: "actor-bank-fin-001",
    realm: "platform",
    roleFamilies: ["platform"],
    roles: ["bank_finance"],
    scopes: ["billing:read", "billing:write", "reports:read"],
    email: "bank-finance@partner-bank.internal",
    phone: "02-2700-1111",
  },
  partner_api: {
    key: "partner_api",
    name: "Partner Service API Key",
    displayName: "Partner API Key",
    actorType: "partner_api_key",
    actorId: "actor-partner-api-001",
    realm: "partner",
    roleFamilies: ["partner"],
    roles: ["partner_service"],
    scopes: [
      "partner:booking:read",
      "partner:booking:write",
      "partner:webhook:read",
    ],
    email: "api-service@partner.example",
    phone: "02-2700-2222",
    partnerId: "10000000-0000-0000-0000-000000000301",
  },
};

export interface TenantPersonas {
  admin: RolePersona;
  operator: RolePersona;
  driver: RolePersona;
  passenger: RolePersona;
  [key: string]: RolePersona;
}

/**
 * Creates tenant-bound role personas for a given UAT tenant.
 */
export function createTenantPersonas(tenant: UatTenantContext): TenantPersonas {
  const tenantSlug = tenant.tenantCode.toLowerCase().replace(/_/g, "-");

  const admin: RolePersona = {
    key: `tenant_admin_${tenantSlug}`,
    name: `${tenant.brandName} Administrator`,
    displayName: `${tenant.brandName} Admin`,
    actorType: "tenant_admin",
    actorId: `actor-${tenantSlug}-admin`,
    realm: "tenant",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: [
      "identity:read",
      "audit:read",
      "tenant:read",
      "tenant:write",
      "tenant:webhooks:read",
      "tenant:webhooks:write",
      "tenant:sla:read",
      "tenant:sla:write",
      "tenant:billing:read",
      "tenant:billing:write",
      "billing:read",
      "billing:write",
      "reports:read",
      "reports:write",
    ],
    email: `admin@${tenantSlug}.example`,
    phone: "0912-333-444",
    tenantId: tenant.tenantId,
  };

  const operator: RolePersona = {
    key: `tenant_operator_${tenantSlug}`,
    name: `${tenant.brandName} Operator`,
    displayName: `${tenant.brandName} Ops`,
    actorType: "ops_user",
    actorId: `actor-${tenantSlug}-ops`,
    realm: "ops",
    roleFamilies: ["ops"],
    roles: ["ops_operator"],
    scopes: [
      "dispatch:read",
      "dispatch:write",
      "order:read",
      "order:write",
      "fleet:read",
    ],
    email: `ops@${tenantSlug}.example`,
    phone: "0912-555-666",
    tenantId: tenant.tenantId,
  };

  const driver: RolePersona = {
    key: `driver_${tenantSlug}`,
    name: `${tenant.brandName} Primary Driver`,
    displayName: `Driver (${tenant.brandName})`,
    actorType: "driver_user",
    actorId: `actor-${tenantSlug}-driver-001`,
    realm: "driver",
    roleFamilies: ["driver"],
    roles: ["driver_standard"],
    scopes: [
      "driver:status:write",
      "driver:job:read",
      "driver:job:accept",
      "driver:job:complete",
      "driver:sos:trigger",
    ],
    email: `driver01@${tenantSlug}.example`,
    phone: "0912-777-888",
    tenantId: tenant.tenantId,
    driverId: `driver-id-${tenantSlug}-001`,
  };

  const passenger: RolePersona = {
    key: `passenger_${tenantSlug}`,
    name: `${tenant.brandName} Enterprise Passenger`,
    displayName: `Passenger (${tenant.brandName})`,
    actorType: "referral_passenger",
    actorId: `actor-${tenantSlug}-passenger-001`,
    realm: "tenant",
    roleFamilies: ["tenant"],
    roles: ["passenger"],
    scopes: ["passenger:booking:read", "passenger:booking:write"],
    email: `rider01@${tenantSlug}.example`,
    phone: "0912-999-000",
    tenantId: tenant.tenantId,
  };

  return {
    admin,
    operator,
    driver,
    passenger,
  };
}

/**
 * Generates authentication headers for local/sandbox execution.
 *
 * Guardrail Enforcement:
 * "只能測試local/sandbox，live時需合法身份不fakeheaders。"
 * In live environments, synthetic headers are strictly forbidden and throw.
 */
export function generateAuthHeaders(
  persona: RolePersona,
  mode: TestEnvironmentMode = "local",
): Record<string, string> {
  if (mode === "live") {
    throw new Error(
      "Live environment requires authentic credentials/tokens and does not permit synthetic auth headers (fakeheaders).",
    );
  }

  const headers: Record<string, string> = {
    "x-actor-type": persona.actorType,
    "x-actor-id": persona.actorId,
    "x-realm": persona.realm,
    "x-scopes": persona.scopes.join(" "),
    "x-roles": persona.roles.join(" "),
  };

  if (persona.tenantId) {
    headers["x-tenant-id"] = persona.tenantId;
  }

  if (persona.partnerId) {
    headers["x-partner-id"] = persona.partnerId;
  }

  if (persona.driverId) {
    headers["x-driver-id"] = persona.driverId;
  }

  return headers;
}
