import { Linking } from "react-native";
import type { CrossAppResourceLink } from "@drts/contracts";

const TARGET_APP_BASE_URLS: Record<CrossAppResourceLink["targetApp"], string> =
  {
    "ops-console":
      process.env.EXPO_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
    "platform-admin":
      process.env.EXPO_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002",
    "tenant-console":
      process.env.EXPO_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004",
  };

export function resolveCrossAppUrl(link: CrossAppResourceLink): string {
  if (/^https?:\/\//i.test(link.route)) {
    return link.route;
  }

  const base = TARGET_APP_BASE_URLS[link.targetApp].replace(/\/$/, "");
  const route = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${base}${route}`;
}

export async function openCrossAppLink(link: CrossAppResourceLink) {
  return Linking.openURL(resolveCrossAppUrl(link));
}
