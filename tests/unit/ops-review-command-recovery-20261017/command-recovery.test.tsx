/** @vitest-environment jsdom */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import OpsReview from "../../../apps/ops-console-web/app/review/page";
import { LanguageProvider } from "../../../apps/ops-console-web/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it.each([
  {
    name: "vehicle disclosure refused",
    status: 409,
    code: "P5_VEHICLE_DISCLOSURE_INCOMPLETE",
    retryable: false,
    structured: true,
    refused: true,
  },
  {
    name: "eligibility changed",
    status: 409,
    code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
    retryable: false,
    structured: true,
    refused: true,
  },
  {
    name: "original command in progress",
    status: 409,
    code: "IDEMPOTENCY_IN_PROGRESS",
    retryable: true,
    structured: true,
    refused: false,
  },
  {
    name: "opaque proxy failure",
    status: 502,
    code: "HTTP_ERROR",
    retryable: false,
    structured: false,
    refused: false,
  },
  {
    name: "server error",
    status: 503,
    code: "synthetic-server-error",
    retryable: false,
    structured: true,
    refused: false,
  },
  {
    name: "unstructured conflict",
    status: 409,
    code: "HTTP_ERROR",
    retryable: false,
    structured: false,
    refused: false,
  },
])("actual Ops DOM/SDK recovers from $name", async (scenario) => {
  const orderId = "533a6ed1-f265-4431-9bfd-26e75f91dc77";
  const dispatchJobId = "789393cb-ae33-4e9e-8f9f-5877fd43a039";
  const driverId = "pax-review-driver-a";
  const commands: { path: string; key: string | null }[] = [];
  let assignments = 0;
  const success = (data: unknown) => Response.json({ success: true, data });
  // Actual component and production SDK; only upstream HTTP responses are
  // supplied here. Hosted original UI/PG execution remains separate.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const path = new URL(
        String(input),
        "https://ops.example",
      ).pathname.replace(/^\/control-plane-proxy/, "/api");
      if (init?.method === "POST")
        commands.push({
          path,
          key: new Headers(init.headers).get("Idempotency-Key"),
        });
      switch (path) {
        case "/api/ops/review-demo/config":
          return success({ enabled: true });
        case `/api/orders/${orderId}`:
          return success({
            orderId,
            status: "ready_for_dispatch",
            pickup: { address: "Synthetic pickup" },
            dropoff: { address: "Synthetic dropoff" },
          });
        case "/api/dispatch/tasks":
          return success({
            items: [
              {
                dispatchJobId,
                orderId,
                status: "reserved",
                createdAt: "2026-10-17T16:00:00Z",
              },
            ],
          });
        case `/api/dispatch/tasks/${dispatchJobId}/candidates`:
          return success({
            items: [{ driverId, vehicleId: "pax-review-vehicle-a" }],
          });
        case "/api/ops/review-demo/prepare":
          return success({ prepared: true });
        case "/api/dispatch/assign":
          if (++assignments > 1)
            return success({
              assignmentId: "synthetic-acknowledged-assignment",
            });
          return scenario.structured
            ? Response.json(
                {
                  error: {
                    code: scenario.code,
                    message: "synthetic-upstream-refusal",
                    retryable: scenario.retryable,
                    trace_id: "synthetic-request-trace",
                  },
                },
                { status: scenario.status },
              )
            : new Response("synthetic-upstream-refusal", {
                status: scenario.status,
              });
        default:
          throw new Error(`Unexpected synthetic request: ${path}`);
      }
    }),
  );
  render(
    <LanguageProvider defaultLocale="zh">
      <OpsReview />
    </LanguageProvider>,
  );
  fireEvent.change(await screen.findByLabelText("訂單 UUID"), {
    target: { value: orderId },
  });
  fireEvent.click(screen.getByRole("button", { name: "讀回同單" }));
  const assign = await screen.findByRole("button", {
    name: `指派 ${driverId}`,
    exact: true,
  });
  fireEvent.click(assign);
  await screen.findByText(/synthetic-upstream-refusal/);
  const prepare = screen.getByRole("button", {
    name: "準備虛構演練車司",
    exact: true,
  });
  fireEvent.click(prepare);
  if (scenario.refused) {
    await waitFor(() =>
      expect(commands.filter((c) => c.path.endsWith("/prepare"))).toHaveLength(
        1,
      ),
    );
    await screen.findByText("已準備兩組合成車司；未建立訂單、派遣或付款。");
  } else {
    await screen.findByText("上一個命令結果尚待讀回，請先重試原命令。");
    expect(commands.filter((c) => c.path.endsWith("/prepare"))).toHaveLength(0);
  }
  fireEvent.click(assign);
  await waitFor(() => expect(assignments).toBe(2));
  await waitFor(() =>
    expect((prepare as HTMLButtonElement).disabled).toBe(false),
  );
  const keys = commands
    .filter((c) => c.path.endsWith("/assign"))
    .map((c) => c.key);
  expect(keys).toHaveLength(2);
  if (scenario.refused) expect(keys[1]).not.toBe(keys[0]);
  else {
    expect(keys[1]).toBe(keys[0]);
    fireEvent.click(prepare);
    await screen.findByText("已準備兩組合成車司；未建立訂單、派遣或付款。");
  }
  expect(screen.getByTestId("ops-review-order-id").textContent).toBe(orderId);
  expect(screen.getByTestId("ops-review-job-id").textContent).toBe(
    dispatchJobId,
  );
});
