import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

const devWorkflowPath = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const stagingWorkflowPath = path.join(
  repoRoot,
  ".github/workflows/deploy-staging.yml",
);
const prodWorkflowPath = path.join(repoRoot, ".github/workflows/deploy-prod.yml");

const GOOGLE_REGISTRY_SECRET_SUFFIX = "-workload-identity-google-service-principals";
const GOOGLE_REGISTRY_ENV_VAR = "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS";

describe("SEC-WIF-REGISTRY-STAGING-PROD-WIRING-20261002: deploy-staging.yml mounts and fails closed on the Google workload identity registry", () => {
  it("declares a workload_google_registry_secret variable named after the staging secret prefix", () => {
    const workflow = readFileSync(stagingWorkflowPath, "utf8");
    expect(workflow).toContain(
      `workload_google_registry_secret="\${SECRET_PREFIX}${GOOGLE_REGISTRY_SECRET_SUFFIX}"`,
    );
  });

  it("fails the deploy with exit 1 before mounting any API secret when the registry secret is absent", () => {
    const workflow = readFileSync(stagingWorkflowPath, "utf8");

    const guardMatch = workflow.match(
      /if ! gcloud secrets describe "\$workload_google_registry_secret" --project "\$PROJECT_ID" >\/dev\/null 2>&1; then\n\s*echo "::error::Required secret \$\{workload_google_registry_secret\}[^"]*"\n\s*exit 1\n\s*fi/,
    );
    expect(guardMatch).not.toBeNull();
  });

  it("mounts WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS into the api secret_args output", () => {
    const workflow = readFileSync(stagingWorkflowPath, "utf8");
    expect(workflow).toContain(
      `${GOOGLE_REGISTRY_ENV_VAR}=\${workload_google_registry_secret}:latest`,
    );
  });

  it("runs the registry guard inside the Resolve API secret mounts step, strictly before the Deploy — api step", () => {
    const workflow = readFileSync(stagingWorkflowPath, "utf8");

    const resolveStepIndex = workflow.indexOf("name: Resolve API secret mounts");
    const guardIndex = workflow.indexOf(
      'if ! gcloud secrets describe "$workload_google_registry_secret"',
    );
    const mountIndex = workflow.indexOf(
      `${GOOGLE_REGISTRY_ENV_VAR}=\${workload_google_registry_secret}:latest`,
    );
    const deployApiIndex = workflow.indexOf("name: Deploy — api");

    expect(resolveStepIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(resolveStepIndex);
    expect(mountIndex).toBeGreaterThan(guardIndex);
    expect(deployApiIndex).toBeGreaterThan(mountIndex);
  });
});

describe("SEC-WIF-REGISTRY-STAGING-PROD-WIRING-20261002: deploy-prod.yml mounts and fails closed on the Google workload identity registry", () => {
  it("declares a workload_google_registry_secret variable named after the prod secret prefix", () => {
    const workflow = readFileSync(prodWorkflowPath, "utf8");
    expect(workflow).toContain(
      `workload_google_registry_secret="\${SECRET_PREFIX}${GOOGLE_REGISTRY_SECRET_SUFFIX}"`,
    );
  });

  it("fails the deploy with exit 1 before mounting any API secret when the registry secret is absent", () => {
    const workflow = readFileSync(prodWorkflowPath, "utf8");

    const guardMatch = workflow.match(
      /if ! gcloud secrets describe "\$workload_google_registry_secret" --project "\$PROJECT_ID" >\/dev\/null 2>&1; then\n\s*echo "::error::Required secret \$\{workload_google_registry_secret\}[^"]*"\n\s*exit 1\n\s*fi/,
    );
    expect(guardMatch).not.toBeNull();
  });

  it("mounts WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS into the api secret_args output", () => {
    const workflow = readFileSync(prodWorkflowPath, "utf8");
    expect(workflow).toContain(
      `${GOOGLE_REGISTRY_ENV_VAR}=\${workload_google_registry_secret}:latest`,
    );
  });

  it("runs the registry guard inside the Resolve API secret mounts step, strictly before the Deploy — api step", () => {
    const workflow = readFileSync(prodWorkflowPath, "utf8");

    const resolveStepIndex = workflow.indexOf("name: Resolve API secret mounts");
    const guardIndex = workflow.indexOf(
      'if ! gcloud secrets describe "$workload_google_registry_secret"',
    );
    const mountIndex = workflow.indexOf(
      `${GOOGLE_REGISTRY_ENV_VAR}=\${workload_google_registry_secret}:latest`,
    );
    const deployApiIndex = workflow.indexOf("name: Deploy — api");

    expect(resolveStepIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(resolveStepIndex);
    expect(mountIndex).toBeGreaterThan(guardIndex);
    expect(deployApiIndex).toBeGreaterThan(mountIndex);
  });
});

describe("SEC-WIF-REGISTRY-STAGING-PROD-WIRING-20261002: dev keeps its own notice-only (non-fail-closed) degrade, unchanged", () => {
  it("deploy-dev.yml still treats the Google registry secret as optional and does not exit 1 when it is absent", () => {
    const workflow = readFileSync(devWorkflowPath, "utf8");

    expect(workflow).toContain(
      `::notice::\${workload_google_registry_secret} is absent; dev deploys without the Google workload identity service principal registry`,
    );
    // The dev branch for this specific secret must not itself exit 1 -- the
    // check is "mount if present", not "fail if absent", unlike staging/prod.
    const devGoogleBlock = workflow.match(
      /if gcloud secrets describe "\$workload_google_registry_secret"[\s\S]*?\n {10}fi\n/,
    );
    expect(devGoogleBlock).not.toBeNull();
    expect(devGoogleBlock![0]).not.toContain("exit 1");
  });
});

describe("SEC-WIF-REGISTRY-STAGING-PROD-WIRING-20261002: operator documentation", () => {
  const registryDocPath = path.join(
    repoRoot,
    "docs/02-architecture/internal-key-exceptions.md",
  );

  it("documents staging and production registry secret names and the fail-closed deploy behavior", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain("SEC-WIF-REGISTRY-STAGING-PROD-WIRING-20261002");
    expect(doc).toContain("drts-staging-workload-identity-google-service-principals");
    expect(doc).toContain("drts-prod-workload-identity-google-service-principals");
  });

  it("marks unverifiable staging/production registry values as to-be-filled instead of guessing them", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    // Section 7.9.1's dev template contains real, verified service account
    // emails. The new staging/prod template must not copy those dev values
    // as if they were staging/prod identities -- Supervisor's account cannot
    // read the staging/prod GCP projects (see task integration_notes), so a
    // real email/audience here would be an invented value.
    expect(doc).toMatch(/待填|TBD|TODO\(ops\)/);
  });
});
