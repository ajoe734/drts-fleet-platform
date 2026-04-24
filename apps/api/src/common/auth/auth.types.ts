export const AUTH_ACTOR_TYPES = [
  "system",
  "platform_admin",
  "tenant_admin",
  "ops_user",
  "driver_user",
] as const;

export type AuthActorType = (typeof AUTH_ACTOR_TYPES)[number];

export const AUTH_REALMS = [
  "system",
  "platform",
  "tenant",
  "ops",
  "driver",
] as const;

export type AuthRealm = (typeof AUTH_REALMS)[number];

export const AUTH_ROLE_FAMILIES = [
  "platform",
  "tenant",
  "ops",
  "driver",
] as const;

export type AuthRoleFamily = (typeof AUTH_ROLE_FAMILIES)[number];

export const AUTH_MODES = ["bootstrap_headers", "jwt_bearer"] as const;

export type AuthMode = (typeof AUTH_MODES)[number];

export const AUTH_MODE = "bootstrap_headers" as const;

export interface BootstrapRequestIdentity {
  authMode: AuthMode;
  actorType: AuthActorType;
  actorId: string | null;
  realm: AuthRealm;
  tenantId: string | null;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
  requestId: string | null;
}

export interface AuthBootstrapHeaders {
  authorization?: string;
  "x-drts-authorization"?: string;
  "x-actor-type"?: string;
  "x-actor-id"?: string;
  "x-realm"?: string;
  "x-tenant-id"?: string;
  "x-roles"?: string;
  "x-role-families"?: string;
  "x-scopes"?: string;
  "x-auth-mode"?: string;
  "x-request-id"?: string;
  [key: string]: string | string[] | undefined;
}

export interface AuthenticatedRequestLike {
  headers: AuthBootstrapHeaders;
  method?: string;
  originalUrl?: string;
  url?: string;
  identity?: BootstrapRequestIdentity;
}
