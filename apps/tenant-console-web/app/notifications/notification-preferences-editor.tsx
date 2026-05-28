"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type {
  ActionReceipt,
  EmptyReason,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  EMPTY_REASON_META,
  NOTIFICATION_EMPTY_REASONS,
  type ChannelAvailability,
  type NotificationChannel,
  type NotificationMatrixRow,
  flattenRows,
  getNotificationFieldName,
} from "./notification-preferences-model";
import {
  saveNotificationPreferences,
  type SaveNotificationState,
} from "./actions";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) repeat(3, minmax(110px, 0.48fr))",
  gap: 0,
};

const headerCellStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: `1px solid ${th.border}`,
  color: th.textMuted,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.45,
  textTransform: "uppercase",
};

const eventCellStyle: CSSProperties = {
  padding: "14px",
  borderBottom: `1px solid ${th.border}`,
  display: "grid",
  gap: 4,
};

const toggleCellStyle: CSSProperties = {
  padding: "14px",
  borderBottom: `1px solid ${th.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const toggleButtonStyle: CSSProperties = {
  position: "relative",
  width: 56,
  height: 28,
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  padding: 3,
  cursor: "pointer",
};

const emptyCoverageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const initialActionState: SaveNotificationState = {
  ok: false,
  message: null,
  receipt: null,
};

type DeepLink = {
  href: string;
  label: string;
  description: string;
  openMode: "same_tab" | "new_tab";
  targetApp: "ops-console" | "platform-admin" | "tenant-console";
};

export function NotificationPreferencesEditor({
  initialRows,
  visibleEventTypes,
  availability,
  action,
  refreshMetadata,
  initialReceipt,
  deepLinks,
  activeEmptyReason,
}: {
  initialRows: NotificationMatrixRow[];
  visibleEventTypes?: string[];
  availability: ChannelAvailability;
  action: ResourceActionDescriptor;
  refreshMetadata: UiRefreshMetadata;
  initialReceipt?: ActionReceipt | null;
  deepLinks: DeepLink[];
  activeEmptyReason?: EmptyReason | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [state, formAction, isPending] = useActionState(
    saveNotificationPreferences,
    {
      ...initialActionState,
      receipt: initialReceipt ?? null,
    },
  );

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  function toggle(
    eventType: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    if (!action.enabled || !availability[channel].ready) {
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.eventType === eventType
          ? {
              ...row,
              channels: {
                ...row.channels,
                [channel]: enabled,
              },
            }
          : row,
      ),
    );
  }

  const currentSubscriptions = flattenRows(rows);
  const visibleRowSet = new Set(
    visibleEventTypes ?? rows.map((row) => row.eventType),
  );
  const renderedRows = rows.filter((row) => visibleRowSet.has(row.eventType));
  const stateTreatment = getEmptyStateTreatment(activeEmptyReason, deepLinks);

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      {state.message ? (
        <CanvasBanner
          theme={th}
          tone={state.ok ? "success" : "danger"}
          icon={state.ok ? "check" : "warn"}
          title={state.ok ? "Update receipt" : "更新失敗"}
          body={state.message}
          actions={
            state.receipt ? (
              <Link
                href={`/audit?auditId=${state.receipt.auditId}`}
                style={{ color: th.text, fontSize: 12, fontWeight: 600 }}
              >
                開啟 audit
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {!action.enabled ? (
        <CanvasBanner
          theme={th}
          tone="warn"
          icon="warn"
          title="Update action disabled by availableActions"
          body={`目前只允許檢視矩陣；descriptor 回傳 disabledReasonCode=${action.disabledReasonCode ?? "permission_denied"}。`}
        />
      ) : null}

      <CanvasCard theme={th} padding={0}>
        <div style={gridStyle}>
          <div style={headerCellStyle}>Event / default audience</div>
          <div style={{ ...headerCellStyle, textAlign: "center" }}>Email</div>
          <div style={{ ...headerCellStyle, textAlign: "center" }}>Webhook</div>
          <div style={{ ...headerCellStyle, textAlign: "center" }}>
            Ops console
          </div>
          {renderedRows.length > 0 ? (
            renderedRows.map((row) => (
              <Row
                key={row.eventType}
                row={row}
                action={action}
                availability={availability}
                onToggle={toggle}
              />
            ))
          ) : (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: 24,
                display: "grid",
                gap: 8,
                color: th.textMuted,
              }}
            >
              <strong style={{ color: th.text, fontSize: 13 }}>
                沒有符合目前條件的事件列
              </strong>
              <span style={{ fontSize: 12.5 }}>
                這個 treatment 對應 `filtered_empty`，矩陣不假造空白資料。
              </span>
            </div>
          )}
        </div>
      </CanvasCard>

      {currentSubscriptions.map((subscription) => (
        <input
          key={`${subscription.eventType}:${subscription.channel}`}
          type="hidden"
          name={getNotificationFieldName(
            subscription.eventType,
            subscription.channel,
          )}
          value={subscription.enabled ? "1" : "0"}
        />
      ))}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <CanvasPill theme={th} tone="accent">
            refresh T5 · 30s
          </CanvasPill>
          <CanvasPill
            theme={th}
            tone={
              refreshMetadata.dataFreshness === "fresh" ? "success" : "warn"
            }
          >
            {refreshMetadata.dataFreshness}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {new Date(refreshMetadata.generatedAt).toLocaleString("sv-SE")}
          </CanvasPill>
        </div>
        <button
          type="submit"
          disabled={!action.enabled || isPending}
          style={{
            borderRadius: 7,
            border: `1px solid ${th.accent}`,
            background: th.accent,
            color: "#fff",
            padding: "8px 14px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: !action.enabled || isPending ? "not-allowed" : "pointer",
            opacity: !action.enabled || isPending ? 0.55 : 1,
          }}
        >
          {isPending ? "儲存中…" : "儲存設定"}
        </button>
      </div>

      <CanvasCard
        theme={th}
        title="State treatment"
        subtitle="Active reason changes the explanatory copy and next-step posture instead of only flipping a badge."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <CanvasPill theme={th} tone={stateTreatment.tone}>
              {stateTreatment.reason}
            </CanvasPill>
            <strong style={{ fontSize: 13 }}>{stateTreatment.title}</strong>
            <span style={{ color: th.textMuted, fontSize: 12.5 }}>
              {stateTreatment.body}
            </span>
          </div>
          <Link
            href={stateTreatment.href}
            target={stateTreatment.newTab ? "_blank" : undefined}
            rel={stateTreatment.newTab ? "noreferrer noopener" : undefined}
            style={{ color: th.accent, fontSize: 12, fontWeight: 700 }}
          >
            {stateTreatment.label}
          </Link>
        </div>
      </CanvasCard>

      <CanvasCard
        theme={th}
        title="Channel posture / deep links"
        subtitle="Provisioning 與跨 app 調查路徑都要明確，不在 tenant page 假裝擁有外部真相。"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {Object.entries(availability).map(([channel, item]) => (
            <div
              key={channel}
              style={{
                border: `1px solid ${th.border}`,
                borderRadius: 8,
                padding: 12,
                background: th.surfaceLo,
                display: "grid",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: 12.5 }}>{channel}</strong>
                <CanvasPill theme={th} tone={item.ready ? "success" : "warn"}>
                  {item.label}
                </CanvasPill>
              </div>
              <span style={{ color: th.textMuted, fontSize: 12 }}>
                {item.detail}
              </span>
            </div>
          ))}
          {deepLinks.map((link) => (
            <div
              key={link.href}
              style={{
                border: `1px solid ${th.border}`,
                borderRadius: 8,
                padding: 12,
                background: th.surfaceLo,
                display: "grid",
                gap: 8,
              }}
            >
              <CanvasPill
                theme={th}
                tone={link.openMode === "new_tab" ? "info" : "neutral"}
              >
                {link.targetApp}
              </CanvasPill>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                {link.label}
              </div>
              <div style={{ color: th.textMuted, fontSize: 12 }}>
                {link.description}
              </div>
              <Link
                href={link.href}
                target={link.openMode === "new_tab" ? "_blank" : undefined}
                rel={
                  link.openMode === "new_tab"
                    ? "noreferrer noopener"
                    : undefined
                }
                style={{ color: th.accent, fontSize: 12, fontWeight: 700 }}
              >
                Open link
              </Link>
            </div>
          ))}
        </div>
      </CanvasCard>

      <CanvasCard
        theme={th}
        title="EmptyReason coverage"
        subtitle="Q-X15 six-state coverage is implemented explicitly so each reason has its own visual copy and CTA posture."
      >
        <div style={emptyCoverageGridStyle}>
          {NOTIFICATION_EMPTY_REASONS.map((reason) => (
            <div
              key={reason}
              style={{
                border: `1px solid ${
                  activeEmptyReason === reason ? th.accent : th.border
                }`,
                background:
                  activeEmptyReason === reason ? th.accentBg : th.surfaceLo,
                borderRadius: 8,
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <CanvasPill
                theme={th}
                tone={EMPTY_REASON_META[reason]?.tone ?? "neutral"}
              >
                {reason}
              </CanvasPill>
              <strong style={{ fontSize: 12.5 }}>
                {EMPTY_REASON_META[reason]?.title ?? reason}
              </strong>
              <span style={{ fontSize: 12, color: th.textMuted }}>
                {EMPTY_REASON_META[reason]?.body ?? ""}
              </span>
              <Link
                href={`/notifications?empty=${reason}`}
                style={{ color: th.accent, fontSize: 12, fontWeight: 700 }}
              >
                Preview state
              </Link>
            </div>
          ))}
        </div>
      </CanvasCard>
    </form>
  );
}

function Row({
  row,
  availability,
  action,
  onToggle,
}: {
  row: NotificationMatrixRow;
  availability: ChannelAvailability;
  action: ResourceActionDescriptor;
  onToggle: (
    eventType: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) => void;
}) {
  return (
    <>
      <div style={eventCellStyle}>
        <div
          style={{
            color: th.accent,
            fontFamily: th.monoFamily,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {row.eventType}
        </div>
        <div style={{ color: th.textMuted, fontSize: 12 }}>
          {row.description}
        </div>
        <div style={{ color: th.textDim, fontSize: 11.5 }}>
          default: {row.defaultAudience}
        </div>
      </div>
      {(
        ["email", "webhook", "ops_console"] satisfies NotificationChannel[]
      ).map((channel) => {
        const cellReady = availability[channel].ready;
        if (!cellReady) {
          return (
            <div key={`${row.eventType}:${channel}`} style={toggleCellStyle}>
              <CanvasPill theme={th} tone="warn">
                not_provisioned
              </CanvasPill>
            </div>
          );
        }

        const checked = row.channels[channel];
        return (
          <div key={`${row.eventType}:${channel}`} style={toggleCellStyle}>
            <button
              type="button"
              disabled={!action.enabled}
              onClick={() => onToggle(row.eventType, channel, !checked)}
              style={{
                ...toggleButtonStyle,
                opacity: action.enabled ? 1 : 0.6,
                background: checked ? th.accentBg : th.surfaceLo,
                cursor: action.enabled ? "pointer" : "not-allowed",
              }}
              aria-pressed={checked}
              aria-label={`${row.eventType} ${channel}`}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: checked ? 29 : 3,
                  width: 22,
                  height: 20,
                  borderRadius: 999,
                  background: checked ? th.accent : th.textDim,
                  transition: "left 140ms ease",
                }}
              />
            </button>
          </div>
        );
      })}
    </>
  );
}

function getEmptyStateTreatment(
  activeEmptyReason: EmptyReason | null | undefined,
  deepLinks: DeepLink[],
) {
  const webhookSetupLink = deepLinks.find(
    (link) => link.href === "/webhooks",
  ) ?? {
    href: "/webhooks",
    label: "Open webhook setup",
    openMode: "same_tab" as const,
  };
  const opsInvestigationLink = deepLinks.find(
    (link) => link.targetApp === "ops-console",
  ) ?? {
    href: "/audit?resourceType=tenant_notifications",
    label: "Open ops investigation",
    openMode: "new_tab" as const,
  };
  const auditTraceLink = deepLinks.find(
    (link) => link.targetApp === "platform-admin",
  ) ?? {
    href: "/audit?resourceType=tenant_notifications",
    label: "Open audit trace",
    openMode: "new_tab" as const,
  };

  switch (activeEmptyReason) {
    case "not_provisioned":
      return {
        reason: activeEmptyReason,
        title: "Webhook channel still needs provisioning",
        body: "矩陣會保留 email / ops_console，但 webhook 欄位以 not_provisioned 呈現，避免 tenant 誤以為可直接啟用。",
        label: webhookSetupLink.label,
        href: webhookSetupLink.href,
        newTab: webhookSetupLink.openMode === "new_tab",
        tone: "warn" as const,
      };
    case "fetch_failed":
      return {
        reason: activeEmptyReason,
        title: "Snapshot degraded",
        body: "偏好設定或治理快照讀取失敗時，只顯示診斷與 refresh metadata，不假造 last known good 以外的權限真相。",
        label: auditTraceLink.label,
        href: auditTraceLink.href,
        newTab: auditTraceLink.openMode === "new_tab",
        tone: "danger" as const,
      };
    case "permission_denied":
      return {
        reason: activeEmptyReason,
        title: "Read-only authority",
        body: "使用者仍可檢視每個 event 的預設受眾與 channel 佈建狀態，但無法提交 write action。",
        label: "Review current settings",
        href: "/settings",
        newTab: false,
        tone: "warn" as const,
      };
    case "external_unavailable":
      return {
        reason: activeEmptyReason,
        title: "External investigation required",
        body: "當外部交付鏈路不穩定時，tenant UI 只提供 cross-app trace，不在本頁假裝擁有 downstream health truth。",
        label: opsInvestigationLink.label,
        href: opsInvestigationLink.href,
        newTab: opsInvestigationLink.openMode === "new_tab",
        tone: "warn" as const,
      };
    case "filtered_empty":
      return {
        reason: activeEmptyReason,
        title: "No rows matched the current filter",
        body: "這不是 no_data；只是目前條件下沒有符合事件。重置 query 後應回到完整矩陣。",
        label: "Reset filter preview",
        href: "/notifications",
        newTab: false,
        tone: "info" as const,
      };
    case "no_data":
      return {
        reason: activeEmptyReason,
        title: "Baseline defaults only",
        body: "當 tenant 還沒有任何 override，本頁直接顯示 integration governance baseline，避免空頁誤導成未設定。",
        label: webhookSetupLink.label,
        href: webhookSetupLink.href,
        newTab: webhookSetupLink.openMode === "new_tab",
        tone: "neutral" as const,
      };
    default:
      return {
        reason: "active_matrix",
        title: "Matrix is editable from the current snapshot",
        body: "這個狀態代表頁面正在呈現可操作或可閱讀的主矩陣，並搭配 refresh tier、audit receipt 與 cross-app links。",
        label: auditTraceLink.label,
        href: auditTraceLink.href,
        newTab: auditTraceLink.openMode === "new_tab",
        tone: "success" as const,
      };
  }
}
