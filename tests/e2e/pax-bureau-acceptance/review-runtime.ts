type Environment = Record<string, string | undefined>;
export type ReviewRole = "pax" | "ops" | "driver";

/** Cloud Run credentials and app sessions have separate authorities. */
export function roleHeaders(
  role: ReviewRole,
  env: Environment = process.env,
): Record<string, string> {
  const shared = env.PAX_REVIEW_SHARED_DEV_SMOKE === "true";
  if (role === "pax" && env.PAX_REVIEW_PUBLIC_PASSENGER === "true") return {};
  const token =
    role === "ops"
      ? env.PAX_REVIEW_OPS_ID_TOKEN
      : role === "driver" && shared
        ? env.PAX_REVIEW_DRIVER_ID_TOKEN
        : env.PAX_REVIEW_PASSENGER_ID_TOKEN;
  if (shared && !token)
    throw new Error(`Missing existing private-service credential for ${role}`);
  return token ? { "X-Serverless-Authorization": `Bearer ${token}` } : {};
}

export function driverOrigin(env: Environment = process.env) {
  if (env.PAX_REVIEW_SHARED_DEV_SMOKE !== "true")
    return "http://127.0.0.1:3101";
  const origin = env.PAX_REVIEW_DRIVER_ORIGIN?.replace(/\/$/, "");
  if (!origin) throw new Error("Missing configured private Driver origin");
  return `${origin}/review-driver`;
}

const disposablePhones = {
  consent: "0900000010",
  wrong: "0900000011",
  resend: "0900000012",
  expiry: "0900000014",
  returning: "0900000015",
  trip: "0900000016",
  reliability: "0900000017",
  matching: "0900000018",
} as const;
export type PhoneCase = keyof typeof disposablePhones;

/** Shared runs must explicitly allocate existing rehearsal-pool identities.
 * The real observed consent prompt still proves first consent; this declaration
 * never clears an account or bypasses the ordinary OTP/account flow.
 */
export function bureauPhone(name: PhoneCase, env: Environment = process.env) {
  if (env.PAX_REVIEW_SHARED_DEV_SMOKE !== "true") return disposablePhones[name];
  const allocated: Record<string, unknown> = JSON.parse(
    env.PAX_BUREAU_PHONES || "{}",
  );
  const phone = allocated[name];
  if (typeof phone !== "string" || !/^09000000\d{2}$/.test(phone))
    throw new Error(
      `Allocate a rehearsal phone for ${name} in PAX_BUREAU_PHONES`,
    );
  const phones = Object.values(allocated);
  if (new Set(phones).size !== phones.length)
    throw new Error("Each bureau case needs its own allocated rehearsal phone");
  return phone;
}
