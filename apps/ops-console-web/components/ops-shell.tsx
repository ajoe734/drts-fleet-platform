"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  CanvasShell,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";
import type { IncidentRecord } from "@drts/contracts";
import { OpsHealthFooter } from "@/components/ops-health-footer";
import { getOpsClient, createOpsDispatchEventSource } from "@/lib/api-client";
import { isSosIncident, unwrapListItems } from "@/lib/sos-view-model";
import { resolvePlatformAdminOrigin } from "./ops-assistant";

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
  const [sosBadgeCount, setSosBadgeCount] = useState<number>(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const client = getOpsClient();

    async function fetchBadgeCount() {
      try {
        const res = await client.get<any>("/api/incidents", {
          signal: controller.signal,
        });
        const items: IncidentRecord[] = unwrapListItems(res);
        const pendingCount = items.filter(
          (incident) =>
            isSosIncident(incident) &&
            incident.status === "open" &&
            incident.assignedTo === null,
        ).length;
        if (active) {
          setSosBadgeCount(pendingCount);
        }
      } catch (err) {
        // Browser navigation can reject the old document's fetch before React
        // runs this effect's cleanup. Yield once so an expected navigation
        // abort is not reported as an active-shell API failure.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (active && !controller.signal.aborted) {
          console.error("Failed to fetch pending SOS badge count", err);
        }
      }
    }

    void fetchBadgeCount();
    const interval = setInterval(fetchBadgeCount, 10000);

    let sse: EventSource | null = null;
    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", () => {
        void fetchBadgeCount();
      });
      sse.addEventListener("driver_location_updated", () => {
        void fetchBadgeCount();
      });
      sse.addEventListener("order_updated", () => {
        void fetchBadgeCount();
      });
      sse.addEventListener("incident_created", () => {
        void fetchBadgeCount();
      });
      sse.addEventListener("incident_updated", () => {
        void fetchBadgeCount();
      });
    } catch (e) {
      console.error("Failed to initialize SSE in OpsShell", e);
    }

    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
      if (sse) {
        sse.close();
      }
    };
  }, []);

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
        badge: sosBadgeCount > 0 ? String(sosBadgeCount) : undefined,
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

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (
      event.target as HTMLElement | null
    )?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;

    if (
      href.startsWith("/platform-admin") ||
      href.startsWith("/_apps/platform-admin") ||
      href === "/audit" ||
      href.startsWith("/audit?")
    ) {
      event.preventDefault();
      event.stopPropagation();
      const origin = resolvePlatformAdminOrigin();
      let targetPath = href;
      if (targetPath.startsWith("/platform-admin")) {
        targetPath = targetPath.slice("/platform-admin".length) || "/";
      } else if (targetPath.startsWith("/_apps/platform-admin")) {
        targetPath = targetPath.slice("/_apps/platform-admin".length) || "/";
      }
      const targetUrl = new URL(targetPath, origin);
      window.open(
        targetUrl.toString(),
        anchor.target || "_blank",
        "noopener,noreferrer",
      );
    }
  };

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
      <div
        data-testid="ops-shell-content"
        onClickCapture={handleClickCapture}
        style={{ display: "contents" }}
      >
        {children}
      </div>
    </CanvasShell>
  );
}
