import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { P5Map, P5VehicleCard, P5Header } from "../../../apps/passenger-app-web/components/p5-ui";

describe("P5 UI Components", () => {
  it("P5Map requires explicit position inputs to show car and claims", () => {
    // Missing inputs
    let html = renderToStaticMarkup(<P5Map />);
    expect(html).not.toContain("位置已更新");
    expect(html).not.toContain("司機位置更新稍有延遲");
    expect(html).not.toContain("M50 120 C 120 90, 200 100, 310 44"); // Should not have fake route SVG

    // Valid inputs
    html = renderToStaticMarkup(<P5Map state="fresh" carPosition={{ left: "40px", top: "100px" }} pinPosition={{ left: "10px", top: "10px" }} routeSvgPath="M0" />);
    expect(html).toContain("位置已更新");
  });

  it("P5VehicleCard distinguishes registration status", () => {
    let html = renderToStaticMarkup(<P5VehicleCard driver="TEST" registrationValid={true} />);
    expect(html).toContain("執登有效");
    expect(html).not.toContain("執登無效");

    html = renderToStaticMarkup(<P5VehicleCard driver="TEST" registrationValid={false} />);
    expect(html).toContain("執登無效");
    expect(html).not.toContain("執登有效");
    
    html = renderToStaticMarkup(<P5VehicleCard driver="TEST" />);
    expect(html).not.toContain("執登有效");
    expect(html).not.toContain("執登無效");
  });

  it("P5Header handles empty orderId", () => {
    const html = renderToStaticMarkup(<P5Header status="等待派車" />);
    expect(html).not.toContain("ZX-240720-0186"); // Default fake ID should be gone
  });
});
