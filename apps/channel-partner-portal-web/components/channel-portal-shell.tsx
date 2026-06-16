"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CanvasShell, type CanvasShellNavItem } from "@drts/ui-web";
import { FleetPortalHealthFooter } from "@/components/fleet-portal-health-footer";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";

export function ChannelPortalShell({
  nav,
  brandLabel,
  brandSubLabel,
  brandMark,
  searchPlaceholder,
  children,
}: {
  nav: CanvasShellNavItem[];
  brandLabel: ReactNode;
  brandSubLabel: ReactNode;
  brandMark: ReactNode;
  searchPlaceholder: string;
  children: ReactNode;
}) {
  const theme = buildFleetTheme();
  const pathname = usePathname();

  return (
    <CanvasShell
      theme={theme}
      nav={nav}
      currentPath={pathname}
      brandLabel={brandLabel}
      brandSubLabel={brandSubLabel}
      brandMark={brandMark}
      searchPlaceholder={searchPlaceholder}
      env="production"
      avatarLabel="YU"
      sidebarFooter={<FleetPortalHealthFooter />}
      style={{ minHeight: "100dvh", height: "100dvh" }}
    >
      {children}
    </CanvasShell>
  );
}
