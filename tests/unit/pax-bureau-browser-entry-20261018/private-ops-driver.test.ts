import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({ readFile }));

import { GET as driverPage } from "../../../apps/ops-console-web/app/review-driver/[[...path]]/route";
import {
  GET,
  POST,
} from "../../../apps/ops-console-web/app/api/review-driver-api/[...path]/route";

const upstream = vi.fn();
const transport = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("http://metadata.google.internal/"))
      return new Response("fixture-runtime-identity");
    return upstream(input, init);
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  vi.stubEnv("PAX_PUBLIC_PASSENGER_ONLY", "false");
  vi.stubEnv("DRTS_API_URL", "https://private-api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://private-api.example");
  readFile.mockResolvedValue("<html>same Driver export</html>");
  upstream.mockResolvedValue(
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  vi.stubGlobal("fetch", transport);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the existing private Ops service mounts the original Driver transport", () => {
  it("serves its export only with the original rehearsal enabled", async () => {
    expect((await driverPage()).status).toBe(200);
    expect(readFile.mock.calls[0]![0]).toMatch(
      /public\/review-driver\/index\.html$/,
    );
    readFile.mockClear();
    vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "false");
    expect((await driverPage()).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("preserves the real device Bearer separately from runtime authority", async () => {
    upstream.mockResolvedValue(Response.json({ accepted: true }));
    const result = await POST(
      new NextRequest(
        "https://private-ops.example/api/review-driver-api/api/driver/jobs/job-1/accept",
        {
          method: "POST",
          headers: {
            authorization: "Bearer fixture-driver-device",
            "content-type": "application/json",
            "idempotency-key": "fixture-command",
            "x-serverless-authorization": "Bearer incoming-edge-identity",
            "x-drts-actor-type": "ops_user",
          },
          body: JSON.stringify({ assignmentId: "fixture-assignment" }),
        },
      ),
      {
        params: Promise.resolve({
          path: ["api", "driver", "jobs", "job-1", "accept"],
        }),
      },
    );
    expect(result.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(2);
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://private-api.example/api/driver/jobs/job-1/accept",
    );
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer fixture-driver-device");
    expect(headers.get("x-serverless-authorization")).toBe(
      "Bearer fixture-runtime-identity",
    );
    expect(headers.get("x-drts-google-id-token")).toBe(
      "fixture-runtime-identity",
    );
    expect(headers.get("x-drts-actor-type")).toBeNull();
    expect(headers.get("idempotency-key")).toBe("fixture-command");
    expect(new TextDecoder().decode(init.body)).toBe(
      JSON.stringify({ assignmentId: "fixture-assignment" }),
    );
  });

  it("passes an anonymous Driver request to original API authorization without inventing a role", async () => {
    const result = await GET(
      new NextRequest(
        "https://private-ops.example/api/review-driver-api/api/driver/me",
      ),
      { params: Promise.resolve({ path: ["api", "driver", "me"] }) },
    );
    expect(result.status).toBe(401);
    expect(
      new Headers(upstream.mock.calls[0]![1].headers).get("authorization"),
    ).toBeNull();
    expect(await result.json()).toEqual({ error: "unauthorized" });
  });

  it("does not turn the Driver mount into a generic Ops or Passenger proxy", async () => {
    for (const path of [
      ["api", "ops", "review-demo", "prepare"],
      ["api", "passenger-app", "me"],
    ]) {
      const result = await POST(
        new NextRequest(
          `https://private-ops.example/api/review-driver-api/${path.join("/")}`,
          { method: "POST" },
        ),
        { params: Promise.resolve({ path }) },
      );
      expect(result.status).toBe(404);
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("keeps SQLite isolation and Blob workers scoped to the Driver mount", async () => {
    // Read the actual app config at runtime without pulling Next's app-only
    // global ProcessEnv augmentation into the repository test typecheck.
    const configPath = "../../../apps/ops-console-web/next.config.ts";
    const { default: config } = (await import(configPath)) as {
      default: {
        headers(): Promise<
          { source: string; headers: { key: string; value: string }[] }[]
        >;
      };
    };
    const rules = await config.headers();
    const driverHeaders = rules.find(
      (rule) => rule.source === "/review-driver/:path*",
    )!.headers;
    expect(driverHeaders).toEqual(
      expect.arrayContaining([
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ]),
    );
    expect(
      driverHeaders.find((header) => header.key === "Content-Security-Policy")!
        .value,
    ).toContain("worker-src 'self' blob:");
    expect(
      rules
        .filter((rule) => rule.source !== "/review-driver/:path*")
        .flatMap((rule) => rule.headers),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Cross-Origin-Embedder-Policy" }),
      ]),
    );
  });
});
