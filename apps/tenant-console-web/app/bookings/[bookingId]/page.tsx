import Link from "next/link";
import { notFound } from "next/navigation";
import type { BookingRecord, TenantInvoiceRecord } from "@drts/contracts";
import {
  CalloutBanner,
  DataViewCard,
  DetailMetadataGrid,
  PageHeader,
  StatusChip,
  Stepper,
  Timeline,
  WorkflowSplitLayout,
  managementPageStackStyle,
} from "@drts/ui-web";
import { BookingCommandPanel } from "@/components/booking-command-panel";
import {
  buildBookingActivityRecords,
  buildBookingLifecycleSteps,
  formatOrderStatusLabel,
  getOrderStatusTone,
  getSourceTone,
} from "@/lib/booking-surface";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import { getBookingSourceVisibility } from "@/lib/source-domain";

export const dynamic = "force-dynamic";

const pageStackStyle = {
  ...managementPageStackStyle(),
  maxWidth: "1180px",
  margin: "0 auto",
};

function actionLinkStyle(primary = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "40px",
    padding: "0 16px",
    borderRadius: "999px",
    border: primary ? "1px solid transparent" : "1px solid #99f6e4",
    background: primary ? "#0f766e" : "#f0fdfa",
    color: primary ? "#ffffff" : "#115e59",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
  };
}

function findRelatedInvoices(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices
    .filter((invoice) => invoice.lines.some((line) => line.orderId === orderId))
    .sort((left, right) => {
      return (
        new Date(right.periodEnd).getTime() - new Date(left.periodEnd).getTime()
      );
    });
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
  const lifecycleItems = buildBookingLifecycleSteps(booking.orderStatus);
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
  const activityItems = buildBookingActivityRecords(
    booking,
    source,
    relatedInvoices,
  ).map((item) => ({
    id: item.id,
    title: item.title,
    detail: item.detail,
    timestamp: item.timestamp
      ? formatDateTime(item.timestamp)
      : "Not published",
    ...(item.tone ? { tone: item.tone } : {}),
    ...(item.meta ? { meta: item.meta.join(" · ") } : {}),
  }));

  return (
    <div style={pageStackStyle}>
      <PageHeader
        eyebrow="Booking detail"
        title={booking.bookingId}
        subtitle={`${booking.businessDispatchSubtype} · ${booking.pickup.address} -> ${booking.dropoff.address}`}
        meta={[
          {
            label: "Order state",
            value: (
              <StatusChip
                label={formatOrderStatusLabel(booking.orderStatus)}
                tone={getOrderStatusTone(booking.orderStatus)}
              />
            ),
            tone: "tenant",
          },
          {
            label: "Booking state",
            value: <StatusChip label={booking.status} tone="neutral" />,
          },
          {
            label: "Source",
            value: (
              <StatusChip label={source.badge} tone={getSourceTone(source)} />
            ),
          },
        ]}
        actions={
          <>
            <Link href="/bookings" style={actionLinkStyle()}>
              Back to list
            </Link>
            <Link href="/bookings/new" style={actionLinkStyle()}>
              Duplicate as new
            </Link>
            <Link href="#command-lane" style={actionLinkStyle(true)}>
              Command lane
            </Link>
          </>
        }
      />

      <WorkflowSplitLayout
        density="comfortable"
        main={
          <>
            <DataViewCard
              title="Trip information"
              subtitle="The primary detail card mirrors TN_BookingDetail with booking, route, passenger, and fare context grouped together."
              tone="tenant"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="190px"
                items={[
                  { id: "booking", label: "Booking", value: booking.bookingId },
                  { id: "order", label: "Order", value: booking.orderId },
                  {
                    id: "passenger",
                    label: "Passenger",
                    value: `${booking.passenger.name} · ${booking.passenger.phone}`,
                  },
                  {
                    id: "cost-center",
                    label: "Cost center",
                    value: booking.costCenter ?? "Not provided",
                  },
                  {
                    id: "pickup",
                    label: "Pickup",
                    value: booking.pickup.address,
                  },
                  {
                    id: "dropoff",
                    label: "Drop",
                    value: booking.dropoff.address,
                  },
                  {
                    id: "window",
                    label: "Window",
                    value: `${formatDateTime(booking.reservationWindowStart)} -> ${formatDateTime(booking.reservationWindowEnd)}`,
                    columnSpan: 2,
                  },
                  {
                    id: "service",
                    label: "Service",
                    value: booking.businessDispatchSubtype,
                  },
                  {
                    id: "fare",
                    label: "Quoted fare",
                    value: formatMoney(booking.quotedFare),
                  },
                  {
                    id: "payment",
                    label: "Finance authority",
                    value: source.financeAuthority,
                    columnSpan: 2,
                  },
                ]}
              />
            </DataViewCard>

            <DataViewCard
              title="Lifecycle"
              subtitle="Step states are derived from the published order status without exposing ops-only dispatch internals."
              tone="tenant"
            >
              <Stepper
                density="compact"
                items={lifecycleItems.map((item) => ({
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  state: item.state,
                  stateLabel: item.stateLabel,
                  ...(item.tone ? { tone: item.tone } : {}),
                }))}
                orientation="horizontal"
              />
            </DataViewCard>

            <DataViewCard
              title="Published activity"
              subtitle="The activity lane is derived from published checkpoints and invoice linkage, not from hidden dispatch event streams."
              tone="tenant"
            >
              <Timeline density="compact" items={activityItems} />
            </DataViewCard>

            <DataViewCard
              title="Business context"
              subtitle="Optional reservation attributes stay visible without leaking dispatch-only controls."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="190px"
                items={[
                  {
                    id: "vehicle-preference",
                    label: "Vehicle preference",
                    value: booking.vehiclePreference ?? "Not provided",
                  },
                  {
                    id: "benefit-reference",
                    label: "Benefit reference",
                    value: booking.benefitReference ?? "Not provided",
                  },
                  {
                    id: "direction",
                    label: "Direction",
                    value: booking.direction ?? "Not provided",
                  },
                  {
                    id: "flight",
                    label: "Flight",
                    value: booking.flightNo ?? "Not provided",
                  },
                  {
                    id: "terminal",
                    label: "Terminal",
                    value: booking.terminal ?? "Not provided",
                  },
                  {
                    id: "luggage",
                    label: "Luggage",
                    value:
                      booking.luggageCount == null
                        ? "Not provided"
                        : `${booking.luggageCount} bag(s)`,
                  },
                  {
                    id: "booked-by",
                    label: "Booked by",
                    value: booking.bookedBy
                      ? `${booking.bookedBy.name} · ${booking.bookedBy.email}`
                      : "Not provided",
                    columnSpan: 2,
                  },
                  {
                    id: "onsite-contact",
                    label: "Onsite contact",
                    value: booking.onsiteContact
                      ? `${booking.onsiteContact.name} · ${booking.onsiteContact.phone}`
                      : "Not provided",
                    columnSpan: 2,
                  },
                  {
                    id: "notes",
                    label: "Notes",
                    value: booking.notes ?? "Not provided",
                    columnSpan: 2,
                  },
                ]}
              />
            </DataViewCard>
          </>
        }
        side={
          <>
            <DataViewCard
              title="Published fulfillment snapshot"
              subtitle="This replaces the artboard's driver card because tenant contracts do not publish driver or vehicle identity here."
              tone="tenant"
              density="compact"
              summary="The tenant detail view exposes fulfillment ownership and external-authority posture, but not driver assignment internals."
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="180px"
                items={[
                  { id: "source", label: "Source", value: source.badge },
                  {
                    id: "fulfillment-path",
                    label: "Fulfillment path",
                    value: source.summary,
                  },
                  {
                    id: "partner-program",
                    label: "Partner program",
                    value: booking.partnerProgramId ?? "Not applicable",
                  },
                  {
                    id: "partner-entry",
                    label: "Partner entry",
                    value: booking.partnerEntrySlug ?? "Not applicable",
                  },
                  {
                    id: "eligibility",
                    label: "Eligibility",
                    value:
                      booking.eligibilityVerificationId ?? "Not applicable",
                  },
                  {
                    id: "issuer-auth",
                    label: "Issuer auth",
                    value: booking.issuerAuthorizationRef ?? "Not applicable",
                  },
                  {
                    id: "fare-source",
                    label: "Fare source",
                    value: booking.quotedFareSource ?? "Not published",
                  },
                  {
                    id: "pricing-version",
                    label: "Pricing version",
                    value: booking.quotedFareRuleVersion ?? "Not published",
                  },
                ]}
              />
              <CalloutBanner
                title="Authority boundary"
                description={source.statusBoundary}
                tone={source.domain === "owned" ? "tenant" : "warning"}
                density="compact"
              >
                <div>{source.escalationHint}</div>
              </CalloutBanner>
            </DataViewCard>

            <DataViewCard
              title="Billing snapshot"
              subtitle="Quoted fare, manual override posture, and linked tenant invoices remain visible on the right rail."
              tone="tenant"
              density="compact"
            >
              <DetailMetadataGrid
                dense
                minColumnWidth="180px"
                items={[
                  {
                    id: "quoted-fare",
                    label: "Quoted fare",
                    value: formatMoney(booking.quotedFare),
                  },
                  {
                    id: "fare-source",
                    label: "Fare source",
                    value: booking.quotedFareSource ?? "Not published",
                  },
                  {
                    id: "pricing-version",
                    label: "Pricing version",
                    value: booking.quotedFareRuleVersion ?? "Not published",
                  },
                  {
                    id: "manual-override",
                    label: "Manual override",
                    value: booking.manualFareOverride
                      ? `${booking.manualFareOverride.actorType} · ${booking.manualFareOverride.reason}`
                      : "None",
                    columnSpan: 2,
                  },
                ]}
              />
              {invoiceWarning ? (
                <CalloutBanner
                  title="Invoice context unavailable"
                  description={invoiceWarning}
                  tone="warning"
                  density="compact"
                />
              ) : relatedInvoices.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {relatedInvoices.map((invoice) => (
                    <CalloutBanner
                      key={invoice.invoiceId}
                      title={`${invoice.invoiceId} · ${formatMoney(invoice.amount)}`}
                      description={`${invoice.status} · ${formatDateTime(invoice.periodStart)} -> ${formatDateTime(invoice.periodEnd)}`}
                      tone="success"
                      density="compact"
                    />
                  ))}
                </div>
              ) : (
                <CalloutBanner
                  title="No linked invoice row"
                  description="This order is not yet attached to a visible tenant invoice artifact in the current snapshot."
                  tone="info"
                  density="compact"
                />
              )}
            </DataViewCard>
          </>
        }
      />

      <section id="command-lane">
        <DataViewCard
          title="Tenant command lane"
          subtitle="Only supported tenant update and cancel commands remain visible on the detail route."
          tone="tenant"
        >
          <BookingCommandPanel booking={booking} />
        </DataViewCard>
      </section>
    </div>
  );
}
