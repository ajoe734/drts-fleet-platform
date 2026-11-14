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

// Use the actual Ops page and SDK. Only the upstream transport is simulated;
// backend device-session behavior remains in the existing companion wholefiles.
function trialInvitationPage() {
  const posts: { path: string; body: unknown; key: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const path = new URL(
        String(input),
        "https://ops.example",
      ).pathname.replace(/^\/control-plane-proxy/, "/api");
      if (path === "/api/ops/review-demo/config")
        return Response.json({ success: true, data: { enabled: true } });
      if (init?.method === "POST") {
        posts.push({
          path,
          body: JSON.parse(String(init.body)),
          key: new Headers(init.headers).get("Idempotency-Key"),
        });
        if (path === "/api/auth/driver/device/invite")
          return Response.json({
            success: true,
            data: { registrationCode: "SIM-unit-single-use-registration" },
          });
        if (
          /^\/api\/regulatory-registry\/drivers\/[^/]+\/work-state$/.test(path)
        )
          return Response.json({ success: true, data: {} });
      }
      throw new Error(`Unexpected fixture request: ${path}`);
    }),
  );
  render(
    <LanguageProvider defaultLocale="zh">
      <OpsReview />
    </LanguageProvider>,
  );
  return posts;
}

it.each(["pax-trial-driver-1", "pax-trial-driver-3"])(
  "real Ops page issues an existing device invitation for %s",
  async (driverId) => {
    const posts = trialInvitationPage();
    const select = await screen.findByLabelText("演練司機");
    const option = await screen.findByRole("option", {
      name: `${driverId}（試乘・合成）`,
    });
    expect((option as HTMLOptionElement).value).toBe(driverId);
    fireEvent.change(select, { target: { value: driverId } });
    expect((select as HTMLSelectElement).value).toBe(driverId);
    fireEvent.click(
      screen.getByRole("button", { name: "發出既有司機裝置註冊碼" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/api/auth/driver/device/invite",
      body: { driverId },
    });
    expect(posts[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("演練裝置註冊碼") as HTMLInputElement).value,
      ).toBe("SIM-unit-single-use-registration"),
    );
  },
);

it("keeps the original review driver default and exposes all three explicitly synthetic trial identities and the real Driver entry", async () => {
  const posts = trialInvitationPage();
  const select = await screen.findByLabelText("演練司機");
  expect((select as HTMLSelectElement).value).toBe("pax-review-driver-a");
  expect(
    screen.getAllByRole("option").map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: option.textContent,
    })),
  ).toEqual([
    { value: "pax-review-driver-a", label: "pax-review-driver-a" },
    { value: "pax-review-driver-b", label: "pax-review-driver-b" },
    { value: "pax-trial-driver-1", label: "pax-trial-driver-1（試乘・合成）" },
    { value: "pax-trial-driver-2", label: "pax-trial-driver-2（試乘・合成）" },
    { value: "pax-trial-driver-3", label: "pax-trial-driver-3（試乘・合成）" },
  ]);
  expect(
    screen
      .getByRole("link", { name: "開啟司機視窗（裝置註冊）" })
      .getAttribute("href"),
  ).toBe("/review-driver/onboarding");
  fireEvent.click(
    screen.getByRole("button", { name: "發出既有司機裝置註冊碼" }),
  );
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({
    path: "/api/auth/driver/device/invite",
    body: { driverId: "pax-review-driver-a" },
  });
});

it("keeps pause and restore limited to the original review pairs after selecting the accessible trial driver", async () => {
  const posts = trialInvitationPage();
  const select = await screen.findByLabelText("演練司機");
  fireEvent.change(select, { target: { value: "pax-trial-driver-3" } });
  expect((select as HTMLSelectElement).value).toBe("pax-trial-driver-3");
  fireEvent.click(screen.getByRole("button", { name: "暫停演練供給" }));
  await screen.findByText("演練供給已離線；新派遣走真正無車流程。");
  fireEvent.click(screen.getByRole("button", { name: "恢復演練供給" }));
  await screen.findByText("演練供給已恢復；請依原流程重新派遣。");
  expect(posts.map(({ path, body }) => ({ path, body }))).toEqual([
    {
      path: "/api/regulatory-registry/drivers/pax-review-driver-a/work-state",
      body: { workState: "offline" },
    },
    {
      path: "/api/regulatory-registry/drivers/pax-review-driver-b/work-state",
      body: { workState: "offline" },
    },
    {
      path: "/api/regulatory-registry/drivers/pax-review-driver-a/work-state",
      body: { workState: "available" },
    },
    {
      path: "/api/regulatory-registry/drivers/pax-review-driver-b/work-state",
      body: { workState: "available" },
    },
  ]);
});
