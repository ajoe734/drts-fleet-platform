import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  BookingRecord,
  OwnedOrderStatus,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  buildCanvasTheme,
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
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const topRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const actionLinkStyle: CSSProperties = {
  color: th.accent,
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(300px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const stepperStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
};

const stepCardStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
  padding: "12px 12px 10px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
};

const timelineStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const timelineItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px minmax(0, 1fr)",
  gap: 10,
  alignItems: "start",
};

const timelineRailStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 6,
};

const tableCellStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const mutedCopyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const sectionGapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

type TimelineRow = {
  id: string;
  label: string;
  at: string | null;
  detail: string;
  tone: "accent" | "info" | "success" | "warn";
};

type InvoiceRow = {
  invoiceId: string;
  period: string;
  amount: string;
  status: string;
};

type LifecycleStep = {
  id: string;
  title: string;
  description: string;
  state: "complete" | "current" | "upcoming" | "warning" | "danger";
};

function buildTimeline(booking: BookingRecord): TimelineRow[] {
  return [
    {
      id: "created",
      label: "Booking created",
      at: booking.createdAt,
      detail: "Tenant intake accepted into the booking ledger.",
      tone: "accent",
    },
    {
      id: "window-start",
      label: "Reservation window opens",
      at: booking.reservationWindowStart,
      detail: "Primary service commitment window begins.",
      tone: "info",
    },
    {
      id: "window-end",
      label: "Reservation window closes",
      at: booking.reservationWindowEnd,
      detail: "Requested pickup or dropoff commitment window ends.",
      tone: "info",
    },
    {
      id: "status",
      label: "Current workflow state",
      at: booking.updatedAt,
      detail: `Order status is ${booking.orderStatus}.`,
      tone: booking.orderStatus === "cancelled" ? "warn" : "success",
    },
    {
      id: "modifiable-until",
      label: "Tenant modification cutoff",
      at: booking.modifiableUntil,
      detail: booking.modifiableUntil
        ? "Further tenant edits follow this cutoff."
        : "No explicit tenant edit cutoff was published.",
      tone: "warn",
    },
    {
      id: "cancelable-until",
      label: "Tenant cancellation cutoff",
      at: booking.cancelableUntil,
      detail: booking.cancelableUntil
        ? "Further tenant cancellation follows this cutoff."
        : "No explicit tenant cancellation cutoff was published.",
      tone: "warn",
    },
  ];
}

function findRelatedInvoices(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices
    .filter((invoice) =>
      invoice.lines.some(
        (line: { orderId: string }) => line.orderId === orderId,
      ),
    )
    .sort(
      (left, right) =>
        new Date(right.periodEnd).getTime() -
        new Date(left.periodEnd).getTime(),
    );
}

function describeManualFareOverride(booking: BookingRecord) {
  if (!booking.manualFareOverride) {
    return "None";
  }

  return `${booking.manualFareOverride.actorType} · ${booking.manualFareOverride.reason}`;
}

function getSourcePillTone(booking: BookingRecord) {
  return booking.issuerAuthorizationRef
    ? "warn"
    : booking.partnerEntrySlug || booking.partnerId
      ? "info"
      : "accent";
}

function getOrderPillTone(status: OwnedOrderStatus) {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  if (
    status === "dispatch_failed" ||
    status === "dispatch_timeout" ||
    status === "no_supply" ||
    status === "redispatch_required" ||
    status === "exception_hold"
  ) {
    return "warn";
  }
  if (
    status === "assigned" ||
    status === "driver_accepted" ||
    status === "enroute_pickup" ||
    status === "arrived_pickup" ||
    status === "on_trip" ||
    status === "proof_pending"
  ) {
    return "success";
  }
  return "info";
}

function getLifecycleIndex(status: OwnedOrderStatus) {
  if (status === "created") return 0;
  if (
    status === "recording_pending" ||
    status === "ready_for_dispatch" ||
    status === "delayed_queue" ||
    status === "exception_hold"
  ) {
    return 1;
  }
  if (
    status === "preassigned" ||
    status === "redispatch_required" ||
    status === "dispatch_failed" ||
    status === "dispatch_timeout" ||
    status === "no_supply"
  ) {
    return 2;
  }
  if (
    status === "assigned" ||
    status === "driver_accepted" ||
    status === "enroute_pickup" ||
    status === "arrived_pickup"
  ) {
    return 3;
  }
  if (status === "on_trip" || status === "proof_pending") return 4;
  if (status === "completed" || status === "cancelled") return 5;
  return 0;
}

function buildLifecycleSteps(status: OwnedOrderStatus): LifecycleStep[] {
  const currentIndex = getLifecycleIndex(status);
  const isCancelled = status === "cancelled";
  const isWarningState =
    status === "redispatch_required" ||
    status === "dispatch_failed" ||
    status === "dispatch_timeout" ||
    status === "no_supply" ||
    status === "exception_hold";

  return [
    {
      id: "created",
      title: "Created",
      description: "Tenant intake accepted into the booking ledger.",
      state: currentIndex > 0 ? "complete" : "current",
    },
    {
      id: "queued",
      title: "Queued",
      description: "Policy and dispatch entry checks are in progress.",
      state:
        currentIndex > 1
          ? "complete"
          : currentIndex === 1
            ? "current"
            : "upcoming",
    },
    {
      id: "broadcast",
      title: "Broadcast",
      description: "Dispatch is matching or recovering a supply lane.",
      state:
        currentIndex > 2
          ? "complete"
          : currentIndex === 2
            ? isWarningState
              ? "warning"
              : "current"
            : "upcoming",
    },
    {
      id: "assigned",
      title: "Assigned",
      description: "A fulfillment path is attached to the booking.",
      state:
        currentIndex > 3
          ? "complete"
          : currentIndex === 3
            ? "current"
            : "upcoming",
    },
    {
      id: "on-trip",
      title: "On trip",
      description: "The ride has moved into execution or proof collection.",
      state:
        currentIndex > 4
          ? "complete"
          : currentIndex === 4
            ? "current"
            : "upcoming",
    },
    {
      id: "completed",
      title: isCancelled ? "Cancelled" : "Completed",
      description: isCancelled
        ? "Execution was closed by cancellation."
        : "Execution is closed and finance artifacts can follow.",
      state:
        currentIndex === 5 ? (isCancelled ? "danger" : "current") : "upcoming",
    },
  ];
}

function getStepTone(state: LifecycleStep["state"]) {
  switch (state) {
    case "complete":
      return {
        border: th.successBorder,
        background: th.successBg,
        text: th.success,
        badge: "done",
      };
    case "current":
      return {
        border: th.accentBorder,
        background: th.accentBg,
        text: th.accent,
        badge: "current",
      };
    case "warning":
      return {
        border: th.warnBorder,
        background: th.warnBg,
        text: th.warn,
        badge: "recover",
      };
    case "danger":
      return {
        border: th.dangerBorder,
        background: th.dangerBg,
        text: th.danger,
        badge: "closed",
      };
    case "upcoming":
    default:
      return {
        border: th.border,
        background: th.surfaceLo,
        text: th.textMuted,
        badge: "next",
      };
  }
}

function getTimelineTone(tone: TimelineRow["tone"]) {
  switch (tone) {
    case "success":
      return {
        dot: th.success,
        rail: th.successBorder,
      };
    case "warn":
      return {
        dot: th.warn,
        rail: th.warnBorder,
      };
    case "info":
      return {
        dot: th.info,
        rail: th.infoBorder,
      };
    case "accent":
    default:
      return {
        dot: th.accent,
        rail: th.accentBorder,
      };
  }
}

function buildInvoiceRows(invoices: TenantInvoiceRecord[]): InvoiceRow[] {
  return invoices.map((invoice) => ({
    invoiceId: invoice.invoiceId,
    period: `${formatDateTime(invoice.periodStart)} -> ${formatDateTime(
      invoice.periodEnd,
    )}`,
    amount: formatMoney(invoice.amount),
    status: invoice.status,
  }));
}

function buildInvoiceColumns(): CanvasTableColumn<InvoiceRow>[] {
  return [
    {
      h: "Invoice",
      k: "invoiceId",
      mono: true,
    },
    {
      h: "Period",
      k: "period",
    },
    {
      h: "Amount",
      k: "amount",
    },
    {
      h: "Status",
      r: (row: InvoiceRow) => (
        <CanvasPill
          theme={th}
          tone={row.status === "paid" ? "success" : "info"}
          dot
        >
          {row.status}
        </CanvasPill>
      ),
    },
  ];
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

  const booking =
    bookingResult.status === "fulfilled" ? bookingResult.value : notFound();
  const source = getBookingSourceVisibility(booking);
  const timeline = buildTimeline(booking);
  const lifecycleSteps = buildLifecycleSteps(booking.orderStatus);
  const relatedInvoices =
    invoicesResult.status === "fulfilled"
      ? findRelatedInvoices(invoicesResult.value, booking.orderId)
      : [];
  const invoiceRows = buildInvoiceRows(relatedInvoices);
  const invoiceWarning =
    invoicesResult.status === "rejected"
      ? invoicesResult.reason instanceof Error
        ? invoicesResult.reason.message
        : "Invoice context unavailable."
      : null;

  return (
    <>
      <CanvasPageHeader
        theme={th}
        title={`Booking ${booking.bookingId}`}
        subtitle={`${booking.businessDispatchSubtype} · ${booking.pickup.address} -> ${booking.dropoff.address}`}
      />

      <div style={pageBodyStyle}>
        <div style={topRowStyle}>
          <div style={chipRowStyle}>
            <CanvasPill
              theme={th}
              tone={getOrderPillTone(booking.orderStatus)}
              dot
            >
              {booking.orderStatus}
            </CanvasPill>
            <CanvasPill theme={th} tone="neutral">
              Booking {booking.status}
            </CanvasPill>
            <CanvasPill theme={th} tone={getSourcePillTone(booking)}>
              {source.badge}
            </CanvasPill>
          </div>

          <div style={actionRowStyle}>
            <Link href="/bookings" style={actionLinkStyle}>
              Back to bookings
            </Link>
            <Link href="/bookings/new" style={actionLinkStyle}>
              Duplicate as new
            </Link>
          </div>
        </div>

        {source.domain === "forwarded_authority" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            title="Forwarded-authority boundary"
            body={`${source.statusBoundary} ${source.escalationHint}`}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Order state"
            value={booking.orderStatus}
            sub={`Updated ${formatDateTime(booking.updatedAt)}`}
          />
          <CanvasKPI
            theme={th}
            label="Service"
            value={booking.businessDispatchSubtype}
            sub={`Booking ${booking.bookingType}`}
          />
          <CanvasKPI
            theme={th}
            label="Window"
            value={formatDateTime(booking.reservationWindowStart)}
            sub={formatDateTime(booking.reservationWindowEnd)}
          />
          <CanvasKPI
            theme={th}
            label="Quoted fare"
            value={formatMoney(booking.quotedFare)}
            sub={`${relatedInvoices.length} linked invoice row(s)`}
          />
        </div>

        <div style={layoutStyle}>
          <div style={stackStyle}>
            <CanvasCard
              theme={th}
              title="Trip information"
              subtitle="TN_BookingDetail primary detail list for booking, rider, route, and commercial context."
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  { label: "Booking", value: booking.bookingId, mono: true },
                  { label: "Order", value: booking.orderId, mono: true },
                  {
                    label: "Passenger",
                    value: booking.passenger.name,
                  },
                  {
                    label: "Phone",
                    value: booking.passenger.phone || "Not provided",
                  },
                  { label: "Pickup", value: booking.pickup.address },
                  { label: "Dropoff", value: booking.dropoff.address },
                  {
                    label: "Window start",
                    value: formatDateTime(booking.reservationWindowStart),
                  },
                  {
                    label: "Window end",
                    value: formatDateTime(booking.reservationWindowEnd),
                  },
                  {
                    label: "Cost center",
                    value: booking.costCenter ?? "Not provided",
                  },
                  {
                    label: "Approval state",
                    value: booking.approvalState,
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Lifecycle"
              subtitle="Stepper mirrors the published booking lifecycle without exposing dispatch-only internals."
            >
              <div style={stepperStyle}>
                {lifecycleSteps.map((step) => {
                  const tone = getStepTone(step.state);
                  return (
                    <div
                      key={step.id}
                      style={{
                        ...stepCardStyle,
                        borderColor: tone.border,
                        background: tone.background,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <strong style={{ fontSize: 12.5, color: th.text }}>
                          {step.title}
                        </strong>
                        <CanvasPill theme={th} tone="neutral">
                          {tone.badge}
                        </CanvasPill>
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: tone.text,
                          fontWeight: 600,
                          marginBottom: 6,
                        }}
                      >
                        {step.state === "danger"
                          ? "Terminal state"
                          : "Lifecycle step"}
                      </div>
                      <p style={{ ...mutedCopyStyle, margin: 0 }}>
                        {step.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Published activity"
              subtitle="Timeline stays on booking checkpoints and tenant-visible cutoffs."
            >
              <ol style={timelineStyle}>
                {timeline.map((item, index) => {
                  const tone = getTimelineTone(item.tone);
                  return (
                    <li key={item.id} style={timelineItemStyle}>
                      <div style={timelineRailStyle}>
                        <span
                          aria-hidden
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            background: tone.dot,
                            boxShadow: `0 0 0 4px ${tone.rail}`,
                            marginTop: 2,
                          }}
                        />
                        {index < timeline.length - 1 ? (
                          <span
                            aria-hidden
                            style={{
                              width: 2,
                              minHeight: 38,
                              background: tone.rail,
                              borderRadius: 99,
                            }}
                          />
                        ) : null}
                      </div>
                      <div style={sectionGapStyle}>
                        <div style={tableCellStackStyle}>
                          <strong style={{ fontSize: 12.5, color: th.text }}>
                            {item.label}
                          </strong>
                          <span style={mutedCopyStyle}>
                            {item.at
                              ? formatDateTime(item.at)
                              : "Not published"}
                          </span>
                        </div>
                        <p style={{ ...mutedCopyStyle, margin: 0 }}>
                          {item.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Business context"
              subtitle="Optional reservation attributes remain readable here without dispatch-only controls."
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    label: "Vehicle preference",
                    value: booking.vehiclePreference ?? "Not provided",
                  },
                  {
                    label: "Benefit reference",
                    value: booking.benefitReference ?? "Not provided",
                  },
                  {
                    label: "Direction",
                    value: booking.direction ?? "Not provided",
                  },
                  {
                    label: "Recurrence",
                    value: booking.recurrenceRule ?? "Single trip",
                  },
                  {
                    label: "Flight",
                    value: booking.flightNo ?? "Not provided",
                  },
                  {
                    label: "Terminal",
                    value: booking.terminal ?? "Not provided",
                  },
                  {
                    label: "Luggage",
                    value:
                      booking.luggageCount == null
                        ? "Not provided"
                        : `${booking.luggageCount} bag(s)`,
                  },
                  {
                    label: "Booked by",
                    value: booking.bookedBy
                      ? `${booking.bookedBy.name} · ${booking.bookedBy.email}`
                      : "Not provided",
                  },
                  {
                    label: "Onsite contact",
                    value: booking.onsiteContact
                      ? `${booking.onsiteContact.name} · ${booking.onsiteContact.phone}`
                      : "Not provided",
                  },
                  {
                    label: "Notes",
                    value: booking.notes ?? "Not provided",
                  },
                ]}
              />
            </CanvasCard>
          </div>

          <div style={stackStyle}>
            <CanvasCard
              theme={th}
              title="Driver snapshot"
              subtitle="The artboard expects a driver detail list; tenant contracts only publish an authority-safe fulfillment snapshot."
            >
              <div style={sectionGapStyle}>
                <CanvasDL
                  theme={th}
                  cols={2}
                  items={[
                    { label: "Driver", value: "Not published" },
                    { label: "Contact", value: "Not published" },
                    { label: "Vehicle", value: "Not published" },
                    { label: "Source", value: source.badge },
                    { label: "Fulfillment path", value: source.summary },
                    {
                      label: "Partner program",
                      value: booking.partnerProgramId ?? "Not applicable",
                    },
                    {
                      label: "Partner entry",
                      value: booking.partnerEntrySlug ?? "Not applicable",
                    },
                    {
                      label: "Eligibility",
                      value:
                        booking.eligibilityVerificationId ?? "Not applicable",
                    },
                    {
                      label: "Issuer auth",
                      value: booking.issuerAuthorizationRef ?? "Not applicable",
                    },
                    {
                      label: "Compliance gates",
                      value: String(booking.complianceGates?.length ?? 0),
                    },
                  ]}
                />

                <CanvasBanner
                  theme={th}
                  tone={source.domain === "owned" ? "info" : "warn"}
                  title="Authority-safe fulfillment only"
                  body={`${source.detail} ${source.escalationHint}`}
                />
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Billing snapshot"
              subtitle="Fare detail list and invoice linkage stay together on the right rail."
            >
              <div style={sectionGapStyle}>
                <CanvasDL
                  theme={th}
                  cols={2}
                  items={[
                    {
                      label: "Quoted fare",
                      value: formatMoney(booking.quotedFare),
                    },
                    {
                      label: "Fare source",
                      value: booking.quotedFareSource ?? "Not published",
                    },
                    {
                      label: "Pricing version",
                      value: booking.quotedFareRuleVersion ?? "Not published",
                    },
                    {
                      label: "Manual override",
                      value: describeManualFareOverride(booking),
                    },
                    {
                      label: "Finance authority",
                      value: source.financeAuthority,
                    },
                    {
                      label: "Invoice rows",
                      value: String(relatedInvoices.length),
                    },
                  ]}
                />

                {invoiceWarning ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    title="Invoice context unavailable"
                    body={invoiceWarning}
                  />
                ) : null}

                {invoiceRows.length > 0 ? (
                  <CanvasCard theme={th} padding={0} title="Related invoices">
                    <CanvasTable
                      theme={th}
                      columns={buildInvoiceColumns()}
                      rows={invoiceRows}
                    />
                  </CanvasCard>
                ) : (
                  <CanvasBanner
                    theme={th}
                    tone="info"
                    title="No linked invoice rows"
                    body="No tenant invoice row is currently linked to this order."
                  />
                )}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Tenant command lane"
              subtitle="Only supported tenant update and cancel commands remain available on this detail route."
            >
              <BookingCommandPanel booking={booking} />
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
