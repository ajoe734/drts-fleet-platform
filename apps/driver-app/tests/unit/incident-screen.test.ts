import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  confirmDangerAction: vi.fn(),
  isFeatureEnabled: vi.fn(),
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
});
