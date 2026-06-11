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
import { CalloutBanner } from "@drts/ui-web";
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
} from "@/lib/source-domain";
import { t } from "@/lib/translations";

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

const EMPTY_REASON_COPY: Record<EmptyReason, EmptyStateCopy> = {
  no_data: {
    title: "No booking data exists yet",
    body: "This tenant has booking access, but no booking record exists in the current workspace snapshot.",
    ctaLabel: "Create a booking",
    ctaHref: "/bookings/new",
    tone: "default",
  },
  not_provisioned: {
    title: "Booking module is not provisioned",
    body: "Tenant setup is incomplete, so booking detail cannot be hydrated until provisioning finishes.",
    ctaLabel: "Open settings",
    ctaHref: "/settings",
    tone: "warning",
  },
  fetch_failed: {
    title: "The booking snapshot could not be loaded",
    body: "The backend request failed before a usable read model was returned. Retry or inspect the audit lane for the last successful mutation.",
    ctaLabel: "Back to bookings",
    ctaHref: "/bookings",
    tone: "warning",
  },
  permission_denied: {
    title: "This actor cannot read the booking detail",
    body: "The booking exists, but the current tenant actor does not have read scope for this record.",
    ctaLabel: "Back to bookings",
    ctaHref: "/bookings",
    tone: "warning",
  },
  external_unavailable: {
    title: "The linked external system is unavailable",
    body: "Tenant truth is still readable, but one or more external dispatch details cannot be refreshed right now.",
    ctaLabel: "Open audit",
    ctaHref: "/audit",
    tone: "warning",
  },
  filtered_empty: {
    title: "This deep link no longer matches the current filters",
    body: "The booking detail route is valid, but the surrounding filtered context no longer contains the record you expected.",
    ctaLabel: "Reset booking filters",
    ctaHref: "/bookings",
    tone: "default",
  },
  driver_not_eligible: {
    title: "The assigned driver is no longer eligible",
    body: "The booking still exists, but the current driver eligibility state prevents showing a complete live assignment snapshot.",
    ctaLabel: "Open audit",
    ctaHref: "/audit",
    tone: "warning",
  },
};

function PageHero({ eyebrow, title, description }: PageHeroProps) {
  return (
    <header className="surface-card detail-stack">
      <span className="eyebrow-copy">{eyebrow}</span>
      <h1 className="booking-hero-title">{title}</h1>
      <p className="muted-copy">{description}</p>
    </header>
  );
}

function SurfaceCard({
  kicker,
  title,
  description,
  children,
}: SurfaceCardProps) {
  return (
    <section className="surface-card detail-stack">
      <div className="detail-stack">
        <span className="eyebrow-copy">{kicker}</span>
        <h2>{title}</h2>
        <p className="muted-copy">{description}</p>
        {children}
      </div>
    </section>
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

function buildBookingEvents(booking: BookingRecord): BookingEvent[] {
  const events: BookingEvent[] = [
    {
      label: "訂單已建立",
      at: booking.createdAt,
      actor: booking.bookedBy?.name ?? "Tenant intake",
      realm: "tenant",
      tone: "default",
      detail: `Reservation window ${formatDateTime(booking.reservationWindowStart)} to ${formatDateTime(booking.reservationWindowEnd)}.`,
    },
  ];

  if (booking.approvalState !== "not_required") {
    events.push({
      label: "審批流程",
      at: booking.updatedAt,
      actor: "tenant.approval",
      realm: "system",
      tone: booking.approvalState === "approved" ? "success" : "warning",
      detail: `Approval state is ${booking.approvalState}. Related request count: ${booking.approvalRequestIds.length}.`,
    });
  }

  if (ACTIVE_ORDER_STATUSES.has(booking.orderStatus)) {
    events.push({
      label: "司機指派中",
      at: booking.updatedAt,
      actor: "dispatch.engine",
      realm: "ops",
      tone: "success",
      detail:
        "The booking is currently attached to an active fulfillment leg. Live ETA is not published by the current read model.",
    });
  }

  if (booking.orderStatus === "cancelled") {
    events.push({
      label: "訂單已取消",
      at: booking.updatedAt,
      actor: "tenant command",
      realm: "tenant",
      tone: "warning",
      detail:
        "Tenant cancellation completed. Audit retains the reason and actor attribution.",
    });
  } else if (booking.orderStatus === "completed") {
    events.push({
      label: "行程已完成",
      at: booking.updatedAt,
      actor: "driver workflow",
      realm: "system",
      tone: "success",
      detail:
        "Fulfillment completed. Billing and audit remain accessible from tenant-owned routes.",
    });
  } else {
    events.push({
      label: "工作流程快照已更新",
      at: booking.updatedAt,
      actor: "booking.readmodel",
      realm: "system",
      tone: "default",
      detail: `Current order status is ${booking.orderStatus}.`,
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
      label: "檢視 audit 子集",
      note: commandReceipt?.auditId
        ? "Open the action receipt audit trail directly when a command has already been accepted."
        : "Tenant audit includes actor realm chips for tenant, ops, platform, and system actions.",
    },
    {
      href: `/rules?bookingId=${encodeURIComponent(booking.bookingId)}`,
      label: "開啟審批規則",
      note: "Use the tenant rules lane to inspect the approval logic that currently applies to this booking.",
    },
    ...(source.domain === "forwarded_authority"
      ? [
          {
            href: `${opsConsoleBase}/dispatch?orderId=${encodeURIComponent(booking.orderId)}`,
            label: "開啟 ops console 明細",
            note: "Forwarded-authority bookings escalate to the ops app in a new tab when dispatch recovery is needed.",
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
    events: buildBookingEvents(booking),
    generatedAt: new Date().toISOString(),
    readOnlyReasonCode:
      booking.readOnlyReasonCode ??
      (updateAction && !updateAction.enabled
        ? (updateAction.disabledReasonCode ?? null)
        : null),
    timelineStep: deriveTimelineStep(booking.orderStatus),
  };
}

function describeReadOnlyReason(reasonCode: string | null) {
  switch (reasonCode) {
    case "past_editable_until":
      return "租戶編輯時窗已過，因此此明細對更新命令現為唯讀。";
    case "booking_terminal":
      return "行程已結束。租戶使用者可檢視內容與 audit，但無法再變更訂單。";
    case "on_trip_locked":
      return "司機工作流程已在進行中。後續應透過取消政策或 ops 升級處理，而非即時編輯。";
    case "approval_pending":
      return "此訂單需待審批結果，才能接受下一個更新命令。";
    default:
      return "此訂單目前沒有可用的租戶更新命令。";
  }
}

function describeEditableWindow(
  editableUntil: string | null,
  editable: boolean,
) {
  const relativeWindow = formatRelativeTime(editableUntil);
  if (!editableUntil) {
    return editable
      ? "The backend currently exposes no edit deadline for this booking."
      : "The booking is read-only even though no edit deadline was published.";
  }

  return editable
    ? `The tenant edit window remains open until ${formatDateTime(editableUntil)}${relativeWindow ? ` (${relativeWindow})` : ""}.`
    : `The tenant edit window closed at ${formatDateTime(editableUntil)}${relativeWindow ? ` (${relativeWindow})` : ""}.`;
}

function describeApprovalState(state: BookingRecord["approvalState"]) {
  switch (state) {
    case "not_required":
      return "此訂單目前沒有啟用的審批關卡。";
    case "pending":
      return "派遣繼續前需要審批。";
    case "approved":
      return "審批關卡已通過，訂單可繼續。";
    case "rejected":
      return "審批已被拒絕。重新提交前請檢視規則。";
    case "blocked":
      return "A policy block currently prevents the booking from proceeding.";
    case "cancelled_by_re_evaluation":
      return "A prior approval request was invalidated by a later booking change.";
    default:
      return state;
  }
}

function renderEmptyState(reason: EmptyReason, bookingId: string) {
  let copy: EmptyStateCopy;
  switch (reason) {
    case "no_data":
      copy = EMPTY_REASON_COPY.no_data as EmptyStateCopy;
      break;
    case "not_provisioned":
      copy = EMPTY_REASON_COPY.not_provisioned as EmptyStateCopy;
      break;
    case "fetch_failed":
      copy = EMPTY_REASON_COPY.fetch_failed as EmptyStateCopy;
      break;
    case "permission_denied":
      copy = EMPTY_REASON_COPY.permission_denied as EmptyStateCopy;
      break;
    case "external_unavailable":
      copy = EMPTY_REASON_COPY.external_unavailable as EmptyStateCopy;
      break;
    case "filtered_empty":
      copy = EMPTY_REASON_COPY.filtered_empty as EmptyStateCopy;
      break;
    default:
      copy = EMPTY_REASON_COPY.fetch_failed as EmptyStateCopy;
      break;
  }
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="訂單明細"
        title={`${bookingId} unavailable`}
        description="租戶明細路由實作了全部六種共用 EmptyReason 處理，讓 UI 不會把每種空／未就緒情況都收斂成同一則訊息。"
      />
      <SurfaceCard
        kicker="EmptyReason"
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
              Restore live detail
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
        : "The tenant command was accepted and is waiting on external dispatch confirmation.",
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
  const emptyReason =
    typeof query.emptyReason === "string"
      ? (query.emptyReason as EmptyReason)
      : null;

  if (emptyReason && emptyReason in EMPTY_REASON_COPY) {
    return renderEmptyState(emptyReason, bookingId);
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
    booking.lastActionReceipt ?? parseCommandReceipt(query, bookingId);
  const bookingView = deriveBookingView(booking, commandReceipt);
  const source = getBookingSourceVisibility(booking);
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
    <div className="page-shell">
      <PageHero
        eyebrow="訂單明細"
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
        description="訂單明細現在遵循 Tenant Console canvas：可編輯截止可見性、審批內容、司機指派狀態、audit 子集、更新層級與動作描述子，全部集中在同一個租戶擁有的畫面上。"
      />

      <div className="chip-row">
        <Link
          className="action-button action-button-secondary"
          href="#overview"
        >
          {t("bookingDetail.tab.overview")}
        </Link>
        <Link
          className="action-button action-button-secondary"
          href="#timeline"
        >
          {t("bookingDetail.tab.timeline")}
        </Link>
        <Link className="action-button action-button-secondary" href="#billing">
          {t("bookingDetail.tab.billing")}
        </Link>
        <Link className="action-button action-button-secondary" href="#audit">
          {t("bookingDetail.tab.audit")}
        </Link>
      </div>

      {bookingView.acceptedPending && bookingView.commandReceipt ? (
        <CalloutPanel
          title={`Command accepted · awaiting external confirmation · ${bookingView.commandReceipt.actionId}`}
          description={bookingView.commandReceipt.message}
          tone="warning"
        >
          <p>
            Audit link {bookingView.commandReceipt.auditId} is already assigned.
            Keep this detail open or refresh after the next T5 cycle if the
            status has not advanced.
          </p>
        </CalloutPanel>
      ) : null}

      <section className="surface-grid surface-grid-wide" id="overview">
        <SurfaceCard
          kicker="Refresh tier"
          title="租戶訂單明細以 T5 更新"
          description="此畫面是租戶慢速明細介面：自動更新較慢，仍可手動檢視，過期狀態必須明確標示。"
        >
          <div className="booking-refresh-card">
            <div className="chip-row">
              <span className="status-chip booking-pill-accent">T5 slow</span>
              <span className="status-chip">fresh snapshot</span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>產生時間</dt>
                <dd>{formatDateTime(bookingView.generatedAt)}</dd>
              </div>
              <div>
                <dt>最後訂單更新</dt>
                <dd>{formatDateTime(booking.updatedAt)}</dd>
              </div>
              <div>
                <dt>來源</dt>
                <dd>live tenant API</dd>
              </div>
              <div>
                <dt>手動更新</dt>
                <dd>
                  Browser refresh, notification reopen, or command receipt
                  refresh
                </dd>
              </div>
            </dl>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Status"
          title="可編輯性與審批狀態"
          description="依 Q-TEN05，可編輯性由動作描述子加上 editableUntil 決定，而非僅憑狀態標籤推測。"
        >
          <div className="detail-stack">
            <div className="chip-row">
              <span className="status-badge">{booking.orderStatus}</span>
              <span className="status-chip">Booking {booking.status}</span>
              <span
                className={`status-chip${editable ? " booking-pill-success" : " booking-pill-warning"}`}
              >
                {editable ? "Editable" : "Read only"}
              </span>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>editableUntil</dt>
                <dd>{formatDateTime(bookingView.editableUntil)}</dd>
              </div>
              <div>
                <dt>readOnlyReasonCode</dt>
                <dd>{bookingView.readOnlyReasonCode ?? "None"}</dd>
              </div>
              <div>
                <dt>審批狀態</dt>
                <dd>{booking.approvalState}</dd>
              </div>
              <div>
                <dt>審批請求</dt>
                <dd>{booking.approvalRequestIds.length}</dd>
              </div>
            </dl>
            <div className="booking-inline-note">
              {describeEditableWindow(bookingView.editableUntil, editable)}
            </div>
            {booking.approvalState === "pending" ? (
              <CalloutPanel
                title="需審批狀態"
                description={describeApprovalState(booking.approvalState)}
                tone="warning"
              >
                <p>
                  This booking should not be treated as editable just because it
                  is not terminal. Wait for approval or use the rules lane.
                </p>
              </CalloutPanel>
            ) : null}
            {!editable ? (
              <p className="muted-copy">
                {describeReadOnlyReason(bookingView.readOnlyReasonCode)}
              </p>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      <section className="booking-detail-layout">
        <div className="booking-detail-main">
          <SurfaceCard
            kicker="Trip context"
            title={t("bookingDetail.section.trip")}
            description={t("bookingDetail.section.tripSub")}
          >
            <div className="booking-stepper" aria-label="訂單工作流程狀態">
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
                <dt>訂單 ID</dt>
                <dd>{booking.bookingId}</dd>
              </div>
              <div>
                <dt>單號 ID</dt>
                <dd>{booking.orderId}</dd>
              </div>
              <div>
                <dt>乘客</dt>
                <dd>
                  <Link className="text-link" href={passengerHref}>
                    {booking.passenger.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>電話</dt>
                <dd>{booking.passenger.phone}</dd>
              </div>
              <div>
                <dt>上車</dt>
                <dd>
                  <Link className="text-link" href={pickupAddressHref}>
                    {booking.pickup.address}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>下車</dt>
                <dd>
                  <Link className="text-link" href={dropoffAddressHref}>
                    {booking.dropoff.address}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>時窗開始</dt>
                <dd>{formatDateTime(booking.reservationWindowStart)}</dd>
              </div>
              <div>
                <dt>時窗結束</dt>
                <dd>{formatDateTime(booking.reservationWindowEnd)}</dd>
              </div>
              <div>
                <dt>預約人</dt>
                <dd>{booking.bookedBy?.name ?? "Tenant intake"}</dd>
              </div>
              <div>
                <dt>現場聯絡人</dt>
                <dd>{booking.onsiteContact?.name ?? "Not published"}</dd>
              </div>
              <div>
                <dt>成本中心</dt>
                <dd>
                  {booking.costCenter ? (
                    <Link className="text-link" href={costCenterHref}>
                      {booking.costCenter}
                    </Link>
                  ) : (
                    "Not published"
                  )}
                </dd>
              </div>
              <div>
                <dt>車輛偏好</dt>
                <dd>{booking.vehiclePreference ?? "Not published"}</dd>
              </div>
              <div>
                <dt>航班／航廈</dt>
                <dd>
                  {booking.flightNo ?? "No flight"} /{" "}
                  {booking.terminal ?? "No terminal"}
                </dd>
              </div>
              <div>
                <dt>備註</dt>
                <dd>{booking.notes ?? "No notes"}</dd>
              </div>
            </dl>
            <div className="booking-reference-links">
              <Link className="text-link" href={passengerHref}>
                Open passenger directory reference
              </Link>
              <Link className="text-link" href={pickupAddressHref}>
                Open pickup address reference
              </Link>
              <Link className="text-link" href={dropoffAddressHref}>
                Open dropoff address reference
              </Link>
              <Link className="text-link" href={costCenterHref}>
                Open cost center governance
              </Link>
              <Link className="text-link" href={bookingFiltersHref}>
                Return to booking list context
              </Link>
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="Lifecycle"
            title={t("bookingDetail.section.timeline")}
            description={t("bookingDetail.section.timelineSub")}
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
                        ? formatDateTime(event.at)
                        : "Pending timestamp"}
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
            kicker="Finance"
            title={t("bookingDetail.section.billing")}
            description={t("bookingDetail.section.billingSub")}
          >
            <div id="billing" />
            <dl className="definition-grid">
              <div>
                <dt>報價車資</dt>
                <dd>{formatMoney(booking.quotedFare)}</dd>
              </div>
              <div>
                <dt>車資來源</dt>
                <dd>{booking.quotedFareSource ?? "Not published"}</dd>
              </div>
              <div>
                <dt>定價版本</dt>
                <dd>{booking.quotedFareRuleVersion ?? "Not published"}</dd>
              </div>
              <div>
                <dt>手動覆寫</dt>
                <dd>
                  {booking.manualFareOverride
                    ? `${booking.manualFareOverride.actorType} · ${booking.manualFareOverride.reason}`
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>審批</dt>
                <dd>{describeApprovalState(booking.approvalState)}</dd>
              </div>
              <div>
                <dt>福利參照</dt>
                <dd>{booking.benefitReference ?? "Not published"}</dd>
              </div>
            </dl>
            {relatedInvoices.length > 0 ? (
              <ul className="panel-list">
                {relatedInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <strong>{invoice.invoiceId}</strong>
                    <span className="list-note">
                      {invoice.status} · {formatMoney(invoice.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">
                {t("bookingDetail.empty.relatedInvoices")}
              </p>
            )}
            <h3>{t("bookingDetail.label.relatedStatements")}</h3>
            {relatedStatements.length > 0 ? (
              <ul className="panel-list">
                {relatedStatements.map((statement) => (
                  <li key={statement.statementId}>
                    <strong>{statement.statementId}</strong>
                    <span className="list-note">
                      {statement.driverId} · {statement.periodMonth} ·{" "}
                      {formatMoney(statement.netAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">
                {t("bookingDetail.empty.relatedStatements")}
              </p>
            )}
          </SurfaceCard>
        </div>

        <div className="booking-detail-side">
          <SurfaceCard
            kicker="Assignment"
            title="司機／車輛指派"
            description="若派遣已附上履約段，租戶使用者可看到指派狀態，但不會取得派遣控制權。"
          >
            <dl className="definition-grid">
              <div>
                <dt>指派狀態</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? "Active driver assignment"
                    : "No active assignment published"}
                </dd>
              </div>
              <div>
                <dt>ETA</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? "Live ETA pending from dispatch read model"
                    : "Not active"}
                </dd>
              </div>
              <div>
                <dt>訂單狀態</dt>
                <dd>{booking.orderStatus}</dd>
              </div>
              <div>
                <dt>升級</dt>
                <dd>
                  {source.domain === "forwarded_authority"
                    ? "Ops console deep link available"
                    : "Tenant detail remains the primary owner view"}
                </dd>
              </div>
              <div>
                <dt>命令回執</dt>
                <dd>
                  {bookingView.commandReceipt
                    ? `${bookingView.commandReceipt.status} · ${bookingView.commandReceipt.actionId}`
                    : "No pending receipt"}
                </dd>
              </div>
            </dl>
          </SurfaceCard>

          <SurfaceCard
            kicker="Actions"
            title="可用操作"
            description="命令面板依此訂單的動作描述子集合，呈現啟用、停用與隱藏狀態。"
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
            kicker="Deep links"
            title={t("bookingDetail.section.audit")}
            description={t("bookingDetail.section.auditSub")}
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
              Cross-app routes open in a new tab when authority belongs to ops
              or another deployment.
            </p>
          </SurfaceCard>
        </div>
      </section>

      <CalloutPanel
        title="權限邊界"
        description={source.detail}
        tone={source.domain === "forwarded_authority" ? "warning" : "default"}
      >
        <p>{source.statusBoundary}</p>
      </CalloutPanel>
    </div>
  );
}
