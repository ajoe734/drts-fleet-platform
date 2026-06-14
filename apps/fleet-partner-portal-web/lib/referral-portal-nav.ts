import type { CanvasShellNavItem } from "@drts/ui-web";
import { t, type Locale } from "./translations";

export function buildReferralPortalNav(locale: Locale): CanvasShellNavItem[] {
  return [
    { divider: t("referral.nav.workspace", locale) },
    {
      key: "ref-dashboard",
      href: "/referral/dashboard",
      icon: "dashboard",
      label: t("referral.nav.dashboard", locale),
    },
    {
      key: "ref-usage",
      href: "/referral/usage",
      icon: "reports",
      label: t("referral.nav.usage", locale),
    },
    { divider: t("referral.nav.revenue", locale) },
    {
      key: "ref-statements",
      href: "/referral/statements",
      icon: "billing",
      label: t("referral.nav.statements", locale),
    },
  ];
}
