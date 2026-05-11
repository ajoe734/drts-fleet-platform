import Link from "next/link";
import type {
  BookingRecord,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  TenantIntegrationGovernancePackage,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  WorkflowSplitLayout,
  managementPageStackStyle,
} from "@drts/ui-web";
import {
  countBookingsThisMonth,
  countCompletedToday,
  formatOrderStatusLabel,
  getOrderStatusTone,
  getSourceTone,
  isActiveOrderStatus,
  latestInvoice,
  needsAttention,
} from "@/lib/booking-surface";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime, formatMoney } from "@/lib/formatters";
import { getBookingSourceVisibility } from "@/lib/source-domain";

export const dynamic = "force-dynamic";

type DashboardData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
};

const pageStackStyle = {
  ...managementPageStackStyle(),
  maxWidth: "1180px",
  margin: "0 auto",
};

const tableStyle = {
  width: "100%",
  minWidth: "680px",
  borderCollapse: "collapse" as const,
  fontSize: "13px",
};

const tableHeaderStyle = {
  padding: "10px 12px",
  textAlign: "left" as const,
  fontSize: "11.5px",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  borderBottom: "1px solid #dbe5ef",
  background: "#f0fdfa",
  whiteSpace: "nowrap" as const,
};

const tableCellStyle = {
  padding: "11px 12px",
  verticalAlign: "top" as const,
  borderBottom: "1px solid #eef2f7",
};

const compactGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
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

function notificationTone(channel: NotificationRecord["channel"]) {
  switch (channel) {
    case "tenant_sla":
      return "warning" as const;
    case "driver_task":
      return "info" as const;
    case "ops_notice":
    default:
      return "tenant" as const;
  }
}

async function loadDashboardData(): Promise<DashboardData> {
  const client = getTenantClient();
  const [
    identityResult,
    flagsResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    governanceResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({ tenantId: "tenant-demo-001" }),
    client.listTenantBookings(),
    client.listInvoices(),
    client.listTenantNotificationFeed(),
    client.getTenantIntegrationGovernancePackage(),
  ]);

  const errors: string[] = [];
  const collectError = (
    label: string,
    result: PromiseSettledResult<unknown>,
  ) => {
    if (result.status === "rejected") {
      errors.push(
        `${label}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
      );
    }
  };

  collectError("Identity", identityResult);
  collectError("Feature flags", flagsResult);
  collectError("Bookings", bookingsResult);
  collectError("Invoices", invoicesResult);
  collectError("Notifications", notificationsResult);
  collectError("Integration governance", governanceResult);

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    featureFlags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    bookings: bookingsResult.status === "fulfilled" ? bookingsResult.value : [],
    invoices: invoicesResult.status === "fulfilled" ? invoicesResult.value : [],
    notifications:
      notificationsResult.status === "fulfilled"
        ? notificationsResult.value
        : [],
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    errors,
  };
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const activeBookings = data.bookings
    .filter((booking) => isActiveOrderStatus(booking.orderStatus))
    .sort((left, right) => {
      return (
        new Date(left.reservationWindowStart).getTime() -
        new Date(right.reservationWindowStart).getTime()
      );
    });
  const attentionBookings = activeBookings.filter((booking) =>
    needsAttention(booking.orderStatus),
  );
  const forwardedActiveCount = activeBookings.filter((booking) => {
    return getBookingSourceVisibility(booking).domain !== "owned";
  }).length;
  const completedToday = countCompletedToday(data.bookings);
  const monthlyBookings = countBookingsThisMonth(data.bookings);
  const currentInvoice = latestInvoice(data.invoices);
  const enabledFlags =
    data.featureFlags?.flags.filter((flag) => flag.enabled) ?? [];
  const recentNotifications = data.notifications.slice(0, 3);
  const checklist = data.governance?.onboardingChecklist.slice(0, 4) ?? [];

  return (
    <div style={pageStackStyle}>
      <PageHeader
        eyebrow="Tenant home"
        title="Home"
        subtitle="Daily booking oversight, finance posture, and tenant operating reminders in the TN_Home layout."
        meta={[
          {
            label: "Tenant",
            value: data.identity?.tenantId ?? "Unavailable",
            tone: "tenant",
          },
          {
            label: "Realm",
            value: data.identity?.realm ?? "Unavailable",
          },
          {
            label: "Auth mode",
            value: data.identity?.authMode ?? "Unavailable",
          },
        ]}
        actions={
          <>
            <Link href="/settings" style={actionLinkStyle()}>
              Help & settings
            </Link>
            <Link href="/bookings/new" style={actionLinkStyle(true)}>
              Create booking
            </Link>
          </>
        }
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label="In progress"
          value={formatCount(activeBookings.length)}
          detail={
            attentionBookings.length > 0
              ? `${formatCount(attentionBookings.length)} need follow-up`
              : "No active alerts"
          }
          tone="tenant"
        />
        <KpiCard
          label="Completed today"
          value={formatCount(completedToday)}
          detail="Closed booking records in the current UTC day"
          tone="success"
        />
        <KpiCard
          label="This month"
          value={formatCount(monthlyBookings)}
          detail="Bookings created during the current month"
          tone="info"
        />
        <KpiCard
          label="Current invoice"
          value={currentInvoice ? formatMoney(currentInvoice.amount) : "Ready"}
          detail={
            currentInvoice
              ? `${currentInvoice.invoiceId} · ${currentInvoice.status}`
              : "No invoice snapshot returned"
          }
          tone="warning"
        />
      </KpiRow>

      <WorkflowSplitLayout
        density="comfortable"
        main={
          <DataViewCard
            title="Ongoing bookings"
            subtitle="The TN_Home main table keeps active orders at the center of the screen."
            tone="tenant"
            summary={
              activeBookings.length > 0
                ? `${formatCount(activeBookings.length)} active booking row(s), ${formatCount(forwardedActiveCount)} using partner or forwarded fulfillment.`
                : "No active bookings are currently visible in the tenant scope."
            }
            actions={
              <Link href="/bookings" style={actionLinkStyle()}>
                Open bookings
              </Link>
            }
          >
            {activeBookings.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...tableHeaderStyle, width: "120px" }}>
                        BK
                      </th>
                      <th style={tableHeaderStyle}>Passenger</th>
                      <th style={tableHeaderStyle}>Pickup</th>
                      <th style={{ ...tableHeaderStyle, width: "160px" }}>
                        Window
                      </th>
                      <th style={{ ...tableHeaderStyle, width: "170px" }}>
                        State
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBookings.slice(0, 5).map((booking) => {
                      const source = getBookingSourceVisibility(booking);
                      return (
                        <tr key={booking.bookingId}>
                          <td style={tableCellStyle}>
                            <DataCellStack
                              primary={
                                <Link
                                  href={`/bookings/${booking.bookingId}`}
                                  style={{
                                    color: "#0f766e",
                                    fontWeight: 700,
                                    textDecoration: "none",
                                  }}
                                >
                                  {booking.bookingId}
                                </Link>
                              }
                              secondary={`Order ${booking.orderId}`}
                              tertiary={source.badge}
                            />
                          </td>
                          <td style={tableCellStyle}>
                            <DataCellStack
                              primary={
                                <strong>{booking.passenger.name}</strong>
                              }
                              secondary={booking.passenger.phone}
                            />
                          </td>
                          <td style={tableCellStyle}>
                            <DataCellStack
                              primary={booking.pickup.address}
                              secondary={`Drop ${booking.dropoff.address}`}
                            />
                          </td>
                          <td style={tableCellStyle}>
                            <DataCellStack
                              primary={formatDateTime(
                                booking.reservationWindowStart,
                              )}
                              secondary={formatDateTime(
                                booking.reservationWindowEnd,
                              )}
                            />
                          </td>
                          <td style={tableCellStyle}>
                            <div
                              style={{
                                display: "grid",
                                gap: "8px",
                              }}
                            >
                              <StatusChip
                                label={formatOrderStatusLabel(
                                  booking.orderStatus,
                                )}
                                tone={getOrderStatusTone(booking.orderStatus)}
                              />
                              <StatusChip
                                label={source.badge}
                                tone={getSourceTone(source)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <CalloutBanner
                title="No active bookings"
                description="The tenant has no in-progress booking rows in the current snapshot."
                tone="info"
                density="compact"
              />
            )}
          </DataViewCard>
        }
        side={
          <DataViewCard
            title="Reminders"
            subtitle="The right column mirrors the TN_Home notice stack with tenant-safe reminders."
            tone="tenant"
            summary="Webhook, SLA, and invoice cues stay visible without requiring a secondary route."
          >
            {currentInvoice ? (
              <CalloutBanner
                title={`${currentInvoice.invoiceId} · ${formatMoney(currentInvoice.amount)}`}
                description={`Current invoice period ${formatDateTime(currentInvoice.periodStart)} -> ${formatDateTime(currentInvoice.periodEnd)} is ${currentInvoice.status}.`}
                tone="warning"
                density="compact"
              />
            ) : null}
            {recentNotifications.length > 0 ? (
              recentNotifications.map((notification) => (
                <CalloutBanner
                  key={notification.notificationId}
                  title={notification.title}
                  description={notification.message}
                  tone={notificationTone(notification.channel)}
                  density="compact"
                  footer={`${notification.channel} · ${formatDateTime(notification.createdAt)}`}
                />
              ))
            ) : (
              <CalloutBanner
                title="No recent reminders"
                description="Notification feed records are currently empty for this tenant."
                tone="info"
                density="compact"
              />
            )}
          </DataViewCard>
        }
      />

      <div style={compactGridStyle}>
        <DataViewCard
          title="Authority context"
          subtitle="Identity and integration ownership remain explicit on the home surface."
          tone="tenant"
          density="compact"
          summary="Tenant, actor, and readiness posture stay readable without turning Home into a launcher page."
        >
          <DetailMetadataGrid
            dense
            minColumnWidth="180px"
            items={[
              {
                id: "tenant",
                label: "Tenant",
                value: data.identity?.tenantId ?? "Unavailable",
              },
              {
                id: "realm",
                label: "Realm",
                value: data.identity?.realm ?? "Unavailable",
              },
              {
                id: "actor",
                label: "Actor",
                value: data.identity?.actorType ?? "Unavailable",
              },
              {
                id: "auth-mode",
                label: "Auth mode",
                value: data.identity?.authMode ?? "Unavailable",
              },
              {
                id: "integrations",
                label: "Webhook events",
                value: String(
                  data.governance?.baselineWebhookEvents.length ?? 0,
                ),
              },
              {
                id: "subscriptions",
                label: "Notification routes",
                value: String(
                  data.governance?.baselineNotificationSubscriptions.length ??
                    0,
                ),
              },
            ]}
          />
        </DataViewCard>
        <DataViewCard
          title="Workspace posture"
          subtitle="Feature posture and checklist items stay visible below the hero KPI lane."
          tone="tenant"
          density="compact"
          summary={
            enabledFlags.length > 0
              ? `${enabledFlags.length} enabled feature flag(s) in the current tenant snapshot.`
              : "No enabled tenant feature flags were returned."
          }
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {enabledFlags.slice(0, 6).map((flag) => (
              <StatusChip key={flag.key} label={flag.key} tone="tenant" />
            ))}
          </div>
          {checklist.length > 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {checklist.map((item) => (
                <CalloutBanner
                  key={item}
                  title={item}
                  description="Checklist items remain the published source of tenant integration readiness."
                  tone="warning"
                  density="compact"
                />
              ))}
            </div>
          ) : (
            <CalloutBanner
              title="Integration checklist clear"
              description="No outstanding onboarding items were returned for this tenant."
              tone="success"
              density="compact"
            />
          )}
        </DataViewCard>
      </div>

      {data.errors.length > 0 ? (
        <CalloutBanner
          title="Partial data returned"
          description="The home dashboard is resilient to partial backend failures and keeps the available sections visible."
          tone="warning"
        >
          <ul
            style={{
              margin: 0,
              paddingLeft: "18px",
              display: "grid",
              gap: "6px",
            }}
          >
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutBanner>
      ) : null}
    </div>
  );
}
