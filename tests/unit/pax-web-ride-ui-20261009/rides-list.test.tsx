/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
  isInaccessible,
} from "@testing-library/react";
import RidesListPage from "../../../apps/passenger-app-web/app/rides/page";
import { passengerClient } from "../../../apps/passenger-app-web/lib/client";
import { PassengerRideAuthorityView } from "@drts/contracts";

vi.mock("../../../apps/passenger-app-web/lib/client", () => ({
  passengerClient: {
    getActiveRides: vi.fn(),
    getRides: vi.fn(),
  },
}));

function completedRide(
  orderId: string,
  orderNo: string,
): PassengerRideAuthorityView {
  return {
    order: {
      orderId,
      orderNo,
      requestedPickupAt: "2026-11-19T02:12:00Z",
      status: "completed",
      pickup: { address: "示意上車站" },
      dropoff: { address: "示意下車站" },
    },
    receipt: { amountMinor: 8500 },
    actions: { canRate: false },
  } as unknown as PassengerRideAuthorityView;
}

describe("RidesListPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should render loading state initially", () => {
    (passengerClient.getActiveRides as any).mockReturnValue(
      new Promise(() => {}),
    );
    (passengerClient.getRides as any).mockReturnValue(new Promise(() => {}));

    render(<RidesListPage />);
    expect(screen.getByText("載入中...")).toBeTruthy();
  });

  it("should render active and history rides", async () => {
    const activeRide = {
      order: {
        orderId: "active-123",
        orderNo: "active-123",
        requestedPickupAt: new Date().toISOString(),
        status: "assigned",
        pickup: { address: "123 Main St" },
      },
    } as unknown as PassengerRideAuthorityView;

    const historyRide = {
      order: {
        orderId: "history-456",
        orderNo: "history-456",
        requestedPickupAt: new Date(Date.now() - 3600 * 1000).toISOString(),
        status: "completed",
        pickup: { address: "456 Elm St" },
      },
      actions: { canRate: true },
    } as unknown as PassengerRideAuthorityView;

    (passengerClient.getActiveRides as any).mockResolvedValue({
      rides: [activeRide],
    });
    (passengerClient.getRides as any).mockResolvedValue({
      rides: [historyRide],
    });

    render(<RidesListPage />);

    await waitFor(() => {
      expect(screen.queryByText("載入中...")).not.toBeTruthy();
    });

    expect(screen.getByText("進行中")).toBeTruthy();
    expect(screen.getByText("123 Main St")).toBeTruthy();

    expect(screen.getByText("歷史紀錄")).toBeTruthy();
    expect(screen.getByText("456 Elm St")).toBeTruthy();
    expect(screen.getByText("⭐ 填寫評價")).toBeTruthy(); // Within 24h
  });

  it("should not render rating link for old history rides", async () => {
    const oldHistoryRide = {
      order: {
        orderId: "history-789",
        orderNo: "history-789",
        requestedPickupAt: new Date(
          Date.now() - 48 * 3600 * 1000,
        ).toISOString(),
        status: "completed",
        pickup: { address: "789 Oak St" },
      },
      actions: { canRate: false },
    } as unknown as PassengerRideAuthorityView;

    (passengerClient.getActiveRides as any).mockResolvedValue({ rides: [] });
    (passengerClient.getRides as any).mockResolvedValue({
      rides: [oldHistoryRide],
    });

    render(<RidesListPage />);

    await waitFor(() => {
      expect(screen.queryByText("載入中...")).not.toBeTruthy();
    });

    expect(screen.getByText("789 Oak St")).toBeTruthy();
    expect(screen.queryByText("⭐ 填寫評價")).not.toBeTruthy();
  });

  it.each([
    [
      "different prefixes",
      "O-93b547aa-0000-4000-8000-000000000001",
      "O-6b76cbbb-0000-4000-8000-000000000002",
    ],
    [
      "the same prefix",
      "O-93b547aa-0000-4000-8000-000000000001",
      "O-93b547aa-0000-4000-8000-000000000002",
    ],
  ])(
    "should distinguish matching completed rides with %s by visible order number",
    async (_scenario, firstOrderNo, secondOrderNo) => {
      const rides = [
        completedRide("11111111-0000-4000-8000-000000000001", firstOrderNo),
        completedRide("22222222-0000-4000-8000-000000000002", secondOrderNo),
      ];
      vi.mocked(passengerClient.getActiveRides).mockResolvedValue({
        rides: [],
      });
      vi.mocked(passengerClient.getRides).mockResolvedValue({ rides });

      render(<RidesListPage />);

      for (const ride of rides) {
        const link = await screen.findByRole<HTMLAnchorElement>("link", {
          name: new RegExp(`訂單編號 ${ride.order.orderNo}`),
        });
        // The identifier is visible content, not only an aria-label or URL.
        expect(isInaccessible(within(link).getByText(ride.order.orderNo))).toBe(
          false,
        );
        expect(link.textContent).toContain("車資 NT$ 85");
        expect(link.textContent).toContain("示意上車站");
        expect(link.getAttribute("href")).toBe(`/rides/${ride.order.orderId}`);
        // Preserve native keyboard selection on the actual Next Link anchor.
        expect(link.tagName).toBe("A");
        expect(link.tabIndex).toBe(0);
        link.focus();
        expect(document.activeElement).toBe(link);
      }
    },
  );

  it("should preserve full and legacy order numbers after pagination and reload", async () => {
    const first = completedRide(
      "11111111-0000-4000-8000-000000000001",
      "O-93b547aa-0000-4000-8000-000000000001",
    );
    const second = completedRide(
      "22222222-0000-4000-8000-000000000002",
      "O-93b547aa-0000-4000-8000-000000000002",
    );
    const legacy = completedRide("legacy-id", "ORD-20261009-00123");
    vi.mocked(passengerClient.getActiveRides).mockResolvedValue({ rides: [] });
    vi.mocked(passengerClient.getRides)
      .mockResolvedValueOnce({ rides: [first], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({
        rides: [first, second, legacy],
      });

    const { unmount } = render(<RidesListPage />);
    await screen.findByRole("link", { name: new RegExp(first.order.orderNo) });
    fireEvent.click(screen.getByRole("button", { name: "載入更多" }));
    await screen.findByRole("link", { name: new RegExp(legacy.order.orderNo) });
    expect(passengerClient.getRides).toHaveBeenNthCalledWith(2, {
      limit: 20,
      cursor: "cursor-2",
    });

    const rides = [first, second, legacy];
    const assertOrderLinks = () => {
      for (const ride of rides) {
        const links = screen.getAllByRole("link", {
          name: new RegExp(`訂單編號 ${ride.order.orderNo}`),
        });
        expect(links).toHaveLength(1);
        expect(links[0]!.getAttribute("href")).toBe(
          `/rides/${ride.order.orderId}`,
        );
        expect(
          isInaccessible(within(links[0]!).getByText(ride.order.orderNo)),
        ).toBe(false);
      }
    };
    assertOrderLinks();

    unmount();
    vi.mocked(passengerClient.getRides).mockResolvedValueOnce({ rides });
    render(<RidesListPage />);
    await screen.findByRole("link", { name: new RegExp(legacy.order.orderNo) });
    assertOrderLinks();
    expect(passengerClient.getRides).toHaveBeenLastCalledWith({ limit: 20 });
  });

  it("should handle pagination, errors, and duplicate history deduplication", async () => {
    const activeRide = {
      order: {
        orderId: "o1",
        orderNo: "O1",
        requestedPickupAt: new Date().toISOString(),
        status: "assigned",
        pickup: { address: "A" },
      },
    } as any;

    const historyRide1 = {
      order: {
        orderId: "o2",
        orderNo: "O2",
        requestedPickupAt: new Date().toISOString(),
        status: "completed",
        pickup: { address: "B" },
      },
    } as any;
    const historyRideDuplicate = {
      order: {
        orderId: "o1",
        orderNo: "O1",
        requestedPickupAt: new Date().toISOString(),
        status: "assigned",
        pickup: { address: "A" },
      },
    } as any;
    const historyRide2 = {
      order: {
        orderId: "o3",
        orderNo: "O3",
        requestedPickupAt: new Date().toISOString(),
        status: "completed",
        pickup: { address: "C" },
      },
    } as any;

    (passengerClient.getActiveRides as any).mockResolvedValue({
      rides: [activeRide],
    });
    (passengerClient.getRides as any).mockResolvedValueOnce({
      rides: [historyRide1, historyRideDuplicate],
      nextCursor: "cursor-2",
    });

    render(<RidesListPage />);
    await waitFor(() => {
      expect(screen.queryByText("載入中...")).not.toBeTruthy();
    });

    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();

    (passengerClient.getRides as any).mockRejectedValueOnce(
      new Error("Network Error"),
    );
    const loadMoreBtn = screen.getByText("載入更多");
    fireEvent.click(loadMoreBtn);

    // We expect the error to be handled (e.g. state reset to not loading)
    await waitFor(() => {
      expect(loadMoreBtn.hasAttribute("disabled")).toBe(false);
    });

    (passengerClient.getRides as any).mockResolvedValueOnce({
      rides: [historyRide2],
      nextCursor: null,
    });
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText("C")).toBeTruthy();
    });
    expect(screen.queryByText("載入更多")).not.toBeTruthy();
  });

  it("should deduplicate overlapping history items across multiple pages", async () => {
    const h1 = {
      order: {
        orderId: "h1",
        orderNo: "H1",
        requestedPickupAt: new Date().toISOString(),
        status: "completed",
        pickup: { address: "History-A" },
      },
    } as any;
    const h2 = {
      order: {
        orderId: "h2",
        orderNo: "H2",
        requestedPickupAt: new Date().toISOString(),
        status: "completed",
        pickup: { address: "History-B" },
      },
    } as any;

    (passengerClient.getActiveRides as any).mockResolvedValue({ rides: [] });
    (passengerClient.getRides as any)
      .mockResolvedValueOnce({
        rides: [h1],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        rides: [h1, h2],
        nextCursor: null,
      });

    render(<RidesListPage />);
    await waitFor(() => {
      expect(screen.getByText("History-A")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("載入更多"));
    await waitFor(() => {
      expect(screen.getByText("History-B")).toBeTruthy();
    });

    expect(screen.queryAllByText("History-A").length).toBe(1);
  });
});
