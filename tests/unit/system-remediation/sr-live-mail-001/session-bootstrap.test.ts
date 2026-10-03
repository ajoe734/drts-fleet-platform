import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { toApiSuccessEnvelope } from "../../../../apps/api/src/common/api-envelope";
import { StepUpProofService } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.types";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MailSessionInputError,
  MailBootstrapError,
  bootstrapMailSession,
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
    DRTS_LIVE_MAIL_TEST_AUTHORIZED: "true",
    DRTS_LIVE_MAIL_ALLOWED_TARGETS: "https://api.dev.drts-fleet.example.com",
    DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(deepToSnakeCase(body)), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-drts-candidate-sha": VALID_SHA,
      ...headers,
    },
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
  it.each(["example.com", "EXAMPLE.NET", "sub.example.org", "fixture-mail.org", "demo.mail.org", "mail.invalid", "mail.test", "mail.localhost"])("rejects placeholder mailbox domain %s for both flows", (domain) => {
    for (const tag of ["invite", "approve"]) {
      expect(() => deriveAliasRecipient(`unit@${domain}`, tag)).toThrow();
    }
  });
  it.each(["invite", "approve"])(
    "accepts the authorized sender's Workspace domain for %s",
    (tag) => {
      expect(
        deriveAliasRecipient("mail.acceptance@workspace-mail.org", tag),
      ).toBe(`mail.acceptance+${tag}@workspace-mail.org`);
    },
  );

  it.each([
    "unit@googlemail.com",
    "unit@sub-domain.workspace-mail.org",
    "unit@WORKSPACE-MAIL.ORG",
    "unit@xn--bcher-kva.org",
    "o'neil+dev@workspace-mail.org",
  ])("preserves the supplied mailbox domain: %s", (mailbox) => {
    const [local, domain] = mailbox.split("@");
    expect(deriveAliasRecipient(mailbox, "invite")).toBe(
      `${local}+invite@${domain}`,
    );
  });

  it.each([
    "unit@",
    "@example.com",
    "unit@@example.com",
    "unit@example.com\n",
    "unit\n@example.com",
    "unit@example.com\r\nEVIL=value",
    "Name <unit@example.com>",
    "unit@example.com,other@example.com",
    "unit@-example.com",
    "unit@example-.com",
    "unit@exam_ple.com",
    "unit@example..com",
    ".unit@example.com",
    "unit.@example.com",
    "unit..test@example.com",
    `${"a".repeat(58)}@example.com`,
    `unit@${"a".repeat(64)}.com`,
  ])("rejects malformed/injectable/oversized mailboxes: %j", (mailbox) => {
    expect(() => deriveAliasRecipient(mailbox, "invite")).toThrow(
      /malformed base mailbox address/,
    );
  });

  it.each(["", "other", "invite\nPRIVATE=value", "approve@elsewhere.example"])(
    "rejects unsupported alias tags without echoing them",
    (tag) => {
      try {
        deriveAliasRecipient("unit@example.com", tag);
        throw new Error("unexpected success");
      } catch (error) {
        expect(String(error)).toBe(
          "Error: Cannot derive an authorized alias from a malformed base mailbox address or unsupported tag.",
        );
      }
    },
  );

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

describe("hosted bootstrap entry point and safe failure diagnostics", () => {
  function setup() {
    const env = baseEnv({
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/unit/github-env",
    });
    const identity: BootstrapRequestIdentity = {
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: env.DRTS_LIVE_MAIL_TENANT_ACTOR_ID!,
      tenantId: env.DRTS_LIVE_MAIL_TEST_TENANT_ID!,
      realm: "tenant",
      roles: ["tenant_admin"],
      roleFamilies: [],
      scopes: [],
      requestId: null,
      sessionId: "private-session-id",
      authTime: new Date().toISOString(),
      amr: ["mfa"],
    };
    // Exercise the formal policy and proof creation, then the real wire serializer.
    // HTTP, Google IAM, Secret Manager, and filesystem remain unit boundaries.
    const proofService = new StepUpProofService();
    const proof = proofService.createProof(identity, {
      actionId: "tenant:users:create",
    });
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const path = String(url);
        if (path.endsWith("/health")) return jsonResponse({ status: "ok" });
        if (path.endsWith("/auth/token"))
          return jsonResponse({ token: "private-session-token" });
        if (path.endsWith("/auth/session"))
          return jsonResponse(toApiSuccessEnvelope({ active: true, identity }));
        if (path.endsWith("/step-up-proofs")) {
          expect(JSON.parse(init!.body as string)).toEqual({
            actionId: "tenant:users:create",
          });
          return jsonResponse(toApiSuccessEnvelope(proof));
        }
        throw new Error("Unexpected unit request");
      },
    );
    const next = vi.fn().mockResolvedValue("private-google-assertion");
    const deps = {
      fetch: fetcher,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn(() => "mail.acceptance@workspace-mail.org"),
      assertions: vi.fn(() => ({ next })),
    };
    return { env, deps, identity, proof, next };
  }

  it("exports a real policy-generated proof and a Workspace alias after identity verification", async () => {
    const { env, deps, proof } = setup();
    await bootstrapMailSession(env, deps);
    expect(proof.required).toBe(true);
    expect(deps.appendEnvironment.mock.calls.map((call) => call[1])).toEqual([
      "DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN=private-session-token\n",
      `DRTS_LIVE_MAIL_STEP_UP_REFERENCE=${proof.stepUpReference}\n`,
      "DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT=mail.acceptance+invite@workspace-mail.org\n",
      "DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT=sr-live-mail-001-negative@reserved.invalid\n",
    ]);
    expect(deps.mask).toHaveBeenCalledWith(proof.stepUpReference);
    expect(deps.fetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["candidate-preflight", 0, "Error"],
    ["token-exchange", 1, "TypeError"],
    ["session-request", 2, "SyntaxError"],
    ["step-up-request", 3, "SyntaxError"],
  ] as const)(
    "reports %s with a safe class and no upstream data",
    async (stage, index, errorClass) => {
      const { env, deps } = setup();
      const normal = deps.fetch.getMockImplementation()!;
      let calls = 0;
      deps.fetch.mockImplementation(async (...args) => {
        if (calls++ !== index) return normal(...args);
        if (stage === "candidate-preflight")
          return jsonResponse({}, { "x-drts-candidate-sha": "private-data" });
        if (stage === "token-exchange")
          throw Object.assign(new TypeError("private-password"), {
            name: "private-name",
            stderr: "private-stderr",
          });
        return new Response("private-body-not-json", {
          headers: { "x-drts-candidate-sha": VALID_SHA },
        });
      });
      await expect(bootstrapMailSession(env, deps)).rejects.toThrow(
        `Mail session bootstrap failed; stage=${stage}; error_class=${errorClass}; credential details omitted.`,
      );
      expect(deps.readMailbox).not.toHaveBeenCalled();
      if (index >= 2)
        expect(deps.appendEnvironment).toHaveBeenCalledWith(
          env.GITHUB_ENV,
          "DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN=private-session-token\n",
        );
    },
  );

  it.each(["wrong-action", "camel-only", "not-required", "invalid-reference"])(
    "identifies step-up-validation and retains cleanup for %s",
    async (kind) => {
      const { env, deps, proof } = setup();
      const normal = deps.fetch.getMockImplementation()!;
      deps.fetch.mockImplementation(async (url, init) => {
        if (!String(url).endsWith("/step-up-proofs")) return normal(url, init);
        const changed = { ...proof };
        if (kind === "wrong-action")
          changed.actionId = "tenant:users:role:update";
        if (kind === "not-required") changed.required = false;
        if (kind === "invalid-reference")
          changed.stepUpReference = "private\nINJECT=value";
        if (kind === "camel-only")
          return new Response(JSON.stringify(toApiSuccessEnvelope(changed)), {
            headers: { "x-drts-candidate-sha": VALID_SHA },
          });
        return jsonResponse(toApiSuccessEnvelope(changed));
      });
      await expect(bootstrapMailSession(env, deps)).rejects.toThrow(
        "stage=step-up-validation; error_class=Error;",
      );
      expect(deps.appendEnvironment.mock.calls).toEqual([
        [
          env.GITHUB_ENV,
          "DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN=private-session-token\n",
        ],
      ]);
      expect(deps.readMailbox).not.toHaveBeenCalled();
    },
  );

  it.each(["actorId", "tenantId", "actorType", "roles"] as const)(
    "still rejects a mismatched session %s",
    async (key) => {
      const { env, deps, identity } = setup();
      Object.assign(identity, { [key]: "private-wrong-grant" });
      await expect(bootstrapMailSession(env, deps)).rejects.toThrow(
        "stage=session-validation; error_class=Error;",
      );
      expect(deps.readMailbox).not.toHaveBeenCalled();
    },
  );

  it.each(["mailbox-read", "alias-derivation", "recipient-export"] as const)(
    "identifies %s after successful proof without leaking mailbox or process stderr",
    async (stage) => {
      const { env, deps } = setup();
      if (stage === "mailbox-read")
        deps.readMailbox.mockImplementation(() => {
          throw Object.assign(new Error("private-command"), {
            stderr: "private-password",
            name: "private-name",
          });
        });
      if (stage === "alias-derivation")
        deps.readMailbox.mockReturnValue("private@example.com\nEVIL=value");
      if (stage === "recipient-export")
        deps.appendEnvironment.mockImplementation((_path, value) => {
          if (value.includes("AUTHORIZED_RECIPIENT"))
            throw new Error("private-env-content");
        });
      const error = await bootstrapMailSession(env, deps).catch(
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(MailBootstrapError);
      expect(String(error)).toBe(
        `Error: Mail session bootstrap failed; stage=${stage}; error_class=${stage === "alias-derivation" ? "MailMailboxInputError" : "Error"}; credential details omitted.`,
      );
      expect(deps.appendEnvironment.mock.calls[0]?.[1]).toBe(
        "DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN=private-session-token\n",
      );
      expect(JSON.stringify(error)).not.toContain("private");
    },
  );

  it("only performs candidate preflight in preflight mode", async () => {
    const { env, deps } = setup();
    await bootstrapMailSession(env, deps, true);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(deps.assertions).not.toHaveBeenCalled();
    expect(deps.readMailbox).not.toHaveBeenCalled();
    expect(deps.appendEnvironment).not.toHaveBeenCalled();
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
              tenantId: config.tenantId,
              roles: ["tenant_admin"],
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
              tenantId: config.tenantId,
              roles: ["tenant_admin"],
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
