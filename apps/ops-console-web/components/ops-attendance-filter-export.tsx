"use client";

import Link from "next/link";
import { useState, type CSSProperties, type MouseEvent } from "react";
import type { DriverRegistryRecord } from "@drts/contracts";
import {
  CanvasBtn as Btn,
  CanvasPill as Pill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { formatOpsCodeLabel } from "../lib/localized-labels";
import {
  attendanceFiltersAreDefault,
  buildAttendanceExportHref,
  buildAttendanceHref,
  type AttendanceAnomalyFilter,
  type AttendanceFilters,
} from "../lib/ops-analytics";
import { t, type Locale } from "../lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const ANOMALY_OPTIONS: readonly AttendanceAnomalyFilter[] = [
  "all",
  "anomalous",
  "absent",
  "partial",
  "abandoned",
  "present",
] as const;

const filterBarContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 10,
  background: theme.surface,
  border: `1px solid ${theme.border}`,
};

const filterFormRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const fieldLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: theme.textMuted,
};

const inputControlStyle: CSSProperties = {
  height: 28,
  padding: "0 8px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  fontSize: 12,
  fontFamily: theme.fontFamily,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

export type OpsAttendanceExportButtonProps = {
  exportHref: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string | null;
};

export function OpsAttendanceExportButton({
  exportHref,
  label,
  disabled = false,
  disabledReason = null,
}: OpsAttendanceExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(
    null,
  );
  const [downloadedRows, setDownloadedRows] = useState<number | null>(null);

  async function handleExportClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (disabled) {
      setDownloadedFilename(null);
      setDownloadedRows(null);
      setErrorMessage(disabledReason || "Attendance export unavailable.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);
    setDownloadedFilename(null);
    setDownloadedRows(null);

    try {
      const response = await fetch(exportHref, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          accept: "text/csv, application/json",
        },
      });

      if (!response.ok) {
        let message = `Export failed (${response.status})`;
        try {
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          if (payload?.error?.message) {
            message = payload.error.message;
          }
        } catch {
          const text = await response.text().catch(() => "");
          if (text.trim()) {
            message = text.trim();
          }
        }
        setErrorMessage(message);
        return;
      }

      const csvText = await response.text();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filenameMatch = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = filenameMatch?.[1] ?? "attendance-export.csv";
      const nonEmptyLines = csvText
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
      const dataRowCount = Math.max(0, nonEmptyLines.length - 1);

      if (
        typeof window !== "undefined" &&
        typeof URL !== "undefined" &&
        typeof URL.createObjectURL === "function"
      ) {
        try {
          const BlobCtor = window.Blob ?? Blob;
          const blob = new BlobCtor([csvText], {
            type: "text/csv;charset=utf-8;",
          });
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = objectUrl;
          anchor.download = filename;
          anchor.style.display = "none";
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          if (typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(objectUrl);
          }
        } catch {
          // Non-browser DOM environments (e.g. jsdom without Blob impl backing) may not support createObjectURL.
        }
      }

      setDownloadedFilename(filename);
      setDownloadedRows(dataRowCount);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Attendance export failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <a
        href={exportHref}
        data-testid="attendance-export-trigger"
        aria-disabled={disabled || busy ? "true" : "false"}
        onClick={handleExportClick}
        style={{
          textDecoration: "none",
          cursor: disabled || busy ? "not-allowed" : "pointer",
        }}
      >
        <Btn
          theme={theme}
          variant="primary"
          icon="ext"
          disabled={disabled || busy}
        >
          {label}
        </Btn>
      </a>
      {errorMessage ? (
        <span
          role="alert"
          data-testid="attendance-export-error"
          style={{
            fontSize: 11,
            color: theme.danger,
            maxWidth: 280,
            textAlign: "right",
          }}
        >
          {errorMessage}
        </span>
      ) : null}
      {downloadedFilename !== null ? (
        <span
          role="status"
          data-testid="attendance-export-status"
          data-export-filename={downloadedFilename}
          data-export-rows={downloadedRows ?? 0}
          style={{
            fontSize: 11,
            color: theme.success,
            fontFamily: theme.monoFamily,
          }}
        >
          {downloadedFilename} ({downloadedRows ?? 0})
        </span>
      ) : null}
    </div>
  );
}

function formatAnomalyOptionLabel(
  anomaly: AttendanceAnomalyFilter,
  locale: Locale,
): string {
  switch (anomaly) {
    case "all":
      return t("common.all", locale);
    case "anomalous":
      return t("attendance.tab.exceptions", locale);
    case "abandoned":
      return t("attendance.gantt.legend.abandoned", locale);
    case "absent":
    case "partial":
    case "present":
      return formatOpsCodeLabel(locale, anomaly);
  }
}

export type OpsAttendanceFilterBarProps = {
  filters: AttendanceFilters;
  drivers: Array<Pick<DriverRegistryRecord, "driverId" | "name">>;
  locale: Locale;
  disabled?: boolean;
};

export function OpsAttendanceFilterBar({
  filters,
  drivers,
  locale,
  disabled = false,
}: OpsAttendanceFilterBarProps) {
  const hasExplicitDrivers = drivers.some(
    (driver) => driver.driverId === filters.driverId,
  );
  const filtersActive = !attendanceFiltersAreDefault(filters);
  const clearHref = buildAttendanceHref(filters, {
    date: null,
    driverId: "all",
    anomaly: "all",
  });

  return (
    <div style={filterBarContainerStyle} data-testid="attendance-filter-bar">
      <form
        method="GET"
        action="/attendance"
        data-testid="attendance-filter-form"
        style={filterFormRowStyle}
      >
        {filters.view !== "today" ? (
          <input type="hidden" name="view" value={filters.view} />
        ) : null}

        <label style={fieldLabelStyle}>
          <span>{t("common.date", locale)}</span>
          <input
            type="date"
            name="date"
            aria-label={t("common.date", locale)}
            data-testid="attendance-filter-date"
            defaultValue={filters.effectiveDate}
            disabled={disabled}
            style={{
              ...inputControlStyle,
              fontFamily: theme.monoFamily,
            }}
          />
        </label>

        <label style={fieldLabelStyle}>
          <span>{t("common.driver", locale)}</span>
          <select
            name="driverId"
            aria-label={t("common.driver", locale)}
            data-testid="attendance-filter-driver"
            defaultValue={filters.driverId}
            disabled={disabled}
            style={inputControlStyle}
          >
            <option value="all">{t("common.all", locale)}</option>
            {drivers.map((driver) => (
              <option key={driver.driverId} value={driver.driverId}>
                {driver.name} ({driver.driverId})
              </option>
            ))}
            {filters.driverId !== "all" && !hasExplicitDrivers ? (
              <option value={filters.driverId}>{filters.driverId}</option>
            ) : null}
          </select>
        </label>

        <label style={fieldLabelStyle}>
          <span>{t("common.status", locale)}</span>
          <select
            name="anomaly"
            aria-label={t("common.status", locale)}
            data-testid="attendance-filter-anomaly"
            defaultValue={filters.anomaly}
            disabled={disabled}
            style={inputControlStyle}
          >
            {ANOMALY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatAnomalyOptionLabel(option, locale)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          data-testid="attendance-filter-submit"
          disabled={disabled}
          style={{
            height: 28,
            padding: "0 12px",
            borderRadius: 6,
            border: `1px solid ${theme.accent}`,
            background: theme.accent,
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 500,
            cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: theme.fontFamily,
          }}
        >
          {t("common.search", locale)}
        </button>

        {filtersActive ? (
          <Link
            href={clearHref}
            data-testid="attendance-filter-clear"
            style={{ textDecoration: "none" }}
          >
            <Btn theme={theme} variant="ghost" icon="x">
              {t("common.clear", locale)}
            </Btn>
          </Link>
        ) : null}
      </form>

      <div style={chipRowStyle}>
        <span style={{ fontSize: 11.5, color: theme.textMuted }}>
          {t("common.status", locale)}:
        </span>
        {ANOMALY_OPTIONS.map((option) => {
          const selected = filters.anomaly === option;
          return (
            <Link
              key={`anomaly-chip-${option}`}
              href={buildAttendanceHref(filters, { anomaly: option })}
              data-testid={`attendance-anomaly-chip-${option}`}
              style={{ textDecoration: "none" }}
            >
              <Pill
                theme={theme}
                tone={selected ? "accent" : "neutral"}
                dot={selected}
              >
                {formatAnomalyOptionLabel(option, locale)}
              </Pill>
            </Link>
          );
        })}

        {drivers.length > 0 || filters.driverId !== "all" ? (
          <>
            <span
              style={{
                fontSize: 11.5,
                color: theme.textMuted,
                marginLeft: 8,
              }}
            >
              {t("common.driver", locale)}:
            </span>
            <Link
              href={buildAttendanceHref(filters, { driverId: "all" })}
              data-testid="attendance-driver-chip-all"
              style={{ textDecoration: "none" }}
            >
              <Pill
                theme={theme}
                tone={filters.driverId === "all" ? "accent" : "neutral"}
              >
                {t("common.all", locale)}
              </Pill>
            </Link>
            {drivers.slice(0, 6).map((driver) => {
              const selected = filters.driverId === driver.driverId;
              return (
                <Link
                  key={`driver-chip-${driver.driverId}`}
                  href={buildAttendanceHref(filters, {
                    driverId: driver.driverId,
                  })}
                  data-testid={`attendance-driver-chip-${driver.driverId}`}
                  style={{ textDecoration: "none" }}
                >
                  <Pill
                    theme={theme}
                    tone={selected ? "accent" : "neutral"}
                    dot={selected}
                  >
                    {driver.name}
                  </Pill>
                </Link>
              );
            })}
            {filters.driverId !== "all" && !hasExplicitDrivers ? (
              <Link
                href={buildAttendanceHref(filters, {
                  driverId: filters.driverId,
                })}
                data-testid={`attendance-driver-chip-${filters.driverId}`}
                style={{ textDecoration: "none" }}
              >
                <Pill theme={theme} tone="accent" dot>
                  {filters.driverId}
                </Pill>
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export type OpsAttendanceFilterExportProps = OpsAttendanceFilterBarProps & {
  exportDisabled?: boolean;
  exportDisabledReason?: string | null;
};

export function OpsAttendanceFilterExport({
  filters,
  drivers,
  locale,
  disabled = false,
  exportDisabled = false,
  exportDisabledReason = null,
}: OpsAttendanceFilterExportProps) {
  const exportHref = buildAttendanceExportHref(filters);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <OpsAttendanceFilterBar
            filters={filters}
            drivers={drivers}
            locale={locale}
            disabled={disabled}
          />
        </div>
        <OpsAttendanceExportButton
          exportHref={exportHref}
          label={t("attendance.export", locale)}
          disabled={exportDisabled}
          disabledReason={exportDisabledReason}
        />
      </div>
    </div>
  );
}
