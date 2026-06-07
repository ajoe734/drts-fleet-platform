"use client";

import type { CSSProperties } from "react";
import { useFormStatus } from "react-dom";
import {
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  buildCanvasTheme,
} from "@drts/ui-web";
import type { ResourceActionDescriptor } from "@drts/contracts";
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import type { NotificationChannel } from "./constants";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

type ChannelState = {
  channel: NotificationChannel;
  enabled: boolean;
  provisioned: boolean;
  disabledReason?: string;
};

export type NotificationMatrixRow = {
  eventType: string;
  description: string;
  defaultAudience: string;
  channels: Record<NotificationChannel, ChannelState>;
};

const codeStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  fontWeight: 600,
  color: th.text,
};

const subcopyStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11.5,
  lineHeight: 1.45,
  color: th.textMuted,
};

const toggleWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
};

const checkboxStyle: CSSProperties = {
  width: 16,
  height: 16,
  accentColor: th.accent,
  cursor: "pointer",
};

const helperStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
  textAlign: "center",
};

function ChannelToggle({
  eventType,
  state,
  readOnly,
}: {
  eventType: string;
  state: ChannelState;
  readOnly: boolean;
}) {
  if (!state.provisioned) {
    return (
      <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
        <CanvasPill theme={th} tone="neutral">
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <CanvasIcon name="warn" size={11} />
            尚未開通
          </span>
        </CanvasPill>
        {state.disabledReason ? (
          <div style={helperStyle}>
            {formatTenantCodeLabel(state.disabledReason, state.disabledReason)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <label style={toggleWrapStyle}>
      <input
        type="checkbox"
        name={`pref__${eventType}__${state.channel}`}
        defaultChecked={state.enabled}
        style={checkboxStyle}
        aria-label={`${formatTenantCodeLabel(eventType, "通知事件")} ${formatTenantCodeLabel(state.channel, "通知通道")}`}
        disabled={readOnly}
      />
    </label>
  );
}

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <CanvasBtn
      theme={th}
      variant="primary"
      icon="check"
      size="sm"
      disabled={!enabled || pending}
    >
      {pending ? "儲存中…" : enabled ? "儲存設定" : "唯讀"}
    </CanvasBtn>
  );
}

export function NotificationMatrixForm({
  rows,
  saveAction,
  action,
  readOnly,
}: {
  rows: NotificationMatrixRow[];
  saveAction: ResourceActionDescriptor;
  action: (formData: FormData) => Promise<void>;
  readOnly: boolean;
}) {
  const columns: CanvasTableColumn<NotificationMatrixRow>[] = [
    {
      h: "事件類型",
      w: 220,
      r: (row) => (
        <div>
          <div style={codeStyle}>
            {formatTenantCodeLabel(row.eventType, row.eventType)}
          </div>
          <div style={subcopyStyle}>{row.eventType}</div>
          <div style={subcopyStyle}>{row.defaultAudience}</div>
        </div>
      ),
    },
    {
      h: "觸發時機",
      w: 330,
      r: (row) => <span style={subcopyStyle}>{row.description}</span>,
    },
    {
      h: "電子郵件",
      w: 120,
      r: (row) => (
        <ChannelToggle
          eventType={row.eventType}
          state={row.channels.email}
          readOnly={readOnly}
        />
      ),
    },
    {
      h: "回呼",
      w: 140,
      r: (row) => (
        <ChannelToggle
          eventType={row.eventType}
          state={row.channels.webhook}
          readOnly={readOnly}
        />
      ),
    },
    {
      h: "營運控制台",
      w: 140,
      r: (row) => (
        <ChannelToggle
          eventType={row.eventType}
          state={row.channels.ops_console}
          readOnly={readOnly}
        />
      ),
    },
  ];

  return (
    <form action={action}>
      {rows.map((row) => (
        <input
          key={row.eventType}
          type="hidden"
          name="notification_event_type"
          value={row.eventType}
        />
      ))}
      <CanvasCard theme={th} padding={0}>
        <CanvasTable theme={th} columns={columns} rows={rows} />
      </CanvasCard>
      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 11.5, color: th.textMuted }}>
          {saveAction.disabledReasonCode
            ? `目前無法儲存：${formatTenantCodeLabel(
                saveAction.disabledReasonCode,
                saveAction.disabledReasonCode,
              )}`
            : "送出按鈕會依後端回傳的可用操作自動啟用。"}
        </div>
        <SubmitButton enabled={saveAction.enabled} />
      </div>
    </form>
  );
}
