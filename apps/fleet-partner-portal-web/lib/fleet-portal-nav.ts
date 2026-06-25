import type { CanvasShellNavItem } from "@drts/ui-web";
import { t, type Locale } from "./translations";
import type { NavBadges } from "./fleet-portal-data.server";

// A nav badge is shown only when its live/seam-derived count is > 0; a zero or
// absent count renders no badge (rather than a hardcoded design number).
function badgeFor(count: number | undefined): string | undefined {
  return count && count > 0 ? String(count) : undefined;
}

export function buildFleetPortalNav(
  locale: Locale,
  badges?: NavBadges,
): CanvasShellNavItem[] {
  return [
    { divider: t("nav.workspace", locale) },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
    },
    { divider: t("nav.supply", locale) },
    {
      key: "submissions",
      href: "/submissions",
      icon: "audit",
      label: t("nav.submissions", locale),
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "users",
      label: t("nav.drivers", locale),
      badge: badgeFor(badges?.drivers),
      badgeTone: "accent",
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "trips",
      href: "/trips",
      icon: "dispatch",
      label: t("nav.trips", locale),
    },
    { divider: t("nav.revenue", locale) },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenueShare", locale),
    },
    {
      key: "statements",
      href: "/statements",
      icon: "billing",
      label: t("nav.statements", locale),
    },
    { divider: t("nav.qualityGroup", locale) },
    {
      key: "documents",
      href: "/documents",
      icon: "audit",
      label: t("nav.documents", locale),
      badge: badgeFor(badges?.documents),
      badgeTone: "warn",
    },
    {
      key: "training",
      href: "/training",
      icon: "reports",
      label: t("nav.training", locale),
    },
    {
      key: "cases",
      href: "/cases",
      icon: "incidents",
      label: t("nav.cases", locale),
      badge: badgeFor(badges?.cases),
      badgeTone: "danger",
    },
    {
      key: "quality",
      href: "/quality",
      icon: "health",
      label: t("nav.quality", locale),
    },
  ];
}
