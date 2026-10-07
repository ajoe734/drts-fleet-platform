import { describe, it, expect, vi } from "vitest";
import { bootstrapMailSession } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-bootstrap";
import { teardown } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-teardown";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: actual.appendFileSync,
  };
});

describe("F1 bootstrap and teardown adapter", () => {
  it("maps invoice env vars properly and mocks IO without credential issuance on mismatch", async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "x-drts-candidate-sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
      json: async () => ({}),
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi
        .fn()
        .mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
    };

    await bootstrapMailSession(env, deps, true);
  });

  it("rejects mismatching candidate SHA", async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "x-drts-candidate-sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
      json: async () => ({}),
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn(),
      assertions: vi.fn(),
    };

    await expect(bootstrapMailSession(env, deps, true)).rejects.toThrow(
      /candidate-preflight/,
    );
  });

  it("rejects missing or malformed inputs without credential issuance", async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "invalid-sha",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };

    const deps = {
      fetch: vi.fn(),
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn(),
      assertions: vi.fn(),
    };

    await expect(bootstrapMailSession(env, deps, true)).rejects.toThrow(
      /input-validation/,
    );
  });

  it("performs successful issuance of all tokens", async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID:
        "10000000-0000-0000-0000-000000000202",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_ACTOR_ID:
        "10000000-0000-0000-0000-000000000902",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID:
        "10000000-0000-0000-0000-000000000203",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_ACTOR_ID:
        "10000000-0000-0000-0000-000000000903",
      DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST: "billing+invoice@company.com",
    };

    let tokenIndex = 0;
    const tokensMap: Record<string, any> = {};

    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      let parsedBody: any = {};
      try {
        parsedBody = opts.body ? JSON.parse(opts.body) : {};
      } catch {
        /* ignore */
      }

      const defaultHeaders = new Headers({
        "x-drts-candidate-sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });

      if (url.includes("auth/token")) {
        const tenantId = opts.headers["x-tenant-id"] || parsedBody.tenant_id;
        const actorId = opts.headers["x-actor-id"] || parsedBody.actor_id;
        const isReadOnly = actorId === "10000000-0000-0000-0000-000000000902";
        const expectedRole = isReadOnly ? "tenant_viewer" : "tenant_admin";
        const scopes = isReadOnly ? ["tenant:billing:read"] : ["tenant:billing:read", "tenant:billing:write"];
        const payloadObj = {
          roles: [expectedRole],
          scopes,
          tenantId,
          sub: actorId
        };
        const token = "dummy." + Buffer.from(JSON.stringify(payloadObj)).toString("base64") + ".dummy";
        tokensMap[token] = { tenant_id: tenantId, actor_id: actorId };
        return {
          ok: true,
          headers: defaultHeaders,
          json: async () => ({ token }),
        };
      }
      if (url.includes("auth/session")) {
        const authHeader = opts.headers["authorization"];
        const token = authHeader ? authHeader.split(" ")[1] : "";
        const ctx = tokensMap[token] || { tenant_id: "", actor_id: "" };
        const role =
          ctx.actor_id === "10000000-0000-0000-0000-000000000902"
            ? "tenant_viewer"
            : "tenant_admin";
        const scopes =
          ctx.actor_id === "10000000-0000-0000-0000-000000000902"
            ? ["tenant:billing:read"]
            : ["tenant:billing:read", "tenant:billing:write"];
        return {
          ok: true,
          headers: defaultHeaders,
          json: async () => ({
            data: {
              active: true,
              identity: {
                realm: "tenant",
                actor_type: "tenant_admin",
                actor_id: ctx.actor_id,
                tenant_id: ctx.tenant_id,
                roles: [role],
                scopes,
              },
            },
          }),
        };
      }
      if (url.includes("identity/step-up-proofs")) {
        return {
          ok: true,
          headers: defaultHeaders,
          json: async () => ({
            data: {
              required: true,
              step_up_reference: "mock-step-up-ref",
              action_id: "tenant:users:create",
            },
          }),
        };
      }
      return { ok: true, headers: defaultHeaders, json: async () => ({}) };
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi
        .fn()
        .mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
      onSessionIssued: vi.fn(),
    };

    await bootstrapMailSession(env, deps, false);

    expect(deps.appendEnvironment).toHaveBeenCalledWith(
      "/tmp/env",
      expect.stringContaining("DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN="),
    );
    expect(deps.appendEnvironment).toHaveBeenCalledWith(
      "/tmp/env",
      expect.stringContaining("DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN="),
    );
    expect(deps.appendEnvironment).toHaveBeenCalledWith(
      "/tmp/env",
      expect.stringContaining("DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN="),
    );

    const fs = await import("node:fs");
    const writeCalls = (fs.writeFileSync as any).mock.calls.filter((c: any) => c[0].includes("evidence-bootstrap.json"));
    expect(writeCalls.length).toBeGreaterThan(0);
    const firstEmitted = JSON.parse(writeCalls[0][1]);
    expect(firstEmitted.runId).toBeDefined();
    expect(firstEmitted.candidateSha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(firstEmitted.issued_sessions_count).toBe(1);
    expect(firstEmitted.issued_sessions).toEqual([
      expect.objectContaining({ exportKey: "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN" })
    ]);
    const finalEmitted = JSON.parse(writeCalls[writeCalls.length - 1][1]);
    expect(finalEmitted.issued_sessions_count).toBe(3);
    expect(finalEmitted.issued_sessions).toEqual([
      expect.objectContaining({
        exportKey: "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN",
        observed_role: "tenant_admin",
        observed_scopes: expect.arrayContaining(["tenant:billing:write", "tenant:billing:read"]),
        observed_tenant_id: "10000000-0000-0000-0000-000000000201",
        observed_actor_id: "10000000-0000-0000-0000-000000000901"
      }),
      expect.objectContaining({
        exportKey: "DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN",
        observed_role: "tenant_viewer",
        observed_scopes: ["tenant:billing:read"],
        observed_tenant_id: "10000000-0000-0000-0000-000000000202",
        observed_actor_id: "10000000-0000-0000-0000-000000000902"
      }),
      expect.objectContaining({
        exportKey: "DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN",
        observed_role: "tenant_admin",
        observed_scopes: expect.arrayContaining(["tenant:billing:write", "tenant:billing:read"]),
        observed_tenant_id: "10000000-0000-0000-0000-000000000203",
        observed_actor_id: "10000000-0000-0000-0000-000000000903"
      })
    ]);
    expect(finalEmitted.success).toBeUndefined();
    (fs.writeFileSync as any).mockClear();
  });

  it("fails post-issuance validation but still exports the issued token", async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      const defaultHeaders = new Headers({
        "x-drts-candidate-sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      if (url.includes("auth/token")) {
        return {
          ok: true,
          headers: defaultHeaders,
          json: async () => ({ token: "mock-session-token-bad" }),
        };
      }
      if (url.includes("auth/session")) {
        return {
          ok: true,
          headers: defaultHeaders,
          json: async () => ({ data: { active: false } }),
        };
      }
      return { ok: true, headers: defaultHeaders, json: async () => ({}) };
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi
        .fn()
        .mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
      onSessionIssued: vi.fn(),
    };

    await expect(bootstrapMailSession(env, deps, false)).rejects.toThrow(
      /Mail session bootstrap failed; stage=session-validation/,
    );
    expect(deps.appendEnvironment).toHaveBeenCalledWith(
      "/tmp/env",
      expect.stringContaining(
        "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN=mock-session-token-bad",
      ),
    );

    const fs = await import("node:fs");
    const writeCall = (fs.writeFileSync as any).mock.calls.findLast((c: any) =>
      c[0].includes("evidence-bootstrap.json"),
    );
    expect(writeCall).toBeDefined();
    const emittedJson = JSON.parse(writeCall[1]);
    expect(emittedJson.success).toBeUndefined();
    expect(emittedJson.issued_sessions).toEqual(
      expect.arrayContaining([expect.objectContaining({ exportKey: "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN" })])
    );
    (fs.writeFileSync as any).mockClear();
  });

  it("teardown cleans up multiple tokens", async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN: "token1",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN: "token2",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN: "token3",
    };

    const tdFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { revoked: true, logged_out: true } }),
    });

    await teardown(env, tdFetchMock as any);
    expect(tdFetchMock).toHaveBeenCalledTimes(3);
    expect(
      (tdFetchMock.mock.calls[0]?.[1] as any)?.headers?.authorization,
    ).toBe("Bearer token1");
    expect(
      (tdFetchMock.mock.calls[1]?.[1] as any)?.headers?.authorization,
    ).toBe("Bearer token2");
    expect(
      (tdFetchMock.mock.calls[2]?.[1] as any)?.headers?.authorization,
    ).toBe("Bearer token3");
  });

  it("does not leak raw upstream errors to console.error", async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };

    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("SYNTHETIC_UPSTREAM_SECRET_SENTINEL"));

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi
        .fn()
        .mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
    };

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    let caughtError: any;
    try {
      await bootstrapMailSession(env, deps, false);
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain("Mail session bootstrap failed");
    expect(caughtError.message).not.toContain(
      "SYNTHETIC_UPSTREAM_SECRET_SENTINEL",
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("SYNTHETIC_UPSTREAM_SECRET_SENTINEL"),
      }),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("independently validates comma/case/domain allowlist matrix", async () => {
    const baseEnv = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };

    const fetchMock = vi.fn().mockImplementation(async (url) => {
      const defaultHeaders = new Headers({
        "x-drts-candidate-sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      if (url.includes("auth/token")) return { ok: true, headers: defaultHeaders, json: async () => ({ token: "mock-token" }) };
      if (url.includes("auth/session")) return { ok: true, headers: defaultHeaders, json: async () => ({ data: { active: true, identity: { realm: "tenant", actor_type: "tenant_admin", roles: ["tenant_admin"], actor_id: "10000000-0000-0000-0000-000000000901", tenant_id: "10000000-0000-0000-0000-000000000201", scopes: ["tenant:billing:read", "tenant:billing:write"] } } }) };
      if (url.includes("identity/step-up-proofs")) return { ok: true, headers: defaultHeaders, json: async () => ({ data: { required: true, step_up_reference: "mock-step-up-ref", action_id: "tenant:users:create" } }) };
      return { ok: true, headers: defaultHeaders, json: async () => ({}) };
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      assertions: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
    };

    // Matrix
    const cases = [
      { mailbox: "billing@company.com", allowlist: "billing+invoice@company.com", expectPass: true },
      { mailbox: "BiLLing@CoMPaNy.CoM", allowlist: "billing+invoice@company.com", expectPass: true },
      { mailbox: "billing@company.com", allowlist: "BILLING+INVOICE@COMPANY.COM", expectPass: true },
      { mailbox: "billing@company.com", allowlist: "other@company.com, company.com", expectPass: true },
      { mailbox: "billing@company.com", allowlist: "other@company.com", expectPass: false },
      { mailbox: "billing@company.com", allowlist: "other@company.com, another@company.com", expectPass: false },
    ];

    for (const c of cases) {
      const e = { ...baseEnv, DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST: c.allowlist };
      const d = { ...deps, readMailbox: vi.fn().mockReturnValue(c.mailbox) };
      if (c.expectPass) {
        await expect(bootstrapMailSession(e, d, false)).resolves.toBeUndefined();
      } else {
        try {
          await bootstrapMailSession(e, d, false);
          throw new Error("Expected to throw");
        } catch(err: any) {
          expect(err.stage).toBe("recipient-export");
        }
      }
    }
  });

  it("enforces manifest content and teardown artifact correlation/redaction", async () => {
    const fs = await import("node:fs");
    (fs.writeFileSync as any).mockClear();

    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID:
        "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID:
        "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN: "token1",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN: "token_fail",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };
    const tdFetchMock = vi.fn().mockImplementation(async (url, opts) => {
      if (opts.headers?.authorization === "Bearer token1") {
        return {
          ok: true,
          json: async () => ({ data: { revoked: true, logged_out: true } }),
        };
      }
      return { ok: false, status: 500, json: async () => ({ error: "fail" }) };
    });

    try {
      await teardown(env, tdFetchMock as any);
    } catch {
      // Expected partial failure
    }
    expect(tdFetchMock).toHaveBeenCalledTimes(2);

    const writeCall = (fs.writeFileSync as any).mock.calls.find((c: any) =>
      c[0].includes("evidence-teardown.json"),
    );
    const emittedJson = JSON.parse(writeCall[1]);

    expect(emittedJson.success).toBe(false); // partial failure
    expect(emittedJson.runId).toBe("12345");
    expect(emittedJson.candidateSha).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(emittedJson.attempted).toBe(2);
    expect(emittedJson.failures).toBe(1);

    const session1 = emittedJson.sessions.find(
      (s: any) => s.key === "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN",
    );
    expect(session1.status).toBe("success");
    expect(session1.token).toBeUndefined(); // redacted

    const session2 = emittedJson.sessions.find(
      (s: any) => s.key === "DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN",
    );
    expect(session2.status).toBe("failed");
    expect(session2.token).toBeUndefined(); // redacted
  });
});
