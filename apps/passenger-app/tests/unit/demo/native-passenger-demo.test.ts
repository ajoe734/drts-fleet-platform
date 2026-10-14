import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NativePassengerRideStream,
  NativePassengerReceiptDownloads,
  createNativePassengerBinaryTransport,
  createNativePassengerFetch,
} from "@drts/passenger-client";
import type {
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";
import { NativePassengerRuntime } from "../../../lib/native-passenger-runtime";
import {
  createNativePassengerDemoRuntimeOptions,
  NATIVE_DEMO_BASE_URL,
} from "../../../lib/demo/native-passenger-demo";
const NOW = Date.parse("2026-10-14T16:00:00Z");
const allocated: NativePassengerRuntime[] = [];
afterEach(() => {
  for (const runtime of allocated.splice(0)) runtime.dispose();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal("fetch", () => {
    throw new Error("Demo must not perform network I/O");
  });
  const options = createNativePassengerDemoRuntimeOptions({ now: () => NOW });
  const runtime = new NativePassengerRuntime(options);
  allocated.push(runtime);
  return { runtime, options, scenario: options.demoScenario };
}
async function login(runtime: NativePassengerRuntime) {
  const challenge = await runtime.session.requestOtp({
    target: "demo@example.invalid",
    provider: "email",
    purpose: "login",
  });
  await runtime.session.verifyOtp({
    target: "demo@example.invalid",
    provider: "email",
    code: "123456",
    challenge: challenge.challenge,
  });
}
async function reserve(runtime: NativePassengerRuntime, key: string) {
  const { candidates } = await runtime.booking.search({ q: "示意" });
  const addresses = await Promise.all(
    candidates.map((candidate) =>
      runtime.booking.resolve({
        candidateId: candidate.candidateId,
        addressText: candidate.address ?? candidate.displayName,
        surface: "passenger_entry",
      }),
    ),
  );
  const [origin, destination] = addresses.map((result) => result.address);
  const scheduledAt = new Date(NOW + 3600000).toISOString();
  const quote = await runtime.booking.getFareQuote({
    originLat: origin!.lat,
    originLng: origin!.lng,
    destinationLat: destination!.lat,
    destinationLng: destination!.lng,
    scheduledAt,
  });
  if (quote.serviceAreaResult !== "serviceable")
    throw new Error("Demo quote unavailable");
  const { methods } = await runtime.payment.getMethods();
  const command = {
    origin: origin!,
    destination: destination!,
    scheduledAt,
    paymentMethodId: methods[0]!.paymentMethodId,
    fareSnapshotId: quote.fareSnapshotId,
    passengerConfirmedAt: new Date(NOW).toISOString(),
  };
  return {
    ...(await runtime.booking.createRide(command, key)),
    command,
    quote,
  };
}
function complete(scenario: ReturnType<typeof setup>["scenario"], id: string) {
  for (let i = 0; i < 4; ++i) scenario.controls.advanceTrip(id);
}
async function flush() {
  for (let i = 0; i < 40; ++i) await Promise.resolve();
}

describe("Explicit Native demo through actual raw session and passenger SDK", () => {
  it("labels every boundary and logs in with a real challenge, stores only synthetic tokens and rotates then logs out", async () => {
    const { runtime, scenario, options } = setup();
    expect(options.mode).toBe("demo");
    expect(options.baseUrl).toBe(NATIVE_DEMO_BASE_URL);
    expect(scenario.notice).toContain("模擬示意");
    const challenge = await runtime.session.requestOtp({
      target: "demo@example.invalid",
      provider: "email",
      purpose: "login",
    });
    await expect(
      runtime.session.verifyOtp({
        target: "demo@example.invalid",
        provider: "email",
        challenge: challenge.challenge,
        code: "000000",
      }),
    ).rejects.toMatchObject({ code: "invalid_code" });
    await runtime.session.verifyOtp({
      target: "demo@example.invalid",
      provider: "email",
      challenge: challenge.challenge,
      code: "123456",
    });
    const before = await scenario.store.read();
    expect(before?.accessToken).toMatch(/^DEMO-access-/);
    expect((await runtime.passenger.getAccount()).displayName).toContain(
      "DEMO",
    );
    await runtime.session.refresh();
    expect((await scenario.store.read())?.accessToken).not.toBe(
      before?.accessToken,
    );
    expect((await runtime.session.logout()).remoteRevocation).toBe("confirmed");
    expect(await scenario.store.read()).toBeNull();
  });
  it("uses the existing OAuth transaction and synthetic browser callback without contacting a provider", async () => {
    const { runtime, scenario } = setup();
    const start = await runtime.session.oauthStart({
      provider: "google",
      purpose: "login",
      redirectUri: "drtspassenger://auth/callback",
    });
    const returned = await scenario.browser.openAuthSession(
      start.authUrl,
      "drtspassenger://auth/callback",
    );
    expect(returned.type).toBe("success");
    const result = await runtime.session.oauthCallback({
      provider: "google",
      code: "DEMO-browser-code",
      state: start.state,
      transactionId: start.transactionId,
    });
    expect(result.result).toBe("logged_in");
    expect(
      (await runtime.passenger.getIdentities()).identities[0]?.provider,
    ).toBe("google");
  });
  it("saves profile/consent, verifies contact phone and links email through the existing commands", async () => {
    const { runtime } = setup();
    await login(runtime);
    expect(
      (
        await runtime.passenger.updateAccount({
          displayName: "示意更新",
          contactPhone: "0900000001",
          contactConsent: true,
        })
      ).account.displayName,
    ).toBe("示意更新");
    for (const command of [
      {
        target: "0900000001",
        provider: "phone",
        purpose: "verify_contact_phone",
      },
      { target: "linked@example.invalid", provider: "email", purpose: "link" },
    ] as const) {
      const challenge = await runtime.session.requestOtp(command);
      await runtime.session.verifyOtp(
        {
          target: command.target,
          provider: command.provider,
          code: "123456",
          challenge: challenge.challenge,
        },
        "authenticated",
      );
    }
    expect((await runtime.passenger.getAccount()).contactPhoneVerified).toBe(
      true,
    );
    expect((await runtime.passenger.getIdentities()).identities).toHaveLength(
      2,
    );
  });
  it("uses current geo/settings/fare/quote/create DTOs and preserves booking request identity", async () => {
    const { runtime, scenario } = setup();
    await login(runtime);
    expect(await runtime.booking.getSettings()).toEqual({
      minLeadTimeMinutes: 15,
      requireSmsVerification: false,
    });
    expect((await runtime.booking.getFares()).currentVersion.version).toBe(
      "DEMO-captured-tariff",
    );
    const first = await reserve(runtime, "DEMO-request-same");
    const repeated = await runtime.booking.createRide(
      first.command,
      "DEMO-request-same",
    );
    expect(repeated.ride.order.orderId).toBe(first.ride.order.orderId);
    expect(first.quote.estimatedMin).toBe(260);
    expect(first.ride.order.pickup.address).toContain("示意");
    expect((await runtime.passenger.getActiveRides()).rides).toHaveLength(1);
    expect(
      scenario.calls().some((call) => call.url.includes("/api/geo/search?")),
    ).toBe(true);
    expect(
      scenario
        .calls()
        .every((call) => call.url.startsWith(NATIVE_DEMO_BASE_URL)),
    ).toBe(true);
  });
  it("paginates actual owned history and reads owned detail instead of inventing a booking history API", async () => {
    const { runtime } = setup();
    await login(runtime);
    const one = await reserve(runtime, "one");
    const two = await reserve(runtime, "two");
    const first = await runtime.passenger.getRides({ limit: 1 });
    expect(first.rides[0]?.order.orderId).toBe(two.ride.order.orderId);
    const next = await runtime.passenger.getRides({
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(next.rides[0]?.order.orderId).toBe(one.ride.order.orderId);
    expect(
      (await runtime.passenger.getRide(one.ride.order.orderId)).ride.order
        .orderNo,
    ).toMatch(/^DEMO-/);
  });
  it("binds a synthetic opaque credential, sets default and removes it through the actual payment decoder", async () => {
    const { runtime, options } = setup();
    await login(runtime);
    if (options.paymentFields.status !== "ready")
      throw new Error("Missing demo fields");
    const credential = await options.paymentFields.port.collectCredential();
    const bound = await runtime.payment.bindMethod(credential);
    if (bound.status !== "completed") throw new Error("Unexpected demo action");
    const selected = await runtime.payment.setDefault(
      bound.method.paymentMethodId,
    );
    expect(selected.status).toBe("completed");
    expect(
      (await runtime.payment.getMethods()).methods.find(
        (card) => card.paymentMethodId === bound.method.paymentMethodId,
      )?.isDefault,
    ).toBe(true);
    await runtime.payment.removeMethod(bound.method.paymentMethodId);
    expect((await runtime.payment.getMethods()).methods).toHaveLength(1);
  });
  it("feeds real incremental native SSE/decoder events from local driver progress and pauses/resyncs AppState", async () => {
    const { runtime, scenario } = setup();
    await login(runtime);
    const { ride } = await reserve(runtime, "stream");
    const views: PassengerRideAuthorityView[] = [];
    const events: PassengerRideSseEventEnvelope[] = [];
    const errors: unknown[] = [];
    const stream = new NativePassengerRideStream({
      baseUrl: NATIVE_DEMO_BASE_URL,
      orderId: ride.order.orderId,
      session: runtime.session,
      client: runtime.passenger,
      ...scenario.events,
      onRide: (view) => views.push(view),
      onEvent: (event) => events.push(event),
      onConnection() {},
      onError: (error) => errors.push(error),
    });
    await stream.start();
    scenario.controls.advanceTrip(ride.order.orderId);
    await flush();
    expect(events[0]?.eventType).toBe("assignment_disclosure_ready");
    expect(events[0]?.data.assignment?.vehicle.plateNo).toBe("DEMO-001");
    scenario.controls.appState("background");
    scenario.controls.advanceTrip(ride.order.orderId);
    await flush();
    expect(events).toHaveLength(1);
    scenario.controls.appState("active");
    await flush();
    expect(views.at(-1)?.order.status).toBe("arrived_pickup");
    scenario.controls.advanceTrip(ride.order.orderId);
    await flush();
    scenario.controls.advanceTrip(ride.order.orderId);
    await flush();
    expect(events.at(-1)?.data.order.status).toBe("completed");
    expect(errors).toEqual([]);
    stream.stop();
    expect(
      scenario.calls().some((call) => /advance|fail-payment/.test(call.url)),
    ).toBe(false);
  });
  it("demonstrates failed payment blocking then local simulated payment completion without PSP I/O", async () => {
    const { runtime, scenario } = setup();
    await login(runtime);
    const { ride } = await reserve(runtime, "paid");
    complete(scenario, ride.order.orderId);
    scenario.controls.setPaymentFailed(ride.order.orderId);
    expect(
      (await runtime.passenger.getRide(ride.order.orderId)).ride.receipt,
    ).toBeNull();
    await expect(reserve(runtime, "blocked")).rejects.toMatchObject({
      code: "pending_payment_block",
    });
    scenario.controls.completeDemoPayment(ride.order.orderId);
    expect(
      (await runtime.passenger.getRide(ride.order.orderId)).ride.payment
        ?.status,
    ).toBe("captured");
    await expect(reserve(runtime, "recovered")).resolves.toHaveProperty("ride");
  });
  it("submits rating/contact consent and idempotent complaint, then downloads labeled full-fact HTML bytes with PDF unavailable", async () => {
    const { runtime, scenario } = setup();
    await login(runtime);
    const { ride } = await reserve(runtime, "receipt");
    complete(scenario, ride.order.orderId);
    await runtime.passenger.rateRide(ride.order.orderId, {
      rideId: ride.order.orderId,
      rating: 2,
      comments: "示意服務意見",
      contactRequested: true,
    });
    const command = {
      rideId: ride.order.orderId,
      category: "lost_item" as const,
      content: "示意雨傘",
      lostItemDescription: "DEMO雨傘",
      contactConsent: true,
    };
    const first = await runtime.passenger.createComplaint(
      ride.order.orderId,
      command,
      "DEMO-complaint",
    );
    expect(
      await runtime.passenger.createComplaint(
        ride.order.orderId,
        command,
        "DEMO-complaint",
      ),
    ).toEqual(first);
    expect(scenario.complaints(ride.order.orderId)).toHaveLength(2);
    const fetchFn = createNativePassengerFetch({
      baseUrl: NATIVE_DEMO_BASE_URL,
      fetchFn: scenario.fetchFn,
      session: runtime.session,
    });
    const downloads = new NativePassengerReceiptDownloads({
      baseUrl: NATIVE_DEMO_BASE_URL,
      client: runtime.passenger,
      fetchFn,
      session: runtime.session,
      binary: createNativePassengerBinaryTransport(
        scenario.receipts.createRequest,
      ),
      files: scenario.receipts.files,
    });
    await expect(
      downloads.download(ride.order.orderId, "pdf"),
    ).rejects.toMatchObject({ code: "receipt_format_unavailable" });
    const result = await downloads.download(ride.order.orderId, "html");
    expect(result.receipt.record.e04Snapshot!.fleetOperatorName).toContain(
      "DEMO",
    );
    expect(result.downloads.pdfUrl).toBeUndefined();
    expect(new TextDecoder().decode(scenario.getFile(result.uri))).toContain(
      "不提供PDF或正式憑證",
    );
    expect(result.byteLength).toBeGreaterThan(200);
    expect(scenario.getSnapshot().lastOpenedFile).toBe(result.uri);
    downloads.dispose();
  });
  it("cancels a real SDK demo reservation and deletes the synthetic account with explicit local session cleanup", async () => {
    const { runtime, scenario } = setup();
    await login(runtime);
    const { ride } = await reserve(runtime, "cancel");
    await runtime.passenger.cancelRide(ride.order.orderId, {
      rideId: ride.order.orderId,
    });
    const current = (await runtime.passenger.getRide(ride.order.orderId)).ride;
    expect(current.order.status).toBe("cancelled");
    expect(current.actions.canCancel).toBe(false);
    expect(current.payment?.amount?.amountMinor).toBe(0);
    expect(
      (await runtime.passenger.getRides({ status: "cancelled" })).rides,
    ).toHaveLength(1);
    await runtime.passenger.deleteAccount();
    await runtime.session.clear();
    expect(await scenario.store.read()).toBeNull();
    expect(scenario.getSnapshot().lastAction).toContain("未刪除正式帳號");
  });
});
