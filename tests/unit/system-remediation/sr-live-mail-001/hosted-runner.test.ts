import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FreshAssertionSource,
  googleAssertionSource,
} from "../../../e2e/system-remediation/sr-live-mail-001/fresh-assertion";
import {
  AssertionReplayError,
  mintTenantAdminSession,
  validateMailSessionInputs,
} from "../../../e2e/system-remediation/sr-live-mail-001/session-bootstrap";
import { teardown } from "../../../e2e/system-remediation/sr-live-mail-001/session-teardown";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import {
  toApiSuccessEnvelope,
  toApiErrorEnvelope,
} from "../../../../apps/api/src/common/api-envelope";

const sha = "a".repeat(40);
const origin = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const env = {
  DRTS_CANDIDATE_SHA: sha,
  DRTS_LIVE_MAIL_API_ORIGIN: origin,
  DRTS_LIVE_MAIL_ALLOWED_TARGETS: origin,
  DRTS_LIVE_MAIL_TEST_AUTHORIZED: "true",
  DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
  DRTS_LIVE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
  DRTS_LIVE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
};
const assertion = (iat: number, aud = origin) =>
  `header.${Buffer.from(JSON.stringify({ iat, aud })).toString("base64url")}.signature`;
afterEach(() => vi.restoreAllMocks());

describe("single-use Google assertions", () => {
  it("waits through repeated same-second IAM results and only yields distinct iat values", async () => {
    const mint = vi
      .fn()
      .mockResolvedValueOnce(assertion(100))
      .mockResolvedValueOnce(assertion(100))
      .mockResolvedValueOnce(assertion(101));
    const wait = vi.fn().mockResolvedValue(undefined);
    const source = new FreshAssertionSource(mint, origin, wait);
    expect(await source.next()).toBe(assertion(100));
    expect(await source.next()).toBe(assertion(101));
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1100);
  });
  it("fails boundedly instead of replaying when IAM never advances iat", async () => {
    const mint = vi.fn().mockResolvedValue(assertion(100));
    const source = new FreshAssertionSource(
      mint,
      origin,
      vi.fn().mockResolvedValue(undefined),
    );
    await source.next();
    await expect(source.next()).rejects.toThrow(/distinct iat/);
    expect(mint).toHaveBeenCalledTimes(9);
  });
  it.each(["bad", assertion(100, "https://other.invalid"), assertion(1.5)])(
    "rejects malformed/audience-mismatched assertions",
    async (token) => {
      await expect(
        new FreshAssertionSource(async () => token, origin).next(),
      ).rejects.toThrow();
    },
  );
  it("uses the original federated bearer and fixed Google IAM endpoint without credential redirects", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ token: assertion(100) })),
      );
    const mask = vi.fn();
    const source = googleAssertionSource(
      origin,
      "github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com",
      "federated-test",
      mask,
    );
    await source.next();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toMatch(
      /^https:\/\/iamcredentials.googleapis.com\/v1\/projects\/-\/serviceAccounts\/.*:generateIdToken$/,
    );
    expect(init).toMatchObject({
      redirect: "error",
      headers: { authorization: "Bearer federated-test" },
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      audience: origin,
      includeEmail: true,
    });
    expect(mask).toHaveBeenCalledWith("federated-test");
    expect(mask).toHaveBeenCalledWith(assertion(100));
  });
  it("classifies the real auth/token replay envelope without weakening server validation", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            toApiErrorEnvelope(
              "WORKLOAD_ASSERTION_REPLAYED",
              "private message",
            ),
          ),
          { status: 409 },
        ),
      );
    await expect(
      mintTenantAdminSession(validateMailSessionInputs(env), {
        fetch: fetcher,
        readGoogleIdToken: () => "assertion",
        mask: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(AssertionReplayError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("exports cleanup handle before a subsequent session verification failure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "session-test" }), {
          headers: { "x-drts-candidate-sha": sha },
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    const issued = vi.fn();
    await expect(
      mintTenantAdminSession(validateMailSessionInputs(env), {
        fetch: fetcher,
        readGoogleIdToken: () => "assertion",
        mask: vi.fn(),
        onSessionIssued: issued,
      }),
    ).rejects.toThrow(/503/);
    expect(issued).toHaveBeenCalledWith("session-test");
  });
});

describe("hosted session cleanup", () => {
  it("revokes its own session after deployment drift and checks the real logout envelope", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            deepToSnakeCase(
              toApiSuccessEnvelope({ revoked: true, loggedOut: true }),
            ),
          ),
          { headers: { "x-drts-candidate-sha": "b".repeat(40) } },
        ),
      );
    await teardown(
      { ...env, DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN: "session-test" },
      fetcher,
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${origin}/api/auth/logout`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { authorization: "Bearer session-test" },
    });
  });
  it("rejects fake cleanup success and never revokes unrelated sessions", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"data":{"revoked":false}}'));
    await expect(
      teardown(
        { ...env, DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN: "session-test" },
        fetcher,
      ),
    ).rejects.toThrow(/revocation/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does no network work before issuance", async () => {
    const fetcher = vi.fn();
    await teardown(env, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
