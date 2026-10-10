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
});
