import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/control-plane-proxy/[...path]/route";

// BUREAU-R13 signed download links. /downloads/:kind/:subjectId is rewritten
// to this proxy; only the API HTTP boundary (global fetch) is mocked.
const ORIGIN = "http://localhost:3012";
const API = "http://localhost:3001";
const SIGNED_QUERY =
  "?signed_at=2026-10-25T01%3A00%3A00.000Z&expires_at=2026-10-25T01%3A15%3A00.000Z" +
  "&key_id=k1&manifest_hash=abc123&sig=a%2Bb%2Fc%3D&sig_v=2";

function pathContext(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function proxyRequest(path: string) {
  return new NextRequest(`${ORIGIN}/control-plane-proxy/${path}`);
}

describe("Agency controlled-download proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DRTS_API_URL = API;
    delete process.env.DRTS_API_AUTH_AUDIENCE;
  });

  it("forwards the signed query unchanged and streams the raw body back", async () => {
    const payload = new TextEncoder().encode(
      "order_no,plate_no\nORD...01,AB...34\n",
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(payload, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="trips.csv"',
          "Set-Cookie": "leak=1",
        },
      }),
    );
    global.fetch = fetchMock;

    const response = await GET(
      proxyRequest(`downloads/trip-export/job-1${SIGNED_QUERY}`),
      pathContext("downloads", "trip-export", "job-1"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${API}/api/downloads/trip-export/job-1${SIGNED_QUERY}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    const forwarded = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(forwarded.get("authorization")).toBeNull();
    expect(forwarded.get("cookie")).toBeNull();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="trips.csv"',
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);
  });

  it("passes upstream error statuses and bodies through as-is", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("signature expired", { status: 403 }),
      );

    const response = await GET(
      proxyRequest(`downloads/trip-export/job-1${SIGNED_QUERY}`),
      pathContext("downloads", "trip-export", "job-1"),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("signature expired");
  });

  it.each([
    ["a non-download path", ["agency", "trip-records"]],
    ["a too-short download path", ["downloads", "trip-export"]],
    ["a too-long download path", ["downloads", "trip-export", "job-1", "x"]],
    ["a parent traversal segment", ["downloads", "..", "job-1"]],
    ["a current-directory segment", ["downloads", "trip-export", "."]],
    ["an empty segment", ["downloads", "", "job-1"]],
    ["a backslash segment", ["downloads", "trip-export", "..\\admin"]],
    ["an embedded slash segment", ["downloads", "trip-export", "a/b"]],
  ])("rejects %s with 404 without calling the API", async (_label, path) => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const response = await GET(
      proxyRequest(path.join("/")),
      pathContext(...path),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "AGENCY_CONSOLE_PROXY_PATH_NOT_ALLOWED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 AGENCY_API_UNAVAILABLE when the API cannot be reached", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const response = await GET(
      proxyRequest(`downloads/trip-export/job-1${SIGNED_QUERY}`),
      pathContext("downloads", "trip-export", "job-1"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "AGENCY_API_UNAVAILABLE",
    });
  });
});
