// @vitest-environment jsdom
import {
  render as renderComponent,
  screen,
  within,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { BookingScreen } from "../../../apps/passenger-app-web/components/booking/booking-screen";
import Home from "../../../apps/passenger-app-web/app/page";
import FaresPage from "../../../apps/passenger-app-web/app/fares/page";
import { bookingFixture, selection } from "./fixture";

// Actual public source entries, not mocked implementations or a global alias.
// Root has no passenger-client dependency; production resolves the declared app dependency.
vi.mock(
  "@drts/passenger-client",
  async () => import("../../../packages/passenger-client/src/index"),
);
vi.mock(
  "@drts/ui-web",
  async () => import("../../../packages/ui-web/src/index"),
);
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const push = vi.fn();
const router = {
  push,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const render = (element: ReactElement) =>
  renderComponent(
    <AppRouterContext.Provider value={router}>
      {element}
    </AppRouterContext.Provider>,
  );
let f: ReturnType<typeof bookingFixture>;
beforeEach(() => {
  push.mockClear();
  f = bookingFixture();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const calls = (suffix: string) =>
  f.calls.filter((call) => call.path.endsWith(suffix));
async function form() {
  await screen.findByLabelText("預約時間");
}
async function selectAddress(index: number, name: string) {
  const input =
    screen.getAllByPlaceholderText("請輸入街道、地點或地標")[index]!;
  const picker = input.closest("[data-address-map-picker]") as HTMLElement;
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(within(picker).getByRole("button", { name: "搜尋" }));
  fireEvent.click(
    await within(picker).findByRole("button", { name: new RegExp(name) }),
  );
  await waitFor(() =>
    expect(
      within(picker).queryByRole("button", { name: "清除選點" }),
    ).not.toBeNull(),
  );
}
async function quote() {
  await form();
  await selectAddress(0, "上車");
  await selectAddress(1, "下車");
  fireEvent.change(screen.getByLabelText("預約時間"), {
    target: { value: "2099-10-11T12:00" },
  });
  click("試算車資");
  await screen.findByLabelText("我已確認費用與優惠說明");
}
const confirmed = () =>
  fireEvent.click(screen.getByLabelText("我已確認費用與優惠說明"));

describe("real passenger B01-B09/E19 page → portable client → actual BFF (HTTP only stubbed)", () => {
  it("root page really exposes the reservation flow, not a placeholder", async () => {
    render(<Home />);
    await form();
    expect(screen.getByText(/本服務僅提供預約叫車/)).toBeTruthy();
  });
  it("persists mandatory first-use acknowledgement, reuses it on reload", async () => {
    delete f.account.feeAcknowledgementVersion;
    const first = render(<BookingScreen />);
    await screen.findByRole("button", { name: "我已閱讀並同意" });
    expect(screen.queryByLabelText("預約時間")).toBeNull();
    click("我已閱讀並同意");
    await form();
    expect(calls("/me").find((call) => call.method === "PATCH")?.body).toEqual({
      feeAcknowledgementVersion: f.fare.version,
    });
    first.unmount();
    render(<BookingScreen />);
    await form();
    expect(screen.queryByRole("button", { name: "我已閱讀並同意" })).toBeNull();
  });
  it.each([404, 500])(
    "acknowledgement HTTP %s remains visible and retryable, never bypassed",
    async (status) => {
      delete f.account.feeAcknowledgementVersion;
      f.errors.set("PATCH /api/passenger-app/me", {
        status,
        code: "unavailable",
      });
      render(<BookingScreen />);
      await screen.findByRole("button", { name: "我已閱讀並同意" });
      click("我已閱讀並同意");
      await screen.findByText("無法更新費用確認紀錄，請重試。");
      expect(screen.queryByLabelText("預約時間")).toBeNull();
      f.errors.clear();
      click("我已閱讀並同意");
      await form();
    },
  );
  it("a new fare version requires acknowledgement again", async () => {
    f.fare.version = "synthetic-fare-v2";
    render(<BookingScreen />);
    await screen.findByRole("button", { name: "我已閱讀並同意" });
    expect(screen.queryByLabelText("預約時間")).toBeNull();
  });
  it.each([{}, { minLeadTimeMinutes: -1, requireSmsVerification: false }])(
    "missing/invalid settings block instead of assuming fifteen",
    async (value) => {
      f.settings = value;
      render(<BookingScreen />);
      await screen.findByText("無法取得叫車設定，請重試。");
      expect(screen.queryByLabelText("預約時間")).toBeNull();
      expect(calls("/quotes")).toHaveLength(0);
    },
  );
  it("settings outage exposes an actionable retry", async () => {
    f.errors.set("GET /api/passenger-app/settings", {
      status: 404,
      code: "unavailable",
    });
    render(<BookingScreen />);
    await screen.findByText("無法取得叫車設定，請重試。");
    f.errors.clear();
    click("重試取得設定");
    await form();
  });
  it("native checkbox disables the real request; selected opaque method sends formal body", async () => {
    render(<BookingScreen paymentSelection={selection} />);
    await quote();
    expect(
      (screen.getByRole("button", { name: "確認叫車" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    click("確認叫車");
    expect(calls("/rides")).toHaveLength(0);
    confirmed();
    click("確認叫車");
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/ride?rideId=synthetic-owned-order"),
    );
    const request = calls("/rides")[0]!;
    expect(request.body).toMatchObject({
      fareSnapshotId: "synthetic-owned-quote",
      paymentMethodId: selection.paymentMethodId,
      scheduledAt: new Date("2099-10-11T12:00").toISOString(),
    });
    expect(request.body.passengerConfirmedAt).toEqual(expect.any(String));
    expect(request.headers.get("x-request-id")).toBeTruthy();
    expect(request.body).not.toHaveProperty("passengerId");
    expect(request.body).not.toHaveProperty("phone");
  });
  it("does not invent a default payment method or send empty/fake owned credentials", async () => {
    render(<BookingScreen />);
    await quote();
    confirmed();
    expect(
      (screen.getByRole("button", { name: "確認叫車" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(calls("/rides")).toHaveLength(0);
  });
  it("return to modify retains BOTH addresses and datetime-local time", async () => {
    render(<BookingScreen />);
    await quote();
    click("返回修改");
    await form();
    expect((screen.getByLabelText("預約時間") as HTMLInputElement).value).toBe(
      "2099-10-11T12:00",
    );
    expect(screen.getAllByRole("button", { name: "清除選點" })).toHaveLength(2);
  });
  it.each(["quote_expired", "FARE_QUOTE_EXPIRED"])(
    "real server %s retains full draft for requote",
    async (code) => {
      f.errors.set("POST /api/passenger-app/rides", { status: 409, code });
      render(<BookingScreen paymentSelection={selection} />);
      await quote();
      confirmed();
      click("確認叫車");
      await screen.findByText("費率試算已過期，請重新試算。");
      await form();
      expect(
        (screen.getByLabelText("預約時間") as HTMLInputElement).value,
      ).toBe("2099-10-11T12:00");
      expect(screen.getAllByRole("button", { name: "清除選點" })).toHaveLength(
        2,
      );
    },
  );
  it("past/short lead is rejected by real form/portable policy before quote HTTP", async () => {
    render(<BookingScreen />);
    await form();
    await selectAddress(0, "上車");
    await selectAddress(1, "下車");
    fireEvent.change(screen.getByLabelText("預約時間"), {
      target: { value: "2000-01-01T00:00" },
    });
    click("試算車資");
    await screen.findByText("預約時間不符合最短前置時間規定");
    expect(calls("/quotes")).toHaveLength(0);
  });
  it("not-serviceable is a refusal, never an E19b successful quote", async () => {
    f.serviceable = false;
    render(<BookingScreen />);
    await form();
    await selectAddress(0, "上車");
    await selectAddress(1, "下車");
    click("試算車資");
    await screen.findByText("您選擇的地點超出目前服務範圍");
    expect(screen.queryByLabelText("我已確認費用與優惠說明")).toBeNull();
    expect(calls("/rides")).toHaveLength(0);
  });
  it("real search no-match is visible without a mock geo provider", async () => {
    f.emptyCandidates = true;
    render(<BookingScreen />);
    await form();
    fireEvent.change(
      screen.getAllByPlaceholderText("請輸入街道、地點或地標")[0]!,
      { target: { value: "未知地址" } },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "搜尋" })[0]!);
    await screen.findAllByText("找不到相符的地址");
    expect(calls("/geo/health")).toHaveLength(0);
    expect(calls("/geo/evaluate")).toHaveLength(0);
  });
  it("actual map click executes portable reverse/BFF and retains the selected point", async () => {
    render(<BookingScreen />);
    await form();
    await selectAddress(0, "上車");
    const svg = screen.getAllByRole("img", {
      name: "Location preview map",
    })[0]!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent(
      svg,
      new MouseEvent("pointerup", { bubbles: true, clientX: 50, clientY: 50 }),
    );
    await waitFor(() => expect(calls("/geo/reverse")).toHaveLength(1));
    await screen.findByText("台北市圖釘測試位置");
    expect(calls("/geo/reverse")[0]!.body).toMatchObject({
      surface: "passenger_entry",
      location: { lat: expect.any(Number), lng: expect.any(Number) },
    });
    vi.restoreAllMocks();
  });
  it("actual picker address401 redirects to login", async () => {
    f.errors.set("GET /api/geo/search", { status: 401, code: "unauthorized" });
    render(<BookingScreen />);
    await form();
    fireEvent.change(
      screen.getAllByPlaceholderText("請輸入街道、地點或地標")[0]!,
      { target: { value: "地址" } },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "搜尋" })[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(calls("/quotes")).toHaveLength(0);
  });
  it("the formal SMS flag blocks unverified contact instead of inventing verification", async () => {
    f.settings = { minLeadTimeMinutes: 30, requireSmsVerification: true };
    render(<BookingScreen />);
    await screen.findByText("請先在帳號管理填寫已驗證手機號碼。");
    expect(screen.queryByLabelText("預約時間")).toBeNull();
  });
  it("permitted unverified contact is explicitly labelled unverified", async () => {
    render(<BookingScreen />);
    await form();
    await screen.findByText(/聯絡手機尚未驗證/);
  });
  it("actual picker surfaces address-service outage", async () => {
    f.errors.set("GET /api/geo/search", { status: 503, code: "unavailable" });
    render(<BookingScreen />);
    await form();
    fireEvent.change(
      screen.getAllByPlaceholderText("請輸入街道、地點或地標")[0]!,
      { target: { value: "地址" } },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "搜尋" })[0]!);
    await screen.findByText("目前無法搜尋地址，請稍後重試。");
    expect(calls("/quotes")).toHaveLength(0);
  });
  it.each(["quotes", "rides"])(
    "%s 401 goes to login through the real client/BFF",
    async (endpoint) => {
      render(<BookingScreen paymentSelection={selection} />);
      if (endpoint === "rides") {
        await quote();
        f.errors.set("POST /api/passenger-app/rides", {
          status: 401,
          code: "unauthorized",
        });
        confirmed();
        click("確認叫車");
      } else {
        await form();
        await selectAddress(0, "上車");
        await selectAddress(1, "下車");
        f.errors.set("POST /api/passenger-app/quotes", {
          status: 401,
          code: "unauthorized",
        });
        click("試算車資");
      }
      await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    },
  );
  it("quote503 keeps route context, canonical A04/support and functional requote", async () => {
    f.errors.set("POST /api/passenger-app/quotes", {
      status: 503,
      code: "unavailable",
    });
    render(<BookingScreen />);
    await form();
    await selectAddress(0, "上車");
    await selectAddress(1, "下車");
    click("試算車資");
    await screen.findByText("目前無法取得正式報價");
    expect(
      screen.getByRole("link", { name: "聯絡客服" }).getAttribute("href"),
    ).toBe("tel:02-2944-0985");
    expect(screen.getByText("台北市上車測試路1號")).toBeTruthy();
    expect(screen.getByText("台北市下車測試路1號")).toBeTruthy();
    f.errors.clear();
    click("重新取得報價");
    await screen.findByLabelText("我已確認費用與優惠說明");
    expect(calls("/quotes")).toHaveLength(2);
  });
  it("unknown create acknowledgement retries exactly the SAME request key/body", async () => {
    render(<BookingScreen paymentSelection={selection} />);
    await quote();
    f.errors.set("POST /api/passenger-app/rides", {
      status: 503,
      code: "unavailable",
    });
    confirmed();
    click("確認叫車");
    await screen.findByRole("button", { name: "重試同一筆叫車請求" });
    const first = calls("/rides")[0]!;
    f.errors.clear();
    click("重試同一筆叫車請求");
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/ride?rideId=synthetic-owned-order"),
    );
    const second = calls("/rides")[1]!;
    expect(second.body).toEqual(first.body);
    expect(second.headers.get("x-request-id")).toBe(
      first.headers.get("x-request-id"),
    );
    expect(calls("/quotes")).toHaveLength(1);
  });
  it("account switching clears the previous subject draft before any quote", async () => {
    render(<BookingScreen />);
    await form();
    await selectAddress(0, "上車");
    await selectAddress(1, "下車");
    f.account.drtsPassengerId = "synthetic-account-2";
    click("試算車資");
    await screen.findByRole("button", { name: "重試取得設定" });
    expect(calls("/quotes")).toHaveLength(0);
  });
  it("full fee link is genuinely reachable without discarding the parent draft", async () => {
    render(<BookingScreen />);
    await quote();
    const link = screen.getByRole("link", { name: "查看完整費用與優惠說明" });
    expect(link.getAttribute("href")).toBe("/fares");
    expect(link.getAttribute("target")).toBe("_blank");
    click("返回修改");
    await form();
    expect((screen.getByLabelText("預約時間") as HTMLInputElement).value).toBe(
      "2099-10-11T12:00",
    );
  });
  it("current quote expiry timer preserves the draft and disables stale submission", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    f.quoteExpires = new Date(Date.now() + 60_000).toISOString();
    render(<BookingScreen paymentSelection={selection} />);
    await quote();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });
    await screen.findByText("費率試算已過期，請重新試算。");
    expect((screen.getByLabelText("預約時間") as HTMLInputElement).value).toBe(
      "2099-10-11T12:00",
    );
    expect(calls("/rides")).toHaveLength(0);
  });
});

describe("real public fare component", () => {
  it("shows active API tariff values, authoritative free cancellation and no invented document number", async () => {
    render(<FaresPage />);
    await screen.findByText("起程 1.25 公里：NT$ 85");
    expect(screen.getByText("延滯計時每 60 秒：NT$ 5")).toBeTruthy();
    expect(screen.getByText("夜間 23:00–06:00 每趟加收 NT$ 20")).toBeTruthy();
    expect(screen.getByText(/任何允許取消的時間均不收取消費/)).toBeTruthy();
    expect(calls("/fares")).toHaveLength(1);
    expect(calls("/me")).toHaveLength(0);
  });
  it("public fare failure has a working retry", async () => {
    f.errors.set("GET /api/passenger-app/fares", {
      status: 503,
      code: "unavailable",
    });
    render(<FaresPage />);
    await screen.findByText("目前無法取得公開費率，請稍後重試。");
    f.errors.clear();
    click("重試公開費率");
    await screen.findByText("起程 1.25 公里：NT$ 85");
  });
});
