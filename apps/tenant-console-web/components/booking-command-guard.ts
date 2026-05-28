export interface ActionAvailabilityDescriptor {
  availability: "enabled" | "disabled";
}

export function createBookingCommandGuard(options: {
  descriptor?: ActionAvailabilityDescriptor;
  disabled: boolean;
  onAction: () => void;
}) {
  const isDisabled =
    options.disabled || options.descriptor?.availability === "disabled";

  return {
    disabled: isDisabled,
    onClick() {
      if (isDisabled) {
        return;
      }
      options.onAction();
    },
  };
}
