import type { CanvasTone } from "@drts/ui-web";
import { t } from "@/lib/translations";

export const TENANT_CONSOLE_BRAND = "DRTS";
export const TENANT_CONSOLE_BRAND_SUB = "TENANT CONSOLE";
export const TENANT_CONSOLE_CONTEXT = "YAMATO 大和商務集團";
export const TENANT_CONSOLE_ENV = "production";
export const TENANT_CONSOLE_VERSION = "v0.1.0";
export const TENANT_CONSOLE_SEARCH_PLACEHOLDER = t("shell.search");

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

export const tenantNavEntries: TenantNavEntry[] = [
  { divider: "工作面" },
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
  { divider: "通訊錄與規則" },
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
  { divider: "帳號與權限" },
  {
    key: "users",
    href: "/users",
    icon: "users",
    label: t("nav.users"),
  },
  { divider: "整合與通知" },
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
  { divider: "帳務與報表" },
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
  { divider: "整合" },
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
  { divider: "系統與稽核" },
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

export const tenantNavItems = tenantNavEntries.filter(
  (entry): entry is TenantNavItem => "href" in entry,
);

const tenantNavItemsBySpecificity = [...tenantNavItems].sort((left, right) => {
  return right.href.length - left.href.length;
});

export function isNavItemActive(pathname: string, item: TenantNavItem) {
  const matches = [item.href, ...(item.matchPaths ?? [])];
  return matches.some(
    (match) => pathname === match || pathname.startsWith(`${match}/`),
  );
}

export function findNavItem(pathname: string) {
  for (const item of tenantNavItemsBySpecificity) {
    if (isNavItemActive(pathname, item)) {
      return item;
    }
  }

  return tenantNavItems[0] ?? null;
}
