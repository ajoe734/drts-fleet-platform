import assert from "node:assert/strict";
import {
  assertAllowedUrl,
  validateCoverageTargets,
  type LiveEnv,
} from "./live-map-config";
import { normalizeApiResponse } from "./wire-response";

// R2's consumed-invitation recovery also revokes the bound device and refresh
// family. It works even when the registration response/access token was lost.
export async function revokeMapInvitation(
  env: LiveEnv,
  fetcher: typeof fetch,
  provisionerToken: string,
  registrationCode: string,
) {
  const config = validateCoverageTargets(env);
  try {
    assert(provisionerToken && !/\s/.test(provisionerToken));
    assert(registrationCode && !/\s/.test(registrationCode));
    const url = `${config.apiOrigin}/api/auth/driver/device/invite/revoke`;
    assertAllowedUrl(url, config.allowedTargets);
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provisionerToken}`,
      },
      body: JSON.stringify({ registrationCode }),
    });
    assert.equal(
      response.headers.get("x-drts-candidate-sha"),
      config.deployedSha,
    );
    assert(response.ok);
    const result = normalizeApiResponse(await response.json()) as {
      data?: { revoked?: boolean };
    };
    assert.equal(result.data?.revoked, true);
  } catch {
    throw new Error(
      "Map invitation cleanup failed; credentials and response withheld",
    );
  }
}
