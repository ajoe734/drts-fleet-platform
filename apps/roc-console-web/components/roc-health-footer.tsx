"use client";

import { useEffect, useState } from "react";
import { buildCanvasTheme } from "@drts/ui-web";
import { getRuntimeApiBaseUrl } from "@/lib/runtime-config";
import { useTranslation } from "@/lib/i18n";

// Sidebar footer (decision packet §4.5 / Ops shell parity): surface API health
// (healthy / degraded / down) + lastCheckedAt from the backend health probe,
// plus the zh/en locale toggle. Mirrors the Ops console footer so the two
// control-plane apps stay consistent.

type ApiHealthStatus = "checking" | "healthy" | "degraded" | "down";

const theme = buildCanvasTheme({
  surface: "roc",
  dark: true,
  density: "compact",
});

function normalizeHealthStatus(value: unknown, ok: boolean): ApiHealthStatus {
  if (!ok) return "down";
  const normalized = String(value ?? "healthy").toLowerCase();
  if (normalized === "down" || normalized === "unhealthy") return "down";
  if (normalized === "degraded") return "degraded";
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
        if (active) setStatus(normalizeHealthStatus(body?.status, response.ok));
      } catch {
        if (active) setStatus("down");
      } finally {
        if (active) setLastCheckedAt(new Date());
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

export function RocHealthFooter() {
  const { locale, setLocale, t } = useTranslation();
  const { status, lastCheckedAt } = useApiHealth();

  const copy: Record<
    ApiHealthStatus,
    { label: string; fg: string; bg: string; border: string }
  > = {
    checking: {
      label: t("rocShell.health.checking"),
      fg: theme.textMuted,
      bg: theme.neutralBg,
      border: theme.neutralBorder,
    },
    healthy: {
      label: t("rocShell.health.healthy"),
      fg: theme.success,
      bg: theme.successBg,
      border: theme.successBorder,
    },
    degraded: {
      label: t("rocShell.health.degraded"),
      fg: theme.warn,
      bg: theme.warnBg,
      border: theme.warnBorder,
    },
    down: {
      label: t("rocShell.health.down"),
      fg: theme.danger,
      bg: theme.dangerBg,
      border: theme.dangerBorder,
    },
  };
  const c = copy[status];
  const checkedLabel = lastCheckedAt
    ? lastCheckedAt.toLocaleTimeString(locale === "zh" ? "zh-TW" : "en-US")
    : t("rocShell.health.notChecked");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        padding: 8,
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        background: `linear-gradient(180deg, ${theme.surfaceHi}, ${theme.surfaceLo})`,
        boxShadow: theme.shadowSm,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 9px",
          borderRadius: 10,
          background: c.bg,
          border: `1px solid ${c.border}`,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            color: c.fg,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: c.fg,
              display: "inline-block",
            }}
          />
          {c.label}
        </span>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          {t("rocShell.health.lastChecked")} {checkedLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setLocale(locale === "en" ? "zh" : "en")}
        aria-label={
          locale === "en"
            ? t("rocShell.locale.ariaZh")
            : t("rocShell.locale.ariaEn")
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          padding: "7px 10px",
          borderRadius: 10,
          background: theme.accentBg,
          border: `1px solid ${theme.accentBorder}`,
          color: theme.accent,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{ fontSize: 11, letterSpacing: 0.4, fontWeight: 700 }}
        >
          ZH/EN
        </span>
        <span>
          {locale === "en" ? t("rocShell.locale.zh") : t("rocShell.locale.en")}
        </span>
      </button>
    </div>
  );
}
