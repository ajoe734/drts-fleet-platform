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
  DRTS_LIVE_MAP_CLEANUP_SESSION_TOKEN: "test-provisioner-secret",
  DRTS_LIVE_MAP_INVITE_CODE: "test-registration-secret",
};
it("uses only gated, non-redirecting candidate-bound recovery and saves no secrets", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(String(input)).toBe(
      "https://api.example.test/api/auth/driver/device/invite/revoke",
    );
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Response.json(
      { data: { revoked: true } },
      { headers: { "x-drts-candidate-sha": sha } },
    );
  });
  const save = vi.fn();
  await teardownMapSessions(env, { fetch, save });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "passed",
      revoked: true,
      candidate_sha: sha,
    }),
  );
  expect(JSON.stringify(save.mock.calls)).not.toContain("secret");
});
it.each([
  { DRTS_LIVE_MAP_TEST_AUTHORIZED: "false" },
  { RUNNER_ENVIRONMENT: "self-hosted" },
  { DRTS_LIVE_MAP_API_ORIGIN: "https://evil.example.test" },
  { WORKFLOW_SHA: "b".repeat(40) },
  { DRTS_LIVE_MAP_CLEANUP_SESSION_TOKEN: "" },
  { DRTS_LIVE_MAP_INVITE_CODE: "" },
])("rejects %j without any request", async (override) => {
  const fetch = vi.fn();
  await expect(
    teardownMapSessions({ ...env, ...override }, { fetch, save: vi.fn() }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  "http-error",
  "redirect",
  "wrong-sha",
  "revoked-false",
  "no-envelope",
  "network",
  "invalid-json",
])("fails cleanup on %s without credential/body disclosure", async (mode) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    expect(init?.redirect).toBe("error");
    if (mode === "network") throw new Error("private-secret-network");
    if (mode === "invalid-json")
      return new Response("private-secret-body", {
        headers: { "x-drts-candidate-sha": sha },
      });
    return Response.json(
      mode === "no-envelope"
        ? { revoked: true }
        : {
            data: { revoked: mode !== "revoked-false" },
            private: "private-secret-body",
          },
      {
        status: mode === "http-error" ? 403 : mode === "redirect" ? 302 : 200,
        headers: {
          "x-drts-candidate-sha": mode === "wrong-sha" ? "b".repeat(40) : sha,
          location: "https://evil.example.test",
        },
      },
    );
  });
  const save = vi.fn();
  await expect(teardownMapSessions(env, { fetch, save })).rejects.toThrow(
    "Map session teardown failed; credentials and response withheld",
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ status: "failed", revoked: false }),
  );
  expect(JSON.stringify(save.mock.calls)).not.toContain("secret");
});
