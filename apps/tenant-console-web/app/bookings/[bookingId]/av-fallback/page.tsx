import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { formatDateTime } from "@/lib/formatters";
import { getServerLocale } from "@/lib/server-locale";
import {
  loadTenantAvFallbackDetailItem,
  supportsTenantAvFallbackDetail,
  type TenantAvFallbackListItem,
  type TenantAvFallbackStage,
} from "@/lib/tenant-av-fallback";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const actionAnchorStyle: CSSProperties = {
  textDecoration: "none",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.25fr 0.9fr",
  gap: 16,
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
};

const comparisonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const comparisonPanelStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  background: th.surface,
  padding: 16,
  display: "grid",
  gap: 12,
};

const panelLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.24,
  textTransform: "uppercase",
};

const panelValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 18,
  fontWeight: 700,
};

const panelMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.45,
};

const messageBoxStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 16,
  background: th.surface,
  color: th.text,
  padding: 16,
  fontSize: 14,
  lineHeight: 1.6,
};

const noteStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
  margin: 0,
};

function translateTenantMessageCode(messageCode: string, locale: Locale) {
  const key = `tenantMessageCode.${messageCode}`;
  const translated = t(key, locale);
  return translated === key
    ? t("tenantMessageCode.sandbox_fulfillment.default", locale)
    : translated;
}

function formatEtaMinutes(value: number | null, locale: Locale) {
  if (value == null) {
    return t("avFallback.value.etaPending", locale);
  }

  return t("avFallback.value.etaMinutes", locale, {
    count: new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en").format(
      value,
    ),
  });
}

function getStageTone(stage: TenantAvFallbackStage | null): CanvasTone {
  switch (stage) {
    case "vehicle_change_in_progress":
      return "info";
    case "human_fallback_assigned":
      return "warn";
    case "service_continuing":
      return "success";
    default:
      return "neutral";
  }
}

function getStageLabel(stage: TenantAvFallbackStage | null, locale: Locale) {
  return stage ? t(`avFallback.stage.${stage}`, locale) : "—";
}

function getStageHelp(stage: TenantAvFallbackStage | null, locale: Locale) {
  return stage ? t(`avFallback.stageHelp.${stage}`, locale) : "—";
}

function ActionLink({
  href,
  icon = "chevR",
  children,
}: {
  href: string;
  icon?: "chevR" | "ext";
  children: ReactNode;
}) {
  return (
    <Link href={href} style={actionAnchorStyle}>
      <CanvasBtn theme={th} icon={icon} size="sm" variant="secondary">
        {children}
      </CanvasBtn>
    </Link>
  );
}

function buildBillingItems(item: TenantAvFallbackListItem, locale: Locale) {
  return [
    {
      k: t("avFallback.billing.charge", locale),
      v: t("avFallback.billing.originalFare", locale),
    },
    {
      k: t("avFallback.billing.surcharge", locale),
      v: item.projection.extraChargeDisclosed
        ? t("avFallback.billing.surchargeDisclosed", locale)
        : t("avFallback.billing.noSurchargeLong", locale),
    },
    {
      k: t("avFallback.billing.dimension", locale),
      v: t("avFallback.billing.dimensionValue", locale),
    },
    {
      k: t("avFallback.billing.sla", locale),
      v: t("avFallback.billing.slaUpdatedEta", locale),
    },
    {
      k: t("avFallback.billing.rebooking", locale),
      v: t("avFallback.billing.sameBooking", locale),
    },
  ];
}

export default async function BookingAvFallbackDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const locale = await getServerLocale();
  const item = await loadTenantAvFallbackDetailItem(bookingId);

  if (!item || !supportsTenantAvFallbackDetail(item.projection)) {
    notFound();
  }

  const messageCopy = translateTenantMessageCode(item.tenantMessageCode, locale);
  const stageLabel = getStageLabel(item.fallbackStage, locale);
  const stageHelp = getStageHelp(item.fallbackStage, locale);
  const plannedEta = formatDateTime(item.booking.reservationWindowStart, locale);
  const actualEta = formatEtaMinutes(item.projection.etaMinutes, locale);

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={`${t("avFallback.detail.title", locale)} · ${item.booking.bookingId}`}
        subtitle={t("avFallback.detail.subtitle", locale)}
        actions={
          <div style={actionRowStyle}>
            <ActionLink href="/bookings/av-fallback">
              {t("bookingList.header.avFulfillment", locale)}
            </ActionLink>
            <ActionLink href="/bookings">
              {t("avFallback.action.allBookings", locale)}
            </ActionLink>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <div style={topGridStyle}>
          <CanvasCard
            theme={th}
            title={t("avFallback.detail.plannedActualTitle", locale)}
            subtitle={t("avFallback.detail.plannedActualSub", locale)}
          >
            <div style={comparisonGridStyle}>
              <div style={comparisonPanelStyle}>
                <span style={panelLabelStyle}>
                  {t("avFallback.detail.plannedLabel", locale)}
                </span>
                <CanvasPill theme={th} tone="accent">
                  {t("avFallback.mode.plannedAv", locale)}
                </CanvasPill>
                <div style={panelValueStyle}>
                  {t("avFallback.mode.plannedAv", locale)}
                </div>
                <div style={panelMetaStyle}>
                  {t("avFallback.detail.scheduledPickup", locale, {
                    value: plannedEta,
                  })}
                </div>
              </div>

              <div style={comparisonPanelStyle}>
                <span style={panelLabelStyle}>
                  {t("avFallback.detail.actualLabel", locale)}
                </span>
                <CanvasPill theme={th} tone="warn">
                  {t(`avFallback.mode.${item.actualMode}`, locale)}
                </CanvasPill>
                <div style={panelValueStyle}>
                  {t(`avFallback.mode.${item.actualMode}`, locale)}
                </div>
                <div style={panelMetaStyle}>
                  {t("avFallback.detail.updatedEta", locale, {
                    value: actualEta,
                  })}
                </div>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={`${item.booking.bookingId} · ${item.booking.orderId}`}
            subtitle={`${item.booking.pickup.address} -> ${item.booking.dropoff.address}`}
          >
            <CanvasDL
              theme={th}
              items={[
                {
                  k: t("avFallback.detail.passenger", locale),
                  v: item.booking.passenger.name,
                },
                {
                  k: t("bookingDetail.field.bookingId", locale),
                  v: item.booking.bookingId,
                  mono: true,
                },
                {
                  k: t("bookingDetail.field.orderId", locale),
                  v: item.booking.orderId,
                  mono: true,
                },
                {
                  k: t("bookingDetail.field.pickup", locale),
                  v: item.booking.pickup.address,
                },
                {
                  k: t("bookingDetail.field.dropoff", locale),
                  v: item.booking.dropoff.address,
                },
                {
                  k: t("billing.profile.updatedAt", locale),
                  v: formatDateTime(item.projection.updatedAt, locale),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        <div style={splitGridStyle}>
          <CanvasCard
            theme={th}
            title={t("avFallback.detail.stageTitle", locale)}
            subtitle={t("avFallback.detail.stageSub", locale)}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <CanvasPill theme={th} tone={getStageTone(item.fallbackStage)}>
                {stageLabel}
              </CanvasPill>
              <p style={noteStyle}>{stageHelp}</p>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title={t("avFallback.detail.messageTitle", locale)}
            subtitle={t("avFallback.detail.messageSub", locale)}
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div style={messageBoxStyle}>{messageCopy}</div>
              <p style={noteStyle}>{t("avFallback.message.note", locale)}</p>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title={t("avFallback.detail.billingTitle", locale)}
          subtitle={t("avFallback.detail.billingSub", locale)}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <CanvasDL theme={th} items={buildBillingItems(item, locale)} />
            <p style={noteStyle}>{t("avFallback.billing.note", locale)}</p>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title={t("avFallback.detail.disclosureTitle", locale)}
          subtitle={t("avFallback.detail.disclosureSub", locale)}
        >
          <p style={noteStyle}>{t("avFallback.detail.disclosureBody", locale)}</p>
        </CanvasCard>
      </div>
    </div>
  );
}
