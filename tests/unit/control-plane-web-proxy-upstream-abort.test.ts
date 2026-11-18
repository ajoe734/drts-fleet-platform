import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// On 2026-11-18 the dev ops console exited ("TypeError: terminated", then
// "Container called exit(1)") when an upstream connection dropped while the
// wrapper was still streaming its response; the next request got a 503 and
// deploy acceptance failed twice. The wrapper must lose that one response,
// not the process.

const runtime = vi.hoisted(() => ({
  handler: undefined as
    | ((req: IncomingMessage, res: ServerResponse) => Promise<void>)
    | undefined,
  spawn: vi.fn(),
}));
vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    default: {
      ...actual,
      createServer: (handler: typeof runtime.handler) => {
        runtime.handler = handler;
        return { listen: vi.fn() };
      },
    },
  };
});
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: (...args: unknown[]) => runtime.spawn(...args),
}));

const host = "drts-dev-ops-console-web-test.a.run.app";

function browserGet(path: string) {
  const headersIn = { host };
  const req = Object.assign(Readable.from([]), {
    method: "GET",
    url: path,
    headers: headersIn,
    rawHeaders: Object.entries(headersIn).flat(),
    socket: { encrypted: false },
  });
  const chunks: string[] = [];
  const res = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    }),
    { statusCode: 200, headersSent: false, setHeader: vi.fn() },
  );
  const closed = new Promise<void>((resolve) => res.once("close", resolve));
  return { req, res, chunks, closed };
}

beforeEach(async () => {
  vi.stubEnv("DRTS_API_URL", "https://api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("K_SERVICE", "ops-console-cloud-run-test");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  runtime.spawn.mockReset();
  runtime.spawn.mockReturnValue(
    Object.assign(new EventEmitter(), { kill: vi.fn() }),
  );
  const argv = process.argv;
  process.argv = [
    process.execPath,
    "wrapper",
    "apps/ops-console-web/server.js",
    "3101",
  ];
  const signals = vi.spyOn(process, "on").mockImplementation(function () {
    return process;
  });
  try {
    vi.resetModules();
    const wrapperPath = "../../runtime/web/control-plane-web-proxy.mjs";
    await import(wrapperPath);
  } finally {
    signals.mockRestore();
    process.argv = argv;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Cloud Run web wrapper when the upstream drops mid-response", () => {
  it("ends that response and keeps the process alive", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => {
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(new TextEncoder().encode('{"data":{"items":['));
            return;
          }
          // What undici raises when the socket closes before the body ends.
          controller.error(new TypeError("terminated"));
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    process.on("uncaughtException", onUncaught);
    try {
      const { req, res, closed } = browserGet(
        "/control-plane-proxy/dispatch/tasks",
      );
      await runtime.handler!(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
      );
      await closed;
      // Let a would-be unhandled stream error surface before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(uncaught).toEqual([]);
      expect(res.destroyed).toBe(true);
      expect(logged).toHaveBeenCalledWith(
        "[control-plane-proxy] response stream ended early",
        { error: "terminated" },
      );
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });

  it("still streams a complete response", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ data: { items: [] } }));
    const { req, res, chunks, closed } = browserGet(
      "/control-plane-proxy/dispatch/tasks",
    );
    await runtime.handler!(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
    );
    await closed;
    expect(chunks.join("")).toBe('{"data":{"items":[]}}');
  });
});
