"use client";

import type { ReactNode } from "react";
import type {
  RocDataFreshness,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasPill,
  type CanvasPillTone,
} from "@drts/ui-web";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  formatRelativeAge,
  type RocAlertViewModel,
  type RocVehicleViewModel,
} from "@/lib/roc-page-data";
import type { RocEvidenceSource } from "@/lib/roc-fixtures";

const EVIDENCE_TONE: Record<RocEvidenceSource, CanvasPillTone> = {
  tesla_provided: "info",
  operator_reported: "accent",
  device_recorded: "neutral",
  roc_assessed: "success",
  not_exposed_by_provider: "warn",
};

const FRESHNESS_TONE: Record<
  RocDataFreshness["dataFreshness"],
  CanvasPillTone
> = {
  fresh: "success",
  stale: "warn",
  degraded: "warn",
  unknown: "danger",
};

export function RocEvidenceTag({
  source,
  locale,
}: {
  source: RocEvidenceSource;
  locale: Locale;
}) {
  return (
    <CanvasPill theme={rocTheme} tone={EVIDENCE_TONE[source]}>
      {t(`evidenceSource.${source}`, locale)}
      <span
        style={{
          marginLeft: 4,
          opacity: 0.7,
          fontFamily: rocTheme.monoFamily,
          fontSize: 10,
        }}
      >
        {source}
      </span>
    </CanvasPill>
  );
}

export function RocDualFreshness({
  telemetry,
  regulatory,
  locale,
  compact = false,
}: {
  telemetry: RocDataFreshness;
  regulatory: RocDataFreshness;
  locale: Locale;
  compact?: boolean;
}) {
  function cell(labelKey: string, value: RocDataFreshness) {
    const tone = FRESHNESS_TONE[value.dataFreshness];
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flex: 1,
          padding: compact ? 0 : "6px 10px",
          borderRadius: 8,
          background: compact ? "transparent" : rocTheme.surfaceLo,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            color: rocTheme.textMuted,
            letterSpacing: 0.2,
          }}
        >
          {t(labelKey, locale)}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: compact ? 11 : 12.5,
            fontWeight: 700,
            color:
              tone === "success"
                ? rocTheme.success
                : tone === "warn"
                  ? rocTheme.warn
                  : rocTheme.danger,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                tone === "success"
                  ? rocTheme.success
                  : tone === "warn"
                    ? rocTheme.warn
                    : rocTheme.danger,
            }}
          />
          {t(`freshness.${value.dataFreshness}`, locale)}
          <span
            style={{
              color: rocTheme.textDim,
              fontFamily: rocTheme.monoFamily,
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            {formatRelativeAge(value.observedAt)}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {cell("freshness.telemetry", telemetry)}
      {cell("freshness.regulatory", regulatory)}
    </div>
  );
}

export function RocStatePill({
  stateKey,
  tone,
  locale,
}: {
  stateKey: string;
  tone: CanvasPillTone;
  locale: Locale;
}) {
  return (
    <CanvasPill theme={rocTheme} tone={tone} dot>
      {t(`state.${stateKey}`, locale)}
    </CanvasPill>
  );
}

export function RocRefreshBanner({
  refresh,
  usingFallback,
  locale,
}: {
  refresh: UiRefreshMetadata;
  usingFallback: boolean;
  locale: Locale;
}) {
  if (!usingFallback && refresh.dataFreshness === "fresh") {
    return null;
  }

  return (
    <CanvasBanner
      theme={rocTheme}
      tone={usingFallback ? "warn" : "info"}
      icon={usingFallback ? "warn" : "info"}
      body={
        usingFallback
          ? t("runtime.fallback", locale)
          : t("runtime.refreshHint", locale)
      }
    />
  );
}

export function RocAlertMiniList({
  alerts,
  locale,
}: {
  alerts: RocAlertViewModel[];
  locale: Locale;
}) {
  return (
    <div>
      {alerts.slice(0, 4).map((alert, index) => (
        <div
          key={alert.alertId}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "10px 14px",
            borderTop: index === 0 ? "none" : `1px solid ${rocTheme.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{alert.title}</div>
            <div style={{ fontSize: 11.5, color: rocTheme.textMuted }}>
              {alert.summary}
            </div>
            <div style={{ marginTop: 6 }}>
              <RocEvidenceTag source={alert.source} locale={locale} />
            </div>
          </div>
          <span
            style={{
              fontSize: 10.5,
              color: rocTheme.textDim,
              fontFamily: rocTheme.monoFamily,
              whiteSpace: "nowrap",
            }}
          >
            {new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "UTC",
            })
              .format(new Date(alert.updatedAt || alert.openedAt))
              .replace(",", "")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RocLiveOverlay({
  vehicles,
}: {
  vehicles: RocVehicleViewModel[];
}) {
  return (
    <div
      style={{
        height: 420,
        background: `linear-gradient(135deg, ${rocTheme.accentBg}, ${rocTheme.surfaceLo})`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 30,
          border: `2px dashed ${rocTheme.accent}`,
          borderRadius: 18,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "8%",
          right: "8%",
          height: 2,
          background: rocTheme.accent,
          opacity: 0.35,
        }}
      />
      {vehicles
        .filter((vehicle) => vehicle.currentOrderId || vehicle.autonomyState)
        .map((vehicle) => {
          const activeColor =
            vehicle.operationalHoldActive || vehicle.stopNewDispatchActive
              ? rocTheme.warn
              : rocTheme.success;
          return (
            <div
              key={vehicle.vehicleId}
              style={{
                position: "absolute",
                left: vehicle.mapLeft,
                top: vehicle.mapTop,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: activeColor,
                  border: `2px solid ${rocTheme.surface}`,
                  boxShadow: `0 0 0 3px ${activeColor}40`,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: 16,
                  left: -10,
                  fontSize: 9.5,
                  fontFamily: rocTheme.monoFamily,
                  color: rocTheme.text,
                  background: rocTheme.surface,
                  padding: "1px 4px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                }}
              >
                {vehicle.vehicleId}
              </span>
            </div>
          );
        })}
    </div>
  );
}

export function RocMetaText({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        color: rocTheme.textDim,
        fontFamily: rocTheme.monoFamily,
      }}
    >
      {children}
    </span>
  );
}
