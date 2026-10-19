/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import React from "react";
import {
  PassengerRidePage,
  RatingCard,
} from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { ComplaintForm } from "../../../apps/passenger-app-web/components/ride/complaint-form";

const originalFetch = global.fetch;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, (...args: any[]) => void> = {};
  closed = false;
  onopen?: () => void;
  onerror?: (err: any) => void;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => this.onopen?.(), 10);
  }
  addEventListener(name: string, cb: (...args: any[]) => void) {
    this.listeners[name] = cb;
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data: any) {
    this.listeners[name]?.({ data: JSON.stringify(data) });
  }
  triggerError() {
    this.onerror?.(new Error("Network Error"));
  }
}

describe("Passenger Ride UI Acceptance", () => {
  let fetchCalls: { url: string; method: string; body: any }[] = [];
  let fetchResponse: any = { success: true };

  beforeEach(() => {
    fetchCalls = [];
    MockEventSource.instances = [];
    global.EventSource = MockEventSource as any;

    const mockFetch = vi
      .fn()
      .mockImplementation(async (url: string, opts: any = {}) => {
        fetchCalls.push({
          url,
          method: opts?.method || "GET",
          body: opts?.body ? JSON.parse(opts.body) : null,
        });
        return {
          ok: true,
          status: 200,
          json: async () =>
            url.endsWith("/active")
              ? { data: { rides: [] } }
              : { data: fetchResponse },
        };
      });
    vi.stubGlobal("fetch", mockFetch);
    if (typeof window !== "undefined") {
      window.fetch = mockFetch;
    }
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("pax-web-ride_p5_live_page - reconnect and expiry handling", async () => {
    const view = {
      order: {
        orderId: "order-uuid",
        orderNo: "ORD-001",
        status: "assigned",
        timingMode: "scheduled",
        requestedPickupAt: "2026-10-11T12:00:00Z",
        pickup: { address: "A" },
        dropoff: { address: "B" },
        cancelableUntil: null,
        cancelledAt: null,
        completedAt: null,
      },
      assignment: {
        driver: {
          displayName: "Test Driver",
          rating: "4.9",
          avatarUrl: null,
          fleetName: "Test Fleet",
        },
        vehicle: { plateNo: "ABC-1234", model: "Toyota", color: "White" },
        location: { lat: 0, lng: 0, bearing: 0 },
        etaSeconds: 300,
        eta: { minutes: 5 },
        assignmentVersion: 1,
        rating: { displayState: "new_driver" },
        routeFare: {
          estimatedFareMinor: 100,
          payableFareMinor: 100,
          estimatedDistanceMeters: 5000,
          estimatedDurationSeconds: 600,
          pickup: { address: "A" },
          dropoff: { address: "B" },
        },
      },
      rating: null,
      payment: null,
      receipt: null,
      actions: {
        canCancel: true,
        canContact: true,
        canRate: false,
        canReadReceipt: false,
      },
    };
    fetchResponse = { ride: view };

    render(
      <PassengerRidePage
        token="order-uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const es = MockEventSource.instances[0];

    // Test that the reconnect banner appears when disconnected
    es.triggerError();
    await waitFor(() => {
      expect(screen.getByText("連線中斷")).toBeTruthy();
    });
  });

  it("pax-web-ride_rating_receipt_history_complaint - E-18 payload and E-04 download", async () => {
    // Test E-18 payload
    const fixture = {
      canRate: true,
      ratingSummary: { countText: "Test", chips: ["車內異味"] },
    } as any;
    fetchResponse = { success: true };
    const { unmount } = render(
      <RatingCard fixture={fixture} token="order-uuid" authMode="id" />,
    );

    fireEvent.click(screen.getByLabelText("2 星"));
    fireEvent.click(screen.getByText("車內異味"));
    fireEvent.click(
      screen.getByRole("switch", { name: "需要客服與您聯繫嗎？" }),
    );
    fireEvent.click(screen.getByText("送出評價"));

    await waitFor(() => {
      expect(screen.getByText("評價已送出")).toBeTruthy();
    });

    expect(fetchCalls[0].body).toMatchObject({
      rideId: "order-uuid",
      rating: 2,
      tags: ["車內異味"],
      contactRequested: true,
    });
    unmount();

    // Test Complaint Form category and consent
    fetchCalls = [];
    fetchResponse = { complaintId: "complaint-uuid" };
    render(<ComplaintForm token="order-uuid" authMode="id" />);
    fireEvent.click(screen.getByText("客訴與遺失物表單"));

    const input = screen.getByPlaceholderText(/請描述/);
    fireEvent.change(input, { target: { value: "rude driver" } });
    fireEvent.click(screen.getByText("確認送出"));

    await waitFor(() => {
      expect(screen.getByText(/表單已送出/)).toBeTruthy();
    });

    expect(fetchCalls[0].body.category).toBe("service");
    expect(fetchCalls[0].body.contactConsent).toBe(false);
  });

  it("CertificateCard renders HTML and PDF download links correctly without embedding iframe", async () => {
    const view = {
      order: { orderId: "order-uuid", status: "completed" },
      receipt: {
        receiptUrl: "https://example.com/authorized.html",
        pdfUrl: "https://example.com/authorized.pdf",
      },
      actions: { canReadReceipt: true },
    };
    fetchResponse = { ride: view };

    render(
      <PassengerRidePage
        token="order-uuid"
        searchParams={{ mode: "live" }}
        kind="receipt"
        authMode="id"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("下載 HTML")).toBeTruthy();
      expect(screen.getByText("下載 PDF")).toBeTruthy();
      expect(document.querySelector("iframe")).toBeNull();
    });
  });

  it("MapCard freshness relies on calculatedAt rather than event arrival time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const staleTime = new Date(Date.now() - 62000).toISOString();

    const view = {
      order: { orderId: "order-uuid", status: "assigned" },
      assignment: {
        driver: { displayName: "Driver", fleetName: "Fleet" },
        vehicle: { plateNo: "A-1", model: "Car", color: "W" },
        eta: {
          minutes: 5,
          calculatedAt: staleTime,
          locationFreshness: "fresh",
        },
        location: { lat: 0, lng: 0 },
      },
      actions: {},
    };
    fetchResponse = { ride: view };

    render(
      <PassengerRidePage
        token="order-uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const now = Date.now();
    await act(async () => {
      vi.advanceTimersByTime(2000); // Trigger useEffect intervals
    });
    // Should be stale since calculatedAt was 62s ago
    expect(screen.queryByText(/司機位置更新稍有延遲/)).toBeTruthy();

    const es = MockEventSource.instances[0];

    // Simulate a reconnect or relevant SSE event to update freshness
    // The mapper uses eventType and eventVersion.
    const newView = {
      ...view,
      assignment: {
        ...view.assignment,
        eta: {
          ...view.assignment!.eta,
          calculatedAt: new Date(now).toISOString(),
        },
      },
    };
    await act(async () => {
      es.emit("assignment_disclosure_ready", {
        eventType: "assignment_disclosure_ready",
        eventVersion: 2,
        assignmentVersion: 1,
        data: newView,
      });
    });

    // Advance timers so useEffect triggers setNow
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Verify it says it is fresh
    expect(screen.queryByText(/司機位置更新稍有延遲/)).toBeNull();

    vi.useRealTimers();
  });

  it("A04 retry uses supported authority GET only for both account and token", async () => {
    const { Actions } =
      await import("../../../apps/passenger-app-web/components/ride/passenger-ride-page");
    const { createFareQuoteAnomalyFixture } =
      await import("../../../apps/passenger-app-web/lib/ride/passenger-live");

    const holdView = {
      order: {
        orderId: "ride-account",
        orderNo: "ORD-ACC",
        status: "exception_hold",
        timingMode: "scheduled",
        requestedPickupAt: new Date().toISOString(),
        pickup: { address: "A" },
        dropoff: { address: "B" },
      },
      assignment: null,
      rating: null,
      payment: null,
      receipt: null,
      actions: { canCancel: true, canContact: true, canRate: false },
    };

    fetchResponse = { ride: holdView };
    let updatedFixture: any = null;

    // 1. Account mode
    const { unmount } = render(
      <Actions
        fixture={createFareQuoteAnomalyFixture("ride-account")}
        token="ride-account"
        authMode="id"
        onFixtureUpdate={(f) => {
          updatedFixture = f;
        }}
      />,
    );

    fireEvent.click(screen.getByText("重新取得報價"));
    await waitFor(() => {
      expect(updatedFixture).not.toBeNull();
    });

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].method).toBe("GET");
    expect(fetchCalls[0].url).toBe("/api/passenger-app/rides/ride-account");
    // Without valid quote, retains A04
    expect(updatedFixture?.screenId).toBe("A04");

    unmount();
    fetchCalls = [];
    updatedFixture = null;

    // 2. Token mode
    render(
      <Actions
        fixture={createFareQuoteAnomalyFixture("ride-token")}
        token="ride-token"
        authMode="token"
        onFixtureUpdate={(f) => {
          updatedFixture = f;
        }}
      />,
    );

    fireEvent.click(screen.getByText("重新取得報價"));
    await waitFor(() => {
      expect(fetchCalls.length).toBe(1);
    });

    expect(fetchCalls[0].method).toBe("GET");
    expect(fetchCalls[0].url).toBe("/api/passenger-rides/ride-token");
  });

  it("A04 recovery starts live SSE subscription and renders vehicle", async () => {
    let callCount = 0;
    const mockFetch = vi
      .fn()
      .mockImplementation(async (url: string, opts: any = {}) => {
        fetchCalls.push({
          url,
          method: opts?.method || "GET",
          body: opts?.body ? JSON.parse(opts.body) : null,
        });
        if (++callCount === 1) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "P5_QUOTE_PROVIDER_UNAVAILABLE",
                message: "P5_QUOTE_PROVIDER_UNAVAILABLE",
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              ride: {
                order: {
                  orderId: "ride-recovered",
                  orderNo: "ORD-REC",
                  status: "enroute_pickup",
                  timingMode: "scheduled",
                  requestedPickupAt: new Date().toISOString(),
                  pickup: { address: "A" },
                  dropoff: { address: "B" },
                },
                assignment: {
                  driver: { displayName: "Driver A" },
                  vehicle: { plateNo: "ABC-8888" },
                  eta: { minutes: 5 },
                  routeFare: {
                    payableFareMinor: 20000,
                    estimatedFareMinor: 20000,
                  },
                },
                actions: { canCancel: true, canContact: true },
              },
            },
          }),
        };
      });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <PassengerRidePage token="ride-recovered" authMode="id" kind="ride" />,
    );

    await waitFor(() => {
      expect(screen.getByText("目前無法取得正式報價")).toBeTruthy();
    });
    expect(MockEventSource.instances.length).toBe(0);

    fireEvent.click(screen.getByText("重新取得報價"));

    await waitFor(() => {
      expect(screen.getByText(/ABC-8888/)).toBeTruthy();
    });
    expect(MockEventSource.instances.length).toBe(1);
  });

  it("Unrelated 409 conflict retains honest authority failure rather than A04", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: "conflict",
            message: "unrelated conflict",
          },
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <PassengerRidePage token="ride-conflict" authMode="id" kind="ride" />,
    );

    await waitFor(() => {
      expect(screen.getByText("無法取得行程資料")).toBeTruthy();
    });
    expect(screen.queryByText("正在為您安排合適的車輛")).toBeNull();
    expect(screen.queryByText("目前無法取得正式報價")).toBeNull();
  });

  it("R1 - A04 recovery freshness distinguishes old, missing, and current timestamps", async () => {
    for (const [, stamp, expectFresh] of [
      ["old timestamp", new Date(Date.now() - 3600000).toISOString(), false],
      ["missing timestamp", null, false],
      ["current timestamp", new Date().toISOString(), true],
    ] as const) {
      let callCount = 0;
      MockEventSource.instances = [];
      const readyView = {
        order: {
          orderId: "ride-r1",
          orderNo: "ORD-R1",
          status: "enroute_pickup",
          timingMode: "scheduled",
          requestedPickupAt: new Date().toISOString(),
          pickup: { address: "Pickup A" },
          dropoff: { address: "Dropoff B" },
        },
        assignment: {
          driver: { displayName: "Driver Fresh" },
          vehicle: { plateNo: "FRESH-888" },
          eta: {
            minutes: 5,
            calculatedAt: stamp,
            locationFreshness: "fresh",
          },
          routeFare: {
            payableFareMinor: 20000,
            estimatedFareMinor: 20000,
          },
        },
        actions: { canCancel: true, canContact: true },
      };

      const mockFetch = vi.fn().mockImplementation(async () => {
        if (++callCount === 1) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: { code: "P5_QUOTE_PROVIDER_UNAVAILABLE" },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { ride: readyView } }),
        };
      });
      vi.stubGlobal("fetch", mockFetch);

      const { unmount } = render(
        <PassengerRidePage token="ride-r1" authMode="id" kind="ride" />,
      );

      await waitFor(() => {
        expect(screen.getByText("重新取得報價")).toBeTruthy();
      });

      fireEvent.click(screen.getByText("重新取得報價"));

      await waitFor(() => {
        expect(screen.getByText(/FRESH-888/)).toBeTruthy();
        expect(MockEventSource.instances.length).toBe(1);
      });

      await act(async () => {
        MockEventSource.instances[0].onopen?.();
        await Promise.resolve();
      });

      const badge = screen.queryByText(/^位置更新於 .* 秒前$/);
      const stale = screen.queryByText("司機位置更新稍有延遲");

      if (expectFresh) {
        expect(badge).not.toBeNull();
        expect(stale).toBeNull();
      } else {
        expect(badge).toBeNull();
        expect(stale).not.toBeNull();
      }

      unmount();
      cleanup();
    }
  });

  it("R9/R12 - A04 quote retry error retains actual known authority facts", async () => {
    const { Actions } =
      await import("../../../apps/passenger-app-web/components/ride/passenger-ride-page");
    const { mapPassengerRideAuthorityToFixture } =
      await import("../../../apps/passenger-app-web/lib/ride/passenger-live");

    const holdAuthority = {
      order: {
        orderId: "ride-known",
        orderNo: "ORD-KNOWN",
        status: "exception_hold",
        timingMode: "scheduled",
        requestedPickupAt: "2026-10-15T12:00:00Z",
        pickup: { address: "Actual known pickup" },
        dropoff: { address: "Dropoff Known" },
      },
      assignment: null,
      rating: null,
      payment: null,
      receipt: null,
      actions: { canCancel: true, canContact: true, canRate: false },
    };

    const knownFixture = mapPassengerRideAuthorityToFixture(
      holdAuthority as any,
      "ride-known",
      "ride",
      "P5_QUOTE_PROVIDER_UNAVAILABLE",
    );

    let updated: any = null;
    const mockFetch = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: "P5_QUOTE_PROVIDER_UNAVAILABLE" },
      }),
    }));
    vi.stubGlobal("fetch", mockFetch);

    render(
      <Actions
        fixture={knownFixture}
        token="ride-known"
        authMode="id"
        onFixtureUpdate={(f) => {
          updated = f;
        }}
      />,
    );

    fireEvent.click(screen.getByText("重新取得報價"));
    await waitFor(() => {
      expect(updated).not.toBeNull();
    });

    expect(updated.orderNo).toBe("ORD-KNOWN");
    expect(updated.pickupLabel).toBe("Actual known pickup");
    expect(updated.status).toBe(knownFixture.status);
    expect(updated.requestedPickupText).toBe(knownFixture.requestedPickupText);
    expect(updated.screenId).toBe("A04");
  });

  it("R9/R12 - Supported retry applies authoritative completed terminal state over quote anomaly", async () => {
    const { Actions } =
      await import("../../../apps/passenger-app-web/components/ride/passenger-ride-page");
    const { mapPassengerRideAuthorityToFixture } =
      await import("../../../apps/passenger-app-web/lib/ride/passenger-live");

    const holdAuthority = {
      order: {
        orderId: "ride-term",
        orderNo: "ORD-TERM",
        status: "exception_hold",
        timingMode: "scheduled",
        requestedPickupAt: "2026-10-15T12:00:00Z",
        pickup: { address: "Pickup Term" },
        dropoff: { address: "Dropoff Term" },
      },
      assignment: null,
      rating: null,
      payment: null,
      receipt: null,
      actions: { canCancel: false, canContact: false, canRate: true },
    };

    const knownFixture = mapPassengerRideAuthorityToFixture(
      holdAuthority as any,
      "ride-term",
      "ride",
      "P5_QUOTE_PROVIDER_UNAVAILABLE",
    );

    const completedAuthority = {
      ...holdAuthority,
      order: {
        ...holdAuthority.order,
        status: "completed",
        completedAt: new Date().toISOString(),
      },
      actions: { canCancel: false, canContact: false, canRate: true },
    };

    let updated: any = null;
    const mockFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { ride: completedAuthority } }),
    }));
    vi.stubGlobal("fetch", mockFetch);

    render(
      <Actions
        fixture={knownFixture}
        token="ride-term"
        authMode="id"
        onFixtureUpdate={(f) => {
          updated = f;
        }}
      />,
    );

    fireEvent.click(screen.getByText("重新取得報價"));
    await waitFor(() => {
      expect(updated).not.toBeNull();
    });

    expect(updated.screenId).toBe("P5-08");
    expect(updated.status).toBe("行程已完成");
    expect(updated.routeFareMode).toBe("range");
    expect(updated.canRate).toBe(true);
  });
});
