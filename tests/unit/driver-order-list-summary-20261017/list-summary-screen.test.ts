import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Driver current and historical orders use their canonical list summaries", () => {
  it.each(["workspace", "jobs", "web-workspace", "web-jobs"])(
    "actual page and SDK preserve 56 orders without detail fanout: %s",
    (scenario) => {
      const result = execFileSync(
        process.execPath,
        [path.join(__dirname, "list-summary-probe.cjs"), scenario],
        { encoding: "utf8", timeout: 15000 },
      );
      expect(JSON.parse(result)).toMatchObject({
        actualPageAndSDK: true,
        tasks: 56,
        detailReads: 0,
      });
    },
    20000,
  );
});
