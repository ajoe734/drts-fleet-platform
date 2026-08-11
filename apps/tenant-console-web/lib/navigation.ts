import type { CanvasTone } from "@drts/ui-web";
import { t as defaultTranslate } from "@/lib/translations";

export const TENANT_CONSOLE_BRAND = "DRTS";
export const TENANT_CONSOLE_ENV =
  process.env.NEXT_PUBLIC_TENANT_CONSOLE_ENV ?? "production";
export const TENANT_CONSOLE_VERSION = "v0.1.0";

type Translate = (key: string) => string;

type TenantNavIcon =
  | "home"
  | "bookings"
  | "bell"
  | "plus"
  | "passengers"
  | "addresses"
  | "billing"
  | "flags"
  | "reports"
  | "apiKeys"
  | "webhooks"
  | "integrationGov"
  | "sla"
  | "audit"
  | "users";

type TenantNavDivider = {
  divider: string;
};

export type TenantNavItem = {
  key: string;
  href: string;
  label: string;
  icon: TenantNavIcon;
  badge?: string;
  badgeTone?: CanvasTone;
  matchPaths?: string[];
};

export type TenantNavEntry = TenantNavDivider | TenantNavItem;

export function createTenantNavEntries(t: Translate): TenantNavEntry[] {
  return [
    { divider: t("shell.nav.workspace") },
    { key: "home", href: "/", icon: "home", label: t("nav.home") },
    {
      key: "bookings",
      href: "/bookings",
      icon: "bookings",
      label: t("nav.bookings"),
      badge: "5",
      badgeTone: "accent",
      matchPaths: ["/bookings"],
    },
    {
      key: "newbooking",
      href: "/bookings/new",
      icon: "plus",
      label: t("nav.newBooking"),
    },
    { divider: t("shell.nav.directory") },
    {
      key: "passengers",
      href: "/passengers",
      icon: "passengers",
      label: t("nav.passengers"),
    },
    {
      key: "addresses",
      href: "/addresses",
      icon: "addresses",
      label: t("nav.addresses"),
    },
    {
      key: "costcenter",
      href: "/cost-centers",
      icon: "billing",
      label: t("nav.costCenters"),
    },
    {
      key: "rules",
      href: "/rules",
      icon: "flags",
      label: t("nav.rules"),
    },
    { divider: t("shell.nav.access") },
    {
      key: "users",
      href: "/users",
      icon: "users",
      label: t("nav.users"),
    },
    {
      key: "sessions",
      href: "/sessions",
      icon: "users",
      label: t("nav.sessions"),
    },
    { divider: t("shell.nav.notifications") },
    {
      key: "notifications",
      href: "/notifications",
      icon: "bell",
      label: t("nav.notifications"),
    },
    {
      key: "sla",
      href: "/sla",
      icon: "sla",
      label: t("nav.sla"),
    },
    { divider: t("shell.nav.finance") },
    {
      key: "billing",
      href: "/billing",
      icon: "billing",
      label: t("nav.billing"),
    },
    {
      key: "invoices",
      href: "/invoices",
      icon: "billing",
      label: t("nav.invoices"),
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports"),
    },
    { divider: t("shell.nav.integration") },
    {
      key: "apikeys",
      href: "/api-keys",
      icon: "apiKeys",
      label: t("nav.apiKeys"),
    },
    {
      key: "webhooks",
      href: "/webhooks",
      icon: "webhooks",
      label: t("nav.webhooks"),
    },
    {
      key: "integration-governance",
      href: "/integration-governance",
      icon: "integrationGov",
      label: t("nav.integrationGovernance"),
    },
    { divider: t("shell.nav.system") },
    {
      key: "featureflags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags"),
    },
    {
      key: "settings",
      href: "/settings",
      icon: "flags",
      label: t("nav.settings"),
    },
    {
      key: "audit",
      href: "/audit",
      icon: "audit",
      label: t("nav.audit"),
    },
  ];
}

export const tenantNavEntries = createTenantNavEntries(defaultTranslate);

export const tenantNavItems = tenantNavEntries.filter(
  (entry): entry is TenantNavItem => "href" in entry,
);

export function isNavItemActive(pathname: string, item: TenantNavItem) {
  const matches = [item.href, ...(item.matchPaths ?? [])];
  return matches.some(
    (match) => pathname === match || pathname.startsWith(`${match}/`),
  );
}

export function findNavItem(
  pathname: string,
  entries: TenantNavEntry[] = tenantNavEntries,
) {
  const items = entries.filter(
    (entry): entry is TenantNavItem => "href" in entry,
  );
  const itemsBySpecificity = [...items].sort((left, right) => {
    return right.href.length - left.href.length;
  });

  for (const item of itemsBySpecificity) {
    if (isNavItemActive(pathname, item)) {
      return item;
    }
  }

  return items[0] ?? null;
}
