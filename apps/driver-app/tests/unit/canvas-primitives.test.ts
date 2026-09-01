import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

// Mutable so a single test can flip to the web-preview rendering path.
const platform = vi.hoisted(() => ({ OS: "ios" as "ios" | "web" }));

vi.mock("react-native", () => {
  const p = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    Platform: {
      get OS() {
        return platform.OS;
      },
      select: (spec: any) => spec[platform.OS] ?? spec.default,
    },
    Pressable: p("Pressable"),
    ScrollView: p("ScrollView"),
    StyleSheet: { create: <T>(s: T) => s, flatten: (s: unknown) => s },
    Text: p("Text"),
    TextInput: "TextInput",
    View: p("View"),
  };
});

vi.mock("react-native-safe-area-context", () => {
  return {
    SafeAreaView: (props: Record<string, unknown>) =>
      React.createElement("SafeAreaView", props, props.children as never),
  };
});

vi.mock("@expo/vector-icons", () => {
  return {
    Ionicons: (props: Record<string, unknown>) =>
      React.createElement("Ionicons", props),
  };
});

import {
  Banner,
  Btn,
  Card,
  DL,
  Field,
  Input,
  KPI,
  PageHeader,
  Pill,
  Shell,
  Table,
  driverCanvasTheme,
} from "../../components/canvas-primitives";

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

describe("driverCanvasTheme", () => {
  it("exposes the semantic tone palette the primitives read", () => {
    for (const key of [
      "accent",
      "bg",
      "border",
      "danger",
      "dangerBg",
      "info",
      "success",
      "successBg",
      "surface",
      "text",
      "textMuted",
      "warn",
      "warnBg",
    ] as const) {
      expect(driverCanvasTheme[key]).toBeTruthy();
    }
  });

  it("keeps the four status tones visually distinct", () => {
    const tones = [
      driverCanvasTheme.success,
      driverCanvasTheme.warn,
      driverCanvasTheme.danger,
      driverCanvasTheme.info,
    ];
    expect(new Set(tones).size).toBe(4);
  });
});

describe("Btn", () => {
  it("renders a string child inside a Text node", () => {
    const renderer = render(el(Btn, { onPress: vi.fn() }, "重新整理"));
    expect(texts(renderer)).toContain("重新整理");
  });

  it("wraps mixed array children so raw strings never escape a Text node", () => {
    const renderer = render(
      el(Btn, { onPress: vi.fn() }, "同步", " ", el("Marker", { key: "m" })),
    );

    expect(texts(renderer)).toContain("同步");
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });

  it("passes an accessibilityLabel through to the pressable", () => {
    const renderer = render(
      el(Btn, { onPress: vi.fn(), accessibilityLabel: "開啟安全求援" }, "SOS"),
    );

    expect(
      renderer.root.findByType("Pressable").props.accessibilityLabel,
    ).toBe("開啟安全求援");
  });

  it("leaves accessibilityLabel undefined when the visible label already reads well", () => {
    const renderer = render(el(Btn, { onPress: vi.fn() }, "重新整理"));

    expect(
      renderer.root.findByType("Pressable").props.accessibilityLabel,
    ).toBeUndefined();
  });

  it("fires onPress and exposes the button role", () => {
    const onPress = vi.fn();
    const renderer = render(el(Btn, { onPress }, "送出"));

    const pressable = renderer.root.findByType("Pressable");
    expect(pressable.props.accessibilityRole).toBe("button");
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("drops the handler entirely when disabled", () => {
    const onPress = vi.fn();
    const renderer = render(el(Btn, { onPress, disabled: true }, "送出"));

    const pressable = renderer.root.findByType("Pressable");
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.onPress).toBeUndefined();
    expect(flatStyles(pressable, { pressed: false }).opacity).toBe(0.6);
  });

  it("dims on press", () => {
    const renderer = render(el(Btn, { onPress: vi.fn() }, "a"));
    const pressable = renderer.root.findByType("Pressable");
    expect(flatStyles(pressable, { pressed: true }).opacity).toBe(0.88);
    expect(flatStyles(pressable, { pressed: false }).opacity).toBe(1);
  });

  it("gives primary, secondary, ghost and danger distinct fills", () => {
    const fill = (props: Record<string, unknown>) =>
      flatStyles(
        render(el(Btn, { onPress: vi.fn(), ...props }, "a")).root.findByType(
          "Pressable",
        ),
        { pressed: false },
      ).backgroundColor;

    expect(fill({ variant: "ghost" })).toBe("transparent");
    expect(fill({ variant: "primary" })).toBe(driverCanvasTheme.accent);
    expect(fill({ variant: "secondary" })).toBe(driverCanvasTheme.surface);
    expect(fill({ danger: true })).toBe(driverCanvasTheme.danger);
  });

  it("lets danger override the variant fill", () => {
    const renderer = render(
      el(Btn, { onPress: vi.fn(), variant: "primary", danger: true }, "a"),
    );
    expect(
      flatStyles(renderer.root.findByType("Pressable"), { pressed: false })
        .backgroundColor,
    ).toBe(driverCanvasTheme.danger);
  });

  it("scales the hit target with the size", () => {
    const minHeight = (size: "xs" | "sm" | "md") =>
      flatStyles(
        render(el(Btn, { onPress: vi.fn(), size }, "a")).root.findByType(
          "Pressable",
        ),
        { pressed: false },
      ).minHeight;

    expect(minHeight("xs")).toBe(24);
    expect(minHeight("sm")).toBe(28);
    expect(minHeight("md")).toBe(34);
  });

  it("renders an optional icon slot", () => {
    const renderer = render(
      el(Btn, { onPress: vi.fn(), icon: el("Marker", null) }, "a"),
    );
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });
});

describe("Pill", () => {
  it("renders its label", () => {
    const renderer = render(el(Pill, null, "可接單"));
    expect(texts(renderer)).toContain("可接單");
  });

  it("colours each tone from the theme palette", () => {
    const color = (tone: string) =>
      flatStyles(
        render(el(Pill, { tone: tone as never }, "a")).root.findByType("Text"),
      ).color;

    expect(color("success")).toBe(driverCanvasTheme.success);
    expect(color("warn")).toBe(driverCanvasTheme.warn);
    expect(color("danger")).toBe(driverCanvasTheme.danger);
    expect(color("info")).toBe(driverCanvasTheme.info);
  });

  it("adds the leading dot only when requested", () => {
    const plain = render(el(Pill, null, "a"));
    const dotted = render(el(Pill, { dot: true }, "a"));

    expect(
      dotted.root.findAll((n: any) => n.type === "View").length -
        plain.root.findAll((n: any) => n.type === "View").length,
    ).toBe(1);
  });
});

describe("Card", () => {
  it("renders body children with no header", () => {
    const renderer = render(el(Card, null, el("Marker", null)));
    expect(renderer.root.findByType("Marker")).toBeDefined();
    expect(texts(renderer)).toEqual([]);
  });

  it("renders the title, subtitle and action slot", () => {
    const renderer = render(
      el(
        Card,
        {
          title: "平台分項",
          subtitle: "外部平台金額為參考值",
          actions: el("Marker", null),
        },
        el("Body", null),
      ),
    );

    expect(texts(renderer)).toContain("平台分項");
    expect(texts(renderer)).toContain("外部平台金額為參考值");
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });

  it("honours an explicit body padding", () => {
    const renderer = render(el(Card, { padding: 0 }, el("Marker", null)));
    const bodies = renderer.root
      .findAll((n: any) => n.type === "View")
      .map((n: any) => flatStyles(n).padding);
    expect(bodies).toContain(0);
  });
});

describe("Banner", () => {
  it("renders the title, body and action slot", () => {
    const renderer = render(
      el(Banner, {
        title: "任務同步降級模式",
        body: "改用舊版任務摘要。",
        actions: el("Marker", null),
        icon: el("Glyph", null),
      }),
    );

    expect(texts(renderer)).toContain("任務同步降級模式");
    expect(texts(renderer)).toContain("改用舊版任務摘要。");
    expect(renderer.root.findByType("Marker")).toBeDefined();
    expect(renderer.root.findByType("Glyph")).toBeDefined();
  });

  it("defaults to the info tone and honours danger", () => {
    const info = render(el(Banner, { title: "a" }));
    const danger = render(el(Banner, { title: "a", tone: "danger" }));

    expect(flatStyles(info.root.findByType("Text")).color).toBe(
      driverCanvasTheme.info,
    );
    expect(flatStyles(danger.root.findByType("Text")).color).toBe(
      driverCanvasTheme.danger,
    );
  });

  it("renders with no title or body at all", () => {
    const renderer = render(el(Banner, {}));
    expect(texts(renderer)).toEqual([]);
  });
});

describe("KPI", () => {
  it("renders the label and value", () => {
    const renderer = render(el(KPI, { label: "總計", value: 12 }));
    expect(texts(renderer)).toContain("總計");
    expect(texts(renderer)).toContain("12");
  });

  it("colours the delta by direction", () => {
    const deltaColor = (deltaTone: "up" | "down" | "neutral") => {
      const renderer = render(
        el(KPI, {
          label: "l",
          value: "1",
          delta: "+3",
          deltaTone,
        }),
      );
      const deltaNode = renderer.root
        .findAll((n: any) => n.type === "Text")
        .find((n: any) => n.props.children === "+3");
      return flatStyles(deltaNode).color;
    };

    expect(deltaColor("up")).toBe(driverCanvasTheme.success);
    expect(deltaColor("down")).toBe(driverCanvasTheme.danger);
    expect(deltaColor("neutral")).toBe(driverCanvasTheme.textMuted);
  });

  it("renders optional sub and hint lines", () => {
    const renderer = render(
      el(KPI, {
        label: "l",
        value: "1",
        sub: "本週",
        hint: "tier:medium",
      }),
    );
    expect(texts(renderer)).toContain("本週");
    expect(texts(renderer)).toContain("tier:medium");
  });
});

describe("DL", () => {
  it("accepts both the k/v and label/value item shapes", () => {
    const renderer = render(
      el(DL, {
        items: [
          { k: "Refresh tier", v: "medium" },
          { label: "資料來源", value: "live" },
        ],
      }),
    );

    const rendered = texts(renderer);
    expect(rendered).toContain("Refresh tier");
    expect(rendered).toContain("medium");
    expect(rendered).toContain("資料來源");
    expect(rendered).toContain("live");
  });

  it("switches the value font to mono per item", () => {
    const renderer = render(
      el(DL, {
        items: [
          { k: "a", v: "1", mono: true },
          { k: "b", v: "2" },
        ],
      }),
    );

    const values = renderer.root
      .findAll((n: any) => n.type === "Text")
      .filter((n: any) => ["1", "2"].includes(n.props.children));
    expect(flatStyles(values[0]).fontFamily).toBe(driverCanvasTheme.monoFamily);
    expect(flatStyles(values[1]).fontFamily).toBe(driverCanvasTheme.fontFamily);
  });

  it("applies monoVal to every value", () => {
    const renderer = render(
      el(DL, { monoVal: true, items: [{ k: "a", v: "1" }] }),
    );
    const value = renderer.root
      .findAll((n: any) => n.type === "Text")
      .find((n: any) => n.props.children === "1");
    expect(flatStyles(value).fontFamily).toBe(driverCanvasTheme.monoFamily);
  });
});

describe("Field and Input", () => {
  it("renders the label and hint around its child", () => {
    const renderer = render(
      el(
        Field,
        { label: "簽收識別", hint: "乘客簽收或簽收單號" },
        el("Marker", null),
      ),
    );

    expect(texts(renderer)).toContain("簽收識別");
    expect(texts(renderer)).toContain("乘客簽收或簽收單號");
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });

  it("marks a required field with an asterisk in the danger colour", () => {
    const optional = render(el(Field, { label: "a" }, el("M", null)));
    expect(texts(optional)).not.toContain("*");

    const required = render(
      el(Field, { label: "a", required: true }, el("M", null)),
    );
    const star = required.root
      .findAll((n: any) => n.type === "Text")
      .find((n: any) => n.props.children === "*");
    expect(flatStyles(star).color).toBe(driverCanvasTheme.danger);
  });

  it("forwards value, placeholder and change handler to the TextInput", () => {
    const onChangeText = vi.fn();
    const renderer = render(
      el(Input, {
        value: "SIGN-001",
        ph: "乘客簽收或簽收單號",
        onChangeText,
        autoCapitalize: "characters",
        autoCorrect: false,
      }),
    );

    const input = renderer.root.findByType("TextInput");
    expect(input.props.value).toBe("SIGN-001");
    expect(input.props.placeholder).toBe("乘客簽收或簽收單號");
    expect(input.props.autoCapitalize).toBe("characters");
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.editable).toBe(true);

    act(() => {
      input.props.onChangeText("SIGN-002");
    });
    expect(onChangeText).toHaveBeenCalledWith("SIGN-002");
  });

  it("honours editable=false", () => {
    const renderer = render(el(Input, { editable: false }));
    expect(renderer.root.findByType("TextInput").props.editable).toBe(false);
  });

  it("renders prefix and suffix affixes", () => {
    const renderer = render(el(Input, { prefix: "NT$", suffix: "km" }));
    expect(texts(renderer)).toContain("NT$");
    expect(texts(renderer)).toContain("km");
  });

  it("switches to the mono font when asked", () => {
    const plain = render(el(Input, {}));
    const mono = render(el(Input, { mono: true }));

    expect(flatStyles(mono.root.findByType("TextInput")).fontFamily).toBe(
      driverCanvasTheme.monoFamily,
    );
    expect(flatStyles(plain.root.findByType("TextInput")).fontFamily).not.toBe(
      driverCanvasTheme.monoFamily,
    );
  });
});

describe("PageHeader", () => {
  it("renders title, subtitle and action slots", () => {
    const renderer = render(
      el(PageHeader, {
        title: "工作台",
        subtitle: "Workspace cockpit",
        actions: el("Marker", null),
      }),
    );

    expect(texts(renderer)).toContain("工作台");
    expect(texts(renderer)).toContain("Workspace cockpit");
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });

  it("accepts element-valued titles", () => {
    const renderer = render(
      el(PageHeader, {
        title: el("Marker", null),
      }),
    );
    expect(renderer.root.findByType("Marker")).toBeDefined();
  });
});

describe("Table", () => {
  const columns = [
    { h: "平台", k: "platform" },
    { h: "淨額", k: "net", mono: true, align: "right" as const },
  ];

  it("renders a header cell per column and a row per record", () => {
    const renderer = render(
      el(Table, {
        columns,
        rows: [
          { platform: "Uber", net: "800" },
          { platform: "Grab", net: "400" },
        ],
      }),
    );

    const rendered = texts(renderer);
    expect(rendered).toContain("平台");
    expect(rendered).toContain("淨額");
    expect(rendered).toContain("Uber");
    expect(rendered).toContain("400");
  });

  it("renders a header-only table for an empty row set", () => {
    const renderer = render(el(Table, { columns, rows: [] }));
    expect(texts(renderer)).toEqual(["平台", "淨額"]);
  });

  it("prefers a custom cell renderer over the key lookup", () => {
    const renderer = render(
      el(Table, {
        columns: [{ h: "平台", k: "platform", r: () => "自訂內容" }],
        rows: [{ platform: "Uber" }],
      }),
    );

    expect(texts(renderer)).toContain("自訂內容");
    expect(texts(renderer)).not.toContain("Uber");
  });

  it("highlights a selected row", () => {
    const renderer = render(
      el(Table, {
        columns,
        rows: [
          { platform: "Uber", net: "1", _selected: true },
          { platform: "Grab", net: "2" },
        ],
      }),
    );

    const backgrounds = renderer.root
      .findAll((n: any) => n.type === "View")
      .map((n: any) => flatStyles(n).backgroundColor);
    expect(backgrounds).toContain(driverCanvasTheme.rowSelect);
  });
});

describe("Shell", () => {
  it("scrolls its children and renders an optional footer", () => {
    const renderer = render(
      el(Shell, { footer: el("Footer", null) }, el("Body", null)),
    );

    expect(renderer.root.findByType("ScrollView")).toBeDefined();
    expect(renderer.root.findByType("Body")).toBeDefined();
    expect(renderer.root.findByType("Footer")).toBeDefined();
  });

  it("omits the footer container when no footer is given", () => {
    const renderer = render(el(Shell, null, el("Body", null)));
    expect(renderer.root.findAll((n: any) => n.type === "Footer")).toHaveLength(
      0,
    );
  });

  // Platform.OS is mocked as "ios" for this suite, so these assertions all
  // describe the on-device rendering path.
  it("clears the notch with a top safe area inset on a device", () => {
    const renderer = render(el(Shell, null, el("Body", null)));

    const safeArea = renderer.root.findByType("SafeAreaView");
    expect(safeArea.props.edges).toEqual(["top"]);
    expect(flatStyles(safeArea).backgroundColor).toBe(driverCanvasTheme.bg);
    expect(safeArea.findByType("Body")).toBeDefined();
  });

  it("never draws the simulated status bar on a device", () => {
    const renderer = render(el(Shell, null, el("Body", null)));

    const rendered = texts(renderer);
    expect(rendered).not.toContain("9:30");
    expect(rendered).not.toContain("87%");
    expect(
      renderer.root.findAll((n: any) => n.type === "Ionicons"),
    ).toHaveLength(0);
  });

  // The web device-frame preview must not fake a handset status bar either:
  // the mock clock / battery / signal readout was demo chrome, not product.
  it("never draws the simulated status bar in the web device frame", () => {
    platform.OS = "web";
    try {
      const renderer = render(el(Shell, null, el("Body", null)));

      const rendered = texts(renderer);
      expect(rendered).not.toContain("9:30");
      expect(rendered).not.toContain("87%");
      expect(
        renderer.root.findAll((n: any) => n.type === "Ionicons"),
      ).toHaveLength(0);
      // The phone frame itself is still there.
      expect(renderer.root.findByType("Body")).toBeDefined();
      expect(
        renderer.root.findAll((n: any) => n.type === "SafeAreaView"),
      ).toHaveLength(0);
    } finally {
      platform.OS = "ios";
    }
  });

  it("keeps the device-frame border off the native shell", () => {
    const renderer = render(el(Shell, null, el("Body", null)));

    const safeArea = renderer.root.findByType("SafeAreaView");
    const style = flatStyles(safeArea);
    expect(style.borderWidth).toBeUndefined();
    expect(style.borderRadius).toBe(0);
    expect(style.flex).toBe(1);
  });
});
