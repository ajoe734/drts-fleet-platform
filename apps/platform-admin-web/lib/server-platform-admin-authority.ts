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
  });

  return {
    actorId: auth.identity.actorId,
    scopes: [...auth.identity.scopes],
  };
}
