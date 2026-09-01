import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
}));

vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
}));

import { confirmDangerAction } from "../../components/ui/confirm-danger-action";

type AlertButton = {
  text: string;
  style?: string;
  onPress?: () => void;
};

function lastAlertCall(): [string, string, AlertButton[]] {
  return mocks.alert.mock.calls.at(-1) as [string, string, AlertButton[]];
}

describe("confirmDangerAction", () => {
  beforeEach(() => {
    mocks.alert.mockReset();
  });

  it("shows the supplied title and message", () => {
    confirmDangerAction({
      title: "結束班次",
      message: "結束後將停止接收派單。",
      confirmLabel: "確認結束",
      onConfirm: vi.fn(),
    });

    const [title, message] = lastAlertCall();
    expect(title).toBe("結束班次");
    expect(message).toBe("結束後將停止接收派單。");
  });

  it("offers cancel first and the destructive confirm second", () => {
    confirmDangerAction({
      title: "登出",
      message: "確定要登出？",
      confirmLabel: "登出",
      onConfirm: vi.fn(),
    });

    const [, , buttons] = lastAlertCall();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ text: "取消", style: "cancel" });
    expect(buttons[1]).toMatchObject({ text: "登出", style: "destructive" });
  });

  it("defaults the cancel label to 取消", () => {
    confirmDangerAction({
      title: "t",
      message: "m",
      confirmLabel: "c",
      onConfirm: vi.fn(),
    });
    expect(lastAlertCall()[2][0].text).toBe("取消");
  });

  it("honours a custom cancel label", () => {
    confirmDangerAction({
      title: "t",
      message: "m",
      confirmLabel: "c",
      cancelLabel: "返回",
      onConfirm: vi.fn(),
    });
    expect(lastAlertCall()[2][0].text).toBe("返回");
  });

  it("does not run the callback until the confirm button is pressed", () => {
    const onConfirm = vi.fn();
    confirmDangerAction({
      title: "t",
      message: "m",
      confirmLabel: "c",
      onConfirm,
    });

    expect(onConfirm).not.toHaveBeenCalled();

    lastAlertCall()[2][1].onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("leaves the cancel button without a callback so dismissing is inert", () => {
    const onConfirm = vi.fn();
    confirmDangerAction({
      title: "t",
      message: "m",
      confirmLabel: "c",
      onConfirm,
    });

    lastAlertCall()[2][0].onPress?.();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
