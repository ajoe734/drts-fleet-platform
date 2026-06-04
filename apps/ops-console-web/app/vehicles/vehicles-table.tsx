"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import {
  CanvasIcon,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

export type VehicleRow = Record<string, unknown> & {
  vehicleId: string;
  plateNo: string;
  typeLabel: string;
  typeKeys: string[];
  statusKey: "all" | "active" | "attention" | "blocked" | "offboarding";
  statusLabel: string;
  statusTone: CanvasTone;
  dispatchable: boolean;
  blockedReasonLabels: string[];
  currentDriverId: string | null;
  currentDriverName: string | null;
  currentShiftId: string | null;
  currentDriverLink: string | null;
  overdueMaintenance: boolean;
  maintenanceStatusLabel: string;
  maintenanceTone: CanvasTone;
  nextMaintenanceAt: string | null;
  contractLabel: string;
  insuranceLabel: string;
  debrandDueLabel: string;
  debrandTone: CanvasTone;
  lastSeenAt: string | null;
  lastSeenLabel: string;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
  offboardingActive: boolean;
  syntheticDetailPending: boolean;
};

type AppOrigins = {
  opsConsole: string;
  platformAdmin: string;
  tenantConsole: string;
};

type VehiclesTableProps = {
  locale: Locale;
  rows: VehicleRow[];
  appOrigins: AppOrigins;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
  whiteSpace: "normal",
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const primaryTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
  minWidth: 0,
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textDim,
  fontSize: 11.5,
  minWidth: 0,
};

const mutedTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  minWidth: 0,
};

const actionStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
  whiteSpace: "normal",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: {
      bg: theme.successBg,
      fg: theme.success,
      bd: theme.successBorder,
    },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: {
      bg: theme.dangerBg,
      fg: theme.danger,
      bd: theme.dangerBorder,
    },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: {
      bg: theme.accentBg,
      fg: theme.accent,
      bd: theme.accentBorder,
    },
    neutral: {
      bg: theme.surfaceLo,
      fg: theme.textMuted,
      bd: theme.border,
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette[tone].bd}`,
    background: palette[tone].bg,
    color: palette[tone].fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}

function tinyMetaStyle(tone: CanvasTone = "neutral"): CSSProperties {
  const colors: Record<CanvasTone, string> = {
    success: theme.success,
    warn: theme.warn,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
    neutral: theme.textMuted,
  };

  return {
    fontSize: 10.5,
    color: colors[tone],
    letterSpacing: 0.2,
  };
}

function resolveAppOrigin(
  targetApp: CrossAppResourceLink["targetApp"],
  appOrigins: AppOrigins,
) {
  if (targetApp === "platform-admin") return appOrigins.platformAdmin;
  if (targetApp === "tenant-console") return appOrigins.tenantConsole;
  return appOrigins.opsConsole;
}

function buildCrossAppHref(link: CrossAppResourceLink, appOrigins: AppOrigins) {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }

  return `${resolveAppOrigin(link.targetApp, appOrigins)}${link.route.startsWith("/") ? link.route : `/${link.route}`}`;
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) {
    return "neutral";
  }
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium") return "warn";
  return "accent";
}

function actionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "open_vehicle_detail":
      return copy(locale, "Vehicle detail", "車輛詳情");
    case "open_driver_binding":
      return copy(locale, "Driver binding", "司機綁定");
    case "review_maintenance":
      return copy(locale, "Maintenance", "保修檢視");
    case "open_fleet_governance":
      return copy(locale, "Fleet governance", "車隊治理");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) {
    return null;
  }

  if (action.disabledReasonCode === "vehicle_detail_pending") {
    return copy(
      locale,
      "Detail route ships in UI-FE-OPS-VEHID.",
      "詳情路由由 UI-FE-OPS-VEHID 交付。",
    );
  }

  return formatOpsCodeLabel(locale, action.disabledReasonCode);
}

function buildActionHref(
  action: ResourceActionDescriptor,
  row: VehicleRow,
  appOrigins: AppOrigins,
) {
  switch (action.action) {
    case "open_vehicle_detail":
      return `/vehicles/${encodeURIComponent(row.vehicleId)}`;
    case "open_driver_binding":
      return row.currentDriverLink ?? "/drivers";
    case "review_maintenance":
      return `/maintenance?vehicleId=${encodeURIComponent(row.vehicleId)}`;
    case "open_fleet_governance":
      return row.crossAppLinks[0]
        ? buildCrossAppHref(row.crossAppLinks[0], appOrigins)
        : null;
    default:
      return null;
  }
}

function isActionNewTab(action: ResourceActionDescriptor, row: VehicleRow) {
  if (action.action === "open_fleet_governance") {
    return row.crossAppLinks[0]?.openMode === "new_tab";
  }

  return false;
}

function renderAction(
  action: ResourceActionDescriptor,
  row: VehicleRow,
  locale: Locale,
  key: string,
  appOrigins: AppOrigins,
): ReactNode {
  const label = actionLabel(action, locale);
  const href = action.enabled ? buildActionHref(action, row, appOrigins) : null;
  const reason = actionReason(action, locale);

  return (
    <div key={key} style={{ display: "grid", gap: 4 }}>
      {href ? (
        <Link
          href={href}
          target={isActionNewTab(action, row) ? "_blank" : undefined}
          rel={isActionNewTab(action, row) ? "noreferrer" : undefined}
          style={linkButtonStyle(actionTone(action))}
        >
          {label}
          {isActionNewTab(action, row) ? (
            <CanvasIcon name="ext" size={11} />
          ) : null}
        </Link>
      ) : (
        <span
          style={linkButtonStyle(actionTone(action), !action.enabled)}
          title={reason ?? undefined}
        >
          {label}
        </span>
      )}
      <span style={tinyMetaStyle(actionTone(action))}>
        {copy(locale, `risk:${action.riskLevel}`, `風險:${action.riskLevel}`)}
        {action.requiresReason
          ? copy(locale, " · reason required", " · 需填原因")
          : ""}
      </span>
      {!action.enabled && reason ? (
        <span style={mutedTextStyle}>{reason}</span>
      ) : null}
    </div>
  );
}

function buildColumns(
  locale: Locale,
  appOrigins: AppOrigins,
): CanvasTableColumn<VehicleRow>[] {
  return [
    {
      h: copy(locale, "VEHICLE", "車輛"),
      w: 200,
      r: (row) => (
        <div style={stackStyle}>
          <span style={{ ...primaryTextStyle, ...monoTextStyle }}>
            {row.vehicleId}
          </span>
          <span style={secondaryTextStyle}>{row.plateNo}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "TYPE / STATUS", "類型 / 狀態"),
      w: 220,
      r: (row) => (
        <div style={stackStyle}>
          <span style={primaryTextStyle}>{row.typeLabel}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill theme={theme} tone={row.statusTone} dot>
              {row.statusLabel}
            </Pill>
          </div>
        </div>
      ),
    },
    {
      h: copy(locale, "DISPATCHABLE", "派遣可用"),
      w: 250,
      r: (row) => (
        <div style={stackStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill
              theme={theme}
              tone={row.dispatchable ? "success" : "danger"}
              dot
            >
              {row.dispatchable
                ? copy(locale, "yes", "可派")
                : copy(locale, "no", "不可派")}
            </Pill>
          </div>
          <span style={secondaryTextStyle}>
            {row.blockedReasonLabels.length > 0
              ? row.blockedReasonLabels.join(" / ")
              : copy(locale, "No blocking gate", "無阻塞 gate")}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "CURRENT DRIVER", "當前司機"),
      w: 200,
      r: (row) => (
        <div style={stackStyle}>
          {row.currentDriverLink ? (
            <Link
              href={row.currentDriverLink}
              style={linkButtonStyle("accent")}
            >
              {row.currentDriverName ?? row.currentDriverId}
            </Link>
          ) : (
            <span style={primaryTextStyle}>
              {copy(locale, "Unbound", "未綁定")}
            </span>
          )}
          <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
            {row.currentShiftId ??
              copy(locale, "No active shift", "無啟用班次")}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "COMPLIANCE", "法遵覆蓋"),
      w: 210,
      r: (row) => (
        <div style={stackStyle}>
          <span style={secondaryTextStyle}>
            {copy(locale, "Contract", "合約")} · {row.contractLabel}
          </span>
          <span style={secondaryTextStyle}>
            {copy(locale, "Insurance", "保險")} · {row.insuranceLabel}
          </span>
          <span style={mutedTextStyle}>{row.debrandDueLabel}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "MAINT / LAST SEEN", "保修 / 最近訊號"),
      w: 210,
      r: (row) => (
        <div style={stackStyle}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Pill theme={theme} tone={row.maintenanceTone} dot>
              {row.maintenanceStatusLabel}
            </Pill>
            <Pill theme={theme} tone={row.debrandTone}>
              {row.debrandDueLabel}
            </Pill>
          </div>
          <span style={secondaryTextStyle}>
            {row.nextMaintenanceAt
              ? copy(locale, "Next due", "下次保修") +
                ` · ${row.nextMaintenanceAt}`
              : copy(locale, "No open work order", "無未結工單")}
          </span>
          <span style={{ ...mutedTextStyle, ...monoTextStyle }}>
            {row.lastSeenLabel}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "ACTIONS", "操作"),
      w: 250,
      r: (row) => (
        <div style={actionStackStyle}>
          {row.availableActions
            .slice(0, 2)
            .map((action, index) =>
              renderAction(
                action,
                row,
                locale,
                `${row.vehicleId}-${action.action}-${index}`,
                appOrigins,
              ),
            )}
          {row.crossAppLinks.slice(0, 1).map((link) => (
            <Link
              key={`${row.vehicleId}-${link.label}`}
              href={buildCrossAppHref(link, appOrigins)}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
              style={linkButtonStyle("info")}
            >
              {link.label}
              {link.openMode === "new_tab" ? (
                <CanvasIcon name="ext" size={11} />
              ) : null}
            </Link>
          ))}
        </div>
      ),
    },
  ];
}

export function VehiclesTable({
  locale,
  rows,
  appOrigins,
}: VehiclesTableProps) {
  return (
    <Table
      theme={theme}
      columns={buildColumns(locale, appOrigins)}
      rows={rows}
    />
  );
}
