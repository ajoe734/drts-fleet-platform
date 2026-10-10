import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { P5E19b } from "../../../apps/passenger-app-web/components/booking/e19b";

describe("P5E19b Component", () => {
  it("renders with disabled button when unchecked", () => {
    const onConfirm = vi.fn();
    const onCheckedChange = vi.fn();
    const onCancel = vi.fn();

    render(
      <P5E19b
        checked={false}
        onCheckedChange={onCheckedChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
        originTitle="Origin"
        destinationTitle="Destination"
        scheduledAt="Now"
        quoteMin={100}
        quoteMax={150}
        paymentMethod="Cash"
      />
    );

    const button = screen.getByTestId("e19b-confirm-btn");
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    
    // Warning text should be visible
    expect(screen.getByText("請先勾選「我已確認費用與優惠說明」")).toBeInTheDocument();
  });

  it("calls onCheckedChange when checkbox is clicked", () => {
    const onCheckedChange = vi.fn();
    render(
      <P5E19b
        checked={false}
        onCheckedChange={onCheckedChange}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        originTitle="Origin"
        destinationTitle="Destination"
        scheduledAt="Now"
        quoteMin={100}
        quoteMax={150}
        paymentMethod="Cash"
      />
    );

    const checkbox = screen.getByTestId("e19b-checkbox");
    fireEvent.click(checkbox);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("enables button and allows submit when checked", () => {
    const onConfirm = vi.fn();
    
    render(
      <P5E19b
        checked={true}
        onCheckedChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        originTitle="Origin"
        destinationTitle="Destination"
        scheduledAt="Now"
        quoteMin={100}
        quoteMax={150}
        paymentMethod="Cash"
      />
    );

    const button = screen.getByTestId("e19b-confirm-btn");
    expect(button).not.toBeDisabled();
    
    // Warning text should NOT be visible
    expect(screen.queryByText("請先勾選「我已確認費用與優惠說明」")).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalled();
  });
});
