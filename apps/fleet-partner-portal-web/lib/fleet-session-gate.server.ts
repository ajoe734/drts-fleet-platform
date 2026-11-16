import "server-only";

import { ApiClientError } from "@drts/api-client";
import { redirect } from "next/navigation";
import { resolveFleetPrincipal } from "./fleet-principal.server";
import { markFleetSessionRedirect } from "./fleet-session-redirect";
import { loginReturnPath } from "./login-return-path";

/** Set by deploy-dev together with the /login surface (#3239). */
export function fleetPortalAuthRequired(): boolean {
  return process.env.DRTS_FLEET_PORTAL_AUTH_REQUIRED === "true";
}

/**
 * The middleware only checks that a session cookie or bearer is present. When
 * login is enforced and the backend rejects that session (forged, expired or
 * revoked: HTTP 401), send the visitor to /login. Without this the loaders'
 * catch-all fallbacks rendered the hard-coded demo fixtures to that visitor.
 * Other failures (403 scope/realm, 503 backend down) keep their behaviour.
 */
export function redirectToLoginIfSessionRejected(
  error: unknown,
  requestHeaders: Headers,
): void {
  if (!fleetPortalAuthRequired()) return;
  if (!(error instanceof ApiClientError) || error.statusCode !== 401) return;
  const query = new URLSearchParams({
    // The middleware overwrites this header with the real route on every
    // request, and loginReturnPath keeps only same-origin relative paths.
    redirect_uri: loginReturnPath(requestHeaders.get("x-drts-fleet-pathname")),
    session: "expired",
  });
  try {
    redirect(`/login?${query.toString()}`);
  } catch (navigation) {
    throw markFleetSessionRedirect(navigation);
  }
}

/** For server clients that do not resolve the Fleet principal themselves. */
export async function requireAcceptedFleetSession(
  requestHeaders: Headers,
): Promise<void> {
  if (!fleetPortalAuthRequired()) return;
  try {
    await resolveFleetPrincipal(requestHeaders);
  } catch (error) {
    redirectToLoginIfSessionRejected(error, requestHeaders);
  }
}
