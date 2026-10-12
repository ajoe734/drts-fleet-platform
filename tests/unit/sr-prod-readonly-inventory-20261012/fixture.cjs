/* eslint-disable @typescript-eslint/no-require-imports -- pure CommonJS boundary fixture */
const {
  TOPOLOGY,
} = require("../../../operations/verification/production-release-rail/rail.cjs");
const {
  TARGET,
  inventory,
} = require("../../../operations/verification/production-readonly-inventory/collector.cjs");
const SHA = "a".repeat(40),
  PRODUCT = "b".repeat(40),
  SENTINEL = "SECRET_SENTINEL_DO_NOT_STORE";
function fixture(overrides = {}, collector = { TARGET, inventory }) {
  const env = {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    INVENTORY_ENVIRONMENT: "production",
    GITHUB_REF: "refs/heads/release/v2026.10.12.0",
    GITHUB_SHA: SHA,
    DEFINITION_SHA: SHA,
    EXPECTED_PRODUCT_SHA: PRODUCT,
    GITHUB_RUN_ID: "1234",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_REPOSITORY: "ajoe734/drts-fleet-platform",
    PROD_GCP_PROJECT_ID: TARGET.project,
    PROD_GCP_REGION: TARGET.region,
    PROD_GCP_CLOUDSQL_INSTANCE: TARGET.cloudsql,
    PROD_GCP_RUNTIME_SERVICE_ACCOUNT: TARGET.runtime,
    PROD_DEPLOYER_IDENTITY: `drts-prod-deploy@${TARGET.project}.iam.gserviceaccount.com`,
    PROD_GCP_MIGRATION_JOB: "drts-prod-migrate",
    PROD_MAP_PROVIDER_BACKEND: "google",
    PROD_DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "s3",
    PROD_REMITTANCE_PROOF_STORAGE_PROVIDER: "gcs",
    PROD_DOCUMENT_ARTIFACT_S3_ACCESS_KEY_ID_SECRET: "drts-prod-doc-s3-id",
    PROD_DOCUMENT_ARTIFACT_S3_SECRET_ACCESS_KEY_SECRET:
      "drts-prod-doc-s3-secret",
    PROD_GOOGLE_OAUTH_CLIENT_SECRET_SECRET:
      "drts-prod-google-oauth-client-secret",
    PROD_PUBLIC_ENTRY_CONFIG_JSON: JSON.stringify({
      "referral-embed-web": { backendService: "drts-prod-referral-lb" },
      "passenger-app-web": {
        backendService: "drts-prod-passenger-lb",
        expectedProviders: ["google"],
      },
    }),
  };
  for (const [id, key] of TOPOLOGY)
    env[`PROD_GCP_${key}_SERVICE`] = `prod-${id}`;
  Object.assign(env, overrides);
  const plan = collector.inventory(env),
    responses = new Map();
  const image = (id) => `${plan.registry}/${id}@sha256:${"c".repeat(64)}`;
  const neg = (id) => `prod-${id}-neg`;
  for (const op of plan.operations) {
    const path = new URL(op.url).pathname;
    let body;
    if (op.kind === "project")
      body = {
        name: "projects/123456789",
        projectId: TARGET.project,
        state: "ACTIVE",
      };
    if (op.kind === "sql")
      body = {
        name: "drts-prod-db",
        region: TARGET.region,
        state: "RUNNABLE",
        settings: {
          backupConfiguration: {
            enabled: true,
            pointInTimeRecoveryEnabled: true,
            transactionLogRetentionDays: 7,
            backupRetentionSettings: {
              retainedBackups: 7,
              retentionUnit: "COUNT",
            },
          },
        },
      };
    if (op.kind === "service") {
      const name = path.slice(4),
        revision = `${name}/revisions/prod-${op.id}-00001`;
      body = {
        name,
        ingress: "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
        latestReadyRevision: revision,
        latestCreatedRevision: revision,
        trafficStatuses: [{ revision, percent: 100 }],
        template: {
          containers: [{ image: image(op.id) }],
          serviceAccount: TARGET.runtime,
        },
      };
      responses.set(`/v2/${revision}`, {
        status: 200,
        body: {
          name: revision,
          containers: [{ image: image(op.id) }],
          serviceAccount: TARGET.runtime,
        },
      });
    }
    if (op.kind === "job")
      body = {
        name: path.slice(4),
        template: {
          template: {
            containers: [{ image: image("migrate") }],
            serviceAccount: TARGET.runtime,
          },
        },
      };
    if (op.kind === "repository")
      body = { name: path.slice(4), format: "DOCKER" };
    if (op.kind === "images")
      body = {
        dockerImages: [...TOPOLOGY.map(([id]) => id), "migrate"].map((id) => ({
          uri: image(id),
        })),
      };
    if (op.kind === "versions")
      body = {
        versions: [
          {
            name: `projects/${TARGET.project}/secrets/${op.id}/versions/1`,
            state: "ENABLED",
          },
        ],
      };
    if (op.kind === "backends")
      body = {
        items: TOPOLOGY.map(([id]) => ({
          name:
            id === "referral-embed-web"
              ? "drts-prod-referral-lb"
              : id === "passenger-app-web"
                ? "drts-prod-passenger-lb"
                : `prod-${id}-lb`,
          iap: {
            enabled: true,
            oauth2ClientId: "123456789-client.apps.googleusercontent.com",
          },
          backends: [
            {
              group: `https://www.googleapis.com/compute/v1/projects/${TARGET.project}/regions/${TARGET.region}/networkEndpointGroups/${neg(id)}`,
            },
          ],
        })),
      };
    if (op.kind === "negs")
      body = {
        items: TOPOLOGY.map(([id]) => ({
          name: neg(id),
          networkEndpointType: "SERVERLESS",
          cloudRun: { service: `prod-${id}` },
        })),
      };
    if (op.kind === "account")
      body = { uniqueId: "1234567890123456789", disabled: false };
    if (op.kind === "policy")
      body = {
        bindings: [
          {
            role: "roles/run.invoker",
            members: [
              `serviceAccount:${env.PROD_DEPLOYER_IDENTITY}`,
              `user:${SENTINEL}@example.invalid`,
            ],
          },
        ],
      };
    responses.set(path, { status: 200, body });
  }
  const calls = [];
  const transport = async (descriptor) => {
    calls.push(descriptor);
    const response = responses.get(new URL(descriptor.url).pathname);
    if (!response) throw new Error("missing fixture");
    return structuredClone(response);
  };
  return { env, plan, responses, calls, transport };
}
module.exports = { fixture, SHA, PRODUCT, SENTINEL };
