import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  P5Phone,
  P5Header,
} from "../../../apps/passenger-app-web/components/p5-ui";
import { REALM_COLORS } from "@drts/ui-tokens";

describe("P5 UI Background Regression", () => {
  it("P5Phone and P5Header use REALM_COLORS.passenger.light.headerBg for brandDark background", () => {
    // The merged helper added headerBg to passenger.light
    const expectedBg = (REALM_COLORS.passenger.light as any).headerBg;
    expect(expectedBg).toBeDefined();

    const phoneHtml = renderToStaticMarkup(
      <P5Phone url="test">
        <div />
      </P5Phone>,
    );
    // React style renderer might inject a space, let's just check the attribute roughly or import styling.
    // In React 18 renderToStaticMarkup, style={{ background: "#07437E" }} becomes style="background:#07437E"
    expect(phoneHtml).toContain(`background:${expectedBg}`);

    const headerHtml = renderToStaticMarkup(<P5Header status="Test" />);
    expect(headerHtml).toContain(`background:${expectedBg}`);
  });
});
