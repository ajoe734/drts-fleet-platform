export type DriverOnboardingRouter = {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (href: string) => void;
};

export function resetDriverAppToOnboarding(
  router: DriverOnboardingRouter,
): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }

  router.replace("/onboarding");
}
