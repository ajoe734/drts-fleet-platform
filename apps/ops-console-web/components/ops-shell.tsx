"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import {
  CanvasShell,
  buildCanvasTheme,
  CanvasBanner as Banner,
  CanvasBtn as Btn,
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
  const { pendingCount, soundOff, audioBlocked, handleEnableSound, audioError } = useSosSound();

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
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", width: "100%" }}>
        {pathname.startsWith("/sos") && (soundOff || audioBlocked) && (
          <div style={{ padding: "16px 24px 0 24px" }}>
            <Banner
              theme={theme}
              tone="warn"
              icon="warn"
              title="SOS 提示音尚未啟用"
              body={
                audioError
                  ? `音效模組初始化失敗: ${audioError}。系統仍會以持續視覺警示呈現新事件。`
                  : audioBlocked
                    ? "瀏覽器已封鎖自動播放音效。請點此或與頁面互動以啟用提示音。啟用前系統仍會以持續視覺警示呈現新事件，不會僅依聲音。"
                    : "請點此啟用瀏覽器提示音。啟用前系統仍會以持續視覺警示呈現新事件，不會僅依聲音。"
              }
              actions={
                <Btn
                  theme={theme}
                  size="xs"
                  variant="primary"
                  onClick={handleEnableSound}
                >
                  啟用提示音
                </Btn>
              }
            />
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    </CanvasShell>
  );
}

