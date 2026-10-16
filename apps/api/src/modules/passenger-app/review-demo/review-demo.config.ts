/** Select external rehearsal adapters explicitly. NODE_ENV describes the build,
 * so a production Cloud Run build may still be the shared development product.
 */
export function reviewDemoEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.PAX_REVIEW_DEMO_ENABLED !== "true") return false;
  if (!["development", "test", "staging"].includes(env.DRTS_ENV ?? ""))
    throw new Error("passenger_review_requires_nonproduction_environment");
  return true;
}
