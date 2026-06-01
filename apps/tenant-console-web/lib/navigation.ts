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
  | "notifications"
  | "sla"
  | "integrationGov"
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
  { divider: "工作面 · Workspace" },
  { key: "home", href: "/", icon: "home", label: "工作面 · Home" },
  {
    key: "bookings",
    href: "/bookings",
    icon: "bookings",
    label: "訂單 · Bookings",
    matchPaths: ["/bookings"],
  },
  {
    key: "newbooking",
    href: "/bookings/new",
    icon: "plus",
    label: "新增訂單 · New booking",
  },
  { divider: "資料維護 · Directory" },
  {
    key: "passengers",
    href: "/passengers",
    icon: "passengers",
    label: "乘客 · Passengers",
  },
  {
    key: "addresses",
    href: "/addresses",
    icon: "addresses",
    label: "地址 · Addresses",
  },
  {
    key: "cost-centers",
    href: "/cost-centers",
    icon: "billing",
    label: "成本中心 · Cost centers",
  },
  {
    key: "rules",
    href: "/rules",
    icon: "flags",
    label: "審批規則 · Rules",
  },
  { divider: "帳號與權限 · Access" },
  {
    key: "users",
    href: "/users",
    icon: "users",
    label: "使用者 · Users",
  },
  { divider: "整合 · Integration" },
  {
    key: "api-keys",
    href: "/api-keys",
    icon: "apiKeys",
    label: "API 金鑰 · API keys",
  },
  {
    key: "webhooks",
    href: "/webhooks",
    icon: "webhooks",
    label: "Webhooks",
  },
  {
    key: "notifications",
    href: "/notifications",
    icon: "notifications",
    label: "通知 · Notifications",
  },
  {
    key: "integration-governance",
    href: "/integration-governance",
    icon: "integrationGov",
    label: "整合就緒度 · Integration governance",
  },
  { divider: "服務水準 · SLA" },
  {
    key: "sla",
    href: "/sla",
    icon: "sla",
    label: "SLA",
  },
  { divider: "財務 · Finance" },
  {
    key: "billing",
    href: "/billing",
    icon: "billing",
    label: "帳務概覽 · Billing",
  },
  {
    key: "invoices",
    href: "/invoices",
    icon: "billing",
    label: "發票 · Invoices",
  },
  {
    key: "reports",
    href: "/reports",
    icon: "reports",
    label: "報表 · Reports",
  },
  { divider: "報表與稽核 · Reports & Audit" },
  {
    key: "audit",
    href: "/audit",
    icon: "audit",
    label: "稽核 · Audit",
  },
  { divider: "系統 · System" },
  {
    key: "feature-flags",
    href: "/feature-flags",
    icon: "flags",
    label: "功能旗標 · Feature flags",
  },
  {
    key: "settings",
    href: "/settings",
    icon: "flags",
    label: "設定 · Settings",
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
