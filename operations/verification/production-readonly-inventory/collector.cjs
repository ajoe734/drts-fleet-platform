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
const SHA = /^[a-f0-9]{40}$/;
const NAME = /^[a-z][a-z0-9-]{0,62}$/;
const SECRET_NAME = /^[a-zA-Z0-9_-]{1,255}$/;
const LIMITS = Object.freeze({
  pages: 5,
  pageSize: 100,
  requests: 320,
  bytes: 1048576,
  requestMs: 15000,
});
function fail(code = "MALFORMED_METADATA") {
  const e = new Error(code);
  e.code = code;
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
module.exports = { TARGET, LIMITS, guard, checkRail };
