import type { ReactNode } from "react";
import type { CanvasPillTone } from "@drts/ui-web";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasEmptyState as EmptyState,
  CanvasPill as Pill,
} from "@drts/ui-web";
import { rocTheme } from "@/lib/roc-theme";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import { formatShortTime } from "@/lib/roc-page-data";

export function RocResponseEmptyState({
  locale,
  title,
}: {
  locale: Locale;
  title: string;
}) {
  return (
    <Card theme={rocTheme}>
      <EmptyState
        theme={rocTheme}
        tone="neutral"
        title={title}
        body={t("response.emptyBody", locale)}
      />
    </Card>
  );
}

export function RocGuardrail({ title, body }: { title: string; body: string }) {
  return (
    <Banner
      theme={rocTheme}
      tone="info"
      icon="lock"
      title={title}
      body={body}
    />
  );
}

export function RocField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          color: rocTheme.textMuted,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: rocTheme.text,
          fontFamily: mono ? rocTheme.monoFamily : rocTheme.fontFamily,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function RocStatusPill({
  tone,
  children,
}: {
  tone: CanvasPillTone;
  children: ReactNode;
}) {
  return (
    <Pill theme={rocTheme} tone={tone} dot>
      {children}
    </Pill>
  );
}

export function rocAlertSeverityTone(
  severity: "info" | "warning" | "critical",
): CanvasPillTone {
  if (severity === "critical") {
    return "danger";
  }
  if (severity === "warning") {
    return "warn";
  }
  return "info";
}

export function rocAlertStatusTone(
  status: "open" | "acknowledged" | "resolved",
): CanvasPillTone {
  if (status === "resolved") {
    return "success";
  }
  if (status === "acknowledged") {
    return "accent";
  }
  return "warn";
}

export function rocIncidentStatusTone(
  status: "needs_triage" | "open" | "contained",
): CanvasPillTone {
  if (status === "contained") {
    return "success";
  }
  if (status === "open") {
    return "danger";
  }
  return "warn";
}

export function rocReportStatusTone(
  status: "ready" | "pending_review",
): CanvasPillTone {
  return status === "ready" ? "success" : "warn";
}

export function rocFreezeStatusTone(
  status: "active" | "clear",
): CanvasPillTone {
  return status === "active" ? "warn" : "neutral";
}

export function formatUtcTime(
  value: string | null | undefined,
  locale: Locale,
) {
  return formatShortTime(value, locale);
}
