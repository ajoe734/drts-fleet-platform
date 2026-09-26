import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { AddressMapField } from "./address-map-field";

describe("AddressMapField", () => {
  it("renders with a saved address", () => {
    const savedAddress = {
      address: "Taipei 101",
      lat: 25.0339,
      lng: 121.5644,
      placeId: "place-101",
      coordinateSource: "manual_pin" as const,
    };
    const html = renderToString(<AddressMapField defaultValue={savedAddress} />);
    expect(html).toContain("Taipei 101");
    // Verify the hidden inputs are populated
    expect(html).toContain('name="lat" value="25.0339"');
    expect(html).toContain('name="lng" value="121.5644"');
    expect(html).toContain('name="coordinateSource" value="manual_pin"');
  });
});
