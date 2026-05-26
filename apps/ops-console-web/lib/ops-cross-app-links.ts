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

export function platformAdminPaymentsLink(label: string): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: "/payments",
    resourceType: "payments_queue",
    resourceId: "",
    openMode: "new_tab",
    label,
  };
}

export function platformAdminReconciliationLink(
  issueId: string | null,
  label: string,
): CrossAppResourceLink {
  if (issueId) {
    return {
      targetApp: "platform-admin",
      route: `/payments/reconciliation/${issueId}`,
      resourceType: "reconciliation_issue",
      resourceId: issueId,
      openMode: "new_tab",
      label,
    };
  }
  return {
    targetApp: "platform-admin",
    route: "/payments#payments-create-issue",
    resourceType: "reconciliation_issue_intent",
    resourceId: "",
    openMode: "new_tab",
    label,
  };
}

export function crossAppHref(link: CrossAppResourceLink): string {
  return joinBase(resolvePlatformAdminBase(), link.route);
}
