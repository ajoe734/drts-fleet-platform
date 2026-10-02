import { expect, it, vi } from "vitest";
import { teardownMapSessions } from "../../../e2e/system-remediation/sr-live-map-001/session-teardown";

const sha = "a".repeat(40);
const env = {
  GITHUB_ACTIONS: "true",
  RUNNER_ENVIRONMENT: "github-hosted",
  DRTS_CANDIDATE_SHA: sha,
  WORKFLOW_SHA: sha,
  DRTS_LIVE_MAP_TEST_AUTHORIZED: "true",
  DRTS_LIVE_MAP_TEST_ORIGIN: "https://ops.example.test",
  DRTS_LIVE_MAP_API_ORIGIN: "https://api.example.test",
  DRTS_LIVE_MAP_ALLOWED_TARGETS:
    "https://ops.example.test,https://api.example.test,https://maps.googleapis.com",
  DRTS_LIVE_MAP_TEST_DRIVER_ID: "drv-demo-002",
  DRTS_LIVE_MAP_INVITE_CODE: "private-code",
  DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN: "cached-session",
};
function harness(
  options: { expired?: boolean; fail?: boolean; wrongSha?: boolean } = {},
) {
  const readGoogleIdToken = vi.fn(() => "fresh-google-assertion");
  const mask = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(init?.redirect).toBe("error");
    const url = new URL(String(input));
    expect(url.origin).toBe(env.DRTS_LIVE_MAP_API_ORIGIN);
    const headers = new Headers(init?.headers);
    expect(headers.has("x-drts-internal-key")).toBe(false);
    const reply = (data: unknown, status = 200) =>
      Response.json(data, {
        status,
        headers: {
          "x-drts-candidate-sha": options.wrongSha ? "b".repeat(40) : sha,
        },
      });
    if (url.pathname === "/api/health")
      return reply({
        candidateSha: sha,
        mapProvider: { effectiveBackend: "google" },
      });
    if (url.pathname === "/api/auth/token") {
      expect(headers.get("x-drts-google-id-token")).toBe(
        "fresh-google-assertion",
      );
      expect(headers.get("x-actor-type")).toBe("system");
      return reply({ token: "new-session", expiresIn: "15m" });
    }
    if (url.pathname === "/api/auth/session") {
      if (
        options.expired &&
        headers.get("authorization") === "Bearer cached-session"
      )
        return reply({}, 401);
      return reply({
        data: {
          active: true,
          identity: {
            actorType: "system",
            actorId: "dev-live-map",
            realm: "system",
            scopes: ["driver:provision"],
            driverProvisioningDriverId: "drv-demo-002",
          },
        },
      });
    }
    expect(url.pathname).toBe("/api/auth/driver/device/invite/revoke");
    expect(headers.get("authorization")).toBe(
      `Bearer ${options.expired ? "new-session" : "cached-session"}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      registrationCode: "private-code",
    });
    return reply({ data: { revoked: !options.fail } });
  });
  return { fetch, mask, readGoogleIdToken };
}
it("revokes the invite and bound device using the existing restricted session", async () => {
  const deps = harness();
  await teardownMapSessions(env, deps);
  expect(deps.readGoogleIdToken).not.toHaveBeenCalled();
  expect(deps.fetch).toHaveBeenCalledTimes(3);
});
it("uses fresh WIF after expiry, without reading a secret or issuing a workforce session", async () => {
  const deps = harness({ expired: true });
  await teardownMapSessions(env, deps);
  expect(deps.readGoogleIdToken).toHaveBeenCalledWith("provisioning");
  expect(deps.mask).toHaveBeenCalledWith("new-session");
});
it.each([{ fail: true }, { wrongSha: true }])(
  "fails cleanup closed with sanitized errors: %j",
  async (options) => {
    await expect(teardownMapSessions(env, harness(options))).rejects.toThrow(
      "Map session cleanup failed; no credential details retained",
    );
  },
);
it("does not call the API when there is no invite to clean up", async () => {
  const deps = harness();
  await teardownMapSessions({ ...env, DRTS_LIVE_MAP_INVITE_CODE: "" }, deps);
  expect(deps.fetch).not.toHaveBeenCalled();
});
it("checks hosted authorization before cleanup", async () => {
  const deps = harness();
  await expect(
    teardownMapSessions(
      { ...env, DRTS_LIVE_MAP_TEST_AUTHORIZED: "false" },
      deps,
    ),
  ).rejects.toThrow();
  expect(deps.fetch).not.toHaveBeenCalled();
});
