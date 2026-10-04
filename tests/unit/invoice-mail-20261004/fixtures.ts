import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { getIamTenantRoleScopes } from "@drts/contracts";

export const financeIdentity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "tenant_admin",
  actorId: "finance-user",
  realm: "tenant",
  tenantId: "tenant-demo-001",
  roleFamilies: ["tenant"],
  roles: ["tenant_finance_admin"],
  scopes: [...getIamTenantRoleScopes("tenant_finance_admin")!],
  requestId: null,
};
