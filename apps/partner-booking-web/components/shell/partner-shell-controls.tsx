"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "@/lib/i18n";
import { getBrowserApiBaseUrl } from "@/lib/runtime-config";
import type { Locale } from "@/lib/translations";

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

export function LocalizedText({
  labelKey,
  fallback,
}: {
  labelKey: string;
  fallback: string;
}) {
  const { t } = useTranslation();
  const label = t(labelKey);
  return <>{label === labelKey ? fallback : label}</>;
}

export function PartnerShellControls() {
  const { locale, setLocale, t } = useTranslation();
  const { status, lastCheckedAt } = useApiHealth();
  const statusCopy = {
    checking: { label: t("shell.health.checking"), color: "#64748b" },
    healthy: { label: t("shell.health.healthy"), color: "#0f766e" },
    degraded: { label: t("shell.health.degraded"), color: "#a16207" },
    down: { label: t("shell.health.down"), color: "#b91c1c" },
  } satisfies Record<ApiHealthStatus, { label: string; color: string }>;
  const current = statusCopy[status];
  const checkedAt = formatCheckedAt(lastCheckedAt, locale);

  return (
    <div style={controlGroupStyle}>
      <div
        style={{ ...healthPillStyle, color: current.color }}
        title={`${current.label}${checkedAt ? ` · ${t("shell.health.lastChecked")} ${checkedAt}` : ""}`}
        aria-label={current.label}
      >
        <span style={{ ...healthDotStyle, background: current.color }} />
        <span>{current.label}</span>
      </div>
      <button
        type="button"
        style={languageButtonStyle}
        title={t("shell.language.switch")}
        aria-label={t("shell.language.switch")}
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

const controlGroupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const healthPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  border: "1px solid currentColor",
  background: "rgba(255,255,255,0.66)",
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
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "rgba(255,255,255,0.72)",
  color: "inherit",
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
