/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AddressMapField } from "../../../apps/tenant-portal-web/components/address-map-field";

vi.mock("../../../apps/tenant-portal-web/lib/geo-map-provider", () => ({
  createTenantPortalGeoProvider: () => ({
    search: async () => ({
      results: [
        {
          candidateId: "cand-1",
          placeId: "place-1",
          displayName: "Test Address",
          address: "123 Test St",
          location: { lat: 25.0, lng: 121.0 },
          confidence: "exact",
        },
      ],
      warnings: [],
      providerSource: "mock",
    }),
    getHealth: async () => ({ available: true }),
    evaluateServiceArea: async () => ({ decision: "serviceable" }),
    reverseGeocode: async () => ({
      results: [],
      warnings: [],
      providerSource: "mock",
    }),
  }),
}));

describe("AddressMapField Interactive Test", () => {
  it("updates hidden inputs when a new address is selected", async () => {
    const { container } = render(React.createElement(AddressMapField, { defaultValue: null }));

    // Initially, hidden inputs should be empty
    expect(container.querySelector('input[name="lat"]')?.getAttribute("value")).toBe("");
    expect(container.querySelector('input[name="lng"]')?.getAttribute("value")).toBe("");

    // Missing coordinate warning should be visible
    expect(screen.getByText("No map coordinates yet")).toBeTruthy();

    // Type in search
    const searchInput = screen.getByRole("textbox", { name: /search/i });
    fireEvent.change(searchInput, { target: { value: "Test" } });
    
    const searchButton = screen.getByRole("button", { name: /search/i });
    fireEvent.click(searchButton);

    // Wait for mock result
    await waitFor(() => {
      expect(screen.getByText("Test Address")).toBeTruthy();
    });

    // Click the result
    fireEvent.click(screen.getByText("Test Address"));

    // Wait for the hidden inputs to update
    await waitFor(() => {
      expect(container.querySelector('input[name="lat"]')?.getAttribute("value")).toBe("25");
      expect(container.querySelector('input[name="lng"]')?.getAttribute("value")).toBe("121");
      expect(container.querySelector('input[name="coordinateSource"]')?.getAttribute("value")).toBe("provider_candidate");
    });
    
    // Warning should disappear
    expect(screen.queryByText("No map coordinates yet")).toBeNull();
  });
});
