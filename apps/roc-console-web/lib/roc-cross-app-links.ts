import type { CrossAppResourceLink } from "@drts/contracts";

const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";

function resolvePlatformAdminBase(): string {
  const envValue =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.DRTS_PLATFORM_ADMIN_URL ??
    "";
  const trimmed = envValue.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_PLATFORM_ADMIN_BASE;
}

function joinBase(base: string, route: string): string {
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${base}${path}`;
}

export function crossAppHref(link: CrossAppResourceLink): string {
  if (link.targetApp === "platform-admin") {
    return joinBase(resolvePlatformAdminBase(), link.route);
  }

  return link.route;
}
