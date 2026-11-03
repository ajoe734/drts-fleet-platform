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

import { TrialAutoDriver } from "../../../apps/passenger-app-web/components/trial/trial-auto-driver";
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

describe("TrialAutoDriver", () => {
  const ACTION_STATUS: Record<string, string | null> = {
    assign: "enroute_pickup",
    board: "on_trip",
    heartbeat: null,
  };
  function server(status: string, refuse = false) {
    // A stateful stand-in for the API: each action moves the ride and the
    // heartbeat reports wherever it currently is.
    let current = status;
    const actions: string[] = [];
    state.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `/api/passenger-app/rides/${ORDER}`)
        return json({ data: { ride: { order: { status: current } } } });
      const action = init?.method === "POST" ? url.split("/trial/")[1]! : "";
      actions.push(action);
      if (refuse)
        return json(
          { error: { code: "PASSENGER_TRIAL_TRIP_SUPPLY_BUSY" } },
          409,
        );
      const next = ACTION_STATUS[action];
      if (next === undefined) return json({}, 404);
      if (next) current = next;
      return json({ data: { status: current } });
    });
    return actions;
  }
  const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  });

  it("stays idle outside the trial", async () => {
    state.trial = false;
    const { container } = render(<TrialAutoDriver orderId={ORDER} />);
    await wait(60_000);
    expect(container.innerHTML).toBe("");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("dispatches the ride after a short wait and reports in, showing nothing", async () => {
    const actions = server("ready_for_dispatch");
    const { container } = render(<TrialAutoDriver orderId={ORDER} />);
    await wait(0);
    expect(actions).toEqual([]);
    await wait(5_000);
    expect(actions).toEqual(["assign"]);
    expect(state.fetch).toHaveBeenCalledWith(
      `/api/passenger-app/review-demo/rides/${ORDER}/trial/assign`,
      expect.objectContaining({ method: "POST" }),
    );
    await wait(5_000);
    expect(actions).toEqual(["assign", "heartbeat"]);
    expect(container.innerHTML).toBe("");
  });

  it("boards the passenger a few seconds after the driver arrives", async () => {
    const actions = server("arrived_pickup");
    render(<TrialAutoDriver orderId={ORDER} />);
    await wait(5_000);
    expect(actions).toEqual(["heartbeat"]);
    await wait(5_000);
    expect(actions).toEqual(["heartbeat", "board"]);
    // Riding, the driver keeps reporting in; the API ends the ride when the
    // simulated drive reaches the destination.
    await wait(10_000);
    expect(actions).toEqual(["heartbeat", "board", "heartbeat"]);
  });

  it("stops once the ride is finished", async () => {
    const actions = server("completed");
    render(<TrialAutoDriver orderId={ORDER} />);
    await wait(60_000);
    expect(actions).toEqual([]);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a busy test fleet after another wait", async () => {
    const actions = server("ready_for_dispatch", true);
    const { container } = render(<TrialAutoDriver orderId={ORDER} />);
    await wait(5_000);
    expect(actions).toEqual(["assign"]);
    await wait(5_000);
    expect(actions).toEqual(["assign", "assign"]);
    expect(container.innerHTML).toBe("");
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

  function readiness(...answers: boolean[]) {
    state.fetch.mockImplementation(async (url: string) => {
      if (url !== "/api/passenger-app/review-demo/trial/readiness")
        return json({}, 404);
      return json({ data: { can_book: answers.shift() ?? true } });
    });
  }

  it("signs in with another phone when the account cannot book", async () => {
    // Shared dev, 2026-11-01: synthetic accounts with an unsettled test
    // charge refused every booking; one in thirty trials landed on one.
    state.sms.mockResolvedValue({
      success: true,
      challenge: "challenge-1",
      code: "123456",
    });
    state.login.mockResolvedValue({ result: "logged_in" });
    state.getMethods.mockResolvedValue({
      methods: [{ paymentMethodId: "pm-1" }],
    });
    readiness(false, true);
    render(<TrialEntry />);
    fireEvent.click(screen.getByRole("button", { name: "開始試用" }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/"));
    const targets = state.sms.mock.calls.map(([target]) => target as string);
    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(2);
    expect(state.login).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: targets[1] }),
    );
    expect(isTrialMode()).toBe(true);
  });

  it("gives up after five accounts that cannot book", async () => {
    state.sms.mockResolvedValue({
      success: true,
      challenge: "challenge-1",
      code: "123456",
    });
    state.login.mockResolvedValue({ result: "logged_in" });
    readiness(false, false, false, false, false, false);
    render(<TrialEntry />);
    fireEvent.click(screen.getByRole("button", { name: "開始試用" }));
    await screen.findByText("無法開始試用，請稍後再試。");
    expect(state.sms).toHaveBeenCalledTimes(5);
    expect(state.push).not.toHaveBeenCalled();
    expect(isTrialMode()).toBe(false);
    await act(async () => {});
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
