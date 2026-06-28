import type { CanvasShellNavItem } from "@drts/ui-web";
import { t, type Locale } from "@/lib/translations";

const APPROVAL_QUEUE_ALLOWED_ROLES = new Set([
  "ops_approval_triage",
  "ops_manager",
  "ops_compliance",
]);

function compactNav(nav: CanvasShellNavItem[]): CanvasShellNavItem[] {
  const compacted: CanvasShellNavItem[] = [];
  for (const item of nav) {
    if ("divider" in item) {
      const previous = compacted[compacted.length - 1];
      if (!previous || "divider" in previous) {
        continue;
      }
    }
    compacted.push(item);
  }
  while (
    compacted.length > 0 &&
    "divider" in compacted[compacted.length - 1]!
  ) {
    compacted.pop();
  }
  return compacted;
}

export function buildOpsShellNav(
  locale: Locale,
  roles: readonly string[] = [],
): CanvasShellNavItem[] {
  const canAccessApprovalQueue = roles.some((role) =>
    APPROVAL_QUEUE_ALLOWED_ROLES.has(role),
  );

  return compactNav([
    { divider: t("nav.group.workspaces", locale) },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
    },
    { divider: t("nav.group.liveOps", locale) },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter", locale),
    },
    {
      key: "av-fallback",
      href: "/av-fallback",
      icon: "warn",
      label: t("nav.avFallback", locale),
      matchPaths: ["/av-fallback"],
    },
    { divider: t("nav.group.casework", locale) },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
      matchPaths: ["/incidents"],
    },
    ...(canAccessApprovalQueue
      ? [
          {
            key: "approval-requests",
            href: "/approval-requests",
            icon: "audit",
            label: t("nav.approvalRequests", locale),
          } satisfies CanvasShellNavItem,
        ]
      : []),
    { divider: t("nav.group.monitoring", locale) },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance", locale),
    },
    {
      key: "maintenance",
      href: "/maintenance",
      icon: "maintenance",
      label: t("nav.maintenance", locale),
    },
    { divider: t("nav.group.registry", locale) },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags", locale),
    },
  ]);
}
