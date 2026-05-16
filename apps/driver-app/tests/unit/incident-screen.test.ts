import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  confirmDangerAction: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listUnifiedDriverTasks: vi.fn(),
  listDriverTasks: vi.fn(),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  View: "View",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
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

vi.mock("@/components/ui/StatusChip", () => ({
  StatusChip: (props: Record<string, unknown>) =>
    React.createElement("StatusChip", props),
}));

vi.mock("@/components/ui/confirm-danger-action", () => ({
  confirmDangerAction: mocks.confirmDangerAction,
}));

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    isFeatureEnabled: mocks.isFeatureEnabled,
    listUnifiedDriverTasks: mocks.listUnifiedDriverTasks,
    listDriverTasks: mocks.listDriverTasks,
    createIncident: mocks.createIncident,
    updateIncident: mocks.updateIncident,
  }),
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

describe("IncidentScreen", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.confirmDangerAction.mockReset();
    mocks.isFeatureEnabled.mockReset().mockResolvedValue(true);
    mocks.listUnifiedDriverTasks.mockReset().mockResolvedValue([]);
    mocks.listDriverTasks.mockReset().mockResolvedValue([]);
    mocks.createIncident
      .mockReset()
      .mockResolvedValue({ incidentId: "INC-001" });
    mocks.updateIncident.mockReset().mockResolvedValue(undefined);
  });

  it("requires confirmation before creating a critical SOS incident", async () => {
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
      findActionButton(renderer, "送出 SOS").props.onPress();
    });

    expect(mocks.confirmDangerAction).toHaveBeenCalledTimes(1);
    expect(mocks.createIncident).not.toHaveBeenCalled();

    const options = mocks.confirmDangerAction.mock.calls[0]?.[0] as {
      title: string;
      confirmLabel: string;
      cancelLabel: string;
      onConfirm: () => void;
    };

    expect(options.title).toBe("確認送出 SOS");
    expect(options.confirmLabel).toBe("確認送出");
    expect(options.cancelLabel).toBe("取消");

    await act(async () => {
      options.onConfirm();
      await flushEffects();
    });

    expect(mocks.createIncident).toHaveBeenCalledWith({
      title: "司機 SOS 緊急通報",
      description: "乘客情緒激動，需立即支援",
      category: "safety",
      severity: "critical",
      reportedBy: "driver",
    });
    expect(mocks.updateIncident).toHaveBeenCalledWith("INC-001", {
      escalationTarget: "safety_officer",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/trip");
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
      findActionButton(renderer, "送出 SOS").props.onPress();
    });

    const options = mocks.confirmDangerAction.mock.calls[0]?.[0] as {
      onConfirm: () => void;
    };

    await act(async () => {
      options.onConfirm();
      await flushEffects();
    });

    expect(mocks.createIncident).toHaveBeenCalledWith({
      title: "司機 SOS 緊急通報",
      description:
        "已由司機 App 送出 SOS 緊急通報。\n\n[SOS 平台任務上下文]\n來源平台：Grab（grab）\n本地鏡像訂單：mirror-001\n外部訂單：ext-777\n目前平台狀態：平台已確認",
      category: "safety",
      severity: "critical",
      relatedOrderId: "mirror-001",
      reportedBy: "driver",
    });
  });
});
