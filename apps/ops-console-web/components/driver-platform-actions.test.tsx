import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DriverActionButton } from "./driver-platform-actions";

describe("DriverActionButton", () => {
  it("does not run the platform mutation when the descriptor disables the CTA", () => {
    const onAction = vi.fn();

    render(
      React.createElement(
        DriverActionButton,
        {
          descriptor: { availability: "disabled" },
          busy: false,
          onAction,
        },
        "Take offline",
      ),
    );

    const button = screen.getByRole("button", { name: "Take offline" });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);

    expect(onAction).not.toHaveBeenCalled();
  });
});
