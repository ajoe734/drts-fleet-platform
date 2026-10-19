import { describe, expect, it } from "vitest";
import type {
  MultiTaxiElectronicReceipt,
  PassengerDispatchDisclosureSnapshot,
  PassengerRideSseEventEnvelope,
  PassengerTripRatingRecord,
} from "@drts/contracts";
import {
  getNativePassengerLocationPresentation,
  joinNativePassengerReceiptDownloads,
  mapNativePassengerCertificate,
  mapNativePassengerPayment,
  mapNativePassengerRideAuthorityToFixture,
  mapNativePassengerRidePresentation,
  reduceNativePassengerRideEvent,
  resolveNativePassengerScreenId,
  retainNativePassengerQuoteAnomaly,
  type NativePassengerRideAuthority,
} from "../../../packages/passenger-client/src/ride/native-presentation";

// Synthetic captured facts; actual mapper/reducer code, no provider or runtime.
const NOW = Date.parse("2026-10-14T13:30:00Z");
const options = { nowMs: NOW, connectionState: "connected" as const };

function assignment(): PassengerDispatchDisclosureSnapshot {
  return {
    snapshotId: "SNAPSHOT",
    runtimeProfileCode: "multi_taxi_direct",
    orderId: "ORDER",
    bookingId: null,
    dispatchJobId: "JOB",
    assignmentId: "ASSIGNMENT",
    assignmentVersion: 1,
    vehicle: {
      vehicleId: "VEHICLE",
      make: "Captured make",
      model: "Captured model",
      plateNo: "TEST-001",
      modelYear: 2025,
      doorCount: 4,
      color: "Captured color",
      profileVersion: 7,
    },
    driver: {
      driverId: "DRIVER",
      displayName: "Captured driver",
      registrationMaskedDisplay: "TEST***01",
      registrationStatus: "verified_active",
      registrationEffectiveUntil: "2027-01-01T00:00:00Z",
      credentialVersion: 9,
    },
    rating: {
      displayState: "rated",
      averageRating: 4.8,
      ratingCount: 17,
      aggregateVersion: 4,
    },
    eta: {
      minutes: 5,
      calculatedAt: "2026-10-14T13:29:55Z",
      locationFreshness: "fresh",
    },
    routeFare: {
      routeSnapshotId: "ROUTE",
      quoteSnapshotId: "QUOTE",
      orderId: "ORDER",
      pickup: {
        address: "Captured pickup",
        lat: 25,
        lng: 121,
        coordinateSource: "manual_pin",
        geocodeConfidence: "manual",
        resolvedAt: "2026-10-14T12:58:00Z",
      },
      dropoff: {
        address: "Captured dropoff",
        lat: 25.1,
        lng: 121.1,
        coordinateSource: "manual_pin",
        geocodeConfidence: "manual",
        resolvedAt: "2026-10-14T12:58:00Z",
      },
      estimatedDistanceMeters: 4321,
      estimatedDurationSeconds: 789,
      encodedPolyline: null,
      chargingMode: "meter_estimate",
      estimatedFareMinor: 32100,
      payableFareMinor: 30000,
      currency: "TWD",
      farePolicyId: "POLICY",
      farePolicyVersion: "7",
      fareChangeRuleId: "RULE",
      fareChangeRuleVersion: "2",
      fareChangeRuleDisplayText: "Captured fee rule",
      passengerConfirmedAt: "2026-10-14T13:00:00Z",
      generatedAt: "2026-10-14T12:59:00Z",
    },
    createdAt: "2026-10-14T13:10:00Z",
    supersededAt: null,
  };
}

function authority(): NativePassengerRideAuthority {
  return {
    order: {
      orderId: "ORDER",
      orderNo: "ORD-CAPTURED-77",
      status: "assigned",
      timingMode: "scheduled",
      requestedPickupAt: "2026-10-14T13:00:00Z",
      pickup: { address: "Original pickup" },
      dropoff: { address: "Original dropoff" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: null,
    },
    assignment: assignment(),
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: true,
      canRate: false,
      canContact: true,
      canReadReceipt: false,
    },
  };
}

function rating(): PassengerTripRatingRecord {
  return {
    ratingId: "RATING",
    orderId: "ORDER",
    tripId: "TRIP",
    driverId: "DRIVER",
    passengerSubjectRef: "SUBJECT",
    score: 2,
    tags: ["Captured feedback"],
    comment: "Captured comment",
    status: "active",
    submittedAt: "2026-10-14T13:25:00Z",
    updatedAt: "2026-10-14T13:25:00Z",
  };
}

function receipt(): MultiTaxiElectronicReceipt {
  return {
    receiptId: "RECEIPT",
    orderId: "ORDER",
    receiptNo: "RECEIPT-UNIQUE-77",
    amountMinor: 54321,
    currency: "TWD",
    issuedAt: "2026-10-14T13:21:00Z",
    record: {
      tripId: "TRIP",
      plateNo: "TEST-7788",
      pickupAt: "2026-10-14T13:00:00Z",
      dropoffAt: "2026-10-14T13:20:00Z",
      travelDurationSeconds: 1207,
      routeSummary: "Captured alpha to beta",
      distanceMeters: 12345,
      tollMinor: 3700,
      consumerServicePhone: "TEST-SUPPORT-77",
      authorityComplaintPhone: "TEST-AUTHORITY-88",
      htmlUrl: "/captured/receipt.html",
      e04Snapshot: {
        fleetOperatorName: "Captured operator",
        driverSurname: "Captured surname",
        driverRegistrationMasked: "TEST***77",
        paymentMethodDisplay: "Captured payment",
        fareBreakdown: {
          startMinor: 1100,
          distanceMinor: 2200,
          delayMinor: 3300,
          nightMinor: 0,
        },
      },
    },
  };
}

function event(
  eventVersion: number,
  data: NativePassengerRideAuthority,
  eventType: PassengerRideSseEventEnvelope["eventType"] = "eta_changed",
): PassengerRideSseEventEnvelope {
  return {
    eventId: "EVENT-" + eventVersion,
    eventType,
    eventVersion,
    assignmentVersion: data.assignment?.assignmentVersion ?? null,
    orderId: data.order.orderId,
    occurredAt: "2000-01-01T00:00:00Z",
    data,
  };
}

describe("native accepted P5 authority projection", () => {
  it("uses actual captured assignment/route/amounts without replacing the input", () => {
    const view = authority();
    const before = JSON.stringify(view);
    const result = mapNativePassengerRidePresentation(
      view,
      "OWNED-ID",
      options,
    );
    expect(result.fixture).toMatchObject({
      token: "OWNED-ID",
      orderNo: "ORD-CAPTURED-77",
      screenId: "P5-02",
      pickupLabel: "Captured pickup",
      dropoffLabel: "Captured dropoff",
      routeDistanceKm: "約 4.3 公里",
      routeDurationMinutes: "約 14 分鐘",
      routeFareText: "應付 NT$ 300",
      driver: { name: "Captured driver", plateNo: "TEST-001" },
    });
    expect(result.fixture.requestedPickupText).toContain("預約時間");
    expect(result.location).toEqual({
      state: "fresh",
      calculatedAtMs: NOW - 5000,
      elapsedSeconds: 5,
    });
    expect(JSON.stringify(view)).toBe(before);
  });

  it.each([false, true])(
    "hides active cancelled content even with retained assignment=%s",
    (hasAssignment) => {
      const view = authority();
      view.order.status = "cancelled";
      view.order.cancelledAt = "2026-10-14T13:22:00Z";
      view.assignment = hasAssignment ? view.assignment : null;
      view.actions = {
        canCancel: true,
        canRate: true,
        canContact: true,
        canReadReceipt: true,
      };
      const result = mapNativePassengerRidePresentation(view, "OWNED-ID", {
        ...options,
        quoteAnomalyCode: "P5_QUOTE_PROVIDER_UNAVAILABLE",
      });
      expect(result.contentKind).toBe("cancelled_terminal");
      expect(result.showActiveTripContent).toBe(false);
      expect(result.fixture).toMatchObject({
        screenId: "P5-01",
        status: "行程已取消",
        mapState: "missing",
        canCancel: false,
        canRate: false,
        canContact: false,
        canReadReceipt: false,
      });
      for (const value of [
        result.fixture.etaMain,
        result.fixture.etaSub,
        result.fixture.routeFareText,
        result.fixture.cancelNote,
        result.fixture.quoteAnomalyCode,
      ])
        expect(value).toBeUndefined();
      expect(result.location).toEqual({
        state: "missing",
        calculatedAtMs: 0,
        elapsedSeconds: null,
      });
      expect(result.receiptFormats).toEqual([]);
      expect(result.fixture.orderNo).toBe("ORD-CAPTURED-77");
      expect(result.fixture.cancelledAtText).toBeTruthy();
      expect(result.fixture.pickupLabel).toBe(
        hasAssignment ? "Captured pickup" : "Original pickup",
      );
    },
  );

  it.each([
    ["created", "P5-01"],
    ["assigned", "P5-11"],
    ["driver_accepted", "P5-11"],
    ["enroute_pickup", "P5-11"],
    ["redispatch_required", "P5-04"],
    ["arrived_pickup", "P5-06"],
    ["on_trip", "P5-07"],
    ["completed", "P5-08"],
    ["cancelled", "P5-01"],
  ] as const)(
    "preserves %s terminal/disclosure precedence -> %s",
    (status, screen) => {
      const view = authority();
      view.order.status = status;
      view.assignment = null;
      expect(resolveNativePassengerScreenId(view, "ride")).toBe(screen);
    },
  );

  it("distinguishes new driver, replacement and unavailable direct contact", () => {
    const view = authority();
    view.assignment!.rating.displayState = "new_driver";
    expect(resolveNativePassengerScreenId(view, "ride")).toBe("P5-03");
    view.assignment!.assignmentVersion = 2;
    expect(resolveNativePassengerScreenId(view, "ride")).toBe("P5-05");
    view.actions.canContact = false;
    const fixture = mapNativePassengerRideAuthorityToFixture(view, "OWNED-ID");
    expect(fixture.screenId).toBe("P5-12");
    expect(fixture.actionMode).toBe("support_only");
    expect(fixture.contactSafetyNote).toContain("客服");
  });

  it("completed/rated terminal state beats retained quote context", () => {
    const view = authority();
    view.order.status = "completed";
    view.assignment = null;
    view.actions.canRate = true;
    view.quoteAnomalyCode = "P5_QUOTE_PROVIDER_UNAVAILABLE";
    expect(resolveNativePassengerScreenId(view, "ride")).toBe("P5-08");
    view.rating = rating();
    expect(resolveNativePassengerScreenId(view, "ride")).toBe("P5-09");
    expect(resolveNativePassengerScreenId(view, "fares")).toBe("A03");
    expect(resolveNativePassengerScreenId(view, "receipt")).toBe("P5-10");
  });

  it("retains actual order/route/time when supported retry still reports A04", () => {
    const known = mapNativePassengerRideAuthorityToFixture(
      authority(),
      "OWNED-ID",
    );
    const retained = retainNativePassengerQuoteAnomaly(
      known,
      "P5_QUOTE_OUT_OF_RANGE",
    );
    expect(retained).toMatchObject({
      screenId: "A04",
      orderNo: known.orderNo,
      token: known.token,
      pickupLabel: known.pickupLabel,
      dropoffLabel: known.dropoffLabel,
      requestedPickupText: known.requestedPickupText,
      status: known.status,
      quoteAnomalyCode: "P5_QUOTE_OUT_OF_RANGE",
      routeFareMode: "anomaly",
    });
    expect(retained.assignment).toBe(known.assignment);
    expect(retained.routeFareText).toBe("目前無法取得正式報價");
    expect(known.screenId).toBe("P5-02");
  });

  it("does not turn a valid quote supply hold into an invented requote", () => {
    const view = authority();
    view.order.status = "exception_hold";
    expect(resolveNativePassengerScreenId(view, "ride")).toBe("P5-02");
    view.order.fareQuoteAnomaly = "P5_QUOTE_PROVIDER_UNAVAILABLE";
    expect(resolveNativePassengerScreenId({ ride: view }, "ride")).toBe("A04");
  });
});

describe("native payment and captured E04 facts", () => {
  it.each([
    ["not_selected", "info"],
    ["authorized", "warning"],
    ["captured", "success"],
    ["failed", "danger"],
    ["refunded", "info"],
    ["manual_recovery", "warning"],
  ] as const)(
    "preserves %s payment without performing another charge",
    (status, tone) => {
      const result = mapNativePassengerPayment({ status, amount: null });
      expect(result).toMatchObject({ status, tone });
      expect(result?.amountText).toBeUndefined();
      if (status !== "captured") expect(result?.label).not.toBe("付款完成");
    },
  );

  it("preserves an actual zero amount without defaulting missing payment", () => {
    expect(mapNativePassengerPayment(null)).toBeUndefined();
    expect(
      mapNativePassengerPayment({
        status: "captured",
        amount: { amountMinor: 0, currency: "TWD" },
      })?.amountText,
    ).toBe("NT$ 0");
  });

  it("renders distinctive captured E04 facts and real zero/nonzero components", () => {
    const doc = mapNativePassengerCertificate(receipt(), true);
    const rows = Object.fromEntries(
      doc.rows!.map((row) => [row.label, row.value]),
    );
    expect(doc.state).toBe("available");
    expect(doc.rows).toHaveLength(20);
    expect(rows).toMatchObject({
      乘車證明編號: "RECEIPT-UNIQUE-77",
      車隊: "Captured operator",
      駕駛: "Captured surname○○",
      遮罩執登號: "TEST***77",
      車牌: "TEST-7788",
      行駛時間: "20 分 7 秒",
      路線: "Captured alpha to beta",
      行駛里程: "12.3 公里",
      車資金額: "NT$ 543",
      通行費: "NT$ 37",
      客服電話: "TEST-SUPPORT-77",
      主管機關申訴電話: "TEST-AUTHORITY-88",
      支付方式: "Captured payment",
      起程: "NT$ 11",
      續程: "NT$ 22",
      延滯: "NT$ 33",
      夜間加成: "NT$ 0",
    });
    for (const label of ["開立時間", "上車時間", "下車時間"])
      expect(rows[label]).toBeTruthy();
    expect(doc.htmlUrl).toBe("/captured/receipt.html");
    expect(doc.pdfUrl).toBeUndefined();
  });

  it.each([
    ["蔡", "蔡○○"],
    ["歐陽", "歐陽○○"],
    ["蔡○○", "蔡○○"],
  ])(
    "masks captured driver surname %s as fixed public redaction %s without touching registration mask",
    (rawSurname, expectedMasked) => {
      const fixture = receipt();
      (fixture.record as any).e04Snapshot.driverSurname = rawSurname;
      const doc = mapNativePassengerCertificate(fixture, true);
      const rows = Object.fromEntries(
        doc.rows!.map((row) => [row.label, row.value]),
      );
      expect(rows["駕駛"]).toBe(expectedMasked);
      expect(rows["遮罩執登號"]).toBe("TEST***77");
    },
  );

  it("URL-only metadata does not supply missing facts or invent PDF capability", () => {
    expect(
      joinNativePassengerReceiptDownloads(null, {
        receiptUrl: "/only-url.html",
        pdfUrl: "/only-url.pdf",
      }),
    ).toBeNull();
    expect(mapNativePassengerCertificate(null, true)).toEqual({
      state: "pending",
    });
    expect(mapNativePassengerCertificate(receipt(), false)).toEqual({
      state: "error",
      errorCode: "PASSENGER_RECEIPT_SCOPE_FORBIDDEN",
    });
  });

  it.each([
    "plateNo",
    "pickupAt",
    "distanceMeters",
    "tollMinor",
    "consumerServicePhone",
    "e04Snapshot",
  ] as const)("does not manufacture missing captured %s", (field) => {
    const captured = receipt();
    delete captured.record[field];
    expect(mapNativePassengerCertificate(captured, true)).toMatchObject({
      state: "error",
      errorCode: "PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING",
    });
  });

  it("joins only explicit HTML/PDF capabilities without mutating captured data", () => {
    const view = authority();
    view.order.status = "completed";
    view.receipt = receipt();
    view.actions.canReadReceipt = true;
    const before = JSON.stringify(view.receipt);
    const html = mapNativePassengerRidePresentation(view, "OWNED-ID", {
      ...options,
      receiptDownloads: {
        receiptUrl: "/authorized/html",
        htmlUrl: "/authorized/html",
      },
    });
    expect(html.receiptFormats).toEqual(["html"]);
    expect(html.fixture.certificate?.pdfUrl).toBeUndefined();
    const pdf = mapNativePassengerRidePresentation(view, "OWNED-ID", {
      ...options,
      receiptDownloads: {
        receiptUrl: "/authorized/html",
        htmlUrl: "/authorized/html",
        pdfUrl: "/authorized/pdf",
      },
    });
    expect(pdf.receiptFormats).toEqual(["html", "pdf"]);
    expect(pdf.fixture.certificate?.pdfUrl).toBe("/authorized/pdf");
    expect(JSON.stringify(view.receipt)).toBe(before);
  });
});

describe("native version ordering and captured ETA freshness", () => {
  it.each(["connecting", "disconnected"] as const)(
    "reconnect %s does not refresh ETA time",
    (connectionState) => {
      const fixture = mapNativePassengerRideAuthorityToFixture(
        authority(),
        "OWNED-ID",
      );
      expect(
        getNativePassengerLocationPresentation(fixture, NOW, connectionState),
      ).toMatchObject({
        state: "stale",
        calculatedAtMs: NOW - 5000,
      });
    },
  );

  it("respects the accepted exact 60-second freshness boundary", () => {
    const view = authority();
    view.assignment!.eta.calculatedAt = new Date(NOW - 60000).toISOString();
    const fixture = mapNativePassengerRideAuthorityToFixture(view, "OWNED-ID");
    expect(
      getNativePassengerLocationPresentation(fixture, NOW - 1, "connected")
        .state,
    ).toBe("fresh");
    expect(
      getNativePassengerLocationPresentation(fixture, NOW, "connected").state,
    ).toBe("stale");
  });

  it.each([null, "not-a-date"])(
    "unknown captured time %s stays unknown",
    (timestamp) => {
      const view = authority();
      view.assignment!.eta.calculatedAt = timestamp;
      const result = mapNativePassengerRidePresentation(
        view,
        "OWNED-ID",
        options,
      );
      expect(result.fixture.etaSub).toBeUndefined();
      expect(result.location).toEqual({
        state: "stale",
        calculatedAtMs: 0,
        elapsedSeconds: null,
      });
    },
  );

  it("uses eventVersion across reconnect/terminal transitions, not assignment or receipt time", () => {
    const initial = {
      lastEventVersion: 41,
      presentation: mapNativePassengerRidePresentation(
        authority(),
        "OWNED-ID",
        options,
      ),
    };
    const replacement = authority();
    replacement.assignment!.assignmentVersion = 3;
    const assigned = reduceNativePassengerRideEvent(
      initial,
      event(42, replacement, "assignment_replaced"),
      "OWNED-ID",
      options,
    );
    expect(assigned.presentation?.fixture.screenId).toBe("P5-05");
    const cancelled = authority();
    cancelled.order.status = "cancelled";
    cancelled.assignment = null;
    const terminal = reduceNativePassengerRideEvent(
      assigned,
      event(43, cancelled, "trip_cancelled"),
      "OWNED-ID",
      options,
    );
    expect(terminal.lastEventVersion).toBe(43);
    expect(terminal.presentation?.contentKind).toBe("cancelled_terminal");
    expect(terminal.presentation?.location.calculatedAtMs).toBe(0);
    expect(
      reduceNativePassengerRideEvent(
        terminal,
        event(43, authority()),
        "OWNED-ID",
        options,
      ),
    ).toBe(terminal);
    expect(
      reduceNativePassengerRideEvent(
        terminal,
        event(42, replacement),
        "OWNED-ID",
        options,
      ),
    ).toBe(terminal);
  });

  it.each([NaN, Infinity, -Infinity])(
    "ignores an invalid existing eventVersion %s",
    (version) => {
      const previous = { lastEventVersion: 2, presentation: null };
      expect(
        reduceNativePassengerRideEvent(
          previous,
          event(version, authority()),
          "OWNED-ID",
          options,
        ),
      ).toBe(previous);
    },
  );
});
