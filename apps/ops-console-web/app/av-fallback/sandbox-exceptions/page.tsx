import type { ReactNode } from "react";
import Link from "next/link";
import { buildCanvasTheme } from "@drts/ui-web";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasPillTone,
  type CanvasTableColumn,
} from "@drts/ui-web";
import {
  buildAlertActionPath,
  loadSandboxExceptionData,
  selectAlertActions,
} from "../../../lib/ops-av-fallback";
import {
  formatOpsActionLabel,
  formatOpsCodeLabel,
} from "../../../lib/localized-labels";
import { getServerLocale } from "../../../lib/server-locale";
import { t, type Locale } from "../../../lib/translations";
import {
  OpsWriteActionList,
  type OpsWriteActionItem,
} from "../../../components/ops-write-action-list";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

export type SandboxExceptionsSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type SandboxExceptionsPageProps = {
  searchParams?: Promise<SandboxExceptionsSearchParams>;
};

type SandboxExceptionRow = Record<string, ReactNode> & {
  alertId: ReactNode;
  type: ReactNode;
  vehicle: ReactNode;
  order: ReactNode;
  summary: ReactNode;
  severity: ReactNode;
  openedAt: ReactNode;
  status: ReactNode;
  action: ReactNode;
};

const SEVERITY_TONE: Record<"info" | "warning" | "critical", CanvasPillTone> = {
  info: "info",
  warning: "warn",
  critical: "danger",
};

const STATUS_TONE: Record<
  "open" | "acknowledged" | "resolved",
  CanvasPillTone
> = {
  open: "warn",
  acknowledged: "neutral",
  resolved: "success",
};

function parseSelectedAlertType(
  searchParams: SandboxExceptionsSearchParams | undefined,
): string | null {
  const raw = searchParams?.type;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "all") {
    return null;
  }
  return trimmed;
}

function collectAlertTypeOptions(
  alerts: readonly { alertType: string }[],
  activeType: string | null,
): string[] {
  const seen = new Set<string>();
  const types: string[] = [];
  for (const alert of alerts) {
    const value = alert.alertType.trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      types.push(value);
    }
  }
  if (activeType && !seen.has(activeType)) {
    types.push(activeType);
  }
  return types;
}

function buildColumns(
  locale: Locale,
): CanvasTableColumn<SandboxExceptionRow>[] {
  return [
    {
      h: t("avFallback.exceptions.col.id", locale),
      k: "alertId",
      w: 120,
      mono: true,
    },
    {
      h: t("avFallback.exceptions.col.type", locale),
      k: "type",
      w: 170,
      mono: true,
    },
    {
      h: t("avFallback.exceptions.col.vehicle", locale),
      k: "vehicle",
      w: 120,
      mono: true,
    },
    {
      h: t("avFallback.exceptions.col.order", locale),
      k: "order",
      w: 180,
      mono: true,
    },
    { h: t("avFallback.exceptions.col.summary", locale), k: "summary", w: 280 },
    {
      h: t("avFallback.exceptions.col.severity", locale),
      k: "severity",
      w: 110,
    },
    {
      h: t("avFallback.exceptions.col.openedAt", locale),
      k: "openedAt",
      w: 120,
      mono: true,
    },
    { h: t("avFallback.exceptions.col.status", locale), k: "status", w: 120 },
    { h: t("avFallback.exceptions.col.action", locale), k: "action", w: 240 },
  ];
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function buildActionItems(
  locale: Locale,
  alert: {
    alertId: string;
    availableActions: readonly {
      action: string;
      enabled: boolean;
      disabledReasonCode?: string;
      requiresReason?: boolean;
      riskLevel: "low" | "medium" | "high";
    }[];
  },
): OpsWriteActionItem[] {
  const [descriptor] = selectAlertActions(alert, [
    "fallback-to-human",
    "resolve",
    "ack",
    "open-incident",
    "operational-hold",
    "start-evidence-freeze",
    "stop-new-dispatch",
  ]);

  if (!descriptor) {
    return [];
  }

  return [
    {
      action: descriptor.action,
      enabled: descriptor.enabled,
      riskLevel: descriptor.riskLevel,
      label: formatOpsActionLabel(locale, descriptor.action),
      path: buildAlertActionPath(alert, descriptor),
      ...(descriptor.disabledReasonCode
        ? { disabledReasonCode: descriptor.disabledReasonCode }
        : {}),
      ...(descriptor.requiresReason !== undefined
        ? { requiresReason: descriptor.requiresReason }
        : {}),
      ...(descriptor.requiresReason
        ? {
            reason: t("avFallback.actions.reason.sandboxException", locale, {
              alertId: alert.alertId,
            }),
          }
        : {}),
    },
  ];
}

function buildOrderCell(bookingContextId: string, orderId: string | null) {
  return (
    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <span
        style={{
          fontFamily: theme.monoFamily,
          color: theme.text,
          fontWeight: 600,
        }}
      >
        {bookingContextId}
      </span>
      <span
        style={{
          fontFamily: theme.monoFamily,
          color: theme.textMuted,
          fontSize: 11,
        }}
      >
        {orderId ?? "—"}
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function SandboxExceptionsPage({
  searchParams,
}: SandboxExceptionsPageProps) {
  const [locale, resolvedSearchParams, { alerts, ordersById }] =
    await Promise.all([
      getServerLocale(),
      Promise.resolve(searchParams),
      loadSandboxExceptionData(),
    ]);
  const activeType = parseSelectedAlertType(resolvedSearchParams);
  const selectedType = activeType ?? "all";
  const typeOptions = collectAlertTypeOptions(alerts, activeType);
  const filteredAlerts = activeType
    ? alerts.filter((alert) => alert.alertType === activeType)
    : alerts;
  const columns = buildColumns(locale);

  const rows: SandboxExceptionRow[] = filteredAlerts.map((alert) => {
    const order = alert.orderId
      ? (ordersById.get(alert.orderId) ?? null)
      : null;
    const bookingContextId =
      order?.bookingId ?? order?.orderId ?? alert.orderId ?? "—";
    const actions = buildActionItems(locale, alert);

    return {
      alertId: (
        <span
          style={{
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 700,
          }}
        >
          {alert.alertId}
        </span>
      ),
      type: (
        <span style={{ fontFamily: theme.monoFamily }}>
          {formatOpsCodeLabel(locale, alert.alertType)}
        </span>
      ),
      vehicle: (
        <span style={{ fontFamily: theme.monoFamily }}>
          {alert.vehicleId ?? "—"}
        </span>
      ),
      order: buildOrderCell(bookingContextId, alert.orderId),
      summary: (
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={{ color: theme.text, fontWeight: 600 }}>
            {alert.title}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {alert.summary}
          </span>
        </div>
      ),
      severity: (
        <Pill theme={theme} tone={SEVERITY_TONE[alert.severity]} dot>
          {formatOpsCodeLabel(locale, alert.severity)}
        </Pill>
      ),
      openedAt: (
        <span style={{ fontFamily: theme.monoFamily }}>
          {formatDateTime(locale, alert.openedAt)}
        </span>
      ),
      status: (
        <Pill theme={theme} tone={STATUS_TONE[alert.status]} dot>
          {formatOpsCodeLabel(locale, alert.status)}
        </Pill>
      ),
      action: <OpsWriteActionList items={actions} locale={locale} size="xs" />,
    };
  });

  return (
    <main
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={theme}
        title={t("avFallback.exceptions.title", locale)}
        subtitle={t("avFallback.exceptions.subtitle", locale)}
        actions={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Pill theme={theme} tone="neutral">
              {t("avFallback.exceptions.filter.count", locale, {
                matched: filteredAlerts.length,
                total: alerts.length,
              })}
            </Pill>
            <form
              method="get"
              action="/av-fallback/sandbox-exceptions"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <label
                htmlFor="sandbox-exceptions-type-filter"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: theme.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>{t("avFallback.exceptions.filter", locale)}</span>
                <select
                  id="sandbox-exceptions-type-filter"
                  name="type"
                  defaultValue={selectedType}
                  style={{
                    height: 32,
                    padding: "0 10px",
                    borderRadius: 7,
                    border: `1px solid ${theme.border}`,
                    background: theme.surface,
                    color: theme.text,
                    fontFamily: theme.fontFamily,
                    fontSize: 12,
                  }}
                >
                  <option value="all">
                    {t("avFallback.exceptions.filter.all", locale)}
                  </option>
                  {typeOptions.map((alertType) => (
                    <option key={alertType} value={alertType}>
                      {formatOpsCodeLabel(locale, alertType)}
                    </option>
                  ))}
                </select>
              </label>
              <Btn theme={theme} icon="filter" type="submit">
                {t("avFallback.exceptions.filter.apply", locale)}
              </Btn>
              <Link
                href="/av-fallback/sandbox-exceptions"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 7,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  color: theme.text,
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {t("avFallback.exceptions.filter.reset", locale)}
              </Link>
            </form>
            <Link
              href="/av-fallback"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 32,
                padding: "0 12px",
                borderRadius: 999,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.text,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {t("avFallback.recovery.back", locale)}
            </Link>
          </div>
        }
      />

      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={t("avFallback.exceptions.banner.title", locale)}
        body={t("avFallback.exceptions.banner.body", locale)}
      />

      {alerts.length === 0 ? (
        <Card
          theme={theme}
          title={t("avFallback.exceptions.empty.title", locale)}
          subtitle={t("avFallback.exceptions.empty.body", locale)}
        >
          {null}
        </Card>
      ) : rows.length === 0 ? (
        <Card
          theme={theme}
          title={t("avFallback.exceptions.filteredEmpty.title", locale)}
          subtitle={t("avFallback.exceptions.filteredEmpty.body", locale)}
        >
          {null}
        </Card>
      ) : (
        <Card theme={theme} padding={0}>
          <Table theme={theme} columns={columns} rows={rows} />
        </Card>
      )}
    </main>
  );
}
