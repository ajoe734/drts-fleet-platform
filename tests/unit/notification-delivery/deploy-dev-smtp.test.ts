import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Execute the actual workflow shell block, substituting only Secret Manager.
// No deployment or cloud access takes place in these unit tests.
const workflow = readFileSync(
  resolve(".github/workflows/deploy-dev.yml"),
  "utf8",
);
const block = workflow.slice(
  workflow.indexOf("          # Remote SMTP is opt-in"),
  workflow.indexOf("          # SR-LIVE-PUSH-001"),
);
const outboxBlock = workflow
  .slice(
    workflow.indexOf("          # Enable the durable SMTP outbox"),
    workflow.indexOf("          # End SMTP outbox selection"),
  )
  .replaceAll(
    "${{ steps.api_secrets.outputs.notification_outbox_type }}",
    "${notification_outbox_type}",
  );
const settings = [
  "HOST",
  "PORT",
  "USERNAME",
  "PASSWORD",
  "FROM_EMAIL",
  "RECIPIENT_ALLOWLIST",
];

describe("deploy-dev SMTP secret mounts", () => {
  it("mounts all six references together, preserves zero-secret behavior, and rejects every partial subset", () => {
    expect(block).toContain("smtp_secret_count");
    expect(outboxBlock).toContain("NOTIFICATION_OUTBOX_TYPE");
    const directory = mkdtempSync(join(tmpdir(), "smtp-workflow-"));
    try {
      for (let subset = 0; subset < 64; subset++) {
        const present = settings.filter((_, index) => subset & (1 << index));
        const result = spawnSync(
          "bash",
          [
            "-c",
            `
        set -euo pipefail
        project_id=unit-test-project
        secret_args=EXISTING=existing:latest
        gcloud() {
          [[ "$1 $2" == "secrets describe" ]] || { echo 'UNEXPECTED_SECRET_ACCESS'; return 99; }
          [[ " $PRESENT " == *" $3 "* ]]
        }
        ${block}
        echo "$secret_args"
        notification_outbox_type="$(sed -n 's/^notification_outbox_type=//p' "$GITHUB_OUTPUT")"
        env_vars=EXISTING_ENV=existing
        ${outboxBlock}
        echo "$env_vars"
      `,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              GITHUB_OUTPUT: join(directory, `outputs-${subset}`),
              PRESENT: present
                .map(
                  (setting) =>
                    `drts-dev-smtp-${setting.toLowerCase().replaceAll("_", "-")}`,
                )
                .join(" "),
            },
          },
        );
        expect(result.stdout + result.stderr).not.toContain(
          "UNEXPECTED_SECRET_ACCESS",
        );
        if (subset === 0) {
          expect(result.status).toBe(0);
          expect(result.stdout.trim()).toBe(
            "EXISTING=existing:latest\nEXISTING_ENV=existing",
          );
        } else if (subset === 63) {
          expect(result.status).toBe(0);
          for (const setting of settings)
            expect(result.stdout).toContain(
              `REMOTE_SMTP_${setting}=drts-dev-smtp-${setting.toLowerCase().replaceAll("_", "-")}:latest`,
            );
          expect(result.stdout).toContain(
            "NOTIFICATION_FROM_EMAIL=drts-dev-smtp-from-email:latest",
          );
          expect(result.stdout).toContain(
            "EXISTING_ENV=existing@NOTIFICATION_OUTBOX_TYPE=postgres",
          );
        } else {
          expect(result.status).toBe(1);
          expect(result.stdout).toContain(
            "Remote SMTP configuration is partial",
          );
          expect(result.stdout).not.toContain("REMOTE_SMTP_");
          expect(result.stdout).not.toContain("NOTIFICATION_OUTBOX_TYPE");
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
