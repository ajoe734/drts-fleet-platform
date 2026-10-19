// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IdentityContext } from "@drts/contracts";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { signedIdentity, invokeRoute } from "./route-harness";
import ApiKeysPage from "../../../apps/tenant-console-web/app/api-keys/page";
import {
  issueTenantApiKeyAction,
  rotateTenantApiKeyAction,
  revokeTenantApiKeyAction,
} from "../../../apps/tenant-console-web/app/api-keys/actions";
import { LanguageProvider } from "../../../apps/tenant-console-web/lib/i18n";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  router: { refresh: vi.fn() },
}));
vi.mock("@/lib/api-client", () => ({ getTenantClient: mocks.client }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", "tenant-api-key-authority-unit-only");
  vi.stubEnv("JWT_ISSUER", "drts-tests");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function harness(role: string, existing: boolean) {
  const tenantId = "tenant-api-key-projection";
  const service = new TenantPartnerService(new AuditNotificationService());
  const jwt = new JwtAuthService();
  const controller = new TenantPartnerController(
    service,
    {} as never,
    {} as never,
    jwt,
    {} as never,
  );
  const token = signedIdentity(jwt, tenantId, role);
  const identity = jwt.toRequestIdentity(jwt.verify(token)!) as IdentityContext;
  if (existing)
    await service.issueApiKey(tenantId, {
      keyName: "Existing masked key",
      scopes: ["tenant:read"],
    });
  const call = async (
    handler: keyof TenantPartnerController,
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ) => {
    const result = (await invokeRoute(controller, jwt, handler, {
      token,
      tenantId,
      method,
      url: `/api/tenant/api-keys${path}`,
      body,
      ...(params ? { params } : {}),
    })) as { data: unknown };
    return result.data;
  };
  const client = {
    listApiKeys: async () => service.listApiKeys(tenantId, identity),
    getTenantIntegrationGovernancePackage: async () =>
      service.getIntegrationGovernancePackage(tenantId, identity),
    getIdentityContext: async () => identity,
    issueApiKey: vi.fn((body: unknown) =>
      call("issueApiKey", "POST", "", body),
    ),
    rotateApiKey: vi.fn((apiKeyId: string, body: unknown) =>
      call("rotateApiKey", "POST", `/${apiKeyId}/rotate`, body, { apiKeyId }),
    ),
    revokeApiKey: vi.fn((apiKeyId: string, body: unknown) =>
      call("revokeApiKey", "POST", `/${apiKeyId}/revoke`, body, { apiKeyId }),
    ),
  };
  mocks.client.mockResolvedValue(client);
  return { service, tenantId, client, identity };
}

describe("C008 mounted API-key page uses the issued identity's operation authority", () => {
  it.each(["tenant_viewer", "tenant_finance_admin"])(
    "%s keeps masked inventory/governance while disabling issue without keys and issue/rotate/revoke with keys",
    async (role) => {
      for (const existing of [false, true]) {
        const h = await harness(role, existing);
        try {
          expect(h.identity.actorType).toBe("tenant_admin");
          expect(h.identity.scopes).not.toContain("tenant:write");
          const page = await ApiKeysPage();
          const view = render(
            <LanguageProvider defaultLocale="en">{page}</LanguageProvider>,
          );
          for (const action of page.props.availableActions)
            expect(action).toMatchObject({
              enabled: false,
              disabledReasonCode: "permission_denied",
            });
          const issueButton = screen
            .getAllByRole("button")
            .find((button) =>
              /issue/i.test(button.textContent ?? ""),
            ) as HTMLButtonElement;
          expect(issueButton).toBeTruthy();
          expect(issueButton.disabled).toBe(true);
          fireEvent.click(issueButton);
          expect(h.client.issueApiKey).not.toHaveBeenCalled();
          if (existing)
            expect(
              screen.getAllByText("Existing masked key").length,
            ).toBeGreaterThan(0);
          expect(page.props.governance).toBeTruthy();
          const key = h.service.listApiKeys(h.tenantId)[0];
          await expect(
            h.client.issueApiKey({
              keyName: "Denied",
              scopes: ["tenant:read"],
            }),
          ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
          if (key) {
            await expect(
              h.client.rotateApiKey(key.apiKeyId, { scopes: ["tenant:read"] }),
            ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
            await expect(
              h.client.revokeApiKey(key.apiKeyId, { reason: "denied" }),
            ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
          }
          view.unmount();
        } finally {
          h.service.onModuleDestroy();
        }
      }
    },
  );

  it("authorized manager retains the actual issue, rotate and revoke server-action/controller flows", async () => {
    const h = await harness("tenant_admin", false);
    try {
      const issue = new FormData();
      issue.set("keyName", "Managed key");
      issue.set("scopes", "tenant:read");
      const issued = await issueTenantApiKeyAction(issue);
      expect(issued.plaintextKey).toBeTruthy();
      const key = h.service.listApiKeys(h.tenantId)[0]!;
      const page = await ApiKeysPage();
      expect(
        page.props.availableActions.every(
          (action: { enabled: boolean }) => action.enabled,
        ),
      ).toBe(true);
      render(<LanguageProvider defaultLocale="en">{page}</LanguageProvider>);
      expect(screen.getAllByText("Managed key").length).toBeGreaterThan(0);
      const rotate = new FormData();
      rotate.set("apiKeyId", key.apiKeyId);
      rotate.set("scopes", "tenant:read");
      rotate.set("keyName", "Rotated manager key");
      expect(
        (await rotateTenantApiKeyAction(rotate)).plaintextKey,
      ).toBeTruthy();
      const rotated = h.service
        .listApiKeys(h.tenantId)
        .find((item) => item.apiKeyId !== key.apiKeyId)!;
      const revoke = new FormData();
      revoke.set("apiKeyId", rotated.apiKeyId);
      revoke.set("keyName", rotated.keyName);
      revoke.set("reason", "Manager lifecycle test");
      const revoked = await revokeTenantApiKeyAction(revoke);
      expect(revoked.tone).toBe("default");
      expect(
        h.service
          .listApiKeys(h.tenantId)
          .find((item) => item.apiKeyId === rotated.apiKeyId)?.status,
      ).toBe("revoked");
    } finally {
      h.service.onModuleDestroy();
    }
  });
});
