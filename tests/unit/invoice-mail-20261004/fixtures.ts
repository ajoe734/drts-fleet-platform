import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";

export const financeIdentity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "tenant_admin",
  actorId: "finance-user",
  realm: "tenant",
  tenantId: "tenant-demo-001",
  roleFamilies: ["tenant"],
  roles: ["tenant_finance"],
  scopes: ["billing:read", "billing:write"],
  requestId: null,
};
