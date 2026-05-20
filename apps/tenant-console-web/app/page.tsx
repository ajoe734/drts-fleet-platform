import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BookingRecord,
  IdentityContext,
  TenantBillingProfile,
  TenantBookingApprovalRequestRecord,
  TenantInvoiceRecord,
  TenantQuotaSummary,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

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

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
  gap: 16,
};

const bookingPrimaryStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const bookingLocationStyle: CSSProperties = {
  color: th.text,
  fontWeight: 500,
  whiteSpace: "normal",
  lineHeight: 1.35,
};

const bookingWindowStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.35,
};

const bannerStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const linkStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12,
  textDecoration: "none",
};

const dateFormatter = new Intl.DateTimeFormat("zh-Hant", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const numberFormatter = new Intl.NumberFormat("en-US");

type HomeData = {
  identity: IdentityContext | null;
  users: TenantUserRoleRecord[];
  billingProfile: TenantBillingProfile | null;
  quotaSummary: TenantQuotaSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  webhooks: TenantWebhookEndpoint[];
  approvalRequests: TenantBookingApprovalRequestRecord[];
  errors: string[];
};

type BookingRow = BookingRecord & Record<string, unknown>;

type ReminderBanner = {
  tone: "warn" | "info" | "success";
  title: string;
  body: string;
};

async function loadHomeData(): Promise<HomeData> {
  const client = getTenantClient();
  const [
    identity,
    users,
    billingProfile,
    quotaSummary,
    bookings,
    invoices,
    webhooks,
    approvalRequests,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.listTenantUsers() as Promise<TenantUserRoleRecord[]>,
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
    client.listTenantBookings() as Promise<BookingRecord[]>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.listWebhooks() as Promise<TenantWebhookEndpoint[]>,
    client.listApprovalRequests({
      status: "pending",
    }) as Promise<TenantBookingApprovalRequestRecord[]>,
  ]);

  const errors: string[] = [];
  const tag = (label: string, reason: unknown) =>
    `${label}: ${reason instanceof Error ? reason.message : "未知錯誤"}`;

  if (identity.status === "rejected")
    errors.push(tag("租戶身分", identity.reason));
  if (users.status === "rejected") errors.push(tag("成員清單", users.reason));
  if (billingProfile.status === "rejected") {
    errors.push(tag("計費設定", billingProfile.reason));
  }
  if (quotaSummary.status === "rejected") {
    errors.push(tag("租戶配額", quotaSummary.reason));
  }
  if (bookings.status === "rejected")
    errors.push(tag("叫車清單", bookings.reason));
  if (invoices.status === "rejected")
    errors.push(tag("對帳單", invoices.reason));
  if (webhooks.status === "rejected")
    errors.push(tag("Webhook", webhooks.reason));
  if (approvalRequests.status === "rejected") {
    errors.push(tag("待簽核叫車", approvalRequests.reason));
  }

  return {
    identity: identity.status === "fulfilled" ? identity.value : null,
    users: users.status === "fulfilled" ? users.value : [],
    billingProfile:
      billingProfile.status === "fulfilled" ? billingProfile.value : null,
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    bookings: bookings.status === "fulfilled" ? bookings.value : [],
    invoices: invoices.status === "fulfilled" ? invoices.value : [],
    webhooks: webhooks.status === "fulfilled" ? webhooks.value : [],
    approvalRequests:
      approvalRequests.status === "fulfilled" ? approvalRequests.value : [],
    errors,
  };
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return shortDateTimeFormatter.format(parsed).replace(",", "");
}

function isSameUtcDay(value: string | null | undefined, target: Date) {
  const parsed = parseDate(value);
  if (!parsed) return false;

  return (
    parsed.getUTCFullYear() === target.getUTCFullYear() &&
    parsed.getUTCMonth() === target.getUTCMonth() &&
    parsed.getUTCDate() === target.getUTCDate()
  );
}

function formatMoneyMinor(amountMinor: number, currency: string) {
  const prefix = currency === "TWD" ? "NT$" : currency;
  return `${prefix} ${numberFormatter.format(Math.round(amountMinor / 100))}`;
}

function formatMoney(
  value: TenantInvoiceRecord["amount"] | BookingRecord["quotedFare"] | null,
) {
  if (!value) return "—";
  return formatMoneyMinor(value.amountMinor, value.currency);
}

function formatQuotaLimit(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    return `${formatCount(summary.limit.bookingCountLimit)} 趟`;
  }

  if (summary.limit.amountMinorLimit !== null) {
    return formatMoneyMinor(
      summary.limit.amountMinorLimit,
      summary.limit.currency,
    );
  }

  return "無上限";
}

function formatQuotaUsage(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    const used =
      summary.usage.confirmedBookingCount +
      summary.usage.pendingReservedBookingCount;
    return formatCount(used);
  }

  if (summary.limit.amountMinorLimit !== null) {
    const used =
      summary.usage.confirmedAmountMinor +
      summary.usage.pendingReservedAmountMinor;
    return formatMoneyMinor(used, summary.limit.currency);
  }

  return "無上限";
}

function formatQuotaSub(summary: TenantQuotaSummary | null) {
  if (!summary) return "配額資料尚未載入";
  if (summary.usage.remainingPercent === null) return "無上限";

  return `${summary.usage.remainingPercent}% of ${formatQuotaLimit(summary)}`;
}

function formatQuotaHeader(summary: TenantQuotaSummary | null) {
  if (!summary) {
    return "本月配額資料尚未載入";
  }

  return `本月配額 ${formatQuotaUsage(summary)} / ${formatQuotaLimit(summary)}`;
}

function getGreetingName(data: HomeData) {
  const activeUser = [...data.users]
    .filter((user) => user.status === "active")
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "zh-Hant"),
    )[0];

  if (activeUser?.displayName) return activeUser.displayName;
  if (data.billingProfile?.contactName) return data.billingProfile.contactName;
  if (data.billingProfile?.invoiceTitle)
    return data.billingProfile.invoiceTitle;
  if (data.identity?.actorType === "tenant_admin") return "租戶管理員";
  return "YAMATO 團隊";
}

function compareActiveBookings(left: BookingRecord, right: BookingRecord) {
  const leftTime = parseDate(left.reservationWindowStart)?.getTime() ?? 0;
  const rightTime = parseDate(right.reservationWindowStart)?.getTime() ?? 0;
  return leftTime - rightTime;
}

function getBookingStateTone(status: BookingRecord["orderStatus"]): CanvasTone {
  switch (status) {
    case "assigned":
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
    case "on_trip":
      return "success";
    case "ready_for_dispatch":
    case "preassigned":
    case "delayed_queue":
      return "info";
    case "dispatch_failed":
    case "dispatch_timeout":
    case "no_supply":
    case "exception_hold":
    case "redispatch_required":
      return "warn";
    case "proof_pending":
      return "accent";
    default:
      return "neutral";
  }
}

function getBookingStateLabel(status: BookingRecord["orderStatus"]) {
  switch (status) {
    case "ready_for_dispatch":
      return "broadcasting";
    case "driver_accepted":
      return "accepted";
    case "enroute_pickup":
      return "enroute";
    case "arrived_pickup":
      return "arrived";
    default:
      return status;
  }
}

function buildReminderBanners(data: HomeData): ReminderBanner[] {
  const banners: ReminderBanner[] = [];

  const pausedWebhook = data.webhooks.find(
    (webhook) => webhook.status === "disabled",
  );
  if (pausedWebhook) {
    const pausedSince =
      formatDateTime(
        pausedWebhook.runtimeMetadata?.disabledAt ?? pausedWebhook.updatedAt,
      ) || "最近";
    banners.push({
      tone: "warn",
      title: `Webhook ${pausedWebhook.webhookId} 已暫停`,
      body: `${pausedSince} 起停止投遞，恢復前不會收到事件。`,
    });
  }

  if (data.approvalRequests.length > 0) {
    banners.push({
      tone: "info",
      title: `${formatCount(data.approvalRequests.length)} 筆叫車等待簽核`,
      body: "審批與配額頁面可檢視 pending requests、quota impact 與規則命中結果。",
    });
  } else {
    banners.push({
      tone: "info",
      title: "目前沒有待簽核叫車",
      body: "租戶叫車目前沒有落在 require_approval 的待辦項目。",
    });
  }

  if (data.quotaSummary?.usage.remainingPercent !== null) {
    const remaining = data.quotaSummary?.usage.remainingPercent ?? 0;
    banners.push({
      tone: remaining >= 20 ? "success" : "warn",
      title:
        remaining >= 20
          ? `本月配額仍有 ${remaining}%`
          : `本月配額僅剩 ${remaining}%`,
      body: `已使用 ${formatQuotaUsage(data.quotaSummary)}，目前強制模式為 ${data.quotaSummary?.limit.enforcementMode ?? "—"}。`,
    });
  } else if (data.invoices[0]) {
    banners.push({
      tone: "success",
      title: `當期帳單 ${data.invoices[0].invoiceId} 已就緒`,
      body: `${formatMoney(data.invoices[0].amount)} · ${data.invoices[0].status}`,
    });
  }

  return banners.slice(0, 3);
}

export default async function HomePage() {
  const data = await loadHomeData();
  const now = new Date();
  const activeBookings = [...data.bookings]
    .filter(
      (booking) =>
        booking.orderStatus !== "completed" &&
        booking.orderStatus !== "cancelled",
    )
    .sort(compareActiveBookings);
  const completedToday = data.bookings.filter(
    (booking) =>
      booking.orderStatus === "completed" &&
      isSameUtcDay(booking.updatedAt, now),
  );
  const latestInvoice = [...data.invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  )[0];
  const inFlightDispatches = activeBookings.filter((booking) =>
    ["ready_for_dispatch", "preassigned", "delayed_queue"].includes(
      booking.orderStatus,
    ),
  ).length;
  const assignedDispatches = activeBookings.filter((booking) =>
    [
      "assigned",
      "driver_accepted",
      "enroute_pickup",
      "arrived_pickup",
      "on_trip",
    ].includes(booking.orderStatus),
  ).length;
  const greetingName = getGreetingName(data);
  const subtitle = `${dateFormatter.format(now)} · ${formatQuotaHeader(data.quotaSummary)}`;
  const reminderBanners = buildReminderBanners(data);
  const rows: BookingRow[] = activeBookings.slice(0, 5).map((booking) => ({
    ...booking,
  }));

  const columns: CanvasTableColumn<BookingRow>[] = [
    {
      h: "BK",
      w: 120,
      mono: true,
      r: (row) => <span style={bookingPrimaryStyle}>{row.bookingId}</span>,
    },
    {
      h: "PASS.",
      w: 120,
      r: (row) => row.passenger.name,
    },
    {
      h: "PICKUP",
      r: (row) => <div style={bookingLocationStyle}>{row.pickup.address}</div>,
    },
    {
      h: "WIN",
      w: 150,
      mono: true,
      r: (row) => (
        <div style={bookingWindowStyle}>
          {formatDateTime(row.reservationWindowStart)}
        </div>
      ),
    },
    {
      h: "STATE",
      w: 140,
      r: (row) => (
        <CanvasPill theme={th} tone={getBookingStateTone(row.orderStatus)} dot>
          {getBookingStateLabel(row.orderStatus)}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={`您好，${greetingName}`}
        subtitle={subtitle}
        actions={
          <>
            <CanvasBtn theme={th} icon="ext" size="sm">
              幫助中心
            </CanvasBtn>
            <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
              建立叫車
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="首頁快照未完全載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="進行中"
            value={formatCount(activeBookings.length)}
            sub={`${formatCount(inFlightDispatches)} broadcasting · ${formatCount(assignedDispatches)} assigned`}
          />
          <CanvasKPI
            theme={th}
            label="今日已完成"
            value={formatCount(completedToday.length)}
            sub={`${dateFormatter.format(now)} 完成`}
          />
          <CanvasKPI
            theme={th}
            label="本月用量"
            value={formatQuotaUsage(data.quotaSummary)}
            sub={formatQuotaSub(data.quotaSummary)}
          />
          <CanvasKPI
            theme={th}
            label="當期帳單"
            value={latestInvoice ? formatMoney(latestInvoice.amount) : "—"}
            sub={
              latestInvoice
                ? `${latestInvoice.periodStart.slice(0, 7)} · ${latestInvoice.status}`
                : "尚無帳單"
            }
          />
        </div>

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title="進行中訂單"
            padding={0}
            actions={
              <Link href="/bookings" style={linkStyle}>
                前往叫車
              </Link>
            }
          >
            {rows.length > 0 ? (
              <CanvasTable columns={columns} rows={rows} theme={th} />
            ) : (
              <div style={emptyStateStyle}>目前沒有進行中的叫車訂單</div>
            )}
          </CanvasCard>

          <CanvasCard theme={th} title="提醒">
            <div style={bannerStackStyle}>
              {reminderBanners.map((banner, index) => (
                <CanvasBanner
                  body={banner.body}
                  icon={banner.tone === "success" ? "check" : "warn"}
                  key={`${banner.title}-${index}`}
                  theme={th}
                  title={banner.title}
                  tone={banner.tone}
                />
              ))}
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
