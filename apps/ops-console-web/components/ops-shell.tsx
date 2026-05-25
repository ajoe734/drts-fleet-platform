"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";

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
  avatarLabel = "OC",
  versionLabel = "canvas",
  env = "production",
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
      env={env}
      versionLabel={versionLabel}
      avatarLabel={avatarLabel}
      style={{ minHeight: "100vh", height: "100vh" }}
      {...(searchPlaceholder !== undefined ? { searchPlaceholder } : {})}
    >
      {children}
    </CanvasShell>
  );
}
