import {
  assertAllowedUrl,
  required,
  validateLiveMapGate,
  type LiveEnv,
} from "./live-map-config";

// Keep infrastructure authentication in one place for the later IAP migration.
// This ID token only invokes Cloud Run; it does not establish an ops realm user.
export function createOpsConsoleAuthentication(env: LiveEnv) {
  const config = validateLiveMapGate(env);
  const token = required(env, "DRTS_LIVE_MAP_OPS_CONSOLE_ID_TOKEN");
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Ops console invoker requires a Google ID-token JWT");
  }
  return {
    opsOrigin: config.opsOrigin,
    headersFor(url: string, original: Record<string, string> = {}) {
      assertAllowedUrl(url, config.allowedTargets);
      // Redirects may inherit headers. Remove both Cloud Run auth spellings
      // before deciding whether this exact origin may receive the ID token.
      const headers = Object.fromEntries(
        Object.entries(original).filter(
          ([name]) =>
            !["authorization", "x-serverless-authorization"].includes(
              name.toLowerCase(),
            ),
        ),
      );
      if (new URL(url).origin === config.opsOrigin) {
        headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    },
  };
}
