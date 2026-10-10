import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PassengerRidePage } from "../../../components/ride/passenger-ride-page";
import RidesPage from "../../../app/rides/page";
import {
  fetchPassengerRideAuthority,
  requestPassengerRideAction,
  fetchPassengerReceipt,
} from "../../../lib/ride/passenger-live";

vi.mock("../../../lib/ride/passenger-live", () => ({
  fetchPassengerRideAuthority: vi.fn(),
  requestPassengerRideAction: vi.fn(),
  fetchPassengerReceipt: vi.fn(),
  subscribePassengerRideAuthority: vi.fn(() => vi.fn()),
  mapPassengerCertificate: vi.fn((r) => ({
    state: "ready",
    rows: [
      { label: "Receipt No", value: r.receiptNo },
      { label: "Driver Name", value: r.record?.driverName },
      { label: "Fleet", value: r.record?.fleetName },
    ],
  })),
  mapPassengerRideAuthorityToFixture: vi.fn((v) => v),
  PassengerAuthorityError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

describe("Passenger Ride Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const screens = [
    "P5-01",
    "P5-02",
    "P5-03",
    "P5-05",
    "P5-06",
    "P5-07",
    "P5-08",
    "P5-09",
    "P5-10",
    "P5-11",
    "P5-12",
    "P5-A04",
  ];

  screens.forEach((screenId) => {
    it(`renders state ${screenId}`, async () => {
      (fetchPassengerRideAuthority as any).mockResolvedValue({
        screenId,
        order: { status: "completed" },
        assignment: null,
      });

      render(
        <PassengerRidePage
          token="test"
          searchParams={{ mode: "live" }}
          kind="ride"
        />,
      );
      await waitFor(() => {
        expect(fetchPassengerRideAuthority).toHaveBeenCalled();
      });
    });
  });

  it("tests E-18b rating form logic", async () => {
    (fetchPassengerRideAuthority as any).mockResolvedValue({
      screenId: "P5-08",
      order: { status: "completed" },
      canRate: true,
      ratingSummary: { countText: "Test", chips: [] },
      assignment: { rating: { displayState: "rate" } },
    });
    (requestPassengerRideAction as any).mockResolvedValue({ score: 2 });

    render(
      <PassengerRidePage
        token="test"
        searchParams={{ mode: "live" }}
        kind="ride"
      />,
    );

    await waitFor(() => screen.getByText("這趟服務如何？"));

    const star2 = screen.getByLabelText("2 星");
    fireEvent.click(star2);

    const textarea = screen.getByPlaceholderText(/給我們一些建議吧/);
    fireEvent.change(textarea, { target: { value: "Too slow" } });

    const checkbox = screen.getByLabelText("需要客服與您聯繫嗎？");
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    const submitBtn = screen.getByText("送出評價");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(requestPassengerRideAction).toHaveBeenCalledWith(
        "test",
        "ratings",
        expect.objectContaining({ score: 2, comment: "Too slow" }),
        false,
      );
      expect(requestPassengerRideAction).toHaveBeenCalledWith(
        "test",
        "contact",
        expect.objectContaining({ body: "Too slow" }),
        false,
      );
    });
  });

  it("tests E-04 receipt download", async () => {
    (fetchPassengerRideAuthority as any).mockResolvedValue({
      screenId: "P5-10",
      canReadReceipt: true,
      certificate: { state: "pending" },
    });
    (fetchPassengerReceipt as any).mockResolvedValue({
      receiptNo: "REC123",
      issuedAt: new Date().toISOString(),
      record: {
        driverName: "John",
        fleetName: "Fleet A",
        plateNo: "ABC-1234",
        pickupAt: new Date().toISOString(),
        dropoffAt: new Date().toISOString(),
        travelDurationSeconds: 100,
        routeSummary: "A to B",
        distanceMeters: 1000,
        amountMinor: 100,
        tollMinor: 10,
        consumerServicePhone: "0912345678",
        authorityComplaintPhone: "0912345678",
      },
    });

    render(
      <PassengerRidePage
        token="test"
        searchParams={{ mode: "live" }}
        kind="receipt"
      />,
    );

    await waitFor(() => screen.getByText("重新讀取乘車證明"));
    fireEvent.click(screen.getByText("重新讀取乘車證明"));

    await waitFor(() => {
      expect(screen.getByText("REC123")).toBeTruthy();
      expect(screen.getByText("John")).toBeTruthy();
      expect(screen.getByText("Fleet A")).toBeTruthy();
    });
  });
});

describe("Rides Page History", () => {
  it("renders history list", async () => {
    // Basic test
    render(<RidesPage />);
  });
});
