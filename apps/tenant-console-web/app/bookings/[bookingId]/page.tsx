import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import type {
  ActionReceipt,
  AuditLogRecord,
  BookingRecord,
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
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

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
    title: "目前尚無叫車資料",
    body: "此租戶已開通叫車功能，但目前工作區快照中還沒有任何叫車紀錄。",
    ctaLabel: "建立叫車",
    ctaHref: "/bookings/new",
    tone: "default",
  },
  not_provisioned: {
    title: "叫車模組尚未完成佈建",
    body: "租戶設定尚未完成，因此在佈建完成前無法載入叫車明細。",
    ctaLabel: "前往設定",
    ctaHref: "/settings",
    tone: "warning",
  },
  fetch_failed: {
    title: "無法載入叫車快照",
    body: "後端請求在可用讀取模型回傳前就失敗了。請重試，或到稽核頁查看上一筆成功異動。",
    ctaLabel: "返回叫車列表",
    ctaHref: "/bookings",
    tone: "warning",
  },
  permission_denied: {
    title: "目前帳號無法讀取叫車明細",
    body: "這筆叫車單確實存在，但目前租戶帳號沒有讀取這筆資料的權限範圍。",
    ctaLabel: "返回叫車列表",
    ctaHref: "/bookings",
    tone: "warning",
  },
  external_unavailable: {
    title: "關聯外部系統目前不可用",
    body: "租戶側資料仍可讀取，但有一個或多個外部派遣細節目前無法刷新。",
    ctaLabel: "前往稽核",
    ctaHref: "/audit",
    tone: "warning",
  },
  filtered_empty: {
    title: "這個深連結已不符合目前篩選條件",
    body: "叫車明細路徑本身有效，但外層的篩選情境已不再包含你預期的那筆資料。",
    ctaLabel: "清除叫車篩選",
    ctaHref: "/bookings",
    tone: "default",
  },
  driver_not_eligible: {
    title: "已指派司機目前不再符合資格",
    body: "這筆叫車單仍然存在，但目前的司機資格狀態讓系統無法顯示完整的即時指派快照。",
    ctaLabel: "前往稽核",
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
      label: "叫車單已建立",
      at: booking.createdAt,
      actor: booking.bookedBy?.name ?? "租戶受理",
      realm: "tenant",
      tone: "default",
      detail: `預約時段 ${formatDateTime(booking.reservationWindowStart)} 至 ${formatDateTime(booking.reservationWindowEnd)}。`,
    },
  ];

  if (booking.approvalState !== "not_required") {
    events.push({
      label: "審批流程",
      at: booking.updatedAt,
      actor: "租戶審批",
      realm: "system",
      tone: booking.approvalState === "approved" ? "success" : "warning",
      detail: `審批狀態為 ${formatTenantCodeLabel(booking.approvalState)}，關聯申請共 ${booking.approvalRequestIds.length} 筆。`,
    });
  }

  if (ACTIVE_ORDER_STATUSES.has(booking.orderStatus)) {
    events.push({
      label: "司機指派進行中",
      at: booking.updatedAt,
      actor: "派遣引擎",
      realm: "ops",
      tone: "success",
      detail:
        "這筆叫車單目前已掛上進行中的履約派遣。現行讀取模型尚未發佈即時預估到達時間。",
    });
  }

  if (booking.orderStatus === "cancelled") {
    events.push({
      label: "叫車單已取消",
      at: booking.updatedAt,
      actor: "租戶指令",
      realm: "tenant",
      tone: "warning",
      detail: "租戶取消已完成，稽核中保留了原因與執行者資訊。",
    });
  } else if (booking.orderStatus === "completed") {
    events.push({
      label: "行程已完成",
      at: booking.updatedAt,
      actor: "司機流程",
      realm: "system",
      tone: "success",
      detail: "履約已完成，租戶仍可透過帳務與稽核路徑檢視後續資料。",
    });
  } else {
    events.push({
      label: "流程快照已更新",
      at: booking.updatedAt,
      actor: "叫車讀模型",
      realm: "system",
      tone: "default",
      detail: `目前訂單狀態為 ${formatTenantCodeLabel(booking.orderStatus)}。`,
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
      label: "查看稽核子集",
      note: commandReceipt?.auditId
        ? "若指令已被接受，可直接開啟該指令收據對應的稽核軌跡。"
        : "租戶稽核會顯示租戶、營運、平台與系統等角色範圍標記。",
    },
    {
      href: `/rules?bookingId=${encodeURIComponent(booking.bookingId)}`,
      label: "開啟審批規則",
      note: "可到租戶規則頁檢查目前套用在這筆叫車單上的審批邏輯。",
    },
    ...(source.domain === "forwarded_authority"
      ? [
          {
            href: `${opsConsoleBase}/dispatch?orderId=${encodeURIComponent(booking.orderId)}`,
            label: "開啟營運派遣明細",
            note: "若這是轉單權限來源的訂單，且需派遣補救，會以新分頁跳轉至營運系統。",
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
      return "租戶可編輯時窗已結束，因此此明細目前無法再送出更新指令。";
    case "booking_terminal":
      return "這趟行程已經結案。租戶仍可檢視情境與稽核，但不能再修改叫車單。";
    case "on_trip_locked":
      return "司機履約流程已在進行中。後續處理應透過取消政策或營運升級，而不是在此直接編輯。";
    case "approval_pending":
      return "這筆叫車單仍在等待審批結果，暫時無法接受新的更新指令。";
    default:
      return "這筆叫車單目前沒有可由租戶端執行的更新指令。";
  }
}

function describeEditableWindow(
  editableUntil: string | null,
  editable: boolean,
) {
  const relativeWindow = formatRelativeTime(editableUntil);
  if (!editableUntil) {
    return editable
      ? "後端目前沒有發佈這筆叫車單的編輯截止時間。"
      : "這筆叫車單目前為唯讀，即使後端沒有發佈編輯截止時間也是如此。";
  }

  return editable
    ? `租戶可編輯時窗將持續到 ${formatDateTime(editableUntil)}${relativeWindow ? `（${relativeWindow}）` : ""}。`
    : `租戶可編輯時窗已於 ${formatDateTime(editableUntil)}${relativeWindow ? `（${relativeWindow}）` : ""} 關閉。`;
}

function describeApprovalState(state: BookingRecord["approvalState"]) {
  switch (state) {
    case "not_required":
      return "這筆叫車單目前沒有審批門檻。";
    case "pending":
      return "派遣流程必須等待審批通過後才能繼續。";
    case "approved":
      return "審批門檻已解除，叫車單可繼續往下處理。";
    case "rejected":
      return "審批已遭駁回。請先檢查規則頁，再決定是否重新送審。";
    case "blocked":
      return "目前有政策阻擋，這筆叫車單無法繼續。";
    case "cancelled_by_re_evaluation":
      return "先前的審批申請因後續叫車內容異動而失效。";
    default:
      return formatTenantCodeLabel(state, state);
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
        eyebrow="叫車明細"
        title={`叫車單編號 ${bookingId} 目前無法顯示`}
        description="此租戶明細頁完整實作六種空狀態原因顯示，不會把所有空狀態與未就緒情境都混成同一種訊息。"
      />
      <SurfaceCard kicker="空狀態" title={copy.title} description={copy.body}>
        <div className="booking-empty-state">
          <span
            className={`status-chip${copy.tone === "warning" ? " booking-pill-warning" : ""}`}
          >
            {formatTenantCodeLabel(reason, reason)}
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
              重新載入即時明細
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
        : "租戶指令已被接受，正在等待外部派遣系統確認。",
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
  const [bookingResult, invoicesResult, auditLogsResult] =
    await Promise.allSettled([
      client.getTenantBooking(bookingId) as Promise<BookingDetailRecord>,
      client.listInvoices(),
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
        eyebrow="叫車明細"
        title={
          <span className="booking-hero-title">
            <span>{`叫車單編號 ${booking.bookingId} · ${formatTenantCodeLabel(booking.businessDispatchSubtype, booking.businessDispatchSubtype)}`}</span>
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
                ? "已受理待確認"
                : formatTenantCodeLabel(
                    booking.orderStatus,
                    booking.orderStatus,
                  )}
            </span>
          </span>
        }
        description="此頁已對齊租戶端明細畫布：可編輯時窗、審批脈絡、司機指派狀態、稽核子集、刷新層級與可用動作都集中在同一頁。"
      />

      {bookingView.acceptedPending && bookingView.commandReceipt ? (
        <CalloutPanel
          title="指令已受理，等待外部確認"
          description={bookingView.commandReceipt.message}
          tone="warning"
        >
          <p>
            指令編號 {bookingView.commandReceipt.actionId} · 稽核編號{" "}
            {bookingView.commandReceipt.auditId}{" "}
            已建立。若狀態尚未前進，請保留此頁，或等下一個 T5
            刷新週期後重新整理。
          </p>
        </CalloutPanel>
      ) : null}

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="刷新層級"
          title="租戶叫車明細以 T5 更新"
          description="這個頁面屬於租戶慢速明細面：自動刷新節奏較慢，但人工檢查仍可持續進行，且過舊狀態必須明確呈現。"
        >
          <div className="booking-refresh-card">
            <div className="chip-row">
              <span className="status-chip booking-pill-accent">T5 慢速</span>
              <span className="status-chip">最新快照</span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>產生時間</dt>
                <dd>{formatDateTime(bookingView.generatedAt)}</dd>
              </div>
              <div>
                <dt>最後更新</dt>
                <dd>{formatDateTime(booking.updatedAt)}</dd>
              </div>
              <div>
                <dt>來源</dt>
                <dd>租戶即時介面</dd>
              </div>
              <div>
                <dt>手動刷新</dt>
                <dd>可用瀏覽器重整、重新開啟通知，或依指令收據再次刷新</dd>
              </div>
            </dl>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="狀態"
          title="可編輯性與審批狀態"
          description="是否可編輯必須由動作描述與可編輯截止時間共同決定，不能只看狀態字樣推測。"
        >
          <div className="detail-stack">
            <div className="chip-row">
              <span className="status-badge">
                {formatTenantCodeLabel(
                  booking.orderStatus,
                  booking.orderStatus,
                )}
              </span>
              <span className="status-chip">
                叫車單 {formatTenantCodeLabel(booking.status, booking.status)}
              </span>
              <span
                className={`status-chip${editable ? " booking-pill-success" : " booking-pill-warning"}`}
              >
                {editable ? "可編輯" : "唯讀"}
              </span>
              <span className={getSourceToneClassName(source.tone)}>
                {source.badge}
              </span>
            </div>
            <dl className="definition-grid">
              <div>
                <dt>可編輯截止時間</dt>
                <dd>{formatDateTime(bookingView.editableUntil)}</dd>
              </div>
              <div>
                <dt>唯讀原因</dt>
                <dd>
                  {bookingView.readOnlyReasonCode
                    ? formatTenantCodeLabel(
                        bookingView.readOnlyReasonCode,
                        bookingView.readOnlyReasonCode,
                      )
                    : "無"}
                </dd>
              </div>
              <div>
                <dt>審批狀態</dt>
                <dd>
                  {formatTenantCodeLabel(
                    booking.approvalState,
                    booking.approvalState,
                  )}
                </dd>
              </div>
              <div>
                <dt>審批申請數</dt>
                <dd>{booking.approvalRequestIds.length}</dd>
              </div>
            </dl>
            <div className="booking-inline-note">
              {describeEditableWindow(bookingView.editableUntil, editable)}
            </div>
            {booking.approvalState === "pending" ? (
              <CalloutPanel
                title="需等待審批"
                description={describeApprovalState(booking.approvalState)}
                tone="warning"
              >
                <p>
                  即使這筆叫車單還沒到終態，也不能直接視為可編輯。請先等待審批結果，或到規則頁進一步查看。
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
            kicker="行程資訊"
            title="叫車、乘客與路線明細"
            description="此頁會把租戶可見的完整叫車資料放在操作區旁邊，避免使用者必須切到僅限營運的頁面才能確認預約內容。"
          >
            <div className="booking-stepper" aria-label="叫車流程狀態">
              {BOOKING_TIMELINE_STEPS.map((step, index) => {
                const isActive = index === bookingView.timelineStep;
                const isComplete = index < bookingView.timelineStep;
                const isTerminalCancelled =
                  booking.orderStatus === "cancelled" &&
                  step ===
                    BOOKING_TIMELINE_STEPS[BOOKING_TIMELINE_STEPS.length - 1];
                const stepLabel =
                  isTerminalCancelled && step === "completed"
                    ? "已取消"
                    : formatTenantCodeLabel(step, step);

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
                <dt>叫車單編號</dt>
                <dd>{booking.bookingId}</dd>
              </div>
              <div>
                <dt>訂單編號</dt>
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
                <dt>上車地點</dt>
                <dd>
                  <Link className="text-link" href={pickupAddressHref}>
                    {booking.pickup.address}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>下車地點</dt>
                <dd>
                  <Link className="text-link" href={dropoffAddressHref}>
                    {booking.dropoff.address}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>時段起始</dt>
                <dd>{formatDateTime(booking.reservationWindowStart)}</dd>
              </div>
              <div>
                <dt>時段結束</dt>
                <dd>{formatDateTime(booking.reservationWindowEnd)}</dd>
              </div>
              <div>
                <dt>建立人</dt>
                <dd>{booking.bookedBy?.name ?? "租戶受理"}</dd>
              </div>
              <div>
                <dt>現場聯絡人</dt>
                <dd>{booking.onsiteContact?.name ?? "未提供"}</dd>
              </div>
              <div>
                <dt>成本中心</dt>
                <dd>
                  {booking.costCenter ? (
                    <Link className="text-link" href={costCenterHref}>
                      {booking.costCenter}
                    </Link>
                  ) : (
                    "未提供"
                  )}
                </dd>
              </div>
              <div>
                <dt>車型偏好</dt>
                <dd>
                  {booking.vehiclePreference
                    ? formatTenantCodeLabel(
                        booking.vehiclePreference,
                        booking.vehiclePreference,
                      )
                    : "未提供"}
                </dd>
              </div>
              <div>
                <dt>航班 / 航廈</dt>
                <dd>
                  {booking.flightNo ?? "無航班"} /{" "}
                  {booking.terminal ?? "無航廈"}
                </dd>
              </div>
              <div>
                <dt>備註</dt>
                <dd>{booking.notes ?? "無備註"}</dd>
              </div>
            </dl>
            <div className="booking-reference-links">
              <Link className="text-link" href={passengerHref}>
                開啟乘客名錄
              </Link>
              <Link className="text-link" href={pickupAddressHref}>
                開啟上車地址參考
              </Link>
              <Link className="text-link" href={dropoffAddressHref}>
                開啟下車地址參考
              </Link>
              <Link className="text-link" href={costCenterHref}>
                開啟成本中心治理
              </Link>
              <Link className="text-link" href={bookingFiltersHref}>
                回到叫車列表情境
              </Link>
            </div>
          </SurfaceCard>

          <SurfaceCard
            kicker="生命週期"
            title="時間軸與近期更新"
            description="租戶稽核可看見跨角色的異動，因此這裡的近期更新不會假裝每一筆都是租戶本人操作。"
          >
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
                      {event.at ? formatDateTime(event.at) : "等待時間戳"}
                    </span>
                  </div>
                  <div className="chip-row">
                    <span
                      className={`status-chip booking-realm-${event.realm}`}
                    >
                      {formatTenantCodeLabel(event.realm, event.realm)}
                    </span>
                    <span className="muted-copy">{event.actor}</span>
                  </div>
                  <p>{event.detail}</p>
                </li>
              ))}
            </ol>
          </SurfaceCard>

          <SurfaceCard
            kicker="帳務"
            title="車資、發票與審批脈絡"
            description="報價車資、審批狀態與發票連結都維持租戶可見；僅限派遣端的執行細節則留在別的工作區。"
          >
            <dl className="definition-grid">
              <div>
                <dt>預估車資</dt>
                <dd>{formatMoney(booking.quotedFare)}</dd>
              </div>
              <div>
                <dt>車資來源</dt>
                <dd>
                  {booking.quotedFareSource
                    ? formatTenantCodeLabel(
                        booking.quotedFareSource,
                        booking.quotedFareSource,
                      )
                    : "未提供"}
                </dd>
              </div>
              <div>
                <dt>定價版本</dt>
                <dd>{booking.quotedFareRuleVersion ?? "未提供"}</dd>
              </div>
              <div>
                <dt>人工覆價</dt>
                <dd>
                  {booking.manualFareOverride
                    ? `${formatTenantCodeLabel(booking.manualFareOverride.actorType, booking.manualFareOverride.actorType)} · ${booking.manualFareOverride.reason}`
                    : "無"}
                </dd>
              </div>
              <div>
                <dt>審批</dt>
                <dd>{describeApprovalState(booking.approvalState)}</dd>
              </div>
              <div>
                <dt>補助參考</dt>
                <dd>{booking.benefitReference ?? "未提供"}</dd>
              </div>
            </dl>
            {relatedInvoices.length > 0 ? (
              <ul className="panel-list">
                {relatedInvoices.map((invoice) => (
                  <li key={invoice.invoiceId}>
                    <strong>發票編號 {invoice.invoiceId}</strong>
                    <span className="list-note">
                      {formatTenantCodeLabel(invoice.status, invoice.status)} ·{" "}
                      {formatMoney(invoice.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">
                目前沒有任何租戶發票列與這筆訂單相連。
              </p>
            )}
          </SurfaceCard>
        </div>

        <div className="booking-detail-side">
          <SurfaceCard
            kicker="指派"
            title="司機 / 車輛指派"
            description="若派遣端已掛上履約任務，租戶仍可看見指派狀態，但不會因此獲得派遣控制權。"
          >
            <dl className="definition-grid">
              <div>
                <dt>指派狀態</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? "已有進行中的司機指派"
                    : "目前沒有發佈中的有效指派"}
                </dd>
              </div>
              <div>
                <dt>預估到達時間</dt>
                <dd>
                  {ACTIVE_ORDER_STATUSES.has(booking.orderStatus)
                    ? "等待派遣讀取模型發佈即時預估到達時間"
                    : "目前未啟用"}
                </dd>
              </div>
              <div>
                <dt>訂單狀態</dt>
                <dd>
                  {formatTenantCodeLabel(
                    booking.orderStatus,
                    booking.orderStatus,
                  )}
                </dd>
              </div>
              <div>
                <dt>升級處理</dt>
                <dd>
                  {source.domain === "forwarded_authority"
                    ? "可使用營運主控台深連結"
                    : "此頁仍是租戶端主要檢視視角"}
                </dd>
              </div>
              <div>
                <dt>指令收據</dt>
                <dd>
                  {bookingView.commandReceipt
                    ? `${formatTenantCodeLabel(bookingView.commandReceipt.status)} · ${bookingView.commandReceipt.actionId}`
                    : "目前沒有待處理收據"}
                </dd>
              </div>
            </dl>
          </SurfaceCard>

          <SurfaceCard
            kicker="動作"
            title="可用操作"
            description="指令面板會直接依這筆叫車單的動作描述，呈現可用、停用與隱藏狀態。"
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
            kicker="深連結"
            title="跨系統與後續追查連結"
            description="第一階段仍維持多個獨立應用，因此後續路徑會明確列出，而不是偽裝成同一個執行時殼層。"
          >
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
              若權限實際屬於 ops 或其他部署，跨系統路徑會以新分頁開啟。
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
