import type { EmptyReason, EmptyStateEnvelope } from "@drts/contracts";

import { t, type Locale } from "./translations";

export type FetchOutcome<T> = {
  ok: boolean;
  data: T;
};

export async function fetchListWithOutcome<T>(
  loader: () => Promise<T[]>,
): Promise<FetchOutcome<T[]>> {
  try {
    const data = await loader();
    return { ok: true, data };
  } catch {
    return { ok: false, data: [] };
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

export function buildEmptyEnvelope(
  reason: EmptyReason,
  surface: string,
): EmptyStateEnvelope {
  return {
    reason,
    messageCode: `${surface}.empty.${reason}`,
  };
}

export interface EmptyStateCopy {
  icon: string;
  title: string;
  body: string;
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
  surface: string,
): EmptyStateCopy {
  const base = `${surface}.emptyReason.${envelope.reason}`;
  return {
    icon: ICON_BY_REASON[envelope.reason] ?? "○",
    title: t(`${base}.title`, locale),
    body: t(`${base}.body`, locale),
  };
}
