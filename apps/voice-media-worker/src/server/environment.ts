/**
 * Mirrors `detectAuthEnvironment` (apps/api/src/config/auth-startup-config.ts)
 * and `detectControlPlaneAuthEnvironment` (@drts/control-plane-auth): the same
 * `DRTS_ENV` -> `APP_ENV` -> `NODE_ENV` precedence, so this worker classifies
 * its deployment the same way the rest of the platform does. Duplicated
 * locally (not imported) because this worker intentionally has no runtime
 * dependency on apps/api or the web control-plane package.
 */
export function isStrictVoiceMediaEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.DRTS_ENV ?? env.APP_ENV ?? env.NODE_ENV)
    ?.trim()
    .toLowerCase();
  return (
    raw === "prod" ||
    raw === "production" ||
    raw === "stage" ||
    raw === "staging"
  );
}
