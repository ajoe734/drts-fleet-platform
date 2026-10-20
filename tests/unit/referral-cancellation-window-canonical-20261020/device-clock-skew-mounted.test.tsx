// @vitest-environment jsdom
type CancellationTestPorts = {
  session: () => Promise<unknown>;
  headers: (session: unknown) => Promise<Record<string, string>>;
  context: (input: unknown) => Promise<unknown>;
};
vi.mock("../../../apps/referral-embed-web/lib/embed-partner-session", () => ({
  readActiveReferralSession: () =>
    (
      globalThis as unknown as { __cancellationPorts: CancellationTestPorts }
    ).__cancellationPorts.session(),
  getReferralIdentityHeaders: (session: unknown) =>
    (
      globalThis as unknown as { __cancellationPorts: CancellationTestPorts }
    ).__cancellationPorts.headers(session),
}));
vi.mock("../../../apps/referral-embed-web/lib/embed-context", () => ({
  resolveEmbedContext: (input: unknown) =>
    (
      globalThis as unknown as { __cancellationPorts: CancellationTestPorts }
    ).__cancellationPorts.context(input),
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      children,
      href,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      prefetch?: boolean;
    }) => {
      delete props.prefetch;
      return React.createElement("a", { href, ...props }, children);
    },
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("ACTUAL_NEXT_NOT_FOUND_PORT");
  },
}));
import React from "react";
import { requireApi } from "./setup-reflection";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "./mounted-dom";
import { scenario } from "./fixture";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import Page from "../../../apps/referral-embed-web/app/embed/[entrySlug]/page";
import { GET as activeGET } from "../../../apps/referral-embed-web/app/api/referral/active/route";
import { POST as cancelPOST } from "../../../apps/referral-embed-web/app/api/referral/cancel/[orderId]/route";
const { of, lastValueFrom } = requireApi("rxjs");
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  delete (globalThis as any).__cancellationPorts;
});
async function wire() {
  const f = await scenario();
  const controller = new OwnedMobilityController(f.service, undefined as never);
  const context = {
    entry: f.entry,
    session: {
      handoffId: "controlled-session-port",
      recoveryScope: "controlled-scope",
      identityActive: true,
      partnerEntrySlug: f.entry.entrySlug,
      entryHost: f.entry.entryHost,
    },
    state: "handoff",
    screen: "trip",
    requestedScreen: "trip",
    handoff: { apiKey: null, partnerUserRef: null },
    decision: { requestedEntryHost: f.entry.entryHost, block: false },
    accent: "#123456",
    strings: {
      appName: "社區",
      displayName: "測試社區",
      supportPhone: "0800-000-000",
    },
    issues: [],
    fallbackEntry: null,
  };
  (globalThis as any).__cancellationPorts = {
    session: async () => ({ identityActive: true }),
    headers: async () => ({
      Authorization: "Bearer controlled-session-transport-only",
    }),
    context: async () => context,
  };
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  let omitMetadata = false;
  let lastWire: any;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://embed.example.test").pathname;
    calls.push({
      path,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (path === `/api/referral/cancel/${f.orderId}`)
      return cancelPOST(
        new Request(`https://embed.example.test${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: String(init?.body),
        }),
        { params: Promise.resolve({ orderId: f.orderId }) },
      );
    if (path === "/api/referral/active") return activeGET();
    try {
      let envelope;
      if (path === "/api/partner/referral/passenger/active")
        envelope = await controller.getReferralPassengerActiveTrip(
          f.identity,
          "controlled-read",
        );
      else if (
        path === `/api/partner/referral/passenger/orders/${f.orderId}/cancel`
      )
        envelope = await controller.cancelReferralPassengerTrip(
          f.orderId,
          JSON.parse(String(init?.body)),
          f.identity,
          "controlled-cancel",
        );
      else throw new Error("Unexpected transport path " + path);
      if (omitMetadata && "trip" in envelope.data && envelope.data.trip)
        delete (envelope.data.trip as any).cancellationWindow;
      // Actual serializer, no handwritten snake/camel equivalent.
      lastWire = await lastValueFrom(
        new SnakeCaseInterceptor().intercept({} as never, {
          handle: () => of(envelope),
        }),
      );
      return Response.json(lastWire);
    } catch (error) {
      if (typeof (error as any)?.getStatus !== "function") throw error;
      return Response.json((error as any).getResponse(), {
        status: (error as any).getStatus(),
      });
    }
  });
  vi.stubGlobal("fetch", fetch);
  const page = () =>
    Page({
      params: Promise.resolve({ entrySlug: f.entry.entrySlug }),
      searchParams: Promise.resolve({
        state: "handoff",
        screen: "trip",
        orderId: f.orderId,
      }),
    });
  return {
    ...f,
    context,
    page,
    calls,
    fetch,
    get wire() {
      return lastWire;
    },
    omit() {
      omitMetadata = true;
    },
  };
}
const button = () =>
  screen.getByRole("button", { name: "取消行程" }) as HTMLButtonElement;
function navigation() {
  const assign = vi.fn(),
    w = Object.create(window);
  Object.defineProperty(w, "location", {
    value: { assign },
    configurable: true,
  });
  vi.stubGlobal("window", w);
  return assign;
}

it("FAST_DEVICE_CLOCK server snapshot remains available and actual click is not prematurely blocked", async () => {
  vi.useFakeTimers();
  const serverNow = Date.parse("2026-10-20T06:00:00Z");
  vi.setSystemTime(serverNow);
  const f = await wire();
  const node = await f.page();
  vi.setSystemTime(serverNow + 3_600_000);
  render(node);
  expect(button().disabled).toBe(false);
  expect(screen.getByText(/可取消至/).textContent).toContain("剩餘 120 秒");
  const assign = navigation();
  const transport = f.fetch.getMockImplementation()!;
  let release!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  let delivered!: () => void;
  const done = new Promise<void>((r) => {
    delivered = r;
  });
  f.fetch.mockImplementation(async (...args) => {
    const isBff = String(args[0]).startsWith("/api/referral/cancel/");
    if (isBff) await hold;
    const response = await transport(...args);
    if (isBff) delivered();
    return response;
  });
  fireEvent.click(button());
  expect(
    f.fetch.mock.calls.some((args) =>
      String(args[0]).startsWith("/api/referral/cancel/"),
    ),
  ).toBe(true);
  // The API transport has its own server clock; only this jsdom device is skewed.
  vi.setSystemTime(serverNow);
  release();
  await act(async () => {
    await done;
  });
  expect(assign).toHaveBeenCalledTimes(1);
  expect((await f.stored())?.status).toBe("cancelled");
});
it("SLOW_DEVICE_CLOCK monotonic elapsed closes the same server window despite a slow device wall clock", async () => {
  vi.useFakeTimers();
  const serverNow = Date.parse("2026-10-20T06:00:00Z");
  vi.setSystemTime(serverNow);
  const f = await wire();
  const node = await f.page();
  vi.setSystemTime(serverNow - 3_600_000);
  render(node);
  expect(button().disabled).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(120_000);
  });
  expect(button().disabled).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
  expect(button().disabled).toBe(true);
  fireEvent.click(button());
  expect(f.calls.some((call) => call.method === "POST")).toBe(false);
});
