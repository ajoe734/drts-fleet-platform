import type { AuthActorType, AuthRealm, AuthRoleFamily } from "./auth.types";
import {
  getIamActorScopePresets,
  getIamAgencyRoleScopePresets,
  getIamAgencyRoleScopes,
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
  ops_observer: ["ops"],
  driver_user: ["driver"],
  partner_api_key: ["partner"],
  partner_user: ["partner"],
  referral_passenger: ["partner"],
  agency_user: ["agency"],
};

export const AUTH_SCOPE_PRESETS: Record<AuthActorType, readonly string[]> =
  getIamActorScopePresets() as Record<AuthActorType, readonly string[]>;

export const AUTH_TENANT_ROLE_SCOPE_PRESETS: Record<string, readonly string[]> =
  getIamTenantRoleScopePresets();

export const AUTH_AGENCY_ROLE_SCOPE_PRESETS: Record<string, readonly string[]> =
  getIamAgencyRoleScopePresets();

export function getAgencyRoleScopes(
  roleCode: string,
): readonly string[] | null {
  return getIamAgencyRoleScopes(roleCode);
}

/**
 * BUREAU-R13 §2.6: the only non-read requests an agency session may make.
 * Export-job creation produces an access record and an export artifact; own-
 * account session logout/revocation and TOTP enrollment/confirmation/recovery-
 * code regeneration operate strictly on the caller's own principal/session and
 * never change operational business data. Every other write is denied to the realm.
 */
export const AGENCY_WRITE_ROUTE_ALLOWLIST: ReadonlySet<string> = new Set([
  "POST agency/trip-records/export-jobs/preview",
  "POST agency/trip-records/export-jobs",
  "POST auth/logout",
  "POST auth/logout-all",
  "POST auth/agency/mfa/totp/enroll",
  "POST auth/agency/mfa/totp/confirm",
  "POST auth/agency/mfa/totp/recovery-codes/regenerate",
]);

export const AGENCY_SELF_SESSION_REVOKE_ROUTE_PATTERN =
  /^auth\/sessions\/[^/]+\/revoke$/;

export function isAgencyAllowedWriteRoute(
  method: string,
  routePath: string,
): boolean {
  const upperMethod = method.toUpperCase();
  if (AGENCY_WRITE_ROUTE_ALLOWLIST.has(`${upperMethod} ${routePath}`)) {
    return true;
  }
  return (
    upperMethod === "POST" &&
    AGENCY_SELF_SESSION_REVOKE_ROUTE_PATTERN.test(routePath)
  );
}

export function getTenantRoleScopes(
  roleCode: string,
): readonly string[] | null {
  return getIamTenantRoleScopes(roleCode);
}
