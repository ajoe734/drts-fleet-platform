/* eslint-disable @typescript-eslint/no-require-imports -- executable CommonJS deployment rail */
const { publicEntryConfig } = require("./public-entry.cjs");
const { artifactConfig } = require("./artifact-config.cjs");
// This is the configuration/argument builder used by deploy-prod.yml.
// It performs no cloud calls. Plans contain names and pinned versions, never values.
const TOPOLOGY = [
  ["api", "API", 3001, "/api/identity/context"],
  [
    "platform-admin-web",
    "PLATFORM_ADMIN",
    3002,
    "/control-plane-proxy/identity/context",
  ],
  [
    "ops-console-web",
    "OPS_CONSOLE",
    3003,
    "/control-plane-proxy/identity/context",
  ],
  [
    "fleet-partner-portal-web",
    "FLEET_PARTNER_PORTAL",
    3007,
    "/control-plane-proxy/identity/context",
  ],
  [
    "tenant-console-web",
    "TENANT_CONSOLE",
    3004,
    "/control-plane-proxy/identity/context",
  ],
  ["bank-console-web", "BANK_CONSOLE", 3008, "/api/statements/"],
  ["referral-embed-web", "REFERRAL_EMBED", 3014, "/api/referral/active"],
  [
    "enterprise-dispatch-web",
    "ENTERPRISE_DISPATCH",
    3010,
    "/control-plane-proxy/tenant/bookings",
  ],
  [
    "channel-partner-portal-web",
    "CHANNEL_PARTNER_PORTAL",
    3013,
    "/control-plane-proxy/identity/context",
  ],
  ["passenger-app-web", "PASSENGER_APP", 3009, "/api/passenger-app/me"],
];
const AUTH_FIELDS = [
  "AUTH_MODE",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "JWT_ALGORITHMS",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_TOKEN_ENDPOINT",
  "OIDC_AUTHORIZATION_ENDPOINT",
  "WORKLOAD_IDENTITY_ISSUER",
  "WORKLOAD_IDENTITY_AUDIENCE",
  "WORKLOAD_IDENTITY_JWT_ALGORITHMS",
];
const OPTIONAL_API_FIELDS = [
  "TENANT_OIDC_ISSUER",
  "TENANT_OIDC_AUDIENCE",
  "OIDC_JWKS_URI",
  "OIDC_USERINFO_ENDPOINT",
  "PSP_PROVIDER",
  "PSP_MERCHANT_ID",
  "PSP_SANDBOX",
  "PAX_PAYMENT_CAPTURE_ENABLED",
  "PAX_PAYMENT_CAPTURE_POLICY",
  "PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT",
  "PASSENGER_OTP_IP_HOURLY_LIMIT",
  "PASSENGER_OTP_TRUSTED_PROXY_HOPS",
  "NOTIFICATION_FROM_EMAIL",
  "REMOTE_SMTP_HOST",
  "REMOTE_SMTP_PORT",
  "REMOTE_SMTP_FROM_EMAIL",
  "REMOTE_SMTP_RECIPIENT_ALLOWLIST",
  "NOTIFICATION_OUTBOX_TYPE",
  "OAUTH_REDIRECT_ALLOWLIST",
  "FACEBOOK_APP_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "LINE_CHANNEL_ID",
  "FACEBOOK_DATA_DELETION_STATUS_ORIGIN",
  "AUTH_REQUIRE_ORDINARY_LOGIN_MFA",
];
const API_SECRETS = {
  DATABASE_URL: "db-url",
  API_KEY_SALT: "api-key-salt",
  JWT_SECRET: "jwt-secret",
  COOKIE_SECRET: "cookie-secret",
  CSRF_SECRET: "csrf-secret",
  CONTROLLED_DOWNLOAD_SIGNING_SECRET: "controlled-download-signing-secret",
  PASSENGER_SUBJECT_PEPPER: "passenger-subject-pepper",
  PASSENGER_RIDE_TOKEN_PEPPER: "passenger-ride-token-pepper",
  WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY:
    "workload-identity-jwt-public-key",
  WORKLOAD_IDENTITY_SERVICE_PRINCIPALS: "workload-identity-service-principals",
  WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS:
    "workload-identity-google-service-principals",
};
const OPTIONAL_SECRET_FIELDS = [
  "TENANT_OIDC_JWT_PUBLIC_KEY",
  "OIDC_CLIENT_SECRET",
  "PASSENGER_OTP_PEPPER",
  "PSP_API_KEY",
  "PSP_TOKEN_ENCRYPTION_KEY_NAME",
  "REMOTE_SMTP_USERNAME",
  "REMOTE_SMTP_PASSWORD",
  "FACEBOOK_APP_SECRET",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "LINE_CHANNEL_SECRET",
];
function reject(name) {
  throw new Error(`Missing or invalid production configuration: ${name}`);
}
function https(value, name, originOnly = false) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      /localhost|127\.0\.0\.1|placeholder|example\.com/.test(u.hostname) ||
      (originOnly && u.origin !== value)
    )
      reject(name);
    return value;
  } catch {
    reject(name);
  }
}
function json(value, name) {
  try {
    return JSON.parse(value);
  } catch {
    reject(name);
  }
}
function buildPlan(vars, sha, tag, deployer) {
  if (!/^[a-f0-9]{40}$/.test(sha)) reject("source SHA");
  if (!/^prod\/v\d{4}\.\d{2}\.\d{2}\.\d+$/.test(tag)) reject("prod/v tag");
  for (const key of [
    "PROD_PRODUCT_WEB_ALLOW_UNAUTHENTICATED",
    "PROD_ALLOW_INSECURE_DEV_AUTH",
    "PROD_DRTS_DEV_MFA_WAIVED",
    "PROD_OIDC_MOCK_MODE",
    "PROD_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED",
    "PROD_BANK_CONSOLE_DEMO_LOGIN",
    "PROD_REFERRAL_EMBED_DEMO",
  ])
    if (vars[key] && vars[key] !== "false") reject(key);
  const need = (key) => {
    const value = vars[key]?.trim();
    if (
      !value ||
      value.includes("\0") ||
      (!key.endsWith("_JSON") && /[\r\n]/.test(value))
    )
      reject(key);
    return value;
  };
  const project = need("PROD_GCP_PROJECT_ID"),
    region = need("PROD_GCP_REGION");
  const runtime = need("PROD_GCP_RUNTIME_SERVICE_ACCOUNT");
  if (
    !deployer ||
    deployer === runtime ||
    !runtime.endsWith(`@${project}.iam.gserviceaccount.com`)
  )
    reject("separate runtime/deployer identities");
  if (
    !/^[a-z][a-z0-9-]{4,62}$/.test(project) ||
    !/^[a-z]+-[a-z]+[0-9]$/.test(region)
  )
    reject("PROD_GCP_PROJECT_ID/PROD_GCP_REGION");
  const registry =
    vars.PROD_ARTIFACT_REGISTRY ||
    `${vars.PROD_ARTIFACT_REGION || region}-docker.pkg.dev/${vars.PROD_ARTIFACT_PROJECT_ID || project}/${vars.PROD_ARTIFACT_REPOSITORY || "drts"}`;
  if (!/^[a-z0-9-]+-docker\.pkg\.dev\/[a-z0-9-]+\/[a-z0-9_-]+$/.test(registry))
    reject("PROD_ARTIFACT_REGISTRY");
  const cloudsql = need("PROD_GCP_CLOUDSQL_INSTANCE");
  if (
    !cloudsql.startsWith(`${project}:${region}:`) ||
    cloudsql.split(":").length !== 3
  )
    reject("PROD_GCP_CLOUDSQL_INSTANCE");
  const prefix = vars.PROD_SECRET_PREFIX || "drts-prod";
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) reject("PROD_SECRET_PREFIX");
  const apiOrigin = https(
    need("PROD_CONTROL_PLANE_API_ORIGIN"),
    "PROD_CONTROL_PLANE_API_ORIGIN",
    true,
  );
  const audience = need("PROD_IAP_CLIENT_ID");
  const assertionAudience = need("PROD_IAP_EXPECTED_AUDIENCE");
  if (assertionAudience === audience || assertionAudience === "*")
    reject(
      "PROD_IAP_EXPECTED_AUDIENCE (IAP assertion resource audience, separate from OAuth client ID)",
    );
  if (audience === "*" || /\s/.test(audience)) reject("PROD_IAP_CLIENT_ID");
  const apiEnv = {
    NODE_ENV: "production",
    APP_ENV: "production",
    DRTS_ENV: "production",
    API_PORT: "3001",
    DRTS_CANDIDATE_SHA: sha,
    SESSION_STORE_TYPE: "durable",
    AUDIT_STORE_TYPE: "durable",
    OIDC_ENABLED: "true",
    OIDC_MOCK_MODE: "false",
    STRICT_IAP_MODE: "true",
    IAP_EXPECTED_AUDIENCE: assertionAudience,
    IAP_EXPECTED_ISSUER: "https://cloud.google.com/iap",
  };
  for (const field of AUTH_FIELDS) apiEnv[field] = need(`PROD_${field}`);
  for (const field of [
    "JWT_ISSUER",
    "OIDC_ISSUER",
    "OIDC_TOKEN_ENDPOINT",
    "OIDC_AUTHORIZATION_ENDPOINT",
    "WORKLOAD_IDENTITY_ISSUER",
  ])
    https(apiEnv[field], `PROD_${field}`);
  for (const field of ["JWT_AUDIENCE", "WORKLOAD_IDENTITY_AUDIENCE"])
    if (["*", "all"].includes(apiEnv[field].toLowerCase()))
      reject(`PROD_${field}`);
  if (apiEnv.AUTH_MODE !== "production") reject("PROD_AUTH_MODE");
  // Current web authorities use the shared JWT_SECRET contract. Do not silently
  // select a different signing family that these callers cannot verify.
  if (apiEnv.JWT_ALGORITHMS !== "HS256")
    reject("PROD_JWT_ALGORITHMS (supported rail: HS256)");
  for (const field of OPTIONAL_API_FIELDS)
    if (vars[`PROD_${field}`]) apiEnv[field] = vars[`PROD_${field}`];
  const secretNames = Object.fromEntries(
    Object.entries(API_SECRETS).map(([key, suffix]) => [
      key,
      `${prefix}-${suffix}`,
    ]),
  );
  for (const field of OPTIONAL_SECRET_FIELDS)
    if (vars[`PROD_${field}_SECRET`]) {
      const name = vars[`PROD_${field}_SECRET`];
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) reject(`PROD_${field}_SECRET`);
      secretNames[field] = name;
    }
  artifactConfig(vars, apiEnv, secretNames, need, reject, https);
  const backend = need("PROD_MAP_PROVIDER_BACKEND");
  if (!["mock", "google"].includes(backend))
    reject("PROD_MAP_PROVIDER_BACKEND");
  Object.assign(apiEnv, {
    MAP_PROVIDER_BACKEND: backend,
    MAP_PROVIDER_MODE: backend === "google" ? "external" : "mock",
    MAP_PROVIDER_NAME: backend === "google" ? "google" : "mock",
  });
  if (backend === "google") {
    for (const field of [
      "MAP_PROVIDER_ALLOWED_ORIGINS",
      "MAP_PROVIDER_MONTHLY_BUDGET_USD",
      "MAP_PROVIDER_BUDGET_ALERT_PCT",
    ])
      apiEnv[field] = need(`PROD_${field}`);
    if (
      !apiEnv.MAP_PROVIDER_BUDGET_ALERT_PCT.split(";").every(
        (v) => Number(v) > 0 && Number(v) <= 100,
      )
    )
      reject("PROD_MAP_PROVIDER_BUDGET_ALERT_PCT");
    if (!(Number(apiEnv.MAP_PROVIDER_MONTHLY_BUDGET_USD) > 0))
      reject("PROD_MAP_PROVIDER_MONTHLY_BUDGET_USD");
    for (const o of apiEnv.MAP_PROVIDER_ALLOWED_ORIGINS.split(/[;,]/))
      https(o, "PROD_MAP_PROVIDER_ALLOWED_ORIGINS", true);
    Object.assign(secretNames, {
      GOOGLE_MAPS_GEOCODING_API_KEY: `${prefix}-google-maps-geocoding-api-key`,
      GOOGLE_MAPS_ROUTES_API_KEY: `${prefix}-google-maps-routes-api-key`,
    });
  } else {
    const tile = need("PROD_MAP_TILE_URL_TEMPLATE");
    if (
      !tile.startsWith("https://") ||
      !["{x}", "{y}", "{z}"].every((t) => tile.includes(t))
    )
      reject("PROD_MAP_TILE_URL_TEMPLATE");
  }
  const smoke = json(
    need("PROD_RELEASE_SMOKE_CONFIG_JSON"),
    "PROD_RELEASE_SMOKE_CONFIG_JSON",
  );
  if (!smoke || typeof smoke !== "object" || Array.isArray(smoke))
    reject("PROD_RELEASE_SMOKE_CONFIG_JSON");
  const publicEntries = publicEntryConfig(vars.PROD_PUBLIC_ENTRY_CONFIG_JSON);
  for (const provider of publicEntries["passenger-app-web"].expectedProviders) {
    const fields = {
      google: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET_SECRET"],
      facebook: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET_SECRET"],
      line: ["LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET_SECRET"],
      email: [
        "PASSENGER_OTP_PEPPER_SECRET",
        "NOTIFICATION_FROM_EMAIL",
        "REMOTE_SMTP_HOST",
        "REMOTE_SMTP_USERNAME_SECRET",
        "REMOTE_SMTP_PASSWORD_SECRET",
        "NOTIFICATION_OUTBOX_TYPE",
      ],
      phone: ["PASSENGER_OTP_PEPPER_SECRET"],
    }[provider];
    for (const field of fields) need(`PROD_${field}`);
    if (
      provider === "email" &&
      vars.PROD_NOTIFICATION_OUTBOX_TYPE !== "postgres"
    )
      reject(
        "F-PUBLIC-ENTRY deployment blocker: PROD_NOTIFICATION_OUTBOX_TYPE=postgres required for production email OTP delivery",
      );
    if (["google", "facebook", "line"].includes(provider)) {
      const callback = `${need("PROD_PASSENGER_APP_ORIGIN")}/auth/callback/${provider}`;
      if (
        !need("PROD_OAUTH_REDIRECT_ALLOWLIST")
          .split(",")
          .map((v) => v.trim())
          .includes(callback)
      )
        reject(
          `F-PUBLIC-ENTRY deployment blocker: PROD_OAUTH_REDIRECT_ALLOWLIST (${provider} passenger callback)`,
        );
    }
  }
  const services = TOPOLOGY.map(([id, key, port, route]) => {
    const name = need(`PROD_GCP_${key}_SERVICE`);
    if (
      !/^[a-z][a-z0-9-]{0,62}$/.test(name) ||
      /partner-booking|passenger-web|concierge|assisted-entry/.test(name)
    )
      reject(`PROD_GCP_${key}_SERVICE`);
    const origin =
      id === "api"
        ? apiOrigin
        : https(need(`PROD_${key}_ORIGIN`), `PROD_${key}_ORIGIN`, true);
    const publicEntry = publicEntries[id];
    const transportAudience = publicEntry
      ? null
      : id === "api"
        ? audience
        : need(`PROD_${key}_IAP_CLIENT_ID`);
    if (
      !publicEntry &&
      (transportAudience === "*" || /\s/.test(transportAudience))
    )
      reject(`PROD_${key}_IAP_CLIENT_ID`);
    const exposure = vars[`PROD_${key}_ALLOW_UNAUTHENTICATED`] || "false";
    if (exposure !== "false")
      reject(
        `PROD_${key}_ALLOW_UNAUTHENTICATED (private backend; public entry requires verified LB policy)`,
      );
    const probe = smoke[id];
    if (
      !probe ||
      typeof probe.path !== "string" ||
      (id === "bank-console-web"
        ? !/^\/api\/statements\/[0-9]{4}-[0-9]{2}\/export$/.test(probe.path)
        : probe.path !== route) ||
      !probe.expect ||
      typeof probe.expect !== "object" ||
      Array.isArray(probe.expect) ||
      !Object.keys(probe.expect).length ||
      Object.values(probe.expect).some(
        (v) => !["string", "number", "boolean"].includes(typeof v),
      )
    )
      reject(`PROD_RELEASE_SMOKE_CONFIG_JSON.${id}`);
    if (
      id === "bank-console-web" &&
      (typeof probe.expect.Period !== "string" ||
        typeof probe.expect.StatementNo !== "string" ||
        probe.path !== `/api/statements/${probe.expect.Period}/export` ||
        Object.keys(probe.expect).length !== 2)
    )
      reject("PROD_RELEASE_SMOKE_CONFIG_JSON.bank-console-web CSV fixture");
    if (
      route.endsWith("identity/context") &&
      (typeof probe.expect["data.principalId"] !== "string" ||
        !probe.expect["data.principalId"].trim() ||
        probe.expect["data.authMode"] !== "jwt_bearer")
    )
      reject(
        `PROD_RELEASE_SMOKE_CONFIG_JSON.${id} authenticated principal predicate`,
      );
    let env = {
      NODE_ENV: "production",
      DRTS_ENV: "production",
      DRTS_CANDIDATE_SHA: sha,
      JWT_ISSUER: apiEnv.JWT_ISSUER,
      JWT_AUDIENCE: apiEnv.JWT_AUDIENCE,
      DRTS_API_URL: apiOrigin,
      DRTS_API_AUTH_AUDIENCE: audience,
      NEXT_PUBLIC_API_URL: "/control-plane-proxy",
    };
    let secrets = { JWT_SECRET: `${prefix}-jwt-secret` };
    if (id === "api") {
      env = apiEnv;
      secrets = secretNames;
    }
    if (["tenant-console-web", "enterprise-dispatch-web"].includes(id))
      secrets.BFF_STATE_SECRET = `${prefix}-bff-state-secret`;
    if (id === "tenant-console-web")
      Object.assign(env, {
        NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN: need("PROD_PLATFORM_ADMIN_ORIGIN"),
        NEXT_PUBLIC_OPS_CONSOLE_ORIGIN: need("PROD_OPS_CONSOLE_ORIGIN"),
      });
    if (id === "fleet-partner-portal-web")
      env.DRTS_FLEET_PARTNER_ID = need("PROD_DRTS_FLEET_PARTNER_ID");
    if (id === "channel-partner-portal-web") {
      for (const field of [
        "DRTS_PARTNER_ID",
        "DRTS_TENANT_ID",
        "DRTS_PARTNER_PROGRAM_ID",
        "DRTS_PARTNER_ENTRY_SLUG",
      ])
        env[field] = need(`PROD_${field}`);
      if (
        env.DRTS_PARTNER_ID === "partner-referral-demo-001" ||
        env.DRTS_PARTNER_ENTRY_SLUG === "referral-demo-community"
      )
        reject("production channel partner identity");
    }
    if (id === "enterprise-dispatch-web") {
      env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID = need(
        "PROD_DRTS_ENTERPRISE_DISPATCH_TENANT_ID",
      );
      env.DRTS_ENTERPRISE_DISPATCH_ACTOR_ID = need(
        "PROD_DRTS_ENTERPRISE_DISPATCH_ACTOR_ID",
      );
    }
    if (id === "bank-console-web") {
      Object.assign(secrets, {
        BANK_SESSION_SECRET: `${prefix}-bank-session-secret`,
        BANK_IAP_JWT_SECRET: `${prefix}-bank-iap-jwt-public-key`,
        BANK_ARTIFACT_SIGNING_PRIVATE_KEY: `${prefix}-bank-artifact-signing-private-key`,
        BANK_ARTIFACT_SIGNING_PUBLIC_KEY: `${prefix}-bank-artifact-signing-public-key`,
        BANK_ARTIFACT_SIGNING_KEY_ID: `${prefix}-bank-artifact-signing-key-id`,
      });
      Object.assign(env, {
        BANK_IAP_AUDIENCE: need("PROD_BANK_IAP_AUDIENCE"),
        BANK_IAP_ISSUER: "https://cloud.google.com/iap",
        BANK_CONSOLE_DEMO_LOGIN: "false",
      });
      if (
        env.BANK_IAP_AUDIENCE === transportAudience ||
        env.BANK_IAP_AUDIENCE === "*"
      )
        reject("PROD_BANK_IAP_AUDIENCE (IAP assertion resource audience)");
    }
    if (id === "referral-embed-web") {
      secrets.REFERRAL_EMBED_SESSION_SECRET = `${prefix}-referral-embed-session-secret`;
      env.REFERRAL_EMBED_ALLOWED_HOSTS = need(
        "PROD_REFERRAL_EMBED_ALLOWED_HOSTS",
      );
      if (
        !env.REFERRAL_EMBED_ALLOWED_HOSTS.split(/\s+/).every(
          (h) => /^[a-z0-9.-]+$/.test(h) && !h.includes("*"),
        )
      )
        reject("PROD_REFERRAL_EMBED_ALLOWED_HOSTS");
      if (
        !env.REFERRAL_EMBED_ALLOWED_HOSTS.split(/\s+/).includes(
          publicEntry.entryHost,
        )
      )
        reject(
          "PROD_PUBLIC_ENTRY_CONFIG_JSON.referral-embed-web.entryHost allowlist",
        );
      env.REFERRAL_EMBED_DEMO = "false";
    }
    if (id === "ops-console-web") {
      Object.assign(env, {
        MAP_PROVIDER_MODE: apiEnv.MAP_PROVIDER_MODE,
        MAP_PROVIDER_NAME: apiEnv.MAP_PROVIDER_NAME,
      });
      if (backend === "google") {
        secrets.GOOGLE_MAPS_BROWSER_KEY = `${prefix}-google-maps-browser-key`;
        env.MAP_PROVIDER_ALLOWED_ORIGINS = apiEnv.MAP_PROVIDER_ALLOWED_ORIGINS;
      }
    }
    if (id === "passenger-app-web") {
      // Dedicated first-party BFF. Never inherit tenant IDs, JWT/client secrets,
      // generic proxy paths, or NEXT_PUBLIC_API_URL from the console config.
      env = {
        NODE_ENV: "production",
        DRTS_ENV: "production",
        DRTS_CANDIDATE_SHA: sha,
        DRTS_API_URL: apiOrigin,
        DRTS_API_AUTH_AUDIENCE: audience,
      };
      secrets = {};
    }
    return {
      id,
      name,
      port,
      origin,
      transportAudience,
      publicEntry,
      env,
      secrets,
      probe,
      dockerfile: `apps/${id}/Dockerfile`,
    };
  });
  if (
    new Set(services.map((s) => s.name)).size !== 10 ||
    new Set(services.map((s) => s.origin)).size !== 10
  )
    reject("unique service names/origins");
  const origins = need("PROD_AUTH_ALLOWED_ORIGINS").split(/[;,]/);
  for (const o of origins) https(o, "PROD_AUTH_ALLOWED_ORIGINS", true);
  if (
    !services
      .filter((s) => s.id !== "api")
      .every((s) => origins.includes(s.origin))
  )
    reject("PROD_AUTH_ALLOWED_ORIGINS (all active browser origins)");
  apiEnv.AUTH_ALLOWED_ORIGINS = origins.join(";");
  const migrationJob = need("PROD_GCP_MIGRATION_JOB");
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(migrationJob))
    reject("PROD_GCP_MIGRATION_JOB");
  return {
    schema: 1,
    sha,
    tag,
    project,
    region,
    registry,
    runtime,
    cloudsql,
    migrationJob,
    smokeSecret: `${prefix}-release-smoke-headers`,
    services,
    builds: [
      ...services.map((s) => ({ id: s.id, dockerfile: s.dockerfile })),
      { id: "migrate", dockerfile: "Dockerfile.migrate" },
    ],
    tile: vars.PROD_MAP_TILE_URL_TEMPLATE || "",
  };
}
function envFlag(values) {
  if (Object.values(values).some((v) => String(v).includes("~DRTS~")))
    reject("environment delimiter");
  return `^~DRTS~^${Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("~DRTS~")}`;
}
function deployArgs(plan, service, image) {
  if (
    !image.startsWith(`${plan.registry}/${service.id}@sha256:`) ||
    !/@sha256:[a-f0-9]{64}$/.test(image)
  )
    reject(`immutable image ${service.id}`);
  const mounts = Object.entries(service.secrets).map(([key, ref]) => {
    if (!/^[a-zA-Z0-9_-]+:[1-9][0-9]*$/.test(ref))
      reject(`pinned secret ${key}`);
    return `${key}=${ref}`;
  });
  return [
    "run",
    "deploy",
    service.name,
    "--project",
    plan.project,
    "--region",
    plan.region,
    "--image",
    image,
    "--port",
    String(service.port),
    "--ingress",
    "internal-and-cloud-load-balancing",
    "--service-account",
    plan.runtime,
    "--no-allow-unauthenticated",
    "--set-env-vars",
    envFlag(service.env),
    ...(mounts.length
      ? ["--set-secrets", mounts.join(",")]
      : ["--clear-secrets"]),
    ...(service.id === "api"
      ? ["--set-cloudsql-instances", plan.cloudsql]
      : []),
    "--min-instances",
    "1",
    "--max-instances",
    service.id === "api" ? "6" : "3",
    "--quiet",
  ];
}
module.exports = {
  TOPOLOGY,
  AUTH_FIELDS,
  API_SECRETS,
  buildPlan,
  deployArgs,
  reject,
};
