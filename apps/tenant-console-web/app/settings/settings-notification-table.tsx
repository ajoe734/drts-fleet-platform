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
import { useTranslation } from "@/lib/i18n";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const accentCodeStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 600,
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

export function SettingsNotificationTable({
  rows,
}: {
  rows: SettingsNotificationRow[];
}) {
  const { t } = useTranslation();

  const columns: CanvasTableColumn<SettingsNotificationRow>[] = [
    {
      h: t("settings.notifTable.event"),
      k: "eventType",
      w: 310,
      mono: true,
      r: (row) => <span style={accentCodeStyle}>{row.eventType}</span>,
    },
    {
      h: t("settings.notifTable.channel"),
      w: 120,
      mono: true,
      r: (row) => (
        <CanvasPill theme={th} tone={getChannelTone(row.channel)}>
          {row.channel}
        </CanvasPill>
      ),
    },
    {
      h: t("settings.notifTable.status"),
      w: 100,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={row.enabled ? getChannelTone(row.channel) : "neutral"}
          dot
        >
          {row.enabled
            ? t("settings.notifTable.enabled")
            : t("settings.notifTable.disabled")}
        </CanvasPill>
      ),
    },
    {
      h: t("settings.notifTable.updated"),
      w: 150,
      mono: true,
      r: (row) => formatUpdated(row.updatedAt),
    },
  ];

  return (
    <CanvasTable<SettingsNotificationRow>
      theme={th}
      columns={columns}
      rows={rows}
    />
  );
}
