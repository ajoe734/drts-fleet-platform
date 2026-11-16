// Dependency-free on purpose: data loaders and server actions import it, and
// their unit tests load those modules with stubbed next/* modules.
const FLEET_SESSION_REDIRECT = Symbol.for("drts.fleet-portal.session-redirect");

/** Tag the framework redirect that sends a rejected session to /login. */
export function markFleetSessionRedirect<T>(error: T): T {
  if (error && typeof error === "object") {
    Object.defineProperty(error, FLEET_SESSION_REDIRECT, { value: true });
  }
  return error;
}

/** Catch-all fallbacks must rethrow this instead of rendering demo data. */
export function isFleetSessionRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as Record<symbol, unknown>)[FLEET_SESSION_REDIRECT] === true,
  );
}
