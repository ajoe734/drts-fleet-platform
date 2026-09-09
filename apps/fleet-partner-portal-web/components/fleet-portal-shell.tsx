"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CanvasShell, type CanvasShellNavItem } from "@drts/ui-web";
import { FleetPortalHealthFooter } from "@/components/fleet-portal-health-footer";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { useTranslation } from "@/lib/i18n";
import {
  type Locale,
  resolveAuthoritativeFleetShellEnv,
} from "@/lib/translations";

export function resolveFleetPortalEnvLabel(
  env: string | undefined,
  locale: Locale,
): string {
  const normalized = env ? env.trim().toLowerCase() : "";
  if (normalized === "production" || normalized === "prod") {
    return locale === "zh" ? "正式環境" : "production";
  }
  if (normalized === "staging" || normalized === "stage") {
    return locale === "zh" ? "預發環境" : "staging";
  }
  if (normalized === "preview") {
    return locale === "zh" ? "預覽環境" : "preview";
  }
  if (normalized === "sandbox") {
    return locale === "zh" ? "沙盒環境" : "sandbox";
  }
  if (normalized === "development" || normalized === "dev") {
    return locale === "zh" ? "開發環境" : "development";
  }
  if (normalized === "test" || normalized === "mock") {
    return locale === "zh" ? "模擬資料" : "mock data";
  }
  if (normalized === "unknown") {
    return locale === "zh" ? "未知環境" : "unknown";
  }
  return resolveAuthoritativeFleetShellEnv(locale);
}

export function FleetPortalShell({
  fleetNav,
  fleetBrandLabel,
  fleetBrandSubLabel,
  fleetBrandMark,
  searchPlaceholder,
  env,
  children,
}: {
  fleetNav: CanvasShellNavItem[];
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

  return (
    <div
      data-testid="fleet-portal-shell"
      data-environment={env ?? "unknown"}
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      <CanvasShell
        theme={theme}
        nav={fleetNav}
        currentPath={pathname}
        brandLabel={fleetBrandLabel}
        brandSubLabel={fleetBrandSubLabel}
        brandMark={fleetBrandMark}
        searchPlaceholder={searchPlaceholder}
        env={envLabel}
        avatarLabel="CH"
        sidebarFooter={<FleetPortalHealthFooter />}
        style={{ minHeight: "100dvh", height: "100dvh" }}
      >
        {children}
      </CanvasShell>
    </div>
  );
}
