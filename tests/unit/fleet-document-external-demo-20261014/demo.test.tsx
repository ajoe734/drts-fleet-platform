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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import {
  createDocumentDemoState,
  exportDocumentDemo,
  FLEET_DOCUMENT_DEMO_KEY,
  fleetDocumentExamples,
  restoreDocumentDemo,
  transitionDocumentDemo,
  type DocumentDemoAction,
  type DocumentDemoState,
} from "../../../apps/fleet-partner-portal-web/lib/fleet-document-demo";
import { buildFleetPortalNav } from "../../../apps/fleet-partner-portal-web/lib/fleet-portal-nav";

function renderDemo(locale = "en") {
  const appRoot = resolve("apps/fleet-partner-portal-web");
  // Mock only the locale context. Page, handlers, reducer, metadata and Canvas
  // components are the real sources; no copied business logic or fake buttons.
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
const button = (name: string) => screen.getByRole("button", { name });
const select = (value = "vehicle_registration") =>
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
const stored = (): DocumentDemoState =>
  JSON.parse(localStorage.getItem(FLEET_DOCUMENT_DEMO_KEY)!);
const confirm = "Confirm example document (SIMULATION)";
const submit = "Submit example for review (SIMULATION)";
const withdraw = "Withdraw example submission (SIMULATION)";
const resubmit = "Resubmit example for review (SIMULATION)";
const skipStorage = "Skip external storage (SIMULATION)";
const skipScanner = "Skip external scanning (SIMULATION)";
const fetcher = vi.fn(() => {
  throw new Error("Demo action attempted a real network request");
});

beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  expect(fetcher).not.toHaveBeenCalled();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Fleet document demo actual controls", () => {
  it("exposes localized standalone navigation and enforces each preceding step", () => {
    for (const locale of ["en", "zh"] as const) {
      expect(
        buildFleetPortalNav(locale).find(
          (item) => item.key === "document-demo",
        ),
      ).toMatchObject({
        href: "/demo",
        label: expect.stringContaining("SIMULATION"),
      });
      expect(
        buildFleetPortalNav(locale).find((item) => item.key === "documents"),
      ).toMatchObject({ href: "/documents" });
    }
    renderDemo();
    expect(
      screen.getAllByText("SIMULATION ONLY · Example document metadata"),
    ).toHaveLength(2);
    for (const name of [
      confirm,
      submit,
      withdraw,
      resubmit,
      skipStorage,
      skipScanner,
      "Start simulated storage",
    ])
      expect(button(name)).toHaveProperty("disabled", true);
    select();
    expect(button("Start simulated storage")).toHaveProperty("disabled", false);
    expect(button("Start simulated scan")).toHaveProperty("disabled", true);
    expect(button(skipScanner)).toHaveProperty("disabled", true);
    expect(button(confirm)).toHaveProperty("disabled", true);
    expect(
      screen.getByText(fleetDocumentExamples[0].originalFileName),
    ).toBeTruthy();
    const link = screen.getByRole("link", {
      name: "Open real supply submissions",
    });
    expect(link.getAttribute("href")).toBe("/supply/submissions");
  });

  it("retains metadata through both pending/failure/retry stages and completes only a simulated local submission", () => {
    renderDemo();
    select("other");
    click("Start simulated storage");
    const storage = screen.getByRole("region", {
      name: "2. External storage · SIMULATION",
    });
    expect(within(storage).getByText("SIMULATION · Pending")).toBeTruthy();
    expect(button(confirm)).toHaveProperty("disabled", true);
    click("Simulate storage failure");
    expect(
      within(storage).getByText("SIMULATION · Service unavailable"),
    ).toBeTruthy();
    expect(button("Simulate storage success")).toHaveProperty("disabled", true);
    click("Retry simulated storage");
    expect(stored().exampleId).toBe("other");
    expect(stored().storage).toEqual({ status: "pending", attempts: 2 });
    click("Simulate storage success");
    expect(button(confirm)).toHaveProperty("disabled", true);
    click("Start simulated scan");
    const scanner = screen.getByRole("region", {
      name: "3. External scanner · SIMULATION",
    });
    expect(within(scanner).getByText("SIMULATION · Pending")).toBeTruthy();
    click("Simulate scanner failure");
    expect(
      within(scanner).getByText("SIMULATION · Service unavailable"),
    ).toBeTruthy();
    expect(button("Simulate scan pass")).toHaveProperty("disabled", true);
    click("Retry simulated scan");
    expect(stored().scanner).toEqual({ status: "pending", attempts: 2 });
    expect(stored().exampleId).toBe("other");
    click("Simulate scan pass");
    click(confirm);
    expect(screen.getByRole("combobox")).toHaveProperty("disabled", true);
    click(submit);
    expect(stored().submission).toBe("submitted");
    expect(button(submit)).toHaveProperty("disabled", true);
    expect(button(resubmit)).toHaveProperty("disabled", true);
    click(withdraw);
    expect(stored().submission).toBe("withdrawn");
    expect(button(submit)).toHaveProperty("disabled", true);
    click(resubmit);
    expect(stored()).toMatchObject({
      simulation: true,
      exampleId: "other",
      confirmed: true,
      storage: { status: "simulated_stored", attempts: 2 },
      scanner: { status: "simulated_pass", attempts: 2 },
      submission: "submitted",
    });
    expect(stored().events.map((event) => event.action)).toEqual([
      "select.other",
      "storage.start",
      "storage.fail",
      "storage.retry",
      "storage.succeed",
      "scanner.start",
      "scanner.fail",
      "scanner.retry",
      "scanner.succeed",
      "document.confirm",
      "submission.submit",
      "submission.withdraw",
      "submission.resubmit",
    ]);
    expect(stored().events.every((event) => event.simulation && event.at)).toBe(
      true,
    );
    expect(JSON.parse(exportDocumentDemo(stored())).exampleMetadata).toEqual(
      fleetDocumentExamples[1],
    );
  });

  it("explicitly skips unavailable external steps, restores the local example and never converts skipped scanning into clean", () => {
    const first = renderDemo();
    select();
    click("Start simulated storage");
    click("Simulate storage failure");
    click("Retry simulated storage");
    click(skipStorage);
    expect(button("Start simulated scan")).toHaveProperty("disabled", true);
    expect(button(confirm)).toHaveProperty("disabled", true);
    click(skipScanner);
    click(confirm);
    click(submit);
    click(withdraw);
    first.unmount();
    renderDemo();
    expect(screen.getByRole("combobox")).toHaveProperty(
      "value",
      "vehicle_registration",
    );
    expect(screen.getByText("SIMULATION · Withdrawn")).toBeTruthy();
    expect(screen.getAllByText("SIMULATION · Skipped")).toHaveLength(2);
    expect(button(resubmit)).toHaveProperty("disabled", false);
    click(resubmit);
    const record = JSON.parse(exportDocumentDemo(stored()));
    expect(record).toMatchObject({
      simulation: true,
      storage: { status: "skipped", attempts: 2 },
      scanner: { status: "skipped", attempts: 0 },
      confirmed: true,
      submission: "submitted",
      exampleMetadata: fleetDocumentExamples[0],
    });
    expect(record.notice).toContain("SIMULATION ONLY");
    for (const key of [
      "scan_state",
      "scanReceipt",
      "documentId",
      "submissionId",
      "checksumSha256",
      "objectKey",
    ])
      expect(record).not.toHaveProperty(key);
    expect(record.scanner.status).not.toBe("clean");
    expect(
      record.events.map((event: { action: string }) => event.action),
    ).toContain("scanner.skip");
  });

  it("can skip a failed scanner after retry and resets both local and saved evidence", () => {
    renderDemo();
    select();
    click("Start simulated storage");
    click("Simulate storage success");
    click("Start simulated scan");
    click("Simulate scanner failure");
    click("Retry simulated scan");
    click("Simulate scanner failure");
    click(skipScanner);
    click(confirm);
    click(submit);
    expect(stored().scanner).toEqual({ status: "skipped", attempts: 2 });
    click("Reset document simulation");
    expect(stored()).toEqual(createDocumentDemoState());
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
    expect(
      screen.queryByText(fleetDocumentExamples[0].originalFileName),
    ).toBeNull();
    expect(button(confirm)).toHaveProperty("disabled", true);
    expect(screen.getByText("Choose example metadata to begin.")).toBeTruthy();
  });

  it("downloads the actual selected, skipped and submitted JSON and exports empty metadata after reset", async () => {
    const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>(
      () => "blob:fleet-document-demo",
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const filenames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download);
      expect(this.href).toBe("blob:fleet-document-demo");
    });
    renderDemo();
    select();
    click(skipStorage);
    click(skipScanner);
    click(confirm);
    click(submit);
    const submitted = stored();
    vi.useFakeTimers();
    click("Download SIMULATION evidence (JSON)");
    click("Reset document simulation");
    click("Download SIMULATION evidence (JSON)");
    expect(filenames).toEqual([
      "fleet-document-SIMULATION.json",
      "fleet-document-SIMULATION.json",
    ]);
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    const read = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(blob);
      });
    const first = JSON.parse(
      await read(createObjectURL.mock.calls[0]![0] as Blob),
    );
    expect(first).toEqual({
      notice: expect.stringContaining("SIMULATION ONLY"),
      ...submitted,
      exampleMetadata: fleetDocumentExamples[0],
    });
    const second = JSON.parse(
      await read(createObjectURL.mock.calls[1]![0] as Blob),
    );
    expect(second).toMatchObject({
      exampleMetadata: null,
      exampleId: null,
      events: [],
      confirmed: false,
      submission: "draft",
    });
  });

  it("keeps Chinese controls operable when browser persistence is unavailable and reports export failure", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    renderDemo("zh");
    expect(
      screen.getByText(
        "瀏覽器無法儲存進度，仍可操作，但離開頁面後將失去進度。",
      ),
    ).toBeTruthy();
    select();
    click("跳過外部儲存（SIMULATION）");
    click("跳過外部掃描（SIMULATION）");
    click("確認範例文件（SIMULATION）");
    click("送審範例申請（SIMULATION）");
    expect(screen.getByText("SIMULATION · 已送審")).toBeTruthy();
    click("下載 SIMULATION 證據（JSON）");
    expect(screen.getByRole("alert").textContent).toBe(
      "無法下載示範紀錄，請重試。",
    );
    click("重設文件示範");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  });

  it("replacing example metadata clears its prior stages and malformed saved state opens an empty demo", () => {
    localStorage.setItem(FLEET_DOCUMENT_DEMO_KEY, "{broken");
    renderDemo();
    select();
    click("Start simulated storage");
    click("Simulate storage failure");
    select("other");
    expect(stored()).toMatchObject({
      exampleId: "other",
      storage: { status: "idle", attempts: 0 },
      scanner: { status: "idle", attempts: 0 },
      confirmed: false,
    });
    expect(
      screen.queryByText(fleetDocumentExamples[0].originalFileName),
    ).toBeNull();
    expect(
      screen.getByText(fleetDocumentExamples[1].originalFileName),
    ).toBeTruthy();
    expect(restoreDocumentDemo(JSON.stringify(stored()))).toEqual(stored());
  });
});

describe("Fleet document demo transition boundaries", () => {
  it("rejects out-of-order outcomes and invalid persisted event paths using the real reducer", () => {
    const empty = createDocumentDemoState();
    for (const action of [
      "storage.succeed",
      "scanner.succeed",
      "document.confirm",
      "submission.submit",
      "submission.withdraw",
      "submission.resubmit",
    ] as DocumentDemoAction[])
      expect(
        transitionDocumentDemo(empty, action, "2026-10-14T01:00:00Z"),
      ).toBe(empty);
    expect(
      restoreDocumentDemo(JSON.stringify({ ...empty, simulation: false })),
    ).toEqual(empty);
    expect(
      restoreDocumentDemo(
        JSON.stringify({
          ...empty,
          events: [{ simulation: true, action: "scanner.succeed", at: "now" }],
        }),
      ),
    ).toEqual(empty);
    expect(
      restoreDocumentDemo(
        JSON.stringify({ version: 1, simulation: true, scan_state: "clean" }),
      ),
    ).toEqual(empty);
  });
});
