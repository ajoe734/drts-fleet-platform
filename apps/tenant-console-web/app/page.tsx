import type { CSSProperties, ReactNode } from "react";
import type {
  BookingRecord,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  TenantIntegrationGovernancePackage,
  TenantInvoiceRecord,
  TenantQuotaSummary,
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
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(340px, 1fr)",
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
  display: "grid",
  gap: 8,
};

const reminderCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

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
  featureFlags: FeatureFlagSummary | null;
  quotaSummary: TenantQuotaSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
};

type BookingTableRow = {
  booking: ReactNode;
  passenger: string;
  pickup: ReactNode;
  window: ReactNode;
  state: ReactNode;
};

type ReminderBanner = {
  tone: "warn" | "info" | "success";
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
};

async function loadHomeData(): Promise<HomeData> {
  const client = getTenantClient();
  const [
    identity,
    featureFlags,
    quotaSummary,
    bookings,
    invoices,
    notifications,
    governance,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({
      tenantId: "tenant-demo-001",
    }) as Promise<FeatureFlagSummary>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
    client.listTenantBookings() as Promise<BookingRecord[]>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.listTenantNotificationFeed() as Promise<NotificationRecord[]>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
  ]);

  const errors: string[] = [];
  const tag = (label: string, reason: unknown) =>
    `${label}: ${reason instanceof Error ? reason.message : "未知錯誤"}`;

  if (identity.status === "rejected")
    errors.push(tag("租戶身分", identity.reason));
  if (featureFlags.status === "rejected") {
    errors.push(tag("模組旗標", featureFlags.reason));
  }
  if (quotaSummary.status === "rejected") {
    errors.push(tag("租戶配額", quotaSummary.reason));
  }
  if (bookings.status === "rejected")
    errors.push(tag("叫車清單", bookings.reason));
  if (invoices.status === "rejected")
    errors.push(tag("對帳單", invoices.reason));
  if (notifications.status === "rejected") {
    errors.push(tag("提醒通知", notifications.reason));
  }
  if (governance.status === "rejected") {
    errors.push(tag("整合治理", governance.reason));
  }

  return {
    identity: identity.status === "fulfilled" ? identity.value : null,
    featureFlags:
      featureFlags.status === "fulfilled" ? featureFlags.value : null,
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    bookings: bookings.status === "fulfilled" ? bookings.value : [],
    invoices: invoices.status === "fulfilled" ? invoices.value : [],
    notifications:
      notifications.status === "fulfilled" ? notifications.value : [],
    governance: governance.status === "fulfilled" ? governance.value : null,
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

function formatHeaderDate(value: Date) {
  const weekday = new Intl.DateTimeFormat("zh-Hant", {
    weekday: "short",
  }).format(value);
  const isoDate = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

  return `${isoDate} (${weekday})`;
}

function getGreetingName(data: HomeData) {
  if (data.identity?.actorType === "tenant_admin") return "張俐萱";
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
  const enabledFlags =
    data.featureFlags?.flags.filter((flag) => flag.enabled) ?? [];
  const latestApproval = data.notifications.find(
    (notification) => notification.channel === "tenant_approval",
  );

  if (latestApproval) {
    banners.push({
      tone: "warn",
      title: latestApproval.title,
      body: `${latestApproval.message} · ${formatDateTime(latestApproval.createdAt)}`,
      actionHref: "/bookings",
      actionLabel: "查看",
    });
  } else {
    banners.push({
      tone: "warn",
      title: "Webhook 狀態需要留意",
      body:
        data.governance?.webhookPolicy.autoDisableAfterConsecutiveFailures !==
        undefined
          ? `連續失敗 ${formatCount(data.governance.webhookPolicy.autoDisableAfterConsecutiveFailures)} 次會自動停用，請確認 staging 與 production 端點。`
          : "staging 端點測試中，恢復前不會收到事件。",
      actionHref: "/webhooks",
      actionLabel: "查看",
    });
  }

  const maintenanceNotice = data.notifications.find(
    (notification) => notification.channel === "ops_notice",
  );
  if (maintenanceNotice) {
    banners.push({
      tone: "info",
      title: maintenanceNotice.title,
      body: `${maintenanceNotice.message} · ${formatDateTime(maintenanceNotice.createdAt)}`,
    });
  } else if ((data.governance?.onboardingChecklist.length ?? 0) > 0) {
    banners.push({
      tone: "info",
      title: `${formatCount(data.governance?.onboardingChecklist.length ?? 0)} 項整合待辦`,
      body: `${data.governance?.onboardingChecklist[0] ?? "請完成租戶整合治理基線。"}${enabledFlags.length > 0 ? ` · 已啟用 ${formatCount(enabledFlags.length)} 個模組` : ""}`,
    });
  } else {
    banners.push({
      tone: "info",
      title: "平台維護提醒",
      body:
        enabledFlags.length > 0
          ? `目前已啟用 ${formatCount(enabledFlags.length)} 個租戶模組，維護期間請留意即時派遣與 webhook 事件。`
          : "目前沒有額外整合待辦，若有維護時段將透過此區更新。",
    });
  }

  const slaNotice = data.notifications.find(
    (notification) => notification.channel === "tenant_sla",
  );
  if (slaNotice) {
    banners.push({
      tone: "success",
      title: slaNotice.title,
      body: `${slaNotice.message} · ${formatDateTime(slaNotice.createdAt)}`,
    });
  } else if (
    data.quotaSummary?.usage.remainingPercent !== null &&
    data.quotaSummary
  ) {
    const remaining = data.quotaSummary.usage.remainingPercent;
    banners.push({
      tone: "success",
      title: remaining >= 20 ? `本月 SLA / 配額狀態穩定` : `本月配額接近上限`,
      body:
        remaining >= 20
          ? `剩餘 ${remaining}% 配額，監控與通知基線正常。`
          : `已使用 ${formatQuotaUsage(data.quotaSummary)}，目前請留意後續預約審批。`,
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
  const subtitle = `${formatHeaderDate(now)} · ${formatQuotaHeader(data.quotaSummary)}`;
  const reminderBanners = buildReminderBanners(data);
  const rows: BookingTableRow[] = activeBookings.slice(0, 5).map((booking) => ({
    booking: <span style={bookingPrimaryStyle}>{booking.bookingId}</span>,
    passenger: booking.passenger.name,
    pickup: <div style={bookingLocationStyle}>{booking.pickup.address}</div>,
    window: (
      <div style={bookingWindowStyle}>
        {formatDateTime(booking.reservationWindowStart)}
      </div>
    ),
    state: (
      <CanvasPill
        theme={th}
        tone={getBookingStateTone(booking.orderStatus)}
        dot
      >
        {getBookingStateLabel(booking.orderStatus)}
      </CanvasPill>
    ),
  }));
  const latestInvoiceLabel = latestInvoice
    ? `${latestInvoice.periodStart.slice(0, 7)} · ${latestInvoice.status}`
    : "尚無帳單";

  const columns: CanvasTableColumn<BookingTableRow>[] = [
    {
      h: "BK",
      k: "booking",
      w: 120,
      mono: true,
    },
    {
      h: "PASS.",
      k: "passenger",
      w: 120,
    },
    {
      h: "PICKUP",
      k: "pickup",
    },
    {
      h: "WIN",
      k: "window",
      w: 150,
      mono: true,
    },
    {
      h: "STATE",
      k: "state",
      w: 140,
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={th}
        title={`您好，${greetingName}`}
        subtitle={subtitle}
        actions={
          <>
            <CanvasBtn href="/settings" theme={th} icon="ext" size="sm">
              幫助中心
            </CanvasBtn>
            <CanvasBtn
              href="/bookings/new"
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
            >
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
            delta={
              completedToday.length > 0
                ? `↑ ${formatCount(completedToday.length)}`
                : "今日無完成"
            }
            deltaTone={completedToday.length > 0 ? "up" : "neutral"}
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
            delta={latestInvoiceLabel}
            deltaTone="neutral"
          />
        </div>

        <div style={contentGridStyle}>
          <CanvasCard
            theme={th}
            title="進行中訂單"
            padding={0}
            actions={
              <CanvasBtn href="/bookings" theme={th} variant="ghost" size="sm">
                前往叫車
              </CanvasBtn>
            }
          >
            {rows.length > 0 ? (
              <CanvasTable columns={columns} rows={rows} theme={th} />
            ) : (
              <div style={emptyStateStyle}>目前沒有進行中的叫車訂單</div>
            )}
          </CanvasCard>

          <CanvasCard theme={th} title="提醒">
            <div style={reminderCardStyle}>
              <div style={bannerStackStyle}>
                {reminderBanners.map((banner, index) => (
                  <CanvasBanner
                    actions={
                      banner.actionHref && banner.actionLabel ? (
                        <CanvasBtn
                          href={banner.actionHref}
                          theme={th}
                          variant="ghost"
                          size="xs"
                        >
                          {banner.actionLabel}
                        </CanvasBtn>
                      ) : undefined
                    }
                    body={banner.body}
                    icon={banner.tone === "success" ? "check" : "warn"}
                    key={`${banner.title}-${index}`}
                    theme={th}
                    title={banner.title}
                    tone={banner.tone}
                  />
                ))}
              </div>
            </div>
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
