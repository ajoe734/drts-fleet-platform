import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookingCommandTriggerButton } from "./booking-command-panel";

describe("BookingCommandTriggerButton", () => {
  it("blocks the booking command CTA when the descriptor marks it disabled", () => {
    const onAction = vi.fn();

    render(
      React.createElement(
        BookingCommandTriggerButton,
        {
          descriptor: { availability: "disabled" },
          disabled: false,
          className: "test-button",
          onAction,
        },
        "Cancel booking",
      ),
    );

    const button = screen.getByRole("button", { name: "Cancel booking" });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);

    expect(onAction).not.toHaveBeenCalled();
  });
});
