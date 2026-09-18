import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).__DEV__ = true;

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
  submitDriverSosEvent: vi.fn(),
  isDriverIdentityProvisioned: vi.fn().mockReturnValue(true),
  localSearchParams: {} as Record<string, string | undefined>,
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  getLatestDriverLocationUpdate: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/driver-sos-outbox", () => ({
  createDriverSosActiveCase: vi.fn((params: any) => ({
    clientEventId: "client-event-123",
    eventType: params.eventType,
    description: params.description,
    orderId: params.orderId,
    taskId: params.taskId,
    location: params.location,
    originalTriggeredAt: params.originalTriggeredAt,
    offlineAtTrigger: params.offlineAtTrigger,
    timeline: [],
    attachments: [],
    supplements: [],
  })),
  buildDriverSosSubmitCommand: vi.fn((activeCase: any) => ({
    clientEventId: activeCase.clientEventId,
    orderId: activeCase.orderId,
    taskId: activeCase.taskId,
    eventType: activeCase.eventType,
    severity: "major",
    description: activeCase.description,
    location: activeCase.location,
    originalTriggeredAt: activeCase.originalTriggeredAt,
    offlineAtTrigger: activeCase.offlineAtTrigger,
  })),
  markDriverSosCaseSubmitted: vi.fn((activeCase: any, result: any) => ({
    ...activeCase,
    syncState: "submitted",
    receipt: result.receipt,
  })),
  saveDriverSosActiveCase: vi.fn().mockResolvedValue(undefined),
  mapSituationToDriverSosEventType: vi.fn((situation: any) => {
    if (situation === "traffic_collision") return "traffic_accident";
    if (situation === "medical_emergency") return "passenger_medical";
    return "security_incident";
  }),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  View: "View",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
  useLocalSearchParams: () => mocks.localSearchParams,
}));

vi.mock("@/components/ui/ActionButton", () => ({
  ActionButton: (props: Record<string, unknown>) =>
    React.createElement("ActionButton", props),
}));

vi.mock("@/components/ui/AppScreen", () => ({
  AppScreen: (props: { children?: React.ReactNode }) =>
    React.createElement("AppScreen", props, props.children),
}));

vi.mock("@/components/ui/BottomActionBar", () => ({
  BottomActionBar: (props: { children?: React.ReactNode }) =>
    React.createElement("BottomActionBar", props, props.children),
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: (props: Record<string, unknown>) =>
    React.createElement("EmptyState", props),
}));

vi.mock("@/components/ui/ErrorBanner", () => ({
  ErrorBanner: (props: Record<string, unknown>) =>
    React.createElement("ErrorBanner", props),
}));

vi.mock("@/components/ui/FormField", () => ({
  FormField: (props: Record<string, unknown>) =>
    React.createElement("FormField", props),
}));

vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: (props: Record<string, unknown>) =>
    React.createElement("PageHeader", props),
}));

vi.mock("@/components/ui/PlatformBadge", () => ({
  PlatformBadge: (props: Record<string, unknown>) =>
    React.createElement("PlatformBadge", props),
}));

vi.mock("@/components/ui/StatusChip", () => ({
  StatusChip: (props: Record<string, unknown>) =>
    React.createElement("StatusChip", props),
}));

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    isFeatureEnabled: mocks.isFeatureEnabled,
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
    submitDriverSosEvent: mocks.submitDriverSosEvent,
  }),
  isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
  registerProtectedCacheClearHandler: vi.fn().mockReturnValue(() => {}),
  recoverDriverSessionFromApiError: vi.fn().mockResolvedValue(false),
}));

import IncidentScreen from "../../app/incident";

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function findActionButton(renderer: any, title: string) {
  return renderer.root.find(
    (node: any) => node.type === "ActionButton" && node.props.title === title,
  );
}

function findLongPressButton(renderer: any) {
  return renderer.root.find(
    (node: any) =>
      node.type === "TouchableOpacity" &&
      node.props.accessibilityLabel === "長按確認求援",
  );
}

describe("IncidentScreen", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.submitDriverSosEvent.mockReset().mockResolvedValue({
      receipt: {
        eventNo: "SOS-001",
        incidentId: "INC-001",
        fleetReportConfirmedAt: "2026-08-30T09:00:00.000Z",
      },
    });
    mocks.localSearchParams = {};
  });

  it("requires a 2-second long press before creating a critical SOS incident", async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(IncidentScreen));
      await flushEffects();
    });

    const detailField = renderer.root.findByType("FormField");
    await act(async () => {
      detailField.props.onChangeText("乘客情緒激動，需立即支援");
    });

    await act(async () => {
      findActionButton(renderer, "交通事故").props.onPress();
    });

    await act(async () => {
      findLongPressButton(renderer).props.onPress();
    });

    expect(mocks.submitDriverSosEvent).not.toHaveBeenCalled();
    expect(findLongPressButton(renderer).props.delayLongPress).toBe(2000);

    await act(async () => {
      findLongPressButton(renderer).props.onLongPress();
      await flushEffects();
    });

    expect(mocks.submitDriverSosEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "traffic_accident",
        severity: "major",
        description: "事件情況：交通事故\n乘客情緒激動，需立即支援",
      }),
      expect.any(Object),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/trip");
  });

  it("renders a distinct driver_not_eligible empty state", async () => {
    mocks.localSearchParams = { emptyReason: "driver_not_eligible" };

    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(IncidentScreen));
      await flushEffects();
    });

    const emptyState = renderer.root.findByType("EmptyState");
    expect(emptyState.props.title).toBe("目前狀態不可送出 SOS");
    expect(emptyState.props.description).toContain("司機資格");
  });

  it("preserves forwarded task context in the SOS incident payload", async () => {
    mocks.listUnifiedDriverTasks.mockResolvedValue([
      {
        taskId: "task-forwarded-001",
        orderId: "mirror-001",
        orderDomain: "forwarded",
        sourcePlatform: "grab",
        platformDisplayName: "Grab",
        externalOrderId: "ext-777",
        nativeStatus: "confirmed_by_platform",
        localStatus: "accepted",
        driverActionState: "in_progress",
        allowedActions: ["depart"],
        routeLocked: true,
        fareAuthority: "external_platform",
        settlementAuthority: "external_platform",
        driverPayoutAuthority: "external_platform",
        requiresManualFallback: false,
        requiresReauth: false,
        syncIssueSummary: null,
        blockingReason: null,
        pickupSummary: null,
        dropoffSummary: null,
        deadlineAt: null,
        updatedAt: "2026-05-08T03:40:00.000Z",
      },
    ]);

    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(IncidentScreen));
      await flushEffects();
    });

    await act(async () => {
      findLongPressButton(renderer).props.onLongPress();
      await flushEffects();
    });

    expect(mocks.submitDriverSosEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "security_incident",
        severity: "major",
        orderId: "mirror-001",
        description:
          "已由司機 App 送出 SOS 緊急通報。\n\n[SOS 平台任務上下文]\n來源平台：Grab（grab）\n本地鏡像訂單：mirror-001\n外部訂單：ext-777\n目前平台狀態：平台已確認",
      }),
      expect.any(Object),
    );
  });
});
