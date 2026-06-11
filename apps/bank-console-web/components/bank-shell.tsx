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
  BANK_CONSOLE_BRAND,
  BANK_CONSOLE_BRAND_SUB,
  BANK_CONSOLE_CONTEXT,
  BANK_CONSOLE_ENV,
  BANK_CONSOLE_SEARCH_PLACEHOLDER,
  BANK_CONSOLE_VERSION,
  bankNavEntries,
  findNavItem,
} from "@/lib/navigation";
import { t } from "@/lib/translations";

// Chrome uses the `tenant` realm tokens (teal) per the SD / screen-requirements
// hand-off. The issuer (CTBC) appears only as tenant identity, never as a
// hand-picked palette.
const bankCanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

export function BankShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeItem = findNavItem(pathname);
  const activeKey = activeItem?.key;

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
          contentStyle={{ background: bankCanvasTheme.bg }}
        >
          <CanvasShell
            theme={bankCanvasTheme}
            nav={bankNavEntries}
            brandLabel={BANK_CONSOLE_BRAND}
            brandSubLabel={BANK_CONSOLE_BRAND_SUB}
            breadcrumb={[
              BANK_CONSOLE_CONTEXT,
              activeItem?.label ?? t("shell.breadcrumb.home"),
            ]}
            env={BANK_CONSOLE_ENV}
            versionLabel={BANK_CONSOLE_VERSION}
            searchPlaceholder={BANK_CONSOLE_SEARCH_PLACEHOLDER}
            searchWidth={280}
            avatarLabel="中信"
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
