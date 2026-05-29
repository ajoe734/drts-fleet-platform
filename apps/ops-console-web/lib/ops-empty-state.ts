import type { EmptyReason, EmptyStateEnvelope } from "@drts/contracts";

import { t, type Locale } from "./translations";

export type FetchOutcome<T> = {
  ok: boolean;
  data: T;
  reason?: EmptyReason;
};

export async function fetchListWithOutcome<T>(
  loader: () => Promise<T[]>,
): Promise<FetchOutcome<T[]>> {
  try {
    const data = await loader();
    return { ok: true, data };
  } catch {
    return { ok: false, data: [], reason: "fetch_failed" };
  }
}

export function resolveEmptyReason(args: {
  ok: boolean;
  itemCount: number;
  filtersActive: boolean;
  provisioned?: boolean;
  authorized?: boolean;
  externalAvailable?: boolean;
}): EmptyReason | null {
  const {
    ok,
    itemCount,
    filtersActive,
    provisioned = true,
    authorized = true,
    externalAvailable = true,
  } = args;
  if (itemCount > 0) return null;
  if (!authorized) return "permission_denied";
  if (!provisioned) return "not_provisioned";
  if (!externalAvailable) return "external_unavailable";
  if (!ok) return "fetch_failed";
  if (filtersActive) return "filtered_empty";
  return "no_data";
}

export interface EmptyStateCopy {
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
}

const ICON_BY_REASON: Record<EmptyReason, string> = {
  no_data: "○",
  not_provisioned: "⚙",
  fetch_failed: "⚠",
  permission_denied: "🔒",
  external_unavailable: "⌁",
  driver_not_eligible: "✕",
  filtered_empty: "⚲",
};

export function emptyStateCopy(
  envelope: EmptyStateEnvelope,
  locale: Locale,
): EmptyStateCopy {
  const base = `revenue.emptyReason.${envelope.reason}`;
  const actionLabel = envelope.nextAction?.action
    ? t(`revenue.action.${envelope.nextAction.action}`, locale)
    : undefined;
  return {
    icon: ICON_BY_REASON[envelope.reason] ?? "○",
    title: t(`${base}.title`, locale),
    body: t(`${base}.body`, locale),
    ...(actionLabel ? { actionLabel } : {}),
  };
}

export function buildEmptyEnvelope(reason: EmptyReason): EmptyStateEnvelope {
  return {
    reason,
    messageCode: `revenue.empty.${reason}`,
  };
}
