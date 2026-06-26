/**
 * ROC write-action runtime — the availableActions → ActionReceipt seam
 * (decision packet §4.5 / §7.4).
 *
 * Backend read models attach `availableActions: ResourceActionDescriptor[]` to
 * every ROC resource; the UI renders CTAs straight from that list (no
 * frontend role-to-action inference). Every write action POSTs to the
 * `@Controller("roc")` action routes implemented by P2-ROC-001 (e.g.
 * `/api/roc/alerts/:alertId/ack`) and returns the canonical `ActionReceipt`
 * carrying the `auditId` tracking number.
 *
 * The receipt is whatever the backend returns — there is no client-side
 * synthesis. A failed call rejects so the caller can surface the error;
 * the scaffold never fabricates an `accepted` receipt for a request that did
 * not succeed.
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

export async function submitRocWriteAction(
  request: RocWriteActionRequest,
): Promise<ActionReceipt> {
  return getRocClient().post<ActionReceipt>(request.path, {
    body: request.reason ? { reason: request.reason } : {},
  });
}

/** Human-facing tracking number surfaced next to a completed write action. */
export function receiptTrackingNumber(receipt: ActionReceipt): string {
  return receipt.auditId;
}
