"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatHealthMetricValue,
  getHealthPageCopy,
  getHealthStatusLabel,
  t,
} from "@/lib/translations";
import type {
  AdapterHealthRecord,
  OperationalAlertRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import {
  beginHealthPageLoad,
  buildPlatformHealthViewModel,
  createInitialHealthPageState,
  formatAlertMeasure,
  formatAlertRoute,
  formatAlertTitle,
  formatValidHealthTimestamp,
  loadPlatformHealthSources,
  type AdapterInventoryRow,
  type HealthPageLoadState,
} from "./health-observability-model";

type HealthTabKey = "alerts" | "dispatch" | "webhook" | "filing" | "adapters";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const bodyStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 24,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
} satisfies CSSProperties;

const listStyle = {
  display: "flex",
  flexDirection: "column",
} satisfies CSSProperties;

const listRowStyle = (th: CanvasTheme): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
  borderBottom: `1px solid ${th.border}`,
});

const alertTextStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: 12.5,
  lineHeight: 1.45,
} satisfies CSSProperties;

const alertMetaStyle = {
  display: "grid",
  gap: 2,
  minWidth: 0,
} satisfies CSSProperties;

const alertSecondaryStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
} satisfies CSSProperties;

const monoMutedStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
  padding: "32px 16px",
} satisfies CSSProperties;

const summaryListStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const summaryRowStyle = (th: CanvasTheme): CSSProperties => ({
  display: "grid",
  gap: 4,
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
});

const summaryValueStyle = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.textDim,
} satisfies CSSProperties;

const tabKeyOrder: HealthTabKey[] = [
  "alerts",
  "dispatch",
  "webhook",
  "filing",
  "adapters",
];

function alertTone(
  state: OperationalAlertRecord["state"] | AdapterHealthRecord["status"],
): CanvasTone {
  switch (state) {
    case "critical":
    case "down":
      return "danger";
    case "warning":
    case "degraded":
      return "warn";
    case "healthy":
      return "success";
    default:
      return "neutral";
  }
}

function buildAlertHref(alert: OperationalAlertRecord): string {
  switch (alert.key) {
    case "driver_state_lag":
      return "/fleet?tab=drivers";
    case "adapter_degradation":
      return "/adapter-registry";
    default:
      return "/health";
  }
}

function buildCanvasTabs(
  activeAlertsCount: number,
  copy: ReturnType<typeof getHealthPageCopy>,
): Record<HealthTabKey, ReactNode> {
  const suffix = activeAlertsCount > 0 ? ` · ${activeAlertsCount}` : "";

  return {
    alerts: copy.tab.alertsWithCount(suffix),
    dispatch: copy.tab.dispatch,
    webhook: copy.tab.webhook,
    filing: copy.tab.filing,
    adapters: copy.tab.adapters,
  };
}

export default function HealthPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [loadState, setLoadState] = useState<HealthPageLoadState>(() =>
    createInitialHealthPageState(),
  );
  const stateRef = useRef<HealthPageLoadState>(loadState);
  const [isRefreshing, setIsRefreshing] = useState(true);

  const copy = useMemo(() => getHealthPageCopy(locale), [locale]);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    const loadingState = beginHealthPageLoad(stateRef.current);
    stateRef.current = loadingState;
    setLoadState(loadingState);

    try {
      const nextState = await loadPlatformHealthSources(
        client,
        stateRef.current,
      );
      stateRef.current = nextState;
      setLoadState(nextState);
    } finally {
      setIsRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const viewModel = useMemo(
    () => buildPlatformHealthViewModel(loadState, locale),
    [loadState, locale],
  );

  const adapterColumns = useMemo<CanvasTableColumn<AdapterInventoryRow>[]>(
    () => [
      { h: copy.adapterColumns.adapter, k: "adapter", mono: true, w: 132 },
      {
        h: copy.adapterColumns.source,
        w: 208,
        r: (row) => (
          <div style={{ display: "grid", gap: 3 }}>
            <span>{row.source}</span>
            <span style={monoMutedStyle}>{row.note}</span>
          </div>
        ),
      },
      { h: copy.adapterColumns.kind, k: "kind", mono: true, w: 104 },
      {
        h: copy.adapterColumns.status,
        w: 132,
        r: (row) => (
          <CanvasPill theme={theme} tone={alertTone(row.status)} dot>
            {getHealthStatusLabel(locale, row.status)}
          </CanvasPill>
        ),
      },
      {
        h: copy.adapterColumns.latency,
        k: "latency",
        mono: true,
        align: "right",
        w: 108,
      },
      { h: copy.adapterColumns.lastEvent, k: "lastEvent", mono: true, w: 156 },
      {
        h: copy.adapterColumns.orders24h,
        k: "orders24h",
        mono: true,
        align: "right",
        w: 110,
      },
    ],
    [copy.adapterColumns, locale],
  );

  const tabNodes = useMemo(
    () => buildCanvasTabs(viewModel.activeAlerts.length, copy),
    [viewModel.activeAlerts.length, copy],
  );

  const pageSubtitle = useMemo(() => {
    if (!viewModel.sourceGeneratedAt) {
      return copy.subtitle;
    }
    const formattedSource = formatValidHealthTimestamp(
      viewModel.sourceGeneratedAt,
    );
    return `${copy.subtitle} · ${t("health.lastRefresh", locale, { time: formattedSource })}`;
  }, [copy.subtitle, locale, viewModel.sourceGeneratedAt]);

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={pageSubtitle}
        tabs={tabKeyOrder.map((key) => tabNodes[key])}
        activeTab={tabNodes.alerts}
        actions={
          <CanvasBtn
            theme={theme}
            icon="refresh"
            onClick={() => void loadData()}
            disabled={isRefreshing}
          >
            {copy.refresh}
          </CanvasBtn>
        }
      />

      <div style={bodyStyle}>
        {viewModel.banner ? (
          <CanvasBanner
            theme={theme}
            tone={viewModel.banner.tone}
            title={viewModel.banner.title}
            body={viewModel.banner.body}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={viewModel.kpis.dispatch.label}
            value={viewModel.kpis.dispatch.value}
            {...(viewModel.kpis.dispatch.delta !== undefined
              ? { delta: viewModel.kpis.dispatch.delta }
              : {})}
            deltaTone={viewModel.kpis.dispatch.deltaTone}
            sub={viewModel.kpis.dispatch.sub}
          />
          <CanvasKPI
            theme={theme}
            label={viewModel.kpis.webhook.label}
            value={viewModel.kpis.webhook.value}
            {...(viewModel.kpis.webhook.delta !== undefined
              ? { delta: viewModel.kpis.webhook.delta }
              : {})}
            deltaTone={viewModel.kpis.webhook.deltaTone}
            sub={viewModel.kpis.webhook.sub}
          />
          <CanvasKPI
            theme={theme}
            label={viewModel.kpis.eligibility.label}
            value={viewModel.kpis.eligibility.value}
            {...(viewModel.kpis.eligibility.delta !== undefined
              ? { delta: viewModel.kpis.eligibility.delta }
              : {})}
            deltaTone={viewModel.kpis.eligibility.deltaTone}
            sub={viewModel.kpis.eligibility.sub}
          />
          <CanvasKPI
            theme={theme}
            label={viewModel.kpis.reporting.label}
            value={viewModel.kpis.reporting.value}
            {...(viewModel.kpis.reporting.delta !== undefined
              ? { delta: viewModel.kpis.reporting.delta }
              : {})}
            deltaTone={viewModel.kpis.reporting.deltaTone}
            sub={viewModel.kpis.reporting.sub}
          />
        </div>

        <div style={detailGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.alertsTitle}
            {...(viewModel.observabilityStatus === "stale" &&
            viewModel.sourceGeneratedAt
              ? {
                  actions: (
                    <CanvasPill theme={theme} tone="warn" dot>
                      {`${getHealthStatusLabel(locale, "stale")} · ${formatValidHealthTimestamp(viewModel.sourceGeneratedAt)}`}
                    </CanvasPill>
                  ),
                }
              : {})}
          >
            {viewModel.alertsEmptyState.kind !== "none" ? (
              <div style={emptyStateStyle}>
                {viewModel.alertsEmptyState.message}
              </div>
            ) : (
              <div style={listStyle}>
                {viewModel.activeAlerts.map(
                  (alert: OperationalAlertRecord, index: number) => {
                    const measured = formatAlertMeasure(locale, alert);
                    const threshold = formatHealthMetricValue(
                      locale,
                      alert.thresholds.critical,
                      alert.thresholds.unit,
                    );
                    return (
                      <div
                        key={alert.key}
                        style={{
                          ...listRowStyle(theme),
                          borderBottom:
                            index === viewModel.activeAlerts.length - 1
                              ? "none"
                              : `1px solid ${theme.border}`,
                        }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={alertTone(alert.state)}
                          dot
                        >
                          {formatAlertRoute(locale, alert.routes)}
                        </CanvasPill>
                        <div style={alertTextStyle}>
                          <div style={alertMetaStyle}>
                            <span>{formatAlertTitle(locale, alert.key)}</span>
                            <span style={alertSecondaryStyle}>
                              {copy.alertMeasurement({
                                measured,
                                threshold,
                              })}
                            </span>
                          </div>
                        </div>
                        <span style={monoMutedStyle}>
                          {formatValidHealthTimestamp(
                            alert.observedAt,
                            getHealthStatusLabel(locale, "unknown"),
                          )}
                        </span>
                        <CanvasBtn
                          theme={theme}
                          variant="ghost"
                          icon="ext"
                          size="xs"
                          onClick={() => {
                            window.location.href = buildAlertHref(alert);
                          }}
                        >
                          {copy.openAlert}
                        </CanvasBtn>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.dispatchTitle}
            subtitle={copy.dispatchEmpty}
          >
            <div style={summaryListStyle}>
              {viewModel.dispatchSummary.map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    ...summaryRowStyle(theme),
                    borderBottom:
                      index === viewModel.dispatchSummary.length - 1
                        ? "none"
                        : `1px solid ${theme.border}`,
                    paddingBottom:
                      index === viewModel.dispatchSummary.length - 1 ? 0 : 10,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={summaryValueStyle}>{item.value}</span>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        <div style={detailGridStyle}>
          <CanvasCard
            theme={theme}
            title={copy.webhookTitle}
            subtitle={copy.webhookEmpty}
          >
            <div style={summaryListStyle}>
              {viewModel.webhookSummary.map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    ...summaryRowStyle(theme),
                    borderBottom:
                      index === viewModel.webhookSummary.length - 1
                        ? "none"
                        : `1px solid ${theme.border}`,
                    paddingBottom:
                      index === viewModel.webhookSummary.length - 1 ? 0 : 10,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={summaryValueStyle}>{item.value}</span>
                </div>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={copy.filingTitle}
            subtitle={copy.filingEmpty}
          >
            <div style={summaryListStyle}>
              {viewModel.filingSummary.map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    ...summaryRowStyle(theme),
                    borderBottom:
                      index === viewModel.filingSummary.length - 1
                        ? "none"
                        : `1px solid ${theme.border}`,
                    paddingBottom:
                      index === viewModel.filingSummary.length - 1 ? 0 : 10,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={summaryValueStyle}>{item.value}</span>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={theme}
          title={`${copy.adaptersTitle} · ${copy.adapterEntries(viewModel.adapterRows.length)}`}
          subtitle={copy.metricsNote}
          padding={0}
        >
          {viewModel.adaptersEmptyState.kind !== "none" ? (
            <div style={emptyStateStyle}>
              {viewModel.adaptersEmptyState.message}
            </div>
          ) : (
            <CanvasTable
              theme={theme}
              columns={adapterColumns}
              rows={viewModel.adapterRows}
            />
          )}
        </CanvasCard>
      </div>
    </>
  );
}
