export type DriverOnboardingRouter = {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (href: string) => void;
};

/**
 * `useSegments()` includes Expo Router group segments such as `(tabs)`, which
 * are stripped from the actual URL. Strip them here too, otherwise every route
 * looks like a non-whitelisted route and an unprovisioned driver gets bounced
 * back to onboarding on every launch, foreground and revalidation tick — even
 * while they are typing their registration code on that very screen.
 */
export function allowUnprovisionedDriverRoute(segments: string[]): boolean {
  const path = segments.filter(
    (segment) => typeof segment === "string" && !segment.startsWith("("),
  );
  const [tab, screen] = path;

  if (tab == null) {
    return true;
  }

  if (tab === "onboarding") {
    // Flat (pre-tabs) segment shape.
    return true;
  }

  if (tab !== "index") {
    return false;
  }

  return screen == null || screen === "index" || screen === "onboarding";
}

export function resetDriverAppToOnboarding(
  router: DriverOnboardingRouter,
): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }

  router.replace("/onboarding");
}
