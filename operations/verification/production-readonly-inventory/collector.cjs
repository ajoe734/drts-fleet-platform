/* eslint-disable @typescript-eslint/no-require-imports -- standalone hosted metadata collector */
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  TOPOLOGY,
  API_SECRETS,
} = require("../production-release-rail/rail.cjs");
const TARGET = Object.freeze({
  project: "drts-prod-devcc-20260825",
  region: "us-central1",
  cloudsql: "drts-prod-devcc-20260825:us-central1:drts-prod-db",
  runtime: "drts-prod-runtime@drts-prod-devcc-20260825.iam.gserviceaccount.com",
});
// Verified existing configuration is a reference only. It grants no Google
// request authority outside TARGET, including this shared repository.
const SHARED_REGISTRY = Object.freeze({
  registry: "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts",
  project: "drts-dev-devcc-20260825",
  region: "us-central1",
  repository: "drts",
});
const SHA = /^[a-f0-9]{40}$/;
const NAME = /^[a-z][a-z0-9-]{0,62}$/;
const SECRET_NAME = /^[a-zA-Z0-9_-]{1,255}$/;
const LIMITS = Object.freeze({
  pages: 5,
  pageSize: 100,
  requests: 256,
  bytes: 1048576,
  requestMs: 15000,
  collectionMs: 480000,
});
function fail(code = "MALFORMED_METADATA", diagnosis = "UNKNOWN") {
  const e = new Error(code);
  e.code = code;
  e.diagnosis = diagnosis;
  throw e;
}
function guard(env, head) {
  if (
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.INVENTORY_ENVIRONMENT !== "production"
  )
    fail("UNPROTECTED_DISPATCH");
  if (
    !/^refs\/heads\/release\/v\d{4}\.\d{2}\.\d{2}\.\d+$/.test(
      env.GITHUB_REF || "",
    )
  )
    fail("SOURCE_REF_REJECTED");
  if (
    !SHA.test(env.DEFINITION_SHA || "") ||
    env.DEFINITION_SHA !== env.GITHUB_SHA ||
    env.DEFINITION_SHA !== head
  )
    fail("DEFINITION_SHA_MISMATCH");
  if (!SHA.test(env.EXPECTED_PRODUCT_SHA || "")) fail("PRODUCT_SHA_REQUIRED");
  for (const [key, variable] of Object.entries({
    project: "PROD_GCP_PROJECT_ID",
    region: "PROD_GCP_REGION",
    cloudsql: "PROD_GCP_CLOUDSQL_INSTANCE",
    runtime: "PROD_GCP_RUNTIME_SERVICE_ACCOUNT",
  }))
    if (env[variable] !== TARGET[key]) fail("TARGET_MISMATCH");
  if (
    !/^\d{1,20}$/.test(env.GITHUB_RUN_ID || "") ||
    !/^\d{1,4}$/.test(env.GITHUB_RUN_ATTEMPT || "") ||
    env.GITHUB_REPOSITORY !== "ajoe734/drts-fleet-platform"
  )
    fail("RUN_IDENTITY_REJECTED");
  return {
    definitionSha: env.DEFINITION_SHA,
    expectedProductSha: env.EXPECTED_PRODUCT_SHA,
    ref: env.GITHUB_REF,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    repository: env.GITHUB_REPOSITORY,
    target: { ...TARGET },
  };
}
function releaseSourceGuard(
  identity,
  git = (args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim(),
) {
  try {
    const version = identity.ref.slice("refs/heads/release/".length);
    for (const ref of [
      `refs/remotes/origin/release/${version}`,
      `refs/tags/release/${version}`,
      `refs/remotes/origin/publish/${version}`,
    ]) {
      if (git(["rev-parse", `${ref}^{commit}`]) !== identity.definitionSha)
        fail("SOURCE_PROVENANCE_REJECTED");
    }
    git([
      "merge-base",
      "--is-ancestor",
      identity.definitionSha,
      "refs/remotes/origin/dev",
    ]);
  } catch {
    fail("SOURCE_PROVENANCE_REJECTED");
  }
}
function checkRail() {
  for (const [file, expected] of [
    [
      "rail.cjs",
      "65eeeaee7fcac40e5b11ed297fcce4840d2a7ff9618e2dc5e36a9da6c298b60c",
    ],
    [
      "run.cjs",
      "0eb35598d1a03e85d9852c9513da16ada767c84cce263a153b45218e62f5f276",
    ],
  ]) {
    if (
      createHash("sha256")
        .update(
          fs.readFileSync(`${__dirname}/../production-release-rail/${file}`),
        )
        .digest("hex") !== expected
    )
      fail("RAIL_LINEAGE_CHANGED");
  }
}

// A schema generates the server-side partial-response selector AND validates
// returned keys. There is no caller-supplied URL, method, selector or operation.
const str = (regex) => (v) =>
  typeof v === "string" && v.length <= 1024 && regex.test(v);
const enumOf =
  (...values) =>
  (v) =>
    values.includes(v);
const bool = (v) => typeof v === "boolean";
const integer = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
// Optional observations only: missing values stay absent, including cpuIdle.
// Instance counts use Google's nonnegative int32 contract, not the list budget.
const instanceCount = (v) =>
  Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const numeric = str(/^\d{1,30}$/);
const tokenType = str(/^[a-zA-Z0-9_+/=.-]{0,1024}$/);
const resourceName = str(
  /^projects\/(?:drts-prod-devcc-20260825|\d+)\/[a-zA-Z0-9_@./%-]{1,300}$/,
);
const runName = str(
  /^projects\/(?:drts-prod-devcc-20260825|[1-9][0-9]{0,29})\/locations\/us-central1\/(?:services|jobs)\/[a-z][a-z0-9-]{0,62}(?:\/revisions\/[a-z][a-z0-9-]{0,62})?$/,
);
function canonicalRunName(value, projectNumber) {
  if (!runName(value)) fail("MALFORMED_METADATA", "RESOURCE_NAME");
  const project = value.split("/")[1];
  if (project !== TARGET.project && project !== projectNumber)
    fail("IDENTITY_MISMATCH", "RESOURCE_IDENTITY");
  return value.replace(`projects/${project}/`, `projects/${TARGET.project}/`);
}
function runIdentity(data, expected, kind, projectNumber) {
  if (canonicalRunName(data.name, projectNumber) !== expected)
    fail("IDENTITY_MISMATCH", "RESOURCE_IDENTITY");
  if (kind === "service") {
    for (const revision of [
      data.latestReadyRevision,
      data.latestCreatedRevision,
      ...(Array.isArray(data.trafficStatuses)
        ? data.trafficStatuses.map((t) => t?.revision)
        : []),
    ]) {
      if (revision === undefined) continue;
      const canonical = canonicalRunName(revision, projectNumber);
      if (!canonical.startsWith(`${expected}/revisions/`))
        fail("IDENTITY_MISMATCH", "REVISION_PARENT");
    }
  }
}
const imageType = str(
  /^us-central1-docker\.pkg\.dev\/(?:drts-prod-devcc-20260825\/[a-z0-9_-]+|drts-dev-devcc-20260825\/drts)\/(?:api|platform-admin-web|ops-console-web|fleet-partner-portal-web|tenant-console-web|bank-console-web|referral-embed-web|enterprise-dispatch-web|channel-partner-portal-web|passenger-app-web|migrate)(?:@sha256:[a-f0-9]{64}|:[a-f0-9]{40})$/,
);
const groupType = str(
  /^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/drts-prod-devcc-20260825\/regions\/us-central1\/networkEndpointGroups\/[a-z][a-z0-9-]{0,62}$/,
);
const safeName = str(NAME);
const revisionScaling = {
  minInstanceCount: instanceCount,
  maxInstanceCount: instanceCount,
};
const serviceContainers = [{ image: imageType, resources: { cpuIdle: bool } }];
const revisionSchema = {
  name: runName,
  containers: serviceContainers,
  scaling: revisionScaling,
  serviceAccount: str(
    /^drts-prod-runtime@drts-prod-devcc-20260825\.iam\.gserviceaccount\.com$/,
  ),
};
const schemas = {
  project: {
    name: str(/^projects\/\d+$/),
    projectId: str(/^drts-prod-devcc-20260825$/),
    state: enumOf("ACTIVE", "DELETE_REQUESTED", "STATE_UNSPECIFIED"),
  },
  sql: {
    name: str(/^drts-prod-db$/),
    region: str(/^us-central1$/),
    state: enumOf(
      "SQL_INSTANCE_STATE_UNSPECIFIED",
      "RUNNABLE",
      "SUSPENDED",
      "PENDING_DELETE",
      "PENDING_CREATE",
      "MAINTENANCE",
      "FAILED",
      "ONLINE_MAINTENANCE",
    ),
    settings: {
      backupConfiguration: {
        enabled: bool,
        pointInTimeRecoveryEnabled: bool,
        transactionLogRetentionDays: integer,
        backupRetentionSettings: {
          retainedBackups: integer,
          retentionUnit: enumOf("COUNT", "RETENTION_UNIT_UNSPECIFIED"),
        },
      },
    },
  },
  service: {
    name: runName,
    ingress: enumOf(
      "INGRESS_TRAFFIC_UNSPECIFIED",
      "INGRESS_TRAFFIC_ALL",
      "INGRESS_TRAFFIC_INTERNAL_ONLY",
      "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
    ),
    latestReadyRevision: runName,
    latestCreatedRevision: runName,
    trafficStatuses: [{ revision: runName, percent: integer }],
    template: {
      containers: serviceContainers,
      serviceAccount: revisionSchema.serviceAccount,
      scaling: revisionScaling,
    },
    scaling: {
      minInstanceCount: instanceCount,
      maxInstanceCount: instanceCount,
      manualInstanceCount: instanceCount,
      scalingMode: enumOf("SCALING_MODE_UNSPECIFIED", "AUTOMATIC", "MANUAL"),
    },
  },
  revision: revisionSchema,
  job: {
    name: runName,
    template: {
      template: {
        containers: [{ image: imageType }],
        serviceAccount: revisionSchema.serviceAccount,
      },
    },
  },
  repository: {
    name: resourceName,
    format: enumOf(
      "DOCKER",
      "FORMAT_UNSPECIFIED",
      "MAVEN",
      "NPM",
      "PYTHON",
      "APT",
      "YUM",
      "GO",
      "GENERIC",
    ),
  },
  images: { dockerImages: [{ uri: imageType }], nextPageToken: tokenType },
  versions: {
    versions: [
      {
        name: resourceName,
        state: enumOf("STATE_UNSPECIFIED", "ENABLED", "DISABLED", "DESTROYED"),
      },
    ],
    nextPageToken: tokenType,
  },
  backends: {
    items: [
      {
        name: safeName,
        iap: {
          enabled: bool,
          oauth2ClientId: str(
            /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
          ),
        },
        backends: [{ group: groupType }],
      },
    ],
    nextPageToken: tokenType,
  },
  negs: {
    items: [
      {
        name: safeName,
        networkEndpointType: enumOf(
          "SERVERLESS",
          "GCE_VM_IP_PORT",
          "GCE_VM_IP",
          "INTERNET_FQDN_PORT",
          "INTERNET_IP_PORT",
          "NON_GCP_PRIVATE_IP_PORT",
          "PRIVATE_SERVICE_CONNECT",
        ),
        cloudRun: { service: safeName },
      },
    ],
    nextPageToken: tokenType,
  },
  account: { uniqueId: numeric, disabled: bool },
  policy: {
    bindings: [
      {
        role: str(/^roles\/[a-zA-Z0-9_.]{1,100}$/),
        members: [str(/^[^\r\n\0]{1,512}$/)],
        condition: { expression: str(/^[^\0]{1,1024}$/) },
      },
    ],
  },
};
function fields(schema) {
  return Object.entries(schema)
    .map(([key, type]) => {
      const child = Array.isArray(type) ? type[0] : type;
      return typeof child === "object" ? `${key}(${fields(child)})` : key;
    })
    .join(",");
}
function validate(value, schema, maxArray = LIMITS.pageSize) {
  if (typeof schema === "function") {
    if (!schema(value))
      fail(
        "MALFORMED_METADATA",
        schema === runName
          ? "RESOURCE_NAME"
          : schema === imageType
            ? "IMAGE_CONTRACT"
            : schema === revisionSchema.serviceAccount
              ? "RUNTIME_IDENTITY"
              : "TYPE_OR_SCHEMA",
      );
    return value;
  }
  if (Array.isArray(schema)) {
    if (!Array.isArray(value) || value.length > maxArray)
      fail("MALFORMED_METADATA", "TYPE_OR_SCHEMA");
    return value.map((v) => validate(v, schema[0], maxArray));
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("MALFORMED_METADATA", "TYPE_OR_SCHEMA");
  const result = {};
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(schema, key))
      fail("UNEXPECTED_FIELDS", "UNEXPECTED_FIELDS");
    result[key] = validate(value[key], schema[key], maxArray);
  }
  return result;
}
function requireFields(value, keys) {
  if (keys.some((k) => value[k] === undefined))
    fail("INSUFFICIENT_OBSERVATION", "MISSING_REQUIRED_FIELDS");
}
const OPTIONAL_SECRETS = [
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
const ARTIFACT_SECRETS = [
  "DOCUMENT_ARTIFACT_S3_ACCESS_KEY_ID",
  "DOCUMENT_ARTIFACT_S3_SECRET_ACCESS_KEY",
  "DOCUMENT_ARTIFACT_S3_SESSION_TOKEN",
  "REMITTANCE_PROOF_S3_ACCESS_KEY_ID",
  "REMITTANCE_PROOF_S3_SECRET_ACCESS_KEY",
  "REMITTANCE_PROOF_S3_SESSION_TOKEN",
];
const authorizedOperations = new WeakMap();
const authorizedDescriptors = new WeakSet();
function inventory(env) {
  const operations = [],
    gaps = [];
  const root = `projects/${TARGET.project}`,
    runRoot = `${root}/locations/${TARGET.region}`;
  const add = (id, kind, url, schemaKey = kind, listKey) =>
    operations.push({ id, kind, url, schemaKey, listKey });
  const gap = (id, kind, code = "CONFIG_UNVERIFIED") =>
    gaps.push({ id, kind, status: "unverified", code });
  const name = (value, id, kind, regex = NAME) => {
    if (!value) {
      gap(id, kind);
      return null;
    }
    if (!regex.test(value)) fail("CONFIG_REJECTED");
    return value;
  };
  add(
    "project",
    "project",
    `https://cloudresourcemanager.googleapis.com/v3/${root}`,
  );
  add(
    "cloudsql",
    "sql",
    `https://sqladmin.googleapis.com/sql/v1beta4/projects/${TARGET.project}/instances/drts-prod-db`,
  );
  const services = [];
  for (const [id, key] of TOPOLOGY) {
    const actual = name(env[`PROD_GCP_${key}_SERVICE`], id, "service");
    if (
      actual &&
      /partner-booking|passenger-web|concierge|assisted-entry/.test(actual)
    )
      fail("RETIRED_SURFACE_REJECTED");
    if (actual) {
      services.push({ id, name: actual });
      add(
        id,
        "service",
        `https://run.googleapis.com/v2/${runRoot}/services/${actual}`,
      );
      add(
        `${id}-policy`,
        "policy",
        `https://run.googleapis.com/v2/${runRoot}/services/${actual}:getIamPolicy`,
      );
    }
  }
  if (new Set(services.map((s) => s.name)).size !== services.length)
    fail("DUPLICATE_SERVICE");
  const migration = name(env.PROD_GCP_MIGRATION_JOB, "migration", "job");
  if (migration)
    add(
      "migration",
      "job",
      `https://run.googleapis.com/v2/${runRoot}/jobs/${migration}`,
    );
  const prefix = env.PROD_SECRET_PREFIX || "drts-prod";
  if (!SECRET_NAME.test(prefix)) fail("CONFIG_REJECTED");
  const secrets = new Set(
    [
      ...Object.values(API_SECRETS),
      "bff-state-secret",
      "bank-session-secret",
      "bank-iap-jwt-public-key",
      "bank-artifact-signing-private-key",
      "bank-artifact-signing-public-key",
      "bank-artifact-signing-key-id",
      "referral-embed-session-secret",
      "release-smoke-headers",
    ].map((s) => `${prefix}-${s}`),
  );
  for (const key of [
    ...OPTIONAL_SECRETS,
    ...ARTIFACT_SECRETS.filter(
      (key) =>
        env[
          `PROD_${key.startsWith("DOCUMENT_") ? "DOCUMENT_ARTIFACT" : "REMITTANCE_PROOF"}_STORAGE_PROVIDER`
        ] === "s3",
    ),
  ]) {
    const actual = env[`PROD_${key}_SECRET`];
    if (actual) {
      if (!SECRET_NAME.test(actual)) fail("CONFIG_REJECTED");
      secrets.add(actual);
    }
  }
  for (const prefixKey of ["DOCUMENT_ARTIFACT", "REMITTANCE_PROOF"]) {
    const provider = env[`PROD_${prefixKey}_STORAGE_PROVIDER`];
    if (!["gcs", "s3"].includes(provider)) gap(prefixKey, "secret-selection");
    if (provider === "s3")
      for (const suffix of ["ACCESS_KEY_ID", "SECRET_ACCESS_KEY"])
        if (!env[`PROD_${prefixKey}_S3_${suffix}_SECRET`])
          gap(`${prefixKey}_S3_${suffix}`, "secret-selection");
  }
  if (env.PROD_MAP_PROVIDER_BACKEND === "google")
    for (const suffix of ["geocoding-api-key", "routes-api-key", "browser-key"])
      secrets.add(`${prefix}-google-maps-${suffix}`);
  else gap("map-provider", "secret-selection");
  // Optional provider selection remains unresolved when public-entry config is
  // absent; it is never converted into an assertion that no secrets are needed.
  let entries;
  if (env.PROD_PUBLIC_ENTRY_CONFIG_JSON) {
    try {
      entries = JSON.parse(env.PROD_PUBLIC_ENTRY_CONFIG_JSON);
    } catch {
      fail("CONFIG_REJECTED");
    }
    if (
      !entries ||
      Array.isArray(entries) ||
      Object.keys(entries).sort().join(",") !==
        "passenger-app-web,referral-embed-web"
    )
      fail("CONFIG_REJECTED");
    for (const id of ["referral-embed-web", "passenger-app-web"])
      if (!NAME.test(entries[id]?.backendService || ""))
        fail("CONFIG_REJECTED");
    const providers = entries["passenger-app-web"].expectedProviders;
    if (
      !Array.isArray(providers) ||
      !providers.length ||
      providers.some(
        (p) => !["phone", "email", "facebook", "line", "google"].includes(p),
      )
    )
      fail("CONFIG_REJECTED");
    for (const provider of providers)
      for (const key of {
        phone: ["PASSENGER_OTP_PEPPER"],
        email: [
          "PASSENGER_OTP_PEPPER",
          "REMOTE_SMTP_USERNAME",
          "REMOTE_SMTP_PASSWORD",
        ],
        google: ["GOOGLE_OAUTH_CLIENT_SECRET"],
        facebook: ["FACEBOOK_APP_SECRET"],
        line: ["LINE_CHANNEL_SECRET"],
      }[provider])
        if (!env[`PROD_${key}_SECRET`]) gap(key, "secret-selection");
  } else gap("public-entry-config", "iap-selection");
  for (const secret of [...secrets].sort()) {
    if (!SECRET_NAME.test(secret)) fail("CONFIG_REJECTED");
    add(
      secret,
      "versions",
      `https://secretmanager.googleapis.com/v1/${root}/secrets/${secret}/versions`,
      "versions",
      "versions",
    );
  }
  const registry =
    env.PROD_ARTIFACT_REGISTRY ||
    `${env.PROD_ARTIFACT_REGION || TARGET.region}-docker.pkg.dev/${env.PROD_ARTIFACT_PROJECT_ID || TARGET.project}/${env.PROD_ARTIFACT_REPOSITORY || "drts"}`;
  const match =
    /^us-central1-docker\.pkg\.dev\/drts-prod-devcc-20260825\/([a-z0-9_-]{1,63})$/.exec(
      registry,
    );
  const shared = registry === SHARED_REGISTRY.registry;
  if (!match && !shared) fail("ARTIFACT_TARGET_REJECTED");
  for (const [key, expected] of Object.entries({
    PROD_ARTIFACT_PROJECT_ID: shared ? SHARED_REGISTRY.project : TARGET.project,
    PROD_ARTIFACT_REGION: TARGET.region,
    PROD_ARTIFACT_REPOSITORY: shared ? SHARED_REGISTRY.repository : match[1],
  }))
    if ((shared || env[key]) && env[key] !== expected)
      fail("ARTIFACT_TARGET_REJECTED");
  if (shared) {
    for (const [id, kind] of [
      ["artifact-repository", "repository"],
      ["artifact-images", "images"],
    ])
      gaps.push({
        id,
        kind,
        status: "blocked",
        code: "SHARED_REGISTRY_NOT_AUTHORIZED",
      });
  } else {
    const repoRoot = `${runRoot}/repositories/${match[1]}`;
    add(
      "artifact-repository",
      "repository",
      `https://artifactregistry.googleapis.com/v1/${repoRoot}`,
    );
    add(
      "artifact-images",
      "images",
      `https://artifactregistry.googleapis.com/v1/${repoRoot}/dockerImages`,
      "images",
      "dockerImages",
    );
  }
  // Fixed global LB / regional serverless NEG route used by the original rail.
  add(
    "load-balancer",
    "backends",
    `https://compute.googleapis.com/compute/v1/projects/${TARGET.project}/global/backendServices`,
    "backends",
    "items",
  );
  add(
    "serverless-negs",
    "negs",
    `https://compute.googleapis.com/compute/v1/projects/${TARGET.project}/regions/${TARGET.region}/networkEndpointGroups`,
    "negs",
    "items",
  );
  const deployer = env.PROD_DEPLOYER_IDENTITY;
  if (
    !/^[a-z][a-z0-9-]{2,62}@drts-prod-devcc-20260825\.iam\.gserviceaccount\.com$/.test(
      deployer || "",
    ) ||
    deployer === TARGET.runtime
  )
    fail("PROD_IDENTITY_REQUIRED");
  for (const [id, email] of [
    ["runtime", TARGET.runtime],
    ["deployer", deployer],
  ]) {
    const url = `https://iam.googleapis.com/v1/${root}/serviceAccounts/${email}`;
    add(id, "account", url);
  }
  const plan = Object.freeze({
    operations: Object.freeze(operations.map(Object.freeze)),
    gaps,
    services,
    entries,
    registry,
    prefix,
    deployer,
  });
  authorizedOperations.set(plan, new Set(plan.operations));
  return plan;
}
function requestDescriptor(plan, operation, pageToken) {
  // Only objects held by the generated inventory may cross the HTTP boundary.
  if (
    !authorizedOperations.get(plan)?.has(operation) ||
    !Object.isFrozen(operation) ||
    !schemas[operation.schemaKey]
  )
    fail("OPERATION_REJECTED");
  const url = new URL(operation.url);
  url.searchParams.set("fields", fields(schemas[operation.schemaKey]));
  if (operation.listKey) {
    url.searchParams.set(
      url.hostname === "compute.googleapis.com" ? "maxResults" : "pageSize",
      String(LIMITS.pageSize),
    );
    if (pageToken !== undefined) {
      if (!tokenType(pageToken)) fail();
      url.searchParams.set("pageToken", pageToken);
    }
  } else if (pageToken !== undefined) fail("OPERATION_REJECTED");
  if (operation.kind === "policy")
    url.searchParams.set("options.requestedPolicyVersion", "3");
  const descriptor = Object.freeze({ method: "GET", url: url.toString() });
  authorizedDescriptors.add(descriptor);
  return descriptor;
}
async function hostedTransport(descriptor, accessToken) {
  if (
    !authorizedDescriptors.has(descriptor) ||
    descriptor.method !== "GET" ||
    typeof accessToken !== "string" ||
    !accessToken
  )
    fail("AUTH_REQUIRED");
  const response = await fetch(descriptor.url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(LIMITS.requestMs),
  });
  // Never read or echo an error body; it can contain identities/credentials.
  if (!response.ok) return { status: response.status };
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > LIMITS.bytes) fail("RESPONSE_BOUND_EXCEEDED");
    chunks.push(Buffer.from(chunk));
  }
  return {
    status: response.status,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
  };
}
const SAFE_CODES = [
  "SHARED_REGISTRY_NOT_AUTHORIZED",
  "CONFIG_UNVERIFIED",
  "PERMISSION_DENIED",
  "MISSING",
  "HTTP_ERROR",
  "UNEXPECTED_FIELDS",
  "MALFORMED_METADATA",
  "INSUFFICIENT_OBSERVATION",
  "PAGINATION_TRUNCATED",
  "REQUEST_BOUND_EXCEEDED",
  "RESPONSE_BOUND_EXCEEDED",
  "REQUEST_FAILED",
  "IDENTITY_MISMATCH",
  "AUTH_REQUIRED",
  "COLLECTION_TIMEOUT",
];
const SAFE_DIAGNOSES = Object.freeze([
  "UNKNOWN",
  "TYPE_OR_SCHEMA",
  "UNEXPECTED_FIELDS",
  "RESOURCE_NAME",
  "RESOURCE_IDENTITY",
  "REVISION_PARENT",
  "IMAGE_CONTRACT",
  "EXPECTED_IMAGE",
  "RUNTIME_IDENTITY",
  "MISSING_REQUIRED_FIELDS",
  "TRAFFIC",
]);
function errorRecord(op, error) {
  const resource =
    op.kind === "account"
      ? op.id
      : op.kind === "sql"
        ? "drts-prod-db"
        : new URL(op.url).pathname
            .replace(/^\/(?:v[123]|compute\/v1)\//, "")
            .replace(":getIamPolicy", "");
  return {
    id: op.id,
    kind: op.kind,
    resource,
    status: "blocked",
    diagnosis: SAFE_DIAGNOSES.includes(error?.diagnosis)
      ? error.diagnosis
      : "UNKNOWN",
    code: SAFE_CODES.includes(error?.code) ? error.code : "REQUEST_FAILED",
    ...(Number.isInteger(error?.httpStatus) &&
    error.httpStatus >= 100 &&
    error.httpStatus <= 599
      ? { httpStatus: error.httpStatus }
      : {}),
  };
}
async function collect(env, head, transport) {
  guard(env, head);
  checkRail();
  const plan = inventory(env),
    identity = guard(env, head);
  const records = [...plan.gaps];
  const deadline = Date.now() + LIMITS.collectionMs;
  let requests = 0;
  let projectNumber;
  const rawLists = {},
    revisionsToRead = [];
  const partialRecord = (op, e) => {
    if (!e.partialItems?.length) return;
    let items;
    if (op.kind === "versions")
      items = e.partialItems
        .filter(
          (v) =>
            v.name &&
            /^[1-9][0-9]*$/.test(v.name.split("/").pop()) &&
            (v.name.startsWith(
              `projects/${TARGET.project}/secrets/${op.id}/versions/`,
            ) ||
              (projectNumber &&
                v.name.startsWith(
                  `projects/${projectNumber}/secrets/${op.id}/versions/`,
                ))) &&
            v.state,
        )
        .map((v) => ({ version: v.name.split("/").pop(), state: v.state }));
    if (op.kind === "images")
      items = e.partialItems.filter((v) =>
        v.uri?.startsWith(`${plan.registry}/`),
      );
    if (items?.length)
      records.push({
        id: `${op.id}:partial`,
        kind: op.kind,
        status: "observed",
        data: { items, pages: e.pages },
      });
  };
  const read = async (op) => {
    let next,
      pages = 0;
    const values = [],
      seen = new Set();
    try {
      do {
        if (Date.now() >= deadline) fail("COLLECTION_TIMEOUT");
        if (pages >= LIMITS.pages || (next && seen.has(next)))
          fail("PAGINATION_TRUNCATED");
        if (requests >= LIMITS.requests) fail("REQUEST_BOUND_EXCEEDED");
        pages++;
        if (next) seen.add(next);
        const descriptor = requestDescriptor(plan, op, next);
        requests++;
        const result = await transport(descriptor);
        if (result.status !== 200) {
          const e = new Error("Google control-plane HTTP error");
          e.code =
            result.status === 403
              ? "PERMISSION_DENIED"
              : result.status === 404
                ? "MISSING"
                : "HTTP_ERROR";
          e.httpStatus = result.status;
          throw e;
        }
        const body = validate(result.body, schemas[op.schemaKey]);
        if (!op.listKey) return body;
        values.push(...(body[op.listKey] || []));
        next = body.nextPageToken;
      } while (next);
      return { items: values, pages };
    } catch (e) {
      if (values.length) {
        e.partialItems = values;
        e.pages = Math.min(pages, LIMITS.pages);
      }
      throw e;
    }
  };
  for (const op of [...plan.operations]) {
    try {
      const data = await read(op);
      if (["backends", "negs"].includes(op.kind)) {
        rawLists[op.kind] = data.items;
        continue;
      }
      if (op.kind === "project") {
        requireFields(data, ["name", "projectId", "state"]);
        projectNumber = data.name.split("/")[1];
      }
      if (op.kind === "sql") {
        requireFields(data, ["name", "region", "state", "settings"]);
        requireFields(data.settings, ["backupConfiguration"]);
        requireFields(data.settings.backupConfiguration, ["enabled"]);
      }
      if (["service", "job", "revision"].includes(op.kind)) {
        runIdentity(
          data,
          new URL(op.url).pathname.slice(4),
          op.kind,
          projectNumber,
        );
        const template =
          op.kind === "job"
            ? data.template?.template
            : op.kind === "service"
              ? data.template
              : data;
        if (
          !template?.containers?.length ||
          !template.serviceAccount ||
          template.containers.some((c) => !c.image)
        )
          fail("INSUFFICIENT_OBSERVATION", "MISSING_REQUIRED_FIELDS");
        if (
          template.containers.some(
            (c) => !c.image.startsWith(`${plan.registry}/`),
          )
        )
          fail("INSUFFICIENT_OBSERVATION", "EXPECTED_IMAGE");
        if (op.kind === "service") {
          requireFields(data, [
            "ingress",
            "latestReadyRevision",
            "latestCreatedRevision",
            "trafficStatuses",
          ]);
          if (
            data.trafficStatuses.some(
              (t) => !t.revision || !integer(t.percent),
            ) ||
            data.trafficStatuses.reduce((a, t) => a + t.percent, 0) !== 100
          )
            fail("INSUFFICIENT_OBSERVATION", "TRAFFIC");
          const revisions = new Set([
            data.latestReadyRevision,
            data.latestCreatedRevision,
            ...data.trafficStatuses.map((t) => t.revision),
          ]);
          if (revisions.size > 10) fail("RESPONSE_BOUND_EXCEEDED");
          for (const revision of revisions) {
            const operation = Object.freeze({
              id: `${op.id}:${revision.split("/").pop()}`,
              kind: "revision",
              schemaKey: "revision",
              url: `https://run.googleapis.com/v2/${canonicalRunName(revision, projectNumber)}`,
            });
            authorizedOperations.get(plan).add(operation);
            revisionsToRead.push(operation);
          }
        }
      }
      if (
        op.kind === "repository" &&
        (data.name !== new URL(op.url).pathname.slice(4) ||
          data.format !== "DOCKER")
      )
        fail("IDENTITY_MISMATCH");
      if (op.kind === "account") requireFields(data, ["uniqueId"]);
      if (op.kind === "versions") {
        if (
          !data.items.length ||
          data.items.some(
            (v) =>
              !v.name?.match(/\/versions\/[1-9][0-9]*$/) ||
              (!v.name.startsWith(
                `projects/${TARGET.project}/secrets/${op.id}/versions/`,
              ) &&
                !(
                  projectNumber &&
                  v.name.startsWith(
                    `projects/${projectNumber}/secrets/${op.id}/versions/`,
                  )
                )) ||
              !v.state,
          )
        )
          fail("INSUFFICIENT_OBSERVATION");
        data.items = data.items.map((v) => ({
          version: v.name.split("/").pop(),
          state: v.state,
        }));
      }
      if (op.kind === "images") {
        if (
          !data.items.length ||
          data.items.some((v) => !v.uri?.startsWith(`${plan.registry}/`))
        )
          fail("INSUFFICIENT_OBSERVATION");
        const imageIds = new Set(
          data.items.map(
            (v) => v.uri.slice(plan.registry.length + 1).split(/[@:]/)[0],
          ),
        );
        if (
          [...TOPOLOGY.map(([id]) => id), "migrate"].some(
            (id) => !imageIds.has(id),
          )
        )
          fail("INSUFFICIENT_OBSERVATION");
      }
      if (op.kind === "policy") {
        const bindings = data.bindings || [];
        const observation = {
          bindingCount: bindings.length,
          memberCount: bindings.reduce(
            (n, b) => n + (b.members?.length || 0),
            0,
          ),
          unconditionalRuntimeInvoker: bindings.some(
            (b) =>
              b.role === "roles/run.invoker" &&
              !b.condition &&
              b.members?.includes(`serviceAccount:${TARGET.runtime}`),
          ),
          unconditionalDeployerInvoker: bindings.some(
            (b) =>
              b.role === "roles/run.invoker" &&
              !b.condition &&
              b.members?.includes(`serviceAccount:${plan.deployer}`),
          ),
          publicInvoker: bindings.some(
            (b) =>
              b.role === "roles/run.invoker" &&
              b.members?.some((m) =>
                ["allUsers", "allAuthenticatedUsers"].includes(m),
              ),
          ),
        };
        records.push({
          id: op.id,
          kind: op.kind,
          status: "observed",
          data: observation,
        });
        continue;
      }
      records.push({
        id: op.id,
        kind: op.kind,
        status: "observed",
        ...(["service", "job", "revision"].includes(op.kind)
          ? { resource: new URL(op.url).pathname.slice(4) }
          : {}),
        data,
      });
    } catch (e) {
      partialRecord(op, e);
      records.push(errorRecord(op, e));
    }
  }
  for (const op of revisionsToRead) {
    try {
      const data = await read(op);
      requireFields(data, ["name", "containers", "serviceAccount"]);
      runIdentity(
        data,
        new URL(op.url).pathname.slice(4),
        op.kind,
        projectNumber,
      );
      if (!data.containers.length)
        fail("INSUFFICIENT_OBSERVATION", "MISSING_REQUIRED_FIELDS");
      if (
        data.containers.some((c) => !c.image?.startsWith(`${plan.registry}/`))
      )
        fail("IDENTITY_MISMATCH", "EXPECTED_IMAGE");
      records.push({
        id: op.id,
        kind: op.kind,
        status: "observed",
        ...(["service", "job", "revision"].includes(op.kind)
          ? { resource: new URL(op.url).pathname.slice(4) }
          : {}),
        data,
      });
    } catch (e) {
      records.push(errorRecord(op, e));
    }
  }
  // Keep only LB/NEG observations joined to fixed, configured product services.
  for (const service of plan.services) {
    const negs =
      rawLists.negs?.filter(
        (n) =>
          n.networkEndpointType === "SERVERLESS" &&
          n.cloudRun?.service === service.name,
      ) || [];
    const backends =
      rawLists.backends?.filter((b) =>
        b.backends?.some((g) =>
          negs.some((n) =>
            g.group.endsWith(`/networkEndpointGroups/${n.name}`),
          ),
        ),
      ) || [];
    const expected = plan.entries?.[service.id]?.backendService;
    if (
      !rawLists.negs ||
      !rawLists.backends ||
      !backends.length ||
      (expected && !backends.some((b) => b.name === expected))
    ) {
      records.push({
        id: `${service.id}-iap`,
        kind: "iap",
        status: "unverified",
        code: "INSUFFICIENT_OBSERVATION",
      });
      continue;
    }
    for (const backend of backends) {
      if (backend.iap?.enabled === undefined || !backend.iap.oauth2ClientId) {
        records.push({
          id: `${service.id}-iap`,
          kind: "iap",
          status: "unverified",
          code: "INSUFFICIENT_OBSERVATION",
        });
        continue;
      }
      records.push({
        id: `${service.id}-iap`,
        kind: "iap",
        status: "observed",
        data: {
          backend: backend.name,
          enabled: backend.iap.enabled,
          clientId: backend.iap.oauth2ClientId,
          negCount: negs.length,
        },
      });
    }
  }
  return {
    schema: 1,
    purpose: "production-metadata-investigation",
    identity,
    collection: records.every((r) => r.status === "observed")
      ? "complete"
      : "incomplete",
    runtimeProvenance: "unverified",
    effectiveIamPermissions: "unverified",
    requests,
    records,
  };
}
function freezeSchema(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeSchema(child);
    Object.freeze(value);
  }
  return value;
}
freezeSchema(schemas);
const outputSchemas = {
  ...schemas,
  policy: {
    bindingCount: integer,
    memberCount: integer,
    unconditionalRuntimeInvoker: bool,
    unconditionalDeployerInvoker: bool,
    publicInvoker: bool,
  },
  versions: {
    items: [{ version: numeric, state: schemas.versions.versions[0].state }],
    pages: integer,
  },
  images: { items: schemas.images.dockerImages, pages: integer },
  iap: {
    backend: safeName,
    enabled: bool,
    clientId: schemas.backends.items[0].iap.oauth2ClientId,
    negCount: integer,
  },
};
function serialize(report) {
  validate(report, {
    schema: enumOf(1),
    purpose: enumOf("production-metadata-investigation"),
    identity: {
      definitionSha: str(SHA),
      expectedProductSha: str(SHA),
      ref: str(/^refs\/heads\/release\/v\d{4}\.\d{2}\.\d{2}\.\d+$/),
      runId: numeric,
      runAttempt: numeric,
      repository: enumOf("ajoe734/drts-fleet-platform"),
      target: {
        project: enumOf(TARGET.project),
        region: enumOf(TARGET.region),
        cloudsql: enumOf(TARGET.cloudsql),
        runtime: enumOf(TARGET.runtime),
      },
    },
    collection: enumOf("complete", "incomplete"),
    runtimeProvenance: enumOf("unverified"),
    effectiveIamPermissions: enumOf("unverified"),
    requests: integer,
    records: () => true,
  });
  requireFields(report, [
    "schema",
    "purpose",
    "identity",
    "collection",
    "runtimeProvenance",
    "effectiveIamPermissions",
    "requests",
    "records",
  ]);
  if (
    !Array.isArray(report.records) ||
    report.records.length > 500 ||
    report.requests > LIMITS.requests
  )
    fail();
  let projectNumber;
  const projects = report.records.filter(
    (r) => r.kind === "project" && r.status === "observed",
  );
  if (projects.length > 1) fail();
  if (projects.length === 1) {
    validate(projects[0].data, schemas.project);
    requireFields(projects[0].data, ["name", "projectId", "state"]);
    projectNumber = projects[0].data.name.split("/")[1];
  }
  for (const record of report.records) {
    validate(record, {
      id: str(/^[a-zA-Z0-9_:-]{1,320}$/),
      kind: enumOf(
        ...Object.keys(outputSchemas),
        "secret-selection",
        "iap-selection",
        "auth",
      ),
      status: enumOf("observed", "blocked", "unverified"),
      resource: str(/^[a-zA-Z0-9_:/-]{1,400}$/),
      httpStatus: (v) => Number.isInteger(v) && v >= 100 && v <= 599,
      code: enumOf(...SAFE_CODES),
      diagnosis: enumOf(...SAFE_DIAGNOSES),
      data: () => true,
    });
    requireFields(record, ["id", "kind", "status"]);
    if (record.status === "observed") {
      if (record.code || !outputSchemas[record.kind]) fail();
      requireFields(record, ["data"]);
      validate(
        record.data,
        outputSchemas[record.kind],
        LIMITS.pages * LIMITS.pageSize,
      );
      if (["service", "job", "revision"].includes(record.kind)) {
        requireFields(record, ["resource"]);
        const expected = canonicalRunName(record.resource);
        runIdentity(record.data, expected, record.kind, projectNumber);
      }
    } else if (!record.code || record.data !== undefined) fail();
  }
  if (
    report.collection !==
    (report.records.every((r) => r.status === "observed")
      ? "complete"
      : "incomplete")
  )
    fail();
  if (report.collection === "complete") {
    for (const [kind, count] of Object.entries({
      project: 1,
      sql: 1,
      service: 10,
      revision: 10,
      job: 1,
      repository: 1,
      images: 1,
      versions: 19,
      account: 2,
      policy: 10,
      iap: 10,
    }))
      if (report.records.filter((r) => r.kind === kind).length < count)
        fail("INSUFFICIENT_OBSERVATION");
  }
  return JSON.stringify(report, null, 2) + "\n";
}
const GUARD_CODES = Object.freeze([
  "GUARD_PASSED",
  "UNKNOWN_GUARD_FAILURE",
  "UNPROTECTED_DISPATCH",
  "SOURCE_REF_REJECTED",
  "DEFINITION_SHA_MISMATCH",
  "PRODUCT_SHA_REQUIRED",
  "TARGET_MISMATCH",
  "RUN_IDENTITY_REJECTED",
  "SOURCE_PROVENANCE_REJECTED",
  "RAIL_LINEAGE_CHANGED",
  "OPERATION_REJECTED",
  "CONFIG_REJECTED",
  "RETIRED_SURFACE_REJECTED",
  "DUPLICATE_SERVICE",
  "ARTIFACT_TARGET_REJECTED",
  "PROD_IDENTITY_REQUIRED",
]);
const RELEASE_REF = /^refs\/heads\/release\/v\d{4}\.\d{2}\.\d{2}\.\d+$/;
function diagnostic(env, head, code, preAuth) {
  const selected = (value, regex) =>
    typeof value === "string" && value.length <= 128 && regex.test(value)
      ? value
      : "unverified";
  return {
    schema: 1,
    purpose: "production-inventory-guard-diagnostic",
    phase: preAuth ? "pre-auth" : "collect-validation",
    result: code === "GUARD_PASSED" ? "passed" : "blocked",
    code: GUARD_CODES.includes(code) ? code : "UNKNOWN_GUARD_FAILURE",
    authAttempts: preAuth ? 0 : "unverified",
    googleRequests: 0,
    identity: {
      definitionSha:
        env.DEFINITION_SHA === env.GITHUB_SHA && env.DEFINITION_SHA === head
          ? selected(head, SHA)
          : "unverified",
      expectedProductSha: selected(env.EXPECTED_PRODUCT_SHA, SHA),
      ref: selected(env.GITHUB_REF, RELEASE_REF),
      runId: selected(env.GITHUB_RUN_ID, /^\d{1,20}$/),
      runAttempt: selected(env.GITHUB_RUN_ATTEMPT, /^\d{1,4}$/),
      repository:
        env.GITHUB_REPOSITORY === "ajoe734/drts-fleet-platform"
          ? env.GITHUB_REPOSITORY
          : "unverified",
    },
  };
}
function serializeDiagnostic(report) {
  const verifiedOr = (regex) => (v) => v === "unverified" || str(regex)(v);
  validate(report, {
    schema: enumOf(1),
    purpose: enumOf("production-inventory-guard-diagnostic"),
    phase: enumOf("pre-auth", "collect-validation"),
    result: enumOf("passed", "blocked"),
    code: enumOf(...GUARD_CODES),
    authAttempts: enumOf(0, "unverified"),
    googleRequests: enumOf(0),
    identity: {
      definitionSha: verifiedOr(SHA),
      expectedProductSha: verifiedOr(SHA),
      ref: verifiedOr(RELEASE_REF),
      runId: verifiedOr(/^\d{1,20}$/),
      runAttempt: verifiedOr(/^\d{1,4}$/),
      repository: enumOf("ajoe734/drts-fleet-platform", "unverified"),
    },
  });
  requireFields(report, [
    "schema",
    "purpose",
    "phase",
    "result",
    "code",
    "authAttempts",
    "googleRequests",
    "identity",
  ]);
  requireFields(report.identity, [
    "definitionSha",
    "expectedProductSha",
    "ref",
    "runId",
    "runAttempt",
    "repository",
  ]);
  if (
    (report.result === "passed") !== (report.code === "GUARD_PASSED") ||
    (report.phase === "pre-auth"
      ? report.authAttempts !== 0
      : report.authAttempts !== "unverified")
  )
    fail();
  return JSON.stringify(report, null, 2) + "\n";
}
function writeArtifact(name, contents) {
  fs.mkdirSync(".artifacts/production-readonly-inventory", { recursive: true });
  fs.writeFileSync(
    `.artifacts/production-readonly-inventory/${name}.json`,
    contents,
    { mode: 0o600 },
  );
}
// Boundary injection is for pure tests only; CLI callers cannot supply URLs,
// metadata fields, source overrides or alternate authentication identities.
async function main({
  env = process.env,
  args = process.argv.slice(2),
  git = (gitArgs) =>
    execFileSync("git", gitArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim(),
  write = writeArtifact,
  transport = hostedTransport,
  log = (message) => console.error(message),
  exitCode = (value) => {
    process.exitCode = value;
  },
} = {}) {
  let head;
  let validationPassed = false;
  const preAuth = args.length === 1 && args[0] === "guard";
  try {
    head = git(["rev-parse", "HEAD"]);
    const identity = guard(env, head);
    checkRail();
    releaseSourceGuard(identity, git);
    if (args.length !== 1 || !["guard", "collect"].includes(args[0]))
      fail("OPERATION_REJECTED");
    const plan = inventory(env);
    if (preAuth) {
      write(
        "guard-diagnostic",
        serializeDiagnostic(diagnostic(env, head, "GUARD_PASSED", true)),
      );
      return;
    }
    validationPassed = true;
    const report = env.PROD_INVENTORY_ACCESS_TOKEN
      ? await collect(env, head, (descriptor) =>
          transport(descriptor, env.PROD_INVENTORY_ACCESS_TOKEN),
        )
      : {
          schema: 1,
          purpose: "production-metadata-investigation",
          identity,
          collection: "incomplete",
          runtimeProvenance: "unverified",
          effectiveIamPermissions: "unverified",
          requests: 0,
          records: [
            ...plan.gaps,
            {
              id: "production-wif",
              kind: "auth",
              status: "blocked",
              code: "AUTH_REQUIRED",
            },
          ],
        };
    write("metadata", serialize(report));
    if (report.collection !== "complete") exitCode(1);
  } catch (error) {
    if (!validationPassed) {
      try {
        write(
          "guard-diagnostic",
          serializeDiagnostic(
            diagnostic(
              env,
              head,
              error?.code === "GUARD_PASSED"
                ? "UNKNOWN_GUARD_FAILURE"
                : error?.code,
              preAuth,
            ),
          ),
        );
      } catch {
        // Even a filesystem failure must not expose an error message or stack.
      }
    }
    log(
      "Production metadata inspection failed; response and credential details withheld.",
    );
    exitCode(1);
  }
}
if (require.main === module) main();
module.exports = {
  TARGET,
  LIMITS,
  guard,
  releaseSourceGuard,
  checkRail,
  inventory,
  requestDescriptor,
  hostedTransport,
  collect,
  serialize,
  serializeDiagnostic,
  main,
  schemas,
  fields,
  OPTIONAL_SECRETS,
  ARTIFACT_SECRETS,
};
