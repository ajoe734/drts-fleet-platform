import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MultiTaxiElectronicReceipt,
  PassengerPaymentStatus,
  PassengerRideAuthorityView,
} from "@drts/contracts";

import {
  fetchPassengerReceipt,
  mapPassengerCertificate,
  mapPassengerPayment,
  mapPassengerRideAuthorityToFixture,
} from "../../lib/passenger-live";
import { getPassengerRideFixture } from "../../lib/passenger-fixtures";
import { resolvePassengerDataMode } from "../../lib/runtime-config";

function createAuthorityView(): PassengerRideAuthorityView {
  return {
    order: {
      orderId: "order-001",
      orderNo: "MTX-001",
      status: "created",
      timingMode: "on_demand",
      requestedPickupAt: "2026-07-23T00:00:00.000Z",
      pickup: { address: "台北車站" },
      dropoff: { address: "松山機場" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: null,
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: true,
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("passenger live authority", () => {
  it("forces live authority in production even when fixture mode is requested", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(resolvePassengerDataMode("fixture")).toBe("live");
  });

  it("does not invent assignment disclosure when authority has no assignment", () => {
    const fixture = mapPassengerRideAuthorityToFixture(
      createAuthorityView(),
      "opaque-token",
    );

    expect(fixture.assignment).toBeNull();
    expect(fixture.driver).toEqual({
      name: "尚未指派",
      vehicle: "尚未指派",
      plateNo: "尚未指派",
      color: "未提供",
      registrationMaskedDisplay: "尚未提供",
      registrationEffectiveUntil: "尚未提供",
      ratingState: "unavailable",
    });
    expect(fixture.canCancel).toBe(true);
    expect(fixture.canContact).toBe(false);
  });

  it("maps pre-trip disclosure from the immutable assignment authority", () => {
    const view = createAuthorityView();
    view.order.status = "assigned";
    view.assignment = getPassengerRideFixture(
      "P5-02",
      "fixture-token",
    ).assignment;
    view.actions.canContact = true;

    const fixture = mapPassengerRideAuthorityToFixture(view, "opaque-token");

    expect(fixture.assignment).toMatchObject({
      vehicle: {
        make: "Toyota",
        model: "Corolla Altis",
        modelYear: 2024,
        doorCount: 4,
      },
      driver: {
        registrationMaskedDisplay: "北市計字第12***67號",
      },
      rating: {
        averageRating: 4.9,
        ratingCount: 328,
      },
    });
    expect(fixture.pickupLabel).toBe("臺北市信義區松仁路 100 號");
    expect(fixture.routeFareText).toBe("預估 NT$ 355");
  });

  it.each<[PassengerPaymentStatus, string]>([
    ["not_selected", "尚未選擇付款方式"],
    ["authorized", "已授權，待完成扣款"],
    ["captured", "付款完成"],
    ["failed", "付款失敗"],
    ["refunded", "已退款"],
    ["manual_recovery", "請聯絡客服確認付款"],
  ])(
    "maps payment status %s without adding a retry command",
    (status, label) => {
      expect(
        mapPassengerPayment({
          status,
          amount: { amountMinor: 35500, currency: "NTD" },
        }),
      ).toMatchObject({
        status,
        label,
        amountText: "NT$ 355",
      });
    },
  );

  it("maps an existing rating to a non-repeatable rated state", () => {
    const view = createAuthorityView();
    view.order.status = "completed";
    view.order.completedAt = "2026-07-23T01:00:00.000Z";
    view.rating = {
      ratingId: "rating-001",
      orderId: "order-001",
      tripId: "trip-001",
      driverId: "driver-001",
      passengerSubjectRef: "passenger-001",
      score: 5,
      tags: [],
      comment: null,
      status: "active",
      submittedAt: "2026-07-23T01:01:00.000Z",
      updatedAt: "2026-07-23T01:01:00.000Z",
    };
    view.actions.canRate = false;

    const fixture = mapPassengerRideAuthorityToFixture(view, "opaque-token");

    expect(fixture.screenId).toBe("P5-09");
    expect(fixture.canRate).toBe(false);
    expect(fixture.ratingSummary).toMatchObject({
      state: "rated",
      scoreText: "5 星",
      countText: "評價已送出",
    });
  });

  it("keeps an unrated completed trip rateable when its certificate is ready", () => {
    const view = createAuthorityView();
    view.order.status = "completed";
    view.order.completedAt = "2026-07-23T01:00:00.000Z";
    view.receipt = createReceipt();
    view.actions.canRate = true;
    view.actions.canReadReceipt = true;

    const fixture = mapPassengerRideAuthorityToFixture(view, "opaque-token");

    expect(fixture.screenId).toBe("P5-08");
    expect(fixture.canRate).toBe(true);
    expect(fixture.certificate?.state).toBe("available");
  });

  it("maps certificate pending and complete legal-field states", () => {
    expect(mapPassengerCertificate(null, true)).toEqual({ state: "pending" });

    const certificate = mapPassengerCertificate(createReceipt(), true);

    expect(certificate.state).toBe("available");
    expect(certificate.rows?.map((row) => row.label)).toEqual([
      "乘車證明編號",
      "開立時間",
      "車號",
      "上車時間",
      "下車時間",
      "行駛時間",
      "路線",
      "行駛里程",
      "車資金額",
      "通行費",
      "客服電話",
      "主管機關申訴電話",
    ]);
  });

  it("fails closed when certificate legal fields are incomplete", () => {
    const receipt = createReceipt();
    receipt.record = {};

    expect(mapPassengerCertificate(receipt, true)).toEqual({
      state: "error",
      receiptNo: "RC-001",
      errorCode: "PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING",
    });
  });

  it("retries certificate reads through the token-scoped receipt endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: createReceipt() }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPassengerReceipt("opaque-token")).resolves.toMatchObject({
      receiptNo: "RC-001",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/control-plane-proxy/passenger-rides/opaque-token/receipt",
      { cache: "no-store" },
    );
  });
});

function createReceipt(): MultiTaxiElectronicReceipt {
  return {
    receiptId: "receipt-001",
    orderId: "order-001",
    receiptNo: "RC-001",
    amountMinor: 35500,
    currency: "TWD",
    issuedAt: "2026-07-23T01:05:00.000Z",
    record: {
      plateNo: "BKR-2208",
      pickupAt: "2026-07-23T00:20:00.000Z",
      dropoffAt: "2026-07-23T01:00:00.000Z",
      travelDurationSeconds: 2400,
      routeSummary: "台北車站至松山機場",
      distanceMeters: 6400,
      tollMinor: 0,
      consumerServicePhone: "0800-090-000",
      authorityComplaintPhone: "1999",
    },
  };
}
