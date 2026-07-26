export type DriverOnboardingRouter = {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (href: string) => void;
};

export function allowUnprovisionedDriverRoute(segments: string[]): boolean {
  const topLevelRoute = segments[0];

  return (
    topLevelRoute == null ||
    topLevelRoute === "index" ||
    topLevelRoute === "onboarding" ||
    topLevelRoute === "safety-operator" ||
    topLevelRoute === "sos"
  );
}

export function resetDriverAppToOnboarding(
  router: DriverOnboardingRouter,
): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }

  router.replace("/onboarding");
}
