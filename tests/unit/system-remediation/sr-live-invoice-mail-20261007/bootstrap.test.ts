import { describe, it, expect, vi } from "vitest";
import { evaluateDownloadResponse } from "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec";
import * as crypto from "crypto";
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

  it("feeds generated session observations into actual gate in a regression", async () => {
    const fs = await import("node:fs");
    const cp = await import("node:child_process");
    const path = await import("node:path");
    const os = await import("node:os");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-regression-"));
    const artifactsDir = path.join(tmpDir, ".artifacts", "live-invoice-mail-acceptance");
    const realMkdirSync = (await vi.importActual("node:fs") as typeof fs).mkdirSync;
    realMkdirSync(artifactsDir, { recursive: true });

    // Mock the actual bootstrap output for a successful case
    const mockEnv = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_RUN_ID: "12345",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: path.join(tmpDir, "env"),
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID: "10000000-0000-0000-0000-000000000202",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_ACTOR_ID: "10000000-0000-0000-0000-000000000902",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID: "10000000-0000-0000-0000-000000000203",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_ACTOR_ID: "10000000-0000-0000-0000-000000000903",
      DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST: "billing+invoice@company.com",
    };

    const tokensMap: Record<string, any> = {};
    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      let parsedBody: any = {};
      try { parsedBody = opts.body ? JSON.parse(opts.body) : {}; } catch { /* ignore */ }
      const defaultHeaders = new Headers({ "x-drts-candidate-sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
      if (url.includes("auth/token")) {
        const tenantId = opts.headers["x-tenant-id"] || parsedBody.tenant_id;
        const actorId = opts.headers["x-actor-id"] || parsedBody.actor_id;
        const isReadOnly = actorId === "10000000-0000-0000-0000-000000000902";
        const expectedRole = isReadOnly ? "tenant_viewer" : "tenant_admin";
        const scopes = isReadOnly ? ["tenant:billing:read"] : ["tenant:billing:read", "tenant:billing:write"];
        const payloadObj = { roles: [expectedRole], scopes, tenantId, sub: actorId };
        const token = "dummy." + Buffer.from(JSON.stringify(payloadObj)).toString("base64") + ".dummy";
        tokensMap[token] = { tenant_id: tenantId, actor_id: actorId };
        return { ok: true, headers: defaultHeaders, json: async () => ({ token }) };
      }
      if (url.includes("auth/session")) {
        const authHeader = opts.headers["authorization"];
        const token = authHeader ? authHeader.split(" ")[1] : "";
        const ctx = tokensMap[token] || { tenant_id: "", actor_id: "" };
        const role = ctx.actor_id === "10000000-0000-0000-0000-000000000902" ? "tenant_viewer" : "tenant_admin";
        const scopes = ctx.actor_id === "10000000-0000-0000-0000-000000000902" ? ["tenant:billing:read"] : ["tenant:billing:read", "tenant:billing:write"];
        return { ok: true, headers: defaultHeaders, json: async () => ({ data: { active: true, identity: { realm: "tenant", actor_type: "tenant_admin", actor_id: ctx.actor_id, tenant_id: ctx.tenant_id, roles: [role], scopes } } }) };
      }
      if (url.includes("identity/step-up-proofs")) {
        return { ok: true, headers: defaultHeaders, json: async () => ({ data: { required: true, step_up_reference: "mock-step-up-ref", action_id: "tenant:users:create" } }) };
      }
      return { ok: true, headers: defaultHeaders, json: async () => ({}) };
    });

    const realWriteFileSync = (await vi.importActual("node:fs") as typeof fs).writeFileSync;

    // We can't easily hook node:fs inside the actual run if we want to run python,
    // so let's just use real node fs to write it to our tmpDir instead of mocking.
    vi.mocked(fs.writeFileSync).mockImplementation((pathStr, data) => {
       const basename = path.basename(pathStr as string);
       realWriteFileSync(path.join(artifactsDir, basename), data);
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
      onSessionIssued: vi.fn(),
    };

    try {
      await bootstrapMailSession(mockEnv, deps, false);
    } catch(err: any) {
      console.error("INNER ERROR:", err.originalError?.message, err.originalError?.stack);
      throw err;
    }
    const tdFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { revoked: true, logged_out: true } }),
    });
    await teardown({
      ...mockEnv,
      DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN: "t1",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN: "t2",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN: "t3"
    }, tdFetchMock as any);

    // Provide the rest of the valid gate files
    const mockPrimaryBody = Buffer.from('%PDF-test');
    const primaryManifestHash = crypto.createHash("sha256").update(mockPrimaryBody).digest("hex");
    const primaryPopupResponse = {
        headers: () => ({ 'content-type': 'application/pdf', 'x-drts-candidate-sha': "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
        body: async () => mockPrimaryBody,
        url: () => `http://portal.invalid/downloads/tenant-invoice/20000000-0000-0000-0000-000000000456?manifest_hash=${primaryManifestHash}&signed_at=2026-10-07T19:00:00.000Z&expires_at=2026-10-07T19:15:00.000Z&key_id=k1&sig_v=1&sig=valid`,
        status: () => 200
    };
    const mockReadOnlyBody = Buffer.from('%PDF-ro');
    const readOnlyManifestHash = crypto.createHash("sha256").update(mockReadOnlyBody).digest("hex");
    const readOnlyPopupResponse = {
        headers: () => ({ 'content-type': 'application/pdf', 'x-drts-candidate-sha': "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
        body: async () => mockReadOnlyBody,
        url: () => `http://portal.invalid/downloads/tenant-invoice/20000000-0000-0000-0000-000000000abc?manifest_hash=${readOnlyManifestHash}&signed_at=2026-10-07T19:00:00.000Z&expires_at=2026-10-07T19:15:00.000Z&key_id=k1&sig_v=1&sig=valid`,
        status: () => 200
    };
    const actualPrimaryProof = await evaluateDownloadResponse(primaryPopupResponse, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", primaryManifestHash, "20000000-0000-0000-0000-000000000456", "10000000-0000-0000-0000-000000000201");
    const actualReadOnlyProof = await evaluateDownloadResponse(readOnlyPopupResponse, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", readOnlyManifestHash, "20000000-0000-0000-0000-000000000abc", "10000000-0000-0000-0000-000000000202");

    const validEvidence = {
      candidateSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "passed", exitCode: 0,
      unimplementedLiveSurfaces: [], errors: [],
      tenantId: "10000000-0000-0000-0000-000000000201", invoiceId: "20000000-0000-0000-0000-000000000456", identityEmail: "a".repeat(64),
      nonAllowlistInvoiceId: "20000000-0000-0000-0000-000000000789", readOnlyInvoiceId: "20000000-0000-0000-0000-000000000abc",
      invoiceData: { data: { tenantId: "10000000-0000-0000-0000-000000000201", invoiceId: "20000000-0000-0000-0000-000000000456", artifactDownloadMetadata: { manifestHash: primaryManifestHash } } },
      roInvoiceData: { data: { tenantId: "10000000-0000-0000-0000-000000000202", invoiceId: "20000000-0000-0000-0000-000000000abc", artifactDownloadMetadata: { manifestHash: readOnlyManifestHash } } },
      resendMailboxEvidence: { matched_content: true, candidate_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", delivery_id: "d2", rfc_message_id: "<d2@notification.drts.invalid>", body_sha256: "a".repeat(64) },
      mailboxEvidence: { matched_content: true, candidate_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", delivery_id: "d1", rfc_message_id: "<d1@notification.drts.invalid>", body_sha256: "a".repeat(64) },
      downloadProof: actualPrimaryProof,
      durableDeliveries: [
        { scenario: "first_send", deliveryId: "d1", idempotencyKey: "k1", acceptedAt: "2026-10-07T00:00:00Z", attemptsCount: 1, status: "sent", attemptOutcome: "sent" },
        { scenario: "intentional_resend", deliveryId: "d2", idempotencyKey: "k2", acceptedAt: "2026-10-07T00:01:00Z", attemptsCount: 1, status: "sent", attemptOutcome: "sent" },
        { scenario: "idempotent_retry", deliveryId: "d1", idempotencyKey: "k1", initialAttemptsCount: 1, afterRetryAttemptsCount: 1, status: "sent" },
        { scenario: "non_allowlisted", deliveryId: "d3", status: "failed", errorCode: "SMTP_RECIPIENT_NOT_ALLOWLISTED", outcome: "failed", acceptedAt: null, retryable: false }
      ],
      durableHistoryCount: 2,
      httpCalls: [
        { path: "tenant/billing/profile", method: "GET", status: 200 },
        { path: "/api/tenant/invoices/20000000-0000-0000-0000-000000000456", method: "GET", status: 200 },
        { path: "artifactUrl", method: "GET", status: 200 },
        { path: "wrong_tenant_portal", method: "GET", status: 404, ui_isolated: true, selected_identity: "20000000-0000-0000-0000-000000000789", forbidden_resource: "20000000-0000-0000-0000-000000000456", mutation_count: 0, forbidden_download_observed: false },
        { path: "read_only_portal", method: "GET", status: 200, ui_readonly: true, selected_identity: "20000000-0000-0000-0000-000000000abc", mutation_count: 0, send_disabled: true, forbidden_download_observed: false, download_proof: actualReadOnlyProof },
        { path: "bad_sig_api", method: "GET", status: 403 },
        { path: "/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail", method: "POST", scenario: "normal_send", status: 201, delivery_id: "d1" },
        { path: "/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail", method: "POST", scenario: "idempotent_retry", status: 201, delivery_id: "d1" },
        { path: "/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail", method: "POST", scenario: "intentional_resend", status: 201, delivery_id: "d2" },
        { path: "/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail", scenario: "durable_get", method: "GET", status: 200 },
        { scenario: "wrong_tenant", method: "POST", status: 403 },
        { scenario: "wrong_invoice", method: "POST", status: 403 },
        { scenario: "read_only", method: "POST", status: 403 },
        { scenario: "non_allowlisted", method: "POST", status: 201, delivery_id: "d3" }
      ],
      trackedResources: [{ type: "provider_receipt", id: "test" }]
    };
    realWriteFileSync(path.join(artifactsDir, "evidence-mail.json"), JSON.stringify(validEvidence));
    realWriteFileSync(path.join(artifactsDir, "evidence-provider.json"), JSON.stringify({ candidate_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", alias_revision_fresh: true }));

    const gatePath = path.resolve(__dirname, "../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/gate-evidence.py");
    const gateEnv = {
      ...process.env,
      GITHUB_RUN_ID: "12345",
      CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      WORKFLOW_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      BASE_SHA: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      DEPLOYMENT_GUARD_OUTCOME: "success", SESSION_GUARD_OUTCOME: "success", INSTALL_OUTCOME: "success",
      PREFLIGHT_OUTCOME: "success", RESOURCES_OUTCOME: "success", SESSIONS_OUTCOME: "success",
      RUNNER_OUTCOME: "success", TEARDOWN_OUTCOME: "success",
      DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID: "20000000-0000-0000-0000-000000000456",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_INVOICE_ID: "20000000-0000-0000-0000-000000000789",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_INVOICE_ID: "20000000-0000-0000-0000-000000000abc",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID: "10000000-0000-0000-0000-000000000203",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID: "10000000-0000-0000-0000-000000000202",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_ACTOR_ID: "10000000-0000-0000-0000-000000000902",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_ACTOR_ID: "10000000-0000-0000-0000-000000000903",
      DRTS_LIVE_INVOICE_MAIL_PORTAL_ORIGIN: "http://portal.invalid"
    };

    try {
      cp.execSync(`python3 ${gatePath}`, { env: gateEnv, cwd: tmpDir });
    } catch (e: any) {
      console.error("GATE FAILURE STDOUT:", e.stdout?.toString());
      console.error("GATE FAILURE STDERR:", e.stderr?.toString());
    }
    const runStatusStr = fs.readFileSync(path.join(artifactsDir, "run-status.json"), "utf8");
    const runStatus = JSON.parse(runStatusStr);
    if (runStatus.status !== "passed") {
      console.error("GATE FAILURE STATUS:", runStatusStr);
    }
    expect(runStatus.status).toBe("passed");
  });
});
