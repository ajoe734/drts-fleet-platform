"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CanvasShell, type CanvasShellNavItem } from "@drts/ui-web";
import { FleetPortalHealthFooter } from "@/components/fleet-portal-health-footer";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";

export function FleetPortalShell({
  fleetNav,
  fleetBrandLabel,
  fleetBrandSubLabel,
  fleetBrandMark,
  searchPlaceholder,
  children,
}: {
  fleetNav: CanvasShellNavItem[];
  fleetBrandLabel: ReactNode;
  fleetBrandSubLabel: ReactNode;
  fleetBrandMark: ReactNode;
  searchPlaceholder: string;
  children: ReactNode;
}) {
  const theme = buildFleetTheme();
  const pathname = usePathname();

  return (
    <CanvasShell
      theme={theme}
      nav={fleetNav}
      currentPath={pathname}
      brandLabel={fleetBrandLabel}
      brandSubLabel={fleetBrandSubLabel}
      brandMark={fleetBrandMark}
      searchPlaceholder={searchPlaceholder}
      env="production"
      avatarLabel="CH"
      sidebarFooter={<FleetPortalHealthFooter />}
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      {children}
    </CanvasShell>
  );
}
