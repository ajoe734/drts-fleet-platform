import type { CrossAppResourceLink } from "@drts/contracts";

/**
 * Cross-app deep links for tenant-console (packet §3.10 / Q-X03).
 *
 * Phase 1 keeps the four apps as separate deployments, so a cross-app jump is
 * a deep link to a different deployed origin, opened in a new tab by default.
 * Invoices are published by platform/system finance governance (see the audit
 * trail: `system.invoice-generator` and `pa_finance_gov` `invoice.publish`),
 * so a tenant raising a billing discrepancy lands in platform-admin payments /
 * reconciliation — read-scoped for this tenant.
 */

const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";

function resolvePlatformAdminBase(): string {
  const envValue =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
    process.env.DRTS_PLATFORM_ADMIN_URL ??
    "";
  const trimmed = envValue.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_PLATFORM_ADMIN_BASE;
}

/**
 * Deep link into platform-admin payments / reconciliation for a specific
 * invoice so a tenant can raise or follow a billing dispute against it.
 */
export function platformAdminInvoiceReconciliationLink(
  invoiceId: string,
  label: string,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/payments?invoice=${encodeURIComponent(invoiceId)}`,
    resourceType: "invoice_reconciliation",
    resourceId: invoiceId,
    openMode: "new_tab",
    label,
  };
}

/**
 * Resolve a `CrossAppResourceLink` to an absolute (or origin-relative) href.
 * Only platform-admin targets are produced from tenant-console today; other
 * target apps fall back to the route verbatim.
 */
export function crossAppHref(link: CrossAppResourceLink): string {
  const base =
    link.targetApp === "platform-admin" ? resolvePlatformAdminBase() : "";
  const path = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${base}${path}`;
}
