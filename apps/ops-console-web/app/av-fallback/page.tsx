import Link from "next/link";
import type { CSSProperties } from "react";
import type { ResourceActionDescriptor } from "@drts/contracts";
import { buildCanvasTheme } from "@drts/ui-web";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
} from "@drts/ui-web";
import {
  buildAlertActionPath,
  loadAvFallbackMonitorData,
  resolveMonitorStageHelpKey,
  resolveMonitorStageLabelKey,
  selectAlertActions,
  AV_FALLBACK_STAGE_ORDER,
  type AvFallbackStage,
} from "@/lib/ops-av-fallback";
import {
  formatOpsActionLabel,
  formatOpsCodeLabel,
} from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  OpsWriteActionList,
  type OpsWriteActionItem,
} from "@/components/ops-write-action-list";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STAGE_TONE: Record<
  AvFallbackStage,
  "danger" | "warn" | "info" | "success"
> = {
  triggered: "danger",
  reassigning: "warn",
  human_enroute: "info",
  completed: "success",
};

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

function linkChipStyle(primary = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    border: `1px solid ${primary ? theme.accent : theme.border}`,
    background: primary ? theme.accent : theme.surface,
    color: primary ? theme.invert : theme.text,
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
    boxShadow: primary ? theme.shadowSm : "none",
  };
}

function buildWriteActionItems(
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
  const selected = selectAlertActions(alert, [
    "fallback-to-human",
    "open-incident",
    "resolve",
    "ack",
  ]);

  return selected.map((descriptor: ResourceActionDescriptor) => ({
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
          reason: t("avFallback.actions.reason.avMonitor", locale, {
            alertId: alert.alertId,
          }),
        }
      : {}),
  }));
}

function StageProgress({
  stage,
  locale,
}: {
  stage: AvFallbackStage;
  locale: Locale;
}) {
  const currentIndex = AV_FALLBACK_STAGE_ORDER.indexOf(stage);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {AV_FALLBACK_STAGE_ORDER.map((step, index) => {
        const done = index <= currentIndex;
        return (
          <div
            key={step}
            style={{
              display: "flex",
              alignItems: "center",
              flex: index === AV_FALLBACK_STAGE_ORDER.length - 1 ? "0" : "1 1 0",
              gap: 4,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                border: `1px solid ${done ? theme.accent : theme.border}`,
                background: done ? theme.accent : theme.surfaceLo,
                color: done ? theme.invert : theme.textDim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {index + 1}
            </div>
            <span
              style={{
                fontSize: 10.5,
                color: index === currentIndex ? theme.text : theme.textMuted,
                fontWeight: index === currentIndex ? 700 : 500,
                whiteSpace: "nowrap",
              }}
            >
              {t(resolveMonitorStageLabelKey(step), locale)}
            </span>
            {index < AV_FALLBACK_STAGE_ORDER.length - 1 ? (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: index < currentIndex ? theme.accent : theme.border,
                  minWidth: 10,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function AvFallbackPage() {
  const locale = await getServerLocale();
  const { items } = await loadAvFallbackMonitorData();

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        theme={theme}
        title={t("avFallback.title", locale)}
        subtitle={t("avFallback.subtitle", locale)}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Pill theme={theme} tone="danger" dot>
              {t("avFallback.activeCount", locale, { count: items.length })}
            </Pill>
            <Link href="/av-fallback/sandbox-exceptions" style={linkChipStyle()}>
              {t("avFallback.card.exceptionLink", locale)}
            </Link>
          </div>
        }
      />

      <Banner
        theme={theme}
        tone="warn"
        icon="warn"
        title={t("avFallback.banner.title", locale)}
        body={t("avFallback.banner.body", locale)}
      />

      {items.length === 0 ? (
        <Card
          theme={theme}
          title={t("avFallback.empty.title", locale)}
          subtitle={t("avFallback.empty.body", locale)}
        >
          {null}
        </Card>
      ) : null}

      {items.map((item) => {
        const actions = buildWriteActionItems(locale, item.alert);
        return (
          <Card theme={theme} key={item.alert.alertId} padding={0}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <span
                style={{
                  color: theme.accent,
                  fontWeight: 700,
                  fontFamily: theme.monoFamily,
                }}
              >
                {item.alert.alertId}
              </span>
              <Pill theme={theme} tone="neutral">
                {item.order?.vehiclePreference ?? item.alert.vehicleId ?? "—"}
              </Pill>
              <span
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  fontFamily: theme.monoFamily,
                }}
              >
                {item.bookingContextId}
              </span>
              <span style={{ flex: 1 }} />
              <Pill theme={theme} tone={STAGE_TONE[item.stage]} dot>
                {t(resolveMonitorStageLabelKey(item.stage), locale)}
              </Pill>
            </div>

            <div
              style={{
                padding: 14,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.35fr) minmax(260px, 0.95fr)",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <StageProgress stage={item.stage} locale={locale} />
                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("avFallback.card.booking", locale),
                      v: item.bookingContextId,
                      mono: true,
                    },
                    {
                      k: t("avFallback.card.alert", locale),
                      v: formatOpsCodeLabel(locale, item.alert.alertType),
                      mono: true,
                    },
                    {
                      k: t("avFallback.card.passenger", locale),
                      v: item.passengerName,
                      mono: false,
                    },
                    {
                      k: t("avFallback.card.eta", locale),
                      v:
                        item.etaMinutes != null
                          ? `${item.etaMinutes} min`
                          : "—",
                      mono: true,
                    },
                    {
                      k: t("avFallback.card.triggeredAt", locale),
                      v: formatDateTime(locale, item.alert.openedAt),
                      mono: true,
                    },
                    {
                      k: t("avFallback.card.vehicle", locale),
                      v: item.alert.vehicleId ?? "—",
                      mono: true,
                    },
                  ]}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: theme.textMuted }}>
                    {t("avFallback.card.summary", locale)}
                  </span>
                  <span style={{ fontSize: 12.5, color: theme.text }}>
                    {item.alert.summary}
                  </span>
                  <span style={{ fontSize: 11, color: theme.textMuted }}>
                    {t(resolveMonitorStageHelpKey(item.stage), locale)}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <OpsWriteActionList items={actions} locale={locale} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {item.order ? (
                    <Link
                      href={`/av-fallback/passenger-recovery/${encodeURIComponent(item.order.orderId)}`}
                      style={linkChipStyle(true)}
                    >
                      {t("avFallback.card.recoveryLink", locale)}
                    </Link>
                  ) : null}
                  <Link
                    href="/av-fallback/sandbox-exceptions"
                    style={linkChipStyle()}
                  >
                    {t("avFallback.card.exceptionLink", locale)}
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </main>
  );
}
