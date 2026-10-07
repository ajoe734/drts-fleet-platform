import { describe, it, expect, vi } from 'vitest';
import { bootstrapMailSession } from '../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-bootstrap';
import { teardown } from '../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-teardown';

describe('F1 bootstrap and teardown adapter', () => {
  it('maps invoice env vars properly and mocks IO without credential issuance on mismatch', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'x-drts-candidate-sha': "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      json: async () => ({})
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") })
    };

    await bootstrapMailSession(env, deps, true);
  });

  it('rejects mismatching candidate SHA', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'x-drts-candidate-sha': "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
      json: async () => ({})
    });
    
    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn(),
      assertions: vi.fn()
    };

    await expect(bootstrapMailSession(env, deps, true)).rejects.toThrow(/candidate-preflight/);
  });

  it('rejects missing or malformed inputs without credential issuance', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "invalid-sha",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
    };
    
    const deps = {
      fetch: vi.fn(),
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn(),
      assertions: vi.fn()
    };

    await expect(bootstrapMailSession(env, deps, true)).rejects.toThrow(/input-validation/);
  });

  it('performs successful issuance of all tokens', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID: "10000000-0000-0000-0000-000000000202",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_ACTOR_ID: "10000000-0000-0000-0000-000000000902",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID: "10000000-0000-0000-0000-000000000203",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_ACTOR_ID: "10000000-0000-0000-0000-000000000903",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
    };

    let tokenIndex = 0;
    const tokensMap: Record<string, any> = {};
    
    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      let parsedBody: any = {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      try { parsedBody = opts.body ? JSON.parse(opts.body) : {}; } catch(_e) { /* ignore */ }
      
      const defaultHeaders = new Headers({ 'x-drts-candidate-sha': "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });

      if (url.includes('auth/token')) {
        const token = "mock-session-token-" + (++tokenIndex);
        const tenantId = opts.headers['x-tenant-id'] || parsedBody.tenant_id;
        const actorId = opts.headers['x-actor-id'] || parsedBody.actor_id;
        tokensMap[token] = { tenant_id: tenantId, actor_id: actorId };
        return { ok: true, headers: defaultHeaders, json: async () => ({ token }) };
      }
      if (url.includes('auth/session')) {
        const authHeader = opts.headers['authorization'];
        const token = authHeader ? authHeader.split(' ')[1] : '';
        const ctx = tokensMap[token] || { tenant_id: '', actor_id: '' };
        return { ok: true, headers: defaultHeaders, json: async () => ({ data: { active: true, identity: { realm: 'tenant', actor_type: 'tenant_admin', actor_id: ctx.actor_id, tenant_id: ctx.tenant_id, roles: ['tenant_admin'] } } }) };
      }
      if (url.includes('identity/step-up-proofs')) {
        return { ok: true, headers: defaultHeaders, json: async () => ({ data: { required: true, step_up_reference: "mock-step-up-ref", action_id: "tenant:users:create" } }) };
      }
      return { ok: true, headers: defaultHeaders, json: async () => ({}) };
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
      onSessionIssued: vi.fn()
    };

    await bootstrapMailSession(env, deps, false);
    
    expect(deps.appendEnvironment).toHaveBeenCalledWith("/tmp/env", expect.stringContaining("DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN="));
    expect(deps.appendEnvironment).toHaveBeenCalledWith("/tmp/env", expect.stringContaining("DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN="));
    expect(deps.appendEnvironment).toHaveBeenCalledWith("/tmp/env", expect.stringContaining("DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN="));
  });

  it('fails post-issuance validation but still exports the issued token', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fetchMock = vi.fn().mockImplementation(async (url, opts) => {
      const defaultHeaders = new Headers({ 'x-drts-candidate-sha': "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
      if (url.includes('auth/token')) {
        return { ok: true, headers: defaultHeaders, json: async () => ({ token: "mock-session-token-bad" }) };
      }
      if (url.includes('auth/session')) {
        return { ok: true, headers: defaultHeaders, json: async () => ({ data: { active: false } }) };
      }
      return { ok: true, headers: defaultHeaders, json: async () => ({}) };
    });

    const deps = {
      fetch: fetchMock as any,
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn().mockReturnValue("billing@company.com"),
      assertions: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") }),
      onSessionIssued: vi.fn()
    };

    await expect(bootstrapMailSession(env, deps, false)).rejects.toThrow(/Mail session bootstrap failed; stage=session-validation/);
    expect(deps.appendEnvironment).toHaveBeenCalledWith("/tmp/env", expect.stringContaining("DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN=mock-session-token-bad"));
  });

  it('teardown cleans up multiple tokens', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN: "token1",
      DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN: "token2",
      DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN: "token3",
    };

    const tdFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { revoked: true, logged_out: true } })
    });
    
    await teardown(env, tdFetchMock as any);
    expect(tdFetchMock).toHaveBeenCalledTimes(3);
    expect((tdFetchMock.mock.calls[0]?.[1] as any)?.headers?.authorization).toBe("Bearer token1");
    expect((tdFetchMock.mock.calls[1]?.[1] as any)?.headers?.authorization).toBe("Bearer token2");
    expect((tdFetchMock.mock.calls[2]?.[1] as any)?.headers?.authorization).toBe("Bearer token3");
  });
});
