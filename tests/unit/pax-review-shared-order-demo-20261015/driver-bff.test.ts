import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  GET,
  POST,
} from "../../../apps/passenger-app-web/app/api/review-driver-api/[...path]/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("the review driver BFF retains the device Bearer separately from existing Google service auth and preserves an API refusal", async () => {
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  vi.stubEnv("DRTS_API_URL", "https://api-test.a.run.app");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api-test.a.run.app");
  const upstream = vi.fn(async (url: URL | string, init?: RequestInit) => {
    if (String(url).startsWith("http://metadata.google.internal/"))
      return new Response("synthetic-google-service-proof");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(
      "Bearer synthetic-device-session",
    );
    expect(headers.get("x-serverless-authorization")).toBe(
      "Bearer synthetic-google-service-proof",
    );
    expect(headers.get("x-actor-id")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("idempotency-key")).toBe("same-driver-command");
    return Response.json(
      { error: { code: "DRIVER_IDENTITY_MISMATCH" } },
      { status: 403 },
    );
  });
  vi.stubGlobal("fetch", upstream);
  const response = await POST(
    new NextRequest(
      "https://pax.test/api/review-driver-api/api/driver/tasks/task-a/accept",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-device-session",
          "x-actor-id": "injected-other-driver",
          cookie: "pax_session=other-subject",
          "Idempotency-Key": "same-driver-command",
          "Content-Type": "application/json",
          origin: "https://pax.test",
        },
        body: JSON.stringify({ acceptedAt: "2026-10-15T07:00:00Z" }),
      },
    ),
    {
      params: Promise.resolve({
        path: ["api", "driver", "tasks", "task-a", "accept"],
      }),
    },
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { code: "DRIVER_IDENTITY_MISMATCH" },
  });
  expect(upstream).toHaveBeenCalledTimes(2);
});

it("an unselected rehearsal or unrelated path never reaches the upstream", async () => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "false");
  const request = new NextRequest(
    "https://pax.test/api/review-driver-api/api/driver/tasks",
  );
  expect(
    (
      await GET(request, {
        params: Promise.resolve({ path: ["api", "driver", "tasks"] }),
      })
    ).status,
  ).toBe(404);
  vi.stubEnv("PAX_REVIEW_DEMO_ENABLED", "true");
  expect(
    (
      await GET(request, {
        params: Promise.resolve({ path: ["api", "passenger-app", "rides"] }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await GET(request, {
        params: Promise.resolve({ path: ["api", "driver", "..", "orders"] }),
      })
    ).status,
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
