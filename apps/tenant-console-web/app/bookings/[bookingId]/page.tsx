import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import type {
  ActionReceipt,
  AuditLogRecord,
  BookingRecord,
  DriverStatementRecord,
  EmptyReason,
  ResourceActionDescriptor,
  TenantInvoiceRecord,
} from "@drts/contracts";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import {
  buildCanvasTheme,
  CalloutBanner,
  CanvasCard,
  CanvasPageHeader,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import {
  formatDateTime,
  formatMoney,
  formatRelativeTime,
  isFutureIso,
} from "@/lib/formatters";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
  type SourceVisibility,
} from "@/lib/source-domain";
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

export const dynamic = "force-dynamic";

type BookingEvent = {
  actor: string;
  detail: string;
  label: string;
  realm: "tenant" | "ops" | "platform" | "system";
  tone: "default" | "warning" | "success";
  at: string | null;
};

type EmptyStateCopy = {
  body: string;
  ctaHref: string;
  ctaLabel: string;
  title: string;
  tone: "default" | "warning";
};

type DerivedBookingView = {
  acceptedPending: boolean;
  actions: ResourceActionDescriptor[];
  commandReceipt: ActionReceipt | null;
  deepLinks: Array<{
    href: string;
    label: string;
    note: string;
    external?: boolean;
  }>;
  editableUntil: string | null;
  events: BookingEvent[];
  generatedAt: string;
  readOnlyReasonCode: string | null;
  timelineStep: number;
};

const bdTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

type PageHeroProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
};

type SurfaceCardProps = {
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
};

type CalloutPanelProps = {
  title: string;
  description: string;
  tone: "default" | "warning";
  children: ReactNode;
};

type BookingDetailRecord = BookingRecord & {
  availableActions?: ResourceActionDescriptor[];
  editableUntil?: string | null;
  readOnlyReasonCode?: string | null;
  lastActionReceipt?: ActionReceipt | null;
};

const ACTIVE_ORDER_STATUSES = new Set([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
]);

const BOOKING_TIMELINE_STEPS = [
  "created",
  "queued",
  "assigned",
  "enroute",
  "on_trip",
  "completed",
] as const;

const EMPTY_REASON_META: Record<
  EmptyReason,
  {
    bodyKey: string;
    ctaHref: string;
    ctaKey: string;
    titleKey: string;
    tone: "default" | "warning";
  }
> = {
  no_data: {
    titleKey: "bookingDetail.empty.noData.title",
    bodyKey: "bookingDetail.empty.noData.body",
    ctaKey: "bookingDetail.empty.noData.cta",
    ctaHref: "/bookings/new",
    tone: "default",
  },
  not_provisioned: {
    titleKey: "bookingDetail.empty.notProvisioned.title",
    bodyKey: "bookingDetail.empty.notProvisioned.body",
    ctaKey: "bookingDetail.empty.notProvisioned.cta",
    ctaHref: "/settings",
    tone: "warning",
  },
  fetch_failed: {
    titleKey: "bookingDetail.empty.fetchFailed.title",
    bodyKey: "bookingDetail.empty.fetchFailed.body",
    ctaKey: "bookingDetail.empty.fetchFailed.cta",
    ctaHref: "/bookings",
    tone: "warning",
  },
  permission_denied: {
    titleKey: "bookingDetail.empty.permissionDenied.title",
    bodyKey: "bookingDetail.empty.permissionDenied.body",
    ctaKey: "bookingDetail.empty.permissionDenied.cta",
    ctaHref: "/bookings",
    tone: "warning",
  },
  external_unavailable: {
    titleKey: "bookingDetail.empty.externalUnavailable.title",
    bodyKey: "bookingDetail.empty.externalUnavailable.body",
    ctaKey: "bookingDetail.empty.externalUnavailable.cta",
    ctaHref: "/audit",
    tone: "warning",
  },
  filtered_empty: {
    titleKey: "bookingDetail.empty.filteredEmpty.title",
    bodyKey: "bookingDetail.empty.filteredEmpty.body",
    ctaKey: "bookingDetail.empty.filteredEmpty.cta",
    ctaHref: "/bookings",
    tone: "default",
  },
  driver_not_eligible: {
    titleKey: "bookingDetail.empty.driverNotEligible.title",
    bodyKey: "bookingDetail.empty.driverNotEligible.body",
    ctaKey: "bookingDetail.empty.driverNotEligible.cta",
    ctaHref: "/audit",
    tone: "warning",
  },
};

function getEmptyReasonCopy(
  reason: EmptyReason,
  locale: Locale,
): EmptyStateCopy {
  const meta = EMPTY_REASON_META[reason] ?? EMPTY_REASON_META.fetch_failed;
  return {
    body: t(meta.bodyKey, locale),
    ctaHref: meta.ctaHref,
    ctaLabel: t(meta.ctaKey, locale),
    title: t(meta.titleKey, locale),
    tone: meta.tone,
  };
}

function PageHero({ eyebrow, title, description }: PageHeroProps) {
  return (
    <CanvasPageHeader
      theme={bdTheme}
      title={title}
      subtitle={[eyebrow, description].filter(Boolean).join(" · ") || undefined}
    />
  );
}

function SurfaceCard({
  kicker,
  title,
  description,
  children,
}: SurfaceCardProps) {
  return (
    <CanvasCard
      theme={bdTheme}
      title={title}
      subtitle={[kicker, description].filter(Boolean).join(" · ") || undefined}
    >
      <div style={{ color: bdTheme.text }}>{children}</div>
    </CanvasCard>
  );
}

function CalloutPanel({
  title,
  description,
  tone,
  children,
}: CalloutPanelProps) {
  return (
    <CalloutBanner
      title={title}
      description={description}
      tone={tone === "warning" ? "warning" : "info"}
    >
      {children}
    </CalloutBanner>
  );
}

function buildBookingActions(
  booking: BookingDetailRecord,
): ResourceActionDescriptor[] {
  const isTerminal =
    booking.orderStatus === "completed" || booking.orderStatus === "cancelled";
  const isOnTrip = booking.orderStatus === "on_trip";
  const approvalPending = booking.approvalState === "pending";
  const canUpdateWindow =
    booking.editableUntil == null || isFutureIso(booking.editableUntil);
  const canCancelWindow =
    booking.cancelableUntil == null || isFutureIso(booking.cancelableUntil);
  const actions: ResourceActionDescriptor[] = [
    {
      action: "update",
      enabled: !isTerminal && !isOnTrip && !approvalPending && canUpdateWindow,
      riskLevel: "medium",
      ...(() => {
        const disabledReasonCode = isTerminal
          ? "booking_terminal"
          : isOnTrip
            ? "on_trip_locked"
            : approvalPending
              ? "approval_pending"
              : canUpdateWindow
                ? undefined
                : "past_editable_until";
        return disabledReasonCode ? { disabledReasonCode } : {};
      })(),
    },
    {
      action: "cancel",
      enabled: !isTerminal && canCancelWindow,
      requiresReason: true,
      riskLevel: "high",
      ...(() => {
        const disabledReasonCode = isTerminal
          ? "booking_terminal"
          : canCancelWindow
            ? undefined
            : "past_cancelable_until";
        return disabledReasonCode ? { disabledReasonCode } : {};
      })(),
    },
  ];

  if (
    booking.approvalState === "rejected" ||
    booking.approvalState === "blocked" ||
    booking.approvalState === "cancelled_by_re_evaluation"
  ) {
    actions.push({
      action: "resubmit_approval",
      enabled: true,
      riskLevel: "medium",
    });
  }

  return actions;
}

function buildBookingEvents(
  booking: BookingRecord,
  locale: Locale,
): BookingEvent[] {
  const events: BookingEvent[] = [
    {
      label: t("bookingDetail.event.created", locale),
      at: booking.createdAt,
      actor:
        booking.bookedBy?.name ?? t("bookingDetail.value.tenantIntake", locale),
      realm: "tenant",
      tone: "default",
      detail: t("bookingDetail.event.createdDetail", locale, {
        start: formatDateTime(booking.reservationWindowStart, locale),
        end: formatDateTime(booking.reservationWindowEnd, locale),
      }),
    },
  ];

  if (booking.approvalState !== "not_required") {
    events.push({
      label: t("bookingDetail.event.approval", locale),
      at: booking.updatedAt,
      actor: "tenant.approval",
      realm: "system",
      tone: booking.approvalState === "approved" ? "success" : "warning",
      detail: t("bookingDetail.event.approvalDetail", locale, {
        state: booking.approvalState,
        count: booking.approvalRequestIds.length,
      }),
    });
  }

  if (ACTIVE_ORDER_STATUSES.has(booking.orderStatus)) {
    events.push({
      label: t("bookingDetail.event.driverAssigned", locale),
      at: booking.updatedAt,
      actor: "dispatch.engine",
      realm: "ops",
      tone: "success",
      detail: t("bookingDetail.event.driverAssignedDetail", locale),
    });
  }

  if (booking.orderStatus === "cancelled") {
    events.push({
      label: t("bookingDetail.event.cancelled", locale),
      at: booking.updatedAt,
      actor: "tenant command",
      realm: "tenant",
      tone: "warning",
      detail: t("bookingDetail.event.cancelledDetail", locale),
    });
  } else if (booking.orderStatus === "completed") {
    events.push({
      label: t("bookingDetail.event.completed", locale),
      at: booking.updatedAt,
      actor: "driver workflow",
      realm: "system",
      tone: "success",
      detail: t("bookingDetail.event.completedDetail", locale),
    });
  } else {
    events.push({
      label: t("bookingDetail.event.snapshotUpdated", locale),
      at: booking.updatedAt,
      actor: "booking.readmodel",
      realm: "system",
      tone: "default",
      detail: t("bookingDetail.event.snapshotUpdatedDetail", locale, {
        status: booking.orderStatus,
      }),
    });
  }

  return events;
}

function mapAuditRealm(
  actorType: AuditLogRecord["actorType"],
): BookingEvent["realm"] {
  switch (actorType) {
    case "tenant_admin":
      return "tenant";
    case "ops_user":
      return "ops";
    case "platform_admin":
      return "platform";
    default:
      return "system";
  }
}

function buildAuditSubsetEvents(
  logs: AuditLogRecord[],
  booking: BookingDetailRecord,
  commandReceipt: ActionReceipt | null,
): BookingEvent[] {
  const relatedIds = new Set(
    [booking.bookingId, booking.orderId, commandReceipt?.auditId].filter(
      (value): value is string => Boolean(value),
    ),
  );

  return logs
    .filter(
      (log) =>
        (log.resourceId ? relatedIds.has(log.resourceId) : false) ||
        relatedIds.has(log.auditId),
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, 6)
    .map((log) => ({
      actor: log.actorId ?? log.actorType,
      at: log.createdAt,
      detail: `${log.moduleName} · ${log.actionName} · ${log.resourceType}${log.resourceId ? ` ${log.resourceId}` : ""}`,
      label: log.actionName,
      realm: mapAuditRealm(log.actorType),
      tone:
        log.actorType === "ops_user" || log.actorType === "platform_admin"
          ? "warning"
          : "default",
    }));
}

function findRelatedInvoices(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices.filter((invoice) =>
    invoice.lines.some(
      (line: TenantInvoiceRecord["lines"][number]) => line.orderId === orderId,
    ),
  );
}

function findRelatedStatements(
  statements: DriverStatementRecord[],
  orderId: string,
): DriverStatementRecord[] {
  return statements.filter((statement) =>
    statement.lines.some((line) => line.orderId === orderId),
  );
}

function deriveTimelineStep(orderStatus: BookingRecord["orderStatus"]) {
  switch (orderStatus) {
    case "created":
      return 0;
    case "ready_for_dispatch":
    case "preassigned":
      return 1;
    case "assigned":
    case "driver_accepted":
      return 2;
    case "enroute_pickup":
    case "arrived_pickup":
      return 3;
    case "on_trip":
      return 4;
    case "completed":
    case "cancelled":
      return 5;
    default:
      return 0;
  }
}

function deriveBookingView(
  booking: BookingDetailRecord,
  commandReceipt: ActionReceipt | null,
  locale: Locale,
): DerivedBookingView {
  const source = getBookingSourceVisibility(booking);
  const actions =
    booking.availableActions && booking.availableActions.length > 0
      ? booking.availableActions
      : buildBookingActions(booking);
  const updateAction = actions.find(
    (action: ResourceActionDescriptor) => action.action === "update",
  );
  const opsConsoleBase =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
  const auditBase = "/audit";
  const deepLinks = [
    {
      href: commandReceipt?.auditId
        ? `${auditBase}?auditId=${encodeURIComponent(commandReceipt.auditId)}`
        : `${auditBase}?bookingId=${encodeURIComponent(booking.bookingId)}`,
      label: t("bookingDetail.deepLinks.auditSubsetLabel", locale),
      note: commandReceipt?.auditId
        ? t("bookingDetail.deepLinks.auditReceiptNote", locale)
        : t("bookingDetail.deepLinks.auditRealmNote", locale),
    },
    {
      href: `/rules?bookingId=${encodeURIComponent(booking.bookingId)}`,
      label: t("bookingDetail.deepLinks.rulesLabel", locale),
      note: t("bookingDetail.deepLinks.rulesNote", locale),
    },
    ...(source.domain === "forwarded_authority"
      ? [
          {
            href: `${opsConsoleBase}/dispatch?orderId=${encodeURIComponent(booking.orderId)}`,
            label: t("bookingDetail.deepLinks.opsLabel", locale),
            note: t("bookingDetail.deepLinks.opsNote", locale),
            external: true,
          },
        ]
      : []),
  ];

  return {
    actions,
    acceptedPending: commandReceipt?.status === "accepted",
    commandReceipt,
    deepLinks,
    editableUntil: booking.editableUntil ?? booking.modifiableUntil,
    events: buildBookingEvents(booking, locale),
    generatedAt: new Date().toISOString(),
    readOnlyReasonCode:
      booking.readOnlyReasonCode ??
      (updateAction && !updateAction.enabled
        ? (updateAction.disabledReasonCode ?? null)
        : null),
    timelineStep: deriveTimelineStep(booking.orderStatus),
  };
}

function describeReadOnlyReason(reasonCode: string | null, locale: Locale) {
  switch (reasonCode) {
    case "past_editable_until":
      return t("bookingDetail.readOnly.pastEditableUntil", locale);
    case "booking_terminal":
      return t("bookingDetail.readOnly.bookingTerminal", locale);
    case "on_trip_locked":
      return t("bookingDetail.readOnly.onTripLocked", locale);
    case "approval_pending":
      return t("bookingDetail.readOnly.approvalPending", locale);
    default:
      return t("bookingDetail.readOnly.default", locale);
  }
}

function describeEditableWindow(
  editableUntil: string | null,
  editable: boolean,
  locale: Locale,
) {
  const relativeWindow = formatRelativeTime(editableUntil, locale);
  if (!editableUntil) {
    return editable
      ? t("bookingDetail.editWindow.noDeadlineEditable", locale)
      : t("bookingDetail.editWindow.noDeadlineReadOnly", locale);
  }
  const relative = relativeWindow ? ` (${relativeWindow})` : "";

  return editable
    ? t("bookingDetail.editWindow.open", locale, {
        time: formatDateTime(editableUntil, locale),
        relative,
      })
    : t("bookingDetail.editWindow.closed", locale, {
        time: formatDateTime(editableUntil, locale),
        relative,
      });
}

function describeApprovalState(
  state: BookingRecord["approvalState"],
  locale: Locale,
) {
  switch (state) {
    case "not_required":
      return t("bookingDetail.approval.notRequired", locale);
    case "pending":
      return t("bookingDetail.approval.pending", locale);
    case "approved":
      return t("bookingDetail.approval.approved", locale);
    case "rejected":
      return t("bookingDetail.approval.rejected", locale);
    case "blocked":
      return t("bookingDetail.approval.blocked", locale);
    case "cancelled_by_re_evaluation":
      return t("bookingDetail.approval.cancelledByReevaluation", locale);
    default:
      return state;
  }
}

function getLocalizedSourceCopy(source: SourceVisibility, locale: Locale) {
  switch (source.domain) {
    case "forwarded_authority":
      return {
        badge: t("bookingDetail.source.forwarded.badge", locale),
        detail: t("bookingDetail.source.forwarded.detail", locale),
        statusBoundary: t("bookingDetail.source.forwarded.boundary", locale),
      };
    case "partner_external":
      return {
        badge: t("bookingDetail.source.external.badge", locale),
        detail: t("bookingDetail.source.external.detail", locale),
        statusBoundary: t("bookingDetail.source.external.boundary", locale),
      };
    default:
      return {
        badge: t("bookingDetail.source.owned.badge", locale),
        detail: t("bookingDetail.source.owned.detail", locale),
        statusBoundary: t("bookingDetail.source.owned.boundary", locale),
      };
  }
}

function renderEmptyState(
  reason: EmptyReason,
  bookingId: string,
  locale: Locale,
) {
  const copy = getEmptyReasonCopy(reason, locale);
  return (
    <div className="detail-stack">
      <PageHero
        eyebrow={t("bookingDetail.hero.eyebrow", locale)}
        title={t("bookingDetail.hero.unavailableTitle", locale, {
          bookingId,
        })}
        description={t("bookingDetail.hero.unavailableDescription", locale)}
      />
      <SurfaceCard
        kicker={t("bookingDetail.empty.reason", locale)}
        title={copy.title}
        description={copy.body}
      >
        <div className="booking-empty-state">
          <span
            className={`status-chip${copy.tone === "warning" ? " booking-pill-warning" : ""}`}
          >
            {reason}
          </span>
          <div className="link-row">
            <Link
              className="action-button action-button-primary"
              href={copy.ctaHref}
            >
              {copy.ctaLabel}
            </Link>
            <Link
              className="action-button action-button-secondary"
              href={`/bookings/${bookingId}`}
            >
              {t("bookingDetail.empty.restoreLive", locale)}
            </Link>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

function parseCommandReceipt(
  query: Record<string, string | string[] | undefined>,
  bookingId: string,
  locale: Locale,
): ActionReceipt | null {
  const status =
    typeof query.commandStatus === "string" ? query.commandStatus : null;
  if (status !== "accepted") {
    return null;
  }

  return {
    actionId:
      typeof query.commandId === "string"
        ? query.commandId
        : `cmd-${bookingId}`,
    auditId:
      typeof query.auditId === "string"
        ? query.auditId
        : `audit-${bookingId.toLowerCase()}`,
    resourceType: "booking",
    resourceId: bookingId,
    status: "accepted",
    message:
      typeof query.commandMessage === "string"
        ? query.commandMessage
        : t("bookingDetail.command.defaultMessage", locale),
  };
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bookingId } = await params;
  const query = await searchParams;
  const locale = await getServerLocale();
  const emptyReason =
    typeof query.emptyReason === "string"
      ? (query.emptyReason as EmptyReason)
      : null;

  if (emptyReason && emptyReason in EMPTY_REASON_META) {
    return renderEmptyState(emptyReason, bookingId, locale);
  }

  const client = getTenantClient();
  const [bookingResult, invoicesResult, statementsResult, auditLogsResult] =
    await Promise.allSettled([
      client.getTenantBooking(bookingId) as Promise<BookingDetailRecord>,
      client.listInvoices(),
      client.listTenantStatements(),
      client.listTenantAuditLogs(),
    ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const commandReceipt =
    booking.lastActionReceipt ?? parseCommandReceipt(query, bookingId, locale);
  const bookingView = deriveBookingView(booking, commandReceipt, locale);
  const source = getBookingSourceVisibility(booking);
  const sourceCopy = getLocalizedSourceCopy(source, locale);
  const relatedInvoices =
    invoicesResult.status === "fulfilled"
      ? findRelatedInvoices(invoicesResult.value, booking.orderId)
      : [];
  const relatedStatements =
    statementsResult.status === "fulfilled"
      ? findRelatedStatements(statementsResult.value, booking.orderId)
      : [];
  const recentEvents =
    auditLogsResult.status === "fulfilled"
      ? buildAuditSubsetEvents(auditLogsResult.value, booking, commandReceipt)
      : [];
  const editable =
    bookingView.actions.find((action) => action.action === "update")?.enabled ??
    false;
  const auditHref = bookingView.commandReceipt?.auditId
    ? `/audit?auditId=${encodeURIComponent(bookingView.commandReceipt.auditId)}`
    : `/audit?bookingId=${encodeURIComponent(booking.bookingId)}`;
  const bookingFiltersHref = `/bookings?bookingId=${encodeURIComponent(
    booking.bookingId,
  )}`;
  const passengerHref = `/passengers?bookingId=${encodeURIComponent(
    booking.bookingId,
  )}`;
  const pickupAddressHref = `/addresses?query=${encodeURIComponent(
    booking.pickup.address,
  )}`;
  const dropoffAddressHref = `/addresses?query=${encodeURIComponent(
    booking.dropoff.address,
  )}`;
  const costCenterHref = booking.costCenter
    ? `/cost-centers?code=${encodeURIComponent(booking.costCenter)}`
    : "/cost-centers";

  return (
    <div className="detail-stack">
      <PageHero
        eyebrow={t("bookingDetail.hero.eyebrow", locale)}
        title={
          <span className="booking-hero-title">
            <span>{`${booking.bookingId} · ${booking.businessDispatchSubtype}`}</span>
            <span
              className={`status-chip ${
                bookingView.acceptedPending
                  ? "booking-pill-warning"
                  : booking.orderStatus === "completed"
                    ? "booking-pill-success"
                    : "booking-pill-accent"
              }`}
            >
              {bookingView.acceptedPending
                ? "accepted_pending"
                : booking.orderStatus}
            </span>
          </span>
        }
        description={t("bookingDetail.hero.description", locale)}
      />

      <div className="chip-row">
        <Link
          className="action-button action-button-secondary"
          href="#overview"
        >
          {t("bookingDetail.tab.overview", locale)}
        </Link>
        <Link
          className="action-button action-button-secondary"
          href="#timeline"
        >
          {t("bookingDetail.tab.timeline", locale)}
        </Link>
        <Link className="action-button action-button-secondary" href="#billing">
          {t("bookingDetail.tab.billing", locale)}
        </Link>
        <Link className="action-button action-button-secondary" href="#audit">
          {t("bookingDetail.tab.audit", locale)}
        </Link>
      </div>

      {bookingView.acceptedPending && bookingView.commandReceipt ? (
        <CalloutPanel
          title={t("bookingDetail.command.acceptedTitle", locale, {
            actionId: bookingView.commandReceipt.actionId,
          })}
          description={bookingView.commandReceipt.message}
          tone="warning"
        >
          <p>
            {t("bookingDetail.command.acceptedHelp", locale, {
              auditId: bookingView.commandReceipt.auditId,
            })}
          </p>
        </CalloutPanel>
      ) : null}

      <section className="surface-grid surface-grid-wide" id="overview">
        <SurfaceCard
          kicker={t("bookingDetail.refresh.kicker", locale)}
          title={t("bookingDetail.refresh.title", locale)}
          description={t("bookingDetail.refresh.description", locale)}
        >
          <div className="booking-refresh-card">
            <div className="chip-row">
              <span className="status-chip booking-pill-accent">
                {t("bookingDetail.refresh.t5", locale)}
              </span>
              <span className="status-chip">
                {t("bookingDetail.refresh.fresh", locale)}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingDetail.refresh.generatedAt", locale)}</dt>
                <dd>{formatDateTime(bookingView.generatedAt, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.refresh.lastBookingUpdate", locale)}</dt>
                <dd>{formatDateTime(booking.updatedAt, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.refresh.source", locale)}</dt>
                <dd>{t("bookingDetail.refresh.sourceLive", locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.refresh.manual", locale)}</dt>
                <dd>{t("bookingDetail.refresh.manualHelp", locale)}</dd>
              </div>
            </dl>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("bookingDetail.status.kicker", locale)}
          title={t("bookingDetail.status.title", locale)}
          description={t("bookingDetail.status.description", locale)}
        >
          <div className="detail-stack">
            <div className="chip-row">
              <span className="status-badge">{booking.orderStatus}</span>
              <span className="status-chip">
                {t("bookingDetail.status.bookingStatus", locale, {
                  status: booking.status,
                })}
              </span>
              <span
                className={`status-chip${editable ? " booking-pill-success" : " booking-pill-warning"}`}
              >
                {editable
                  ? t("bookingDetail.status.editable", locale)
                  : t("bookingDetail.status.readOnly", locale)}
              </span>
              <span className={getSourceToneClassName(source.tone)}>
                {sourceCopy.badge}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>editableUntil</dt>
                <dd>{formatDateTime(bookingView.editableUntil, locale)}</dd>
              </div>
              <div>
                <dt>readOnlyReasonCode</dt>
                <dd>
                  {bookingView.readOnlyReasonCode ??
                    t("bookingDetail.value.none", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.approval", locale)}</dt>
                <dd>{booking.approvalState}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.label.approval", locale)}</dt>
                <dd>{booking.approvalRequestIds.length}</dd>
              </div>
            </dl>
            <div className="booking-inline-note">
              {describeEditableWindow(
                bookingView.editableUntil,
                editable,
                locale,
              )}
            </div>
            {booking.approvalState === "pending" ? (
              <CalloutPanel
                title={t("bookingDetail.status.approvalPendingTitle", locale)}
                description={describeApprovalState(
                  booking.approvalState,
                  locale,
                )}
                tone="warning"
              >
                <p>{t("bookingDetail.status.approvalPendingHelp", locale)}</p>
              </CalloutPanel>
            ) : null}
            {!editable ? (
              <p className="muted-copy">
                {describeReadOnlyReason(bookingView.readOnlyReasonCode, locale)}
              </p>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      <section className="booking-detail-layout">
        <div className="booking-detail-main">
          <SurfaceCard
            kicker={t("bookingDetail.trip.kicker", locale)}
            title={t("bookingDetail.section.trip", locale)}
            description={t("bookingDetail.section.tripSub", locale)}
          >
            <div
              className="booking-stepper"
              aria-label={t("bookingDetail.trip.workflowAria", locale)}
            >
              {BOOKING_TIMELINE_STEPS.map((step, index) => {
                const isActive = index === bookingView.timelineStep;
                const isComplete = index < bookingView.timelineStep;
                const isTerminalCancelled =
                  booking.orderStatus === "cancelled" &&
                  step ===
                    BOOKING_TIMELINE_STEPS[BOOKING_TIMELINE_STEPS.length - 1];
                const stepLabel =
                  isTerminalCancelled && step === "completed"
                    ? "cancelled"
                    : step;

                return (
                  <div
                    className={`booking-step${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}${isTerminalCancelled ? " is-cancelled" : ""}`}
                    key={step}
                  >
                    <span className="booking-step-dot" />
                    <span>{stepLabel}</span>
                  </div>
                );
              })}
            </div>
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingDetail.field.bookingId", locale)}</dt>
                <dd>{booking.bookingId}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.orderId", locale)}</dt>
                <dd>{booking.orderId}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.passenger", locale)}</dt>
                <dd>
                  <Link className="text-link" href={passengerHref}>
                    {booking.passenger.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.phone", locale)}</dt>
                <dd>{booking.passenger.phone}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.pickup", locale)}</dt>
                <dd>
                  <Link className="text-link" href={pickupAddressHref}>
                    {booking.pickup.address}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.dropoff", locale)}</dt>
                <dd>
                  <Link className="text-link" href={dropoffAddressHref}>
                    {booking.dropoff.address}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.windowStart", locale)}</dt>
                <dd>
                  {formatDateTime(booking.reservationWindowStart, locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.windowEnd", locale)}</dt>
                <dd>{formatDateTime(booking.reservationWindowEnd, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.bookedBy", locale)}</dt>
                <dd>
                  {booking.bookedBy?.name ??
                    t("bookingDetail.value.tenantIntake", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.onsiteContact", locale)}</dt>
                <dd>
                  {booking.onsiteContact?.name ??
                    t("bookingDetail.value.notPublished", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.costCenter", locale)}</dt>
                <dd>
                  {booking.costCenter ? (
                    <Link className="text-link" href={costCenterHref}>
                      {booking.costCenter}
                    </Link>
                  ) : (
                    t("bookingDetail.value.notPublished", locale)
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.vehiclePreference", locale)}</dt>
                <dd>
                  {booking.vehiclePreference ??
                    t("bookingDetail.value.notPublished", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.flightTerminal", locale)}</dt>
                <dd>
                  {booking.flightNo ??
                    t("bookingDetail.value.noFlight", locale)}{" "}
                  /{" "}
                  {booking.terminal ??
                    t("bookingDetail.value.noTerminal", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.notes", locale)}</dt>
                <dd>
                  {booking.notes ?? t("bookingDetail.value.noNotes", locale)}
                </dd>
              </div>
            </dl>
            <div className="booking-reference-links">
              <Link className="text-link" href={passengerHref}>
                {t("bookingDetail.link.openPassenger", locale)}
              </Link>
              <Link className="text-link" href={pickupAddressHref}>
                {t("bookingDetail.link.openPickup", locale)}
              </Link>
              <Link className="text-link" href={dropoffAddressHref}>
                {t("bookingDetail.link.openDropoff", locale)}
              </Link>
              <Link className="text-link" href={costCenterHref}>
                {t("bookingDetail.link.openCostCenter", locale)}
              </Link>
              <Link className="text-link" href={bookingFiltersHref}>
                {t("bookingDetail.link.returnContext", locale)}
              </Link>
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker={t("bookingDetail.lifecycle.kicker", locale)}
            title={t("bookingDetail.section.timeline", locale)}
            description={t("bookingDetail.section.timelineSub", locale)}
          >
            <div id="timeline" />
            <ol className="booking-event-list">
              {(recentEvents.length > 0
                ? recentEvents
                : bookingView.events
              ).map((event) => (
                <li
                  className={`booking-event booking-event-${event.tone}`}
                  key={`${event.label}-${event.at ?? "none"}`}
                >
                  <div className="booking-event-head">
                    <strong>{event.label}</strong>
                    <span>
                      {event.at
                        ? formatDateTime(event.at, locale)
                        : t("bookingDetail.value.pendingTimestamp", locale)}
                    </span>
                  </div>
                  <div className="chip-row">
                    <span
                      className={`status-chip booking-realm-${event.realm}`}
                    >
                      {event.realm}
                    </span>
                    <span className="muted-copy">{event.actor}</span>
                  </div>
                  <p>{event.detail}</p>
                </li>
              ))}
            </ol>
          </SurfaceCard>

          <SurfaceCard
            kicker={t("bookingDetail.finance.kicker", locale)}
            title={t("bookingDetail.section.billing", locale)}
            description={t("bookingDetail.section.billingSub", locale)}
          >
            <div id="billing" />
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingDetail.field.quoteFare", locale)}</dt>
                <dd>{formatMoney(booking.quotedFare, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.fareSource", locale)}</dt>
                <dd>
                  {booking.quotedFareSource ??
                    t("bookingDetail.value.notPublished", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.pricingVersion", locale)}</dt>
                <dd>
                  {booking.quotedFareRuleVersion ??
                    t("bookingDetail.value.notPublished", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.manualOverride", locale)}</dt>
                <dd>
                  {booking.manualFareOverride
                    ? `${booking.manualFareOverride.actorType} · ${booking.manualFareOverride.reason}`
                    : t("bookingDetail.value.none", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.approval", locale)}</dt>
                <dd>{describeApprovalState(booking.approvalState, locale)}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.benefitReference", locale)}</dt>
                <dd>
                  {booking.benefitReference ??
                    t("bookingDetail.value.notPublished", locale)}
                </dd>
              </div>
            </dl>
            {relatedInvoices.length > 0 ? (
              <ul className="panel-list">
                {relatedInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <strong>{invoice.invoiceId}</strong>
                    <span className="list-note">
                      {invoice.status} · {formatMoney(invoice.amount, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">
                {t("bookingDetail.empty.relatedInvoices", locale)}
              </p>
            )}
            <h3>{t("bookingDetail.label.relatedStatements", locale)}</h3>
            {relatedStatements.length > 0 ? (
              <ul className="panel-list">
                {relatedStatements.map((statement) => (
                  <li key={statement.statementId}>
                    <strong>{statement.statementId}</strong>
                    <span className="list-note">
                      {statement.driverId} · {statement.periodMonth} ·{" "}
                      {formatMoney(statement.netAmount, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">
                {t("bookingDetail.empty.relatedStatements", locale)}
              </p>
            )}
          </SurfaceCard>
        </div>

        <div className="booking-detail-side">
          <SurfaceCard
            kicker={t("bookingDetail.assignment.kicker", locale)}
            title={t("bookingDetail.assignment.title", locale)}
            description={t("bookingDetail.assignment.description", locale)}
          >
            <dl className="definition-grid">
              <div>
                <dt>{t("bookingDetail.field.assignmentStatus", locale)}</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? t("bookingDetail.value.activeAssignment", locale)
                    : t("bookingDetail.value.noActiveAssignment", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.eta", locale)}</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? t("bookingDetail.value.liveEtaPending", locale)
                    : t("bookingDetail.value.notActive", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.orderStatus", locale)}</dt>
                <dd>{booking.orderStatus}</dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.escalation", locale)}</dt>
                <dd>
                  {source.domain === "forwarded_authority"
                    ? t("bookingDetail.value.opsDeepLinkAvailable", locale)
                    : t("bookingDetail.value.tenantOwner", locale)}
                </dd>
              </div>
              <div>
                <dt>{t("bookingDetail.field.commandReceipt", locale)}</dt>
                <dd>
                  {bookingView.commandReceipt
                    ? `${bookingView.commandReceipt.status} · ${bookingView.commandReceipt.actionId}`
                    : t("bookingDetail.value.noPendingReceipt", locale)}
                </dd>
              </div>
            </dl>
          </SurfaceCard>

          <SurfaceCard
            kicker={t("bookingDetail.actions.kicker", locale)}
            title={t("bookingDetail.actions.title", locale)}
            description={t("bookingDetail.actions.description", locale)}
          >
            <BookingCommandPanel
              actions={bookingView.actions}
              approvalHref={`/rules?bookingId=${encodeURIComponent(booking.bookingId)}`}
              auditHref={auditHref}
              booking={booking}
              readOnlyReasonCode={bookingView.readOnlyReasonCode}
            />
          </SurfaceCard>

          <SurfaceCard
            kicker={t("bookingDetail.deepLinks.kicker", locale)}
            title={t("bookingDetail.section.audit", locale)}
            description={t("bookingDetail.section.auditSub", locale)}
          >
            <div id="audit" />
            <ul className="panel-list">
              {bookingView.deepLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    className="text-link"
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noreferrer" : undefined}
                  >
                    {link.label}
                  </Link>
                  <span className="list-note">{link.note}</span>
                </li>
              ))}
            </ul>
            <p className="muted-copy">
              {t("bookingDetail.deepLinks.crossAppNote", locale)}
            </p>
          </SurfaceCard>
        </div>
      </section>

      <CalloutPanel
        title={t("bookingDetail.boundary.title", locale)}
        description={sourceCopy.detail}
        tone={source.domain === "forwarded_authority" ? "warning" : "default"}
      >
        <p>{sourceCopy.statusBoundary}</p>
      </CalloutPanel>
    </div>
  );
}
