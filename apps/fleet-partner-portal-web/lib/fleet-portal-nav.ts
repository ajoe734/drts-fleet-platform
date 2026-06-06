import type { CanvasShellNavItem } from "@drts/ui-web";
import { t, type Locale } from "./translations";

export function buildFleetPortalNav(locale: Locale): CanvasShellNavItem[] {
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
      key: "drivers",
      href: "/drivers",
      icon: "users",
      label: t("nav.drivers", locale),
      badge: "128",
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
      badge: "4",
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
      badge: "3",
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
