import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MailSessionInputError,
  deriveAliasRecipient,
  mintTenantAdminSession,
  validateMailSessionInputs,
  type MailSessionConfig,
  type MailSessionEnv,
} from "../../../e2e/system-remediation/sr-live-mail-001/session-bootstrap";

const VALID_SHA = "a".repeat(40);

function baseEnv(overrides: Partial<MailSessionEnv> = {}): MailSessionEnv {
  return {
    DRTS_LIVE_MAIL_API_ORIGIN: "https://api.dev.drts-fleet.example.com",
    DRTS_CANDIDATE_SHA: VALID_SHA,
    DRTS_LIVE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
    DRTS_LIVE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
    DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("validateMailSessionInputs", () => {
  it("accepts a fully valid configuration and defaults the step-up action id", () => {
    const config = validateMailSessionInputs(baseEnv());
    expect(config.stepUpActionId).toBe("tenant:users:create");
    expect(config.tenantId).toBe("10000000-0000-0000-0000-000000000201");
  });

  it("fails closed when the tenant id is missing", () => {
    const env = baseEnv({ DRTS_LIVE_MAIL_TEST_TENANT_ID: undefined });
    expect(() => validateMailSessionInputs(env)).toThrow(MailSessionInputError);
  });

  it("fails closed when the actor id is missing", () => {
    const env = baseEnv({ DRTS_LIVE_MAIL_TENANT_ACTOR_ID: undefined });
    expect(() => validateMailSessionInputs(env)).toThrow(
      /DRTS_LIVE_MAIL_TENANT_ACTOR_ID/,
    );
  });

  it("fails closed when the GCP project id is missing", () => {
    const env = baseEnv({ DEV_GCP_PROJECT_ID: undefined });
    expect(() => validateMailSessionInputs(env)).toThrow(/DEV_GCP_PROJECT_ID/);
  });
});

describe("deriveAliasRecipient", () => {
  it("inserts a plus-addressing tag before the domain", () => {
    expect(deriveAliasRecipient("person@gmail.com", "invite")).toBe(
      "person+invite@gmail.com",
    );
    expect(deriveAliasRecipient("person@gmail.com", "approve")).toBe(
      "person+approve@gmail.com",
    );
  });

  it("fails closed on a base address with no local part", () => {
    expect(() => deriveAliasRecipient("@gmail.com", "invite")).toThrow(
      /malformed base mailbox address/,
    );
  });

  it("fails closed on a base address with no domain", () => {
    expect(() => deriveAliasRecipient("person@", "invite")).toThrow(
      /malformed base mailbox address/,
    );
  });

  it("fails closed on a base address with no @ at all", () => {
    expect(() => deriveAliasRecipient("not-an-email", "invite")).toThrow(
      /malformed base mailbox address/,
    );
  });
});

describe("mintTenantAdminSession", () => {
  let config: MailSessionConfig;
  let mask: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    config = validateMailSessionInputs(baseEnv());
    mask = vi.fn((value: string) => {
      void value;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mints, verifies and obtains a step-up proof for a correctly-provisioned grant", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { token: "real-session-token", expiresIn: "8h" },
          { "x-drts-candidate-sha": config.candidateSha },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            active: true,
            identity: {
              realm: "tenant",
              actorType: "tenant_admin",
              actorId: config.actorId,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            required: true,
            actionId: "tenant:users:create",
            stepUpReference: "stepup_abc123",
          },
        }),
      );

    const result = await mintTenantAdminSession(config, {
      fetch: fetchMock as unknown as typeof fetch,
      readGoogleIdToken: () => "real-google-id-token",
      mask: mask as (value: string) => void,
    });

    expect(result).toEqual({
      sessionToken: "real-session-token",
      stepUpReference: "stepup_abc123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mask).toHaveBeenCalledWith("real-google-id-token");
    expect(mask).toHaveBeenCalledWith("real-session-token");
    expect(mask).toHaveBeenCalledWith("stepup_abc123");
  });

  it("fails closed when the Google identity token is empty", async () => {
    await expect(
      mintTenantAdminSession(config, {
        fetch: vi.fn() as unknown as typeof fetch,
        readGoogleIdToken: () => "",
        mask: mask as (value: string) => void,
      }),
    ).rejects.toThrow(/missing or malformed/);
  });

  it("fails closed when auth/token reports a mismatched deployed candidate SHA (wrong target/deploy)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { token: "x", expiresIn: "8h" },
          { "x-drts-candidate-sha": "b".repeat(40) },
        ),
      );

    await expect(
      mintTenantAdminSession(config, {
        fetch: fetchMock as unknown as typeof fetch,
        readGoogleIdToken: () => "real-google-id-token",
        mask: mask as (value: string) => void,
      }),
    ).rejects.toThrow(/Deployed candidate SHA header reported/);
  });

  it("fails closed when the minted session does not verify as the requested tenant_admin actor (wrong grant)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { token: "real-session-token", expiresIn: "8h" },
          { "x-drts-candidate-sha": config.candidateSha },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            active: true,
            identity: {
              realm: "ops",
              actorType: "ops_user",
              actorId: "someone-else",
            },
          },
        }),
      );

    await expect(
      mintTenantAdminSession(config, {
        fetch: fetchMock as unknown as typeof fetch,
        readGoogleIdToken: () => "real-google-id-token",
        mask: mask as (value: string) => void,
      }),
    ).rejects.toThrow(/failed live verification/);
  });

  it("fails closed when no step-up proof is issued (missing trusted MFA assertion)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { token: "real-session-token", expiresIn: "8h" },
          { "x-drts-candidate-sha": config.candidateSha },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            active: true,
            identity: {
              realm: "tenant",
              actorType: "tenant_admin",
              actorId: config.actorId,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { required: false, actionId: null, stepUpReference: null },
        }),
      );

    await expect(
      mintTenantAdminSession(config, {
        fetch: fetchMock as unknown as typeof fetch,
        readGoogleIdToken: () => "real-google-id-token",
        mask: mask as (value: string) => void,
      }),
    ).rejects.toThrow(/Step-up proof .* was not issued/);
  });

  it("fails closed on a non-2xx response without leaking details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    await expect(
      mintTenantAdminSession(config, {
        fetch: fetchMock as unknown as typeof fetch,
        readGoogleIdToken: () => "real-google-id-token",
        mask: mask as (value: string) => void,
      }),
    ).rejects.toThrow(/returned HTTP 403/);
  });
});
