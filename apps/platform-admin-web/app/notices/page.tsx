"use client";

import React, { useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import type {
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

const TIER_META: Record<RefreshTier, { label: string; pollMs: number | null }> =
  {
    urgent: { label: "T0 Urgent", pollMs: 5000 },
    fast: { label: "T1 Fast", pollMs: 3000 },
    dispatch: { label: "T2 Dispatch", pollMs: 5000 },
    medium: { label: "T3 Medium", pollMs: 15000 },
    medium_slow: { label: "T4 Admin medium-slow", pollMs: 30000 },
    slow: { label: "T5 Slow", pollMs: 30000 },
    manual: { label: "T6 Manual", pollMs: null },
  };

type TabId = "notices" | "maintenance" | "history";
type ActionTarget =
  | { kind: "create"; descriptor: ResourceActionDescriptor }
  | {
      kind: "resolve";
      descriptor: ResourceActionDescriptor;
      notice: PlatformNoticeWorkspaceRecord;
    }
  | { kind: "maintenance"; descriptor: ResourceActionDescriptor };

function cardTone(reason: EmptyStateEnvelope["reason"]) {
  switch (reason) {
    case "permission_denied":
      return {
        border: "rgba(59,130,246,0.35)",
        background: "linear-gradient(135deg, #eff6ff, #ffffff)",
        title: "Permission required",
      };
    case "fetch_failed":
      return {
        border: "rgba(239,68,68,0.35)",
        background: "linear-gradient(135deg, #fef2f2, #ffffff)",
        title: "Could not load data",
      };
    case "external_unavailable":
      return {
        border: "rgba(245,158,11,0.35)",
        background: "linear-gradient(135deg, #fffbeb, #ffffff)",
        title: "External dependency unavailable",
      };
    case "not_provisioned":
      return {
        border: "rgba(16,185,129,0.35)",
        background: "linear-gradient(135deg, #ecfdf5, #ffffff)",
        title: "Not provisioned yet",
      };
    case "filtered_empty":
      return {
        border: "rgba(100,116,139,0.35)",
        background: "linear-gradient(135deg, #f8fafc, #ffffff)",
        title: "No matches",
      };
    case "no_data":
    default:
      return {
        border: "rgba(148,163,184,0.35)",
        background: "linear-gradient(135deg, #f8fafc, #ffffff)",
        title: "Nothing here yet",
      };
  }
}

function actionLabel(action: string) {
  switch (action) {
    case "create_notice":
      return "Create notice";
    case "resolve_notice":
      return "Resolve";
    case "set_maintenance_mode":
      return "Enable maintenance";
    case "clear_maintenance_mode":
      return "Clear maintenance";
    default:
      return action.replaceAll("_", " ");
  }
}

function actionHelpText(target: ActionTarget | null) {
  if (!target) return "";
  if (target.kind === "create") {
    return "Publishing a critical or maintenance notice requires a reason and returns an audit receipt.";
  }
  if (target.kind === "maintenance") {
    return "Maintenance mode is high risk and requires a reason before the platform banner propagates.";
  }
  return "Resolving a notice records an audit event and removes it from the active stream.";
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

  async function loadWorkspace(mode: "initial" | "refresh" = "initial") {
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
        next.maintenance.currentState.scheduledStart
          ? next.maintenance.currentState.scheduledStart.slice(0, 16)
          : "",
      );
      setMaintScheduledEnd(
        next.maintenance.currentState.scheduledEnd
          ? next.maintenance.currentState.scheduledEnd.slice(0, 16)
          : "",
      );
    } catch (nextError: any) {
      setError(nextError?.message || String(nextError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!workspace || tierMeta.pollMs === null) return;
    const timer = window.setInterval(() => {
      void loadWorkspace("refresh");
    }, tierMeta.pollMs);
    return () => window.clearInterval(timer);
  }, [tierMeta.pollMs, workspace]);

  function openAction(target: ActionTarget) {
    setReasonDraft("");
    setPendingAction(target);
  }

  async function submitPendingAction() {
    if (!pendingAction) return;
    if (pendingAction.descriptor.requiresReason && !reasonDraft.trim()) return;

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
          enabled: maintEnabled,
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
      setPendingAction(null);
      setReasonDraft("");
      await loadWorkspace("refresh");
    } catch (nextError: any) {
      setError(nextError?.message || String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  const activeCount =
    workspace?.notices.items.filter(
      (item: PlatformNoticeWorkspaceRecord) => item.status === "active",
    ).length ?? 0;

  if (loading && !workspace) {
    return <div className="admin-empty">{t("notices.loading")}</div>;
  }

  const dataFreshness = workspace?.refresh.dataFreshness ?? "unknown";
  const maintenance = workspace?.maintenance.currentState;
  const primaryNoticeAction = workspace?.notices.availableActions[0];
  const primaryMaintenanceAction = workspace?.maintenance.availableActions[0];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-page-header">
        <h1>{t("notices.title")}</h1>
        <p>
          {t("notices.subtitle", { count: activeCount })} · refresh tier{" "}
          {tierMeta.label}
        </p>
      </div>

      {receipt && (
        <div
          className="admin-card"
          style={{
            borderColor: "rgba(29,78,216,0.3)",
            background: "linear-gradient(135deg, #eff6ff, #ffffff)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {receipt.message}
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                audit {receipt.auditId} · action {receipt.actionId}
              </div>
            </div>
            <a
              href={`/audit?auditId=${receipt.auditId}`}
              className="admin-btn admin-btn--secondary"
            >
              View audit
            </a>
          </div>
        </div>
      )}

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)", color: "#991b1b" }}
        >
          {error}
        </div>
      )}

      {maintenance?.enabled && (
        <div
          className="admin-card"
          style={{
            borderColor: "rgba(239,68,68,0.35)",
            background: "linear-gradient(135deg, #fff1f2, #ffffff)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "#991b1b" }}>
                {t("notices.maintActiveBanner")}
              </div>
              <div style={{ fontSize: 13, color: "#7f1d1d" }}>
                {maintenance.reason || t("notices.maintActive")}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#7f1d1d" }}>
              {formatDateTime(maintenance.updatedAt)}
            </div>
          </div>
        </div>
      )}

      <div
        className="admin-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div className="admin-toggle-group">
          <button
            className={`admin-toggle-btn ${activeTab === "notices" ? "active" : ""}`}
            onClick={() => setActiveTab("notices")}
          >
            {t("notices.tab.notices")} ({workspace?.notices.items.length ?? 0})
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "maintenance" ? "active" : ""}`}
            onClick={() => setActiveTab("maintenance")}
          >
            {t("notices.tab.maintenance")}
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Broadcast History
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeTab === "notices" && primaryNoticeAction && (
            <button
              className="admin-btn admin-btn--primary"
              onClick={() =>
                openAction({
                  kind: "create",
                  descriptor: primaryNoticeAction,
                })
              }
            >
              {t("notices.newNotice")}
            </button>
          )}
          {activeTab === "maintenance" && primaryMaintenanceAction && (
            <button
              className="admin-btn admin-btn--primary"
              onClick={() =>
                openAction({
                  kind: "maintenance",
                  descriptor: primaryMaintenanceAction,
                })
              }
            >
              {actionLabel(primaryMaintenanceAction.action)}
            </button>
          )}
          <button
            className="admin-btn admin-btn--secondary"
            onClick={() => void loadWorkspace("refresh")}
          >
            {refreshing ? "Refreshing..." : t("common.refresh")}
          </button>
        </div>
      </div>

      <div
        className="admin-card"
        style={{
          borderColor:
            dataFreshness === "fresh"
              ? "rgba(148,163,184,0.2)"
              : "rgba(245,158,11,0.35)",
          background:
            dataFreshness === "fresh"
              ? "#ffffff"
              : "linear-gradient(135deg, #fffbeb, #ffffff)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13 }}>
            Snapshot generated{" "}
            {formatDateTime(workspace?.refresh.generatedAt || "")}
            {" · "}
            {formatPlatformCodeLabel(locale, dataFreshness)}
            {" · "}
            {workspace?.refresh.source || "live"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            stale after {workspace?.refresh.staleAfterMs ?? 0} ms
          </div>
        </div>
      </div>

      {activeTab === "notices" && (
        <div style={{ display: "grid", gap: 16 }}>
          <NoticeComposer
            t={t}
            locale={locale}
            title={noticeTitle}
            body={noticeBody}
            severity={noticeSeverity}
            audience={noticeAudience}
            scheduledAt={noticeScheduledAt}
            onTitleChange={setNoticeTitle}
            onBodyChange={setNoticeBody}
            onSeverityChange={setNoticeSeverity}
            onAudienceChange={setNoticeAudience}
            onScheduledAtChange={setNoticeScheduledAt}
          />
          {workspace?.notices.items.length ? (
            <div className="admin-card" style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{t("notices.col.title")}</th>
                    <th>{t("notices.col.severity")}</th>
                    <th>{t("fleet.col.status")}</th>
                    <th>{t("notices.col.audience")}</th>
                    <th>Delivery</th>
                    <th>Deep links</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.notices.items.map((notice) => (
                    <NoticeRow
                      key={notice.noticeId}
                      locale={locale}
                      notice={notice}
                      onAction={openAction}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            renderEmptyState(workspace?.notices.emptyState, primaryNoticeAction)
          )}
        </div>
      )}

      {activeTab === "maintenance" && workspace && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)",
            gap: 16,
          }}
        >
          <div className="admin-card" style={{ display: "grid", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                {t("notices.currentStatus")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className={`admin-badge ${
                    maintenance?.enabled
                      ? "admin-badge--danger"
                      : "admin-badge--success"
                  }`}
                >
                  {maintenance?.enabled
                    ? t("notices.maintEnabled")
                    : t("notices.maintDisabled")}
                </span>
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  updated {formatDateTime(maintenance?.updatedAt || "")}
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <Field
                label="Maintenance enabled"
                control={
                  <label className="admin-switch">
                    <input
                      type="checkbox"
                      checked={maintEnabled}
                      onChange={(event) =>
                        setMaintEnabled(event.target.checked)
                      }
                    />
                    <span className="admin-switch-slider" />
                  </label>
                }
              />
              <Field
                label="Affected services"
                control={
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {workspace.maintenance.affectedServices.map((service) => (
                      <span
                        key={service}
                        className="admin-badge admin-badge--warning"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                }
              />
              <Field
                label={t("notices.form.maintenanceReason")}
                control={
                  <textarea
                    value={maintReason}
                    onChange={(event) => setMaintReason(event.target.value)}
                    rows={3}
                    style={inputStyle(true)}
                  />
                }
              />
              <Field
                label="Scheduled start"
                control={
                  <input
                    type="datetime-local"
                    value={maintScheduledStart}
                    onChange={(event) =>
                      setMaintScheduledStart(event.target.value)
                    }
                    style={inputStyle()}
                  />
                }
              />
              <Field
                label="Scheduled end"
                control={
                  <input
                    type="datetime-local"
                    value={maintScheduledEnd}
                    onChange={(event) =>
                      setMaintScheduledEnd(event.target.value)
                    }
                    style={inputStyle()}
                  />
                }
              />
            </div>
          </div>

          <div className="admin-card" style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Banner preview
              </div>
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(239,68,68,0.28)",
                  background: "linear-gradient(135deg, #fff1f2, #ffffff)",
                }}
              >
                <div
                  style={{ fontWeight: 700, color: "#991b1b", marginBottom: 6 }}
                >
                  {workspace.maintenance.previewTitle}
                </div>
                <div
                  style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.5 }}
                >
                  {workspace.maintenance.previewBody}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Cross-app deep links
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {workspace.maintenance.crossAppLinks.map((link) => (
                  <a
                    key={`${link.targetApp}-${link.route}`}
                    href={link.route}
                    target={link.openMode === "new_tab" ? "_blank" : undefined}
                    rel="noreferrer"
                    style={deepLinkStyle}
                  >
                    {link.label} · {link.targetApp}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" &&
        (workspace?.history.items.length ? (
          <div className="admin-card" style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("notices.col.title")}</th>
                  <th>{t("notices.col.severity")}</th>
                  <th>Targets</th>
                  <th>Delivery</th>
                  <th>Broadcast at</th>
                  <th>Deep links</th>
                </tr>
              </thead>
              <tbody>
                {workspace.history.items.map((record) => (
                  <HistoryRow
                    key={record.noticeId}
                    locale={locale}
                    record={record}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          renderEmptyState(workspace?.history.emptyState)
        ))}

      {pendingAction && (
        <div style={modalScrimStyle}>
          <div className="admin-card" style={modalCardStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {formatPlatformCodeLabel(
                  locale,
                  pendingAction.descriptor.riskLevel,
                )}
                {" risk action"}
              </div>
              <h3 style={{ margin: 0 }}>
                {actionLabel(pendingAction.descriptor.action)}
              </h3>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.5 }}>
                {actionHelpText(pendingAction)}
              </p>
            </div>
            <textarea
              value={reasonDraft}
              onChange={(event) => setReasonDraft(event.target.value)}
              rows={4}
              placeholder={
                pendingAction.descriptor.requiresReason
                  ? "Required reason"
                  : "Optional audit note"
              }
              style={inputStyle(true)}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                className="admin-btn admin-btn--secondary"
                onClick={() => setPendingAction(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="admin-btn admin-btn--primary"
                onClick={() => void submitPendingAction()}
                disabled={
                  submitting ||
                  (pendingAction.descriptor.requiresReason &&
                    !reasonDraft.trim())
                }
              >
                {submitting
                  ? t("notices.updating")
                  : actionLabel(pendingAction.descriptor.action)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoticeComposer(props: {
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: Locale;
  title: string;
  body: string;
  severity: PlatformNoticeSeverity;
  audience: PlatformNoticeAudience;
  scheduledAt: string;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSeverityChange: (value: PlatformNoticeSeverity) => void;
  onAudienceChange: (value: PlatformNoticeAudience) => void;
  onScheduledAtChange: (value: string) => void;
}) {
  return (
    <div className="admin-card" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontWeight: 700 }}>{props.t("notices.newNotice")}</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          Critical and maintenance notices fan out to cross-app banners and will
          require a reason at publish time.
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <Field
          label={props.t("notices.form.title")}
          control={
            <input
              value={props.title}
              onChange={(event) => props.onTitleChange(event.target.value)}
              style={inputStyle()}
            />
          }
        />
        <Field
          label={props.t("notices.form.severity")}
          control={
            <select
              value={props.severity}
              onChange={(event) =>
                props.onSeverityChange(
                  event.target.value as PlatformNoticeSeverity,
                )
              }
              style={inputStyle()}
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatPlatformCodeLabel(props.locale, option)}
                </option>
              ))}
            </select>
          }
        />
        <Field
          label={props.t("notices.form.audience")}
          control={
            <select
              value={props.audience}
              onChange={(event) =>
                props.onAudienceChange(
                  event.target.value as PlatformNoticeAudience,
                )
              }
              style={inputStyle()}
            >
              {AUDIENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatPlatformCodeLabel(props.locale, option)}
                </option>
              ))}
            </select>
          }
        />
        <Field
          label="Scheduled start"
          control={
            <input
              type="datetime-local"
              value={props.scheduledAt}
              onChange={(event) =>
                props.onScheduledAtChange(event.target.value)
              }
              style={inputStyle()}
            />
          }
        />
      </div>
      <Field
        label={props.t("notices.form.body")}
        control={
          <textarea
            value={props.body}
            onChange={(event) => props.onBodyChange(event.target.value)}
            rows={4}
            style={inputStyle(true)}
          />
        }
      />
    </div>
  );
}

function NoticeRow(props: {
  locale: Locale;
  notice: PlatformNoticeWorkspaceRecord;
  onAction: (target: ActionTarget) => void;
}) {
  const action = props.notice.availableActions[0];

  return (
    <tr>
      <td style={monoCellStyle}>{props.notice.noticeId}</td>
      <td>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {props.notice.title}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          {props.notice.body}
        </div>
      </td>
      <td>
        <span className={`admin-badge ${severityBadge(props.notice.severity)}`}>
          {formatPlatformCodeLabel(props.locale, props.notice.severity)}
        </span>
      </td>
      <td>
        <span className={`admin-badge ${statusBadge(props.notice.status)}`}>
          {formatPlatformCodeLabel(props.locale, props.notice.status)}
        </span>
      </td>
      <td>
        <span className="admin-badge admin-badge--info">
          {formatPlatformCodeLabel(props.locale, props.notice.targetAudience)}
        </span>
      </td>
      <td>
        <div style={{ fontSize: 12, color: "#0f172a" }}>
          {props.notice.deliverySummary}
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          updated {formatDateTime(props.notice.updatedAt)}
        </div>
      </td>
      <td>
        <div style={{ display: "grid", gap: 6 }}>
          {props.notice.crossAppLinks.map((link) => (
            <a
              key={`${link.targetApp}-${link.route}`}
              href={link.route}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel="noreferrer"
              style={tableLinkStyle}
            >
              {link.targetApp}
            </a>
          ))}
        </div>
      </td>
      <td>
        <button
          className="admin-btn admin-btn--secondary admin-btn--sm"
          onClick={() => {
            if (!action) return;
            props.onAction({
              kind: "resolve",
              descriptor: action,
              notice: props.notice,
            });
          }}
          disabled={!action?.enabled}
          title={action?.disabledReasonCode}
        >
          {actionLabel(action?.action || "resolve_notice")}
        </button>
      </td>
    </tr>
  );
}

function HistoryRow(props: {
  locale: Locale;
  record: PlatformNoticeHistoryRecord;
}) {
  return (
    <tr>
      <td style={monoCellStyle}>{props.record.noticeId}</td>
      <td>{props.record.title}</td>
      <td>
        <span className={`admin-badge ${severityBadge(props.record.severity)}`}>
          {formatPlatformCodeLabel(props.locale, props.record.severity)}
        </span>
      </td>
      <td style={{ fontSize: 12 }}>
        {props.record.deliveredAudienceLabels.join(" / ")}
      </td>
      <td>
        <span
          className={`admin-badge ${broadcastBadge(props.record.deliveryStatus)}`}
        >
          {props.record.deliveryDetail}
        </span>
      </td>
      <td style={{ fontSize: 12 }}>
        {formatDateTime(props.record.broadcastAt)}
      </td>
      <td>
        <div style={{ display: "grid", gap: 6 }}>
          {props.record.crossAppLinks.map((link) => (
            <a
              key={`${link.targetApp}-${link.route}`}
              href={link.route}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel="noreferrer"
              style={tableLinkStyle}
            >
              {link.label}
            </a>
          ))}
        </div>
      </td>
    </tr>
  );
}

function renderEmptyState(
  emptyState?: EmptyStateEnvelope,
  nextAction?: ResourceActionDescriptor,
) {
  const reason = emptyState?.reason ?? "no_data";
  const tone = cardTone(reason);

  return (
    <div
      className="admin-card"
      style={{
        borderStyle: "dashed",
        borderColor: tone.border,
        background: tone.background,
        textAlign: "center",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700 }}>{tone.title}</div>
      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
        {emptyState?.messageCode || "No records returned for this workspace."}
      </div>
      {nextAction && (
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Suggested next action: {actionLabel(nextAction.action)}
        </div>
      )}
    </div>
  );
}

function severityBadge(severity: PlatformNoticeSeverity) {
  switch (severity) {
    case "critical":
    case "maintenance":
      return "admin-badge--danger";
    case "warning":
      return "admin-badge--warning";
    default:
      return "admin-badge--info";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return "admin-badge--success";
    case "scheduled":
      return "admin-badge--warning";
    default:
      return "admin-badge--neutral";
  }
}

function broadcastBadge(status: string) {
  switch (status) {
    case "propagating":
      return "admin-badge--warning";
    case "queued":
      return "admin-badge--neutral";
    default:
      return "admin-badge--success";
  }
}

function Field(props: { label: string; control: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
        {props.label}
      </label>
      {props.control}
    </div>
  );
}

function inputStyle(multiline = false): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    fontSize: 14,
    background: "#ffffff",
    resize: multiline ? "vertical" : undefined,
  };
}

const monoCellStyle: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};

const deepLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#1d4ed8",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  fontSize: 13,
};

const tableLinkStyle: React.CSSProperties = {
  color: "#1d4ed8",
  fontSize: 12,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const modalScrimStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.42)",
  display: "grid",
  placeItems: "center",
  padding: 20,
  zIndex: 30,
};

const modalCardStyle: React.CSSProperties = {
  width: "min(560px, 100%)",
  display: "grid",
  gap: 14,
};
