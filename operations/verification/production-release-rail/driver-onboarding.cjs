// Reuse the opt-in, association and conventional secret-name contracts from
// operations/deployment/resolve-driver-onboarding-secret-mounts.sh. Values are
// resolved only by the normal preflight numeric-version freeze, never here.
// SupplyReviewService enqueues in fleet.driver_onboarding_deliveries within
// the approval transaction. Its existing drain controller still needs an
// externally provisioned scheduler with Google workload identity, exact route
// POST internal/scheduled-tasks/driver-onboarding-notifications/drain and
// system scope driver:onboarding:notify. This builder provisions neither.
const DRIVER_ONBOARDING_SECRETS = Object.freeze({
  DRIVER_ONBOARDING_CODE_PEPPER: "driver-onboarding-code-pepper",
  DRIVER_ONBOARDING_DELIVERY_KEY: "driver-onboarding-delivery-key",
  TWILIO_ACCOUNT_SID: "twilio-account-sid",
  TWILIO_API_KEY_SID: "twilio-api-key-sid",
  TWILIO_API_KEY_SECRET: "twilio-api-key-secret",
  TWILIO_FROM_NUMBER: "twilio-from-number",
});
function driverOnboardingEnabled(vars, reject) {
  const enabled = (
    vars.PROD_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED || "false"
  ).toLowerCase();
  if (!["true", "false"].includes(enabled))
    reject("PROD_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED (true/false)");
  return enabled === "true";
}
function driverOnboardingConfig(vars, env, secrets, prefix, need, reject) {
  const enabled = driverOnboardingEnabled(vars, reject);
  env.DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED = String(enabled);
  if (!enabled) return;
  const fingerprints = need("PROD_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS")
    .split(",")
    .map((fp) => fp.replace(/\s/g, "").toUpperCase());
  if (!fingerprints.every((fp) => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fp)))
    reject("PROD_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS");
  const appId = need("PROD_DRIVER_ONBOARDING_IOS_APP_ID").replace(/\s/g, "");
  if (!/^[A-Z0-9]{10}\.com\.cctechsupport\.drts\.driver$/.test(appId))
    reject("PROD_DRIVER_ONBOARDING_IOS_APP_ID");
  env.DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS = fingerprints.join(",");
  env.DRIVER_ONBOARDING_IOS_APP_ID = appId;
  // Keep the operator's existing SMTP references and sending mode. Driver
  // delivery has its own PostgreSQL outbox; NOTIFICATION_OUTBOX_TYPE is not
  // its storage selector and must not be enabled or replaced as a side effect.
  for (const key of [
    "REMOTE_SMTP_HOST",
    "REMOTE_SMTP_PORT",
    "REMOTE_SMTP_FROM_EMAIL",
    "NOTIFICATION_FROM_EMAIL",
  ])
    need(`PROD_${key}`);
  for (const key of ["REMOTE_SMTP_USERNAME", "REMOTE_SMTP_PASSWORD"])
    need(`PROD_${key}_SECRET`);
  for (const [key, suffix] of Object.entries(DRIVER_ONBOARDING_SECRETS))
    secrets[key] ||= `${prefix}-${suffix}`;
}
function validateDriverOnboardingRuntime(env, checks, reject) {
  if (env.DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED !== "true") return;
  const pepper = env.DRIVER_ONBOARDING_CODE_PEPPER?.trim();
  if (!pepper || Buffer.byteLength(pepper) < 32 || checks.weakSecret(pepper))
    reject("DRIVER_ONBOARDING_CODE_PEPPER");
  if (!/^[a-f0-9]{64}$/i.test(env.DRIVER_ONBOARDING_DELIVERY_KEY?.trim() || ""))
    reject("DRIVER_ONBOARDING_DELIVERY_KEY (64 hex)");
  try {
    if (!checks.mail(env)?.sendPlatform)
      reject("driver onboarding Remote SMTP transport");
  } catch {
    reject("driver onboarding Remote SMTP transport");
  }
  // Match createDriverOnboardingTransport: driver SMS does not consume the
  // passenger OTP pepper. This calls the actual Twilio adapter's config path.
  if (
    checks.smsAvailability({ ...env, PASSENGER_OTP_PEPPER: undefined }) !==
    "available"
  )
    reject("driver onboarding Twilio SMS transport");
}
module.exports = {
  DRIVER_ONBOARDING_SECRETS,
  driverOnboardingEnabled,
  driverOnboardingConfig,
  validateDriverOnboardingRuntime,
};
