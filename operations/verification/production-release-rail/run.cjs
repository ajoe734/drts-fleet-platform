/* eslint-disable @typescript-eslint/no-require-imports -- executable CommonJS rail and production TS loader */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { deployArgs, reject } = require("./rail.cjs");
const {
  checkPublicEntryPolicies,
  verifyPublicEntry,
} = require("./public-entry.cjs");

function sdk(args) {
  try {
    return execFileSync("gcloud", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    reject(`gcloud ${args.slice(0, 3).join(" ")} (SDK output withheld)`);
  }
}
function imageManifest(plan, directory) {
  const images = {};
  for (const file of fs
    .readdirSync(directory)
    .filter((f) => f.endsWith(".json"))) {
    const item = JSON.parse(
      fs.readFileSync(path.join(directory, file), "utf8"),
    );
    if (
      item.sha !== plan.sha ||
      !plan.builds.some((b) => b.id === item.id) ||
      images[item.id] ||
      !/^sha256:[a-f0-9]{64}$/.test(item.digest)
    )
      reject("image manifest identity");
    images[item.id] = `${plan.registry}/${item.id}@${item.digest}`;
  }
  if (Object.keys(images).length !== plan.builds.length)
    reject("complete eleven-image manifest");
  return images;
}
function migrate(plan, images, cloud = sdk) {
  const db = plan.services[0].secrets.DATABASE_URL;
  let exists;
  // List is read-only and an authorization failure must not become a create.
  const jobs = JSON.parse(
    cloud([
      "run",
      "jobs",
      "list",
      "--project",
      plan.project,
      "--region",
      plan.region,
      "--format=json",
    ]),
  );
  exists = jobs.some((j) => j.metadata.name === plan.migrationJob);
  cloud([
    "run",
    "jobs",
    exists ? "update" : "create",
    plan.migrationJob,
    "--project",
    plan.project,
    "--region",
    plan.region,
    "--image",
    images.migrate,
    "--set-cloudsql-instances",
    plan.cloudsql,
    "--service-account",
    plan.runtime,
    "--set-secrets",
    `DATABASE_URL=${db}`,
    "--max-retries",
    "0",
    "--tasks",
    "1",
    "--parallelism",
    "1",
    "--quiet",
  ]);
  cloud([
    "run",
    "jobs",
    "execute",
    plan.migrationJob,
    "--project",
    plan.project,
    "--region",
    plan.region,
    "--wait",
    "--quiet",
  ]);
}
function deploy(plan, images, cloud = sdk) {
  for (const service of plan.services) {
    cloud(deployArgs(plan, service, images[service.id]));
    if (service.id !== "api") continue;
    // Preserve invoker and IAP gates, with failures visible instead of waived.
    cloud([
      "run",
      "services",
      "add-iam-policy-binding",
      plan.services[0].name,
      "--region",
      plan.region,
      "--project",
      plan.project,
      "--member",
      `serviceAccount:${plan.runtime}`,
      "--role",
      "roles/run.invoker",
      "--quiet",
    ]);
    cloud([
      "iap",
      "web",
      "add-iam-policy-binding",
      "--resource-type=cloud-run",
      `--service=${plan.services[0].name}`,
      "--region",
      plan.region,
      "--project",
      plan.project,
      "--member",
      `serviceAccount:${plan.runtime}`,
      "--role",
      "roles/iap.httpsResourceAccessor",
      "--quiet",
    ]);
  }
}
function assertRevision(plan, service, image, description, revision) {
  const status = description.status;
  const ready = status?.conditions?.find((c) => c.type === "Ready");
  if (
    ready?.status !== "True" ||
    !status.latestReadyRevisionName ||
    status.latestReadyRevisionName !== status.latestCreatedRevisionName
  )
    reject(`${service.id} Ready/latest revision`);
  const traffic = status.traffic || [];
  if (
    traffic.reduce((sum, t) => sum + (t.percent || 0), 0) !== 100 ||
    traffic.some(
      (t) => t.percent > 0 && t.revisionName !== status.latestReadyRevisionName,
    )
  )
    reject(`${service.id} exact revision traffic`);
  if (
    revision.metadata?.name !== status.latestReadyRevisionName ||
    revision.spec?.serviceAccountName !== plan.runtime ||
    revision.status?.conditions?.find((c) => c.type === "Ready")?.status !==
      "True"
  )
    reject(`${service.id} revision readiness/runtime`);
  const container = revision.spec.containers?.[0];
  const actualImage = revision.status?.imageDigest;
  if (
    container?.image !== image ||
    actualImage !== image ||
    !container.env?.some(
      (e) => e.name === "DRTS_CANDIDATE_SHA" && e.value === plan.sha,
    )
  )
    reject(`${service.id} exact SHA/image digest`);
  return {
    service: service.id,
    name: service.name,
    revision: status.latestReadyRevisionName,
    image: actualImage,
    sourceSha: plan.sha,
    traffic: 100,
  };
}
function assertProbe(service, response, body) {
  if (response.status !== 200)
    reject(`${service.id} protected smoke HTTP status`);
  if (service.id === "bank-console-web") {
    const lines = body.trim().split(/\r?\n/);
    if (
      !lines[0]?.startsWith("Period,StatementNo,TripID,OrderNo,") ||
      lines.length < 2
    )
      reject("bank-console-web protected CSV contract");
    if (
      !lines.slice(1).some((line) => {
        const columns = line.split(",");
        return (
          columns[0] === service.probe.expect.Period &&
          columns[1] === service.probe.expect.StatementNo
        );
      })
    )
      reject("bank-console-web protected CSV fixture");
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    reject(`${service.id} protected smoke JSON`);
  }
  for (const [key, expected] of Object.entries(service.probe.expect)) {
    const actual = key
      .split(".")
      .reduce((value, part) => value?.[part], parsed);
    if (actual !== expected)
      reject(`${service.id} protected smoke response contract (${key})`);
  }
}
async function verify(
  plan,
  images,
  {
    cloud = sdk,
    request = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  const { validateSmokeHeaders } = require("./preflight.cjs");
  const [secret, version] = plan.smokeSecret.split(":");
  const headers = validateSmokeHeaders(
    plan,
    cloud([
      "secrets",
      "versions",
      "access",
      version,
      "--secret",
      secret,
      "--project",
      plan.project,
    ]),
  );
  const evidence = {
    schema: 1,
    sourceSha: plan.sha,
    tag: plan.tag,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    project: plan.project,
    region: plan.region,
    migration:
      process.env.SKIP_MIGRATION === "true" ? "operator-skipped" : "completed",
    services: [],
    publicEntryPolicies: checkPublicEntryPolicies(plan, cloud),
    limits:
      "Deployment smoke only. No device, provider, legal/manual, restore, or complete end-to-end acceptance.",
  };
  for (const service of plan.services) {
    let description;
    for (let attempt = 0; attempt < 24; attempt++) {
      description = JSON.parse(
        cloud([
          "run",
          "services",
          "describe",
          service.name,
          "--region",
          plan.region,
          "--project",
          plan.project,
          "--format=json",
        ]),
      );
      if (
        description.status?.conditions?.some(
          (c) => c.type === "Ready" && c.status === "True",
        ) &&
        description.status.latestCreatedRevisionName ===
          description.status.latestReadyRevisionName
      )
        break;
      if (attempt < 23) await sleep(10000);
    }
    const revision = JSON.parse(
      cloud([
        "run",
        "revisions",
        "describe",
        description.status.latestReadyRevisionName,
        "--region",
        plan.region,
        "--project",
        plan.project,
        "--format=json",
      ]),
    );
    const record = assertRevision(
      plan,
      service,
      images[service.id],
      description,
      revision,
    );
    const publicEntry = service.publicEntry
      ? await verifyPublicEntry(service, request)
      : undefined;
    const token = service.publicEntry
      ? null
      : cloud([
          "auth",
          "print-identity-token",
          `--impersonate-service-account=${process.env.DEPLOYER_SERVICE_ACCOUNT}`,
          `--audiences=${service.transportAudience}`,
          "--include-email",
        ]);
    if (!service.publicEntry && !token)
      reject(`${service.id} signed IAP transport token`);
    const response = await request(`${service.origin}${service.probe.path}`, {
      method: "GET",
      headers: {
        ...headers[service.id],
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    assertProbe(service, response, await response.text());
    evidence.services.push({
      ...record,
      publicEntry,
      smoke: {
        path: service.probe.path,
        status: response.status,
        predicates: Object.keys(service.probe.expect),
        result: "pass",
      },
    });
  }
  return evidence;
}
async function main() {
  const plan = JSON.parse(fs.readFileSync("production-plan.json", "utf8"));
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (sha !== plan.sha || sha !== process.env.SOURCE_SHA)
    reject("checked-out source identity");
  const images = imageManifest(plan, "production-images");
  if (process.argv[2] === "migrate") migrate(plan, images);
  else if (process.argv[2] === "deploy") deploy(plan, images);
  else if (process.argv[2] === "verify")
    fs.writeFileSync(
      "production-evidence.json",
      JSON.stringify(await verify(plan, images), null, 2),
    );
  else reject("release phase");
}
if (require.main === module)
  main().catch((error) => {
    console.error(
      error.message.startsWith("Missing or invalid production configuration:")
        ? error.message
        : "Production release phase failed; response/credentials withheld.",
    );
    process.exitCode = 1;
  });
module.exports = {
  imageManifest,
  migrate,
  deploy,
  assertRevision,
  assertProbe,
  verify,
};
