import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TenantLifecycleActionButton } from "./page";

describe("TenantLifecycleActionButton", () => {
  it("keeps the lifecycle CTA disabled when the descriptor is unavailable", () => {
    const onAction = vi.fn();

    render(
      React.createElement(
        TenantLifecycleActionButton,
        {
          descriptor: { availability: "disabled" },
          busy: false,
          className: "test-button",
          onAction,
        },
        "Activate",
      ),
    );

    const button = screen.getByRole("button", { name: "Activate" });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);

    expect(onAction).not.toHaveBeenCalled();
  });
});
