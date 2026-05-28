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
  targetApp: string;
};

export function NotificationPreferencesEditor({
  initialRows,
  availability,
  action,
  refreshMetadata,
  initialReceipt,
  deepLinks,
  activeEmptyReason,
}: {
  initialRows: NotificationMatrixRow[];
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

      <CanvasCard theme={th} padding={0}>
        <div style={gridStyle}>
          <div style={headerCellStyle}>Event / default audience</div>
          <div style={{ ...headerCellStyle, textAlign: "center" }}>Email</div>
          <div style={{ ...headerCellStyle, textAlign: "center" }}>Webhook</div>
          <div style={{ ...headerCellStyle, textAlign: "center" }}>
            Ops console
          </div>
          {rows.map((row) => (
            <Row
              key={row.eventType}
              row={row}
              action={action}
              availability={availability}
              onToggle={toggle}
            />
          ))}
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
          {(
            [
              "no_data",
              "not_provisioned",
              "fetch_failed",
              "permission_denied",
              "external_unavailable",
              "filtered_empty",
            ] satisfies EmptyReason[]
          ).map((reason) => (
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
