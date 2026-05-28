import type { CanvasTone } from "@drts/ui-web";

export const TENANT_CONSOLE_BRAND = "DRTS";
export const TENANT_CONSOLE_BRAND_SUB = "TENANT CONSOLE";
export const TENANT_CONSOLE_CONTEXT = "YAMATO 大和商務集團";
export const TENANT_CONSOLE_ENV = "production";
export const TENANT_CONSOLE_VERSION = "v0.1.0";
export const TENANT_CONSOLE_SEARCH_PLACEHOLDER =
  "搜尋叫車、乘客、對帳單、報表…";

type TenantNavIcon =
  | "home"
  | "bookings"
  | "plus"
  | "passengers"
  | "addresses"
  | "billing"
  | "flags"
  | "reports"
  | "apiKeys"
  | "webhooks"
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
  { key: "home", href: "/", icon: "home", label: "首頁" },
  {
    key: "bookings",
    href: "/bookings",
    icon: "bookings",
    label: "叫車",
    badge: "5",
    badgeTone: "accent",
    matchPaths: ["/bookings"],
  },
  {
    key: "newbooking",
    href: "/bookings/new",
    icon: "plus",
    label: "建立叫車",
  },
  { divider: "通訊錄" },
  {
    key: "passengers",
    href: "/passengers",
    icon: "passengers",
    label: "乘客",
  },
  {
    key: "addresses",
    href: "/addresses",
    icon: "addresses",
    label: "地址簿",
  },
  {
    key: "costcenter",
    href: "/cost-centers",
    icon: "billing",
    label: "成本中心",
  },
  {
    key: "rules",
    href: "/rules",
    icon: "flags",
    label: "審批與配額",
  },
  { divider: "帳務" },
  {
    key: "invoices",
    href: "/invoices",
    icon: "billing",
    label: "對帳單",
  },
  {
    key: "reports",
    href: "/reports",
    icon: "reports",
    label: "報表",
  },
  { divider: "整合" },
  {
    key: "apikeys",
    href: "/api-keys",
    icon: "apiKeys",
    label: "API 金鑰",
  },
  {
    key: "webhooks",
    href: "/webhooks",
    icon: "webhooks",
    label: "Webhook",
  },
  {
    key: "integrationgovernance",
    href: "/integration-governance",
    icon: "flags",
    label: "整合就緒度",
  },
  {
    key: "audit",
    href: "/audit",
    icon: "audit",
    label: "稽核",
  },
  { divider: "組織" },
  {
    key: "users",
    href: "/users",
    icon: "users",
    label: "人員與角色",
  },
  {
    key: "settings",
    href: "/settings",
    icon: "flags",
    label: "租戶設定",
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
