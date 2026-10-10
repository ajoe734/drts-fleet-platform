/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RidesListPage from "../../../apps/passenger-app-web/app/rides/page";
import React from "react";

describe("RidesListPage", () => {
  it("renders Screen Requirements Note", () => {
    render(<RidesListPage />);
    expect(screen.getByText("Screen Requirements Note")).toBeTruthy();
    expect(screen.getByText(/History screen design is missing/)).toBeTruthy();
  });
});
