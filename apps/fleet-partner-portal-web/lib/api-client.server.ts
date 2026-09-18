// Fleet-partner-scoped server api-client for the Fleet Partner Portal.
//
// This is the data-source seam for the portal: every server component that
// needs live data resolves a client through `getServerFleetPartnerClient()`
// and calls the `listFleetPortal*` / `getFleetPortal*` methods on it. The
// portal endpoints (`/api/fleet-partner/*`) are partner-realm self-service
// routes that require an `x-fleet-partner-id` header plus a partner-realm
// auth identity carrying the `billing:read` scope.
//
// Auth model: the portal runs behind the same control-plane perimeter as the
// other consoles (Google IAP in front of Cloud Run). We forward the
// IAP-authenticated user email and, on Cloud Run, mint a metadata identity
// token for the protected backend, mirroring the ops-console server client.
// Unlike the ops/platform consoles, the issued identity is a *partner* realm
// bootstrap identity (`partner_api_key` actor + `x-realm: partner`) so the
// fleet-partner route policy accepts it.

import "server-only";

import { ApiClient, createFleetPartnerPortalClient } from "@drts/api-client";
import { CONTROL_PLANE_IAP_EMAIL_HEADER } from "@drts/control-plane-auth";
import { headers as nextHeaders } from "next/headers";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const FLEET_PARTNER_ID_HEADER = "x-fleet-partner-id";
// Self-service portals read billing/statement data scoped to one partner.
const PORTAL_SCOPES = ["billing:read"];

function resolveServerApiBaseUrl(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

// The fleet partner identity is, in production, injected by the perimeter
// (gateway maps the authenticated partner principal to its fleet-partner id).
// We resolve it from the inbound request header first, then an explicit env
// override for single-tenant deployments, and finally fall back to the design
// example partner so local/dev rendering has a deterministic scope.
function resolveFleetPartnerId(requestHeaders: Headers): string {
  const fromHeader = requestHeaders.get(FLEET_PARTNER_ID_HEADER)?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const fromEnv = process.env.DRTS_FLEET_PARTNER_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error(
    "Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID environment variable or x-fleet-partner-id header is required.",
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

export interface ServerFleetPartnerClient {
  client: ApiClient;
  fleetPartnerId: string;
}

export async function getServerFleetPartnerClient(): Promise<ServerFleetPartnerClient> {
  const apiUrl = resolveServerApiBaseUrl();
  const requestHeaders = await nextHeaders();
  const fleetPartnerId = resolveFleetPartnerId(requestHeaders);

  // Partner-realm bootstrap identity. `createFleetPartnerPortalClient` already
  // sets `x-fleet-partner-id` and `x-realm: partner`; we add the actor/scope
  // headers the backend auth extractor reads for the partner realm.
  const defaultHeaders: Record<string, string> = {
    "x-actor-type": "partner_api_key",
    "x-actor-id": fleetPartnerId,
    "x-partner-id": fleetPartnerId,
    "x-roles": "partner",
    "x-role-families": "partner",
    "x-scopes": PORTAL_SCOPES.join(","),
  };

  // Forward the IAP-authenticated user (audit trail) when present.
  const iapEmail = requestHeaders.get(CONTROL_PLANE_IAP_EMAIL_HEADER);
  if (iapEmail) {
    defaultHeaders[CONTROL_PLANE_IAP_EMAIL_HEADER] = iapEmail;
  }

  const requestId = requestHeaders.get("x-request-id");
  if (requestId) {
    defaultHeaders["x-request-id"] = requestId;
  }

  // Cloud Run-protected backend: mint a service identity token so the request
  // passes the serverless IAM layer in front of the API.
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

  const client = createFleetPartnerPortalClient(
    apiUrl,
    fleetPartnerId,
    defaultHeaders,
  );

  return { client, fleetPartnerId };
}
