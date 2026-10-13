// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassengerClient } from "../../../packages/passenger-client/src/client";
import { PassengerBookingClient } from "../../../packages/passenger-client/src/booking/client";
import { PassengerPaymentClient } from "../../../packages/passenger-client/src/payment/client";
import {
  addDemoComplaint,
  advanceDemoRide,
  cancelDemoRide,
  DEMO_ADDRESSES,
  DEMO_OTP_CODE,
  getDemoReceipt,
  getDemoState,
  isDemoMode,
  rateDemoRide,
  resetDemo,
  retryDemoPayment,
  setDemoPaymentFailure,
  startDemo,
  stopDemo,
  subscribeDemo,
} from "../../../apps/passenger-app-web/lib/demo/store";
import { demoFetch } from "../../../apps/passenger-app-web/lib/demo/transport";

const auth = () => new PassengerClient({ baseUrl: "", fetchFn: demoFetch });
const booking = () =>
  new PassengerBookingClient({ baseUrl: "", fetchFn: demoFetch });
const payment = () =>
  new PassengerPaymentClient({ baseUrl: "", fetchFn: demoFetch });

async function login() {
  const client = auth();
  const command = {
    provider: "phone" as const,
    target: "0900000000",
    purpose: "login" as const,
  };
  const requested = await client.requestOtp(command);
  await client.login({
    ...command,
    challenge: requested.challenge,
    code: DEMO_OTP_CODE,
  });
  return client;
}

async function reserve(requestId = crypto.randomUUID()) {
  const binding = await payment().bindMethod({
    providerToken: "demo_card_fixture",
  });
  if (binding.status !== "completed")
    throw new Error("Expected completed demo binding");
  const origin = DEMO_ADDRESSES[0]!;
  const destination = DEMO_ADDRESSES[1]!;
  const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
  const quote = await booking().getFareQuote({
    originLat: origin.lat,
    originLng: origin.lng,
    destinationLat: destination.lat,
    destinationLng: destination.lng,
    scheduledAt,
  });
  if (quote.serviceAreaResult !== "serviceable")
    throw new Error("Expected demo quote");
  const command = {
    origin,
    destination,
    scheduledAt,
    paymentMethodId: binding.method.paymentMethodId,
    fareSnapshotId: quote.fareSnapshotId,
    passengerConfirmedAt: new Date().toISOString(),
  };
  const response = await booking().createRide(command, requestId);
  return { id: response.ride.order.orderId, command, requestId };
}

describe("Passenger functional demo transport", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDemo();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Unexpected real network call");
      }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("does not initialize on the server or perform a network fallback", async () => {
    vi.stubGlobal("window", undefined);
    expect(getDemoState()).toBeNull();
    expect(isDemoMode()).toBe(false);
    const response = await demoFetch("/api/passenger-app/me");
    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("walks the existing auth, payment and booking clients through one persistent journey", async () => {
    const client = await login();
    expect(client.sessionStatus.isActive).toBe(true);
    const updated = await client.updateAccount({
      displayName: "示意小王",
      termsVersion: "demo-terms",
      privacyVersion: "demo-privacy",
      feeAcknowledgementVersion: "demo-tariff-v1",
      contactConsent: true,
    });
    expect(updated.account.displayName).toBe("示意小王");
    expect((await booking().getSettings()).requireSmsVerification).toBe(false);
    const candidates = await booking().search({ q: "廣場" });
    expect(candidates.provider).toBe("demo");
    const resolved = await booking().resolve({
      candidateId: candidates.candidates[0]!.candidateId,
      addressText: "廣場",
      surface: "passenger_entry",
    });
    expect(resolved.address.lat).toBe(DEMO_ADDRESSES[0]!.lat);
    const { id, command, requestId } = await reserve();
    expect(
      (await booking().createRide(command, requestId)).ride.order.orderId,
    ).toBe(id);
    expect(getDemoState()?.rides).toHaveLength(1);
    startDemo();
    expect(getDemoState()?.account.termsVersion).toBe("demo-terms");
    expect(getDemoState()?.rides[0]?.id).toBe(id);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("completes a trip, retries simulated payment, and records rating and lost-item acknowledgement", async () => {
    await login();
    const { id } = await reserve();
    expect(() => getDemoReceipt(id)).toThrow("demo_receipt_not_ready");
    expect(advanceDemoRide(id).status).toBe("assigned");
    expect(advanceDemoRide(id).status).toBe("arrived");
    expect(advanceDemoRide(id).status).toBe("in_progress");
    expect(advanceDemoRide(id).paymentStatus).toBe("paid");
    setDemoPaymentFailure(id);
    expect(() => getDemoReceipt(id)).toThrow("demo_receipt_not_ready");
    await expect(reserve()).rejects.toMatchObject({
      code: "pending_payment_block",
    });
    expect(retryDemoPayment(id).paymentStatus).toBe("paid");
    rateDemoRide(id, 2, "示意乘車意見", true);
    const complaint = addDemoComplaint(id, {
      category: "lost_item",
      content: "示意遺失物協尋",
      lostItemDescription: "示意藍色雨傘",
      contactConsent: true,
    });
    expect(complaint.status).toBe("received");
    expect(getDemoState()?.rides[0]?.complaints).toHaveLength(2);
    const receipt = getDemoReceipt(id);
    expect(receipt.lines.reduce((total, line) => total + line.amount, 0)).toBe(
      receipt.amount,
    );
    expect(receipt.notice).toContain("虛構");
    const download = await demoFetch(
      `/api/passenger-app/rides/${id}/receipt/artifacts/html`,
    );
    expect(download.headers.get("content-type")).toContain("text/html");
    expect(await download.text()).toContain("示意乘車證明");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists cancellation and excludes terminal trips from active rides", async () => {
    await login();
    const { id } = await reserve();
    cancelDemoRide(id);
    expect(advanceDemoRide(id).status).toBe("cancelled");
    const active = await (
      await demoFetch("/api/passenger-app/rides/active")
    ).json();
    const history = await (
      await demoFetch("/api/passenger-app/rides?status=cancelled")
    ).json();
    expect(active.data.rides).toEqual([]);
    expect(history.data.rides[0].order.orderId).toBe(id);
  });

  it("retains the first submitted rating and one low-score complaint while allowing identical replay", async () => {
    await login();
    const { id } = await reserve();
    for (let stage = 0; stage < 4; stage++) advanceDemoRide(id);
    const submit = (command: Record<string, unknown>) =>
      demoFetch(`/api/passenger-app/rides/${id}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
    const original = {
      rating: 2,
      comments: " 原始評價 ",
      tags: ["繞路", " 駕駛態度 ", "繞路"],
      contactRequested: true,
    };
    expect((await submit(original)).status).toBe(200);
    const saved = getDemoState()?.rides[0];
    expect(saved).toMatchObject({
      rating: 2,
      ratingComment: "原始評價",
      ratingTags: ["繞路", "駕駛態度"],
      contactRequested: true,
    });
    expect(saved?.complaints).toHaveLength(1);
    expect(
      (
        await submit({
          ...original,
          tags: ["駕駛態度", "繞路"],
          comments: "原始評價",
        })
      ).status,
    ).toBe(200);
    expect(getDemoState()?.rides[0]).toEqual(saved);
    for (const changed of [
      { ...original, rating: 5 },
      { ...original, comments: "changed" },
      { ...original, tags: ["準時到達"] },
      { ...original, contactRequested: false },
    ]) {
      const rejected = await submit(changed);
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toMatchObject({
        error: { code: "demo_rating_already_submitted" },
      });
      expect(getDemoState()?.rides[0]).toEqual(saved);
    }
    expect(() => rateDemoRide(id, 5, "changed", false)).toThrow(
      "demo_rating_already_submitted",
    );
    expect(getDemoState()?.rides[0]).toEqual(saved);
  });

  it("accepts 200 comment characters and rejects a longer first submission without saving it", async () => {
    await login();
    const { id } = await reserve();
    for (let stage = 0; stage < 4; stage++) advanceDemoRide(id);
    expect(() => rateDemoRide(id, 4, "好".repeat(201))).toThrow(
      "demo_rating_invalid",
    );
    expect(getDemoState()?.rides[0]?.rating).toBeNull();
    const saved = rateDemoRide(id, 4, "好".repeat(200), false, ["準時到達"]);
    expect(saved.ratingComment).toHaveLength(200);
    expect(saved.ratingTags).toEqual(["準時到達"]);
    expect(rateDemoRide(id, 4, "好".repeat(200), false, ["準時到達"])).toEqual(
      saved,
    );
  });

  it("binds, changes default and removes demo cards without duplicate credential replays", async () => {
    await login();
    const client = payment();
    const first = await client.bindMethod({ providerToken: "demo_card_one" });
    await client.bindMethod({ providerToken: "demo_card_one" });
    const second = await client.bindMethod({ providerToken: "demo_card_two" });
    expect((await client.getMethods()).methods).toHaveLength(2);
    if (first.status !== "completed" || second.status !== "completed")
      throw new Error("Expected methods");
    await client.setDefault(second.method.paymentMethodId);
    expect(
      (await client.getMethods()).methods.find((method) => method.isDefault)
        ?.paymentMethodId,
    ).toBe(second.method.paymentMethodId);
    await client.removeMethod(second.method.paymentMethodId);
    expect((await client.getMethods()).methods[0]?.isDefault).toBe(true);
  });

  it("simulates OAuth callback locally and retains account linking across page reloads", async () => {
    await login();
    const client = auth();
    const started = await client.oauthStart({
      provider: "google",
      purpose: "link",
      redirectUri: `${window.location.origin}/auth/callback/google`,
    });
    const redirect = new URL(started.authUrl);
    expect(redirect.origin).toBe(window.location.origin);
    expect(
      await client.oauthCallback("google", {
        state: started.state,
        code: redirect.searchParams.get("code")!,
      }),
    ).toEqual({ result: "linked" });
    expect(
      (await client.getIdentities()).identities.map((item) => item.provider),
    ).toEqual(["phone", "google"]);
    vi.resetModules();
    const freshModule =
      await import("../../../apps/passenger-app-web/lib/demo/store");
    expect(freshModule.getDemoState()?.identities).toHaveLength(2);
    await client.logout();
    expect(getDemoState()?.loggedIn).toBe(false);
  });

  it("rejects the wrong demo code and unknown paths without calling external services", async () => {
    const client = auth();
    const requested = await client.requestOtp({
      provider: "email",
      target: "demo@example.invalid",
      purpose: "login",
    });
    await expect(
      client.login({
        provider: "email",
        target: "demo@example.invalid",
        challenge: requested.challenge,
        code: "000000",
      }),
    ).rejects.toMatchObject({ code: "invalid_code" });
    expect(
      (await demoFetch("https://external.example.invalid/provider")).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps mode and committed state unchanged when Storage.setItem throws", async () => {
    stopDemo();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });
    expect(() => startDemo()).toThrow("Quota exceeded");
    expect(isDemoMode()).toBe(false);
    setItem.mockRestore();
    startDemo();
    const client = await login();
    const before = getDemoState();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    await expect(
      client.updateAccount({ displayName: "未儲存姓名" }),
    ).rejects.toBeTruthy();
    expect(isDemoMode()).toBe(true);
    expect(getDemoState()).toEqual(before);
  });

  it("notifies subscribers, restores the same journey on re-entry, and resets only explicitly", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDemo(listener);
    await login();
    const { id } = await reserve();
    expect(listener).toHaveBeenCalled();
    stopDemo();
    expect(isDemoMode()).toBe(false);
    expect(startDemo().rides[0]?.id).toBe(id);
    resetDemo();
    expect(getDemoState()?.rides).toEqual([]);
    expect(getDemoState()?.loggedIn).toBe(false);
    unsubscribe();
    listener.mockClear();
    stopDemo();
    expect(listener).not.toHaveBeenCalled();
  });
});
