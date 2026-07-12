import type { CanvasShellNavItem } from "@drts/ui-web";
import { t, type Locale } from "@/lib/translations";

/**
 * ROC Console left-nav (decision packet §4.5 shell behaviour). Structure only —
 * the routes are placeholders until the visual-team canvas defines the screens.
 * Icons reuse the shared `@drts/ui-web` canvas icon set; no bespoke iconography
 * is introduced.
 */
export function buildRocShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    { divider: t("nav.group.monitoring", locale) },
    {
      key: "overview",
      href: "/overview",
      icon: "dashboard",
      label: t("nav.overview", locale),
    },
    {
      key: "liveboard",
      href: "/liveboard",
      icon: "switchboard",
      label: t("nav.liveboard", locale),
    },
    {
      key: "trips",
      href: "/trips",
      icon: "car",
      label: t("nav.trips", locale),
    },
    { divider: t("nav.group.fleet", locale) },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    { divider: t("nav.group.response", locale) },
    {
      key: "takeover",
      href: "/takeover",
      icon: "dispatch",
      label: t("nav.takeover", locale),
      badge: "3",
      badgeTone: "warn",
    },
    {
      key: "alerts",
      href: "/alerts",
      icon: "bell",
      label: t("nav.alerts", locale),
      badge: "5",
      badgeTone: "warn",
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
      badge: "1",
      badgeTone: "danger",
    },
    {
      key: "evidence",
      href: "/evidence",
      icon: "audit",
      label: t("nav.evidence", locale),
    },
    { divider: t("nav.group.regulatory", locale) },
    {
      key: "provider-health",
      href: "/provider",
      icon: "health",
      label: t("nav.providerHealth", locale),
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "handover",
      href: "/handover",
      icon: "users",
      label: t("nav.handover", locale),
    },
  ];
}
