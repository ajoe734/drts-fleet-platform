import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as realApiClient from "../../../../packages/api-client/src/index";
import type { CreateDriverLeaveCommand } from "../../../../packages/contracts/src";
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

function pageHarness(kind: "driver" | "ops") {
  const appRoot = resolve(
    kind === "driver" ? "apps/driver-app" : "apps/ops-console-web",
  );
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
  const components = Object.fromEntries(
    [
      "DriverLeaveConflict",
      "DriverLeaveDetail",
      "DriverLeaveForm",
      "DriverLeaveList",
      "DriverLeaveShiftImpact",
    ].map((name) => [name, name]),
  );
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
    "@/components/leave": components,
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
  )<{ default: () => unknown }>(
    resolve(
      appRoot,
      kind === "driver" ? "app/leave.tsx" : "app/leave/page.tsx",
    ),
  );
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
  it("driver never starts with fixture rows and respects real empty results", async () => {
    const h = pageHarness("driver");
    expect(node(h.render(), "DriverLeaveList").props.leaves).toEqual([]);
    expect(node(await h.flush(), "DriverLeaveList").props.leaves).toEqual([]);
    expect(h.list).toHaveBeenCalledWith({ driverId: sample.driverId });
  });

  it("driver replaces data with exact API rows and clears stale rows when refresh fails", async () => {
    const h = pageHarness("driver");
    h.list.mockResolvedValueOnce({ items: [sample] });
    h.render();
    const list = node(await h.flush(), "DriverLeaveList");
    expect(list.props.leaves).toEqual([sample]);
    h.list.mockRejectedValueOnce(new Error("network failure"));
    await (list.props.onRefresh as () => Promise<void>)();
    const failed = node(h.render(), "DriverLeaveList");
    expect(failed.props.leaves).toEqual([]);
    expect(failed.props.error).toBe("unavailable");
  });

  it("OPS renders API empty as empty rather than retaining demonstration rows", async () => {
    const h = pageHarness("ops");
    h.render();
    const nodes = await h.flush();
    expect(node(nodes, "CanvasEmptyState").props.title).toBe("查無請假申請");
    expect(nodes.some((item) => item.type === "CanvasTable")).toBe(false);
  });

  it("OPS exposes a retryable error without a fabricated table on failed list", async () => {
    const h = pageHarness("ops");
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
    const h = pageHarness("ops");
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

type CapturedFetchCall = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

function createRealDriverLeaveClientHarness() {
  const appRoot = resolve("apps/driver-app");
  const realRequire = createRequire(resolve(appRoot, "package.json"));
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  let mounted = false;
  const effects: Array<() => unknown> = [];

  const secureStorage = new Map<string, string>();
  const expoConstants = {
    expoConfig: {
      extra: {
        apiBaseUrl: "https://api.drts.example",
      },
    },
  };

  const capturedRequests: CapturedFetchCall[] = [];
  const postQueue: Array<
    (call: CapturedFetchCall) => Promise<Response> | Response
  > = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body =
        typeof init?.body === "string" && init.body.length > 0
          ? JSON.parse(init.body)
          : null;
      const call: CapturedFetchCall = { url, method, headers, body };
      capturedRequests.push(call);

      if (method === "GET" && url.includes("/api/driver-leave/requests")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      const nextHandler = postQueue.shift();
      if (nextHandler) {
        return await nextHandler(call);
      }

      return new Response(
        JSON.stringify({
          data: {
            ...sample,
            leaveId: `lv_${capturedRequests.length}`,
            ...(typeof body === "object" && body !== null ? body : {}),
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }),
  );

  const mocks: Record<string, unknown> = {
    react: {
      ...realRequire("react"),
      useState: (initial: unknown) => {
        const slot = stateIndex++;
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
    "react-native": {
      View: "View",
      Text: "Text",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      StyleSheet: { create: (styles: unknown) => styles },
    },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "expo-router": {
      useRouter: () => ({ back: vi.fn() }),
      useLocalSearchParams: () => ({}),
    },
    "expo-constants": {
      __esModule: true,
      default: expoConstants,
      ...expoConstants,
    },
    "expo-secure-store": {
      getItemAsync: vi.fn(async (key: string) => secureStorage.get(key) ?? null),
      setItemAsync: vi.fn(async (key: string, value: string) => {
        secureStorage.set(key, value);
      }),
      deleteItemAsync: vi.fn(async (key: string) => {
        secureStorage.delete(key);
      }),
    },
    "@drts/api-client": realApiClient,
    "@/components/leave": Object.fromEntries(
      [
        "DriverLeaveConflict",
        "DriverLeaveDetail",
        "DriverLeaveForm",
        "DriverLeaveList",
        "DriverLeaveShiftImpact",
      ].map((name) => [name, name]),
    ),
    "@/components/canvas-primitives": {
      PageHeader: "PageHeader",
      driverCanvasTheme: {},
    },
  };

  const loader = createUiModuleLoader(appRoot, mocks);
  const driverApi = loader<{
    initializeDriverIdentity: () => Promise<void>;
    getDriverId: () => string;
  }>(resolve(appRoot, "lib/api-client.ts"));
  const { default: DriverLeaveScreen } = loader<{ default: () => unknown }>(
    resolve(appRoot, "app/leave.tsx"),
  );

  async function provisionSession(
    overrides: Partial<{
      driverId: string;
      deviceId: string;
      accessToken: string;
      refreshToken: string;
    }> = {},
  ) {
    const session = {
      driverId: sample.driverId,
      deviceId: "dev_unit_001",
      accessToken: "tok_driver_initial",
      refreshToken: "ref_driver_initial",
      tokenType: "Bearer" as const,
      expiresIn: "15m",
      refreshExpiresIn: "30d",
      bindingId: "bind_unit_001",
      issuedAt: "2026-09-11T10:00:00.000Z",
      ...overrides,
    };
    secureStorage.set("drts.driver.session", JSON.stringify(session));
    await driverApi.initializeDriverIdentity();
    return session;
  }

  async function clearProvisionedSession() {
    secureStorage.delete("drts.driver.session");
    await driverApi.initializeDriverIdentity();
  }

  function render(): Element[] {
    stateIndex = 0;
    refIndex = 0;
    const tree = DriverLeaveScreen();
    mounted = true;
    const nodes: Element[] = [];
    function visit(item: unknown) {
      if (Array.isArray(item)) {
        item.forEach(visit);
        return;
      }
      if (!item || typeof item !== "object" || !("props" in item)) return;
      const element = item as Element;
      nodes.push(element);
      visit(element.props.children);
      if (element.props.actions) visit(element.props.actions);
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

  function postCalls(): CapturedFetchCall[] {
    return capturedRequests.filter(
      (req) =>
        req.method === "POST" && req.url.endsWith("/api/driver-leave/requests"),
    );
  }

  return {
    capturedRequests,
    postQueue,
    postCalls,
    provisionSession,
    clearProvisionedSession,
    driverApi,
    render,
    flush,
  };
}

describe("SR-WIRE-001 / C052 / N01: real DriverLeaveScreen -> real ApiClient create idempotency intent binding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseCommand: CreateDriverLeaveCommand = {
    leaveType: "personal",
    startTime: "2026-09-14T08:00:00.000Z",
    endTime: "2026-09-14T12:00:00.000Z",
    reason: "家中有事需要請假處理",
  };

  it("reuses the exact same Idempotency-Key across timeout, network, 5xx, retryable 409 IDEMPOTENCY_IN_PROGRESS retries and concurrent double invocation of the same mounted intent", async () => {
    const h = createRealDriverLeaveClientHarness();
    await h.provisionSession({
      driverId: "drv_intent_retry",
      accessToken: "tok_retry_1",
    });

    h.render();
    const list = node(await h.flush(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    let form = node(h.render(), "DriverLeaveForm");

    // 1. Network failure
    h.postQueue.push(async () => {
      throw new TypeError("Network request failed");
    });
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    form = node(h.render(), "DriverLeaveForm");

    // 2. Timeout / AbortError
    h.postQueue.push(async () => {
      const abortErr = new Error("The operation was aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    });
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    form = node(h.render(), "DriverLeaveForm");

    // 3. HTTP 503 Service Unavailable
    h.postQueue.push(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Temporary upstream failure",
              retryable: true,
              traceId: "tr_503",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
    );
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    form = node(h.render(), "DriverLeaveForm");

    // 4. Retryable HTTP 409 IDEMPOTENCY_IN_PROGRESS
    h.postQueue.push(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "IDEMPOTENCY_IN_PROGRESS",
              message: "Concurrent request with same key is processing",
              retryable: true,
              traceId: "tr_409_in_progress",
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
    );
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    form = node(h.render(), "DriverLeaveForm");

    // 5. Concurrent double invocation before completion (first 409 in-progress, second 201 created)
    h.postQueue.push(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "IDEMPOTENCY_IN_PROGRESS",
              message: "In progress",
              retryable: true,
              traceId: "tr_409_double",
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      () =>
        new Response(
          JSON.stringify({
            data: {
              ...sample,
              leaveId: "lv_retry_succeeded",
              driverId: "drv_intent_retry",
              ...baseCommand,
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
    );
    const submitFn = form.props.onSubmit as (
      cmd: CreateDriverLeaveCommand,
    ) => Promise<void>;
    await Promise.all([submitFn(baseCommand), submitFn(baseCommand)]);

    const posts = h.postCalls();
    expect(posts).toHaveLength(6);
    const firstKey = posts[0]!.headers.get("Idempotency-Key");
    expect(firstKey).toMatch(/^driver-leave-create-/);
    for (const post of posts) {
      expect(post.headers.get("Idempotency-Key")).toBe(firstKey);
      expect(post.headers.get("Authorization")).toBe("Bearer tok_retry_1");
      expect(post.headers.get("X-Request-Id")).toBeTruthy();
      expect(post.body).toEqual(baseCommand);
    }
    const detail = node(h.render(), "DriverLeaveDetail");
    expect((detail.props.leave as Leave).leaveId).toBe("lv_retry_succeeded");
  });

  it("preserves the exact same Idempotency-Key across createDriverClientProxy 401 token refresh and retry", async () => {
    const h = createRealDriverLeaveClientHarness();
    await h.provisionSession({
      driverId: "drv_401_proxy",
      deviceId: "dev_401_proxy",
      accessToken: "tok_expired_access",
      refreshToken: "ref_valid_refresh",
    });

    h.render();
    const list = node(await h.flush(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    const form = node(h.render(), "DriverLeaveForm");

    // 1st POST /api/driver-leave/requests -> 401 JWT_INVALID
    // 2nd POST /api/auth/driver/device/refresh -> 200 new session
    // 3rd POST /api/driver-leave/requests -> 201 created
    h.postQueue.push(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "JWT_INVALID",
              message: "Access token expired",
              retryable: false,
              traceId: "tr_401",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      (call) => {
        expect(call.url).toBe(
          "https://api.drts.example/api/auth/driver/device/refresh",
        );
        return new Response(
          JSON.stringify({
            data: {
              driverId: "drv_401_proxy",
              deviceId: "dev_401_proxy",
              accessToken: "tok_refreshed_access",
              refreshToken: "ref_rotated_refresh",
              expiresAt: "2026-12-31T23:59:59.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      () =>
        new Response(
          JSON.stringify({
            data: {
              ...sample,
              leaveId: "lv_after_401_refresh",
              driverId: "drv_401_proxy",
              ...baseCommand,
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
    );

    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );

    const leavePosts = h.postCalls();
    expect(leavePosts).toHaveLength(2);
    const initialKey = leavePosts[0]!.headers.get("Idempotency-Key");
    expect(initialKey).toMatch(/^driver-leave-create-/);
    expect(leavePosts[0]!.headers.get("Authorization")).toBe(
      "Bearer tok_expired_access",
    );
    expect(leavePosts[1]!.headers.get("Authorization")).toBe(
      "Bearer tok_refreshed_access",
    );
    expect(leavePosts[1]!.headers.get("Idempotency-Key")).toBe(initialKey);
  });

  it("generates a distinct Idempotency-Key whenever any command payload field changes, on a new intent after success or cancel, or when actual getDriverId() changes", async () => {
    const h = createRealDriverLeaveClientHarness();
    await h.provisionSession({
      driverId: "drv_alpha",
      accessToken: "tok_alpha",
    });

    h.render();
    let list = node(await h.flush(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    let form = node(h.render(), "DriverLeaveForm");

    const failRetryable503 = () =>
      new Response(
        JSON.stringify({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Transient failure",
            retryable: true,
            traceId: "tr_503",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );

    // 1. Initial submit (fails 503 so form stays mounted in create view)
    h.postQueue.push(failRetryable503);
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    form = node(h.render(), "DriverLeaveForm");

    // 2. Payload changes across leaveType, startTime, endTime, reason
    const mutatedCommands: CreateDriverLeaveCommand[] = [
      { ...baseCommand, leaveType: "sick" },
      { ...baseCommand, startTime: "2026-09-14T09:00:00.000Z" },
      { ...baseCommand, endTime: "2026-09-14T14:00:00.000Z" },
      { ...baseCommand, reason: "改為下午門診請假" },
    ];
    for (const mutated of mutatedCommands) {
      h.postQueue.push(failRetryable503);
      await (
        form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>
      )(mutated);
      form = node(h.render(), "DriverLeaveForm");
    }

    // 3. Explicit cancel back to list, then new create intent with baseCommand (fails 503)
    (form.props.onCancel as () => void)();
    list = node(h.render(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    form = node(h.render(), "DriverLeaveForm");
    h.postQueue.push(failRetryable503);
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );

    // 4. Header back button back to list, then new create intent with baseCommand (succeeds 201)
    const backBtn = node(h.render(), "Pressable");
    (backBtn.props.onPress as () => void)();
    list = node(h.render(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    form = node(h.render(), "DriverLeaveForm");
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    const detail = node(h.render(), "DriverLeaveDetail");

    // 5. After 201 success -> back to list -> new create intent with identical baseCommand (fails 503)
    (detail.props.onBack as () => void)();
    list = node(h.render(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    form = node(h.render(), "DriverLeaveForm");
    h.postQueue.push(failRetryable503);
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    form = node(h.render(), "DriverLeaveForm");

    // 6. Switch actual getDriverId() identity to drv_beta while keeping identical baseCommand
    //    (even if a non-contract command.driverId property is attached, actual getDriverId() governs)
    await h.provisionSession({
      driverId: "drv_beta",
      accessToken: "tok_beta",
    });
    expect(h.driverApi.getDriverId()).toBe("drv_beta");
    h.postQueue.push(failRetryable503);
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      Object.assign({ driverId: "drv_alpha" }, baseCommand),
    );

    const posts = h.postCalls();
    expect(posts).toHaveLength(9);
    const keys = posts.map((p) => p.headers.get("Idempotency-Key"));
    for (const key of keys) {
      expect(key).toMatch(/^driver-leave-create-/);
    }
    expect(new Set(keys).size).toBe(9);
    expect(posts[8]!.headers.get("Authorization")).toBe("Bearer tok_beta");

    // 7. Unprovisioned driver fails closed without emitting another POST
    await h.clearProvisionedSession();
    form = node(h.render(), "DriverLeaveForm");
    await (form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>)(
      baseCommand,
    );
    expect(h.postCalls()).toHaveLength(9);
  });

  it("deduplicates visible leave rows when same mounted intent is invoked twice before completion and both replies return 201 with the same authoritative leaveId (idempotent replay)", async () => {
    const h = createRealDriverLeaveClientHarness();
    await h.provisionSession({
      driverId: "drv_replay_dedup",
      accessToken: "tok_replay_dedup",
    });

    h.render();
    const list = node(await h.flush(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    const form = node(h.render(), "DriverLeaveForm");
    const submitFn = form.props.onSubmit as (
      cmd: CreateDriverLeaveCommand,
    ) => Promise<void>;

    let resolveFirst!: (res: Response) => void;
    let resolveSecond!: (res: Response) => void;
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPending = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });

    h.postQueue.push(
      () => firstPending,
      () => secondPending,
    );

    // Invoke same mounted intent twice before either request completes
    const p1 = submitFn(baseCommand);
    const p2 = submitFn(baseCommand);

    // Wait for both outbound POSTs to reach fetch boundary
    await Promise.resolve();
    await Promise.resolve();
    const posts = h.postCalls();
    expect(posts).toHaveLength(2);
    const key1 = posts[0]!.headers.get("Idempotency-Key");
    const key2 = posts[1]!.headers.get("Idempotency-Key");
    expect(key1).toMatch(/^driver-leave-create-/);
    expect(key2).toBe(key1);

    const makeReplay201Response = () =>
      new Response(
        JSON.stringify({
          data: {
            ...sample,
            leaveId: "one-logical-leave",
            driverId: "drv_replay_dedup",
            ...baseCommand,
          },
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "X-Idempotent-Replay": "true",
          },
        },
      );

    resolveFirst(makeReplay201Response());
    resolveSecond(makeReplay201Response());
    await Promise.all([p1, p2]);

    const detail = node(h.render(), "DriverLeaveDetail");
    expect((detail.props.leave as Leave).leaveId).toBe("one-logical-leave");
    expect(detail.props.isWithdrawing).toBe(false);

    (detail.props.onBack as () => void)();
    const listAfterReplay = node(h.render(), "DriverLeaveList");
    const visibleLeaves = listAfterReplay.props.leaves as Leave[];
    const visibleLeaveIds = visibleLeaves.map((item) => item.leaveId);
    expect(visibleLeaveIds).toEqual(["one-logical-leave"]);
    expect(new Set(visibleLeaveIds).size).toBe(1);
  });

  it("isolates active driver state and newer/canceled intents when actual getDriverId() switches from controlled_driver_A to controlled_driver_B while A's POST is pending", async () => {
    const h = createRealDriverLeaveClientHarness();
    await h.provisionSession({
      driverId: "controlled_driver_A",
      accessToken: "tok_driver_A",
    });

    h.render();
    let list = node(await h.flush(), "DriverLeaveList");
    (list.props.onCreatePress as () => void)();
    let form = node(h.render(), "DriverLeaveForm");

    // Case 1: Start onSubmit as controlled_driver_A, switch to controlled_driver_B while pending, then resolve A's 201 response
    let resolveDriverA1!: (res: Response) => void;
    h.postQueue.push(
      () =>
        new Promise<Response>((resolve) => {
          resolveDriverA1 = resolve;
        }),
    );

    const pendingSubmitA1 = (
      form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>
    )(baseCommand);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.postCalls()).toHaveLength(1);
    const keyDriverA1 = h.postCalls()[0]!.headers.get("Idempotency-Key");
    expect(keyDriverA1).toMatch(/^driver-leave-create-/);

    // Switch active driver identity to controlled_driver_B while A's POST is still in flight
    await h.provisionSession({
      driverId: "controlled_driver_B",
      accessToken: "tok_driver_B",
    });
    expect(h.driverApi.getDriverId()).toBe("controlled_driver_B");

    resolveDriverA1(
      new Response(
        JSON.stringify({
          data: {
            ...sample,
            leaveId: "lv_stale_driver_A",
            driverId: "controlled_driver_A",
            ...baseCommand,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await pendingSubmitA1;

    // UI must NOT render DriverLeaveDetail for controlled_driver_A or prepend A's leave in B's context
    const nodesAfterStaleA = h.render();
    expect(
      nodesAfterStaleA.some((item) => item.type === "DriverLeaveDetail"),
    ).toBe(false);
    form = node(nodesAfterStaleA, "DriverLeaveForm");
    expect(form.props.existingLeaves).toEqual([]);
    expect(form.props.isSubmitting).toBe(false);
    expect(form.props.serverError).toBeNull();

    // Case 2: Start A pending, switch to B and start B pending; late A error/success must not clobber B's in-flight intent or isSubmitting
    await h.provisionSession({
      driverId: "controlled_driver_A",
      accessToken: "tok_driver_A2",
    });
    let rejectDriverA2!: (err: Error) => void;
    let resolveDriverB!: (res: Response) => void;
    h.postQueue.push(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectDriverA2 = reject;
        }),
      () =>
        new Promise<Response>((resolve) => {
          resolveDriverB = resolve;
        }),
    );

    const pendingSubmitA2 = (
      form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>
    )(baseCommand);
    await Promise.resolve();
    await Promise.resolve();

    await h.provisionSession({
      driverId: "controlled_driver_B",
      accessToken: "tok_driver_B2",
    });
    form = node(h.render(), "DriverLeaveForm");
    const pendingSubmitB = (
      form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>
    )(baseCommand);
    await Promise.resolve();
    await Promise.resolve();

    expect(h.postCalls()).toHaveLength(3);
    const keyDriverA2 = h.postCalls()[1]!.headers.get("Idempotency-Key");
    const keyDriverB = h.postCalls()[2]!.headers.get("Idempotency-Key");
    expect(keyDriverB).toMatch(/^driver-leave-create-/);
    expect(keyDriverB).not.toBe(keyDriverA2);
    expect(keyDriverB).not.toBe(keyDriverA1);

    // Late rejection from obsolete Driver A attempt while Driver B attempt is still pending
    rejectDriverA2(new Error("Stale driver A failure"));
    await pendingSubmitA2;

    form = node(h.render(), "DriverLeaveForm");
    expect(form.props.isSubmitting).toBe(true);
    expect(form.props.serverError).toBeNull();

    // Resolve Driver B's active attempt
    resolveDriverB(
      new Response(
        JSON.stringify({
          data: {
            ...sample,
            leaveId: "lv_active_driver_B",
            driverId: "controlled_driver_B",
            ...baseCommand,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await pendingSubmitB;

    const detailB = node(h.render(), "DriverLeaveDetail");
    const displayedLeave = detailB.props.leave as Leave;
    expect(displayedLeave.leaveId).toBe("lv_active_driver_B");
    expect(displayedLeave.driverId).toBe("controlled_driver_B");
    expect(detailB.props.isWithdrawing).toBe(false);

    (detailB.props.onBack as () => void)();
    list = node(h.render(), "DriverLeaveList");
    expect((list.props.leaves as Leave[]).map((item) => item.leaveId)).toEqual([
      "lv_active_driver_B",
    ]);

    // Case 3: Start submit, cancel back to list while pending, then resolve canceled attempt -> must not navigate to detail or prepend canceled leave
    (list.props.onCreatePress as () => void)();
    form = node(h.render(), "DriverLeaveForm");
    let resolveCanceled!: (res: Response) => void;
    h.postQueue.push(
      () =>
        new Promise<Response>((resolve) => {
          resolveCanceled = resolve;
        }),
    );
    const pendingCanceled = (
      form.props.onSubmit as (cmd: CreateDriverLeaveCommand) => Promise<void>
    )(baseCommand);
    await Promise.resolve();
    await Promise.resolve();

    (form.props.onCancel as () => void)();
    list = node(h.render(), "DriverLeaveList");

    resolveCanceled(
      new Response(
        JSON.stringify({
          data: {
            ...sample,
            leaveId: "lv_canceled_attempt",
            driverId: "controlled_driver_B",
            ...baseCommand,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    await pendingCanceled;

    const nodesAfterCanceledResolve = h.render();
    expect(
      nodesAfterCanceledResolve.some(
        (item) => item.type === "DriverLeaveDetail",
      ),
    ).toBe(false);
    list = node(nodesAfterCanceledResolve, "DriverLeaveList");
    expect((list.props.leaves as Leave[]).map((item) => item.leaveId)).toEqual([
      "lv_active_driver_B",
    ]);
  });
});
