"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  CanvasShell,
  CanvasWindowChrome,
  ManagementThemeProvider,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  TENANT_CONSOLE_BRAND,
  TENANT_CONSOLE_VERSION,
  createTenantNavEntries,
  findNavItem,
} from "@/lib/navigation";
import { useTranslation } from "@/lib/i18n";
import { getBrowserApiBaseUrl } from "@/lib/runtime-config";
import type { Locale } from "@/lib/translations";

const tenantCanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

type ApiHealthStatus = "checking" | "healthy" | "degraded" | "down";

function normalizeHealthStatus(
  value: unknown,
  responseOk: boolean,
): ApiHealthStatus {
  if (!responseOk) {
    return "degraded";
  }

  const normalized = String(value ?? "healthy").toLowerCase();
  if (normalized === "down" || normalized === "unhealthy") {
    return "down";
  }
  if (normalized === "degraded" || normalized === "warning") {
    return "degraded";
  }
  return "healthy";
}

function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const apiBaseUrl = getBrowserApiBaseUrl().replace(/\/$/, "");

    async function checkHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        setStatus(normalizeHealthStatus(body?.status, response.ok));
      } catch {
        if (!controller.signal.aborted) {
          setStatus("down");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLastCheckedAt(new Date());
        }
      }
    }

    checkHealth();

    return () => controller.abort();
  }, []);

  return { status, lastCheckedAt };
}

function formatCheckedAt(date: Date | null, locale: Locale) {
  if (!date) {
    return null;
  }

  return date.toLocaleTimeString(locale === "zh" ? "zh-TW" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function TenantShellControls({
  locale,
  setLocale,
  t,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}) {
  const { status, lastCheckedAt } = useApiHealth();
  const statusCopy = {
    checking: {
      label: t("shell.health.checking"),
      fg: tenantCanvasTheme.textMuted,
      bg: tenantCanvasTheme.surface,
      border: tenantCanvasTheme.border,
    },
    healthy: {
      label: t("shell.health.healthy"),
      fg: "#5EEAD4",
      bg: "rgba(20, 184, 166, 0.12)",
      border: "rgba(94, 234, 212, 0.32)",
    },
    degraded: {
      label: t("shell.health.degraded"),
      fg: "#FBBF24",
      bg: "rgba(251, 191, 36, 0.12)",
      border: "rgba(251, 191, 36, 0.34)",
    },
    down: {
      label: t("shell.health.down"),
      fg: "#FCA5A5",
      bg: "rgba(248, 113, 113, 0.12)",
      border: "rgba(252, 165, 165, 0.34)",
    },
  } satisfies Record<
    ApiHealthStatus,
    { label: string; fg: string; bg: string; border: string }
  >;
  const current = statusCopy[status];
  const checkedAt = formatCheckedAt(lastCheckedAt, locale);

  return (
    <div style={controlGroupStyle}>
      <div
        aria-label={current.label}
        title={`${current.label}${checkedAt ? ` · ${t("shell.health.lastChecked")} ${checkedAt}` : ""}`}
        style={{
          ...healthPillStyle,
          color: current.fg,
          background: current.bg,
          borderColor: current.border,
        }}
      >
        <span style={{ ...healthDotStyle, background: current.fg }} />
        <span>{current.label}</span>
      </div>
      <button
        type="button"
        title={t("shell.language.switch")}
        aria-label={t("shell.language.switch")}
        style={languageButtonStyle}
        onClick={() => setLocale(locale === "en" ? "zh" : "en")}
      >
        <span aria-hidden="true">文/A</span>
        <span>
          {locale === "en" ? t("shell.language.zh") : t("shell.language.en")}
        </span>
      </button>
    </div>
  );
}

export function TenantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useTranslation();
  const navEntries = useMemo(() => createTenantNavEntries(t), [t]);
  const activeItem = findNavItem(pathname, navEntries);
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
          height="100dvh"
          outerPadding={12}
          style={{ height: "100dvh", minHeight: "100dvh" }}
          contentStyle={{ background: tenantCanvasTheme.bg }}
        >
          <CanvasShell
            theme={tenantCanvasTheme}
            nav={navEntries}
            brandLabel={TENANT_CONSOLE_BRAND}
            brandSubLabel={t("shell.brand.sub")}
            breadcrumb={[
              t("shell.context"),
              activeItem?.label ?? t("shell.breadcrumb.home"),
            ]}
            env={t("shell.env")}
            versionLabel={TENANT_CONSOLE_VERSION}
            searchPlaceholder={t("shell.search")}
            searchWidth={280}
            avatarLabel={locale === "en" ? "YA" : t("shell.identity.actor")}
            style={{ height: "100%" }}
            topRight={
              <TenantShellControls
                locale={locale}
                setLocale={setLocale}
                t={t}
              />
            }
            {...(activeKey ? { active: activeKey } : {})}
          >
            {children}
          </CanvasShell>
        </CanvasWindowChrome>
      </div>
    </ManagementThemeProvider>
  );
}

const controlGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const healthPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const healthDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 999,
  flexShrink: 0,
};

const languageButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${tenantCanvasTheme.border}`,
  borderRadius: 999,
  background: tenantCanvasTheme.surface,
  color: tenantCanvasTheme.text,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
