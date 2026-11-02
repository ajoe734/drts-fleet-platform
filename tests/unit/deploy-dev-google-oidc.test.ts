import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/deploy-dev.yml", import.meta.url),
  "utf8",
);
// Execute the production workflow block itself. Only Secret Manager is mocked.
const block = workflow.slice(
  workflow.indexOf("          # Google tenant OIDC is all-or-nothing."),
  workflow.indexOf("          # Remote SMTP is opt-in and fail-closed."),
);

describe("deploy-dev Google OIDC all-or-nothing configuration", () => {
  it.each([
    { secret: "absent", client: "", exit: 0, enabled: false },
    { secret: "present", client: "", exit: 1, enabled: false },
    {
      secret: "absent",
      client: "123-test.apps.googleusercontent.com",
      exit: 1,
      enabled: false,
    },
    {
      secret: "present",
      client: "123-test.apps.googleusercontent.com",
      exit: 0,
      enabled: true,
    },
    { secret: "present", client: "unsafe@env=value", exit: 1, enabled: false },
  ])(
    "handles $secret secret and client '$client'",
    ({ secret, client, exit, enabled }) => {
      const dir = mkdtempSync(join(tmpdir(), "drts-oidc-config-"));
      try {
        const output = join(dir, "output");
        const script = `set -euo pipefail\ngcloud() { [[ "$MOCK_SECRET" == present ]]; }\nsecret_prefix=drts-dev\nproject_id=test-project\nsecret_args=BASE=reference\n${block}\nprintf '%s\\n' "$secret_args" >> "$GITHUB_OUTPUT"\n`;
        const result = spawnSync("bash", ["-c", script], {
          env: {
            ...process.env,
            MOCK_SECRET: secret,
            DEV_OIDC_CLIENT_ID: client,
            GITHUB_OUTPUT: output,
          },
          encoding: "utf8",
        });
        expect(result.status, result.stderr).toBe(exit);
        if (exit === 0) {
          const values = readFileSync(output, "utf8");
          expect(values).toContain(`oidc_enabled=${enabled}`);
          expect(
            values.includes(
              "OIDC_CLIENT_SECRET=drts-dev-oidc-client-secret:latest",
            ),
          ).toBe(enabled);
          expect(values.includes("BFF_STATE_SECRET=")).toBe(enabled);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it("mounts tenant_auth secrets on agency-portal-web and wires agency origin + invitation base in API env and post-deploy reconciliation", () => {
    const deployAgencyStart = workflow.indexOf(
      "      - name: Deploy — agency-portal-web\n",
    );
    const enforceAgencyStart = workflow.indexOf(
      "      - name: Enforce no public access — agency-portal-web\n",
    );
    const reconcileStart = workflow.indexOf(
      "      - name: Reconcile API agency portal origin and invitation base\n",
    );
    expect(deployAgencyStart).toBeGreaterThan(0);
    expect(enforceAgencyStart).toBeGreaterThan(deployAgencyStart);
    expect(reconcileStart).toBeGreaterThan(enforceAgencyStart);

    const deployAgencyBlock = workflow.slice(
      deployAgencyStart,
      enforceAgencyStart,
    );
    expect(deployAgencyBlock).toContain(
      '--set-secrets "${{ steps.api_secrets.outputs.tenant_auth }}"',
    );
    expect(deployAgencyBlock).toContain("--port 3012");
    expect(deployAgencyBlock).toContain(
      "DRTS_API_AUTH_AUDIENCE=${{ steps.api_url.outputs.url }}",
    );
    expect(deployAgencyBlock).toContain(
      "${{ needs.prepare.outputs.agency_portal_exposure_flag }}",
    );

    const reconcileBlock = workflow
      .slice(
        reconcileStart,
        workflow.indexOf("\n  paused-partner-booking-cleanup:", reconcileStart),
      )
      .split("        run: |\n")[1]!
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");

    const dir = mkdtempSync(join(tmpdir(), "drts-agency-reconcile-"));
    try {
      const output = join(dir, "output");
      const renderedReconcile = reconcileBlock
        .replaceAll(
          "${{ needs.prepare.outputs.agency_portal_service }}",
          "drts-dev-agency-portal-web",
        )
        .replaceAll("${{ needs.prepare.outputs.region }}", "us-central1")
        .replaceAll("${{ needs.prepare.outputs.project_id }}", "test-project")
        .replaceAll(
          "${{ needs.prepare.outputs.agency_portal_origin }}",
          "${MOCK_CONFIGURED_ORIGIN:-}",
        )
        .replaceAll("${{ needs.prepare.outputs.api_service }}", "drts-dev-api");

      const updateLog = join(dir, "updates");
      const runReconcile = (
        cloudRunUrl: string,
        configuredOrigin: string,
        currentAllowedOrigins: string,
        currentInviteBase: string,
      ) => {
        const script = `
set -euo pipefail
gcloud() {
  if [[ "$*" == *"services describe drts-dev-agency-portal-web"* ]]; then
    printf '%s' "$MOCK_AGENCY_URL"
    return 0
  fi
  if [[ "$*" == *"services describe drts-dev-api"* ]]; then
    printf '{"spec":{"template":{"spec":{"containers":[{"env":[{"name":"AUTH_ALLOWED_ORIGINS","value":"%s"},{"name":"AGENCY_INVITATION_ACCEPT_URL_BASE","value":"%s"}]}]}}}}' "$MOCK_CURRENT_ORIGINS" "$MOCK_CURRENT_INVITE"
    return 0
  fi
  if [[ "$*" == *"services update drts-dev-api"* ]]; then
    printf '%s\\n' "$*" >> "$UPDATE_LOG"
    return 0
  fi
  return 99
}
${renderedReconcile}
`;
        return spawnSync("bash", ["-c", script], {
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            UPDATE_LOG: updateLog,
            MOCK_AGENCY_URL: cloudRunUrl,
            MOCK_CONFIGURED_ORIGIN: configuredOrigin,
            MOCK_CURRENT_ORIGINS: currentAllowedOrigins,
            MOCK_CURRENT_INVITE: currentInviteBase,
          },
          encoding: "utf8",
        });
      };

      // First activation: API initially deployed before agency service existed
      const firstActivation = runReconcile(
        "https://drts-dev-agency-portal-web-xyz.a.run.app",
        "",
        "https://tenant.smarttransport.tw",
        "",
      );
      expect(firstActivation.status, firstActivation.stderr).toBe(0);
      const updates = readFileSync(updateLog, "utf8");
      expect(updates).toContain(
        "--update-env-vars ^@^AUTH_ALLOWED_ORIGINS=https://tenant.smarttransport.tw,https://drts-dev-agency-portal-web-xyz.a.run.app@AGENCY_INVITATION_ACCEPT_URL_BASE=https://drts-dev-agency-portal-web-xyz.a.run.app/invite",
      );

      // Fails closed on invalid resolved URL
      const invalidUrl = runReconcile(
        "http://insecure-agency.example.test",
        "",
        "https://tenant.smarttransport.tw",
        "",
      );
      expect(invalidUrl.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
