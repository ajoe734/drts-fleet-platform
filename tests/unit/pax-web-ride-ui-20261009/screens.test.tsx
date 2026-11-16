/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import React from "react";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { ComplaintForm } from "../../../apps/passenger-app-web/components/ride/complaint-form";

const originalFetch = global.fetch;

describe("P5 and A04 Screens validation", () => {
  let fetchCalls: { url: string; method: string; body: any }[] = [];
  let fetchResponse: any = { success: true };

  beforeEach(() => {
    fetchCalls = [];
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
          json: async () => ({ data: fetchResponse }),
        };
      });
    vi.stubGlobal("fetch", mockFetch);
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  const baseView = {
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
        registrationMaskedDisplay: "****1234",
        registrationEffectiveUntil: "2027-01-01T00:00:00Z",
      },
      vehicle: { plateNo: "ABC-1234", model: "Toyota", color: "White" },
      location: { lat: 0, lng: 0, bearing: 0 },
      etaSeconds: 300,
      eta: {
        minutes: 5,
        calculatedAt: "2026-10-11T12:00:00Z",
        locationFreshness: "fresh",
      },
      assignmentVersion: 1,
      rating: { displayState: "rated" },
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

  it("P5-01 Awaiting Assignment", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "created" },
        assignment: null,
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("系統正在安排可派車輛")).toBeTruthy(),
    );
  });

  it("P5-02 Driver En Route", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "enroute_pickup" },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("司機正在前往")).toBeTruthy());
  });

  it("P5-03 Assigned New Driver", async () => {
    const v = {
      ...baseView,
      order: { ...baseView.order, status: "assigned" },
      assignment: {
        ...baseView.assignment,
        rating: { displayState: "new_driver" },
      },
    };
    fetchResponse = { ride: v };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("新進駕駛")).toBeTruthy());
  });

  it("P5-04 Redispatch Required", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "redispatch_required" },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("正在為您改派")).toBeTruthy());
  });

  it("P5-05 Redispatch Complete", async () => {
    const v = {
      ...baseView,
      order: { ...baseView.order, status: "enroute_pickup" },
      assignment: { ...baseView.assignment, assignmentVersion: 2 },
    };
    fetchResponse = { ride: v };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("司機正在前往")).toBeTruthy());
  });

  it("P5-06 Driver Arrived", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "arrived_pickup" },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("司機已抵達")).toBeTruthy());
  });

  it("P5-07 Trip In Progress", async () => {
    fetchResponse = {
      ride: { ...baseView, order: { ...baseView.order, status: "on_trip" } },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("行程進行中")).toBeTruthy());
  });

  it("P5-08 Rate Completed Trip", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "completed" },
        actions: { ...baseView.actions, canReadReceipt: true },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("感謝您的搭乘，請為本次服務評分")).toBeTruthy(),
    );
    // Operations plan E-18: trip summary, then the required service rating.
    expect(screen.getByText("本次行程")).toBeTruthy();
    expect(screen.getByText("服務評分")).toBeTruthy();
    expect(screen.getByText("*必填")).toBeTruthy();
    expect(screen.getByText("請點選星等")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 星" }));
    expect(screen.getByText("4 滿意")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2 星" }));
    expect(screen.getByText("2 不滿意")).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "需要客服與您聯繫嗎？" }),
    ).toBeTruthy();
    // The certificate lives on its own E-04 page, linked from here.
    expect(screen.queryByText("車資合計")).toBeNull();
    expect(
      screen.getByText("查看電子乘車證明").closest("a")?.getAttribute("href"),
    ).toBe("/rides/uuid/receipt");
  });

  it("P5-09 Rating Submitted", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "completed" },
        rating: { score: 5 },
        actions: { ...baseView.actions, canReadReceipt: true },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("感謝您的評價")).toBeTruthy());
    expect(screen.getByText("本次行程")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "送出評分" })).toBeNull();
    expect(
      screen.getByText("查看電子乘車證明").closest("a")?.getAttribute("href"),
    ).toBe("/rides/uuid/receipt");
  });

  it("P5-10 Electronic Ride Certificate", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        receipt: {
          receiptNo: "R001",
          issuedAt: "2026-01-01T00:00:00Z",
          amountMinor: 100,
          record: {
            htmlUrl: "https://x.com/receipt.html",
            pdfUrl: "https://x.com/receipt.pdf",
            distanceMeters: 1000,
            tollMinor: 0,
            consumerServicePhone: "02-2944-0985",
            authorityComplaintPhone: "1999",
            plateNo: "ABC-1234",
            pickupAt: "2026-01-01T00:00:00Z",
            dropoffAt: "2026-01-01T00:10:00Z",
            travelDurationSeconds: 600,
            routeSummary: "A-B",
            certificateVersion: "1",
            certificateState: "available",
            generatedFrom: "owned_mobility_completion",
            e04Snapshot: {
              fleetOperatorName: "智行車隊",
              driverSurname: "蔡",
              driverRegistrationMasked: "••••4280",
              paymentMethodDisplay: "信用卡 ••••1234",
              fareBreakdown: {
                startMinor: 70,
                distanceMinor: 20,
                delayMinor: 10,
                nightMinor: 0,
              },
            },
          },
        },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="receipt"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("電子乘車證明")).toBeTruthy());
    // Operations plan E-04 row order, ending with the masked-data footnote.
    const text = document.body.textContent ?? "";
    let cursor = -1;
    for (const label of [
      "車隊／派遣業者",
      "智行車隊",
      "車牌",
      "ABC-1234",
      "駕駛",
      "蔡○○",
      "執登證號 ••••4280",
      "上車／下車時間",
      "2026/01/01 08:00 / 08:10",
      "起訖地點",
      "行駛里程",
      "1.0 公里",
      "行駛時間",
      "10 分鐘",
      "車資明細",
      "起程",
      "續程",
      "延滯計時",
      "夜間加成",
      "通行費",
      "車資合計",
      "支付方式",
      "信用卡 ••••1234",
      "客服電話",
      "主管機關申訴電話",
      "證明編號 R001 · 個資已遮碼",
    ]) {
      const next = text.indexOf(label, cursor + 1);
      expect(next, label).toBeGreaterThan(cursor);
      cursor = next;
    }
    for (const removed of [
      "乘車證明編號",
      "開立時間",
      "遮罩執登號",
      "付款狀態",
    ])
      expect(text).not.toContain(removed);
    const toggle = screen.getByRole("button", { name: "收合 ▴" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(
      screen
        .getByRole("button", { name: "展開 ▾" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen.getByText("下載 PDF").closest("a")?.getAttribute("href"),
    ).toBe("https://x.com/receipt.pdf");
    expect(screen.queryByText("下載 HTML")).toBeNull();
    expect(screen.getByRole("button", { name: "分享" })).toBeTruthy();
    expect(
      screen.getByText("返回行程").closest("a")?.getAttribute("href"),
    ).toBe("/rides/uuid");
    expect(screen.queryByText("客訴與遺失物表單")).toBeNull();
  });

  it("P5-11 Disclosure Unavailable", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "enroute_pickup" },
        assignment: null,
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("派車資訊尚未完整")).toBeTruthy(),
    );
  });

  it("Cancelled Ride screen", async () => {
    fetchResponse = {
      ride: { ...baseView, order: { ...baseView.order, status: "cancelled" } },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() => expect(screen.getByText("行程已取消")).toBeTruthy());
    expect(document.body.textContent.includes("畫面設計待補")).toBe(false);
    expect(screen.queryByText("預計 5 分鐘抵達")).toBeNull();
  });

  it("lost_item complaint submits properly", async () => {
    fetchResponse = { complaintId: "complaint-uuid" };
    render(<ComplaintForm token="order-uuid" authMode="id" />);
    fireEvent.click(screen.getByText("客訴與遺失物表單"));

    // Select lost item category
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "lost_item" },
    });

    // Fill required content description
    const contentInput = screen.getByPlaceholderText(/請描述您的問題/);
    fireEvent.change(contentInput, {
      target: { value: "I left my wallet in the car" },
    });

    // Fill required lost item description
    const descInput = screen.getByPlaceholderText("遺失物描述");
    fireEvent.change(descInput, { target: { value: "my wallet" } });

    fireEvent.click(screen.getByText("確認送出"));
    await waitFor(() => {
      expect(screen.getByText(/表單已送出/)).toBeTruthy();
    });

    expect(fetchCalls[0].body.category).toBe("lost_item");
    expect(fetchCalls[0].body.lostItemDescription).toBe("my wallet");
    expect(screen.getByTestId("passenger-complaint-id").textContent).toBe(
      "complaint-uuid",
    );
    expect(
      screen
        .getByTestId("passenger-complaint-ack")
        .getAttribute("data-order-id"),
    ).toBe("order-uuid");
  });

  it("A04 Quote Anomaly", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: {
          ...baseView.order,
          status: "exception_hold",
          fareQuoteAnomaly: "quote_provider_unavailable",
        },
        assignment: null,
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("請稍後重試或聯絡客服")).toBeTruthy(),
    );
    expect(screen.getByText("目前無法取得正式報價")).toBeTruthy();
    expect(screen.getByText("正式報價完成前不會為您確認訂單")).toBeTruthy();
    expect(screen.getByText("重新取得報價")).toBeTruthy();
  });

  it("Operational Hold with valid quote preserves assignment rather than quote outage", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "exception_hold" },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("行程保留處理中")).toBeTruthy(),
    );
    expect(screen.getByText("Test Driver")).toBeTruthy();
    expect(screen.queryByText("目前無法取得正式報價")).toBeNull();
  });

  it("P5-12 Driver Contact Not Provisioned", async () => {
    fetchResponse = {
      ride: {
        ...baseView,
        order: { ...baseView.order, status: "enroute_pickup" },
        actions: { ...baseView.actions, canContact: false },
      },
    };
    render(
      <PassengerRidePage
        token="uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("目前無法直接聯絡司機")).toBeTruthy(),
    );
    expect(screen.getByText("請改聯絡客服，我們會協助轉達。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "聯絡客服" })).toBeTruthy();
  });
});
