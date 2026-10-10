/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RidesListPage from "../../../apps/passenger-app-web/app/rides/page";
import { passengerClient } from "../../../apps/passenger-app-web/lib/client";
import { PassengerRideAuthorityView } from "@drts/contracts";

vi.mock("../../../apps/passenger-app-web/lib/client", () => ({
  passengerClient: {
    getActiveRides: vi.fn(),
    getRides: vi.fn(),
  },
}));

describe("RidesListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should handle pagination, errors, and duplicate history deduplication", async () => {
    const activeRide = {
      order: { orderId: "o1", orderNo: "O1", requestedPickupAt: new Date().toISOString(), status: "assigned", pickup: { address: "A" } },
    } as any;
    
    const historyRide1 = {
      order: { orderId: "o2", orderNo: "O2", requestedPickupAt: new Date().toISOString(), status: "completed", pickup: { address: "B" } },
    } as any;
    const historyRideDuplicate = {
      order: { orderId: "o1", orderNo: "O1", requestedPickupAt: new Date().toISOString(), status: "assigned", pickup: { address: "A" } },
    } as any;
    const historyRide2 = {
      order: { orderId: "o3", orderNo: "O3", requestedPickupAt: new Date().toISOString(), status: "completed", pickup: { address: "C" } },
    } as any;

    (passengerClient.getActiveRides as any).mockResolvedValue({ rides: [activeRide] });
    (passengerClient.getRides as any).mockResolvedValueOnce({
      rides: [historyRide1, historyRideDuplicate],
      nextCursor: "cursor-2"
    });

    render(<RidesListPage />);
    await waitFor(() => {
      expect(screen.queryByText("載入中...")).not.toBeTruthy();
    });

    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();

    (passengerClient.getRides as any).mockRejectedValueOnce(new Error("Network Error"));
    const loadMoreBtn = screen.getByText("載入更多");
    fireEvent.click(loadMoreBtn);
    
    // We expect the error to be handled (e.g. state reset to not loading)
    await waitFor(() => {
      expect(loadMoreBtn).not.toBeDisabled();
    });

    (passengerClient.getRides as any).mockResolvedValueOnce({
      rides: [historyRide2],
      nextCursor: null
    });
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText("C")).toBeTruthy();
    });
    expect(screen.queryByText("載入更多")).not.toBeTruthy();
  });
});
