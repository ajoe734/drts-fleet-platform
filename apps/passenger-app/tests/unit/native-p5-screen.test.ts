import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  MultiTaxiElectronicReceipt,
  PassengerDispatchDisclosureSnapshot,
  PassengerTripRatingRecord,
} from "@drts/contracts";
import {
  mapNativePassengerRidePresentation,
  type NativePassengerRideAuthority,
  type NativePassengerRidePresentation,
} from "@drts/passenger-client";
import { PASSENGER_P5_COLORS } from "@drts/ui-tokens";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  StyleSheet: { create: <T>(styles: T) => styles },
}));

import {
  NativeP5Screen,
  type NativeP5ScreenActions,
  type NativeP5ScreenProps,
} from "../../components/ride/native-p5-screen";

// Actual frozen mapper + actual RN component; only platform primitives and
// outbound API/navigation/binary callback boundaries are mocked.
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
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

interface TestNode {
  children: Array<string | TestNode>;
  findAllByType(type: string): TestNode[];
  props: Record<string, any>;
  findByProps(props: Record<string, unknown>): TestNode;
  findAllByProps(props: Record<string, unknown>): TestNode[];
}
interface TestRenderer {
  root: TestNode;
  update(element: React.ReactElement): void;
  unmount(): void;
  toJSON(): unknown;
}
const mounted: TestRenderer[] = [];

function ports(
  overrides: Partial<NativeP5ScreenActions> = {},
): NativeP5ScreenActions {
  return {
    retryAuthority: vi.fn(async () => {}),
    retryReceipt: vi.fn(async () => {}),
    requestCancel: vi.fn(async () => {}),
    submitRating: vi.fn(async () => {}),
    downloadReceipt: vi.fn(async () => {}),
    contactSupport: vi.fn(async () => {}),
    openSupport: vi.fn(async () => {}),
    openHistory: vi.fn(async () => {}),
    ...overrides,
  };
}
function project(view = authority(), extra = {}) {
  return mapNativePassengerRidePresentation(view, view.order.orderId, {
    ...options,
    ...extra,
  });
}
function completed(): NativePassengerRideAuthority {
  const view = authority();
  view.order.status = "completed";
  view.order.completedAt = "2026-10-14T13:20:00Z";
  view.actions = {
    canCancel: false,
    canRate: true,
    canContact: true,
    canReadReceipt: true,
  };
  view.receipt = receipt();
  return view;
}
async function mount(
  presentation: NativePassengerRidePresentation,
  actions = ports(),
  extra: Partial<NativeP5ScreenProps> = {},
) {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(NativeP5Screen, {
        presentation,
        actions,
        ...extra,
      }),
    ) as unknown as TestRenderer;
  });
  mounted.push(renderer);
  return renderer;
}
async function press(renderer: TestRenderer, id: string) {
  await act(async () => {
    await renderer.root.findByProps({ testID: id }).props.onPress();
  });
}
function count(renderer: TestRenderer, id: string) {
  return renderer.root.findAllByProps({ testID: id }).length;
}
function text(renderer: TestRenderer) {
  return JSON.stringify(renderer.toJSON());
}
async function update(
  renderer: TestRenderer,
  presentation: NativePassengerRidePresentation,
  actions: NativeP5ScreenActions,
) {
  await act(async () => {
    renderer.update(
      React.createElement(NativeP5Screen, { presentation, actions }),
    );
  });
}
afterEach(async () => {
  for (const renderer of mounted.splice(0)) {
    await act(async () => renderer.unmount());
  }
});

describe("actual Native P5 rendered terminal and active screens", () => {
  it.each([false, true])(
    "cancelled terminal has no active content with retained assignment=%s",
    async (retained) => {
      const view = authority();
      view.order.status = "cancelled";
      view.order.cancelledAt = "2026-10-14T13:22:00Z";
      view.assignment = retained ? view.assignment : null;
      view.actions = {
        canCancel: true,
        canRate: true,
        canContact: true,
        canReadReceipt: true,
      };
      view.receipt = receipt();
      const actions = ports();
      const renderMap = vi.fn(() => React.createElement("MapView"));
      const renderer = await mount(
        project(view, {
          quoteAnomalyCode: "P5_QUOTE_PROVIDER_UNAVAILABLE",
        }),
        actions,
        { renderMap },
      );
      expect(renderMap).not.toHaveBeenCalled();
      expect(count(renderer, "native-cancelled-card")).toBe(1);
      for (const id of [
        "native-active-trip",
        "native-trip-map",
        "native-active-eta",
        "native-fare-card",
        "native-cancel-ride",
        "native-retry-authority",
        "native-rating-card",
        "native-receipt-card",
        "native-download-html",
        "native-download-pdf",
      ])
        expect(count(renderer, id), id).toBe(0);
      expect(text(renderer)).toContain("ORD-CAPTURED-77");
      expect(text(renderer)).toContain(
        retained ? "Captured pickup" : "Original pickup",
      );
      for (const promise of [
        "預計 5 分鐘抵達",
        "位置更新於",
        "取消行程",
        "重試",
        "應付 NT$ 300",
      ]) {
        expect(text(renderer)).not.toContain(promise);
      }
      await press(renderer, "native-open-history");
      await press(renderer, "native-open-complaint");
      await press(renderer, "native-open-lost-item");
      expect(actions.openHistory).toHaveBeenCalledOnce();
      expect(actions.openSupport).toHaveBeenNthCalledWith(1, "service");
      expect(actions.openSupport).toHaveBeenNthCalledWith(2, "lost_item");
      expect(actions.requestCancel).not.toHaveBeenCalled();
    },
  );

  it("renders real mapped route/ETA and invokes only the native map boundary", async () => {
    const presentation = project();
    const renderMap = vi.fn(() => React.createElement("MapView"));
    const renderer = await mount(presentation, ports(), { renderMap });
    expect(renderMap).toHaveBeenCalledWith(presentation);
    for (const value of [
      "Captured pickup",
      "Captured dropoff",
      "TEST-001",
      "Captured driver",
      "預計 5 分鐘抵達",
      "應付 NT$ 300",
    ]) {
      expect(text(renderer)).toContain(value);
    }
    expect(
      renderer.root.findByProps({ testID: "native-p5-screen" }).props.style
        .backgroundColor,
    ).toBe(PASSENGER_P5_COLORS.bg);
    expect(count(renderer, "native-cancel-ride")).toBe(1);
  });

  it("renders stale rather than fresh location after stream disconnect", async () => {
    const renderer = await mount(project());
    expect(text(renderer)).toContain("位置更新於 ");
    const actions = ports();
    await update(
      renderer,
      project(authority(), { connectionState: "disconnected" }),
      actions,
    );
    expect(text(renderer)).toContain("司機位置更新稍有延遲");
    expect(text(renderer)).not.toContain("位置更新於 ");
  });

  it("discloses captured masked registration, validity, vehicle facts and actual driver rating", async () => {
    const renderer = await mount(project());
    const visibleText = () =>
      renderer.root
        .findAllByType("Text")
        .map((node: any) => node.children.join(""))
        .join("\n");
    for (const value of [
      "TEST***01",
      "2027-01-01T00:00:00Z",
      "Captured color",
      "2025",
      "4 門",
      "4.8",
      "17 則評價",
    ])
      expect(visibleText()).toContain(value);
    const next = authority();
    next.assignment!.rating = {
      displayState: "new_driver",
      averageRating: null,
      ratingCount: 0,
      aggregateVersion: 4,
    };
    await update(renderer, project(next), ports());
    expect(visibleText()).toContain("新司機，尚無評價");
    expect(visibleText()).not.toContain("4.8");
  });

  it("A04 invokes the existing authority retry callback and applies a parent-provided real terminal projection", async () => {
    const view = authority();
    const actions = ports();
    const renderer = await mount(
      project(view, { quoteAnomalyCode: "P5_QUOTE_OUT_OF_RANGE" }),
      actions,
    );
    expect(text(renderer)).toContain("ORD-CAPTURED-77");
    expect(text(renderer)).toContain("Captured pickup");
    expect(text(renderer)).toContain("目前無法取得正式報價");
    await press(renderer, "native-retry-authority");
    expect(actions.retryAuthority).toHaveBeenCalledOnce();
    const done = completed();
    await update(renderer, project(done), actions);
    expect(count(renderer, "native-retry-authority")).toBe(0);
    expect(count(renderer, "native-rating-card")).toBe(1);
    expect(actions.requestCancel).not.toHaveBeenCalled();
  });

  it("failed A04 retry displays the actual error without losing captured facts", async () => {
    const actions = ports({
      retryAuthority: vi.fn(async () => {
        throw new Error("QUOTE_UNAVAILABLE");
      }),
    });
    const renderer = await mount(
      project(authority(), {
        quoteAnomalyCode: "P5_QUOTE_PROVIDER_UNAVAILABLE",
      }),
      actions,
    );
    await press(renderer, "native-retry-authority");
    expect(text(renderer)).toContain("QUOTE_UNAVAILABLE");
    expect(
      renderer.root.findAllByProps({ accessibilityRole: "alert" }),
    ).toHaveLength(1);
    expect(text(renderer)).toContain("ORD-CAPTURED-77");
    expect(text(renderer)).toContain("Captured pickup");
    expect(count(renderer, "native-retry-authority")).toBe(1);
    expect(actions.submitRating).not.toHaveBeenCalled();
  });

  it("preserves the supplied port method receiver when dispatching an authority retry", async () => {
    const retryAuthority = vi.fn(function (this: NativeP5ScreenActions) {
      return Promise.resolve();
    });
    const actions = ports({ retryAuthority });
    const renderer = await mount(
      project(authority(), {
        quoteAnomalyCode: "P5_QUOTE_PROVIDER_UNAVAILABLE",
      }),
      actions,
    );
    await press(renderer, "native-retry-authority");
    expect(retryAuthority).toHaveBeenCalledOnce();
    expect(retryAuthority.mock.contexts[0]).toBe(actions);
  });

  it("pending cancellation dispatches one existing request and disables another press", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const requestCancel = vi.fn(() => pending);
    const renderer = await mount(project(), ports({ requestCancel }));
    let first!: Promise<void>;
    await act(async () => {
      const button = renderer.root.findByProps({
        testID: "native-cancel-ride",
      });
      first = button.props.onPress();
      void button.props.onPress();
    });
    expect(requestCancel).toHaveBeenCalledOnce();
    expect(
      renderer.root.findByProps({ testID: "native-cancel-ride" }).props
        .disabled,
    ).toBe(true);
    await act(async () => {
      finish();
      await first;
    });
    expect(
      renderer.root.findByProps({ testID: "native-cancel-ride" }).props
        .disabled,
    ).toBe(false);
  });
});

describe("actual Native completed rating/contact and receipts", () => {
  it("low score and selected contact generate the existing account rating command", async () => {
    const actions = ports();
    const renderer = await mount(project(completed()), actions);
    await press(renderer, "native-score-2");
    await press(renderer, "native-rating-tag-駕駛態度");
    await act(async () => {
      renderer.root
        .findByProps({ testID: "native-rating-comment" })
        .props.onChangeText("Captured feedback");
    });
    expect(
      renderer.root.findByProps({ testID: "native-rating-contact" }).props
        .accessibilityState.checked,
    ).toBe(true);
    await press(renderer, "native-submit-rating");
    expect(actions.submitRating).toHaveBeenCalledWith({
      rideId: "ORDER",
      rating: 2,
      tags: ["駕駛態度"],
      comments: "Captured feedback",
      contactRequested: true,
    });
    expect(text(renderer)).toContain("評價已送出");
    expect(count(renderer, "native-submit-rating")).toBe(0);
    await press(renderer, "native-contact-support");
    expect(actions.contactSupport).toHaveBeenCalledOnce();
  });

  it("unchecked low-score contact is an explicit false command", async () => {
    const actions = ports();
    const renderer = await mount(project(completed()), actions);
    await press(renderer, "native-score-1");
    await press(renderer, "native-rating-contact");
    await press(renderer, "native-submit-rating");
    expect(actions.submitRating).toHaveBeenCalledWith({
      rideId: "ORDER",
      rating: 1,
      contactRequested: false,
    });
  });

  it("high score hides the contact checkbox and does not reuse a previous low opt-in", async () => {
    const actions = ports();
    const renderer = await mount(project(completed()), actions);
    await press(renderer, "native-score-2");
    expect(count(renderer, "native-rating-contact")).toBe(1);
    await press(renderer, "native-score-5");
    expect(count(renderer, "native-rating-contact")).toBe(0);
    await press(renderer, "native-submit-rating");
    expect(actions.submitRating).toHaveBeenCalledWith({
      rideId: "ORDER",
      rating: 5,
      contactRequested: false,
    });
  });

  it("a rejected real rating callback does not display a false success", async () => {
    const actions = ports({
      submitRating: vi.fn(async () => {
        throw new Error("RATING_NOT_COMMITTED");
      }),
    });
    const renderer = await mount(project(completed()), actions);
    await press(renderer, "native-score-2");
    await press(renderer, "native-submit-rating");
    expect(text(renderer)).toContain("RATING_NOT_COMMITTED");
    expect(text(renderer)).not.toContain("評價已送出");
    expect(count(renderer, "native-submit-rating")).toBe(1);
    expect(
      renderer.root.findByProps({ testID: "native-rating-contact" }).props
        .accessibilityState.checked,
    ).toBe(true);
  });

  it("persisted rated state is displayed without offering another rating command", async () => {
    const view = completed();
    view.rating = rating();
    const actions = ports();
    const renderer = await mount(project(view), actions);
    expect(text(renderer)).toContain("評價已送出");
    expect(text(renderer)).toContain("2 星");
    expect(count(renderer, "native-submit-rating")).toBe(0);
    expect(actions.submitRating).not.toHaveBeenCalled();
  });

  it("renders the captured E04 facts and HTML-only actual capability", async () => {
    const actions = ports();
    const renderer = await mount(project(completed()), actions);
    for (const value of [
      "RECEIPT-UNIQUE-77",
      "Captured operator",
      "Captured surname",
      "TEST***77",
      "TEST-7788",
      "Captured alpha to beta",
      "20 分 7 秒",
      "12.3 公里",
      "NT$ 543",
      "NT$ 37",
      "TEST-SUPPORT-77",
      "TEST-AUTHORITY-88",
      "Captured payment",
      "起程",
      "續程",
      "延滯",
      "夜間加成",
    ])
      expect(text(renderer)).toContain(value);
    expect(count(renderer, "native-download-pdf")).toBe(0);
    expect(text(renderer)).toContain("目前未提供 PDF 下載");
    await press(renderer, "native-download-html");
    expect(actions.downloadReceipt).toHaveBeenCalledWith({
      format: "html",
      url: "/captured/receipt.html",
    });
  });

  it("passes the exact authorized PDF URL to the actual binary boundary, not a guessed suffix", async () => {
    const actions = ports();
    const renderer = await mount(
      project(completed(), {
        receiptDownloads: {
          receiptUrl: "/authorized/html",
          htmlUrl: "/authorized/html",
          pdfUrl: "/authorized/pdf?receipt=CAPTURED",
        },
      }),
      actions,
    );
    await press(renderer, "native-download-pdf");
    expect(actions.downloadReceipt).toHaveBeenCalledWith({
      format: "pdf",
      url: "/authorized/pdf?receipt=CAPTURED",
    });
  });

  it("pending/missing receipt facts offer real retry without a fabricated certificate", async () => {
    const view = completed();
    view.receipt = null;
    const actions = ports();
    const renderer = await mount(
      project(view, {
        receiptDownloads: { receiptUrl: "/metadata-only.html" },
      }),
      actions,
    );
    expect(text(renderer)).toContain("乘車證明準備中");
    expect(count(renderer, "native-download-html")).toBe(0);
    expect(count(renderer, "native-download-pdf")).toBe(0);
    await press(renderer, "native-retry-receipt");
    expect(actions.retryReceipt).toHaveBeenCalledOnce();
    await update(renderer, project(completed()), actions);
    expect(count(renderer, "native-retry-receipt")).toBe(0);
    expect(count(renderer, "native-download-html")).toBe(1);
  });

  it("incomplete captured E04 facts stay unavailable rather than defaulting fields", async () => {
    const view = completed();
    delete view.receipt!.record.tollMinor;
    const actions = ports();
    const renderer = await mount(project(view), actions);
    expect(text(renderer)).toContain("乘車證明資料尚未齊全");
    expect(count(renderer, "native-download-html")).toBe(0);
    expect(count(renderer, "native-download-pdf")).toBe(0);
    await press(renderer, "native-retry-receipt");
    expect(actions.retryReceipt).toHaveBeenCalledOnce();
  });

  it("binary download errors retain the existing format capability and show failure", async () => {
    const actions = ports({
      downloadReceipt: vi.fn(async () => {
        throw new Error("BINARY_DOWNLOAD_UNAVAILABLE");
      }),
    });
    const renderer = await mount(project(completed()), actions);
    await press(renderer, "native-download-html");
    expect(text(renderer)).toContain("BINARY_DOWNLOAD_UNAVAILABLE");
    expect(count(renderer, "native-download-html")).toBe(1);
    expect(count(renderer, "native-download-pdf")).toBe(0);
  });

  it("a new ride key resets previous rating text/score/error rather than carrying prior UI state", async () => {
    const actions = ports({
      submitRating: vi.fn(async () => {
        throw new Error("OLD_RATING_FAILED");
      }),
    });
    const renderer = await mount(project(completed()), actions);
    await press(renderer, "native-score-2");
    await act(async () => {
      renderer.root
        .findByProps({ testID: "native-rating-comment" })
        .props.onChangeText("Old ride comment");
    });
    await press(renderer, "native-submit-rating");
    expect(text(renderer)).toContain("OLD_RATING_FAILED");
    const next = completed();
    next.order.orderId = "ORDER-NEW";
    next.order.orderNo = "ORD-NEW";
    next.assignment = null;
    next.receipt = null;
    await update(renderer, project(next), actions);
    expect(text(renderer)).toContain("ORD-NEW");
    expect(text(renderer)).not.toContain("OLD_RATING_FAILED");
    expect(
      renderer.root.findByProps({ testID: "native-rating-comment" }).props
        .value,
    ).toBe("");
    expect(
      renderer.root.findByProps({ testID: "native-score-5" }).props
        .accessibilityState.selected,
    ).toBe(true);
    expect(count(renderer, "native-rating-contact")).toBe(0);
  });
});
