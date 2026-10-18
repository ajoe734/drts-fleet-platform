// @vitest-environment jsdom
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type {
  CreateTenantWebhookEndpointCommand,
  UpdateTenantWebhookEndpointCommand,
} from "@drts/contracts";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";
import WebhooksPage from "../../../apps/tenant-console-web/app/webhooks/page";
import { LanguageProvider } from "../../../apps/tenant-console-web/lib/i18n";
import { persistenceHarness } from "./persistence-harness";
import { signedIdentity } from "./route-harness";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  revalidate: vi.fn(),
  receipts: new Map<string, string>(),
}));
vi.mock("@/lib/api-client", () => ({ getTenantClient: mocks.client }));
vi.mock("@/lib/server-locale", () => ({ getServerLocale: async () => "en" }));
// Retain Next's actual throwing redirect implementation, including its digest.
vi.mock("next/navigation", async () => ({
  ...(await import("next/dist/client/components/redirect")),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: mocks.receipts.get(name) }),
    set: (name: string, value: string) => mocks.receipts.set(name, value),
  }),
}));

class RedirectBoundary extends Component<
  { children: ReactNode; onRedirect: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onRedirect(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const tenantId = "tenant-webhooks-page";
const services: TenantPartnerService[] = [];
beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", "webhooks-page-unit-only");
  vi.stubEnv("JWT_ISSUER", "drts-tests");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
  mocks.revalidate.mockClear();
  mocks.receipts.clear();
});
afterEach(() => {
  cleanup();
  for (const service of services.splice(0)) service.onModuleDestroy();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function harness(kind: string) {
  const persistence = persistenceHarness();
  const fetcher = vi.fn(async () => ({ ok: true, status: 204 }));
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    persistence.repository,
    new WebhookDispatchService(fetcher),
  );
  services.push(service);
  const jwt = new JwtAuthService();
  const identity = jwt.toRequestIdentity(
    jwt.verify(signedIdentity(jwt, tenantId))!,
  );
  let webhookId = "";
  let deliveryId = "";
  if (kind !== "create") {
    const endpoint = await service.createWebhookEndpoint(tenantId, {
      url: "https://receiver.example.test/hook",
      secret: "original-hook-secret",
      events: ["dispatch.assigned"],
    });
    webhookId = endpoint.webhookId;
    await service.sendTestWebhook(tenantId, { webhookId });
    if (kind === "retry") {
      fetcher.mockResolvedValueOnce({ ok: false, status: 410 });
      const failed = await service.sendTestWebhook(tenantId, { webhookId });
      deliveryId = failed!.deliveryId;
    }
  }
  // SDK/network boundary only. Real page actions, command validation, durable
  // repository and verification run unchanged. SQL/fetch ports do not listen.
  const client = {
    getIdentityContext: async () => identity,
    getTenantIntegrationGovernancePackage: async () =>
      service.getIntegrationGovernancePackage(tenantId, identity),
    listTenantNotificationFeed: async () => [],
    listWebhooks: async () =>
      service.listWebhookEndpoints(tenantId, undefined, identity),
    get: async (path: string) => {
      if (path === "/api/tenant/webhooks/deliveries")
        return {
          items: service.listWebhookDeliveries(tenantId, undefined, identity),
        };
      return { items: [] };
    },
    createWebhookEndpoint: vi.fn((body: CreateTenantWebhookEndpointCommand) =>
      service.createWebhookEndpoint(tenantId, body),
    ),
    updateWebhookEndpoint: vi.fn(
      (id: string, body: UpdateTenantWebhookEndpointCommand) =>
        service.updateWebhookEndpoint(tenantId, id, body),
    ),
    disableWebhookEndpoint: vi.fn((id: string, body: { reason: string }) =>
      service.updateWebhookEndpoint(tenantId, id, {
        status: "disabled",
        disableReason: body.reason,
      }),
    ),
    deleteWebhookEndpoint: vi.fn((id: string, body: { reason: string }) =>
      service.deleteWebhookEndpoint(tenantId, id, body),
    ),
    post: vi.fn(
      (
        path: string,
        options: { body: { secret: string; rotationReason?: string } },
      ) =>
        service.rotateWebhookSecret(tenantId, {
          webhookId: decodeURIComponent(path.split("/")[4]!),
          ...options.body,
        }),
    ),
    sendTestWebhook: vi.fn((body: { webhookId: string }) =>
      service.sendTestWebhook(tenantId, body),
    ),
    retryWebhookDelivery: vi.fn((id: string, delivery: string) =>
      service.retryWebhookDelivery(tenantId, id, delivery, undefined, identity),
    ),
  };
  mocks.client.mockResolvedValue(client);
  return { persistence, service, client, webhookId, deliveryId };
}

async function mount(params: Record<string, string>) {
  cleanup();
  const caught = vi.fn();
  const page = await WebhooksPage({ searchParams: Promise.resolve(params) });
  const view = render(
    <RedirectBoundary onRedirect={caught}>
      <LanguageProvider defaultLocale="en">{page}</LanguageProvider>
    </RedirectBoundary>,
    { onCaughtError: () => {} },
  );
  if (caught.mock.calls.length) throw caught.mock.calls[0]![0];
  return { ...view, caught };
}

const cases = [
  ["create", "createWebhookEndpoint", "Create endpoint", "create"],
  ["edit", "updateWebhookEndpoint", "Save changes", "edit"],
  ["disable", "disableWebhookEndpoint", "Save changes", "edit"],
  ["delete", "deleteWebhookEndpoint", "Delete endpoint", "edit"],
  ["rotate", "post", "Rotate secret", "rotate"],
  ["retest", "sendTestWebhook", "send test", "overview"],
  ["retry", "retryWebhookDelivery", "retry failed", "overview"],
] as const;

async function prepare(kind: string, buttonLabel: string, mode: string) {
  const h = await harness(kind);
  const view = await mount({
    mode,
    webhookId: h.webhookId,
    deliveryId: h.deliveryId,
  });
  const button = screen
    .getAllByRole("button", {
      name: buttonLabel,
      exact: true,
    })
    .find((item) => !(item as HTMLButtonElement).disabled)!;
  expect((button as HTMLButtonElement).disabled).toBe(false);
  const form = button.closest("form")!;
  expect(form).toBeTruthy();
  const set = (name: string, value: string) => {
    const field = form.querySelector(`[name="${name}"]`)!;
    fireEvent.change(field, { target: { value } });
  };
  if (kind === "create") {
    set("url", "https://receiver.example.test/new-hook");
    set("secret", "created-hook-secret");
    fireEvent.click(
      form.querySelector('input[name="events"][value="dispatch.assigned"]')!,
    );
  }
  if (kind === "edit") set("url", "https://receiver.example.test/edited-hook");
  if (kind === "disable") {
    set("status", "disabled");
    set("disableReason", "Operator maintenance");
  }
  if (kind === "delete") set("deleteReason", "Operator removal");
  if (kind === "rotate") {
    set("secret", "rotated-hook-secret");
    set("rotationReason", "Operator rotation");
  }
  return { ...h, ...view, form };
}

async function redirected(h: Awaited<ReturnType<typeof prepare>>) {
  fireEvent.submit(h.form);
  await waitFor(() => expect(h.caught).toHaveBeenCalledOnce());
  const error = h.caught.mock.calls[0]![0];
  expect(isRedirectError(error)).toBe(true);
  return new URL(
    getURLFromRedirectError(error)!,
    "https://tenant.example.test",
  );
}

describe("WebhooksPage mounted server actions preserve Next redirect control flow", () => {
  it.each(cases)(
    "%s succeeds after durable ACK and renders success/readback",
    async (kind, method, label, mode) => {
      const h = await prepare(kind, label, mode);
      const target = await redirected(h);
      expect(h.client[method]).toHaveBeenCalledOnce();
      expect(mocks.revalidate).toHaveBeenCalledWith("/webhooks");
      expect(target.searchParams.get("error")).toBeNull();
      expect(target.searchParams.get("success")).toBeTruthy();
      const state = await h.persistence.repository.loadState();
      const endpoint = state.webhookEndpoints.find(
        (item) => kind === "create" || item.webhookId === h.webhookId,
      )!;
      if (kind === "create")
        expect(endpoint).toMatchObject({
          url: "https://receiver.example.test/new-hook",
          status: "test_pending",
        });
      if (kind === "edit")
        expect(endpoint).toMatchObject({
          url: "https://receiver.example.test/edited-hook",
          status: "test_pending",
        });
      if (kind === "disable") expect(endpoint.status).toBe("disabled");
      if (kind === "delete")
        expect(h.service.listWebhookEndpoints(tenantId)).toHaveLength(0);
      if (kind === "rotate") {
        expect(endpoint.secretVersion).toBe(2);
        expect(target.searchParams.get("revealSecret")).toBe("1");
        const receipt = JSON.parse(
          Buffer.from(
            mocks.receipts.get("tenant-webhook-rotate-receipt")!,
            "base64url",
          ).toString("utf8"),
        );
        expect(receipt).toMatchObject({
          webhookId: h.webhookId,
          secret: "rotated-hook-secret",
          secretVersion: 2,
        });
      }
      if (kind === "retest") expect(endpoint.status).toBe("active");
      if (kind === "retry")
        expect(
          state.webhookDeliveries.find(
            (item) => item.deliveryId === h.deliveryId,
          )?.status,
        ).toBe("delivered");
      await mount(Object.fromEntries(target.searchParams));
      expect(
        screen.getAllByText(target.searchParams.get("success")!).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText("NEXT_REDIRECT")).toBeNull();
    },
  );

  it.each(cases)(
    "%s keeps genuine API rejection on the error route without success effects",
    async (kind, method, label, mode) => {
      const h = await prepare(kind, label, mode);
      const before = await h.persistence.repository.loadState();
      h.client[method].mockRejectedValueOnce(new Error("API write rejected"));
      const target = await redirected(h);
      expect(target.searchParams.get("error")).toBe("API write rejected");
      expect(target.searchParams.get("success")).toBeNull();
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.receipts.size).toBe(0);
      expect(await h.persistence.repository.loadState()).toEqual(before);
      await mount(Object.fromEntries(target.searchParams));
      expect(screen.getByText("API write rejected")).toBeTruthy();
    },
  );

  it("does not redirect or revalidate a create before the real repository command ACK", async () => {
    const h = await prepare("create", "Create endpoint", "create");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.persistence.holdCommit(() => gate);
    fireEvent.submit(h.form);
    try {
      await waitFor(() =>
        expect(
          h.persistence.query.mock.calls.some(([sql]) => sql === "COMMIT"),
        ).toBe(true),
      );
      expect(h.caught).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(h.service.listWebhookEndpoints(tenantId)).toHaveLength(0);
    } finally {
      release();
    }
    await waitFor(() => expect(h.caught).toHaveBeenCalledOnce());
    const target = new URL(
      getURLFromRedirectError(h.caught.mock.calls[0]![0])!,
      "https://tenant.example.test",
    );
    expect(target.searchParams.get("error")).toBeNull();
    expect(target.searchParams.get("success")).toBeTruthy();
  });
});
