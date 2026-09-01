import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    ActivityIndicator: "ActivityIndicator",
    Pressable: p("Pressable"),
    SafeAreaView: p("SafeAreaView"),
    ScrollView: p("ScrollView"),
    StatusBar: "StatusBar",
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    TextInput: "TextInput",
    TouchableOpacity: p("TouchableOpacity"),
    View: p("View"),
  };
});

vi.mock("@expo/vector-icons", () => {
  return {
    Ionicons: (props: Record<string, unknown>) =>
      React.createElement("Ionicons", props),
  };
});

import { ActionButton } from "../../components/ui/ActionButton";
import { AppScreen } from "../../components/ui/AppScreen";
import { AuthorityBanner } from "../../components/ui/AuthorityBanner";
import { BottomActionBar } from "../../components/ui/BottomActionBar";
import { Chip } from "../../components/ui/Chip";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBanner } from "../../components/ui/ErrorBanner";
import { FormField } from "../../components/ui/FormField";
import { IconButton } from "../../components/ui/IconButton";
import { InfoTile } from "../../components/ui/InfoTile";
import { ListCard } from "../../components/ui/ListCard";
import { PageHeader } from "../../components/ui/PageHeader";
import { PlatformBadge } from "../../components/ui/PlatformBadge";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { StatusChip } from "../../components/ui/StatusChip";
import { TaskStateChip } from "../../components/ui/TaskStateChip";

// React.createElement rejects a props-only call for components whose props type
// marks `children` required. These tests deliberately render such components
// childless, so the element factory is typed at the boundary instead.
function el(
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
): React.ReactElement {
  return React.createElement(
    type as React.ElementType,
    props as never,
    ...children,
  );
}

function render(element: React.ReactElement) {
  let renderer: any;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

function texts(renderer: any): unknown[] {
  return renderer.root
    .findAll((node: any) => node.type === "Text")
    .flatMap((node: any) =>
      Array.isArray(node.props.children)
        ? node.props.children
        : [node.props.children],
    );
}

function flatStyles(node: any): Record<string, unknown> {
  const style = node.props.style;
  const list = Array.isArray(style) ? style.flat(4) : [style];
  return list
    .filter((entry: unknown) => entry && typeof entry === "object")
    .reduce(
      (merged: Record<string, unknown>, entry: Record<string, unknown>) => ({
        ...merged,
        ...entry,
      }),
      {},
    );
}

describe("ActionButton", () => {
  it("renders the title and fires onPress", () => {
    const onPress = vi.fn();
    const renderer = render(el(ActionButton, { title: "送出", onPress }));

    expect(texts(renderer)).toContain("送出");
    act(() => {
      renderer.root.findByType("TouchableOpacity").props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("exposes the button accessibility role and labels", () => {
    const renderer = render(
      el(ActionButton, {
        title: "送出",
        onPress: vi.fn(),
        accessibilityLabel: "送出表單",
        accessibilityHint: "會把資料寫回伺服器",
      }),
    );

    const button = renderer.root.findByType("TouchableOpacity");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("送出表單");
    expect(button.props.accessibilityHint).toBe("會把資料寫回伺服器");
  });

  it("disables itself when told to", () => {
    const renderer = render(
      el(ActionButton, {
        title: "送出",
        onPress: vi.fn(),
        disabled: true,
      }),
    );
    expect(renderer.root.findByType("TouchableOpacity").props.disabled).toBe(
      true,
    );
  });

  it("disables itself while loading and swaps the label for a spinner", () => {
    const renderer = render(
      el(ActionButton, {
        title: "送出",
        onPress: vi.fn(),
        loading: true,
      }),
    );

    expect(renderer.root.findByType("TouchableOpacity").props.disabled).toBe(
      true,
    );
    expect(
      renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
    ).toHaveLength(1);
    expect(texts(renderer)).not.toContain("送出");
  });

  it("renders a leading icon only when one is supplied", () => {
    const without = render(
      el(ActionButton, { title: "送出", onPress: vi.fn() }),
    );
    expect(
      without.root.findAll((n: any) => n.type === "Ionicons"),
    ).toHaveLength(0);

    const withIcon = render(
      el(ActionButton, {
        title: "送出",
        onPress: vi.fn(),
        icon: "save-outline",
      }),
    );
    expect(withIcon.root.findByType("Ionicons").props.name).toBe(
      "save-outline",
    );
  });

  it("gives each variant its own background", () => {
    const backgrounds = (
      ["primary", "secondary", "danger", "ghost"] as const
    ).map((variant) => {
      const renderer = render(
        el(ActionButton, {
          title: "t",
          onPress: vi.fn(),
          variant,
        }),
      );
      return flatStyles(renderer.root.findByType("TouchableOpacity"))
        .backgroundColor;
    });

    expect(new Set(backgrounds).size).toBe(backgrounds.length);
    expect(backgrounds[3]).toBe("transparent");
  });
});

describe("IconButton", () => {
  it("requires and forwards an accessibility label", () => {
    const renderer = render(
      el(IconButton, {
        icon: "refresh",
        onPress: vi.fn(),
        accessibilityLabel: "重新整理",
      }),
    );

    const button = renderer.root.findByType("TouchableOpacity");
    expect(button.props.accessibilityLabel).toBe("重新整理");
    expect(button.props.accessibilityRole).toBe("button");
  });

  it("fires onPress and honours the disabled flag", () => {
    const onPress = vi.fn();
    const renderer = render(
      el(IconButton, {
        icon: "refresh",
        onPress,
        accessibilityLabel: "重新整理",
      }),
    );
    act(() => {
      renderer.root.findByType("TouchableOpacity").props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    const disabled = render(
      el(IconButton, {
        icon: "refresh",
        onPress,
        accessibilityLabel: "重新整理",
        disabled: true,
      }),
    );
    expect(disabled.root.findByType("TouchableOpacity").props.disabled).toBe(
      true,
    );
  });

  it("defaults the glyph size to 20 and honours an override", () => {
    const base = render(
      el(IconButton, {
        icon: "refresh",
        onPress: vi.fn(),
        accessibilityLabel: "a",
      }),
    );
    expect(base.root.findByType("Ionicons").props.size).toBe(20);

    const large = render(
      el(IconButton, {
        icon: "refresh",
        onPress: vi.fn(),
        accessibilityLabel: "a",
        size: 28,
      }),
    );
    expect(large.root.findByType("Ionicons").props.size).toBe(28);
  });
});

describe("FormField", () => {
  it("renders the label and forwards TextInput props", () => {
    const onChangeText = vi.fn();
    const renderer = render(
      el(FormField, {
        label: "姓名",
        value: "陳司機",
        onChangeText,
        placeholder: "請輸入",
        keyboardType: "default",
      }),
    );

    expect(texts(renderer)).toContain("姓名");
    const input = renderer.root.findByType("TextInput");
    expect(input.props.value).toBe("陳司機");
    expect(input.props.placeholder).toBe("請輸入");

    act(() => {
      input.props.onChangeText("林司機");
    });
    expect(onChangeText).toHaveBeenCalledWith("林司機");
  });

  it("shows help text when there is no error", () => {
    const renderer = render(
      el(FormField, {
        label: "半徑",
        helpText: "留白代表不限制",
      }),
    );
    expect(texts(renderer)).toContain("留白代表不限制");
  });

  it("replaces the help text with the error and reddens the border", () => {
    const renderer = render(
      el(FormField, {
        label: "半徑",
        helpText: "留白代表不限制",
        error: "格式錯誤",
      }),
    );

    expect(texts(renderer)).toContain("格式錯誤");
    expect(texts(renderer)).not.toContain("留白代表不限制");

    const clean = render(el(FormField, { label: "半徑" }));
    expect(
      flatStyles(renderer.root.findByType("TextInput")).borderColor,
    ).not.toBe(flatStyles(clean.root.findByType("TextInput")).borderColor);
  });

  it("renders neither help nor error when both are absent", () => {
    const renderer = render(el(FormField, { label: "姓名" }));
    expect(texts(renderer)).toEqual(["姓名"]);
  });
});

describe("SegmentedControl", () => {
  const options = [
    { label: "今日", value: "today" },
    { label: "本週", value: "week" },
    { label: "本月", value: "month" },
  ];

  it("renders one segment per option", () => {
    const renderer = render(
      el(SegmentedControl, {
        options,
        selectedValue: "today",
        onValueChange: vi.fn(),
      }),
    );
    expect(
      renderer.root.findAll((n: any) => n.type === "TouchableOpacity"),
    ).toHaveLength(3);
    expect(texts(renderer)).toEqual(["今日", "本週", "本月"]);
  });

  it("emits the value of the pressed segment", () => {
    const onValueChange = vi.fn();
    const renderer = render(
      el(SegmentedControl, {
        options,
        selectedValue: "today",
        onValueChange,
      }),
    );

    act(() => {
      renderer.root
        .findAll((n: any) => n.type === "TouchableOpacity")[2]
        .props.onPress();
    });
    expect(onValueChange).toHaveBeenCalledWith("month");
  });

  it("styles only the selected segment differently", () => {
    const renderer = render(
      el(SegmentedControl, {
        options,
        selectedValue: "week",
        onValueChange: vi.fn(),
      }),
    );

    const segments = renderer.root.findAll(
      (n: any) => n.type === "TouchableOpacity",
    );
    const backgrounds = segments.map(
      (segment: any) => flatStyles(segment).backgroundColor,
    );
    expect(backgrounds[0]).toBeUndefined();
    expect(backgrounds[1]).toBeDefined();
    expect(backgrounds[2]).toBeUndefined();
  });

  it("still emits when the already-selected segment is pressed", () => {
    const onValueChange = vi.fn();
    const renderer = render(
      el(SegmentedControl, {
        options,
        selectedValue: "today",
        onValueChange,
      }),
    );
    act(() => {
      renderer.root
        .findAll((n: any) => n.type === "TouchableOpacity")[0]
        .props.onPress();
    });
    expect(onValueChange).toHaveBeenCalledWith("today");
  });
});

describe("StatusChip", () => {
  it("renders the label", () => {
    const renderer = render(el(StatusChip, { label: "已儲存" }));
    expect(texts(renderer)).toContain("已儲存");
  });

  it("omits the dot unless asked for", () => {
    const plain = render(el(StatusChip, { label: "a" }));
    expect(plain.root.findAll((n: any) => n.type === "View")).toHaveLength(1);

    const dotted = render(el(StatusChip, { label: "a", dot: true }));
    expect(dotted.root.findAll((n: any) => n.type === "View")).toHaveLength(2);
  });

  it("gives every variant a distinct text colour", () => {
    const variants = [
      "default",
      "success",
      "warning",
      "danger",
      "info",
      "owned",
      "forwarded",
      "brand",
    ] as const;

    const colors = variants.map((variant) => {
      const renderer = render(el(StatusChip, { label: "a", variant }));
      return flatStyles(renderer.root.findByType("Text")).color;
    });

    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBeGreaterThan(5);
  });

  it("inverts the fill in strong mode", () => {
    const soft = render(el(StatusChip, { label: "a", variant: "danger" }));
    const strong = render(
      el(StatusChip, {
        label: "a",
        variant: "danger",
        strong: true,
      }),
    );

    const softText = flatStyles(soft.root.findByType("Text")).color;
    const strongContainer = flatStyles(
      strong.root.findAll((n: any) => n.type === "View")[0],
    ).backgroundColor;

    expect(strongContainer).toBe(softText);
  });
});

describe("TaskStateChip", () => {
  it("maps each task tone to its status variant colour", () => {
    const tones = [
      "needs_action",
      "in_progress",
      "platform_pending",
      "platform_closed",
      "sync_issue",
      "default",
    ] as const;

    const colors = tones.map((tone) => {
      const renderer = render(el(TaskStateChip, { label: "狀態", tone }));
      return flatStyles(renderer.root.findByType("Text")).color;
    });

    // platform_closed and default both fall back to the neutral variant.
    expect(colors[3]).toBe(colors[5]);
    // Token collision: Tokens.colors.forwarded === Tokens.colors.warning
    // (#FBBF24), so "等待平台回覆" and "待司機處理" chips are visually identical.
    expect(colors[2]).toBe(colors[0]);
    expect(new Set(colors).size).toBe(4);
  });

  it("renders the supplied label", () => {
    const renderer = render(el(TaskStateChip, { label: "待司機處理" }));
    expect(texts(renderer)).toContain("待司機處理");
  });
});

describe("PlatformBadge", () => {
  it("uppercases the first two characters of the code", () => {
    const renderer = render(
      el(PlatformBadge, { code: "line-taxi", name: "LINE Taxi" }),
    );
    expect(texts(renderer)).toContain("LI");
    expect(texts(renderer)).toContain("LINE Taxi");
  });

  it("falls back to DR with no code", () => {
    const renderer = render(el(PlatformBadge, { name: "DRTS" }));
    expect(texts(renderer)).toContain("DR");
  });

  it("tones a forwarded platform differently from an owned one", () => {
    const owned = render(el(PlatformBadge, { code: "dr", name: "DRTS" }));
    const forwarded = render(
      el(PlatformBadge, {
        code: "ub",
        name: "Uber",
        forwarded: true,
      }),
    );

    expect(
      flatStyles(owned.root.findAll((n: any) => n.type === "View")[0])
        .backgroundColor,
    ).not.toBe(
      flatStyles(forwarded.root.findAll((n: any) => n.type === "View")[0])
        .backgroundColor,
    );
  });
});

describe("Chip", () => {
  it("renders as a plain view with no handlers", () => {
    const renderer = render(el(Chip, { label: "全部" }));
    expect(
      renderer.root.findAll((n: any) => n.type === "Pressable"),
    ).toHaveLength(0);
    expect(texts(renderer)).toContain("全部");
  });

  it("becomes pressable when given onPress", () => {
    const onPress = vi.fn();
    const renderer = render(el(Chip, { label: "全部", onPress }));

    const pressable = renderer.root.findByType("Pressable");
    expect(pressable.props.accessibilityRole).toBe("button");
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders a labelled close affordance", () => {
    const onClose = vi.fn();
    const renderer = render(el(Chip, { label: "Uber", onClose }));

    const closeButton = renderer.root.find(
      (node: any) =>
        node.type === "Pressable" &&
        node.props.accessibilityLabel === "移除 Uber",
    );
    act(() => {
      closeButton.props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders a supplied icon node", () => {
    const renderer = render(
      el(Chip, {
        label: "Uber",
        icon: el("Marker", { testID: "chip-icon" }),
      }),
    );
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });
});

describe("EmptyState", () => {
  it("shows the title and default icon", () => {
    const renderer = render(el(EmptyState, { title: "沒有任務" }));
    expect(texts(renderer)).toContain("沒有任務");
    expect(renderer.root.findByType("Ionicons").props.name).toBe(
      "information-circle-outline",
    );
  });

  it("renders the optional description", () => {
    const renderer = render(
      el(EmptyState, {
        title: "沒有任務",
        description: "稍後再試",
      }),
    );
    expect(texts(renderer)).toContain("稍後再試");
  });

  it("renders the action only when both title and handler are given", () => {
    const titleOnly = render(
      el(EmptyState, {
        title: "沒有任務",
        actionTitle: "重新整理",
      }),
    );
    expect(
      titleOnly.root.findAll((n: any) => n.type === "TouchableOpacity"),
    ).toHaveLength(0);

    const onAction = vi.fn();
    const full = render(
      el(EmptyState, {
        title: "沒有任務",
        actionTitle: "重新整理",
        onAction,
      }),
    );
    act(() => {
      full.root.findByType("TouchableOpacity").props.onPress();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorBanner", () => {
  it("shows the message with an alert glyph", () => {
    const renderer = render(el(ErrorBanner, { message: "載入失敗" }));
    expect(texts(renderer)).toContain("載入失敗");
    expect(renderer.root.findByType("Ionicons").props.name).toBe(
      "alert-circle",
    );
  });
});

describe("InfoTile", () => {
  it("shows the label and value", () => {
    const renderer = render(el(InfoTile, { label: "距離", value: "12.30" }));
    expect(texts(renderer)).toEqual(["距離", "12.30"]);
  });

  it("appends an optional unit", () => {
    const renderer = render(
      el(InfoTile, {
        label: "距離",
        value: "12.30",
        unit: "km",
      }),
    );
    expect(texts(renderer)).toContain("km");
  });
});

describe("ListCard", () => {
  it("renders as a static view without a handler", () => {
    const renderer = render(el(ListCard, { title: "任務 001" }));
    expect(
      renderer.root.findAll((n: any) => n.type === "TouchableOpacity"),
    ).toHaveLength(0);
    expect(
      renderer.root.findAll((n: any) => n.type === "Ionicons"),
    ).toHaveLength(0);
  });

  it("becomes tappable and shows a chevron with a handler", () => {
    const onPress = vi.fn();
    const renderer = render(el(ListCard, { title: "任務 001", onPress }));

    expect(renderer.root.findByType("Ionicons").props.name).toBe(
      "chevron-forward",
    );
    act(() => {
      renderer.root.findByType("TouchableOpacity").props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders optional subtitle, meta and status slot", () => {
    const renderer = render(
      el(ListCard, {
        title: "任務 001",
        subtitle: "台北車站 → 台北 101",
        meta: "10 分鐘前",
        statusElement: el("Marker", null),
      }),
    );

    expect(texts(renderer)).toContain("台北車站 → 台北 101");
    expect(texts(renderer)).toContain("10 分鐘前");
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });

  it("truncates the title and subtitle to one line", () => {
    const renderer = render(
      el(ListCard, { title: "任務 001", subtitle: "很長的地址" }),
    );
    const textNodes = renderer.root.findAll((n: any) => n.type === "Text");
    expect(textNodes[0].props.numberOfLines).toBe(1);
    expect(textNodes[1].props.numberOfLines).toBe(1);
  });
});

describe("PageHeader", () => {
  it("shows the title and optional subtitle", () => {
    const bare = render(el(PageHeader, { title: "設定" }));
    expect(texts(bare)).toEqual(["設定"]);

    const withSubtitle = render(
      el(PageHeader, { title: "設定", subtitle: "帳號" }),
    );
    expect(texts(withSubtitle)).toEqual(["設定", "帳號"]);
  });

  it("renders an optional right element", () => {
    const renderer = render(
      el(PageHeader, {
        title: "設定",
        rightElement: el("Marker", null),
      }),
    );
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });
});

describe("AuthorityBanner", () => {
  it("shows the title, description and authority label", () => {
    const renderer = render(
      el(AuthorityBanner, {
        title: "安全合規保證",
        description: "離線佐證不會刪除",
        authorityLabel: "OfflineProofPreserved",
      }),
    );

    const rendered = texts(renderer);
    expect(rendered).toContain("安全合規保證");
    expect(rendered).toContain("離線佐證不會刪除");
    expect(rendered).toContain("OfflineProofPreserved");
  });

  it("gives every tone its own accent colour", () => {
    const tones = ["owned", "platform", "warning", "danger"] as const;
    const colors = tones.map((tone) => {
      const renderer = render(
        el(AuthorityBanner, {
          title: "t",
          description: "d",
          authorityLabel: "a",
          tone,
        }),
      );
      return flatStyles(renderer.root.findAll((n: any) => n.type === "View")[0])
        .borderLeftColor;
    });

    const [owned, platform, warning, danger] = colors;
    expect(owned).not.toBe(platform);
    expect(danger).not.toBe(owned);
    // Token collision: Tokens.colors.forwarded === Tokens.colors.warning, so a
    // "platform" authority banner is indistinguishable from a "warning" one.
    expect(platform).toBe(warning);
    expect(new Set(colors).size).toBe(3);
  });
});

describe("BottomActionBar", () => {
  it("renders arbitrary children", () => {
    const renderer = render(el(BottomActionBar, null, el("Marker", null)));
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });

  it("renders an optional notice line", () => {
    const renderer = render(el(BottomActionBar, { notice: "尚未儲存" }));
    expect(texts(renderer)).toContain("尚未儲存");
  });

  it("renders configured primary and secondary actions in order", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const renderer = render(
      el(BottomActionBar, {
        primaryAction: { title: "儲存", onPress: onPrimary },
        secondaryAction: { title: "取消", onPress: onSecondary },
      }),
    );

    const rendered = texts(renderer);
    expect(rendered.indexOf("取消")).toBeLessThan(rendered.indexOf("儲存"));

    act(() => {
      renderer.root
        .findAll((n: any) => n.type === "TouchableOpacity")[0]
        .props.onPress();
    });
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("forwards disabled and loading state to the configured action", () => {
    const renderer = render(
      el(BottomActionBar, {
        primaryAction: { title: "儲存", onPress: vi.fn(), disabled: true },
      }),
    );
    expect(renderer.root.findByType("TouchableOpacity").props.disabled).toBe(
      true,
    );
  });
});

describe("AppScreen", () => {
  it("scrolls by default", () => {
    const renderer = render(el(AppScreen, null, el("Marker", null)));
    expect(
      renderer.root.findAll((n: any) => n.type === "ScrollView"),
    ).toHaveLength(1);
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });

  it("uses a plain view when scrolling is turned off", () => {
    const renderer = render(
      el(AppScreen, { scrollable: false }, el("Marker", null)),
    );
    expect(
      renderer.root.findAll((n: any) => n.type === "ScrollView"),
    ).toHaveLength(0);
  });

  it("applies the requested background to the safe area", () => {
    const renderer = render(
      el(AppScreen, { backgroundColor: "#123456" }, el("Marker", null)),
    );
    expect(
      flatStyles(renderer.root.findByType("SafeAreaView")).backgroundColor,
    ).toBe("#123456");
  });
});
