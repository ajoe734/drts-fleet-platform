import type { CrossAppResourceLink } from "@drts/contracts";

/**
 * Phase 1 keeps the four apps as separate deployments, so cross-app
 * navigation is a deep link to a different deployed origin (Q-X03). Base
 * origins come from env so the booking-create page never hard-codes a host.
 */
const CROSS_APP_BASE_URLS: Record<CrossAppResourceLink["targetApp"], string> = {
  "ops-console":
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3002",
  "platform-admin":
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3003",
  "tenant-console": process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "",
};

export interface ResolvedCrossAppLink {
  href: string;
  label: string;
  target: "_blank" | "_self";
  rel?: string;
  external: boolean;
}

/**
 * Resolve a `CrossAppResourceLink` into the props an anchor needs. New-tab
 * links (the Q-X03 default) get `target="_blank"` + `rel="noopener
 * noreferrer"`; same-tab links stay in the current app.
 */
export function resolveCrossAppLink(
  link: CrossAppResourceLink,
): ResolvedCrossAppLink {
  const base = CROSS_APP_BASE_URLS[link.targetApp] ?? "";
  const newTab = link.openMode === "new_tab";

  return {
    href: `${base}${link.route}`,
    label: link.label,
    target: newTab ? "_blank" : "_self",
    rel: newTab ? "noopener noreferrer" : undefined,
    external: link.targetApp !== "tenant-console",
  };
}
