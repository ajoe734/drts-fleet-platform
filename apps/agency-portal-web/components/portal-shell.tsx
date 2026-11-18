"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Badge,
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";

import { useTranslation } from "@/lib/i18n";
import {
  AGENCY_NAV_GROUP_LABEL_KEYS,
  findAgencyNavHref,
  getAgencyNav,
} from "@/lib/navigation";
import type { Locale } from "@/lib/translations";
import { LanguageSwitch } from "./language-switch";
import { LogoutButton } from "./logout-button";
import { PrgMask } from "./prg-mask";

// Same shell, sidebar and tokens as the other consoles, in the light palette:
// the report pages inside it are light tables and cards.
const agencyCanvasTheme = buildCanvasTheme({
  surface: "platform",
  dark: false,
  density: "compact",
});

/** Every page states read-only, PII masked and that the query is access-logged. */
export function PortalShell({
  children,
  agencyName,
  locale: explicitLocale,
}: {
  children: ReactNode;
  agencyName?: string | null;
  locale?: Locale;
}) {
  const { locale, t } = useTranslation(explicitLocale);
  const pathname = usePathname();
  const navItems = getAgencyNav(locale);
  const activeHref = findAgencyNavHref(pathname);
  const activeItem = navItems.find((item) => item.href === activeHref);

  const nav: CanvasShellNavItem[] = [];
  let previousGroup: string | null = null;
  for (const item of navItems) {
    if (item.group !== previousGroup && item.group !== "overview") {
      nav.push({ divider: t(AGENCY_NAV_GROUP_LABEL_KEYS[item.group]) });
    }
    previousGroup = item.group;
    nav.push({
      key: item.href,
      href: item.href,
      label: item.label,
      icon: item.icon,
    });
  }

  return (
    <div
      data-testid="agency-portal-shell"
      style={{
        height: "100dvh",
        minHeight: "100dvh",
        background: agencyCanvasTheme.bg,
      }}
    >
      <CanvasShell
        theme={agencyCanvasTheme}
        nav={nav}
        brandLabel="DRTS"
        brandSubLabel={t("shell.brand.sub")}
        breadcrumb={[
          agencyName ?? t("shell.title"),
          ...(activeItem ? [activeItem.label] : []),
        ]}
        hideEnv
        style={{ height: "100dvh", minHeight: "100dvh" }}
        headerControls={
          <>
            <Badge variant="blue">{t("shell.readOnly")}</Badge>
            <PrgMask labelKey="shell.masked" locale={locale} />
            <LanguageSwitch locale={locale} />
            <LogoutButton locale={locale} />
          </>
        }
        {...(activeHref ? { active: activeHref } : {})}
      >
        <p
          role="note"
          style={{
            margin: 0,
            padding: "8px 24px",
            fontSize: 12.5,
            color: "#92400e",
            background: "#fffbeb",
            borderBottom: "1px solid #fde68a",
          }}
        >
          <strong style={{ marginRight: 8 }}>{t("shell.title")}</strong>
          {t("shell.auditBanner")}
        </p>
        <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
          {children}
        </div>
      </CanvasShell>
    </div>
  );
}
