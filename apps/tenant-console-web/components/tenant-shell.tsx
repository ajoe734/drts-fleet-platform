"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import {
  CanvasShell,
  CanvasWindowChrome,
  ManagementThemeProvider,
  buildCanvasTheme,
} from "@drts/ui-web";
import { REALM_COLORS } from "@drts/ui-tokens";
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
import { t } from "@/lib/translations";

type ShellCssVars = CSSProperties & Record<`--${string}`, string>;

const tenantCanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const tenantSurfaceTheme = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const tenantCssVars = {
  "--app-bg": tenantSurfaceTheme.rowSelect,
  "--app-shell": REALM_COLORS.tenant.dark.bg,
  "--app-shell-border": REALM_COLORS.tenant.dark.border,
  "--app-panel": "rgb(255 255 255 / 0.88)",
  "--app-panel-strong": tenantSurfaceTheme.surface,
  "--app-panel-border": tenantSurfaceTheme.border,
  "--app-text": tenantSurfaceTheme.text,
  "--app-muted": tenantSurfaceTheme.textMuted,
  "--app-accent": tenantSurfaceTheme.accent,
  "--app-accent-soft": tenantSurfaceTheme.accentBg,
  "--app-success": tenantSurfaceTheme.success,
  "--app-warning": tenantSurfaceTheme.warn,
  "--app-danger": tenantSurfaceTheme.danger,
  "--app-shadow": tenantSurfaceTheme.shadow,
  "--app-accent-rgb": "15 118 110",
  "--app-shell-rgb": "15 42 40",
  "--app-text-rgb": "11 18 32",
  "--app-muted-rgb": "71 85 105",
  "--app-success-rgb": "15 123 90",
  "--app-warning-rgb": "168 89 11",
  "--app-danger-rgb": "180 35 24",
  "--app-invert": tenantSurfaceTheme.invert,
} satisfies ShellCssVars;

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
            "radial-gradient(circle at top left, rgb(15 118 110 / 0.18), transparent 22%), #060b13",
          ...tenantCssVars,
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
            breadcrumb={[
              TENANT_CONSOLE_CONTEXT,
              activeItem?.label ?? t("shell.breadcrumb.home"),
            ]}
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
