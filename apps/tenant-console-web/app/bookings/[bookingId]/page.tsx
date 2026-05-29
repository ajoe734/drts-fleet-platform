import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import type {
  BookingRecord,
  OwnedOrderStatus,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  Stepper,
  Timeline,
  buildCanvasTheme,
} from "@drts/ui-web";
import type {
  CanvasTableColumn,
  CanvasTone,
  ManagementTone,
  StepperItem,
  TimelineItem,
} from "@drts/ui-web";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import { getBookingSourceVisibility } from "@/lib/source-domain";

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

const summaryStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const metaCopyStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: th.textMuted,
};

const mainGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: 16,
  alignItems: "start",
};

const laneStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  alignContent: "start",
};

const linkStyle: CSSProperties = {
  textDecoration: "none",
};

const mutedNoteStyle: CSSProperties = {
  marginTop: 12,
  fontSize: 11.5,
  lineHeight: 1.5,
  color: th.textMuted,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  textAlign: "center",
  color: th.textMuted,
  fontSize: 12.5,
};

const invoicePrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const invoiceMetaStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: th.textDim,
  fontSize: 11,
  fontFamily: th.monoFamily,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: 12,
};

const readOnlyBlockStyle: CSSProperties = {
  minHeight: 36,
  boxSizing: "border-box",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  color: th.text,
  fontSize: 12.5,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const bannerBodyStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

type InvoiceRow = TenantInvoiceRecord &
  Record<string, unknown> & {
    orderLineCount: number;
  };

type StatusPresentation = {
  stepIndex: number;
  blocked: boolean;
  pillTone: CanvasTone;
  workflowTone: ManagementTone;
  label: string;
};

const ASSIGNED_ORDER_STATUSES = new Set<OwnedOrderStatus>([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "completed",
]);

function displayDateTime(value: string | null | undefined) {
  if (!value) {
    return "未發布";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "未發布";
  }

  return formatDateTime(value);
}

function displayMoney(
  value: BookingRecord["quotedFare"] | TenantInvoiceRecord["amount"] | null,
) {
  return value ? formatMoney(value) : "未發布";
}

function displayText(
  value: string | null | undefined,
  fallback = "未提供",
): string {
  return value && value.trim().length > 0 ? value : fallback;
}

function describeManualOverride(booking: BookingRecord) {
  if (!booking.manualFareOverride) {
    return "無";
  }

  return `${booking.manualFareOverride.actorType} / ${booking.manualFareOverride.reason}`;
}

function sourcePillTone(booking: BookingRecord): CanvasTone {
  if (booking.issuerAuthorizationRef) {
    return "warn";
  }

  if (booking.partnerEntrySlug || booking.partnerId) {
    return "info";
  }

  return "success";
}

function invoiceStatusTone(status: TenantInvoiceRecord["status"]): CanvasTone {
  switch (status) {
    case "paid":
      return "success";
    case "issued":
      return "info";
    case "draft":
    default:
      return "neutral";
  }
}

function describeOrderStatus(status: OwnedOrderStatus): StatusPresentation {
  switch (status) {
    case "completed":
      return {
        stepIndex: 5,
        blocked: false,
        pillTone: "success",
        workflowTone: "success",
        label: "completed",
      };
    case "cancelled":
      return {
        stepIndex: 5,
        blocked: true,
        pillTone: "danger",
        workflowTone: "danger",
        label: "cancelled",
      };
    case "on_trip":
    case "proof_pending":
      return {
        stepIndex: 4,
        blocked: false,
        pillTone: "accent",
        workflowTone: "accent",
        label: status,
      };
    case "assigned":
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
      return {
        stepIndex: 3,
        blocked: false,
        pillTone: "info",
        workflowTone: "info",
        label: status,
      };
    case "dispatch_failed":
      return {
        stepIndex: 2,
        blocked: true,
        pillTone: "danger",
        workflowTone: "danger",
        label: "dispatch_failed",
      };
    case "dispatch_timeout":
    case "no_supply":
    case "redispatch_required":
    case "delayed_queue":
    case "exception_hold":
      return {
        stepIndex: 2,
        blocked: true,
        pillTone: "warn",
        workflowTone: "warning",
        label: status,
      };
    case "ready_for_dispatch":
    case "preassigned":
      return {
        stepIndex: 2,
        blocked: false,
        pillTone: "info",
        workflowTone: "info",
        label: status,
      };
    case "recording_pending":
      return {
        stepIndex: 1,
        blocked: false,
        pillTone: "neutral",
        workflowTone: "neutral",
        label: status,
      };
    case "created":
    default:
      return {
        stepIndex: 0,
        blocked: false,
        pillTone: "neutral",
        workflowTone: "neutral",
        label: status,
      };
  }
}

function buildWorkflowItems(booking: BookingRecord): StepperItem[] {
  const status = describeOrderStatus(booking.orderStatus);
  const steps = [
    { id: "created", title: "建立" },
    { id: "queued", title: "進入佇列" },
    { id: "dispatching", title: "派遣中" },
    { id: "assigned", title: "已指派" },
    { id: "trip", title: "行程中" },
    { id: "completed", title: "完成" },
  ] as const;

  return steps.map((step, index) => {
    if (index < status.stepIndex) {
      return {
        id: step.id,
        title: step.title,
        state: "complete",
        tone: "success",
        stateLabel: "完成",
      } satisfies StepperItem;
    }

    if (index === status.stepIndex) {
      return {
        id: step.id,
        title: step.title,
        state: status.blocked ? "blocked" : "current",
        tone: status.workflowTone,
        stateLabel: status.label,
        timestamp: displayDateTime(booking.updatedAt),
      } satisfies StepperItem;
    }

    return {
      id: step.id,
      title: step.title,
      state: "upcoming",
      tone: "neutral",
      stateLabel: "待續",
    } satisfies StepperItem;
  });
}

function buildTimelineItems(booking: BookingRecord): TimelineItem[] {
  const status = describeOrderStatus(booking.orderStatus);

  return [
    {
      id: "created",
      eyebrow: "booking",
      title: "建立預約",
      timestamp: displayDateTime(booking.createdAt),
      tone: "accent",
      detail: booking.bookedBy
        ? `由 ${booking.bookedBy.name} 建立，並寫入 tenant booking ledger。`
        : "租戶端已接受此次預約並建立 booking record。",
    },
    {
      id: "window-open",
      eyebrow: "service window",
      title: "服務窗口開始",
      timestamp: displayDateTime(booking.reservationWindowStart),
      tone: "info",
      detail: `${booking.businessDispatchSubtype} 履約窗口開始。`,
      meta: `booking type: ${booking.bookingType}`,
    },
    {
      id: "window-close",
      eyebrow: "service window",
      title: "服務窗口結束",
      timestamp: displayDateTime(booking.reservationWindowEnd),
      tone: "neutral",
      detail: "此次行程的 tenant-visible reservation window 結束。",
    },
    {
      id: "modify-cutoff",
      eyebrow: "tenant policy",
      title: "可修改截止",
      timestamp: displayDateTime(booking.modifiableUntil),
      tone: "neutral",
      detail: booking.modifiableUntil
        ? "超過此時間後，租戶更新需轉交其他權責面處理。"
        : "目前沒有發布租戶修改截止時間。",
    },
    {
      id: "cancel-cutoff",
      eyebrow: "tenant policy",
      title: "可取消截止",
      timestamp: displayDateTime(booking.cancelableUntil),
      tone: "neutral",
      detail: booking.cancelableUntil
        ? "超過此時間後，取消行為需依既有政策升級處理。"
        : "目前沒有發布租戶取消截止時間。",
    },
    {
      id: "current-state",
      eyebrow: "dispatch state",
      title: "目前工作流狀態",
      timestamp: displayDateTime(booking.updatedAt),
      tone: status.workflowTone,
      detail: `目前訂單狀態為 ${booking.orderStatus}。`,
      meta: `booking status: ${booking.status}`,
    },
  ];
}

function findRelatedInvoices(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices.filter((invoice) =>
    invoice.lines.some((line: { orderId: string }) => line.orderId === orderId),
  );
}

function toInvoicePeriod(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "—";
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const client = getTenantClient();
  const [bookingResult, invoicesResult] = await Promise.allSettled([
    client.getTenantBooking(bookingId) as Promise<BookingRecord>,
    client.listInvoices(),
  ]);

  if (bookingResult.status === "rejected") {
    notFound();
  }

  const booking = bookingResult.value;
  const source = getBookingSourceVisibility(booking);
  const status = describeOrderStatus(booking.orderStatus);
  const workflowItems = buildWorkflowItems(booking);
  const timelineItems = buildTimelineItems(booking);
  const relatedInvoices =
    invoicesResult.status === "fulfilled"
      ? findRelatedInvoices(invoicesResult.value, booking.orderId)
      : [];
  const invoiceWarning =
    invoicesResult.status === "rejected"
      ? invoicesResult.reason instanceof Error
        ? invoicesResult.reason.message
        : "Invoice context unavailable."
      : null;
  const paymentSummary =
    relatedInvoices.length > 0
      ? "企業帳務 / 已關聯 invoice"
      : "企業帳務 / 待出帳";
  const assignedDriverProjection = ASSIGNED_ORDER_STATUSES.has(
    booking.orderStatus,
  );
  const invoiceRows: InvoiceRow[] = relatedInvoices.map((invoice) => ({
    ...invoice,
    orderLineCount: invoice.lines.filter(
      (line: { orderId: string }) => line.orderId === booking.orderId,
    ).length,
  }));

  const invoiceColumns: CanvasTableColumn<InvoiceRow>[] = [
    {
      h: "INVOICE",
      w: 210,
      mono: true,
      r: (row) => (
        <span style={invoicePrimaryStyle}>
          {row.invoiceId}
          <span style={invoiceMetaStyle}>
            {row.orderLineCount} line(s) for this order
          </span>
        </span>
      ),
    },
    {
      h: "PERIOD",
      w: 110,
      mono: true,
      r: (row) => toInvoicePeriod(row.periodStart),
    },
    {
      h: "AMOUNT",
      w: 150,
      mono: true,
      align: "right",
      r: (row) => displayMoney(row.amount),
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={invoiceStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={`${booking.bookingId} / ${booking.businessDispatchSubtype}`}
        subtitle={`${booking.pickup.address} -> ${booking.dropoff.address} | ${displayDateTime(
          booking.reservationWindowStart,
        )} - ${displayDateTime(booking.reservationWindowEnd)}`}
        actions={
          <>
            <Link href="/bookings" style={linkStyle}>
              <CanvasBtn theme={th} icon="arrow" size="sm">
                返回叫車
              </CanvasBtn>
            </Link>
            {relatedInvoices.length > 0 ? (
              <Link href="/invoices" style={linkStyle}>
                <CanvasBtn theme={th} icon="billing" size="sm">
                  查看對帳單
                </CanvasBtn>
              </Link>
            ) : null}
            <Link href="/bookings/new" style={linkStyle}>
              <CanvasBtn theme={th} icon="plus" variant="primary" size="sm">
                新增預約
              </CanvasBtn>
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={summaryStackStyle}>
          <div style={pillRowStyle}>
            <CanvasPill theme={th} tone={status.pillTone} dot>
              {booking.orderStatus}
            </CanvasPill>
            <CanvasPill theme={th} tone="neutral">
              booking {booking.status}
            </CanvasPill>
            <CanvasPill theme={th} tone={sourcePillTone(booking)}>
              {source.badge}
            </CanvasPill>
            <CanvasPill theme={th} tone="neutral">
              approval {booking.approvalState}
            </CanvasPill>
          </div>
          <div style={metaCopyStyle}>
            Order {booking.orderId} | 建立 {displayDateTime(booking.createdAt)}{" "}
            | 更新 {displayDateTime(booking.updatedAt)}
          </div>
        </div>

        {source.domain !== "owned" ? (
          <CanvasBanner
            theme={th}
            tone={source.domain === "forwarded_authority" ? "warn" : "info"}
            icon="warn"
            title="租戶可見性邊界"
            body={
              <div style={bannerBodyStyle}>
                <span>{source.detail}</span>
                <span>{source.statusBoundary}</span>
                <span>{source.escalationHint}</span>
              </div>
            }
          />
        ) : null}

        <div style={mainGridStyle}>
          <div style={laneStackStyle}>
            <CanvasCard
              theme={th}
              title="行程資訊"
              subtitle="booking / order / passenger / route / payment"
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { k: "BOOKING", v: booking.bookingId, mono: true },
                  { k: "ORDER", v: booking.orderId, mono: true },
                  {
                    k: "PASSENGER",
                    v: `${booking.passenger.name} / ${displayText(
                      booking.passenger.phone,
                    )}`,
                  },
                  {
                    k: "COST CENTER",
                    v: displayText(booking.costCenter),
                    mono: true,
                  },
                  { k: "PICKUP", v: booking.pickup.address },
                  { k: "DROP", v: booking.dropoff.address },
                  {
                    k: "WINDOW",
                    v: `${displayDateTime(booking.reservationWindowStart)} - ${displayDateTime(
                      booking.reservationWindowEnd,
                    )}`,
                    mono: true,
                  },
                  {
                    k: "SERVICE",
                    v: booking.businessDispatchSubtype,
                    mono: true,
                  },
                  {
                    k: "QUOTED FARE",
                    v: displayMoney(booking.quotedFare),
                    mono: true,
                  },
                  { k: "PAYMENT", v: paymentSummary },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="行程時間軸"
              subtitle="建立 -> 佇列 -> 派遣 -> 指派 -> 行程 -> 完成"
            >
              <Stepper
                items={workflowItems}
                density="compact"
                orientation="horizontal"
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="活動"
              subtitle="tenant-visible booking checkpoints"
            >
              <Timeline items={timelineItems} density="compact" />
            </CanvasCard>
          </div>

          <div style={laneStackStyle}>
            <CanvasCard
              theme={th}
              title="駕駛"
              subtitle="tenant-safe published view"
            >
              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "DRIVER",
                    v: assignedDriverProjection
                      ? "未發布 / tenant read model 尚未投影"
                      : "尚未指派",
                  },
                  {
                    k: "VEHICLE",
                    v: assignedDriverProjection ? "未發布" : "待派遣",
                  },
                  {
                    k: "DISPATCH",
                    v: `${source.badge} / ${booking.orderStatus}`,
                  },
                  {
                    k: "CONTACT",
                    v: "已遮罩 / 透過平台轉接",
                  },
                ]}
              />
              <div style={mutedNoteStyle}>
                司機身份、車牌、即時 ETA 與候選供給狀態目前不會投影到 tenant
                surface。
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="計費"
              subtitle="quoted fare / invoice"
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    k: "方案",
                    v: displayText(booking.quotedFareRuleVersion, "未發布"),
                    mono: true,
                  },
                  {
                    k: "核價來源",
                    v: displayText(booking.quotedFareSource, "未發布"),
                    mono: true,
                  },
                  {
                    k: "覆核",
                    v: describeManualOverride(booking),
                  },
                  {
                    k: "總額",
                    v: displayMoney(booking.quotedFare),
                    mono: true,
                  },
                  {
                    k: "對帳單",
                    v:
                      relatedInvoices.length > 0
                        ? relatedInvoices
                            .map((invoice) => invoice.invoiceId)
                            .join(", ")
                        : "待出帳",
                    mono: relatedInvoices.length > 0,
                  },
                  {
                    k: "權責",
                    v: source.financeAuthority,
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="關聯對帳單"
              subtitle="invoice rows already published for this order"
              padding={0}
            >
              {invoiceWarning ? (
                <div style={{ padding: 14 }}>
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title="對帳單內容暫時無法完整載入"
                    body={invoiceWarning}
                  />
                </div>
              ) : null}

              {invoiceRows.length > 0 ? (
                <CanvasTable<InvoiceRow>
                  theme={th}
                  columns={invoiceColumns}
                  rows={invoiceRows}
                />
              ) : (
                <div style={emptyStateStyle}>
                  目前沒有與此 order 關聯的 tenant invoice line。
                </div>
              )}
            </CanvasCard>
          </div>
        </div>

        <CanvasCard
          theme={th}
          title="補充資訊"
          subtitle="cost center / flight / notes"
        >
          <div style={fieldGridStyle}>
            <CanvasField theme={th} label="成本中心">
              <CanvasInput
                theme={th}
                value={displayText(booking.costCenter)}
                mono
              />
            </CanvasField>
            <CanvasField theme={th} label="偏好車型">
              <CanvasInput
                theme={th}
                value={displayText(booking.vehiclePreference)}
              />
            </CanvasField>
            <CanvasField theme={th} label="benefit reference">
              <CanvasInput
                theme={th}
                value={displayText(booking.benefitReference)}
                mono
              />
            </CanvasField>
            <CanvasField theme={th} label="方向">
              <CanvasInput theme={th} value={displayText(booking.direction)} />
            </CanvasField>
            <CanvasField theme={th} label="航班">
              <CanvasInput
                theme={th}
                value={displayText(booking.flightNo)}
                mono
              />
            </CanvasField>
            <CanvasField theme={th} label="航廈">
              <CanvasInput theme={th} value={displayText(booking.terminal)} />
            </CanvasField>
            <CanvasField theme={th} label="行李">
              <CanvasInput
                theme={th}
                value={
                  booking.luggageCount == null
                    ? "未提供"
                    : `${booking.luggageCount} bag(s)`
                }
              />
            </CanvasField>
            <CanvasField theme={th} label="申請人">
              <CanvasInput
                theme={th}
                value={
                  booking.bookedBy
                    ? `${booking.bookedBy.name} / ${booking.bookedBy.email}`
                    : "未提供"
                }
              />
            </CanvasField>
            <CanvasField theme={th} label="現場聯絡">
              <CanvasInput
                theme={th}
                value={
                  booking.onsiteContact
                    ? `${booking.onsiteContact.name} / ${booking.onsiteContact.phone}`
                    : "未提供"
                }
              />
            </CanvasField>
            <CanvasField theme={th} label="審批請求">
              <CanvasInput
                theme={th}
                value={
                  booking.approvalRequestIds.length > 0
                    ? booking.approvalRequestIds.join(", ")
                    : "無"
                }
                mono
              />
            </CanvasField>
            <CanvasField theme={th} label="備註">
              <div style={readOnlyBlockStyle}>{displayText(booking.notes)}</div>
            </CanvasField>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="租戶操作"
          subtitle="僅保留 tenant-safe commands"
        >
          <BookingCommandPanel booking={booking} />
        </CanvasCard>
      </div>
    </div>
  );
}
