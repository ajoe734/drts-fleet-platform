import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  Modal: "Modal",
  Switch: "Switch",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
import { NativePassengerApplication } from "../../../components/application/native-passenger-application";
import { NativePassengerRuntime } from "../../../lib/native-passenger-runtime";
import { createNativePassengerDemoRuntimeOptions } from "../../../lib/demo/native-passenger-demo";
import {
  NativePassengerDemoControls,
  createNativePassengerDemoBookingMap,
} from "../../../lib/demo/native-demo-controls";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const rendered: any[] = [];
afterEach(async () => {
  await act(() => {
    for (const renderer of rendered.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});
async function flush() {
  for (let i = 0; i < 60; ++i) await Promise.resolve();
}
async function press(renderer: any, id: string) {
  await act(async () => {
    const button = renderer.root.findByProps({ testID: id });
    expect(button.props.disabled).not.toBe(true);
    await button.props.onPress();
    await flush();
  });
}
async function enter(renderer: any, id: string, value: string) {
  await act(() =>
    renderer.root.findByProps({ testID: id }).props.onChangeText(value),
  );
}
function exists(renderer: any, id: string) {
  return renderer.root.findAllByProps({ testID: id }).length > 0;
}
async function mount() {
  vi.stubGlobal("fetch", () => {
    throw new Error("Demo has no real HTTP transport");
  });
  const options = createNativePassengerDemoRuntimeOptions({
    now: () => Date.parse("2026-10-14T16:00:00Z"),
    bookingMap: createNativePassengerDemoBookingMap(),
  });
  const runtime = new NativePassengerRuntime(options);
  let renderer: any;
  await act(async () => {
    renderer = create(
      <>
        <NativePassengerApplication runtime={runtime} />
        <NativePassengerDemoControls
          runtime={runtime}
          demoScenario={options.demoScenario}
        />
      </>,
    );
    await flush();
  });
  rendered.push(renderer);
  return { renderer, runtime, scenario: options.demoScenario };
}
async function book(renderer: any, map = false) {
  await press(renderer, "auth-channel-email");
  await enter(renderer, "auth-target", "demo@example.invalid");
  await press(renderer, "auth-request-otp");
  await enter(renderer, "auth-code", "123456");
  await press(renderer, "auth-verify-otp");
  await press(renderer, "booking-acknowledge-fees");
  if (map) {
    await press(renderer, "demo-map-origin");
    await press(renderer, "demo-map-destination");
  } else
    for (const [field, candidate] of [
      ["origin", "DEMO-central"],
      ["destination", "DEMO-exhibition"],
    ] as const) {
      await enter(renderer, `booking-${field}-query`, "示意地點");
      await press(renderer, `booking-${field}-search`);
      await press(renderer, `booking-${field}-candidate-${candidate}`);
    }
  await enter(renderer, "booking-time", "2099-10-15T12:00");
  await press(renderer, "booking-quote");
  await press(renderer, "booking-confirm-checkbox");
  await press(renderer, "booking-submit");
}
describe("Rendered demo application with production screens and SDK plus explicit synthetic ports", () => {
  it("runs OTP→real quote/create→four local driver events→failed/recovered payment→HTML and rating/history without provider I/O", async () => {
    const { renderer, runtime, scenario } = await mount();
    expect(exists(renderer, "native-demo-controls")).toBe(true);
    await book(renderer, true);
    expect(exists(renderer, "app-ride")).toBe(true);
    const id = scenario.getSnapshot().rides[0]!.orderId;
    for (let i = 0; i < 4; ++i) await press(renderer, "demo-advance-trip");
    expect(runtime.getSnapshot().ride?.order.status).toBe("completed");
    expect(exists(renderer, "native-download-html")).toBe(true);
    expect(exists(renderer, "native-download-pdf")).toBe(false);
    await press(renderer, "demo-payment-failed");
    expect(runtime.getSnapshot().ride?.payment?.status).toBe("failed");
    expect(exists(renderer, "native-download-html")).toBe(false);
    await press(renderer, "demo-payment-complete");
    await press(renderer, "native-download-html");
    expect(exists(renderer, "demo-file-notice")).toBe(true);
    const uri = scenario.getSnapshot().lastOpenedFile!;
    expect(new TextDecoder().decode(scenario.getFile(uri))).toContain(
      "DEMO示意乘車證明",
    );
    await press(renderer, "native-score-2");
    await enter(renderer, "native-rating-comment", "示意意見");
    expect(
      renderer.root.findByProps({ testID: "native-rating-contact" }).props
        .accessibilityState.checked,
    ).toBe(true);
    await press(renderer, "native-submit-rating");
    expect((await runtime.passenger.getRide(id)).ride.rating?.score).toBe(2);
    expect(scenario.complaints(id)).toHaveLength(1);
    await press(renderer, "app-nav-history");
    expect(exists(renderer, `history-open-${id}`)).toBe(true);
    await press(renderer, `history-open-${id}`);
    expect(exists(renderer, "native-download-html")).toBe(true);
    expect(scenario.calls().some((call) => call.url.includes("/quotes"))).toBe(
      true,
    );
    expect(
      scenario
        .calls()
        .filter(
          (call) =>
            call.url.endsWith("/rides") && call.options?.method === "POST",
        ),
    ).toHaveLength(1);
  });
  it("keeps scenario controls disabled until a booking and cancels through the actual application confirmation", async () => {
    const { renderer, runtime, scenario } = await mount();
    expect(
      renderer.root.findByProps({ testID: "demo-advance-trip" }).props.disabled,
    ).toBe(true);
    await book(renderer);
    await press(renderer, "native-cancel-ride");
    await press(renderer, "app-confirm-cancel");
    expect(exists(renderer, "native-cancelled-card")).toBe(true);
    expect(runtime.getSnapshot().ride?.order.status).toBe("cancelled");
    expect(
      renderer.root.findByProps({ testID: "demo-advance-trip" }).props.disabled,
    ).toBe(true);
    expect(scenario.getSnapshot().lastAction).toContain("未操作真實訂單");
  });
});
