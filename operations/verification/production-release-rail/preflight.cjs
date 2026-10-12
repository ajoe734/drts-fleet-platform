/* eslint-disable @typescript-eslint/no-require-imports -- executable CommonJS rail and production TS loader */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  createPublicKey,
  verify: verifySignature,
  constants,
} = require("node:crypto");
const { buildPlan, reject } = require("./rail.cjs");
const { checkPublicEntryPolicies } = require("./public-entry.cjs");

// Load the production validators without starting Nest or any product server.
// The compiler is locked by pnpm-lock.yaml; all checks remain offline except
// the injected read-only Secret Manager / IAM boundary below.
function validators() {
  const ts = require("typescript");
  require.extensions[".ts"] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    module._compile(compiled.outputText, filename);
  };
  const root = path.resolve(__dirname, "../../..");
  const load = (file) => require(path.join(root, "apps/api/src", file));
  return {
    document: load(
      "common/document-artifacts/document-artifact-runtime.config.ts",
    ).createDocumentArtifactStore,
    proofStorage: load(
      "modules/billing-settlement/remittance-proof-runtime.config.ts",
    ).createRemittanceProofStorage,
    proofScanner: load(
      "modules/billing-settlement/remittance-proof-runtime.config.ts",
    ).createRemittanceProofScanner,
    auth: load("config/auth-startup-config.ts").buildAuthStartupConfigReport,
    payment: load("modules/passenger-app/payment/payment-runtime.config.ts")
      .paymentRuntimeFromEnv,
    capture: load("modules/passenger-app/payment/payment-capture.config.ts")
      .paymentCapturePolicyFromEnv,
    expiry: load(
      "modules/passenger-app/payment/payment-recovery-notice.config.ts",
    ).paymentRecoveryNoticeExpiryFromEnv,
    otp: load("modules/passenger-app/otp/passenger-otp.service.ts")
      .otpOptionsFromEnv,
    mail: load("modules/notification-delivery/smtp-mail.transport.ts")
      .createMailTransportFromEnv,
    smsAvailability: () =>
      new (load(
        "modules/passenger-app/otp/sms.port.ts",
      ).UnconfiguredSmsPort)().availability(),
    matchesScope: load("common/auth/internal-key-exception-registry.ts")
      .matchesScope,
    weakSecret: load("config/auth-startup-config.ts").isWeakSecret,
    bankSign: require(
      path.join(root, "apps/bank-console-web/app/artifacts/artifact-crypto.ts"),
    ).signPayloadBytes,
  };
}
function validateRuntime(plan, values, checks = validators()) {
  const api = plan.services.find((s) => s.id === "api");
  const env = {
    ...api.env,
    ...Object.fromEntries(
      Object.entries(api.secrets).map(([key, ref]) => [key, values[ref]]),
    ),
  };
  const report = checks.auth(env);
  if (!report.valid) reject(report.issues.map((i) => i.control).join(", "));
  validateArtifactRuntime(env, checks);
  const providers = plan.services.find((s) => s.id === "passenger-app-web")
    .publicEntry.expectedProviders;
  // Match PassengerAppModule's actual SMS_PORT binding, rather than treating
  // an OTP pepper as proof that an unavailable SMS adapter can serve users.
  if (providers.includes("phone") && checks.smsAvailability() !== "available")
    reject(
      "F-PUBLIC-ENTRY deployment blocker: production PassengerAppModule SMS_PORT adapter unavailable for required phone login",
    );
  if (providers.includes("email") && !checks.mail(env)?.sendPlatform)
    reject(
      "F-PUBLIC-ENTRY deployment blocker: platform SMTP transport unavailable for required email login",
    );
  try {
    const database = new URL(env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      database.pathname.length < 2
    )
      reject("DATABASE_URL durable PostgreSQL database");
  } catch {
    reject("DATABASE_URL durable PostgreSQL database");
  }
  let customRegistry;
  try {
    customRegistry = JSON.parse(env.WORKLOAD_IDENTITY_SERVICE_PRINCIPALS);
  } catch {
    reject("WORKLOAD_IDENTITY_SERVICE_PRINCIPALS");
  }
  if (
    !Array.isArray(customRegistry) ||
    !customRegistry.length ||
    customRegistry.some(
      (entry) =>
        entry.allowedTokenAudiences !== undefined &&
        (!Array.isArray(entry.allowedTokenAudiences) ||
          entry.allowedTokenAudiences.some(
            (audience) => typeof audience !== "string",
          )),
    ) ||
    !customRegistry.some(
      (entry) =>
        entry.issuer === env.WORKLOAD_IDENTITY_ISSUER &&
        [
          ...(entry.allowedTokenAudiences || []),
          entry.defaultTokenAudience,
        ].includes(env.WORKLOAD_IDENTITY_AUDIENCE),
    )
  )
    reject("WORKLOAD_IDENTITY_SERVICE_PRINCIPALS issuer/audience binding");
  const registryName = api.secrets.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS;
  let registry;
  try {
    registry = JSON.parse(values[registryName]);
  } catch {
    reject("WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS");
  }
  const registryValid =
    Array.isArray(registry) &&
    registry.length &&
    registry.every(
      (r) =>
        r.principalId?.trim() &&
        Array.isArray(r.allowedTokenAudiences) &&
        r.allowedTokenAudiences.length &&
        Array.isArray(r.routeScopes) &&
        r.routeScopes.length,
    );
  const runtimePrincipal =
    registryValid &&
    registry.find((r) => r.serviceAccountEmail === plan.runtime);
  if (
    !runtimePrincipal ||
    !runtimePrincipal.allowedTokenAudiences.includes(api.transportAudience)
  )
    reject(
      "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS runtime email/audience binding",
    );
  for (const route of [
    "/api/identity/context",
    "/api/tenant/bookings",
    "/api/tenant/settlement-statements",
    "/api/partner/referral/passenger/active",
    "/api/passenger-app/me",
  ]) {
    if (
      !runtimePrincipal.routeScopes.some((pattern) =>
        checks.matchesScope(pattern, "GET", route),
      )
    )
      reject(
        `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS runtime route scope (${route})`,
      );
  }
  if (
    env.OIDC_ISSUER === "https://accounts.google.com" &&
    !env.OIDC_CLIENT_SECRET
  )
    reject(
      "PROD_OIDC_CLIENT_SECRET_SECRET (Google authorization-code exchange)",
    );
  // Partial provider credentials must not silently select an unavailable/fake
  // provider. Absence remains explicitly unavailable, as in the real module.
  for (const group of [
    [
      "PSP_MERCHANT_ID",
      "PSP_API_KEY",
      "PSP_SANDBOX",
      "PSP_TOKEN_ENCRYPTION_KEY_NAME",
      "PSP_PROVIDER",
    ],
    ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    ["LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET"],
  ]) {
    if (group.some((k) => env[k]) && !group.every((k) => env[k]))
      reject(`partial ${group.join("/")}`);
  }
  let runtime;
  try {
    runtime = checks.payment(env);
  } catch {
    reject("PSP_PROVIDER/PSP_SANDBOX payment startup contract");
  }
  for (const [control, check] of [
    [
      "PAX_PAYMENT_CAPTURE_ENABLED/PAX_PAYMENT_CAPTURE_POLICY/available PSP adapter",
      () => checks.capture(env, runtime),
    ],
    ["PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT", () => checks.expiry(env)],
    [
      "PASSENGER_OTP_IP_HOURLY_LIMIT/PASSENGER_OTP_TRUSTED_PROXY_HOPS",
      () => checks.otp(env),
    ],
    [
      "REMOTE_SMTP_HOST/PORT/USERNAME/PASSWORD/FROM_EMAIL",
      () => checks.mail(env),
    ],
  ]) {
    try {
      check();
    } catch {
      reject(control);
    }
  }
  for (const s of plan.services)
    for (const [key, ref] of Object.entries(s.secrets)) {
      if (!values[ref]?.trim()) reject(`Secret Manager ${ref} (${key})`);
      if (
        /SECRET$|PEPPER$/.test(key) &&
        key !== "BANK_IAP_JWT_SECRET" &&
        (values[ref].length < 32 || checks.weakSecret(values[ref]))
      )
        reject(`Secret Manager ${ref} minimum length`);
    }
  const bank = plan.services.find((s) => s.id === "bank-console-web");
  try {
    const iapKey = createPublicKey(values[bank.secrets.BANK_IAP_JWT_SECRET]);
    if (
      iapKey.asymmetricKeyType !== "ec" ||
      iapKey.asymmetricKeyDetails.namedCurve !== "prime256v1"
    )
      reject("bank Google IAP ES256 verification key");
    const config = {
      privateKeyPem: values[bank.secrets.BANK_ARTIFACT_SIGNING_PRIVATE_KEY],
      publicKeyPem: values[bank.secrets.BANK_ARTIFACT_SIGNING_PUBLIC_KEY],
      keyId: values[bank.secrets.BANK_ARTIFACT_SIGNING_KEY_ID],
    };
    const result = checks.bankSign(
      "production-release-rail-key-pair-probe",
      config,
    );
    if (
      result.status !== "SIGNED" ||
      !verifySignature(
        "sha256",
        Buffer.from("production-release-rail-key-pair-probe"),
        { key: config.publicKeyPem, padding: constants.RSA_PKCS1_PADDING },
        Buffer.from(result.signature, "base64"),
      )
    )
      reject("bank artifact signing key pair");
  } catch {
    reject("bank IAP/artifact signing configuration");
  }
}
function validateArtifactRuntime(env, checks = validators()) {
  let document, storage, scanner;
  try {
    document = checks.document(env);
  } catch {
    reject("PROD_DOCUMENT_ARTIFACT_ storage factory configuration");
  }
  try {
    storage = checks.proofStorage(env);
  } catch {
    reject("PROD_REMITTANCE_PROOF_ storage factory configuration");
  }
  try {
    scanner = checks.proofScanner(storage, env);
  } catch {
    reject("PROD_REMITTANCE_PROOF_ scanner factory configuration");
  }
  // These availability reports describe configured adapters only. They do not
  // prove live bucket IAM, bytes, scanner health or C125 legal-role acceptance.
  if (
    ![
      "GcsDocumentArtifactStoreAdapter",
      "S3DocumentArtifactStoreAdapter",
    ].includes(document.constructor.name)
  )
    reject(
      "PROD_DOCUMENT_ARTIFACT_STORAGE_PROVIDER durable adapter unavailable",
    );
  if (storage.availability().state !== "available")
    reject(
      "PROD_REMITTANCE_PROOF_STORAGE_PROVIDER durable adapter unavailable",
    );
  if (
    scanner.availability().state !== "available" ||
    !["clamd-instream", "cloud-run-clamd"].includes(scanner.providerName)
  )
    reject(
      "PROD_REMITTANCE_PROOF_SCANNER_PROVIDER real scanner adapter unavailable",
    );
  return { document, storage, scanner };
}
function validateSmokeHeaders(plan, raw) {
  let headers;
  try {
    headers = JSON.parse(raw);
  } catch {
    reject("release-smoke-headers JSON");
  }
  if (!headers || typeof headers !== "object" || Array.isArray(headers))
    reject("release-smoke-headers JSON");
  for (const s of plan.services) {
    const entry = headers[s.id];
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !Object.keys(entry).length
    )
      reject(`release-smoke-headers.${s.id}`);
    for (const [key, value] of Object.entries(entry)) {
      if (
        (s.publicEntry && key.toLowerCase() !== "cookie") ||
        !["cookie", "x-drts-authorization", "x-drts-google-id-token"].includes(
          key.toLowerCase(),
        ) ||
        typeof value !== "string" ||
        !value.trim() ||
        /[\r\n]/.test(value)
      )
        reject(`release-smoke-headers.${s.id} header`);
    }
  }
  return headers;
}
function preflight(vars, sha, tag, deployer, cloud) {
  const plan = buildPlan(vars, sha, tag, deployer);
  plan.publicEntryPolicies = checkPublicEntryPolicies(
    plan,
    cloud.publicEntryRead,
  );
  cloud.checkActAs(plan.runtime, plan.project);
  const names = [
    ...new Set([
      ...plan.services.flatMap((s) => Object.values(s.secrets)),
      plan.smokeSecret,
    ]),
  ];
  const values = {},
    versions = {};
  // Complete resolution/validation happens before publishing the plan or any
  // build/migration/deployment. Nothing from values enters the plan/logs.
  for (const name of names) {
    const resolved = cloud.readSecret(name, plan.project);
    if (!/^[1-9][0-9]*$/.test(resolved.version) || !resolved.value)
      reject(`Secret Manager ${name} enabled version`);
    values[`${name}:${resolved.version}`] = resolved.value;
    versions[name] = resolved.version;
  }
  for (const s of plan.services)
    s.secrets = Object.fromEntries(
      Object.entries(s.secrets).map(([key, name]) => [
        key,
        `${name}:${versions[name]}`,
      ]),
    );
  plan.smokeSecret = `${plan.smokeSecret}:${versions[plan.smokeSecret]}`;
  validateRuntime(plan, values);
  validateSmokeHeaders(plan, values[plan.smokeSecret]);
  if (apiMapBackend(plan) === "google") cloud.checkMap(plan, values);
  return plan;
}
function apiMapBackend(plan) {
  return plan.services[0].env.MAP_PROVIDER_BACKEND;
}
function gcloud(args, control) {
  try {
    return execFileSync("gcloud", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    reject(control);
  } // Never echo SDK stderr or secret payloads.
}
const cloud = {
  publicEntryRead(args) {
    return gcloud(
      args,
      "F-PUBLIC-ENTRY external IAM/OAuth policy evidence unavailable",
    );
  },
  checkMap(plan, values) {
    const api = plan.services[0],
      ops = plan.services.find((s) => s.id === "ops-console-web");
    try {
      execFileSync(
        "node",
        ["operations/verification/verify-google-map-provider-live.mjs"],
        {
          env: {
            ...process.env,
            GOOGLE_MAPS_GEOCODING_API_KEY:
              values[api.secrets.GOOGLE_MAPS_GEOCODING_API_KEY],
            GOOGLE_MAPS_ROUTES_API_KEY:
              values[api.secrets.GOOGLE_MAPS_ROUTES_API_KEY],
            GOOGLE_MAPS_BROWSER_KEY:
              values[ops.secrets.GOOGLE_MAPS_BROWSER_KEY],
            MAP_PROVIDER_SMOKE_ORIGIN: ops.origin,
          },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60000,
        },
      );
    } catch {
      reject("Google Maps live provider gate");
    }
  },
  checkActAs(runtime, project) {
    const permissions = gcloud(
      [
        "iam",
        "service-accounts",
        "test-iam-permissions",
        runtime,
        "--project",
        project,
        "--permissions",
        "iam.serviceAccounts.actAs",
        "--format=json",
      ],
      "runtime iam.serviceAccounts.actAs",
    );
    if (
      !JSON.parse(permissions).permissions?.includes(
        "iam.serviceAccounts.actAs",
      )
    )
      reject("runtime iam.serviceAccounts.actAs");
  },
  readSecret(name, project) {
    const metadata = JSON.parse(
      gcloud(
        [
          "secrets",
          "versions",
          "describe",
          "latest",
          "--secret",
          name,
          "--project",
          project,
          "--format=json",
        ],
        `Secret Manager ${name}`,
      ),
    );
    if (metadata.state !== "ENABLED")
      reject(`Secret Manager ${name} enabled version`);
    const version = metadata.name.split("/").pop();
    return {
      version,
      value: gcloud(
        [
          "secrets",
          "versions",
          "access",
          version,
          "--secret",
          name,
          "--project",
          project,
        ],
        `Secret Manager ${name} access`,
      ),
    };
  },
};
if (require.main === module) {
  try {
    const plan = preflight(
      JSON.parse(process.env.PROD_VARIABLES_JSON),
      process.env.SOURCE_SHA,
      process.env.RELEASE_TAG,
      process.env.DEPLOYER_SERVICE_ACCOUNT,
      cloud,
    );
    // This checked reference is the existing workflow registry gate; the plan
    // uses its resolved numeric version, never the mutable latest alias.
    const expected =
      plan.services[0].secrets.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS.split(
        ":",
      )[0];
    if (
      process.env.GOOGLE_REGISTRY_REFERENCE !==
      `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS=${expected}:latest`
    )
      reject("Google registry mount reference");
    fs.writeFileSync("production-plan.json", JSON.stringify(plan, null, 2));
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `matrix=${JSON.stringify({ include: plan.builds })}\nregistry=${plan.registry}\nregistry_host=${plan.registry.split("/")[0]}\n`,
    );
  } catch (error) {
    console.error(
      error.message.startsWith("Missing or invalid production configuration:")
        ? error.message
        : "Production preflight failed; secret values withheld.",
    );
    process.exitCode = 1;
  }
}
module.exports = {
  validators,
  validateRuntime,
  validateArtifactRuntime,
  validateSmokeHeaders,
  preflight,
};
