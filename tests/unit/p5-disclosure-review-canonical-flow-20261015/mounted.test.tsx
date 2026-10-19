import "./dom-setup";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { JSDOM } from "jsdom";
import {
  cleanup,
  render,
  fireEvent,
  waitFor,
} from "@testing-library/react/pure";
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { ApiClient } from "../../../packages/api-client/src/index";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { fixture, actor, vid, did, deferred } from "./fixture";
const { Reflector } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/core");
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
let dom: JSDOM;
afterEach(async () => {
  await React.act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  dom?.window.close();
});
function mount(
  view = "disclosure",
  fail = false,
  live?: ApiClient,
  scopes = live
    ? actor.scopes
    : ["regulatory:read", "regulatory:write", "reg.read", "reg.review"],
  writeFailure = false,
) {
  dom = new JSDOM("<html><body></body></html>", {
    url: "https://p5-unit.invalid",
  });
  for (const k of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Node",
    "Event",
    "MouseEvent",
    "MutationObserver",
  ]) {
    vi.stubGlobal(
      k,
      k === "window"
        ? dom.window
        : (dom.window as unknown as Record<string, unknown>)[k],
    );
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const item = {
    subjectType: "vehicle",
    subjectId: "actual-vehicle",
    label: "REAL-123",
    sourceSubmissionId: "actual-submission",
    version: 4,
    record: {
      vehicleId: "actual-vehicle",
      make: "Actual Make",
      model: "Actual Model",
      modelYear: 2025,
      doorCount: 4,
      color: "yellow",
      status: "incomplete",
      missingFieldCodes: [],
      verifiedAt: null,
      verifiedByActorId: null,
      sourceSubmissionId: "actual-submission",
      version: 4,
      updatedAt: "2026-10-01T00:00:00Z",
    },
    missingFieldCodes: [],
    history: [],
  };
  const get = vi.fn(async (path: string) => {
    if (fail) throw new Error("Canonical unavailable");
    return path.endsWith("disclosure-reviews") ? { items: [item] } : item;
  });
  const post = vi.fn(async () => {
    if (writeFailure) throw new Error("Canonical write refused");
    return { subject: item };
  });
  const Frame = ({
    children,
    title,
    body,
    actions,
    items,
  }: {
    children?: React.ReactNode;
    title?: React.ReactNode;
    body?: React.ReactNode;
    actions?: React.ReactNode;
    items?: { k: string; v: React.ReactNode }[];
  }) => (
    <section>
      {title}
      {body}
      {actions}
      {children}
      {items?.map((x, i) => (
        <div key={i}>
          {x.k}:{x.v}
        </div>
      ))}
    </section>
  );
  const client = live ?? { get, post };
  const load = createUiModuleLoader(resolve("apps/platform-admin-web"), {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@/lib/admin-client": { usePlatformAdminClient: () => client },
    "@/lib/i18n": {
      useTranslation: () => ({ locale: "en", t: (key: string) => key }),
    },
    "@/lib/platform-admin-authority": {
      usePlatformAdminAuthority: () => ({ scopes }),
    },
    "./fares/public-fare-management": { PublicFareManagement: () => null },
    "@drts/ui-web": {
      buildCanvasTheme: () => ({}),
      CanvasBanner: Frame,
      CanvasCard: Frame,
      CanvasDL: Frame,
      CanvasPageHeader: Frame,
      CanvasPill: Frame,
      CanvasBtn: ({
        children,
        onClick,
        disabled,
      }: {
        children?: React.ReactNode;
        onClick?: () => void;
        disabled?: boolean;
      }) => (
        <button onClick={onClick} disabled={disabled}>
          {children}
        </button>
      ),
      CanvasTable: ({
        rows,
        columns,
      }: {
        rows: Record<string, unknown>[];
        columns: {
          k?: string;
          r?: (row: Record<string, unknown>) => React.ReactNode;
        }[];
      }) => (
        <div>
          {rows.map((row, i) => (
            <div key={i}>
              {columns.map((c, j) => (
                <span key={j}>
                  {c.r ? c.r(row) : String(row[c.k ?? ""] ?? "")}
                </span>
              ))}
            </div>
          ))}
        </div>
      ),
    },
  });
  const C = load<{ P5AdminConsole: React.ComponentType<{ view: string }> }>(
    resolve(
      "apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx",
    ),
  ).P5AdminConsole;
  const ui = render(<C view={view} />);
  return { ui, get, post, item };
}
describe("real P5 mounted disclosure/corrections", () => {
  it("consumes the canonical issued regulatory permissions without unissued reg display labels", async () => {
    const h = mount("queue", false, undefined, [
      "regulatory:read",
      "regulatory:write",
    ]);
    await waitFor(() =>
      expect(h.get).toHaveBeenCalledWith(
        "/api/regulatory-registry/disclosure-reviews",
      ),
    );
    await h.ui.findByLabelText("Review reason");
    expect(h.ui.container.textContent).toContain("REAL-123");
  });

  it("invokes the real mounted review handler and never reports a rejected command as approved", async () => {
    const h = mount(
      "queue",
      false,
      undefined,
      ["regulatory:read", "regulatory:write", "reg.read", "reg.review"],
      true,
    );
    await React.act(async () => {});
    const reason = h.ui.queryByLabelText("Review reason");
    if (reason)
      fireEvent.change(reason, {
        target: { value: "Original review decision" },
      });
    fireEvent.click(
      h.ui.getAllByRole("button", { name: "p5.action.approve" })[0]!,
    );
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect((await h.ui.findByRole("alert")).textContent).toContain(
      "Canonical write refused",
    );
  });

  it("never substitutes verified sample data when canonical reads fail", async () => {
    const h = mount("disclosure", true);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await React.act(async () => {});
    expect(h.ui.container.textContent).not.toContain("verified_active");
    expect(h.ui.container.textContent).not.toContain("complete");
    expect(h.ui.container.textContent).toContain("Canonical unavailable");
  });
  it("loads the actual canonical correction subject instead of a fixed seed", async () => {
    const h = mount("queue");
    await waitFor(() =>
      expect(h.get).toHaveBeenCalledWith(
        "/api/regulatory-registry/disclosure-reviews",
      ),
    );
    await waitFor(() =>
      expect(h.ui.container.textContent).toContain("REAL-123"),
    );
    expect(h.ui.container.textContent).not.toContain("BKR-2208");
  });
});

async function liveTransport(identity = actor) {
  const h = await fixture();
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("DRTS_ENV", "staging");
  vi.stubEnv("JWT_SECRET", "offline-p5-test-secret");
  vi.stubEnv("JWT_ISSUER", "drts");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
  const jwt = new JwtAuthService();
  vi.spyOn(jwt, "verifyAccessToken").mockResolvedValue({} as never);
  vi.spyOn(jwt, "toRequestIdentity").mockReturnValue(identity);
  const guard = new BootstrapAuthGuard(new Reflector(), jwt);
  const calls: {
    path: string;
    key: string | null;
    status: number;
    body: unknown;
  }[] = [];
  const faults = { lostResponse: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input), "https://p5-unit.invalid");
      const path = url.pathname;
      const headers = new Headers(init.headers);
      const request = {
        method: init.method ?? "GET",
        url: path,
        headers: Object.fromEntries(headers),
        identity: undefined as typeof actor | undefined,
      };
      const match = path.match(/disclosure-reviews\/(vehicle|driver)\/(.+)$/);
      const type = match?.[1] as "vehicle" | "driver";
      const id = match?.[2] ?? "";
      const body = init.body ? JSON.parse(String(init.body)) : null;
      const key = headers.get("idempotency-key");
      const handler =
        request.method === "POST"
          ? h.controller.reviewDisclosure
          : match
            ? h.controller.getDisclosureReview
            : h.controller.listDisclosureReviews;
      try {
        await guard.canActivate({
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => handler,
          getClass: () => h.controller.constructor,
        } as never);
        expect(request.identity?.actorId).toBe(actor.actorId);
        const result =
          request.method === "POST"
            ? await h.controller.reviewDisclosure(
                type,
                id,
                body,
                key ?? undefined,
                request.identity,
              )
            : match
              ? await h.controller.getDisclosureReview(
                  type,
                  id,
                  request.identity,
                )
              : await h.controller.listDisclosureReviews(request.identity);
        if (request.method === "POST" && faults.lostResponse) {
          faults.lostResponse = false;
          calls.push({ path, key, status: 503, body });
          return new Response(
            JSON.stringify({
              error: {
                code: "SIM_LOST_ACK",
                message: "SIM lost HTTP acknowledgement",
              },
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
        calls.push({ path, key, status: 200, body });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (error) {
        const e = error as {
          getStatus?: () => number;
          getResponse?: () => unknown;
          message: string;
        };
        const status = e.getStatus?.() ?? 500;
        calls.push({ path, key, status, body });
        return new Response(
          JSON.stringify(
            e.getResponse?.() ?? {
              error: { code: "SIM_STORAGE_FAILURE", message: e.message },
            },
          ),
          { status, headers: { "content-type": "application/json" } },
        );
      }
    }),
  );
  const client = new ApiClient({
    baseUrl: "https://p5-unit.invalid",
    defaultHeaders: { Authorization: "Bearer offline-p5-verified-token" },
  });
  return { ...h, client, calls, faults };
}
function fillReason(
  ui: ReturnType<typeof render>,
  reason = "Original documents reviewed",
) {
  fireEvent.change(ui.getByLabelText("Review reason"), {
    target: { value: reason },
  });
}
describe("mounted P5 actual SDK/guard/Controller/repository chain", () => {
  it("awaits real canonical approval and same-subject history/readback", async () => {
    const live = await liveTransport();
    const h = mount("disclosure", false, live.client);
    await h.ui.findByLabelText("Review reason");
    fillReason(h.ui);
    const button = h.ui.getByRole("button", { name: "p5.action.approve" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(live.state().history).toHaveLength(1));
    await waitFor(() =>
      expect(h.ui.container.textContent).toContain("Version 5"),
    );
    expect(h.ui.container.textContent).toContain(actor.actorId);
    expect(
      live.calls.filter((c) => c.path.endsWith(vid) && c.status === 200),
    ).toHaveLength(3);
    expect(live.state().profiles[0]?.status).toBe("complete");
  });
  it("retains immutable command identity after committed HTTP ACK loss and reloads exact history", async () => {
    const live = await liveTransport();
    live.faults.lostResponse = true;
    const h = mount("queue", false, live.client);
    await h.ui.findByLabelText("Review reason");
    fillReason(h.ui);
    fireEvent.click(h.ui.getByRole("button", { name: "p5.action.approve" }));
    await h.ui.findByRole("alert");
    expect(live.state().history).toHaveLength(1);
    expect(h.ui.container.textContent).toContain("Version 4");
    fireEvent.click(h.ui.getByRole("button", { name: "p5.action.approve" }));
    await waitFor(() =>
      expect(h.ui.container.textContent).toContain("Version 5"),
    );
    expect(live.state().history).toHaveLength(1);
    const posts = live.calls.filter((c) => c.body);
    expect(posts.map((c) => c.status)).toEqual([503, 200]);
    expect(posts[1]?.key).toBe(posts[0]?.key);
    expect(posts[1]?.body).toEqual(posts[0]?.body);
  });
  it("keeps actual reader-only actions disabled and distinguishes empty/denied reads", async () => {
    const live = await liveTransport();
    const h = mount("queue", false, live.client, ["regulatory:read"]);
    await h.ui.findByLabelText("Review reason");
    expect(
      h.ui
        .getByRole("button", { name: "p5.action.approve" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      h.ui
        .getByRole("button", { name: "p5.action.return" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(live.state().history).toHaveLength(0);
  });
  it("returns the actual selected driver for correction and keeps its raw registration private", async () => {
    const live = await liveTransport();
    const h = mount("queue", false, live.client);
    await h.ui.findByLabelText("Review reason");
    fireEvent.click(h.ui.getByRole("button", { name: new RegExp(did) }));
    await waitFor(() =>
      expect(h.ui.container.textContent).toContain("RE***76"),
    );
    expect(h.ui.container.textContent).not.toContain("REAL-REG-9876");
    fillReason(h.ui, "Correct the original registration");
    fireEvent.click(h.ui.getByRole("button", { name: "p5.action.return" }));
    await waitFor(() => expect(live.state().history).toHaveLength(1));
    await waitFor(() =>
      expect(h.ui.container.textContent).toContain("Version 3"),
    );
    const review = (
      live.state().history[0]!.new_value as {
        p5Review: { subjectId: string; action: string };
      }
    ).p5Review;
    expect(review).toMatchObject({ subjectId: did, action: "return" });
    expect(live.state().profiles[0]?.version).toBe(4);
  });
  it("keeps a pending/rejected storage command unacknowledged, then retries the same intent", async () => {
    const live = await liveTransport();
    const gate = deferred();
    live.control.gate = gate;
    const h = mount("disclosure", false, live.client);
    await h.ui.findByLabelText("Review reason");
    fillReason(h.ui);
    fireEvent.click(h.ui.getByRole("button", { name: "p5.action.approve" }));
    await waitFor(() =>
      expect(
        h.ui
          .getByRole("button", { name: "p5.action.approve" })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
    expect(live.state().profiles[0]?.status).toBe("incomplete");
    expect(live.state().history).toHaveLength(0);
    gate.reject(new Error("Original storage refused"));
    await h.ui.findByRole("alert");
    expect(h.ui.container.textContent).toContain("Version 4");
    live.control.gate = null;
    fireEvent.click(h.ui.getByRole("button", { name: "p5.action.approve" }));
    await waitFor(() =>
      expect(h.ui.container.textContent).toContain("Version 5"),
    );
    expect(live.state().history).toHaveLength(1);
    const posts = live.calls.filter((call) => call.body);
    expect(posts.map((call) => call.status)).toEqual([500, 200]);
    expect(posts[0]?.key).toBe(posts[1]?.key);
  });
  it("distinguishes real empty/denied states and rejects frontend persona authority at the backend", async () => {
    const live = await liveTransport({
      ...actor,
      scopes: ["regulatory:read"],
    });
    const h = mount("queue", false, live.client);
    await h.ui.findByLabelText("Review reason");
    fillReason(h.ui);
    fireEvent.click(h.ui.getByRole("button", { name: "p5.action.approve" }));
    const alert = await h.ui.findByRole("alert");
    expect(alert.getAttribute("data-kind")).toBe("denied");
    expect(live.state().history).toHaveLength(0);
  });
  it("shows a genuinely empty queue without seeded subjects", async () => {
    const live = await liveTransport();
    live.state().profiles = [];
    live.state().credentials = [];
    const h = mount("disclosure", false, live.client);
    await h.ui.findByText("No disclosure subjects");
    expect(h.ui.container.textContent).not.toContain("verified_active");
    expect(h.ui.queryByLabelText("Review reason")).toBeNull();
  });
  it("legacy display labels alone cannot confer actual read or review authority", async () => {
    const live = await liveTransport();
    const h = mount("queue", false, live.client, ["reg.read", "reg.review"]);
    await React.act(async () => {});
    expect(h.ui.queryByLabelText("Review reason")).toBeNull();
    expect(live.calls).toHaveLength(0);
    await expect(
      live.service.reviewDisclosure(
        "vehicle",
        vid,
        {
          expectedVersion: 4,
          sourceSubmissionId: live.state().profiles[0]!
            .source_submission_id as string,
          action: "approve",
          reason: "display role",
        },
        "display-only",
        { ...actor, scopes: ["reg.read", "reg.review"] },
      ),
    ).rejects.toThrow();
    expect(live.state().history).toHaveLength(0);
  });
});
