import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  callbacks: new Map<string, (fixtures: unknown) => Promise<void>>(),
  beforeAllCallbacks: [] as Array<() => void | Promise<void>>,
  flush: (): void | Promise<void> => {},
  workerIndex: 0,
}));
vi.mock("@playwright/test", async () => {
  const { expect } = await import("vitest");
  // Only Playwright registration is mocked; real spec callbacks and journal
  // persistence still execute, including reload and worker attribution.
  const test = Object.assign(
    (title: string, callback: (fixtures: unknown) => Promise<void>) => {
      harness.callbacks.set(title, callback);
    },
    {
      beforeAll: (callback: () => void | Promise<void>) => {
        harness.beforeAllCallbacks.push(callback);
      },
      afterAll: (callback: () => void | Promise<void>) => {
        harness.flush = callback;
      },
      info: () => ({
        workerIndex: harness.workerIndex,
        testId: "retired-surface-test",
        retry: 0,
      }),
    },
  );
  return {
    expect,
    test: Object.assign(test, {
      extend: (options: unknown) => {
        expect(options).toEqual({ trace: "off", screenshot: "off" });
        return test;
      },
    }),
  };
});

let directory: string;
const sha = "620bc67bf394d45281393391d7c7f14bf933794e";
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "operational-evidence-restart-"));
  const manifest = join(directory, "invocation-manifest.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      version: 2,
      candidateSha: sha,
      journeys: [],
      retiredSurfaces: [
        {
          id: "paused-partner-booking",
          baseUrlEnv: "SOCKET_FREE_RETIRED_ORIGIN",
          path: "/",
        },
      ],
    }),
  );
  vi.stubEnv("DRTS_CANDIDATE_SHA", sha);
  vi.stubEnv("DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE", manifest);
  vi.stubEnv("DRTS_OPERATIONAL_EVIDENCE_DIR", directory);
  vi.stubEnv("SOCKET_FREE_RETIRED_ORIGIN", "https://retired.example.invalid");
  // Only the API boundary is controlled, not the spec callback or persistence.
  // No browser or HTTP implementation is started.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No network allowed");
    }),
  );
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function runWorker(index: number, label: string) {
  harness.workerIndex = index;
  harness.callbacks.clear();
  harness.beforeAllCallbacks.length = 0;
  vi.resetModules();
  await import("../../e2e/operational-browser-acceptance.spec");
  // Import registers hooks; this fixture manually runs only retired-surface
  // callbacks and does not claim to exercise the separate issuer lifecycle.
  expect(harness.beforeAllCallbacks).toHaveLength(1);
  const callback = harness.callbacks.get(
    "paused Partner Booking and retired Concierge remain unreachable",
  );
  expect(callback).toBeDefined();
  await callback!({
    request: {
      get: async () => ({
        status: () => 404,
        url: () => `https://retired.example.invalid/${label}`,
      }),
    },
  });
  await harness.flush();
}

it("the actual spec retains previous worker events after failure/reload and afterAll", async () => {
  await runWorker(0, "before-worker-failure");
  await runWorker(1, "after-worker-restart");
  const result = JSON.parse(
    readFileSync(join(directory, "operational-browser-evidence.json"), "utf8"),
  );
  expect(result.candidateSha).toBe(sha);
  expect(result.manifest).toBe("invocation-manifest.json");
  expect(result.evidence.map((entry: { url: string }) => entry.url)).toEqual([
    "https://retired.example.invalid/before-worker-failure",
    "https://retired.example.invalid/after-worker-restart",
  ]);
  expect(fetch).not.toHaveBeenCalled();
});

it("retains actual test/worker/retry attribution rather than treating retries as one pass", async () => {
  await runWorker(0, "first");
  await runWorker(1, "second");
  const result = JSON.parse(
    readFileSync(join(directory, "operational-browser-evidence.json"), "utf8"),
  );
  expect(
    result.evidence.map((entry: { workerIndex: number }) => entry.workerIndex),
  ).toEqual([0, 1]);
  for (const entry of result.evidence) {
    expect(entry.testId).toBe("retired-surface-test");
    expect(entry.retry).toBe(0);
    expect(entry.kind).toBe("retired-surface");
    expect(entry.status).toBe(404);
  }
});
