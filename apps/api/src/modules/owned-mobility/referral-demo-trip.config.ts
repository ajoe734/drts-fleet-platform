/**
 * Dev-only demo shortcut for the bureau inspection embed: a tester may assign a
 * synthetic business test driver to their own referral order and complete it,
 * so the completed / rating / receipt screens can be shown with real records.
 * Requires an explicit flag and a development/test environment; anything else
 * behaves as if the routes do not exist.
 */
export function referralDemoTripEnabled(env: NodeJS.ProcessEnv): boolean {
  return (
    env.REFERRAL_DEMO_TRIP_ENABLED === "true" &&
    ["development", "test"].includes(env.DRTS_ENV?.trim().toLowerCase() ?? "")
  );
}
