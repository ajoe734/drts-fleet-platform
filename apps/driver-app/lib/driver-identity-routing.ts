export type DriverOnboardingRouter = {
  canDismiss: () => boolean;
  dismissAll: () => void;
  replace: (href: string) => void;
  push?: (href: string) => void;
};

export const PUBLIC_DRIVER_ROUTES = ["onboarding"] as const;

export const PROTECTED_DRIVER_ROUTES = [
  "index",
  "jobs",
  "trip",
  "platform-presence",
  "settings",
  "earnings",
  "shift",
  "sos",
  "incident",
  "safety-operator",
] as const;

export type PublicDriverRoute = (typeof PUBLIC_DRIVER_ROUTES)[number];
export type ProtectedDriverRoute = (typeof PROTECTED_DRIVER_ROUTES)[number];

export function allowUnprovisionedDriverRoute(segments: string[]): boolean {
  const topLevelRoute = segments[0]?.replace(/^\//, "");

  return topLevelRoute === "onboarding";
}

export function isProtectedDriverRoute(route: string | string[]): boolean {
  const raw = Array.isArray(route) ? route[0] : route;
  const routeName = raw?.replace(/^\//, "") || "index";
  return (PROTECTED_DRIVER_ROUTES as readonly string[]).includes(
    routeName as ProtectedDriverRoute,
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
