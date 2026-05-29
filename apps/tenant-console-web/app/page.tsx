import type { CSSProperties } from "react";
import type {
  BookingRecord,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  TenantIntegrationGovernancePackage,
  TenantInvoiceRecord,
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
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatCount } from "@/lib/formatters";
import { TENANT_CONSOLE_CONTEXT } from "@/lib/navigation";

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

const ASSIGNED_STATUSES = new Set([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
]);

const BROADCASTING_STATUSES = new Set([
  "created",
  "recording_pending",
  "ready_for_dispatch",
  "preassigned",
  "delayed_queue",
]);

const HOME_QUOTA_CAP = 5_000;

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

const dashboardGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const ordersCardStyle: CSSProperties = {
  flex: "1.4 1 720px",
  minWidth: 0,
};

const remindersCardStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
};

const bookingIdStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
  fontFamily: th.monoFamily,
};

const routeCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const routePrimaryStyle: CSSProperties = {
  color: th.text,
  fontSize: 12.5,
};

const routeSecondaryStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
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

type DashboardData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
};

type HomeBookingRow = BookingRecord & Record<string, unknown>;

type HomeBannerTone = "accent" | "danger" | "info" | "success" | "warn";

type ReminderItem = {
  tone: HomeBannerTone;
  title: string;
  body: string;
  actionLabel: string;
};

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

function isActiveBooking(booking: BookingRecord) {
  return (
    booking.orderStatus !== "completed" && booking.orderStatus !== "cancelled"
  );
}

function formatIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const weekdayFormatter = new Intl.DateTimeFormat("zh-Hant", {
  weekday: "short",
});

const dateTimeCellFormatter = new Intl.DateTimeFormat("zh-Hant", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDashboardDate(value: Date) {
  return `${formatIsoDate(value)} (${weekdayFormatter.format(value)})`;
}

function formatWindow(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return dateTimeCellFormatter.format(parsed);
}

function formatCurrencyCompact(
  value: TenantInvoiceRecord["amount"] | null | undefined,
) {
  if (!value) {
    return "—";
  }

  const currencyLabel = value.currency === "TWD" ? "NT$" : value.currency;
  return `${currencyLabel} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value.amountMinor / 100)}`;
}

function formatPeriod(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return value.slice(0, 7);
}

function formatPercent(value: number, total: number) {
  if (total <= 0) {
    return "0";
  }
  return Math.min(100, Math.round((value / total) * 100)).toString();
}

function startOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0,
  );
}

function isWithinDay(value: string, dayStart: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const nextDay = new Date(dayStart);
  nextDay.setDate(dayStart.getDate() + 1);

  return parsed >= dayStart && parsed < nextDay;
}

function getHomeStateMeta(
  status: BookingRecord["orderStatus"],
): { label: string; tone: CanvasTone } {
  if (ATTENTION_STATUSES.has(status)) {
    return { label: "attention", tone: "warn" };
  }
  if (ASSIGNED_STATUSES.has(status)) {
    return status === "on_trip"
      ? { label: "on_trip", tone: "accent" }
      : { label: "assigned", tone: "success" };
  }
  if (BROADCASTING_STATUSES.has(status)) {
    return { label: "broadcasting", tone: "info" };
  }
  if (status === "completed") {
    return { label: "completed", tone: "success" };
  }
  if (status === "cancelled") {
    return { label: "cancelled", tone: "neutral" };
  }
  return { label: status, tone: "info" };
}

function getInvoiceStatusLabel(status: TenantInvoiceRecord["status"]) {
  switch (status) {
    case "paid":
      return "已付款";
    case "issued":
      return "待確認";
    case "draft":
    default:
      return "草稿";
  }
}

function getInvoiceDeltaTone(
  status: TenantInvoiceRecord["status"] | undefined,
) {
  switch (status) {
    case "paid":
      return "up" as const;
    case "draft":
      return "down" as const;
    case "issued":
    default:
      return "neutral" as const;
  }
}

function getNotificationTone(
  notification: NotificationRecord,
): HomeBannerTone {
  switch (notification.channel) {
    case "tenant_approval":
    case "tenant_sla":
      return "warn";
    case "driver_task":
      return "accent";
    case "ops_notice":
    default:
      return "info";
  }
}

function buildReminderItems(input: {
  attentionBookings: BookingRecord[];
  openInvoices: TenantInvoiceRecord[];
  allInvoices: TenantInvoiceRecord[];
  onboardingChecklist: string[];
  notifications: NotificationRecord[];
  flagNotes: string[];
}): ReminderItem[] {
  const items: ReminderItem[] = [];

  if (input.attentionBookings.length > 0) {
    const first = input.attentionBookings[0];
    items.push({
      tone: "warn",
      title: `${formatCount(input.attentionBookings.length)} 筆進行中訂單需要跟進`,
      body: `${first.bookingId} · ${first.passenger.name} · ${first.pickup.address}`,
      actionLabel: "前往叫車",
    });
  }

  const currentInvoice = input.openInvoices[0] ?? input.allInvoices[0] ?? null;
  if (currentInvoice) {
    items.push({
      tone: currentInvoice.status === "draft" ? "warn" : "info",
      title: `${formatPeriod(currentInvoice.periodStart)} 對帳單 ${getInvoiceStatusLabel(currentInvoice.status)}`,
      body: `${formatCurrencyCompact(currentInvoice.amount)} · ${currentInvoice.lines.length} 筆行程`,
      actionLabel: "查看帳單",
    });
  }

  if (input.onboardingChecklist.length > 0) {
    const firstChecklistItem = input.onboardingChecklist[0] ?? "治理待辦待確認";
    const remaining = input.onboardingChecklist.length - 1;
    items.push({
      tone: "warn",
      title: "整合治理仍有待辦",
      body:
        remaining > 0
          ? `${firstChecklistItem} · 另有 ${formatCount(remaining)} 項`
          : firstChecklistItem,
      actionLabel: "查看整合",
    });
  }

  for (const notification of input.notifications) {
    items.push({
      tone: getNotificationTone(notification),
      title: notification.title,
      body: notification.message,
      actionLabel: "查看提醒",
    });
  }

  if (input.flagNotes.length > 0) {
    const firstFlagNote = input.flagNotes[0] ?? "租戶功能狀態已更新。";
    items.push({
      tone: "success",
      title: "功能配置已同步",
      body: firstFlagNote,
      actionLabel: "查看設定",
    });
  }

  if (items.length === 0) {
    items.push({
      tone: "success",
      title: "目前沒有待處理提醒",
      body: "租戶工作面、整合治理與帳務快照皆未回報新的阻塞項目。",
      actionLabel: "重新整理",
    });
  }

  return items.slice(0, 3);
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const bookings = [...data.bookings].sort((left, right) =>
    left.reservationWindowStart.localeCompare(right.reservationWindowStart),
  );
  const activeBookings = bookings.filter(isActiveBooking);
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const assignedBookings = activeBookings.filter((booking) =>
    ASSIGNED_STATUSES.has(booking.orderStatus),
  );
  const broadcastingBookings = activeBookings.filter((booking) =>
    BROADCASTING_STATUSES.has(booking.orderStatus),
  );

  const completedTodayCount = bookings.filter(
    (booking) =>
      booking.orderStatus === "completed" && isWithinDay(booking.updatedAt, today),
  ).length;
  const completedYesterdayCount = bookings.filter(
    (booking) =>
      booking.orderStatus === "completed" &&
      isWithinDay(booking.updatedAt, yesterday),
  ).length;
  const completedDelta = completedTodayCount - completedYesterdayCount;

  const currentMonthKey = formatPeriod(now.toISOString());
  const monthlyUsageCount = bookings.filter(
    (booking) => formatPeriod(booking.reservationWindowStart) === currentMonthKey,
  ).length;
  const quotaRemaining = Math.max(HOME_QUOTA_CAP - monthlyUsageCount, 0);

  const allInvoices = [...data.invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const openInvoices = allInvoices.filter((invoice) => invoice.status !== "paid");
  const currentInvoice = openInvoices[0] ?? allInvoices[0] ?? null;

  const unreadNotifications = data.notifications.filter(
    (notification) => notification.status !== "read",
  ).length;
  const recentNotifications = [...data.notifications]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3);
  const enabledFlags =
    data.featureFlags?.flags.filter((flag) => flag.enabled) ?? [];
  const onboardingChecklist = data.governance?.onboardingChecklist ?? [];
  const reminderItems = buildReminderItems({
    attentionBookings,
    openInvoices,
    allInvoices,
    onboardingChecklist,
    notifications: recentNotifications,
    flagNotes: data.featureFlags?.notes ?? [],
  });

  const workspaceHint = [
    data.identity?.tenantId ?? "tenant-unavailable",
    data.identity?.actorType ?? "actor-unavailable",
    data.identity?.authMode ?? "auth-unavailable",
  ].join(" · ");

  const tableColumns: CanvasTableColumn<HomeBookingRow>[] = [
    {
      h: "BK",
      w: 120,
      mono: true,
      r: (row) => <span style={bookingIdStyle}>{row.bookingId}</span>,
    },
    {
      h: "PASS.",
      w: 120,
      r: (row) => row.passenger.name,
    },
    {
      h: "PICKUP",
      w: 340,
      r: (row) => (
        <div style={routeCellStyle}>
          <span style={routePrimaryStyle}>{row.pickup.address}</span>
          <span style={routeSecondaryStyle}>↓ {row.dropoff.address}</span>
        </div>
      ),
    },
    {
      h: "WIN",
      w: 130,
      mono: true,
      r: (row) => formatWindow(row.reservationWindowStart),
    },
    {
      h: "STATE",
      w: 130,
      r: (row) => {
        const meta = getHomeStateMeta(row.orderStatus);
        return (
          <CanvasPill theme={th} tone={meta.tone} dot>
            {meta.label}
          </CanvasPill>
        );
      },
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={`您好，${TENANT_CONSOLE_CONTEXT}`}
        subtitle={`${formatDashboardDate(now)} · 本月配額 ${formatCount(monthlyUsageCount)} / ${formatCount(HOME_QUOTA_CAP)} 趟`}
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
            tone="danger"
            icon="warn"
            title="部分首頁資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="進行中"
            value={formatCount(activeBookings.length)}
            sub={`${formatCount(broadcastingBookings.length)} broadcasting · ${formatCount(assignedBookings.length)} assigned`}
          />
          <CanvasKPI
            theme={th}
            label="今日已完成"
            value={formatCount(completedTodayCount)}
            delta={
              completedDelta === 0
                ? undefined
                : `${completedDelta > 0 ? "↑" : "↓"} ${formatCount(Math.abs(completedDelta))}`
            }
            deltaTone={
              completedDelta > 0
                ? "up"
                : completedDelta < 0
                  ? "down"
                  : "neutral"
            }
            sub={
              completedTodayCount > 0
                ? "今日已結束的租戶行程"
                : "今日尚無完成訂單"
            }
          />
          <CanvasKPI
            theme={th}
            label="本月用量"
            value={formatCount(monthlyUsageCount)}
            sub={`${formatPercent(monthlyUsageCount, HOME_QUOTA_CAP)}% of ${formatCount(HOME_QUOTA_CAP)}`}
            hint={`剩餘 ${formatCount(quotaRemaining)} 趟`}
          />
          <CanvasKPI
            theme={th}
            label="當期帳單"
            value={formatCurrencyCompact(currentInvoice?.amount)}
            delta={
              currentInvoice ? getInvoiceStatusLabel(currentInvoice.status) : undefined
            }
            deltaTone={getInvoiceDeltaTone(currentInvoice?.status)}
            sub={
              currentInvoice
                ? `${formatPeriod(currentInvoice.periodStart)} · ${formatCount(currentInvoice.lines.length)} 筆`
                : "目前沒有帳單資料"
            }
          />
        </div>

        <div style={dashboardGridStyle}>
          <CanvasCard
            theme={th}
            title="進行中訂單"
            padding={0}
            actions={
              <CanvasBtn theme={th} variant="ghost" size="sm">
                前往叫車
              </CanvasBtn>
            }
            style={ordersCardStyle}
          >
            {activeBookings.length > 0 ? (
              <CanvasTable<HomeBookingRow>
                theme={th}
                columns={tableColumns}
                rows={activeBookings.slice(0, 5) as HomeBookingRow[]}
              />
            ) : (
              <div style={emptyStateStyle}>
                目前沒有進行中的租戶訂單，新的預約會從這裡開始追蹤。
              </div>
            )}
          </CanvasCard>

          <CanvasCard theme={th} title="提醒" style={remindersCardStyle}>
            <div style={bannerStackStyle}>
              {reminderItems.map((item, index) => (
                <CanvasBanner
                  key={`${item.title}-${index}`}
                  theme={th}
                  tone={item.tone}
                  icon={item.tone === "success" ? "check" : "warn"}
                  title={item.title}
                  body={item.body}
                  actions={
                    <CanvasBtn
                      theme={th}
                      variant={index === 0 ? "secondary" : "ghost"}
                      size="sm"
                    >
                      {item.actionLabel}
                    </CanvasBtn>
                  }
                />
              ))}
            </div>

            <div style={{ height: 16 }} />

            <CanvasField
              theme={th}
              label="工作面摘要"
              hint={workspaceHint}
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    k: "租戶",
                    v: data.identity?.tenantId ?? "—",
                    mono: true,
                  },
                  {
                    k: "角色",
                    v: data.identity?.actorType ?? "—",
                    mono: true,
                  },
                  {
                    k: "啟用功能",
                    v: `${formatCount(enabledFlags.length)} 項`,
                    mono: true,
                  },
                  {
                    k: "治理待辦",
                    v:
                      onboardingChecklist.length > 0
                        ? `${formatCount(onboardingChecklist.length)} 項`
                        : "就緒",
                    mono: true,
                  },
                  {
                    k: "未讀提醒",
                    v: `${formatCount(unreadNotifications)} 筆`,
                    mono: true,
                  },
                  {
                    k: "剩餘配額",
                    v: `${formatCount(quotaRemaining)} 趟`,
                    mono: true,
                  },
                ]}
              />
            </CanvasField>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
