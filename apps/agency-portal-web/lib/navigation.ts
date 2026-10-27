import { type Locale, type TranslationKey, t } from "./translations";

export const AGENCY_NAV_ITEMS: readonly {
  href: string;
  labelKey: TranslationKey;
}[] = [
  { href: "/", labelKey: "nav.home" },
  { href: "/trip-records", labelKey: "nav.tripRecords" },
  { href: "/trip-records/exports", labelKey: "nav.tripExports" },
  { href: "/reports/operations", labelKey: "nav.operations" },
  { href: "/reports/complaints", labelKey: "nav.complaints" },
  { href: "/reports/daily-dispatch", labelKey: "nav.dailyDispatch" },
  { href: "/qualifications/vehicles", labelKey: "nav.vehicles" },
  { href: "/qualifications/drivers", labelKey: "nav.drivers" },
] as const;

export function getAgencyNav(locale: Locale = "zh") {
  return AGENCY_NAV_ITEMS.map((item) => ({
    href: item.href,
    labelKey: item.labelKey,
    label: t(item.labelKey, undefined, locale),
  }));
}

export const AGENCY_NAV = getAgencyNav("zh");
