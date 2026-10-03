import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

test("authorized invitation and approval mail has complete live evidence", async () => {
  expect(
    process.env.GITHUB_ACTIONS,
    "Run this live profile only on the hosted worker",
  ).toBe("true");
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(
      "./apps/api/node_modules/.bin/tsx",
      [
        "--tsconfig",
        "tests/e2e/system-remediation/sr-live-mail-001/tsconfig.live.json",
        "tests/e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner.ts",
      ],
      { timeout: 850_000, stdio: "inherit" },
    );
    // Inherit Actions mask commands from the private IMAP subprocess.
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
  const evidence = JSON.parse(
    readFileSync(
      process.env.DRTS_LIVE_MAIL_EVIDENCE_PATH ||
        ".artifacts/live-mail-acceptance/evidence-mail.json",
      "utf8",
    ),
  ) as {
    status: string;
    candidateSha: string;
    unimplementedLiveSurfaces: unknown[];
  };
  expect(evidence.candidateSha).toBe(process.env.DRTS_CANDIDATE_SHA);
  expect(
    evidence.unimplementedLiveSurfaces,
    "Partial observations are not live acceptance",
  ).toEqual([]);
  expect(evidence.status).toBe("passed");
  expect(exitCode).toBe(0);
});
