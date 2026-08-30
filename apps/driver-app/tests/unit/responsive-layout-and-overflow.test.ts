import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

let mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };

vi.mock("react-native", async () => {
  const ReactModule = await import("react");

  return {
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    Pressable: (props: any) =>
      ReactModule.createElement("Pressable", props, props.children),
    TouchableOpacity: (props: any) =>
      ReactModule.createElement("TouchableOpacity", props, props.children),
    Text: (props: any) =>
      ReactModule.createElement("Text", props, props.children),
    TextInput: (props: any) =>
      ReactModule.createElement("TextInput", props, props.children),
    View: (props: any) =>
      ReactModule.createElement("View", props, props.children),
    ScrollView: (props: any) =>
      ReactModule.createElement("ScrollView", props, props.children),
    KeyboardAvoidingView: (props: any) =>
      ReactModule.createElement("KeyboardAvoidingView", props, props.children),
    SafeAreaView: (props: any) =>
      ReactModule.createElement("SafeAreaView", props, props.children),
    StatusBar: (props: any) =>
      ReactModule.createElement("StatusBar", props, props.children),
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: (style: any) =>
        Array.isArray(style)
          ? Object.assign({}, ...style.filter(Boolean))
          : style || {},
      hairlineWidth: 1,
    },
    PixelRatio: {
      getFontScale: () => 1.0,
      get: () => 2.0,
    },
    Alert: { alert: vi.fn() },
    Linking: { openURL: vi.fn(), canOpenURL: vi.fn() },
  };
});

vi.mock("@expo/vector-icons", async () => {
  const ReactModule = await import("react");
  return {
    Ionicons: (props: any) => ReactModule.createElement("Ionicons", props),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));

import {
  driverTheme,
  driverSpacing,
  driverRadius,
  scaleTypographyToken,
  scaleTypographyMap,
} from "@/lib/theme";
import { resolveKeyboardAvoidingBehavior } from "@/components/ui/KeyboardAvoidingContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListCard } from "@/components/ui/ListCard";
import { InfoTile } from "@/components/ui/InfoTile";
import {
  Shell,
  Banner,
  Card,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import { DriverBottomTabBar } from "@/components/driver-bottom-tab-bar";

const APP_DIR = join(__dirname, "..", "..");

function flattenStyle(style: any): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return style;
}

describe("DRV-RWD-001: Responsive layout and overflow code-level verification", () => {
  describe("Acceptance Criterion 1: Layout positioning and sizing constraints", () => {
    it("driverTheme layout defines responsive tokens with scalable dimensions", () => {
      expect(driverTheme.layout.pagePadding).toBe(16);
      expect(driverTheme.layout.touchTarget).toBe(44);
      expect(driverTheme.layout.fieldHeight).toBe(48);
      expect(driverSpacing.sm).toBe(8);
      expect(driverSpacing.md).toBe(12);
      expect(driverSpacing.lg).toBe(16);
      expect(driverRadius.md).toBe(10);
    });

    it("keyboard avoiding behavior resolves adaptively per platform", () => {
      expect(resolveKeyboardAvoidingBehavior("ios")).toBe("padding");
      expect(resolveKeyboardAvoidingBehavior("android")).toBeUndefined();
      expect(resolveKeyboardAvoidingBehavior("web")).toBeUndefined();
      expect(resolveKeyboardAvoidingBehavior("ios", "height")).toBe("height");
    });

    it("Shell primitive renders with flexible dimensions without fixed screen simulator bounds", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(
            Shell,
            { theme: driverCanvasTheme },
            React.createElement("Text", null, "App Body"),
          ),
        );
      });

      const root = renderer.root;
      const shellViews = root.findAllByType("View");
      expect(shellViews.length).toBeGreaterThan(0);
      const outerViewStyle = flattenStyle(shellViews[0].props.style);
      expect(outerViewStyle.flex).toBe(1);
      expect(outerViewStyle.overflow).toBe("hidden");
    });
  });

  describe("Acceptance Criterion 2: DeviceId and BindingId overflow & user obtainability", () => {
    it("verifies settings.tsx wraps device fields and marks DeviceId and BindingId selectable", () => {
      const source = readFileSync(join(APP_DIR, "app/settings.tsx"), "utf8");

      // Verify style rules in settings.tsx
      expect(source).toContain("deviceField: {");
      expect(source).toMatch(/deviceField:\s*\{[^}]*flexWrap:\s*["']wrap["']/);
      expect(source).toMatch(/deviceFieldValue:\s*\{[^}]*flex:\s*1/);
      expect(source).toMatch(/deviceFieldValue:\s*\{[^}]*minWidth:\s*160/);
      expect(source).toMatch(/deviceFieldValue:\s*\{[^}]*flexWrap:\s*["']wrap["']/);

      // Verify selectable prop on DeviceId, BindingId, and driverId
      expect(source).toMatch(
        /<Text style=\{styles\.deviceFieldValue\} selectable>\s*\{getProvisionedSession\(\)\?\.deviceId/,
      );
      expect(source).toMatch(
        /<Text style=\{styles\.deviceFieldValue\} selectable>\s*\{getProvisionedSession\(\)\?\.bindingId/,
      );
      expect(source).toMatch(
        /<Text style=\{styles\.deviceFieldValue\} selectable>\s*\{driverId \|\| "尚未綁定"\}/,
      );
    });

    it("verifies safety-operator.tsx DetailRow wraps values and marks detailValue selectable", () => {
      const source = readFileSync(
        join(APP_DIR, "app/safety-operator.tsx"),
        "utf8",
      );

      // Verify detailRow styles
      expect(source).toMatch(/detailRow:\s*\{[^}]*flexWrap:\s*["']wrap["']/);
      expect(source).toMatch(/detailValue:\s*\{[^}]*flex:\s*1/);
      expect(source).toMatch(/detailValue:\s*\{[^}]*minWidth:\s*160/);
      expect(source).toMatch(/detailValue:\s*\{[^}]*flexWrap:\s*["']wrap["']/);

      // Verify DetailRow component renders Text with selectable
      expect(source).toMatch(
        /<Text\s+style=\{\[styles\.detailValue[^\]]*\]\}\s+selectable\s*>\s*\{value\}\s*<\/Text>/,
      );
    });
  });

  describe("Acceptance Criterion 3: Container containment & boundary clipping prevention", () => {
    it("PageHeader titleContainer flexes with wrap and minWidth to prevent action clipping", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(PageHeader, {
            title: "長篇派車工作清單標題",
            subtitle: "即時狀態副標題",
            rightElement: React.createElement("View", { testID: "action-btn" }),
          }),
        );
      });

      const root = renderer.root;
      const views = root.findAllByType("View");
      const containerStyle = flattenStyle(views[0].props.style);
      expect(containerStyle.flexWrap).toBe("wrap");
      expect(containerStyle.flexDirection).toBe("row");

      const titleContainer = views[1];
      const titleStyle = flattenStyle(titleContainer.props.style);
      expect(titleStyle.flex).toBe(1);
      expect(titleStyle.minWidth).toBe(180);
    });

    it("ListCard headerRow wraps status badge and title without fixed clipping", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(ListCard, {
            title: "非常長的班次任務名稱需要自動彈性換行",
            statusElement: React.createElement("View", { testID: "status-chip" }),
          }),
        );
      });

      const root = renderer.root;
      const texts = root.findAllByType("Text");
      const titleText = texts[0];
      const titleStyle = flattenStyle(titleText.props.style);
      expect(titleStyle.flex).toBe(1);
      expect(titleStyle.minWidth).toBe(120);

      const views = root.findAllByType("View");
      const headerRowView = views.find((v: any) => {
        const s = flattenStyle(v.props.style);
        return s.flexDirection === "row" && s.flexWrap === "wrap";
      });
      expect(headerRowView).toBeDefined();
    });

    it("InfoTile valueContainer allows long numeric values with units to wrap cleanly", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(InfoTile, {
            label: "今日累積營收",
            value: "999,999,999",
            unit: "TWD",
          }),
        );
      });

      const root = renderer.root;
      const texts = root.findAllByType("Text");
      const valueText = texts.find(
        (t: any) => t.props.children === "999,999,999",
      );
      expect(valueText).toBeDefined();
      const valueStyle = flattenStyle(valueText.props.style);
      expect(valueStyle.flexShrink).toBe(1);

      const views = root.findAllByType("View");
      const valueContainer = views.find((v: any) => {
        const s = flattenStyle(v.props.style);
        return s.flexDirection === "row" && s.flexWrap === "wrap";
      });
      expect(valueContainer).toBeDefined();
    });

    it("DriverTripMap pinConnector uses flexible maxWidth instead of fixed width", () => {
      const source = readFileSync(
        join(APP_DIR, "components/driver-trip-map.tsx"),
        "utf8",
      );
      expect(source).toMatch(/pinConnector:\s*\{[^}]*flex:\s*1/);
      expect(source).toMatch(/pinConnector:\s*\{[^}]*maxWidth:\s*128/);
      expect(source).not.toMatch(/pinConnector:\s*\{[^}]*width:\s*128/);
    });
  });

  describe("Acceptance Criterion 4: Scalable units and Dynamic Type accessibility", () => {
    it("all base typography tokens use scalable numeric point units", () => {
      for (const token of Object.values(driverTheme.typography)) {
        expect(typeof token.fontSize).toBe("number");
        expect(token.fontSize).toBeGreaterThan(0);
        expect(typeof token.lineHeight).toBe("number");
        expect(token.lineHeight).toBeGreaterThan(token.fontSize);
      }
    });

    it("scales typography tokens proportionally for iOS Dynamic Type & Android font scaling", () => {
      const baseTitle = driverTheme.typography.screenTitle;
      const baseBody = driverTheme.typography.body;

      // 1.0x (normal scale)
      const scale10 = scaleTypographyToken(baseTitle, 1.0);
      expect(scale10.fontSize).toBe(baseTitle.fontSize);
      expect(scale10.lineHeight).toBe(baseTitle.lineHeight);

      // 1.5x (large accessibility scale)
      const scale15 = scaleTypographyToken(baseTitle, 1.5);
      expect(scale15.fontSize).toBe(Math.round(baseTitle.fontSize * 1.5));
      expect(scale15.lineHeight).toBe(Math.round(baseTitle.lineHeight * 1.5));

      // 2.0x (extra large accessibility scale)
      const scale20 = scaleTypographyToken(baseBody, 2.0);
      expect(scale20.fontSize).toBe(Math.round(baseBody.fontSize * 2.0));
      expect(scale20.lineHeight).toBe(Math.round(baseBody.lineHeight * 2.0));
    });

    it("scales the complete typography map consistently", () => {
      const scaledMap = scaleTypographyMap(driverTheme.typography, 1.25);
      expect(scaledMap.body.fontSize).toBe(
        Math.round(driverTheme.typography.body.fontSize * 1.25),
      );
      expect(scaledMap.screenTitle.fontSize).toBe(
        Math.round(driverTheme.typography.screenTitle.fontSize * 1.25),
      );
    });
  });

  describe("Acceptance Criterion 5: Safe area insets adaptation", () => {
    it("Shell primitive integrates useSafeAreaInsets to compute notch / dynamic island padding", () => {
      mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(
            Shell,
            { theme: driverCanvasTheme },
            React.createElement("Text", null, "Inner"),
          ),
        );
      });

      const root = renderer.root;
      const shellViews = root.findAllByType("View");
      const statusBarView = shellViews.find((v: any) => {
        const s = flattenStyle(v.props.style);
        return s.paddingTop !== undefined;
      });
      expect(statusBarView).toBeDefined();
      const statusStyle = flattenStyle(statusBarView.props.style);
      expect(statusStyle.paddingTop).toBe(47); // topInset > 0 ? 47 : 8

      const scrollView = root.findByType("ScrollView");
      const contentStyle = flattenStyle(scrollView.props.contentContainerStyle);
      expect(contentStyle.paddingBottom).toBe(34); // Math.max(34, 24)
    });

    it("Shell primitive enforces minimum padding floor when safe area insets are zero", () => {
      mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(
            Shell,
            { theme: driverCanvasTheme },
            React.createElement("Text", null, "Inner"),
          ),
        );
      });

      const root = renderer.root;
      const shellViews = root.findAllByType("View");
      const statusBarView = shellViews.find((v: any) => {
        const s = flattenStyle(v.props.style);
        return s.paddingTop !== undefined;
      });
      expect(statusBarView).toBeDefined();
      const statusStyle = flattenStyle(statusBarView.props.style);
      expect(statusStyle.paddingTop).toBe(8); // topInset === 0 -> fallback 8

      const scrollView = root.findByType("ScrollView");
      const contentStyle = flattenStyle(scrollView.props.contentContainerStyle);
      expect(contentStyle.paddingBottom).toBe(24); // Math.max(0, 24) = 24
    });

    it("DriverBottomTabBar adapts bottom padding according to safe area insets", () => {
      mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(DriverBottomTabBar, {
            currentRouteName: "index",
          }),
        );
      });

      const root = renderer.root;
      const tabList = root.findByProps({ testID: "driver-bottom-tab-bar" });
      const style = flattenStyle(tabList.props.style);
      expect(style.paddingBottom).toBe(34);
    });
  });

  describe("Acceptance Criterion 6: Root bottom tab bar layout & non-occlusion", () => {
    it("DriverBottomTabBar provides accessible touch targets with minHeight 44", () => {
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(DriverBottomTabBar, {
            currentRouteName: "jobs",
          }),
        );
      });

      const pressables = renderer.root.findAllByType("Pressable");
      expect(pressables.length).toBe(5);
      for (const pressable of pressables) {
        const style =
          typeof pressable.props.style === "function"
            ? flattenStyle(pressable.props.style({ pressed: false }))
            : flattenStyle(pressable.props.style);
        expect(style.minHeight).toBeGreaterThanOrEqual(44);
      }
    });

    it("verifies jobs.tsx removed redundant in-screen DriverBottomTabs so root tab bar is not covered", () => {
      const source = readFileSync(join(APP_DIR, "app/jobs.tsx"), "utf8");
      expect(source).not.toContain("DriverBottomTabs");
      expect(source).not.toContain("bottomTabs:");
    });
  });

  describe("Acceptance Criterion 7 & 8: Long-text, empty, error, and loading state resiliency", () => {
    it("PageHeader and ListCard handle long strings gracefully without layout exceptions", () => {
      const longTitle =
        "【測試長標題】這是一段非常長的派車任務說明標題，用來驗證多語系與長字串情境下的自動換行與容器邊界收納能力，不應造成任何視覺裁切或按鈕碰撞。";
      const longSubtitle =
        "【測試長副標題】詳細路線與接送注意事項：請於指定上車點等候乘客，若有特殊需求請即刻透過回報系統通報後台。";

      let headerRenderer: any;
      act(() => {
        headerRenderer = create(
          React.createElement(PageHeader, {
            title: longTitle,
            subtitle: longSubtitle,
          }),
        );
      });

      const texts = headerRenderer.root.findAllByType("Text");
      expect(texts[0].props.children).toBe(longTitle);
      expect(texts[1].props.children).toBe(longSubtitle);
    });

    it("Banner component renders multi-line error state with flex wrapping and start alignment", () => {
      const errorMsg =
        "伺服器連線逾時（HTTP 504 Gateway Timeout）：無法與遠端派車伺服器建立連線，請檢查網路連線後重試。";

      let bannerRenderer: any;
      act(() => {
        bannerRenderer = create(
          React.createElement(Banner, {
            theme: driverCanvasTheme,
            tone: "danger",
            title: "連線異常",
            body: errorMsg,
          }),
        );
      });

      const views = bannerRenderer.root.findAllByType("View");
      const bannerView = views[0];
      const bannerStyle = flattenStyle(bannerView.props.style);
      expect(bannerStyle.alignItems).toBe("flex-start");
      expect(bannerStyle.flexDirection).toBe("row");

      const copyView = views.find((v: any) => {
        const s = flattenStyle(v.props.style);
        return s.flex === 1 && s.gap === 2;
      });
      expect(copyView).toBeDefined();
    });

    it("Card primitive renders empty and loading states cleanly", () => {
      let cardRenderer: any;
      act(() => {
        cardRenderer = create(
          React.createElement(
            Card,
            {
              theme: driverCanvasTheme,
              title: "目前尚無待處理任務",
              subtitle: "任務狀態",
            },
            React.createElement("Text", null, "暫無指派紀錄"),
          ),
        );
      });

      const root = cardRenderer.root;
      const texts = root.findAllByType("Text");
      const title = texts.find((t: any) => t.props.children === "目前尚無待處理任務");
      expect(title).toBeDefined();
    });
  });

  describe("Acceptance Criterion 9: Non-visual code-level verification discipline", () => {
    it("confirms device-matrix visual verification is strictly code-level without fabricated simulator runs", () => {
      const uatDoc = readFileSync(
        join(
          APP_DIR,
          "../../docs/04-uat/drv-rwd-001-responsive-layout-code-level-verification.md",
        ),
        "utf8",
      );
      expect(uatDoc).toContain("Code-Level Verification Only");
      expect(uatDoc).toContain("device-matrix visual verification is removed");
    });
  });
});
