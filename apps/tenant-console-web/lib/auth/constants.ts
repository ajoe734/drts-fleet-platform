export const TENANT_SESSION_COOKIE_NAME = "drts_tenant_session";
export const TENANT_OIDC_STATE_COOKIE_NAME = "drts_tenant_oidc_state";
export const TENANT_CSRF_COOKIE_NAME = "drts_tenant_csrf";
export const TENANT_CSRF_HEADER_NAME = "x-csrf-token";

export const TENANT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours
export const TENANT_OIDC_STATE_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

export const TENANT_LOGIN_PATH = "/login";
export const TENANT_AUTH_CALLBACK_PATH = "/api/auth/tenant/callback";
export const TENANT_AUTH_API_PREFIX = "/api/auth";

export const PUBLIC_AUTH_PATHS = [
  TENANT_LOGIN_PATH,
  TENANT_AUTH_API_PREFIX,
] as const;
