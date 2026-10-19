/** @vitest-environment jsdom */
import React from "react";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  Actions,
  RideContent,
} from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { createFareQuoteAnomalyFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import type { PassengerRideFixture } from "@drts/passenger-client";

// Mock only HTTP transport. The mounted component, passengerClient.getFares(),
// runtime fetch selection, envelope/case conversion and rendering remain real.
const currentVersion = {
  version: "taipei-20230401",
  effective_at: "2023-04-01T00:00:00+08:00",
  base_fare: 85,
  base_distance_meters: 1250,
  distance_rate: 5,
  distance_increment_meters: 200,
  delay_rate: 5,
  delay_increment_seconds: 60,
  night_surcharge: 20,
  night_surcharge_unit: "TWD_per_trip",
  night_application: "pickup",
  night_surcharge_window_start: "23:00",
  night_surcharge_window_end: "06:00",
  additional_fees: {},
};

function fixture(screenId: PassengerRideFixture["screenId"] = "A03") {
  return { ...createFareQuoteAnomalyFixture("fare-copy-test"), screenId };
}

function response(version: unknown = currentVersion) {
  return new Response(JSON.stringify({ data: { current_version: version } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mount() {
  return render(<RideContent fixture={fixture()} token="fare-copy-test" />);
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function expectRow(label: string, amount: string) {
  const row = screen.getByText(label).parentElement!;
  expect(within(row).getByText(amount)).toBeTruthy();
}

describe("public fare copy through the mounted A03 production branch", () => {
  it("renders all four G201011 rows from the existing public API without fixture.fareVersion", async () => {
    mount();
    await screen.findByText("延滯計時（每 60 秒）");
    expectRow("起程運價（1.25 公里）", "NT$ 85");
    expectRow("續程運價（每 200 公尺）", "NT$ 5");
    expectRow("延滯計時（每 60 秒）", "NT$ 5");
    expectRow("夜間加成（23:00–06:00）", "每趟加 NT$ 20");
    expect(screen.getByText(/版本 taipei-20230401/).textContent).toContain(
      currentVersion.effective_at,
    );
    expect(screen.getByText(/版本 taipei-20230401/).textContent).toContain(
      "依臺北市政府公告計程車運價（112/04/01起實施）",
    );
    expect(screen.getByText("本頁依主管機關公告之現行運價揭露")).toBeTruthy();
    expect(screen.getByText("夜間時段以上車時間為準")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/passenger-app/fares");
    expect(screen.queryByText(/F-2026-03|1130042/)).toBeNull();
  });

  it("uses every returned value and night rule rather than substituting G201011 constants", async () => {
    fetchMock.mockResolvedValue(
      response({
        ...currentVersion,
        version: "synthetic-transport-test-v2",
        effective_at: "2025-01-02T00:00:00+08:00",
        base_fare: 95,
        base_distance_meters: 1500,
        distance_rate: 7,
        distance_increment_meters: 250,
        delay_rate: 9,
        delay_increment_seconds: 90,
        night_surcharge: 30,
        night_application: "any_overlap",
        night_surcharge_window_start: "22:30",
        night_surcharge_window_end: "05:30",
      }),
    );
    mount();
    await screen.findByText("起程運價（1.5 公里）");
    expectRow("起程運價（1.5 公里）", "NT$ 95");
    expectRow("續程運價（每 250 公尺）", "NT$ 7");
    expectRow("延滯計時（每 90 秒）", "NT$ 9");
    expectRow("夜間加成（22:30–05:30）", "每趟加 NT$ 30");
    expect(
      screen.getByText(/版本 synthetic-transport-test-v2/).textContent,
    ).toContain("2025-01-02");
    expect(
      screen.getByText(/版本 synthetic-transport-test-v2/).textContent,
    ).toContain("依臺北市政府公告計程車運價（114/01/02起實施）");
    expect(screen.queryByText(/112\/04\/01/)).toBeNull();
    expect(screen.getByText("行程與夜間時段重疊時適用")).toBeTruthy();
    expect(screen.queryByText("NT$ 85")).toBeNull();
  });

  it("uses the Taipei effective date when the API serializes the timestamp in UTC", async () => {
    fetchMock.mockResolvedValue(
      response({ ...currentVersion, effective_at: "2023-03-31T16:00:00.000Z" }),
    );
    mount();
    const version = await screen.findByText(/版本 taipei-20230401/);
    expect(version.textContent).toContain(
      "依臺北市政府公告計程車運價（112/04/01起實施）",
    );
    expect(version.textContent).toContain("2023-03-31T16:00:00.000Z");
    expect(screen.queryByText(/112\/03\/31/)).toBeNull();
  });

  it("retains a future API effective date rather than substituting 112/04/01", async () => {
    fetchMock.mockResolvedValue(
      response({
        ...currentVersion,
        version: "synthetic-future-20300401",
        effective_at: "2030-04-01T00:00:00+08:00",
      }),
    );
    mount();
    const version = await screen.findByText(/版本 synthetic-future-20300401/);
    expect(version.textContent).toContain(
      "依臺北市政府公告計程車運價（119/04/01起實施）",
    );
    expect(version.textContent).toContain("2030-04-01T00:00:00+08:00");
    expect(screen.queryByText(/112\/04\/01/)).toBeNull();
  });

  it("shows loading without prices or an effective badge, then renders the response", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    mount();
    expect(screen.getByText("正在取得公開費率...")).toBeTruthy();
    expect(screen.queryByText("已生效")).toBeNull();
    expect(screen.queryByText(/NT\$/)).toBeNull();
    await act(async () => {
      resolve(response());
    });
    expect(screen.getByText("NT$ 85")).toBeTruthy();
  });

  it("shows unavailable for a failed request and retries through the same client", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "unavailable" } }), {
        status: 503,
      }),
    );
    mount();
    await screen.findByText("目前無法取得公開費率，請稍後重試。");
    expect(screen.queryByText("已生效")).toBeNull();
    expect(screen.queryByText(/NT\$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    await screen.findByText("NT$ 85");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    undefined,
    {},
    { ...currentVersion, version: "" },
    { ...currentVersion, effective_at: "invalid" },
    { ...currentVersion, base_fare: -1 },
    { ...currentVersion, base_fare: "85" },
    { ...currentVersion, base_distance_meters: 0 },
    { ...currentVersion, distance_rate: null },
    { ...currentVersion, distance_increment_meters: 0 },
    { ...currentVersion, delay_rate: -5 },
    { ...currentVersion, delay_increment_seconds: 0 },
    { ...currentVersion, night_surcharge: -20 },
    { ...currentVersion, night_surcharge_unit: "ratio" },
    { ...currentVersion, night_surcharge_unit: undefined },
    { ...currentVersion, night_application: "invented" },
    { ...currentVersion, night_application: undefined },
    { ...currentVersion, night_surcharge_window_start: "24:00" },
    { ...currentVersion, night_surcharge_window_end: undefined },
  ])(
    "does not publish missing/invalid authoritative fields (%#)",
    async (version) => {
      // Explicit undefined must reach the wire as missing, not the helper default.
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ data: { current_version: version } })),
      );
      mount();
      await screen.findByText("目前無法取得公開費率，請稍後重試。");
      expect(screen.queryByText("已生效")).toBeNull();
      expect(screen.queryByText(/NT\$/)).toBeNull();
    },
  );

  it("ignores a pending response after leaving the public fare branch", async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const view = mount();
    view.unmount();
    await act(async () => {
      resolve(response());
    });
    expect(document.body.textContent).not.toContain("NT$");
  });
});

describe("cancellation presentation preserves action permissions", () => {
  it.each(["P5-01", "P5-02", "P5-03", "P5-06"] as const)(
    "shows free cancellation at %s",
    (screenId) => {
      render(
        <Actions
          fixture={{ ...fixture(screenId), canCancel: true }}
          token="fare-copy-test"
        />,
      );
      expect(screen.getByText("取消不收費")).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "取消行程" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("keeps the reassignment copy and disabled on-trip cancellation", () => {
    const view = render(
      <Actions
        fixture={{ ...fixture("P5-04"), canCancel: true }}
        token="fare-copy-test"
      />,
    );
    expect(screen.getByText("改派期間取消不收費")).toBeTruthy();
    view.rerender(
      <Actions
        fixture={{ ...fixture("P5-07"), canCancel: false }}
        token="fare-copy-test"
      />,
    );
    const button = screen.getByRole("button", {
      name: "取消行程",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("contains none of the retired strings anywhere in apps/passenger-app-web", () => {
  let output = "";
  try {
    output = execFileSync(
      "git",
      [
        "grep",
        "-n",
        "-e",
        "每 80 秒",
        "-e",
        "+20%",
        "-e",
        "指派前取消",
        "--",
        "apps/passenger-app-web",
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    const result = error as { status: number; stdout: string };
    expect(result.status).toBe(1); // git grep's documented no-match status.
    output = result.stdout;
  }
  expect(output).toBe("");
});
