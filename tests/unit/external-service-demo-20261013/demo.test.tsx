// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import {
  createDemoState,
  DEMO_STORAGE_KEY,
  demoLiveHref,
  exportDemoRecord,
  restoreDemoState,
  transitionDemo,
  type DemoAction,
  type DemoState,
} from "../../../apps/ops-console-web/app/demo/demo-state";

function renderDemo(locale = "en") {
  const appRoot = resolve("apps/ops-console-web");
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "../../lib/i18n": { useTranslation: () => ({ locale }) },
  });
  const Page = load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/demo/page.tsx"),
  ).default;
  return render(<Page />);
}
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const stored = () => restoreDemoState(localStorage.getItem(DEMO_STORAGE_KEY));
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("external service simulation", () => {
  it("requires each scenario's preceding step and does not invent delivery or completion", () => {
    const state = createDemoState();
    for (const action of [
      "voice.answer",
      "voice.end",
      "push.deliver",
      "email.retry",
      "erp.acknowledge",
      "issuer.eligible",
      "forwarder.complete",
    ] as DemoAction[])
      expect(transitionDemo(state, action, "2026-10-13T00:00:00Z")).toBe(state);
    const pending = transitionDemo(
      state,
      "issuer.request",
      "2026-10-13T00:00:00Z",
    );
    expect(pending.issuer).toBe("pending");
    expect(
      transitionDemo(pending, "issuer.ineligible", "2026-10-13T00:01:00Z")
        .issuer,
    ).toBe("ineligible");
  });

  it("runs all six real UI scenarios, records failures/retries and delivers only to the simulated inbox without network calls", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderDemo();
    expect(
      screen.getByText(
        "SIMULATION ONLY · Fictional people, orders and messages",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Answer demo call" }),
    ).toHaveProperty("disabled", true);
    click("Simulate incoming call");
    click("Answer demo call");
    click("End demo call");
    expect(
      within(screen.getByRole("region", { name: "Voice / PSTN" })).getByText(
        "Call ended",
      ),
    ).toBeTruthy();
    for (const channel of ["push", "email"]) {
      click(`Queue demo ${channel}`);
      click(`Simulate ${channel} failure`);
      expect(stored().inbox).toHaveLength(channel === "push" ? 0 : 1);
      click(`Retry demo ${channel}`);
      click(`Simulate ${channel} success`);
    }
    expect(stored().push).toEqual({ status: "delivered", attempts: 2 });
    expect(stored().email).toEqual({ status: "delivered", attempts: 2 });
    expect(stored().inbox.map((item) => item.channel)).toEqual([
      "push",
      "email",
    ]);
    expect(
      screen.getByText(/This is a simulated invoice message/),
    ).toBeTruthy();
    click("Prepare demo accounting data");
    click("Send demo ERP batch");
    expect(stored().erp.status).toBe("pending");
    click("Simulate ERP failure");
    click("Retry demo ERP sync");
    click("Simulate ERP acknowledgment");
    expect(stored().erp).toEqual({ status: "acknowledged", attempts: 2 });
    expect(screen.getByText(/SIMULATION ACK/)).toBeTruthy();
    click("Start demo lookup");
    click("Return expired");
    expect(stored().issuer).toBe("expired");
    click("Start demo lookup");
    click("Return eligible");
    click("Receive demo order");
    click("Reject demo order");
    expect(stored().forwarder).toBe("rejected");
    click("Receive demo order");
    click("Accept demo order");
    click("Complete demo order");
    const result = stored();
    expect(result).toMatchObject({
      simulation: true,
      voice: "ended",
      issuer: "eligible",
      forwarder: "completed",
    });
    expect(result.events).toHaveLength(25);
    expect(result.events.map((event) => event.action)).toContain("email.fail");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("restores the local scenario across navigation, preserves live-link context and resets all history and inbox records", () => {
    window.history.replaceState({}, "", "/demo?role=ops_dispatcher&locale=en");
    const first = renderDemo();
    click("Queue demo email");
    click("Simulate email success");
    first.unmount();
    renderDemo();
    expect(
      within(screen.getByRole("region", { name: "Invoice email" })).getByText(
        "Delivered to simulated inbox",
      ),
    ).toBeTruthy();
    const link = within(
      screen.getByRole("region", { name: "Third-party forwarded order" }),
    ).getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "/dispatch?board=forwarded&role=ops_dispatcher&locale=en",
    );
    click("Reset all scenarios");
    expect(stored()).toEqual(createDemoState());
    expect(
      screen.getByText(
        "No simulated messages have arrived yet. Queue a message, then choose delivery success.",
      ),
    ).toBeTruthy();
  });

  it("downloads the actual scenario record with explicit simulation provenance", async () => {
    const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>(
      () => "blob:demo-record",
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const downloaded: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded.push(this.download);
    });
    renderDemo();
    click("Receive demo order");
    click("Accept demo order");
    vi.useFakeTimers();
    click("Download simulation record (JSON)");
    expect(downloaded).toEqual(["external-service-SIMULATION.json"]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:demo-record");
    vi.useRealTimers();
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(JSON.parse(text)).toEqual({
      notice: expect.stringContaining("SIMULATION ONLY"),
      ...stored(),
    });
    expect(JSON.parse(text).forwarder).toBe("accepted");
  });

  it("recovers from malformed saved data and clearly reports unavailable storage while retaining working controls", () => {
    expect(restoreDemoState("{broken")).toEqual(createDemoState());
    expect(
      restoreDemoState(JSON.stringify({ version: 1, simulation: true })),
    ).toEqual(createDemoState());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    renderDemo("zh");
    click("模擬來電");
    expect(
      screen.getByText(
        "瀏覽器無法儲存資料，仍可繼續操作，但關閉頁面後將失去進度。",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "語音／PSTN" })).getByText(
        "來電中",
      ),
    ).toBeTruthy();
  });

  it("keeps saved and exported scenario data independent of external service credentials", () => {
    let state: DemoState = createDemoState();
    state = transitionDemo(state, "push.send", "2026-10-13T00:00:00Z");
    state = transitionDemo(state, "push.deliver", "2026-10-13T00:01:00Z");
    expect(restoreDemoState(JSON.stringify(state))).toEqual(state);
    expect(JSON.parse(exportDemoRecord(state)).inbox).toHaveLength(1);
    expect(demoLiveHref("/callcenter", "?locale=zh&role=ops&other=skip")).toBe(
      "/callcenter?role=ops&locale=zh",
    );
  });
});
