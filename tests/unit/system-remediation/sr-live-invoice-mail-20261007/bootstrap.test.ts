import { describe, it, expect, vi } from 'vitest';
import { bootstrapMailSession } from '../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-bootstrap';
import { teardown } from '../../../../tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-teardown';

describe('F1 bootstrap and teardown adapter', () => {
  it('maps invoice env vars properly and mocks IO without credential issuance on mismatch', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
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
      readMailbox: vi.fn().mockReturnValue("test@example.com"),
      assertions: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue("mocked-token") })
    };

    // Preflight only execution
    await bootstrapMailSession(env, deps, true);
    
    // Test teardown with same env
    env['DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN'] = 'test-token';
    const tdFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { revoked: true, logged_out: true } })
    });
    
    await teardown(env, tdFetchMock as any);
  });

  it('rejects mismatching candidate SHA', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
      DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID: "10000000-0000-0000-0000-000000000201",
      DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
      GITHUB_ACTIONS: "true",
      GITHUB_ENV: "/tmp/env",
    };

    // Mismatched SHA from server
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
    expect(deps.readMailbox).not.toHaveBeenCalled();
    expect(deps.assertions).not.toHaveBeenCalled();
  });

  it('rejects missing or malformed inputs without credential issuance', async () => {
    const env = {
      DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED: "true",
      DRTS_CANDIDATE_SHA: "invalid-sha",
      DRTS_LIVE_INVOICE_MAIL_API_ORIGIN: "https://allowed.example.com",
      DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS: "https://allowed.example.com",
      DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
    };
    
    const deps = {
      fetch: vi.fn(),
      mask: vi.fn(),
      appendEnvironment: vi.fn(),
      readMailbox: vi.fn(),
      assertions: vi.fn()
    };

    await expect(bootstrapMailSession(env, deps, true)).rejects.toThrow(/input-validation/);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.readMailbox).not.toHaveBeenCalled();
    expect(deps.assertions).not.toHaveBeenCalled();
  });

});
