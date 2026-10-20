// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PAX_REVIEW_STOPS } from "@drts/api-client";
import { BookingScreen } from "../../../apps/passenger-app-web/components/booking/booking-screen";
import {
  BOOKING_RECOVERY_KEY,
  saveBookingRecovery,
} from "../../../apps/passenger-app-web/components/booking/booking-draft-recovery";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import {
  bookingFixture,
  selection,
} from "../pax-web-booking-ui-20261009/fixture";

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext } = appRequire(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as typeof import("next/dist/shared/lib/hooks-client-context.shared-runtime");
const router = {
  bfcacheId: "uc03-review-recovery",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
let fixture: ReturnType<typeof bookingFixture>;
let finishConfig: (response: Response) => void;
let rejectConfig: (reason: Error) => void;
let configSignal: AbortSignal | null | undefined;
let configRequests: number;

beforeEach(() => {
  localStorage.clear();
  configRequests = 0;
  configSignal = undefined;
  fixture = bookingFixture();
  const originalFetch = globalThis.fetch;
  const config = new Promise<Response>((resolveConfig, reject) => {
    finishConfig = resolveConfig;
    rejectConfig = reject;
  });
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
    if (
      new URL(String(url), "https://ride.example.test").pathname ===
      "/api/passenger-app/review-demo/config"
    ) {
      configRequests++;
      configSignal = init?.signal;
      return config;
    }
    return originalFetch(url, init);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function restoreFixedDraft() {
  saveBookingRecovery(fixture.account.drtsPassengerId, {
    draft: {
      origin: PAX_REVIEW_STOPS[0],
      destination: PAX_REVIEW_STOPS[1],
      reviewAddressMode: "fixed",
      localTime: "2099-10-11T12:00",
    },
    pending: null,
  });
}
function open(pathname = "/") {
  return render(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={pathname}>
        <ReviewDemoProvider>
          <BookingScreen paymentSelection={selection} />
        </ReviewDemoProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}
async function loadedAccount() {
  await waitFor(() => {
    for (const path of ["/me", "/fares", "/settings"])
      expect(fixture.calls.some((call) => call.path.endsWith(path))).toBe(true);
  });
  await act(async () => {});
}
function assertNoQuoteOrOrder() {
  expect(
    fixture.calls.some(
      (call) => call.path.endsWith("/quotes") || call.path.endsWith("/rides"),
    ),
  ).toBe(false);
}

it("restores both original fixed points when review configuration arrives after the account draft", async () => {
  const localTime = "2099-10-11T12:00";
  saveBookingRecovery(fixture.account.drtsPassengerId, {
    draft: {
      origin: PAX_REVIEW_STOPS[0],
      destination: PAX_REVIEW_STOPS[1],
      reviewAddressMode: "fixed",
      localTime,
    },
    pending: null,
  });
  render(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/">
        <ReviewDemoProvider>
          <BookingScreen paymentSelection={selection} />
        </ReviewDemoProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  await waitFor(() => {
    for (const path of ["/me", "/fares", "/settings"])
      expect(fixture.calls.some((call) => call.path.endsWith(path))).toBe(true);
  });
  // Drain the actual account/draft render and picker effects while the external
  // config transport is still unresolved. No picker or recovery logic is mocked.
  await act(async () => {});
  await act(async () =>
    finishConfig(Response.json({ data: { enabled: true } })),
  );
  expect(
    ((await screen.findByLabelText("示範上車地點")) as HTMLSelectElement).value,
  ).toBe("review-banqiao");
  expect(
    (screen.getByLabelText("示範下車地點") as HTMLSelectElement).value,
  ).toBe("review-city-hall");
  expect((screen.getByLabelText("預約時間") as HTMLInputElement).value).toBe(
    localTime,
  );
  const recovered = JSON.parse(sessionStorage.getItem(BOOKING_RECOVERY_KEY)!);
  expect(recovered.draft.origin).toEqual(PAX_REVIEW_STOPS[0]);
  expect(recovered.draft.destination).toEqual(PAX_REVIEW_STOPS[1]);
});

it("requotes the restored points through the actual client and BFF without restoring fee consent", async () => {
  restoreFixedDraft();
  open();
  await loadedAccount();
  expect(screen.queryByLabelText("示範上車地點")).toBeNull();
  expect(screen.queryByRole("button", { name: "試算車資" })).toBeNull();
  assertNoQuoteOrOrder();
  await act(async () =>
    finishConfig(Response.json({ data: { enabled: true } })),
  );
  fireEvent.click(await screen.findByRole("button", { name: "試算車資" }));
  const consent = await screen.findByLabelText("我已確認費用與優惠說明");
  expect((consent as HTMLInputElement).checked).toBe(false);
  expect(
    (screen.getByRole("button", { name: "確認叫車" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const quotes = fixture.calls.filter((call) => call.path.endsWith("/quotes"));
  expect(quotes).toHaveLength(1);
  expect(quotes[0]!.body).toEqual({
    originLat: PAX_REVIEW_STOPS[0]!.lat,
    originLng: PAX_REVIEW_STOPS[0]!.lng,
    destinationLat: PAX_REVIEW_STOPS[1]!.lat,
    destinationLng: PAX_REVIEW_STOPS[1]!.lng,
    scheduledAt: new Date("2099-10-11T12:00").toISOString(),
  });
  expect(fixture.calls.some((call) => call.path.endsWith("/rides"))).toBe(
    false,
  );
});

it.each(["disabled", "HTTP failure", "network failure"])(
  "does not enable stored fixed points after %s and leaves the ordinary form usable",
  async (outcome) => {
    restoreFixedDraft();
    open();
    await loadedAccount();
    await act(async () => {
      if (outcome === "network failure") rejectConfig(new Error("offline"));
      else
        finishConfig(
          Response.json(
            { data: { enabled: outcome !== "disabled" } },
            { status: outcome === "HTTP failure" ? 503 : 200 },
          ),
        );
    });
    const inputs =
      await screen.findAllByPlaceholderText("請輸入街道、地點或地標");
    expect(inputs).toHaveLength(2);
    expect(screen.queryByLabelText("示範上車地點")).toBeNull();
    expect((screen.getByLabelText("預約時間") as HTMLInputElement).value).toBe(
      "2099-10-11T12:00",
    );
    const quote = screen.getByRole("button", {
      name: "試算車資",
    }) as HTMLButtonElement;
    expect(quote.disabled).toBe(true);
    assertNoQuoteOrOrder();
    // Ordinary addresses still use the real shared picker and client/BFF path;
    // a saved review flag cannot confer server review configuration.
    for (const [index, name] of ["一般上車", "一般下車"].entries()) {
      const input = inputs[index]!;
      const picker = input.closest("[data-address-map-picker]") as HTMLElement;
      fireEvent.change(input, { target: { value: name } });
      fireEvent.click(within(picker).getByRole("button", { name: "搜尋" }));
      fireEvent.click(
        await within(picker).findByRole("button", { name: new RegExp(name) }),
      );
      await within(picker).findByRole("button", {
        name: "清除選點",
      });
    }
    expect(quote.disabled).toBe(false);
    fireEvent.click(quote);
    expect(
      (
        (await screen.findByLabelText(
          "我已確認費用與優惠說明",
        )) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      fixture.calls.filter((call) => call.path.endsWith("/quotes")),
    ).toHaveLength(1);
    expect(fixture.calls.some((call) => call.path.endsWith("/rides"))).toBe(
      false,
    );
  },
);

it("bounds an unanswered configuration request and ignores its late enabled acknowledgement", async () => {
  vi.useFakeTimers();
  restoreFixedDraft();
  open();
  await act(async () => {});
  expect(screen.queryByRole("button", { name: "試算車資" })).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(29_999));
  expect(screen.queryByRole("button", { name: "試算車資" })).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(configSignal?.aborted).toBe(true);
  expect(screen.getAllByPlaceholderText("請輸入街道、地點或地標")).toHaveLength(
    2,
  );
  await act(async () =>
    finishConfig(Response.json({ data: { enabled: true } })),
  );
  expect(screen.queryByLabelText("示範上車地點")).toBeNull();
  expect(
    (screen.getByRole("button", { name: "試算車資" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  assertNoQuoteOrOrder();
});

it("aborts configuration on unmount and does not let the old acknowledgement affect a remount", async () => {
  restoreFixedDraft();
  const view = open();
  await loadedAccount();
  const oldSignal = configSignal;
  view.unmount();
  expect(oldSignal?.aborted).toBe(true);
  await act(async () =>
    finishConfig(Response.json({ data: { enabled: true } })),
  );
  // A second transport failure cannot inherit the previous provider's enabled state.
  const priorFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) =>
    String(url).endsWith("/review-demo/config")
      ? Promise.reject(new Error("offline after remount"))
      : priorFetch(url, init),
  );
  open();
  expect(
    await screen.findAllByPlaceholderText("請輸入街道、地點或地標"),
  ).toHaveLength(2);
  expect(screen.queryByLabelText("示範上車地點")).toBeNull();
  assertNoQuoteOrOrder();
});

it("leaves the existing local demo entry usable without requesting review configuration", async () => {
  open("/demo");
  await loadedAccount();
  expect(
    await screen.findAllByPlaceholderText("請輸入街道、地點或地標"),
  ).toHaveLength(2);
  expect(configRequests).toBe(0);
  expect(configSignal).toBeUndefined();
  assertNoQuoteOrOrder();
});
