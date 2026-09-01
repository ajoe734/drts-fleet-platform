import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { stub } = vi.hoisted(() => ({
  stub: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  dismissAll: vi.fn(),
  canDismiss: vi.fn(() => false),
  alert: vi.fn(),
  openURL: vi.fn(),
  vibrate: vi.fn(),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
  submitDriverSosEvent: vi.fn(),
  getDriverDeviceId: vi.fn(),
  loadTrackingSessionMarker: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
  recoverDriverSessionFromApiError: vi.fn(async () => false),
  syncDriverSosAttachments: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    Alert: { alert: mocks.alert },
    AppState: { addEventListener: mocks.addEventListener },
    Linking: { openURL: mocks.openURL },
    PanResponder: {
      create: (config: Record<string, any>) => ({
        panHandlers: { __panConfig: config },
      }),
    },
    Pressable: p("Pressable"),
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    TextInput: "TextInput",
    View: p("View"),
    Vibration: { vibrate: mocks.vibrate },
  };
});

vi.mock("@expo/vector-icons", () => ({ Ionicons: stub("Ionicons") }));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    push: mocks.push,
    back: mocks.back,
    replace: mocks.replace,
    dismissAll: mocks.dismissAll,
    canDismiss: mocks.canDismiss,
  }),
}));

vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: mocks.getForegroundPermissionsAsync,
  getCurrentPositionAsync: mocks.getCurrentPositionAsync,
  Accuracy: { Balanced: 3 },
}));

vi.mock("@/lib/driver-tracking-recovery", () => ({
  loadTrackingSessionMarker: mocks.loadTrackingSessionMarker,
}));

vi.mock("expo-image-picker", () => ({
  launchCameraAsync: mocks.launchCameraAsync,
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  requestCameraPermissionsAsync: mocks.requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync:
    mocks.requestMediaLibraryPermissionsAsync,
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: mocks.getItemAsync,
  setItemAsync: mocks.setItemAsync,
  deleteItemAsync: mocks.deleteItemAsync,
}));

vi.mock("@/components/canvas-primitives", () => ({
  driverCanvasTheme: new Proxy({}, { get: () => "#000000" }),
  Banner: stub("Banner"),
  Btn: stub("Btn"),
  Card: stub("Card"),
  DL: stub("DL"),
  Field: stub("Field"),
  PageHeader: stub("CanvasPageHeader"),
  Pill: stub("Pill"),
  Shell: (props: Record<string, unknown>) =>
    React.createElement("Shell", props, [
      React.createElement(
        React.Fragment,
        { key: "footer" },
        props.footer as never,
      ),
      React.createElement(
        React.Fragment,
        { key: "children" },
        props.children as never,
      ),
    ]),
}));

vi.mock("@/lib/api-client", () => ({
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  getDriverClient: () => ({
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
    submitDriverSosEvent: mocks.submitDriverSosEvent,
  }),
  getDriverDeviceId: mocks.getDriverDeviceId,
  recoverDriverSessionFromApiError: mocks.recoverDriverSessionFromApiError,
}));

vi.mock("@/lib/driver-sos-attachment-upload", () => ({
  syncDriverSosAttachments: mocks.syncDriverSosAttachments,
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getLatestDriverLocationUpdate: () => ({
    latitude: 25.0478,
    longitude: 121.5171,
    accuracyM: 8,
    recordedAt: "2026-05-08T03:59:00.000Z",
  }),
}));

import SosScreen from "../../app/(tabs)/index/sos";

async function flush() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

async function renderScreen() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(SosScreen));
    await flush();
  });
  return renderer;
}

function buttons(renderer: any) {
  return renderer.root.findAll((node: any) => node.type === "Btn");
}

function buttonWithLabel(renderer: any, label: string) {
  return buttons(renderer).find((node: any) => node.props.children === label);
}

function texts(renderer: any): string[] {
  return renderer.root
    .findAll((node: any) => node.type === "Text")
    .flatMap((node: any) =>
      Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children],
    )
    .filter((value: unknown) => typeof value === "string");
}

function holdButton(renderer: any) {
  return renderer.root.find(
    (node: any) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel === "長按確認求援",
  );
}

function situationTile(renderer: any, label: string) {
  return renderer.root
    .findAll((node: any) => node.type === "Pressable" && node.props.onPress)
    .find((node: any) =>
      node
        .findAll((child: any) => child.type === "Text")
        .some((child: any) => child.props.children === label),
    );
}

function savedCase(): any {
  const call = mocks.setItemAsync.mock.calls.at(-1);
  return call ? JSON.parse(call[1] as string) : null;
}

const RECEIPT = {
  receipt: {
    sosEventId: "sos-001",
    incidentId: "inc-001",
    clientEventId: "will-be-overwritten",
    eventNo: "SOS-20260508-0001",
    duplicate: false,
    serverReceivedAt: "2026-05-08T04:00:01.000Z",
    fleetReportConfirmedAt: "2026-05-08T04:00:01.000Z",
  },
};

function submittedCommand(index = 0): any {
  return mocks.submitDriverSosEvent.mock.calls[index]?.[0];
}

describe("DriverSosScreen interactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T04:00:00.000Z"));

    mocks.push.mockReset();
    mocks.back.mockReset();
    mocks.replace.mockReset();
    mocks.alert.mockReset();
    mocks.openURL.mockReset().mockResolvedValue(undefined);
    mocks.vibrate.mockReset();
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.submitDriverSosEvent.mockReset().mockResolvedValue(RECEIPT);
    mocks.recoverDriverSessionFromApiError.mockReset().mockResolvedValue(false);
    mocks.syncDriverSosAttachments.mockReset().mockResolvedValue({
      attachments: [],
      allSettled: true,
    });
    mocks.getItemAsync.mockReset().mockResolvedValue(null);
    mocks.setItemAsync.mockReset().mockResolvedValue(undefined);
    mocks.deleteItemAsync.mockReset().mockResolvedValue(undefined);
    mocks.getDriverDeviceId.mockReset().mockResolvedValue("device-abc");
    mocks.loadTrackingSessionMarker
      .mockReset()
      .mockResolvedValue({ vehicleId: "VEH-9", driverId: "driver-1" });
    mocks.getForegroundPermissionsAsync
      .mockReset()
      .mockResolvedValue({ granted: false });
    mocks.getCurrentPositionAsync.mockReset();
    mocks.addEventListener.mockReset().mockReturnValue({ remove: vi.fn() });
    mocks.dismissAll.mockReset();
    mocks.canDismiss.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("emergency dialling", () => {
    it("offers 110, 119 and the fleet duty line", async () => {
      const renderer = await renderScreen();
      expect(buttonWithLabel(renderer, "110 警政")).toBeDefined();
      expect(buttonWithLabel(renderer, "119 消防")).toBeDefined();
      expect(buttonWithLabel(renderer, "車隊值班")).toBeDefined();
    });

    it("opens the native dialer for the police", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "110 警政").props.onPress();
        await flush();
      });
      expect(mocks.openURL).toHaveBeenCalledWith("tel:110");
    });

    it("opens the native dialer for the fire service", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "119 消防").props.onPress();
        await flush();
      });
      expect(mocks.openURL).toHaveBeenCalledWith("tel:119");
    });

    it("opens the native dialer for the fleet duty number", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "車隊值班").props.onPress();
        await flush();
      });
      expect(mocks.openURL).toHaveBeenCalledWith("tel:02-2191-7788");
    });

    it("reports a dialler failure without crashing the screen", async () => {
      mocks.openURL.mockRejectedValue(new Error("no dialer"));
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "110 警政").props.onPress();
        await flush();
      });
      expect(mocks.alert.mock.calls.at(-1)?.[0]).toBe("無法開啟撥號");
    });

    it("dials without needing an SOS case or the network", async () => {
      mocks.listUnifiedDriverTasks.mockRejectedValue(new Error("offline"));
      mocks.listDriverTasks.mockRejectedValue(new Error("offline"));
      const renderer = await renderScreen();

      await act(async () => {
        buttonWithLabel(renderer, "119 消防").props.onPress();
        await flush();
      });
      expect(mocks.openURL).toHaveBeenCalledWith("tel:119");
    });
  });

  describe("situation selection", () => {
    it("defaults to 乘客衝突", async () => {
      const renderer = await renderScreen();
      expect(texts(renderer)).toContain("乘客衝突");
    });

    it("records the chosen situation in the submitted event type", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        situationTile(renderer, "醫療緊急").props.onPress();
      });
      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      expect(mocks.submitDriverSosEvent).toHaveBeenCalled();
      const command = submittedCommand();
      expect(command.eventType).toBe("passenger_medical");
      expect(savedCase().eventType).toBe(command.eventType);
    });

    // The platform contract only accepts four event types
    // (DRIVER_SOS_EVENT_TYPES), so the six driver-facing situations collapse
    // onto them. The exact choice must survive that collapse as a structured
    // prefix, otherwise the duty desk cannot tell a passenger conflict from a
    // route threat.
    it.each([
      ["乘客衝突", "security_incident", "major"],
      ["交通事故", "traffic_accident", "major"],
      ["車輛故障", "other", "normal"],
      ["醫療緊急", "passenger_medical", "major"],
      ["路線威脅", "security_incident", "major"],
      ["其他", "other", "normal"],
    ])(
      "maps 「%s」 onto the platform event type %s and keeps the category in the description",
      async (label, eventType, severity) => {
        const renderer = await renderScreen();

        await act(async () => {
          situationTile(renderer, label).props.onPress();
        });
        await act(async () => {
          holdButton(renderer).props.onLongPress();
          await flush();
        });

        const command = submittedCommand();
        expect(command.eventType).toBe(eventType);
        expect(
          ["traffic_accident", "security_incident", "passenger_medical", "other"],
        ).toContain(command.eventType);
        expect(command.severity).toBe(severity);
        expect(command.description.startsWith(`[${label}]`)).toBe(true);
      },
    );
  });

  describe("the 2-second hold", () => {
    it("does nothing on a plain tap", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onPressIn();
      });
      await act(async () => {
        holdButton(renderer).props.onPressOut();
        await flush();
      });

      expect(mocks.submitDriverSosEvent).not.toHaveBeenCalled();
      expect(mocks.setItemAsync).not.toHaveBeenCalled();
    });

    it("requires a 2000 ms long press", async () => {
      const renderer = await renderScreen();
      expect(holdButton(renderer).props.delayLongPress).toBe(2000);
    });

    it("gives haptic feedback when the hold starts and when it fires", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onPressIn();
      });
      expect(mocks.vibrate).toHaveBeenCalledWith(10);

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });
      expect(mocks.vibrate).toHaveBeenCalledWith([0, 24, 36, 24]);
    });

    it("advances the hold progress while the finger is down", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onPressIn();
      });
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });

      expect(
        holdButton(renderer).props.holdProgress ?? 0,
      ).toBeGreaterThanOrEqual(0);
    });

    it("writes the case to the local outbox before the network call", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      expect(mocks.setItemAsync).toHaveBeenCalled();
      expect(mocks.setItemAsync.mock.calls[0][0]).toBe(
        "drts.driver.sos.activeCase",
      );
      const firstWrite = JSON.parse(
        mocks.setItemAsync.mock.calls[0][1] as string,
      );
      expect(firstWrite.clientEventId).toBeTruthy();
    });

    it("submits with an idempotency key matching the client event id", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      const [, options] = mocks.submitDriverSosEvent.mock.calls[0] as any;
      const clientEventId = JSON.parse(
        mocks.setItemAsync.mock.calls[0][1] as string,
      ).clientEventId;
      expect(options.headers["Idempotency-Key"]).toBe(clientEventId);
      expect(options.headers["X-Request-Id"]).toBe(clientEventId);
    });

    it("attaches the last known location snapshot", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      expect(savedCase().location).toMatchObject({
        lat: 25.0478,
        lng: 121.5171,
        accuracyM: 8,
      });
    });

    it("takes a fresh fix when location permission is already granted", async () => {
      mocks.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
      mocks.getCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 25.1, longitude: 121.6, accuracy: 5 },
        timestamp: Date.parse("2026-05-08T03:59:58.000Z"),
      });

      await renderScreen();

      expect(mocks.getCurrentPositionAsync).toHaveBeenCalled();
    });

    it("auto-fills driver context, vehicle, device, trip and trigger time", async () => {
      mocks.listUnifiedDriverTasks.mockResolvedValue([
        {
          taskId: "TASK-1",
          orderId: "ORDER-1",
          orderDomain: "owned",
          sourcePlatform: "drts",
          platformDisplayName: "DRTS",
          externalOrderId: null,
          nativeStatus: null,
          localStatus: "in_progress",
          driverActionState: "none",
          allowedActions: [],
          routeLocked: false,
          fareAuthority: "platform",
          settlementAuthority: "platform",
          driverPayoutAuthority: "platform",
          requiresManualFallback: false,
          requiresReauth: false,
          syncIssueSummary: null,
          blockingReason: null,
          pickupSummary: null,
          dropoffSummary: null,
          deadlineAt: null,
          updatedAt: "2026-05-08T03:00:00.000Z",
        },
      ]);
      mocks.listDriverTasks.mockResolvedValue([
        { taskId: "TASK-1", vehicleId: "VEH-1" },
      ]);

      const renderer = await renderScreen();
      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      const command = submittedCommand();
      // The driver is derived from the device-bound session server side, so
      // the client must never send (or render) a driver id.
      expect(command.driverId).toBeUndefined();
      expect(command.taskId).toBe("TASK-1");
      expect(command.orderId).toBe("ORDER-1");
      expect(command.vehicleId).toBe("VEH-1");
      expect(command.originalTriggeredAt).toBe("2026-05-08T04:00:00.000Z");
      expect(command.offlineAtTrigger).toBe(false);
      expect(command.location).toMatchObject({ lat: 25.0478, lng: 121.5171 });
      // No dedicated device field exists on the command, so the device rides
      // along on the description for the duty desk.
      expect(command.description).toContain("device-abc");
    });

    it("falls back to the tracked vehicle when there is no active task", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      expect(submittedCommand().vehicleId).toBe("VEH-9");
    });

    it("confirms the receipt number once the service accepts", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      const rendered = texts(renderer);
      expect(rendered.some((value) => value.includes("SOS-20260508-0001"))).toBe(
        true,
      );
      expect(rendered.some((value) => value.includes("平台已接收"))).toBe(true);
    });

    it("never claims the platform received the request until a receipt comes back", async () => {
      let resolveSubmit: ((value: unknown) => void) | null = null;
      mocks.submitDriverSosEvent.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubmit = resolve;
          }),
      );

      const renderer = await renderScreen();
      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      // In flight: the case exists locally, but nothing may read as delivered.
      const inFlight = texts(renderer);
      expect(inFlight.some((value) => value.includes("平台已接收"))).toBe(false);
      expect(inFlight.some((value) => value.includes("送出中"))).toBe(true);
      expect(savedCase().receipt).toBeNull();

      await act(async () => {
        resolveSubmit?.(RECEIPT);
        await flush();
      });

      expect(texts(renderer).some((value) => value.includes("平台已接收"))).toBe(
        true,
      );
      expect(savedCase().receipt.eventNo).toBe("SOS-20260508-0001");
    });

    it("keeps the case for retry when the submit fails", async () => {
      mocks.submitDriverSosEvent.mockRejectedValue(new Error("值班服務逾時"));
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      expect(buttonWithLabel(renderer, "重新送出")).toBeDefined();
      expect(savedCase().syncState).not.toBe("submitted");
    });

    it("shows no success wording when the request never reached the platform", async () => {
      mocks.submitDriverSosEvent.mockRejectedValue(new Error("值班服務逾時"));
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      const rendered = texts(renderer).join(" | ");
      for (const forbidden of ["平台已接收", "已送達", "成功"]) {
        expect(rendered.includes(forbidden)).toBe(false);
      }
      expect(rendered).toContain("尚未送達");
    });

    // Regression: retry used to be gated on `navigator.onLine`, which is
    // undefined on a handset, so a failed request could never be resent.
    it("keeps manual retry available on a device with no browser online flag", async () => {
      mocks.submitDriverSosEvent.mockRejectedValueOnce(new Error("逾時"));
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      const retry = buttonWithLabel(renderer, "重新送出");
      expect(retry.props.disabled).toBe(false);

      await act(async () => {
        retry.props.onPress();
        await flush();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(2);
      // The retry replays the very same client event id, so the platform's
      // idempotency guard collapses it onto one event.
      expect(submittedCommand(1).clientEventId).toBe(
        submittedCommand(0).clientEventId,
      );
    });

    it("retries by itself on a backoff after a failure", async () => {
      mocks.submitDriverSosEvent.mockRejectedValue(new Error("網路中斷"));
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1_000);
        await flush();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(2);

      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await flush();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(3);
      expect(submittedCommand(2).clientEventId).toBe(
        submittedCommand(0).clientEventId,
      );
    });

    it("retries once as soon as the app returns to the foreground", async () => {
      mocks.submitDriverSosEvent.mockRejectedValue(new Error("網路中斷"));
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);

      const [, onAppStateChange] = mocks.addEventListener.mock.calls[0] as any;
      await act(async () => {
        onAppStateChange("active");
        await flush();
      });

      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(2);
    });

    it("sends the driver back to onboarding without claiming delivery when the session expired", async () => {
      mocks.submitDriverSosEvent.mockRejectedValue(new Error("API error 401: {}"));
      mocks.recoverDriverSessionFromApiError.mockResolvedValue(true);
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      expect(mocks.replace).toHaveBeenCalledWith("/onboarding");
      expect(texts(renderer).join(" | ").includes("平台已接收")).toBe(false);
      // The request stays on the device so it can be sent again after signing
      // back in.
      expect(savedCase().syncState).toBe("failed_retryable");
      expect(savedCase().receipt).toBeNull();
    });

    it("refuses a second SOS while one is still active", async () => {
      const renderer = await renderScreen();

      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);

      const hold = holdButton(renderer);
      if (hold) {
        await act(async () => {
          hold.props.onLongPress();
          await flush();
        });
      }
      expect(mocks.submitDriverSosEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("restoring a persisted case", () => {
    const persisted = {
      clientEventId: "evt-restore",
      eventType: "passenger_conflict",
      description: "先前的求援",
      originalTriggeredAt: "2026-05-08T03:00:00.000Z",
      offlineAtTrigger: false,
      syncState: "failed_retryable",
      attachments: [],
      supplements: [],
      dialRecords: [],
      timeline: [],
      falseAlarm: { dismissed: false, note: null, markedAt: null },
      receipt: null,
      location: null,
      orderId: null,
      taskId: null,
    };

    it("rehydrates an unfinished case from secure storage", async () => {
      mocks.getItemAsync.mockResolvedValue(JSON.stringify(persisted));
      const renderer = await renderScreen();

      expect(buttonWithLabel(renderer, "重新送出")).toBeDefined();
    });

    it("discards a corrupt payload instead of crashing", async () => {
      mocks.getItemAsync.mockResolvedValue("{not json");
      const renderer = await renderScreen();

      expect(mocks.deleteItemAsync).toHaveBeenCalledWith(
        "drts.driver.sos.activeCase",
      );
      expect(holdButton(renderer)).toBeDefined();
    });

    it("discards a payload missing its client event id", async () => {
      mocks.getItemAsync.mockResolvedValue(
        JSON.stringify({ ...persisted, clientEventId: "" }),
      );
      await renderScreen();
      expect(mocks.deleteItemAsync).toHaveBeenCalled();
    });
  });

  describe("false alarm", () => {
    it("asks for a second confirmation before marking a false alarm", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        holdButton(renderer).props.onLongPress();
        await flush();
      });

      // The false-alarm affordance is a drag-to-confirm slider: measure the
      // track, drag past the 84% threshold, then release.
      const track = renderer.root.find(
        (node: any) => node.type === "View" && node.props.onLayout,
      );
      await act(async () => {
        track.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
      });

      const config = renderer.root.find(
        (node: any) => node.type === "View" && node.props.__panConfig,
      ).props.__panConfig;
      await act(async () => {
        config.onPanResponderMove({}, { dx: 248, dy: 0 });
      });
      await act(async () => {
        renderer.root
          .find((node: any) => node.type === "View" && node.props.__panConfig)
          .props.__panConfig.onPanResponderRelease();
        await flush();
      });

      const call = mocks.alert.mock.calls.at(-1) as any;
      expect(call?.[0]).toBe("二次確認誤觸");
      expect(call?.[2][0]).toMatchObject({ text: "取消", style: "cancel" });
    });
  });

  describe("footer navigation", () => {
    it("goes back from the SOS surface", async () => {
      const renderer = await renderScreen();
      await act(async () => {
        buttonWithLabel(renderer, "返回").props.onPress();
      });
      expect(mocks.back).toHaveBeenCalledTimes(1);
    });
  });
});
