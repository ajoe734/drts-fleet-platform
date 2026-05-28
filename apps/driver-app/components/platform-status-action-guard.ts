export interface ActionAvailabilityDescriptor {
  availability: "enabled" | "disabled";
}

export function createPlatformStatusActionGuard(options: {
  descriptor?: ActionAvailabilityDescriptor;
  disabled?: boolean;
  onPress: () => void;
}) {
  const isDisabled =
    Boolean(options.disabled) ||
    options.descriptor?.availability === "disabled";

  return {
    disabled: isDisabled,
    onPress() {
      if (isDisabled) {
        return;
      }
      options.onPress();
    },
  };
}
