import { headers } from "next/headers";
import {
  CONTROL_PLANE_DEFAULT_EMAILS,
  exchangeControlPlaneRequestAuth,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";

import type { PlatformAdminAuthority } from "./platform-admin-identity";

export async function getServerPlatformAdminAuthority(): Promise<PlatformAdminAuthority> {
  const requestHeaders = await headers();
  const apiUrl = process.env.DRTS_API_URL || "http://localhost:3001";
  const internalKey = process.env.DRTS_INTERNAL_KEY?.trim();
  const auth =
    internalKey && requestHeaders.get("x-goog-iap-jwt-assertion")
      ? await exchangeControlPlaneRequestAuth({
          actorType: "platform_admin",
          headers: requestHeaders,
          defaultEmail: CONTROL_PLANE_DEFAULT_EMAILS.platform_admin,
          exchangeUrl: new URL("api/auth/token", `${apiUrl}/`).toString(),
          internalKey,
          requestId: requestHeaders.get("x-request-id"),
        })
      : issueControlPlaneRequestAuth({
          actorType: "platform_admin",
          headers: requestHeaders,
          defaultEmail: CONTROL_PLANE_DEFAULT_EMAILS.platform_admin,
          requestId: requestHeaders.get("x-request-id"),
        });

  return {
    actorId: auth.identity.actorId,
    scopes: [...auth.identity.scopes],
  };
}
