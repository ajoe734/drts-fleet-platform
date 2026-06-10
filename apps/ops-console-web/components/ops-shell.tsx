"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
  const breadcrumb = deriveBreadcrumb(nav, pathname);

  return (
    <CanvasShell
      theme={theme}
      nav={nav}
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
