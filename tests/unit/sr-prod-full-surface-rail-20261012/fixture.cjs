/* eslint-disable @typescript-eslint/no-require-imports -- executable CommonJS rail and production TS loader */
const {
  TOPOLOGY,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const SHA = "6bc5f4af6afeffb327ece5f2b0ef3fe056aa5924";
const TAG = "prod/v2026.10.11.0";
const DEPLOYER = "release@drts-prod-fixture.iam.gserviceaccount.com";
const STRONG =
  "71b9c650ea43fd268ac081b52d6e09f47a31c508bd9327ef62a0491dc8530b76";
// Ephemeral cryptographic fixtures only; never uploaded or used by a workflow.
const { generateKeyPairSync } = require("node:crypto");
const rsa = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const ec = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
function fixture() {
  const vars = {
    PROD_GCP_PROJECT_ID: "drts-prod-fixture",
    PROD_GCP_REGION: "us-central1",
    PROD_GCP_RUNTIME_SERVICE_ACCOUNT:
      "runtime@drts-prod-fixture.iam.gserviceaccount.com",
    PROD_GCP_CLOUDSQL_INSTANCE: "drts-prod-fixture:us-central1:database",
    PROD_GCP_MIGRATION_JOB: "drts-prod-migrate",
    PROD_CONTROL_PLANE_API_ORIGIN: "https://api.drts.invalid",
    PROD_IAP_CLIENT_ID: "api-iap-client",
    PROD_IAP_EXPECTED_AUDIENCE:
      "/projects/123/locations/us-central1/services/api",
    PROD_BANK_IAP_AUDIENCE: "/projects/123/locations/us-central1/services/bank",
    PROD_AUTH_MODE: "production",
    PROD_JWT_ISSUER: "https://auth.drts.invalid",
    PROD_JWT_AUDIENCE: "drts-production-api",
    PROD_JWT_ALGORITHMS: "HS256",
    PROD_OIDC_ISSUER: "https://accounts.google.com",
    PROD_OIDC_CLIENT_ID: "oidc-client",
    PROD_OIDC_TOKEN_ENDPOINT: "https://oauth2.googleapis.com/token",
    PROD_OIDC_AUTHORIZATION_ENDPOINT:
      "https://accounts.google.com/o/oauth2/v2/auth",
    PROD_OIDC_CLIENT_SECRET_SECRET: "drts-prod-oidc-client-secret",
    PROD_WORKLOAD_IDENTITY_ISSUER: "https://workload.drts.invalid",
    PROD_WORKLOAD_IDENTITY_AUDIENCE: "drts-workload",
    PROD_WORKLOAD_IDENTITY_JWT_ALGORITHMS: "HS256",
    PROD_MAP_PROVIDER_BACKEND: "mock",
    PROD_MAP_TILE_URL_TEMPLATE: "https://tiles.drts.invalid/{z}/{x}/{y}.png",
    PROD_REFERRAL_EMBED_ALLOWED_HOSTS: "embed.drts.invalid",
    PROD_DRTS_FLEET_PARTNER_ID: "fleet-fixture",
    PROD_DRTS_PARTNER_ID: "partner-fixture",
    PROD_DRTS_TENANT_ID: "tenant-fixture",
    PROD_DRTS_PARTNER_PROGRAM_ID: "program-fixture",
    PROD_DRTS_PARTNER_ENTRY_SLUG: "entry-fixture",
    PROD_DRTS_ENTERPRISE_DISPATCH_TENANT_ID:
      "10000000-0000-4000-8000-000000000201",
    PROD_DRTS_ENTERPRISE_DISPATCH_ACTOR_ID: "enterprise-fixture",
  };
  const smoke = {},
    headers = {};
  for (const [id, key, , route] of TOPOLOGY) {
    vars[`PROD_GCP_${key}_SERVICE`] = `drts-prod-${id}`;
    if (id !== "api") {
      vars[`PROD_${key}_ORIGIN`] = `https://${id}.drts.invalid`;
      vars[`PROD_${key}_IAP_CLIENT_ID`] = `${id}-iap-client`;
    }
    smoke[id] = {
      path: route,
      expect: route.endsWith("identity/context")
        ? {
            "data.principalId": "principal-fixture",
            "data.authMode": "jwt_bearer",
          }
        : { "data.fixture": true },
    };
    headers[id] = { cookie: "fixture-signed-session=opaque" };
  }
  smoke["bank-console-web"] = {
    path: "/api/statements/2026-10/export",
    expect: { Period: "2026-10", StatementNo: "fixture-001" },
  };
  vars.PROD_AUTH_ALLOWED_ORIGINS = TOPOLOGY.filter(([id]) => id !== "api")
    .map(([, key]) => vars[`PROD_${key}_ORIGIN`])
    .join(";");
  vars.PROD_RELEASE_SMOKE_CONFIG_JSON = JSON.stringify(smoke);
  const values = {
    "drts-prod-bank-iap-jwt-public-key": ec.publicKey,
    "drts-prod-bank-artifact-signing-private-key": rsa.privateKey,
    "drts-prod-bank-artifact-signing-public-key": rsa.publicKey,
    "drts-prod-bank-artifact-signing-key-id": "fixture-key",
    "drts-prod-db-url":
      "postgresql://fixture:opaque@127.0.0.1/fixture-never-connected",
    "drts-prod-workload-identity-service-principals": JSON.stringify([
      {
        principalId: "runtime",
        subject: "runtime",
        issuer: vars.PROD_WORKLOAD_IDENTITY_ISSUER,
        allowedTokenAudiences: [vars.PROD_WORKLOAD_IDENTITY_AUDIENCE],
      },
    ]),
    "drts-prod-workload-identity-google-service-principals": JSON.stringify([
      {
        principalId: "runtime",
        serviceAccountEmail: vars.PROD_GCP_RUNTIME_SERVICE_ACCOUNT,
        allowedTokenAudiences: [vars.PROD_IAP_CLIENT_ID],
        routeScopes: ["GET /api/*"],
      },
    ]),
    "drts-prod-release-smoke-headers": JSON.stringify(headers),
  };
  const calls = [];
  const cloud = {
    checkActAs(runtime, project) {
      calls.push(["actAs", runtime, project]);
    },
    readSecret(name, project) {
      calls.push(["read", name, project]);
      return { version: "7", value: values[name] ?? STRONG };
    },
    checkMap() {
      calls.push(["map-provider"]);
    },
  };
  return { vars, values, cloud, calls, headers, smoke };
}
module.exports = { fixture, SHA, TAG, DEPLOYER, STRONG };
