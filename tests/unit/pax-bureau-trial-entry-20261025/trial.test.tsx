// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  trial: true,
  review: true,
  push: vi.fn(),
  fetch: vi.fn(),
  login: vi.fn(),
  sms: vi.fn(),
  getMethods: vi.fn(),
  bindMethod: vi.fn(),
}));

vi.mock("../../../apps/passenger-app-web/node_modules/next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => "/trial",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => "/trial",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock(
  "../../../apps/passenger-app-web/components/review-demo/review-context",
  () => ({
    useReviewDemo: () => state.review,
    useReviewDemoPending: () => false,
    useTrialMode: () => state.trial,
  }),
);
vi.mock("../../../apps/passenger-app-web/lib/runtime-fetch", () => ({
  passengerFetch: (...args: unknown[]) => state.fetch(...args),
}));
vi.mock("../../../apps/passenger-app-web/lib/auth/client", () => ({
  createAuthClient: () => ({ login: state.login }),
}));
vi.mock(
  "../../../apps/passenger-app-web/components/review-demo/login-sms",
  () => ({
    requestReviewLoginSms: (...args: unknown[]) => state.sms(...args),
  }),
);
vi.mock("../../../apps/passenger-app-web/components/auth/consent-gate", () => ({
  ConsentGate: ({ onAccepted }: { onAccepted: () => void }) => {
    useEffect(() => onAccepted(), [onAccepted]);
    return <p>consent</p>;
  },
}));
vi.mock("@drts/passenger-client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PassengerPaymentClient: class {
    getMethods = state.getMethods;
    bindMethod = state.bindMethod;
  },
}));

import { TrialRideControls } from "../../../apps/passenger-app-web/components/trial/trial-ride-controls";
import { TrialEntry } from "../../../apps/passenger-app-web/components/trial/trial-entry";
import { isTrialMode } from "../../../apps/passenger-app-web/lib/trial/store";

const ORDER = "6b1f6a3e-2c4d-4e8f-9a1b-3c5d7e9f1a2b";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  state.trial = true;
  state.review = true;
  window.localStorage.clear();
  for (const fn of [
    state.push,
    state.fetch,
    state.login,
    state.sms,
    state.getMethods,
    state.bindMethod,
  ])
    fn.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TrialRideControls", () => {
  function rideStatus(status: string) {
    state.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `/api/passenger-app/rides/${ORDER}`)
        return json({ data: { ride: { order: { status } } } });
      if (init?.method === "POST" && url.endsWith("/trial/assign"))
        return json({ data: { status: "enroute_pickup" } });
      if (init?.method === "POST" && url.endsWith("/trial/heartbeat"))
        return json({ data: { status: "enroute_pickup" } });
      return json({}, 404);
    });
  }

  it("renders nothing outside the trial", () => {
    state.trial = false;
    const { container } = render(<TrialRideControls orderId={ORDER} />);
    expect(container.innerHTML).toBe("");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("assigns a test driver to the passenger's own ride, then reports in", async () => {
    rideStatus("ready_for_dispatch");
    render(<TrialRideControls orderId={ORDER} />);
    const assign = await screen.findByRole("button", { name: "派一台測試車" });
    fireEvent.click(assign);
    await screen.findByRole("button", { name: "讓司機立即抵達" });
    expect(state.fetch).toHaveBeenCalledWith(
      `/api/passenger-app/review-demo/rides/${ORDER}/trial/assign`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText(/測試司機已出發/)).toBeTruthy();
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledWith(
        `/api/passenger-app/review-demo/rides/${ORDER}/trial/heartbeat`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it.each([
    ["arrived_pickup", "我已上車", "board"],
    ["on_trip", "立即抵達目的地", "complete"],
  ])("offers the next driver step at %s", async (status, label, action) => {
    rideStatus(status);
    render(<TrialRideControls orderId={ORDER} />);
    fireEvent.click(await screen.findByRole("button", { name: label }));
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledWith(
        `/api/passenger-app/review-demo/rides/${ORDER}/trial/${action}`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("never drops a tap behind a pending heartbeat, nor lets it roll back", async () => {
    let releaseHeartbeat: (response: Response) => void = () => {};
    state.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `/api/passenger-app/rides/${ORDER}`)
        return json({
          data: { ride: { order: { status: "arrived_pickup" } } },
        });
      if (url.endsWith("/trial/heartbeat"))
        return new Promise<Response>((resolve) => {
          releaseHeartbeat = resolve;
        });
      if (init?.method === "POST" && url.endsWith("/trial/board"))
        return json({ data: { status: "on_trip" } });
      return json({}, 404);
    });
    render(<TrialRideControls orderId={ORDER} />);
    const board = await screen.findByRole("button", { name: "我已上車" });
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledWith(
        `/api/passenger-app/review-demo/rides/${ORDER}/trial/heartbeat`,
        expect.anything(),
      ),
    );
    fireEvent.click(board);
    await screen.findByRole("button", { name: "立即抵達目的地" });
    await act(async () => {
      releaseHeartbeat(json({ data: { status: "arrived_pickup" } }));
    });
    expect(screen.getByRole("button", { name: "立即抵達目的地" })).toBeTruthy();
  });

  it("shows the finished state without further driver buttons", async () => {
    rideStatus("completed");
    render(<TrialRideControls orderId={ORDER} />);
    await screen.findByText(/行程已完成/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explains a busy test fleet instead of a generic failure", async () => {
    state.fetch.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json({ error: { code: "PASSENGER_TRIAL_TRIP_SUPPLY_BUSY" } }, 409)
        : json({ data: { ride: { order: { status: "ready_for_dispatch" } } } }),
    );
    render(<TrialRideControls orderId={ORDER} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "派一台測試車" }),
    );
    await screen.findByText("測試車輛都在服務其他試用行程，請稍後再試。");
  });
});

describe("TrialEntry", () => {
  it("signs in with a synthetic phone, binds a test card and opens booking", async () => {
    state.sms.mockResolvedValue({
      success: true,
      challenge: "challenge-1",
      code: "123456",
    });
    state.login.mockResolvedValue({ result: "logged_in" });
    state.getMethods.mockResolvedValue({ methods: [] });
    state.bindMethod.mockResolvedValue({ status: "completed" });
    render(<TrialEntry />);
    fireEvent.click(screen.getByRole("button", { name: "開始試用" }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/"));
    const target = state.sms.mock.calls[0]![0] as string;
    expect(target).toMatch(/^09000000\d{2}$/);
    expect(state.login).toHaveBeenCalledWith({
      target,
      provider: "phone",
      code: "123456",
      challenge: "challenge-1",
    });
    expect(state.bindMethod).toHaveBeenCalledWith({
      providerToken: expect.stringMatching(/^synthetic_credential_/),
    });
    expect(isTrialMode()).toBe(true);
  });

  it("keeps an existing test card instead of binding another", async () => {
    state.sms.mockResolvedValue({
      success: true,
      challenge: "challenge-1",
      code: "123456",
    });
    state.login.mockResolvedValue({ result: "logged_in" });
    state.getMethods.mockResolvedValue({
      methods: [{ paymentMethodId: "pm-1" }],
    });
    render(<TrialEntry />);
    fireEvent.click(screen.getByRole("button", { name: "開始試用" }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/"));
    expect(state.bindMethod).not.toHaveBeenCalled();
  });

  it("stays on the entry with a retry when sign-in fails", async () => {
    state.sms.mockRejectedValue(new Error("down"));
    render(<TrialEntry />);
    fireEvent.click(screen.getByRole("button", { name: "開始試用" }));
    await screen.findByText("無法開始試用，請稍後再試。");
    expect(screen.getByRole("button", { name: "開始試用" })).toBeTruthy();
    expect(state.push).not.toHaveBeenCalled();
    expect(isTrialMode()).toBe(false);
    await act(async () => {});
  });
});
