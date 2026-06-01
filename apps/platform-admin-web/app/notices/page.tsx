"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
  EmptyReason,
  EmptyStateEnvelope,
  PlatformNoticeActionReceipt,
  PlatformNoticeAudience,
  PlatformNoticeHistoryRecord,
  PlatformNoticeSeverity,
  PlatformNoticeWorkspaceRecord,
  PlatformNoticesWorkspaceResponse,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const SEVERITY_OPTIONS: PlatformNoticeSeverity[] = [
  "info",
  "warning",
  "critical",
  "maintenance",
];

const AUDIENCE_OPTIONS: PlatformNoticeAudience[] = [
  "all",
  "tenants",
  "ops",
  "drivers",
];

const TIER_META: Record<
  RefreshTier,
  { label: string; cadence: string; pollMs: number | null }
> = {
  urgent: { label: "T0 Urgent", cadence: "push + 5s fallback", pollMs: 5000 },
  fast: { label: "T1 Fast", cadence: "3s", pollMs: 3000 },
  dispatch: { label: "T2 Dispatch", cadence: "5s", pollMs: 5000 },
  medium: { label: "T3 Medium", cadence: "15s", pollMs: 15000 },
  medium_slow: {
    label: "T4 Admin medium-slow",
    cadence: "30s",
    pollMs: 30000,
  },
  slow: { label: "T5 Slow", cadence: "30s", pollMs: 30000 },
  manual: { label: "T6 Manual", cadence: "manual", pollMs: null },
};

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const bodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const tabsStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
} satisfies CSSProperties;

const contentGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)",
} satisfies CSSProperties;

const splitGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
} satisfies CSSProperties;

const maintenanceGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.9fr)",
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
} satisfies CSSProperties;

const mutedTextStyle = {
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const subtleMonoStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  lineHeight: 1.45,
} satisfies CSSProperties;

const codeStyle = {
  display: "inline-flex",
  padding: "2px 7px",
  borderRadius: 999,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
} satisfies CSSProperties;

const inputStyle = (th: CanvasTheme): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "9px 10px",
  outline: "none",
});

const textAreaStyle = (th: CanvasTheme): CSSProperties => ({
  ...inputStyle(th),
  resize: "vertical",
  minHeight: 104,
});

const tabButtonStyle = (th: CanvasTheme, active: boolean): CSSProperties => ({
  display: "inline-flex",
  gap: 8,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 999,
  border: `1px solid ${active ? th.accent : th.border}`,
  background: active ? th.surfaceLo : th.bg,
  color: active ? th.accent : th.text,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
});

const alertStripStyle = (highRisk: boolean): CSSProperties => ({
  display: "grid",
  gap: 4,
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid ${
    highRisk ? "rgba(220, 38, 38, 0.2)" : "rgba(37, 99, 235, 0.18)"
  }`,
  background: highRisk
    ? "linear-gradient(135deg, rgba(255,241,242,0.96), rgba(255,255,255,0.98))"
    : "linear-gradient(135deg, rgba(239,246,255,0.96), rgba(255,255,255,0.98))",
  color: highRisk ? "#7f1d1d" : "#1d4ed8",
  fontSize: 12,
  lineHeight: 1.45,
});

const previewBannerStyle = {
  display: "grid",
  gap: 8,
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(220, 38, 38, 0.18)",
  background: "linear-gradient(135deg, rgba(255,241,242,0.96), #ffffff)",
} satisfies CSSProperties;

const linkStackStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const linkRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  textDecoration: "none",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
} satisfies CSSProperties;

const blockedListStyle = {
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const blockedItemStyle = {
  display: "grid",
  gap: 6,
  padding: 10,
  borderRadius: 10,
  border: `1px dashed ${theme.border}`,
  background: theme.surfaceLo,
} satisfies CSSProperties;

const emptyCardBodyStyle = {
  display: "grid",
  gap: 8,
  justifyItems: "start",
} satisfies CSSProperties;

const modalScrimStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(15, 23, 42, 0.46)",
} satisfies CSSProperties;

const modalCardStyle = {
  width: "min(560px, 100%)",
  display: "grid",
  gap: 16,
  padding: 20,
  borderRadius: 18,
  background: "#ffffff",
  border: `1px solid ${theme.border}`,
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.2)",
} satisfies CSSProperties;

type TabId = "notices" | "maintenance" | "history";

type ActionTarget =
  | { kind: "create"; descriptor: ResourceActionDescriptor }
  | {
      kind: "resolve";
      descriptor: ResourceActionDescriptor;
      notice: PlatformNoticeWorkspaceRecord;
    }
  | {
      kind: "maintenance";
      descriptor: ResourceActionDescriptor;
      enabled: boolean;
    };

type MaintenanceActionMap = {
  setAction: ResourceActionDescriptor | null;
  clearAction: ResourceActionDescriptor | null;
};

type NoticeTableRow = PlatformNoticeWorkspaceRecord & Record<string, unknown>;
type HistoryTableRow = PlatformNoticeHistoryRecord & Record<string, unknown>;

const TAB_DEFS: Array<{ id: TabId; label: string }> = [
  { id: "notices", label: "Notices" },
  { id: "maintenance", label: "Maintenance Mode" },
  { id: "history", label: "Broadcast History" },
];

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformGroup: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台成員",
          fleetGroup: "車隊與合規",
          fleet: "車隊與合規",
          switchboard: "外部資訊與標牌",
          pricingGroup: "定價與結算",
          pricing: "定價治理",
          payments: "結算治理",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "Adapter registry",
        };

  return [
    { divider: labels.workspace },
    { key: "home", label: labels.home, href: "/", icon: "dashboard" },
    { key: "health", label: labels.health, href: "/health", icon: "health" },
    { divider: labels.tenantGroup },
    {
      key: "tenants",
      label: labels.tenants,
      href: "/tenants",
      icon: "tenants",
    },
    {
      key: "partners",
      label: labels.partners,
      href: "/partners",
      icon: "partners",
    },
    { key: "users", label: labels.users, href: "/users", icon: "users" },
    { divider: labels.fleetGroup },
    { key: "fleet", label: labels.fleet, href: "/fleet", icon: "fleet" },
    {
      key: "switchboard",
      label: labels.switchboard,
      href: "/switchboard",
      icon: "switchboard",
    },
    { divider: labels.pricingGroup },
    {
      key: "pricing",
      label: labels.pricing,
      href: "/pricing",
      icon: "pricing",
    },
    {
      key: "payments",
      label: labels.payments,
      href: "/payments",
      icon: "payments",
    },
    { divider: labels.platformGroup },
    { key: "notices", label: labels.notices, href: "/notices", icon: "notice" },
    { key: "audit", label: labels.audit, href: "/audit", icon: "audit" },
    {
      key: "flags",
      label: labels.flags,
      href: "/feature-flags",
      icon: "flags",
    },
    {
      key: "adapters",
      label: labels.adapters,
      href: "/adapter-registry",
      icon: "settings",
    },
  ];
}

export default function NoticesPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [workspace, setWorkspace] =
    useState<PlatformNoticesWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("notices");
  const [receipt, setReceipt] = useState<PlatformNoticeActionReceipt | null>(
    null,
  );
  const [pendingAction, setPendingAction] = useState<ActionTarget | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeSeverity, setNoticeSeverity] =
    useState<PlatformNoticeSeverity>("info");
  const [noticeAudience, setNoticeAudience] =
    useState<PlatformNoticeAudience>("all");
  const [noticeScheduledAt, setNoticeScheduledAt] = useState("");

  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintReason, setMaintReason] = useState("");
  const [maintScheduledStart, setMaintScheduledStart] = useState("");
  const [maintScheduledEnd, setMaintScheduledEnd] = useState("");

  const tierMeta = useMemo(
    () => TIER_META[workspace?.refreshTier ?? "medium_slow"],
    [workspace?.refreshTier],
  );

  const loadWorkspace = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const next = await client.getPlatformNoticesWorkspace();
        setWorkspace(next);
        setMaintEnabled(next.maintenance.currentState.enabled);
        setMaintReason(next.maintenance.currentState.reason ?? "");
        setMaintScheduledStart(
          next.maintenance.currentState.scheduledStart?.slice(0, 16) ?? "",
        );
        setMaintScheduledEnd(
          next.maintenance.currentState.scheduledEnd?.slice(0, 16) ?? "",
        );
      } catch (nextError: unknown) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!workspace || tierMeta.pollMs === null) return;
    const timer = window.setInterval(() => {
      void loadWorkspace("refresh");
    }, tierMeta.pollMs);
    return () => window.clearInterval(timer);
  }, [loadWorkspace, tierMeta.pollMs, workspace]);

  function openAction(target: ActionTarget) {
    setReasonDraft("");
    setPendingAction(target);
  }

  function closePendingAction() {
    setPendingAction(null);
    setReasonDraft("");
  }

  async function submitPendingAction() {
    if (!pendingAction) return;
    if (
      actionRequiresReason(pendingAction, noticeSeverity) &&
      !reasonDraft.trim()
    ) {
      return;
    }

    setSubmitting(true);
    try {
      let nextReceipt: PlatformNoticeActionReceipt;
      if (pendingAction.kind === "resolve") {
        nextReceipt = await client.resolvePlatformNotice(
          pendingAction.notice.noticeId,
          reasonDraft.trim() ? { reason: reasonDraft.trim() } : undefined,
        );
      } else if (pendingAction.kind === "maintenance") {
        nextReceipt = await client.setMaintenanceMode({
          enabled: pendingAction.enabled,
          reason: reasonDraft.trim() || maintReason.trim(),
          scheduledStart: maintScheduledStart || null,
          scheduledEnd: maintScheduledEnd || null,
        });
      } else {
        nextReceipt = await client.createPlatformNotice({
          title: noticeTitle.trim(),
          body: noticeBody.trim(),
          severity: noticeSeverity,
          targetAudience: noticeAudience,
          reason: reasonDraft.trim() || null,
          scheduledAt: noticeScheduledAt || null,
        });
        setNoticeTitle("");
        setNoticeBody("");
        setNoticeSeverity("info");
        setNoticeAudience("all");
        setNoticeScheduledAt("");
      }

      setReceipt(nextReceipt);
      closePendingAction();
      await loadWorkspace("refresh");
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const notices = workspace?.notices.items ?? [];
  const history = workspace?.history.items ?? [];
  const maintenance = workspace?.maintenance.currentState;
  const maintenanceActions = getMaintenanceActions(
    workspace?.maintenance.availableActions,
  );
  const maintenanceIntentAction = getMaintenanceIntentAction(
    maintenanceActions,
    maintEnabled,
  );
  const createNoticeAction = workspace?.notices.availableActions.find(
    (descriptor) => descriptor.action === "create_notice",
  );
  const primaryHeaderAction =
    activeTab === "notices"
      ? (createNoticeAction ?? null)
      : activeTab === "maintenance"
        ? maintenanceIntentAction
        : null;
  const scheduledCount = notices.filter(
    (item) => item.status === "scheduled",
  ).length;
  const propagatingCount = notices.filter(
    (item) => item.broadcastStatus === "propagating",
  ).length;
  const deliveredHistoryCount = history.filter(
    (item) => item.deliveryStatus === "delivered",
  ).length;
  const dataFreshness = workspace?.refresh.dataFreshness ?? "unknown";
  const noticeColumns = useMemo(
    () => buildNoticeColumns(locale, openAction),
    [locale],
  );
  const historyColumns = useMemo(() => buildHistoryColumns(locale), [locale]);
  const searchPlaceholder =
    locale === "en"
      ? "Search notice ids, audience, or audit traces…"
      : "搜尋公告編號、受眾或稽核軌跡…";

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale)}
      active="notices"
      currentPath="/notices"
      breadcrumb={[
        locale === "en" ? "Platform ops / risk" : "平台維運 / 風險治理",
        locale === "en" ? "Notices & maintenance" : "公告與維護",
      ]}
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      searchPlaceholder={searchPlaceholder}
      avatarLabel={locale === "en" ? "PA" : "平台"}
      env="production"
      versionLabel="canvas"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title="Notices & Maintenance"
        subtitle={`Critical and maintenance severity fan out cross-app banners to ops, tenant, and driver surfaces. Refresh tier ${tierMeta.label} (${tierMeta.cadence}).`}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              icon="arrow"
              onClick={() => void loadWorkspace("refresh")}
            >
              {refreshing ? "Refreshing..." : t("common.refresh")}
            </CanvasBtn>
            {primaryHeaderAction ? (
              <CanvasBtn
                theme={theme}
                variant="primary"
                icon={
                  activeTab === "maintenance"
                    ? maintEnabled
                      ? "warn"
                      : "plus"
                    : "plus"
                }
                onClick={() =>
                  handleHeaderAction(
                    primaryHeaderAction,
                    activeTab,
                    maintEnabled,
                    openAction,
                  )
                }
              >
                {actionLabel(primaryHeaderAction.action)}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={bodyStyle}>
        <div style={tabsStyle}>
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={tabButtonStyle(theme, activeTab === tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              <CanvasPill
                theme={theme}
                tone={activeTab === tab.id ? "accent" : "neutral"}
              >
                {tab.id === "notices"
                  ? String(notices.length)
                  : tab.id === "maintenance"
                    ? maintenance?.enabled
                      ? "ON"
                      : "OFF"
                    : String(history.length)}
              </CanvasPill>
            </button>
          ))}
        </div>

        {receipt ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="audit"
            title={receipt.message}
            body={
              <span>
                audit <span style={codeStyle}>{receipt.auditId}</span> · action{" "}
                <span style={codeStyle}>{receipt.actionId}</span> ·{" "}
                {receipt.status}
                {" · "}
                <a
                  href={`/audit?auditId=${receipt.auditId}`}
                  style={{ color: theme.accent }}
                >
                  View audit
                </a>
              </span>
            }
          />
        ) : null}

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title="Request error"
            body={error}
          />
        ) : null}

        {maintenance?.enabled ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Maintenance mode is active"
            body={`${maintenance.reason || t("notices.maintActive")} · updated ${formatDateTime(maintenance.updatedAt)}`}
          />
        ) : null}

        {workspace ? (
          <>
            <div style={splitGridStyle}>
              <CanvasKPI
                theme={theme}
                label="Live workspace"
                value={`${notices.length}`}
                hint={`${scheduledCount} scheduled · ${history.length} history rows`}
              />
              <CanvasKPI
                theme={theme}
                label="Delivery state"
                value={formatPlatformCodeLabel(locale, dataFreshness)}
                hint={`source ${workspace.refresh.source} · stale after ${workspace.refresh.staleAfterMs} ms`}
              />
              <CanvasKPI
                theme={theme}
                label="Critical in flight"
                value={`${propagatingCount}`}
                hint="Broadcasts still propagating to downstream apps"
              />
              <CanvasKPI
                theme={theme}
                label="Delivered history"
                value={`${deliveredHistoryCount}/${history.length || 0}`}
                hint="Completed broadcast receipts"
              />
            </div>

            {activeTab === "notices" ? (
              <NoticesTab
                locale={locale}
                t={t}
                workspace={workspace}
                notices={notices}
                columns={noticeColumns}
                createAction={createNoticeAction}
                noticeTitle={noticeTitle}
                noticeBody={noticeBody}
                noticeSeverity={noticeSeverity}
                noticeAudience={noticeAudience}
                noticeScheduledAt={noticeScheduledAt}
                onTitleChange={setNoticeTitle}
                onBodyChange={setNoticeBody}
                onSeverityChange={setNoticeSeverity}
                onAudienceChange={setNoticeAudience}
                onScheduledAtChange={setNoticeScheduledAt}
                onOpenCreate={(descriptor) =>
                  openAction({ kind: "create", descriptor })
                }
              />
            ) : null}

            {activeTab === "maintenance" ? (
              <MaintenanceTab
                locale={locale}
                maintenance={workspace.maintenance}
                maintenanceIntentAction={maintenanceIntentAction}
                maintEnabled={maintEnabled}
                maintReason={maintReason}
                maintScheduledStart={maintScheduledStart}
                maintScheduledEnd={maintScheduledEnd}
                onMaintEnabledChange={setMaintEnabled}
                onMaintReasonChange={setMaintReason}
                onMaintScheduledStartChange={setMaintScheduledStart}
                onMaintScheduledEndChange={setMaintScheduledEnd}
                onOpenAction={(descriptor) =>
                  openAction({
                    kind: "maintenance",
                    descriptor,
                    enabled: maintEnabled,
                  })
                }
              />
            ) : null}

            {activeTab === "history" ? (
              <HistoryTab
                locale={locale}
                workspace={workspace}
                history={history}
                columns={historyColumns}
              />
            ) : null}
          </>
        ) : loading ? (
          <CanvasCard
            theme={theme}
            title={t("notices.title")}
            subtitle={t("notices.loading")}
          >
            <div style={mutedTextStyle}>{t("notices.loading")}</div>
          </CanvasCard>
        ) : null}
      </div>

      {pendingAction ? (
        <div style={modalScrimStyle}>
          <div style={modalCardStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <CanvasPill
                theme={theme}
                tone={
                  getPendingActionRiskLevel(pendingAction, noticeSeverity) ===
                  "high"
                    ? "danger"
                    : "accent"
                }
              >
                {formatPlatformCodeLabel(
                  locale,
                  getPendingActionRiskLevel(pendingAction, noticeSeverity),
                )}{" "}
                risk
              </CanvasPill>
              <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>
                {actionLabel(pendingAction.descriptor.action)}
              </div>
              <div style={mutedTextStyle}>{actionHelpText(pendingAction)}</div>
            </div>

            {pendingAction.kind === "create" ? (
              <div style={previewBannerStyle}>
                <div style={{ fontWeight: 700, color: "#7f1d1d" }}>
                  {noticeTitle.trim() || "Untitled notice"}
                </div>
                <div style={{ color: theme.text, lineHeight: 1.5 }}>
                  {noticeBody.trim() || "Add notice body before publishing."}
                </div>
              </div>
            ) : null}

            <textarea
              value={reasonDraft}
              onChange={(event) => setReasonDraft(event.target.value)}
              rows={4}
              placeholder={
                actionRequiresReason(pendingAction, noticeSeverity)
                  ? "Required reason"
                  : "Optional audit note"
              }
              style={textAreaStyle(theme)}
            />

            <div style={actionRowStyle}>
              <CanvasBtn
                theme={theme}
                variant="secondary"
                onClick={closePendingAction}
              >
                {t("common.cancel")}
              </CanvasBtn>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => void submitPendingAction()}
                disabled={
                  submitting ||
                  !canSubmitAction(
                    pendingAction,
                    reasonDraft,
                    noticeTitle,
                    noticeBody,
                    noticeSeverity,
                  )
                }
              >
                {submitting
                  ? t("notices.updating")
                  : actionLabel(pendingAction.descriptor.action)}
              </CanvasBtn>
            </div>
          </div>
        </div>
      ) : null}
    </CanvasShell>
  );
}

function NoticesTab(props: {
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
  workspace: PlatformNoticesWorkspaceResponse;
  notices: PlatformNoticeWorkspaceRecord[];
  columns: CanvasTableColumn<NoticeTableRow>[];
  createAction?: ResourceActionDescriptor | undefined;
  noticeTitle: string;
  noticeBody: string;
  noticeSeverity: PlatformNoticeSeverity;
  noticeAudience: PlatformNoticeAudience;
  noticeScheduledAt: string;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSeverityChange: (value: PlatformNoticeSeverity) => void;
  onAudienceChange: (value: PlatformNoticeAudience) => void;
  onScheduledAtChange: (value: string) => void;
  onOpenCreate: (descriptor: ResourceActionDescriptor) => void;
}) {
  const hasRows = props.workspace.notices.items.length > 0;

  return (
    <section style={contentGridStyle}>
      <div style={{ display: "grid", gap: 16 }}>
        <CanvasCard
          theme={theme}
          title="Create platform notice"
          subtitle="critical / maintenance severity requires reason and returns an audit-linked receipt"
          actions={
            props.createAction ? (
              <DescriptorButton
                descriptor={props.createAction}
                tone="primary"
                onClick={props.onOpenCreate}
              />
            ) : null
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={alertStripStyle(
                createNoticeRequiresReason(props.noticeSeverity),
              )}
            >
              <strong>
                {createNoticeRequiresReason(props.noticeSeverity)
                  ? "High-risk publish path"
                  : "Standard publish path"}
              </strong>
              <span>
                {createNoticeRequiresReason(props.noticeSeverity)
                  ? "The confirmation modal will require a reason and fan out cross-app banner state."
                  : "Info and warning notices can publish without a mandatory reason."}
              </span>
            </div>

            <div style={fieldGridStyle}>
              <CanvasField theme={theme} label={props.t("notices.form.title")}>
                <input
                  value={props.noticeTitle}
                  onChange={(event) => props.onTitleChange(event.target.value)}
                  style={inputStyle(theme)}
                />
              </CanvasField>
              <CanvasField
                theme={theme}
                label={props.t("notices.form.severity")}
              >
                <select
                  value={props.noticeSeverity}
                  onChange={(event) =>
                    props.onSeverityChange(
                      event.target.value as PlatformNoticeSeverity,
                    )
                  }
                  style={inputStyle(theme)}
                >
                  {SEVERITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(props.locale, option)}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField
                theme={theme}
                label={props.t("notices.form.audience")}
              >
                <select
                  value={props.noticeAudience}
                  onChange={(event) =>
                    props.onAudienceChange(
                      event.target.value as PlatformNoticeAudience,
                    )
                  }
                  style={inputStyle(theme)}
                >
                  {AUDIENCE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatPlatformCodeLabel(props.locale, option)}
                    </option>
                  ))}
                </select>
              </CanvasField>
              <CanvasField theme={theme} label="Scheduled start">
                <input
                  type="datetime-local"
                  value={props.noticeScheduledAt}
                  onChange={(event) =>
                    props.onScheduledAtChange(event.target.value)
                  }
                  style={inputStyle(theme)}
                />
              </CanvasField>
            </div>

            <CanvasField theme={theme} label={props.t("notices.form.body")}>
              <textarea
                value={props.noticeBody}
                onChange={(event) => props.onBodyChange(event.target.value)}
                rows={5}
                style={textAreaStyle(theme)}
              />
            </CanvasField>
          </div>
        </CanvasCard>

        {hasRows ? (
          <CanvasCard
            theme={theme}
            title="Active and scheduled broadcasts"
            subtitle="title, body, severity, audience, status, delivery state, and cross-app links"
          >
            <CanvasTable
              columns={props.columns}
              rows={props.notices.map((notice) => ({ ...notice }))}
            />
          </CanvasCard>
        ) : (
          <EmptyStateCard
            emptyState={props.workspace.notices.emptyState}
            fallbackAction={props.workspace.notices.availableActions[0]}
            onAction={props.onOpenCreate}
          />
        )}
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <CanvasCard
          theme={theme}
          title="Broadcast policy"
          subtitle="Available actions remain backend-driven"
        >
          <div style={mutedTextStyle}>
            A row with zero enabled actions is read-only. Critical and
            maintenance severities produce cross-app banner propagation to ops,
            tenant, and driver surfaces.
          </div>
        </CanvasCard>
        <LinkCard
          title="Downstream banner targets"
          links={collectNoticeLinks(props.notices)}
        />
      </div>
    </section>
  );
}

function MaintenanceTab(props: {
  locale: Locale;
  maintenance: PlatformNoticesWorkspaceResponse["maintenance"];
  maintenanceIntentAction: ResourceActionDescriptor | null;
  maintEnabled: boolean;
  maintReason: string;
  maintScheduledStart: string;
  maintScheduledEnd: string;
  onMaintEnabledChange: (value: boolean) => void;
  onMaintReasonChange: (value: string) => void;
  onMaintScheduledStartChange: (value: string) => void;
  onMaintScheduledEndChange: (value: string) => void;
  onOpenAction: (descriptor: ResourceActionDescriptor) => void;
}) {
  const maintenance = props.maintenance.currentState;

  return (
    <section style={maintenanceGridStyle}>
      <CanvasCard
        theme={theme}
        title="Maintenance mode · current state"
        subtitle={
          maintenance.enabled
            ? "Platform-wide gate currently enabled"
            : "Platform-wide gate currently disabled"
        }
        actions={
          props.maintenanceIntentAction ? (
            <DescriptorButton
              descriptor={props.maintenanceIntentAction}
              tone="primary"
              onClick={props.onOpenAction}
            />
          ) : null
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <div style={previewBannerStyle}>
            <div style={actionRowStyle}>
              <strong style={{ color: theme.text }}>
                Platform maintenance gate
              </strong>
              <CanvasPill
                theme={theme}
                tone={maintenance.enabled ? "danger" : "success"}
              >
                {maintenance.enabled ? "Enabled" : "Disabled"}
              </CanvasPill>
            </div>
            <div style={mutedTextStyle}>
              Stops dispatch, webhook delivery, partner ingress, and tenant sync
              during the maintenance window.
            </div>
            <label style={{ ...actionRowStyle, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={props.maintEnabled}
                onChange={(event) =>
                  props.onMaintEnabledChange(event.target.checked)
                }
              />
              <span style={mutedTextStyle}>
                Keep the toggle aligned to the intent you want the action
                receipt to apply.
              </span>
            </label>
          </div>

          <div style={fieldGridStyle}>
            <CanvasField theme={theme} label="Current reason">
              <textarea
                value={props.maintReason}
                onChange={(event) =>
                  props.onMaintReasonChange(event.target.value)
                }
                rows={4}
                style={textAreaStyle(theme)}
              />
            </CanvasField>
            <CanvasField theme={theme} label="Scheduled start">
              <input
                type="datetime-local"
                value={props.maintScheduledStart}
                onChange={(event) =>
                  props.onMaintScheduledStartChange(event.target.value)
                }
                style={inputStyle(theme)}
              />
            </CanvasField>
            <CanvasField theme={theme} label="Scheduled end">
              <input
                type="datetime-local"
                value={props.maintScheduledEnd}
                onChange={(event) =>
                  props.onMaintScheduledEndChange(event.target.value)
                }
                style={inputStyle(theme)}
              />
            </CanvasField>
          </div>

          <div style={actionRowStyle}>
            <span style={codeStyle}>
              updated {formatDateTime(maintenance.updatedAt)}
            </span>
            <span style={codeStyle}>
              owner {maintenance.updatedBy ?? "system"}
            </span>
            <span style={codeStyle}>
              window{" "}
              {maintenance.scheduledStart
                ? `${formatDateTime(maintenance.scheduledStart)} → ${formatDateTime(maintenance.scheduledEnd ?? "")}`
                : "not scheduled"}
            </span>
          </div>
        </div>
      </CanvasCard>

      <div style={{ display: "grid", gap: 16 }}>
        <CanvasCard
          theme={theme}
          title="Current maintenance notice (preview)"
          subtitle="Cross-app banner copy"
        >
          <div style={previewBannerStyle}>
            <div style={{ fontWeight: 700, color: "#7f1d1d" }}>
              {props.maintenance.previewTitle}
            </div>
            <div style={{ color: theme.text, lineHeight: 1.5 }}>
              {props.maintenance.previewBody}
            </div>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title="Affected services"
          subtitle="Operational surfaces gated by maintenance mode"
        >
          <div style={actionRowStyle}>
            {props.maintenance.affectedServices.map((service) => (
              <CanvasPill key={service} theme={theme} tone="warn">
                {service}
              </CanvasPill>
            ))}
          </div>
        </CanvasCard>

        <LinkCard
          title="Cross-app deep links"
          links={props.maintenance.crossAppLinks}
        />
      </div>
    </section>
  );
}

function HistoryTab(props: {
  locale: Locale;
  workspace: PlatformNoticesWorkspaceResponse;
  history: PlatformNoticeHistoryRecord[];
  columns: CanvasTableColumn<HistoryTableRow>[];
}) {
  const hasRows = props.workspace.history.items.length > 0;

  return (
    <section style={contentGridStyle}>
      <div style={{ display: "grid", gap: 16 }}>
        {hasRows ? (
          <CanvasCard
            theme={theme}
            title="Broadcast history · cross-app delivery results"
            subtitle="Read-only past notices with delivered audiences and receipt state"
          >
            <CanvasTable
              columns={props.columns}
              rows={props.history.map((record) => ({ ...record }))}
            />
          </CanvasCard>
        ) : (
          <EmptyStateCard emptyState={props.workspace.history.emptyState} />
        )}
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <CanvasCard
          theme={theme}
          title="Read-only history"
          subtitle="Current-state intervention stays on the Notices tab"
        >
          <div style={mutedTextStyle}>
            Broadcast History intentionally does not expose mutation CTAs. Use
            the active notices list for current-state intervention, then follow
            the audit receipt for durable evidence.
          </div>
        </CanvasCard>
        <CanvasCard
          theme={theme}
          title="Delivery contract"
          subtitle="Queued and propagating rows remain visible"
        >
          <div style={mutedTextStyle}>
            Queued rows have not started propagating. Propagating rows indicate
            downstream apps may still be converging until the next refresh tier
            poll completes.
          </div>
        </CanvasCard>
      </div>
    </section>
  );
}

function EmptyStateCard(props: {
  emptyState: EmptyStateEnvelope | undefined;
  fallbackAction?: ResourceActionDescriptor | undefined;
  onAction?: ((descriptor: ResourceActionDescriptor) => void) | undefined;
}) {
  const meta = emptyStateMeta(normalizeEmptyReason(props.emptyState?.reason));
  const nextAction = props.emptyState?.nextAction ?? props.fallbackAction;

  return (
    <CanvasCard
      theme={theme}
      title={meta.title}
      subtitle={meta.kicker}
      actions={
        nextAction && props.onAction ? (
          <DescriptorButton
            descriptor={nextAction}
            tone="secondary"
            onClick={props.onAction}
          />
        ) : null
      }
    >
      <div style={emptyCardBodyStyle}>
        <CanvasPill theme={theme} tone={meta.tone}>
          {meta.icon}
        </CanvasPill>
        <div style={mutedTextStyle}>{meta.body}</div>
        <div style={subtleMonoStyle}>{meta.hint}</div>
        {props.emptyState?.messageCode ? (
          <span style={codeStyle}>{props.emptyState.messageCode}</span>
        ) : null}
      </div>
    </CanvasCard>
  );
}

function LinkCard(props: {
  title: string;
  links: PlatformNoticeWorkspaceRecord["crossAppLinks"];
}) {
  return (
    <CanvasCard
      theme={theme}
      title={props.title}
      subtitle="Operational handoff links open per contract"
    >
      {props.links.length ? (
        <div style={linkStackStyle}>
          {props.links.map((link) => (
            <a
              key={`${link.targetApp}-${link.route}-${link.resourceId}`}
              href={link.route}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel="noreferrer"
              style={linkRowStyle}
            >
              <span style={{ fontWeight: 600 }}>{link.label}</span>
              <span style={subtleMonoStyle}>{link.targetApp}</span>
            </a>
          ))}
        </div>
      ) : (
        <div style={mutedTextStyle}>No downstream links available.</div>
      )}
    </CanvasCard>
  );
}

function DescriptorButton(props: {
  descriptor: ResourceActionDescriptor;
  tone: "primary" | "secondary";
  onClick: (descriptor: ResourceActionDescriptor) => void;
}) {
  return (
    <CanvasBtn
      theme={theme}
      variant={props.tone}
      onClick={() => props.onClick(props.descriptor)}
      disabled={!props.descriptor.enabled}
    >
      {actionLabel(props.descriptor.action)}
    </CanvasBtn>
  );
}

function buildNoticeColumns(
  locale: Locale,
  openAction: (target: ActionTarget) => void,
): CanvasTableColumn<NoticeTableRow>[] {
  return [
    { h: "ID", k: "noticeId", w: 108, mono: true },
    {
      h: "Notice",
      r: (notice) => (
        <div style={{ display: "grid", gap: 4, whiteSpace: "normal" }}>
          <div style={{ fontWeight: 700 }}>{notice.title}</div>
          <div style={mutedTextStyle}>{notice.body}</div>
          <div style={subtleMonoStyle}>
            created {formatDateTime(notice.createdAt)} ·{" "}
            {notice.createdBy ?? "system"}
          </div>
        </div>
      ),
    },
    {
      h: "SEV",
      w: 112,
      r: (notice) => (
        <CanvasPill theme={theme} tone={severityTone(notice.severity)}>
          {formatPlatformCodeLabel(locale, notice.severity)}
        </CanvasPill>
      ),
    },
    {
      h: "Audience",
      w: 110,
      r: (notice) => (
        <CanvasPill theme={theme} tone="info">
          {formatPlatformCodeLabel(locale, notice.targetAudience)}
        </CanvasPill>
      ),
    },
    {
      h: "Status",
      w: 118,
      r: (notice) => (
        <CanvasPill theme={theme} tone={statusTone(notice.status)}>
          {formatPlatformCodeLabel(locale, notice.status)}
        </CanvasPill>
      ),
    },
    {
      h: "Delivery",
      w: 220,
      r: (notice) => (
        <div style={{ display: "grid", gap: 4, whiteSpace: "normal" }}>
          <div>{notice.deliverySummary}</div>
          <div style={subtleMonoStyle}>
            {notice.broadcastStatus} · {formatDateTime(notice.updatedAt)}
          </div>
          {notice.scheduledAt ? (
            <div style={subtleMonoStyle}>
              scheduled {formatDateTime(notice.scheduledAt)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      h: "Deep links",
      w: 220,
      r: (notice) => <CompactLinks links={notice.crossAppLinks} />,
    },
    {
      h: "Actions",
      w: 220,
      r: (notice) => (
        <DescriptorActionGroup
          actions={notice.availableActions}
          onAction={(descriptor) =>
            openAction({
              kind: "resolve",
              descriptor,
              notice,
            })
          }
          emptyLabel="Read-only notice"
        />
      ),
    },
  ];
}

function buildHistoryColumns(
  locale: Locale,
): CanvasTableColumn<HistoryTableRow>[] {
  return [
    { h: "Notice", k: "noticeId", w: 104, mono: true },
    {
      h: "Title",
      r: (record) => (
        <div style={{ display: "grid", gap: 4, whiteSpace: "normal" }}>
          <div style={{ fontWeight: 700 }}>{record.title}</div>
          <div style={subtleMonoStyle}>
            {formatPlatformCodeLabel(locale, record.targetAudience)}
          </div>
        </div>
      ),
    },
    {
      h: "SEV",
      w: 108,
      r: (record) => (
        <CanvasPill theme={theme} tone={severityTone(record.severity)}>
          {formatPlatformCodeLabel(locale, record.severity)}
        </CanvasPill>
      ),
    },
    {
      h: "Targets",
      w: 190,
      r: (record) => (
        <div style={{ whiteSpace: "normal" }}>
          {record.deliveredAudienceLabels.join(" / ")}
        </div>
      ),
    },
    {
      h: "Delivery",
      w: 180,
      r: (record) => (
        <div style={{ display: "grid", gap: 4, whiteSpace: "normal" }}>
          <CanvasPill theme={theme} tone={broadcastTone(record.deliveryStatus)}>
            {record.deliveryDetail}
          </CanvasPill>
          <div style={subtleMonoStyle}>
            {record.deliveredCount}/{record.targetCount} targets
          </div>
        </div>
      ),
    },
    {
      h: "Broadcast at",
      w: 150,
      mono: true,
      r: (record) => formatDateTime(record.broadcastAt),
    },
    {
      h: "Deep links",
      w: 220,
      r: (record) => <CompactLinks links={record.crossAppLinks} />,
    },
  ];
}

function CompactLinks(props: {
  links: PlatformNoticeWorkspaceRecord["crossAppLinks"];
}) {
  if (!props.links.length) {
    return <span style={subtleMonoStyle}>No links</span>;
  }

  return (
    <div style={{ display: "grid", gap: 6, whiteSpace: "normal" }}>
      {props.links.map((link) => (
        <a
          key={`${link.targetApp}-${link.route}-${link.resourceId}`}
          href={link.route}
          target={link.openMode === "new_tab" ? "_blank" : undefined}
          rel="noreferrer"
          style={{ color: theme.accent, textDecoration: "none" }}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function DescriptorActionGroup(props: {
  actions: ResourceActionDescriptor[];
  onAction: (descriptor: ResourceActionDescriptor) => void;
  emptyLabel: string;
}) {
  const enabledActions = props.actions.filter((action) => action.enabled);
  const blockedActions = props.actions.filter((action) => !action.enabled);

  if (!props.actions.length) {
    return <span style={subtleMonoStyle}>{props.emptyLabel}</span>;
  }

  return (
    <div style={blockedListStyle}>
      {enabledActions.length ? (
        <div style={actionRowStyle}>
          {enabledActions.map((descriptor) => (
            <DescriptorButton
              key={descriptor.action}
              descriptor={descriptor}
              tone="secondary"
              onClick={props.onAction}
            />
          ))}
        </div>
      ) : (
        <span style={subtleMonoStyle}>{props.emptyLabel}</span>
      )}

      {blockedActions.map((descriptor) => (
        <div key={descriptor.action} style={blockedItemStyle}>
          <DescriptorButton
            descriptor={descriptor}
            tone="secondary"
            onClick={props.onAction}
          />
          <span style={subtleMonoStyle}>
            {descriptor.disabledReasonCode
              ? formatPlatformCodeLabel("en", descriptor.disabledReasonCode)
              : "Action currently unavailable"}
          </span>
        </div>
      ))}
    </div>
  );
}

function handleHeaderAction(
  descriptor: ResourceActionDescriptor,
  activeTab: TabId,
  maintEnabled: boolean,
  openAction: (target: ActionTarget) => void,
) {
  if (activeTab === "notices") {
    openAction({ kind: "create", descriptor });
    return;
  }

  if (activeTab === "maintenance") {
    openAction({
      kind: "maintenance",
      descriptor,
      enabled: maintEnabled,
    });
  }
}

function getMaintenanceActions(
  actions: ResourceActionDescriptor[] | undefined,
): MaintenanceActionMap {
  return {
    setAction:
      actions?.find(
        (descriptor) => descriptor.action === "set_maintenance_mode",
      ) ?? null,
    clearAction:
      actions?.find(
        (descriptor) => descriptor.action === "clear_maintenance_mode",
      ) ?? null,
  };
}

function getMaintenanceIntentAction(
  actions: MaintenanceActionMap,
  maintEnabled: boolean,
) {
  return maintEnabled ? actions.clearAction : actions.setAction;
}

function canSubmitAction(
  pendingAction: ActionTarget,
  reasonDraft: string,
  noticeTitle: string,
  noticeBody: string,
  noticeSeverity: PlatformNoticeSeverity,
) {
  if (
    actionRequiresReason(pendingAction, noticeSeverity) &&
    !reasonDraft.trim()
  ) {
    return false;
  }

  if (pendingAction.kind === "create") {
    return Boolean(noticeTitle.trim() && noticeBody.trim());
  }

  return true;
}

function createNoticeRequiresReason(severity: PlatformNoticeSeverity) {
  return severity === "critical" || severity === "maintenance";
}

function actionRequiresReason(
  pendingAction: ActionTarget,
  noticeSeverity: PlatformNoticeSeverity,
) {
  if (pendingAction.kind === "create") {
    return (
      pendingAction.descriptor.requiresReason ||
      createNoticeRequiresReason(noticeSeverity)
    );
  }
  return pendingAction.descriptor.requiresReason;
}

function getPendingActionRiskLevel(
  pendingAction: ActionTarget,
  noticeSeverity: PlatformNoticeSeverity,
): ResourceActionDescriptor["riskLevel"] {
  if (
    pendingAction.kind === "create" &&
    createNoticeRequiresReason(noticeSeverity)
  ) {
    return "high";
  }
  return pendingAction.descriptor.riskLevel;
}

function actionLabel(action: string) {
  switch (action) {
    case "create_notice":
      return "Create notice";
    case "resolve_notice":
      return "Resolve notice";
    case "set_maintenance_mode":
      return "Save maintenance settings";
    case "clear_maintenance_mode":
      return "Clear maintenance mode";
    default:
      return action.replaceAll("_", " ");
  }
}

function actionHelpText(target: ActionTarget | null) {
  if (!target) return "";
  if (target.kind === "create") {
    return "Publishing critical or maintenance severity requires a reason and returns an audit receipt for cross-app propagation across ops, tenant, and driver surfaces.";
  }
  if (target.kind === "maintenance") {
    return target.enabled
      ? "Setting maintenance mode is high-risk. Save the current toggle and schedule with a required reason before the platform banner propagates."
      : "Clearing maintenance mode is high-risk. Provide the audit reason before the platform banner is removed across downstream apps.";
  }
  return "Resolving a notice removes it from the active stream and records the action in audit history.";
}

function collectNoticeLinks(notices: PlatformNoticeWorkspaceRecord[]) {
  const deduped = new Map<
    string,
    PlatformNoticeWorkspaceRecord["crossAppLinks"][number]
  >();
  notices.forEach((notice) => {
    notice.crossAppLinks.forEach((link) => {
      const key = `${link.targetApp}-${link.route}-${link.resourceId}`;
      if (!deduped.has(key)) {
        deduped.set(key, link);
      }
    });
  });
  return [...deduped.values()];
}

function normalizeEmptyReason(
  reason: EmptyStateEnvelope["reason"] | undefined,
): Exclude<EmptyReason, "driver_not_eligible"> {
  if (!reason || reason === "no_data") return "no_data";
  if (reason === "driver_not_eligible") return "fetch_failed";
  return reason;
}

function emptyStateMeta(reason: Exclude<EmptyReason, "driver_not_eligible">) {
  switch (reason) {
    case "permission_denied":
      return {
        icon: "permission",
        kicker: "Permission boundary",
        title: "You can load the route, but not this dataset",
        body: "The workspace snapshot succeeded, but the current actor cannot read this tab's records.",
        hint: "Switch to a broader role or follow a deep link with the correct authority.",
        tone: "info" as const,
      };
    case "fetch_failed":
      return {
        icon: "fetch_failed",
        kicker: "Fetch failed",
        title: "The workspace request did not complete",
        body: "The API call failed before this dataset could hydrate.",
        hint: "Refresh the page. If the next fetch fails again, inspect upstream API health and audit traces.",
        tone: "danger" as const,
      };
    case "external_unavailable":
      return {
        icon: "dependency",
        kicker: "External dependency",
        title: "A downstream target is unavailable",
        body: "Platform admin is up, but at least one banner target is not responding.",
        hint: "Use the deep links to verify downstream banner state once the dependency recovers.",
        tone: "warn" as const,
      };
    case "not_provisioned":
      return {
        icon: "provision",
        kicker: "Not provisioned",
        title: "This workspace has not been provisioned yet",
        body: "No notice data exists for this environment slice yet.",
        hint: "Use the next action to provision the resource or publish the first notice.",
        tone: "success" as const,
      };
    case "filtered_empty":
      return {
        icon: "filter",
        kicker: "Filtered result",
        title: "No records match the current slice",
        body: "The query completed successfully, but the applied slice narrowed the result to zero rows.",
        hint: "Clear filters or switch tabs to inspect a broader notice timeline.",
        tone: "neutral" as const,
      };
    case "no_data":
    default:
      return {
        icon: "zero",
        kicker: "No data",
        title: "Nothing has been published here yet",
        body: "The request succeeded and this workspace currently has zero notices or history rows.",
        hint: "Publish the first notice or wait for the next maintenance event to populate the stream.",
        tone: "neutral" as const,
      };
  }
}

function severityTone(
  severity: PlatformNoticeSeverity,
): "danger" | "warn" | "neutral" {
  switch (severity) {
    case "critical":
    case "maintenance":
      return "danger";
    case "warning":
      return "warn";
    default:
      return "neutral";
  }
}

function statusTone(status: string): "success" | "warn" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "scheduled":
      return "warn";
    default:
      return "neutral";
  }
}

function broadcastTone(status: string): "success" | "warn" | "neutral" {
  switch (status) {
    case "propagating":
      return "warn";
    case "queued":
      return "neutral";
    default:
      return "success";
  }
}
