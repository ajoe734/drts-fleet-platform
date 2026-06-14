"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CanvasShell, type CanvasShellNavItem } from "@drts/ui-web";
import { FleetPortalHealthFooter } from "@/components/fleet-portal-health-footer";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";

export function FleetPortalShell({
  fleetNav,
  referralNav,
  fleetBrandLabel,
  fleetBrandSubLabel,
  fleetBrandMark,
  referralBrandLabel,
  referralBrandSubLabel,
  referralBrandMark,
  searchPlaceholder,
  children,
}: {
  fleetNav: CanvasShellNavItem[];
  referralNav: CanvasShellNavItem[];
  fleetBrandLabel: ReactNode;
  fleetBrandSubLabel: ReactNode;
  fleetBrandMark: ReactNode;
  referralBrandLabel: ReactNode;
  referralBrandSubLabel: ReactNode;
  referralBrandMark: ReactNode;
  searchPlaceholder: string;
  children: ReactNode;
}) {
  const theme = buildFleetTheme();
  const pathname = usePathname();
  const isReferral = pathname.startsWith("/referral");

  return (
    <CanvasShell
      theme={theme}
      nav={isReferral ? referralNav : fleetNav}
      currentPath={pathname}
      brandLabel={isReferral ? referralBrandLabel : fleetBrandLabel}
      brandSubLabel={isReferral ? referralBrandSubLabel : fleetBrandSubLabel}
      brandMark={isReferral ? referralBrandMark : fleetBrandMark}
      searchPlaceholder={searchPlaceholder}
      env="production"
      avatarLabel={isReferral ? "YU" : "CH"}
      sidebarFooter={<FleetPortalHealthFooter />}
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      {children}
    </CanvasShell>
  );
}
