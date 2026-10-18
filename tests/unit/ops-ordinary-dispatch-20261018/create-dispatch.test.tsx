// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { webcrypto } from "node:crypto";
import { OpsDispatchCreateButton } from "../../../apps/ops-console-web/components/ops-dispatch-create-button";
import * as bff from "../../../apps/ops-console-web/app/control-plane-proxy/[...path]/route";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const orderId = "78d456fe-5dbf-4011-865f-5835c98ecb2c";
type Command = {
  path: string;
  body: unknown;
  key: string | null;
  alternate: string | null;
};
let commands: Command[];
let upstream: () => Promise<Response>;

async function readyCreateButton() {
  const button = await screen.findByRole("button", { name: "建立派遣" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  return button;
}

function success(responseOrderId = orderId) {
  return Response.json({
    success: true,
    data: {
      dispatchJobId: "actual-response-job",
      orderId: responseOrderId,
      status: "reserved",
    },
  });
}

beforeEach(() => {
  refresh.mockClear();
  commands = [];
  upstream = async () => success();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("JWT_SECRET", "synthetic-ordinary-dispatch-unit-key");
  vi.stubEnv("JWT_ISSUER", "drts-local");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/control-plane-proxy/")) {
      return bff.POST(
        new NextRequest(`https://ops.example${url}`, {
          method: "POST",
          headers: new Headers(init?.headers),
          ...(init?.body ? { body: init.body } : {}),
        }),
        {
          params: Promise.resolve({
            path: url.slice("/control-plane-proxy/".length).split("/"),
          }),
        },
      );
    }
    const target = new URL(url);
    expect(target.origin).toBe("https://api.example");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    commands.push({
      path: target.pathname,
      body: JSON.parse(new TextDecoder().decode(init!.body as ArrayBuffer)),
      key: headers.get("idempotency-key"),
      alternate: headers.get("x-idempotency-key"),
    });
    return upstream();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  ["zh", "建立派遣"],
  ["en", "Create dispatch"],
] as const)(
  "ordinary %s control dispatches the original order through the real SDK and BFF",
  async (locale, label) => {
    render(<OpsDispatchCreateButton orderId={orderId} locale={locale} />);
    fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      path: `/api/orders/${orderId}/dispatch`,
      body: { mode: "auto" },
    });
    expect(commands[0].key).toBeTruthy();
    expect(commands[0].alternate).toBe(commands[0].key);
    expect(screen.queryByRole("alert")).toBeNull();
  },
);

it("shows the real domain refusal and permits a corrected command without pretending to refresh", async () => {
  upstream = async () =>
    Response.json(
      {
        success: false,
        error: {
          code: "ORDER_NOT_DISPATCHABLE",
          message: "Original order is not dispatchable.",
          traceId: "synthetic-domain-refusal",
          retryable: false,
        },
      },
      { status: 409 },
    );
  render(<OpsDispatchCreateButton orderId={orderId} locale="zh" />);
  fireEvent.click(screen.getByRole("button", { name: "建立派遣" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Original order is not dispatchable.",
  );
  expect(refresh).not.toHaveBeenCalled();
  const originalKey = commands[0]!.key;
  upstream = async () => success();
  fireEvent.click(await readyCreateButton());
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(commands).toHaveLength(2);
  expect(commands[1]!.key).not.toBe(originalKey);
  expect(commands[1]!.path).toBe(commands[0]!.path);
});

it("retries an unknown acknowledgement using the original command and key", async () => {
  upstream = async () => {
    throw new Error("synthetic lost upstream acknowledgement");
  };
  render(<OpsDispatchCreateButton orderId={orderId} locale="zh" />);
  fireEvent.click(screen.getByRole("button", { name: "建立派遣" }));
  await screen.findByRole("alert");
  expect(refresh).not.toHaveBeenCalled();
  upstream = async () => success();
  fireEvent.click(await readyCreateButton());
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
});

it("keeps a pending command disabled until its acknowledgement arrives", async () => {
  let release!: (value: Response) => void;
  upstream = () =>
    new Promise<Response>((resolve) => {
      release = resolve;
    });
  render(<OpsDispatchCreateButton orderId={orderId} locale="zh" />);
  fireEvent.click(screen.getByRole("button", { name: "建立派遣" }));
  await waitFor(() => expect(commands).toHaveLength(1));
  const pendingButton = screen.getByRole("button") as HTMLButtonElement;
  expect(pendingButton.disabled).toBe(true);
  fireEvent.click(pendingButton);
  expect(commands).toHaveLength(1);
  expect(refresh).not.toHaveBeenCalled();
  release(success());
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it("changing the viewed order does not reuse the previous order command", async () => {
  upstream = async () => {
    throw new Error("synthetic lost upstream acknowledgement");
  };
  const view = render(
    <OpsDispatchCreateButton orderId={orderId} locale="zh" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "建立派遣" }));
  await screen.findByRole("alert");
  const nextOrder = "2e359246-c5e2-4612-8cd6-e9b9f65864da";
  view.rerender(<OpsDispatchCreateButton orderId={nextOrder} locale="zh" />);
  upstream = async () => success(nextOrder);
  fireEvent.click(await readyCreateButton());
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(commands).toHaveLength(2);
  expect(commands[1]!.path).toBe(`/api/orders/${nextOrder}/dispatch`);
  expect(commands[1]!.key).not.toBe(commands[0]!.key);
});
