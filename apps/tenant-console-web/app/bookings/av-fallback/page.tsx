import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatRelativeTime } from "@/lib/formatters";
import { getServerLocale } from "@/lib/server-locale";
import {
  loadTenantAvFallbackListItems,
  supportsTenantAvFallbackDetail,
  type TenantAvFallbackListItem,
  type TenantAvFallbackStage,
} from "@/lib/tenant-av-fallback";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
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

const cellStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const cellPrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const cellSecondaryStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
};

type FallbackRow = Record<string, unknown> & {
  actualCell: ReactNode;
  bookingCell: ReactNode;
  etaCell: ReactNode;
  passengerCell: ReactNode;
  plannedCell: ReactNode;
  routeCell: ReactNode;
  stageCell: ReactNode;
  surchargeCell: ReactNode;
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

function getActualTone(mode: TenantAvFallbackListItem["actualMode"]): CanvasTone {
  return mode === "human" ? "warn" : "accent";
}

function getStageLabel(stage: TenantAvFallbackStage | null, locale: Locale) {
  return stage ? t(`avFallback.stage.${stage}`, locale) : "—";
}

function getStageHelp(stage: TenantAvFallbackStage | null, locale: Locale) {
  return stage ? t(`avFallback.stageHelp.${stage}`, locale) : "—";
}

function ActionLink({
  href,
  icon,
  variant = "secondary",
  children,
}: {
  href: string;
  icon?: "chevR" | "ext";
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <Link href={href} style={actionAnchorStyle}>
      <CanvasBtn theme={th} icon={icon} size="sm" variant={variant}>
        {children}
      </CanvasBtn>
    </Link>
  );
}

function buildRows(items: TenantAvFallbackListItem[], locale: Locale) {
  return items.map<FallbackRow>((item) => {
    const fallbackDetailHref = `/bookings/${encodeURIComponent(item.booking.bookingId)}/av-fallback`;
    const bookingDetailHref = `/bookings/${encodeURIComponent(item.booking.bookingId)}`;
    const messageCopy = translateTenantMessageCode(
      item.tenantMessageCode,
      locale,
    );
    const updatedAtCopy =
      formatRelativeTime(item.projection.updatedAt, locale) ??
      formatDateTime(item.projection.updatedAt, locale);

    return {
      bookingCell: (
        <div style={cellStackStyle}>
          <div style={cellStackStyle}>
            <Link href={bookingDetailHref} style={actionAnchorStyle}>
              <span style={cellPrimaryStyle}>{item.booking.bookingId}</span>
            </Link>
            <span style={cellSecondaryStyle}>{item.booking.orderId}</span>
          </div>
          <span style={cellSecondaryStyle}>{messageCopy}</span>
          {supportsTenantAvFallbackDetail(item.projection) ? (
            <div style={actionRowStyle}>
              <ActionLink href={fallbackDetailHref} icon="chevR">
                {t("avFallback.action.detail", locale)}
              </ActionLink>
            </div>
          ) : null}
        </div>
      ),
      passengerCell: (
        <div style={cellStackStyle}>
          <span style={cellPrimaryStyle}>{item.booking.passenger.name}</span>
          <span style={cellSecondaryStyle}>
            {formatDateTime(item.booking.reservationWindowStart, locale)}
          </span>
        </div>
      ),
      routeCell: (
        <div style={cellStackStyle}>
          <span style={cellPrimaryStyle}>{item.booking.pickup.address}</span>
          <span style={cellSecondaryStyle}>
            ↓ {item.booking.dropoff.address}
          </span>
        </div>
      ),
      plannedCell: (
        <CanvasPill theme={th} tone="accent">
          {t("avFallback.mode.plannedAv", locale)}
        </CanvasPill>
      ),
      actualCell: (
        <CanvasPill theme={th} tone={getActualTone(item.actualMode)}>
          {t(`avFallback.mode.${item.actualMode}`, locale)}
        </CanvasPill>
      ),
      stageCell: item.fallbackStage ? (
        <div style={cellStackStyle}>
          <CanvasPill theme={th} tone={getStageTone(item.fallbackStage)}>
            {getStageLabel(item.fallbackStage, locale)}
          </CanvasPill>
          <span style={cellSecondaryStyle}>
            {getStageHelp(item.fallbackStage, locale)}
          </span>
        </div>
      ) : (
        <span style={cellSecondaryStyle}>—</span>
      ),
      etaCell: (
        <div style={cellStackStyle}>
          <span style={cellPrimaryStyle}>
            {formatEtaMinutes(item.projection.etaMinutes, locale)}
          </span>
          <span style={cellSecondaryStyle}>{updatedAtCopy}</span>
        </div>
      ),
      surchargeCell: (
        <CanvasPill
          theme={th}
          tone={item.projection.extraChargeDisclosed ? "warn" : "success"}
        >
          {item.projection.extraChargeDisclosed
            ? t("avFallback.billing.surchargeDisclosed", locale)
            : t("avFallback.billing.noSurcharge", locale)}
        </CanvasPill>
      ),
    };
  });
}

export default async function BookingAvFallbackListPage() {
  const locale = await getServerLocale();
  const client = await getTenantClient();

  let items: TenantAvFallbackListItem[] = [];
  let degraded = false;
  let errorMessage: string | null = null;

  try {
    const bookings = await client.listTenantBookings();
    const result = await loadTenantAvFallbackListItems(bookings);
    items = result.items;
    degraded = result.degraded;
  } catch (error) {
    degraded = true;
    errorMessage =
      error instanceof Error
        ? error.message
        : t("bookingList.error.unknown", locale);
  }

  const columns: CanvasTableColumn<FallbackRow>[] = [
    { h: t("avFallback.column.booking", locale), k: "bookingCell", w: 300 },
    {
      h: t("avFallback.column.passenger", locale),
      k: "passengerCell",
      w: 180,
    },
    { h: t("avFallback.column.route", locale), k: "routeCell", w: 320 },
    { h: t("avFallback.column.planned", locale), k: "plannedCell", w: 96 },
    { h: t("avFallback.column.actual", locale), k: "actualCell", w: 96 },
    { h: t("avFallback.column.stage", locale), k: "stageCell", w: 220 },
    { h: t("avFallback.column.eta", locale), k: "etaCell", w: 120 },
    {
      h: t("avFallback.column.surcharge", locale),
      k: "surchargeCell",
      w: 120,
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("avFallback.list.title", locale)}
        subtitle={t("avFallback.list.subtitle", locale)}
        actions={
          <div style={actionRowStyle}>
            <ActionLink href="/bookings">
              {t("avFallback.action.allBookings", locale)}
            </ActionLink>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="info"
          title={t("bookingList.header.avFulfillment", locale)}
          body={t("avFallback.list.banner", locale)}
        />

        {degraded ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("avFallback.list.degraded.title", locale)}
            body={
              errorMessage
                ? `${t("avFallback.list.degraded.body", locale)} ${errorMessage}`
                : t("avFallback.list.degraded.body", locale)
            }
          />
        ) : null}

        {items.length === 0 ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="info"
            title={t("avFallback.list.empty.title", locale)}
            body={t("avFallback.list.empty.body", locale)}
          />
        ) : (
          <CanvasCard theme={th} title={t("bookingList.header.avFulfillment", locale)}>
            <CanvasTable theme={th} columns={columns} rows={buildRows(items, locale)} />
          </CanvasCard>
        )}
      </div>
    </div>
  );
}
