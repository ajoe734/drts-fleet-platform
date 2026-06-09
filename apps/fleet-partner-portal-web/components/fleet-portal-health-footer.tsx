"use client";

import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { buildCanvasTheme } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import { getRuntimeApiBaseUrl } from "@/lib/runtime-config";

type ApiHealthStatus = "checking" | "healthy" | "degraded" | "down";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

function normalizeHealthStatus(value: unknown, ok: boolean): ApiHealthStatus {
  if (!ok) return "down";

  const normalized = String(value ?? "healthy").toLowerCase();
  if (normalized === "down" || normalized === "unhealthy") return "down";
  if (normalized === "degraded" || normalized === "warning") return "degraded";
  return "healthy";
}

function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const apiBaseUrl = getRuntimeApiBaseUrl().replace(/\/$/, "");

    async function checkHealth() {
      const controller = new AbortController();
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (active) {
          setStatus(normalizeHealthStatus(body?.status, response.ok));
        }
      } catch {
        if (active) {
          setStatus("down");
        }
      } finally {
        if (active) {
          setLastCheckedAt(new Date());
        }
      }
    }

    void checkHealth();
    const timer = setInterval(() => void checkHealth(), 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return { status, lastCheckedAt };
}

export function FleetPortalHealthFooter() {
  const { locale, setLocale, t } = useTranslation();
  const { status, lastCheckedAt } = useApiHealth();

  const copy: Record<
    ApiHealthStatus,
    { label: string; fg: string; bg: string; border: string }
  > = {
    checking: {
      label: t("shell.api.checking"),
      fg: theme.textMuted,
      bg: theme.neutralBg,
      border: theme.neutralBorder,
    },
    healthy: {
      label: t("shell.api.healthy"),
      fg: theme.success,
      bg: theme.successBg,
      border: theme.successBorder,
    },
    degraded: {
      label: t("shell.api.degraded"),
      fg: theme.warn,
      bg: theme.warnBg,
      border: theme.warnBorder,
    },
    down: {
      label: t("shell.api.down"),
      fg: theme.danger,
      bg: theme.dangerBg,
      border: theme.dangerBorder,
    },
  };
  const current = copy[status];
  const checkedLabel = lastCheckedAt
    ? lastCheckedAt.toLocaleTimeString(locale === "zh" ? "zh-TW" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : t("shell.api.notChecked");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 8,
        padding: "8px",
        borderRadius: 10,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          color: current.fg,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: current.fg,
            boxShadow: `0 0 0 4px ${current.bg}`,
            flexShrink: 0,
          }}
        />
        <span>{current.label}</span>
        <span
          style={{
            marginLeft: "auto",
            color: theme.textMuted,
            fontFamily: theme.monoFamily,
            fontSize: 10.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {checkedLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setLocale(locale === "en" ? "zh" : "en")}
        aria-label={
          locale === "en" ? t("shell.locale.ariaZh") : t("shell.locale.ariaEn")
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          padding: "7px 10px",
          borderRadius: 8,
          border: `1px solid ${theme.border}`,
          background: "transparent",
          color: theme.text,
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 700,
        }}
      >
        <Languages size={14} />
        <span>
          {locale === "en" ? t("shell.locale.zh") : t("shell.locale.en")}
        </span>
      </button>
    </div>
  );
}
