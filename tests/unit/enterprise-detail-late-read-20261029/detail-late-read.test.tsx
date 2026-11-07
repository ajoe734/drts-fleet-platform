// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as sdk from "@drts/api-client";
import * as contracts from "@drts/contracts";
import type { BookingRecord } from "@drts/contracts";
import * as uiTokens from "@drts/ui-tokens";
import { resolveRuntimeHealth } from "../../../packages/ui-web/src/environment-badge/environment-resolver";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve("apps/enterprise-dispatch-web");

function deferredResponse() {
  let fulfill!: (response: Response) => void;
  const promise = new Promise<Response>((resolvePromise) => {
    fulfill = resolvePromise;
  });
  return { promise, fulfill };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function harness() {
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/api-client": sdk,
    "@drts/contracts": contracts,
    "@drts/ui-tokens": uiTokens,
    "@drts/ui-web": { resolveRuntimeHealth },
    "next/link": {
      __esModule: true,
      default: ({
        href,
        children,
        ...rest
      }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
        React.createElement("a", { href, ...rest }, children),
    },
    "next/navigation": {
      usePathname: () => "/bookings/booking-B",
      useRouter: () => ({ push() {}, refresh() {} }),
    },
  });
  const { EnterpriseBookingDetail: Detail } = load<{
    EnterpriseBookingDetail: React.ComponentType<{
      bookingId: string;
      tenantId: string;
    }>;
  }>(resolve(appRoot, "components/enterprise-booking-lifecycle.tsx"));
  const { enterpriseDispatchBookingRecord } = load<{
    enterpriseDispatchBookingRecord: BookingRecord;
  }>(resolve(appRoot, "tests/fixtures/dispatch-booking-fixture.ts"));
  const record = (suffix: "A" | "B"): BookingRecord => ({
    ...enterpriseDispatchBookingRecord,
    bookingId: `booking-${suffix}`,
    orderId: `order-${suffix}`,
    tenantId: "tenant-late-read",
    modifiableUntil: "2099-10-30T00:00:00.000Z",
    cancelableUntil: "2099-10-30T00:00:00.000Z",
  });
  return { Detail, a: record("A"), b: record("B") };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Enterprise same-booking detail ignores superseded GET settlement", () => {
  it("keeps B detail/edit and cancels B after A's older successful read arrives", async () => {
    const { Detail, a, b } = harness();
    const late = deferredResponse();
    const paths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "https://enterprise.invalid");
        paths.push(`${init?.method ?? "GET"} ${url.pathname}`);
        if (url.pathname.endsWith("/booking-A")) return late.promise;
        if (url.pathname.endsWith("/booking-B/cancel")) {
          return Promise.resolve(json({ data: { ...b, status: "cancelled" } }));
        }
        return Promise.resolve(json({ data: b }));
      }),
    );
    const view = render(<Detail bookingId="booking-A" tenantId={b.tenantId} />);
    view.rerender(<Detail bookingId="booking-B" tenantId={b.tenantId} />);
    await screen.findByText("booking-B");
    await act(async () => {
      late.fulfill(json({ data: a }));
      await late.promise;
    });
    expect(screen.getByTestId("enterprise-booking-detail-id").textContent).toBe(
      "booking-B",
    );
    const edit = screen.getByRole("link", { name: "修改" });
    expect(
      new URL(
        edit.getAttribute("href")!,
        "https://enterprise.invalid",
      ).searchParams.get("bookingId"),
    ).toBe("booking-B");
    fireEvent.click(screen.getByTestId("enterprise-booking-cancel"));
    await screen.findByText("已取消");
    expect(paths).toEqual([
      "GET /control-plane-proxy/api/tenant/bookings/booking-A",
      "GET /control-plane-proxy/api/tenant/bookings/booking-B",
      "POST /control-plane-proxy/api/tenant/bookings/booking-B/cancel",
    ]);
  });

  it("keeps B visible when A's older read settles as not found", async () => {
    const { Detail, b } = harness();
    const late = deferredResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).endsWith("/booking-A")
          ? late.promise
          : Promise.resolve(json({ data: b })),
      ),
    );
    const view = render(<Detail bookingId="booking-A" tenantId={b.tenantId} />);
    view.rerender(<Detail bookingId="booking-B" tenantId={b.tenantId} />);
    await screen.findByText("booking-B");
    await act(async () => {
      late.fulfill(
        json({ error: { code: "not_found", message: "A not found" } }, 404),
      );
      await late.promise;
    });
    expect(screen.getByTestId("enterprise-booking-detail-id").textContent).toBe(
      "booking-B",
    );
    expect(screen.queryByTestId("enterprise-booking-not-found")).toBeNull();
  });

  it("continues to show a current booking's real not-found response", async () => {
    const { Detail, b } = harness();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ error: { code: "not_found", message: "B not found" } }, 404),
      ),
    );
    render(<Detail bookingId="booking-B" tenantId={b.tenantId} />);
    await screen.findByTestId("enterprise-booking-not-found");
    expect(screen.queryByTestId("enterprise-booking-detail-id")).toBeNull();
  });
});
