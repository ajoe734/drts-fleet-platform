"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasInput,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  PlatformMaintenanceModeRecord,
  PlatformNoticeRecord,
  PlatformNoticeSeverity,
  PlatformNoticeStatus,
} from "@drts/contracts";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const bodyStyle: React.CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const splitGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
};

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const textInputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  fontSize: 12.5,
  lineHeight: 1.4,
  fontFamily: theme.fontFamily,
};

const textareaStyle: React.CSSProperties = {
  ...textInputStyle,
  minHeight: 96,
  resize: "vertical",
};

const selectStyle: React.CSSProperties = {
  ...textInputStyle,
  appearance: "none",
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 40,
};

const modalCardStyle: React.CSSProperties = {
  width: "min(560px, 100%)",
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.24)",
};

const headerTabButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "none",
  background: "transparent",
  padding: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
};

const emptyStateStyle: React.CSSProperties = {
  padding: 24,
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.45,
};

type ActiveTab = "notices" | "maint" | "history";

type BroadcastRow = {
  id: string;
  title: string;
  severity: PlatformNoticeSeverity;
  targets: string;
  delivery: string;
  broadcastAt: string;
};

type NoticeRow = {
  id: string;
  title: string;
  severity: PlatformNoticeSeverity;
  status: PlatformNoticeStatus;
  audience: string;
  updated: string;
  source: PlatformNoticeRecord;
};

const severityToneMap: Record<PlatformNoticeSeverity, CanvasTone> = {
  info: "neutral",
  warning: "warn",
  critical: "danger",
};

const statusToneMap: Record<PlatformNoticeStatus, CanvasTone> = {
  active: "success",
  scheduled: "info",
  resolved: "neutral",
};

function severityTone(severity: PlatformNoticeSeverity): CanvasTone {
  return severityToneMap[severity] ?? "neutral";
}

function statusTone(status: PlatformNoticeStatus): CanvasTone {
  return statusToneMap[status] ?? "neutral";
}

function audienceTargets(
  audience: PlatformNoticeRecord["targetAudience"],
  locale: "en" | "zh",
) {
  switch (audience) {
    case "all":
      return locale === "en" ? "ops · tenant · driver" : "營運 · 租戶 · 司機";
    case "tenants":
      return locale === "en" ? "tenant" : "租戶";
    case "ops":
      return locale === "en" ? "ops" : "營運";
    case "drivers":
      return locale === "en" ? "driver" : "司機";
    default:
      return audience;
  }
}

function toSeverityLabel(
  severity: PlatformNoticeSeverity,
  locale: string,
): string {
  const en: Record<PlatformNoticeSeverity, string> = {
    info: "Low",
    warning: "Medium",
    critical: "High",
  };
  const zh: Record<PlatformNoticeSeverity, string> = {
    info: "低",
    warning: "中",
    critical: "高",
  };
  const labels = locale === "en" ? en : zh;
  return labels[severity] ?? severity;
}

function toStatusLabel(status: PlatformNoticeStatus, locale: string): string {
  const en: Record<PlatformNoticeStatus, string> = {
    active: "Active",
    scheduled: "Scheduled",
    resolved: "Resolved",
  };
  const zh: Record<PlatformNoticeStatus, string> = {
    active: "生效中",
    scheduled: "已排程",
    resolved: "已解決",
  };
  const labels = locale === "en" ? en : zh;
  return labels[status] ?? status;
}

function formatDeliveryLabel(
  notice: PlatformNoticeRecord,
  locale: "en" | "zh",
) {
  if (notice.status === "resolved") {
    return locale === "en" ? "Archived after delivery" : "已送達並封存";
  }

  if (notice.targetAudience === "all") {
    return locale === "en" ? "Delivered 3 / 3 surfaces" : "已送達 3 / 3 個端面";
  }

  return locale === "en" ? "Delivered 1 / 1 surface" : "已送達 1 / 1 個端面";
}

function formatWindow(
  start: string | null,
  end: string | null,
  locale: string,
) {
  if (!start && !end) {
    return locale === "en" ? "Not scheduled" : "未排定";
  }
  if (start && end) {
    return `${formatDateTime(start)} - ${formatDateTime(end)}`;
  }
  return formatDateTime(start ?? end ?? "");
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function NoticesPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();

  const copy =
    locale === "en"
      ? {
          title: "Notices & Maintenance",
          subtitle:
            "Critical or maintenance severity pushes a cross-app banner to ops, tenant, and driver surfaces.",
          notices: "Notices",
          maintenance: "Maintenance Mode",
          history: "Broadcast History",
          createNotice: "Create notice",
          enterMaintenance: "Update maintenance mode",
          refresh: "Refresh",
          refreshing: "Refreshing…",
          emptyNotices: "No platform notices have been published yet.",
          emptyHistory: "No broadcasts have been delivered yet.",
          noticeComposerTitle: "Create notice",
          noticeComposerSubtitle:
            "Publish a cross-app banner for platform operators, tenants, or drivers.",
          noticeTitle: "Title",
          noticeBody: "Body",
          noticeAudience: "Audience",
          noticeSeverity: "Severity",
          publishNotice: "Publish notice",
          publishing: "Publishing",
          activeNoticeGuardrailTitle:
            "Maintenance notices should precede dispatch changes",
          activeNoticeGuardrailBody:
            "Publish a maintenance-severity notice before enabling platform-wide maintenance mode.",
          currentMaintenance: "Maintenance mode · current state",
          currentMaintenanceSubtitle:
            "Platform-wide dispatch and ingress control.",
          internalReason: "Reason · internal record",
          scheduledStart: "Scheduled start",
          scheduledEnd: "Scheduled end",
          saveMaintenance: "Save maintenance settings",
          previewTitle: "Current maintenance notice (preview)",
          previewFallback:
            "Enable maintenance mode to push a cross-app interruption banner.",
          previewTargets: "Target surfaces: ops · tenant · driver",
          reasonRequired:
            "A high-risk maintenance action requires a reason before saving.",
          confirmTitle: "Confirm maintenance mode update",
          confirmBody:
            "This is a high-risk action. Saving will change platform-wide dispatch and webhook behavior.",
          confirmReasonLabel: "Audit reason",
          confirmCancel: "Cancel",
          confirmApply: "Apply maintenance update",
          resolving: "Resolving",
          resolve: "Resolve",
          maintenanceEnabled: "Enabled",
          maintenanceDisabled: "Disabled",
          maintenanceSummary:
            "Once enabled, dispatch, webhook delivery, and partner ingress are paused.",
          reasonPlaceholder:
            "Planned maintenance, partner outage mitigation, or compliance hold",
          startPlaceholder: "YYYY-MM-DD HH:MM",
          endPlaceholder: "YYYY-MM-DD HH:MM",
          createdAt: "Updated",
          audience: "Targets",
          status: "Status",
          severity: "SEV",
          delivery: "Delivery",
          broadcastAt: "Broadcast At",
          updatedBy: "Updated by",
          window: "Window",
          action: "Action",
          archived: "Archived",
          noticeId: "Notice",
          targets: "Targets",
          historySubtitle: "Broadcast history · cross-app delivery outcomes",
          highRisk: "High risk",
        }
      : {
          title: "公告與維護",
          subtitle: "重大或維護等級會將跨應用橫幅推送到營運、租戶與司機端。",
          notices: "公告",
          maintenance: "維護模式",
          history: "廣播歷史",
          createNotice: "建立公告",
          enterMaintenance: "更新維護模式",
          refresh: "重新整理",
          refreshing: "重新整理中…",
          emptyNotices: "目前沒有平台公告。",
          emptyHistory: "目前沒有跨應用廣播紀錄。",
          noticeComposerTitle: "建立公告",
          noticeComposerSubtitle:
            "發佈給平台營運、租戶或司機端的跨應用橫幅公告。",
          noticeTitle: "標題",
          noticeBody: "內容",
          noticeAudience: "對象",
          noticeSeverity: "嚴重程度",
          publishNotice: "發佈公告",
          publishing: "發佈中…",
          activeNoticeGuardrailTitle: "進入維護前應先發維護公告",
          activeNoticeGuardrailBody:
            "請先發佈維護等級公告，再啟用全平台維護模式。",
          currentMaintenance: "目前維護模式",
          currentMaintenanceSubtitle: "全平台派遣與入站流量控管。",
          internalReason: "內部紀錄原因",
          scheduledStart: "預定起始",
          scheduledEnd: "預定結束",
          saveMaintenance: "儲存維護設定",
          previewTitle: "目前維護公告預覽",
          previewFallback: "啟用維護模式後，將推送跨應用中斷公告。",
          previewTargets: "目標對象：營運 · 租戶 · 司機",
          reasonRequired: "高風險維護動作必須填寫原因後才能儲存。",
          confirmTitle: "確認更新維護模式",
          confirmBody: "這是高風險動作。儲存後會改變全平台派遣與回呼行為。",
          confirmReasonLabel: "稽核原因",
          confirmCancel: "取消",
          confirmApply: "套用維護更新",
          resolving: "處理中…",
          resolve: "解決",
          maintenanceEnabled: "已啟用",
          maintenanceDisabled: "已停用",
          maintenanceSummary: "啟用後將停止派遣、回呼投遞與合作夥伴入站。",
          reasonPlaceholder: "例如：計畫性維護、合作夥伴服務中斷緩解或法遵保留",
          startPlaceholder: "例如 2026-06-07 14:30",
          endPlaceholder: "例如 2026-06-07 16:00",
          createdAt: "更新時間",
          audience: "對象",
          status: "狀態",
          severity: "等級",
          delivery: "送達狀態",
          broadcastAt: "廣播時間",
          updatedBy: "更新者",
          window: "時窗",
          action: "操作",
          archived: "已封存",
          noticeId: "公告",
          targets: "目標對象",
          historySubtitle: "廣播歷史與跨應用投遞結果",
          highRisk: "高風險",
        };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<PlatformNoticeRecord[]>([]);
  const [maintenance, setMaintenance] =
    useState<PlatformMaintenanceModeRecord | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("notices");
  const [showComposer, setShowComposer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resolvingNoticeId, setResolvingNoticeId] = useState<string | null>(
    null,
  );
  const [updatingMaintenance, setUpdatingMaintenance] = useState(false);
  const [showMaintenanceConfirm, setShowMaintenanceConfirm] = useState(false);

  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeSeverity, setNoticeSeverity] =
    useState<PlatformNoticeSeverity>("info");
  const [noticeAudience, setNoticeAudience] =
    useState<PlatformNoticeRecord["targetAudience"]>("all");

  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintReason, setMaintReason] = useState("");
  const [maintStart, setMaintStart] = useState("");
  const [maintEnd, setMaintEnd] = useState("");
  const [confirmReason, setConfirmReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noticeResult, maintenanceResult] = await Promise.all([
        client.listPlatformNotices(),
        client.getMaintenanceMode(),
      ]);
      setNotices(noticeResult ?? []);
      setMaintenance(maintenanceResult);
      setMaintEnabled(maintenanceResult.enabled);
      setMaintReason(maintenanceResult.reason ?? "");
      setMaintStart(toDatetimeLocalValue(maintenanceResult.scheduledStart));
      setMaintEnd(toDatetimeLocalValue(maintenanceResult.scheduledEnd));
      setConfirmReason(maintenanceResult.reason ?? "");
    } catch (nextError: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en"
            ? "Unable to load notices workspace"
            : "無法載入公告與維護工作區",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [client, locale]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sortedNotices = useMemo(
    () =>
      [...notices].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      ),
    [notices],
  );

  const counts = useMemo(
    () => ({
      notices: notices.length,
      active: notices.filter((notice) => notice.status === "active").length,
      scheduled: notices.filter((notice) => notice.status === "scheduled")
        .length,
      critical: notices.filter((notice) => notice.severity === "critical")
        .length,
    }),
    [notices],
  );

  const maintenancePreview = useMemo(() => {
    const windowLabel = formatWindow(
      fromDatetimeLocalValue(maintStart),
      fromDatetimeLocalValue(maintEnd),
      locale,
    );
    if (!maintEnabled && !maintReason.trim()) {
      return copy.previewFallback;
    }
    return `${windowLabel} · ${maintReason.trim() || copy.maintenanceSummary}`;
  }, [
    copy.maintenanceSummary,
    copy.previewFallback,
    locale,
    maintEnabled,
    maintEnd,
    maintReason,
    maintStart,
  ]);

  const noticeRows = useMemo<NoticeRow[]>(
    () =>
      sortedNotices.map((notice) => ({
        id: notice.noticeId.slice(0, 12),
        title: notice.title,
        severity: notice.severity,
        status: notice.status,
        audience: audienceTargets(notice.targetAudience, locale),
        updated: formatDateTime(notice.updatedAt),
        source: notice,
      })),
    [locale, sortedNotices],
  );

  const historyRows = useMemo<BroadcastRow[]>(
    () =>
      sortedNotices.map((notice) => ({
        id: notice.noticeId.slice(0, 12),
        title: notice.title,
        severity: notice.severity,
        targets: audienceTargets(notice.targetAudience, locale),
        delivery: formatDeliveryLabel(notice, locale),
        broadcastAt: formatDateTime(
          notice.scheduledAt ?? notice.updatedAt ?? notice.createdAt,
        ),
      })),
    [locale, sortedNotices],
  );

  const noticeColumns = useMemo<CanvasTableColumn<NoticeRow>[]>(
    () => [
      { h: copy.noticeId, k: "id", w: 100, mono: true },
      {
        h: copy.noticeTitle,
        w: 320,
        r: (row: NoticeRow) => (
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{row.title}</span>
            <span
              style={{
                color: theme.textMuted,
                fontSize: 11.5,
                lineHeight: 1.35,
                whiteSpace: "normal",
              }}
            >
              {row.source.body}
            </span>
          </div>
        ),
      },
      {
        h: copy.severity,
        w: 90,
        r: (row: NoticeRow) => (
          <CanvasPill theme={theme} tone={severityTone(row.severity)} dot>
            {toSeverityLabel(row.severity, locale)}
          </CanvasPill>
        ),
      },
      { h: copy.audience, k: "audience", w: 150, mono: true },
      {
        h: copy.status,
        w: 110,
        r: (row: NoticeRow) => (
          <CanvasPill theme={theme} tone={statusTone(row.status)} dot>
            {toStatusLabel(row.status, locale)}
          </CanvasPill>
        ),
      },
      { h: copy.createdAt, k: "updated", w: 180, mono: true },
      {
        h: copy.action,
        w: 110,
        r: (row: NoticeRow) =>
          row.status === "resolved" ? (
            <CanvasPill theme={theme} tone="neutral">
              {copy.archived}
            </CanvasPill>
          ) : (
            <CanvasBtn
              theme={theme}
              variant="secondary"
              disabled={resolvingNoticeId === row.source.noticeId}
              onClick={() => void handleResolveNotice(row.source.noticeId)}
            >
              {resolvingNoticeId === row.source.noticeId
                ? copy.resolving
                : copy.resolve}
            </CanvasBtn>
          ),
      },
    ],
    [
      copy.action,
      copy.archived,
      copy.audience,
      copy.createdAt,
      copy.noticeTitle,
      copy.resolve,
      copy.resolving,
      copy.severity,
      copy.status,
      locale,
      resolvingNoticeId,
    ],
  );

  const historyColumns = useMemo<CanvasTableColumn<BroadcastRow>[]>(
    () => [
      { h: copy.noticeId, k: "id", w: 110, mono: true },
      { h: copy.noticeTitle, k: "title", w: 280 },
      {
        h: copy.severity,
        w: 90,
        r: (row: BroadcastRow) => (
          <CanvasPill theme={theme} tone={severityTone(row.severity)} dot>
            {toSeverityLabel(row.severity, locale)}
          </CanvasPill>
        ),
      },
      { h: copy.targets, k: "targets", w: 180, mono: true },
      {
        h: copy.delivery,
        w: 180,
        r: (row: BroadcastRow) => (
          <CanvasPill theme={theme} tone="success" dot>
            {row.delivery}
          </CanvasPill>
        ),
      },
      { h: copy.broadcastAt, k: "broadcastAt", w: 180, mono: true },
    ],
    [
      copy.broadcastAt,
      copy.delivery,
      copy.noticeId,
      copy.noticeTitle,
      copy.severity,
      copy.targets,
      locale,
    ],
  );

  const pageTabs = useMemo(() => {
    const noticesTab = (
      <button
        key="notices-tab"
        type="button"
        onClick={() => setActiveTab("notices")}
        style={headerTabButtonStyle}
      >
        {copy.notices} ({counts.notices})
      </button>
    );
    const maintenanceTab = (
      <button
        key="maintenance-tab"
        type="button"
        onClick={() => setActiveTab("maint")}
        style={headerTabButtonStyle}
      >
        {copy.maintenance}
      </button>
    );
    const historyTab = (
      <button
        key="history-tab"
        type="button"
        onClick={() => setActiveTab("history")}
        style={headerTabButtonStyle}
      >
        {copy.history}
      </button>
    );

    return {
      tabs: [noticesTab, maintenanceTab, historyTab],
      active:
        activeTab === "notices"
          ? noticesTab
          : activeTab === "maint"
            ? maintenanceTab
            : historyTab,
    };
  }, [activeTab, copy.history, copy.maintenance, copy.notices, counts.notices]);

  async function handleCreateNotice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await client.createPlatformNotice({
        title: noticeTitle.trim(),
        body: noticeBody.trim(),
        severity: noticeSeverity,
        targetAudience: noticeAudience,
      });
      setNoticeTitle("");
      setNoticeBody("");
      setNoticeSeverity("info");
      setNoticeAudience("all");
      setShowComposer(false);
      await loadData();
    } catch (nextError: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en" ? "Unable to create notice" : "無法建立公告",
        ),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleResolveNotice(noticeId: string) {
    setResolvingNoticeId(noticeId);
    setError(null);
    try {
      await client.resolvePlatformNotice(noticeId);
      await loadData();
    } catch (nextError: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en" ? "Unable to resolve notice" : "無法結束公告",
        ),
      );
    } finally {
      setResolvingNoticeId(null);
    }
  }

  async function handleConfirmMaintenance() {
    const effectiveReason = confirmReason.trim() || maintReason.trim();
    if (!effectiveReason) {
      setError(copy.reasonRequired);
      return;
    }

    setUpdatingMaintenance(true);
    setError(null);
    try {
      await client.setMaintenanceMode({
        enabled: maintEnabled,
        reason: effectiveReason,
        scheduledStart: fromDatetimeLocalValue(maintStart),
        scheduledEnd: fromDatetimeLocalValue(maintEnd),
      });
      setShowMaintenanceConfirm(false);
      await loadData();
    } catch (nextError: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(nextError),
          locale === "en"
            ? "Unable to update maintenance mode"
            : "無法更新維護模式",
        ),
      );
    } finally {
      setUpdatingMaintenance(false);
    }
  }

  function handlePrimaryAction() {
    if (activeTab === "maint") {
      if (!maintReason.trim()) {
        setError(copy.reasonRequired);
        return;
      }
      setConfirmReason(maintReason.trim());
      setShowMaintenanceConfirm(true);
      return;
    }

    setShowComposer((current) => !current);
  }

  if (loading && notices.length === 0 && !maintenance) {
    return (
      <div style={bodyStyle}>
        <CanvasCard theme={theme} title={copy.title} subtitle={copy.refreshing}>
          <div style={{ color: theme.textMuted }}>{copy.refreshing}</div>
        </CanvasCard>
      </div>
    );
  }

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        tabs={pageTabs.tabs}
        activeTab={pageTabs.active}
        actions={
          <>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon={activeTab === "maint" ? "warn" : "plus"}
              danger={activeTab === "maint"}
              onClick={handlePrimaryAction}
            >
              {activeTab === "maint"
                ? copy.enterMaintenance
                : copy.createNotice}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              icon="arrow"
              onClick={() => void loadData()}
            >
              {loading ? copy.refreshing : copy.refresh}
            </CanvasBtn>
          </>
        }
      />

      <div style={bodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={error}
            body={
              activeTab === "maint" ? copy.activeNoticeGuardrailBody : undefined
            }
          />
        ) : null}

        {activeTab === "notices" ? (
          <>
            {showComposer ? (
              <CanvasCard
                theme={theme}
                title={copy.noticeComposerTitle}
                subtitle={copy.noticeComposerSubtitle}
              >
                <form
                  onSubmit={handleCreateNotice}
                  style={{ display: "grid", gap: 12 }}
                >
                  <div style={formGridStyle}>
                    <CanvasField
                      theme={theme}
                      label={copy.noticeTitle}
                      required
                    >
                      <input
                        value={noticeTitle}
                        onChange={(event) => setNoticeTitle(event.target.value)}
                        style={textInputStyle}
                        required
                      />
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={copy.noticeSeverity}
                      required
                    >
                      <select
                        value={noticeSeverity}
                        onChange={(event) =>
                          setNoticeSeverity(
                            event.target.value as PlatformNoticeSeverity,
                          )
                        }
                        style={selectStyle}
                      >
                        <option value="info">
                          {toSeverityLabel("info", locale)}
                        </option>
                        <option value="warning">
                          {toSeverityLabel("warning", locale)}
                        </option>
                        <option value="critical">
                          {toSeverityLabel("critical", locale)}
                        </option>
                      </select>
                    </CanvasField>
                    <CanvasField
                      theme={theme}
                      label={copy.noticeAudience}
                      required
                    >
                      <select
                        value={noticeAudience}
                        onChange={(event) =>
                          setNoticeAudience(
                            event.target
                              .value as PlatformNoticeRecord["targetAudience"],
                          )
                        }
                        style={selectStyle}
                      >
                        <option value="all">
                          {audienceTargets("all", locale)}
                        </option>
                        <option value="ops">
                          {audienceTargets("ops", locale)}
                        </option>
                        <option value="tenants">
                          {audienceTargets("tenants", locale)}
                        </option>
                        <option value="drivers">
                          {audienceTargets("drivers", locale)}
                        </option>
                      </select>
                    </CanvasField>
                  </div>
                  <CanvasField theme={theme} label={copy.noticeBody} required>
                    <textarea
                      value={noticeBody}
                      onChange={(event) => setNoticeBody(event.target.value)}
                      style={textareaStyle}
                      required
                    />
                  </CanvasField>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                    }}
                  >
                    <CanvasBtn
                      theme={theme}
                      variant="secondary"
                      onClick={() => setShowComposer(false)}
                    >
                      {copy.confirmCancel}
                    </CanvasBtn>
                    <button
                      type="submit"
                      disabled={
                        creating || !noticeTitle.trim() || !noticeBody.trim()
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 10px",
                        fontSize: 12,
                        height: 28,
                        fontWeight: 500,
                        background:
                          creating || !noticeTitle.trim() || !noticeBody.trim()
                            ? theme.accentBorder
                            : theme.accent,
                        color: "#ffffff",
                        border: `1px solid ${
                          creating || !noticeTitle.trim() || !noticeBody.trim()
                            ? theme.accentBorder
                            : theme.accent
                        }`,
                        borderRadius: 7,
                        cursor:
                          creating || !noticeTitle.trim() || !noticeBody.trim()
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          creating || !noticeTitle.trim() || !noticeBody.trim()
                            ? 0.55
                            : 1,
                      }}
                    >
                      {creating ? copy.publishing : copy.publishNotice}
                    </button>
                  </div>
                </form>
              </CanvasCard>
            ) : null}

            <CanvasCard theme={theme} padding={0}>
              {noticeRows.length > 0 ? (
                <CanvasTable
                  theme={theme}
                  columns={noticeColumns}
                  rows={noticeRows}
                />
              ) : (
                <div style={emptyStateStyle}>{copy.emptyNotices}</div>
              )}
            </CanvasCard>
          </>
        ) : null}

        {activeTab === "maint" ? (
          <>
            <CanvasBanner
              theme={theme}
              tone="warn"
              title={copy.activeNoticeGuardrailTitle}
              body={copy.activeNoticeGuardrailBody}
            />

            <div style={splitGridStyle}>
              <CanvasCard
                theme={theme}
                title={copy.currentMaintenance}
                subtitle={copy.currentMaintenanceSubtitle}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                      background: theme.surfaceLo,
                      padding: 12,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {copy.maintenance}
                      </span>
                      <button
                        type="button"
                        aria-pressed={maintEnabled}
                        onClick={() => setMaintEnabled((current) => !current)}
                        style={{
                          width: 38,
                          height: 22,
                          borderRadius: 999,
                          border: "none",
                          background: maintEnabled
                            ? theme.danger
                            : theme.textDim,
                          position: "relative",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            top: 3,
                            left: maintEnabled ? 19 : 3,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: "#ffffff",
                            transition: "left 0.2s ease",
                          }}
                        />
                      </button>
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: theme.textMuted,
                        lineHeight: 1.45,
                      }}
                    >
                      {copy.maintenanceSummary}
                    </div>
                  </div>

                  <CanvasField
                    theme={theme}
                    label={copy.internalReason}
                    required
                  >
                    <input
                      value={maintReason}
                      onChange={(event) => setMaintReason(event.target.value)}
                      style={textInputStyle}
                      placeholder={copy.reasonPlaceholder}
                      required
                    />
                  </CanvasField>

                  <div style={formGridStyle}>
                    <CanvasField
                      theme={theme}
                      label={copy.scheduledStart}
                      hint="以世界標準時間記錄"
                    >
                      <input
                        type="datetime-local"
                        value={maintStart}
                        onChange={(event) => setMaintStart(event.target.value)}
                        style={textInputStyle}
                        placeholder={copy.startPlaceholder}
                      />
                    </CanvasField>
                    <CanvasField theme={theme} label={copy.scheduledEnd}>
                      <input
                        type="datetime-local"
                        value={maintEnd}
                        onChange={(event) => setMaintEnd(event.target.value)}
                        style={textInputStyle}
                        placeholder={copy.endPlaceholder}
                      />
                    </CanvasField>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      danger
                      onClick={handlePrimaryAction}
                      disabled={updatingMaintenance || !maintReason.trim()}
                    >
                      {copy.saveMaintenance}
                    </CanvasBtn>
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={theme} title={copy.previewTitle}>
                <div style={{ display: "grid", gap: 12 }}>
                  <CanvasBanner
                    theme={theme}
                    tone={maintEnabled ? "danger" : "warn"}
                    title={maintenancePreview}
                    body={copy.previewTargets}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <CanvasPill
                      theme={theme}
                      tone={maintenance?.enabled ? "danger" : "success"}
                      dot
                    >
                      {maintenance?.enabled
                        ? copy.maintenanceEnabled
                        : copy.maintenanceDisabled}
                    </CanvasPill>
                    {maintenance?.reason ? (
                      <CanvasPill theme={theme} tone="neutral">
                        {maintenance.reason}
                      </CanvasPill>
                    ) : null}
                  </div>
                  <CanvasField theme={theme} label={copy.window}>
                    <CanvasInput
                      theme={theme}
                      mono
                      value={formatWindow(
                        maintenance?.scheduledStart ?? null,
                        maintenance?.scheduledEnd ?? null,
                        locale,
                      )}
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label={copy.updatedBy}>
                    <CanvasInput
                      theme={theme}
                      value={
                        maintenance?.updatedBy ??
                        formatPlatformCodeLabel(locale, "system")
                      }
                    />
                  </CanvasField>
                  <CanvasField theme={theme} label={copy.createdAt}>
                    <CanvasInput
                      theme={theme}
                      mono
                      value={formatDateTime(maintenance?.updatedAt ?? "")}
                    />
                  </CanvasField>
                </div>
              </CanvasCard>
            </div>
          </>
        ) : null}

        {activeTab === "history" ? (
          <CanvasCard
            theme={theme}
            title={copy.history}
            subtitle={copy.historySubtitle}
            padding={0}
          >
            {historyRows.length > 0 ? (
              <CanvasTable
                theme={theme}
                columns={historyColumns}
                rows={historyRows}
              />
            ) : (
              <div style={emptyStateStyle}>{copy.emptyHistory}</div>
            )}
          </CanvasCard>
        ) : null}
      </div>

      {showMaintenanceConfirm ? (
        <div style={modalBackdropStyle} role="dialog" aria-modal="true">
          <CanvasCard
            theme={theme}
            title={copy.confirmTitle}
            subtitle={copy.confirmBody}
            style={modalCardStyle}
            actions={
              <CanvasPill theme={theme} tone="danger" dot>
                {copy.highRisk}
              </CanvasPill>
            }
          >
            <div style={{ display: "grid", gap: 14 }}>
              <CanvasField
                theme={theme}
                label={copy.confirmReasonLabel}
                required
              >
                <textarea
                  value={confirmReason}
                  onChange={(event) => setConfirmReason(event.target.value)}
                  style={textareaStyle}
                  required
                />
              </CanvasField>
              <div
                style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
              >
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => setShowMaintenanceConfirm(false)}
                  disabled={updatingMaintenance}
                >
                  {copy.confirmCancel}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  danger
                  onClick={() => void handleConfirmMaintenance()}
                  disabled={updatingMaintenance || !confirmReason.trim()}
                >
                  {updatingMaintenance ? copy.refreshing : copy.confirmApply}
                </CanvasBtn>
              </div>
            </div>
          </CanvasCard>
        </div>
      ) : null}
    </>
  );
}
