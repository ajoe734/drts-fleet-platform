import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  JourneyFailure,
  NativeTransport,
  mask,
  persistPrivateJson,
  requireFact,
  text,
  type Origins,
} from "../../tests/e2e/owned-referral-business-journey/protocol";
import {
  OPS_ENV_KEY,
  PROJECT,
  REGION,
  SERVICES,
  enableExistingDevOps,
  validateContext,
  type Runtime,
  type RuntimeRole,
  type SetupContext,
} from "./core";
import { projectRuntime } from "./runtime";

const execute = promisify(execFile);
const OUTPUT = ".artifacts/dev-ops-enablement/setup.json";

async function cloud(args: string[], timeout = 45_000) {
  try {
    const result = await execute("gcloud", args, {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      encoding: "utf8",
    });
    return result.stdout;
  } catch {
    // Raw CLI errors can contain deployment configuration; never render them.
    throw new JourneyFailure("normal-dev-Ops-cloud-operation-unacknowledged");
  }
}
async function readRuntime(): Promise<Runtime> {
  const rows = {} as Runtime;
  for (const role of Object.keys(SERVICES) as RuntimeRole[]) {
    const value: unknown = JSON.parse(
      await cloud([
        "run",
        "services",
        "describe",
        SERVICES[role],
        `--project=${PROJECT}`,
        `--region=${REGION}`,
        "--format=json",
      ]),
    );
    rows[role] = projectRuntime(role, value);
  }
  return rows;
}

export async function runFromEnvironment() {
  requireFact(
    process.env.GITHUB_ACTIONS === "true",
    "normal dev Ops setup runs only in the hosted workflow",
  );
  const checkedOut = await execute("git", ["rev-parse", "HEAD"], {
    timeout: 10_000,
    maxBuffer: 1024,
    encoding: "utf8",
  });
  const context: SetupContext = {
    explicitOptIn: process.env.DRTS_DEV_OPS_ENABLEMENT === "true",
    definitionSha: text(process.env.EXPECTED_DEFINITION_SHA),
    actualCheckoutSha: checkedOut.stdout.trim(),
    runtimeSha: text(process.env.EXPECTED_RUNTIME_SHA),
    project: text(process.env.DEV_GCP_PROJECT_ID),
    region: text(process.env.DEV_GCP_REGION),
  };
  validateContext(context);
  requireFact(
    context.definitionSha === process.env.GITHUB_SHA,
    "workflow SHA binding",
  );
  const apiProof = text(process.env.DEV_OPS_API_ID_TOKEN);
  const adminProof = text(process.env.DEV_OPS_ADMIN_ID_TOKEN);
  const opsProof = text(process.env.DEV_OPS_CONSOLE_ID_TOKEN);
  [apiProof, adminProof, opsProof].forEach(mask);
  let transport: NativeTransport | undefined;
  const journal = await enableExistingDevOps(context, {
    readRuntime: async () => {
      const rows = await readRuntime();
      if (!transport) {
        const origins = Object.fromEntries(
          Object.entries(rows).map(([role, row]) => [role, row.origin]),
        ) as Origins;
        transport = new NativeTransport(origins, context.runtimeSha, {
          api: apiProof,
          admin: adminProof,
          ops: opsProof,
        });
      }
      return rows;
    },
    call: async (role, path, options) => {
      requireFact(transport, "bound hosted transport required");
      return (await transport.call(role, path, options)).data;
    },
    acceptSession: (role, token) => {
      requireFact(transport, "bound hosted transport required");
      transport.setSession(role, token);
      transport.setSession(role === "admin" ? "api" : "opsApi", token);
    },
    configureOpsReference: async (principalId) => {
      requireFact(
        /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(principalId),
        "canonical private env value required",
      );
      await cloud(
        [
          "run",
          "services",
          "update",
          SERVICES.ops,
          `--project=${PROJECT}`,
          `--region=${REGION}`,
          `--update-env-vars=${OPS_ENV_KEY}=${principalId}`,
          "--quiet",
          "--format=json",
        ],
        180_000,
      );
    },
    persist: (value) => persistPrivateJson(OUTPUT, value),
  });
  process.stdout.write(
    `${JSON.stringify({
      completed: journal.completed,
      activation: journal.activation,
      configuration: journal.configuration,
      canonicalOpsVerified: journal.canonicalOpsVerified,
      failure: journal.failure,
      cleanupErrors: journal.cleanupErrors,
    })}\n`,
  );
  if (!journal.completed) process.exitCode = 1;
}
