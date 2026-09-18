// Host (individual vehicle owner)-scoped server api-client for the Fleet
// Partner Portal's `/host/*` routes.
//
// Host is a DIFFERENT actor from the fleet-admin identity that
// `lib/api-client.server.ts` builds (`getServerFleetPartnerClient`,
// `partner_api_key` actor, `billing:read` scope, fleet-wide access). Host is
// `core.partners.partner_type = 'individual_owner'` — realm `partner`,
// authorized through `owned:read` / `reports:read` / `maintenance:read`
// scopes, resource-constrained to `vehicle.owner_partner_id ===
// identity.partnerId` (docs/04-uat/system-remediation-20260906/
// feature-contracts.md §4). Reusing the fleet-admin client would mint the
// wrong actor headers for this scope, so `/host/*` routes resolve their own
// client here instead — kept inside the task's `app/host/` write scope
// rather than the shared `lib/` directory.
//
// Auth model mirrors `getServerFleetPartnerClient`: the portal runs behind
// the same control-plane perimeter (Google IAP in front of Cloud Run). We
// forward the IAP-authenticated user email for audit and, on Cloud Run, mint
// a metadata identity token for the protected backend.

import "server-only";

import { ApiClient } from "@drts/api-client";
import { CONTROL_PLANE_IAP_EMAIL_HEADER } from "@drts/control-plane-auth";
import { headers as nextHeaders } from "next/headers";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const HOST_PARTNER_ID_HEADER = "x-host-partner-id";
// Per feature-contracts.md §4: Host authorization reuses the existing
// owned-mobility / reporting / maintenance read scopes, never a fleet-admin
// write scope.
const HOST_SCOPES = ["owned:read", "reports:read", "maintenance:read"];

function resolveServerApiBaseUrl(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

// The individual-owner partner id is, in production, injected by the
// perimeter (gateway maps the authenticated Host principal to its partner
// id). Resolved from the inbound request header first, then an explicit env
// override for single-tenant/local deployments — same precedence as
// `resolveFleetPartnerId` in `lib/api-client.server.ts`, but under a
// distinct header name so a Host session is never confused with the
// fleet-admin `x-fleet-partner-id` scope.
function resolveHostPartnerId(requestHeaders: Headers): string {
  const fromHeader = requestHeaders.get(HOST_PARTNER_ID_HEADER)?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const fromEnv = process.env.DRTS_HOST_PARTNER_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error(
    "Missing host scope configuration: DRTS_HOST_PARTNER_ID environment variable or x-host-partner-id header is required.",
  );
}

async function mintMetadataIdentityToken(
  audience: string,
): Promise<string | null> {
  const metadataUrl = new URL(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
  );
  metadataUrl.searchParams.set("audience", audience);
  metadataUrl.searchParams.set("format", "full");

  try {
    const response = await fetch(metadataUrl, {
      cache: "no-store",
      headers: {
        "Metadata-Flavor": "Google",
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.text();
  } catch {
    return null;
  }
}

export interface ServerHostClient {
  client: ApiClient;
  partnerId: string;
}

export async function getServerHostClient(): Promise<ServerHostClient> {
  const apiUrl = resolveServerApiBaseUrl();
  const requestHeaders = await nextHeaders();
  const partnerId = resolveHostPartnerId(requestHeaders);

  // Partner-realm bootstrap identity for an individual owner. `x-actor-type:
  // partner_user` is the closest AUTH_ACTOR_TYPES entry for a human partner
  // login (as opposed to `partner_api_key`, the fleet-admin service-key
  // actor `getServerFleetPartnerClient` uses).
  const defaultHeaders: Record<string, string> = {
    "x-actor-type": "partner_user",
    "x-actor-id": partnerId,
    "x-partner-id": partnerId,
    "x-realm": "partner",
    "x-roles": "partner",
    "x-role-families": "partner",
    "x-scopes": HOST_SCOPES.join(","),
  };

  const iapEmail = requestHeaders.get(CONTROL_PLANE_IAP_EMAIL_HEADER);
  if (iapEmail) {
    defaultHeaders[CONTROL_PLANE_IAP_EMAIL_HEADER] = iapEmail;
  }

  const requestId = requestHeaders.get("x-request-id");
  if (requestId) {
    defaultHeaders["x-request-id"] = requestId;
  }

  const protectedAudience = process.env.DRTS_API_AUTH_AUDIENCE?.trim();
  if (protectedAudience) {
    const metadataToken = await mintMetadataIdentityToken(protectedAudience);
    if (metadataToken) {
      defaultHeaders.authorization = `Bearer ${metadataToken}`;
    }
  }

  if (!defaultHeaders.authorization && apiUrl.includes(".a.run.app")) {
    const metadataToken = await mintMetadataIdentityToken(apiUrl);
    if (metadataToken) {
      defaultHeaders["x-serverless-authorization"] = `Bearer ${metadataToken}`;
    }
  }

  const client = new ApiClient({
    baseUrl: apiUrl,
    defaultHeaders,
  });

  return { client, partnerId };
}
