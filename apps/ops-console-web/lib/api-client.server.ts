import { ApiClient } from "@drts/api-client";
import {
  CONTROL_PLANE_DEFAULT_EMAILS,
  isControlPlaneIapEnabled,
  isStrictControlPlaneIapEnvironment,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";
import { headers as nextHeaders } from "next/headers";

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

export async function getServerOpsClient(): Promise<ApiClient> {
  const apiUrl = resolveServerApiBaseUrl();
  const requestHeaders = await nextHeaders();
  const strictIapMode = isStrictControlPlaneIapEnvironment();
  // Deliberately does not fall back to JWT_SECRET: that key signs/verifies
  // this app's own internal proxy -> API bearer token, a different trust
  // boundary from Google's IAP assertion. Falling back to it here would let
  // a deployment's internal signing secret verify a forged IAP assertion
  // instead of requiring Google's real published JWKS
  // (ENTRY-IAP-WORKFORCE-AUTH-20261005). Leaving this undefined makes
  // issueControlPlaneRequestAuth resolve the real Google-managed ES256 key.
  const iapJwtSecretOrPublicKey =
    process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY || process.env.IAP_JWT_SECRET;
  const expectedIapAudience =
    process.env.IAP_EXPECTED_AUDIENCE ||
    process.env.IAP_AUDIENCE ||
    process.env.JWT_AUDIENCE;
  const expectedIapIssuer = process.env.IAP_EXPECTED_ISSUER;
  const controlPlaneAuth = await issueControlPlaneRequestAuth({
    actorType: "ops_user",
    headers: requestHeaders,
    defaultEmail: CONTROL_PLANE_DEFAULT_EMAILS.ops_user,
    requestId: requestHeaders.get("x-request-id"),
    strictIapMode,
    iapEnabled: isControlPlaneIapEnabled(),
    ...(iapJwtSecretOrPublicKey ? { iapJwtSecretOrPublicKey } : {}),
    ...(expectedIapAudience ? { expectedIapAudience } : {}),
    ...(expectedIapIssuer ? { expectedIapIssuer } : {}),
    ...(process.env.JWT_SECRET ? { jwtSecret: process.env.JWT_SECRET } : {}),
    ...(process.env.JWT_ISSUER ? { jwtIssuer: process.env.JWT_ISSUER } : {}),
    ...(process.env.JWT_AUDIENCE
      ? { jwtAudience: process.env.JWT_AUDIENCE }
      : {}),
  });
  const defaultHeaders = { ...controlPlaneAuth.headers };
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

  if (!process.env.JWT_SECRET) {
    return new ApiClient({
      baseUrl: apiUrl,
      defaultHeaders,
    });
  }

  return new ApiClient({
    baseUrl: apiUrl,
    defaultHeaders,
  });
}
