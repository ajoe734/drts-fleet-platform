import { createHash } from "node:crypto";
import type { TenantWebhookEndpoint } from "@drts/contracts";

/**
 * A binding is only enable-able when its endpoint hasn't drifted since the
 * last successful test: URL, event allowlist, owner and secret version are
 * all folded in, so any of the rotations design §3.1 calls out
 * (URL/events/owner/secret) invalidates a stale validation.
 */
export function computeEndpointFingerprint(
  endpoint: Pick<
    TenantWebhookEndpoint,
    "url" | "events" | "secretVersion" | "ownerRef" | "status"
  >,
): string {
  const material = JSON.stringify({
    url: endpoint.url,
    events: [...endpoint.events].sort(),
    secretVersion: endpoint.secretVersion,
    ownerRef: endpoint.ownerRef ?? null,
  });
  return createHash("sha256").update(material).digest("hex");
}
