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

export function resolvePlatformAdminHref(pathOrRoute: string): string {
  if (pathOrRoute.startsWith("http://") || pathOrRoute.startsWith("https://")) {
    return pathOrRoute;
  }
  return joinBase(resolvePlatformAdminBase(), pathOrRoute);
}

export function buildPlatformAdminAuditRoute(options?: {
  resourceType?: string;
  resourceId?: string;
  auditId?: string;
}): string {
  const params = new URLSearchParams();
  if (options?.auditId && options.auditId.trim()) {
    params.set("auditId", options.auditId.trim());
  }
  if (
    options?.resourceType &&
    options?.resourceId &&
    options.resourceType.trim() &&
    options.resourceId.trim()
  ) {
    params.set("resourceType", options.resourceType.trim());
    params.set("resourceId", options.resourceId.trim());
  }
  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}

export function platformAdminAuditLink(options?: {
  resourceType?: string;
  resourceId?: string;
  auditId?: string;
  label?: string;
}): CrossAppResourceLink {
  const route = buildPlatformAdminAuditRoute(options);
  return {
    targetApp: "platform-admin",
    route,
    resourceType: options?.resourceType || "audit",
    resourceId: options?.resourceId || options?.auditId || "",
    openMode: "new_tab",
    label: options?.label || "/audit ↗",
  };
}

export function platformAdminAdapterRegistryLink(label?: string): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: "/adapter-registry",
    resourceType: "adapter_registry",
    resourceId: "",
    openMode: "new_tab",
    label: label || "Adapter Registry",
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
  return joinBase(resolvePlatformAdminBase(), link.route);
}
