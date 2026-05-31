import type { ReactNode } from "react";
import type { EmptyReason } from "@drts/contracts";

/**
 * The six tenant-relevant empty/not-ready reasons (Q-X15). `driver_not_eligible`
 * is the only `EmptyReason` member that is driver-app specific, so it is excluded
 * here — tenant-console renders these six distinctly per packet §3.6.
 */
export type TenantEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type EmptyTone = "neutral" | "info" | "warning" | "danger";

interface EmptyReasonPresentation {
  badge: string;
  tone: EmptyTone;
  title: string;
  description: string;
}

/**
 * Distinct presentation per `EmptyReason`. The point of Q-X15 is that the UI
 * must never collapse "no rows yet" and "this surface failed to load" into the
 * same visual — each reason gets its own badge, tone, and copy.
 */
export const TENANT_EMPTY_REASONS: Record<
  TenantEmptyReason,
  EmptyReasonPresentation
> = {
  no_data: {
    badge: "No data",
    tone: "neutral",
    title: "Nothing saved yet",
    description:
      "This directory has no rows for the tenant yet. You can still enter the value manually for this booking.",
  },
  not_provisioned: {
    badge: "Not provisioned",
    tone: "warning",
    title: "Tenant not configured for this resource",
    description:
      "The backend reports this capability is not provisioned for the tenant. Ask a tenant admin to finish onboarding before booking here.",
  },
  fetch_failed: {
    badge: "Fetch failed",
    tone: "danger",
    title: "Could not load this surface",
    description:
      "The request failed. This is a transient load error rather than an empty result — retry, and if it persists report the booking-create bootstrap failure.",
  },
  permission_denied: {
    badge: "Permission denied",
    tone: "danger",
    title: "You cannot create bookings here",
    description:
      "Your tenant role does not include the create-booking command. CTAs are driven by availableActions, so the form stays hidden rather than failing on submit.",
  },
  external_unavailable: {
    badge: "External unavailable",
    tone: "warning",
    title: "A dependency is temporarily unavailable",
    description:
      "Quota and approval evaluation depend on an external service that is not responding right now. Booking submit is paused until the preview can be recomputed.",
  },
  filtered_empty: {
    badge: "Filtered empty",
    tone: "info",
    title: "No matches for the current filter",
    description:
      "No rows match the current search. Clear or broaden the filter to see the full directory.",
  },
};

export function TenantEmptyState({
  reason,
  title,
  description,
  compact = false,
  children,
}: {
  reason: TenantEmptyReason;
  title?: string;
  description?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const preset = TENANT_EMPTY_REASONS[reason];

  return (
    <div
      className={`empty-panel empty-panel-${preset.tone}${compact ? " is-compact" : ""}`}
      data-empty-reason={reason}
      role="status"
    >
      <span className={`empty-reason-chip is-${preset.tone}`}>
        {preset.badge}
      </span>
      <strong>{title ?? preset.title}</strong>
      <p>{description ?? preset.description}</p>
      {children}
    </div>
  );
}
