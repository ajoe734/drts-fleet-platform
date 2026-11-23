export const FLEET_LOGIN_PATH = "/login";
export const FLEET_INVITE_PATH = "/invite";
export const FLEET_FORGOT_PASSWORD_PATH = "/forgot-password";
export const FLEET_RESET_PASSWORD_PATH = "/reset-password";
export const FLEET_AUTH_API_PREFIX = "/api/auth";

export const FLEET_PUBLIC_ENTRY_PAGE_PATHS = [
  FLEET_LOGIN_PATH,
  FLEET_INVITE_PATH,
  FLEET_FORGOT_PASSWORD_PATH,
  FLEET_RESET_PASSWORD_PATH,
] as const;

export const FLEET_PUBLIC_PATHS = [
  ...FLEET_PUBLIC_ENTRY_PAGE_PATHS,
  FLEET_AUTH_API_PREFIX,
] as const;

/**
 * Only the standalone public account-entry pages render without the signed-in
 * portal chrome or server-side navigation badge queries in RootLayout.
 */
export function isFleetPublicEntryPagePath(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  return (FLEET_PUBLIC_ENTRY_PAGE_PATHS as readonly string[]).includes(
    pathname,
  );
}

/**
 * Public routes allowed through the presence-only session middleware when
 * DRTS_FLEET_PORTAL_AUTH_REQUIRED=true: the standalone public account-entry
 * pages plus the /api/auth BFF endpoints.
 */
export function isFleetPublicPath(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  if (isFleetPublicEntryPagePath(pathname)) {
    return true;
  }
  return (
    pathname === FLEET_AUTH_API_PREFIX ||
    pathname.startsWith(`${FLEET_AUTH_API_PREFIX}/`)
  );
}
