"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CanvasShell,
  CanvasWindowChrome,
  ManagementThemeProvider,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  TENANT_CONSOLE_BRAND,
  TENANT_CONSOLE_BRAND_SUB,
  TENANT_CONSOLE_CONTEXT,
  TENANT_CONSOLE_ENV,
  TENANT_CONSOLE_SEARCH_PLACEHOLDER,
  TENANT_CONSOLE_VERSION,
  findNavItem,
  tenantNavEntries,
} from "@/lib/navigation";

const tenantCanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

export function TenantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeItem = findNavItem(pathname);
  const activeKey = activeItem?.key;

  if (pathname.startsWith("/partner")) {
    return <>{children}</>;
  }

  return (
    <ManagementThemeProvider defaultDark defaultDensity="compact">
      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 22%), #060b13",
        }}
      >
        <CanvasWindowChrome
          width="100%"
          height="100vh"
          outerPadding={12}
          style={{ minHeight: "100vh" }}
          contentStyle={{ background: tenantCanvasTheme.bg }}
        >
          <CanvasShell
            theme={tenantCanvasTheme}
            nav={tenantNavEntries}
            brandLabel={TENANT_CONSOLE_BRAND}
            brandSubLabel={TENANT_CONSOLE_BRAND_SUB}
            breadcrumb={[TENANT_CONSOLE_CONTEXT, activeItem?.label ?? "首頁"]}
            env={TENANT_CONSOLE_ENV}
            versionLabel={TENANT_CONSOLE_VERSION}
            searchPlaceholder={TENANT_CONSOLE_SEARCH_PLACEHOLDER}
            searchWidth={280}
            avatarLabel="大和"
            style={{ height: "100%" }}
            {...(activeKey ? { active: activeKey } : {})}
          >
            {children}
          </CanvasShell>
        </CanvasWindowChrome>
      </div>
    </ManagementThemeProvider>
  );
}
