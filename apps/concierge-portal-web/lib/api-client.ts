import { ApiClient } from "@drts/api-client";
import type { ConciergeOperatorMode } from "@/lib/desk-catalog";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const OPS_CALLCENTER_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003/callcenter";

const LIMITED_SCOPES = [
  "callcenter:read",
  "callcenter:write",
  "owned:read",
  "dispatch:read",
];

export function createConciergeClient(
  actorId: string,
  mode: ConciergeOperatorMode,
) {
  return new ApiClient({
    baseUrl: API_URL,
    defaultHeaders: {
      "x-actor-type": "ops_user",
      "x-actor-id": actorId,
      "x-realm": "ops",
      "x-role-families": "ops",
      "x-roles": mode,
      "x-scopes": LIMITED_SCOPES.join(" "),
    },
  });
}

export function formatScopeSummary() {
  return LIMITED_SCOPES.join(", ");
}
