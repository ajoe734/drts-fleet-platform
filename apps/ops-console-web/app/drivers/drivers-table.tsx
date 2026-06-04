"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  DriverLocationSnapshot,
  DriverMatchingSuppression,
  DriverRegistryRecord,
  ForwardedOrderRecord,
  PlatformPresenceRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import {
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

type Locale = "en" | "zh";

type DriverRegistryListItem = DriverRegistryRecord & {
  phone?: string | null;
  matchingSuppression?: DriverMatchingSuppression | null;
  availableActions?: ResourceActionDescriptor[];
};

type DriverRowModel = {
  driver: DriverRegistryListItem;
  location: DriverLocationSnapshot | undefined;
  locationState: "live" | "stale" | "missing" | "unknown";
  presences: PlatformPresenceRecord[];
  presenceLoadFailed: boolean;
  activeForwardedOrders: ForwardedOrderRecord[];
  matchingSuppression: DriverMatchingSuppression | null;
  suppressionActive: boolean;
  availableActions: ResourceActionDescriptor[];
};

type DriverTableRow = Record<string, unknown> & {
  _selected?: boolean;
  row: DriverRowModel;
};

type DriversTableProps = {
  locale: Locale;
  rows: DriverTableRow[];
  platformAdminAdapterRegistryHref: string | null;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const signalDetailStyle: CSSProperties = {
  fontSize: 12,
  color: theme.textDim,
  lineHeight: 1.45,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const driverPrimaryStyle: CSSProperties = {
  color: theme.text,
  textDecoration: "none",
  fontWeight: 700,
};

const driverSecondaryStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
};

const inlineLinkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
};

const actionsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

function presenceTone(presence: PlatformPresenceRecord): CanvasTone {
  if (presence.reauthRequired) return "warn";
  if (presence.status === "online" && presence.eligibility === "eligible") {
    return "success";
  }
  if (presence.status === "online") return "info";
  return "neutral";
}

function presenceLabel(
  presence: PlatformPresenceRecord,
  locale: Locale,
): string {
  const name = PLATFORM_CODE_REGISTRY[presence.platformCode]?.displayName;
  const binding = presence.accountId
    ? locale === "zh"
      ? "已綁定"
      : "bound"
    : locale === "zh"
      ? "未綁定"
      : "unbound";
  const status = presence.reauthRequired
    ? "reauth"
    : formatOpsCodeLabel(locale, presence.status);
  return `${name ?? presence.platformCode} · ${status} · ${binding}`;
}

function getDriverActionPresentation(
  row: DriverRowModel,
  action: ResourceActionDescriptor,
  locale: Locale,
  platformAdminAdapterRegistryHref: string | null,
) {
  if (
    action.action === "open_driver_detail" ||
    action.action === "open_driver" ||
    action.action === "view_driver_detail"
  ) {
    return {
      href: `/drivers/${encodeURIComponent(row.driver.driverId)}`,
      label: t("drivers.list.openDetail", locale),
      ariaLabel: getOpsLabel(locale, "openDriverDetail", {
        driverId: row.driver.driverId,
      }),
    };
  }
  if (
    action.action === "open_active_dispatch" ||
    action.action === "open_dispatch" ||
    action.action === "view_dispatch_detail"
  ) {
    return row.activeForwardedOrders[0]
      ? {
          href: `/dispatch/${encodeURIComponent(row.activeForwardedOrders[0].mirrorOrderId)}`,
          label: t("drivers.list.openDispatch", locale),
        }
      : { label: t("drivers.list.openDispatch", locale) };
  }
  if (
    action.action === "open_adapter_registry" ||
    action.action === "inspect_adapter_registry" ||
    action.action === "open_platform_admin_adapter_registry"
  ) {
    return platformAdminAdapterRegistryHref
      ? {
          href: platformAdminAdapterRegistryHref,
          target: "_blank" as const,
          label: t("drivers.list.openAdapterRegistry", locale),
        }
      : { label: t("drivers.list.openAdapterRegistry", locale) };
  }
  return {
    label: formatOpsCodeLabel(locale, action.action),
  };
}

function getPrimaryDriverDetailPresentation(
  row: DriverRowModel,
  locale: Locale,
  platformAdminAdapterRegistryHref: string | null,
) {
  const action = row.availableActions.find(
    (candidate) =>
      candidate.enabled &&
      (candidate.action === "open_driver_detail" ||
        candidate.action === "open_driver" ||
        candidate.action === "view_driver_detail"),
  );

  return action
    ? getDriverActionPresentation(
        row,
        action,
        locale,
        platformAdminAdapterRegistryHref,
      )
    : null;
}

function getLocationTone(state: DriverRowModel["locationState"]): CanvasTone {
  if (state === "live") return "success";
  if (state === "unknown") return "neutral";
  return "warn";
}

function getStatusTone(
  workState: DriverRegistryRecord["workState"],
): CanvasTone {
  if (workState === "available") return "success";
  if (workState === "on_trip") return "info";
  if (workState === "incident_hold" || workState === "suspended") {
    return "danger";
  }
  if (workState === "offline") return "neutral";
  return "warn";
}

function buttonLinkStyle(
  currentTheme: CanvasTheme,
  variant: "primary" | "secondary" = "secondary",
  disabled = false,
): CSSProperties {
  const styles =
    variant === "primary"
      ? {
          background: currentTheme.accent,
          color: "#fff",
          borderColor: currentTheme.accent,
        }
      : {
          background: currentTheme.surface,
          color: currentTheme.text,
          borderColor: currentTheme.border,
        };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 28,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
    borderRadius: 7,
    border: `1px solid ${styles.borderColor}`,
    background: styles.background,
    color: styles.color,
    lineHeight: 1,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
}

function buildColumns(
  locale: Locale,
  platformAdminAdapterRegistryHref: string | null,
): CanvasTableColumn<DriverTableRow>[] {
  return [
    {
      h: t("drivers.col.driver", locale),
      w: 250,
      r: (tableRow) => {
        const row = tableRow.row;
        const detailPresentation = getPrimaryDriverDetailPresentation(
          row,
          locale,
          platformAdminAdapterRegistryHref,
        );

        return (
          <div style={stackStyle}>
            {detailPresentation?.href ? (
              <Link
                href={detailPresentation.href}
                target={detailPresentation.target}
                rel={
                  detailPresentation.target === "_blank"
                    ? "noreferrer"
                    : undefined
                }
                style={driverPrimaryStyle}
              >
                {row.driver.name}
              </Link>
            ) : (
              <span style={driverPrimaryStyle}>{row.driver.name}</span>
            )}
            <span style={driverSecondaryStyle}>
              {row.driver.driverId}
              {row.driver.phone ? ` · ${row.driver.phone}` : ""}
            </span>
            <div style={chipRowStyle}>
              <Pill
                theme={theme}
                tone={getStatusTone(row.driver.workState)}
                dot
              >
                {formatOpsCodeLabel(locale, row.driver.workState)}
              </Pill>
              <Pill
                theme={theme}
                tone={row.driver.licensesValid ? "success" : "warn"}
              >
                {row.driver.licensesValid
                  ? t("common.valid", locale)
                  : t("common.invalid", locale)}
              </Pill>
              {row.suppressionActive ? (
                <Pill theme={theme} tone="danger">
                  {t("drivers.list.suppressionActive", locale)}
                </Pill>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      h: t("drivers.col.shift", locale),
      w: 150,
      r: (tableRow) => {
        const row = tableRow.row;

        return (
          <div style={stackStyle}>
            <Pill theme={theme} tone={getStatusTone(row.driver.workState)} dot>
              {formatOpsCodeLabel(locale, row.driver.workState)}
            </Pill>
            <span style={signalDetailStyle}>
              {formatOpsCodeLabel(locale, row.driver.lifecycleStatus)}
            </span>
          </div>
        );
      },
    },
    {
      h: t("drivers.col.platformsOnline", locale),
      w: 270,
      r: (tableRow) => {
        const row = tableRow.row;

        return row.presences.length > 0 ? (
          <div style={stackStyle}>
            <div style={chipRowStyle}>
              {row.presences.map((presence) => (
                <Pill
                  key={`${row.driver.driverId}:${presence.platformCode}`}
                  theme={theme}
                  tone={presenceTone(presence)}
                  dot
                >
                  {PLATFORM_CODE_REGISTRY[presence.platformCode]?.displayName ??
                    presence.platformCode}
                </Pill>
              ))}
            </div>
            <span style={signalDetailStyle}>
              {row.presences
                .map((presence) => presenceLabel(presence, locale))
                .join(" · ")}
            </span>
            {row.presenceLoadFailed ? (
              <span style={{ ...signalDetailStyle, color: "#b45309" }}>
                {t("drivers.list.platformStatusPartial", locale)}
              </span>
            ) : null}
          </div>
        ) : row.presenceLoadFailed ? (
          <div style={stackStyle}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {t("drivers.list.platformStatusUnknown", locale)}
            </span>
            <span style={signalDetailStyle}>
              {t("drivers.list.platformStatusUnknownBody", locale)}
            </span>
          </div>
        ) : (
          <div style={stackStyle}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {t("drivers.list.noPlatformBindings", locale)}
            </span>
            <span style={signalDetailStyle}>
              {t("drivers.list.bindingMissing", locale)}
            </span>
          </div>
        );
      },
    },
    {
      h: t("drivers.col.eligibilityBuckets", locale),
      w: 230,
      r: (tableRow) => {
        const row = tableRow.row;

        return (
          <div style={stackStyle}>
            <Pill
              theme={theme}
              tone={row.driver.dispatchEligible ? "success" : "warn"}
            >
              {row.driver.dispatchEligible
                ? t("drivers.list.eligibilityClear", locale)
                : row.driver.eligibilityBlockedReasons
                    .map((reason) => formatOpsCodeLabel(locale, reason))
                    .join("、")}
            </Pill>
            <span style={signalDetailStyle}>
              {row.driver.supportedServiceBuckets
                .map((bucket) => formatOpsCodeLabel(locale, bucket))
                .join(" · ")}
            </span>
          </div>
        );
      },
    },
    {
      h: t("drivers.col.activeOrders", locale),
      w: 220,
      r: (tableRow) => {
        const row = tableRow.row;

        return row.activeForwardedOrders.length > 0 ? (
          <div style={stackStyle}>
            {row.activeForwardedOrders.slice(0, 2).map((order) => (
              <Link
                key={order.mirrorOrderId}
                href={`/dispatch/${encodeURIComponent(order.mirrorOrderId)}`}
                style={inlineLinkStyle}
              >
                {PLATFORM_CODE_REGISTRY[order.platformCode]?.displayName ??
                  order.platformCode}
                {" · "}
                {order.mirrorOrderId}
              </Link>
            ))}
          </div>
        ) : (
          <div style={stackStyle}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {t("drivers.list.noActiveOrders", locale)}
            </span>
            <span style={signalDetailStyle}>
              {t("drivers.list.activeOrdersFallback", locale)}
            </span>
          </div>
        );
      },
    },
    {
      h: t("drivers.col.locationSignal", locale),
      w: 170,
      r: (tableRow) => {
        const row = tableRow.row;
        const locationLabel =
          row.locationState === "unknown"
            ? t("drivers.list.locationUnknown", locale)
            : row.locationState === "missing"
              ? t("drivers.list.locationMissing", locale)
              : row.locationState === "stale"
                ? t("drivers.list.locationStale", locale)
                : t("drivers.list.locationLive", locale);

        return (
          <div style={stackStyle}>
            <Pill theme={theme} tone={getLocationTone(row.locationState)} dot>
              {locationLabel}
            </Pill>
            <span style={signalDetailStyle}>
              {row.location?.recordedAt
                ? t("driverDetail.summary.locationRecordedAt", locale, {
                    recordedAt: row.location.recordedAt,
                  })
                : t("driverDetail.summary.locationNoSample", locale)}
            </span>
          </div>
        );
      },
    },
    {
      h: t("common.actions", locale),
      w: 230,
      r: (tableRow) => {
        const row = tableRow.row;

        return (
          <div style={actionsWrapStyle}>
            {row.availableActions.length === 0 ? (
              <span style={signalDetailStyle}>{t("common.dash", locale)}</span>
            ) : (
              row.availableActions.map((action) => {
                const presentation = getDriverActionPresentation(
                  row,
                  action,
                  locale,
                  platformAdminAdapterRegistryHref,
                );

                if (action.enabled && presentation.href) {
                  return (
                    <Link
                      key={action.action}
                      href={presentation.href}
                      target={presentation.target}
                      rel={
                        presentation.target === "_blank"
                          ? "noreferrer"
                          : undefined
                      }
                      style={buttonLinkStyle(theme)}
                      aria-label={presentation.ariaLabel}
                    >
                      {presentation.label}
                    </Link>
                  );
                }

                return (
                  <span
                    key={action.action}
                    style={buttonLinkStyle(theme, "secondary", !action.enabled)}
                    aria-label={presentation.ariaLabel}
                    title={
                      !action.enabled && action.disabledReasonCode
                        ? formatOpsCodeLabel(locale, action.disabledReasonCode)
                        : undefined
                    }
                  >
                    {presentation.label}
                  </span>
                );
              })
            )}
          </div>
        );
      },
    },
  ];
}

export function DriversTable({
  locale,
  rows,
  platformAdminAdapterRegistryHref,
}: DriversTableProps) {
  return (
    <Table
      theme={theme}
      columns={buildColumns(locale, platformAdminAdapterRegistryHref)}
      rows={rows}
    />
  );
}
