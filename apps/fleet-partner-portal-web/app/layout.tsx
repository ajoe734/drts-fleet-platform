import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FleetPortalShell } from "@/components/fleet-portal-shell";
import { buildFleetPortalNav } from "@/lib/fleet-portal-nav";
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
  const nav = buildFleetPortalNav(locale);

  return (
    <html lang={locale}>
      <body style={{ margin: 0 }}>
        <FleetPortalShell
          nav={nav}
          brandLabel={t("app.name", locale)}
          brandSubLabel={t("app.sub", locale)}
          brandMark={t("app.brandMark", locale)}
          searchPlaceholder={t("common.search", locale)}
        >
          {children}
        </FleetPortalShell>
      </body>
    </html>
  );
}
