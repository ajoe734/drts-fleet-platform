import { headers } from "next/headers";
import {
  CONTROL_PLANE_DEFAULT_EMAILS,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";

import type { PlatformAdminAuthority } from "./platform-admin-identity";

export async function getServerPlatformAdminAuthority(): Promise<PlatformAdminAuthority> {
  const requestHeaders = await headers();
  const strictIapMode =
    process.env.STRICT_IAP_MODE === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.DRTS_ENV !== "development");
  const iapJwtSecretOrPublicKey =
    process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY ||
    process.env.IAP_JWT_SECRET ||
    process.env.JWT_SECRET;
  const expectedIapAudience =
    process.env.IAP_EXPECTED_AUDIENCE ||
    process.env.IAP_AUDIENCE ||
    process.env.JWT_AUDIENCE;
  const expectedIapIssuer = process.env.IAP_EXPECTED_ISSUER;
  const allowUnverifiedTokenInDev =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_UNVERIFIED_IAP_DEV === "true";

  const auth = issueControlPlaneRequestAuth({
    actorType: "platform_admin",
    headers: requestHeaders,
    defaultEmail: CONTROL_PLANE_DEFAULT_EMAILS.platform_admin,
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

  return {
    actorId: auth.identity.actorId,
    scopes: [...auth.identity.scopes],
  };
}
