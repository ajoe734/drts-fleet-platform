import type {
  SubmitReferralPassengerComplaintCommand,
  ReferralPassengerComplaintCategory,
} from "@drts/contracts";
import { requireApi } from "./setup-reflection";
type ManualTestPorts = {
  session: () => Promise<unknown>;
  headers: (session: unknown) => Promise<Record<string, string>>;
  context: (input: unknown) => Promise<unknown>;
};
vi.mock("../../../apps/referral-embed-web/lib/embed-partner-session", () => ({
  readActiveReferralSession: () =>
    (
      globalThis as unknown as { __cancellationPorts: ManualTestPorts }
    ).__cancellationPorts.session(),
  getReferralIdentityHeaders: (session: unknown) =>
    (
      globalThis as unknown as { __cancellationPorts: ManualTestPorts }
    ).__cancellationPorts.headers(session),
}));
vi.mock("../../../apps/referral-embed-web/lib/embed-context", () => ({
  resolveEmbedContext: (input: unknown) =>
    (
      globalThis as unknown as { __cancellationPorts: ManualTestPorts }
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
import { vi } from "vitest";
import { scenario } from "./scenario";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import Page from "../../../apps/referral-embed-web/app/embed/[entrySlug]/page";
const { of, lastValueFrom } = requireApi("rxjs");
export async function manualWire() {
  const f = await scenario();
  await f.change({ status: "completed" });
  const controller = new OwnedMobilityController(f.service, undefined as never);
  const context = {
    entry: f.entry,
    session: {
      handoffId: "controlled-session-port",
      recoveryScope: "manual-unit-own-scope",
      identityActive: true,
      partnerEntrySlug: f.entry.entrySlug,
      entryHost: f.entry.entryHost,
    },
    state: "handoff",
    screen: "completed",
    requestedScreen: "completed",
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
    headers: async () => ({ Authorization: "Bearer controlled-session-only" }),
    context: async (input: any) => ({
      ...context,
      screen: input.screen ?? "completed",
      requestedScreen: input.screen ?? "completed",
    }),
  };
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const wires: any[] = [];
  let responseLost = false;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://embed.example.test").pathname;
    const method = init?.method ?? "GET";
    calls.push({
      path,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const local = path.match(
      /^\/api\/referral\/complaints\/([^/]+)(?:\/([^/]+))?$/,
    );
    if (local) {
      const orderId = decodeURIComponent(local[1]!);
      const request = new Request("https://embed.example.test" + path, {
        method,
        ...(method === "POST"
          ? {
              headers: { "Content-Type": "application/json" },
              body: String(init?.body),
            }
          : {}),
      });
      const result = local[2]
        ? await (
            await import("../../../apps/referral-embed-web/app/api/referral/complaints/[orderId]/[caseNo]/route")
          ).GET(request, {
            params: Promise.resolve({
              orderId,
              caseNo: decodeURIComponent(local[2]),
            }),
          })
        : await (
            await import("../../../apps/referral-embed-web/app/api/referral/complaints/[orderId]/route")
          )[method === "POST" ? "POST" : "GET"](request, {
            params: Promise.resolve({ orderId }),
          });
      if (method === "POST" && responseLost) {
        responseLost = false;
        throw new Error(
          "controlled lost HTTP response after real service/repo commit",
        );
      }
      return result;
    }
    try {
      let envelope;
      const base = "/api/partner/referral/passenger/";
      const suffix = path.slice(base.length);
      if (path === base + "active")
        envelope = await controller.getReferralPassengerActiveTrip(
          f.identity,
          "unit-active",
        );
      else if (path === base + "history")
        envelope = await controller.listReferralPassengerHistory(
          f.identity,
          "unit-history",
        );
      else if (suffix === `orders/${f.orderId}/complaints` && method === "POST")
        envelope = await controller.submitReferralPassengerComplaint(
          f.orderId,
          JSON.parse(String(init?.body)),
          f.identity,
          "unit-submit",
          new Headers(init?.headers).get("Idempotency-Key") ?? undefined,
        );
      else if (suffix === `orders/${f.orderId}/complaints`)
        envelope = await controller.listReferralPassengerComplaints(
          f.orderId,
          f.identity,
          "unit-list",
        );
      else if (suffix.startsWith(`orders/${f.orderId}/complaints/`))
        envelope = await controller.getReferralPassengerComplaint(
          f.orderId,
          decodeURIComponent(suffix.split("/").at(-1)!),
          f.identity,
          "unit-detail",
        );
      else throw new Error("Unexpected transport path " + path);
      const body = await lastValueFrom(
        new SnakeCaseInterceptor().intercept({} as never, {
          handle: () => of(envelope),
        }),
      );
      wires.push({ path, method, body });
      return Response.json(body);
    } catch (error) {
      if (typeof (error as any)?.getStatus !== "function") throw error;
      return Response.json((error as any).getResponse(), {
        status: (error as any).getStatus(),
      });
    }
  });
  vi.stubGlobal("fetch", fetch);
  const page = (screen = "completed") =>
    Page({
      params: Promise.resolve({ entrySlug: f.entry.entrySlug }),
      searchParams: Promise.resolve({
        state: "handoff",
        screen,
        orderId: f.orderId,
      }),
    });
  return {
    ...f,
    controller,
    page,
    context,
    calls,
    wires,
    fetch,
    loseResponse() {
      responseLost = true;
    },
    command: (
      category: ReferralPassengerComplaintCategory = "service",
      extra: Record<string, unknown> = {},
    ): SubmitReferralPassengerComplaintCommand => ({
      orderId: f.orderId,
      category,
      content: "原同單文字申訴",
      contactRequested: false,
      idempotencyKey: crypto.randomUUID(),
      ...(category === "lost_item" ? { lostItemDescription: "黑色背包" } : {}),
      ...extra,
    }),
  };
}
