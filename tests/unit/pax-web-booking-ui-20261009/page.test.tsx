// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BookingPage from "../../../apps/passenger-app-web/app/page";


// Mock router
const mockRouter = { push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter
}));

describe("BookingPage", () => {
  let fetchMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T06:00:00Z'));
    fetchMock = vi.fn().mockImplementation((url: string) => {
      // Default ok mock for initialization
      if (url.includes("/api/passenger-app/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { account: { feeAcknowledgementVersion: "old-version" } }
          })
        });
      }
      if (url.includes("/api/passenger-app/auth/providers")) {
         return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
      }
      if (url.includes("/api/passenger-app/fares")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              currentVersion: { version: "new-version", effectiveAt: "2026-07-01T00:00:00Z" }
            }
          })
        });
      }
      if (url.includes("/api/passenger-app/settings")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { booking: { minLeadTimeMinutes: 15 } }
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows E19a when feeAcknowledgementVersion is outdated and updates it on agree", async () => {
    fetchMock.mockImplementation((url: string, options: any) => {
      if (url === "/api/passenger-app/me" && options?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      // fallback to init mocks
      if (url.includes("/api/passenger-app/me")) return Promise.resolve({ ok: true, json: async () => ({ data: { account: { feeAcknowledgementVersion: "old-version" } } }) });
      if (url.includes("/api/passenger-app/fares")) return Promise.resolve({ ok: true, json: async () => ({ data: { currentVersion: { version: "new-version", effectiveAt: "2026-07-01T00:00:00Z" } } }) });
      if (url.includes("/api/passenger-app/settings")) return Promise.resolve({ ok: true, json: async () => ({ data: { booking: { minLeadTimeMinutes: 15 } } }) });
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    });

    render(<BookingPage />);
    await waitFor(() => expect(screen.getByText("我已閱讀並同意")).not.toBeNull());

    fireEvent.click(screen.getByText("我已閱讀並同意"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/passenger-app/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ feeAcknowledgementVersion: "new-version" }),
        })
      );
    });

    await waitFor(() => expect(screen.getByText("預約叫車")).not.toBeNull());
  });

  it("handles domain errors from submit order", async () => {
    fetchMock.mockImplementation((url: string, options: any) => {
      console.log("FETCH MOCK URL:", url, options?.method || "GET");
      if (url.includes("/api/passenger-app/me")) return Promise.resolve({ ok: true, json: async () => ({ data: { account: { feeAcknowledgementVersion: "new-version" } } }) });
      if (url.includes("/api/passenger-app/fares")) return Promise.resolve({ ok: true, json: async () => ({ data: { currentVersion: { version: "new-version", effectiveAt: "2026-07-01T00:00:00Z" } } }) });
      if (url.includes("/api/passenger-app/settings")) return Promise.resolve({ ok: true, json: async () => ({ data: { booking: { minLeadTimeMinutes: 15 } } }) });
      
      if (url.includes("/api/passenger-app/geo/search")) {
         return Promise.resolve({
           ok: true,
           json: async () => ({ data: { candidates: [{ candidateId: "c1", provider: "mock", displayName: "Taipei 101", address: "Taipei 101", location: { lat: 25, lng: 121 }, confidence: "rooftop" }] } })
         });
      }
      if (url.includes("/api/passenger-app/geo/resolve")) {
         return Promise.resolve({
           ok: true,
           json: async () => ({ data: { address: { addressId: "c1", addressName: "Taipei 101", address: "Taipei 101", lat: 25, lng: 121 } } })
         });
      }
      if (url.includes("/api/passenger-app/geo/evaluate")) {
         return Promise.resolve({
           ok: true,
           json: async () => ({ data: { result: "serviceable" } })
         });
      }
      if (url.includes("/api/passenger-app/geo/health")) {
         return Promise.resolve({
           ok: true,
           json: async () => ({ data: { provider: "mock", mode: "external", status: "healthy" } })
         });
      }

      if (url.includes("/api/passenger-app/quotes")) {
         return Promise.resolve({
           ok: true,
           json: async () => ({ data: { serviceAreaResult: "serviceable", estimatedMin: 100, estimatedMax: 150, expiresAt: new Date(Date.now() + 600000).toISOString(), fareVersion: "new-version", fareSnapshotId: "snap-1" } })
         });
      }
      if (url.includes("/api/passenger-app/rides") && options?.method === "POST") {
         return Promise.resolve({
           ok: false,
           status: 409,
           json: async () => ({ error: { code: "quote_expired" } })
         });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    });

    render(<BookingPage />);
    
    // Wait for form to appear
    await waitFor(() => expect(screen.getByText("預約叫車")).not.toBeNull());
    
    // Select origin
    fireEvent.click(screen.getByText("上車地點"));
    await waitFor(() => expect(screen.getByPlaceholderText("請輸入地址或地標")).not.toBeNull());
    fireEvent.change(screen.getByPlaceholderText("請輸入地址或地標"), { target: { value: "Taipei 101" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getAllByText("Taipei 101")[0]).not.toBeNull());
    fireEvent.click(screen.getAllByText("Taipei 101")[0]);

    // Select destination
    await waitFor(() => expect(screen.getByText("下車地點")).not.toBeNull());
    fireEvent.click(screen.getByText("下車地點"));
    await waitFor(() => expect(screen.getByPlaceholderText("請輸入地址或地標")).not.toBeNull());
    fireEvent.change(screen.getByPlaceholderText("請輸入地址或地標"), { target: { value: "Taipei 101" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getAllByText("Taipei 101")[0]).not.toBeNull());
    fireEvent.click(screen.getAllByText("Taipei 101")[0]);

    // Ensure scheduledAt is safely in the future (e.g. 1 hour later)
    const dateInput = document.querySelector('input[type="datetime-local"]');
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: "2026-10-10T07:00" } });
    }

    // Click Quote
    await waitFor(() => expect(screen.getByText("試算車資")).not.toHaveProperty("disabled", true));
    fireEvent.click(screen.getByText("試算車資"));

    // Wait for E19b quote confirmation screen
    await waitFor(() => expect(screen.getByTestId("e19b-checkbox")).not.toBeNull());
    
    // Check agree checkbox
    fireEvent.click(screen.getByTestId("e19b-checkbox"));
    
    // Submit order
    fireEvent.click(screen.getByTestId("e19b-confirm-btn"));

    // Should return to form and show quote expired error
    await waitFor(() => {
      expect(screen.getByText("報價已過期，請重新試算")).not.toBeNull();
      expect(screen.getByText("試算車資")).not.toBeNull(); // back to form
    });
  });
});
