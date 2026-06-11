import type { CanvasTone } from "@drts/ui-web";
import { t } from "@/lib/translations";

export const BANK_CONSOLE_BRAND = "DRTS";
export const BANK_CONSOLE_BRAND_SUB = "BANK CONSOLE";
// Issuer tenant identity (data layer only); chrome stays on the tenant realm.
export const BANK_CONSOLE_CONTEXT = "中信銀行 · CTBC ISSUER";
export const BANK_CONSOLE_ENV = "preview";
export const BANK_CONSOLE_VERSION = "v0.1.0";
export const BANK_CONSOLE_SEARCH_PLACEHOLDER = t("shell.search");

// Icons reuse the CanvasShell icon set already exercised by tenant-console.
type BankNavIcon =
  | "home"
  | "bookings"
  | "sla"
  | "billing"
  | "reports"
  | "users"
  | "audit";

type BankNavDivider = {
  divider: string;
};

export type BankNavItem = {
  key: string;
  href: string;
  label: string;
  icon: BankNavIcon;
  badge?: string;
  badgeTone?: CanvasTone;
  matchPaths?: string[];
};

export type BankNavEntry = BankNavDivider | BankNavItem;

export const bankNavEntries: BankNavEntry[] = [
  { divider: t("nav.section.workspace") },
  { key: "home", href: "/", icon: "home", label: t("nav.home") },
  {
    key: "bookings",
    href: "/bookings",
    icon: "bookings",
    label: t("nav.bookings"),
    matchPaths: ["/bookings"],
  },
  { divider: t("nav.section.finance") },
  {
    key: "contracts",
    href: "/contracts",
    icon: "sla",
    label: t("nav.contracts"),
    matchPaths: ["/contracts"],
  },
  {
    key: "statements",
    href: "/statements",
    icon: "billing",
    label: t("nav.statements"),
    matchPaths: ["/statements"],
  },
  {
    key: "programs",
    href: "/programs",
    icon: "reports",
    label: t("nav.programs"),
  },
  { divider: t("nav.section.governance") },
  {
    key: "users",
    href: "/users",
    icon: "users",
    label: t("nav.users"),
  },
  {
    key: "audit",
    href: "/audit",
    icon: "audit",
    label: t("nav.audit"),
  },
];

export const bankNavItems = bankNavEntries.filter(
  (entry): entry is BankNavItem => "href" in entry,
);

const bankNavItemsBySpecificity = [...bankNavItems].sort((left, right) => {
  return right.href.length - left.href.length;
});

export function isNavItemActive(pathname: string, item: BankNavItem) {
  const matches = [item.href, ...(item.matchPaths ?? [])];
  return matches.some(
    (match) => pathname === match || pathname.startsWith(`${match}/`),
  );
}

export function findNavItem(pathname: string) {
  for (const item of bankNavItemsBySpecificity) {
    if (isNavItemActive(pathname, item)) {
      return item;
    }
  }

  return bankNavItems[0] ?? null;
}
