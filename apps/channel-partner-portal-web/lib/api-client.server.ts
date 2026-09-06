// Referral-partner-scoped server api-client for the Channel Partner Portal.
//
// This is the data-source seam for the portal: every server component that
// needs live data resolves a client through `getServerReferralPartnerClient()`
// and calls the `/api/partner/referral/*` routes on it. Those are partner-realm
// self-service routes that require the partner/entry-slug headers plus a
// partner-realm auth identity carrying the `billing:read` scope.
//
// Auth model: the portal runs behind the same control-plane perimeter as the
// other consoles (Google IAP in front of Cloud Run). We forward the
// IAP-authenticated user email and, on Cloud Run, mint a metadata identity
// token for the protected backend. The issued identity is a *partner* realm
// bootstrap identity (`partner_api_key` actor + `x-realm: partner`) so the
// referral route policy accepts it.

import "server-only";

import { ApiClient } from "@drts/api-client";
import { CONTROL_PLANE_IAP_EMAIL_HEADER } from "@drts/control-plane-auth";
import { headers as nextHeaders } from "next/headers";

import {
  buildReferralPortalBootstrapContext,
  type ReferralPortalRequestEvidence,
} from "./referral-bootstrap-identity";

const DEFAULT_API_BASE_URL = "http://localhost:3001";

function resolveServerApiBaseUrl(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
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

export interface ServerReferralPartnerClient {
  client: ApiClient;
  partnerId: string;
  partnerEntrySlug: string;
  requestEvidence: ReferralPortalRequestEvidence;
}

export async function getServerReferralPartnerClient(): Promise<ServerReferralPartnerClient> {
  const apiUrl = resolveServerApiBaseUrl();
  let requestHeaders: Headers;
  try {
    requestHeaders = await nextHeaders();
  } catch {
    requestHeaders = new Headers();
  }
  const { defaultHeaders, partnerId, partnerEntrySlug, requestEvidence } =
    buildReferralPortalBootstrapContext();

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

  return {
    client: new ApiClient({
      baseUrl: apiUrl,
      defaultHeaders,
    }),
    partnerId,
    partnerEntrySlug,
    requestEvidence,
  };
}
