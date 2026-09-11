"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CanvasShell, type CanvasShellNavItem } from "@drts/ui-web";
import { FleetPortalHealthFooter } from "@/components/fleet-portal-health-footer";
import { buildHostPortalNav, isHostPortalPath } from "@/lib/fleet-portal-nav";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { useTranslation } from "@/lib/i18n";
import { type Locale, t } from "@/lib/translations";

export function resolveFleetPortalEnvLabel(
  env: string | undefined,
  locale: Locale,
): string {
  const normalized = env ? env.trim().toLowerCase() : "";
  if (normalized === "production" || normalized === "prod") {
    return t("shell.env.production", locale);
  }
  if (normalized === "staging" || normalized === "stage") {
    return t("shell.env.staging", locale);
  }
  if (normalized === "preview") {
    return t("shell.env.preview", locale);
  }
  if (normalized === "sandbox") {
    return t("shell.env.sandbox", locale);
  }
  if (normalized === "development" || normalized === "dev") {
    return t("shell.env.dev", locale);
  }
  if (normalized === "test" || normalized === "mock") {
    return t("shell.env.mock", locale);
  }
  if (normalized === "unknown") {
    return t("shell.env.unknown", locale);
  }
  return t("shell.env.unknown", locale);
}

export function FleetPortalShell({
  fleetNav,
  hostOnly = false,
  fleetBrandLabel,
  fleetBrandSubLabel,
  fleetBrandMark,
  searchPlaceholder,
  env,
  children,
}: {
  fleetNav: CanvasShellNavItem[];
  hostOnly?: boolean;
  fleetBrandLabel: ReactNode;
  fleetBrandSubLabel: ReactNode;
  fleetBrandMark: ReactNode;
  searchPlaceholder: string;
  env?: string | undefined;
  children: ReactNode;
}) {
  const theme = buildFleetTheme();
  const pathname = usePathname();
  const { locale } = useTranslation();
  const envLabel = resolveFleetPortalEnvLabel(env, locale);
  const isHost = hostOnly || isHostPortalPath(pathname);

  return (
    <div
      data-testid="fleet-portal-shell"
      data-environment={env ?? "unknown"}
      data-portal-scope={isHost ? "host" : "fleet"}
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      <CanvasShell
        theme={theme}
        nav={isHost ? buildHostPortalNav(locale) : fleetNav}
        currentPath={pathname}
        brandLabel={isHost ? t("host.appName", locale) : fleetBrandLabel}
        brandSubLabel={isHost ? t("host.appSub", locale) : fleetBrandSubLabel}
        brandMark={fleetBrandMark}
        searchPlaceholder={searchPlaceholder}
        env={envLabel}
        avatarLabel="CH"
        sidebarFooter={isHost ? undefined : <FleetPortalHealthFooter />}
        style={{ minHeight: "100dvh", height: "100dvh" }}
      >
        {children}
      </CanvasShell>
    </div>
  );
}
