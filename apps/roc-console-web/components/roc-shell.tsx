"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";
import { RocHealthFooter } from "@/components/roc-health-footer";

type RocShellProps = {
  nav: CanvasShellNavItem[];
  brandLabel: ReactNode;
  brandSubLabel: ReactNode;
  searchPlaceholder?: string;
  avatarLabel?: ReactNode;
  versionLabel?: ReactNode;
  env?: string;
  children: ReactNode;
};

// ROC reuses the Ops control-plane canvas (neutral dark) with the independent
// blue/cyan `roc` accent (decision packet §C2 / §4.3). Same shell, different
// accent — no second component library.
const theme = buildCanvasTheme({
  surface: "roc",
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

export function RocShell({
  nav,
  brandLabel,
  brandSubLabel,
  searchPlaceholder,
  avatarLabel,
  versionLabel,
  env,
  children,
}: RocShellProps) {
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
      sidebarFooter={<RocHealthFooter />}
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
