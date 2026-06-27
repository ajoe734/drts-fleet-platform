import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  BookingRecord,
  SandboxFulfillmentProjectionView,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { t, type Locale } from "@/lib/translations";

export const tenantAvFallbackTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

export type TenantAvFallbackStage =
  | "vehicle_change_in_progress"
  | "human_fallback_assigned"
  | "service_continuing";

export type TenantAvActualMode = "av" | "human";

export type TenantAvFallbackListItem = {
  booking: BookingRecord;
  projection: SandboxFulfillmentProjectionView;
  actualMode: TenantAvActualMode;
  fallbackStage: TenantAvFallbackStage | null;
  tenantMessageCode: string;
};

type TenantAvFallbackRow = Record<string, unknown> & {
  bookingCell: ReactNode;
  passengerCell: ReactNode;
  routeCell: ReactNode;
  plannedCell: ReactNode;
  actualCell: ReactNode;
  stageCell: ReactNode;
  etaCell: ReactNode;
  surchargeCell: ReactNode;
  detailCell: ReactNode;
};

const listBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const detailGridStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const definitionListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const definitionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(120px, 160px) minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
};

const definitionKeyStyle: CSSProperties = {
  color: tenantAvFallbackTheme.textMuted,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.22,
  textTransform: "uppercase",
};

const definitionValueStyle: CSSProperties = {
  color: tenantAvFallbackTheme.text,
  fontSize: 13,
  lineHeight: 1.5,
};

const plannedActualGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const plannedCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${tenantAvFallbackTheme.border}`,
  background: tenantAvFallbackTheme.surfaceLo,
};

const actualCardStyle: CSSProperties = {
  padding: 14,
  borderRadius: 10,
  border: `1px solid ${tenantAvFallbackTheme.accent}`,
  background: tenantAvFallbackTheme.accentBg,
};

const stageTimelineStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const stageItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
  paddingBottom: 10,
  borderBottom: `1px solid ${tenantAvFallbackTheme.border}`,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 12,
};

const messageSlotStyle: CSSProperties = {
  position: "relative",
  padding: "13px 14px",
  borderRadius: 10,
  background: tenantAvFallbackTheme.surfaceLo,
  border: `1px dashed ${tenantAvFallbackTheme.border}`,
  marginTop: 6,
};

const messageCodeStyle: CSSProperties = {
  position: "absolute",
  top: -8,
  left: 10,
  borderRadius: 4,
  padding: "0 5px",
  background: tenantAvFallbackTheme.surface,
  color: tenantAvFallbackTheme.textMuted,
  fontSize: 9,
  fontFamily: tenantAvFallbackTheme.monoFamily,
  fontWeight: 700,
};

const messageCopyStyle: CSSProperties = {
  color: tenantAvFallbackTheme.text,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const messageNoteStyle: CSSProperties = {
  color: tenantAvFallbackTheme.textDim,
  fontSize: 10.5,
  marginTop: 6,
};

const actionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${tenantAvFallbackTheme.border}`,
  background: tenantAvFallbackTheme.surface,
  color: tenantAvFallbackTheme.text,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const disabledActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px dashed ${tenantAvFallbackTheme.border}`,
  color: tenantAvFallbackTheme.textMuted,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const AV_FALLBACK_STAGES: TenantAvFallbackStage[] = [
  "vehicle_change_in_progress",
  "human_fallback_assigned",
  "service_continuing",
];

function isFallbackMode(
  projection: SandboxFulfillmentProjectionView,
): boolean {
  return (
    projection.fulfillmentMode === "human_fallback" ||
    projection.fulfillmentMode === "mixed"
  );
}

export function supportsTenantAvFallbackDetail(
  projection: SandboxFulfillmentProjectionView,
): boolean {
  return isFallbackMode(projection);
}

export function resolveTenantAvActualMode(
  projection: SandboxFulfillmentProjectionView,
): TenantAvActualMode {
  return projection.fulfillmentMode === "tesla_av" ? "av" : "human";
}

export function resolveTenantAvFallbackStage(
  projection: SandboxFulfillmentProjectionView,
): TenantAvFallbackStage | null {
  if (!isFallbackMode(projection)) {
    return null;
  }

  if (
    projection.state === "en_route_pickup" ||
    projection.state === "arrived_pickup" ||
    projection.state === "in_trip" ||
    projection.state === "completed"
  ) {
    return "service_continuing";
  }

  return "human_fallback_assigned";
}

export function resolveTenantMessageCode(
  projection: SandboxFulfillmentProjectionView,
): string {
  return (
    projection.messages[0]?.messageCode ??
    "sandbox_fulfillment.status_update_available"
  );
}

export function formatTenantAvStageLabel(
  stage: TenantAvFallbackStage,
  locale: Locale,
): string {
  return t(`avFallback.stage.${stage}`, locale);
}

export function getTenantAvStageTone(
  stage: TenantAvFallbackStage,
): CanvasTone {
  switch (stage) {
    case "vehicle_change_in_progress":
      return "warn";
    case "human_fallback_assigned":
      return "info";
    case "service_continuing":
    default:
      return "success";
  }
}

export function formatTenantAvModeLabel(
  mode: TenantAvActualMode | "planned_av",
  locale: Locale,
): string {
  switch (mode) {
    case "planned_av":
      return t("avFallback.mode.plannedAv", locale);
    case "human":
      return t("avFallback.mode.human", locale);
    case "av":
    default:
      return t("avFallback.mode.av", locale);
  }
}

export function formatTenantAvEta(
  projection: SandboxFulfillmentProjectionView,
  locale: Locale,
): string {
  if (projection.etaMinutes === null || projection.etaMinutes === undefined) {
    return t("avFallback.value.etaPending", locale);
  }

  return t("avFallback.value.etaMinutes", locale, {
    count: projection.etaMinutes,
  });
}

export function formatTenantMessageCopy(code: string, locale: Locale): string {
  const key = `tenantMessageCode.${code}`;
  const resolved = t(key, locale);
  return resolved === key
    ? t("tenantMessageCode.sandbox_fulfillment.default", locale)
    : resolved;
}

async function getTenantSandboxFulfillment(
  bookingId: string,
): Promise<SandboxFulfillmentProjectionView> {
  return getTenantClient().get<SandboxFulfillmentProjectionView>(
    `/api/tenant/bookings/${encodeURIComponent(bookingId)}/sandbox-fulfillment`,
  );
}

export async function loadTenantAvFallbackListItems(
  bookings: BookingRecord[],
): Promise<{ items: TenantAvFallbackListItem[]; degraded: boolean }> {
  const results = await Promise.allSettled(
    bookings.map(async (booking) => ({
      booking,
      projection: await getTenantSandboxFulfillment(booking.bookingId),
    })),
  );

  const items = results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        booking: BookingRecord;
        projection: SandboxFulfillmentProjectionView;
      }> => result.status === "fulfilled",
    )
    .map(({ value }) => ({
      booking: value.booking,
      projection: value.projection,
      actualMode: resolveTenantAvActualMode(value.projection),
      fallbackStage: resolveTenantAvFallbackStage(value.projection),
      tenantMessageCode: resolveTenantMessageCode(value.projection),
    }))
    .filter(({ projection }) => projection.fulfillmentMode !== "hidden")
    .sort((left, right) => {
      const leftPriority = getListPriority(left);
      const rightPriority = getListPriority(right);
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return right.projection.updatedAt.localeCompare(left.projection.updatedAt);
    });

  return {
    items,
    degraded: results.some((result) => result.status === "rejected"),
  };
}

export async function loadTenantAvFallbackDetailItem(
  bookingId: string,
): Promise<TenantAvFallbackListItem | null> {
  const client = getTenantClient();
  const [bookingResult, projectionResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    getTenantSandboxFulfillment(bookingId),
  ]);

  if (
    bookingResult.status !== "fulfilled" ||
    projectionResult.status !== "fulfilled"
  ) {
    return null;
  }

  const projection = projectionResult.value;
  return {
    booking: bookingResult.value,
    projection,
    actualMode: resolveTenantAvActualMode(projection),
    fallbackStage: resolveTenantAvFallbackStage(projection),
    tenantMessageCode: resolveTenantMessageCode(projection),
  };
}

function getListPriority(item: TenantAvFallbackListItem) {
  if (
    item.fallbackStage === "human_fallback_assigned" ||
    item.fallbackStage === "vehicle_change_in_progress"
  ) {
    return 3;
  }

  if (item.actualMode === "av") {
    return 2;
  }

  return 1;
}

function renderDefinitionRows(
  items: Array<{ key: string; value: ReactNode }>,
  monoKeys: Set<string> = new Set(),
) {
  return (
    <dl style={definitionListStyle}>
      {items.map((item) => (
        <div key={item.key} style={definitionRowStyle}>
          <dt style={definitionKeyStyle}>{item.key}</dt>
          <dd
            style={{
              ...definitionValueStyle,
              fontFamily: monoKeys.has(item.key)
                ? tenantAvFallbackTheme.monoFamily
                : tenantAvFallbackTheme.fontFamily,
              margin: 0,
            }}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TenantMessageSlot({
  code,
  locale,
}: {
  code: string;
  locale: Locale;
}) {
  return (
    <div style={messageSlotStyle}>
      <span style={messageCodeStyle}>{`tenantMessageCode · ${code}`}</span>
      <div style={messageCopyStyle}>{formatTenantMessageCopy(code, locale)}</div>
      <div style={messageNoteStyle}>
        {t("avFallback.message.note", locale)}
      </div>
    </div>
  );
}

function renderDetailAction(item: TenantAvFallbackListItem, locale: Locale) {
  if (supportsTenantAvFallbackDetail(item.projection)) {
    return (
      <Link
        href={`/bookings/${encodeURIComponent(item.booking.bookingId)}/av-fallback`}
        style={actionLinkStyle}
      >
        {t("avFallback.action.detail", locale)}
      </Link>
    );
  }

  return (
    <span style={disabledActionStyle}>
      {t("avFallback.action.detail", locale)}
    </span>
  );
}

export function TenantAvFallbackListSurface({
  items,
  degraded,
  locale,
}: {
  items: TenantAvFallbackListItem[];
  degraded: boolean;
  locale: Locale;
}) {
  const rows: TenantAvFallbackRow[] = items.map((item) => ({
    bookingCell: (
      <div style={{ display: "grid", gap: 4 }}>
        <Link
          href={`/bookings/${encodeURIComponent(item.booking.bookingId)}`}
          style={{ color: tenantAvFallbackTheme.accent, fontWeight: 700 }}
        >
          {item.booking.bookingId}
        </Link>
        <span
          style={{
            color: tenantAvFallbackTheme.textMuted,
            fontSize: 11.5,
            fontFamily: tenantAvFallbackTheme.monoFamily,
          }}
        >
          {item.booking.orderId}
        </span>
      </div>
    ),
    passengerCell: item.booking.passenger.name,
    routeCell: `${item.booking.pickup.address} -> ${item.booking.dropoff.address}`,
    plannedCell: (
      <CanvasPill theme={tenantAvFallbackTheme} tone="neutral">
        {formatTenantAvModeLabel("planned_av", locale)}
      </CanvasPill>
    ),
    actualCell: (
      <CanvasPill
        theme={tenantAvFallbackTheme}
        tone={item.actualMode === "av" ? "success" : "warn"}
        dot
      >
        {formatTenantAvModeLabel(item.actualMode, locale)}
      </CanvasPill>
    ),
    stageCell: item.fallbackStage ? (
      <CanvasPill
        theme={tenantAvFallbackTheme}
        tone={getTenantAvStageTone(item.fallbackStage)}
      >
        {formatTenantAvStageLabel(item.fallbackStage, locale)}
      </CanvasPill>
    ) : (
      <span style={{ color: tenantAvFallbackTheme.textDim, fontSize: 11.5 }}>
        —
      </span>
    ),
    etaCell: (
      <span
        style={{
          color:
            item.actualMode === "human"
              ? tenantAvFallbackTheme.warn
              : tenantAvFallbackTheme.text,
          fontFamily: tenantAvFallbackTheme.monoFamily,
        }}
      >
        {formatTenantAvEta(item.projection, locale)}
      </span>
    ),
    surchargeCell: (
      <CanvasPill theme={tenantAvFallbackTheme} tone="success">
        {t("avFallback.billing.noSurcharge", locale)}
      </CanvasPill>
    ),
    detailCell: renderDetailAction(item, locale),
  }));

  const columns: CanvasTableColumn<TenantAvFallbackRow>[] = [
    { h: t("avFallback.column.booking", locale), k: "bookingCell", w: 180 },
    { h: t("avFallback.column.passenger", locale), k: "passengerCell", w: 110 },
    { h: t("avFallback.column.route", locale), k: "routeCell", w: 240 },
    { h: t("avFallback.column.planned", locale), k: "plannedCell", w: 100 },
    { h: t("avFallback.column.actual", locale), k: "actualCell", w: 110 },
    { h: t("avFallback.column.stage", locale), k: "stageCell", w: 150 },
    { h: t("avFallback.column.eta", locale), k: "etaCell", w: 120 },
    {
      h: t("avFallback.column.surcharge", locale),
      k: "surchargeCell",
      w: 95,
    },
    { h: "", k: "detailCell", w: 86 },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={tenantAvFallbackTheme}
        title={t("avFallback.list.title", locale)}
        subtitle={t("avFallback.list.subtitle", locale)}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/bookings" style={actionLinkStyle}>
              {t("avFallback.action.allBookings", locale)}
            </Link>
          </div>
        }
      />
      <div style={listBodyStyle}>
        {degraded ? (
          <CanvasBanner
            theme={tenantAvFallbackTheme}
            tone="warn"
            icon="warn"
            title={t("avFallback.list.degraded.title", locale)}
            body={t("avFallback.list.degraded.body", locale)}
          />
        ) : null}
        <CanvasCard theme={tenantAvFallbackTheme} padding={items.length > 0 ? 0 : 18}>
          {items.length > 0 ? (
            <CanvasTable
              theme={tenantAvFallbackTheme}
              columns={columns}
              rows={rows}
            />
          ) : (
            <CanvasBanner
              theme={tenantAvFallbackTheme}
              tone="info"
              icon="info"
              title={t("avFallback.list.empty.title", locale)}
              body={t("avFallback.list.empty.body", locale)}
            />
          )}
        </CanvasCard>
        <CanvasBanner
          theme={tenantAvFallbackTheme}
          tone="info"
          icon="info"
          body={t("avFallback.list.banner", locale)}
        />
      </div>
    </div>
  );
}

export function TenantAvFallbackDetailSurface({
  item,
  locale,
}: {
  item: TenantAvFallbackListItem;
  locale: Locale;
}) {
  const stage = item.fallbackStage ?? "human_fallback_assigned";
  const stageIndex = AV_FALLBACK_STAGES.indexOf(stage);
  const plannedEta = formatDateTime(item.booking.reservationWindowStart, locale);
  const revisedEta = formatTenantAvEta(item.projection, locale);

  return (
    <div>
      <CanvasPageHeader
        theme={tenantAvFallbackTheme}
        title={`${item.booking.bookingId} · ${t("avFallback.detail.title", locale)}`}
        subtitle={t("avFallback.detail.subtitle", locale)}
      />
      <div style={badgeRowStyle}>
        <CanvasPill theme={tenantAvFallbackTheme} tone={getTenantAvStageTone(stage)} dot>
          {formatTenantAvStageLabel(stage, locale)}
        </CanvasPill>
        <CanvasPill theme={tenantAvFallbackTheme} tone="neutral">
          {`${t("avFallback.detail.passenger", locale)} ${item.booking.passenger.name}`}
        </CanvasPill>
        <CanvasPill theme={tenantAvFallbackTheme} tone="success">
          {t("avFallback.billing.noSurchargeLong", locale)}
        </CanvasPill>
      </div>
      <div style={detailGridStyle}>
        <div style={cardStackStyle}>
          <CanvasCard
            theme={tenantAvFallbackTheme}
            title={t("avFallback.detail.plannedActualTitle", locale)}
            subtitle={t("avFallback.detail.plannedActualSub", locale)}
          >
            <div style={plannedActualGridStyle}>
              <div style={plannedCardStyle}>
                <div style={definitionKeyStyle}>
                  {t("avFallback.detail.plannedLabel", locale)}
                </div>
                <div
                  style={{
                    ...definitionValueStyle,
                    fontSize: 15,
                    fontWeight: 700,
                    marginTop: 6,
                  }}
                >
                  {formatTenantAvModeLabel("planned_av", locale)}
                </div>
                <div style={{ ...definitionValueStyle, color: tenantAvFallbackTheme.textMuted }}>
                  {t("avFallback.detail.scheduledPickup", locale, {
                    value: plannedEta,
                  })}
                </div>
              </div>
              <div style={actualCardStyle}>
                <div
                  style={{
                    ...definitionKeyStyle,
                    color: tenantAvFallbackTheme.accent,
                  }}
                >
                  {t("avFallback.detail.actualLabel", locale)}
                </div>
                <div
                  style={{
                    ...definitionValueStyle,
                    fontSize: 15,
                    fontWeight: 700,
                    marginTop: 6,
                  }}
                >
                  {formatTenantAvModeLabel(item.actualMode, locale)}
                </div>
                <div style={definitionValueStyle}>
                  {t("avFallback.detail.updatedEta", locale, {
                    value: revisedEta,
                  })}
                </div>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={tenantAvFallbackTheme}
            title={t("avFallback.detail.stageTitle", locale)}
            subtitle={t("avFallback.detail.stageSub", locale)}
          >
            <div style={stageTimelineStyle}>
              {AV_FALLBACK_STAGES.map((value, index) => {
                const reached = index <= stageIndex;
                const isCurrent = index === stageIndex;
                return (
                  <div key={value} style={stageItemStyle}>
                    <div
                      style={{
                        color: reached
                          ? tenantAvFallbackTheme.text
                          : tenantAvFallbackTheme.textMuted,
                        fontFamily: tenantAvFallbackTheme.monoFamily,
                        fontSize: 11.5,
                      }}
                    >
                      {reached ? "active" : "pending"}
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CanvasPill
                          theme={tenantAvFallbackTheme}
                          tone={getTenantAvStageTone(value)}
                          dot={isCurrent}
                        >
                          {formatTenantAvStageLabel(value, locale)}
                        </CanvasPill>
                      </div>
                      <div style={definitionValueStyle}>
                        {t(`avFallback.stageHelp.${value}`, locale)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={tenantAvFallbackTheme}
            title={t("avFallback.detail.messageTitle", locale)}
            subtitle={t("avFallback.detail.messageSub", locale)}
          >
            <TenantMessageSlot code={item.tenantMessageCode} locale={locale} />
          </CanvasCard>
        </div>

        <div style={cardStackStyle}>
          <CanvasCard
            theme={tenantAvFallbackTheme}
            title={t("avFallback.detail.billingTitle", locale)}
            subtitle={t("avFallback.detail.billingSub", locale)}
          >
            {renderDefinitionRows(
              [
                {
                  key: t("avFallback.billing.charge", locale),
                  value: t("avFallback.billing.originalFare", locale),
                },
                {
                  key: t("avFallback.billing.surcharge", locale),
                  value: (
                    <CanvasPill theme={tenantAvFallbackTheme} tone="success" dot>
                      {t("avFallback.billing.noneBoolean", locale)}
                    </CanvasPill>
                  ),
                },
                {
                  key: t("avFallback.billing.dimension", locale),
                  value: "av_fulfillment -> human_fallback",
                },
                {
                  key: t("avFallback.billing.sla", locale),
                  value: t("avFallback.billing.slaUpdatedEta", locale),
                },
                {
                  key: t("avFallback.billing.rebooking", locale),
                  value: (
                    <CanvasPill theme={tenantAvFallbackTheme} tone="neutral">
                      {t("avFallback.billing.sameBooking", locale)}
                    </CanvasPill>
                  ),
                },
              ],
              new Set([t("avFallback.billing.dimension", locale)]),
            )}
            <div style={{ marginTop: 12 }}>
              <CanvasBanner
                theme={tenantAvFallbackTheme}
                tone="info"
                icon="info"
                body={t("avFallback.billing.note", locale)}
              />
            </div>
          </CanvasCard>

          <CanvasCard
            theme={tenantAvFallbackTheme}
            title={t("avFallback.detail.disclosureTitle", locale)}
            subtitle={t("avFallback.detail.disclosureSub", locale)}
          >
            <CanvasBanner
              theme={tenantAvFallbackTheme}
              tone="info"
              icon="lock"
              body={t("avFallback.detail.disclosureBody", locale)}
            />
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
