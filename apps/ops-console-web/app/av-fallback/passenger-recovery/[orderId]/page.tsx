import Link from "next/link";
import { notFound } from "next/navigation";
import type { OwnedOrderRecord, ResourceActionDescriptor } from "@drts/contracts";
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
  loadAvFallbackRecoveryData,
  resolveMonitorStageLabelKey,
  selectAlertActions,
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

function linkChipStyle(primary = false) {
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
  } as const;
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
  return selectAlertActions(alert, [
    "fallback-to-human",
    "resolve",
    "open-incident",
    "ack",
  ]).map((descriptor: ResourceActionDescriptor) => ({
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
          reason:
            locale === "zh"
              ? `Passenger recovery 動作：${alert.alertId}`
              : `Passenger recovery action: ${alert.alertId}`,
        }
      : {}),
  }));
}

export const dynamic = "force-dynamic";

export default async function PassengerRecoveryPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const [{ orderId }, locale] = await Promise.all([params, getServerLocale()]);
  const { order, alert, trip } = await loadAvFallbackRecoveryData(orderId);

  if (!order) {
    notFound();
  }

  const stage =
    order.status === "completed"
      ? "completed"
      : order.status === "driver_accepted" ||
          order.status === "enroute_pickup" ||
          order.status === "arrived_pickup" ||
          order.status === "on_trip" ||
          order.status === "proof_pending"
        ? "human_enroute"
        : alert?.alertType === "human_fallback" || trip?.humanFallbackActive
          ? "reassigning"
          : "triggered";

  const messageCode =
    (
      order as OwnedOrderRecord & {
        passengerDisclosure?: {
          messageCode?: string | null;
          requiresAcknowledgement?: boolean | null;
          acknowledgedAt?: string | null;
        } | null;
      }
    ).passengerDisclosure?.messageCode ??
    t("avFallback.recovery.missingMessageCode", locale);
  const passengerDisclosure = (
    order as OwnedOrderRecord & {
      passengerDisclosure?: {
        messageCode?: string | null;
        requiresAcknowledgement?: boolean | null;
        acknowledgedAt?: string | null;
      } | null;
    }
  ).passengerDisclosure;

  const actions = alert ? buildWriteActionItems(locale, alert) : [];
  const stageTone =
    stage === "completed"
      ? "success"
      : stage === "human_enroute"
        ? "info"
        : stage === "reassigning"
          ? "warn"
          : "danger";

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        theme={theme}
        title={t("avFallback.recovery.title", locale)}
        subtitle={t("avFallback.recovery.subtitle", locale)}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/av-fallback" style={linkChipStyle()}>
              {t("avFallback.recovery.back", locale)}
            </Link>
            <Link href="/av-fallback/sandbox-exceptions" style={linkChipStyle()}>
              {t("avFallback.recovery.exceptionsLink", locale)}
            </Link>
          </div>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.95fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            theme={theme}
            title={t("avFallback.recovery.contextTitle", locale)}
            subtitle={t("avFallback.recovery.contextSub", locale)}
          >
            <DL
              theme={theme}
              cols={2}
              items={[
                { k: t("avFallback.card.booking", locale), v: order.bookingId ?? order.orderId, mono: true },
                { k: "Order", v: order.orderId, mono: true },
                { k: t("avFallback.card.passenger", locale), v: order.passenger.name, mono: false },
                { k: "Phone", v: order.passenger.phone, mono: true },
                { k: "Pickup", v: order.pickup.address, mono: false },
                { k: "Dropoff", v: order.dropoff.address, mono: false },
                { k: t("avFallback.recovery.currentEta", locale), v: order.etaSnapshot ? `${order.etaSnapshot.etaMinutes} min` : "—", mono: true },
                { k: t("avFallback.recovery.calculatedAt", locale), v: formatDateTime(locale, order.etaSnapshot?.calculatedAt), mono: true },
              ]}
            />
          </Card>

          <Card
            theme={theme}
            title={t("avFallback.recovery.messageTitle", locale)}
            subtitle={t("avFallback.recovery.messageSub", locale)}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 14,
                borderRadius: 12,
                background: theme.surfaceLo,
                border: `1px solid ${theme.border}`,
              }}
            >
              <span style={{ fontSize: 11, color: theme.textMuted }}>
                {t("avFallback.recovery.messageCodeLabel", locale)}
              </span>
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontSize: 18,
                  fontWeight: 700,
                  color: theme.accent,
                  wordBreak: "break-all",
                }}
              >
                {messageCode}
              </span>
              <DL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: t("avFallback.recovery.ackLabel", locale),
                    v: passengerDisclosure?.requiresAcknowledgement
                      ? t("avFallback.recovery.ackRequired", locale)
                      : t("avFallback.recovery.ackNotRequired", locale),
                    mono: false,
                  },
                  {
                    k: t("avFallback.recovery.acknowledgedAt", locale),
                    v: formatDateTime(
                      locale,
                      passengerDisclosure?.acknowledgedAt,
                    ),
                    mono: true,
                  },
                ]}
              />
              <div
                style={{
                  display: "flex",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  color: theme.textMuted,
                  fontSize: 12,
                }}
              >
                <span>{t("avFallback.recovery.internalGuardrail", locale)}</span>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            theme={theme}
            title={t("avFallback.recovery.statusTitle", locale)}
            subtitle={t("avFallback.recovery.statusSub", locale)}
          >
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  k: t("avFallback.recovery.currentStage", locale),
                  v: (
                    <Pill theme={theme} tone={stageTone} dot>
                      {t(resolveMonitorStageLabelKey(stage), locale)}
                    </Pill>
                  ),
                  mono: false,
                },
                {
                  k: t("avFallback.recovery.currentOrderStatus", locale),
                  v: formatOpsCodeLabel(locale, order.status),
                  mono: true,
                },
                {
                  k: t("avFallback.recovery.currentAlertStatus", locale),
                  v: alert ? formatOpsCodeLabel(locale, alert.status) : "—",
                  mono: true,
                },
                {
                  k: t("avFallback.recovery.currentAlert", locale),
                  v: alert?.alertId ?? "—",
                  mono: true,
                },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <OpsWriteActionList items={actions} locale={locale} />
            </div>
          </Card>

          <Banner
            theme={theme}
            tone="info"
            icon="info"
            body={t("avFallback.recovery.noSurcharge", locale)}
          />
        </div>
      </div>
    </main>
  );
}
