import { type Locale, type TranslationKey, t } from "./translations";

export type AgencyNavGroup = "overview" | "records" | "reports" | "licences";

/** Icon names come from the shared canvas icon set in `@drts/ui-web`. */
export const AGENCY_NAV_ITEMS: readonly {
  href: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey | null;
  group: AgencyNavGroup;
  icon:
    | "home"
    | "bookings"
    | "ext"
    | "dashboard"
    | "complaints"
    | "dispatch"
    | "vehicles"
    | "users";
}[] = [
  {
    href: "/",
    labelKey: "nav.home",
    descriptionKey: null,
    group: "overview",
    icon: "home",
  },
  {
    href: "/trip-records",
    labelKey: "nav.tripRecords",
    descriptionKey: "nav.tripRecords.description",
    group: "records",
    icon: "bookings",
  },
  {
    href: "/trip-records/exports",
    labelKey: "nav.tripExports",
    descriptionKey: "nav.tripExports.description",
    group: "records",
    icon: "ext",
  },
  {
    href: "/reports/operations",
    labelKey: "nav.operations",
    descriptionKey: "nav.operations.description",
    group: "reports",
    icon: "dashboard",
  },
  {
    href: "/reports/complaints",
    labelKey: "nav.complaints",
    descriptionKey: "nav.complaints.description",
    group: "reports",
    icon: "complaints",
  },
  {
    href: "/reports/daily-dispatch",
    labelKey: "nav.dailyDispatch",
    descriptionKey: "nav.dailyDispatch.description",
    group: "reports",
    icon: "dispatch",
  },
  {
    href: "/qualifications/vehicles",
    labelKey: "nav.vehicles",
    descriptionKey: "nav.vehicles.description",
    group: "licences",
    icon: "vehicles",
  },
  {
    href: "/qualifications/drivers",
    labelKey: "nav.drivers",
    descriptionKey: "nav.drivers.description",
    group: "licences",
    icon: "users",
  },
] as const;

export const AGENCY_NAV_GROUP_LABEL_KEYS: Record<
  Exclude<AgencyNavGroup, "overview">,
  TranslationKey
> = {
  records: "nav.group.records",
  reports: "nav.group.reports",
  licences: "nav.group.licences",
};

export function getAgencyNav(locale: Locale = "zh") {
  return AGENCY_NAV_ITEMS.map((item) => ({
    href: item.href,
    labelKey: item.labelKey,
    label: t(item.labelKey, undefined, locale),
    description: item.descriptionKey
      ? t(item.descriptionKey, undefined, locale)
      : null,
    group: item.group,
    icon: item.icon,
  }));
}

/** The nav entry a path belongs to: the longest href that prefixes it. */
export function findAgencyNavHref(pathname: string | null | undefined) {
  if (!pathname) return null;
  let best: string | null = null;
  for (const item of AGENCY_NAV_ITEMS) {
    const matches =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

export const AGENCY_NAV = getAgencyNav("zh");
