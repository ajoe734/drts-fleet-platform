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

describe("SEC-WIF-REGISTRY-STAGING-PROD-WIRING-20261002: operator documentation resolves the correct per-environment audience (R1 reopen fix)", () => {
  const registryDocPath = path.join(
    repoRoot,
    "docs/02-architecture/internal-key-exceptions.md",
  );
  const section10Marker = "## 10. `SEC-WIF-REGISTRY-STAGING-PROD-WIRING-20261002";

  function readSection10(): string {
    const doc = readFileSync(registryDocPath, "utf8");
    const start = doc.indexOf(section10Marker);
    expect(start).toBeGreaterThan(-1);
    return doc.slice(start);
  }

  it("does not instruct ops to resolve drts-api's own Cloud Run status.url as the registry audience", () => {
    const section10 = readSection10();

    // R1: every staging/prod web-app proxy always mints its outbound Google
    // ID token with aud = DRTS_API_AUTH_AUDIENCE (the environment's IAP
    // client id), never drts-api's own Cloud Run origin. A template step
    // that resolves `drts-api`'s `status.url` as the audience would register
    // a value no live caller ever presents, so GoogleWorkloadIdentityAdapter
    // would reject every proxied request the moment the registry is mounted.
    expect(section10).not.toMatch(/describe drts-api[\s\S]{0,120}status\.url/);
    expect(section10).not.toMatch(/live API origin audience value/);
  });

  it("resolves the staging audience from STAGING_IAP_CLIENT_ID, falling back only to the literal already committed in deploy-staging.yml", () => {
    const section10 = readSection10();
    const workflow = readFileSync(stagingWorkflowPath, "utf8");

    expect(section10).toContain("vars.STAGING_IAP_CLIENT_ID");

    const fallbackMatch = workflow.match(
      /IAP_CLIENT_ID_ENV:\s*\$\{\{\s*vars\.STAGING_IAP_CLIENT_ID \|\| '([^']+)'\s*\}\}/,
    );
    expect(fallbackMatch).not.toBeNull();
    const literalFallback = fallbackMatch![1];

    // The doc's quoted literal fallback must match the one actually
    // committed in the workflow -- if deploy-staging.yml's default IAP
    // client id is ever rotated, this fails instead of the template
    // silently pointing ops at a stale audience.
    expect(section10).toContain(literalFallback);
  });

  it("resolves the production audience from PROD_IAP_CLIENT_ID and documents it has no literal fallback", () => {
    const section10 = readSection10();
    const workflow = readFileSync(prodWorkflowPath, "utf8");

    expect(section10).toContain("vars.PROD_IAP_CLIENT_ID");
    expect(section10).toMatch(/no literal fallback|no safe literal to fall back/);

    // Confirm the premise still holds: unlike staging, deploy-prod.yml must
    // not grow a "|| '<literal>'" fallback for IAP_CLIENT_ID_ENV, or the
    // doc's "no safe literal" claim and required-variable guard go stale
    // together.
    expect(workflow).toMatch(
      /IAP_CLIENT_ID_ENV:\s*\$\{\{\s*vars\.PROD_IAP_CLIENT_ID\s*\}\}/,
    );
  });

  it("documents one shared-identity registry entry per environment, not one entry per deployed caller", () => {
    const section10 = readSection10();

    expect(section10).toMatch(
      /one object \(not one per caller|single shared identity|one shared identity/,
    );
  });
});
