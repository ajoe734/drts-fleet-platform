import type { CrossAppResourceLink } from "@drts/contracts";

const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";
const DEFAULT_OPS_CONSOLE_BASE = "/_apps/ops-console";
const DEFAULT_TENANT_CONSOLE_BASE = "/_apps/tenant-console";

function resolveConfiguredBase(
  candidates: readonly (string | undefined)[],
  fallback: string,
): string {
  const envValue = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );
  const trimmed = (envValue ?? "").trim().replace(/\/$/, "");
  return trimmed || fallback;
}

export function resolveCrossAppBase(
  targetApp: CrossAppResourceLink["targetApp"],
): string {
  if (targetApp === "platform-admin") {
    return resolveConfiguredBase(
      [
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL,
        process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
        process.env.DRTS_PLATFORM_ADMIN_URL,
        process.env.PLATFORM_ADMIN_ORIGIN,
        process.env.DEV_PLATFORM_ADMIN_ORIGIN,
        process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
        process.env.PROD_PLATFORM_ADMIN_ORIGIN,
      ],
      DEFAULT_PLATFORM_ADMIN_BASE,
    );
  }

  if (targetApp === "tenant-console") {
    return resolveConfiguredBase(
      [
        process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL,
        process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
        process.env.DRTS_TENANT_CONSOLE_URL,
        process.env.TENANT_CONSOLE_ORIGIN,
      ],
      DEFAULT_TENANT_CONSOLE_BASE,
    );
  }

  return resolveConfiguredBase(
    [
      process.env.NEXT_PUBLIC_OPS_CONSOLE_URL,
      process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
      process.env.DRTS_OPS_CONSOLE_URL,
      process.env.OPS_CONSOLE_ORIGIN,
      process.env.DEV_OPS_CONSOLE_ORIGIN,
      process.env.STAGING_OPS_CONSOLE_ORIGIN,
      process.env.PROD_OPS_CONSOLE_ORIGIN,
    ],
    DEFAULT_OPS_CONSOLE_BASE,
  );
}

function joinBase(base: string, route: string): string {
  if (route.startsWith("http://") || route.startsWith("https://")) {
    return route;
  }

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
      route: "/payments",
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
  return joinBase(resolveCrossAppBase(link.targetApp), link.route);
}
