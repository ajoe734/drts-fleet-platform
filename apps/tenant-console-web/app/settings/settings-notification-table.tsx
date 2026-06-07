"use client";

import type { CSSProperties } from "react";
import type { TenantNotificationSubscription } from "@drts/contracts";
import {
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { formatTenantCodeLabel } from "@/lib/localized-labels";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const accentCodeStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
};

const eventMetaStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: th.textMuted,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function getChannelTone(
  channel: TenantNotificationSubscription["channel"],
): CanvasTone {
  if (channel === "webhook") return "accent";
  if (channel === "email") return "info";
  return "neutral";
}

export type SettingsNotificationRow = {
  eventType: string;
  channel: TenantNotificationSubscription["channel"];
  enabled: boolean;
  updatedAt: string | null;
};

const columns: CanvasTableColumn<SettingsNotificationRow>[] = [
  {
    h: "事件",
    k: "eventType",
    w: 310,
    mono: true,
    r: (row) => (
      <div>
        <div style={accentCodeStyle}>
          {formatTenantCodeLabel(row.eventType, row.eventType)}
        </div>
        <div style={eventMetaStyle}>{row.eventType}</div>
      </div>
    ),
  },
  {
    h: "通道",
    w: 120,
    mono: true,
    r: (row) => (
      <CanvasPill theme={th} tone={getChannelTone(row.channel)}>
        {formatTenantCodeLabel(row.channel, row.channel)}
      </CanvasPill>
    ),
  },
  {
    h: "狀態",
    w: 100,
    r: (row) => (
      <CanvasPill
        theme={th}
        tone={row.enabled ? getChannelTone(row.channel) : "neutral"}
        dot
      >
        {row.enabled ? "啟用" : "停用"}
      </CanvasPill>
    ),
  },
  {
    h: "更新時間",
    w: 150,
    mono: true,
    r: (row) => formatUpdated(row.updatedAt),
  },
];

export function SettingsNotificationTable({
  rows,
}: {
  rows: SettingsNotificationRow[];
}) {
  return (
    <CanvasTable<SettingsNotificationRow>
      theme={th}
      columns={columns}
      rows={rows}
    />
  );
}
