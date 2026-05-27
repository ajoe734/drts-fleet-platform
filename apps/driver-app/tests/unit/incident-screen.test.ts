import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  useLocalSearchParams: vi.fn(() => ({})),
  isFeatureEnabled: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
  getPendingDriverIncidentSubmission: vi.fn(),
  replayPendingDriverIncidentSubmission: vi.fn(),
  submitDriverIncident: vi.fn(),
  saveDriverSosAcknowledgement: vi.fn(),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: <T>(styles: T) => styles, absoluteFillObject: {} },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useLocalSearchParams: () => mocks.useLocalSearchParams(),
}));

vi.mock("@/components/canvas-primitives", () => ({
  Banner: (props: Record<string, unknown>) =>
    React.createElement("Banner", props as any, (props as any).children),
  Btn: (props: Record<string, unknown>) =>
    React.createElement("Btn", props as any, (props as any).children),
  Card: (props: Record<string, unknown>) =>
    React.createElement("Card", props as any, (props as any).children),
  Field: (props: Record<string, unknown>) =>
    React.createElement("Field", props as any, (props as any).children),
  PageHeader: (props: Record<string, unknown>) =>
    React.createElement("PageHeader", props as any, (props as any).children),
  Pill: (props: Record<string, unknown>) =>
    React.createElement("Pill", props as any, (props as any).children),
  driverCanvasTheme: {
    danger: "#ef4444",
    warn: "#f59e0b",
    accent: "#7BC0FF",
    bg: "#0f172a",
    border: "#334155",
    borderStrong: "#64748b",
    dangerBg: "#450a0a",
    dangerBorder: "#7f1d1d",
    surface: "#111827",
    bgRaised: "#1f2937",
    text: "#ffffff",
    textMuted: "#94a3b8",
    textDim: "#64748b",
  },
}));

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    isFeatureEnabled: mocks.isFeatureEnabled,
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
  }),
  getPendingDriverIncidentSubmission: mocks.getPendingDriverIncidentSubmission,
  replayPendingDriverIncidentSubmission:
    mocks.replayPendingDriverIncidentSubmission,
  saveDriverSosAcknowledgement: mocks.saveDriverSosAcknowledgement,
  submitDriverIncident: mocks.submitDriverIncident,
}));

import IncidentScreen from "../../app/incident";

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function findHoldButton(renderer: any) {
  return renderer.root.find(
    (node: any) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel === "按住 2 秒送出 SOS",
  );
}

describe("IncidentScreen", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.replace.mockReset();
    mocks.useLocalSearchParams.mockReset().mockReturnValue({});
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.getPendingDriverIncidentSubmission
      .mockReset()
      .mockResolvedValue(null);
    mocks.replayPendingDriverIncidentSubmission
      .mockReset()
      .mockResolvedValue(null);
    mocks.submitDriverIncident.mockReset().mockResolvedValue({
      incidentId: "INC-001",
      relatedOrderId: null,
    });
    mocks.saveDriverSosAcknowledgement.mockReset().mockResolvedValue(undefined);
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.spyOn(global, "setInterval").mockImplementation((callback: any) => {
      now = 1000;
      callback();
      now = 2000;
      callback();
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    vi.spyOn(global, "clearInterval").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits SOS only after a full 2-second hold", async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(IncidentScreen));
      await flushEffects();
      await flushEffects();
    });

    const detailField = renderer.root.findByType("TextInput");
    await act(async () => {
      detailField.props.onChangeText("乘客情緒激動，需立即支援");
    });

    const holdButton = findHoldButton(renderer);
    expect(holdButton.props.disabled).toBe(false);

    await act(async () => {
      holdButton.props.onPressIn();
      holdButton.props.onPressOut?.();
      await flushEffects();
      await flushEffects();
    });

    expect(mocks.submitDriverIncident).toHaveBeenCalledWith({
      title: "司機 SOS 緊急通報",
      description: "乘客情緒激動，需立即支援",
      category: "safety",
      severity: "critical",
      reportedBy: "driver",
      occurredAt: expect.any(String),
    });
    expect(mocks.saveDriverSosAcknowledgement).toHaveBeenCalledWith({
      incidentId: "INC-001",
      createdAt: expect.any(String),
      relatedOrderId: null,
      status: "submitted",
      message: "SOS 已送出，安全官與派車台會收到持續顯示的處理提醒。",
      dismissedAt: null,
    });
    expect(mocks.replace).toHaveBeenCalledWith("/trip");
  });

  it("renders the requested emptyReason variant from deep-link params", async () => {
    mocks.useLocalSearchParams.mockReturnValue({
      emptyReason: "driver_not_eligible",
      entry: "cockpit",
    });

    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(IncidentScreen));
      await flushEffects();
      await flushEffects();
    });

    const emptyStateCard = renderer.root.find(
      (node: any) =>
        node.type === "Card" && node.props.title === "司機目前不在可接單資格內",
    );
    expect(emptyStateCard).toBeTruthy();
  });
});
