/**
 * BUREAU-R13 §3.2: the agency portal host owns its own host-only cookies.
 * They never share names (or a Domain) with the tenant cookies, so tenant and
 * agency sessions cannot be confused by logout, CSRF or middleware checks.
 */
export const AGENCY_SESSION_COOKIE_NAME = "drts_agency_session";
export const AGENCY_OIDC_STATE_COOKIE_NAME = "drts_agency_oidc_state";
export const AGENCY_CSRF_COOKIE_NAME = "drts_agency_csrf";
/** Display-only profile (agency name, role, access expiry) from the callback. */
export const AGENCY_PROFILE_COOKIE_NAME = "drts_agency_profile";
export const AGENCY_CSRF_HEADER_NAME = "x-csrf-token";

/** Same 8-hour ceiling as the tenant session and the API-issued agency token. */
export const AGENCY_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const AGENCY_LOGIN_PATH = "/login";
export const AGENCY_INVITE_PATH = "/invite";
export const AGENCY_AUTH_CALLBACK_PATH = "/api/auth/agency/callback";
export const AGENCY_AUTH_API_PREFIX = "/api/auth";
export const HEALTHCHECK_PATH = "/healthz";

export const PUBLIC_AGENCY_PATHS = [
  AGENCY_LOGIN_PATH,
  AGENCY_INVITE_PATH,
  AGENCY_AUTH_API_PREFIX,
  HEALTHCHECK_PATH,
] as const;
