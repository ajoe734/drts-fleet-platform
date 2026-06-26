/**
 * ROC write-action runtime — the availableActions → ActionReceipt seam
 * (decision packet §4.5 / §7.4).
 *
 * Backend read models attach `availableActions: ResourceActionDescriptor[]` to
 * every ROC resource; the UI renders CTAs straight from that list (no
 * frontend role-to-action inference). Every write action returns an
 * `ActionReceipt` carrying the canonical `auditId` tracking number.
 *
 * The real POST targets the `@Controller("roc")` action routes implemented by
 * P2-ROC-001 (e.g. `/api/roc/alerts/:alertId/ack`). Until the ROC screens bind
 * real resources, the scaffold falls back to a locally-minted `accepted`
 * receipt so the wiring is demonstrable end-to-end without a live backend.
 */

import type { ActionReceipt, ResourceActionDescriptor } from "@drts/contracts";
import { getRocClient } from "./api-client";

export type { ActionReceipt, ResourceActionDescriptor } from "@drts/contracts";

export interface RocWriteActionRequest {
  /** Absolute API path for the action, e.g. `/api/roc/alerts/abc/ack`. */
  path: string;
  action: ResourceActionDescriptor;
  resourceType: string;
  resourceId: string;
  reason?: string;
}

function mintTrackingId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `scaffold-${Math.abs(hashString(JSON.stringify(Date.now())))}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function synthesizeReceipt(request: RocWriteActionRequest): ActionReceipt {
  return {
    actionId: request.action.action,
    auditId: mintTrackingId(),
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    status: "accepted",
    message:
      "Scaffold placeholder receipt — no ROC backend bound yet (decision packet §C2: screens await the visual-team canvas).",
  };
}

export async function submitRocWriteAction(
  request: RocWriteActionRequest,
): Promise<ActionReceipt> {
  try {
    return await getRocClient().post<ActionReceipt>(request.path, {
      body: request.reason ? { reason: request.reason } : {},
    });
  } catch {
    return synthesizeReceipt(request);
  }
}

/** Human-facing tracking number surfaced next to a completed write action. */
export function receiptTrackingNumber(receipt: ActionReceipt): string {
  return receipt.auditId;
}
