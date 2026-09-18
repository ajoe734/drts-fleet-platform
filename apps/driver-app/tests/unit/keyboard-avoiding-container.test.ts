import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const keyboardListeners: Record<string, ((event?: any) => void) | undefined> = {};

vi.mock("react-native", async () => {
  const ReactModule = await import("react");

  const MockKeyboardAvoidingView = (props: any) =>
    ReactModule.createElement("KeyboardAvoidingView", props, props.children);
  const MockScrollView = (props: any) =>
    ReactModule.createElement("ScrollView", props, props.children);
  const MockView = (props: any) =>
    ReactModule.createElement("View", props, props.children);
  const MockText = (props: any) =>
    ReactModule.createElement("Text", props, props.children);
  const MockTextInput = (props: any) =>
    ReactModule.createElement("TextInput", props, props.children);
  const MockPressable = (props: any) =>
    ReactModule.createElement("Pressable", props, props.children);
  const MockSafeAreaView = (props: any) =>
    ReactModule.createElement("SafeAreaView", props, props.children);
  const MockStatusBar = (props: any) =>
    ReactModule.createElement("StatusBar", props, props.children);

  const mockKeyboard = {
    addListener: vi.fn((event: string, callback: (e?: any) => void) => {
      keyboardListeners[event] = callback;
      return {
        remove: vi.fn(() => {
          delete keyboardListeners[event];
        }),
      };
    }),
    dismiss: vi.fn(),
  };

  return {
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    Keyboard: mockKeyboard,
    KeyboardAvoidingView: MockKeyboardAvoidingView,
    ScrollView: MockScrollView,
    View: MockView,
    Text: MockText,
    TextInput: MockTextInput,
    Pressable: MockPressable,
    SafeAreaView: MockSafeAreaView,
    StatusBar: MockStatusBar,
    StyleSheet: { create: <T>(styles: T) => styles },
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34, top: 47, left: 0, right: 0 }),
}));

import {
  KeyboardAvoidingContainer,
  resolveKeyboardAvoidingBehavior,
} from "../../components/ui/KeyboardAvoidingContainer";
import { AppScreen } from "../../components/ui/AppScreen";

describe("KeyboardAvoidingContainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(keyboardListeners).forEach((key) => delete keyboardListeners[key]);
  });

  describe("resolveKeyboardAvoidingBehavior", () => {
    it("resolves to padding on iOS", () => {
      expect(resolveKeyboardAvoidingBehavior("ios")).toBe("padding");
    });

    it("resolves to undefined on Android to match windowSoftInputMode adjustPan", () => {
      expect(resolveKeyboardAvoidingBehavior("android")).toBeUndefined();
    });

    it("resolves to undefined on Web", () => {
      expect(resolveKeyboardAvoidingBehavior("web")).toBeUndefined();
    });

    it("respects explicit override", () => {
      expect(resolveKeyboardAvoidingBehavior("android", "height")).toBe("height");
      expect(resolveKeyboardAvoidingBehavior("ios", "position")).toBe("position");
    });
  });

  it("renders with default iOS padding behavior and keyboardShouldPersistTaps=handled", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(
          KeyboardAvoidingContainer,
          null,
          React.createElement("TextInput", { placeholder: "註冊代碼" }),
          React.createElement("Pressable", null, React.createElement("Text", null, "註冊此裝置")),
        ),
      );
    });

    const root = renderer.root;
    const avoidingView = root.findByType("KeyboardAvoidingView");
    expect(avoidingView.props.behavior).toBe("padding");

    const scrollView = root.findByType("ScrollView");
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scrollView.props.keyboardDismissMode).toBe("interactive");
  });

  it("renders with Android behavior when behavior=undefined is provided and handles keyboardDidShow/Hide", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(
          KeyboardAvoidingContainer,
          { platformOS: "android" },
          React.createElement("TextInput", { placeholder: "車牌號碼" }),
          React.createElement("Pressable", null, React.createElement("Text", null, "更新")),
        ),
      );
    });

    const root = renderer.root;
    const avoidingView = root.findByType("KeyboardAvoidingView");
    // Android path has undefined behavior so windowSoftInputMode adjustPan controls layout
    expect(avoidingView.props.behavior).toBeUndefined();

    const scrollView = root.findByType("ScrollView");
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("renders footer inside KeyboardAvoidingView so bottom submit actions are not occluded", () => {
    let renderer: any;
    const footerElement = React.createElement(
      "View",
      { testID: "custom-footer" },
      React.createElement("Pressable", null, React.createElement("Text", null, "儲存設定")),
    );

    act(() => {
      renderer = create(
        React.createElement(
          KeyboardAvoidingContainer,
          { footer: footerElement },
          React.createElement("TextInput", { placeholder: "司機電話" }),
        ),
      );
    });

    const root = renderer.root;
    const avoidingView = root.findByType("KeyboardAvoidingView");
    const footerContainer = root.findByProps({ testID: "keyboard-avoiding-container-footer" });
    expect(footerContainer).toBeDefined();

    // Verify footer is a direct child of KeyboardAvoidingView along with the scroll area
    expect(avoidingView.props.children).toContainEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          testID: "keyboard-avoiding-container-footer",
        }),
      }),
    );
  });

  it("updates bottom spacing when keyboard opens and restores on dismissal with no residual offset", () => {
    const keyboardStateChanges: Array<{ visible: boolean; height: number }> = [];

    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(
          KeyboardAvoidingContainer,
          {
            extraBottomSpacing: 24,
            onKeyboardChange: (visible, height) => {
              keyboardStateChanges.push({ visible, height });
            },
          },
          React.createElement("TextInput", { placeholder: "接管時間" }),
          React.createElement("TextInput", { placeholder: "備註" }),
        ),
      );
    });

    const scrollView = renderer.root.findByType("ScrollView");
    const initialPaddingBottom = Array.isArray(scrollView.props.contentContainerStyle)
      ? Object.assign({}, ...scrollView.props.contentContainerStyle).paddingBottom
      : scrollView.props.contentContainerStyle.paddingBottom;

    // Initial padding includes safe area bottom (34)
    expect(initialPaddingBottom).toBe(34);

    // Simulate iOS keyboard opening (keyboardWillShow)
    const showListener = keyboardListeners["keyboardWillShow"];
    expect(showListener).toBeDefined();

    act(() => {
      showListener?.({
        endCoordinates: { height: 280, width: 390, screenX: 0, screenY: 564 },
      });
    });

    const openedPaddingBottom = Array.isArray(scrollView.props.contentContainerStyle)
      ? Object.assign({}, ...scrollView.props.contentContainerStyle).paddingBottom
      : scrollView.props.contentContainerStyle.paddingBottom;

    // With keyboard open, extra bottom spacing (24) is added for visible breathing room
    expect(openedPaddingBottom).toBe(34 + 24);

    // Simulate keyboard dismissal (keyboardWillHide)
    const hideListener = keyboardListeners["keyboardWillHide"];
    expect(hideListener).toBeDefined();

    act(() => {
      hideListener?.();
    });

    const restoredPaddingBottom = Array.isArray(scrollView.props.contentContainerStyle)
      ? Object.assign({}, ...scrollView.props.contentContainerStyle).paddingBottom
      : scrollView.props.contentContainerStyle.paddingBottom;

    // Restored layout has no residual offset
    expect(restoredPaddingBottom).toBe(initialPaddingBottom);
  });

  it("supports non-scrollable mode when scrollable=false", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(
          KeyboardAvoidingContainer,
          { scrollable: false },
          React.createElement("Text", null, "靜態提示"),
        ),
      );
    });

    const root = renderer.root;
    const scrollViews = root.findAllByType("ScrollView");
    expect(scrollViews.length).toBe(0);

    const avoidingView = root.findByType("KeyboardAvoidingView");
    expect(avoidingView).toBeDefined();
  });

  it("applies custom keyboardVerticalOffset and style props cleanly", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(
          KeyboardAvoidingContainer,
          {
            keyboardVerticalOffset: 64,
            behavior: "padding",
            style: { flex: 1, backgroundColor: "#111" },
            contentContainerStyle: { padding: 20 },
          },
          React.createElement("TextInput", { placeholder: "自訂欄位" }),
        ),
      );
    });

    const avoidingView = renderer.root.findByType("KeyboardAvoidingView");
    expect(avoidingView.props.keyboardVerticalOffset).toBe(64);
    expect(avoidingView.props.behavior).toBe("padding");
  });

  it("integrates with AppScreen to provide shared keyboard avoidance and footer support", () => {
    let renderer: any;
    const footer = React.createElement("View", { testID: "appscreen-footer" });

    act(() => {
      renderer = create(
        React.createElement(
          AppScreen,
          { footer },
          React.createElement("TextInput", { placeholder: "電話號碼" }),
        ),
      );
    });

    const root = renderer.root;
    const avoidingView = root.findByType("KeyboardAvoidingView");
    expect(avoidingView.props.behavior).toBe("padding");

    const scrollView = root.findByType("ScrollView");
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");

    const footerNode = root.findByProps({ testID: "keyboard-avoiding-container-footer" });
    expect(footerNode).toBeDefined();
  });

  it("ensures long forms have flexGrow: 1 in contentContainerStyle to scroll to their end while keyboard is open", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(
          KeyboardAvoidingContainer,
          { contentContainerStyle: { paddingHorizontal: 20 } },
          Array.from({ length: 10 }).map((_, i) =>
            React.createElement("TextInput", { key: i, placeholder: `欄位 ${i + 1}` }),
          ),
        ),
      );
    });

    const scrollView = renderer.root.findByType("ScrollView");
    const style = Array.isArray(scrollView.props.contentContainerStyle)
      ? Object.assign({}, ...scrollView.props.contentContainerStyle)
      : scrollView.props.contentContainerStyle;

    expect(style.flexGrow).toBe(1);
    expect(style.paddingHorizontal).toBe(20);
  });
});
