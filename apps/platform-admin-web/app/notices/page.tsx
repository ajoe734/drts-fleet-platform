"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AssistantEntityRef } from "@/components/assistant/assistant-types";
import { usePlatformAdminAssistantPage } from "@/components/assistant/route-context";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  getNoticeHistoryDeliveryLabel,
  getNoticeSeverityLabel,
  getNoticeStatusLabel,
  getNoticeWindowNotScheduled,
  getNoticesAudienceLabel,
  getNoticesPageCopy,
} from "@/lib/translations";
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
  return getNoticesAudienceLabel(locale, audience);
}

function toSeverityLabel(
  severity: PlatformNoticeSeverity,
  locale: "en" | "zh",
): string {
  return getNoticeSeverityLabel(locale, severity);
}

function toStatusLabel(
  status: PlatformNoticeStatus,
  locale: "en" | "zh",
): string {
  return getNoticeStatusLabel(locale, status);
}

function formatWindow(
  start: string | null,
  end: string | null,
  locale: "en" | "zh",
) {
  if (!start && !end) {
    return getNoticeWindowNotScheduled(locale);
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

  const copy = useMemo(() => getNoticesPageCopy(locale), [locale]);

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
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

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
        delivery: getNoticeHistoryDeliveryLabel(
          locale,
          notice.status,
          notice.targetAudience,
        ),
        broadcastAt: formatDateTime(
          notice.scheduledAt ?? notice.updatedAt ?? notice.createdAt,
        ),
      })),
    [locale, sortedNotices],
  );

  const noticeColumns = useMemo<CanvasTableColumn<NoticeRow>[]>(
    () => [
      { h: copy.id, k: "id", w: 100, mono: true },
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
      copy.id,
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
      { h: copy.notice, k: "id", w: 110, mono: true },
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
      { h: copy.audience, k: "targets", w: 180, mono: true },
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
      copy.audience,
      copy.broadcastAt,
      copy.delivery,
      copy.notice,
      copy.noticeTitle,
      copy.severity,
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
        nextError instanceof Error ? nextError.message : String(nextError),
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
        nextError instanceof Error ? nextError.message : String(nextError),
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
        nextError instanceof Error ? nextError.message : String(nextError),
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

  const assistantBridge = useMemo(() => {
    const selectedRecords: AssistantEntityRef[] =
      resolvingNoticeId && activeTab === "notices"
        ? [
            {
              kind: "notice",
              id: resolvingNoticeId,
              source: "page-selection",
            },
          ]
        : showMaintenanceConfirm
          ? [
              {
                kind: "maintenance-mode",
                id: "platform-maintenance",
                source: "page-selection",
              },
            ]
          : [];
    const forms = [
      ...(showComposer
        ? [
            {
              formId: "platform-notice-composer",
              title: activeTab === "notices" ? copy.createNotice : copy.title,
              dirty:
                noticeTitle.trim().length > 0 ||
                noticeBody.trim().length > 0 ||
                noticeSeverity !== "info" ||
                noticeAudience !== "all",
              fields: [
                {
                  fieldId: "noticeTitle",
                  label: copy.noticeTitle,
                  valueSummary: noticeTitle,
                  required: true,
                  dirty: noticeTitle.trim().length > 0,
                },
                {
                  fieldId: "noticeBody",
                  label: copy.noticeBody,
                  valueSummary: noticeBody,
                  required: true,
                  dirty: noticeBody.trim().length > 0,
                },
                {
                  fieldId: "noticeSeverity",
                  label: copy.noticeSeverity,
                  valueSummary: noticeSeverity,
                },
                {
                  fieldId: "noticeAudience",
                  label: copy.noticeAudience,
                  valueSummary: noticeAudience,
                },
              ],
              validationErrors: [
                ...(noticeTitle.trim()
                  ? []
                  : [
                      {
                        fieldId: "noticeTitle",
                        code: "required",
                        message: copy.noticeTitleRequired,
                      },
                    ]),
                ...(noticeBody.trim()
                  ? []
                  : [
                      {
                        fieldId: "noticeBody",
                        code: "required",
                        message: copy.noticeBodyRequired,
                      },
                    ]),
              ],
              availableActions: [
                {
                  actionId: "submit_notice",
                  label: copy.createNotice,
                  riskLevel: "medium" as const,
                },
              ],
            },
          ]
        : []),
      ...(activeTab === "maint"
        ? [
            {
              formId: "maintenance-mode-form",
              title: copy.maintenance,
              dirty:
                maintEnabled !== Boolean(maintenance?.enabled) ||
                maintReason !== (maintenance?.reason ?? "") ||
                maintStart !==
                  toDatetimeLocalValue(maintenance?.scheduledStart ?? null) ||
                maintEnd !==
                  toDatetimeLocalValue(maintenance?.scheduledEnd ?? null),
              fields: [
                {
                  fieldId: "enabled",
                  label: copy.currentMaintenance,
                  valueSummary: maintEnabled ? "enabled" : "disabled",
                },
                {
                  fieldId: "reason",
                  label: copy.internalReason,
                  valueSummary: maintReason,
                  required: true,
                  dirty: maintReason.trim().length > 0,
                },
                {
                  fieldId: "scheduledStart",
                  label: copy.scheduledStart,
                  valueSummary: maintStart,
                  dirty: maintStart.trim().length > 0,
                },
                {
                  fieldId: "scheduledEnd",
                  label: copy.scheduledEnd,
                  valueSummary: maintEnd,
                  dirty: maintEnd.trim().length > 0,
                },
              ],
              validationErrors: maintReason.trim()
                ? []
                : [
                    {
                      fieldId: "reason",
                      code: "required",
                      message: copy.reasonRequired,
                    },
                  ],
              availableActions: [
                {
                  actionId: "confirm_maintenance_mode",
                  label: copy.enterMaintenance,
                  riskLevel: "high" as const,
                },
              ],
            },
          ]
        : []),
    ];

    return {
      pageId: "notices",
      contextSnapshot: {
        activeTab,
        selection: selectedRecords,
        selectedRecords,
        warnings: [
          ...(error
            ? [
                {
                  code: "notices_error",
                  severity: "warning" as const,
                  message: copy.warning.operationError(error),
                },
              ]
            : []),
          ...(maintenance?.enabled
            ? [
                {
                  code: "maintenance_mode_enabled",
                  severity: "critical" as const,
                  message: copy.warning.maintenanceEnabled(),
                },
              ]
            : []),
        ],
        visibleTables:
          activeTab === "notices"
            ? [
                {
                  tableId: "platform-notices",
                  title: copy.notices,
                  visibleRowCount: noticeRows.length,
                  visibleRowIds: noticeRows.slice(0, 5).map((row) => row.id),
                  selectedRowIds: resolvingNoticeId ? [resolvingNoticeId] : [],
                  availableActions: [
                    {
                      actionId: "create_notice",
                      label: copy.createNotice,
                      riskLevel: "medium" as const,
                    },
                    {
                      actionId: "resolve_notice",
                      label: copy.resolve,
                      riskLevel: "medium" as const,
                    },
                  ],
                },
              ]
            : activeTab === "history"
              ? [
                  {
                    tableId: "notice-history",
                    title: copy.history,
                    visibleRowCount: historyRows.length,
                    visibleRowIds: historyRows.slice(0, 5).map((row) => row.id),
                  },
                ]
              : [],
        availableActions: [
          {
            actionId:
              activeTab === "maint" ? "enter_maintenance" : "create_notice",
            label:
              activeTab === "maint" ? copy.enterMaintenance : copy.createNotice,
            riskLevel:
              activeTab === "maint" ? ("high" as const) : ("medium" as const),
          },
          { actionId: "refresh_notices", label: copy.refresh },
        ],
        forms,
      },
    };
  }, [
    activeTab,
    copy.createNotice,
    copy.currentMaintenance,
    copy.enterMaintenance,
    copy.history,
    copy.internalReason,
    copy.maintenance,
    copy.noticeAudience,
    copy.noticeBody,
    copy.noticeSeverity,
    copy.noticeTitle,
    copy.notices,
    copy.reasonRequired,
    copy.refresh,
    copy.resolve,
    copy.scheduledEnd,
    copy.scheduledStart,
    copy.title,
    error,
    historyRows,
    maintEnabled,
    maintEnd,
    maintReason,
    maintStart,
    maintenance,
    noticeAudience,
    noticeBody,
    noticeRows,
    noticeSeverity,
    noticeTitle,
    resolvingNoticeId,
    showComposer,
    showMaintenanceConfirm,
  ]);

  usePlatformAdminAssistantPage(assistantBridge);

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
            body={copy.activeNoticeGuardrailBody}
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
                          {copy.severityOptions.info}
                        </option>
                        <option value="warning">
                          {copy.severityOptions.warning}
                        </option>
                        <option value="critical">
                          {copy.severityOptions.critical}
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
                        <option value="ops">{copy.audienceOptions.ops}</option>
                        <option value="tenants">
                          {copy.audienceOptions.tenants}
                        </option>
                        <option value="drivers">
                          {copy.audienceOptions.drivers}
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
                      hint="UTC"
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
                      value={maintenance?.updatedBy ?? copy.systemUser}
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
                {copy.maintenanceRisk}
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
