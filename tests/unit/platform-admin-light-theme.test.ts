import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function collectTsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return collectTsxFiles(path);
    }

    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("Platform Admin product routes", () => {
  it("do not opt route bodies back into the legacy dark canvas theme", () => {
    const routeDir = join(process.cwd(), "apps/platform-admin-web/app");
    const offenders = collectTsxFiles(routeDir).filter((file) =>
      /buildCanvasTheme\s*\([^)]*dark\s*:\s*true/s.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(
      offenders.map((file) => file.replace(`${process.cwd()}/`, "")),
    ).toEqual([]);
  });

  it("manual dev deploys require an explicit immutable source ref", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/deploy-dev.yml"),
      "utf8",
    );

    expect(workflow).toContain("required: true");
    expect(workflow).toContain('GITHUB_EVENT_NAME:-}" == "workflow_dispatch');
    expect(workflow).toContain("source_ref is required for manual dev deploy");
    expect(workflow).toContain("Do not dispatch deploy-dev from main");
    expect(workflow).toContain("publish/v*");
    expect(workflow).toContain("release/v*");
    expect(workflow).toContain("full commit SHA");
    expect(workflow).toContain(
      "mutable branches such as dev/main/design are blocked",
    );
    expect(workflow).toContain("[0-9a-fA-F]{40}");
    expect(workflow).not.toContain(
      'source_ref="${INPUT_SOURCE_REF:-${GITHUB_SHA}}"',
    );
    expect(workflow).not.toContain(
      "use publish/v*, release/v*, dev, or an explicit commit SHA",
    );
    expect(workflow).not.toContain('source_ref="dev"');
  });
});
