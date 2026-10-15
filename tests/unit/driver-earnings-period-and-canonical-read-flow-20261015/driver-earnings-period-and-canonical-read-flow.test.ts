// R2 lineage: selectively retains the socket-free production/UI harness and six
// regression cases from preserved unreviewed f5fd091; results must be rerun.
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as ContractsModule from "../../../packages/contracts/src/index";
import {
  PLATFORM_CODE_FORWARDER_SANDBOX,
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_UBER,
} from "../../../packages/contracts/src/platform-codes";
import { ApiClient } from "../../../packages/api-client/src/index";
import * as UiTokensModule from "../../../packages/ui-tokens/src/index";
import {
  ApiRequestError,
  toApiErrorEnvelope,
} from "../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { PlatformEarningsController } from "../../../apps/api/src/modules/platform-earnings/platform-earnings.controller";
import * as PlatformEarningsRepositoryModule from "../../../apps/api/src/modules/platform-earnings/platform-earnings.repository";
import { PlatformEarningsRepository } from "../../../apps/api/src/modules/platform-earnings/platform-earnings.repository";
import { PlatformEarningsService } from "../../../apps/api/src/modules/platform-earnings/platform-earnings.service";

const driverAppRoot = resolve(__dirname, "../../../apps/driver-app");
const driverRequire = createRequire(resolve(driverAppRoot, "package.json"));

function isExistingFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function createUiModuleLoader(
  appRoot: string,
  mocks: Record<string, unknown> = {},
) {
  const realRequire = createRequire(resolve(appRoot, "package.json"));
  const cache = new Map<string, unknown>();
  for (const [key, value] of Object.entries(mocks)) {
    if (key.startsWith("@/")) {
      const target = resolve(appRoot, key.slice(2));
      for (const candidate of [
        target,
        `${target}.ts`,
        `${target}.tsx`,
        resolve(target, "index.ts"),
        resolve(target, "index.tsx"),
      ]) {
        cache.set(candidate, value);
      }
    }
  }
  function load<T>(path: string): T {
    const file = [
      path,
      `${path}.ts`,
      `${path}.tsx`,
      resolve(path, "index.ts"),
      resolve(path, "index.tsx"),
    ].find(isExistingFile);
    if (!file) throw new Error(`Missing test module: ${path}`);
    if (cache.has(file)) return cache.get(file) as T;
    const module = { exports: {} };
    cache.set(file, module.exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const requireLocal = (id: string): unknown => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.endsWith(".css")) return {};
      if (id.startsWith("@/")) return load(resolve(appRoot, id.slice(2)));
      if (id.startsWith(".")) return load(resolve(dirname(file), id));
      return realRequire(id);
    };
    new Function("require", "module", "exports", output)(
      requireLocal,
      module,
      module.exports,
    );
    return module.exports as T;
  }
  return load;
}

interface TestTreeNode {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<TestTreeNode | string>;
  find: (predicate: (node: TestTreeNode) => boolean) => TestTreeNode;
  findAll: (predicate: (node: TestTreeNode) => boolean) => TestTreeNode[];
}

interface TestRendererInstance {
  root: TestTreeNode;
}

const React = driverRequire("react") as {
  createElement: (type: unknown, props?: Record<string, unknown>) => unknown;
};
const TestRenderer = driverRequire("react-test-renderer") as {
  create: (element: unknown) => TestRendererInstance;
  act: (callback: () => Promise<void> | void) => Promise<void>;
};
const { act } = TestRenderer;

function createReactNativeMock() {
  return {
    View: "View",
    Text: "Text",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    TextInput: "TextInput",
    KeyboardAvoidingView: "KeyboardAvoidingView",
    ActivityIndicator: "ActivityIndicator",
    Modal: "Modal",
    Linking: { openURL: vi.fn() },
    Platform: { OS: "ios" },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T) => styles,
    },
  };
}

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OWN_DRIVER_UUID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_DRIVER_UUID = "99999999-9999-4999-8999-999999999999";

interface LedgerFixtureRow {
  driver_id: string;
  platform_code: string;
  period_date: string;
  currency_code?: string;
  gross_minor: number;
  fee_minor: number;
  subsidy_minor: number;
  net_minor: number;
}

function makeDriverIdentity(
  actorId: string | null = OWN_DRIVER_UUID,
): BootstrapRequestIdentity {
  return {
    actorId: actorId as string,
    actorType: "driver_user",
    realm: "driver",
    tenantId: null,
    roles: ["driver_operator"],
    scopes: ["driver:read"],
    authMode: "jwt_bearer",
    roleFamilies: ["driver"],
    requestId: null,
  };
}

function createCanonicalLedgerDatabaseDouble(rows: LedgerFixtureRow[]) {
  const recordedQueries: Array<{ sql: string; params: unknown[] }> = [];

  const db = {
    isEnabled: () => true,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      recordedQueries.push({ sql, params });
      if (!sql.includes("FROM ops.phase1_platform_earnings_ledger")) {
        throw new Error(`Unexpected SQL table in query: ${sql}`);
      }
      if (!sql.includes("WHERE driver_id = $1")) {
        throw new Error(`Missing canonical driver_id predicate: ${sql}`);
      }

      const driverId = String(params[0] ?? "");
      const hasPeriodFilter =
        sql.includes("period_date >= $2::date") &&
        sql.includes("period_date <= $3::date");
      const startDate = hasPeriodFilter ? String(params[1] ?? "") : null;
      const endDate = hasPeriodFilter ? String(params[2] ?? "") : null;

      const matchingRows = rows.filter((row) => {
        if (row.driver_id !== driverId) {
          return false;
        }
        if (hasPeriodFilter && startDate && endDate) {
          return row.period_date >= startDate && row.period_date <= endDate;
        }
        return true;
      });

      const grouped = new Map<
        string,
        {
          platform_code: string;
          currency_code: string;
          gross_minor: number;
          fee_minor: number;
          subsidy_minor: number;
          net_minor: number;
        }
      >();

      for (const row of matchingRows) {
        const currencyCode = row.currency_code ?? "TWD";
        const key = `${row.platform_code}::${currencyCode}`;
        const bucket = grouped.get(key) ?? {
          platform_code: row.platform_code,
          currency_code: currencyCode,
          gross_minor: 0,
          fee_minor: 0,
          subsidy_minor: 0,
          net_minor: 0,
        };
        bucket.gross_minor += row.gross_minor;
        bucket.fee_minor += row.fee_minor;
        bucket.subsidy_minor += row.subsidy_minor;
        bucket.net_minor += row.net_minor;
        grouped.set(key, bucket);
      }

      const aggregatedRows = Array.from(grouped.values()).sort((left, right) =>
        left.platform_code.localeCompare(right.platform_code),
      );

      return {
        rows: aggregatedRows,
        rowCount: aggregatedRows.length,
      };
    }),
  } as unknown as DatabaseService;

  return { db, recordedQueries };
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function collectRenderedText(renderer: TestRendererInstance): string {
  return renderer.root
    .findAll(
      (node) =>
        String(node.type) === "Text" &&
        node.children.some((child) => typeof child === "string"),
    )
    .map((node) =>
      node.children
        .filter((child): child is string => typeof child === "string")
        .join(""),
    )
    .join(" | ");
}

function createMountedDriverEarningsAppHarness(options: {
  identity: BootstrapRequestIdentity | null;
  earningsController: PlatformEarningsController;
  billingController?: BillingSettlementController;
}) {
  const requestedUrls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    requestedUrls.push(rawUrl);
    const parsedUrl = new URL(rawUrl);

    try {
      if (
        parsedUrl.pathname === "/api/admin/flags/driver-app.earnings/enabled"
      ) {
        return new Response(
          JSON.stringify({
            data: { key: "driver-app.earnings", enabled: true },
            meta: {
              requestId: "req-feature-flag",
              timestamp: "2026-10-15T04:00:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (
        parsedUrl.pathname === "/api/platform-earnings/by-platform" ||
        parsedUrl.pathname === "/platform-earnings/by-platform"
      ) {
        const period = parsedUrl.searchParams.get("period") ?? undefined;
        const driverId = parsedUrl.searchParams.get("driverId") ?? undefined;
        const envelope = await options.earningsController.getByPlatform(
          options.identity,
          driverId,
          "req-driver-ui",
          period,
        );
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        parsedUrl.pathname === "/api/platform-earnings/summary" ||
        parsedUrl.pathname === "/platform-earnings/summary"
      ) {
        const period = parsedUrl.searchParams.get("period") ?? undefined;
        const driverId = parsedUrl.searchParams.get("driverId") ?? undefined;
        const envelope = await options.earningsController.getSummary(
          options.identity,
          driverId,
          "req-driver-ui",
          period,
        );
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        parsedUrl.pathname === "/api/driver/profile/statements" ||
        parsedUrl.pathname === "/api/driver-statements" ||
        parsedUrl.pathname === "/billing/driver-statements"
      ) {
        if (options.billingController) {
          const periodMonth =
            parsedUrl.searchParams.get("periodMonth") ?? undefined;
          const period = parsedUrl.searchParams.get("period") ?? undefined;
          const envelope =
            await options.billingController.listDriverOwnStatements(
              options.identity,
              period,
              periodMonth,
              "req-driver-statements",
            );
          return new Response(JSON.stringify(envelope), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            data: {
              items: [],
              pageInfo: {
                page: 1,
                pageSize: 20,
                totalItems: 0,
                totalPages: 0,
              },
            },
            meta: {
              requestId: "req-empty-statements",
              timestamp: "2026-10-15T04:00:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      throw new Error(`Unhandled path in test harness: ${parsedUrl.pathname}`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        return new Response(JSON.stringify(err.getResponse()), {
          status: err.getStatus(),
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify(
          toApiErrorEnvelope(
            "INTERNAL_ERROR",
            err instanceof Error ? err.message : String(err),
            undefined,
            true,
          ),
        ),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
  };

  vi.stubGlobal("fetch", fetchImpl);

  const apiClient = new ApiClient({
    baseUrl: "http://driver-earnings.local",
  });

  const loadRealApiClientHelper = createUiModuleLoader(driverAppRoot, {
    "expo-constants": {
      default: { expoConfig: { extra: {} } },
      expoConfig: { extra: {} },
    },
    "expo-secure-store": {},
    "@drts/contracts": ContractsModule,
    "@drts/ui-tokens": UiTokensModule,
    "@drts/api-client": {
      ApiClient,
      createDriverBearerClient: () => apiClient,
      createDriverClient: () => apiClient,
      createPublicClient: () => apiClient,
    },
  });
  const realDriverApiClientModule = loadRealApiClientHelper<{
    formatDriverError: (error: unknown, fallback?: string) => string;
  }>(resolve(driverAppRoot, "lib/api-client.ts"));

  const loadDriverModule = createUiModuleLoader(driverAppRoot, {
    react: React,
    "react-native": {
      ...createReactNativeMock(),
      Platform: {
        OS: "ios",
        select: (values: { ios?: unknown; default?: unknown }) =>
          values.ios ?? values.default,
      },
    },
    "@expo/vector-icons": {
      Ionicons: "Ionicons",
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    },
    "expo-router": {
      Redirect: "Redirect",
    },
    "@drts/contracts": ContractsModule,
    "@drts/ui-tokens": UiTokensModule,
    "@/lib/api-client": {
      getDriverClient: () => apiClient,
      isDriverIdentityProvisioned: () => true,
      registerProtectedCacheClearHandler: () => () => {},
      formatDriverError: realDriverApiClientModule.formatDriverError,
    },
  });

  const EarningsScreen = loadDriverModule<{ default: unknown }>(
    resolve(driverAppRoot, "app/earnings.tsx"),
  ).default;
  return { EarningsScreen, requestedUrls, apiClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DRIVER-EARNINGS-PERIOD-AND-CANONICAL-READ-FLOW-20261015", () => {
  describe("c057_actual_selected_period_to_canonical_ledger (C057-F1)", () => {
    const ledgerFixtureRows: LedgerFixtureRow[] = [
      // Inside today (2026-10-15), week (2026-10-12..2026-10-18), and month (2026-10-01..2026-10-31)
      {
        driver_id: OWN_DRIVER_UUID,
        platform_code: PLATFORM_CODE_UBER,
        period_date: "2026-10-15",
        currency_code: "TWD",
        gross_minor: 50000,
        fee_minor: 5000,
        subsidy_minor: 2000,
        net_minor: 47000,
      },
      // Inside week (2026-10-12..2026-10-18) and month, but outside today (2026-10-15)
      {
        driver_id: OWN_DRIVER_UUID,
        platform_code: PLATFORM_CODE_GRAB,
        period_date: "2026-10-13",
        currency_code: "TWD",
        gross_minor: 80000,
        fee_minor: 12000,
        subsidy_minor: 0,
        net_minor: 68000,
      },
      // Inside month (2026-10-01..2026-10-31), but outside week and today
      {
        driver_id: OWN_DRIVER_UUID,
        platform_code: PLATFORM_CODE_LINE_TAXI,
        period_date: "2026-10-03",
        currency_code: "TWD",
        gross_minor: 150000,
        fee_minor: 22500,
        subsidy_minor: 10000,
        net_minor: 137500,
      },
      // Previous month (2026-09-25): outside today, week, and October month
      {
        driver_id: OWN_DRIVER_UUID,
        platform_code: PLATFORM_CODE_FORWARDER_SANDBOX,
        period_date: "2026-09-25",
        currency_code: "TWD",
        gross_minor: 30000,
        fee_minor: 0,
        subsidy_minor: 0,
        net_minor: 30000,
      },
      // Foreign driver row on today's date: must never leak into own-driver slices
      {
        driver_id: FOREIGN_DRIVER_UUID,
        platform_code: PLATFORM_CODE_UBER,
        period_date: "2026-10-15",
        currency_code: "TWD",
        gross_minor: 999000,
        fee_minor: 99900,
        subsidy_minor: 0,
        net_minor: 899100,
      },
    ];

    it("threads today, week, and month from PlatformEarningsController through PlatformEarningsRepository SQL against period_date and preserves absent-period callers", async () => {
      vi.useFakeTimers();
      // 2026-10-15 12:00 Asia/Taipei
      vi.setSystemTime(new Date("2026-10-15T04:00:00.000Z"));

      const { db, recordedQueries } =
        createCanonicalLedgerDatabaseDouble(ledgerFixtureRows);
      const repo = new PlatformEarningsRepository(db);
      const service = new PlatformEarningsService(repo);
      const controller = new PlatformEarningsController(service);
      const identity = makeDriverIdentity(OWN_DRIVER_UUID);

      // 1. today -> 2026-10-15..2026-10-15
      const todayResponse = await controller.getByPlatform(
        identity,
        undefined,
        "req-today",
        "today",
      );
      expect(recordedQueries[0]?.sql).toContain("WHERE driver_id = $1");
      expect(recordedQueries[0]?.sql).toContain("period_date >= $2::date");
      expect(recordedQueries[0]?.sql).toContain("period_date <= $3::date");
      expect(recordedQueries[0]?.params).toEqual([
        OWN_DRIVER_UUID,
        "2026-10-15",
        "2026-10-15",
      ]);
      expect(todayResponse.data.items).toEqual([
        {
          platformCode: PLATFORM_CODE_UBER,
          grossEarning: { currency: "TWD", amountMinor: 50000 },
          serviceFee: { currency: "TWD", amountMinor: 5000 },
          subsidy: { currency: "TWD", amountMinor: 2000 },
          netAmount: { currency: "TWD", amountMinor: 47000 },
        },
      ]);

      // 2. week -> Monday 2026-10-12 .. Sunday 2026-10-18
      const weekResponse = await controller.getByPlatform(
        identity,
        undefined,
        "req-week",
        "week",
      );
      expect(recordedQueries[1]?.params).toEqual([
        OWN_DRIVER_UUID,
        "2026-10-12",
        "2026-10-18",
      ]);
      expect(weekResponse.data.items.map((item) => item.platformCode)).toEqual([
        PLATFORM_CODE_GRAB,
        PLATFORM_CODE_UBER,
      ]);

      const weekSummary = await controller.getSummary(
        identity,
        undefined,
        "req-week-summary",
        "week",
      );
      expect(weekSummary.data.totalGross).toEqual({
        currency: "TWD",
        amountMinor: 130000,
      });
      expect(weekSummary.data.totalNet).toEqual({
        currency: "TWD",
        amountMinor: 115000,
      });

      // 3. month -> 2026-10-01 .. 2026-10-31 (excludes 2026-09-25 row)
      const monthResponse = await controller.getByPlatform(
        identity,
        undefined,
        "req-month",
        "month",
      );
      expect(recordedQueries[3]?.params).toEqual([
        OWN_DRIVER_UUID,
        "2026-10-01",
        "2026-10-31",
      ]);
      expect(monthResponse.data.items.map((item) => item.platformCode)).toEqual(
        [PLATFORM_CODE_GRAB, PLATFORM_CODE_LINE_TAXI, PLATFORM_CODE_UBER],
      );

      const monthSummary = await controller.getSummary(
        identity,
        undefined,
        "req-month-summary",
        "month",
      );
      expect(monthSummary.data.totalNet).toEqual({
        currency: "TWD",
        amountMinor: 252500,
      });

      // 4. Absent period caller -> un-windowed WHERE driver_id = $1 (includes 2026-09-25)
      const allTimeResponse = await controller.getByPlatform(
        identity,
        undefined,
        "req-all-time",
        undefined,
      );
      expect(recordedQueries[5]?.sql).not.toContain("period_date >=");
      expect(recordedQueries[5]?.params).toEqual([OWN_DRIVER_UUID]);
      expect(allTimeResponse.data.items).toHaveLength(4);
    });

    it("applies Asia/Taipei calendar conventions across UTC midnight, week/month rollover, and year rollover, and rejects invalid period values", async () => {
      const resolveRange = (
        PlatformEarningsRepositoryModule as Record<string, unknown>
      ).resolvePlatformEarningsPeriodRange as
        | ((
            period?: string | null,
            referenceDate?: Date,
          ) => {
            period: string;
            startDate: string;
            endDate: string;
            timeZone: string;
          } | null)
        | undefined;

      expect(typeof resolveRange).toBe("function");

      // 2026-09-30T16:30:00Z is 2026-10-01 00:30 in Asia/Taipei (Thursday)
      const taipeiOctFirst = new Date("2026-09-30T16:30:00.000Z");
      expect(resolveRange!("today", taipeiOctFirst)).toEqual({
        period: "today",
        startDate: "2026-10-01",
        endDate: "2026-10-01",
        timeZone: "Asia/Taipei",
      });
      // Week containing Thursday 2026-10-01 spans Monday 2026-09-28 .. Sunday 2026-10-04 (month rollover)
      expect(resolveRange!("week", taipeiOctFirst)).toEqual({
        period: "week",
        startDate: "2026-09-28",
        endDate: "2026-10-04",
        timeZone: "Asia/Taipei",
      });
      expect(resolveRange!("month", taipeiOctFirst)).toEqual({
        period: "month",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        timeZone: "Asia/Taipei",
      });

      // 2026-12-31T18:00:00Z is 2027-01-01 02:00 in Asia/Taipei (Friday — year rollover)
      const taipeiNewYear = new Date("2026-12-31T18:00:00.000Z");
      expect(resolveRange!("today", taipeiNewYear)).toEqual({
        period: "today",
        startDate: "2027-01-01",
        endDate: "2027-01-01",
        timeZone: "Asia/Taipei",
      });
      expect(resolveRange!("week", taipeiNewYear)).toEqual({
        period: "week",
        startDate: "2026-12-28",
        endDate: "2027-01-03",
        timeZone: "Asia/Taipei",
      });
      expect(resolveRange!("month", taipeiNewYear)).toEqual({
        period: "month",
        startDate: "2027-01-01",
        endDate: "2027-01-31",
        timeZone: "Asia/Taipei",
      });

      // Invalid period values are rejected with 400 INVALID_EARNINGS_PERIOD
      const { db } = createCanonicalLedgerDatabaseDouble(ledgerFixtureRows);
      const controller = new PlatformEarningsController(
        new PlatformEarningsService(new PlatformEarningsRepository(db)),
      );
      for (const invalidPeriod of ["year", "yesterday", "", "   "]) {
        await expect(
          controller.getByPlatform(
            makeDriverIdentity(OWN_DRIVER_UUID),
            undefined,
            undefined,
            invalidPeriod,
          ),
        ).rejects.toMatchObject({
          code: "INVALID_EARNINGS_PERIOD",
          status: 400,
        });
      }
    });

    it("switches periods end-to-end through the mounted driver-app EarningsScreen and ApiClient against PlatformEarningsController", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-15T04:00:00.000Z"));

      const { db } = createCanonicalLedgerDatabaseDouble(ledgerFixtureRows);
      const earningsController = new PlatformEarningsController(
        new PlatformEarningsService(new PlatformEarningsRepository(db)),
      );
      const { EarningsScreen, requestedUrls } =
        createMountedDriverEarningsAppHarness({
          identity: makeDriverIdentity(OWN_DRIVER_UUID),
          earningsController,
        });

      let renderer!: TestRendererInstance;
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(EarningsScreen));
      });
      await flushMicrotasks();

      // EarningsScreen mounts on initial selectedPeriod = "today" ("今日")
      expect(requestedUrls).toContain(
        "http://driver-earnings.local/api/platform-earnings/by-platform?period=today",
      );
      const todayText = collectRenderedText(renderer);
      // Today net total: 47000 minor = 470; LINE Taxi (2026-10-03) and Grab (2026-10-13) excluded
      expect(todayText).toContain("470");
      expect(todayText).not.toContain("LINE Taxi");

      // Switch period selector to "week" ("本週")
      const weekPill = renderer.root.find(
        (node) =>
          typeof node.props?.onPress === "function" &&
          node
            .findAll((child) => String(child.type) === "Text")
            .some((textNode) => textNode.children.includes("本週")),
      );
      await act(async () => {
        (weekPill.props.onPress as () => void)();
      });
      await flushMicrotasks();

      expect(requestedUrls).toContain(
        "http://driver-earnings.local/api/platform-earnings/by-platform?period=week",
      );
      const weekText = collectRenderedText(renderer);
      // Week net total: 47000 + 68000 = 115000 minor = 1,150
      expect(weekText).toContain("1,150");
      expect(weekText).not.toContain("LINE Taxi");

      // Switch period selector to "month" ("本月")
      const monthPill = renderer.root.find(
        (node) =>
          typeof node.props?.onPress === "function" &&
          node
            .findAll((child) => String(child.type) === "Text")
            .some((textNode) => textNode.children.includes("本月")),
      );
      await act(async () => {
        (monthPill.props.onPress as () => void)();
      });
      await flushMicrotasks();

      expect(requestedUrls).toContain(
        "http://driver-earnings.local/api/platform-earnings/by-platform?period=month",
      );
      const monthText = collectRenderedText(renderer);
      // October net total: 47000 + 68000 + 137500 = 252500 minor = 2,525
      expect(monthText).toContain("2,525");
      expect(monthText).toContain("LINE Taxi");
    });
  });

  describe("c057_canonical_rejection_is_not_zero_or_demo_success (C057-F2)", () => {
    it("propagates canonical repository SQL rejections instead of returning [] or falling back to demo data, while preserving genuine empty and E2E-006 demo fallback", async () => {
      const rejectingDb = {
        isEnabled: () => true,
        query: vi.fn(async () => {
          throw new Error("ops.phase1_platform_earnings_ledger read timeout");
        }),
      } as unknown as DatabaseService;

      const rejectingRepo = new PlatformEarningsRepository(rejectingDb);
      const rejectingService = new PlatformEarningsService(rejectingRepo);
      const rejectingController = new PlatformEarningsController(
        rejectingService,
      );

      // 1. Repository SQL rejection does NOT return []
      await expect(
        rejectingRepo.aggregateByDriver(OWN_DRIVER_UUID, "month"),
      ).rejects.toMatchObject({
        code: "PLATFORM_EARNINGS_READ_UNAVAILABLE",
        status: 503,
      });

      // 2. Controller/service do NOT mask rejection as 0-row or seeded demo success (even for drv-demo-001)
      await expect(
        rejectingController.getByPlatform(
          makeDriverIdentity(OWN_DRIVER_UUID),
          undefined,
          undefined,
          "month",
        ),
      ).rejects.toMatchObject({
        code: "PLATFORM_EARNINGS_READ_UNAVAILABLE",
        status: 503,
      });

      await expect(
        rejectingController.getByPlatform(
          makeDriverIdentity("drv-demo-001"),
          undefined,
          undefined,
          "month",
        ),
      ).rejects.toMatchObject({
        code: "PLATFORM_EARNINGS_READ_UNAVAILABLE",
        status: 503,
      });

      // 3. Genuine zero-row empty canonical read for non-demo driver returns [] and 0 summary
      const { db: emptyDb } = createCanonicalLedgerDatabaseDouble([]);
      const emptyController = new PlatformEarningsController(
        new PlatformEarningsService(new PlatformEarningsRepository(emptyDb)),
      );

      const genuineEmpty = await emptyController.getByPlatform(
        makeDriverIdentity(OWN_DRIVER_UUID),
        undefined,
        undefined,
        "today",
      );
      expect(genuineEmpty.data.items).toEqual([]);

      // 4. Successful zero-row lookup for E2E-006 demo driver preserves seeded demo fallback
      const demoFallback = await emptyController.getByPlatform(
        makeDriverIdentity("drv-demo-001"),
        undefined,
        undefined,
        "month",
      );
      expect(demoFallback.data.items).toHaveLength(3);

      // 5. Explicit no-DB controlled mode preserves seeded demo fallback
      const noDbController = new PlatformEarningsController(
        new PlatformEarningsService(),
      );
      const noDbDemo = await noDbController.getByPlatform(
        makeDriverIdentity("drv-demo-001"),
        undefined,
        undefined,
        "month",
      );
      expect(noDbDemo.data.items).toHaveLength(3);
    });

    it("surfaces canonical read failures to the mounted driver-app EarningsScreen error/retry UI and recovers on retry", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-15T04:00:00.000Z"));

      let shouldReject = true;
      const FlakyDb = {
        isEnabled: () => true,
        query: vi.fn(async () => {
          if (shouldReject) {
            throw new Error("canonical ledger unavailable");
          }
          return {
            rows: [
              {
                platform_code: PLATFORM_CODE_UBER,
                currency_code: "TWD",
                gross_minor: 50000,
                fee_minor: 5000,
                subsidy_minor: 2000,
                net_minor: 47000,
              },
            ],
            rowCount: 1,
          };
        }),
      } as unknown as DatabaseService;

      const earningsController = new PlatformEarningsController(
        new PlatformEarningsService(new PlatformEarningsRepository(FlakyDb)),
      );
      const { EarningsScreen } = createMountedDriverEarningsAppHarness({
        identity: makeDriverIdentity(OWN_DRIVER_UUID),
        earningsController,
      });

      let renderer!: TestRendererInstance;
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(EarningsScreen));
      });
      await flushMicrotasks();

      const errorText = collectRenderedText(renderer);
      expect(errorText).toContain("收益資料同步失敗");
      expect(errorText).toContain(
        "Platform earnings canonical read is currently unavailable.",
      );
      expect(errorText).not.toContain("這段期間還沒有平台收益");

      // Recover DB and press retry ("重新整理")
      shouldReject = false;
      const retryButton = renderer.root.find(
        (node) =>
          typeof node.props?.onPress === "function" &&
          node
            .findAll((child) => String(child.type) === "Text")
            .some((textNode) => textNode.children.includes("重新整理")),
      );
      await act(async () => {
        (retryButton.props.onPress as () => void)();
      });
      await flushMicrotasks();

      const recoveredText = collectRenderedText(renderer);
      expect(recoveredText).not.toContain("收益資料同步失敗");
      expect(recoveredText).toContain("470");
    });
  });

  describe("c057_original_own_driver_money_and_statement_regressions", () => {
    it("preserves own-driver authorization, minor-unit integer arithmetic, and monthly statement list/detail/download flows", async () => {
      const { db } = createCanonicalLedgerDatabaseDouble([
        {
          driver_id: "drv-demo-001",
          platform_code: PLATFORM_CODE_UBER,
          period_date: "2026-10-15",
          currency_code: "TWD",
          gross_minor: 120000,
          fee_minor: 18000,
          subsidy_minor: 5000,
          net_minor: 107000,
        },
      ]);

      const earningsController = new PlatformEarningsController(
        new PlatformEarningsService(new PlatformEarningsRepository(db)),
      );
      const billingService = new BillingSettlementService(
        new AuditNotificationService(),
      );
      await billingService.publishDriverFeePlan({
        planName: "C057 regression fee plan",
        version: "c057-reg-v1",
        serviceFeeBps: 1200,
        reimbursementMode: "platform_funded",
      });
      await billingService.generateDriverStatements({
        periodMonth: "2026-03",
      });
      const billingController = new BillingSettlementController(billingService);

      const demoDriverIdentity = makeDriverIdentity("drv-demo-001");

      // Cross-driver access rejected on PlatformEarningsController and BillingSettlementService
      await expect(
        earningsController.getByPlatform(
          demoDriverIdentity,
          "drv-demo-002",
          undefined,
          "month",
        ),
      ).rejects.toMatchObject({
        code: "DRIVER_IDENTITY_MISMATCH",
        status: 403,
      });

      // Own-driver statement list, detail, and PDF download metadata remain intact
      const statementList = billingController.listDriverOwnStatements(
        demoDriverIdentity,
        undefined,
        "2026-03",
        "req-own-stmt-list",
      );
      expect(statementList.data.items.length).toBeGreaterThan(0);
      const firstStatement = statementList.data.items[0]!;
      expect(firstStatement.driverId).toBe("drv-demo-001");

      expect(() =>
        billingService.getDriverStatement(
          firstStatement.statementId,
          "drv-demo-002",
        ),
      ).toThrowError(
        expect.objectContaining({
          code: "DRIVER_IDENTITY_MISMATCH",
        }),
      );

      const statementDetail = billingController.getDriverOwnStatement(
        firstStatement.statementId,
        demoDriverIdentity,
        "req-own-stmt-detail",
      );
      expect(statementDetail.data.statementId).toBe(firstStatement.statementId);
      expect(
        statementDetail.data.artifactDownloadMetadata?.downloadUrl ??
          statementDetail.data.artifactUrl,
      ).toBeTruthy();
    });
  });
});
