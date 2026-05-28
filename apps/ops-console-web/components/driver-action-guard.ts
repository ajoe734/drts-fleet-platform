export interface ActionAvailabilityDescriptor {
  availability: "enabled" | "disabled";
}

export function createDriverActionGuard(options: {
  descriptor?: ActionAvailabilityDescriptor;
  busy: boolean;
  onAction: () => void;
}) {
  const disabled =
    options.busy || options.descriptor?.availability === "disabled";

  return {
    disabled,
    onClick() {
      if (disabled) {
        return;
      }
      options.onAction();
    },
  };
}
