import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as realApiClient from "../../../../packages/api-client/src/index";
import { createUiModuleLoader } from "./ui-module-loader";

type Element = { type: unknown; props: Record<string, unknown> };
type Leave = {
  leaveId: string;
  driverId: string;
  status: string;
  reason: string;
  leaveType: string;
  startTime: string;
  endTime: string;
  impactedShiftIds: string[];
  createdAt: string;
  updatedAt: string;
  reviewedByPrincipalId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
};
const sample: Leave = {
  leaveId: "lv_real_unit",
  driverId: "drv_real_unit",
  status: "pending",
  reason: "unit request",
  leaveType: "personal",
  startTime: "2026-09-11T12:00:00Z",
  endTime: "2026-09-11T13:00:00Z",
  impactedShiftIds: [],
  createdAt: "2026-09-11T10:00:00Z",
  updatedAt: "2026-09-11T10:00:00Z",
  reviewedByPrincipalId: null,
  reviewedAt: null,
  reviewNotes: null,
};

// The driver-app leave screens were removed on 2026-11-26; only the ops
// console supervisor page remains.
function pageHarness() {
  const appRoot = resolve("apps/ops-console-web");
  const realRequire = createRequire(resolve(appRoot, "package.json"));
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let index = 0;
  let refIndex = 0;
  let mounted = false;
  const effects: Array<() => unknown> = [];
  const list = vi
    .fn<() => Promise<{ items: Leave[] }>>()
    .mockResolvedValue({ items: [] });
  const review = vi.fn<() => Promise<Leave>>();
  const native = {
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    StyleSheet: { create: (styles: unknown) => styles },
  };
  const mocks: Record<string, unknown> = {
    react: {
      ...realRequire("react"),
      useState: (initial: unknown) => {
        const slot = index++;
        if (!(slot in states)) states[slot] = initial;
        return [
          states[slot],
          (value: unknown) => {
            states[slot] =
              typeof value === "function" ? value(states[slot]) : value;
          },
        ];
      },
      useRef: (initial: unknown) => {
        const slot = refIndex++;
        if (!(slot in refs)) refs[slot] = { current: initial };
        return refs[slot];
      },
      useEffect: (effect: () => unknown) => {
        if (!mounted) effects.push(effect);
      },
      useCallback: (callback: unknown) => callback,
    },
    "react-native": native,
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "expo-router": { useRouter: () => ({}), useLocalSearchParams: () => ({}) },
    "@drts/api-client": realApiClient,
    "@/lib/api-client": {
      getDriverClient: () => ({ listDriverLeaves: list }),
      getDriverId: () => sample.driverId,
      getOpsClient: () => ({
        listDriverLeaves: list,
        reviewDriverLeave: review,
      }),
      formatDriverError: () => "unavailable",
    },
    "@/components/canvas-primitives": {
      PageHeader: "PageHeader",
      driverCanvasTheme: {},
    },
    "@drts/ui-web": Object.fromEntries(
      [
        "ActionButton",
        "CanvasBtn",
        "CanvasCard",
        "CanvasEmptyState",
        "CanvasPageHeader",
        "CanvasPill",
        "CanvasTable",
      ].map((name) => [name, name]),
    ),
    "./leave-chips": { OpsLeaveTypeChip: "OpsLeaveTypeChip" },
    "./leave-conflict-view": { LeaveConflictView: "LeaveConflictView" },
    "./leave-detail-view": { LeaveDetailView: "LeaveDetailView" },
    "./leave-history-view": { LeaveHistoryView: "LeaveHistoryView" },
    "./leave-shift-impact-view": {
      LeaveShiftImpactView: "LeaveShiftImpactView",
    },
    "./leave-types": {
      fmtTaipei: (value: string) => value,
      formatLeaveRangeZh: (start: string, end: string) => `${start} / ${end}`,
    },
  };
  (mocks["@drts/ui-web"] as Record<string, unknown>).buildCanvasTheme =
    () => ({});
  const { default: component } = createUiModuleLoader(
    appRoot,
    mocks,
  )<{ default: () => unknown }>(resolve(appRoot, "app/leave/page.tsx"));
  function render(): Element[] {
    index = 0;
    refIndex = 0;
    const tree = component();
    mounted = true;
    const nodes: Element[] = [];
    function visit(node: unknown) {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const element = node as Element;
      nodes.push(element);
      visit(element.props.children);
    }
    visit(tree);
    return nodes;
  }
  async function flush() {
    effects.splice(0).forEach((effect) => effect());
    await Promise.resolve();
    await Promise.resolve();
    return render();
  }
  return { list, review, render, flush, states };
}
function node(nodes: Element[], type: string): Element {
  const found = nodes.find((item) => item.type === type);
  expect(found, `Rendered ${type}`).toBeDefined();
  return found!;
}

describe("SR-WIRE-001: live leave UI data", () => {
  it("OPS renders API empty as empty rather than retaining demonstration rows", async () => {
    const h = pageHarness();
    h.render();
    const nodes = await h.flush();
    expect(node(nodes, "CanvasEmptyState").props.title).toBe("查無請假申請");
    expect(nodes.some((item) => item.type === "CanvasTable")).toBe(false);
  });

  it("OPS exposes a retryable error without a fabricated table on failed list", async () => {
    const h = pageHarness();
    h.list.mockRejectedValueOnce(new Error("service failed"));
    h.render();
    const nodes = await h.flush();
    expect(nodes.some((item) => item.props.role === "alert")).toBe(true);
    expect(nodes.some((item) => item.type === "CanvasTable")).toBe(false);
    const retry = node(nodes, "ActionButton");
    expect(retry.props.label).toBe("重新讀取最新狀態");
    (retry.props.onClick as () => void)();
    const recovered = await h.flush();
    expect(node(recovered, "CanvasEmptyState").props.title).toBe(
      "查無請假申請",
    );
  });

  it("OPS uses the persisted review response, including genuine reviewer and affected shifts", async () => {
    const h = pageHarness();
    const reviewed = {
      ...sample,
      status: "approved",
      reviewedByPrincipalId: "actual-ops-user",
      reviewedAt: "2026-09-11T11:01:02Z",
      reviewNotes: "saved note",
      impactedShiftIds: ["shift_actual"],
    };
    h.list.mockResolvedValueOnce({ items: [sample] });
    h.review.mockResolvedValueOnce(reviewed);
    h.render();
    const table = node(await h.flush(), "CanvasTable");
    const columns = table.props.columns as Array<{
      r: (row: Leave) => Element;
    }>;
    const actions = columns.at(-1)!.r(sample);
    const approve = (actions.props.children as Element[])[0]!;
    await (approve.props.onClick as () => Promise<void>)();
    const stored = h.states
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .find((value) => value?.leaveId === sample.leaveId);
    expect(stored).toMatchObject(reviewed);
    expect(JSON.stringify(stored)).not.toContain("shift_2305");
    expect(JSON.stringify(stored)).not.toContain("王芳");
  });
});
