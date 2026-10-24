import type { ReferralMapConfig } from "../components/referral-place-field";

/**
 * Same gate as the Ops console's map-provider-config: the Google Maps browser
 * key is given to a page only when the provider is external and the page's own
 * public origin is on MAP_PROVIDER_ALLOWED_ORIGINS (the key's referrer list
 * mirrors that list). Otherwise the place fields offer address search only.
 */
export function resolveReferralMapConfig(
  env: NodeJS.ProcessEnv,
  publicOrigin: string,
): ReferralMapConfig {
  const browserKey = env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";
  const origins = (env.MAP_PROVIDER_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const enabled =
    (env.MAP_PROVIDER_MODE ?? "mock").toLowerCase() === "external" &&
    (env.MAP_PROVIDER_NAME ?? "google").toLowerCase() === "google" &&
    browserKey.length > 0 &&
    origins.includes(publicOrigin.replace(/\/$/, ""));
  return { enabled, browserKey: enabled ? browserKey : null };
}
