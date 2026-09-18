import type { AuthActorType, AuthRealm, AuthRoleFamily } from "./auth.types";
import {
  getIamActorScopePresets,
  getIamTenantRoleScopes,
  getIamTenantRoleScopePresets,
} from "@drts/contracts";

export const AUTH_METADATA_KEY = "drts:auth";
export const AUTH_OPEN_ROUTE_KEY = "drts:auth:open";
export const AUTH_REQUIRED_SCOPES_KEY = "drts:auth:scopes";
export const AUTH_ALLOWED_REALMS_KEY = "drts:auth:realms";
export const FEATURE_GATED_FLAG_KEY = "drts:feature-gate:flag-key";

export const AUTH_ANONYMOUS_REQUEST_ID = "anonymous";

export const AUTH_DEFAULT_PUBLIC_REALMS: readonly AuthRealm[] = ["system"];

export const AUTH_ROUTE_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const AUTH_ROUTE_WRITE_METHODS = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export const AUTH_STEP_UP_REFERENCE_HEADER = "x-drts-step-up-reference";

export const AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE: Record<
  AuthActorType,
  AuthRoleFamily[]
> = {
  system: [],
  platform_admin: ["platform"],
  tenant_admin: ["tenant"],
  ops_user: ["ops"],
  driver_user: ["driver"],
  partner_api_key: ["partner"],
  partner_user: ["partner"],
  referral_passenger: ["partner"],
};

export const AUTH_SCOPE_PRESETS: Record<AuthActorType, readonly string[]> =
  getIamActorScopePresets() as Record<AuthActorType, readonly string[]>;

export const AUTH_TENANT_ROLE_SCOPE_PRESETS: Record<string, readonly string[]> =
  getIamTenantRoleScopePresets();

export function getTenantRoleScopes(
  roleCode: string,
): readonly string[] | null {
  return getIamTenantRoleScopes(roleCode);
}
