import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FleetPortalShell } from "@/components/fleet-portal-shell";
import { buildFleetPortalNav } from "@/lib/fleet-portal-nav";
import { loadNavBadges } from "@/lib/fleet-portal-data.server";
import { LanguageProvider } from "@/lib/i18n";
import { RuntimeConfigScript } from "@/lib/runtime-config";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fleet Partner Portal",
  description:
    "Partner-facing self-service portal for fleet partners: drivers, vehicles, trips, revenue share, statements, documents, training, cases, and quality metrics.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const badges = await loadNavBadges();
  const fleetNav = buildFleetPortalNav(locale, badges);

  return (
    <html lang={locale}>
      <body style={{ margin: 0, minHeight: "100dvh", overflow: "hidden" }}>
        <RuntimeConfigScript />
        <LanguageProvider defaultLocale={locale}>
          <FleetPortalShell
            fleetNav={fleetNav}
            fleetBrandLabel={t("app.name", locale)}
            fleetBrandSubLabel={t("app.sub", locale)}
            fleetBrandMark={t("app.brandMark", locale)}
            searchPlaceholder={t("common.search", locale)}
          >
            {children}
          </FleetPortalShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
