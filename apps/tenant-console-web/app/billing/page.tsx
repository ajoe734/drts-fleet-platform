import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  MoneyAmount,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantInvoiceRecord,
  TenantQuotaSummary,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatDateInput } from "@/lib/formatters";

export const revalidate = 30;

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

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.65fr)",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
  gap: 16,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const detailItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "10px 12px",
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  background: th.surfaceLo,
};

const labelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const valueStyle: CSSProperties = {
  color: th.text,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.45,
};

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const actionLinkStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  textDecoration: "none",
};

const mutedActionStyle: CSSProperties = {
  ...actionLinkStyle,
  opacity: 0.56,
};

const inlineRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const invoiceRowStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 14,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const linkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontWeight: 600,
};

type BillingPageData = {
  billingProfile: TenantBillingProfile | null;
  invoices: TenantInvoiceRecord[];
  quotaSummary: TenantQuotaSummary | null;
  errors: string[];
};

type BillingSnapshot = {
  periodLabel: string;
  accruedAmount: MoneyAmount | null;
  projectedClose: MoneyAmount | null;
  status: "active" | "past_due" | "suspended" | "not_provisioned";
};

type BillingEmptyState = {
  title: string;
  body: string;
  tone: "info" | "warn" | "danger";
  nextAction?: ResourceActionDescriptor;
};

const EMPTY_REASON_SEQUENCE: EmptyReason[] = [
  "not_provisioned",
  "no_data",
  "filtered_empty",
  "fetch_failed",
  "external_unavailable",
  "permission_denied",
];

const EMPTY_REASON_META: Record<EmptyReason, BillingEmptyState> = {
  not_provisioned: {
    title: "租戶尚未完成帳務配置",
    body: "尚未建立 billing profile，因此 overview 只顯示啟用前引導與後續動作。",
    tone: "info",
    nextAction: {
      action: "billing.profile.create",
      enabled: true,
      riskLevel: "medium",
    },
  },
  no_data: {
    title: "目前沒有可顯示的帳務資料",
    body: "當期尚未累積任何帳款，也沒有 recent invoice summary 可供比對。",
    tone: "info",
  },
  filtered_empty: {
    title: "目前篩選條件下沒有結果",
    body: "Overview 資料仍存在，但目前條件沒有命中 invoice summary 或 usage 切片。",
    tone: "info",
  },
  fetch_failed: {
    title: "帳務資料抓取失敗",
    body: "API 已回錯，畫面保留 refresh tier 與 next action，而不是假裝沒有資料。",
    tone: "warn",
    nextAction: {
      action: "billing.retry",
      enabled: true,
      riskLevel: "low",
    },
  },
  external_unavailable: {
    title: "外部計費來源暫時不可用",
    body: "部分發票或投影金額仍可能顯示，但 current-period snapshot 不應被視為完整權威。",
    tone: "warn",
  },
  permission_denied: {
    title: "目前角色沒有查看帳務內容的權限",
    body: "依 packet 與 role matrix，頁面保留入口但資料區要明確說明 read scope 不足。",
    tone: "danger",
  },
  driver_not_eligible: {
    title: "此空狀態不適用於 tenant billing",
    body: "保留型別相容性；tenant console 不應以 driver_not_eligible 作為 billing empty reason。",
    tone: "info",
  },
};

const CROSS_APP_LINKS: CrossAppResourceLink[] = [
  {
    targetApp: "tenant-console",
    route: "/audit?view=billing",
    resourceType: "audit",
    resourceId: "billing",
    openMode: "same_tab",
    label: "查看租戶稽核軌跡",
  },
  {
    targetApp: "platform-admin",
    route: "/tenants/tenant-demo-001?tab=billing",
    resourceType: "tenant",
    resourceId: "tenant-demo-001",
    openMode: "new_tab",
    label: "在 platform-admin 查看租戶帳務治理",
  },
];

async function loadBillingPageData(): Promise<BillingPageData> {
  const client = getTenantClient();
  const [billingProfile, invoices, quotaSummary] = await Promise.allSettled([
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
  ]);

  const errors: string[] = [];

  if (billingProfile.status === "rejected") {
    errors.push(toErrorMessage("Billing profile", billingProfile.reason));
  }
  if (invoices.status === "rejected") {
    errors.push(toErrorMessage("Invoices", invoices.reason));
  }
  if (quotaSummary.status === "rejected") {
    errors.push(toErrorMessage("Quota", quotaSummary.reason));
  }

  return {
    billingProfile:
      billingProfile.status === "fulfilled" ? billingProfile.value : null,
    invoices: invoices.status === "fulfilled" ? invoices.value : [],
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    errors,
  };
}

function toErrorMessage(label: string, reason: unknown) {
  return `${label}: ${reason instanceof Error ? reason.message : "Unknown error"}`;
}

function formatMoney(value: MoneyAmount | null | undefined) {
  if (!value) return "—";
  const amount = value.amountMinor / 100;
  const prefix = value.currency === "TWD" ? "NT$" : value.currency;
  return `${prefix} ${new Intl.NumberFormat("zh-Hant", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

function formatCount(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-Hant").format(value ?? 0);
}

function formatPeriodLabel(invoice: TenantInvoiceRecord | null) {
  if (!invoice) return "—";
  return `${invoice.periodStart.slice(0, 7)} closing`;
}

function isPastDue(invoice: TenantInvoiceRecord | null) {
  if (!invoice || invoice.status === "paid" || invoice.status === "draft") {
    return false;
  }
  const issuedAt = new Date(invoice.updatedAt);
  if (Number.isNaN(issuedAt.getTime())) {
    return false;
  }
  return Date.now() - issuedAt.getTime() > 1000 * 60 * 60 * 24 * 21;
}

function getBillingSnapshot(
  billingProfile: TenantBillingProfile | null,
  invoices: TenantInvoiceRecord[],
  forcedState: string | null,
): BillingSnapshot {
  const sortedInvoices = [...invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const latestInvoice = sortedInvoices[0] ?? null;
  const openInvoice = sortedInvoices.find(
    (invoice) => invoice.status !== "paid",
  );

  const status =
    forcedState === "suspended"
      ? "suspended"
      : forcedState === "past_due"
        ? "past_due"
        : !billingProfile
          ? "not_provisioned"
          : isPastDue(openInvoice ?? latestInvoice)
            ? "past_due"
            : "active";

  return {
    periodLabel: formatPeriodLabel(latestInvoice),
    accruedAmount: latestInvoice?.amount ?? null,
    projectedClose:
      latestInvoice?.amount ?? (openInvoice ? openInvoice.amount : null),
    status,
  };
}

function buildAvailableActions(
  snapshot: BillingSnapshot,
  emptyReason: EmptyReason | null,
): ResourceActionDescriptor[] {
  if (emptyReason === "permission_denied") {
    return [
      {
        action: "billing.open.invoices",
        enabled: false,
        disabledReasonCode: "RBAC_SCOPE_REQUIRED",
        riskLevel: "low",
      },
    ];
  }

  return [
    {
      action:
        snapshot.status === "not_provisioned"
          ? "billing.profile.create"
          : "billing.profile.edit",
      enabled: true,
      requiresReason: false,
      riskLevel: "medium",
    },
    {
      action: "billing.open.invoices",
      enabled: emptyReason !== "not_provisioned",
      disabledReasonCode:
        emptyReason === "not_provisioned" ? "PROFILE_NOT_READY" : undefined,
      riskLevel: "low",
    },
  ];
}

function mapActionLink(action: ResourceActionDescriptor) {
  switch (action.action) {
    case "billing.profile.create":
    case "billing.profile.edit":
      return {
        href: "/settings#billing-profile",
        label:
          action.action === "billing.profile.create"
            ? "建立 billing profile"
            : "編輯 billing profile",
        description:
          action.riskLevel === "medium"
            ? "medium action · 轉往租戶設定維護聯絡人、抬頭與地址"
            : "更新租戶帳務資料",
      };
    case "billing.open.invoices":
      return {
        href: "/invoices",
        label: "開啟 invoices 明細",
        description: "low action · 進入對帳單清單與 artifact download",
      };
    case "billing.retry":
      return {
        href: "/billing",
        label: "重新整理 overview",
        description: "low action · 依 T5 refresh tier 重新取得資料",
      };
    default:
      return {
        href: "/billing",
        label: action.action,
        description: `${action.riskLevel} action`,
      };
  }
}

function getSnapshotTone(status: BillingSnapshot["status"]) {
  switch (status) {
    case "past_due":
      return "down" as const;
    case "suspended":
      return "down" as const;
    case "not_provisioned":
      return "neutral" as const;
    case "active":
    default:
      return "up" as const;
  }
}

function getSnapshotLabel(status: BillingSnapshot["status"]) {
  switch (status) {
    case "past_due":
      return "past-due watch";
    case "suspended":
      return "suspended";
    case "not_provisioned":
      return "not provisioned";
    case "active":
    default:
      return "current period live";
  }
}

function getSnapshotPillTone(status: BillingSnapshot["status"]) {
  switch (status) {
    case "past_due":
      return "warn" as const;
    case "suspended":
      return "danger" as const;
    case "not_provisioned":
      return "neutral" as const;
    case "active":
    default:
      return "success" as const;
  }
}

function getEmptyReason(searchValue: string | null, hasErrors: boolean) {
  if (
    searchValue &&
    Object.prototype.hasOwnProperty.call(EMPTY_REASON_META, searchValue)
  ) {
    return searchValue as EmptyReason;
  }
  return hasErrors ? "fetch_failed" : null;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadBillingPageData();
  const resolvedSearchParams = await searchParams;
  const emptyParam = Array.isArray(resolvedSearchParams.empty)
    ? resolvedSearchParams.empty[0]
    : resolvedSearchParams.empty;
  const stateParam = Array.isArray(resolvedSearchParams.state)
    ? resolvedSearchParams.state[0]
    : resolvedSearchParams.state;
  const emptyReason = getEmptyReason(
    emptyParam ?? null,
    data.errors.length > 0,
  );
  const snapshot = getBillingSnapshot(
    emptyReason === "not_provisioned" ? null : data.billingProfile,
    emptyReason === "no_data" ? [] : data.invoices,
    stateParam ?? null,
  );
  const availableActions = buildAvailableActions(snapshot, emptyReason);
  const recentInvoices =
    emptyReason === "no_data" || emptyReason === "filtered_empty"
      ? []
      : [...data.invoices]
          .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd))
          .slice(0, 3);
  const quotaSummary =
    emptyReason === "permission_denied" ? null : data.quotaSummary;
  const emptyState = emptyReason ? EMPTY_REASON_META[emptyReason] : null;
  const refreshSummary = `T5 tenant slow · 30s cadence · generated via ISR`;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="帳務概覽"
        subtitle="Billing overview · profile · current period snapshot · invoice handoff"
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 && emptyReason !== "fetch_failed" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分帳務資料未完整載入"
            body={data.errors.join(" / ")}
          />
        ) : null}

        {emptyState ? (
          <CanvasBanner
            theme={th}
            tone={emptyState.tone}
            icon={emptyState.tone === "danger" ? "warn" : "info"}
            title={emptyState.title}
            body={emptyState.body}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Current period"
            value={snapshot.periodLabel}
            deltaTone={getSnapshotTone(snapshot.status)}
            delta={getSnapshotLabel(snapshot.status)}
          />
          <CanvasKPI
            theme={th}
            label="Accrued amount"
            value={formatMoney(snapshot.accruedAmount)}
            deltaTone="neutral"
            delta="billing snapshot"
          />
          <CanvasKPI
            theme={th}
            label="Projected close"
            value={formatMoney(snapshot.projectedClose)}
            deltaTone="neutral"
            delta="current ledger projection"
          />
          <CanvasKPI
            theme={th}
            label="Usage remaining"
            value={
              quotaSummary?.usage.remainingPercent !== null &&
              quotaSummary?.usage.remainingPercent !== undefined
                ? `${quotaSummary.usage.remainingPercent}%`
                : "—"
            }
            deltaTone={
              (quotaSummary?.usage.remainingPercent ?? 100) <= 15
                ? "down"
                : "up"
            }
            delta={quotaSummary?.periodKey ?? "quota unavailable"}
          />
        </div>

        <div style={heroGridStyle}>
          <CanvasCard
            theme={th}
            title="Billing profile"
            subtitle="payment method proxy · billing contact · billing address"
            actions={
              <CanvasPill
                theme={th}
                tone={getSnapshotPillTone(snapshot.status)}
                dot
              >
                {getSnapshotLabel(snapshot.status)}
              </CanvasPill>
            }
          >
            <div style={detailGridStyle}>
              <div style={detailItemStyle}>
                <span style={labelStyle}>Invoice title</span>
                <span style={valueStyle}>
                  {data.billingProfile?.invoiceTitle ?? "尚未設定"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>Billing contact</span>
                <span style={valueStyle}>
                  {data.billingProfile
                    ? `${data.billingProfile.contactName ?? "未指派"} · ${data.billingProfile.email}`
                    : "尚未設定"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>Billing address</span>
                <span style={valueStyle}>
                  {data.billingProfile?.address ?? "未設定地址"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>Tax ID</span>
                <span style={valueStyle}>
                  {data.billingProfile?.taxId ?? "未設定統編"}
                </span>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Available actions"
            subtitle="CTAs rendered from resource action descriptors"
          >
            <div style={actionListStyle}>
              {availableActions.map((action) => {
                const target = mapActionLink(action);
                if (!action.enabled) {
                  return (
                    <div key={action.action} style={mutedActionStyle}>
                      <strong>{target.label}</strong>
                      <span style={{ color: th.textMuted, fontSize: 12 }}>
                        {action.disabledReasonCode ?? "disabled"}
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={action.action}
                    href={target.href}
                    style={actionLinkStyle}
                  >
                    <strong>{target.label}</strong>
                    <span style={{ color: th.textMuted, fontSize: 12 }}>
                      {target.description}
                    </span>
                  </Link>
                );
              })}
              {emptyState?.nextAction &&
              !availableActions.some(
                (action) => action.action === emptyState.nextAction?.action,
              )
                ? (() => {
                    const target = mapActionLink(emptyState.nextAction);
                    return (
                      <Link href={target.href} style={actionLinkStyle}>
                        <strong>{target.label}</strong>
                        <span style={{ color: th.textMuted, fontSize: 12 }}>
                          {target.description}
                        </span>
                      </Link>
                    );
                  })()
                : null}
            </div>
          </CanvasCard>
        </div>

        <div style={contentGridStyle}>
          <div style={stackStyle}>
            <CanvasCard
              theme={th}
              title="Current period snapshot"
              subtitle="quota / usage relative to plan · recent invoice bridge"
            >
              <div style={detailGridStyle}>
                <div style={detailItemStyle}>
                  <span style={labelStyle}>Refresh tier</span>
                  <span style={valueStyle}>{refreshSummary}</span>
                </div>
                <div style={detailItemStyle}>
                  <span style={labelStyle}>Plan quota</span>
                  <span style={valueStyle}>
                    {quotaSummary?.limit.bookingCountLimit !== null
                      ? `${formatCount(quotaSummary?.limit.bookingCountLimit)} 趟 / 月`
                      : quotaSummary?.limit.amountMinorLimit !== null
                        ? formatMoney({
                            amountMinor: quotaSummary.limit.amountMinorLimit,
                            currency: quotaSummary.limit.currency,
                          })
                        : "無上限"}
                  </span>
                </div>
                <div style={detailItemStyle}>
                  <span style={labelStyle}>Confirmed usage</span>
                  <span style={valueStyle}>
                    {quotaSummary
                      ? `${formatCount(quotaSummary.usage.confirmedBookingCount)} 趟`
                      : "—"}
                  </span>
                </div>
                <div style={detailItemStyle}>
                  <span style={labelStyle}>Reserved in flight</span>
                  <span style={valueStyle}>
                    {quotaSummary
                      ? `${formatCount(quotaSummary.usage.pendingReservedBookingCount)} 趟`
                      : "—"}
                  </span>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Recent invoices"
              subtitle="summary rows deep-link to `/invoices` detail surface"
            >
              <div style={listStyle}>
                {recentInvoices.length > 0 ? (
                  recentInvoices.map((invoice) => (
                    <div key={invoice.invoiceId} style={invoiceRowStyle}>
                      <div style={inlineRowStyle}>
                        <strong>{invoice.invoiceId}</strong>
                        <CanvasPill
                          theme={th}
                          tone={
                            invoice.status === "paid"
                              ? "success"
                              : invoice.status === "issued"
                                ? "info"
                                : "neutral"
                          }
                          dot
                        >
                          {invoice.status}
                        </CanvasPill>
                      </div>
                      <span style={{ color: th.textMuted, fontSize: 12 }}>
                        {formatPeriodLabel(invoice)} ·{" "}
                        {formatMoney(invoice.amount)}
                      </span>
                      <div style={inlineRowStyle}>
                        <Link
                          href={`/invoices?period=${invoice.periodStart.slice(0, 7)}`}
                          style={linkStyle}
                        >
                          Open in invoices
                        </Link>
                        {invoice.artifactUrl ? (
                          <a
                            href={invoice.artifactUrl}
                            style={linkStyle}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Signed artifact
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={detailItemStyle}>
                    <span style={labelStyle}>Invoice summary</span>
                    <span style={valueStyle}>
                      {emptyReason === "filtered_empty"
                        ? "目前切片沒有對帳單命中"
                        : "尚未產生 recent invoice summary"}
                    </span>
                  </div>
                )}
              </div>
            </CanvasCard>
          </div>

          <div style={stackStyle}>
            <CanvasCard
              theme={th}
              title="Cross-app deep links"
              subtitle="Q-X03 targets stay explicit and open in a new tab when leaving tenant-console"
            >
              <div style={actionListStyle}>
                {CROSS_APP_LINKS.map((link) => (
                  <a
                    key={`${link.targetApp}:${link.route}`}
                    href={link.route}
                    target={link.openMode === "new_tab" ? "_blank" : undefined}
                    rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
                    style={actionLinkStyle}
                  >
                    <strong>{link.label}</strong>
                    <span style={{ color: th.textMuted, fontSize: 12 }}>
                      {link.targetApp} ·{" "}
                      {link.openMode === "new_tab" ? "new tab" : "same tab"}
                    </span>
                  </a>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="State coverage"
              subtitle="Six EmptyReason states plus billing lifecycle variants stay testable"
            >
              <div style={actionListStyle}>
                {EMPTY_REASON_SEQUENCE.map((reason) => (
                  <Link
                    key={reason}
                    href={`/billing?empty=${reason}`}
                    style={
                      emptyReason === reason
                        ? actionLinkStyle
                        : mutedActionStyle
                    }
                  >
                    <strong>{reason}</strong>
                    <span style={{ color: th.textMuted, fontSize: 12 }}>
                      {EMPTY_REASON_META[reason]!.title}
                    </span>
                  </Link>
                ))}
                <div style={inlineRowStyle}>
                  <Link href="/billing?state=past_due" style={linkStyle}>
                    Simulate past-due
                  </Link>
                  <Link href="/billing?state=suspended" style={linkStyle}>
                    Simulate suspended
                  </Link>
                  <Link href="/billing" style={linkStyle}>
                    Active snapshot
                  </Link>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Authority notes"
              subtitle="overview follows packet behavior while keeping contract-safe data"
            >
              <div style={detailItemStyle}>
                <span style={labelStyle}>Last profile update</span>
                <span style={valueStyle}>
                  {formatDateInput(data.billingProfile?.updatedAt) ?? "—"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>Quota refreshed</span>
                <span style={valueStyle}>
                  {formatDateInput(quotaSummary?.refreshedAt) ?? "—"}
                </span>
              </div>
              <div style={detailItemStyle}>
                <span style={labelStyle}>Contract note</span>
                <span style={valueStyle}>
                  Current shared contract exposes draft / issued / paid only, so
                  past-due is derived from aging issued invoices instead of a
                  distinct backend enum.
                </span>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
