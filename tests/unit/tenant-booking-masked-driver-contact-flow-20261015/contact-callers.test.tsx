// @vitest-environment jsdom
import React, { act } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sdk from "../../../packages/api-client/src";
import * as contracts from "../../../packages/contracts/src";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import { availablePort, harness } from "./fixture";
import { signedTransport } from "./transport";

type Proxy = {
  GET: (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> },
  ) => Promise<Response>;
};
const app = resolve(process.cwd(), "apps/enterprise-dispatch-web");
let root: Root | undefined;
let transport: Awaited<ReturnType<typeof signedTransport>>;
let load: ReturnType<typeof createUiModuleLoader>;
let container: HTMLDivElement;
let dials: string[];
beforeEach(() => {
  vi.stubEnv("DRTS_ENV", "production");
  vi.stubEnv("JWT_SECRET", "contact-fixture-signing-key-not-a-provider-secret");
  vi.stubEnv("DRTS_API_URL", "http://api.contact.test");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dials = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    dials.push(this.href);
  });
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function setup() {
  const port = availablePort();
  const x = harness(port);
  load = createUiModuleLoader(app, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/api-client": sdk,
    "@drts/contracts": contracts,
    "next/headers": { cookies: () => transport.cookies() },
    "next/link": {
      __esModule: true,
      default: ({
        href,
        children,
        ...props
      }: {
        href: string;
        children: React.ReactNode;
      }) => React.createElement("a", { href, ...props }, children),
    },
    "../../components/enterprise-shell": { EntPageHead: () => null },
    "../../components/enterprise-state-page": {
      EnterpriseGatePage: ({ kind }: { kind: string }) =>
        React.createElement("div", {
          "data-testid": `enterprise-gate-${kind}`,
        }),
    },
    "../../components/ent-screen-bits": {
      EntProgressRail: () => null,
      EntRoute: () => null,
    },
  });
  const proxy = load<Proxy>(
    resolve(app, "app/control-plane-proxy/[...path]/route.ts"),
  );
  transport = await signedTransport(x, proxy);
  vi.stubGlobal("fetch", vi.fn(transport.fetcher));
  return { x, port, proxy };
}
async function mountTrip() {
  const page = load<{ default: () => Promise<React.ReactNode> }>(
    resolve(app, "app/trip/page.tsx"),
  );
  // Next executes this server page without window, then hydrates its action.
  const browserWindow = globalThis.window;
  let markup: React.ReactNode;
  vi.stubGlobal("window", undefined);
  try {
    markup = await page.default();
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
  root = createRoot(container);
  await act(async () => root!.render(markup));
  const button = container.querySelector<HTMLButtonElement>(
    '[data-testid="enterprise-trip-contact-driver"]',
  );
  if (!button)
    throw new Error(
      `Mounted Trip missing action: ${container.innerHTML}; failures=${transport.failures.join("|")}; paths=${transport.requests.map((r) => r.path).join("|")}`,
    );
  return button;
}
describe("actual Trip/local client/signed BFF/canonical contact", () => {
  it("permits the real contact leaf through signed BFF under existing tenant:read", async () => {
    const { proxy, port } = await setup();
    const response = await proxy.GET(
      new NextRequest(
        "http://enterprise.contact.test/control-plane-proxy/api/tenant/bookings/contact-booking/driver-contact",
        {
          headers: {
            cookie: `drts_tenant_session=${transport.token}`,
            "x-actor-id": "spoofed",
            "x-realm": "platform",
          },
        },
      ),
      {
        params: Promise.resolve({
          path: [
            "api",
            "tenant",
            "bookings",
            "contact-booking",
            "driver-contact",
          ],
        }),
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.bookingId).toBe("contact-booking");
    expect(port.createSession).toHaveBeenCalledOnce();
    const headers = transport.requests.at(-1)!.headers;
    expect(headers.get("authorization")).toMatch(/^Bearer /);
    expect(headers.get("x-actor-id")).toBeNull();
    expect(headers.get("x-realm")).toBeNull();
  });
  it.each(["zh", "en"])(
    "mounts the real Trip action and dials only a freshly resolved current proxy (%s)",
    async (locale) => {
      const { port, x } = await setup();
      transport.locale = locale;
      const button = await mountTrip();
      expect(button).not.toBeNull();
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(dials).toEqual(["tel:+886200000001,,123"]);
      expect(container.textContent).toContain(
        locale === "en" ? "masked number" : "遮罩號碼",
      );
      x.assignments = [
        {
          ...x.assignments[0]!,
          assignmentId: "current-replacement",
          driverId: "current-driver",
        },
      ];
      await act(async () => button.click());
      expect(port.createSession.mock.calls.at(-1)?.[0]).toMatchObject({
        assignmentId: "current-replacement",
        driverId: "current-driver",
      });
      expect(dials).toHaveLength(2);
      expect(
        container.querySelector('a[href="tel:+886200000001,,123"]'),
      ).toBeNull();
      expect(
        container.querySelector(
          '[data-testid="enterprise-trip-contact-support"]',
        ),
      ).not.toBeNull();
    },
  );
  it.each(["zh", "en"])(
    "clearly labels configured support fallback and never dials it as driver (%s)",
    async (locale) => {
      const { port } = await setup();
      transport.locale = locale;
      port.createSession.mockRejectedValue(new Error("private-driver-leg"));
      vi.stubEnv("MULTI_TAXI_SUPPORT_TEL_URI", "tel:+886200000099");
      const button = await mountTrip();
      await act(async () => button.click());
      const link = container.querySelector<HTMLAnchorElement>(
        '[data-testid="enterprise-driver-contact-support-fallback"]',
      )!;
      expect(link.href).toBe("tel:+886200000099");
      expect(link.textContent).toBe(
        locale === "en" ? "Enterprise support" : "企業客服",
      );
      expect(dials).toEqual([]);
      expect(container.textContent).not.toContain("private-driver-leg");
    },
  );
  it("clears expired contact, refreshes on focus and permits a new current option", async () => {
    const { port } = await setup();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    port.createSession.mockImplementation(async () => ({
      contactUri: "tel:+886200000001",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      providerName: "SIM",
    }));
    const button = await mountTrip();
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTime(1001));
    expect(container.textContent).toContain("到期");
    await act(async () => button.click());
    expect(dials).toHaveLength(2);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(
      container.querySelector(
        '[data-testid="enterprise-driver-contact-state"]',
      ),
    ).toBeNull();
  });
  it("shows real terminal/no-driver refusal and allows retry after a legitimate assignment", async () => {
    const { x } = await setup();
    const assignment = x.assignments[0]!;
    x.assignments = [];
    const button = await mountTrip();
    await act(async () => button.click());
    expect(container.textContent).toContain("尚無可聯絡");
    expect(dials).toHaveLength(0);
    x.assignments = [assignment];
    await act(async () => button.click());
    expect(dials).toHaveLength(1);
    x.order!.status = "cancelled";
    await act(async () => button.click());
    expect(dials).toHaveLength(1);
  });
  it.each(["zh", "en"])(
    "shows unavailable/error honestly and recovers with the actual port (%s)",
    async (locale) => {
      const { port } = await setup();
      transport.locale = locale;
      const button = await mountTrip();
      vi.spyOn(port, "isAvailable").mockReturnValueOnce(false);
      await act(async () => button.click());
      expect(dials).toEqual([]);
      expect(container.textContent).toContain(
        locale === "en" ? "unavailable" : "無法使用",
      );
      port.createSession.mockRejectedValueOnce(new Error("private-driver-leg"));
      await act(async () => button.click());
      expect(dials).toEqual([]);
      expect(container.textContent).not.toContain("private-driver-leg");
      expect(container.textContent).toContain(
        locale === "en" ? "temporarily unavailable" : "暫時無法",
      );
      await act(async () => button.click());
      expect(dials).toHaveLength(1);
    },
  );
  it("keeps loading honest and discards a pending option after refresh", async () => {
    const { port } = await setup();
    let finish!: (
      value: Awaited<ReturnType<typeof port.createSession>>,
    ) => void;
    port.createSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const button = await mountTrip();
    await act(async () => button.click());
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain("正在取得");
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () =>
      finish({
        contactUri: "tel:+886200000001,,old",
        expiresAt: new Date(Date.now() + 10000).toISOString(),
        providerName: "controlled-SIM",
      }),
    );
    expect(dials).toEqual([]);
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(dials).toEqual(["tel:+886200000001,,123"]);
  });
  it("renders actual denial and missing-booking errors without a fake contact", async () => {
    const { x, port } = await setup();
    const button = await mountTrip();
    x.order = null;
    await act(async () => button.click());
    expect(container.textContent).toContain("預約已不存在");
    await transport.jwt.revokeCurrentSession(transport.issued.sessionId);
    await act(async () => button.click());
    expect(container.textContent).toContain("重新登入");
    expect(dials).toEqual([]);
    expect(port.createSession).not.toHaveBeenCalled();
  });
  it.each(["completed", "cancelled"])(
    "clears prior option on a %s lifecycle update",
    async (status) => {
      const { port } = await setup();
      await mountTrip();
      const { DriverContactAction } = load<{
        DriverContactAction: React.ComponentType<{
          bookingId: string;
          status: string;
          locale: "zh";
        }>;
      }>(resolve(app, "app/trip/driver-contact-action.tsx"));
      await act(async () =>
        root!.render(
          React.createElement(DriverContactAction, {
            bookingId: "contact-booking",
            status,
            locale: "zh",
          }),
        ),
      );
      const button = container.querySelector<HTMLButtonElement>(
        '[data-testid="enterprise-trip-contact-driver"]',
      )!;
      expect(button.disabled).toBe(true);
      expect(container.textContent).toContain("行程結束");
      await act(async () => button.click());
      expect(port.createSession).not.toHaveBeenCalled();
      expect(dials).toEqual([]);
    },
  );
  it.each([
    "missing",
    "revoked",
    "expired",
    "wrong-realm",
    "wrong-scope",
    "wrong-tenant",
  ])("refuses %s signed identity without provider action", async (kind) => {
    const { port } = await setup();
    if (kind === "missing") transport.token = undefined;
    if (kind === "revoked")
      await transport.jwt.revokeCurrentSession(transport.issued.sessionId);
    if (kind === "expired")
      transport.token = (await transport.issue({}, "0s")).token;
    if (kind === "wrong-realm")
      transport.token = (
        await transport.issue({ realm: "ops", actorType: "ops_user" })
      ).token;
    if (kind === "wrong-scope")
      transport.token = (await transport.issue({ scopes: [] })).token;
    if (kind === "wrong-tenant")
      transport.token = (
        await transport.issue({ tenantId: "foreign-tenant" })
      ).token;
    const client = load<{
      getEnterpriseDispatchTenantClient: (tenant: string) => {
        getDriverContact: (id: string) => Promise<unknown>;
      };
    }>(resolve(app, "lib/api-client.ts")).getEnterpriseDispatchTenantClient("");
    await expect(
      client.getDriverContact("contact-booking"),
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });
    expect(port.createSession).not.toHaveBeenCalled();
  });
});
