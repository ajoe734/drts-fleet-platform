"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";

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

const APPROVAL_QUEUE_ROLE_SET = new Set([
  "ops_approval_triage",
  "ops_manager",
  "ops_compliance",
]);

type IdentitySummary = {
  roles?: string[];
} | null;

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
  const [visibleNav, setVisibleNav] = useState(() =>
    nav.filter(
      (item) =>
        item.key !== "approval-requests" ||
        pathname.startsWith("/approval-requests"),
    ),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadIdentityContext() {
      try {
        const identity = (await getOpsClient().getIdentityContext()) as
          | IdentitySummary
          | undefined;
        if (cancelled) {
          return;
        }

        const canSeeApprovalQueue = Boolean(
          identity?.roles?.some((role) => APPROVAL_QUEUE_ROLE_SET.has(role)),
        );

        setVisibleNav(
          nav.filter(
            (item) =>
              item.key !== "approval-requests" ||
              canSeeApprovalQueue ||
              pathname.startsWith("/approval-requests"),
          ),
        );
      } catch {
        if (!cancelled) {
          setVisibleNav(nav);
        }
      }
    }

    void loadIdentityContext();
    return () => {
      cancelled = true;
    };
  }, [nav, pathname]);

  const breadcrumb = deriveBreadcrumb(visibleNav, pathname);

  return (
    <CanvasShell
      theme={theme}
      nav={visibleNav}
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
