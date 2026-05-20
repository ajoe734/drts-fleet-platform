"use client";

import React, {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformNoticeSeverity,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const SEVERITY_OPTIONS: PlatformNoticeSeverity[] = [
  "info",
  "warning",
  "critical",
];

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const noticeGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
} satisfies CSSProperties;

const createCardGridStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const createFormGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0 12px",
} satisfies CSSProperties;

const maintenanceCardStackStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const maintenanceToggleCardStyle = {
  padding: 12,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  background: theme.surfaceLo,
  display: "grid",
  gap: 8,
} satisfies CSSProperties;

const maintenanceToggleRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
} satisfies CSSProperties;

const maintenanceFieldGridStyle = {
  display: "grid",
  gap: 10,
} satisfies CSSProperties;

const tabButtonStyle = (selected: boolean): CSSProperties => ({
  background: "transparent",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  color: selected ? theme.text : theme.textMuted,
  font: "inherit",
  fontWeight: selected ? 600 : 500,
});

const inputBaseStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const textareaStyle = {
  ...inputBaseStyle(),
  minHeight: 88,
  resize: "vertical",
} satisfies CSSProperties;

const toggleTrackStyle = (enabled: boolean): CSSProperties => ({
  width: 46,
  height: 26,
  borderRadius: 999,
  border: `1px solid ${enabled ? theme.accent : theme.border}`,
  background: enabled ? theme.accent : theme.surface,
  position: "relative",
  transition: "all 120ms ease",
});

const toggleKnobStyle = (enabled: boolean): CSSProperties => ({
  position: "absolute",
  top: 2,
  left: enabled ? 22 : 2,
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.18)",
  transition: "left 120ms ease",
});

type NoticeAudience = "all" | "tenants" | "ops" | "drivers";
type NoticeTab = "notices" | "maintenance";
type NoticeTableRow = PlatformNoticeRecord & Record<string, unknown>;

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
    },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function noticeSeverityTone(severity: PlatformNoticeSeverity): CanvasTone {
  switch (severity) {
    case "critical":
      return "danger";
    case "warning":
      return "warn";
    default:
      return "info";
  }
}

function noticeStatusTone(status: PlatformNoticeRecord["status"]): CanvasTone {
  switch (status) {
    case "active":
      return "success";
    case "scheduled":
      return "warn";
    case "resolved":
      return "neutral";
    default:
      return "info";
  }
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
      "-",
    ) +
    "T" +
    [pad(date.getHours()), pad(date.getMinutes())].join(":")
  );
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildMaintenanceSummary(
  locale: string,
  maintenance: PlatformMaintenanceModeRecord | null,
  latestNoticeAt: string | null,
) {
  return [
    {
      label: locale === "en" ? "Current status" : "目前狀態",
      value: (
        <CanvasPill
          theme={theme}
          tone={maintenance?.enabled ? "danger" : "success"}
          dot
        >
          {maintenance?.enabled
            ? locale === "en"
              ? "Enabled"
              : "已啟用"
            : locale === "en"
              ? "Disabled"
              : "已停用"}
        </CanvasPill>
      ),
    },
    {
      label: locale === "en" ? "Latest notice" : "最近公告",
      value: latestNoticeAt ? formatDateTime(latestNoticeAt) : "-",
      mono: true,
    },
    {
      label: locale === "en" ? "Last updated" : "最後更新",
      value: maintenance?.updatedAt
        ? formatDateTime(maintenance.updatedAt)
        : "-",
      mono: true,
    },
    {
      label: locale === "en" ? "Updated by" : "更新者",
      value: maintenance?.updatedBy || "-",
      mono: true,
    },
  ];
}

export default function NoticesPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();

  const [notices, setNotices] = useState<PlatformNoticeRecord[]>([]);
  const [maintenance, setMaintenance] =
    useState<PlatformMaintenanceModeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NoticeTab>("notices");
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formSeverity, setFormSeverity] =
    useState<PlatformNoticeSeverity>("info");
  const [formAudience, setFormAudience] = useState<NoticeAudience>("all");
  const [creating, setCreating] = useState(false);
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintReason, setMaintReason] = useState("");
  const [maintScheduledStart, setMaintScheduledStart] = useState("");
  const [maintScheduledEnd, setMaintScheduledEnd] = useState("");
  const [updatingMaint, setUpdatingMaint] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noticeData, maintenanceData] = await Promise.all([
        client.listPlatformNotices(),
        client.getMaintenanceMode(),
      ]);
      const nextMaintenance = maintenanceData ?? null;
      setNotices(noticeData || []);
      setMaintenance(nextMaintenance);
      setMaintEnabled(nextMaintenance?.enabled ?? false);
      setMaintReason(nextMaintenance?.reason || "");
      setMaintScheduledStart(isoToLocalInput(nextMaintenance?.scheduledStart));
      setMaintScheduledEnd(isoToLocalInput(nextMaintenance?.scheduledEnd));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateNotice = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setCreating(true);
    try {
      await client.createPlatformNotice({
        title: formTitle,
        body: formBody,
        severity: formSeverity,
        targetAudience: formAudience,
      });
      setShowCreate(false);
      setFormTitle("");
      setFormBody("");
      setFormSeverity("info");
      setFormAudience("all");
      await loadData();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  const handleResolve = async (noticeId: string) => {
    try {
      await client.resolvePlatformNotice(noticeId);
      await loadData();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const handleSetMaintenance = async () => {
    setUpdatingMaint(true);
    try {
      await client.setMaintenanceMode({
        enabled: maintEnabled,
        reason: maintReason || null,
        scheduledStart: localInputToIso(maintScheduledStart),
        scheduledEnd: localInputToIso(maintScheduledEnd),
      });
      await loadData();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUpdatingMaint(false);
    }
  };

  const latestNoticeAt = notices[0]?.createdAt ?? null;
  const shellNav = buildPlatformNav(locale);

  const tabNodes = [
    <button
      key="notices"
      type="button"
      onClick={() => setActiveTab("notices")}
      style={tabButtonStyle(activeTab === "notices")}
    >
      {t("notices.tab.notices")}
    </button>,
    <button
      key="maintenance"
      type="button"
      onClick={() => setActiveTab("maintenance")}
      style={tabButtonStyle(activeTab === "maintenance")}
    >
      {t("notices.tab.maintenance")}
    </button>,
  ];

  const noticeColumns: CanvasTableColumn<NoticeTableRow>[] = [
    {
      h: getPlatformLabel(locale, "id"),
      w: 96,
      mono: true,
      r: (row) => row.noticeId,
    },
    {
      h: t("notices.col.title"),
      w: 240,
      r: (row) => (
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: theme.text }}>
            {row.title}
          </span>
          <span
            style={{
              color: theme.textMuted,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
              lineHeight: 1.45,
            }}
          >
            {row.body}
          </span>
        </div>
      ),
    },
    {
      h: locale === "en" ? "SEV" : "嚴重度",
      w: 92,
      r: (row) => (
        <CanvasPill theme={theme} tone={noticeSeverityTone(row.severity)} dot>
          {formatPlatformCodeLabel(locale, row.severity)}
        </CanvasPill>
      ),
    },
    {
      h: t("notices.col.audience"),
      w: 104,
      r: (row) => (
        <CanvasPill theme={theme} tone="neutral">
          {formatPlatformCodeLabel(locale, row.targetAudience)}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "STATUS" : "狀態",
      w: 116,
      r: (row) => (
        <CanvasPill theme={theme} tone={noticeStatusTone(row.status)} dot>
          {formatPlatformCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "Updated" : "更新",
      w: 164,
      mono: true,
      r: (row) => formatDateTime(row.updatedAt || row.createdAt),
    },
    {
      h: t("common.actions"),
      w: 108,
      r: (row) =>
        row.status === "resolved" ? (
          <span style={{ color: theme.textDim }}>-</span>
        ) : (
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="secondary"
            onClick={() => void handleResolve(row.noticeId)}
          >
            {t("notices.resolve")}
          </CanvasBtn>
        ),
    },
  ];

  const maintenanceCard = (
    <CanvasCard
      theme={theme}
      title="Maintenance mode"
      subtitle={
        locale === "en"
          ? "Global maintenance controls and schedule window."
          : "全平台維護控制與排程時窗。"
      }
    >
      <div style={maintenanceCardStackStyle}>
        <div style={maintenanceToggleCardStyle}>
          <div style={maintenanceToggleRowStyle}>
            <span style={{ fontWeight: 600, color: theme.text }}>
              {locale === "en" ? "Global maintenance" : "全平台維護"}
            </span>
            <label
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={maintEnabled}
                onChange={(event) => setMaintEnabled(event.target.checked)}
                style={{
                  position: "absolute",
                  opacity: 0,
                  pointerEvents: "none",
                }}
              />
              <span style={toggleTrackStyle(maintEnabled)}>
                <span style={toggleKnobStyle(maintEnabled)} />
              </span>
            </label>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              lineHeight: 1.4,
            }}
          >
            {locale === "en"
              ? "When enabled, dispatch, webhook delivery, and partner ingress should be paused. Publish the notice first."
              : "啟用後將停止 dispatch、webhook 投遞與 partner 入站。請務必先發佈公告。"}
          </div>
        </div>

        {maintenance?.enabled ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={t("notices.maintActiveBanner")}
            body={maintenance.reason || t("notices.maintActive")}
          />
        ) : null}

        <CanvasDL
          theme={theme}
          cols={2}
          items={buildMaintenanceSummary(locale, maintenance, latestNoticeAt)}
        />

        <div style={maintenanceFieldGridStyle}>
          <CanvasField
            theme={theme}
            label={
              locale === "en" ? "Reason (internal record)" : "原因（內部紀錄）"
            }
          >
            <input
              id="maint-reason"
              type="text"
              value={maintReason}
              onChange={(event) => setMaintReason(event.target.value)}
              placeholder={getPlatformLabel(locale, "maintenanceReasonExample")}
              style={inputBaseStyle()}
            />
          </CanvasField>

          <CanvasField
            theme={theme}
            label={locale === "en" ? "Scheduled start" : "預定起始"}
            hint="UTC"
          >
            <input
              id="maint-start"
              type="datetime-local"
              value={maintScheduledStart}
              onChange={(event) => setMaintScheduledStart(event.target.value)}
              style={inputBaseStyle(true)}
            />
          </CanvasField>

          <CanvasField
            theme={theme}
            label={locale === "en" ? "Scheduled end" : "預定結束"}
            hint="UTC"
          >
            <input
              id="maint-end"
              type="datetime-local"
              value={maintScheduledEnd}
              onChange={(event) => setMaintScheduledEnd(event.target.value)}
              style={inputBaseStyle(true)}
            />
          </CanvasField>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <CanvasBtn
            theme={theme}
            variant="secondary"
            onClick={() => void handleSetMaintenance()}
            disabled={updatingMaint}
          >
            {updatingMaint
              ? t("notices.updating")
              : locale === "en"
                ? "Save settings"
                : "儲存設定"}
          </CanvasBtn>
        </div>
      </div>
    </CanvasCard>
  );

  return (
    <CanvasShell
      theme={theme}
      nav={shellNav}
      active="notices"
      currentPath="/notices"
      breadcrumb={[
        locale === "en" ? "Platform Layer" : "平台層",
        t("notices.title"),
      ]}
      searchPlaceholder={
        locale === "en"
          ? "Search notices, incidents, windows..."
          : "搜尋公告、事故、維護時窗..."
      }
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={t("notices.title")}
        subtitle="platform notices · global maintenance mode"
        sticky={false}
        tabs={tabNodes}
        activeTab={activeTab === "notices" ? tabNodes[0] : tabNodes[1]}
        actions={
          <>
            <CanvasBtn theme={theme} onClick={() => void loadData()}>
              {t("common.refresh")}
            </CanvasBtn>
            {activeTab === "notices" ? (
              <CanvasBtn
                theme={theme}
                variant={showCreate ? "secondary" : "primary"}
                icon={showCreate ? "x" : "plus"}
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate ? t("common.cancel") : t("notices.newNotice")}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={getPlatformLabel(locale, "error")}
            body={error}
          />
        ) : null}

        {showCreate ? (
          <CanvasCard
            theme={theme}
            title={t("notices.newNotice")}
            subtitle={
              locale === "en"
                ? "Compose a platform-wide broadcast for tenants, ops, or drivers."
                : "建立平台公告，並指定租戶、營運或司機受眾。"
            }
          >
            <form onSubmit={handleCreateNotice} style={createCardGridStyle}>
              <div style={createFormGridStyle}>
                <CanvasField
                  theme={theme}
                  label={t("notices.form.title")}
                  required
                >
                  <input
                    id="notice-title"
                    type="text"
                    value={formTitle}
                    onChange={(event) => setFormTitle(event.target.value)}
                    placeholder={t("notices.form.titlePlaceholder")}
                    style={inputBaseStyle()}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={t("notices.form.severity")}>
                  <select
                    value={formSeverity}
                    onChange={(event) =>
                      setFormSeverity(
                        event.target.value as PlatformNoticeSeverity,
                      )
                    }
                    style={inputBaseStyle()}
                  >
                    {SEVERITY_OPTIONS.map((severity) => (
                      <option key={severity} value={severity}>
                        {formatPlatformCodeLabel(locale, severity)}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={t("notices.form.audience")}>
                  <select
                    value={formAudience}
                    onChange={(event) =>
                      setFormAudience(event.target.value as NoticeAudience)
                    }
                    style={inputBaseStyle()}
                  >
                    <option value="all">{t("notices.audience.all")}</option>
                    <option value="tenants">
                      {t("notices.audience.tenants")}
                    </option>
                    <option value="ops">{t("notices.audience.ops")}</option>
                    <option value="drivers">
                      {t("notices.audience.drivers")}
                    </option>
                  </select>
                </CanvasField>
              </div>

              <CanvasField
                theme={theme}
                label={t("notices.form.body")}
                required
              >
                <textarea
                  id="notice-body"
                  value={formBody}
                  onChange={(event) => setFormBody(event.target.value)}
                  placeholder={t("notices.form.bodyPlaceholder")}
                  style={textareaStyle}
                />
              </CanvasField>

              <div
                style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
              >
                <CanvasBtn theme={theme} onClick={() => setShowCreate(false)}>
                  {t("common.cancel")}
                </CanvasBtn>
                <button
                  type="submit"
                  disabled={creating || !formTitle.trim() || !formBody.trim()}
                  style={{
                    ...inputBaseStyle(),
                    width: "auto",
                    cursor:
                      creating || !formTitle.trim() || !formBody.trim()
                        ? "not-allowed"
                        : "pointer",
                    background: theme.accent,
                    color: "#fff",
                    borderColor: theme.accent,
                    fontWeight: 600,
                    opacity:
                      creating || !formTitle.trim() || !formBody.trim()
                        ? 0.55
                        : 1,
                  }}
                >
                  {creating
                    ? t("notices.publishing")
                    : t("notices.publishNotice")}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        {activeTab === "notices" ? (
          <div style={noticeGridStyle}>
            <CanvasCard
              theme={theme}
              title={locale === "en" ? "Current notices" : "現行公告"}
              padding={0}
            >
              {loading ? (
                <div style={{ padding: 16, color: theme.textMuted }}>
                  {t("notices.loading")}
                </div>
              ) : notices.length === 0 ? (
                <div style={{ padding: 16, color: theme.textMuted }}>
                  {t("notices.empty")}
                </div>
              ) : (
                <CanvasTable<NoticeTableRow>
                  theme={theme}
                  rows={notices as NoticeTableRow[]}
                  columns={noticeColumns}
                />
              )}
            </CanvasCard>
            {maintenanceCard}
          </div>
        ) : (
          maintenanceCard
        )}
      </div>
    </CanvasShell>
  );
}
