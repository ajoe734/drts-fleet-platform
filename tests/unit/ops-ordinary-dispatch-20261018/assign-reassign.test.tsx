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
import { OpsDispatchAssignmentButton } from "../../../apps/ops-console-web/components/ops-dispatch-assignment-button";
import type { DispatchCandidate } from "@drts/contracts";
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

function success(responseOrderId = orderId) {
  return Response.json({
    success: true,
    data: {
      assignmentId: "actual-response-assignment",
      taskId: "actual-response-task",
      orderId: responseOrderId,
      status: "assigned",
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

const candidates = ["a", "b"].map(
  (id) =>
    ({
      driverId: `driver-${id}`,
      vehicleId: `vehicle-${id}`,
      etaMinutes: 5,
      operatingArea: "new-taipei",
      serviceBuckets: ["standard_taxi"],
    }) as DispatchCandidate,
);
const labels = {
  zh: { assign: "指派所選司機", reassign: "重新指派" },
  en: { assign: "Assign selected driver", reassign: "Reassign" },
};
function mount(
  reassign = false,
  locale: "zh" | "en" = "zh",
  job = "original-job",
) {
  return render(
    <OpsDispatchAssignmentButton
      dispatchJobId={job}
      candidate={candidates[0]!}
      candidates={candidates}
      reassign={reassign}
      locale={locale}
    />,
  );
}
function selectB() {
  fireEvent.change(
    document.querySelector("select[data-drt-dispatch-candidate]")!,
    { target: { value: "driver-b:vehicle-b" } },
  );
}
for (const reassign of [false, true]) {
  const operation = reassign ? "reassign" : "assign";
  it.each(["zh", "en"] as const)(
    `${operation} %s: selected real SDK command and both original headers survive BFF forwarding`,
    async (locale) => {
      mount(reassign, locale);
      selectB();
      if (reassign) {
        fireEvent.change(
          document.querySelector("select[data-drt-dispatch-reason]")!,
          { target: { value: "vehicle_swap" } },
        );
        fireEvent.change(
          document.querySelector("input[data-drt-dispatch-note]")!,
          { target: { value: "Replacement vehicle" } },
        );
      }
      fireEvent.click(
        screen.getByRole("button", {
          name: labels[locale][operation],
          exact: true,
        }),
      );
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(commands).toHaveLength(1);
      expect(commands[0]).toMatchObject({
        path: `/api/dispatch/${operation}`,
        body: {
          dispatchJobId: "original-job",
          driverId: "driver-b",
          vehicleId: "vehicle-b",
          ...(reassign
            ? { reasonCode: "vehicle_swap", reasonNote: "Replacement vehicle" }
            : {}),
        },
      });
      expect(commands[0]!.key).toBeTruthy();
      expect(commands[0]!.alternate).toBe(commands[0]!.key);
    },
  );
  it(`${operation}: acknowledged refusal leaves the original error and permits a corrected driver command`, async () => {
    upstream = async () =>
      Response.json(
        {
          success: false,
          error: {
            code: "DRIVER_UNAVAILABLE",
            message: "Selected driver unavailable",
            traceId: "original-refusal",
            retryable: false,
          },
        },
        { status: 409 },
      );
    mount(reassign);
    fireEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Selected driver unavailable",
    );
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
    const first = commands[0]!;
    selectB();
    upstream = async () => success();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(commands).toHaveLength(2);
    expect(commands[1]!.key).not.toBe(first.key);
    expect(commands[1]!.body).toMatchObject({
      driverId: "driver-b",
      vehicleId: "vehicle-b",
    });
  });
  it(`${operation}: lost acknowledgement retries the same selected command without creating another assignment`, async () => {
    upstream = async () => {
      throw new Error("synthetic lost acknowledgement");
    };
    mount(reassign);
    selectB();
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(
      (
        document.querySelector(
          "select[data-drt-dispatch-candidate]",
        ) as HTMLSelectElement
      ).disabled,
    ).toBe(true);
    upstream = async () => success();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
  });
}
it("a pending assignment disables selection and repeated submission until its response arrives", async () => {
  let release!: (r: Response) => void;
  upstream = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  mount();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(commands).toHaveLength(1));
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  expect((document.querySelector("select") as HTMLSelectElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(commands).toHaveLength(1);
  release(success());
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});
it("a different dispatch job receives its own target and key after an unknown response", async () => {
  upstream = async () => {
    throw new Error("synthetic lost acknowledgement");
  };
  const view = mount();
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  upstream = async () => success();
  view.rerender(
    <OpsDispatchAssignmentButton
      dispatchJobId="another-job"
      candidate={candidates[0]!}
      candidates={candidates}
      locale="zh"
    />,
  );
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(commands).toHaveLength(2);
  expect(commands[1]!.body).toMatchObject({ dispatchJobId: "another-job" });
  expect(commands[1]!.key).not.toBe(commands[0]!.key);
});
