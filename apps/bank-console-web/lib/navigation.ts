import type { CanvasTone } from "@drts/ui-web";
import { t, type Locale } from "@/lib/translations";

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

function hrefWithQuery(href: string, queryString = "") {
  if (!queryString) {
    return href;
  }

  return `${href}?${queryString}`;
}

export function buildBankNavEntries(
  locale: Locale = "zh",
  queryString = "",
): BankNavEntry[] {
  return [
    { divider: t("nav.section.workspace", locale) },
    {
      key: "home",
      href: hrefWithQuery("/", queryString),
      icon: "home",
      label: t("nav.home", locale),
    },
    {
      key: "bookings",
      href: hrefWithQuery("/bookings", queryString),
      icon: "bookings",
      label: t("nav.bookings", locale),
      matchPaths: ["/bookings"],
    },
    { divider: t("nav.section.finance", locale) },
    {
      key: "contracts",
      href: hrefWithQuery("/contracts", queryString),
      icon: "sla",
      label: t("nav.contracts", locale),
      matchPaths: ["/contracts"],
    },
    {
      key: "statements",
      href: hrefWithQuery("/statements", queryString),
      icon: "billing",
      label: t("nav.statements", locale),
      matchPaths: ["/statements"],
    },
    {
      key: "programs",
      href: hrefWithQuery("/programs", queryString),
      icon: "reports",
      label: t("nav.programs", locale),
    },
    { divider: t("nav.section.governance", locale) },
    {
      key: "users",
      href: hrefWithQuery("/users", queryString),
      icon: "users",
      label: t("nav.users", locale),
    },
    {
      key: "audit",
      href: hrefWithQuery("/audit", queryString),
      icon: "audit",
      label: t("nav.audit", locale),
    },
  ];
}

export const bankNavEntries: BankNavEntry[] = buildBankNavEntries();

function navItemsFor(entries: BankNavEntry[]) {
  return entries.filter((entry): entry is BankNavItem => "href" in entry);
}

export const bankNavItems = navItemsFor(bankNavEntries);

function hrefPath(href: string) {
  return href.split("?")[0] ?? href;
}

export function isNavItemActive(pathname: string, item: BankNavItem) {
  const matches = [hrefPath(item.href), ...(item.matchPaths ?? [])];
  return matches.some(
    (match) => pathname === match || pathname.startsWith(`${match}/`),
  );
}

export function findNavItem(pathname: string, entries = bankNavEntries) {
  const itemsBySpecificity = [...navItemsFor(entries)].sort((left, right) => {
    return hrefPath(right.href).length - hrefPath(left.href).length;
  });

  for (const item of itemsBySpecificity) {
    if (isNavItemActive(pathname, item)) {
      return item;
    }
  }

  return navItemsFor(entries)[0] ?? null;
}
