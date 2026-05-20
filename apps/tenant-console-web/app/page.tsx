import Link from "next/link";
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
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  type CanvasBtnProps,
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
  gap: 18,
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.95fr)",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.95fr)",
  gap: 16,
};

const heroStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const heroHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  color: th.text,
  fontSize: 28,
  lineHeight: 1.05,
  letterSpacing: -0.5,
};

const heroLeadStyle: CSSProperties = {
  margin: "6px 0 0",
  color: th.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
};

const heroPillRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const heroActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const quotaMetricsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const quotaMetricStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
};

const quotaMetricLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const quotaMetricValueStyle: CSSProperties = {
  marginTop: 6,
  color: th.text,
  fontSize: 19,
  fontWeight: 700,
  lineHeight: 1.1,
  fontFamily: th.monoFamily,
};

const quotaMetricSubStyle: CSSProperties = {
  marginTop: 4,
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
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

const reminderMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  color: th.textMuted,
  fontSize: 11.5,
};

const reminderCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const reminderPanelStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const navButtonWrapStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
};

const navButtonLinkStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 7,
  zIndex: 1,
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

type NavCanvasBtnProps = Omit<CanvasBtnProps, "onClick"> & {
  href: string;
  ariaLabel: string;
};

function NavCanvasBtn({
  href,
  ariaLabel,
  children,
  ...buttonProps
}: NavCanvasBtnProps) {
  return (
    <span style={navButtonWrapStyle}>
      <CanvasBtn {...buttonProps}>{children}</CanvasBtn>
      <Link aria-label={ariaLabel} href={href} style={navButtonLinkStyle} />
    </span>
  );
}

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

function formatQuotaMode(
  mode: TenantQuotaSummary["limit"]["enforcementMode"] | null | undefined,
) {
  switch (mode) {
    case "warn_only":
      return "warn only";
    case "require_approval":
      return "require approval";
    case "hard_block":
      return "hard block";
    default:
      return "—";
  }
}

function formatRemainingPercent(summary: TenantQuotaSummary | null) {
  const remaining = summary?.usage.remainingPercent;
  if (remaining === null || remaining === undefined) return "unlimited";
  return `${remaining}%`;
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

function getQuotaTone(summary: TenantQuotaSummary | null): CanvasTone {
  const remaining = summary?.usage.remainingPercent;
  if (remaining === null || remaining === undefined) return "neutral";
  if (remaining < 20) return "warn";
  if (remaining < 50) return "info";
  return "success";
}

function getGreetingName(data: HomeData) {
  if (data.identity?.actorType === "tenant_admin") return "張俐萱";
  return "YAMATO 團隊";
}

function formatPeriodKey(periodKey: string | null | undefined) {
  if (!periodKey) return "本期";
  const [year, month] = periodKey.split("-");
  if (!year || !month) return periodKey;
  return `${year}-${month}`;
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
  const latestNotification = data.notifications[0];
  const enabledFlags =
    data.featureFlags?.flags.filter((flag) => flag.enabled) ?? [];

  if (latestNotification && latestNotification.channel === "tenant_approval") {
    banners.push({
      tone: "warn",
      title: latestNotification.title,
      body: `${latestNotification.message} · ${formatDateTime(latestNotification.createdAt)}`,
      actionHref: "/webhooks",
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
  const quotaBody = data.quotaSummary
    ? [
        `${formatPeriodKey(data.quotaSummary.periodKey)} 月配額已使用 ${formatQuotaUsage(data.quotaSummary)}`,
        data.quotaSummary.usage.remainingPercent === null
          ? "目前未設定上限"
          : `剩餘 ${data.quotaSummary.usage.remainingPercent}%`,
        `模式 ${formatQuotaMode(data.quotaSummary.limit.enforcementMode)}`,
      ].join(" · ")
    : "配額資料尚未載入，請稍後重新整理。";
  const governanceChecklistCount =
    data.governance?.onboardingChecklist.length ?? 0;
  const enabledFlagCount = data.featureFlags?.flags.filter(
    (flag) => flag.enabled,
  ).length;
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
  const quotaTone = getQuotaTone(data.quotaSummary);
  const quotaBannerTone: ReminderBanner["tone"] =
    quotaTone === "warn"
      ? "warn"
      : quotaTone === "success"
        ? "success"
        : "info";
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
            <NavCanvasBtn
              ariaLabel="前往幫助中心"
              href="/settings"
              theme={th}
              icon="ext"
              size="sm"
            >
              幫助中心
            </NavCanvasBtn>
            <NavCanvasBtn
              ariaLabel="前往建立叫車頁面"
              href="/bookings/new"
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
            >
              建立叫車
            </NavCanvasBtn>
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

        <div style={heroGridStyle}>
          <CanvasCard theme={th}>
            <div style={heroStackStyle}>
              <div style={heroHeaderStyle}>
                <div>
                  <div style={heroPillRowStyle}>
                    <CanvasPill theme={th} tone="accent">
                      TENANT HOME
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral" dot>
                      {formatHeaderDate(now)}
                    </CanvasPill>
                  </div>
                  <h2 style={heroTitleStyle}>{`早安，${greetingName}`}</h2>
                  <p style={heroLeadStyle}>
                    今天的租戶工作區聚焦月配額、進行中派遣與提醒事項；首頁資料維持
                    availability-first 快照。
                  </p>
                </div>
                <div style={heroActionsStyle}>
                  <NavCanvasBtn
                    ariaLabel="前往建立叫車頁面"
                    href="/bookings/new"
                    theme={th}
                    variant="primary"
                    icon="plus"
                    size="sm"
                  >
                    建立叫車
                  </NavCanvasBtn>
                  <NavCanvasBtn
                    ariaLabel="前往叫車列表"
                    href="/bookings"
                    theme={th}
                    variant="secondary"
                    size="sm"
                  >
                    查看訂單
                  </NavCanvasBtn>
                </div>
              </div>

              <CanvasDL
                theme={th}
                cols={3}
                items={[
                  {
                    label: "Tenant",
                    value: data.identity?.tenantId ?? "tenant-demo-001",
                    mono: true,
                  },
                  {
                    label: "Quota Cycle",
                    value: formatPeriodKey(data.quotaSummary?.periodKey),
                    mono: true,
                  },
                  {
                    label: "Latest Invoice",
                    value: latestInvoice?.invoiceId ?? "—",
                    mono: true,
                  },
                ]}
              />

              <CanvasBanner
                theme={th}
                tone={quotaBannerTone}
                icon={quotaBannerTone === "warn" ? "warn" : "check"}
                title={formatQuotaHeader(data.quotaSummary)}
                body={quotaBody}
                actions={
                  <NavCanvasBtn
                    ariaLabel="前往審批與配額頁面"
                    href="/rules"
                    theme={th}
                    variant="ghost"
                    size="xs"
                  >
                    查看配額
                  </NavCanvasBtn>
                }
              />
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="月配額"
            subtitle={formatPeriodKey(data.quotaSummary?.periodKey)}
            actions={
              <CanvasPill theme={th} tone={quotaTone} dot>
                {formatQuotaMode(data.quotaSummary?.limit.enforcementMode)}
              </CanvasPill>
            }
          >
            <div style={heroStackStyle}>
              <div style={quotaMetricsStyle}>
                <div style={quotaMetricStyle}>
                  <div style={quotaMetricLabelStyle}>Used</div>
                  <div style={quotaMetricValueStyle}>
                    {formatQuotaUsage(data.quotaSummary)}
                  </div>
                  <div style={quotaMetricSubStyle}>已確認 + 待審批保留</div>
                </div>
                <div style={quotaMetricStyle}>
                  <div style={quotaMetricLabelStyle}>Remaining</div>
                  <div style={quotaMetricValueStyle}>
                    {formatRemainingPercent(data.quotaSummary)}
                  </div>
                  <div style={quotaMetricSubStyle}>
                    上限 {formatQuotaLimit(data.quotaSummary)}
                  </div>
                </div>
              </div>

              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    label: "Enforcement",
                    value: formatQuotaMode(
                      data.quotaSummary?.limit.enforcementMode,
                    ),
                  },
                  {
                    label: "Currency",
                    value: data.quotaSummary?.limit.currency ?? "—",
                    mono: true,
                  },
                  {
                    label: "Pending Reserve",
                    value: formatCount(
                      data.quotaSummary?.usage.pendingReservedBookingCount ?? 0,
                    ),
                    mono: true,
                  },
                  {
                    label: "Confirmed",
                    value: formatCount(
                      data.quotaSummary?.usage.confirmedBookingCount ?? 0,
                    ),
                    mono: true,
                  },
                ]}
              />
            </div>
          </CanvasCard>
        </div>

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
            subtitle={`${formatCount(activeBookings.length)} 筆 active bookings`}
            padding={0}
            actions={
              <NavCanvasBtn
                ariaLabel="前往叫車列表"
                href="/bookings"
                theme={th}
                variant="ghost"
                size="sm"
              >
                前往叫車
              </NavCanvasBtn>
            }
          >
            {rows.length > 0 ? (
              <CanvasTable columns={columns} rows={rows} theme={th} />
            ) : (
              <div style={emptyStateStyle}>目前沒有進行中的叫車訂單</div>
            )}
          </CanvasCard>

          <div style={reminderPanelStyle}>
            <CanvasCard
              theme={th}
              title="提醒"
              subtitle={`${data.notifications.length} 則通知`}
            >
              <div style={reminderCardStyle}>
                <div style={bannerStackStyle}>
                  {reminderBanners.map((banner, index) => (
                    <CanvasBanner
                      actions={
                        banner.actionHref && banner.actionLabel ? (
                          <NavCanvasBtn
                            ariaLabel={banner.actionLabel}
                            href={banner.actionHref}
                            theme={th}
                            variant="ghost"
                            size="xs"
                          >
                            {banner.actionLabel}
                          </NavCanvasBtn>
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
                <div style={reminderMetaStyle}>
                  <CanvasPill theme={th} tone={quotaTone} dot>
                    {formatQuotaMode(data.quotaSummary?.limit.enforcementMode)}
                  </CanvasPill>
                  <span>{enabledFlagCount ?? 0} 個模組啟用中</span>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="治理摘要"
              subtitle="租戶整合與帳務快照"
            >
              <div style={fieldGridStyle}>
                <CanvasField
                  theme={th}
                  label="當期帳單"
                  hint="最新 invoice snapshot"
                >
                  <div style={bookingWindowStyle}>
                    {latestInvoice
                      ? `${formatMoney(latestInvoice.amount)} · ${latestInvoice.status}`
                      : "尚無帳單"}
                  </div>
                </CanvasField>
                <CanvasField
                  theme={th}
                  label="整合待辦"
                  hint="governance checklist"
                >
                  <div style={bookingWindowStyle}>
                    {governanceChecklistCount > 0
                      ? `${formatCount(governanceChecklistCount)} 項待完成`
                      : "沒有待辦"}
                  </div>
                </CanvasField>
                <CanvasField
                  theme={th}
                  label="通知基線"
                  hint="latest activity snapshot"
                >
                  <div style={bookingWindowStyle}>
                    {data.notifications[0]
                      ? `${data.notifications[0].title} · ${formatDateTime(data.notifications[0].createdAt)}`
                      : "目前沒有新通知"}
                  </div>
                </CanvasField>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
