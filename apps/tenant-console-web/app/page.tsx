import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BookingRecord,
  IdentityContext,
  NotificationRecord,
  TenantIntegrationGovernancePackage,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  buildCanvasTheme,
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";
import { t, type Locale } from "@/lib/translations";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

type DashboardData = {
  identity: IdentityContext | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
};

async function loadDashboardData(locale: Locale): Promise<DashboardData> {
  const client = getTenantClient();
  const [
    identityResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    governanceResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
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
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : t("dashboard.error.unknown", locale);
      errors.push(`${label}: ${reason}`);
    }
  };

  collectError(t("dashboard.errorLabel.bookings", locale), bookingsResult);
  collectError(t("dashboard.errorLabel.invoices", locale), invoicesResult);
  collectError(
    t("dashboard.errorLabel.notifications", locale),
    notificationsResult,
  );
  collectError(t("dashboard.errorLabel.governance", locale), governanceResult);

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
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

type HomeBookingRow = {
  id: string;
  passenger: string;
  pickup: string;
  win: string;
  state: BookingRecord["orderStatus"];
};

function statusTone(status: BookingRecord["orderStatus"]): CanvasTone {
  if (status === "completed") return "success";
  if (status === "cancelled" || ATTENTION_STATUSES.has(status)) return "danger";
  if (status === "driver_accepted" || status === "on_trip") return "info";
  return "warn";
}

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
};
const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 16,
};
const bodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};
const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export default async function HomePage() {
  const locale = await getServerLocale();
  const data = await loadDashboardData(locale);

  const activeBookings = data.bookings.filter(
    (booking) =>
      booking.orderStatus !== "completed" &&
      booking.orderStatus !== "cancelled",
  );
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const completedToday = data.bookings.filter(
    (booking) => booking.orderStatus === "completed",
  ).length;
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );
  const recentNotifications = data.notifications.slice(0, 3);
  const checklist = data.governance?.onboardingChecklist ?? [];

  const actorName = data.identity?.actorType ?? data.identity?.tenantId ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const rows: HomeBookingRow[] = activeBookings.slice(0, 5).map((booking) => ({
    id: booking.bookingId,
    passenger: booking.passenger.name,
    pickup: booking.pickup.addressName ?? booking.pickup.address,
    win: formatDateTime(booking.reservationWindowStart),
    state: booking.orderStatus,
  }));

  const columns: CanvasTableColumn<HomeBookingRow>[] = [
    {
      h: t("dashboard.col.booking", locale),
      k: "id",
      w: 110,
      mono: true,
      r: (row) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>{row.id}</span>
      ),
    },
    { h: t("dashboard.col.passenger", locale), k: "passenger", w: 110 },
    { h: t("dashboard.col.pickup", locale), k: "pickup" },
    { h: t("dashboard.col.window", locale), k: "win", w: 150, mono: true },
    {
      h: t("dashboard.col.status", locale),
      w: 140,
      r: (row) => (
        <CanvasPill theme={theme} tone={statusTone(row.state)} dot>
          {row.state}
        </CanvasPill>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={
          actorName
            ? t("dashboard.home.greeting", locale, { name: actorName })
            : t("dashboard.hero.title", locale)
        }
        subtitle={t("dashboard.home.subtitle", locale, {
          date: today,
          count: formatCount(data.bookings.length),
        })}
        actions={
          <div style={actionRowStyle}>
            <Link href="/integration-governance" className="text-link">
              {t("dashboard.action.help", locale)}
            </Link>
            <Link href="/bookings/new" className="text-link">
              {t("dashboard.action.createBooking", locale)}
            </Link>
          </div>
        }
      />

      <div style={bodyStyle}>
        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.inProgress", locale)}
            value={formatCount(activeBookings.length)}
            sub={
              attentionBookings.length > 0
                ? t("dashboard.kpi.attentionBookingsActive", locale, {
                    count: formatCount(attentionBookings.length),
                  })
                : t("dashboard.empty.activeBookings", locale)
            }
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.todayCompleted", locale)}
            value={formatCount(completedToday)}
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.mtdUsage", locale)}
            value={formatCount(data.bookings.length)}
          />
          <CanvasKPI
            theme={theme}
            label={t("dashboard.kpi.currentInvoice", locale)}
            value={formatCount(openInvoices.length)}
            sub={
              data.invoices.length > 0
                ? t("dashboard.kpi.invoiceFilesVisible", locale, {
                    count: formatCount(data.invoices.length),
                  })
                : t("dashboard.empty.invoices", locale)
            }
          />
        </div>

        <div style={splitGridStyle}>
          <CanvasCard
            theme={theme}
            title={t("dashboard.section.activeBookings", locale)}
            padding={0}
          >
            {rows.length > 0 ? (
              <CanvasTable<HomeBookingRow>
                theme={theme}
                columns={columns}
                rows={rows}
              />
            ) : (
              <div style={{ padding: 24 }}>
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  icon="info"
                  title={t("dashboard.empty.activeBookings", locale)}
                />
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={t("dashboard.section.reminders", locale)}
          >
            {recentNotifications.length > 0 ? (
              recentNotifications.map((notification) => (
                <div
                  key={notification.notificationId}
                  style={{ marginBottom: 8 }}
                >
                  <CanvasBanner
                    theme={theme}
                    tone="info"
                    icon="info"
                    title={notification.title}
                    body={`${notification.channel} · ${formatDateTime(
                      notification.createdAt,
                    )}`}
                  />
                </div>
              ))
            ) : checklist.length > 0 ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="warn"
                title={t("dashboard.section.integration", locale)}
                body={t("dashboard.kpi.pendingChecklist", locale, {
                  count: formatCount(checklist.length),
                })}
              />
            ) : (
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="ok"
                title={t("dashboard.empty.notifications", locale)}
              />
            )}
          </CanvasCard>
        </div>

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title={t("dashboard.callout.partialData", locale)}
            body={data.errors.join(" · ")}
          />
        ) : null}
      </div>
    </>
  );
}
