// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PassThrough } from "node:stream";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { accumulateTripDistanceKm } from "../../../apps/driver-app/lib/trip-metrics";
import * as heartbeat from "../../../apps/driver-app/lib/driver-location-heartbeat";

// Browser Worker/CSP enforcement and native queue persistence are external
// boundaries. Next's header resolver, Expo's worker factory and the actual
// heartbeat producer/subscribers/metrics run unchanged; no browser/PG credit.
const ports = vi.hoisted(() => ({ initialize: vi.fn(), queued: vi.fn() }));
vi.mock("expo-location", () => ({
  hasStartedLocationUpdatesAsync: async () => false,
}));
vi.mock("expo-task-manager", () => ({ isTaskDefined: () => true }));
vi.mock("@/lib/api-client", () => ({
  isDriverIdentityProvisioned: () => true,
  formatDriverError: () => "location port error",
  sanitizeLogMessage: (value: string) => value,
}));
vi.mock("@/lib/driver-location-offline-queue", () => ({
  initializeDriverLocationOfflineQueue: ports.initialize,
  enqueueDriverLocationEvent: ports.queued,
  flushDriverLocationQueue: async () => {},
}));

const root = path.resolve(import.meta.dirname, "../../..");
const driverRequire = createRequire(`${root}/apps/driver-app/package.json`);
const passengerRequire = createRequire(
  `${root}/apps/passenger-app-web/package.json`,
);

function evaluate(source: string, globals: Record<string, unknown>) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    { module, exports: module.exports, process, ...globals },
  );
  return module.exports;
}

async function headersFor(url: string) {
  const configPath = "apps/passenger-app-web/next.config.ts";
  const ref = process.env.PAX_REVIEW_MOUNT_CONFIG_SOURCE_REF;
  const source = ref
    ? execFileSync("git", ["show", `${ref}:${configPath}`], {
        cwd: root,
        encoding: "utf8",
      })
    : readFileSync(`${root}/${configPath}`, "utf8");
  const { default: config } = evaluate(source, {
    require: passengerRequire,
    __dirname: `${root}/apps/passenger-app-web`,
  }) as { default: { headers: () => Promise<unknown> } };
  const { default: loadRoutes } = passengerRequire(
    "next/dist/lib/load-custom-routes",
  );
  const { defaultConfig } = passengerRequire("next/dist/server/config-shared");
  const { getPathMatch } = passengerRequire(
    "next/dist/shared/lib/router/utils/path-match",
  );
  const { getResolveRoutes } = passengerRequire(
    "next/dist/server/lib/router-utils/resolve-routes",
  );
  const runtimeConfig = { ...defaultConfig, ...config };
  const routes = await loadRoutes(runtimeConfig);
  const resolve = getResolveRoutes(
    {
      buildId: "socket-free-header-probe",
      onMatchHeaders: [],
      headers: routes.headers.map((route: { source: string }) => ({
        ...route,
        match: getPathMatch(route.source),
      })),
      redirects: [],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      getMiddlewareMatchers: () => undefined,
      getItem: async () => ({ type: "appFile" }),
    },
    runtimeConfig,
    { dir: root, dev: false, minimalMode: false },
  );
  const request = Object.assign(new PassThrough(), {
    url,
    headers: { host: "pax.example" },
    socket: {},
  });
  return (await resolve({ req: request, res: {}, isUpgradeReq: false }))
    .resHeaders as Record<string, string>;
}

function expoWorker(headers: Record<string, string>) {
  const csp = headers["Content-Security-Policy"]!;
  const directives = new Map(
    csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .map(([key, ...sources]) => [key, sources]),
  );
  const created: string[] = [];
  // Emulate only the browser's worker-src fallback/enforcement. The real
  // Expo factory must request its own blob worker rather than a test URL.
  class BrowserWorker {
    constructor(url: string) {
      const allowed =
        directives.get("worker-src") ??
        directives.get("child-src") ??
        directives.get("script-src") ??
        directives.get("default-src")!;
      if (url.startsWith("blob:") && !allowed.includes("blob:"))
        throw new DOMException(
          "Worker blocked by document CSP",
          "SecurityError",
        );
      created.push(url);
    }
  }
  const factory = evaluate(
    readFileSync(
      path.join(
        path.dirname(driverRequire.resolve("expo/package.json")),
        "src/async-require/asyncRequireModule.ts",
      ),
      "utf8",
    ),
    {
      crossOriginIsolated: true,
      Worker: BrowserWorker,
      Blob,
      URL: {
        createObjectURL: () => "blob:https://pax.example/sqlite-worker",
        revokeObjectURL: () => {},
      },
    },
  ) as { unstable_createWorker: (url: string) => unknown };
  return {
    created,
    start: () =>
      factory.unstable_createWorker(
        "https://pax.example/review-driver/_expo/static/js/web/worker.js",
      ),
  };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

it("the mounted Driver can initialize Expo's real worker and feed real trip distance", async () => {
  const headers = await headersFor("/review-driver/trip");
  expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  expect(headers["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  const worker = expoWorker(headers);
  ports.initialize.mockImplementation(async () => worker.start());
  vi.stubEnv("EXPO_PUBLIC_REVIEW_DEMO", "true");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
  let previous: { latitude: number; longitude: number } | null = null;
  let distance = 0;
  const unsubscribe = heartbeat.subscribeToDriverLocationUpdates((update) => {
    distance = accumulateTripDistanceKm(distance, previous, update);
    previous = update;
  });
  await expect(
    heartbeat.syncDriverLocationHeartbeat({
      taskId: "mounted-trip-task",
      driverId: "pax-review-driver-a",
      status: "on_trip",
    }),
  ).resolves.toMatchObject({ status: "active" });
  expect(worker.created).toEqual(["blob:https://pax.example/sqlite-worker"]);
  await vi.advanceTimersByTimeAsync(24_000);
  expect(distance).toBeGreaterThan(0.2);
  expect(distance).toBeLessThan(0.5);
  expect(
    ports.queued.mock.calls.some(
      ([event]) =>
        event.taskId === "mounted-trip-task" && event.workState === "on_trip",
    ),
  ).toBe(true);
  unsubscribe();
  await heartbeat.stopDriverLocationHeartbeat();
});

it.each(["/", "/rides/order-id", "/review", "/review-driver-other/trip"])(
  "ordinary Passenger route %s retains its existing CSP and rejects blob workers",
  async (url) => {
    const headers = await headersFor(url);
    expect(headers["Content-Security-Policy"]).toBe(
      "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
    );
    expect(() => expoWorker(headers).start()).toThrow("Worker blocked");
    expect(headers["Cross-Origin-Opener-Policy"]).toBeUndefined();
  },
);
