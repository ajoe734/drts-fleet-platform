import { ApiClient } from "@drts/api-client";
import { issueControlPlaneRequestAuth } from "@drts/control-plane-auth";
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
  const drtsEnv = (process.env.DRTS_ENV || process.env.APP_ENV || "")
    .trim()
    .toLowerCase();

  const isDevEnv =
    drtsEnv === "development" ||
    drtsEnv === "dev" ||
    drtsEnv === "local" ||
    drtsEnv === "sandbox" ||
    process.env.NODE_ENV !== "production";

  const strictIapMode =
    process.env.STRICT_IAP_MODE === "true" ||
    (!isDevEnv && process.env.NODE_ENV === "production");

  const allowUnverifiedTokenInDev =
    isDevEnv && process.env.ALLOW_UNVERIFIED_IAP_DEV === "true";
  const iapJwtSecretOrPublicKey =
    process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY ||
    process.env.IAP_JWT_SECRET ||
    process.env.JWT_SECRET;
  const expectedIapAudience =
    process.env.IAP_EXPECTED_AUDIENCE ||
    process.env.IAP_AUDIENCE ||
    process.env.JWT_AUDIENCE;
  const expectedIapIssuer = process.env.IAP_EXPECTED_ISSUER;

  const controlPlaneAuth = issueControlPlaneRequestAuth({
    actorType: "ops_user",
    headers: requestHeaders,
    defaultEmail: ROC_DUTY_OPERATOR_EMAIL,
    requestId: requestHeaders.get("x-request-id"),
    strictIapMode,
    ...(iapJwtSecretOrPublicKey ? { iapJwtSecretOrPublicKey } : {}),
    ...(expectedIapAudience ? { expectedIapAudience } : {}),
    ...(expectedIapIssuer ? { expectedIapIssuer } : {}),
    ...(allowUnverifiedTokenInDev ? { allowUnverifiedTokenInDev } : {}),
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

  return new ApiClient({
    baseUrl: apiUrl,
    defaultHeaders,
  });
}
