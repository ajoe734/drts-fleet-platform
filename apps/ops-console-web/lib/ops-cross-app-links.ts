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

function buildHref(route: string): string {
  const base = resolvePlatformAdminBase();
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${base}${path}`;
}

export function platformAdminReconciliationLink(
  issueId: string,
  label: string,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/payments/reconciliation/${issueId}`,
    resourceType: "reconciliation_issue",
    resourceId: issueId,
    openMode: "new_tab",
    label,
  };
}

export function platformAdminPaymentsLink(label: string): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: "/payments",
    resourceType: "payments_inbox",
    resourceId: "",
    openMode: "new_tab",
    label,
  };
}

export function crossAppHref(link: CrossAppResourceLink): string {
  return buildHref(link.route);
}
