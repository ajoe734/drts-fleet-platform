import { headers } from "next/headers";
import {
  CONTROL_PLANE_DEFAULT_EMAILS,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";

import type { PlatformAdminAuthority } from "./platform-admin-identity";

export async function getServerPlatformAdminAuthority(): Promise<PlatformAdminAuthority> {
  const requestHeaders = await headers();
  const auth = issueControlPlaneRequestAuth({
    actorType: "platform_admin",
    headers: requestHeaders,
    defaultEmail: CONTROL_PLANE_DEFAULT_EMAILS.platform_admin,
    requestId: requestHeaders.get("x-request-id"),
    strictIapMode: process.env.STRICT_IAP_MODE === "true" || process.env.NODE_ENV === "production",
    iapJwtSecretOrPublicKey:
      process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY ||
      process.env.IAP_JWT_SECRET ||
      process.env.JWT_SECRET,
    expectedIapAudience:
      process.env.IAP_EXPECTED_AUDIENCE ||
      process.env.IAP_AUDIENCE ||
      process.env.JWT_AUDIENCE,
  });

  return {
    actorId: auth.identity.actorId,
    scopes: [...auth.identity.scopes],
  };
}
