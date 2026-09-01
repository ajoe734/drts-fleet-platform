import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("expo-router", () => {
  return {
    Link: (props: Record<string, unknown>) =>
      React.createElement("Link", props, props.children as never),
  };
});

import { AppText } from "../../components/ui-rn/AppText";
import { AuthorityBadge } from "../../components/ui-rn/AuthorityBadge";
import { Badge } from "../../components/ui-rn/Badge";
import { Button } from "../../components/ui-rn/Button";
import { ForwardedStatusBadge } from "../../components/ui-rn/ForwardedStatusBadge";
import { Screen } from "../../components/ui-rn/Screen";
import { Inline, Stack } from "../../components/ui-rn/Stack";
import { Surface } from "../../components/ui-rn/Surface";
import {
  PlatformAuthorityBanner,
  PlatformTaskBadge,
  getPlatformDisplayLabel,
  isOwnedPlatformCode,
  normalizePlatformCode,
} from "../../components/platform-task-badge";
import { PlaceholderScreen } from "../../components/placeholder-screen";
import {
  getFinanceAuthorityModeForPlatformCode,
  isOwnedPlatformCode as isOwnedEarningsPlatform,
  isShadowOnlyPlatformCode,
} from "../../components/earnings-by-platform";
import {
  PlatformStatusCard,
  assessPlatformHealth,
} from "../../components/platform-status-card";
import {
  markDriverSessionSignedOut,
  resetDriverSessionLifecycleForTests,
} from "../../lib/driver-session-lifecycle";

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

function flatStyles(
  node: any,
  resolveProps?: unknown,
): Record<string, unknown> {
  const raw = node.props.style;
  const style = typeof raw === "function" ? raw(resolveProps ?? {}) : raw;
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

describe("ui-rn AppText", () => {
  it("renders its children", () => {
    const renderer = render(el(AppText, null, "行程作業台"));
    expect(texts(renderer)).toContain("行程作業台");
  });

  it("varies the colour with the tone", () => {
    const base = render(el(AppText, null, "a"));
    const muted = render(el(AppText, { tone: "muted" }, "a"));

    expect(flatStyles(base.root.findByType("Text")).color).not.toBe(
      flatStyles(muted.root.findByType("Text")).color,
    );
  });

  it("varies the typography with the variant", () => {
    const body = render(el(AppText, null, "a"));
    const title = render(el(AppText, { variant: "screenTitle" }, "a"));

    expect(flatStyles(body.root.findByType("Text")).fontSize).not.toBe(
      flatStyles(title.root.findByType("Text")).fontSize,
    );
  });

  it("forwards arbitrary Text props", () => {
    const renderer = render(el(AppText, { numberOfLines: 2 }, "a"));
    expect(renderer.root.findByType("Text").props.numberOfLines).toBe(2);
  });
});

describe("ui-rn Button", () => {
  it("renders the label and fires onPress", () => {
    const onPress = vi.fn();
    const renderer = render(el(Button, { label: "接受任務", onPress }));

    expect(texts(renderer)).toContain("接受任務");
    act(() => {
      renderer.root.findByType("Pressable").props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("exposes the button role", () => {
    const renderer = render(el(Button, { label: "a", onPress: vi.fn() }));
    expect(renderer.root.findByType("Pressable").props.accessibilityRole).toBe(
      "button",
    );
  });

  it("disables and dims itself while loading", () => {
    const renderer = render(
      el(Button, {
        label: "a",
        onPress: vi.fn(),
        loading: true,
      }),
    );

    const pressable = renderer.root.findByType("Pressable");
    expect(pressable.props.disabled).toBe(true);
    expect(flatStyles(pressable, { pressed: false }).opacity).toBe(0.5);
    expect(
      renderer.root.findAll((n: any) => n.type === "ActivityIndicator"),
    ).toHaveLength(1);
    expect(texts(renderer)).not.toContain("a");
  });

  it("dims on press but stays full opacity at rest", () => {
    const renderer = render(el(Button, { label: "a", onPress: vi.fn() }));
    const pressable = renderer.root.findByType("Pressable");

    expect(flatStyles(pressable, { pressed: false }).opacity).toBe(1);
    expect(flatStyles(pressable, { pressed: true }).opacity).toBe(0.88);
  });

  it("renders an icon only when one is supplied", () => {
    const bare = render(el(Button, { label: "a", onPress: vi.fn() }));
    expect(bare.root.findAll((n: any) => n.type === "Ionicons")).toHaveLength(
      0,
    );

    const withIcon = render(
      el(Button, {
        label: "a",
        onPress: vi.fn(),
        icon: "car-outline",
      }),
    );
    expect(withIcon.root.findByType("Ionicons").props.name).toBe("car-outline");
  });

  it("renders a transparent ghost and filled primary/danger variants", () => {
    const background = (
      variant: "primary" | "secondary" | "ghost" | "danger",
    ) =>
      flatStyles(
        render(
          el(Button, { label: "a", onPress: vi.fn(), variant }),
        ).root.findByType("Pressable"),
        { pressed: false },
      ).backgroundColor;

    expect(background("ghost")).toBe("transparent");
    expect(background("primary")).not.toBe(background("danger"));
    expect(background("secondary")).not.toBe(background("primary"));
  });
});

describe("ui-rn Badge", () => {
  it("renders a plain label", () => {
    const renderer = render(el(Badge, { label: "已完成" }));
    expect(texts(renderer)).toContain("已完成");
  });

  it("localises a forwarded status", () => {
    const zh = render(el(Badge, { forwardedStatus: "accept_pending" }));
    const en = render(
      el(Badge, {
        forwardedStatus: "accept_pending",
        locale: "en",
      }),
    );

    expect(texts(zh)[0]).not.toBe(texts(en)[0]);
    expect(typeof texts(zh)[0]).toBe("string");
  });

  it("renders the dot only when requested", () => {
    const plain = render(el(Badge, { label: "a" }));
    const dotted = render(el(Badge, { label: "a", dot: true }));

    expect(
      dotted.root.findAll((n: any) => n.type === "View").length -
        plain.root.findAll((n: any) => n.type === "View").length,
    ).toBe(1);
  });

  it("inverts the fill in strong mode", () => {
    const soft = render(el(Badge, { label: "a", tone: "danger" }));
    const strong = render(
      el(Badge, { label: "a", tone: "danger", strong: true }),
    );

    expect(
      flatStyles(soft.root.findAll((n: any) => n.type === "View")[0])
        .backgroundColor,
    ).not.toBe(
      flatStyles(strong.root.findAll((n: any) => n.type === "View")[0])
        .backgroundColor,
    );
  });
});

describe("ui-rn AuthorityBadge and ForwardedStatusBadge", () => {
  it("labels owned and forwarded authority differently", () => {
    const owned = render(el(AuthorityBadge, { authority: "owned" }));
    const forwarded = render(el(AuthorityBadge, { authority: "forwarded" }));

    expect(texts(owned)[0]).not.toBe(texts(forwarded)[0]);
  });

  it("switches the authority label with the locale", () => {
    const zh = render(el(AuthorityBadge, { authority: "owned" }));
    const en = render(
      el(AuthorityBadge, {
        authority: "owned",
        locale: "en",
      }),
    );
    expect(texts(zh)[0]).not.toBe(texts(en)[0]);
  });

  it("renders a label for every forwarded status in the vocabulary", () => {
    const statuses = [
      "received",
      "broadcasted",
      "accept_pending",
      "confirmed",
      "lost_race",
      "cancelled",
      "sync_failed",
      "manual_fallback_required",
    ] as const;

    const labels = statuses.map((status) => {
      const renderer = render(el(ForwardedStatusBadge, { status }));
      return texts(renderer)[0];
    });

    expect(labels.every((label) => typeof label === "string" && label)).toBe(
      true,
    );
    expect(new Set(labels).size).toBe(statuses.length);
  });
});

describe("ui-rn Stack, Surface and Screen", () => {
  it("stacks vertically by default and horizontally as an Inline", () => {
    const column = render(el(Stack, null, el("Marker", null)));
    const row = render(el(Inline, null, el("Marker", null)));

    expect(flatStyles(column.root.findByType("View")).flexDirection).toBe(
      "column",
    );
    expect(flatStyles(row.root.findByType("View")).flexDirection).toBe("row");
    expect(flatStyles(row.root.findByType("View")).alignItems).toBe("center");
  });

  it("honours an explicit gap and alignment", () => {
    const renderer = render(el(Stack, { gap: 24, align: "flex-end" }));
    const style = flatStyles(renderer.root.findByType("View"));
    expect(style.gap).toBe(24);
    expect(style.alignItems).toBe("flex-end");
  });

  it("emphasises the Surface edge only when asked", () => {
    const plain = render(el(Surface, { tone: "danger" }));
    const edged = render(el(Surface, { tone: "danger", emphasizeEdge: true }));

    expect(flatStyles(plain.root.findByType("View")).borderLeftWidth).toBe(1);
    expect(flatStyles(edged.root.findByType("View")).borderLeftWidth).toBe(3);
    expect(flatStyles(edged.root.findByType("View")).borderLeftColor).not.toBe(
      flatStyles(plain.root.findByType("View")).borderLeftColor,
    );
  });

  it("drops the shadow on a flat Surface", () => {
    const flat = render(el(Surface, { elevated: false }));
    expect(flatStyles(flat.root.findByType("View")).shadowOpacity).toBe(0);
  });

  it("scrolls the Screen by default and not when disabled", () => {
    const scrollable = render(el(Screen, null, el("Marker", null)));
    expect(
      scrollable.root.findAll((n: any) => n.type === "ScrollView"),
    ).toHaveLength(1);

    const fixed = render(el(Screen, { scrollable: false }, el("Marker", null)));
    expect(
      fixed.root.findAll((n: any) => n.type === "ScrollView"),
    ).toHaveLength(0);
    expect(fixed.root.findByType("Marker")).toBeDefined();
  });
});

describe("platform-task-badge helpers", () => {
  it("normalises a missing or blank code to owned", () => {
    expect(normalizePlatformCode(null)).toBe("owned");
    expect(normalizePlatformCode(undefined)).toBe("owned");
    expect(normalizePlatformCode("   ")).toBe("owned");
  });

  it("lowercases and trims a supplied code", () => {
    expect(normalizePlatformCode("  UBER ")).toBe("uber");
  });

  it("treats owned and direct as first-party", () => {
    expect(isOwnedPlatformCode("owned")).toBe(true);
    expect(isOwnedPlatformCode("direct")).toBe(true);
    expect(isOwnedPlatformCode("uber")).toBe(false);
  });

  it("maps known platform codes to display names", () => {
    expect(getPlatformDisplayLabel("uber")).toBe("Uber");
    expect(getPlatformDisplayLabel("grab")).toBe("Grab");
    expect(getPlatformDisplayLabel("direct")).toBe("自營派單");
    expect(getPlatformDisplayLabel(null)).toBe("自營派單");
  });

  it("humanises an unregistered code", () => {
    expect(getPlatformDisplayLabel("new_partner-app")).toBe("New Partner App");
  });

  it("renders an owned badge without the forwarded tone", () => {
    const owned = render(el(PlatformTaskBadge, { platformCode: null }));
    const forwarded = render(el(PlatformTaskBadge, { platformCode: "uber" }));

    expect(texts(owned)).toContain("自營派單");
    expect(texts(forwarded)).toContain("Uber");
    expect(
      flatStyles(owned.root.findAll((n: any) => n.type === "View")[0])
        .backgroundColor,
    ).not.toBe(
      flatStyles(forwarded.root.findAll((n: any) => n.type === "View")[0])
        .backgroundColor,
    );
  });

  it("states DRTS authority for an owned task", () => {
    const renderer = render(
      el(PlatformAuthorityBanner, {
        platformCode: "direct",
        description: "本地可完成所有動作。",
      }),
    );

    const rendered = texts(renderer);
    expect(rendered).toContain("自營派單 · DRTS");
    expect(rendered).toContain("可直接操作");
  });

  it("states source-platform authority for a forwarded task", () => {
    const renderer = render(
      el(PlatformAuthorityBanner, {
        platformCode: "grab",
        description: "由平台決定。",
      }),
    );

    const rendered = texts(renderer);
    expect(rendered).toContain("平台主導 · Grab");
    expect(rendered).toContain("來源平台規則生效");
  });
});

describe("earnings finance-authority classification", () => {
  it("treats an unregistered code as owned", () => {
    expect(getFinanceAuthorityModeForPlatformCode("drts-native")).toBe("OWNED");
    expect(isOwnedEarningsPlatform("drts-native")).toBe(true);
  });

  it("treats a forwarder stub as shadow-only", () => {
    expect(isShadowOnlyPlatformCode("forwarder_sandbox")).toBe(true);
    expect(isShadowOnlyPlatformCode("grab_taiwan")).toBe(true);
  });

  it("treats a runtime-seeded platform as external", () => {
    expect(getFinanceAuthorityModeForPlatformCode("uber")).toBe("EXTERNAL");
    expect(isOwnedEarningsPlatform("uber")).toBe(false);
    expect(isShadowOnlyPlatformCode("uber")).toBe(false);
  });

  it("treats a catalog-only platform as external", () => {
    expect(getFinanceAuthorityModeForPlatformCode("indriver")).toBe("EXTERNAL");
  });
});

describe("PlaceholderScreen", () => {
  it("renders the title and description", () => {
    const renderer = render(
      el(PlaceholderScreen, {
        title: "尚未實作",
        description: "此畫面稍後開放。",
      }),
    );

    const rendered = texts(renderer);
    expect(rendered).toContain("尚未實作");
    expect(rendered).toContain("此畫面稍後開放。");
  });

  it("renders the next link only when both href and label are given", () => {
    const withoutLabel = render(
      el(PlaceholderScreen, {
        title: "t",
        description: "d",
        nextHref: "/jobs",
      }),
    );
    expect(
      withoutLabel.root.findAll((n: any) => n.type === "Link"),
    ).toHaveLength(0);

    const full = render(
      el(PlaceholderScreen, {
        title: "t",
        description: "d",
        nextHref: "/jobs",
        nextLabel: "前往任務",
      }),
    );
    expect(full.root.findByType("Link").props.href).toBe("/jobs");
    expect(texts(full)).toContain("前往任務");
  });

  it("renders arbitrary children", () => {
    const renderer = render(
      el(
        PlaceholderScreen,
        { title: "t", description: "d" },
        el("Marker", null),
      ),
    );
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });
});

describe("assessPlatformHealth", () => {
  const NOW = new Date("2026-05-08T04:00:00.000Z");

  function record(overrides: Record<string, unknown> = {}) {
    return {
      driverId: "drv-001",
      platformCode: "uber",
      accountId: "acct-1",
      status: "online",
      eligibility: "eligible",
      tokenExpiresAt: "2026-06-08T04:00:00.000Z",
      reauthRequired: false,
      lastOnlineAt: "2026-05-08T00:00:00.000Z",
      lastOfflineAt: null,
      updatedAt: "2026-05-08T00:00:00.000Z",
      ...overrides,
    } as never;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears a fully healthy platform to receive orders", () => {
    const result = assessPlatformHealth(record());

    expect(result.canReceiveOrders).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.statusLabel).toBe("可接單");
    expect(result.statusTone).toBe("healthy");
    expect(result.readinessLabel).toBe("目前可以接收該平台訂單");
  });

  it("blocks an unbound account", () => {
    const result = assessPlatformHealth(record({ accountId: null }));
    expect(result.blockers).toContain("尚未綁定帳號");
    expect(result.statusLabel).toBe("不可接單");
    expect(result.statusTone).toBe("danger");
  });

  it("blocks an offline platform", () => {
    expect(
      assessPlatformHealth(record({ status: "offline" })).blockers,
    ).toContain("目前為離線狀態");
  });

  it("blocks an expired token", () => {
    const result = assessPlatformHealth(
      record({ tokenExpiresAt: "2026-05-08T03:00:00.000Z" }),
    );
    expect(result.blockers).toContain("平台憑證已到期");
    expect(result.tokenInfo.label).toBe("已到期");
  });

  it("classifies a reauth requirement as attention rather than a hard block", () => {
    const result = assessPlatformHealth(record({ reauthRequired: true }));

    expect(result.canReceiveOrders).toBe(false);
    expect(result.statusLabel).toBe("需要處理");
    expect(result.statusTone).toBe("warning");
  });

  it("classifies a pending eligibility as attention", () => {
    expect(
      assessPlatformHealth(record({ eligibility: "pending" })).statusLabel,
    ).toBe("需要處理");
  });

  it("classifies a restricted eligibility as a hard block", () => {
    const result = assessPlatformHealth(record({ eligibility: "ineligible" }));
    expect(result.blockers).toContain("資格已被限制");
    expect(result.statusLabel).toBe("不可接單");
  });

  it("warns on a degraded adapter and blocks on a downed one", () => {
    const degraded = assessPlatformHealth(record(), {
      platformCode: "uber",
      status: "degraded",
      blockingReason: "平台同步延遲",
      lastSyncAt: null,
    } as never);
    expect(degraded.statusLabel).toBe("需要處理");
    expect(degraded.adapterLabel).toBe("平台同步延遲");
    expect(degraded.adapterTone).toBe("warning");

    const down = assessPlatformHealth(record(), {
      platformCode: "uber",
      status: "down",
      blockingReason: null,
      lastSyncAt: null,
    } as never);
    expect(down.statusLabel).toBe("不可接單");
    expect(down.adapterTone).toBe("danger");
  });

  it("reports an unknown adapter neutrally", () => {
    const result = assessPlatformHealth(record());
    expect(result.adapterLabel).toBe("尚未取得健康狀態");
    expect(result.adapterTone).toBe("neutral");
  });

  it("lists every blocker in the readiness sentence", () => {
    const result = assessPlatformHealth(
      record({ accountId: null, status: "offline", reauthRequired: true }),
    );
    expect(result.readinessLabel).toBe(
      "目前無法接單：尚未綁定帳號、目前為離線狀態、需要重新驗證",
    );
  });

  describe("token expiry urgency", () => {
    it("labels a missing expiry as unset and safe", () => {
      const result = assessPlatformHealth(record({ tokenExpiresAt: null }));
      expect(result.tokenInfo).toEqual({
        label: "未設定到期時間",
        urgency: "safe",
      });
    });

    it("flags under an hour as urgent and warns the status tone", () => {
      const result = assessPlatformHealth(
        record({ tokenExpiresAt: "2026-05-08T04:30:00.000Z" }),
      );
      expect(result.tokenInfo).toEqual({
        label: "剩餘 30 分鐘",
        urgency: "urgent",
      });
      expect(result.statusTone).toBe("warning");
    });

    it("flags under a day as a warning", () => {
      const result = assessPlatformHealth(
        record({ tokenExpiresAt: "2026-05-08T10:15:00.000Z" }),
      );
      expect(result.tokenInfo).toEqual({
        label: "剩餘 6 小時 15 分鐘",
        urgency: "warning",
      });
    });

    it("counts days once past 24 hours", () => {
      const result = assessPlatformHealth(
        record({ tokenExpiresAt: "2026-05-10T07:00:00.000Z" }),
      );
      expect(result.tokenInfo).toEqual({
        label: "剩餘 2 天 3 小時",
        urgency: "safe",
      });
      expect(result.statusTone).toBe("healthy");
    });
  });
});
// Requirement 5: this card is rendered inside always-mounted tab screens, so
// its token-expiry ticker used to keep running long after a logout.
describe("PlatformStatusCard token-expiry ticker", () => {
  function presence(overrides: Record<string, unknown> = {}) {
    return {
      driverId: "drv-001",
      platformCode: "uber",
      accountId: "acct-1",
      status: "online",
      eligibility: "eligible",
      tokenExpiresAt: "2026-06-08T04:00:00.000Z",
      reauthRequired: false,
      lastOnlineAt: "2026-05-08T00:00:00.000Z",
      lastOfflineAt: null,
      updatedAt: "2026-05-08T00:00:00.000Z",
      ...overrides,
    } as never;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T04:00:00.000Z"));
    resetDriverSessionLifecycleForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetDriverSessionLifecycleForTests();
  });

  it("stops ticking once the driver signs out", () => {
    render(el(PlatformStatusCard, { record: presence() }));

    const withTicker = vi.getTimerCount();
    expect(withTicker).toBeGreaterThan(0);

    act(() => {
      markDriverSessionSignedOut();
    });

    expect(vi.getTimerCount()).toBeLessThan(withTicker);
  });

  it("registers no ticker at all when there is no token expiry to count down", () => {
    render(el(PlatformStatusCard, { record: presence({ tokenExpiresAt: null }) }));

    expect(vi.getTimerCount()).toBe(0);
  });
});
