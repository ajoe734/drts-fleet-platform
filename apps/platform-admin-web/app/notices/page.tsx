/**
 * Notices & Maintenance Mode Page
 * Governance surface for platform notices and maintenance windows.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  actionButtonStyle,
  emptyStateStyle,
  switchStyle,
} from "@/components/platform-ui";
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
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowPanel,
} from "@drts/ui-web";

const SEVERITY_OPTIONS: PlatformNoticeSeverity[] = [
  "info",
  "warning",
  "critical",
];

type NoticeStatusFilter = "all" | PlatformNoticeRecord["status"];
type NoticeSeverityFilter = "all" | PlatformNoticeSeverity;

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTimeOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toneForSeverity(severity: PlatformNoticeSeverity) {
  switch (severity) {
    case "critical":
      return "danger" as const;
    case "warning":
      return "warning" as const;
    default:
      return "info" as const;
  }
}

function toneForNoticeStatus(status: PlatformNoticeRecord["status"]) {
  switch (status) {
    case "active":
      return "success" as const;
    case "scheduled":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function formatWindow(
  locale: "en" | "zh",
  start: string | null,
  end: string | null,
): string {
  if (!start && !end) {
    return locale === "en" ? "Immediate / open-ended" : "立即 / 未限定結束";
  }
  if (start && end) {
    return `${formatDateTime(start)} -> ${formatDateTime(end)}`;
  }
  if (start) {
    return locale === "en"
      ? `Starts ${formatDateTime(start)}`
      : `自 ${formatDateTime(start)} 開始`;
  }
  return locale === "en"
    ? `Ends ${formatDateTime(end ?? "")}`
    : `於 ${formatDateTime(end ?? "")} 結束`;
}

export default function NoticesPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [notices, setNotices] = useState<PlatformNoticeRecord[]>([]);
  const [maintenance, setMaintenance] =
    useState<PlatformMaintenanceModeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<NoticeStatusFilter>("all");
  const [severityFilter, setSeverityFilter] =
    useState<NoticeSeverityFilter>("all");

  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formSeverity, setFormSeverity] =
    useState<PlatformNoticeSeverity>("info");
  const [formAudience, setFormAudience] = useState<
    "all" | "tenants" | "ops" | "drivers"
  >("all");
  const [formScheduledAt, setFormScheduledAt] = useState("");

  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintReason, setMaintReason] = useState("");
  const [maintScheduledStart, setMaintScheduledStart] = useState("");
  const [maintScheduledEnd, setMaintScheduledEnd] = useState("");
  const [updatingMaint, setUpdatingMaint] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noticeList, maintenanceMode] = await Promise.all([
        client.listPlatformNotices(),
        client.getMaintenanceMode(),
      ]);
      setNotices(noticeList ?? []);
      setMaintenance(maintenanceMode);
      setMaintEnabled(maintenanceMode.enabled);
      setMaintReason(maintenanceMode.reason ?? "");
      setMaintScheduledStart(
        toLocalDateTimeInput(maintenanceMode.scheduledStart),
      );
      setMaintScheduledEnd(toLocalDateTimeInput(maintenanceMode.scheduledEnd));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreateNotice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await client.createPlatformNotice({
        title: formTitle.trim(),
        body: formBody.trim(),
        severity: formSeverity,
        targetAudience: formAudience,
        scheduledAt: toIsoDateTimeOrNull(formScheduledAt),
      });
      setFormTitle("");
      setFormBody("");
      setFormSeverity("info");
      setFormAudience("all");
      setFormScheduledAt("");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleResolve(noticeId: string) {
    setError(null);
    try {
      await client.resolvePlatformNotice(noticeId);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSetMaintenance() {
    setUpdatingMaint(true);
    setError(null);
    try {
      await client.setMaintenanceMode({
        enabled: maintEnabled,
        reason: maintReason.trim() || null,
        scheduledStart: toIsoDateTimeOrNull(maintScheduledStart),
        scheduledEnd: toIsoDateTimeOrNull(maintScheduledEnd),
      });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingMaint(false);
    }
  }

  const copy =
    locale === "en"
      ? {
          eyebrow: "Platform-issued communications",
          subtitle:
            "Publish audience-safe notices and schedule maintenance windows without inventing local-only timing state.",
          activeBannerTitle: "Maintenance mode is active.",
          scheduledBannerTitle: "A maintenance window is scheduled.",
          idleBannerTitle: "No maintenance window is currently active.",
          activeBannerDescription:
            "The current reason and any future start/end window come directly from the platform-maintenance record.",
          scheduledBannerDescription:
            "Maintenance remains governed by the backend window. Review the schedule before publishing notices that reference it.",
          idleBannerDescription:
            "Use the workflow panel below to stage a future maintenance window or apply an immediate control-plane pause.",
          openWorkflowTitle: "Publish notice",
          openWorkflowDescription:
            "Audience, severity, and optional scheduled publish time all map to the platform notice command.",
          maintenanceWorkflowTitle: "Maintenance mode control",
          maintenanceWorkflowDescription:
            "Immediate and scheduled maintenance use the same backend command; this page should only edit server-owned truth.",
          noticeLedgerTitle: "Notice ledger",
          noticeLedgerSubtitle:
            "Review active, scheduled, and resolved notices with audience and issuance metadata intact.",
          noticeLedgerSummary:
            "Scheduled notices remain visible alongside active ones so operators can validate message timing against the maintenance window.",
          activeNotices: "Active notices",
          scheduledNotices: "Scheduled notices",
          criticalNotices: "Critical notices",
          maintenanceWindow: "Maintenance window",
          immediate: "Immediate",
          noReason: "No reason recorded",
          systemActor: "System",
          schedulingLabel: "Schedule (optional)",
          schedulingHint:
            "Leave empty to publish immediately; otherwise the backend will keep the notice in scheduled state until the chosen time.",
          startLabel: "Scheduled start",
          endLabel: "Scheduled end",
          currentState: "Current state",
          currentReason: "Current reason",
          currentWindow: "Current window",
          updatedBy: "Updated by",
          createdBy: "Created by",
          lastUpdated: "Last updated",
          allStatuses: "All statuses",
          allSeverities: "All severities",
        }
      : {
          eyebrow: "平台公告治理",
          subtitle:
            "用同一個治理頁發佈 audience-safe notice，並直接排程 maintenance window，不發明前端本地時間真相。",
          activeBannerTitle: "目前 maintenance mode 已啟用。",
          scheduledBannerTitle: "已有排程中的 maintenance window。",
          idleBannerTitle: "目前沒有啟用中的 maintenance window。",
          activeBannerDescription:
            "目前原因與未來的開始/結束時間都直接來自平台 maintenance record。",
          scheduledBannerDescription:
            "Maintenance 的時間窗由後端治理；若要發 notice，先確認這個排程是否一致。",
          idleBannerDescription:
            "可在下方 workflow panel 設定未來 maintenance window，或立即套用 control-plane pause。",
          openWorkflowTitle: "發布 notice",
          openWorkflowDescription:
            "Audience、severity 與可選的 scheduled publish time 都直接對應平台 notice command。",
          maintenanceWorkflowTitle: "Maintenance mode 控制",
          maintenanceWorkflowDescription:
            "立即生效與排程 maintenance 都走同一個 backend command；這個頁面只應編輯 server-owned truth。",
          noticeLedgerTitle: "Notice 台帳",
          noticeLedgerSubtitle:
            "保留 active、scheduled、resolved notice，並完整顯示 audience 與發佈 metadata。",
          noticeLedgerSummary:
            "Scheduled notice 會與 active 一起顯示，方便對照 maintenance window 檢查訊息時序。",
          activeNotices: "生效中 notice",
          scheduledNotices: "已排程 notice",
          criticalNotices: "Critical notice",
          maintenanceWindow: "Maintenance window",
          immediate: "立即生效",
          noReason: "未記錄原因",
          systemActor: "系統",
          schedulingLabel: "排程時間（可選）",
          schedulingHint:
            "留白代表立即發布；填入時間後，notice 會先維持 scheduled 狀態直到指定時刻。",
          startLabel: "預定開始",
          endLabel: "預定結束",
          currentState: "目前狀態",
          currentReason: "目前原因",
          currentWindow: "目前時窗",
          updatedBy: "更新者",
          createdBy: "建立者",
          lastUpdated: "最後更新",
          allStatuses: "全部狀態",
          allSeverities: "全部嚴重度",
        };

  const activeNoticeCount = notices.filter(
    (notice) => notice.status === "active",
  ).length;
  const scheduledNoticeCount = notices.filter(
    (notice) => notice.status === "scheduled",
  ).length;
  const criticalNoticeCount = notices.filter(
    (notice) => notice.severity === "critical" && notice.status !== "resolved",
  ).length;
  const bannerTone = maintenance?.enabled
    ? "danger"
    : maintenance?.scheduledStart || maintenance?.scheduledEnd
      ? "warning"
      : "info";
  const filteredNotices = notices.filter((notice) => {
    if (statusFilter !== "all" && notice.status !== statusFilter) {
      return false;
    }
    if (severityFilter !== "all" && notice.severity !== severityFilter) {
      return false;
    }
    return true;
  });

  const statusFilters = [
    {
      value: "all",
      label: copy.allStatuses,
      count: notices.length,
      tone: "neutral",
    },
    {
      value: "active",
      label: formatPlatformCodeLabel(locale, "active"),
      count: activeNoticeCount,
      tone: "success",
    },
    {
      value: "scheduled",
      label: formatPlatformCodeLabel(locale, "scheduled"),
      count: scheduledNoticeCount,
      tone: "warning",
    },
    {
      value: "resolved",
      label: formatPlatformCodeLabel(locale, "resolved"),
      count: notices.filter((notice) => notice.status === "resolved").length,
      tone: "neutral",
    },
  ] as const;

  const severityFilters = [
    {
      value: "all",
      label: copy.allSeverities,
      count: notices.length,
      tone: "neutral",
    },
    {
      value: "info",
      label: formatPlatformCodeLabel(locale, "info"),
      count: notices.filter((notice) => notice.severity === "info").length,
      tone: "info",
    },
    {
      value: "warning",
      label: formatPlatformCodeLabel(locale, "warning"),
      count: notices.filter((notice) => notice.severity === "warning").length,
      tone: "warning",
    },
    {
      value: "critical",
      label: formatPlatformCodeLabel(locale, "critical"),
      count: notices.filter((notice) => notice.severity === "critical").length,
      tone: "danger",
    },
  ] as const;

  if (loading) {
    return <div style={emptyStateStyle}>{t("notices.loading")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={t("notices.title")}
        subtitle={copy.subtitle}
        meta={[
          { label: copy.activeNotices, value: activeNoticeCount },
          { label: copy.scheduledNotices, value: scheduledNoticeCount },
          { label: copy.criticalNotices, value: criticalNoticeCount },
        ]}
        actions={
          <button
            style={actionButtonStyle({ tone: "secondary" })}
            onClick={() => void loadData()}
          >
            {t("common.refresh")}
          </button>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={`${getPlatformLabel(locale, "error")}: ${error}`}
        />
      ) : null}

      <CalloutBanner
        tone={bannerTone}
        eyebrow={copy.maintenanceWindow}
        title={
          maintenance?.enabled
            ? copy.activeBannerTitle
            : maintenance?.scheduledStart || maintenance?.scheduledEnd
              ? copy.scheduledBannerTitle
              : copy.idleBannerTitle
        }
        description={
          maintenance?.enabled
            ? copy.activeBannerDescription
            : maintenance?.scheduledStart || maintenance?.scheduledEnd
              ? copy.scheduledBannerDescription
              : copy.idleBannerDescription
        }
      >
        <DetailMetadataGrid
          columns={3}
          minColumnWidth="180px"
          items={[
            {
              id: "maintenance-state",
              label: copy.currentState,
              value: (
                <StatusChip
                  tone={maintenance?.enabled ? "danger" : "success"}
                  label={
                    maintenance?.enabled
                      ? t("notices.maintEnabled")
                      : t("notices.maintDisabled")
                  }
                />
              ),
            },
            {
              id: "maintenance-reason",
              label: copy.currentReason,
              value: maintenance?.reason || copy.noReason,
            },
            {
              id: "maintenance-window",
              label: copy.currentWindow,
              value: formatWindow(
                locale,
                maintenance?.scheduledStart ?? null,
                maintenance?.scheduledEnd ?? null,
              ),
            },
          ]}
        />
      </CalloutBanner>

      <KpiRow minWidth="180px">
        <KpiCard
          label={copy.activeNotices}
          value={activeNoticeCount}
          detail={
            locale === "en"
              ? "Live platform communications"
              : "目前生效中的平台公告"
          }
          tone={activeNoticeCount > 0 ? "success" : "neutral"}
        />
        <KpiCard
          label={copy.scheduledNotices}
          value={scheduledNoticeCount}
          detail={
            locale === "en" ? "Future queued notices" : "已排定未來發布的公告"
          }
          tone={scheduledNoticeCount > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={copy.criticalNotices}
          value={criticalNoticeCount}
          detail={
            locale === "en"
              ? "Unresolved critical messaging"
              : "尚未解除的 critical 訊息"
          }
          tone={criticalNoticeCount > 0 ? "danger" : "success"}
        />
        <KpiCard
          label={copy.maintenanceWindow}
          value={
            maintenance?.enabled
              ? t("notices.maintEnabled")
              : t("notices.maintDisabled")
          }
          detail={formatWindow(
            locale,
            maintenance?.scheduledStart ?? null,
            maintenance?.scheduledEnd ?? null,
          )}
          tone={maintenance?.enabled ? "danger" : "info"}
        />
      </KpiRow>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <WorkflowPanel
          tone="info"
          eyebrow={copy.eyebrow}
          title={copy.openWorkflowTitle}
          description={copy.openWorkflowDescription}
        >
          <form
            onSubmit={handleCreateNotice}
            style={{ display: "grid", gap: 12 }}
          >
            <div>
              <label
                htmlFor="notice-title"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {t("notices.form.title")}
              </label>
              <input
                id="notice-title"
                type="text"
                value={formTitle}
                onChange={(event) => setFormTitle(event.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
                placeholder={t("notices.form.titlePlaceholder")}
              />
            </div>

            <div>
              <label
                htmlFor="notice-body"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {t("notices.form.body")}
              </label>
              <textarea
                id="notice-body"
                value={formBody}
                onChange={(event) => setFormBody(event.target.value)}
                required
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                  resize: "vertical",
                }}
                placeholder={t("notices.form.bodyPlaceholder")}
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {t("notices.form.severity")}
                </label>
                <select
                  value={formSeverity}
                  onChange={(event) =>
                    setFormSeverity(
                      event.target.value as PlatformNoticeSeverity,
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  {SEVERITY_OPTIONS.map((severity) => (
                    <option key={severity} value={severity}>
                      {formatPlatformCodeLabel(locale, severity)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {t("notices.form.audience")}
                </label>
                <select
                  value={formAudience}
                  onChange={(event) =>
                    setFormAudience(
                      event.target.value as
                        | "all"
                        | "tenants"
                        | "ops"
                        | "drivers",
                    )
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
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
              </div>
            </div>

            <div>
              <label
                htmlFor="notice-scheduled-at"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {copy.schedulingLabel}
              </label>
              <input
                id="notice-scheduled-at"
                type="datetime-local"
                value={formScheduledAt}
                onChange={(event) => setFormScheduledAt(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
                {copy.schedulingHint}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                style={actionButtonStyle({ tone: "primary" })}
                disabled={creating || !formTitle.trim() || !formBody.trim()}
              >
                {creating
                  ? t("notices.publishing")
                  : t("notices.publishNotice")}
              </button>
            </div>
          </form>
        </WorkflowPanel>

        <WorkflowPanel
          tone="warning"
          eyebrow={copy.maintenanceWindow}
          title={copy.maintenanceWorkflowTitle}
          description={copy.maintenanceWorkflowDescription}
          meta={
            <DetailMetadataGrid
              dense
              columns={2}
              minColumnWidth="160px"
              items={[
                {
                  id: "maintenance-updated-by",
                  label: copy.updatedBy,
                  value: maintenance?.updatedBy || copy.systemActor,
                },
                {
                  id: "maintenance-last-updated",
                  label: copy.lastUpdated,
                  value: formatDateTime(maintenance?.updatedAt ?? ""),
                },
              ]}
            />
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <strong style={{ fontSize: 14 }}>{copy.currentState}</strong>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {maintenance?.enabled
                    ? t("notices.maintEnabled")
                    : t("notices.maintDisabled")}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={maintEnabled}
                aria-label={copy.currentState}
                onClick={() => setMaintEnabled((value) => !value)}
                style={switchStyle.root(maintEnabled)}
              >
                <span aria-hidden style={switchStyle.thumb(maintEnabled)} />
              </button>
            </div>

            <div>
              <label
                htmlFor="maintenance-reason"
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {t("notices.form.maintenanceReason")}
              </label>
              <input
                id="maintenance-reason"
                type="text"
                value={maintReason}
                onChange={(event) => setMaintReason(event.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 14,
                }}
                placeholder={getPlatformLabel(
                  locale,
                  "maintenanceReasonExample",
                )}
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <div>
                <label
                  htmlFor="maintenance-start"
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {copy.startLabel}
                </label>
                <input
                  id="maintenance-start"
                  type="datetime-local"
                  value={maintScheduledStart}
                  onChange={(event) =>
                    setMaintScheduledStart(event.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="maintenance-end"
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {copy.endLabel}
                </label>
                <input
                  id="maintenance-end"
                  type="datetime-local"
                  value={maintScheduledEnd}
                  onChange={(event) => setMaintScheduledEnd(event.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                style={actionButtonStyle({ tone: "primary" })}
                onClick={() => void handleSetMaintenance()}
                disabled={updatingMaint}
              >
                {updatingMaint
                  ? t("notices.updating")
                  : t("notices.applyMaint")}
              </button>
            </div>
          </div>
        </WorkflowPanel>
      </div>

      <DataViewCard
        title={copy.noticeLedgerTitle}
        subtitle={copy.noticeLedgerSubtitle}
        tone="info"
        summary={copy.noticeLedgerSummary}
        filters={
          <div style={{ display: "grid", gap: 8 }}>
            <DataFilterBar
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as NoticeStatusFilter)}
              ariaLabel={copy.noticeLedgerTitle}
              filters={statusFilters}
            />
            <DataFilterBar
              value={severityFilter}
              onChange={(value) =>
                setSeverityFilter(value as NoticeSeverityFilter)
              }
              ariaLabel={copy.noticeLedgerSubtitle}
              filters={severityFilters}
            />
          </div>
        }
        footer={`${filteredNotices.length} / ${notices.length} ${locale === "en" ? "notices shown" : "筆 notice 已顯示"}`}
      >
        <DataTable
          tone="info"
          minWidth={1080}
          empty={t("notices.empty")}
          columns={[
            { label: t("notices.col.title"), width: "28%" },
            { label: t("notices.col.severity"), width: "12%" },
            { label: t("fleet.col.status"), width: "12%" },
            { label: t("notices.col.audience"), width: "12%" },
            { label: copy.schedulingLabel, width: "18%" },
            { label: t("notices.col.created"), width: "12%" },
            { label: t("common.actions"), width: "6%", align: "right" },
          ]}
        >
          {filteredNotices.map((notice) => (
            <Tr
              key={notice.noticeId}
              highlighted={notice.status !== "resolved"}
            >
              <Td>
                <DataCellStack
                  primary={<strong>{notice.title}</strong>}
                  secondary={notice.body}
                  tertiary={`${getPlatformLabel(locale, "id")}: ${notice.noticeId.slice(0, 16)}…`}
                />
              </Td>
              <Td>
                <StatusChip
                  tone={toneForSeverity(notice.severity)}
                  label={formatPlatformCodeLabel(locale, notice.severity)}
                />
              </Td>
              <Td>
                <StatusChip
                  tone={toneForNoticeStatus(notice.status)}
                  label={formatPlatformCodeLabel(locale, notice.status)}
                />
              </Td>
              <Td>
                <StatusChip
                  tone="info"
                  label={formatPlatformCodeLabel(locale, notice.targetAudience)}
                />
              </Td>
              <Td muted>
                <DataCellStack
                  primary={
                    notice.scheduledAt
                      ? formatDateTime(notice.scheduledAt)
                      : copy.immediate
                  }
                  secondary={formatWindow(
                    locale,
                    notice.scheduledAt,
                    notice.resolvedAt,
                  )}
                />
              </Td>
              <Td muted>
                <DataCellStack
                  primary={formatDateTime(notice.createdAt)}
                  secondary={`${copy.createdBy}: ${notice.createdBy || copy.systemActor}`}
                />
              </Td>
              <Td align="right">
                {notice.status !== "resolved" ? (
                  <button
                    style={actionButtonStyle({ tone: "secondary", size: "sm" })}
                    onClick={() => void handleResolve(notice.noticeId)}
                  >
                    {t("notices.resolve")}
                  </button>
                ) : (
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                )}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </div>
  );
}
