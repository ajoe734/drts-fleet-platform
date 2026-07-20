"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import {
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";
import { OpsHealthFooter } from "@/components/ops-health-footer";


type OpsShellProps = {
  nav: CanvasShellNavItem[];
  brandLabel: ReactNode;
  brandSubLabel: ReactNode;
  searchPlaceholder?: string;
  avatarLabel?: ReactNode;
  versionLabel?: ReactNode;
  env?: string;
  children: ReactNode;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function deriveBreadcrumb(
  nav: CanvasShellNavItem[],
  pathname: string,
): ReactNode[] {
  const matched = nav.find((item) => {
    if (!item.href) {
      return false;
    }
    const candidates = [item.href, ...(item.matchPaths ?? [])];
    return candidates.some(
      (match) => pathname === match || pathname.startsWith(`${match}/`),
    );
  });

  return matched?.label ? [matched.label] : [];
}

import { useSosSound } from "@/components/sos-sound-context";

export function OpsShell({
  nav,
  brandLabel,
  brandSubLabel,
  searchPlaceholder,
  avatarLabel,
  versionLabel,
  env,
  children,
}: OpsShellProps) {
  const pathname = usePathname() ?? "";
  const { pendingCount } = useSosSound();

  let currentNav = nav;
  if (pathname.startsWith("/sos")) {
    currentNav = [
      { divider: "智行叫車 · 值班" },
      {
        key: "board",
        href: "/sos/board",
        icon: "dispatch",
        label: "派車看板 · Board",
      },
      {
        key: "sos",
        href: "/sos",
        icon: "incidents",
        label: "SOS 緊急事件",
        badge: pendingCount > 0 ? String(pendingCount) : undefined,
        badgeTone: "danger",
      },
      {
        key: "trips",
        href: "/sos/trips",
        icon: "reports",
        label: "行程 · Trips",
      },
      {
        key: "records",
        href: "/sos/records",
        icon: "audit",
        label: "營運紀錄 · Records",
      },
    ];
  }


  const breadcrumb = deriveBreadcrumb(currentNav, pathname);

  return (
    <CanvasShell
      theme={theme}
      nav={currentNav}
      currentPath={pathname}
      brandLabel={brandLabel}
      brandSubLabel={brandSubLabel}
      breadcrumb={breadcrumb}
      sidebarFooter={<OpsHealthFooter />}
      style={{ minHeight: "100dvh", height: "100dvh" }}
      {...(env !== undefined ? { env } : {})}
      {...(versionLabel !== undefined ? { versionLabel } : {})}
      {...(avatarLabel !== undefined ? { avatarLabel } : {})}
      {...(searchPlaceholder !== undefined ? { searchPlaceholder } : {})}
    >
      {children}
    </CanvasShell>
  );
}

