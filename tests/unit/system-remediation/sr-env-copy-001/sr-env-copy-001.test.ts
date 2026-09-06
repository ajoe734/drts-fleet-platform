import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveRuntimeEnvironmentTier,
  RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS,
  RUNTIME_ENVIRONMENT_TIER_TONE,
} from "../../../../packages/ui-web/src/environment-badge/runtime-environment";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function readTranslations(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("SR-ENV-COPY-001: environment truth and user-copy cleanup", () => {
  describe("runtime environment resolution never guesses from a domain string or defaults unknown data to healthy/production", () => {
    it("requires an explicit deploy-time signal to report production", () => {
      expect(resolveRuntimeEnvironmentTier({})).not.toBe("production");
      expect(
        resolveRuntimeEnvironmentTier({ DRTS_ENV: "totally-unrecognized" }),
      ).not.toBe("production");
    });

    it("reports `unknown`, not a silently healthy tier, when no signal is present", () => {
      expect(resolveRuntimeEnvironmentTier({})).toBe("unknown");
      expect(RUNTIME_ENVIRONMENT_TIER_TONE.unknown).toBe("warning");
    });

    it("prefers DRTS_ENV / APP_ENV over NODE_ENV, since `next build` always bakes NODE_ENV=production", () => {
      expect(
        resolveRuntimeEnvironmentTier({
          APP_ENV: "staging",
          NODE_ENV: "production",
        }),
      ).toBe("staging");
    });

    it("has a localized label for every tier, including unknown", () => {
      expect(RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS.unknown.en).toBe(
        "Unknown Environment",
      );
      expect(RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS.unknown.zhTW).toBe(
        "環境未知",
      );
    });
  });

  describe("normal/error/empty-state copy no longer leaks raw internal identifiers (regression for R27 examples: ActionIntent, submissionId)", () => {
    it("ops-console-web assistant empty-state no longer names the internal `ActionIntent` type", () => {
      const content = readTranslations(
        "apps/ops-console-web/lib/translations.ts",
      );
      expect(content).not.toContain("`ActionIntent`");
    });

    it("platform-admin-web supply-review error/banner copy no longer shows raw backend error codes as the primary message", () => {
      const content = readTranslations(
        "apps/platform-admin-web/lib/translations.ts",
      );
      expect(content).not.toContain("Invalid submissionId");
      expect(content).not.toContain("無效的 submissionId");
      expect(content).not.toContain("SUBMISSION_REVISION_CONFLICT");
      expect(content).not.toContain("REVIEWER_SELF_APPROVAL_DENIED");
      expect(content).not.toContain("SUBMISSION_INCOMPLETE");
    });

    it("fleet-partner-portal-web supply form field labels no longer show the raw `submissionId` field name", () => {
      const content = readTranslations(
        "apps/fleet-partner-portal-web/lib/translations.ts",
      );
      expect(content).not.toContain("submissionId");
    });
  });
});
