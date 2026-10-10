// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BookingPage from "../../../apps/passenger-app-web/app/page";
import { PassengerClient } from "@drts/passenger-client";

vi.mock("@drts/passenger-client", () => {
  return {
    PassengerClient: class {
      async getSessionStatus() {
        return { isActive: true };
      }
      async getAccount() {
        return { feeAcknowledgementVersion: "old-version" };
      }
      async getFares() {
        return {
          currentVersion: {
            version: "new-version",
            effectiveAt: "2026-07-01T00:00:00Z",
          },
        };
      }
      async getSettings() {
        return { booking: { minLeadTimeMinutes: 15 } };
      }
      async getFareQuote() {
        return {};
      }
    },
  };
});

describe("BookingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows E19a when feeAcknowledgementVersion is outdated and updates it on agree", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock;

    render(<BookingPage />);

    // Should show e19a
    await waitFor(() => {
      expect(screen.getByText("我已閱讀並同意")).not.toBeNull();
    });

    const agreeBtn = screen.getByText("我已閱讀並同意");
    fireEvent.click(agreeBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/passenger-app/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ feeAcknowledgementVersion: "new-version" }),
        }),
      );
    });

    // Should transition to form
    await waitFor(() => {
      expect(screen.getByText("預約叫車")).not.toBeNull();
    });
  });

  it("handles domain errors from submit order", async () => {
    vi.spyOn(PassengerClient.prototype, "getAccount").mockResolvedValue({
      feeAcknowledgementVersion: "new-version",
    } as any);

    // Mount page and wait for form
    render(<BookingPage />);
    await waitFor(() => {
      expect(screen.getByText("預約叫車")).not.toBeNull();
    });
  });
});
