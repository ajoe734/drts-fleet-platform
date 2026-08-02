import { ApiClient } from "@drts/api-client";
import {
  exchangeControlPlaneRequestAuth,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";
import { headers as nextHeaders } from "next/headers";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const ROC_DUTY_OPERATOR_EMAIL = "roc-duty@platform.drts";

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

export async function getServerRocClient(): Promise<ApiClient> {
  const apiUrl = resolveServerApiBaseUrl();
  const requestHeaders = await nextHeaders();
  const defaultHeaders: Record<string, string> = {};
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

  const exchangeUrl = new URL("api/auth/token", `${apiUrl}/`).toString();
  const internalKey = process.env.DRTS_INTERNAL_KEY?.trim();
  const controlPlaneAuth =
    internalKey && requestHeaders.get("x-goog-iap-jwt-assertion")
      ? await exchangeControlPlaneRequestAuth({
          actorType: "ops_user",
          headers: requestHeaders,
          defaultEmail: ROC_DUTY_OPERATOR_EMAIL,
          exchangeUrl,
          internalKey,
          requestId: requestHeaders.get("x-request-id"),
          upstreamAuthHeaders: defaultHeaders,
        })
      : issueControlPlaneRequestAuth({
          actorType: "ops_user",
          headers: requestHeaders,
          defaultEmail: ROC_DUTY_OPERATOR_EMAIL,
          requestId: requestHeaders.get("x-request-id"),
          ...(process.env.JWT_SECRET ? { jwtSecret: process.env.JWT_SECRET } : {}),
          ...(process.env.JWT_ISSUER ? { jwtIssuer: process.env.JWT_ISSUER } : {}),
          ...(process.env.JWT_AUDIENCE
            ? { jwtAudience: process.env.JWT_AUDIENCE }
            : {}),
        });
  Object.assign(defaultHeaders, controlPlaneAuth.headers);

  return new ApiClient({
    baseUrl: apiUrl,
    defaultHeaders,
  });
}
