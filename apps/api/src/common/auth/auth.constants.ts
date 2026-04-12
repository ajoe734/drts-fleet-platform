import type { AuthActorType, AuthRealm, AuthRoleFamily } from "./auth.types";

export const AUTH_METADATA_KEY = "drts:auth";
export const AUTH_OPEN_ROUTE_KEY = "drts:auth:open";
export const AUTH_REQUIRED_SCOPES_KEY = "drts:auth:scopes";
export const AUTH_ALLOWED_REALMS_KEY = "drts:auth:realms";

export const AUTH_ANONYMOUS_REQUEST_ID = "anonymous";

export const AUTH_DEFAULT_PUBLIC_REALMS: readonly AuthRealm[] = ["system"];

export const AUTH_ROUTE_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const AUTH_ROUTE_WRITE_METHODS = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export const AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE: Record<
  AuthActorType,
  AuthRoleFamily[]
> = {
  system: [],
  platform_admin: ["platform"],
  tenant_admin: ["tenant"],
  ops_user: ["ops"],
  driver_user: ["driver"],
};

export const AUTH_SCOPE_PRESETS: Record<AuthActorType, readonly string[]> = {
  system: [
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
    "callcenter:read",
    "callcenter:write",
    "complaints:read",
    "complaints:write",
    "owned:read",
    "owned:write",
    "dispatch:read",
    "dispatch:write",
    "driver:read",
    "driver:write",
    "reports:read",
    "reports:write",
    "forwarder:read",
    "forwarder:write",
  ],
  platform_admin: [
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
    "reports:read",
    "reports:write",
  ],
  tenant_admin: [
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
  ops_user: [
    "identity:read",
    "audit:read",
    "notifications:read",
    "notifications:write",
    "regulatory:read",
    "regulatory:write",
    "callcenter:read",
    "callcenter:write",
    "complaints:read",
    "complaints:write",
    "owned:read",
    "owned:write",
    "dispatch:read",
    "dispatch:write",
    "billing:read",
    "billing:write",
    "reports:read",
    "reports:write",
    "forwarder:read",
    "forwarder:write",
  ],
  driver_user: ["owned:read", "driver:read", "driver:write", "dispatch:read"],
};
