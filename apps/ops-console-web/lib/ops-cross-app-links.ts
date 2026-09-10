import type { CrossAppResourceLink } from "@drts/contracts";

export const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";

export function resolvePlatformAdminBase(): string {
  const envValue =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.DRTS_PLATFORM_ADMIN_URL ??
    "";
  const trimmed = envValue.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_PLATFORM_ADMIN_BASE;
}

export function joinBase(base: string, route: string): string {
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${base}${path}`;
}

export function buildPlatformAdminHref(routeOrPath: string): string {
  if (routeOrPath.startsWith("http://") || routeOrPath.startsWith("https://")) {
    return routeOrPath;
  }
  return joinBase(resolvePlatformAdminBase(), routeOrPath);
}

export function buildPlatformAdminAuditHref(options?: {
  auditId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}): string {
  const params = new URLSearchParams();
  const trimmedAuditId = options?.auditId?.trim();
  const trimmedResourceType = options?.resourceType?.trim();
  const trimmedResourceId = options?.resourceId?.trim();

  if (trimmedAuditId) {
    params.set("auditId", trimmedAuditId);
  }
  if (trimmedResourceType && trimmedResourceId) {
    params.set("resourceType", trimmedResourceType);
    params.set("resourceId", trimmedResourceId);
  }

  const query = params.toString();
  return buildPlatformAdminHref(query ? `/audit?${query}` : "/audit");
}

export function platformAdminAuditLink(options?: {
  auditId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  label?: string;
}): CrossAppResourceLink {
  const trimmedAuditId = options?.auditId?.trim() || "";
  const trimmedResourceType = options?.resourceType?.trim() || "";
  const trimmedResourceId = options?.resourceId?.trim() || "";

  const params = new URLSearchParams();
  if (trimmedAuditId) {
    params.set("auditId", trimmedAuditId);
  }
  if (trimmedResourceType && trimmedResourceId) {
    params.set("resourceType", trimmedResourceType);
    params.set("resourceId", trimmedResourceId);
  }

  const query = params.toString();
  const route = query ? `/audit?${query}` : "/audit";

  return {
    targetApp: "platform-admin",
    route,
    resourceType: trimmedResourceType || (trimmedAuditId ? "audit" : "general_audit"),
    resourceId: trimmedResourceId || trimmedAuditId,
    openMode: "new_tab",
    label: options?.label || "/audit ↗",
  };
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
      route: `/payments/reconciliation/${encodeURIComponent(issueId)}`,
      resourceType: "reconciliation",
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
  if (link.targetApp === "platform-admin") {
    return buildPlatformAdminHref(link.route);
  }
  return link.route;
}
