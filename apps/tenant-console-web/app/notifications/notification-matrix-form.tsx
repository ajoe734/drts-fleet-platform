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
import { useTranslation } from "@/lib/i18n";
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
  const { t } = useTranslation();
  if (!state.provisioned) {
    return (
      <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
        <CanvasPill theme={th} tone="neutral">
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <CanvasIcon name="warn" size={11} />
            {t("notifications.channel.notProvisioned")}
          </span>
        </CanvasPill>
        {state.disabledReason ? (
          <div style={helperStyle}>{state.disabledReason}</div>
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
        aria-label={t("notifications.form.channelToggleAria", {
          eventType,
          channel: state.channel,
        })}
        disabled={readOnly}
      />
    </label>
  );
}

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <CanvasBtn
      theme={th}
      variant="primary"
      icon="check"
      size="sm"
      disabled={!enabled || pending}
    >
      {pending
        ? t("notifications.form.saving")
        : enabled
          ? t("notifications.form.save")
          : t("notifications.form.readOnly")}
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
  const { t } = useTranslation();
  const columns: CanvasTableColumn<NotificationMatrixRow>[] = [
    {
      h: t("notifications.form.column.eventType"),
      w: 220,
      r: (row) => (
        <div>
          <div style={codeStyle}>{row.eventType}</div>
          <div style={subcopyStyle}>{row.defaultAudience}</div>
        </div>
      ),
    },
    {
      h: t("notifications.form.column.when"),
      w: 330,
      r: (row) => <span style={subcopyStyle}>{row.description}</span>,
    },
    {
      h: t("notifications.channel.email"),
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
      h: t("notifications.channel.webhook"),
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
      h: t("notifications.channel.ops_console"),
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
            ? t("notifications.form.submitDisabled", {
                code: saveAction.disabledReasonCode,
              })
            : t("notifications.form.submitEnabled")}
        </div>
        <SubmitButton enabled={saveAction.enabled} />
      </div>
    </form>
  );
}
