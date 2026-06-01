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
        next.maintenance.currentState.scheduledStart?.slice(0, 16) ?? "",
      );
      setMaintScheduledEnd(
        next.maintenance.currentState.scheduledEnd?.slice(0, 16) ?? "",
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

  function closePendingAction() {
    setPendingAction(null);
    setReasonDraft("");
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
    } catch (nextError: any) {
      setError(nextError?.message || String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  const maintenance = workspace?.maintenance.currentState;
  const notices = workspace?.notices.items ?? [];
  const history = workspace?.history.items ?? [];
  const activeCount = notices.filter((item) => item.status === "active").length;
  const scheduledCount = notices.filter(
    (item) => item.status === "scheduled",
  ).length;
  const propagatingCount = notices.filter(
    (item) => item.broadcastStatus === "propagating",
  ).length;
  const deliveredHistoryCount = history.filter(
    (item) => item.deliveryStatus === "delivered",
  ).length;
  const createNoticeAction = workspace?.notices.availableActions.find(
    (descriptor) => descriptor.action === "create_notice",
  );
  const tabActions = getTabActions(workspace, activeTab);
  const dataFreshness = workspace?.refresh.dataFreshness ?? "unknown";

  if (loading && !workspace) {
    return <div className="admin-empty">{t("notices.loading")}</div>;
  }

  return (
    <div style={pageStyle}>
      <div style={heroStyle}>
        <div style={heroHeaderRowStyle}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={eyebrowStyle}>Platform ops / risk governance</div>
            <h1 style={heroTitleStyle}>Notices &amp; Maintenance</h1>
            <p style={heroSubtitleStyle}>
              Critical and maintenance notices propagate cross-app banners to
              ops, tenant, and driver surfaces. Refresh tier is {tierMeta.label}{" "}
              ({tierMeta.cadence}).
            </p>
          </div>
          <div style={heroBadgeClusterStyle}>
            <MetricChip
              label="Active notices"
              value={String(activeCount)}
              tone="neutral"
            />
            <MetricChip
              label="Propagating"
              value={String(propagatingCount)}
              tone={propagatingCount ? "warning" : "success"}
            />
            <MetricChip
              label="Maintenance"
              value={maintenance?.enabled ? "ON" : "OFF"}
              tone={maintenance?.enabled ? "danger" : "success"}
            />
          </div>
        </div>

        <div style={heroGridStyle}>
          <SummaryCard
            title="Live workspace"
            value={`${notices.length} notices`}
            note={`${scheduledCount} scheduled · ${history.length} history items`}
          />
          <SummaryCard
            title="Delivery state"
            value={formatPlatformCodeLabel(locale, dataFreshness)}
            note={`source ${workspace?.refresh.source ?? "live"} · stale after ${workspace?.refresh.staleAfterMs ?? 0} ms`}
          />
          <SummaryCard
            title="Broadcast history"
            value={`${deliveredHistoryCount}/${history.length || 0}`}
            note="Delivered snapshots across downstream surfaces"
          />
          <SummaryCard
            title="Last generated"
            value={formatDateTime(workspace?.refresh.generatedAt ?? "")}
            note="Workspace snapshot timestamp"
          />
        </div>
      </div>

      {receipt && (
        <section style={receiptCardStyle}>
          <div style={receiptCardHeaderStyle}>
            <div>
              <div style={receiptTitleStyle}>{receipt.message}</div>
              <div style={receiptMetaStyle}>
                audit {receipt.auditId} · action {receipt.actionId} ·{" "}
                {receipt.status}
              </div>
            </div>
            <a
              href={`/audit?auditId=${receipt.auditId}`}
              style={primaryLinkStyle}
            >
              View audit
            </a>
          </div>
        </section>
      )}

      {error && (
        <section style={errorCardStyle}>
          <div style={sectionTitleStyle}>Request error</div>
          <div style={mutedBodyStyle}>{error}</div>
        </section>
      )}

      {maintenance?.enabled && (
        <section style={maintenanceBannerStyle}>
          <div style={maintenanceBannerTitleStyle}>
            Maintenance mode is active
          </div>
          <div style={maintenanceBannerBodyStyle}>
            {maintenance.reason || t("notices.maintActive")} · updated{" "}
            {formatDateTime(maintenance.updatedAt)}
          </div>
        </section>
      )}

      <section style={toolbarCardStyle}>
        <div style={tabRowStyle}>
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={tabButtonStyle(activeTab === tab.id)}
            >
              {tab.label}
              <span style={tabCountStyle(activeTab === tab.id)}>
                {tab.id === "notices"
                  ? notices.length
                  : tab.id === "maintenance"
                    ? maintenance?.enabled
                      ? "ON"
                      : "OFF"
                    : history.length}
              </span>
            </button>
          ))}
        </div>
        <div style={toolbarActionsStyle}>
          {tabActions.map((descriptor) => (
            <ActionDescriptorButton
              key={`${activeTab}-${descriptor.action}`}
              descriptor={descriptor}
              tone={descriptor.riskLevel === "high" ? "primary" : "secondary"}
              onClick={() => handleTabAction(descriptor, activeTab, openAction)}
            />
          ))}
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => void loadWorkspace("refresh")}
          >
            {refreshing ? "Refreshing..." : t("common.refresh")}
          </button>
        </div>
      </section>

      <section style={snapshotCardStyle(dataFreshness)}>
        <div style={snapshotLeftStyle}>
          <div style={sectionEyebrowStyle}>Refresh contract</div>
          <div style={snapshotTitleStyle}>
            {tierMeta.label} · {tierMeta.cadence}
          </div>
          <div style={mutedBodyStyle}>
            Generated {formatDateTime(workspace?.refresh.generatedAt ?? "")} ·{" "}
            {formatPlatformCodeLabel(locale, dataFreshness)}
          </div>
        </div>
        <div style={snapshotRightStyle}>
          <SnapshotPill
            label="source"
            value={workspace?.refresh.source ?? "live"}
          />
          <SnapshotPill
            label="stale after"
            value={`${workspace?.refresh.staleAfterMs ?? 0} ms`}
          />
        </div>
      </section>

      {activeTab === "notices" && workspace && (
        <section style={contentGridStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            {createNoticeAction ? (
              <NoticeComposer
                t={t}
                locale={locale}
                title={noticeTitle}
                body={noticeBody}
                severity={noticeSeverity}
                audience={noticeAudience}
                scheduledAt={noticeScheduledAt}
                createAction={createNoticeAction}
                onOpenCreate={(descriptor) =>
                  openAction({ kind: "create", descriptor })
                }
                onTitleChange={setNoticeTitle}
                onBodyChange={setNoticeBody}
                onSeverityChange={setNoticeSeverity}
                onAudienceChange={setNoticeAudience}
                onScheduledAtChange={setNoticeScheduledAt}
              />
            ) : (
              <SupportCard
                title="Creation action unavailable"
                body="Notice publishing is driven by availableActions. This role can review active broadcasts and downstream links, but cannot compose a new platform notice from this workspace snapshot."
              />
            )}
            {workspace.notices.items.length ? (
              <div style={tableCardStyle}>
                <div style={tableCardHeaderStyle}>
                  <div>
                    <div style={sectionEyebrowStyle}>Notices</div>
                    <div style={sectionTitleStyle}>
                      Active and scheduled broadcasts
                    </div>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Notice</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Audience</th>
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
              </div>
            ) : (
              <EmptyStateCard
                emptyState={workspace.notices.emptyState}
                fallbackAction={workspace.notices.availableActions[0]}
                onAction={(descriptor) =>
                  openAction({ kind: "create", descriptor })
                }
              />
            )}
          </div>

          <aside style={{ display: "grid", gap: 16 }}>
            <SupportCard
              title="Broadcast policy"
              body="Critical and maintenance severities require a reason and return an audit-linked receipt. Use maintenance severity when the downstream apps must show a persistent warning banner."
            />
            <LinkCard
              title="Downstream banner targets"
              links={collectNoticeLinks(notices)}
            />
          </aside>
        </section>
      )}

      {activeTab === "maintenance" && workspace && (
        <section style={contentGridStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            <section style={panelCardStyle}>
              <div style={panelHeaderStyle}>
                <div>
                  <div style={sectionEyebrowStyle}>Maintenance mode</div>
                  <div style={sectionTitleStyle}>
                    Current state and schedule
                  </div>
                </div>
                <span
                  style={statusBadgeStyle(
                    maintenance?.enabled ? "danger" : "success",
                  )}
                >
                  {maintenance?.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div style={maintenanceStatusCardStyle}>
                <div style={maintenanceStatusHeaderStyle}>
                  <div>
                    <div style={maintenanceStatusTitleStyle}>
                      Platform-wide maintenance gate
                    </div>
                    <div style={mutedBodyStyle}>
                      Stops dispatch, webhook delivery, partner ingress, and
                      tenant sync for the scheduled window.
                    </div>
                  </div>
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
                </div>
              </div>

              <div style={maintenanceFieldGridStyle}>
                <Field
                  label="Current reason"
                  control={
                    <textarea
                      value={maintReason}
                      onChange={(event) => setMaintReason(event.target.value)}
                      rows={4}
                      style={textAreaStyle}
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
                      style={inputFieldStyle}
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
                      style={inputFieldStyle}
                    />
                  }
                />
                <Field
                  label="Affected services"
                  control={
                    <div style={badgeWrapStyle}>
                      {workspace.maintenance.affectedServices.map((service) => (
                        <span key={service} style={statusBadgeStyle("warning")}>
                          {service}
                        </span>
                      ))}
                    </div>
                  }
                />
              </div>

              <div style={toolbarActionsStyle}>
                {workspace.maintenance.availableActions.map((descriptor) => (
                  <ActionDescriptorButton
                    key={descriptor.action}
                    descriptor={descriptor}
                    tone="primary"
                    onClick={() =>
                      openAction({
                        kind: "maintenance",
                        descriptor,
                        enabled: descriptor.action !== "clear_maintenance_mode",
                      })
                    }
                  />
                ))}
              </div>
            </section>
          </div>

          <aside style={{ display: "grid", gap: 16 }}>
            <section style={panelCardStyle}>
              <div style={sectionEyebrowStyle}>Preview</div>
              <div style={sectionTitleStyle}>Current maintenance notice</div>
              <div style={previewBannerStyle}>
                <div style={previewBannerTitleStyle}>
                  {workspace.maintenance.previewTitle}
                </div>
                <div style={previewBannerBodyStyle}>
                  {workspace.maintenance.previewBody}
                </div>
              </div>
            </section>

            <LinkCard
              title="Cross-app deep links"
              links={workspace.maintenance.crossAppLinks}
            />
          </aside>
        </section>
      )}

      {activeTab === "history" && workspace && (
        <section style={contentGridStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            {workspace.history.items.length ? (
              <div style={tableCardStyle}>
                <div style={tableCardHeaderStyle}>
                  <div>
                    <div style={sectionEyebrowStyle}>Broadcast history</div>
                    <div style={sectionTitleStyle}>
                      Read-only cross-app delivery receipts
                    </div>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Severity</th>
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
              </div>
            ) : (
              <EmptyStateCard emptyState={workspace.history.emptyState} />
            )}
          </div>

          <aside style={{ display: "grid", gap: 16 }}>
            <SupportCard
              title="Read-only history"
              body="Broadcast History is intentionally read-only. Use the active Notices tab for current-state intervention, and use the audit receipt link after mutations for durable evidence."
            />
          </aside>
        </section>
      )}

      {pendingAction && (
        <div style={modalScrimStyle}>
          <div style={modalCardStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={sectionEyebrowStyle}>
                {formatPlatformCodeLabel(
                  locale,
                  pendingAction.descriptor.riskLevel,
                )}{" "}
                risk action
              </div>
              <h3 style={modalTitleStyle}>
                {actionLabel(pendingAction.descriptor.action)}
              </h3>
              <p style={modalBodyStyle}>{actionHelpText(pendingAction)}</p>
            </div>

            {pendingAction.kind === "create" && (
              <div style={modalPreviewStyle}>
                <div style={sectionEyebrowStyle}>Pending notice</div>
                <div style={modalPreviewTitleStyle}>
                  {noticeTitle.trim() || "Untitled notice"}
                </div>
                <div style={mutedBodyStyle}>
                  {noticeBody.trim() || "Add notice body before publishing."}
                </div>
              </div>
            )}

            <textarea
              value={reasonDraft}
              onChange={(event) => setReasonDraft(event.target.value)}
              rows={4}
              placeholder={
                pendingAction.descriptor.requiresReason
                  ? "Required reason"
                  : "Optional audit note"
              }
              style={textAreaStyle}
            />

            <div style={modalActionsStyle}>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={closePendingAction}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => void submitPendingAction()}
                disabled={
                  submitting ||
                  !canSubmitAction(
                    pendingAction,
                    reasonDraft,
                    noticeTitle,
                    noticeBody,
                  )
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

const TAB_DEFS: Array<{ id: TabId; label: string }> = [
  { id: "notices", label: "Notices" },
  { id: "maintenance", label: "Maintenance Mode" },
  { id: "history", label: "Broadcast History" },
];

function NoticeComposer(props: {
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: Locale;
  title: string;
  body: string;
  severity: PlatformNoticeSeverity;
  audience: PlatformNoticeAudience;
  scheduledAt: string;
  createAction: ResourceActionDescriptor | undefined;
  onOpenCreate: (descriptor: ResourceActionDescriptor) => void;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSeverityChange: (value: PlatformNoticeSeverity) => void;
  onAudienceChange: (value: PlatformNoticeAudience) => void;
  onScheduledAtChange: (value: string) => void;
}) {
  return (
    <section style={panelCardStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <div style={sectionEyebrowStyle}>Compose</div>
          <div style={sectionTitleStyle}>Create platform notice</div>
        </div>
        {props.createAction && (
          <ActionDescriptorButton
            descriptor={props.createAction}
            tone="primary"
            onClick={() => props.onOpenCreate(props.createAction!)}
          />
        )}
      </div>
      <div style={mutedBodyStyle}>
        Critical and maintenance severities require a reason at publish time and
        fan out to downstream banner surfaces.
      </div>

      <div style={noticeComposerGridStyle}>
        <Field
          label={props.t("notices.form.title")}
          control={
            <input
              value={props.title}
              onChange={(event) => props.onTitleChange(event.target.value)}
              style={inputFieldStyle}
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
              style={inputFieldStyle}
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
              style={inputFieldStyle}
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
              style={inputFieldStyle}
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
            rows={5}
            style={textAreaStyle}
          />
        }
      />
    </section>
  );
}

function NoticeRow(props: {
  locale: Locale;
  notice: PlatformNoticeWorkspaceRecord;
  onAction: (target: ActionTarget) => void;
}) {
  return (
    <tr>
      <td style={monoCellStyle}>{props.notice.noticeId}</td>
      <td>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700, color: "#111827" }}>
            {props.notice.title}
          </div>
          <div style={tableBodyTextStyle}>{props.notice.body}</div>
        </div>
      </td>
      <td>
        <span style={statusBadgeStyle(severityTone(props.notice.severity))}>
          {formatPlatformCodeLabel(props.locale, props.notice.severity)}
        </span>
      </td>
      <td>
        <span style={statusBadgeStyle(statusTone(props.notice.status))}>
          {formatPlatformCodeLabel(props.locale, props.notice.status)}
        </span>
      </td>
      <td>
        <span style={statusBadgeStyle("info")}>
          {formatPlatformCodeLabel(props.locale, props.notice.targetAudience)}
        </span>
      </td>
      <td>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={tableBodyTextStyle}>{props.notice.deliverySummary}</span>
          <span style={subtleMonoStyle}>
            {props.notice.broadcastStatus} ·{" "}
            {formatDateTime(props.notice.updatedAt)}
          </span>
        </div>
      </td>
      <td>
        <LinkStack links={props.notice.crossAppLinks} compact />
      </td>
      <td>
        <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          {props.notice.availableActions.map((descriptor) => (
            <ActionDescriptorButton
              key={`${props.notice.noticeId}-${descriptor.action}`}
              descriptor={descriptor}
              size="sm"
              tone="secondary"
              onClick={() =>
                props.onAction({
                  kind: "resolve",
                  descriptor,
                  notice: props.notice,
                })
              }
            />
          ))}
        </div>
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
      <td>
        <div style={{ fontWeight: 700, color: "#111827" }}>
          {props.record.title}
        </div>
      </td>
      <td>
        <span style={statusBadgeStyle(severityTone(props.record.severity))}>
          {formatPlatformCodeLabel(props.locale, props.record.severity)}
        </span>
      </td>
      <td style={tableBodyTextStyle}>
        {props.record.deliveredAudienceLabels.join(" / ")}
      </td>
      <td>
        <div style={{ display: "grid", gap: 4 }}>
          <span
            style={statusBadgeStyle(broadcastTone(props.record.deliveryStatus))}
          >
            {props.record.deliveryDetail}
          </span>
          <span style={subtleMonoStyle}>
            {props.record.deliveredCount}/{props.record.targetCount} targets
          </span>
        </div>
      </td>
      <td style={subtleMonoStyle}>
        {formatDateTime(props.record.broadcastAt)}
      </td>
      <td>
        <LinkStack links={props.record.crossAppLinks} compact />
      </td>
    </tr>
  );
}

function EmptyStateCard(props: {
  emptyState: EmptyStateEnvelope | undefined;
  fallbackAction?: ResourceActionDescriptor | undefined;
  onAction?: ((descriptor: ResourceActionDescriptor) => void) | undefined;
}) {
  const reason = props.emptyState?.reason ?? "no_data";
  const meta = emptyStateMeta(reason);
  const nextAction = props.emptyState?.nextAction ?? props.fallbackAction;

  return (
    <section
      style={{
        ...panelCardStyle,
        border: `1px dashed ${meta.border}`,
        background: meta.background,
      }}
    >
      <div style={emptyStateIconStyle}>{meta.icon}</div>
      <div style={sectionEyebrowStyle}>{meta.kicker}</div>
      <div style={sectionTitleStyle}>{meta.title}</div>
      <div style={mutedBodyStyle}>
        {props.emptyState?.messageCode ??
          "No records returned for this workspace."}
      </div>
      {nextAction && (
        <div style={toolbarActionsStyle}>
          <ActionDescriptorButton
            descriptor={nextAction}
            tone="secondary"
            onClick={() => props.onAction?.(nextAction)}
          />
        </div>
      )}
    </section>
  );
}

function ActionDescriptorButton(props: {
  descriptor: ResourceActionDescriptor;
  onClick: () => void;
  tone?: "primary" | "secondary";
  size?: "md" | "sm";
}) {
  const buttonStyle =
    props.tone === "primary"
      ? props.size === "sm"
        ? primaryButtonSmallStyle
        : primaryButtonStyle
      : props.size === "sm"
        ? secondaryButtonSmallStyle
        : secondaryButtonStyle;

  return (
    <button
      type="button"
      style={{
        ...buttonStyle,
        ...(props.descriptor.enabled ? null : disabledButtonStyle),
      }}
      onClick={props.onClick}
      disabled={!props.descriptor.enabled}
      title={props.descriptor.disabledReasonCode}
    >
      {actionLabel(props.descriptor.action)}
    </button>
  );
}

function SupportCard(props: { title: string; body: string }) {
  return (
    <section style={panelCardStyle}>
      <div style={sectionEyebrowStyle}>Guidance</div>
      <div style={sectionTitleStyle}>{props.title}</div>
      <div style={mutedBodyStyle}>{props.body}</div>
    </section>
  );
}

function LinkCard(props: {
  title: string;
  links: PlatformNoticeWorkspaceRecord["crossAppLinks"];
}) {
  return (
    <section style={panelCardStyle}>
      <div style={sectionEyebrowStyle}>Deep links</div>
      <div style={sectionTitleStyle}>{props.title}</div>
      {props.links.length ? (
        <LinkStack links={props.links} />
      ) : (
        <div style={mutedBodyStyle}>No downstream links available.</div>
      )}
    </section>
  );
}

function LinkStack(props: {
  links: PlatformNoticeWorkspaceRecord["crossAppLinks"];
  compact?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: props.compact ? 6 : 10 }}>
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
  );
}

function Field(props: { label: string; control: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={fieldLabelStyle}>{props.label}</label>
      {props.control}
    </div>
  );
}

function SummaryCard(props: { title: string; value: string; note: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={sectionEyebrowStyle}>{props.title}</div>
      <div style={summaryValueStyle}>{props.value}</div>
      <div style={summaryNoteStyle}>{props.note}</div>
    </div>
  );
}

function MetricChip(props: {
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral" | "danger";
}) {
  return (
    <div style={metricChipStyle(props.tone)}>
      <span style={{ opacity: 0.78 }}>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function SnapshotPill(props: { label: string; value: string }) {
  return (
    <div style={snapshotPillStyle}>
      <span style={snapshotPillLabelStyle}>{props.label}</span>
      <span style={snapshotPillValueStyle}>{props.value}</span>
    </div>
  );
}

function getTabActions(
  workspace: PlatformNoticesWorkspaceResponse | null,
  activeTab: TabId,
) {
  if (!workspace) return [];
  if (activeTab === "notices") return workspace.notices.availableActions;
  if (activeTab === "maintenance")
    return workspace.maintenance.availableActions;
  return [];
}

function handleTabAction(
  descriptor: ResourceActionDescriptor,
  activeTab: TabId,
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
      enabled: descriptor.action !== "clear_maintenance_mode",
    });
  }
}

function canSubmitAction(
  pendingAction: ActionTarget,
  reasonDraft: string,
  noticeTitle: string,
  noticeBody: string,
) {
  if (pendingAction.descriptor.requiresReason && !reasonDraft.trim())
    return false;
  if (pendingAction.kind === "create") {
    return Boolean(noticeTitle.trim() && noticeBody.trim());
  }
  return true;
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
    return "Publishing a critical or maintenance notice requires a reason and returns an audit receipt for cross-app propagation.";
  }
  if (target.kind === "maintenance") {
    return target.enabled
      ? "Maintenance mode is a high-risk action. Save the current toggle and schedule with a required reason before the platform banner propagates."
      : "Clearing maintenance mode is a high-risk action. Provide the audit reason before the platform banner is removed across downstream apps.";
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
      if (!deduped.has(key)) deduped.set(key, link);
    });
  });
  return [...deduped.values()];
}

function emptyStateMeta(reason: EmptyStateEnvelope["reason"]) {
  switch (reason) {
    case "permission_denied":
      return {
        icon: "Lock",
        kicker: "Permission boundary",
        title: "You can see the workspace, but not this dataset",
        border: "rgba(37, 99, 235, 0.35)",
        background: "linear-gradient(135deg, #eff6ff, #ffffff)",
      };
    case "fetch_failed":
      return {
        icon: "Retry",
        kicker: "Fetch failed",
        title: "The data request did not complete",
        border: "rgba(220, 38, 38, 0.35)",
        background: "linear-gradient(135deg, #fef2f2, #ffffff)",
      };
    case "external_unavailable":
      return {
        icon: "Bridge",
        kicker: "External dependency",
        title: "A downstream system is unavailable",
        border: "rgba(217, 119, 6, 0.35)",
        background: "linear-gradient(135deg, #fff7ed, #ffffff)",
      };
    case "not_provisioned":
      return {
        icon: "Setup",
        kicker: "Not provisioned",
        title: "This workspace has not been provisioned yet",
        border: "rgba(5, 150, 105, 0.35)",
        background: "linear-gradient(135deg, #ecfdf5, #ffffff)",
      };
    case "filtered_empty":
      return {
        icon: "Filter",
        kicker: "Filtered result",
        title: "No records match the current slice",
        border: "rgba(71, 85, 105, 0.35)",
        background: "linear-gradient(135deg, #f8fafc, #ffffff)",
      };
    case "driver_not_eligible":
      return {
        icon: "Ineligible",
        kicker: "Contract mismatch",
        title: "Received a driver-only empty reason on an admin page",
        border: "rgba(124, 58, 237, 0.35)",
        background: "linear-gradient(135deg, #f5f3ff, #ffffff)",
      };
    case "no_data":
    default:
      return {
        icon: "Zero",
        kicker: "No data",
        title: "Nothing has been published here yet",
        border: "rgba(148, 163, 184, 0.35)",
        background: "linear-gradient(135deg, #f8fafc, #ffffff)",
      };
  }
}

function severityTone(severity: PlatformNoticeSeverity) {
  switch (severity) {
    case "critical":
    case "maintenance":
      return "danger";
    case "warning":
      return "warning";
    default:
      return "info";
  }
}

function statusTone(status: string) {
  switch (status) {
    case "active":
      return "success";
    case "scheduled":
      return "warning";
    case "resolved":
      return "neutral";
    default:
      return "neutral";
  }
}

function broadcastTone(status: string) {
  switch (status) {
    case "propagating":
      return "warning";
    case "queued":
      return "neutral";
    default:
      return "success";
  }
}

function statusBadgeStyle(
  tone: "success" | "warning" | "info" | "neutral" | "danger",
): React.CSSProperties {
  const tones = {
    success: {
      background: "rgba(22, 163, 74, 0.12)",
      color: "#166534",
    },
    warning: {
      background: "rgba(217, 119, 6, 0.14)",
      color: "#9a3412",
    },
    info: {
      background: "rgba(37, 99, 235, 0.12)",
      color: "#1d4ed8",
    },
    neutral: {
      background: "rgba(100, 116, 139, 0.12)",
      color: "#475569",
    },
    danger: {
      background: "rgba(220, 38, 38, 0.12)",
      color: "#991b1b",
    },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    ...tones,
  };
}

function snapshotCardStyle(
  freshness: PlatformNoticesWorkspaceResponse["refresh"]["dataFreshness"],
): React.CSSProperties {
  return {
    ...panelCardStyle,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    background:
      freshness === "fresh"
        ? "rgba(255,255,255,0.92)"
        : "linear-gradient(135deg, #fff7ed, rgba(255,255,255,0.96))",
    borderColor:
      freshness === "fresh" ? "rgba(30,41,59,0.08)" : "rgba(217,119,6,0.22)",
  };
}

const pageStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
  paddingBottom: 32,
};

const heroStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  padding: 24,
  borderRadius: 28,
  background:
    "linear-gradient(135deg, rgba(255,251,235,0.95), rgba(255,255,255,0.92) 48%, rgba(238,242,255,0.94))",
  border: "1px solid rgba(30,41,59,0.08)",
  boxShadow: "0 24px 50px rgba(15, 23, 42, 0.06)",
};

const heroHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "#92400e",
  fontWeight: 700,
};

const heroTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  lineHeight: 1.05,
  color: "#0f172a",
};

const heroSubtitleStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: 760,
  color: "#475569",
  lineHeight: 1.65,
  fontSize: 14,
};

const heroBadgeClusterStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "flex-start",
  justifyContent: "flex-end",
};

const heroGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const summaryCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(30,41,59,0.08)",
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0f172a",
};

const summaryNoteStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const panelCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 20,
  borderRadius: 22,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(30,41,59,0.08)",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.04)",
};

const receiptCardStyle: React.CSSProperties = {
  ...panelCardStyle,
  background: "linear-gradient(135deg, #eff6ff, #ffffff)",
  borderColor: "rgba(37,99,235,0.16)",
};

const receiptCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const receiptTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#1d4ed8",
};

const receiptMetaStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
};

const errorCardStyle: React.CSSProperties = {
  ...panelCardStyle,
  background: "linear-gradient(135deg, #fef2f2, #ffffff)",
  borderColor: "rgba(220,38,38,0.18)",
};

const maintenanceBannerStyle: React.CSSProperties = {
  ...panelCardStyle,
  gap: 6,
  background: "linear-gradient(135deg, #fff1f2, #ffffff)",
  borderColor: "rgba(220,38,38,0.22)",
};

const maintenanceBannerTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#991b1b",
};

const maintenanceBannerBodyStyle: React.CSSProperties = {
  color: "#7f1d1d",
  lineHeight: 1.55,
  fontSize: 13,
};

const toolbarCardStyle: React.CSSProperties = {
  ...panelCardStyle,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "center",
};

const tabRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const toolbarActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const contentGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(290px, 0.85fr)",
  gap: 16,
};

const noticeComposerGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const maintenanceFieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const tableCardStyle: React.CSSProperties = {
  ...panelCardStyle,
  padding: 0,
};

const tableCardHeaderStyle: React.CSSProperties = {
  padding: "20px 20px 0",
};

const sectionEyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#94a3b8",
  fontWeight: 700,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 20,
  lineHeight: 1.15,
  fontWeight: 800,
  color: "#0f172a",
};

const mutedBodyStyle: React.CSSProperties = {
  color: "#64748b",
  lineHeight: 1.6,
  fontSize: 13.5,
};

const maintenanceStatusCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.18)",
};

const maintenanceStatusHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const maintenanceStatusTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: "#0f172a",
  marginBottom: 4,
};

const previewBannerStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  border: "1px solid rgba(220,38,38,0.2)",
  background: "linear-gradient(135deg, #fff1f2, #ffffff)",
};

const previewBannerTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  color: "#991b1b",
  marginBottom: 8,
  fontSize: 14,
};

const previewBannerBodyStyle: React.CSSProperties = {
  color: "#7f1d1d",
  lineHeight: 1.55,
  fontSize: 13,
};

const snapshotLeftStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const snapshotRightStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const snapshotTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 18,
  color: "#0f172a",
};

const snapshotPillStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 120,
  padding: "10px 12px",
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.16)",
};

const snapshotPillLabelStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontSize: 10,
  color: "#94a3b8",
  fontWeight: 700,
};

const snapshotPillValueStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#0f172a",
};

const primaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #1d4ed8",
  background: "#1d4ed8",
  color: "#ffffff",
  borderRadius: 12,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(29, 78, 216, 0.18)",
};

const primaryButtonSmallStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  padding: "6px 10px",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid rgba(148,163,184,0.28)",
  background: "#ffffff",
  color: "#0f172a",
  borderRadius: 12,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonSmallStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  padding: "6px 10px",
  borderRadius: 10,
  fontSize: 12,
};

const disabledButtonStyle: React.CSSProperties = {
  cursor: "not-allowed",
  opacity: 0.46,
  boxShadow: "none",
};

const primaryLinkStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const fieldLabelStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const inputFieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
};

const textAreaStyle: React.CSSProperties = {
  ...inputFieldStyle,
  resize: "vertical",
  minHeight: 110,
  fontFamily: "inherit",
  lineHeight: 1.5,
};

const subtleMonoStyle: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 11.5,
  color: "#64748b",
};

const monoCellStyle: React.CSSProperties = {
  ...subtleMonoStyle,
  color: "#0f172a",
};

const tableBodyTextStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const badgeWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const linkRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
  textDecoration: "none",
  color: "#1d4ed8",
  padding: "10px 12px",
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.16)",
};

const modalScrimStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(15, 23, 42, 0.42)",
  zIndex: 30,
};

const modalCardStyle: React.CSSProperties = {
  ...panelCardStyle,
  width: "min(560px, 100%)",
  background: "#ffffff",
};

const modalTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  color: "#0f172a",
};

const modalBodyStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.55,
  fontSize: 14,
};

const modalPreviewStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 14,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.16)",
};

const modalPreviewTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
};

const modalActionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const emptyStateIconStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#334155",
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    appearance: "none",
    border: active ? "1px solid #1e3a8a" : "1px solid rgba(148,163,184,0.26)",
    background: active ? "#0f172a" : "#ffffff",
    color: active ? "#ffffff" : "#0f172a",
    borderRadius: 999,
    padding: "8px 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  };
}

function tabCountStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    height: 22,
    padding: "0 8px",
    borderRadius: 999,
    background: active ? "rgba(255,255,255,0.14)" : "#eef2ff",
    color: active ? "#ffffff" : "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
  };
}

function metricChipStyle(
  tone: "success" | "warning" | "neutral" | "danger",
): React.CSSProperties {
  const palette = {
    success: {
      background: "rgba(240,253,244,0.92)",
      color: "#166534",
      border: "rgba(22,163,74,0.18)",
    },
    warning: {
      background: "rgba(255,247,237,0.92)",
      color: "#9a3412",
      border: "rgba(217,119,6,0.18)",
    },
    neutral: {
      background: "rgba(248,250,252,0.94)",
      color: "#334155",
      border: "rgba(100,116,139,0.16)",
    },
    danger: {
      background: "rgba(255,241,242,0.94)",
      color: "#991b1b",
      border: "rgba(220,38,38,0.18)",
    },
  }[tone];

  return {
    display: "grid",
    gap: 4,
    minWidth: 110,
    padding: "10px 12px",
    borderRadius: 16,
    fontSize: 12,
    fontWeight: 700,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
  };
}
